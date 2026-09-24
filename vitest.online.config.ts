import { defineConfig } from 'vitest/config';

// Run after `npm --prefix server run build` so the production CPU worker is tested.
export default defineConfig({ test: {
    environment: 'node', include: ['server/src/services/onlineIntegration.test.ts'],
    maxWorkers: 1, testTimeout: 10000, hookTimeout: 10000,
} });
