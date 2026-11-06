# Setpiece

Block a VFX shot on your kitchen table with your hands. A 1:10 film set on a slate lands on your real table; you move wooden stand-ins, a tennis ball where the creature's eyes will be, and a 35 mm camera; you look through the lens, snap, and leave with the storyboard, the shot list and the eyeline for each actor.

Live: https://setpiece-xr.vercel.app

Built for the Meta VR Start Developer Competition 2026, Productivity track, New Experience. Hands only, seated, no controller needed.

## How to run it

On a Meta Quest 3 or 3S, nothing to install:

1. Open https://setpiece-xr.vercel.app in the Meta Quest Browser, sitting at a table.
2. Pinch **Enter XR**. The first time, the headset asks whether the browser may use spatial data. Allow it and the set finds your table by itself. If you would rather not, or the room was never scanned, the set floats in front of you: touch your table with a fingertip and pinch, and it lands there.
3. Follow the line above the monitor. It asks for one thing at a time and moves on when you have done it.

The same address runs flat in a desktop browser: drag a figure, pick a lens, snap a frame.

From a clone (Node 20.19 or newer):

```
npm install
npm run dev
```

`npm run dev` opens a managed browser with the Immersive Web SDK emulator. `npm run typecheck` checks types. `npm run build` writes `dist/` for any static host. `node tools/make-audio.mjs` regenerates the four sounds.

## Why

I wanted to be a VFX filmmaker before I switched to computer science. The short I am least embarrassed by was shot on a consumer DSLR with a creature added weeks later, which meant that on the day there was nothing for the actor to look at and nothing to frame against. On a real creature shoot the stand-in is a tennis ball on a C-stand raised to the creature's eye height. Setpiece is that table, before the shoot.

## What it does

- **The stage is a clapper slate at 1:10** (60 by 40 cm, a 6 by 4 m set). Point at any real surface and a chalk outline of the slate lies on it; pinch and the set lands there. That uses the headset's live hit test, so it needs no room scan. A table the headset has already labelled takes the set by itself. If the headset reports no surface at all, the set floats in front of you, comes with you when you walk away, sit down or turn round, and lands where you touch the table and pinch or where you carry it by its striped front edge.
- **Actors are wooden lay figures; the creature is a tennis ball on a stand** at its eye height. Pick a piece up and move your hand; turn your wrist and it turns. A ring lights under the piece your hand is on. Let go and it stands itself up on the slate. The camera keeps the height you gave it, because a high or a low angle is a choice.
- **Only the striped edge moves the set.** Hold it and the whole slate follows your hand and turns with your wrist. The slate's top, the monitor and the board do not move it, so a pinch that misses an actor does not carry the set away.
- **Hands or controllers.** Everything a pinch does, a trigger does; the guidance says trigger when controllers are in your hands.
- **The eyeline from each actor to the ball is drawn live** and reported in degrees and in metres on the real set.
- **The camera is a 35 mm film camera.** A director's monitor above the stage shows what its lens sees, at 18, 24, 35, 50, 85 or 135 mm, on a full frame, Super 35, Super 16 or 65 mm format cropped to 16:9. That is four formats. Switch it from tripod to drone and it flies: the legs go, the rotors spin, and you carry it up to 11 m on the real set. Turn your wrist to pan it and tip your wrist to tilt its head on the tripod. Until you tilt it yourself it tilts itself at the nearest actor's eyes. The lens sees the set and nothing else: not the panel, not the card, not your hands.
- **Snap claps the sticks and puts a frame on the storyboard card**: six frames, each with its lens, camera height, distance to the creature and every actor's eyeline written under it, so the card is the shot list and can be read in the headset on its own. **Pinch a frame and the set goes back to it**: every piece to its mark, the lens on, the camera tilted as it was.
- **Record a take.** Press Record, walk an actor across the slate or pan the camera, press Stop, and the move plays back in a loop on the set and on the monitor. Record again and what is in the take plays while you carry another piece, so the actor's walk goes down first and the camera's move is laid over it. A take runs up to twelve seconds, and it is kept with the board.
- **You leave holding something.** Back in the browser, save the board as a picture, the shot list as a spreadsheet, and the take as a video animatic filmed through the monitor.
- **It is all still there next time.** The set is parked on a room anchor; where each piece stands and the whole board are kept in the browser. The next session opens with the set where you left it and says so only when that is true.
- **An asset library of 51 assets**, on six shelves. Cast: four actors, the eyeline ball, a horse and a wolf. Creatures: dragon, troll, dinosaur, robot, alien, ghost, spider, kraken. Vehicles: car, van, motorbike, truck, pickup, bus, helicopter, boat, flying saucer, bicycle, tank. Effects: fire, smoke, water, explosion, rain, sparks, snow, fog, dust, magic, embers. Set: wall, lamp post, tree, house front, fence, stairs, door, pillar. Props: crate, barrier, bench, cone, dumpster, rock. One pinch adds an item where there is room for it and another puts it back; Remove takes off the piece you last picked up, and Clear set empties the slate. Everything moves, turns and records like any other piece, and the lens sees it. Each frame remembers what was on the set and how it was dressed. Effects show where an effect sits and how big it reads in the frame; they are not simulations.
- **Paint, size and fittings.** Pick a piece up and the panel offers eight paints for anything with a body, four sizes for anything at all, and fittings where there are some: a light bar or a roof rack on the car, a box, a flatbed or a tanker on the truck, a horn on the horse.
- **Reach in and pick it up.** Put your fingers on a piece and pinch, or close your hand around it, and it comes with your hand; a controller's grip or trigger does the same. From further away the hand's ray and a pinch still work. Near a piece the ray steps aside, so what your hand is on is what you get.
- **A held actor squirms.** Lifted off the slate a lay figure hangs from your hand, swings with it and kicks, and goes quiet when it is set down. The Stage tab turns that off. The camera never does it.
- **Things rest on things.** Let an actor go above the car and they stand on its roof; a crate lands on the truck. Lift what is underneath and what was on it comes down.
- **Pieces answer each other, by rule.** Rain or water over a fire puts it out and it catches again when the water moves away. A vehicle or a creature driven into an actor knocks them down, and they lie there until a hand stands them up or the take starts again. These are rules read off where things stand. They are not physics, and a take plays them back the same way every time.
- **Two cameras and a cut.** Add a second camera from the Shoot tab. One is live: its picture is on the monitor and its frame lines are on the floor. Press the other and that is a cut, each camera keeps its own lens, and a take that is recording keeps the cuts and plays them back.
- **Every actor has a colour.** On a set each performer's marks are spike tape in their own colour so nobody walks to the wrong one. Here actor A is orange, B blue, C pink and D green, on the mark under them, on their tag and on their eyeline on the panel. The mark stays on the floor while you carry them, so you can see where they came from.
- **Stand in the shot.** The set grows to full size around you. You stand at the lens, looking down it, the actors are their real height on your real floor, and the tennis ball hangs 3.3 m up where the creature's eyes will be. A take plays around you at that size.
- **Actors have poses and looks.** Blocking, neutral, arms up or running; wood, or a costume colour with hair, so two stand-ins read apart in a wide. These are stand-ins: Setpiece does not scan or depict real people.
- **Shot briefs.** Nine shots a director asks for: wide, low-angle hero, high angle, close-up, two-shot, over the shoulder, rule of thirds, creature reveal, aerial. Snap, and the frame is checked against the definition of that shot from where the pieces stand. It is stamped PRINT, or the sheet says what is off in the crew's units, such as "Lens is only 0.2 m below A. Go lower."
- **One line of guidance** above the monitor: land the set, block it, frame it, snap. Each step ends on the thing it asked for, never on a timer, it marks the piece or the button it is asking for, and it goes away when the board is full. During a take it is the take's clock.

