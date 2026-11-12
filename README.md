# Setpiece

Block a VFX shot on your kitchen table with your hands. A 1:10 film set on a slate lands on your real table; you move wooden stand-ins, a tennis ball where the creature's eyes will be, and a 35 mm camera; you look through the lens, snap, and leave with the storyboard, the shot list and the eyeline for each actor.

Live: https://setpiece.jonathansolvesproblems.com

Built for the Meta VR Start Developer Competition 2026, Productivity track, New Experience. Hands only, seated, no controller needed.

## How to run it

On a Meta Quest 3 or 3S, nothing to install:

1. Open https://setpiece.jonathansolvesproblems.com in the Meta Quest Browser, sitting at a table.
2. Pinch **Enter XR**. The first time, the headset asks whether the browser may use spatial data. Allow it and the set finds your table by itself. If you would rather not, or the room was never scanned, the set floats in front of you: touch your table with a fingertip and pinch, and it lands there.
3. Follow the line above the monitor. It asks for one thing at a time and moves on when you have done it.

The same address runs flat in a desktop browser: drag a figure, pick a lens, snap a frame.

From a clone (Node 20.19 or newer):

```
npm install
npm run dev
```

`npm run dev` opens a managed browser with the Immersive Web SDK emulator. `npm run typecheck` checks types. `npm run build` writes `dist/` for any static host. `node tools/make-audio.mjs` regenerates the four sounds.

