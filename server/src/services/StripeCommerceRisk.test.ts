import { describe, expect, it, vi } from 'vitest';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import { StripeCommerceFulfillment } from './StripeCommerceFulfillment';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';

type Fixture = ReturnType<typeof commerceEvidenceFixture>;
const subject = (f: Fixture) => new StripeCommerceFulfillment(new StripeCommerceEvidence(f.config, f.request), f.store, f.secret);
async function deliver(f: Fixture, type: string, value: Record<string, unknown>, created?: number) {
    const signed = f.signed(type, { data: { object: value }, ...(created === undefined ? {} : { created }) });
    return subject(f).dispatchWebhook(signed.body, signed.headers);
}
function refund(f: Fixture, amount = f.intent.amountTotal, status = 'succeeded') {
    const value = { id: 're_FIXTUREPAYMENT', charge: f.charge.id, payment_intent: f.payment.id,
        currency: 'usd', amount, status };
    f.records.refunds.data = [value]; f.records[`refunds/${value.id}`] = value;
    f.charge.amount_refunded = ['succeeded','pending','requires_action'].includes(status) ? amount : 0;
    f.charge.refunded = status === 'succeeded' && amount === f.intent.amountTotal;
    return value;
}
function dispute(f: Fixture, status = 'needs_response', prefix = 'dp') {
    const value = { id: prefix + '_FIXTUREPAYMENT', livemode: f.config.livemode, charge: f.charge.id,
        payment_intent: f.payment.id, currency: 'usd', amount: f.intent.amountTotal, status };
    f.records.disputes.data = [value]; f.records[`disputes/${value.id}`] = value;
    f.charge.disputed = true;
    return value;
}
function warning(f: Fixture, actionable = true) {
    const value = { id: 'issfr_FIXTUREPAYMENT', livemode: f.config.livemode, charge: f.charge.id,
        payment_intent: f.payment.id, actionable };
    f.records['radar/early_fraud_warnings'].data = [value];
    f.records[`radar/early_fraud_warnings/${value.id}`] = value;
    return value;
}
const applied = (f: Fixture) => vi.mocked(f.store.applySourceRisk).mock.calls.at(-1)![0];

