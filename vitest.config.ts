import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Play proof tests use local mocks only, never real Google credentials.
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts', 'server/src/services/StripeMembership*.test.ts', 'server/src/services/StripeReversal.test.ts', 'server/src/services/StripeCancellation.test.ts', 'server/src/services/DailyLogin*.test.ts', 'server/src/services/TicketSpend*.test.ts', 'server/src/services/TicketFeatureGates.test.ts', 'server/src/services/EngagementMetricsRoutes.test.ts', 'server/src/game/entanglement.test.ts', 'server/src/services/AccountProfile*.test.ts', 'server/src/services/AccountRecovery*.test.ts', 'server/src/services/AccountDeletion*.test.ts', 'server/src/services/Founders*.test.ts', 'server/src/services/PlayRewardVerifier.test.ts', 'server/src/game/checkmate.test.ts', 'server/src/game/intro.test.ts', 'server/src/game/RankCpuSearch.test.ts', 'server/src/game/promotion.test.ts', 'server/src/game/replayHistory.test.ts', 'server/src/game/rankedRuntime.test.ts', 'server/src/services/ratings.test.ts', 'server/src/services/RankedAuth.test.ts', 'server/src/services/rankedGateway.test.ts', 'server/src/services/PrivateGameRecords.test.ts', 'server/src/services/PrivateGameRecordRoutes.test.ts', 'server/src/services/privateHistoryService.test.ts', 'server/src/services/ProfileAvatars.test.ts', 'server/src/services/ProfileAvatarRoutes.test.ts', 'server/src/matchmaking/ranked.test.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
