# Crown chamber entrance

Original procedural light, dust and synthesized audio authored for Q-Gambit. No downloaded textures, sampled recordings or third-party character models are included.

Editable source: `scripts/assets/render-crown-entry.mjs`. The light pass is authored in Canvas2D, then **FFmpeg n7.0.1-playwright-build-1011** encodes 54 frames as VP8 WebM. The existing Chromium 151 runtime supplies the offline Canvas2D renderer. FFmpeg was actually executed. These light/audio assets do not use Blender; the six character bodies were actually authored in Blender and are documented separately in `public/assets/crown-enemies/PROVENANCE.md`.

Reproduce with the existing local binaries assigned to `QG_TEST_CHROMIUM` and `QG_FFMPEG`, then run `node scripts/assets/render-crown-entry.mjs` at the repository root. The script uses no network. Creation settings and output hashes are in `creation.json`.

- `chamber-light.webm`: 640×360, 30 fps, 1.8 seconds, silent, 33,848 bytes. It is an additive light pass on a black background, composited with screen blending over the unchanged directly drawn pixel castle.
- `chamber-entry.wav`: original restrained 1.8 second mono PCM cue, 22,050 Hz, 79,424 bytes. It replaces the generic introduction cue for Crown and follows the existing sound volume/mute/ad focus rules.

Only the current entrance loads the shared video. No looping, autoplay audio during room browsing, or 100-character video library. Reduced motion, narrow/low-resource/save-data devices, codec failure, load failure and late completion use the static castle plus a finite CSS light shaft. Loading never authorizes a stage or delays a timer. Hiding, canceling, replacing the scene and unmounting release owned media/timers/listeners. The existing pieces, materials, seated 2D QUBE and castle vectors are retained.
