import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {RankedAuth,isRankedUserId} from './RankedAuth';
import {AdMobVerification} from './AdMobVerification';
import type {AdRewardStore} from './AdRewardStore';
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createAdRewardRouter(auth:RankedAuth,store:AdRewardStore,verifier=new AdMobVerification(),enabled=()=>process.env.ADMOB_REWARDS_ENABLED==='true'){
 const router=express.Router();
 const attempts=new Map<string,{count:number;until:number}>();
 const allow=(key:string,max:number)=>{
  const now=Date.now();for(const [id,v] of attempts)if(v.until<=now)attempts.delete(id);
  const v=attempts.get(key)??{count:0,until:now+60000};
  if(v.count>=max||attempts.size>=10000)return false;v.count++;attempts.set(key,v);return true;
 };
 router.use('/ads',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!enabled()){res.status(503).json({code:'ADS_DISABLED'});return;}next();});
 // Raw original query required for signature verification; never log its contents.
 router.get('/ads/admob/ssv',async(req,res)=>{
  if(!allow('ssv',300)){res.sendStatus(429);return;}
  try{
   const reward=await verifier.verifyQuery(req.originalUrl.split('?')[1]??'');
   if(!reward){res.sendStatus(400);return;}
   if(!await store.credit(reward)){res.sendStatus(400);return;}
   res.sendStatus(200);
  }catch{res.sendStatus(503);}
 });
 const authenticate:RequestHandler=async(req,res,next)=>{
  res.setHeader('Vary','Authorization');
  if(!allow(`ip:${req.socket.remoteAddress}`,180)){res.sendStatus(429);return;}
  const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1];
  let userId=auth.verifySession(token)?.userId;
  try{if(!userId&&token&&token.split('.').length===3)userId=await store.verifyUser(token)??undefined;}catch{}
  if(!userId||!isRankedUserId(userId)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
  if(!allow(`user:${userId}:${req.method}`,req.method==='POST'?12:90)){res.sendStatus(429);return;}
  if(Object.keys(req.query).length){res.sendStatus(400);return;}
  res.locals.adUser=userId;next();
 };
 const safe=(handler:RequestHandler):RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next);}catch{res.status(503).json({code:'ADS_UNAVAILABLE'});}};
 router.get('/ads/allowance',authenticate,safe(async(_req,res)=>{res.json({balance:await store.balance(res.locals.adUser)});}));
 router.get('/ads/reward/:id',authenticate,safe(async(req,res)=>{
  if(!uuid(req.params.id)){res.sendStatus(400);return;}
  const status=await store.status(res.locals.adUser,req.params.id);
  if(status==='missing'){res.sendStatus(404);return;}res.json({status});
 }));
 router.post('/ads/reward',authenticate,express.json({limit:'1kb',inflate:false}),safe(async(req,res)=>{
  if(!req.body||Object.keys(req.body).length!==1||!['hint','online'].includes(req.body.kind)){res.sendStatus(400);return;}
  res.json({intentId:await store.intent(res.locals.adUser,req.body.kind)});
 }));
 // No public credit/consume endpoint. Game operations must call consume server-side.
 const error:ErrorRequestHandler=(_error,_req,res,_next)=>{res.status(400).json({code:'INVALID_BODY'});};
 router.use(error);return router;
}
