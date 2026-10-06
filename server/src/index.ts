import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { GameEngine, Action, ActionPayload } from './game/GameEngine';
import { ENTANGLEMENT_VERSION } from './game/quantumChess';
import { CPU_FALLBACK_MS, MatchmakingService } from './matchmaking/MatchmakingService';
import { SupabaseService } from './services/SupabaseService';
import { RankedAuth, type RankedSessionAuthority, type RankedSession, isRankedUserId } from './services/RankedAuth';
import { RankedRuntime } from './game/RankedRuntime';
import { createPrivateGameRecordRouter } from './services/PrivateGameRecordRoutes';
import { createProfileAvatarRouter } from './services/ProfileAvatarRoutes';
import { createAdRewardRouter } from './services/AdRewardRoutes';
import {createFoundersRewardRouter} from './services/FoundersRewardRoutes';
import {createPlayRewardVerifier} from './services/PlayRewardVerifier';
import type { MatchSession, QueueMode } from './matchmaking/MatchmakingService';
import { AccountWriteGate } from './services/AccountDeletion';
import { accountRequestGuard, createAccountDeletionRouter } from './services/AccountDeletionRoutes';
import { createAccountRecoveryRouter } from './services/AccountRecoveryRoutes';
import { createAccountProfileRouter } from './services/AccountProfileRoutes';
import { createAccountSecurityRouter } from './services/AccountSecurityRoutes';
import {createServiceOperations} from './services/ServiceOperations';
import {createAccountProgressRouter} from './services/AccountProgressRoutes';
import {createAccountTermsRouter} from './services/AccountTermsRoutes';
import {createCurrentTermsRouter} from './services/AccountCurrentTermsRoutes';
import {createSecurityAudit} from './services/SecurityAudit';
import {createEngagementMetricsRouter} from './services/EngagementMetricsRoutes';
import {createDailyLoginRouter} from './services/DailyLoginRoutes';
import { createRankedRefundRouter } from './services/RankedRefundRoutes';
import {QG_LIVE_MONTHLY_PRICE_ID, StripeMembershipApi, type StripeMembershipMode} from './services/StripeMembership';
import {createStripeMembershipRouter,createStripeWebhookRouter} from './services/StripeMembershipRoutes';
import {createStripeCancellationGuard} from './services/StripeCancellation';
import {StripePortalApi} from './services/StripePortal';
import {createStripeCheckoutReadiness} from './services/StripeMembershipReadiness';
import { cpuHintTicketsEnabled, rankedTicketAdmissionEnabled, rankedAdmissionRecoveryEnabled } from './services/TicketFeatureGates';
import { RankedAdmissionCoordinator } from './services/RankedAdmissionCoordinator';
import type { AdmissionOutcome } from './services/RankedAdmissionStore';
import { createCpuPracticeRouter } from './services/CpuPracticeRoutes';
import {stripeDeploymentModeAllowed} from './services/StripeDeploymentMode';

const app = express();
app.use(cors());
const supabaseService = new SupabaseService();
const audit=createSecurityAudit((event,outcome,id)=>supabaseService.recordSecurityEvent(event,outcome,id));
const rankedAuth: RankedSessionAuthority = new RankedAuth((id,password)=>supabaseService.verifyLegacyPassword(id,password));
const accountGate = new AccountWriteGate();
let cpuPractice:ReturnType<SupabaseService['cpuPracticeService']>|undefined;
const getCpuPractice=()=>cpuPractice??=supabaseService.cpuPracticeService();
const stripeMembershipStore = supabaseService.stripeMembershipStore();
// Billing reconciliation and cancellation must stay available after the first
// purchase, even when new checkouts are paused. Source readiness is verified;
// deploy only after the billing migrations. Environment gates still default OFF.
const STRIPE_BILLING_PROCESSING_READY = true;
const STRIPE_CHECKOUT_RELEASE_READY = true;
const STRIPE_BILLING_PORTAL_RELEASE_READY = true;
// This guard must be enabled before checkout is ever released and must stay
// enabled during a checkout rollback. Disabling purchases must never disable
// cancellation of already-existing subscriptions before account deletion.
const STRIPE_ACCOUNT_DELETION_GUARD_READY = true;
const stripeMode = process.env.STRIPE_MEMBERSHIP_MODE;
const stripeModeValid = stripeDeploymentModeAllowed(process.env.STRIPE_BILLING_ENVIRONMENT, stripeMode);
const stripeModeEnabled = stripeMode === 'live'
    ? process.env.STRIPE_MEMBERSHIP_LIVE_ENABLED === 'true'
    : stripeMode === 'test' && process.env.STRIPE_MEMBERSHIP_TEST_ENABLED === 'true';
