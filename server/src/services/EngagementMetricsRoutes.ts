import express, { type ErrorRequestHandler } from 'express';
import { ENGAGEMENT_EVENTS, type EngagementMetricsStore, type EngagementSubmission } from './EngagementMetrics';

const WEB_ORIGINS = new Set(['https://q-gambit.com', 'https://www.q-gambit.com']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUESTS_PER_MINUTE = 120;
const MAX_REQUESTS_PER_UTC_DAY = 5000;

function validSubmission(value: unknown, today: string): value is EngagementSubmission {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const data = value as Record<string, unknown>;
    if (Object.keys(data).sort().join(',') !== 'cohortDay,eventId,eventType' ||
        typeof data.eventId !== 'string' || !UUID_V4.test(data.eventId) ||
        typeof data.eventType !== 'string' || !ENGAGEMENT_EVENTS.includes(data.eventType as EngagementSubmission['eventType']) ||
        typeof data.cohortDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.cohortDay)) return false;
    const cohort = Date.parse(`${data.cohortDay}T00:00:00Z`);
    const current = Date.parse(`${today}T00:00:00Z`);
    if (!Number.isFinite(cohort) || new Date(cohort).toISOString().slice(0, 10) !== data.cohortDay) return false;
    const age = Math.floor((current - cohort) / 86400000);
    // Previously queued events may arrive after an offline period. The client
    // decides milestone timing; the receiver bounds the oldest accepted cohort.
    if (age < 0 || age > 89) return false;
    if (data.eventType === 'next_day_return') return age >= 1;
    return true;
}

/** No request body, IP, account token, or browser metadata is retained by this router. */
export function createEngagementMetricsRouter(
    store: EngagementMetricsStore,
    enabled = () => process.env.ENGAGEMENT_METRICS_ENABLED === 'true',
    now = () => Date.now(),
) {
    const router = express.Router();
    let windowEnds = 0;
    let requests = 0;
    let requestDay = '';
    let dailyRequests = 0;
    router.post('/metrics/engagement', (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!enabled()) { res.status(503).json({ code: 'METRICS_DISABLED' }); return; }
        const origin = req.get('origin');
        const local = process.env.NODE_ENV !== 'production' && origin === 'http://localhost:3000';
        if (!origin || (!WEB_ORIGINS.has(origin) && !local)) { res.sendStatus(403); return; }
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Origin', origin);
        if (req.headers.authorization || req.headers.cookie || req.query && Object.keys(req.query).length) {
            res.sendStatus(400); return;
        }
        if (!req.is('application/json')) { res.sendStatus(415); return; }
        const current = now();
        const today = new Date(current).toISOString().slice(0, 10);
        if (today !== requestDay) { requestDay = today; dailyRequests = 0; }
        if (current >= windowEnds) { windowEnds = current + 60000; requests = 0; }
        if (++requests > MAX_REQUESTS_PER_MINUTE || ++dailyRequests > MAX_REQUESTS_PER_UTC_DAY) {
            res.sendStatus(429); return;
        }
        next();
    }, express.json({ limit: '256b', inflate: false, strict: true }), async (req, res) => {
        const today = new Date(now()).toISOString().slice(0, 10);
        if (!validSubmission(req.body, today)) { res.sendStatus(400); return; }
        try { await store.record(req.body); res.sendStatus(202); }
        catch { res.status(503).json({ code: 'METRICS_UNAVAILABLE' }); }
    });
    const jsonError: ErrorRequestHandler = (_error, _req, res, _next) => {
        res.status(400).json({ code: 'INVALID_METRIC_BODY' });
    };
    router.use('/metrics/engagement', jsonError);
    return router;
}
