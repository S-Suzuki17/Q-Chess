import express from 'express';
import {RankedAuth,isRankedUserId} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {parseSavedProgress,type createAccountProgressStore} from './AccountProgress';
export function createAccountProgressRouter(auth:RankedAuth,store:ReturnType<typeof createAccountProgressStore>,gate:AccountWriteGate){
    const router=express.Router(),counts=new Map<string,{n:number;until:number}>();
    const allow=(key:string,max:number)=>{const now=Date.now();for(const [k,v]of counts)if(v.until<=now)counts.delete(k);const v=counts.get(key)??{n:0,until:now+60000};if(v.n>=max||(!counts.has(key)&&counts.size>=10000))return false;v.n++;counts.set(key,v);return true;};
    router.use('/account/progress',async(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!allow(req.socket.remoteAddress??'unknown',180)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
        const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1],proof=auth.verifySession(token);
        try{
            const id=proof?.userId??(token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)?await store.verifyUser(token):null);
            if(!id||!isRankedUserId(id)||(proof&&!auth.verifySession(token))){res.status(401).json({code:'AUTH_REQUIRED'});return;}
            if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_REQUEST'});return;}
            if(!allow(`user:${id}`,30)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
            if(gate.blocked(id)||await store.blocked(id)){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
            res.locals.owner=id;res.locals.proof=proof?token:null;next();
        }catch{res.status(503).json({code:'UNAVAILABLE'});}
    });
    router.get('/account/progress',async(_req,res)=>{try{res.json({userId:res.locals.owner,...await store.read(res.locals.owner)});}catch{res.status(503).json({code:'UNAVAILABLE'});}});
    router.post('/account/progress',express.json({limit:'16kb',inflate:false}),async(req,res)=>{
        const {revision,progress}=req.body??{},parsed=parseSavedProgress(progress);
        if(!req.is('application/json')||!req.body||Object.keys(req.body).sort().join(',')!=='progress,revision'||!Number.isSafeInteger(revision)||revision<0||!parsed){res.status(400).json({code:'INVALID_REQUEST'});return;}
        const id=res.locals.owner,release=gate.enter(id);
        if(!release){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
        try{
            if(await store.blocked(id)){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
            if(res.locals.proof&&!auth.verifySession(res.locals.proof)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
            const saved=await store.save(id,revision,parsed);
            // Conflicts return only this authenticated owner's newest snapshot.
            res.json({userId:id,saved,...await store.read(id)});
        }catch{res.status(503).json({code:'UNAVAILABLE'});}finally{release();}
    });
    router.use(((error,_req,res,next)=>{if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_REQUEST'});return;}next(error);}) as express.ErrorRequestHandler);
    return router;
}