const stripeSecretKey = stripeMode === 'live' ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_TEST_SECRET_KEY;
const stripeWebhookSecret = stripeMode === 'live' ? process.env.STRIPE_LIVE_WEBHOOK_SECRET : process.env.STRIPE_TEST_WEBHOOK_SECRET;
let stripeMembershipApi: StripeMembershipApi | null = null;
if (STRIPE_BILLING_PROCESSING_READY && stripeModeValid && stripeModeEnabled) {
    try {
        stripeMembershipApi = new StripeMembershipApi({
            mode: stripeMode as StripeMembershipMode,
            secretKey: stripeSecretKey ?? '',
            webhookSecret: stripeWebhookSecret ?? '',
            priceId: stripeMode === 'live' ? QG_LIVE_MONTHLY_PRICE_ID : process.env.STRIPE_TEST_PRICE_ID ?? '',
            successUrl: stripeMode === 'live' ? process.env.STRIPE_LIVE_SUCCESS_URL ?? '' : process.env.STRIPE_TEST_SUCCESS_URL ?? '',
            cancelUrl: stripeMode === 'live' ? process.env.STRIPE_LIVE_CANCEL_URL ?? '' : process.env.STRIPE_TEST_CANCEL_URL ?? '',
            automaticTaxEnabled: process.env.STRIPE_AUTOMATIC_TAX_ENABLED === 'true',
            taxRegistrationConfirmed: process.env.STRIPE_TAX_REGISTRATION_CONFIRMED === 'true',
        });
    } catch { /* Invalid Stripe configuration keeps every payment endpoint disabled. */ }
}
const stripeBillingProcessingEnabled = () => STRIPE_BILLING_PROCESSING_READY
    && STRIPE_ACCOUNT_DELETION_GUARD_READY
    && stripeModeValid && stripeModeEnabled && stripeMembershipApi !== null;
let stripePortalApi: StripePortalApi | null = null;
if (STRIPE_BILLING_PORTAL_RELEASE_READY && stripeBillingProcessingEnabled()) {
    try {
        stripePortalApi = new StripePortalApi({
            secretKey: stripeSecretKey ?? '', mode: stripeMode as StripeMembershipMode,
            returnUrl: 'https://q-gambit.com/',
        });
    } catch { /* Invalid billing configuration keeps the portal disabled. */ }
}
const stripePortalEnabled = () => STRIPE_BILLING_PORTAL_RELEASE_READY
    && stripeBillingProcessingEnabled() && process.env.STRIPE_MEMBERSHIP_PORTAL_ENABLED === 'true'
    && stripePortalApi !== null;
const stripeCheckoutReadiness = createStripeCheckoutReadiness({
    api: stripeMembershipApi, portal: stripePortalApi,
    processingEnabled: stripeBillingProcessingEnabled, portalEnabled: stripePortalEnabled,
});
const stripeCheckoutEnabled = () => STRIPE_CHECKOUT_RELEASE_READY && stripeCheckoutReadiness.enabled();
void stripeCheckoutReadiness.check().then(result => {
    console.info(`[stripe] checkout_preflight=${result}`);
});
const cancelStripeBeforeErase = STRIPE_ACCOUNT_DELETION_GUARD_READY
    ? createStripeCancellationGuard(supabaseService.stripeDeletionLinks(), {
        test: process.env.STRIPE_TEST_SECRET_KEY, live: process.env.STRIPE_LIVE_SECRET_KEY,
    }, fetch, supabaseService.stripeRetireSubscriptions())
    : async (_userId: string) => { /* Billing remains hard OFF; no Stripe records can originate here. */ };
app.use(createStripeWebhookRouter(stripeMembershipApi,stripeMembershipStore,
    stripeWebhookSecret ?? '',stripeBillingProcessingEnabled));
