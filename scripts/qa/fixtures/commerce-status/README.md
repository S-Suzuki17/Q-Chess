# Commerce status browser verification

This fixture uses the actual `StripeMembershipPanel`, `MemberTicketsPanel`,
`CommerceEntitlements`, circuit-access hook/store, and application styles.
Only platform/transport/consent adapters and Next's Link are stubbed. All accounts
and responses are synthetic; no provider, authentication, SQL, or real balance
changes are performed. Source checkout readiness stays OFF, even while synthetic
surface flags and advertised SKUs exercise closed checkout and Android boundaries.

From the repository root:

```sh
node scripts/qa/commerce-status-browser.mjs --build-only
node scripts/qa/commerce-status-browser.mjs
COMMERCE_STATUS_ARTIFACT_DIR=/tmp/commerce-status-artifacts node scripts/qa/commerce-status-browser.mjs
```

The normal browser command requires Playwright Chromium on an eligible host. It
serves the compiled fixture from memory on loopback, blocks and reports all
off-origin HTTP traffic and WebSockets, and fails on browser runtime errors.
`--build-only` checks compilation without starting a server or browser and is not
an interaction/layout pass. Do not retry launch with sandbox bypass flags.

English and Japanese run at 390×844 and 1280×844 on Web and simulated Android.
Scenarios cover legacy-only, live Standard, live Plus, expired subscription with
retained purchased/earned hints, sandbox stock, and both legacy/new contracts.
Assertions keep prices/expiry rules scoped to the correct contract, retain stock
after subscription end, keep sandbox stock labeled, prohibit Android purchase
surfaces, and verify no automatic checkout or consent. Repeated billing clicks
create one request; account replacement prevents late billing navigation. Optional
screenshots record all states. The parser and financial authority are covered by
separate unit/server tests; this fixture does not verify a real billing provider,
ledger, or full native app.
