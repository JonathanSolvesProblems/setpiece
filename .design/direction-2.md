# Direction, second pass

Mode: redesign of the Oct 28 direction ("the stage is a clapper slate"). 2026-11-05. The owner wore the build in a dim living room and said the colour theme and the headset UI can be cooler and better. This file replaces the palette, the canvas and the control style of direction.md; the metaphor of the stage as a working set, the voice and the type stay.

## Phase 0

- Platform: unchanged. A WebXR app over passthrough plus a 2D page. What is new is evidence from the device: the room is dim, the wearer sits on a couch, the set is about 0.65 m from the eyes.
- The one screen that matters: the set on the table in passthrough.
- Constraints: 60 fps on Quest 3S; passthrough behind everything; UIKitML panel at about 1 mm per px; fonts ship with the app; element ids are fixed by the code and the test scripts.
- Locked inputs: Big Shoulders Stencil, Big Shoulders and Schibsted Grotesk (shipped, OFL). The clapper stripe on the front edge of the stage (it is the handle that moves the set).
- Audience: Meta judges, on a Quest 3 or 3S, in rooms I have not seen.
- Tools: local ComfyUI is installed (server down at the start of this pass).

## Preservation inventory

Keeping: the panel's structure (stencil label left, value right), the wordmark, the storyboard card on paper, the wooden lay figures, the tennis ball as the creature, the optic yellow of that ball, the tally red, the voice.
Fixing, from the device: (1) a mid-grey slate panel and plate over a dim room read as grey on grey, with nothing lit; (2) one accent does every job, so nothing tells actor A's eyeline from actor B's; (3) controls were words with a rule under them, and the wearer could not tell what was pressable or hit it; (4) the hover ring is the same yellow as everything else; (5) a stray pinch on a button beside Snap grew the set to full size.

## Phase 1

Family: `luminous-emissive`. The last three logged projects are spatial-3d, spatial-3d and dimensional-tactile (this project's own first pass), so those are barred. Light as the material is also what the device asks for: in passthrough, in a dim room, the only things that read are the things that give off light.

Category convention to avoid: white rounded panels with pill buttons; the blue grid floor; and, inside this family, the cyan hologram: thin cyan lines, glass blur, glow on everything.

Material metaphor: **the marks are down.** A stage with the work lights off. Each performer has a mark on the floor in their own colour of fluorescent spike tape, the camera's frame lines are laid on the floor, and the controls hang on a blacked-out flag beside the set.

Domain facts and found details behind it:
1. On a set every performer's marks are spike tape in a different colour, so nobody walks to the wrong one. (Domain fact.)
2. spike-tape-2.jpg: a cross of two torn strips of fluorescent orange cloth tape on a matt black stage floor. Tape #e49a4f, floor #1b1411 with #5a4b3d where light catches it. Ends torn by hand, not cut.
3. spike-tape-0.jpg: blue cloth spike tape on the roll, #0861ab in shadow to #5ca0cb where lit, the weave visible.
4. A flag is black cloth on a frame, used to keep light off things. (Domain fact.) The panel is one.

Design code:
1. One tape colour belongs to one performer, everywhere they appear: the mark under them, their eyeline line on the panel, their tag. Because that is what the colours on a real floor mean. Rules out a single accent doing every job.
2. The ground is black cloth, never grey and never glass. Because the room behind it is somebody's real room at any brightness, and only true dark lets a colour read as light. Rules out mid-grey panels, translucency and blur.
3. Light means live. A thing is bright only while it is held, selected, recording or being asked for. Rules out decorative glow.
4. A control that presses is a block with an edge; a thing that only informs is plain chalk. Because the wearer has to know what is pressable from across a table. Rules out words with a rule under them.
5. Numbers keep fixed columns and fixed precision (kept from the first pass).

Anti-brief:
- Wrong: cyan hologram lines and glass. The cliché of the family.
- Wrong: orange on blue-black. My own old default.
- Wrong: a rainbow. Four tape colours each mean a person; a fifth colour with no person is decoration.

Expressive axis: colour, as light. (The first pass was material and texture.)

## Phase 2: three directions

1. **The marks are down** (luminous-emissive). Black cloth, chalk, four tape colours with owners, yellow for selected, red for recording. Type unchanged. Cost: the tape colours must stay tied to people or it turns into a rainbow.
2. **Monitor overlay** (mechanical-industrial). The panel as a field monitor's menu, peaking colours on edges, false-colour legend. Cost: reads as a camera menu, cold, and false-colour scales belong to manufacturers.
3. **Volume wall** (cinematic-atmospheric). Graded sky washes behind the set, type inside the picture. Cost: there is no picture behind the set, there is a living room; gradients over passthrough look like stickers.

Ledger: 2 lands on `_prior_dark_console` (black, console panels, warm accent): killed. 3 survives the ledger and dies on the platform. 1 is checked against `last-seen` (flagging tape, one pink, organic-soft, field green, marker handwriting): it differs on family, canvas, chroma (four owned colours against one), and it carries no handwriting. Against `floodplain` (luminous-emissive, light overcast canvas, one fluorescein accent): it differs on canvas and chroma. Committed to 1.

## Phase 3: values

- cloth #1b1411 (spike-tape-2 floor), block #2a211c (the same floor, one step lit), seam #5a4b3d (the floor where light catches it).
- chalk #f6f7ef, chalk dust #c7c7b7 (kept, from the first pass's slate photographs).
- tape: orange #e49a4f (measured), blue #5ca0cb (measured), pink #e8719f and green #6cc47c (the other two colours of a roll set, set at the orange's lightness).
- ball yellow #d6e13c (kept): selected, good to go.
- tally red #e0352b (kept): recording only.
- Owners: A orange, B blue, C pink, D green, the eyeline ball yellow.
- Accent budget per screen: yellow marks only what is selected (one tab, one lens, one shelf, plus each asset that is on the set); red appears once, and only while recording.
