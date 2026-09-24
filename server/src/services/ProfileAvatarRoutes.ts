import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import { RankedAuth,isRankedUserId } from './RankedAuth';
import type { AccountWriteGate } from './AccountDeletion';
import { AVATAR_CONTENT_TYPES, AVATAR_MAX_BYTES, InvalidAvatarPhoto, knownCircuitIcon, normalizeAvatarPhoto, type ProfileAvatarStore } from './ProfileAvatars';

/** Mount before the global JSON parser. Body bytes are accepted only after auth. */
export function createProfileAvatarRouter(auth: RankedAuth, store: ProfileAvatarStore, gate?: AccountWriteGate) {
    const router=express.Router();
    const attempts=new Map<string,{count:number;until:number}>();
    let activePhotos=0;
    const allow=(key:string,max:number)=>{
        const now=Date.now();for(const [id,value]of attempts)if(value.until<=now)attempts.delete(id);
        const current=attempts.get(key)??{count:0,until:now+60000};
        if(attempts.size>=2000||current.count>=max)return false;
        current.count++;attempts.set(key,current);return true;
    };
    const authenticate:RequestHandler=async(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!allow(`ip:${req.socket.remoteAddress??'unknown'}`,60)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
        const header=req.headers.authorization;
        const token=typeof header==='string'?/^Bearer ([-\w.]{1,8192})$/i.exec(header)?.[1]:undefined;
        let userId=auth.verifySession(token)?.userId;
        try{if(!userId&&token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))userId=await store.verifyUser(token)??undefined;}catch{/* Fail closed. */}
        if(!userId||!isRankedUserId(userId)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
        if(!allow(`user:${userId}`,6)){res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;}
        if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_QUERY'});return;}
        res.locals.avatarUserId=userId;next();
    };
    router.post('/profile/avatar/icon',authenticate,(req,res,next)=>{
        if(!req.is('application/json')){res.status(415).json({code:'JSON_REQUIRED'});return;}next();
    },express.json({limit:'1kb',inflate:false}),async(req,res)=>{
        if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||!knownCircuitIcon(req.body.iconId)){res.status(400).json({code:'INVALID_ICON'});return;}
        const release=gate?.enter(res.locals.avatarUserId);
        if(gate&&!release){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
        try{const userId=res.locals.avatarUserId;const avatarUrl=await store.setIcon(userId,req.body.iconId);res.json({userId,avatarUrl});}
        catch{res.status(503).json({code:'AVATAR_UNAVAILABLE'});}
        finally{release?.();}
    });
    router.post('/profile/avatar/photo',authenticate,(req,res,next)=>{
        if(!AVATAR_CONTENT_TYPES.some(type=>req.is(type))){res.status(415).json({code:'IMAGE_REQUIRED'});return;}next();
    },express.raw({type:[...AVATAR_CONTENT_TYPES],limit:AVATAR_MAX_BYTES,inflate:false}),async(req,res)=>{
        if(activePhotos>=2){res.setHeader('Retry-After','5');res.status(429).json({code:'TRY_LATER'});return;}
        const release=gate?.enter(res.locals.avatarUserId);
        if(gate&&!release){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
        activePhotos++;
        try{
            const bytes=await normalizeAvatarPhoto(req.body,String(req.headers['content-type']).split(';')[0].trim().toLowerCase());
            if(req.aborted)return;
            const userId=res.locals.avatarUserId;const avatarUrl=await store.setPhoto(userId,bytes);res.json({userId,avatarUrl});
        }catch(error){res.status(error instanceof InvalidAvatarPhoto?400:503).json({code:error instanceof InvalidAvatarPhoto?'INVALID_IMAGE':'AVATAR_UNAVAILABLE'});}
        // Hold the operation lease even after the HTTP client disconnects.
        finally{activePhotos--;release?.();}
    });
    const bodyError:ErrorRequestHandler=(error,_req,res,next)=>{
        if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){
            res.status(error.type==='entity.too.large'?413:error.type==='encoding.unsupported'?415:400).json({code:'INVALID_BODY'});return;
        }next(error);
    };
    router.use(bodyError);return router;
}
