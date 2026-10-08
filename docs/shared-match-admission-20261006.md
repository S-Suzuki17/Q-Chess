# Dormant shared online/ranked admission

This slice is prepared for review only. `SHARED_MATCH_ADMISSION_RELEASE_READY`, its recovery source gate and `VERIFIED_MATCH_AD_PROVIDER_RELEASE_READY` are false. Environment variables cannot activate the new quota, ticket-choice flow or an ad requirement. Existing public queue behavior remains on its old path. There is no new production rewarded-ad verifier or callback route, no price binding, payment activation or publication.

## Accounting boundary

Online (`random`) and ranked queues share three started matches per registered account per UTC day. Private rooms and CPU practice do not enter this ledger. A matched pair first connects without an engine. A durable `admit_shared_match` transaction locks the match, owner lease, all human profiles and then all wallets in stable order. It checks restrictions, deletion, current ticket terms and account-busy state, and commits both human allocations together. Non-READ COMMITTED transactions are rejected so a changed connection isolation cannot use a stale quota/busy snapshot after waiting for locks. Ranked CPU fallback has exactly one human allocation.

The committed active admission is the durable start authority. The server rechecks authentication, restrictions, connection, the existing 15-second prestart deadline and its fenced lease before constructing the engine or sending the start. Any failure in that commit-to-activation window uses the existing authoritative void operation; no engine starts, daily usage is excluded and assets are returned through their original source. A timeout or cancellation before any admission creates a tombstone, with no debit or allocation. This also preserves a verified ad earned by a late provider completion for that canceled match.

Duplicate/reconnected starts keep the same match UUID and cannot charge twice. Conflicting metadata, mode or owner is rejected. The existing post-start void and ranked-refund rules remain intact. Random completion now has a durable terminal receipt and retries an uncertain acknowledgement; a settled match cannot later be refunded by abandoned-owner recovery. Random game-history writing retains its existing best-effort behavior after the admission is finalized. Rated settlement and CPU search/timing behavior are preserved.

## Explicit choice and separate sources

After the shared three starts, admission returns `choice_required` before writing an allocation. The UI offers exactly one rank ticket or one already verified rewarded-ad match, and a no-spend cancel action. No consent is issued by a queue request, balance read, offer, rerender or reconnect. A click issues a server-generated opaque nonce bound to account, match and source; SQL consumes it once in the admission transaction. Replayed/mismatched tokens or a source change fail. A short-lived choice nonce is distinct from earned ad credit.

Allocation vocabulary is `daily_quota`, `free_ticket`, `legacy_paid_ticket`, `subscription_unlimited`, and `verified_ad`. Existing free and legacy-member ticket pools and separate uncapped refund credits are reused without adding a stock cap. Hint stock is neither read nor spent. A free ticket refund retains its free origin; a legacy refund retains its original subscription and expiry. Tickets are never selected as a fallback for an unavailable ad.

## Entitlements and ads

`get_shared_match_entitlement` derives Standard/Plus from canonical active live subscription, Checkout, customer and immutable SKU bindings. Same-price, unexpired, unblocked Standard/Plus means unlimited online/ranked and `noAds: true`. Test, expired, canceled, off-price or refund-blocked snapshots do not qualify. Legacy USD 2.99 remains its ticket contract, identified separately as `legacy299`; the existing Campaign-specific legacy exemption is preserved without inventing a global legacy ad-free benefit.

The strict entitlement response is available through an authenticated socket request. The browser stores it only in memory for a bounded period, clears it on identity/disconnection/expiry, and refreshes it through the same authenticated transport. Unknown/stale entitlement suppresses ad requests. Web display eligibility, native rewarded/interstitial calls and their low-level post-await checks use this common result. Existing source/consent/provider gates remain closed. Crown can reuse the same strict entitlement interface and separately preserve its legacy exemption.

`record_verified_rewarded_ad` is a service-only interface downstream of independent provider verification. It stores only a digest and minimal replay/ownership metadata, never raw signatures, credentials or client completion flags. `VerifiedRewardedAdStore` requires an injected signature/receipt verifier; production activation and provider integration are absent. Native tests use explicitly synthetic evidence and the unit test independently checks ephemeral synthetic signatures. H5 `adViewed`, native earned callbacks and elapsed time are insufficient.

Earned grants do not expire. `expires_at` is reserved and constrained to NULL until an explicit policy exists. Grants bind account, purpose and original target. A match canceled/voided under the existing policy can make its unspent match grant available to an explicitly consented replacement match, while keeping signed evidence immutable. Crown grants remain a separate purpose tied to their stable rank and cannot fund matches. Account erasure removes ownership while retaining the minimum provider transaction replay fence.

