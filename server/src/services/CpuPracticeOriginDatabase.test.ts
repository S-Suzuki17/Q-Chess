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
    const sources = () => scalar(`select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]'::jsonb) as result
        from public.stripe_commerce_sources s where user_id='HintAlice'`);
    const packs = [{ sku: 'hints_1', amount: 100, quantity: 1 },
        { sku: 'hints_13', amount: 1000, quantity: 13 }, { sku: 'hints_166', amount: 10000, quantity: 166 }];
    // Exercise registered synthetic purchases and paid periods, so the raw
    // migration itself creates every spendable source. No aggregate backfill.
    const fund = async (source: string, count = source === 'subscription' ? 10 : 1, live = true) => {
        if (!['subscription', 'purchased'].includes(source)) throw new Error('source');
        const pack = packs.find(p => p.quantity === count);
        for (let i = 0; i < (source === 'subscription' || pack ? 1 : count); i++) {
            const suffix = randomUUID().replaceAll('-', ''), checkout = `cs_${live ? 'live' : 'test'}_HINT${suffix}`;
            const sku = source === 'subscription' ? 'plus_monthly' : (pack?.sku ?? 'hints_1');
            const price = `price_${sku.replaceAll('_', '')}`, amount = source === 'subscription' ? 600 : (pack?.amount ?? 100);
            const event = `evt_HINT${suffix}`, hash = 'a'.repeat(64);
            await scalar(`select public.register_stripe_commerce_checkout_intent('HintAlice',$1,$2,$3,$4,'usd',$5,
                clock_timestamp()+interval '1 hour') as result`, [checkout, sku, price, amount, live]);
            if (source === 'purchased') {
                const result = await scalar('select public.fulfill_stripe_commerce_one_time($1::jsonb) as result', [JSON.stringify({
                    eventId: event, payloadHash: hash, checkoutId: checkout, userId: 'HintAlice', sku, priceId: price,
                    amountTotal: amount, currency: 'usd', livemode: live, paymentStatus: 'paid',
                })]);
                expect(result.credited).toBe(pack?.quantity ?? 1);
            } else {
                expect(count).toBe(10);
                const subscription = `sub_HINT${suffix}`, now = Date.now();
                const start = new Date(now - 86400000).toISOString(), end = new Date(now + 29 * 86400000).toISOString();
                const { token } = await scalar('select public.acquire_stripe_reconciliation($1,$2) as result', [subscription, live]);
                await scalar(`select public.apply_stripe_canonical_membership_snapshot($1,$2,'invoice.paid',100,clock_timestamp(),
                    $3,$4,$5,'HintAlice',$6,'active',$7,$8,true,false,$9) as result`,
                    [event, hash, subscription, checkout, `cus_HINT${suffix}`, price, end, live, token]);
                const result = await scalar(`select public.apply_stripe_commerce_paid_period($1,$2,$3,$4,'HintAlice',$5,$6,$7,$8,$9,$10) as result`,
                    [event, hash, subscription, checkout, sku, price, start, end, live, token]);
                expect(result.credited).toBe(10);
            }
        }
        expect((await sources()).some((s: { origin: string; available: number; livemode: boolean }) =>
            s.origin === source && s.livemode === live && s.available > 0)).toBe(true);
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
        await db.exec("update public.current_terms_policy set effective_date='2026-10-07' where singleton");
        for (const sku of ['plus_monthly', ...packs.map(p => p.sku)]) for (const live of [false, true]) {
            await db.query('insert into public.stripe_commerce_price_bindings(sku,price_id,livemode) values($1,$2,$3)',
                [sku, `price_${sku.replaceAll('_', '')}`, live]);
        }
    }, 60_000);
    afterAll(async () => { await db?.close(); });
    beforeEach(async () => {
        search.mockReset().mockImplementation(async state => getAllConcreteMoves(state)[0] ?? null);
        await db.exec(`begin; insert into public.profiles(id) values('HintAlice');
            insert into public.account_terms_consents(user_id,version) values('HintAlice','2026-09-25.1'),('HintAlice','2026-10-07.1');
            insert into public.ticket_wallets(user_id) values('HintAlice'); set role service_role;`);
    });
    afterEach(async () => { await db.exec('rollback; reset role'); vi.unstubAllEnvs(); });

    // Exercise the real sandbox source before the later committed live grant
    // pins billing mode. Never clear that irreversible pin for a fixture.
    it('rejects stale revision and sandbox-only stock without debit', async () => {
        await fund('subscription', 10, false); await fund('purchased', 166, false);
        const s = await open(), before = await wallet(), sourceBefore = await sources();
        await expect(service().requestHint(randomUUID(), 'HintAlice', s.sessionId, 1)).rejects.toThrow('STALE_REVISION');
        await expect(buy(s)).rejects.toThrow('INSUFFICIENT_FUNDS');
        expect(await wallet()).toEqual(before);
        expect(await sources()).toEqual(sourceBefore);
    });

    it('uses the released ledger for default consumption independently of the new-sales switch', async () => {
        vi.stubEnv('CPU_HINT_ORIGIN_CONSUMPTION_ENABLED', 'true');
        vi.stubEnv('CPU_HINT_TICKETS_ENABLED', 'true');
        vi.stubEnv('STRIPE_MEMBERSHIP_CHECKOUT_ENABLED', 'false');
        expect(CPU_HINT_ORIGIN_CONSUMPTION_RELEASE_READY).toBe(true);
        expect(cpuHintPurchaseRpc()).toBe('buy_cpu_hint_v2');
        await fund('purchased', 13);
        const receipt = await buy(await open(), randomUUID(), service(client, false));
        expect(await origin(receipt.receiptId)).toBe('purchased');
        expect((await wallet()).purchased_hint_tickets).toBe(12);
    });

    it('spends free then earned subscription then purchased, exactly one per eligible revision', async () => {
        await balance('hint_tickets', 1); await fund('subscription'); await fund('purchased');
        const free = await buy(await open());
        expect(await origin(free.receiptId)).toBeUndefined();
        expect(await wallet()).toMatchObject({ hint_tickets: 0, subscription_hint_tickets: 10, purchased_hint_tickets: 1 });
        for (let remaining = 9; remaining >= 0; remaining--) {
            const s = await open(), subscription = await buy(s);
            expect(await origin(subscription.receiptId)).toBe('subscription');
            expect((await wallet()).subscription_hint_tickets).toBe(remaining);
            await service().close('HintAlice', s.sessionId);
        }
        expect(await wallet()).toMatchObject({ subscription_hint_tickets: 0, purchased_hint_tickets: 1 });
        const purchased = await buy(await open());
        expect(await origin(purchased.receiptId)).toBe('purchased');
        await expect(buy(await open())).rejects.toThrow('INSUFFICIENT_FUNDS');
        expect((await wallet()).purchased_hint_tickets).toBe(0);
    });

    it.each(['subscription', 'purchased'])('recovers %s receipt after lost response, fresh service and close without another debit', async source => {
        const quantity = source === 'subscription' ? 10 : 2;
        await fund(source, quantity);
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
        expect((await wallet())[`${source}_hint_tickets`]).toBe(quantity - 1);
        expect(await scalar('select count(*)::integer as result from public.cpu_hint_restorations')).toBe(0);
    });

    it('recovers one committed receipt when cancellation follows purchase RPC dispatch', async () => {
        await fund('purchased', 2);
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
        await fund('subscription'); await fund('purchased', 166);
        const s = await open(), before = await wallet();
        search.mockRejectedValue(new Error(code));
        await expect(buy(s)).rejects.toThrow(code);
        expect(await wallet()).toEqual(before);
    });

    it('rechecks cancellation and ranked admission after asynchronous computation before buying', async () => {
        await fund('purchased', 5);
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

    it.each(['subscription', 'purchased'])('does not infer %s purchase provenance from an existing aggregate balance', async source => {
        await balance(`${source}_hint_tickets`, 13);
        const before = await wallet();
        expect(await sources()).toEqual([]);
        await expect(buy(await open())).rejects.toThrow('INSUFFICIENT_FUNDS');
        expect(await wallet()).toEqual(before);
        expect(await sources()).toEqual([]);
        expect(await scalar('select count(*)::integer as result from public.cpu_hint_receipts')).toBe(0);
        expect(await scalar('select count(*)::integer as result from public.cpu_hint_wallet_origins')).toBe(0);
    });

    it.each(['subscription', 'purchased'])('requires review before restoring a historical untracked %s receipt', async source => {
        await fund(source);
        const receipt = await buy(await open());
        expect(await scalar('select source_id as result from public.cpu_hint_wallet_origins where receipt_id=$1', [receipt.receiptId])).toBeTruthy();
        // Emulate the preserved nullable pre-ledger allocation. Service-role
        // callers cannot mutate the immutable receipt-origin relation.
        await db.exec('reset role');
        await db.query('update public.cpu_hint_wallet_origins set source_id=null where receipt_id=$1', [receipt.receiptId]);
        await db.exec('set role service_role');
        const beforeWallet = await wallet(), beforeSources = await sources();
        await db.exec('savepoint historical_restore');
        await expect(restore(receipt.receiptId)).rejects.toThrow('ORIGIN_REVIEW_REQUIRED');
        await db.exec('rollback to savepoint historical_restore; release savepoint historical_restore');
        expect(await wallet()).toEqual(beforeWallet);
        expect(await sources()).toEqual(beforeSources);
        expect(await scalar('select count(*)::integer as result from public.cpu_hint_restorations')).toBe(0);
        expect(await service().receipt('HintAlice', receipt.sessionId, 0, receipt.receiptId)).toEqual(receipt);
    });

    it.each(['subscription', 'purchased'])('restores %s only once into its recorded column', async source => {
        const quantity = source === 'subscription' ? 10 : 1;
        await fund(source, quantity);
        const receipt = await buy(await open());
        const sourceId = await scalar('select source_id as result from public.cpu_hint_wallet_origins where receipt_id=$1', [receipt.receiptId]);
        expect(sourceId).toBeTruthy();
        const sourceBefore = (await sources()).find((s: { id: string }) => s.id === sourceId);
        await balance('hint_tickets', 20);
        if (source === 'subscription') await fund('purchased', 166);
        const before = await wallet();
        expect(await restore(receipt.receiptId)).toBe(1);
        expect(await restore(receipt.receiptId)).toBe(0);
        expect(await wallet()).toEqual({ ...before, [`${source}_hint_tickets`]: quantity });
        const sourceAfter = (await sources()).find((s: { id: string }) => s.id === sourceId);
        expect(sourceAfter.available).toBe(sourceBefore.available + 1);
        expect(sourceAfter.consumed).toBe(sourceBefore.consumed - 1);
        expect(await service().receipt('HintAlice', receipt.sessionId, 0, receipt.receiptId)).toEqual(receipt);
    });
});
