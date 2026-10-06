import express from 'express';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RankedIdentity, RankedSessionAuthority } from './RankedAuth';
import { AccountWriteGate } from './AccountDeletion';
import { createAccountDeletionRouter } from './AccountDeletionRoutes';
import { createAccountRecoveryRouter } from './AccountRecoveryRoutes';
import { createAccountSecurityRouter } from './AccountSecurityRoutes';
import { createCurrentTermsRouter } from './AccountCurrentTermsRoutes';
import { createAccountProgressRouter } from './AccountProgressRoutes';
import { createAccountTermsRouter } from './AccountTermsRoutes';
import { createAccountProfileRouter } from './AccountProfileRoutes';
import { createPrivateGameRecordRouter } from './PrivateGameRecordRoutes';
import { createProfileAvatarRouter } from './ProfileAvatarRoutes';
import { createAdRewardRouter } from './AdRewardRoutes';
import { createFoundersRewardRouter } from './FoundersRewardRoutes';
import { createDailyLoginRouter } from './DailyLoginRoutes';
import { createCpuPracticeRouter } from './CpuPracticeRoutes';
import { createRankedRefundRouter } from './RankedRefundRoutes';
import { createStripeMembershipRouter } from './StripeMembershipRoutes';

// The server's native compiler has no parser API; use the root tooling compiler.
const ts = createRequire(path.resolve('package.json'))('typescript');
const token = 'ranked_' + 'A'.repeat(43);
const proof: RankedIdentity = { userId: 'Alice', expiresAt: Date.now() + 60_000 };
const servers: Server[] = [];
function deferred<T>() {
    let resolve!: (value: T) => void, reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
        server.closeAllConnections(); server.close(() => resolve());
    })));
    vi.restoreAllMocks();
});
type RouteCase = {
    name: string; path: string; body?: unknown; recheck?: boolean;
    router: (auth: RankedSessionAuthority, store: any, gate: AccountWriteGate) => express.Router;
};
const routes: RouteCase[] = [
    { name: 'deletion', path: '/account/deletion', body: { confirmation: 'DELETE', ticket: 'delete_' + 'a'.repeat(64) },
        router: (a, s, g) => createAccountDeletionRouter(a, s, g, () => false, () => {}, async () => {}) },
    { name: 'recovery enrollment', path: '/account/recovery/start', body: { userId: 'Alice', email: 'alice@example.test', password: 'current-password' },
        router: (a, s, g) => createAccountRecoveryRouter(a, s, g, () => false, () => {}, true) },
    { name: 'revoke all', path: '/account/sessions/revoke-all', body: {}, recheck: true,
        router: (a, s, g) => createAccountSecurityRouter(a, s, g, () => {}) },
    { name: 'current terms', path: '/account/current-terms', recheck: true, router: createCurrentTermsRouter },
    { name: 'progress', path: '/account/progress', recheck: true, router: createAccountProgressRouter },
    { name: 'terms', path: '/account/terms', recheck: true, router: createAccountTermsRouter },
    { name: 'profile', path: '/account/friends', recheck: true, router: createAccountProfileRouter },
    { name: 'private records', path: '/game-records', router: createPrivateGameRecordRouter },
    { name: 'avatar', path: '/profile/avatar/icon', body: { iconId: 'circuit-01' }, router: createProfileAvatarRouter },
    { name: 'ad rewards', path: '/ads/allowance', router: (a, s) => createAdRewardRouter(a, s, undefined, () => true) },
    { name: 'founders', path: '/rewards/founders', router: (a, s) => createFoundersRewardRouter(a, s, null) },
    { name: 'daily reward', path: '/rewards/daily-login', recheck: true, router: (a, s, g) => createDailyLoginRouter(a, s, g, () => true) },
    { name: 'CPU practice', path: '/cpu-practice/sessions/fixture', recheck: true,
        router: (a, s, g) => createCpuPracticeRouter(a, s, s.verifyUser, g, () => false, () => true) },
    { name: 'ranked refund', path: '/tickets/ranked-refunds', recheck: true, router: (a, s, g) => createRankedRefundRouter(a, s, g, () => true) },
    { name: 'Stripe membership', path: '/membership/stripe/status', recheck: true,
        router: (a, s, g) => createStripeMembershipRouter(a, { livemode: false } as any, s, g, () => true) },
];
async function fixture(route: RouteCase, blockAt = 1) {
    const pending = deferred<RankedIdentity | null>(), entered = deferred<void>();
    const verify = vi.fn<RankedSessionAuthority['verifySession']>().mockResolvedValue(proof);
    for (let count = 1; count < blockAt; count++) verify.mockResolvedValueOnce(proof);
    verify.mockImplementationOnce(() => { entered.resolve(); return pending.promise; });
    const auth: RankedSessionAuthority = {
        issueLegacySession: vi.fn().mockResolvedValue(null), verifySession: verify,
        revokeSession: vi.fn().mockResolvedValue(false), revokeUserSessions: vi.fn().mockResolvedValue(0),
    };
    const downstream = vi.fn().mockResolvedValue(null);
    const store = {
        verifyUser: vi.fn().mockResolvedValue(null), ready: vi.fn().mockResolvedValue(true),
        blocked: vi.fn().mockResolvedValue(false), read: vi.fn().mockResolvedValue({ freeRankedRefunds: 0, paidRankedRefunds: 0 }),
        profile: downstream, friends: downstream, save: downstream, accept: downstream,
        begin: downstream, verifyPassword: downstream, sendCode: downstream, binding: downstream,
        signOutAll: downstream, getPrivateGameRecords: downstream, setIcon: downstream,
        balance: downstream, owned: downstream, status: downstream,
    };
    const app = express(); app.use(route.router(auth, store, new AccountWriteGate()));
    const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    servers.push(server);
    const address = server.address(); if (!address || typeof address === 'string') throw Error('Missing address');
    let finished = false;
    const result = fetch(`http://127.0.0.1:${address.port}${route.path}`, {
        method: route.body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(route.body === undefined ? {} : { body: JSON.stringify(route.body) }),
    }).then(value => { finished = true; return value; });
    await entered.promise;
    await setImmediate();
    expect(finished).toBe(false);
    expect(downstream).not.toHaveBeenCalled();
    expect(auth.revokeUserSessions).not.toHaveBeenCalled();
    return { pending, result, verify, downstream, auth, store };
}

