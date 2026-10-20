import express,{type RequestHandler,type ErrorRequestHandler} from 'express';
import {type RankedSessionAuthority,isRankedUserId} from './RankedAuth';
import {AccountWriteGate} from './AccountDeletion';
import {parseLearningSubmission} from '../learning/protocol';
import {verifyTutorialSolution} from '../learning/tutorialCourse';
import {isProblemMate,learningWeek} from '../learning/weeklyProblems';
import {LearningError,type LearningStore} from './LearningStore';
import {learningEnabled} from './LearningMaintenance';

export function createLearningRouter(auth:RankedSessionAuthority,store:LearningStore,gate:AccountWriteGate,
    enabled=learningEnabled,now=Date.now) {
    const router=express.Router(),attempts=new Map<string,{count:number;until:number}>();
    const authenticate:RequestHandler=async(req,res,next)=>{
        res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
        if(!enabled()){res.status(503).json({code:'FEATURE_DISABLED'});return;}
        if(Object.keys(req.query).length){res.status(400).json({code:'INVALID_REQUEST'});return;}
        const token=/^Bearer ([-\w.]{1,8192})$/i.exec(req.headers.authorization??'')?.[1];
        try{
            const proof=token?await auth.verifySession(token):null;
            const userId=proof?.userId??(token&&/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token)?await store.verifyUser(token):null);
            if(!userId||!isRankedUserId(userId)){res.status(401).json({code:'AUTH_REQUIRED'});return;}
            // Render's transport peer is a shared proxy. Only a verified account may
            // consume its own bucket; forged identities and forwarded headers cannot.
            const stamp=now();
            for(const [key,value]of attempts)if(value.until<=stamp)attempts.delete(key);
            const entry=attempts.get(userId)??{count:0,until:stamp+60000};
            if(entry.count>=120||(!attempts.has(userId)&&attempts.size>=10000)){
                res.setHeader('Retry-After','60');res.status(429).json({code:'TRY_LATER'});return;
            }
            entry.count++;attempts.set(userId,entry);
            if(gate.blocked(userId)||await store.blocked(userId)){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
            res.locals.userId=userId;res.locals.token=token;res.locals.legacy=!!proof;next();
        }catch{res.status(503).json({code:'LEARNING_UNAVAILABLE'});}
    };
    router.get('/learning',authenticate,async(_req,res)=>{
        try{
            const userId=res.locals.userId as string,week=learningWeek(now()).week;
            const [weeklySet,progress]=await Promise.all([store.week(week),store.progress(userId,week)]);
            res.json({userId,weeklySet,...progress});
        }catch{res.status(503).json({code:'LEARNING_UNAVAILABLE'});}
    });
    router.post('/learning/complete',authenticate,(req,res,next)=>{
        if(!req.is('application/json')){res.status(415).json({code:'JSON_REQUIRED'});return;}next();
    },express.json({limit:'4kb',inflate:false}),async(req,res)=>{
        const submission=parseLearningSubmission(req.body);
        if(!submission){res.status(400).json({code:'INVALID_REQUEST'});return;}
        const userId=res.locals.userId as string,release=gate.enter(userId);
        if(!release){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
        try{
            if(await store.blocked(userId)){res.status(423).json({code:'ACCOUNT_DELETING'});return;}
            const token=res.locals.token as string;
            if(res.locals.legacy?!(await auth.verifySession(token,userId)):await store.verifyUser(token)!==userId){
                res.status(401).json({code:'AUTH_REQUIRED'});return;
            }
            if(!await store.hasCurrentTerms(userId)){res.status(403).json({code:'CURRENT_TERMS_REQUIRED'});return;}
            if(submission.kind==='tutorial'){
                if(!verifyTutorialSolution(submission.lessonId,submission.moves))throw new LearningError('INVALID_SOLUTION');
            }else{
                const set=await store.week(submission.week),problem=set?.problems[submission.problemId-1];
                if(!problem)throw new LearningError('WEEK_EXPIRED');
                if(!isProblemMate(problem.state,submission.moves[0]))throw new LearningError('INVALID_SOLUTION');
            }
            // The authenticated owner and server-validated proof are the only path to the atomic credit RPC.
            res.json({...await store.complete(userId,submission),userId});
        }catch(error){
            const code=error instanceof LearningError?error.code:'LEARNING_UNAVAILABLE';
            res.status(code==='INVALID_SOLUTION'?400:code==='WEEK_EXPIRED'||code==='COMPLETE_PREVIOUS_PROBLEM'?409:503).json({code});
        }finally{release();}
    });
    const malformed:ErrorRequestHandler=(error,_req,res,next)=>{
        if(['entity.too.large','entity.parse.failed','encoding.unsupported'].includes(error?.type)){
            res.status(error.type==='entity.too.large'?413:400).json({code:'INVALID_REQUEST'});return;
        }next(error);
    };
    router.use(malformed);
    return router;
}
