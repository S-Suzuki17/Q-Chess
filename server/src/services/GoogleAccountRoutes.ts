import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {createHash,randomBytes} from 'node:crypto';
import {googleAccountsEnabled,GoogleAccountError,hashGooglePassword,type GoogleAccountStore,type GoogleActor} from './GoogleAccounts';
import {registrationIssues,registrationPasswordIssue} from './RegistrationValidation';
import {CURRENT_TICKET_TERMS_VERSION} from './AccountCurrentTerms';
import type {AccountWriteGate} from './AccountDeletion';
import type {createServiceOperations} from './ServiceOperations';

export function createGoogleAccountRouter(store:GoogleAccountStore,gate:AccountWriteGate,
    operations:Pick<ReturnType<typeof createServiceOperations>,'admission'>,enabled=googleAccountsEnabled,now=Date.now) {
    const router=express.Router(),budgets=new Map<string,{count:number;until:number}>(),
        confirmations=new Map<string,{authId:string;token:string;action:string;until:number}>();
    let hashing=0;
    const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
    const allow=(key:string,max:number,window=60000)=>{
        const stamp=now();for(const [key,item] of budgets)if(item.until<=stamp)budgets.delete(key);
        const item=budgets.get(key)??{count:0,until:stamp+window};
        if(item.count>=max||(!budgets.has(key)&&budgets.size>=10000))return false;
        item.count++;budgets.set(key,item);return true;
    };
    const fail=(res:express.Response,code:string,status=503)=>{res.status(status).json({code});};
    const authenticate:RequestHandler=async(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!enabled()){fail(res,'FEATURE_DISABLED');return;}
        if(Object.keys(req.query).length){fail(res,'INVALID_REQUEST',400);return;}
        const token=/^Bearer ([-\w]+\.[-\w]+\.[-\w]+)$/i.exec(req.headers.authorization??'')?.[1];
        if(!token||token.length>8192){fail(res,'GOOGLE_REQUIRED',401);return;}
        try{
            const actor=await store.verify(token);
            if(!actor){fail(res,'GOOGLE_REQUIRED',401);return;}
            if(!allow(actor.authId,90)){res.setHeader('Retry-After','60');fail(res,'TRY_LATER',429);return;}
            res.locals.googleActor=actor;res.locals.googleToken=digest(token);next();
        }catch{fail(res,'AUTH_UNAVAILABLE');}
    };
    const json:RequestHandler=(req,res,next)=>{if(!req.is('application/json')){fail(res,'JSON_REQUIRED',415);return;}next();};
    const body=express.json({limit:'4kb',inflate:false});
    const fields=(value:unknown,expected:string[])=>!!value&&typeof value==='object'&&!Array.isArray(value)
        &&Object.keys(value).sort().join(',')===expected.sort().join(',');
    const pathOf=(req:express.Request)=>req.originalUrl.split('?')[0].replace(/\/+$/,'').toLowerCase();
    router.use((req,res,next)=>{
        if(enabled()&&req.method==='POST'&&['/auth/register','/auth/ranked-session'].includes(pathOf(req))){
            fail(res,'GOOGLE_REQUIRED',409);return;
        }next();
    });
    router.get('/auth/google/account',authenticate,async(_req,res)=>{
        try{const actor=res.locals.googleActor as GoogleActor,account=await store.read(actor.authId);
            res.json({authId:actor.authId,account,termsVersion:CURRENT_TICKET_TERMS_VERSION});}
        catch{fail(res,'AUTH_UNAVAILABLE');}
    });
    router.post('/auth/google/setup',authenticate,json,body,async(req,res)=>{
        const value=req.body,link=typeof value?.legacyPassword==='string';
        if(!fields(value,['username','password','termsVersion','accepted',...(link?['legacyPassword']:[])])
            ||value.accepted!==true||value.termsVersion!==CURRENT_TICKET_TERMS_VERSION
            ||registrationIssues(value.username,value.password,undefined,false).length
            ||(link&&(!value.legacyPassword||Buffer.byteLength(value.legacyPassword)>1024))){
            fail(res,'INVALID_SETUP',400);return;
        }
        const actor=res.locals.googleActor as GoogleActor;
        if(!allow(`setup:${actor.authId}`,5,600000)||hashing>=2){fail(res,'TRY_LATER',429);return;}
        const client={protocol:Number(req.headers['x-qg-protocol']),platform:req.headers['x-qg-platform'],build:Number(req.headers['x-qg-build'])};
        hashing++;let release:(()=>void)|null=null;
        try{
            const unavailable=await operations.admission(client);
            if(unavailable){fail(res,unavailable);return;}
            release=gate.enter(actor.authId);if(!release){fail(res,'ACCOUNT_BUSY',409);return;}
            const hash=await hashGooglePassword(value.password);
            const current=await store.verify(/^Bearer (.+)$/i.exec(req.headers.authorization!)![1]);
            if(current?.authId!==actor.authId){fail(res,'GOOGLE_REQUIRED',401);return;}
            const finalUnavailable=await operations.admission(client);
            if(finalUnavailable){fail(res,finalUnavailable);return;}
            const account=await store.setup(actor,value.username,hash,value.termsVersion,value.legacyPassword);
            res.json({authId:actor.authId,account,termsVersion:CURRENT_TICKET_TERMS_VERSION});
        }catch(error){const code=error instanceof GoogleAccountError?error.code:'SETUP_UNAVAILABLE';
            fail(res,code,['NAME_UNAVAILABLE','LEGACY_AUTH_REQUIRED','ALREADY_HAS_ACCOUNT'].includes(code)?409:503);}
        finally{hashing--;release?.();}
    });
    router.post('/auth/google/confirm-password',authenticate,json,body,async(req,res)=>{
        if(!fields(req.body,['password','action'])||!['delete','revoke-all'].includes(req.body.action)){fail(res,'INVALID_REQUEST',400);return;}
        const actor=res.locals.googleActor as GoogleActor;
        if(!allow(`password:${actor.authId}`,5,600000)||hashing>=2){fail(res,'TRY_LATER',429);return;}
        hashing++;
        try{
            if(!await store.password(actor.authId,req.body.password)){fail(res,'PASSWORD_INCORRECT',403);return;}
            for(const [key,value] of confirmations)if(value.until<=now())confirmations.delete(key);
            if(confirmations.size>=10000){fail(res,'TRY_LATER',429);return;}
            const proof=randomBytes(32).toString('hex'),until=now()+120000;
            confirmations.set(digest(proof),{authId:actor.authId,token:res.locals.googleToken,action:req.body.action,until});
            res.json({authId:actor.authId,proof,expiresAt:until});
        }catch{fail(res,'AUTH_UNAVAILABLE');}finally{hashing--;}
    });
    router.post('/auth/google/password',authenticate,json,body,async(req,res)=>{
        const actor=res.locals.googleActor as GoogleActor;
        if(!fields(req.body,['password'])||registrationPasswordIssue(req.body.password)){fail(res,'INVALID_REQUEST',400);return;}
        if(now()<actor.authenticatedAt||now()-actor.authenticatedAt>300000){fail(res,'GOOGLE_REAUTH_REQUIRED',401);return;}
        if(!allow(`password-reset:${actor.authId}`,3,600000)||hashing>=2){fail(res,'TRY_LATER',429);return;}
        hashing++;
        try{
            const hash=await hashGooglePassword(req.body.password);
            const current=await store.verify(/^Bearer (.+)$/i.exec(req.headers.authorization!)![1]);
            if(current?.authId!==actor.authId||now()<current.authenticatedAt||now()-current.authenticatedAt>300000){
                fail(res,'GOOGLE_REAUTH_REQUIRED',401);return;
            }
            if(!await store.changePassword(actor.authId,hash)){fail(res,'SETUP_REQUIRED',409);return;}
            for(const [key,value] of confirmations)if(value.authId===actor.authId)confirmations.delete(key);
            res.json({authId:actor.authId,changed:true});
        }catch{fail(res,'AUTH_UNAVAILABLE');}finally{hashing--;}
    });
    // A deletion ticket covers completion retries. Only starting a deletion or
    // global logout requires a single-use proof of this action and Google token.
    router.use((req,res,next)=>{
        const path=pathOf(req);
        if(!enabled()||req.method!=='POST'||!['/account/deletion','/account/sessions/revoke-all'].includes(path)){next();return;}
        authenticate(req,res,()=>{
            const proof=req.headers['x-qg-confirmation'],key=typeof proof==='string'?digest(proof):'',
                confirmation=confirmations.get(key),actor=res.locals.googleActor as GoogleActor;
            const action=path==='/account/deletion'?'delete':'revoke-all';
            if(!confirmation||confirmation.until<=now()||confirmation.authId!==actor.authId
                ||confirmation.token!==res.locals.googleToken||confirmation.action!==action){fail(res,'PASSWORD_CONFIRMATION_REQUIRED',403);return;}
            confirmations.delete(key);next();
        });
    });
    const malformed:ErrorRequestHandler=(error,_req,res,next)=>{
        if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){
            fail(res,'INVALID_REQUEST',error.type==='entity.too.large'?413:400);return;
        }next(error);
    };
    router.use(malformed);return router;
}
