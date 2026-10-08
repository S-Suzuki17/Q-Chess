# Reference-faithful articulated 2D QUBE

The canonical design reference is the unchanged `public/qube_icon.jpg`. After visual review, the first stylized redraw was replaced by a direct reconstruction measured against the original at matching scale. The current vector uses the reference's seated silhouette, large rounded head, short body, forehead cap curve/pawn position, pale-crescent sleepy eyes, dark segmented arms, round right hand and asymmetric forward-pointing yellow feet. The raster's photographic grain is not reproduced. No mouth, eyebrows, cheek blush, chest diamond, bright teal iris, yellow forearms or extra decorative fingers are added.

Sweat is hidden in every standard state. `sweat?: boolean` is an explicit optional artwork detail, default false; it is not enabled by idle, anticipation, victory or encouragement. No new automatic distress behavior is defined.

Source of truth: `src/components/qubeArtwork.tsx`. `QubeArtwork` is a presentational full SVG with a 300×310 viewBox, without animation, API calls, external images, masks, filters or third-party assets. Expressions are neutral, confident, joy and encouraging. They alter only the eyes/lids/gaze; expression does not add a mouth. The static SVG files are fallbacks, not the primary animated implementation.

Generate standalone SVGs and an expression contact sheet using:

    node scripts/assets/export-qube-art.mjs

The runtime owns motion, timing, visibility pause, reduced-motion behavior and event routing. Stable `data-qube-part` groups: shadow, leg-left/right, arm-left/right, forearm-left/right, hand-left/right, body, teal-mark, head, pawn, sweat, eyes, eye-left/right, pupil-left/right, lids, lid-left/right, spark-left/right. Sparks are effect accents that start transparent; mouth/brows/cheeks groups do not exist.

Pivots (x,y): head137,213; body137,281; arm-left93,216; arm-right188,221; forearm-left85,244; forearm-right204,256; hand-left84,258; hand-right209,273; leg-left102,270; leg-right150,275; eyes126,163; eye-left91,165; eye-right160,161; lid-left91,166; lid-right160,162; sweat64,133; shadow134,293; spark-left35,99; spark-right244,104. No base transforms are pre-applied to these groups.

Reduced motion retains the selected expression without gestures. Announce only meaningful state changes, not animation frames. Existing chess pieces, game rules, Crown rewards and entitlements remain unchanged. No 3D QUBE or painted castle background is included.
