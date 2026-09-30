/** Optional, anonymous Web engagement counts. No account or device identifier is sent. */
import { gameServerUrl } from './rankedSession';

export type EngagementEvent =
    | 'first_visit'
    | 'tutorial_started'
    | 'tutorial_completed'
    | 'first_match_started'
    | 'first_match_completed'
    | 'second_match_started'
    | 'next_day_return';

type PendingEvent = { eventId: string; eventType: EngagementEvent; cohortDay: string };
type MetricState = {
    cohortDay: string;
    eventIds: Partial<Record<EngagementEvent, string>>;
    pending: PendingEvent[];
};

const CONSENT_KEY = 'qg_optional_metrics_consent_v1';
const STATE_KEY = 'qg_optional_metrics_state_v1';
const REVOKED_SESSION_KEY = 'qg_optional_metrics_revoked_session_v1';
export const METRICS_CONSENT_EVENT = 'qg-optional-metrics-consent';
const METRIC_EVENTS: EngagementEvent[] = [
    'first_visit', 'tutorial_started', 'tutorial_completed',
    'first_match_started', 'first_match_completed',
    'second_match_started', 'next_day_return',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let flushPromise: Promise<void> | undefined;
let activeRequest: AbortController | undefined;
let revokedThisSession = false;

const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);
const daysSince = (day: string) => Math.floor((Date.parse(`${utcDay()}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);

export function optionalMetricsAvailable(): boolean {
    if (process.env.NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED !== 'true' ||
        process.env.NEXT_PUBLIC_APP_TARGET === 'android' || typeof window === 'undefined') return false;
    const origin = window.location?.origin;
    const production = origin === 'https://q-gambit.com' || origin === 'https://www.q-gambit.com';
    const development = process.env.NODE_ENV !== 'production' && origin === 'http://localhost:3000';
    if (!production && !development) return false;
    const native = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
        .Capacitor?.isNativePlatform?.() ?? false;
    return !native;
}

export function metricsConsentGranted(): boolean {
    if (revokedThisSession || !optionalMetricsAvailable()) return false;
    try {
        return sessionStorage.getItem(REVOKED_SESSION_KEY) === null &&
            localStorage.getItem(CONSENT_KEY) === 'yes';
    } catch { return false; }
}

export function metricsWithdrawalIncomplete(): boolean {
    try { return sessionStorage.getItem(REVOKED_SESSION_KEY) === 'incomplete'; }
    catch { return false; }
}

function readState(): MetricState | null {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as MetricState;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value?.cohortDay) || !value?.eventIds ||
            !Array.isArray(value.pending) || value.pending.length > METRIC_EVENTS.length) return null;
        if (Object.entries(value.eventIds).some(([type, id]) => !METRIC_EVENTS.includes(type as EngagementEvent) ||
            typeof id !== 'string' || !UUID.test(id))) return null;
        if (value.pending.some(event => !METRIC_EVENTS.includes(event.eventType) ||
            !UUID.test(event.eventId) || event.cohortDay !== value.cohortDay ||
            value.eventIds[event.eventType] !== event.eventId)) return null;
        return value;
    } catch { return null; }
}

function writeState(state: MetricState): boolean {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

function queue(state: MetricState, eventType: EngagementEvent): boolean {
    if (state.eventIds[eventType] || !globalThis.crypto?.randomUUID) return false;
    const eventId = crypto.randomUUID();
    state.eventIds[eventType] = eventId;
    state.pending.push({ eventId, eventType, cohortDay: state.cohortDay });
    if (!writeState(state)) return false;
    void flushPending();
    return true;
}

/** Events older than the seven-day onboarding window are never queued. */
function withinOnboarding(state: MetricState): boolean {
    const age = daysSince(state.cohortDay);
    return age >= 0 && age <= 7;
}

export function recordVisit(): void {
    if (!metricsConsentGranted()) return;
    let state = readState();
    if (!state) {
        state = { cohortDay: utcDay(), eventIds: {}, pending: [] };
        queue(state, 'first_visit');
    }
    if (daysSince(state.cohortDay) === 1) queue(state, 'next_day_return');
    void flushPending();
}

/** The returned kind stays in the game component only; it is never submitted. */
export function recordMatchStarted(): 'first' | 'second' | null {
    if (!metricsConsentGranted()) return null;
    recordVisit();
    const state = readState();
    if (!state || !withinOnboarding(state)) return null;
    if (!state.eventIds.first_match_started) return queue(state, 'first_match_started') ? 'first' : null;
    if (state.eventIds.first_match_completed && !state.eventIds.second_match_started) {
        return queue(state, 'second_match_started') ? 'second' : null;
    }
    return null;
}

export function recordTutorialStarted(): void {
    if (!metricsConsentGranted()) return;
    recordVisit();
    const state = readState();
    if (state && withinOnboarding(state)) queue(state, 'tutorial_started');
}

export function recordTutorialCompleted(): void {
    if (!metricsConsentGranted()) return;
    const state = readState();
    if (state && withinOnboarding(state) && state.eventIds.tutorial_started) {
        queue(state, 'tutorial_completed');
    }
}

export function recordMatchCompleted(startedKind: 'first' | 'second' | null): void {
    if (startedKind !== 'first' || !metricsConsentGranted()) return;
    const state = readState();
    if (state && withinOnboarding(state) && state.eventIds.first_match_started) {
        queue(state, 'first_match_completed');
    }
}

/** False means the browser could not persist or fully clear the choice. */
export function setMetricsConsent(granted: boolean): boolean {
    if (!optionalMetricsAvailable()) return false;
    if (granted) {
        try {
            localStorage.setItem(CONSENT_KEY, 'yes');
            sessionStorage.removeItem(REVOKED_SESSION_KEY);
        } catch { return false; }
        revokedThisSession = false;
        recordVisit();
    } else {
        revokedThisSession = true;
        activeRequest?.abort();
        // The session marker survives a reload even if localStorage deletion fails.
        try { sessionStorage.setItem(REVOKED_SESSION_KEY, 'yes'); } catch { /* Keep the in-memory block. */ }
        // Writing "no" before removal also protects a later browser session when
        // removeItem fails but setItem still works.
        try { localStorage.setItem(CONSENT_KEY, 'no'); } catch { /* Try removal anyway. */ }
        let cleared = false;
        try {
            localStorage.removeItem(STATE_KEY);
            localStorage.removeItem(CONSENT_KEY);
            cleared = localStorage.getItem(STATE_KEY) === null && localStorage.getItem(CONSENT_KEY) === null;
        } catch { /* The UI must report incomplete withdrawal. */ }
        if (!cleared) {
            try { sessionStorage.setItem(REVOKED_SESSION_KEY, 'incomplete'); } catch { /* The in-memory block still applies. */ }
        }
        window.dispatchEvent(new Event(METRICS_CONSENT_EVENT));
        return cleared;
    }
    window.dispatchEvent(new Event(METRICS_CONSENT_EVENT));
    return metricsConsentGranted();
}

/** Retry only previously consented events, using their original per-event ID. */
export function flushPending(): Promise<void> {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
        while (metricsConsentGranted()) {
            const state = readState();
            if (state && daysSince(state.cohortDay) > 89) {
                state.pending = [];
                writeState(state);
                break;
            }
            const event = state?.pending[0];
            if (!event) break;
            let endpoint: URL;
            try {
                endpoint = new URL('/metrics/engagement', gameServerUrl());
                if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) break;
            } catch { break; }
            const request = new AbortController();
            activeRequest = request;
            try {
                const response = await fetch(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(event), credentials: 'omit', cache: 'no-store',
                    redirect: 'error', referrerPolicy: 'no-referrer', signal: request.signal,
                });
                if (!response.ok) break;
                if (!metricsConsentGranted()) break;
                const state = readState();
                if (!state) break;
                state.pending = state.pending.filter(item => item.eventId !== event.eventId);
                if (!writeState(state)) break;
            } catch { break; }
            finally { if (activeRequest === request) activeRequest = undefined; }
        }
    })().finally(() => { flushPromise = undefined; });
    return flushPromise;
}