describe('HTTP consumers await the session authority', () => {
    it.each(routes)('$name waits for initial identity and never accepts a Promise of null', async route => {
        const f = await fixture(route); f.pending.resolve(null);
        expect((await f.result).status).toBe(401);
        expect(f.downstream).not.toHaveBeenCalled(); expect(f.auth.revokeUserSessions).not.toHaveBeenCalled();
    });
    it.each(routes)('$name handles rejected initial verification without exposing credentials', async route => {
        const logs = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')];
        const f = await fixture(route); f.pending.reject(new Error('private-password-and-token'));
        const response = await f.result;
        expect(response.status).toBe(503); expect(await response.text()).not.toContain('private-password-and-token');
        expect(f.downstream).not.toHaveBeenCalled(); expect(f.auth.revokeUserSessions).not.toHaveBeenCalled();
        for (const log of logs) expect(log).not.toHaveBeenCalled();
    });
    it.each(routes.filter(route => route.recheck))('$name waits for revalidation and fails closed on delayed revocation', async route => {
        const f = await fixture(route, 2); f.pending.resolve(null);
        expect((await f.result).status).toBe(401);
        expect(f.downstream).not.toHaveBeenCalled(); expect(f.auth.revokeUserSessions).not.toHaveBeenCalled();
    });
    it.each(routes.filter(route => route.recheck))('$name fails closed when revalidation rejects', async route => {
        const f = await fixture(route, 2); f.pending.reject(new Error('private-password-and-token'));
        const response = await f.result;
        expect(response.status).toBe(503); expect(await response.text()).not.toContain('private-password-and-token');
        expect(f.downstream).not.toHaveBeenCalled(); expect(f.auth.revokeUserSessions).not.toHaveBeenCalled();
    });
});

it('awaits every production session authority call, including boolean rechecks and revocation callbacks', () => {
    const missing: string[] = []; let calls = 0;
    function inspect(directory: string) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) { inspect(file); continue; }
            if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
            const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            function visit(node: any) {
                if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
                    && ['issueLegacySession', 'verifySession', 'revokeSession', 'revokeUserSessions'].includes(node.expression.name.text)) {
                    calls++;
                    if (!ts.isAwaitExpression(node.parent)) {
                        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
                        missing.push(`${file}:${line}`);
                    }
                }
                ts.forEachChild(node, visit);
            }
            visit(source);
        }
    }
    inspect('server/src'); expect(calls).toBeGreaterThan(40); expect(missing).toEqual([]);
});
