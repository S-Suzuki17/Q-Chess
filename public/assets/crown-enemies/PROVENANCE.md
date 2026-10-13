# Original Crown characters

Six characters were authored for Q-Gambit in **Blender 5.2.2 LTS**, using the existing registered Blender launcher in a fresh factory-startup background process. The editable mesh library is `art/crown-enemies.blend`; the actual render settings, object/part counts and SHA256 values are recorded in `art/crown-character-creation.json`.

| Piece | Plain name | Full PNG bytes | Atlas PNG bytes |
| --- | --- | ---: | ---: |
| Pawn | セイア / Seia | 56,053 | 54,466 |
| Knight | カイル / Kyle | 58,667 | 58,424 |
| Bishop | ソル / Sol | 63,442 | 73,866 |
| Rook | ドルン / Dorn | 60,376 | 63,229 |
| Queen | アステル / Aster | 65,936 | 86,613 |
| King | アウレウス / Aureus | 66,490 | 90,514 |

The twelve runtime images total **798,076 bytes**. Full transparent PNGs are 256×288. Each 768×864 atlas contains eight matching 256×288 cells: cape, left foot, right foot, body, left hand, right hand, head, gear; unused cells/parts are transparent. The full image and atlas use the same orthographic camera and coordinate frame. Separate part renders may have slightly different contact shadows.

Reproduction, from the repository root:

1. Run `node scripts/assets/export-crown-character-catalogue.cjs` to export the shared six-entry catalogue.
2. Run the installed Blender executable with `--background --factory-startup --python-exit-code 5 --python scripts/assets/create-crown-characters.py -- scratch/crown-character-catalogue.json <absolute-repository-path> 1,2,3,4,5,100`.

The source script builds rounded heads, faces, torsos, articulated arms/feet, costumes and piece-specific equipment from original primitives and curves. Rendering uses Cycles on CPU, 24 samples with denoising, AgX, studio area lights and transparent film. Linear EXR part renders are assembled into the atlas before the output colour transform. No downloaded model, texture, photograph, sampled character art, AI image service or paid production API was used. The existing QUBE artwork and board models/materials were neither opened nor altered by this generator.

Rights provenance: these procedural designs, names, meshes and renders were created specifically for this project in this task; there is no third-party art licence or attribution dependency. Blender is the authoring tool, not an art source. This record does not assign a new open-source licence to project artwork; distribution follows the project's rights and distribution policy.

Only the active character loads. Compact portraits and reduced-motion/low-resource modes use the full PNG. Normal entrance motion can load its single atlas for finite head/hand/foot animation. Either successful representation can stand alone; when both fail, the component uses a lightweight original SVG body with the same piece identity and name. No character animation loops or runtime 3D character renderer are required.
