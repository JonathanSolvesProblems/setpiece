# Direction

Mode: redesign. Phase 0 and the derivation, 2026-10-28.

## Phase 0

- Platform: a WebXR app (Immersive Web SDK) with a diegetic 3D surface in passthrough and a 2D page the judge sees first, on desktop and in the headset browser before Enter XR. Judged at: the headset capture in the video, the three submission screenshots, the first screen after the URL loads, the OG image.
- Domain: a filmmaker blocks a VFX shot on a 1:10 miniature set on their own table, looks through a lens, snaps frames, and leaves with a storyboard and shot list. The creature is not there on a real shoot either; its eyeline is a tennis ball on a stand.
- The one screen that matters: the table in passthrough with the set on it, the director's monitor above it showing the lens view, the frames filling up underneath.
- Constraints: 60 fps on Quest 3S, so cheap materials and small textures. Passthrough means no canvas colour in the headset; everything must read against an unknown real room. The panel is UIKitML with the Horizon kit; custom TTF fonts load through a font-face rule in the markup. No controller path required, pinch and grab only.
- Locked inputs: none.
- Audience: Meta judges (developer relations and engineers), scoring Innovation, Experience Design, Technical Implementation, Polish. They reward a visual identity they can describe in one clause.
- Tools: local ComfyUI (RTX 5060) is up with zimage and klein modes. No cloud keys.

## Preservation inventory

Keeping: the panel's contents and order (stage status, reset, lenses, snap, eyelines, shot list, enter XR); the monitor above the stage and the frame strip under it; the eyeline lines; table auto-placement, anchoring and restore; grab by ray and pinch; the stage as the thing you grab to move the set.
Fixing: grey capsule mannequins; the blue grid plate; the stock Horizon panel look; no identity, no mark, no favicon, no OG image; the 2D page is the raw scene with a floating panel; no texture or illustration anywhere.

## Phase 1

Family: `dimensional-tactile`. Last three logged projects are all `spatial-3d`, which is banned, and depth is free in this medium anyway; the family here is about material.

Category convention: every VR and MR previs or tabletop tool ships grey capsule or wooden-doll placeholders on a blue or green wireframe grid floor, Unity default lighting, white rounded panels with pill buttons in a neo-grotesk, cyan or orange gizmo colours, and a dark glass menu floating in space. FrameForge and Previs Pro use the grey doll and the green grid; Unreal virtual scouting uses dark glass panels with white icons. The current build is exactly this convention.

Material metaphor: **the stage is a clapper slate.** A matte black chalk-dusted board with white stencil field labels down one edge and the striped clapper sticks along the front, and everything that stands on it is what a camera department puts in front of a camera: wooden lay figures as stand-ins, a tennis ball on a stand as the creature's eyeline, a 35 mm camera with a magazine and a red tally, a director's monitor, and a camera report on paper where the shots get written down.

Design code:
1. Every figure on the stage is a stand-in, never a character, because on a VFX set the creature is a tennis ball on a C-stand and the actors are marks on the floor; so the creature is drawn as the eyeline marker itself and nothing on the stage pretends to be the finished image. Rules out: creature models, costumes, faces.
2. Field labels are white stencil capitals and values are set beside them, because that is how a slate carries REGIE, KAMERA and TON; so the panel reads label left, value right, in two faces from one family. Rules out: tracked micro-caps everywhere, label-over-giant-number stat blocks.
3. The only colours on the stage are the optic yellow of the eyeline ball and the red of the tally, because on a black slate the eye should go to the eyeline and to recording; everything else is slate, chalk, wood and paper. Rules out: accent-coloured buttons, blue grids, gizmo colours.
4. The monitor is the hero object and carries a bezel and a tally, because a director's monitor is where a shot is judged; so the frame is framed and nothing else on the stage has a border. Rules out: bordered cards.
5. Numbers (lens, height, distance) are tabular and sit in fixed columns, because a shot list is compared across shots. Rules out: proportional figures, mixed precision.

Anti-brief:
- Wrong: a white glowing panel in passthrough. It fatigues the eye in a real room and it is the default.
- Wrong: a blue or green grid floor. That is the convention and it reads as a simulator.
- Wrong: playful clay or cartoon figures. The track is Productivity and the user is a working filmmaker; the register is precise and warm, not toy.
- Wrong: cream canvas with an orange accent and italic serif headings. The house style of the model.

Expressive axis: material and texture. Chalk on slate, stencil, worn stripes, wood, paper.
Register: precise, with warmth from chalk and wood. Set by the audience: judges who want craft.

## Phase 2: three directions

1. **On the slate** (dimensional-tactile). Canvas: matte warm black slate (dark default) and aged storyboard paper (light). Chroma: monochrome plus optic yellow, with red reserved for the tally. Type: Big Shoulders Stencil for the loud line and the field labels, Big Shoulders at text optical size for everything else. Structure: canvas-spatial in the headset; on the page, one object (the chalk anchor on the slate) with the striped stick as the device. Depth: material simulation (chalk dust, worn paint). Ornament: material and texture plus chalk illustration. Motion: functional, with one detented beat (the clapper closing on Snap). Cost: three procedural models to rebuild, a chalk texture, a custom font in the panel.
2. **Camera department** (mechanical-industrial). Anodised black camera gear, white paper-tape labels with black marker, a knurled lens ring for the lens picker, a red tally. Achromatic plus tape white and red. Type: a marker hand for values and a DIN-like grotesk for labels. Structure: instrument. Motion: detented. Cost: the marker hand is a cliché risk and the look lands near the consumed dark-console entry in the ledger (dark canvas, warm accent).
3. **Stop-motion stage** (toy-playful). Plasticine figures, saturated primaries, a tiny proscenium with curtains, squash-and-stretch motion. Type: rounded. Cost: reads as a toy to a Productivity panel and contradicts the anti-brief.

Ledger: direction 2 is killed by `_prior_dark_console` (dark slate canvas with a warm accent, console structure). Direction 3 survives the ledger and dies on the anti-brief. Direction 1 differs from `sans-calque` (the one dimensional-tactile entry) on accent hue (optic yellow 68 against red 3), type (stencil against ISO lettering), structure (canvas-spatial against diff rows) and ornament (chalk illustration against stroked type). **Pick: direction 1.** Not blended.

## Phase 1.5 research

- Big Shoulders Stencil: variable, wght 100 to 900, opsz 10 to 72, OFL, by Patric King for the Chicago Design System. Big Shoulders (non-stencil) is the same family for text sizes.
- UIKitML custom fonts: a `@font-face` rule inside the `.uikitml` file pointing at a TTF under `public/ui/fonts/`; the runtime converts TTF to MSDF in WebAssembly, one rule per weight. Remote fonts reflow, so the TTF ships with the app.
- Motion the platform can do natively: three.js material and transform tweens per frame; UIKit style changes through `setProperties`.