## Raw migration inventory and verification

The new migration was created by Supabase CLI 2.119.0 `migration new`, after reading its help. The native disposable PostgreSQL 17 fixture applies these raw files, without SQL rewriting or private snapshots:

1. `20261004040000_monetization_update.sql`
2. `20261004050000_hint_tickets_store.sql`
3. `20261006000000_pricing_v2.sql`
4. `20261006142305_dormant_durable_legacy_sessions.sql`
5. `20261006154443_dormant_legacy_session_runtime.sql`
6. `20261006155010_atomic_commerce_fulfillment.sql`
7. `20261006171148_shared_match_admission.sql`

The fixture asserts the complete pending-file list; downstream slices must extend that explicit inventory and count guards. Old applied migration files and old admission/void/hint receipt domains are not rewritten. New tables have RLS, no anonymous/authenticated access, pinned invoker functions and service-only execution.

Native shared-admission coverage: 27 scenarios, actual independent-backend contention, transaction rollback, both-participant atomicity, mixed online/ranked UTC usage, CPU fallback, choice replay/source binding, prestart/tombstone/late-ad cancellation, immutable earned credit, canonical subscriptions and legacy provenance, settlement-versus-void, owner recovery, domain/overflow rejection, erasure and ACLs. Existing native commerce 35 scenarios and auth/runtime 45 scenarios also pass against the same seven-file chain.

Limits: this is an explicit public-baseline upgrade, not hosted-production schema equivalence or an all-files fresh install. The known duplicate historical settlement draft still blocks an all-files fresh install. Native PostgreSQL does not prove Supabase Auth/Storage/PostgREST, provider verification, mobile SDK delivery or real advertising approvals. No production database advisors, provider calls, payments or deployment were run. New limits and provider activation must remain closed pending complete release review, including the combined downstream migration chain and provider-specific verification. Recovery must be released alongside admission and kept enabled during a future new-start rollback.

## Application checks

Server compilation, frontend type checking and the production Web build pass. Focused tests cover the commit-to-engine-activation cancellation/auth/restriction/connection/deadline window, both-human choice, replay/reconnect, repeated clicks, error retry and cancellation, protocol validation, canonical no-ad consumers and synthetic independent signature verification. Default Vitest discovery includes all new server tests. The existing preparation fixture isolates its separately tested shared-choice hook, preserving its own state/recovery assertions. The fresh-history guard explicitly inventories the additional migration while still detecting the pre-existing duplicate draft.

Pixel QA is not claimed: local Chromium could not create its singleton socket in this cloud executor (`Operation not permitted`), including one approved escalated run. Static React markup and hook-flow checks pass; a browser screenshot/layout check remains for the combined review. The preview uses the built application CSS and the real component, without ad SDK/network calls.

## Review correction batch

The authenticated entitlement request uses an explicit empty object on initial connection and the 45-second refresh, matching the packet guard. A real loopback Socket.IO test exercises the actual registered index middleware/handler; client lifecycle tests verify both emissions. Choice sources require a string enum without coercing attacker-supplied objects. Malformed JSON objects, arrays and null values return no choice.

Native ad requests snapshot the initiating account, bind rewarded intent ownership, and recheck eligibility immediately before provider preparation and display. Deferred-listener tests cover an intervening paid, unknown or different-account state with no prepare/show call. Tests use a stub SDK only.

New verified ad grants require the existing canonical ticket terms. Missing consent throws explicit `CURRENT_TICKET_TERMS_REQUIRED`; the server adapter marks this retryable, and no grant or provider replay receipt is written. After consent, the same independently verified completion can be retried. An exact already-recorded owner/purpose/target/evidence receipt remains replayable without new ticket consent or a new ad request; identity, restriction, deletion and erase fences still apply. No terms version or provider activation changed.

While a match is awaiting choice, one coalesced recheck per second lets the database notice a UTC reset. The application host's calendar is not accounting authority. The existing 15-second prestart deadline remains unchanged, and no ticket consent is generated automatically. Unchanged offers are not repeatedly broadcast. Native tests verify the same already-waiting match can use renewed database quota without a ticket debit or consent.

This frozen correction batch passes 91 focused tests, 27 native PostgreSQL scenarios, server compilation, frontend type checking and scoped lint. The parent owns the combined aggregate/nine-migration proof; no full aggregate rerun is claimed for this follow-up alone.