const operations=createServiceOperations(supabaseService.serviceStatusLoader());
app.use(operations.loginGuard);
app.get('/service/status',async(_req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{res.json({...await operations.read(),serverTime:Date.now()});}
    catch{res.status(503).json({code:'SERVICE_UNAVAILABLE'});}
});
const deletionStore = supabaseService.accountDeletionStore();
app.use(createAccountDeletionRouter(rankedAuth,deletionStore,accountGate,
    id=>matchmaking.accountBusy(id)||runtime.isSavingAccount(id),
    id=>{
        runtime.forgetReceipts(matchmaking.forgetAccount(id));
        for(const socket of io.sockets.sockets.values())if(socket.data.userId===id)socket.disconnect(true);
    },cancelStripeBeforeErase));
app.use(createAccountRecoveryRouter(rankedAuth,supabaseService.accountRecoveryStore(),accountGate,
    id=>matchmaking.accountBusy(id)||runtime.isSavingAccount(id),
    id=>{ for(const socket of io.sockets.sockets.values())if(socket.data.userId===id)socket.disconnect(true); },
    process.env.ACCOUNT_RECOVERY_ENABLED==='true'));
app.use(createAccountSecurityRouter(rankedAuth,supabaseService.accountSecurityStore(),accountGate,
    id=>{for(const socket of io.sockets.sockets.values())if(socket.data.userId===id){socket.emit('session_replaced');socket.disconnect(true);}},audit));
app.use(accountRequestGuard(rankedAuth,deletionStore,accountGate));
app.use(createCurrentTermsRouter(rankedAuth,supabaseService.currentTermsStore(),accountGate));
app.use(createAccountTermsRouter(rankedAuth,supabaseService.accountTermsStore(),accountGate));
app.use(createAccountProgressRouter(rankedAuth,supabaseService.accountProgressStore(),accountGate));
app.use(createDailyLoginRouter(rankedAuth,supabaseService.dailyLoginStore(),accountGate));
app.use(createCpuPracticeRouter(rankedAuth,getCpuPractice,token=>supabaseService.verifyUser(token),accountGate,
    id=>matchmaking.accountBusy(id)||matchmaking.getPlayerSession(id)?.state==='WAITING'));
app.use(createRankedRefundRouter(rankedAuth, {
    verifyUser: token => supabaseService.verifyUser(token),
    blocked: id => deletionStore.blocked(id),
    read: id => supabaseService.rankedRefundBalance(id),
}, accountGate));
app.use(createStripeMembershipRouter(rankedAuth,stripeMembershipApi,stripeMembershipStore,accountGate,
    stripeBillingProcessingEnabled,stripePortalApi,stripePortalEnabled,stripeCheckoutEnabled));
app.use(createAccountProfileRouter(rankedAuth,supabaseService.accountProfileStore(),accountGate));
app.use(createPrivateGameRecordRouter(rankedAuth,supabaseService));
app.use(createProfileAvatarRouter(rankedAuth,supabaseService.profileAvatarStore(),accountGate));
app.use(createAdRewardRouter(rankedAuth,supabaseService.adRewardStore()));
app.use(createEngagementMetricsRouter(supabaseService.engagementMetricsStore()));
app.use(createFoundersRewardRouter(rankedAuth,supabaseService.foundersStore(),createPlayRewardVerifier(),process.env.PLAY_REWARDS_ALLOW_TEST==='true'));
app.use(express.json({limit:'4kb'}));

// Phase 4: Health Check & Uptime ping target
app.get('/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', timestamp: Date.now(), rulesVersion: 'checkmate-v1', entanglementVersion: ENTANGLEMENT_VERSION });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
  }
});

const matchmaking = new MatchmakingService(io,rankedTicketAdmissionEnabled());
function sendMatchStart(match:MatchSession) {
    if(!match.engine||(match.admission&&!admission?.canAdvance(match)))return;
    for(const id of Object.values(match.players)) {
        const session=matchmaking.getPlayerSession(id),socket=session&&io.sockets.sockets.get(session.socketId);
        if(!socket)continue;
        socket.join(match.matchId);
        const state=match.engine.getPublicState(id);
        socket.emit('match_start',state);socket.emit('sync_state',state);
    }
    match.justStartedFlag=false;
}
function notifyAdmission(outcome:AdmissionOutcome) {
    for(const id of outcome.humanIds??[]) {
        const session=matchmaking.getPlayerSession(id),socket=session&&io.sockets.sockets.get(session.socketId);
        if(!socket)continue;
        if(outcome.state==='settled') {
            const change=[outcome.result?.white,outcome.result?.black].find(x=>x?.userId===id);
            if(change)socket.emit('rating_settled',{matchId:outcome.matchId,...change,timeControl:outcome.result?.timeControl});
        } else if(['voided','rejected'].includes(outcome.state)) {
            if(outcome.state==='rejected')socket.emit('queue_error',{code:outcome.reason,message:outcome.reason});
            socket.emit('match_cancelled',{matchId:outcome.matchId,reason:outcome.reason??'server_recovery'});
        }
    }
}
const admission=rankedAdmissionRecoveryEnabled()
    ? new RankedAdmissionCoordinator(matchmaking,supabaseService.rankedAdmissionStore(),sendMatchStart,notifyAdmission) : undefined;
