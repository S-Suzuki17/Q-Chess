/** Unlock difficulty drives spectacle independently of the material family.
 * Keep typography, board propagation and the three-second shot identical.
 */
export function victoryIntensity(reward: { requiredWins: number }, compact = false) {
    const stage = Math.max(1, Math.min(100, Number.isFinite(reward.requiredWins) ? reward.requiredWins : 1));
    const progress = (stage - 1) / 99;
    const grade = Math.min(5, Math.floor((stage - 1) / 20) + 1);
    return {
        stage, grade, progress,
        // Retain a satisfying first reward; late-game richness is added, not faked by stripping it.
        ornamentCount: Math.round((compact ? 72 : 112) + progress * (compact ? 160 : 320)),
        chipCount: Math.round((compact ? 24 : 36) + progress * (compact ? 48 : 76)),
        trailCount: grade === 1 ? 0 : Math.round((compact ? 3 : 5) + progress * (compact ? 15 : 27)),
        bursts: grade,
        reach: .62 + progress * 1.22,
        scale: .72 + progress * .94,
        foreground: progress * .26,
        light: .12 + progress * .25,
    };
}
export type VictoryIntensity = ReturnType<typeof victoryIntensity>;
