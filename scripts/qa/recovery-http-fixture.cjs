// Loopback-only, in-memory UI fixture. NEVER connects to Supabase or sends email.
const express=require('../../server/node_modules/express');
const cors=require('../../server/node_modules/cors');
const {RankedAuth}=require('../../server/dist/services/RankedAuth');
const {AccountWriteGate}=require('../../server/dist/services/AccountDeletion');
const {createAccountRecoveryRouter}=require('../../server/dist/services/AccountRecoveryRoutes');
const binding={user_id:'RecoveryQA',email:'qa@example.test',auth_user_id:'00000000-0000-4000-8000-000000000001'};
let password='old-password-qa';
const store={ready:async()=>true,blocked:async()=>false,verifyPassword:async(id,value)=>id===binding.user_id&&value===password,
    binding:async id=>id===binding.user_id?binding:null,sendCode:async()=>{},verifyCode:async(email,code)=>email===binding.email&&code==='123456'?binding.auth_user_id:null,
    enroll:async()=>{},reset:async(_binding,value)=>{password=value;}};
const auth=new RankedAuth(store.verifyPassword),app=express();
app.use(cors({origin:['http://127.0.0.1:4191','http://localhost:4191']}));
app.use(createAccountRecoveryRouter(auth,store,new AccountWriteGate(),()=>false,()=>{},true));
app.use(express.json({limit:'3kb'}));
app.post('/auth/ranked-session',async(req,res)=>{const session=await auth.issueLegacySession(req.body.username,req.body.password);res.status(session?200:401).json(session??{code:'AUTH_FAILED'});});
app.listen(4192,'127.0.0.1',()=>console.log('Recovery UI fixture on loopback:4192; no external data or email.'));