const runtime = new RankedRuntime(io,matchmaking,match=>supabaseService.settleRankedMatch(match),undefined,match=>supabaseService.recordUnratedMatch(match),admission);
const loginAttempts=new Map<string,{count:number;until:number}>();
let pendingLegacyLogins=0;
app.post('/auth/ranked-session',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const now=Date.now();
    for(const [key,value] of loginAttempts)if(value.until<=now)loginAttempts.delete(key);
    // Do not trust arbitrary X-Forwarded-For headers. Shared proxies have a global ceiling as well.
    const ip=req.socket.remoteAddress??'unknown';
    const username=typeof req.body?.username==='string'?req.body.username:'';
    const key=`${ip}:${username.slice(0,256)}`;
    const count=loginAttempts.get(key)??{count:0,until:now+60000};
    const total=loginAttempts.get(ip)??{count:0,until:now+60000};
    if(loginAttempts.size>=10000||count.count>=5||total.count>=100){
        res.setHeader('Retry-After','60');return res.status(429).json({code:'TRY_LATER'});
    }
    count.count++;total.count++;loginAttempts.set(key,count);loginAttempts.set(ip,total);
    if(!isRankedUserId(username)||typeof req.body?.password!=='string'||!req.body.password.length
        ||Buffer.byteLength(req.body.password,'utf8')>1024)return res.status(401).json({code:'AUTH_FAILED'});
    // Bound expensive DB/password work across distinct IDs and connections.
    // Reject overload with retry guidance instead of an unbounded login queue.
    if(pendingLegacyLogins>=16){res.setHeader('Retry-After','2');return res.status(503).json({code:'TRY_LATER'});}
    pendingLegacyLogins++;
    let session: RankedSession | null = null;
    try {
        // The durable check survives a server restart; the in-memory gate alone
        // cannot remember a partially completed account deletion.
        // A logout/reset/deletion barrier may close while the durable lookup
        // awaits. Never start a password check from that stale preflight.
        if(accountGate.blocked(username)||await deletionStore.blocked(username)||accountGate.blocked(username))return res.status(409).json({code:'ACCOUNT_BUSY'});
        const keepLoggedIn = req.body?.keepLoggedIn === true;
        session=await rankedAuth.issueLegacySession(username,req.body.password,keepLoggedIn);
        if(accountGate.blocked(username)||await deletionStore.blocked(username)){
            await rankedAuth.revokeUserSessions(username);return res.status(409).json({code:'ACCOUNT_BUSY'});
        }
        if(!session){await audit('login','denied',username);return res.status(401).json({code:'AUTH_FAILED'});}
        await audit('login','success',username);
        return res.json(session);
    } catch {
        // An unavailable check must not revoke unrelated devices. Only the
        // unreturned proof from this attempt needs cleanup; confirmed deletion
        // above still revokes every proof, including in-flight password checks.
        if(session)try{await rankedAuth.revokeSession(session.token);}catch{/* Never report success after uncertain cleanup. */}
        // No upstream error, submitted password or token reaches logs/clients.
        await audit('upstream_error','error');
        res.setHeader('Retry-After','5');return res.status(503).json({code:'UNAVAILABLE'});
    } finally {pendingLegacyLogins--;}
});
app.post('/auth/ranked-session/revoke',async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    const token=req.headers.authorization?.replace(/^Bearer /,'');
    try {
        await rankedAuth.revokeSession(token);
        for(const socket of io.sockets.sockets.values())if(token&&socket.handshake.auth.token===token)socket.disconnect(true);
        res.status(204).end();
    } catch {
        res.setHeader('Retry-After','5');res.status(503).json({code:'UNAVAILABLE'});
    }
});

