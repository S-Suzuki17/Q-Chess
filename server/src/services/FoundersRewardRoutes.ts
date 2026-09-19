import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {RankedAuth,isRankedUserId} from './RankedAuth';
import {claimFounders,FoundersError,validPurchaseToken,type FoundersStore,type PlayRewardVerifier} from './FoundersRewards';

export function createFoundersRewardRouter(auth:RankedAuth,store:FoundersStore,play:PlayRewardVerifier|null,allowTest=false){
    const router=express.Router(),attempts=new Map<string,{count:number;until:number}>();let inFlight=0;
    const allow=(key:string,max:number)=>{const now=Date.now();for(const [id,value]of attempts)if(value.until<=now)attempts.delete(id);const row=attempts.get(key)??{count:0,until:now+60000};if(attempts.size>=4000||row.count>=max)return false;row.count++;attempts.set(key,row);return true;};
    const authenticate:RequestHandler=async(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!allow(`ip:${req.socket.remoteAddress??'unknown'}`,120)){res.status(429).json({code:'TRY_LATER'});return;}
        const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1];
        let userId=auth.verifySession(token)?.userId;
        try{if(!userId&&token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))userId=await store.verifyUser(token)??undefined;}catch{/* Fail closed. */}
        if(!userId||!isRankedUserId(userId)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
        if(!allow(`user:${userId}`,15)){res.status(429).json({code:'TRY_LATER'});return;}
        if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_QUERY'});return;}
        res.locals.rewardUserId=userId;next();
    };
    router.get('/rewards/founders',authenticate,async(_req,res)=>{
        try{const userId=res.locals.rewardUserId;res.json({userId,enabled:!!play,owned:await store.owned(userId)});}catch{res.status(503).json({code:'UNAVAILABLE'});}
    });
    router.post('/rewards/founders/claim',authenticate,(req,res,next)=>{if(!req.is('application/json')){res.status(415).json({code:'JSON_REQUIRED'});return;}next();},express.json({limit:'6kb',inflate:false}),async(req,res)=>{
        if(!play){res.status(503).json({code:'UNAVAILABLE'});return;}
        if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||!validPurchaseToken(req.body.purchaseToken)){res.status(400).json({code:'INVALID_BODY'});return;}
        if(inFlight>=8){res.status(429).json({code:'TRY_LATER'});return;}inFlight++;
        try{const userId=res.locals.rewardUserId,result=await claimFounders(userId,req.body.purchaseToken,store,play,allowTest);res.json({userId,enabled:true,...result});}
        catch(error){const code=error instanceof FoundersError?error.code:'UNAVAILABLE';res.status(code==='ALREADY_LINKED'?409:code==='NOT_ELIGIBLE'?422:503).json({code});}
        finally{inFlight--;}
    });
    const bodyError:ErrorRequestHandler=(error,_req,res,next)=>{if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_BODY'});return;}next(error);};
    router.use(bodyError);return router;
}
