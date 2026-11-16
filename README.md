# Setpiece

Say the shot, and a 1:10 film set builds itself on your kitchen table, piece by piece, with the camera already framed. Then block it with your hands: move the wooden stand-ins, the tennis ball where the creature's eyes will be, the cars and whatever the set designer made; look through the lens, snap, and leave with the storyboard, the shot list and the eyeline for each actor.

Live: https://setpiece.jonathansolvesproblems.com

Built for the Meta VR Start Developer Competition 2026, Productivity track, New Experience. Hands only, seated, no controller needed.

## How to run it

On a Meta Quest 3 or 3S, nothing to install:

1. Open https://setpiece.jonathansolvesproblems.com in the Meta Quest Browser, sitting at a table.
2. Pinch **Enter XR**. The first time, the headset asks whether the browser may use spatial data. Allow it, then point at your table and pinch: the set lands there, with no room scan. (A table the headset has already labelled takes the set by itself.)
3. Follow the line above the monitor. It asks for one thing at a time and moves on when you have done it: land the set, then pinch **Talk** and say what happens in the shot.

The same address runs flat in a desktop browser: drag a figure, pick a lens, snap a frame.

From a clone (Node 20.19 or newer):

```
npm install
npm run dev
```

The set designer and its voice are two server functions (`api/director.ts`, `api/speak.ts`) that need keys of your own: put `SETPIECE_ANTHROPIC_KEY=...` and, for the spoken replies, `ELEVENLABS_API_KEY=...` in a file named `.env.local` at the root, and the dev server answers for both. Without them the app builds from its own library reader and stays quiet, and everything else works.

`npm run dev` opens a managed browser with the Immersive Web SDK emulator. `npm run typecheck` checks types. `npm run build` writes `dist/` for any static host. `node tools/make-audio.mjs` regenerates the fourteen sounds, and `node tools/make-voice-lines.mjs` records the set designer's fixed lines again (it needs an ElevenLabs key, and only records a line whose words changed).

To check it yourself: `node tools/check-live.mjs` asserts about fifty things about the live site and writes what it found to `devpost/checks/last-run.md`. `npm run check:claims` fails when this README or the submission text disagrees with the code or the measurements. Every number in this file traces to `devpost/sources.md`.

## Why

I wanted to be a VFX filmmaker before I switched to computer science. The short I am least embarrassed by was shot on a consumer DSLR with a creature added weeks later, which meant that on the day there was nothing for the actor to look at and nothing to frame against. On a real creature shoot the stand-in is a tennis ball on a C-stand raised to the creature's eye height. Setpiece is that table, before the shoot.

## What it does

- **Say the shot and it is built.** A set designer (Claude, behind a small server function) reads the sentence and the pieces drop onto your table one at a time: actors posed and cast, vehicles painted, the light chosen from the sentence, the camera placed with a lens on. What the library lacks it makes from wooden shapes. Code checks its work before the camera is placed, and it then looks through its own lens and reframes.
- **It talks.** Its reply is read aloud while the pieces land. A newcomer is walked through once: each step said, with a small arrow over the thing to pinch. The walkthrough can be skipped, and started again from the panel.
- **Then it is yours.** Pick up any piece with your fingers, turn it with your wrist, size it with two hands, or say what to change.
- **Frame it.** Six lenses from 18 to 135 mm, a monitor that shows what the lens sees, and Snap puts the frame on a storyboard with its lens and camera height measured from where the pieces stood.
- **Cover it.** The designer plans a wide and closer shots and the app shoots them onto the board, each fitted to its subject by measure.
- **Step inside.** The set grows to full size around you under a painted sky, and you walk it by pointing at the floor.
- **Leave with it.** The board as an image, the shot list as a CSV and a take as a short video, saved from the page.
- **Without the designer** the same sentence goes to a reader built into the app, which builds from the library's 51 assets. Nothing else depends on it.

Every rule, limit and number behind those lines is in [docs/what-it-does.md](docs/what-it-does.md).

## What it does not do

Every number on the board is measured from where the pieces stand at the moment of the frame. No number on it is estimated. A take is the poses your own hands gave the pieces, thirty times a second, and it can only replay those: nothing in it is acted for you. The motion Setpiece adds itself is short and listed above: a held actor squirms, a moving actor walks, wings and rotors turn, an actor falls when something is driven into them, a fire goes out under water. The set designer chooses a first lens and frame for a set it builds, and says which; every frame after that is yours to choose. Setpiece does not know the real location, and a frame is a blocking diagram with wooden figures and simple made shapes, not a render of the finished shot. The designer can only put down the library's pieces and the shapes it makes from simple solids; it is told never to name a brand or a real person, and the pieces it makes are named plainly.

## Built on

Immersive Web SDK (WebXR, three.js): hand tracking with pinch grab on every piece and on the slate's edge, each with a grab zone wider than the piece so a near miss still picks it up; the wrist's own rotation for turning a piece and tilting the camera; the fingertip pose for landing the set by touch; scene understanding (planes and labelled room meshes) and the Quest Browser's room capture; persistent spatial anchors; passthrough in an unbounded session; spatial UI (UIKitML); positional audio; and the IWSDK CLI and emulator for the build loop.

