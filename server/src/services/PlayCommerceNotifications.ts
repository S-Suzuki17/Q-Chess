import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {OAuth2Client} from 'google-auth-library';
import {PLAY_COMMERCE_PACKAGE,PLAY_COMMERCE_PRODUCTS} from './PlayCommerceCatalog';
import {playObject,playToken,playOrderId,PlayCommerceError} from './PlayCommerceValues';
import type {PlayCommerceService} from './PlayCommerceService';
export type PlayNotificationIdentity=(token:string)=>Promise<boolean>;
export function createPlayNotificationIdentity():PlayNotificationIdentity|null{
 const audience=process.env.PLAY_RTDN_AUDIENCE,email=process.env.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL;
 if(!audience||!/^https:\/\/[^\s?#]+\/commerce\/play\/rtdn$/.test(audience)||!email||!email.endsWith('.iam.gserviceaccount.com'))return null;
 const google=new OAuth2Client();
 return async token=>{try{const ticket=await google.verifyIdToken({idToken:token,audience});const claims=ticket.getPayload();return !!claims&&claims.email_verified===true&&claims.email===email&&['accounts.google.com','https://accounts.google.com'].includes(claims.iss);}catch{return false;}};
}
export function createPlayNotificationRouter(service:PlayCommerceService,identity:PlayNotificationIdentity|null){
 const router=express.Router();let inFlight=0;
 const verify:RequestHandler=async(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(!identity||!service.configured()){res.status(503).end();return;}
  if(inFlight>=4){res.status(429).end();return;}
  const bearer=/^Bearer ([-\w]+\.[-\w]+\.[-\w]+)$/i.exec(req.headers.authorization??'')?.[1];
  if(!bearer||bearer.length>8192||!req.is('application/json')){res.status(401).end();return;}
  inFlight++;let released=false;const release=()=>{if(!released){released=true;inFlight--;}};res.on('finish',release);res.on('close',release);
  if(!await identity(bearer)){res.status(401).end();return;}next();
 };
 router.post('/commerce/play/rtdn',verify,express.json({limit:'32kb',inflate:false}),async(req,res)=>{
  try{
   const message=req.body?.message;if(!playObject(message)||typeof message.messageId!=='string'||message.messageId.length>256||typeof message.data!=='string'||message.data.length>24000||!/^[-+/=\w]+$/.test(message.data)){res.status(400).end();return;}
   const payload=JSON.parse(Buffer.from(message.data,'base64').toString('utf8'));
   if(!playObject(payload)||payload.packageName!==PLAY_COMMERCE_PACKAGE){res.status(400).end();return;}
   if(payload.testNotification){res.status(204).end();return;}
   const notices=['subscriptionNotification','oneTimeProductNotification','voidedPurchaseNotification'].filter(k=>playObject(payload[k]));
   if(notices.length!==1){res.status(400).end();return;}
   const kind=notices[0],notice=payload[kind] as Record<string,unknown>,token=playToken(notice.purchaseToken);
   const productId=kind==='subscriptionNotification'?notice.subscriptionId:notice.sku;
   const product=Object.values(PLAY_COMMERCE_PRODUCTS).find(p=>p.productId===productId);
   if(kind!=='voidedPurchaseNotification'&&!product){res.status(204).end();return;}
   // OIDC validates the push sender; the notification itself is never payment proof.
   await service.notification(product?.sku??null,token,kind==='voidedPurchaseNotification'?playOrderId(notice.orderId):undefined);
   res.status(204).end();
  }catch(error){res.status(error instanceof PlayCommerceError&&error.code==='RETIRED'?204:503).end();}
 });
 const invalidBody:ErrorRequestHandler=(error,_req,res,next)=>{if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){res.status(400).end();return;}next(error);};router.use(invalidBody);return router;
}