## What it does not do

Every number on the board is measured from where the pieces stand at the moment of the frame. Nothing on it is estimated or generated. A take is the poses your own hands gave the pieces, thirty times a second, and it can only replay those: nothing in it is acted for you. The motion Setpiece adds itself is short and listed above: a held actor squirms, wings and rotors turn, an actor falls when something is driven into them, a fire goes out under water. Setpiece does not choose a lens for you, it does not know the real location, and a frame is a blocking diagram with wooden figures, not a render of the finished shot.

## Built on

Immersive Web SDK (WebXR, three.js): hand tracking with pinch grab on every piece and on the slate's edge, each with a grab zone wider than the piece so a near miss still picks it up; the wrist's own rotation for turning a piece and tilting the camera; the fingertip pose for landing the set by touch; scene understanding (planes and labelled room meshes) and the Quest Browser's room capture; persistent spatial anchors; passthrough in an unbounded session; spatial UI (UIKitML); positional audio; and the IWSDK CLI and emulator for the build loop.

For the frame rate: the monitor's second view of the set is drawn only on frames where a piece, the stage or the lens has moved, and the key light's six-pass shadow on every other one of those, so a set that is standing still costs one view per eye.

## Where this stands

Landing by pointing worked on a Quest 3S in a room with no scan, and with the car, fire, smoke and water all on the slate it measured 74 frames a second against 76 just before they were added. On a Quest 3S, in the Quest Browser, on Nov 5: the session starts in passthrough with both hands tracked; it holds 90 frames a second with the set standing still (median frame 11.1 ms, none over 20 ms in the sample) and measured 78 while two pieces were being carried at once, before the shadow was moved to alternate frames; picking up, carrying and turning pieces by wrist, tilting the camera, and snapping frames onto the board all work on real hands.

Checked only in the IWSDK emulator so far, each step by state: the set following its user, the take recorder and its layering, going back to a frame's setup, poses and looks, formats, the drone, and the briefs. Not yet measured on a headset: anchors across a relaunch, and the frame rate while a take plays. Those go here when they exist.

## Type, art and sound

Big Shoulders Stencil by Patric King and Schibsted Grotesk by Schibsted, both under the SIL Open Font License (`public/ui/fonts/OFL.txt`). The chalk drawings were generated on my own machine from a written art direction and keyed by hand; the mark, the wordmark and every number were set, not generated. The four sounds (the clap, a piece lifted, a piece set down, the slate landing) are synthesised by `tools/make-audio.mjs` from sine partials and filtered noise; nothing is sampled.

## Licence

MIT.
