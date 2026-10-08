/** Unlocks add intentional silhouette detail and rhythm within a fixed accent budget.
 * Reward ownership, identifiers, unlocks and the three-second duration are untouched.
 */
export function victoryIntensity(reward: { requiredWins: number }, compact = false) {
    const stage = Math.max(1, Math.min(100, Number.isFinite(reward.requiredWins) ? reward.requiredWins : 1));
    const progress = (stage - 1) / 99;
    const grade = Math.min(5, Math.floor((stage - 1) / 20) + 1);
    return {
        stage, grade, progress,
        // Total allocated accents (including chips and trails) never exceed 64 / 120.
        ornamentCount: Math.round((compact ? 18 : 36) + progress * (compact ? 26 : 48)),
        chipCount: Math.round((compact ? 8 : 16) + progress * 4),
        trailCount: grade === 1 ? 0 : Math.round(progress * (compact ? 8 : 16)),
        bursts: grade,
        reach: .65 + progress * .55,
        scale: .72 + progress * .28,
        foreground: progress * .08,
        light: .08 + progress * .12,
    };
}
export type VictoryIntensity = ReturnType<typeof victoryIntensity>;
