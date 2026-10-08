/** Approved policy: one authorization per CPU strength, shared across clock modes.
 * Provider verification remains a separate, closed release gate. */
export type CrownRankMapping = 'stage_v1' | 'strength_v1';
export const CROWN_RANK_MAPPING: CrownRankMapping | null = 'strength_v1';
export const CROWN_VERIFIED_PROVIDER_READY = false;
export const crownAdmissionEnabled = () => CROWN_RANK_MAPPING !== null && CROWN_VERIFIED_PROVIDER_READY;
export function crownRankKey(stageId: unknown, mapping: CrownRankMapping | null = CROWN_RANK_MAPPING): string | null {
    if (!Number.isInteger(stageId) || (stageId as number) < 1 || (stageId as number) > 100) return null;
    if (mapping === 'stage_v1') return `crown:stage:v1:${stageId}`;
    if (mapping === 'strength_v1') return `crown:strength:v1:${Math.floor(((stageId as number) - 1) / 3) + 1}`;
    return null;
}
