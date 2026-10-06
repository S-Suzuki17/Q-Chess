import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { historicalCommerceDatabase, applyMigrations, releaseCommerceMigrations } from './fixtures/commerceDatabaseFixture';
import { CpuPracticeService } from './CpuPracticeService';
import { CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY, cpuHintPurchaseRpc } from './CpuHintOriginProtocol';
import { getAllConcreteMoves } from '../quantum-engine/ai/random';

// Actual SQL and actual service, deterministic legal move selection. PGlite
// serializes queries; multi-backend races are tested by the native fixture.
describe('dormant hint-origin service and SQL', () => {
    let db: PGlite;
    let standaloneRpcTransactions = false;
    const scalar = async (sql: string, values: unknown[] = []) =>
        (await db.query<{ result: any }>(sql, values)).rows[0]?.result;
    const wallet = () => scalar("select to_jsonb(w) as result from public.ticket_wallets w where user_id='HintAlice'");
    const balance = (column: string, count: number) => {
        if (!['hint_tickets', 'subscription_hint_tickets', 'purchased_hint_tickets',
            'test_purchased_hint_tickets', 'test_subscription_hint_tickets'].includes(column)) throw new Error('column');
        return db.query(`update public.ticket_wallets set ${column}=$1 where user_id='HintAlice'`, [count]);
    };
    const client = { rpc(name: string, parameters: Record<string, unknown>) { return { async abortSignal() {
        if (!/^(cpu_practice_|read_cpu_hint_receipt$|buy_cpu_hint)/.test(name)) throw new Error('RPC');
        await db.exec(standaloneRpcTransactions ? 'begin' : 'savepoint hint_rpc');
        try {
            const entries = Object.entries(parameters);
            const data = await scalar(`select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) as result`,
                entries.map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value));
            await db.exec(standaloneRpcTransactions ? 'commit' : 'release savepoint hint_rpc');
            return { data, error: null };
        } catch (error) {
            await db.exec(standaloneRpcTransactions ? 'rollback' : 'rollback to savepoint hint_rpc; release savepoint hint_rpc');
            return { data: null, error: { message: (error as Error).message } };
        }
    } }; } };
    const search = vi.fn(async (state: Parameters<typeof getAllConcreteMoves>[0]) => getAllConcreteMoves(state)[0] ?? null);
    const service = (override = client, v2 = true) => new CpuPracticeService(override as never, true, search,
        v2 ? () => 'buy_cpu_hint_v2' : cpuHintPurchaseRpc);
    const open = () => service().open('HintAlice', randomUUID(), 'white', 1, 600);
    const buy = (s: Awaited<ReturnType<typeof open>>, id = randomUUID(), instance = service()) =>
        instance.requestHint(id, 'HintAlice', s.sessionId, s.revision);
    const origin = (id: string) => scalar('select origin as result from public.cpu_hint_wallet_origins where receipt_id=$1', [id]);
    const restore = (id: string) => scalar("select public.restore_cpu_hint_credit($1,'HintAlice','unrecoverable_delivery') as result", [id]);

    beforeAll(async () => {
        db = await historicalCommerceDatabase();
        await applyMigrations(db, releaseCommerceMigrations);
    }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => {
        search.mockReset().mockImplementation(async state => getAllConcreteMoves(state)[0] ?? null);
        await db.exec(`begin; insert into public.profiles(id) values('HintAlice');
            insert into public.account_terms_consents(user_id,version) values('HintAlice','2026-09-25.1'),('HintAlice','2026-10-03.1');
            insert into public.ticket_wallets(user_id) values('HintAlice'); set role service_role;`);
    });
    afterEach(async () => { await db.exec('rollback; reset role'); vi.unstubAllEnvs(); });

    it('keeps default production selection on legacy despite environment flags and available new stock', async () => {
        vi.stubEnv('CPU_HINT_ORIGIN_CONSUMPTION_ENABLED', 'true');
        vi.stubEnv('CPU_HINT_TICKETS_ENABLED', 'true');
        expect(CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY).toBe(false);
        expect(cpuHintPurchaseRpc()).toBe('buy_cpu_hint');
        await balance('purchased_hint_tickets', 13);
        await expect(buy(await open(), randomUUID(), service(client, false))).rejects.toThrow('INSUFFICIENT_FUNDS');
        expect((await wallet()).purchased_hint_tickets).toBe(13);
    });

    it('spends free then earned subscription then purchased, exactly one per eligible revision', async () => {
        await balance('hint_tickets', 1); await balance('subscription_hint_tickets', 1); await balance('purchased_hint_tickets', 1);
        const free = await buy(await open());
        expect(await origin(free.receiptId)).toBeUndefined();
        expect(await wallet()).toMatchObject({ hint_tickets: 0, subscription_hint_tickets: 1, purchased_hint_tickets: 1 });
        const subscription = await buy(await open());
        expect(await origin(subscription.receiptId)).toBe('subscription');
        expect(await wallet()).toMatchObject({ subscription_hint_tickets: 0, purchased_hint_tickets: 1 });
        const purchased = await buy(await open());
        expect(await origin(purchased.receiptId)).toBe('purchased');
        await expect(buy(await open())).rejects.toThrow('INSUFFICIENT_FUNDS');
        expect((await wallet()).purchased_hint_tickets).toBe(0);
    });

    it.each(['subscription', 'purchased'])('recovers %s receipt after lost response, fresh service and close without another debit', async source => {
        await balance(`${source}_hint_tickets`, 2);
        const s = await open(), id = randomUUID();
        const lost = { rpc(name: string, params: Record<string, unknown>) { return { async abortSignal() {
            const result = await client.rpc(name, params).abortSignal();
            return name === 'buy_cpu_hint_v2' && !result.error ? { data: null, error: { message: 'lost response' } } : result;
        } }; } };
        await expect(buy(s, id, service(lost))).rejects.toThrow('CPU_PRACTICE_UNAVAILABLE');
        const recovered = await buy(s, id);
        const calls = search.mock.calls.length;
        expect(await buy(s, randomUUID())).toEqual(recovered);
        await service().close('HintAlice', s.sessionId);
        expect(await service().receipt('HintAlice', s.sessionId, 0, id)).toEqual(recovered);
        expect(search.mock.calls.length).toBe(calls);
        expect((await wallet())[`${source}_hint_tickets`]).toBe(1);
        expect(await scalar('select count(*)::integer as result from public.cpu_hint_restorations')).toBe(0);
    });

    it('recovers one committed receipt when cancellation follows purchase RPC dispatch', async () => {
        await balance('purchased_hint_tickets', 2);
        const s = await open(), id = randomUUID(), controller = new AbortController();
        let dispatched!: () => void, finishTransport!: () => void;
        const inFlight = new Promise<void>(resolve => { dispatched = resolve; });
        const resumeTransport = new Promise<void>(resolve => { finishTransport = resolve; });
        let rpcSignal: AbortSignal | undefined;
        const delayed = { rpc(name: string, params: Record<string, unknown>) { return { async abortSignal(signal?: AbortSignal) {
            if (name === 'buy_cpu_hint_v2') {
                rpcSignal = signal;
                dispatched();
                await resumeTransport;
                // Execute real SQL after the user has canceled. The actual
                // service gives this RPC a timeout, not the request's signal.
                const result = await client.rpc(name, params).abortSignal();
                expect(result.error).toBeNull();
                return { data: null, error: { message: 'response lost after cancellation' } };
            }
            return client.rpc(name, params).abortSignal();
        } }; } };
        const instance = service(delayed);
        // This case commits the real SQL transactions, rather than relying
        // only on the per-test rollback/savepoint isolation used elsewhere.
        await db.exec('commit'); standaloneRpcTransactions = true;
        const pending = instance.requestHint(id, 'HintAlice', s.sessionId, 0,
            { signal: controller.signal, check() {} });
        try {
            const observed = expect(pending).rejects.toThrow('CPU_PRACTICE_UNAVAILABLE');
            await inFlight;
            controller.abort();
            expect(rpcSignal).not.toBe(controller.signal);
            expect(rpcSignal?.aborted).toBe(false);
            expect((await wallet()).purchased_hint_tickets).toBe(2);
            finishTransport(); await observed;
            const recovered = await service().receipt('HintAlice', s.sessionId, 0, id);
            expect(recovered?.receiptId).toBe(id);
            expect(await buy(s, id)).toEqual(recovered);
            expect(await buy(s, randomUUID())).toEqual(recovered);
            expect((await wallet()).purchased_hint_tickets).toBe(1);
            expect(await origin(id)).toBe('purchased');
            expect(await scalar('select count(*)::integer as result from public.cpu_hint_receipts')).toBe(1);
            expect(await scalar('select count(*)::integer as result from public.cpu_hint_restorations')).toBe(0);
        } finally {
            finishTransport(); await pending.catch(() => {});
            await db.exec("reset role; delete from public.profiles where id='HintAlice'");
            await db.exec('begin; set role service_role');
            standaloneRpcTransactions = false;
        }
    });

    it.each(['SEARCH_BUSY', 'SEARCH_FAILED', 'SEARCH_TIMEOUT'])('does not debit on %s before receipt commit', async code => {
        await balance('subscription_hint_tickets', 10); await balance('purchased_hint_tickets', 166);
        const s = await open(), before = await wallet();
        search.mockRejectedValue(new Error(code));
        await expect(buy(s)).rejects.toThrow(code);
        expect(await wallet()).toEqual(before);
    });

    it('rechecks cancellation and ranked admission after asynchronous computation before buying', async () => {
        await balance('purchased_hint_tickets', 5);
        const s = await open(), before = await wallet(), controller = new AbortController();
        search.mockImplementationOnce(async state => { controller.abort(); return getAllConcreteMoves(state)[0]; });
        await expect(service().requestHint(randomUUID(), 'HintAlice', s.sessionId, 0,
            { signal: controller.signal, check() {} })).rejects.toThrow();
        expect(await wallet()).toEqual(before);
        search.mockImplementationOnce(async state => {
            await db.query(`insert into public.ranked_match_admissions(match_id,owner_id,human_ids,state)
                values($1,$2,array['HintAlice'],'active')`, [randomUUID(), randomUUID()]);
            return getAllConcreteMoves(state)[0];
        });
        await expect(buy(s)).rejects.toThrow('HINT_UNAVAILABLE_IN_MATCH');
        expect(await wallet()).toEqual(before);
        expect(await scalar('select count(*)::integer as result from public.cpu_hint_receipts')).toBe(0);
    });

    it('rejects stale revision and sandbox-only stock without debit', async () => {
        await balance('test_subscription_hint_tickets', 10); await balance('test_purchased_hint_tickets', 166);
        const s = await open(), before = await wallet();
        await expect(service().requestHint(randomUUID(), 'HintAlice', s.sessionId, 1)).rejects.toThrow('STALE_REVISION');
        await expect(buy(s)).rejects.toThrow('INSUFFICIENT_FUNDS');
        expect(await wallet()).toEqual(before);
    });

    it.each(['subscription', 'purchased'])('restores %s only once into its recorded column', async source => {
        await balance(`${source}_hint_tickets`, 1);
        const receipt = await buy(await open());
        await balance('hint_tickets', 20);
        if (source === 'subscription') await balance('purchased_hint_tickets', 166);
        const before = await wallet();
        expect(await restore(receipt.receiptId)).toBe(1);
        expect(await restore(receipt.receiptId)).toBe(0);
        expect(await wallet()).toEqual({ ...before, [`${source}_hint_tickets`]: 1 });
        expect(await service().receipt('HintAlice', receipt.sessionId, 0, receipt.receiptId)).toEqual(receipt);
    });
});