To check it yourself: `node tools/check-live.mjs` asserts thirty-odd things about the live site and writes what it found to `devpost/checks/last-run.md`. `npm run check:claims` fails when this README or the submission text disagrees with the code or the measurements. Every number in this file traces to `devpost/sources.md`.

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
- **Record a take.** Press Record, walk an actor across the slate or pan the camera, press Stop, and the move plays back in a loop on the set and on the monitor. An actor carried through a take keeps to the floor when it plays back, turns to face the way it is going, and its legs and arms swing in step with the ground it covers. Record again and what is in the take plays while you carry another piece, so the actor's walk goes down first and the camera's move is laid over it. A take runs up to twelve seconds, and it is kept with the board.
- **You leave holding something.** Back in the browser, save the board as a picture, the shot list as a spreadsheet, and the take as a video animatic filmed through the monitor.
- **It is all still there next time.** Where each piece stands and the whole board are kept in the browser, and the set is parked on a room anchor. After a reload the panel says what came back. Whether the set lands on the same spot after the browser is closed and opened again has been logged on the headset once and not yet checked by eye.
- **An asset library of 51 assets**, on six shelves. Cast: four actors, the eyeline ball, a horse and a wolf. Creatures: dragon, troll, dinosaur, robot, alien, ghost, spider, kraken. Vehicles: car, van, motorbike, truck, pickup, bus, helicopter, boat, flying saucer, bicycle, tank. Effects: fire, smoke, water, explosion, rain, sparks, snow, fog, dust, magic, embers. Set: wall, lamp post, tree, house front, fence, stairs, door, pillar. Props: crate, barrier, bench, cone, dumpster, rock. One pinch adds an item where there is room for it and another puts it back; Remove takes off the piece you last picked up, and Clear set empties the slate. Everything moves, turns and records like any other piece, and the lens sees it. Each frame remembers what was on the set and how it was dressed. Effects show where an effect sits and how big it reads in the frame; they are not simulations.
- **Search and start from a scene.** A letter keyboard on the panel spells a name and finds a piece by what it is called or by another word for it: UFO finds the flying saucer. The Scenes shelf holds ten blockings to start from, such as Car chase, Dragon attack and Haunted house: one press puts every piece on its mark, dressed, with the camera in place, and all of it can be moved.
- **Everything starts as a wooden maquette.** Like a model maker's set, every vehicle, creature and building comes in bare wood beside the lay figures, and colour is a choice you make.
- **Paint, size, fittings and copies.** Press a piece on the shelf, or pick it up, at any time after it is on the set, and a bar at the foot of the panel, on whatever tab is open, offers eight paints for anything with a body, four sizes for anything at all, and fittings where there are some: a light bar or a roof rack on the car, a box, a flatbed or a tanker on the truck, a horn on the horse. Two hands size a piece freely: hold it with one hand, pinch it with the other, and pull your hands apart or push them together, from 40% to three times its size; the size is kept with the piece's paint. Copy puts another of the same on the set, dressed the same, for the pieces a set wants several of: trees, rocks, crates, cones, barriers, cars and wolves, up to three of each.
- **Reach in and pick it up.** Put your fingers on a piece and pinch, or close your hand around it, and it comes with your hand; a controller's grip or trigger does the same. From further away the hand's ray and a pinch still work. Near a piece the ray steps aside, so what your hand is on is what you get.
- **A held actor squirms.** Lifted off the slate a lay figure hangs from your hand, swings with it and kicks, and goes quiet when it is set down. The Stage tab turns that off. The camera never does it.
- **Things rest on things.** Let an actor go above the car and they stand on its roof; a crate lands on the truck. Lift what is underneath and what was on it comes down.
- **Push a car and let go, and it drives on.** A vehicle let go while it is moving rolls on along the way it faces, as a toy car does, slowing until it stops. It stops at the slate's edge, against anything solid, or against an actor in its way, who goes down if it meets them at 1 m/s or more on the real set. Only a hand still moving when it opens is a push: carry a car somewhere, stop and let go, and it stays where you put it. A push recorded in a take plays back the same way, the knock-down included; a push only just fast enough to knock them down may leave them standing when the take plays back. The horse and the wolf stand in a vehicle's way too, and go over on their side when it arrives that fast; pick one up and it is back on its feet.
- **Pieces answer each other, by rule.** Rain or water over a fire puts it out and it catches again when the water moves away. A vehicle or a creature driven into an actor knocks them down, and they lie there until a hand stands them up or the take starts again. These are rules read off where things stand. They are not physics, and a take plays them back the same way every time.
- **Say a scene.** Press Say a scene and say what should be on the set: "a red dragon, two actors and a burning car". The listening runs on the headset, from a small speech model that ships with the app, so nothing you say leaves it; the model downloads once, the first time you press the button. A request can only name what is in the library. Whatever it names that is not there is said back, not invented. It also knows directing words: "a Mexican standoff after a car chase" puts three actors on their marks, each aiming at the next, with two crashed cars behind them. That is a blocking from a short list, built from the same pieces, and every one can be picked up and moved.
- **Say the controls too.** The same button takes the panel's own controls in words: "eighty five", "wider", "snap", "record", "stop", "play it back", "drone", "camera b", "camera on the dragon", "closer", "higher", "paint the car red", "make it bigger", "remove it". Each works the same switch the panel's button works, so a lens that was said and a lens that was pinched are the same thing. With Keep listening on, on the Stage tab, the microphone opens again after each sentence, so a whole setup can be said after one pinch: a set, where the camera looks, the lens, snap. A quiet spell ends it. Words cannot move a piece to a new mark; asked to, the sheet says that moving is by hand.
- **Two cameras and a cut.** Add a second camera from the Shoot tab. One is live: its picture is on the monitor and its frame lines are on the floor. Press the other and that is a cut, each camera keeps its own lens, and a take that is recording keeps the cuts and plays them back.
- **Every actor has a colour.** On a set each performer's marks are spike tape in their own colour so nobody walks to the wrong one. Here actor A is orange, B blue, C pink and D green, on the mark under them, on their tag and on their eyeline on the panel. The mark stays on the floor while you carry them, so you can see where they came from.
- **Stand in the shot.** The set grows to full size around you. You stand at the lens, looking down it, the actors are their real height on your real floor, and the tennis ball hangs 3.3 m up where the creature's eyes will be. A take plays around you at that size.
- **Actors have poses and looks.** Blocking, neutral, arms up, running or aiming, with a wooden prop pistol in the hand; wood, or a costume colour with hair, so two stand-ins read apart in a wide. These are stand-ins: Setpiece does not scan or depict real people.
- **Shot briefs.** Nine shots a director asks for: wide, low-angle hero, high angle, close-up, two-shot, over the shoulder, rule of thirds, creature reveal, aerial. Snap, and the frame is checked against the definition of that shot from where the pieces stand. It is stamped PRINT, or the sheet says what is off in the crew's units, such as "Lens is only 0.2 m below A. Go lower."
- **One line of guidance** above the monitor: land the set, block it, frame it, snap. Each step ends on the thing it asked for, never on a timer, it marks the piece or the button it is asking for, and it goes away when the board is full. During a take it is the take's clock.

