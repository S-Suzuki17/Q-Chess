import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { emptyCampaign } from '../config/campaign';
import { battleMusicTitle } from '../config/circuitMusic';
import { LANGUAGES } from '../locales/dict';
import { cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { campaignText, rewardName } from '../locales/campaignText';
import { LobbyShowcase } from './LobbyShowcase';

vi.mock('../lib/dailyLoginRewards', () => ({ DAILY_LOGIN_REWARDS_ENABLED: false }));
vi.mock('../lib/stripeMembership', () => ({ MEMBER_TICKET_USAGE_ENABLED: false }));

describe('reference lobby showcase', () => {
    const user = { id: 'local-fixture', name: 'Local fixture', type: 'registered' as const };
    it('reflects selected materials without altering acquisition or equipping them', () => {
        const progress = { ...emptyCampaign(), board: 'walnut' as const, piece: 'boxwood' as const };
        const original = JSON.stringify(progress), onPreview = vi.fn();
        const html = renderToStaticMarkup(createElement(LobbyShowcase, { user, lang: 'ja', progress, onPreview, onSettings: vi.fn() }));
        expect(html).toContain('data-reward-id="walnut"');
        expect(html).toContain('data-reward-id="boxwood"');
        expect(html).toContain(rewardName('ja', 'walnut'));
        expect(html).toContain(cosmeticsSettingsText('ja', 'acquired'));
        expect(html.match(/data-light=/g)).toHaveLength(64);
        expect(html).not.toContain('<select');
        expect(JSON.stringify(progress)).toBe(original);
        expect(onPreview).not.toHaveBeenCalled();
    });
    it('labels an unearned music preview and never fabricates balances while gates are off', () => {
        const html = renderToStaticMarkup(createElement(LobbyShowcase, { user, lang: 'ja', progress: emptyCampaign(), onPreview: vi.fn(), onSettings: vi.fn() }));
        expect(html).toContain('data-lobby-music="midnight"');
        expect(html).toContain(battleMusicTitle('midnight'));
        expect(html).toContain(cosmeticsSettingsText('ja', 'notAcquired'));
        expect(html).toContain(campaignText('ja', 'locked'));
        expect(html).not.toContain('rankBalance');
        expect(html).not.toContain('<audio');
        expect(html.match(/data-lobby-music=/g)).toHaveLength(2);
    });
    it('has translated controls for every supported language and no guest wallet', () => {
        for (const { code: lang } of LANGUAGES) {
            const html = renderToStaticMarkup(createElement(LobbyShowcase, { user: { ...user, type: 'guest' }, lang, progress: emptyCampaign(), onPreview: vi.fn(), onSettings: vi.fn() }));
            expect(html).toContain(cosmeticsSettingsText(lang, 'title'));
            expect(html).not.toContain('lobby-wallet');
            expect(html).not.toContain('undefined');
        }
    });
});
