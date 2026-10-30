# Crown CPU selection handoff

The user identified the remaining selection reset in the authenticated 100-Tile Challenge. Its optimistic CPU move path still called `setSelectedTokenId(null)`, before the authoritative acknowledgement. PR #38 had repaired the guest/practice path and the Crown acknowledgement, but its exported-browser test exercised guest practice only.

The Crown optimistic path now uses the same `selectionAfterBoardUpdate` rule. A surviving friendly selection is retained through the CPU move and server acknowledgement/recovery. Own submissions, a captured selection and game end still clear selection. Turn, synchronization, legality, clocks, hints and ticket checks are unchanged. Basic controls remain piece once, then destination once; the ranked and Crown transport paths remain different.

## Evidence

- `node scripts/qa/crown-selection-browser.mjs build/crown-selection-20261030/before --expect-reset`: all eight baseline combinations reproduce the reset (1280px mouse/390px touch, 2D/3D, white/black).
- The same script without `--expect-reset` passes ten candidate scenarios: those eight combinations plus a lost CPU response recovered by GET and a selected piece captured by the CPU.
- A first selection remains h2/h7 before the CPU move, after optimistic display, and after acknowledgement. One h4/h5 destination input then submits exactly one player move. No premature move is submitted during the CPU turn. All scenarios have zero page errors.
- Six relevant Vitest files: 156 cases pass (boardSelection, crownHintRun, crownRunRecovery, localMoveDestinations, MatchLayout and useMoveHint). Typecheck passes.
- The test mounts the actual LocalGameBoard, CrownHintRunClient, engine and 2D/3D components. Account/API replies and CPU delivery timing are synthetic. Styling comes from the existing production export because no CSS changes are involved. No production match, ticket spend, live ad or device test is performed.
- Initial fixture setup hit a Vite load timeout; a later assertion initially confused the last-moved-piece fallback with actual selection. The corrected harness checks the clear-selection control as well as the square. Only the completed before/after runs establish the regression evidence.

## Documentation correction

`docs/cpu-selection-20261030.md` described Crown coverage from the shared helper without exercising the optimistic Crown move path. That statement was too broad; this follow-up records the omitted path and the actual Crown-specific browser evidence. No gameplay instructions need to change: guide piece/destination controls, QUBE hints and clock rules still apply. No QUBE posts are restored.

## Release boundary

This is a shared Web/Android source correction. A new Web publication requires approval for this additional diff. The user has requested the next Android AAB creation/submission and explicitly waived physical-device verification. No paid service, server configuration, database or advertising release gate is changed.
