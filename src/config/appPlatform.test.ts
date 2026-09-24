import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { platformFeatures, foundersDistributionEnabled } from './appPlatform';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe('shared game / platform-specific services', () => {
    it.each([
        [false, false, false, true, false],
        [true, false, true, false, false],
        [false, true, true, false, true],
        [true, true, true, false, true],
    ])('resolves build=%s native=%s without enabling a browser native plugin', (build, native, android, webContent, nativeServices) => {
        expect(platformFeatures(build, native)).toEqual({ android, webContent, nativeServices });
    });
    it('requires explicit distribution activation', () => {
        for (const value of [undefined, '', 'false', '1']) {
            vi.stubEnv('NEXT_PUBLIC_FOUNDERS_REWARDS_ENABLED', value);
            expect(foundersDistributionEnabled()).toBe(false);
        }
    });
    it.each(['web', 'android'])('does not render Web-only pages into an %s export incorrectly', async target => {
        vi.stubEnv('NEXT_PUBLIC_APP_TARGET', target);
        vi.resetModules();
        const { WebOnlyPage } = await import('../components/WebOnlyPage');
        const html = renderToStaticMarkup(createElement(WebOnlyPage, { path: '/privacy/', children: 'WEB_ONLY_CONTENT' }));
        expect(html.includes('WEB_ONLY_CONTENT')).toBe(target === 'web');
        expect(html.includes('https://q-gambit.com/privacy/')).toBe(target === 'android');
    });
    it('makes the Android release target explicit and all rollout switches fail closed', () => {
        const source = readFileSync('scripts/release/build-android-web.cjs', 'utf8');
        expect(source).toContain("const target=process.argv[3]??'android'");
        expect(source).toContain("if(!['android','web'].includes(target))throw new Error('Invalid build target')");
        expect(source).toContain('NEXT_PUBLIC_APP_TARGET: target');
        for (const flag of ['FOUNDERS_REWARDS_ENABLED', 'ADMOB_LIVE', 'NATIVE_REWARDS_ENABLED', 'NATIVE_INTERSTITIAL_ENABLED']) {
            expect(source).toContain(`NEXT_PUBLIC_${flag}: 'false'`);
        }
    });
});
