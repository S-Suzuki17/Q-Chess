import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['scratch/realtime-fix/src/**/*.test.ts'] } });
