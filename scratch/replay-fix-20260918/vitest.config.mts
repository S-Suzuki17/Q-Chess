import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: { environment: 'node', include: ['scratch/replay-fix-20260918/replay-baseline.test.ts'] }
});
