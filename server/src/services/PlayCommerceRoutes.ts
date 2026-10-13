import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {isRankedUserId,type RankedSessionAuthority} from './RankedAuth';
import {isCommerceSku} from './CommerceCatalog';
import {PlayCommerceError,playObject,playToken} from './PlayCommerceValues';
import type {PlayCommerceStore} from './PlayCommerceStore';
import type {PlayCommerceService} from './PlayCommerceService';
import type {AccountWriteGate} from './AccountDeletion';

export function createPlayCommerceRouter(auth:RankedSessionAuthority,store:PlayCommerceStore,service:PlayCommerceService,gate:AccountWriteGate,salesEnabled:()=>boolean){
 const router=express.Router(),requests=new Map<string,{count:number;expires:number}>();let inFlight=0;
 const allow=(key:string,limit:number)=>{const now=Date.now();for(const [id,row]of requests)if(row.expires<=now)requests.delete(id);const row=requests.get(key)??{count:0,expires:now+60000};if(row.count>=limit||requests.size>=4000)return false;row.count++;requests.set(key,row);return true;};
 const authenticate:RequestHandler=async(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
  if(!allow('ip:'+req.socket.remoteAddress,90)){res.status(429).json({code:'TRY_LATER'});return;}
  const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1];let userId:string|undefined;
  try{userId=(await auth.verifySession(token))?.userId;if(!userId&&token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))userId=await store.verifyUser(token)??undefined;}
  catch{res.status(503).json({code:'UNAVAILABLE'});return;}
  if(!isRankedUserId(userId)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
  if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_BODY'});return;}
  if(!allow('user:'+userId,30)){res.status(429).json({code:'TRY_LATER'});return;}
  res.locals.playUserId=userId;next();
 };
 const json:RequestHandler[]=[(req,res,next)=>{if(!req.is('application/json')){res.status(415).json({code:'JSON_REQUIRED'});return;}next();},express.json({limit:'8kb',inflate:false})];
 const failure=(res:express.Response,error:unknown)=>{const code=error instanceof PlayCommerceError?error.code:'UNAVAILABLE';res.status(code==='INVALID_PURCHASE'?400:['ACCOUNT_MISMATCH','MODE_MISMATCH','RETIRED','TERMS_REQUIRED'].includes(code)?409:503).json({code});};
 router.get('/commerce/play/status',authenticate,async(_req,res)=>{
  try{const userId=res.locals.playUserId;if(!await store.ready()){res.json({userId,enabled:false,ready:false});return;}const status=await store.status(userId);res.json({...status,enabled:status.enabled&&salesEnabled()&&service.configured(),ready:service.configured()});}catch(e){failure(res,e);}
 });
 router.post('/commerce/play/intent',authenticate,...json,async(req,res)=>{
  if(!playObject(req.body)||Object.keys(req.body).length!==1||!isCommerceSku(req.body.sku)){res.status(400).json({code:'INVALID_BODY'});return;}
  const userId=res.locals.playUserId,leave=gate.enter(userId);if(!leave){res.status(409).json({code:'RETIRED'});return;}
  try{if(!salesEnabled()||!service.configured())throw new PlayCommerceError('FEATURE_DISABLED');res.json(await store.intent(userId,req.body.sku));}catch(e){failure(res,e);}finally{leave();}
 });
 router.post('/commerce/play/receipt',authenticate,...json,async(req,res)=>{
  if(!playObject(req.body)||Object.keys(req.body).length!==2||!isCommerceSku(req.body.sku)){res.status(400).json({code:'INVALID_BODY'});return;}
  let token:string;try{token=playToken(req.body.purchaseToken);}catch{res.status(400).json({code:'INVALID_BODY'});return;}
  const userId=res.locals.playUserId,leave=gate.enter(userId);if(!leave){res.status(409).json({code:'RETIRED'});return;}
  if(inFlight>=6){leave();res.status(429).json({code:'TRY_LATER'});return;}inFlight++;
  try{res.json(await service.receipt(req.body.sku,token,userId));}catch(e){failure(res,e);}finally{inFlight--;leave();}
 });
 router.post('/commerce/play/intent/cancel',authenticate,...json,async(req,res)=>{
  if(!playObject(req.body)||Object.keys(req.body).length!==1||typeof req.body.intentId!=='string'||!/^[a-f0-9]{64}$/.test(req.body.intentId)){res.status(400).json({code:'INVALID_BODY'});return;}
  const userId=res.locals.playUserId,leave=gate.enter(userId);if(!leave){res.status(409).json({code:'RETIRED'});return;}
  try{await store.cancelIntent(userId,req.body.intentId);res.json({userId,canceled:true});}catch(e){failure(res,e);}finally{leave();}
 });
 const bodyError:ErrorRequestHandler=(error,_req,res,next)=>{if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_BODY'});return;}next(error);};
 router.use(bodyError);return router;
}
