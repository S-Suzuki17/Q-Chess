# Dormant product accounting integration

This checkpoint extends public base `8442c610909c0758b4f56f96cb48b9ac2a1c037b`.
It combines hint-origin consumption, shared online/ranked entry accounting and
Crown first-attempt authorization. All source release gates remain closed; no
provider, hosted database, price binding or production deployment is changed.

## Resulting boundaries

- CPU practice hints preserve free, eligible legacy, earned subscription and
  purchased balances separately. One immutable receipt per session/revision
  prevents duplicate spending; confirmed operations repair restores its exact
  origin once. Numeric overflow preserves repair eligibility. RPC dispatch is
  the noncancelable purchase boundary: a lost/canceled response can recover the
  committed receipt, not automatically reverse an uncertain success
- Shared online/ranked admission counts three starts per UTC day, requires
  explicit ticket or verified-ad consent thereafter, and atomically handles
  both participants. Queues and prestart cancellation retain their assets;
  canonical new paid plans have unlimited entry and suppress ads. Completed
  online matches cannot later be refunded by abandoned-lease recovery
- Crown uses a durable account/stable-key authorization and the shared trusted
  ad ledger. New unlock/spend requires canonical current ticket terms; existing
  no-charge retry rights retain identity/restriction/deletion checks without
  unrelated ticket re-consent. No terms version changes. Rank mapping remains
  unselected, and provider completion remains unavailable
- Browser choices are scoped to their match/socket lifecycle. Replacement,
  cancellation and stale callbacks cannot inherit another match's pending state
  or emit consent automatically. Provider preparation rechecks current identity
  and paid/unknown entitlement after asynchronous setup

Existing legacy billing and the original default-off game path remain intact.
The coarse existing CPU receipt pool is compatible; a separate immutable origin
allocation carries the exact new source. The original broad legacy membership
contract is not migrated to unlimited or globally ad-free benefits; its existing
Crown exemption is preserved locally.

## Combined verification

- Full default Vitest inventory: **193 files / 2,030 tests passed**, zero skips or
  todo, with the repository completeness checker. Existing timeouts/assertions
  were retained. The first aggregate had 36 startup failures from an older
  socket fixture missing the new HTTP router stub; the fixture was corrected,
  real mounted-HTTP coverage retained, and the complete rerun passed
- Root typecheck, server build and frontend production build passed
- Real PostgreSQL 17.6/pgcrypto, fresh isolated TCP-loopback clusters, public
  source only: **154 scenarios passed** across auth/runtime 45, commerce 35,
  hints 30, shared admission 27 and Crown 17
- Every native suite applied the same **22 historical dependencies + all nine
  pending raw migrations**. The 43-file all-history diagnostic still detects
  the documented duplicate historical settlement; it does not claim a fresh
  install succeeds. No applied historical migration was rewritten
- Cross-domain tests use actual legacy-ranked, shared-ranked and shared-online
  admission RPCs against hint spending in both lock orders. They prove waiting
  backends, no hint debit after admission, exactly one earlier hint debit, and
  restored eligibility after authoritative prestart void
- Independent reviews closed the discovered malformed-packet, entitlement
  transport, ad-setup, new-grant consent, UTC rollover and stale UI cases
- Actual Crown router mounting is tested on loopback HTTP with its release gate
  closed. Crown and match-choice browser fixtures compile; local Chromium
  interactions remain unavailable because of the executor's OS socket limit

The [source manifest](product-accounting-integration-20261006.json) records the
raw migration hashes, exact inventory and native counts. Native runtime proof
uses the SQL bridge and real loopback sockets, not hosted PostgREST or providers.
GitHub Actions must run the full aggregate/builds and actual restoration,
commerce, Crown and explicit-choice browser checks plus all five native suites
on the published head. No remote CI or browser pass is claimed by local results.

## Release holds

No web rewarded-ad provider approval or independently verified web completion is
established. New ad-dependent limits remain off and public play is not blocked
behind an unavailable ad. Crown stage-versus-strength mapping must be decided;
neither candidate mapping is selected. Current terms and any production rollout
need coordinated review. No credential or persistent-access changes are made.

New-SKU sales/fulfillment activation still requires genuine provider/sandbox,
risk/refund and tax/terms evidence. The reserved long-game durable-session
continuity decision is unchanged. Android remains consumption-only; this is not
physical-device or Play release evidence. No new QUBE diary entry or external
social posting is added by this integration.
