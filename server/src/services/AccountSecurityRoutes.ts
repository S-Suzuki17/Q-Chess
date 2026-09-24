import express from 'express';
import { RankedAuth } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { validRegistration,type AccountSecurityStore } from './AccountSecurity';
import {noAudit,type AuditWriter} from './SecurityAudit';

export function createAccountSecurityRouter(auth:RankedAuth,store:AccountSecurityStore,gate:AccountWriteGate,disconnect:(id:string)=>void,audit:AuditWriter=noAudit) {
    const router=express.Router(), budgets=new Map<string,{count:number;until:number}>();
    let registering=0;
    const allow=(key:string,max:number,ms=60000)=>{
        const now=Date.now();for(const [k,v] of budgets)if(v.until<=now)budgets.delete(k);
        const value=budgets.get(key)??{count:0,until:now+ms};
        if(value.count>=max||(!budgets.has(key)&&budgets.size>=10000))return false;
        value.count++;budgets.set(key,value);return true;
    };
    router.use(['/auth/register','/account/sessions'],(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!allow(req.socket.remoteAddress??'unknown',30)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
        if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_REQUEST'});return;}
        next();
    });
    router.get('/account/sessions/capabilities',async(_req,res)=>{res.json({enabled:await store.ready()});});
    const json=express.json({limit:'2kb',inflate:false});
    router.post('/auth/register',json,async(req,res)=>{
        const {username,password}=req.body??{};
        if(!req.is('application/json')||!req.body||Object.keys(req.body).sort().join(',')!=='password,username'||!validRegistration(username,password)){
            res.status(400).json({code:'INVALID_REGISTRATION'});return;
        }
        const ip=req.socket.remoteAddress??'unknown';
        // Do not trust spoofable forwarding headers. A shared proxy gets a larger
        // network ceiling; five attempts applies per requested account, not the entire site.
        if(!allow(`register-name:${username.toLowerCase()}`,5,3600000)||!allow(`register-network:${ip}`,100,3600000)){res.setHeader('Retry-After','3600');res.status(429).json({code:'TRY_LATER'});return;}
        if(registering>=4){res.setHeader('Retry-After','5');res.status(503).json({code:'TRY_LATER'});return;}
        registering++;
        try{
            if(!await store.ready()){res.status(503).json({code:'UNAVAILABLE'});return;}
            if(!await store.register(username,password)){res.status(409).json({code:'REGISTRATION_UNAVAILABLE'});return;}
            await audit('registration','success',username);res.status(201).json({registered:true});
        }catch{res.status(503).json({code:'UNAVAILABLE'});}finally{registering--;}
    });
    router.post('/account/sessions/revoke-all',json,async(req,res)=>{
        if(!req.is('application/json')||!req.body||Array.isArray(req.body)||Object.keys(req.body).length){res.status(400).json({code:'INVALID_REQUEST'});return;}
        const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1];
        const proof=auth.verifySession(token);let id:string|undefined,locked=false;
        try{
            id=proof?.userId??(token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)?await store.verifyUser(token)??undefined:undefined);
            if(!id||!token||(proof&&!auth.verifySession(token))){res.status(401).json({code:'AUTH_REQUIRED'});return;}
            if(!allow(`logout:${id}`,3)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
            if(gate.blocked(id)){res.status(409).json({code:'ACCOUNT_BUSY'});return;}
            gate.reserve(id,false);locked=true;
            // Cancel password checks in flight both before and after the upstream await.
            auth.revokeUserSessions(id);
            if(!proof)await store.signOutAll(token);
            auth.revokeUserSessions(id);disconnect(id);
            await audit('logout_all','success',id);res.json({userId:id,revoked:true});
        }catch(error){res.status(error instanceof Error&&error.message==='ACCOUNT_BUSY'?409:503).json({code:error instanceof Error&&error.message==='ACCOUNT_BUSY'?'ACCOUNT_BUSY':'UNAVAILABLE'});}
        finally{if(id&&locked){auth.revokeUserSessions(id);gate.release(id);}}
    });
    // Deletion/recovery routes are mounted before this router, so a restricted
    // user still has an erasure/recovery route instead of being trapped.
    router.use('/account',async(req,res,next)=>{
        const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1];
        if(!token){next();return;}
        try{
            const id=auth.verifySession(token)?.userId??(/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)?await store.verifyUser(token):null);
            if(id&&await store.restricted(id)){res.status(403).json({code:'ACCOUNT_RESTRICTED'});return;}next();}
        catch{res.status(503).json({code:'UNAVAILABLE'});}
    });
    router.use(((error,req,res,next)=>{
        if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_REQUEST'});return;}next(error);
    }) as express.ErrorRequestHandler);
    return router;
}
