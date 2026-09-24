import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdBanner, InterstitialAd } from './AdBanner';

// Markup contract when a future reviewed policy enables display ads.
// publicRelease.test.ts separately tests the real fail-closed release policy.
vi.mock('../lib/webAdPolicy', () => ({ browserCanRequestWebAds: () => true }));

describe('AdBanner markup', () => {
    beforeEach(() => {
        for (const name of ['NEXT_PUBLIC_ADSENSE_CLIENT_ID', 'NEXT_PUBLIC_ADSENSE_CLIENT', 'NEXT_PUBLIC_ADSENSE_PUB_ID', 'NEXT_PUBLIC_ADSENSE_SLOT']) {
            vi.stubEnv(name, undefined);
        }
    });
    afterEach(() => vi.unstubAllEnvs());

    it('does not mount an ad unit for unconfigured or placeholder slots', () => {
        expect(renderToStaticMarkup(createElement(AdBanner))).toBe('');
        expect(renderToStaticMarkup(createElement(AdBanner, { adSlot: 'XXXXXXXXXX' }))).toBe('');
        expect(renderToStaticMarkup(createElement(AdBanner, { adSlot: 'abc' }))).toBe('');
    });

    it('renders one real unit, retaining the existing slot and publisher', () => {
        const html = renderToStaticMarkup(createElement(AdBanner, { adSlot: '8798363654' }));
        expect(html.match(/<ins /g)).toHaveLength(1);
        expect(html).toContain('data-ad-client="ca-pub-1116866075179199"');
        expect(html).toContain('data-ad-slot="8798363654"');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('data-adsbygoogle-status');
    });

    it('uses the same primary publisher environment variable as the root SDK', () => {
        vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT_ID', 'ca-pub-1234567890123456');
        const html = renderToStaticMarkup(createElement(AdBanner, { adSlot: '8798363654' }));
        expect(html).toContain('data-ad-client="ca-pub-1234567890123456"');
    });

    it('never invokes onClose during rendering of an unconfigured interstitial', () => {
        const onClose = vi.fn();
        const html = renderToStaticMarkup(createElement(InterstitialAd, { show: true, adSlot: '8798363654', onClose }));
        expect(html).toBe('');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('keeps closed interstitials unmounted', () => {
        vi.stubEnv('NEXT_PUBLIC_ADSENSE_PUB_ID', 'ca-pub-1116866075179199');
        expect(renderToStaticMarkup(createElement(InterstitialAd, { show: false, adSlot: '8798363654', onClose: vi.fn() }))).toBe('');
    });

    it('does not load advertisements globally on navigation and gameplay screens', () => {
        const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
        expect(layout).not.toContain('<AdSenseLoader');
        expect(layout).not.toContain('enable_page_level_ads');
        expect(layout).not.toContain('adsense-init');
        expect(layout).not.toContain('adsbygoogle.js');
    });
});
