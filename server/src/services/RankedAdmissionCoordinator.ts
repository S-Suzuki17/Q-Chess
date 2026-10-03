import { randomUUID } from 'node:crypto';
import type { MatchSession, MatchmakingService } from '../matchmaking/MatchmakingService';
import type { RankedAdmissionStore, AdmissionOutcome } from './RankedAdmissionStore';

// DB TTL=20s; renewal starts every 3s; RPC timeout=5s. Local authority lasts at
// most 10s FROM REQUEST START (not acknowledgement), leaving >=10s to recovery.
// Both monotonic and wall deadlines apply. An expired/lost epoch is never revived.
export const RANKED_LOCAL_LEASE_MS = 10_000;
export const RANKED_RENEW_MS = 3_000;
export class RankedAdmissionCoordinator {
    public readonly ownerId: string;
    private monoDeadline = 0;
    private wallDeadline = 0;
    private issued = false;
    private retired = false;
    private renewing?: Promise<boolean>;
    private renewAt = 0;
    private recovering = false;
    private recoveryAt = 0;
    private requests = new Map<string, Promise<void>>();
    private retryAt = new Map<string, number>();
    constructor(private matchmaking: MatchmakingService, private store: RankedAdmissionStore,
        private onStarted: (match: MatchSession) => void,
        private notify: (outcome: AdmissionOutcome) => void,
        private clock = { mono: () => performance.now(), wall: () => Date.now() },
        ownerId = randomUUID()) {
        this.ownerId = ownerId;
        matchmaking.onAdmissionCancel = (match, reason) => { void this.cancel(match, reason); };
    }
    private alive() {
        return !this.retired && this.issued && this.clock.mono() < this.monoDeadline && this.clock.wall() < this.wallDeadline;
    }
    public canAdvance(match: MatchSession) {
        return !match.admission || (match.admission.state === 'active' && match.admission.ownerId === this.ownerId && this.alive());
    }
    public safeUntil() { return this.wallDeadline; }
    private retire() {
        this.retired = true;
        for (const match of this.matchmaking.getMatches()) {
            if (match.admission?.ownerId === this.ownerId && ['active','pending'].includes(match.admission.state))
                void this.cancel(match, 'owner_unavailable');
        }
    }
    public async renew(): Promise<boolean> {
        if (this.retired) return false;
        if (this.issued && !this.alive()) { this.retire(); return false; }
        if (this.renewing) return this.renewing;
        const mono = this.clock.mono(), wall = this.clock.wall();
        this.renewAt = mono + RANKED_RENEW_MS;
        const request = (async () => {
            try {
                const ok = await this.store.renew(this.ownerId);
                if (!ok || this.retired || this.clock.mono() >= mono + RANKED_LOCAL_LEASE_MS
                    || this.clock.wall() >= wall + RANKED_LOCAL_LEASE_MS) { this.retire(); return false; }
                // A slow renewal can never bridge a gap in the preceding lease.
                if (this.issued && !this.alive()) { this.retire(); return false; }
                this.issued = true;
                this.monoDeadline = mono + RANKED_LOCAL_LEASE_MS;
                this.wallDeadline = wall + RANKED_LOCAL_LEASE_MS;
                return true;
            } catch { this.retire(); return false; }
        })();
        this.renewing = request;
        try { return await request; } finally { this.renewing = undefined; }
    }
    public begin(match: MatchSession): Promise<void> {
        if (match.state !== 'ADMITTING') return Promise.resolve();
        match.admission ??= { state: 'pending', ownerId: this.ownerId };
        if(match.admission.state==='active') {
            if(!this.alive())return this.cancel(match,'owner_unavailable');
            if(this.matchmaking.activateMatch(match,{
                canAdvance:()=>this.canAdvance(match),safeUntil:()=>this.safeUntil(),
            }))this.onStarted(match);
            return Promise.resolve();
        }
        return this.request(match, async () => {
            if (!this.alive() && !await this.renew()) { await this.voidMatch(match, 'owner_unavailable'); return; }
            let result: AdmissionOutcome;
            try {
                result = await this.store.admit(match, this.ownerId);
            } catch (error) {
                // A definitive SQL rejection cannot become eligible by replaying
                // this UUID. Persist a tombstone before releasing either player.
                // Transport failures and transient DB errors still retry admission.
                const code = (error as {code?: unknown} | null)?.code;
                if (!['42501','22023','23505'].includes(typeof code === 'string' ? code : '')) throw error;
                await this.voidMatch(match, match.admission?.reason ?? 'admission_unavailable');
                return;
            }
            if (result.state === 'active' && match.state === 'ADMITTING' && this.alive()) {
                match.admission!.state = 'active';
                if (this.matchmaking.activateMatch(match, {
                    canAdvance: () => this.canAdvance(match),
                    safeUntil: () => this.safeUntil(),
                })) this.onStarted(match);
            } else if (result.state === 'active' || match.state === 'VOIDING') {
                await this.voidMatch(match, match.admission?.reason ?? 'owner_unavailable');
            } else this.finish(match, result);
        });
    }
    private request(match: MatchSession, run: () => Promise<void>): Promise<void> {
        const existing = this.requests.get(match.matchId);
        if (existing) return existing;
        if (this.clock.mono() < (this.retryAt.get(match.matchId) ?? 0)) return Promise.resolve();
        // Set the coalescing promise before the async work can re-enter.
        const request = Promise.resolve().then(run).catch(() => {
            this.retryAt.set(match.matchId, this.clock.mono() + 1000);
        }).finally(() => this.requests.delete(match.matchId));
        this.requests.set(match.matchId, request);
        return request;
    }
    public cancel(match: MatchSession, reason: string): Promise<void> {
        if (!match.admission) {
            this.matchmaking.finishMatch(match, 'CANCELLED');
            this.notify({ state: 'voided', matchId: match.matchId, humanIds: Object.values(match.players), reason });
            return Promise.resolve();
        }
        if (['settled','voided','rejected'].includes(match.admission.state)) return Promise.resolve();
        match.state = 'VOIDING';
        match.admission.state = 'voiding';
        match.admission.reason = reason;
        match.engine?.freeze();
        // An admission request in flight will finish through voidMatch too.
        return this.request(match, () => this.voidMatch(match, reason));
    }
    private async voidMatch(match: MatchSession, reason: string) {
        match.state = 'VOIDING';
        match.admission!.state = 'voiding';
        match.admission!.reason = reason;
        match.engine?.freeze();
        const result = await this.store.void(match.matchId, this.ownerId, reason);
        if (result.state === 'active' || result.state === 'missing') throw new Error('VOID_UNCONFIRMED');
        this.finish(match, result);
    }
    private finish(match: MatchSession, outcome: AdmissionOutcome) {
        match.admission!.state = outcome.state === 'missing' ? 'voided' : outcome.state;
        this.retryAt.delete(match.matchId);
        this.matchmaking.finishMatch(match, outcome.state === 'settled' ? 'FINISHED' : 'CANCELLED');
        match.settlement = outcome.state === 'settled' ? 'saved' : undefined;
        this.notify({ ...outcome, matchId: match.matchId, humanIds: Object.values(match.players),
            timeControl: match.timeControl, reason: outcome.reason ?? match.admission?.reason });
    }
    public async reconnect(matchId: string, userId: string): Promise<AdmissionOutcome | null> {
        const local = this.matchmaking.getMatch(matchId);
        if (local?.state === 'ADMITTING') {
            await this.begin(local);
            return { state: local.admission?.state === 'active' ? 'active' : 'missing', matchId };
        }
        const outcome = await this.store.read(matchId, userId);
        if (outcome && outcome.state !== 'active') this.notify(outcome);
        return outcome;
    }
    public async accountBusy(userId: string) {
        // Recovery checks ownership atomically; it never fences a live peer.
        await this.recover();
        return this.store.busy(userId);
    }
    private async recover() {
        if (this.recovering) return;
        this.recovering = true;
        try { for (const outcome of await this.store.recover()) this.notify(outcome); }
        finally { this.recovering = false; this.recoveryAt = this.clock.mono() + RANKED_RENEW_MS; }
    }
    public tick() {
        if (this.issued && !this.alive() && !this.retired) this.retire();
        if (!this.retired && this.clock.mono() >= this.renewAt) void this.renew();
        if (this.clock.mono() >= this.recoveryAt) void this.recover().catch(() => {});
        for (const match of this.matchmaking.getMatches()) {
            if (match.state === 'ADMITTING') void this.begin(match);
            else if (match.state === 'VOIDING' && match.admission) void this.cancel(match, match.admission.reason ?? 'server_recovery');
        }
    }
}
