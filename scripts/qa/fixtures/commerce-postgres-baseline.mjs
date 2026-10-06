import {
    combinedHistoricalMigrations, combinedPendingMigrations, sessionBaselineEvidence,
    setupSessionBaseline, applySessionPending,
} from './session-postgres-baseline.mjs';

// The 35 commerce scenarios now exercise the SAME combined public
// baseline and raw six-file upgrade as the durable-session scenarios. Real
// public deletion/recovery/restriction tables and the new session triggers are
// present during billing, rollback and profile erasure. The shared helper
// compares commerce lists against the public TS fixture and asserts every
// discovered pending file before executing all six. No private schema import.
export const historical = combinedHistoricalMigrations;
export const pending = combinedPendingMigrations;
export const baselineEvidence = Object.freeze({
    ...sessionBaselineEvidence,
    source: 'Combined public auth/commerce dependency fixture and raw repository migrations only',
    historical, pending,
    commerceScenariosWithDurableSessionTriggers: true,
});

export async function setupBaseline(client) {
    return setupSessionBaseline(client, 'commerce_upgrade');
}

export async function applyPending(client) {
    return applySessionPending(client);
}
