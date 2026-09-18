import { ARCHIVED_REWARDS, CHAMPIONSHIP_REWARDS } from '../config/championshipRewards';
import { AVATAR_FRAMES } from '../config/avatarFrames';
import { CIRCUIT_MUSIC } from '../config/circuitMusic';
import { equipReward, rewardUnlocked, type CampaignProgress } from '../config/campaign';

export type CosmeticKind = 'board' | 'piece' | 'effect' | 'avatar' | 'music';
export type BoardTheme = 'classic' | 'marble' | 'neon';
export const BOARD_THEME_KEY = 'qchess_boardDesign';
export const boardTheme = (value: unknown): BoardTheme => value === 'marble' || value === 'neon' ? value : 'classic';
const originals: Record<CosmeticKind, readonly string[]> = {
    board: ['standard', 'walnut', 'slate', 'obsidian', 'mahogany', 'marble'],
    piece: ['standard', 'boxwood', 'ebony', 'alabaster', 'bronze', 'silver', 'gold', 'crystal', 'copper', 'jade', 'iceglass', 'neonglass'],
    effect: ['standard'], avatar: ['standard', ...AVATAR_FRAMES.map(frame => frame.id)],
    music: ['standard', ...CIRCUIT_MUSIC.map(track => track.id)]
};

/** Current, legacy and paired rewards stay selectable, but locked IDs never enter Settings. */
export function acquiredCosmetics(progress: CampaignProgress, kind: CosmeticKind): string[] {
    return [...new Set([...originals[kind], ...CHAMPIONSHIP_REWARDS.filter(reward => reward.kind === kind).map(reward => reward.id),
        ...ARCHIVED_REWARDS.filter(reward => reward.kind === kind).map(reward => reward.id)])].filter(id => rewardUnlocked(progress, id));
}

export function chooseCosmetic(progress: CampaignProgress, kind: CosmeticKind, value: string, locked: boolean): CampaignProgress {
    if (locked) return progress;
    if (kind === 'board' && ['theme:classic', 'theme:marble', 'theme:neon'].includes(value)) return equipReward(progress, kind, 'standard');
    return acquiredCosmetics(progress, kind).includes(value) ? equipReward(progress, kind, value) : progress;
}

export const cosmeticsLocked = (screen: string, circuitPlaying: boolean) => screen === 'playing' || (screen === 'campaign' && circuitPlaying);
