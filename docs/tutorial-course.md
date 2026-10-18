# QUBE classroom

The Web and Android clients share `InteractiveTutorial`. It teaches small prepared
positions with the same `applyPracticeMove` and candidate solver used by local
play and the authoritative CPU practice service. Lessons do not create a match,
spend a ticket, change a rating, or call match/admission/hint services. Existing
optional start/finish statistics retain their consent and feature gates.

## Curriculum

The ordered definitions live in `src/lib/tutorialCourse.ts`; all 12 languages
have descriptions, titles and controls in `src/locales/tutorialCourseText.ts`.

| Chapter | Lessons | Learning goal |
| --- | --- | --- |
| First moves | 1–3 | Select a piece and destination, Pawn one/two squares, capture, opposite movement directions and alternating turns |
| Six piece types | 4–8 | Rook, Bishop, Knight jumping, Queen, King; blockers and friendly pieces |
| Candidates and deduction | 9–12 | Preserve Bishop/Queen or Rook/Queen, combine evidence, Queen quota propagation, captured pieces still occupy identity slots |
| Special rules | 13–16 | Choose castling versus an ordinary move, four promotions, decline promotion, immediate en passant |
| Protect the King | 17–20 | Block check, submit a forbidden self-check move and see it rejected, escape, capture one of several King candidates |
| Finishes | 21–24 | Last King candidate capture, stalemate draw, confirmed-piece mate, mate with unresolved attackers |

The learner controls the side whose turn is indicated, including Black replies.
The copy explains that actual matches permit controlling only one's own color.
These are prepared teaching positions, not a claim that every exercise is a full
game replay from the initial board.

Ordinary moves retain the whole playable candidate mask. Special destinations
open explicit action choices and do not silently select castling or a promotion.
Incorrect legal attempts restore the puzzle position; forbidden moves never
change it. The self-check lesson advances only when the actual engine rejects
the designated move. Showing an example never records a lesson as completed.

The final exercise prepares `d5→d6`, `h7→h6`, then lets the learner find a move.
It accepts any actual White checkmate with at least two living White attackers
still holding both Rook and Queen possibilities. The reference solution is
`d6→d8`: the c7 piece covers rank 7 and the d8 piece rank 8. The Black King remains
alive. A hardcoded destination alone cannot award success.

## Reading, recovery and progress

The default 2D board and the optional 3D board share the same state and actions.
The native dialog restores opener focus and supports Escape. Escape in a special
action dialog cancels that choice and leaves the lesson open. Board squares use
the shared arrow-key/Enter controls.

Descriptions are paginated to measured space without dropping graphemes. Page
boundaries prefer complete words in each locale; CJK prose keeps dictionary
words together. Measurement uses the same word spans as the visible text. The
lesson picker, instruction and action buttons fit the standard tested viewports;
enlarged text retains an overflow fallback. The full articles on Rules and Guide
remain readable with their own scrolling and section navigation.

Course v2 progress is device-local under `qg_tutorial_course_v2`. Invalid storage
or denied storage falls back to a playable course. Completed IDs are validated
against the course; selecting a lesson does not complete it. Reset retries that
lesson and keeps prior achievements. This progress is separate from account
ratings, tickets, campaign saves and the old tutorial.

## Verification

`tutorialCourse.test.ts` replays all lessons through real rules and compares
results with `applyLocalMove`. It checks special side effects, quota propagation,
draw versus capture versus mate, rejection without mutation, and the genuine
unresolved mate condition. The content test checks all 24 lessons in 12 languages.

`scripts/qa/tutorial-walkthrough.mjs` provides independent keyboard inputs for
the real rendered boards and special action dialogs. It is reused by the local
learning layout fixture, exported tutorial QA and public guidance QA. Browser
viewport emulation is not physical Android or Play acceptance.


For repeatable component checks, set `QG_TEST_FONT_EXPORT` to a saved Next export
with its `_next/static/css` and `_next/static/media` files, then compile an empty
output directory once with
`node scripts/qa/secondary-screens-server.mjs --build scratch/secondary-screens-static`.
Set `QG_TEST_SECONDARY_STATIC=scratch/secondary-screens-static` for the settings,
learning and text-wrapping drivers. The local HTTP fixture serves this bundle and
read-only public assets, with no API writes. The build binds the actual exported
font faces and four Next font variables, records their hashes in
`font-binding.json`, and rejects a missing font source. CI transfers only these
font CSS/media files from its static-build job. Interactive development can still
use the default Vite server. Run heavy browser suites sequentially on this PC.
The all-language wrapping audit distinguishes requested UI language from the
actual guide language (Japanese/English) and includes separate Android settings
fixtures; those fixtures are not physical Android or Play verification.
