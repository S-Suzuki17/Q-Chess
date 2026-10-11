import { CHAMPIONSHIP_REWARDS, ARCHIVED_REWARDS, type ChampionshipReward } from '../config/championshipRewards';
import { rewardUnlocked, type CampaignProgress } from '../config/campaign';
import { CIRCUIT_MUSIC } from '../config/circuitMusic';
import { FOUNDERS_ITEMS } from '../config/founders';

export const CROWN_CATEGORIES = ['board', 'piece', 'avatar', 'effect', 'music'] as const;
export type CrownCategory = typeof CROWN_CATEGORIES[number];
export type CrownCollectionItem = { id: string; kind: CrownCategory; design?: ChampionshipReward; requiredStars?: number; legacy?: boolean };
const baseItems: CrownCollectionItem[] = [
 ...['standard','walnut','mahogany','marble','slate','obsidian'].map(id => ({ id, kind: 'board' as const })),
 ...['standard','boxwood','ebony','alabaster','bronze','silver','gold','crystal','copper','jade','iceglass','neonglass'].map(id => ({ id, kind: 'piece' as const })),
 { id: 'standard', kind: 'music' },
];

/** A read-only catalogue; authorization always stays in rewardUnlocked. */
export function crownCollectionItems(progress: CampaignProgress, kind: CrownCategory): CrownCollectionItem[] {
 const current = CHAMPIONSHIP_REWARDS.filter(reward => reward.kind === kind).map(design => ({ id: design.id, kind, design }));
 const stars = kind === 'music' ? CIRCUIT_MUSIC.map(track => ({ id: track.id, kind, requiredStars: track.requiredStars })) : [];
 const acquired = [
  ...baseItems,
  ...FOUNDERS_ITEMS,
  ...ARCHIVED_REWARDS.map(design => ({ id: design.id, kind: design.kind, design, legacy: true })),
 ].filter(item => item.kind === kind && rewardUnlocked(progress, item.id));
 return [...new Map([...stars, ...current, ...acquired].map(item => [item.id, item])).values()];
}

/** Fit pages to their actual available space, including translated headers and zoom. */
export function crownPageLayout(width: number, height: number) {
 const columns = width < 340 ? 1 : width < 640 ? 2 : width < 920 ? 3 : 4;
 const rows = height >= 440 ? 2 : 1;
 return { columns, rows, size: columns * rows };
}
export function crownPage<T>(items: readonly T[], requestedPage: number, size: number) {
 const pageCount = Math.max(1, Math.ceil(items.length / Math.max(1, size)));
 const page = Math.max(0, Math.min(pageCount - 1, requestedPage));
 return { page, pageCount, items: items.slice(page * size, (page + 1) * size) };
}

export type CrownFoe = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type CrownEncounter = { stageId: number; foe: CrownFoe; finalBoss: boolean };
/** Presentation only. CPU strength, unlocks and outcomes remain in circuitStages. */
export function crownEncounterForStage(stageId: number): CrownEncounter {
 const bounded=Math.min(100,Math.max(1,Math.trunc(stageId)||1));
 const foe: CrownFoe=bounded===100?'king':(['pawn','knight','bishop','rook','queen'] as const)[Math.min(4,Math.floor((bounded-1)/20))];
 return {stageId:bounded,foe,finalBoss:bounded===100};
}
