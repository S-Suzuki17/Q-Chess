import { describe, expect, it, vi } from 'vitest';
import { COMMERCE_SKUS, readyCommerceSkus } from './CommerceCatalog';
import { QG_STRIPE_API_VERSION } from './StripeApiVersion';
import { StripeCommerceEvidence } from './StripeCommerceEvidence';
import { StripeCommerceFulfillment } from './StripeCommerceFulfillment';
import { commerceEvidenceFixture } from './fixtures/stripeCommerceEvidenceFixture.test';

type Fixture = ReturnType<typeof commerceEvidenceFixture>;
function subject(f: Fixture) { return new StripeCommerceFulfillment(new StripeCommerceEvidence(f.config, f.request), f.store, f.secret); }
async function run(f: Fixture, type?: string, patch?: Record<string, unknown>) {
    const signed = f.signed(type, patch);
    return subject(f).fulfillWebhook(signed.body, signed.headers);
}
const noGrant = (f: Fixture) => {
    expect(f.store.fulfillOneTime).not.toHaveBeenCalled();
    expect(f.store.fulfillSubscription).not.toHaveBeenCalled();
};

describe('dormant new commerce canonical provider boundary (synthetic Stripe responses only)', () => {
    for (const sku of COMMERCE_SKUS) for (const livemode of [false, true]) {
        it(`validates ${sku} in ${livemode ? 'live' : 'test'} mode with inclusive tax`, async () => {
            const f = commerceEvidenceFixture(sku, livemode, 10);
            await expect(run(f)).resolves.toMatchObject({ applied: true });
            const grant = vi.mocked(sku.startsWith('hints') ? f.store.fulfillOneTime : f.store.fulfillSubscription).mock.calls[0][0];
            expect(grant).toMatchObject({ sku, livemode, userId: 'Alice', amountTotal: f.intent.amountTotal, priceId: f.intent.priceId });
            for (const [, init] of f.request.mock.calls) expect(new Headers(init?.headers).get('stripe-version')).toBe(QG_STRIPE_API_VERSION);
            expect(readyCommerceSkus()).toEqual([]);
        });
    }
    it.each([0, 60])('uses the net subtotal and exact final total with %i cents inclusive tax', async tax => {
        const f = commerceEvidenceFixture('plus_monthly', false, tax);
        await expect(run(f)).resolves.toMatchObject({ credited: 10 });
        expect(f.checkout.amount_subtotal + f.checkout.total_details.amount_tax).toBe(600);
    });
    it('permits archived historical prices without opening new sales', async () => {
        const f = commerceEvidenceFixture(); f.price.active = false;
        f.lines.data[0].price.active = false; f.subscription.items.data[0].price.active = false;
        await expect(run(f)).resolves.toMatchObject({ applied: true });
    });
    for (const field of ['adaptive_pricing', 'managed_payments', 'adjustable_quantity']) {
        const setOption = (f: Fixture, value: unknown) => Object.assign(
            field === 'adjustable_quantity' ? f.lines.data[0] : f.checkout, { [field]: value });
        it.each([true, false, 'enabled', 0, [true], {}, { enabled: true }, { enabled: 'false' },
            { enabled: 0 }, { enabled: null }])(`rejects malformed or enabled ${field}: %j`, async value => {
            const f = commerceEvidenceFixture(); setOption(f, value);
            await expect(run(f)).rejects.toThrow('COMMERCE_EVIDENCE_UNAVAILABLE'); noGrant(f);
        });
        it.each([undefined, null, { enabled: false }])(`accepts absent or explicitly disabled ${field}: %j`, async value => {
            const f = commerceEvidenceFixture(); setOption(f, value);
            await expect(run(f)).resolves.toMatchObject({ applied: true, credited: 10 });
        });
    }
    for (const location of ['canonical', 'checkout_line', 'subscription_item']) {
        it.each([undefined, null, 'metered'])(`requires explicit licensed usage at ${location}: %j`, async usage_type => {
            const f = commerceEvidenceFixture();
            const price = location === 'canonical' ? f.price : location === 'checkout_line'
                ? f.lines.data[0].price : f.subscription.items.data[0].price;
            // Replace this response's recurring object without mutating the
            // other independently retrieved Price fixtures that share its seed.
            Object.assign(price, { recurring: { ...price.recurring, usage_type } });
            await expect(run(f)).rejects.toThrow('COMMERCE_EVIDENCE_UNAVAILABLE'); noGrant(f);
        });
    }
    const mutations: [string, (f: Fixture) => void][] = [
        ['canonical price total', f => { f.price.unit_amount++; }],
        ['canonical price decimal', f => { f.price.unit_amount_decimal = '600.5'; }],
        ['canonical price currency', f => { f.price.currency = 'eur'; }],
        ['canonical price tax behavior', f => { f.price.tax_behavior = 'exclusive'; }],
        ['canonical price environment', f => { f.price.livemode = true; }],
        ['canonical price interval', f => { f.price.recurring!.interval = 'year'; }],
        ['tiered price', f => { f.price.billing_scheme = 'tiered'; }],
        ['transformed quantity', f => { Object.assign(f.price, { transform_quantity: { divide_by: 2, round: 'up' } }); }],
        ['checkout owner', f => { f.checkout.client_reference_id = 'Bob'; }],
        ['checkout sku metadata', f => { f.checkout.metadata.qgambit_sku = 'standard_monthly'; }],
        ['checkout mode', f => { f.checkout.mode = 'payment'; }],
        ['checkout payment', f => { f.checkout.payment_status = 'unpaid'; }],
        ['checkout environment', f => { f.checkout.livemode = true; }],
        ['checkout total', f => { f.checkout.amount_total = 601; }],
        ['gross subtotal misused for inclusive tax', f => { f.checkout.amount_subtotal = 600; }],
        ['checkout currency', f => { f.checkout.currency = 'eur'; }],
        ['checkout discount', f => { f.checkout.total_details.amount_discount = 1; }],
        ['checkout shipping', f => { f.checkout.total_details.amount_shipping = 1; }],
        ['checkout incomplete tax', f => { f.checkout.automatic_tax.status = 'failed'; }],
        ['checkout disabled expected tax', f => { f.checkout.automatic_tax.enabled = false; }],
        ['checkout adaptive pricing', f => { f.checkout.adaptive_pricing.enabled = true; }],
        ['checkout managed payments', f => { f.checkout.managed_payments.enabled = true; }],
        ['checkout line quantity', f => { f.lines.data[0].quantity = 2; }],
        ['checkout extra page', f => { f.lines.has_more = true; }],
        ['checkout extra line', f => { f.lines.data.push({ ...f.lines.data[0] }); }],
        ['checkout line price', f => { f.lines.data[0].price.id = 'price_OTHERPRODUCT'; }],
        ['checkout line tax', f => { f.lines.data[0].amount_tax++; }],
        ['subscription extra page', f => { f.subscription.items.has_more = true; }],
        ['subscription current price', f => { f.subscription.items.data[0].price.id = 'price_OTHERPRODUCT'; }],
        ['subscription quantity', f => { f.subscription.items.data[0].quantity = 2; }],
        ['subscription customer', f => { f.subscription.customer = 'cus_OTHEROWNER'; }],
        ['invoice parent', f => { f.invoice.parent.subscription_details.subscription = 'sub_OTHEROWNER'; }],
        ['invoice customer', f => { f.invoice.customer = 'cus_OTHEROWNER'; }],
        ['invoice environment', f => { f.invoice.livemode = true; }],
        ['invoice unpaid', f => { f.invoice.status = 'open'; }],
        ['invoice underpaid', f => { f.invoice.amount_paid--; }],
        ['invoice overpaid', f => { f.invoice.amount_overpaid = 1; }],
        ['invoice out-of-band payment', f => { f.invoice.amount_paid_off_stripe = 600; }],
        ['invoice credit balance', f => { f.invoice.starting_balance = -600; }],
        ['invoice post-payment credit note', f => { f.invoice.post_payment_credit_notes_amount = 1; }],
        ['invoice manual collection', f => { f.invoice.collection_method = 'send_invoice'; }],
        ['invoice tier update', f => { f.invoice.billing_reason = 'subscription_update'; }],
        ['invoice excluding tax mismatch', f => { f.invoice.total_excluding_tax = 600; }],
        ['invoice exclusive tax', f => { f.invoice.total_taxes[0].tax_behavior = 'exclusive'; }],
        ['invoice line other price', f => { f.invoice.lines.data[0].pricing.price_details.price = 'price_OTHERPRODUCT'; }],
        ['invoice proration', f => { f.invoice.lines.data[0].parent.subscription_item_details.proration = true; }],
        ['invoice fractional quantity', f => { f.invoice.lines.data[0].quantity_decimal = '1.5'; }],
        ['invoice truncated lines', f => { f.invoice.lines.has_more = true; }],
        ['invoice short service period', f => { f.invoice.lines.data[0].period.start = f.end - 86400; }],
        ['invoice later service period', f => { f.invoice.lines.data[0].period.end += 86400; }],
        ['invoice no payment lineage', f => { f.payments.data = []; }],
        ['invoice partial payment page', f => { f.payments.has_more = true; }],
        ['invoice payment other invoice', f => { f.payments.data[0].invoice = 'in_OTHERPAYMENT'; }],
        ['invoice payment underpaid', f => { f.payments.data[0].amount_paid--; }],
        ['invoice payment unrequested amount', f => { f.payments.data[0].amount_requested++; }],
        ['invoice payment multiple', f => { f.payments.data.push({ ...f.payments.data[0] }); }],
        ['intent customer', f => { f.payment.customer = 'cus_OTHEROWNER'; }],
        ['intent amount received', f => { f.payment.amount_received--; }],
        ['intent not succeeded', f => { f.payment.status = 'processing'; }],
        ['intent environment', f => { f.payment.livemode = true; }],
        ['charge other intent', f => { f.charge.payment_intent = 'pi_OTHERPAYMENT'; }],
        ['charge not captured', f => { f.charge.captured = false; }],
        ['charge partial refund', f => { f.charge.amount_refunded = 1; }],
        ['charge refunded', f => { f.charge.refunded = true; }],
        ['charge disputed', f => { f.charge.disputed = true; }],
    ];
    it.each(mutations)('rejects %s before any durable grant', async (_label, mutate) => {
        const f = commerceEvidenceFixture(); mutate(f);
        await expect(run(f)).rejects.toThrow(); noGrant(f);
        expect(f.store.releaseReconciliation).toHaveBeenCalledOnce();
    });
    it('rejects checkout async success after a partial refund', async () => {
        const f = commerceEvidenceFixture('hints_13'); f.charge.amount_refunded = 1;
        await expect(run(f, 'checkout.session.async_payment_succeeded')).rejects.toThrow(); noGrant(f);
    });
    it('does not trust a signed paid event without canonical provider evidence', async () => {
        const f = commerceEvidenceFixture('hints_13'); const signed = f.signed();
        f.checkout.payment_status = 'unpaid';
        await expect(subject(f).fulfillWebhook(signed.body, signed.headers)).rejects.toThrow(); noGrant(f);
    });
    it('binds the event checkout ID to the canonical subscription checkout', async () => {
        const f = commerceEvidenceFixture(); const signed = f.signed('checkout.session.completed', {
            data: { object: { ...f.checkout, id: 'cs_test_OTHERSESSION' } },
        });
        await expect(subject(f).fulfillWebhook(signed.body, signed.headers)).rejects.toThrow(); noGrant(f);
    });
    it('sends only the canonical period on subscription updates, with no monthly grant', async () => {
        const f = commerceEvidenceFixture(); await run(f, 'customer.subscription.updated');
        expect(f.store.fulfillSubscription).toHaveBeenCalledWith(expect.objectContaining({ paidPeriod: null, paidNewPeriod: false }));
    });
    it('projects an unchanged-price cancellation without granting or mutating purchased hints', async () => {
        const f = commerceEvidenceFixture(); f.subscription.status = 'canceled';
        await run(f, 'customer.subscription.deleted');
        expect(f.store.fulfillSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled', paidPeriod: null, paidNewPeriod: false }));
        expect(f.store.fulfillOneTime).not.toHaveBeenCalled();
    });
    it('preserves newer projection while validating a separately delivered historical invoice', async () => {
        const f = commerceEvidenceFixture();
        const old = structuredClone(f.invoice); old.id = 'in_FIXTUREHISTORY';
        old.lines.data[0].invoice = old.id;
        old.lines.data[0].period = { start: f.start - 30 * 86400, end: f.start };
        f.records[`invoices/${old.id}`] = old;
        const oldPayments = structuredClone(f.payments); oldPayments.data[0].invoice = old.id;
        oldPayments.data[0].payment.payment_intent = 'pi_FIXTUREHISTORY';
        f.records[`invoice_payments:${old.id}`] = oldPayments;
        f.records['payment_intents/pi_FIXTUREHISTORY'] = { ...f.payment, id: 'pi_FIXTUREHISTORY', latest_charge: 'ch_FIXTUREHISTORY' };
        f.records['charges/ch_FIXTUREHISTORY'] = { ...f.charge, id: 'ch_FIXTUREHISTORY', payment_intent: 'pi_FIXTUREHISTORY' };
        await run(f, 'invoice.paid', { data: { object: old } });
        expect(f.store.fulfillSubscription).toHaveBeenCalledWith(expect.objectContaining({
            latestInvoiceId: f.invoice.id, periodEnd: new Date(f.end * 1000).toISOString(), paidNewPeriod: false,
            paidPeriod: { invoiceId: old.id, periodStart: new Date((f.start - 30 * 86400) * 1000).toISOString(), periodEnd: new Date(f.start * 1000).toISOString() },
        }));
    });
    it('requires a DB intent and consent before fetching pack evidence', async () => {
        const f = commerceEvidenceFixture('hints_13'); vi.mocked(f.store.checkoutIntent).mockResolvedValue(null);
        await expect(run(f)).rejects.toThrow('COMMERCE_CHECKOUT_UNBOUND'); expect(f.request).not.toHaveBeenCalled(); noGrant(f);
        vi.mocked(f.store.checkoutIntent).mockResolvedValue(f.intent); vi.mocked(f.store.hasCurrentTerms).mockResolvedValue(false);
        await expect(run(f)).rejects.toThrow('CURRENT_TERMS_REQUIRED'); expect(f.request).not.toHaveBeenCalled(); noGrant(f);
    });
    it.each([undefined, null, 'setup', 'unknown'])('rejects malformed recognized checkout mode %j', async mode => {
        const f = commerceEvidenceFixture('hints_13');
        await expect(run(f, 'checkout.session.completed', { data: { object: { ...f.checkout, mode } } })).rejects.toThrow('COMMERCE_EVENT_INVALID');
        expect(f.request).not.toHaveBeenCalled(); noGrant(f);
    });
    it('checks signatures and API version before any provider or DB operation', async () => {
        const f = commerceEvidenceFixture(); const signed = f.signed();
        await expect(subject(f).fulfillWebhook(Buffer.from('{}'), signed.headers)).rejects.toThrow('INVALID_SIGNATURE');
        const wrongVersion = f.signed(undefined, { api_version: '2020-08-27' });
        await expect(subject(f).fulfillWebhook(wrongVersion.body, wrongVersion.headers)).rejects.toThrow('INVALID_EVENT');
        expect(f.request).not.toHaveBeenCalled(); expect(f.store.acquireReconciliation).not.toHaveBeenCalled(); noGrant(f);
    });
    it('rejects test/live event mismatch before DB reads', async () => {
        const f = commerceEvidenceFixture(); await expect(run(f, undefined, { livemode: true })).rejects.toThrow('EVENT_MODE_MISMATCH');
        expect(f.store.acquireReconciliation).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
    });
    it.each(['charge.refunded','charge.dispute.created','radar.early_fraud_warning.created','credit_note.created'])(
        'holds unsupported risk policy for %s without acknowledging a grant', async type => {
            const f = commerceEvidenceFixture(); await expect(run(f, type)).rejects.toThrow('COMMERCE_RISK_POLICY_REQUIRED'); noGrant(f);
        });
    it('keeps a database error retryable and releases the reconciliation lease', async () => {
        const f = commerceEvidenceFixture(); vi.mocked(f.store.fulfillSubscription).mockRejectedValue(new Error('database unavailable'));
        await expect(run(f)).rejects.toThrow('database unavailable'); expect(f.store.releaseReconciliation).toHaveBeenCalledOnce();
    });
    it('does not read stale provider state while a different reconciliation holds the lease', async () => {
        const f = commerceEvidenceFixture(); vi.mocked(f.store.acquireReconciliation).mockRejectedValue(new Error('RECONCILIATION_BUSY'));
        await expect(run(f)).rejects.toThrow('RECONCILIATION_BUSY'); expect(f.request).not.toHaveBeenCalled(); noGrant(f);
    });
    it('retired subscriptions cannot resurrect grants', async () => {
        const f = commerceEvidenceFixture(); vi.mocked(f.store.acquireReconciliation).mockResolvedValue({ token: null, retired: true });
        await expect(run(f)).resolves.toEqual({ applied: false, duplicate: false, retired: true, credited: 0 });
        expect(f.request).not.toHaveBeenCalled(); noGrant(f);
    });
    it('retries a lease release error after commit', async () => {
        const f = commerceEvidenceFixture(); vi.mocked(f.store.releaseReconciliation).mockRejectedValue(new Error('lease unavailable'));
        await expect(run(f)).rejects.toThrow('lease unavailable'); expect(f.store.fulfillSubscription).toHaveBeenCalledOnce();
    });
});
