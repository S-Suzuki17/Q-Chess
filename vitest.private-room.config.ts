import { defineConfig } from 'vitest/config';

// Real loopback HTTP/Socket.IO/engine; identity and persistence use local fixtures.
export default defineConfig({ test: {
    environment: 'node', include: ['server/src/services/privateRoomIntegration.test.ts'],
    maxWorkers: 1, testTimeout: 10000, hookTimeout: 60000,
} });