## What it does not do

Every number on the board is measured from where the pieces stand at the moment of the frame. No number on it is estimated. A take is the poses your own hands gave the pieces, thirty times a second, and it can only replay those: nothing in it is acted for you. The motion Setpiece adds itself is short and listed above: a held actor squirms, a moving actor walks, wings and rotors turn, an actor falls when something is driven into them, a fire goes out under water. Setpiece does not choose a lens for you, it does not know the real location, and a frame is a blocking diagram with wooden figures, not a render of the finished shot. Words can add, remove, paint and size a piece, aim and step the camera, change the lens, run a take and snap; they cannot carry a piece to a new mark, and the app says so when asked.

## Built on

Immersive Web SDK (WebXR, three.js): hand tracking with pinch grab on every piece and on the slate's edge, each with a grab zone wider than the piece so a near miss still picks it up; the wrist's own rotation for turning a piece and tilting the camera; the fingertip pose for landing the set by touch; scene understanding (planes and labelled room meshes) and the Quest Browser's room capture; persistent spatial anchors; passthrough in an unbounded session; spatial UI (UIKitML); positional audio; and the IWSDK CLI and emulator for the build loop.

For the frame rate: the monitor's second view of the set is drawn only on frames where a piece, the stage or the lens has moved, and the key light's six-pass shadow on every other one of those, so a set that is standing still costs one view per eye.

## Where this stands

Landing by pointing worked on a Quest 3S in a room with no scan, and with the car, fire, smoke and water all on the slate it measured 74 frames a second against 76 just before they were added. On a Quest 3S, in the Quest Browser, on Nov 5: the session starts in passthrough with both hands tracked; it holds 90 frames a second with the set standing still (median frame 11.1 ms, none over 20 ms in the sample) and measured 78 while two pieces were being carried at once, before the shadow was moved to alternate frames; picking up, carrying and turning pieces by wrist, tilting the camera, and snapping frames onto the board all work on real hands.

On Nov 11, on that day's build, the same headset ran a heavier set (three actors, the ball, a horse and a truck, both hands tracked) at 66 to 68 frames a second with no frame over 23 ms: above the competition's 60, below the 90 a light set holds. Each frame was costing 12.8 ms of JavaScript against a budget of 11.1, and `devpost/results/quest-frame-time.json` records where it went. The fix that followed is in the current build (the hand rays no longer walk pieces that are off the set, the slate's striped edge and the camera are a handful of meshes, and the monitor and the shadow take turns while something moves) and is measured on the headset again before the deadline.

On Nov 12, with the headset idle on a cable and nobody wearing it, the voice was tried on the headset itself (`devpost/results/quest-voice.json`). Fed four recorded sentences, the recogniser wrote every piece, colour, count and verb in each, in about a quarter of the time the sentence takes to say. Pressed with nobody speaking, Say a scene was listening 2.1 s later and gave up at its 8 s limit, so the microphone opens there. A person's words through the headset's microphone are still to be heard.

Checked only in the IWSDK emulator so far, each step by state: the set following its user, the take recorder and its layering, going back to a frame's setup, poses and looks, formats, the drone, the briefs, sizing a piece with two hands, a pushed vehicle rolling on, a vehicle stopping against and tipping the horse or the wolf, and the spoken controls (through typed words in the emulator, and through the recogniser on a desktop with two synthetic voices). Not yet measured on a headset: anchors across a relaunch, and the frame rate while a take plays. Those go here when they exist.

## Type, art and sound

Big Shoulders Stencil by Patric King and Schibsted Grotesk by Schibsted, both under the SIL Open Font License (`public/ui/fonts/OFL.txt`). The chalk drawings were generated on my own machine from a written art direction and keyed by hand; the mark, the wordmark and every number were set, not generated. The four sounds (the clap, a piece lifted, a piece set down, the slate landing) are synthesised by `tools/make-audio.mjs` from sine partials and filtered noise; nothing is sampled.

## Licence

MIT.
