# Hint policy release

This release changes practice and tutorial QUBE hints to free use. Ranked,
random, private and Crown hints require an explicit one-ticket operation,
including matches where CPU replaces the opponent. QUBE teaches the rules,
tutorial and game explanations. It does not restore the retired post section.

The production baseline is PR19 commit
`93acd813cf723c2b833f74418874f3a88da5966b`, with current terms `2026-10-07.1`
and 46 hosted migration entries. Only the new forward file
`20261008054904_match_hint_tickets_and_free_practice.sql` is pending for this
release. Historical migrations, purchase records and accepted terms remain
unchanged. Current source, current policy and the new consent are `2026-10-08.1`.

## Cutover

1. Verify the integrated branch, native PostgreSQL ledger and HTTP/socket
   runtime, Web types, server build and production-flag Web build. Preserve
   source hashes and failed attempts separately from final evidence. Review
   public guidance against these exact source blobs.
2. Freeze the Pages artifact and manifest; verify its preview. Complete the
   new PR's checks and review for its exact head before requesting landing.
3. Use the existing short-maintenance control to prevent new admissions.
   Inspect paid/recoverable sessions and pending work before cutover. The
   baseline has no complete random/private-match drain inventory; an active
   casual match can be interrupted by the server restart.
4. Apply only the forward migration to Q-Chess project
   `gtxbvbsplfkkjlmnqath`. Record the exact SQL file hash and returned hosted
   migration identifier. Verify terms 8.1, all three new receipt tables,
   clock/buy/read/restore RPCs and browser-role denials through PostgREST.
5. Land the approved exact PR head. Observe the existing Q-Chess Render
   service's main-branch deployment until its commit and readiness agree.
   No environment, Stripe price/SKU, secret or ad-provider change is needed.
   Do not apply all historical SQL or create an extra environment-triggered
   deployment.
6. Upload the same verified Pages artifact to `q-gambit-web` production.
   Check apex and www, current terms, the free-practice and ticket labels,
   QUBE teaching and absence of retired post links. Use only owned temporary
   accounts for production account tests, remove them afterward, and do not
   create a real payment to smoke-test the feature.
7. Reopen admissions only after the database, backend and Web agree. Record
   deployed commit, manifest, Render/Pages IDs and the observed test boundary.

## Recovery and evidence limits

When new hint purchases are disabled, saved receipt GETs remain available.
An unknown purchase result must retain its operation identity until recovery;
do not repeat it with a fresh UUID or automatically refund it. Historical
practice receipts keep their read path, while new paid-practice requests stop.
Do not roll the database back or remove its append-only receipts to revert UI.
If cutover cannot finish, keep new admissions paused and retain existing
receipt processing and billing management while correcting the forward state.

Native payment tests use synthetic provider evidence and disposable PostgreSQL;
browser tests separately use synthetic authentication/socket/receipt boundaries
with the real UI and workers. Production smoke tests cannot establish a real
paid purchase without one. Android distribution and AdSense re-review are
outside this Web deployment. AdSense approval is decided by Google.