The set designer is Claude (Anthropic's claude-opus-5-5), called from a Vercel function (`api/director.ts`) with the library's catalog, the set's coordinates and a JSON schema for the reply; the key stays on the server. The reply streams, and `src/director-plan.ts` reads each piece out of it the moment its line is complete. The speech is turned into text on the headset by a small open speech model that ships with the app (Vosk), with no word list when the designer is there.

For the frame rate: the monitor's second view of the set is drawn only on frames where a piece, the stage or the lens has moved, and the key light's six-pass shadow on every other one of those, so a set that is standing still costs one view per eye.

## Where this stands

The set designer, added on Nov 13, has run against the real model from a desktop: seven fresh sets put their first piece down a median of 1.3 s after the request and were whole a median of 2.8 s after (`devpost/results/designer-latency.json`). That is with one line added after the words, "Latency-sensitive; begin your visible answer immediately.": the model always thinks before it answers, and on a busy sentence that thinking came before any piece, with the table empty. Each of 33 sentences was asked both ways, one after the other; with the line, the slowest tenth of first pieces fell from 5.0 s to 2.1 s, the night chase from 5 to 6 s to 1 s, a fifth fewer tokens were written, and 30 sets had nothing to flag after the set dresser against 27 without it (`devpost/results/designer-hurry.json`). Its whole path through the app, from a sentence to pieces dropping, the camera framed, a look through the lens, an edit, Undo and the fallback to the library's reader, is tested in the emulator against replies written in its exact format. On the headset it has built sets from sentences spoken in my own words, on the development server on Nov 15 and on the live site on Nov 16 (`devpost/results/quest-voice-designer.json`), with its replies read aloud; the walkthrough, Cover it and stepping inside under the painted sky are still to be seen there.

Landing by pointing worked on a Quest 3S in a room with no scan, and with the car, fire, smoke and water all on the slate it measured 74 frames a second against 76 just before they were added. On a Quest 3S, in the Quest Browser, on Nov 5: the session starts in passthrough with both hands tracked; it holds 90 frames a second with the set standing still (median frame 11.1 ms, none over 20 ms in the sample) and measured 78 while two pieces were being carried at once, before the shadow was moved to alternate frames; picking up, carrying and turning pieces by wrist, tilting the camera, and snapping frames onto the board all work on real hands.

On Nov 11, on that day's build, the same headset ran a heavier set (three actors, the ball, a horse and a truck, both hands tracked) at 66 to 68 frames a second with no frame over 23 ms: above the competition's 60, below the 90 a light set holds. Each frame was costing 12.8 ms of JavaScript against a budget of 11.1, and `devpost/results/quest-frame-time.json` records where it went. The fix that followed (the hand rays no longer walk pieces that are off the set, the slate's striped edge and the camera are a handful of meshes, and the monitor and the shadow take turns while something moves) was measured on the headset on Nov 12 with the same six pieces: 73 to 82 frames a second with both hands tracked, 87 to 90 with the hands out of view, and 7.8 to 9.2 ms of JavaScript a frame with hands tracked against 12.8 before. Better, not 90. What is left with hands tracked is the input pass, 2 to 3 ms a frame; in the emulator half of it is the panel, which the current build closes to the hand pointers unless a hand points at it or reaches for it. That last step is not yet measured on the headset.

On Nov 12, with the headset idle on a cable and nobody wearing it, the voice was tried on the headset itself (`devpost/results/quest-voice.json`). Fed four recorded sentences, the recogniser wrote every piece, colour, count and verb in each, in about a quarter of the time the sentence takes to say. Pressed with nobody speaking, Say a scene was listening 2.1 s later and gave up at its 8 s limit, so the microphone opens there. Later that day the sixteen control sentences went through the headset's recogniser the same way, in two synthetic voices, and all 32 transcripts were read as the control that was said. In that afternoon's session a person spoke to it for the first time, one sentence, and the microphone, the audio thread and the recogniser worked end to end inside the session. It wrote "[unk] our any red dragon [unk] reset a scene with this new scene" for a sentence that asked for a car and a red dragon: the car was lost, and the request was then refused because a take was playing. The recogniser is no longer told the determiners it wrote there, and a set asked for under a take now stops the take and is built. Since then two sentences spoken in my own words have been heard and built on the headset (`devpost/results/quest-voice-designer.json`).

Checked only in the IWSDK emulator so far, each step by state: the set following its user, the take recorder and its layering, going back to a frame's setup, poses and looks, formats, the drone, the briefs, sizing a piece with two hands, a pushed vehicle rolling on, a vehicle stopping against and tipping the horse or the wolf, the spoken controls (through typed words in the emulator, and through the recogniser on a desktop with two synthetic voices), and everything changed after the Nov 12 session on the headset: Undo, the gentler sizing, the rule that only a driven vehicle knocks someone down, a set asked for under a take, the guard against two presses a moment apart, the panel's own line, the buttons that ask twice, the set put back after a drag, and a call sheet that ticks a step only when a piece was really carried or the camera really turned. Not yet measured on a headset: anchors across a relaunch, and the frame rate while a take plays. Those go here when they exist.

## Type, art and sound

Big Shoulders Stencil by Patric King and Schibsted Grotesk by Schibsted, both under the SIL Open Font License (`public/ui/fonts/OFL.txt`). The chalk drawings were generated on my own machine from a written art direction and keyed by hand; the mark, the wordmark and every number were set, not generated. The fourteen sounds (the clap, a piece lifted, a piece set down, a big piece set down, the slate landing, a tick for each panel press, the rush of air as the set grows around you, two notes as the microphone opens and closes, the loops that rain, fire, wind and water play from where they stand on the set, and the crickets of a night set heard once you are inside it) are synthesised by `tools/make-audio.mjs` from sine partials and filtered noise; nothing is sampled. The designer's voice is two of ElevenLabs' stock voices: its replies are read as they are written, and its twelve fixed lines were recorded once with the same voices and settings.

## Licence

MIT.
