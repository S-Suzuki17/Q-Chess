import {
    combinedHistoricalMigrations, combinedPendingMigrations, sessionBaselineEvidence,
    setupSessionBaseline, applySessionPending,
} from './session-postgres-baseline.mjs';

// Historical PR19 commerce scenarios exercise the same combined public
// baseline and raw thirteen-file upgrade as the durable-session scenarios. Real
// public deletion/recovery/restriction tables and the new session triggers are
// present during billing, rollback and profile erasure. The shared helper
// compares commerce lists against the public TS fixture and asserts every
// discovered file against the explicit reviewed inventory before executing the
// PR19 baseline. Match-hint and current compiled HTTP adapter tests separately
// apply the forward policy file; historical SQL-only suites keep all thirteen.
// No private schema import or claim of full hosted-schema equivalence.
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
