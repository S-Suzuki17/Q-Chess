import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { emptyCampaign } from '../config/campaign';
import { CosmeticsSettings } from './CosmeticsSettings';
import { ChampionshipCollection } from './ChampionshipCollection';
import { RewardPreview } from './RewardPreview';
import { CampaignMode } from './CampaignMode';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../hooks/useCircuitAccess', () => ({ useCircuitAccess: () => ({ allowed: true, revision: 1 }) }));
vi.mock('../hooks/useCampaignProgress', async () => {
    const { emptyCampaign } = await import('../config/campaign');
    return { useCampaignProgress: () => ({ progress: { ...emptyCampaign(), stageStars: [1, 1] }, loaded: true, storageError: false, update: mocks.update }) };
});
vi.mock('./LocalGameBoard', () => ({ default: () => null }));
vi.mock('./Board3D', () => ({ Board3D: () => React.createElement('div', { 'data-board-preview': true }) }));
vi.mock('./AccountAvatar', () => ({ AccountAvatar: () => React.createElement('div') }));
vi.mock('./VictoryCelebration', () => ({ VictoryCelebration: () => null }));
vi.mock('./RewardArtwork', () => ({ RewardSigil: () => null, BoardRewardArtwork: () => null, PieceRewardArtwork: () => null, EffectRewardArtwork: () => null, MusicRewardArtwork: () => null }));

it('renders only acquired selections with localized human names in Settings', () => {
    const html = renderToStaticMarkup(React.createElement(CosmeticsSettings, { lang: 'ja', progress: emptyCampaign(), loaded: true, locked: false, update: vi.fn() }));
    expect((html.match(/data-cosmetic-kind=/g) ?? [])).toHaveLength(5);
    expect(html).toContain('クラシック'); expect(html).toContain('ウォールナット');
    expect(html).not.toContain('avatar-frame-15'); expect(html).not.toContain('Champ Board');
});
it('renders no cosmetic inputs while a match is active', () => {
    const html = renderToStaticMarkup(React.createElement(CosmeticsSettings, { lang: 'ja', progress: emptyCampaign(), loaded: true, locked: true, update: vi.fn() }));
    expect(html).toContain('cosmetics-match-locked');
    expect(html).not.toContain('<select'); expect(html).not.toContain('<button');
});
it('treats earned but unselected rewards as acquired and exposes previews, not selection', () => {
    const onEquip = vi.fn();
    const html = renderToStaticMarkup(React.createElement(ChampionshipCollection, { lang: 'ja', progress: { ...emptyCampaign(), stageStars: [1, 1] }, onEquip }));
    expect(html).toContain('data-acquired="true"'); expect(html).toContain('獲得済み');
    expect(html).toContain('data-preview-reward');
    expect(html).not.toContain('data-equip-reward'); expect(html).not.toContain('装備');
    expect(onEquip).not.toHaveBeenCalled();
});
it('previews locked decorations without a hidden equip action or progress writes', () => {
    const onEquip = vi.fn();
    const html = renderToStaticMarkup(React.createElement(RewardPreview, { lang: 'ja', progress: emptyCampaign(), reward: { kind: 'piece', id: 'iceglass' }, onClose: vi.fn(), onEquip }));
    expect(html).toContain('未獲得'); expect(html).toContain('data-board-preview');
    expect(html).not.toContain('preview-equip'); expect(html).not.toContain('装備');
    expect(onEquip).not.toHaveBeenCalled();
});
it('Circuit collection offers no cosmetic mutation and explains the 40-own-move star', () => {
    mocks.update.mockClear();
    const html = renderToStaticMarkup(React.createElement(CampaignMode, { lang: 'ja', user: { id: 'member', name: 'Player', type: 'registered' }, onBack: vi.fn(), onLogin: vi.fn() }));
    expect(html).toContain('自分の着手40手以内で勝利');
    expect(html).not.toContain('装備'); expect(html).not.toContain('data-equipment=');
    expect(html).not.toContain('data-equip-reward'); expect(html).not.toContain('data-music=');
    expect(mocks.update).not.toHaveBeenCalled();
});
