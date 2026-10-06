# Shared match choice browser verification

This fixture imports the actual `SharedMatchAdmissionChoice`,
`useSharedMatchChoice`, protocol parser, and application CSS. Vite builds the small
fixture and the runner serves those compiled bytes from memory on loopback. It
does not build the full Next application or write a frontend build cache.

The only transport is an in-memory Socket-shaped event source. All account names,
match IDs and ad grants are synthetic. The browser blocks and reports any HTTP
request outside its fixture origin and any WebSocket attempt. There are no real
accounts, server requests, balance mutations, providers, ads or payments.

## Run

From the repository root, with the existing dependencies installed:

```sh
node scripts/qa/shared-choice-browser.mjs --build-only
node scripts/qa/shared-choice-browser.mjs
SHARED_CHOICE_ARTIFACT_DIR=/tmp/shared-choice-artifacts node scripts/qa/shared-choice-browser.mjs
```

The browser command requires Playwright Chromium installed through the normal
supported Playwright setup. `--build-only` validates compilation only and exits
before starting a server or browser. It must not be reported as an interaction or
layout pass. Do not retry browser launch or change its sandbox flags to bypass an
environment restriction; run the normal browser command in an eligible CI host.

## Coverage

The same scenarios run in English and Japanese at 390×844 and 1280×844:

- An offer or rerender never chooses or spends automatically
- An unavailable ad button is disabled; only a valid server-offered synthetic grant
  enables the explicit ad choice, which sends that exact grant and match
- Repeated DOM clicks emit one consent and show the real pending status
- A new offer during submission does not unlock another click
- A same-match error shows the real alert; retry needs another explicit click
- Cancel clears offer, pending and error, and revokes retained click callbacks
- Cancel followed by a new match on the same mounted hook cannot leave controls
  stuck pending
- Late offers, errors, terminal events, disconnects and click callbacks from the
  previous match cannot erase or unlock the newer pending choice
- Disconnect invalidates the old offer; reconnect alone emits no consent, and a
  fresh offer requires another click
- Replacing the socket (the fixture's account ownership boundary) hides the old
  offer immediately; old same-match callbacks cannot affect the replacement
- Start closes the offer; a late offer cannot reopen it; a null socket hides state
- Real headings, pending/error messages, disabled controls, 44px targets,
  viewport bounds, horizontal overflow and button overlap are checked

Optional screenshots record the offered and error states for all four variants.
The script reports each completed viewport/language variant and fails on a page
error or unexpected external traffic.

The hook unit tests separately reproduce the original stuck-pending and
old-callback bugs, and check StrictMode effect cleanup replay versus unmount.
Browser execution uses Vite's compiled production bundle, so the StrictMode
wrapper alone is not evidence of development-mode effect replay.

## Limits

This is actual choice UI and hook verification inside a controlled host, not the
full `OnlineGameBoard`, authentication, server reconnect, real rewarded-ad
verification or accounting path. Socket replacement simulates the ownership
boundary; it does not perform a real login or logout. It cannot distinguish two
wire replies with identical match IDs on the same socket lifecycle when the wire
protocol carries no request ID. It covers old-match replies and retained
callbacks from a replaced lifecycle. No SQL, server policy or authentication
behavior is changed by this fixture.

The implementation-time environment allowed compilation, type checking and unit
tests but Chromium was unavailable due to a previously verified OS Unix-socket
EPERM restriction. Browser interaction and layout results must come from running
the normal command in CI; none are claimed from `--build-only`.
