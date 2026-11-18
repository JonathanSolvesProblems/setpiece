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

`npm run dev` opens a managed browser with the Immersive Web SDK emulator. `npm run typecheck` checks types. `npm run build` writes `dist/` for any static host. `node tools/make-audio.mjs` regenerates the fifteen sounds, and `node tools/make-voice-lines.mjs` records the set designer's fixed lines again (it needs an ElevenLabs key, and only records a line whose words changed).

To check it yourself: `node tools/check-live.mjs` asserts 57 things about the live site and writes what it found to `devpost/checks/last-run.md`. `npm run check:claims` fails when this README or the submission text disagrees with the code or the measurements. Every number in this file traces to `devpost/sources.md`.

## Why

I wanted to be a VFX filmmaker before I switched to computer science. The short I am least embarrassed by was shot on a consumer DSLR with a creature added weeks later, which meant that on the day there was nothing for the actor to look at and nothing to frame against. On a real creature shoot the stand-in is a tennis ball on a C-stand raised to the creature's eye height. Setpiece is that table, before the shoot.

## What it does

- **Say the shot and it is built.** A set designer (Claude, behind a small server function) reads the sentence and the pieces drop onto your table one at a time: actors posed and cast, vehicles painted, the light chosen from the sentence, the camera placed with a lens on. What the library lacks it makes from wooden shapes. Code checks its work before the camera is placed, and it then looks through its own lens and reframes.
- **It talks.** Its reply is read aloud while the pieces land. A newcomer is walked through once: each step said, with a small arrow over the thing to pinch. The walkthrough can be skipped, and started again from the panel.
- **Actors perform.** Say "a sword fight" and the two duelists swing and lunge at each other on their marks; workers hammer, a crowd dances, someone on a call talks. The designer picks what each actor does from your sentence.
- **Actors hold things, sit and ride.** A sword fight puts a sword in each duelist's hand; a sniper gets a rifle, a search party torches, mourners umbrellas (twelve things, part of the figure in every pose). "A knight on a horse" or "someone riding the dragon" seats the actor on its back, and they stay on it when you carry it.
- **Then it is yours.** Pick up any piece with your fingers, turn it with your wrist, size it with two hands, or say what to change.
- **Frame it.** Six lenses from 18 to 135 mm, a monitor that shows what the lens sees, and Snap puts the frame on a storyboard with its lens and camera height measured from where the pieces stood.
- **Shoot coverage.** Press it, or say "cover it". The designer plans a wide and closer shots and the app shoots them onto the board, each fitted to its subject by measure.
- **It sits in its world.** On the table the scene's painted sky stands behind the set, with its sun or moon and the far city or hills. After dark the windows glow and headlamps light the road. One switch on the Stage tab turns the sky off.
- **Step inside.** The set grows to full size around you under a painted sky whose horizon fits the scene. Point at the floor and pinch to walk there; Turn left and Turn right are on the panel.
- **Draw it.** Say "sketch" or "noir look" and the monitor and the storyboard frames are drawn that way: a pencil storyboard, or hard black and white. Say "anime style", or name it in the shot ("an anime sword fight on a rooftop"), and the set itself turns cartoon on your table: flat banded light, inked edges, and a designer that dresses the scene as anime. The headset's recogniser cannot write "anime" (it writes "enemy"), so the designer hears the style from the whole sentence.
- **Leave with it.** The board as an image, the shot list as a CSV and a take as a short video, saved from the page; a full board is also saved from inside the headset without leaving (its picture reaches Downloads as the session ends). Up to four boards are kept, each with a tab under the storyboard: pinch a tab and that board comes back with its set.
- **Without the designer** the same sentence goes to a reader built into the app, which builds from the library's 51 assets. Nothing else depends on it.

Every rule, limit and number behind those lines is in [docs/what-it-does.md](docs/what-it-does.md).

## What it does not do

Every number on the board is measured from where the pieces stand at the moment of the frame. No number on it is estimated. A take is the poses your own hands gave the pieces, thirty times a second, and it can only replay those: nothing in it is acted for you. The motion Setpiece adds itself is short and listed above: a held actor squirms, a moving actor walks, wings and rotors turn, an actor falls when something is driven into them, a fire goes out under water. The set designer chooses a first lens and frame for a set it builds, and says which; every frame after that is yours to choose. Setpiece does not know the real location, and a frame is a blocking diagram with wooden figures and simple made shapes, not a render of the finished shot. The designer can only put down the library's pieces and the shapes it makes from simple solids; it is told never to name a brand or a real person, and the pieces it makes are named plainly.

