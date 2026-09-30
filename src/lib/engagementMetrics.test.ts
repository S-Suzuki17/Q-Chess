import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    flushPending, metricsConsentGranted, recordMatchCompleted, recordMatchStarted,
    recordTutorialCompleted, recordTutorialStarted, recordVisit, setMetricsConsent,
} from './engagementMetrics';

class MemoryStorage {
    private values = new Map<string, string>();
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
}

describe('optional Web engagement measurement', () => {
    let storage: MemoryStorage;
    let send: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
        vi.stubEnv('NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED', 'true');
        vi.stubEnv('NEXT_PUBLIC_APP_TARGET', 'web');
        vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://q-chess.onrender.com');
        storage = new MemoryStorage();
        send = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('sessionStorage', new MemoryStorage());
        vi.stubGlobal('window', { location: { origin: 'https://q-gambit.com' }, Capacitor: { isNativePlatform: () => false }, dispatchEvent: vi.fn() });
        vi.stubGlobal('fetch', send);
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

    it('sends nothing and stores nothing before explicit consent', async () => {
        recordVisit(); recordTutorialStarted(); recordTutorialCompleted(); recordMatchStarted(); recordMatchCompleted('first');
        await flushPending();
        expect(send).not.toHaveBeenCalled();
        expect(storage.getItem('qg_optional_metrics_state_v1')).toBeNull();
    });

    it('does not show or send metrics on the Pages preview origin', async () => {
        vi.stubGlobal('window', { location: { origin: 'https://q-gambit-web.pages.dev' }, Capacitor: { isNativePlatform: () => false }, dispatchEvent: vi.fn() });
        setMetricsConsent(true);
        recordVisit(); recordTutorialStarted(); recordMatchStarted();
        await flushPending();
        expect(metricsConsentGranted()).toBe(false);
        expect(storage.getItem('qg_optional_metrics_consent_v1')).toBeNull();
        expect(send).not.toHaveBeenCalled();
    });

    it('remains inactive when the Web release flag is off', async () => {
        vi.stubEnv('NEXT_PUBLIC_ENGAGEMENT_METRICS_ENABLED', 'false');
        setMetricsConsent(true);
        recordVisit(); recordTutorialStarted(); recordMatchStarted();
        await flushPending();
        expect(metricsConsentGranted()).toBe(false);
        expect(storage.getItem('qg_optional_metrics_consent_v1')).toBeNull();
        expect(send).not.toHaveBeenCalled();
    });

    it('sends only anonymous milestone fields, with no referrer or credentials', async () => {
        setMetricsConsent(true);
        await flushPending();
        recordTutorialStarted(); await flushPending();
        recordTutorialCompleted(); await flushPending();
        const firstMatch = recordMatchStarted(); await flushPending();
        recordMatchCompleted(firstMatch); await flushPending();
        recordMatchStarted(); await flushPending();
        vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
        recordVisit(); await flushPending();
        recordVisit(); recordTutorialStarted(); recordTutorialCompleted(); recordMatchStarted(); await flushPending();

        const calls = send.mock.calls.map(([url, options]) => ({ url: String(url), options: options as RequestInit }));
        expect(calls.map(({ options }) => JSON.parse(String(options.body)).eventType)).toEqual([
            'first_visit', 'tutorial_started', 'tutorial_completed',
            'first_match_started', 'first_match_completed',
            'second_match_started', 'next_day_return',
        ]);
        for (const { url, options } of calls) {
            expect(url).toBe('https://q-chess.onrender.com/metrics/engagement');
            expect(options.referrerPolicy).toBe('no-referrer');
            expect(options.credentials).toBe('omit');
            expect(Object.keys(JSON.parse(String(options.body))).sort()).toEqual(['cohortDay', 'eventId', 'eventType']);
            expect(options.body).not.toMatch(/user|email|account|ip|https?:\/\//i);
            expect(JSON.parse(String(options.body)).cohortDay).toBe('2026-09-30');
        }
    });

    it('removes local state and stops sending after withdrawal', async () => {
        setMetricsConsent(true); await flushPending();
        expect(metricsConsentGranted()).toBe(true);
        setMetricsConsent(false);
        recordVisit(); recordMatchStarted(); await flushPending();
        expect(metricsConsentGranted()).toBe(false);
        expect(storage.getItem('qg_optional_metrics_consent_v1')).toBeNull();
        expect(storage.getItem('qg_optional_metrics_state_v1')).toBeNull();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('does not count completion of a later match as first-match completion', async () => {
        setMetricsConsent(true); await flushPending();
        expect(recordMatchStarted()).toBe('first'); await flushPending();
        const laterMatch = recordMatchStarted();
        expect(laterMatch).toBeNull();
        recordMatchCompleted(laterMatch); await flushPending();
        expect(send.mock.calls.map(([, options]) => JSON.parse(String((options as RequestInit).body)).eventType))
            .toEqual(['first_visit', 'first_match_started']);
    });

    it('keeps withdrawal across reload when removeItem fails but a no choice can be stored', async () => {
        setMetricsConsent(true); await flushPending();
        vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('storage removal failed'); });
        expect(setMetricsConsent(false)).toBe(false);
        expect(storage.getItem('qg_optional_metrics_consent_v1')).toBe('no');
        vi.resetModules();
        const reloaded = await import('./engagementMetrics');
        expect(reloaded.metricsConsentGranted()).toBe(false);
        expect(reloaded.metricsWithdrawalIncomplete()).toBe(true);
        reloaded.recordVisit(); await reloaded.flushPending();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('keeps withdrawal across tab reload with a session block when localStorage writes fail', async () => {
        setMetricsConsent(true); await flushPending();
        vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('storage write failed'); });
        vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('storage removal failed'); });
        expect(setMetricsConsent(false)).toBe(false);
        expect(storage.getItem('qg_optional_metrics_consent_v1')).toBe('yes');
        vi.resetModules();
        const reloaded = await import('./engagementMetrics');
        expect(reloaded.metricsConsentGranted()).toBe(false);
        expect(reloaded.metricsWithdrawalIncomplete()).toBe(true);
        reloaded.recordVisit(); await reloaded.flushPending();
        expect(send).toHaveBeenCalledTimes(1);
    });
});
