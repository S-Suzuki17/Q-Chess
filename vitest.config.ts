import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts', 'server/src/game/checkmate.test.ts', 'server/src/game/intro.test.ts', 'server/src/game/RankCpuSearch.test.ts', 'server/src/game/promotion.test.ts', 'server/src/game/rankedRuntime.test.ts', 'server/src/services/ratings.test.ts', 'server/src/services/RankedAuth.test.ts', 'server/src/services/rankedGateway.test.ts', 'server/src/matchmaking/ranked.test.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
