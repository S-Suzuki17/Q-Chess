import express from 'express';
import {RankedAuth,isRankedUserId} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {CURRENT_TERMS_VERSION,type createAccountTermsStore} from './AccountTerms';
export function createAccountTermsRouter(auth:RankedAuth,store:ReturnType<typeof createAccountTermsStore>,gate:AccountWriteGate){
    const router=express.Router(),counts=new Map<string,{n:number;until:number}>();
    const allow=(key:string,max:number)=>{const now=Date.now();for(const[k,v]of counts)if(v.until<=now)counts.delete(k);const v=counts.get(key)??{n:0,until:now+60000};if(v.n>=max||(!counts.has(key)&&counts.size>=10000))return false;v.n++;counts.set(key,v);return true;};
    router.use('/account/terms',async(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!allow(req.socket.remoteAddress??'unknown',120)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
        const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1],proof=auth.verifySession(token);
        try{
            const id=proof?.userId??(token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)?await store.verifyUser(token):null);
            if(!id||!isRankedUserId(id)||(proof&&!auth.verifySession(token))){res.status(401).json({code:'AUTH_REQUIRED'});return;}
            if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_REQUEST'});return;}
            if(!allow(`user:${id}`,20)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
            if(gate.blocked(id)||await store.blocked(id)){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
            res.locals.owner=id;res.locals.proof=proof?token:null;next();
        }catch{res.status(503).json({code:'UNAVAILABLE'});}
    });
    const status=async(id:string)=>({userId:id,currentVersion:CURRENT_TERMS_VERSION,consent:await store.read(id)});
    router.get('/account/terms',async(_req,res)=>{try{res.json(await status(res.locals.owner));}catch{res.status(503).json({code:'UNAVAILABLE'});}});
    router.post('/account/terms',express.json({limit:'1kb',inflate:false}),async(req,res)=>{
        if(!req.is('application/json')||!req.body||Object.keys(req.body).sort().join(',')!=='accepted,version'||req.body.accepted!==true||req.body.version!==CURRENT_TERMS_VERSION){res.status(400).json({code:'INVALID_REQUEST'});return;}
        const id=res.locals.owner,release=gate.enter(id);
        if(!release){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
        try{
            if(await store.blocked(id)){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
            if(res.locals.proof&&!auth.verifySession(res.locals.proof)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
            await store.accept(id,!res.locals.proof);const value=await status(id);
            if(!value.consent)throw new Error('UNAVAILABLE');res.json(value);
        }catch{res.status(503).json({code:'UNAVAILABLE'});}finally{release();}
    });
    router.use(((error,_req,res,next)=>{if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_REQUEST'});return;}next(error);}) as express.ErrorRequestHandler);
    return router;
}