function announceMatch(match:MatchSession) {
    for(const id of Object.values(match.players)) {
        const session=matchmaking.getPlayerSession(id);
        if(session)io.sockets.sockets.get(session.socketId)?.join(match.matchId);
    }
    io.to(match.matchId).emit('match_found',{matchId:match.matchId,hostId:match.players.host,joinerId:match.players.joiner,
        timeControl:match.timeControl,mode:match.mode??'random',cpu:match.cpu?{side:match.cpu.side,rating:match.cpu.profile.rating,level:match.cpu.profile.level}:undefined});
}
setInterval(()=>{
    // Refresh is single-flight and cached. Existing matches continue even if DB status is unavailable.
    void operations.read().catch(()=>{});
    if(operations.acceptingNewMatches())for(const match of matchmaking.takeCpuFallbacks())announceMatch(match);
    runtime.tick();
},250).unref();
let checkingRestrictions=false;
setInterval(()=>{
    if(checkingRestrictions)return;checkingRestrictions=true;
    void(async()=>{
        const ids=[...new Set<string>([...io.sockets.sockets.values()].filter(s=>s.data.verified).map(s=>s.data.userId))];
        for(let offset=0;offset<ids.length;offset+=200){
            const blocked=new Set(await supabaseService.restrictedAccounts(ids.slice(offset,offset+200)));
            for(const socket of io.sockets.sockets.values())if(blocked.has(socket.data.userId)){
                await rankedAuth.revokeUserSessions(socket.data.userId);socket.emit('session_replaced');socket.disconnect(true);
            }
        }
    })().catch(()=>{/* A transient admin check failure must not forfeit existing games. */}).finally(()=>{checkingRestrictions=false;});
},15000).unref();

// Token Bucket Rate Limiting Constants
const MAX_TOKENS = 15; // Max burst allowance of events
const REFILL_RATE = 5; // Tokens added per second
const SEVERE_VIOLATION_THRESHOLD = 50; // Dropped packet threshold before forced disconnect

// Replay retention is handled transactionally in the database. Never delete
// old match rows here: lifetime statistics and settlement receipts need them.

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
      return next(new Error('Authentication Error: No token provided'));
  }

  if(typeof token!=='string'||token.length>8192)return next(new Error('Authentication Error'));
  try {
      const proof=await rankedAuth.verifySession(token);
      const guest=/^GUEST-[A-Za-z0-9_-]{1,120}$/.test(token);
      const userId=proof?.userId??(guest?token:await supabaseService.verifyUser(token));
      if (!userId) {
          return next(new Error('Authentication Error: Invalid token'));
      }
      if(accountGate.blocked(userId)||(!guest&&(await deletionStore.blocked(userId)||await supabaseService.accountSecurityStore().restricted(userId))))return next(new Error('Authentication Error: Account unavailable'));
      // Logout cannot disconnect a handshake which has not connected yet.
      // Recheck the legacy proof after the asynchronous account guards.
      if(proof&&!(await rankedAuth.verifySession(token,userId)))return next(new Error('Authentication Error: Invalid token'));

      socket.data.userId = userId;
      socket.data.verified=!guest;
  } catch { return next(new Error('Authentication Error: Account check unavailable')); }
  next();
});

