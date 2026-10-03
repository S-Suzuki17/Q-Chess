import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { verifyStripeWebhook } from './StripeMembership';

const secret = 'whsec_FAKESECRET12345';
const now = 1800000000000;
const event = {
    id: 'evt_ABCDEFGH', type: 'customer.subscription.updated', created: now / 1000,
    livemode: false, data: { object: { id: 'sub_ABCDEFGH' } },
};
const raw = Buffer.from(JSON.stringify(event));
const header = (body: Buffer, timestamp: number) => Stripe.webhooks.generateTestHeaderString({
    payload: body.toString('utf8'), secret, timestamp,
});

describe('official Stripe webhook signature boundary', () => {
    it('verifies the exact raw body and retains an immutable payload hash', () => {
        const signed = header(raw, now / 1000);
        const parsed = verifyStripeWebhook(raw, { 'stripe-signature': signed }, secret, now);
        expect(parsed).toMatchObject(event);
        expect(parsed.payloadHash).toBe(createHash('sha256').update(raw).digest('hex'));
        expect(() => verifyStripeWebhook(Buffer.from(`${raw.toString()} `),
            { 'stripe-signature': signed }, secret, now)).toThrow('INVALID_SIGNATURE');
    });

    it('rejects expired and future-dated signatures, including correctly signed ones', () => {
        const past = now / 1000 - 301;
        const future = now / 1000 + 301;
        expect(() => verifyStripeWebhook(raw, { 'stripe-signature': header(raw, past) }, secret, now))
            .toThrow('INVALID_SIGNATURE');
        expect(() => verifyStripeWebhook(raw, { 'stripe-signature': header(raw, future) }, secret, now))
            .toThrow('INVALID_SIGNATURE');
    });

    it('rejects malformed raw bodies, duplicated timestamps, bad keys and tampered signatures', () => {
        const signed = header(raw, now / 1000);
        expect(() => verifyStripeWebhook(raw.toString() as unknown as Buffer,
            { 'stripe-signature': signed }, secret, now)).toThrow('INVALID_SIGNATURE');
        expect(() => verifyStripeWebhook(raw,
            { 'stripe-signature': `${signed},t=${now / 1000}` }, secret, now)).toThrow('INVALID_SIGNATURE');
        expect(() => verifyStripeWebhook(raw,
            { 'stripe-signature': signed }, 'whsec_WRONGSECRET12345', now)).toThrow('INVALID_SIGNATURE');
        const tampered = signed.replace(/v1=([0-9a-f])/, (_match, first: string) => `v1=${first === '0' ? '1' : '0'}`);
        expect(() => verifyStripeWebhook(raw,
            { 'stripe-signature': tampered }, secret, now)).toThrow('INVALID_SIGNATURE');
    });
});
