import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: [
    'src/lib/crown*.test.ts', 'server/src/services/Crown*.test.ts',
    'src/components/CampaignResult.test.ts', 'src/lib/__tests__/circuitAccess.test.ts', 'src/components/cosmeticsSettings.test.ts',
] } });
