import { describe, expect, it } from 'vitest';
import { acquiredCosmetics, chooseCosmetic, cosmeticsLocked, boardTheme, type CosmeticKind } from './cosmeticOptions';
import { emptyCampaign, rewardUnlocked } from '../config/campaign';
import { CHAMPIONSHIP_REWARDS, ARCHIVED_REWARDS } from '../config/championshipRewards';
import { cosmeticsSettingsKeys, cosmeticsSettingsText } from '../locales/cosmeticsSettingsText';
import { stageText } from '../locales/stageText';
import { LANGUAGES } from '../locales/dict';
import { battleMusicUrl, type MusicReward } from '../config/circuitMusic';

describe('Settings-only acquired cosmetics', () => {
    const kinds: CosmeticKind[] = ['board', 'piece', 'effect', 'avatar', 'music'];
    it('never offers locked or duplicate rewards for any progression level', () => {
        for (const wins of [0, 1, 6, 25, 94, 95, 98, 99, 100]) {
            const progress = { ...emptyCampaign(), stageStars: Array(wins).fill(1) };
            for (const kind of kinds) {
                const values = acquiredCosmetics(progress, kind);
                expect(new Set(values).size).toBe(values.length);
                expect(values.every(value => rewardUnlocked(progress, value))).toBe(true);
                expect(values).toContain('standard');
            }
        }
    });
    it('retains old collections and paired glass rewards after acquisition', () => {
        const legacyStars = { nox: 1, ember: 1, oracle: 1, sovereign: 1 };
        const progress = { ...emptyCampaign(), stageStars: Array(100).fill(1), stars: legacyStars, ascensions: Array(100).fill(legacyStars) };
        for (const reward of [...CHAMPIONSHIP_REWARDS, ...ARCHIVED_REWARDS]) {
            const options=acquiredCosmetics(progress,reward.kind);
            if (reward.kind==='music') expect(options.map(id=>battleMusicUrl(id as MusicReward))).toContain(reward.url);
            else expect(options).toContain(reward.id);
        }
        expect(acquiredCosmetics(progress, 'piece')).toEqual(expect.arrayContaining(['iceglass', 'neonglass']));
    });
    it('lists each recording once while retaining the selected legacy reward',()=>{
        const progress={...emptyCampaign(),stageStars:Array(100).fill(1),music:'champion-music-037' as MusicReward};
        const options=acquiredCosmetics(progress,'music');
        expect(options).toHaveLength(4);
        expect(options).toContain(progress.music);
        expect(new Set(options.map(id=>battleMusicUrl(id as MusicReward))).size).toBe(4);
        expect(parseInt(progress.music.slice(-3),10)).toBeLessThanOrEqual(progress.stageStars.length);
        expect(chooseCosmetic(progress,'music',progress.music,false).music).toBe(progress.music);
    });
    it('rejects every selection while a match is locked and rejects spoofed/locked IDs', () => {
        const progress = emptyCampaign();
        for (const kind of kinds) expect(chooseCosmetic(progress, kind, 'standard', true)).toBe(progress);
        expect(chooseCosmetic(progress, 'board', 'theme:neon', true)).toBe(progress);
        expect(chooseCosmetic(progress, 'avatar', 'avatar-frame-15', false)).toBe(progress);
        expect(chooseCosmetic(progress, 'board', 'unknown', false)).toBe(progress);
    });
    it('keeps all original themes available and does not change 2D/3D preferences', () => {
        for (const theme of ['classic', 'marble', 'neon']) {
            expect(boardTheme(theme)).toBe(theme);
            expect(chooseCosmetic(emptyCampaign(), 'board', `theme:${theme}`, false).board).toBe('standard');
        }
        expect(boardTheme('bad')).toBe('classic');
    });
    it('locks CPU/online and an active Circuit without blocking the Circuit selection screen', () => {
        expect(cosmeticsLocked('playing', false)).toBe(true);
        expect(cosmeticsLocked('campaign', true)).toBe(true);
        expect(cosmeticsLocked('campaign', false)).toBe(false);
        expect(cosmeticsLocked('level_select', true)).toBe(false);
        expect(cosmeticsLocked('replay', false)).toBe(false);
    });
    it('provides all Settings statuses and the 40-own-moves rule in every supported language', () => {
        for (const { code } of LANGUAGES) {
            for (const key of cosmeticsSettingsKeys) expect(cosmeticsSettingsText(code, key)).toBeTruthy();
            expect(stageText(code, 'quickMoves')).toContain('40');
            expect(stageText(code, 'ownMoves')).toBeTruthy();
        }
    });
});