## Built on

Immersive Web SDK (WebXR, three.js): hand tracking with pinch grab on every piece and on the slate's edge, each with a grab zone wider than the piece so a near miss still picks it up; the wrist's own rotation for turning a piece and tilting the camera; the fingertip pose for landing the set by touch; a live hit test for landing the set on a table with no room scan (the way every set on the headset has been landed), and, where a room has been scanned, scene understanding (planes and labelled room meshes) to offer its table; a spatial anchor asked for where the set lands (holding across a relaunch is not measured); passthrough in an unbounded session; spatial UI (UIKitML); positional audio; and the IWSDK CLI and emulator for the build loop.

The set designer is Claude (Anthropic's claude-opus-5-5), called from a Vercel function (`api/director.ts`) with the library's catalog, the set's coordinates and a JSON schema for the reply; the key stays on the server. The reply streams, and `src/director-plan.ts` reads each piece out of it the moment its line is complete. The speech is turned into text on the headset by a small open speech model that ships with the app (Vosk), with no word list when the designer is there.

For the frame rate: the monitor's second view of the set is drawn only on frames where a piece, the stage or the lens has moved, and the key light's six-pass shadow on every other one of those, so a set that is standing still costs one view per eye.

## Where this stands

- **Seen on a Quest 3S, hands only.** Landing the set by pointing, in a room with no scan. Picking up, carrying and turning pieces, and snapping frames. Sets built from sentences spoken in my own words on the live site, with the replies read aloud, the first piece 1.6 s after the last word (`devpost/results/quest-voice-designer.json`). The newcomer walkthrough, from landing to the first frame (Nov 16). Stepping inside under the painted skies, at 86 to 89 frames a second on the live site (Nov 16). Shoot coverage: six shots planned and on the board in 25 seconds, the scene's sky behind the set on the table, and a board's tab bringing its frames back (Nov 17, `devpost/results/quest-coverage-and-world.json`).
- **Frame rate on the headset.** With both hands tracked, the designer's sets ran at 87 to 89 frames a second standing and 71 to 83 with a piece moving (Nov 14, replies replayed on the development server, `devpost/results/quest-frame-time-designer.json`). A set of 24 things ran at 63 to 64, so a reply holds 20 at most. On Nov 17, with the headset's own recorder running (it costs about ten), lighter sets averaged 64 to 75 and the heaviest of the day (17 pieces, four effects) 52 to 61; that set has not been measured again with the recorder off.
- **In the emulator only.** Walking the full-size set by pointing and its turn buttons, the sketch and noir looks, the designer picking the look from the sentence, actors performing (a fight that swings), the Sitting pose, a rider on a horse or a dragon, eleven of the twelve things an actor can hold (swords have been held on the headset), saving a board in-session, a board bringing its set back, recorded takes, sizing with two hands, the spoken controls, rolling vehicles, and building without the designer. The board and shot list have been saved from the desktop page.
- **Not measured.** Anchors across a relaunch, the frame rate while a take plays, and any room but mine.

The dated record behind each line is in [docs/where-this-stands.md](docs/where-this-stands.md).

## Type, art and sound

Big Shoulders Stencil by Patric King and Schibsted Grotesk by Schibsted, both under the SIL Open Font License (`public/ui/fonts/OFL.txt`). The chalk drawings were generated on my own machine from a written art direction and keyed by hand; the mark, the wordmark and every number were set, not generated. The fifteen sounds (the clap, a piece lifted, a piece set down, a big piece set down, the slate landing, a tick for each panel press, the rush of air as the set grows around you, two notes as the microphone opens and closes, the loops that rain, fire, wind and water play from where they stand on the set, and the crickets of a night set heard once you are inside it) are synthesised by `tools/make-audio.mjs` from sine partials and filtered noise; nothing is sampled. The designer's voice is two of ElevenLabs' stock voices: its replies are read as they are written, and its twelve fixed lines were recorded once with the same voices and settings.

## Licence

MIT.
