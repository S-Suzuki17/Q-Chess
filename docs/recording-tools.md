# Recording source (not a deployed feature)

The old `/teaser/` and `/teaser2/` pages were production-accessible recording
utilities, not real gameplay pages. Their source is preserved in the App Router
private folders `src/app/_teaser/` and `src/app/_teaser2/`.

Private folders do not become routes in development or production. For future
recording work, import the components into a local-only QA fixture; do not rename
the folders to public routes or add public rewrites. Some scripted positions are
staged, so recordings must not be presented as live gameplay.

Release verification must check that neither `out/teaser/index.html` nor
`out/teaser2/index.html` exists, and that both former public URLs return HTTP 404.
Robots permits crawlers to see that removal. Source files remain recoverable in
Git; no recording source or user-created video was deleted.