io.on('connection', (socket: Socket) => {
  const userId = socket.data.userId;
  console.log('[socket] connected');

  // Initialize Rate Limiter State for this socket
  socket.data.rateLimit = {
    tokens: MAX_TOKENS,
    lastRefill: Date.now(),
    violations: 0
  };

  // Socket middleware for incoming event rate-limiting
  socket.use((packet, next) => {
    const eventName = packet[0];
    if(['join_queue','connect_match','intro_ready','emote','piece_selection','player_action','request_sync','request_cpu_hint','ping'].includes(eventName)
        &&(!packet[1]||typeof packet[1]!=='object'||Array.isArray(packet[1])))return;
    const now = Date.now();
    const rl = socket.data.rateLimit;

    // Refill tokens based on elapsed time
    const timePassed = (now - rl.lastRefill) / 1000;
    const tokensToAdd = timePassed * REFILL_RATE;
    if (tokensToAdd > 0) {
      rl.tokens = Math.min(MAX_TOKENS, rl.tokens + tokensToAdd);
      rl.lastRefill = now;
    }

    if (rl.tokens >= 1) {
      rl.tokens -= 1;
      rl.violations = Math.max(0, rl.violations - 1);
      next();
    } else {
      rl.violations += 1;
      console.warn('[RATE_LIMIT] Packet dropped');

      socket.emit('action_error', { message: 'Too many requests. Please slow down.' });

      if (rl.violations > SEVERE_VIOLATION_THRESHOLD) {
        console.error('[RATE_LIMIT] Socket disconnected');
        socket.disconnect(true);
      }
      return;
    }
  });

  const previousSocketId = matchmaking.getPlayerSession(userId)?.socketId;
  matchmaking.registerSocket(userId, socket.id);
  // Replace the session before disconnecting: an old socket must not forfeit the
  // new device's active match or cancel its queue.
  if(previousSocketId&&previousSocketId!==socket.id){
      const previous=io.sockets.sockets.get(previousSocketId);
      previous?.emit('session_replaced');previous?.disconnect(true);
  }
  matchmaking.clearDisconnectTimer(userId);
  socket.emit('queue_stats', matchmaking.getQueueStats());

  // If reconnected while in an active game, join the room immediately and push state
  const existingSession = matchmaking.getPlayerSession(userId);
  if (existingSession && existingSession.currentMatchId && existingSession.state === 'IN_GAME') {
      const activeMatch = matchmaking.getMatch(existingSession.currentMatchId);
      if (activeMatch && activeMatch.engine && activeMatch.state === 'IN_GAME'&&(!activeMatch.admission||admission?.canAdvance(activeMatch))) {
          socket.join(existingSession.currentMatchId);
          console.log('[RECONNECT] Active match restored');
          socket.emit('sync_state', activeMatch.engine.getPublicState(userId));
      }
  }

  let queueAttempt=0;
  socket.on('join_queue', async (data: { timeControl: number, userName?: string, mode?:QueueMode }) => {
    if(accountGate.blocked(userId))return;
    const attempt=++queueAttempt;
    const timeControl=data?.timeControl,mode=data?.mode??'random';
    const fail=(code:string)=>{if(attempt===queueAttempt&&socket.connected&&matchmaking.getPlayerSession(userId)?.socketId===socket.id)socket.emit('queue_error',{code,message:code});};
    if(cpuPractice?.isBusy(userId))return fail('CPU_PRACTICE_PENDING');
    if(![10,180,600].includes(timeControl)||!['random','ranked'].includes(mode))return fail('INVALID_QUEUE');
    const unavailable=await operations.admission(socket.handshake.auth.client);
    if(unavailable)return fail(unavailable);
    let rating:number|null=null;
    if(mode==='ranked') {
        const token=socket.handshake.auth.token;
        try {
            const identity=(await rankedAuth.verifySession(token))?.userId??(socket.data.verified?await supabaseService.verifyUser(token):null);
            if(identity!==userId)return fail('AUTH_REQUIRED');
        } catch { return fail('RANKED_UNAVAILABLE'); }
        if(admission) {
            try{if(await admission.accountBusy(userId))return fail('ACCOUNT_BUSY');}
            catch{return fail('RANKED_UNAVAILABLE');}
        }
        if(!await supabaseService.rankedReady())return fail('RANKED_UNAVAILABLE');
        rating=await supabaseService.getMatchRating(userId,timeControl);
        if(rating===null)return fail('RATING_UNAVAILABLE');
    }
    if(attempt!==queueAttempt||!socket.connected||matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    if(cpuPractice?.isBusy(userId))return fail('CPU_PRACTICE_PENDING');
    const name=typeof data?.userName==='string'?data.userName.slice(0,80):undefined;
    const result=matchmaking.joinQueue(userId,timeControl,name,mode,rating??undefined);
    if(!result.success)return fail('QUEUE_BUSY');
    socket.emit('queue_joined',{mode,timeControl,cpuFallbackAt:mode==='ranked'?Date.now()+CPU_FALLBACK_MS:null});
    if(result.match)announceMatch(result.match);
  });

  socket.on('cancel_queue', () => {
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    queueAttempt++;
    matchmaking.leaveQueue(userId);
  });

  socket.on('connect_match', async (data: { matchId: string, userName?: string, avatarUrl?: string, avatarFrame?:string,introVersion?:number }) => {
    if(accountGate.blocked(userId))return;
    if(cpuPractice?.isBusy(userId)){socket.emit('queue_error',{code:'CPU_PRACTICE_PENDING'});return;}
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    if(typeof data?.matchId!=='string'||!data.matchId||data.matchId.length>128)return;
    if(data.userName!==undefined&&typeof data.userName!=='string')return;
    const remembered=matchmaking.getMatch(data.matchId);
    const durableMatchId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.matchId);
    if(admission&&durableMatchId&&(!remembered||['FINISHED','CANCELLED','VOIDING'].includes(remembered.state))) {
        try {
            const recovered=await admission.reconnect(data.matchId,userId);
            if(recovered) {
                if(recovered.state==='active')socket.emit('match_preparing',{matchId:data.matchId,reason:'owner_recovery'});
                return;
            }
            // A crash before admission has no durable row or charge. Queue UUIDs
            // must still terminate explicitly, never become ad-hoc private rooms.
            if(!remembered) {socket.emit('match_cancelled',{matchId:data.matchId,reason:'match_not_found'});return;}
        }catch{socket.emit('match_preparing',{matchId:data.matchId,reason:'recovery_unavailable'});return;}
    }
    // Reconnection to a started game remains possible during maintenance.
    if(matchmaking.getMatch(data.matchId)?.state!=='IN_GAME'){
        const unavailable=await operations.admission(socket.handshake.auth.client);
        if(unavailable){socket.emit('queue_error',{code:unavailable,message:unavailable});return;}
        if(!socket.connected||matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    }
    if(data.userName)data.userName=data.userName.slice(0,80);
    if(cpuPractice?.isBusy(userId)){socket.emit('queue_error',{code:'CPU_PRACTICE_PENDING'});return;}
    const reserved=matchmaking.reserveMatch(userId,data.matchId,data.userName);
    if(!reserved)return;
    const role=reserved.players.host===userId?'host':'joiner';
    const openingRating=reserved.engine?.getPublicState(userId).playerRatings?.[role];
    const rating=openingRating!==undefined?openingRating:await supabaseService.getMatchRating(userId,reserved.timeControl);
    if(data.avatarFrame==='avatar-frame-founders'){
      try{if(!await supabaseService.foundersStore().owned(userId))data.avatarFrame='standard';}
      catch{data.avatarFrame='standard';}
    }
    if(!socket.connected||matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    const result = matchmaking.connectMatch(userId, data.matchId, data.userName, data.avatarUrl, data.avatarFrame,data.introVersion,rating);

    if(!result.success)return;
    socket.join(data.matchId);
    if(result.match?.state==='ADMITTING') {
        socket.emit('match_preparing',{matchId:data.matchId,reason:'admitting'});
        await admission?.begin(result.match);
        return;
    }

    if (result.success && result.engine) {
      if (result.justStarted) {
          const room = io.sockets.adapter.rooms.get(data.matchId);
          if (room) {
              for (const sid of room) {
                  const clientSocket = io.sockets.sockets.get(sid);
                  if (clientSocket) {
                      const uid = clientSocket.data.userId;
                      const pState = result.engine.getPublicState(uid);
                      clientSocket.emit('match_start', pState);
                      clientSocket.emit('sync_state', pState);
                  }
              }
          }
          if (result.match) result.match.justStartedFlag = false;
      } else {
          const publicState = result.engine.getPublicState(userId);
          socket.emit('match_start', publicState);
          socket.emit('sync_state', publicState);
      }
    }
  });

  socket.on('intro_ready',(data:{matchId:string})=>{
    if(typeof data?.matchId!=='string')return;
    const match=matchmaking.getMatch(data.matchId);
    if(match?.engine?.acknowledgeIntro(userId))io.to(data.matchId).emit('sync_state',match.engine.getPublicState(userId));
  });

  socket.on('emote', (data: { roomId?: string, matchId?: string, emote: string, player?: string }) => {
    if(!data)return;
    const targetRoom = data.roomId || data.matchId;
    if (!targetRoom || !socket.rooms.has(targetRoom)||!['hello','well_played','wow','thinking','resign'].includes(data.emote)) return;
    const match=matchmaking.getMatch(targetRoom);
    if(!match||![match.players.host,match.players.joiner].includes(userId))return;

    // Broadcast emote to other players in the room
    socket.to(targetRoom).emit('emote', {
      player: match.players.host===userId?'white':'black',
      emote: data.emote
    });
  });

  socket.on('piece_selection', (data: { matchId: string, pieceId: string | null }) => {
    if (!data?.matchId||!socket.rooms.has(data.matchId)) return;
    if(data.pieceId!==null&&(typeof data.pieceId!=='string'||data.pieceId.length>128))return;
    socket.to(data.matchId).emit('opponent_selection', { pieceId: data.pieceId });
  });

  socket.on('player_action', async (data: { actionId: string, version: number, playerId?: string, action: ActionPayload }) => {
      if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
      if(typeof data?.actionId!=='string'||data.actionId.length>128||!Number.isInteger(data.version)||!['MOVE','RESIGN'].includes(data.action?.type)||!data.action?.payload)return;
      if (data.playerId && data.playerId !== userId) {
          return socket.emit('action_error', { message: 'Unauthorized: playerId spoofing detected' });
      }

      let session = matchmaking.getPlayerSession(userId);
      let match = session?.currentMatchId ? matchmaking.getMatch(session.currentMatchId) : null;

      if (!match || !match.engine || match.state!=='IN_GAME') return socket.emit('action_error', { message: 'No active match found' });
      if(match.admission&&!admission?.canAdvance(match)) {
          void admission?.cancel(match,'owner_unavailable');
          return socket.emit('action_error',{message:'Ranked ownership unavailable'});
      }

      const action: Action = {
          actionId: data.actionId,
          version: data.version,
          playerId: userId,
          action: data.action
      };

    const result = match.engine.processAction(action);
    if (!result.success)socket.emit('action_error', { message: result.message });
    // A failed move can still have triggered timeout: terminal handling must run either way.
    runtime.afterAction(match);
  });

  socket.on('request_sync', async (data: { matchId: string }) => {
    if(typeof data?.matchId!=='string')return;
    if(matchmaking.getPlayerSession(userId)?.socketId!==socket.id)return;
    const match = matchmaking.getMatch(data.matchId);
    if(!match&&admission&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.matchId)) {
        try {
            const recovered=await admission.reconnect(data.matchId,userId);
            if(recovered) {
                if(recovered.state==='active')socket.emit('match_preparing',{matchId:data.matchId,reason:'owner_recovery'});
                return;
            }
            socket.emit('match_cancelled',{matchId:data.matchId,reason:'match_not_found'});return;
        }catch{socket.emit('match_preparing',{matchId:data.matchId,reason:'recovery_unavailable'});return;}
    }
    if (!match || (match.players.host !== userId && match.players.joiner !== userId)) {
        return socket.emit('error', { message: 'Unauthorized match sync request' });
    }

    let session = matchmaking.getPlayerSession(userId);
    if (session && match.state==='IN_GAME') {
        if(session.currentMatchId&&session.currentMatchId!==data.matchId)return;
        session.currentMatchId = data.matchId;
        session.state = 'IN_GAME';
    }

    matchmaking.clearDisconnectTimer(userId);
    if(match.state==='ADMITTING'||match.state==='VOIDING') {
        socket.emit('match_preparing',{matchId:data.matchId,reason:match.state.toLowerCase()});
        if(match.state==='ADMITTING')void admission?.begin(match);
        return;
    }
    if(match.admission?.state==='active'&&!admission?.canAdvance(match)) {
        void admission?.cancel(match,'owner_unavailable');
        socket.emit('match_preparing',{matchId:data.matchId,reason:'owner_unavailable'});return;
    }

    if (match.engine) {
      socket.join(data.matchId);
      socket.emit('sync_state', match.engine.getPublicState(userId));
      runtime.replaySettlement(match,userId,(event,payload)=>socket.emit(event,payload));
    }
  });

  // Legacy browser-history requests can never buy a hint, even after release.
  socket.on('request_cpu_hint', (data: { requestId?: string }) => {
      if(typeof data?.requestId !== 'string' || data.requestId.length > 128)return;
      socket.emit('cpu_hint_error', {requestId:data.requestId,
          error:cpuHintTicketsEnabled() ? 'USE_CPU_PRACTICE_API' : 'FEATURE_DISABLED'});
  });
  socket.on('ping', (data: { clientTime: number }) => {
      if(!Number.isFinite(data?.clientTime))return;
      socket.emit('pong', { clientTime: data.clientTime, serverTime: Date.now() });
  });

  socket.on('disconnect', () => {
    queueAttempt++;
    console.log('[socket] disconnected');
    matchmaking.removeSocket(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Q-GAMBIT Game Server listening on port ${PORT}`);
});
