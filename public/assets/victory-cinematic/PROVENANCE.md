# Q-Gambit castle cinematic assets

Created for Q-Gambit on 2026-10-08. These are production assets, not screenshots of a completed in-game cinematic.

## Scope: victory effects only

The currently adopted game chess pieces and original QUBE reference image remain unchanged. Runtime encounters use the existing `/models/{pawn,knight,bishop,rook,queen,king}.glb` assets with the established piece library and captured match finish. The separately authorized articulated 2D QUBE companion is documented in `../qube-companion/PROVENANCE.md` and retains the reference identity. No replacement chess models or 3D QUBE model are included. No character model or entitlement is inferred from the victory effect selection.

## Original victory-FX prop

The coronation seal is an original decorative effect mesh/material asset authored with Blender 4.3.2. It is an effect prop only, never a replacement for an adopted chess piece. No downloaded mesh, texture, franchise artwork, or third-party font is used. The glTF file contains geometry/materials only and makes no external requests.

GLB coordinates: +Y up, +Z front, base at Y=0; height approximately 1.2557 units. The transparent WebP poster is a 640×640 render of the same mesh. Re-export using:

    blender -b -t 4 --python scripts/assets/export-coronation-seal.py

Use ImageMagick to convert the transparent PNG output to WebP at quality 84. The compressed native authored studio scene is `scripts/assets/source/coronation-production.blend`.

## Castle interior background

The user's final direction is an original pixel-art castle interior rendered directly in the game using crisp tile/geometry code. No raster castle painting is included in these runtime assets. A generated realistic interior was reviewed during exploration and rejected for the background; that unused reference is retained outside the runtime bundle only. It must not be introduced as a fallback or downsampled/filtered to imitate pixel art.

## Original audio

`crown-reveal.mp3` is a 3-second original synthesized cue from `scripts/assets/build-cinematic-audio.py`, encoded using the already installed ffmpeg. It contains no third-party recordings. It must remain behind the existing sound preference and browser audio-unlock behavior; previews must never silently enable audio. The cue is optional and has no connection to reward grants or stage completion.

## Runtime and accessibility

These static assets require no API, API key, account, subscription, analytics service, or network destination beyond the game's normal asset hosting. Three.js is already a project dependency (MIT license; preserve its existing license notice). Blender/ffmpeg are creation tools only and are not shipped to players. Reduced motion and low-performance fallback should display the same transparent posters without continuous animation. Load only the current encounter model; do not preload the entire catalogue.