describe('purchase-source canonical Stripe risk evidence (no real provider writes)', () => {
    it.each(['dp', 'du'])('accepts canonical %s dispute IDs for grants and all final outcomes', async prefix => {
        const f = commerceEvidenceFixture('hints_13'); const value = dispute(f, 'needs_response', prefix);
        const signed = f.signed();
        await subject(f).fulfillWebhook(signed.body, signed.headers);
        expect(f.store.fulfillOneTime).toHaveBeenCalledWith(expect.objectContaining({
            paymentSource: expect.objectContaining({ disputeId: value.id, riskState: 'disputed' }),
        }));
        for (const [status, riskState] of [['needs_response', 'disputed'], ['won', 'clear'], ['lost', 'dispute_lost']]) {
            value.status = status;
            await deliver(f, 'charge.dispute.closed', { ...value, status: 'needs_response' });
            expect(applied(f).paymentSource).toMatchObject({ disputeId: value.id, disputeStatus: status, riskState });
        }
    });
    it.each(['ch', 'refund', 'dx', 'du/foreign'])('rejects non-dispute %s IDs before a provider routing request or ledger write', async prefix => {
        const f = commerceEvidenceFixture('hints_13'); const value = dispute(f, 'needs_response', prefix);
        await expect(deliver(f, 'charge.dispute.created', value)).rejects.toThrow('COMMERCE_EVIDENCE_UNAVAILABLE');
        expect(f.request).not.toHaveBeenCalled();
        expect(f.store.applySourceRisk).not.toHaveBeenCalled();
        expect(f.store.fulfillOneTime).not.toHaveBeenCalled();
    });
    it.each(['hints_13','plus_monthly','standard_monthly'] as const)('binds full refund to only the %s source', async sku => {
        const f = commerceEvidenceFixture(sku); refund(f);
        await expect(deliver(f, 'charge.refunded', { ...f.charge, amount_refunded: 0, refunded: false })).resolves.toBe(true);
        expect(applied(f)).toMatchObject({ checkoutId: f.checkout.id, userId: 'Alice', sku,
            invoiceId: sku === 'hints_13' ? null : f.invoice.id,
            subscriptionId: sku === 'hints_13' ? null : f.subscription.id,
            paymentSource: { paymentIntentId: f.payment.id, chargeId: f.charge.id,
                customerId: f.checkout.customer, amountRefunded: f.intent.amountTotal, riskState: 'refunded' } });
        expect(f.store.fulfillOneTime).not.toHaveBeenCalled(); expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
        expect(sku === 'hints_13' ? f.store.releaseCommerceReconciliation : f.store.releaseReconciliation).toHaveBeenCalledOnce();
        for (const [, init] of f.request.mock.calls) expect(init?.method).toBe('GET');
    });
    it.each(['charge.refunded','refund.created','refund.updated','refund.failed'])('uses canonical status on %s', async type => {
        const f = commerceEvidenceFixture('hints_13'); const value = refund(f, 100, 'succeeded');
        await deliver(f, type, type === 'charge.refunded' ? f.charge : { ...value, status: 'failed' });
        expect(applied(f).paymentSource).toMatchObject({ riskState: 'partial_refund', amountRefunded: 100 });
    });
    it.each(['pending','requires_action','failed','canceled'])('does not reclaim an uncompleted %s refund', async status => {
        const f = commerceEvidenceFixture('hints_13'); const value = refund(f, 1000, status);
        await deliver(f, 'refund.updated', value);
        expect(applied(f).paymentSource).toMatchObject({ amountRefunded: 0,
            riskState: ['failed','canceled'].includes(status) ? 'clear' : 'manual_review' });
    });
    it.each([
        ['needs_response','disputed'],['under_review','disputed'],
        ['warning_needs_response','disputed'],['warning_under_review','disputed'],
        ['lost','dispute_lost'],['won','clear'],['warning_closed','clear'],['prevented','clear'],
    ])('maps canonical dispute %s to %s without event ordering', async (status, state) => {
        const f = commerceEvidenceFixture('hints_13'); const value = dispute(f, status);
        // The delivered old "created" body says open; Stripe's current object controls the result.
        await deliver(f, 'charge.dispute.created', { ...value, status: 'needs_response' }, 1);
        expect(applied(f).paymentSource).toMatchObject({ riskState: state, disputeId: value.id, disputeStatus: status });
        expect(applied(f)).not.toHaveProperty('eventCreated');
    });
    it.each(['charge.dispute.updated','charge.dispute.closed','charge.dispute.funds_reinstated',
        'charge.dispute.funds_withdrawn'])('reconciles %s from the current full graph', async type => {
        const f = commerceEvidenceFixture('hints_13'); const value = dispute(f, 'won');
        await expect(deliver(f, type, value)).resolves.toBe(true);
        expect(applied(f).paymentSource.riskState).toBe('clear');
    });
    it('does not release refunded funds on a later dispute win', async () => {
        const f = commerceEvidenceFixture('hints_13'); refund(f); const value = dispute(f, 'won');
        await deliver(f, 'charge.dispute.closed', value);
        expect(applied(f).paymentSource).toMatchObject({ riskState: 'refunded', disputeStatus: 'won' });
    });
    it('keeps partial refund evidence after a won dispute for individual review', async () => {
        const f = commerceEvidenceFixture('hints_13'); refund(f, 100); const value = dispute(f, 'won');
        await deliver(f, 'charge.dispute.closed', value);
        expect(applied(f).paymentSource).toMatchObject({ riskState: 'partial_refund', amountRefunded: 100 });
    });
    it.each([true,false])('uses canonical early-warning actionability (%s)', async actionable => {
        const f = commerceEvidenceFixture('hints_13'); const value = warning(f, actionable);
        await deliver(f, 'radar.early_fraud_warning.created', { ...value, actionable: !actionable });
        expect(applied(f).paymentSource.riskState).toBe(actionable ? 'manual_review' : 'clear');
    });
    it.each(['issued','void'])('leaves %s credit note balance/out-of-band adjustments for review', async status => {
        const f = commerceEvidenceFixture(); const value = { id: 'cn_FIXTUREPAYMENT', livemode: false,
            invoice: f.invoice.id, customer: f.checkout.customer, currency: 'usd', amount: 600, status };
        f.records[`credit_notes/${value.id}`] = value;
        f.invoice.post_payment_credit_notes_amount = status === 'issued' ? 600 : 0;
        await deliver(f, 'credit_note.created', { id: value.id });
        expect(applied(f).paymentSource.riskState).toBe(status === 'issued' ? 'manual_review' : 'clear');
    });
    it('uses successful cash refund evidence even when a credit note is present', async () => {
        const f = commerceEvidenceFixture(); refund(f);
        const value = { id: 'cn_FIXTUREPAYMENT', livemode: false, invoice: f.invoice.id,
            customer: f.checkout.customer, currency: 'usd', amount: 600, status: 'issued' };
        f.records[`credit_notes/${value.id}`] = value; f.invoice.post_payment_credit_notes_amount = 600;
        await deliver(f, 'credit_note.created', { id: value.id });
        expect(applied(f).paymentSource.riskState).toBe('refunded');
    });
    it('attaches a reversed historical payment period without replacing the current period', async () => {
        const f = commerceEvidenceFixture(); const old = structuredClone(f.invoice);
        old.id = 'in_FIXTUREHISTORY'; old.lines.data[0].invoice = old.id;
        old.lines.data[0].period = { start: f.start - 30 * 86400, end: f.start };
        f.records[`invoices/${old.id}`] = old;
        const oldPayments = structuredClone(f.payments); oldPayments.data[0].invoice = old.id;
        oldPayments.data[0].payment.payment_intent = 'pi_FIXTUREHISTORY';
        f.records[`invoice_payments:${old.id}`] = oldPayments;
        f.records['invoice_payments:null'] = oldPayments;
        const oldPayment = { ...f.payment, id: 'pi_FIXTUREHISTORY', latest_charge: 'ch_FIXTUREHISTORY' };
        const oldCharge = { ...f.charge, id: 'ch_FIXTUREHISTORY', payment_intent: oldPayment.id, amount_refunded: 600, refunded: true };
        f.records[`payment_intents/${oldPayment.id}`] = oldPayment;
        f.records[`charges/${oldCharge.id}`] = oldCharge;
        const oldRefund = { id: 're_FIXTUREHISTORY', charge: oldCharge.id, payment_intent: oldPayment.id,
            currency: 'usd', amount: 600, status: 'succeeded' };
        f.records[`refunds:${oldCharge.id}`] = { has_more: false, data: [oldRefund] };
        f.records[`refunds/${oldRefund.id}`] = oldRefund;
        await deliver(f, 'charge.refunded', oldCharge);
        expect(applied(f)).toMatchObject({ invoiceId: old.id, periodEnd: new Date(f.start * 1000).toISOString(),
            paymentSource: { chargeId: oldCharge.id, riskState: 'refunded' } });
        expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
        expect(f.invoice.id).toBe(f.subscription.latest_invoice);
    });
    it('records current-period risk on a subscription update even without a new invoice grant', async () => {
        const f = commerceEvidenceFixture(); refund(f);
        const signed = f.signed('customer.subscription.updated');
        await subject(f).fulfillWebhook(signed.body, signed.headers);
        expect(f.store.fulfillSubscription).toHaveBeenCalledWith(expect.objectContaining({
            paidPeriod: null, currentPaidPeriod: expect.objectContaining({ invoiceId: f.invoice.id,
                paymentSource: expect.objectContaining({ riskState: 'refunded' }) }),
        }));
    });
    it('passes refund-before-Checkout-fulfillment proof to the atomic grant without a usable credit assumption', async () => {
        const f = commerceEvidenceFixture('hints_13'); refund(f);
        const signed = f.signed();
        await subject(f).fulfillWebhook(signed.body, signed.headers);
        expect(f.store.fulfillOneTime).toHaveBeenCalledWith(expect.objectContaining({
            token: '22222222-2222-4222-8222-222222222222',
            paymentSource: expect.objectContaining({ riskState: 'refunded' }),
        }));
    });
    it('refreshes risk evidence after acquiring the lease instead of applying the routing snapshot', async () => {
        const f = commerceEvidenceFixture('hints_13');
        vi.mocked(f.store.acquireCommerceReconciliation).mockImplementationOnce(async () => {
            refund(f); return { token: '22222222-2222-4222-8222-222222222222', retired: false };
        });
        await deliver(f, 'charge.refunded', f.charge);
        expect(applied(f).paymentSource.riskState).toBe('refunded');
        expect(f.request.mock.invocationCallOrder.some(order =>
            order > vi.mocked(f.store.acquireCommerceReconciliation).mock.invocationCallOrder[0])).toBe(true);
        expect(vi.mocked(f.store.applySourceRisk).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(f.store.releaseCommerceReconciliation).mock.invocationCallOrder[0]);
    });
    it('cannot acquire a stale grant graph while another purchase reconciler holds the lease', async () => {
        const f = commerceEvidenceFixture('hints_13');
        vi.mocked(f.store.acquireCommerceReconciliation).mockResolvedValue({ token: null, retired: false });
        const signed = f.signed();
        await expect(subject(f).fulfillWebhook(signed.body, signed.headers)).rejects.toThrow('RECONCILIATION_BUSY');
        expect(f.request).not.toHaveBeenCalled(); expect(f.store.fulfillOneTime).not.toHaveBeenCalled();
    });
    it('acknowledges retired one-time delivery before erased intent or provider reads', async () => {
        const f = commerceEvidenceFixture('hints_13');
        vi.mocked(f.store.acquireCommerceReconciliation).mockResolvedValue({ token: null, retired: true });
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        f.request.mockRejectedValue(new Error('provider unavailable'));
        const signed = f.signed();
        await expect(subject(f).dispatchWebhook(signed.body, signed.headers)).resolves.toBe(true);
        expect(f.store.checkoutIntent).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
    });
    it('acknowledges risk on a retired checkout after routing, without requiring erased ownership', async () => {
        const f = commerceEvidenceFixture('hints_13'); refund(f);
        vi.mocked(f.store.acquireCommerceReconciliation).mockResolvedValue({ token: null, retired: true });
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        await expect(deliver(f, 'charge.refunded', f.charge)).resolves.toBe(true);
        expect(f.store.checkoutIntent).not.toHaveBeenCalled(); expect(f.store.applySourceRisk).not.toHaveBeenCalled();
    });
    it('retains genuine legacy refund routing and releases the lease before falling through', async () => {
        const f = commerceEvidenceFixture(); f.checkout.metadata.qgambit_sku = 'legacy_monthly' as never;
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        await expect(deliver(f, 'charge.refunded', f.charge)).resolves.toBe(false);
        expect(f.store.applySourceRisk).not.toHaveBeenCalled(); expect(f.store.releaseReconciliation).toHaveBeenCalledOnce();
    });
    it('retries atomic DB failure and releases the fence without granting', async () => {
        const f = commerceEvidenceFixture('hints_13'); refund(f);
        vi.mocked(f.store.applySourceRisk).mockRejectedValue(new Error('rollback'));
        await expect(deliver(f, 'charge.refunded', f.charge)).rejects.toThrow('rollback');
        expect(f.store.releaseCommerceReconciliation).toHaveBeenCalledOnce();
    });
    it.each([
        ['refund payment intent', (f: Fixture) => { f.records[`refunds/re_FIXTUREPAYMENT`].payment_intent = 'pi_OTHERPAYMENT'; }],
        ['refund charge', (f: Fixture) => { f.records[`refunds/re_FIXTUREPAYMENT`].charge = 'ch_OTHERPAYMENT'; }],
        ['refund amount mismatch', (f: Fixture) => { f.records[`refunds/re_FIXTUREPAYMENT`].amount--; }],
        ['refund unknown status', (f: Fixture) => { f.records[`refunds/re_FIXTUREPAYMENT`].status = 'unknown'; }],
        ['refund currency', (f: Fixture) => { f.records[`refunds/re_FIXTUREPAYMENT`].currency = 'eur'; }],
        ['truncated refund list', (f: Fixture) => { f.records.refunds.has_more = true; }],
        ['truncated dispute list', (f: Fixture) => { f.records.disputes.has_more = true; }],
        ['truncated warning list', (f: Fixture) => { f.records['radar/early_fraud_warnings'].has_more = true; }],
        ['charge customer', (f: Fixture) => { f.charge.customer = 'cus_OTHERPAYMENT'; }],
        ['charge mode', (f: Fixture) => { f.charge.livemode = true; }],
        ['payment intent latest charge', (f: Fixture) => { f.payment.latest_charge = 'ch_OTHERPAYMENT'; }],
        ['canonical price', (f: Fixture) => { f.price.unit_amount++; }],
    ] as const)('rejects inconsistent %s', async (_label, mutate) => {
        const f = commerceEvidenceFixture('hints_13'); refund(f); mutate(f);
        await expect(deliver(f, 'charge.refunded', f.charge)).rejects.toThrow('COMMERCE_EVIDENCE_UNAVAILABLE');
        expect(f.store.applySourceRisk).not.toHaveBeenCalled();
    });
    it.each(['customer','mode','payment','status','amount','currency','missing'])('rejects invalid dispute %s', async field => {
        const f = commerceEvidenceFixture('hints_13'); const value = dispute(f);
        if (field === 'customer') f.payment.customer = 'cus_OTHERPAYMENT';
        if (field === 'mode') value.livemode = true;
        if (field === 'payment') value.payment_intent = 'pi_OTHERPAYMENT';
        if (field === 'status') value.status = 'unrecognized';
        if (field === 'amount') value.amount = 1001;
        if (field === 'currency') value.currency = 'eur';
        if (field === 'missing') f.records.disputes.data = [];
        await expect(deliver(f, 'charge.dispute.created', value)).rejects.toThrow();
        expect(f.store.applySourceRisk).not.toHaveBeenCalled();
    });
    it('adds multiple successful partial refunds before recognizing a full reversal', async () => {
        const f = commerceEvidenceFixture('hints_13'); const first = refund(f, 400);
        const second = { ...first, id: 're_FIXTURESECOND', amount: 600 };
        f.records.refunds.data.push(second); f.records[`refunds/${second.id}`] = second;
        f.charge.amount_refunded = 1000; f.charge.refunded = true;
        await deliver(f, 'refund.updated', second);
        expect(applied(f).paymentSource).toMatchObject({ amountRefunded: 1000, riskState: 'refunded' });
    });
    it('refuses a charge that changes while traversing its risk graph', async () => {
        const f = commerceEvidenceFixture('hints_13');
        const original = f.request.getMockImplementation()!;
        let chargeReads = 0;
        f.request.mockImplementation(async (input, init) => {
            // Routing twice, then initial payment proof, then its final consistency read.
            if (new URL(String(input)).pathname === `/v1/charges/${f.charge.id}` && ++chargeReads === 4) refund(f);
            return original(input, init);
        });
        await expect(deliver(f, 'charge.refunded', f.charge)).rejects.toThrow('COMMERCE_EVIDENCE_UNAVAILABLE');
        expect(f.store.applySourceRisk).not.toHaveBeenCalled();
        expect(f.store.releaseCommerceReconciliation).toHaveBeenCalledOnce();
    });
    it('rejects a mismatched payment selected by a signed risk body even if its totals coincide', async () => {
        const f = commerceEvidenceFixture('hints_13'); const value = dispute(f);
        const signed = f.signed('charge.dispute.created', { data: { object: { ...value, charge: 'ch_OTHERPAYMENT' } } });
        await subject(f).dispatchWebhook(signed.body, signed.headers);
        expect(applied(f).paymentSource.chargeId).toBe(f.charge.id); // Re-retrieved dispute wins over event charge.
    });
    it('retries lease release failure after a durable risk application', async () => {
        const f = commerceEvidenceFixture('hints_13'); refund(f);
        vi.mocked(f.store.releaseCommerceReconciliation).mockRejectedValue(new Error('release unavailable'));
        await expect(deliver(f, 'charge.refunded', f.charge)).rejects.toThrow('release unavailable');
        expect(f.store.applySourceRisk).toHaveBeenCalledOnce();
    });
    it('rejects invalid risk signatures before provider access and validates mode before routing', async () => {
        const f = commerceEvidenceFixture('hints_13'); const signed = f.signed('charge.refunded', { data: { object: f.charge } });
        await expect(subject(f).dispatchWebhook(Buffer.from('{}'), signed.headers)).rejects.toThrow('INVALID_SIGNATURE');
        const otherMode = f.signed('charge.refunded', { livemode: true, data: { object: f.charge } });
        await expect(subject(f).dispatchWebhook(otherMode.body, otherMode.headers)).rejects.toThrow('EVENT_MODE_MISMATCH');
        expect(f.request).not.toHaveBeenCalled(); expect(f.store.applySourceRisk).not.toHaveBeenCalled();
    });

});
