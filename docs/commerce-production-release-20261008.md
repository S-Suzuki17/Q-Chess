# Web and commerce release sequence

One operator owns deployment. Record the commit, artifact manifest, hosted
migration mapping, backend deployment ID and Pages IDs. Source activation,
local fixtures and a Git push do not prove a hosted deployment changed.

1. Validate integrated source and provider evidence. Build Web with
   `scripts/release/build-android-web.cjs <configured-project> web` and all eight
   documented public release switches true. Check commerce with `--sales=on`,
   lobby with `--release-flags=on`, public guides and Pages guards. Android is
   a separate release. Prepare a preview of the exact manifest.
2. Complete current-head CI/review before landing. Announce short maintenance
   and stop new entries before database/backend cutover. Recheck persisted paid
   admissions and recoverable CPU sessions. The old server has no complete
   random/private-match drain inventory: casual games can be interrupted and
   users may need to sign in again. Do not promise zero downtime or zero loss.
3. Apply only these selected pending files in order to the verified existing
   schema. Record each exact file SHA and API-generated migration version/name.
   Never replay the whole historical directory or edit applied history.

```
20261004040000_monetization_update.sql
20261004050000_hint_tickets_store.sql
20261006000000_pricing_v2.sql
20261006142305_dormant_durable_legacy_sessions.sql
20261006154443_dormant_legacy_session_runtime.sql
20261006155010_atomic_commerce_fulfillment.sql
20261006171022_dormant_hint_origin_consumption.sql
20261006171148_shared_match_admission.sql
20261006172232_dormant_crown_first_attempt.sql
20261006192347_durable_commerce_checkout_consent.sql
20261007105937_dormant_commerce_source_ledger.sql
20261007124401_commerce_terms_release_20261007.sql
20261007141624_dormant_commerce_checkout_retirement.sql
```

4. Insert the eight reviewed live bindings with exact catalog assertions and
   conflict detection. Verify current terms `2026-10-07.1`, RPC signatures,
   invoker/search-path/ACL properties and final PostgREST schema visibility.
   SQL success alone does not prove the HTTP schema cache is ready.
5. Merge Render environment updates with `replace:false`; enable shared-match
   entitlement, admission and recovery together. Keep `LEGACY_SESSION_MODE`
   unset or `memory` and unverified ad-provider gates off. Retain existing
   secrets and processing/Portal settings without printing the full environment.
   The environment API does not deploy; let the verified main commit trigger
   one deployment and confirm its exact commit and startup readiness.
6. Publish the verified Pages manifest to `q-gambit-web` only when the backend
   is ready. The new frontend requires the new session-status route. Check apex
   and www, responsive lobby/guides, absence of retired post links, sign-in and
   current consent, billing readiness, entitlement and disconnect/recovery.
   Do not create a live charge for a smoke test. Reopen maintenance after both
   sides agree, and record remaining limitations explicitly.

New sales require the released source gates, shared entitlement/admission
environment flags, version 1 of both admission and retirement protocols, and
exact prices/Portal readiness. Missing or mismatched prerequisites close sales.
When sales pause, keep receipt processing, Portal, retirement, earned-stock
consumption, paid entitlement and recovery available.

Pending unpaid Checkouts must actually expire before deletion. Paid but
unfulfilled or processing payments keep deletion pending; do not invent a
refund, grant or forfeiture. Never change sandbox stock into live stock or
relax signed-event age, reconciliation leases or admission guards.

Local proof combines genuine sandbox provider evidence with native PostgreSQL
live-only consumption/restoration/contention. Final raw-13 HTTP checks execute
compiled SupabaseService factories through supabase-js and PostgREST 16.4 to
PostgreSQL 17, including terms, protocols, role denial and retirement. They do
not substitute for hosted Auth/Storage and deployed-commit verification.
