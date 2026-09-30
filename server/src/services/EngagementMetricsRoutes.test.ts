import express from 'express';
import http, { type Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngagementMetricsRouter } from './EngagementMetricsRoutes';

const event = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'first_visit',
    cohortDay: '2026-09-30',
};

describe('engagement metrics receiver', () => {
    let server: Server;
    let base: string;
    let record: ReturnType<typeof vi.fn>;
    let enabled = true;
    beforeEach(async () => {
        record = vi.fn().mockResolvedValue(undefined);
        enabled = true;
        const app = express();
        app.use(createEngagementMetricsRouter({ record }, () => enabled, () => Date.parse('2026-09-30T12:00:00Z')));
        server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    });
    afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
    const submit = (base: string, body: unknown, origin = 'https://q-gambit.com', headers: Record<string, string> = {}) =>
        fetch(`${base}/metrics/engagement`, {
            method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
        });

    it('accepts only the three anonymous event fields from the production origin', async () => {
        const response = await submit(base, event);
        expect(response.status).toBe(202);
        expect(response.headers.get('access-control-allow-origin')).toBe('https://q-gambit.com');
        expect(record).toHaveBeenCalledExactlyOnceWith(event);
        expect(Object.keys(record.mock.calls[0][0]).sort()).toEqual(['cohortDay', 'eventId', 'eventType']);
    });

    it('rejects untrusted origins, extra fields, auth headers, and invalid dates', async () => {
        expect((await submit(base, event, 'https://example.com')).status).toBe(403);
        expect((await submit(base, { ...event, accountId: 'x' })).status).toBe(400);
        expect((await submit(base, event, 'https://q-gambit.com', { Authorization: 'Bearer private' })).status).toBe(400);
        expect((await submit(base, { ...event, cohortDay: '2026-07-01' })).status).toBe(400);
        expect((await submit(base, { ...event, cohortDay: '2026-10-01' })).status).toBe(400);
        expect((await submit(base, { ...event, eventType: 'next_day_return' })).status).toBe(400);
        expect((await submit(base, { ...event, cohortDay: '2026-09-31' })).status).toBe(400);
        expect(record).not.toHaveBeenCalled();
    });

    it('stays off without the server release flag', async () => {
        enabled = false;
        expect((await submit(base, event)).status).toBe(503);
        expect(record).not.toHaveBeenCalled();
    });

    it('accepts tutorial milestones but rejects unknown event names', async () => {
        expect((await submit(base, { ...event, eventType: 'tutorial_started' })).status).toBe(202);
        expect((await submit(base, { ...event, eventType: 'tutorial_completed' })).status).toBe(202);
        expect((await submit(base, { ...event, eventType: 'page_view' })).status).toBe(400);
        expect(record).toHaveBeenCalledTimes(2);
    });

    it('bounds payload size and requests per minute before touching storage', async () => {
        expect((await submit(base, { ...event, extra: 'x'.repeat(300) })).status).toBe(400);
        const responses = await Promise.all(Array.from({ length: 120 }, () => submit(base, event)));
        expect(responses.some(response => response.status === 429)).toBe(true);
        expect(record.mock.calls.length).toBeLessThanOrEqual(119);
    });
});
