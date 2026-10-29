# Setpiece

Block a VFX shot on your kitchen table with your hands. A 1:10 film set on a slate lands on your real table; you move wooden stand-ins, a tennis ball where the creature's eyes will be, and a 35 mm camera; you look through the lens, snap, and leave with the storyboard, the shot list and the eyeline for each actor.

Live: https://setpiece-xr.vercel.app (open it in the Meta Quest Browser and press Enter XR; it also runs flat in a desktop browser).

Built for the Meta VR Start Developer Competition 2026, Productivity track, New Experience. Hands only, seated, no controller needed.

## Why

I wanted to be a VFX filmmaker before I switched to computer science. The short I am least embarrassed by was shot on a Canon T5i with a creature added weeks later, which meant that on the day there was nothing for the actor to look at and nothing to frame against. On a real creature shoot the stand-in is a tennis ball on a C-stand raised to the creature's eye height. Setpiece is that table, before the shoot.

## What it does

- The stage is a clapper slate at 1:10 (60 by 40 cm, a 6 by 4 m set). It drops onto the first table or desk the headset reports and turns to face you; grab the plate to move the whole set.
- Actors are wooden lay figures; the creature is a tennis ball on a stand at its eye height. The eyeline from each actor to the ball is drawn live and reported in degrees and in metres on the real set.
- The camera is a 35 mm film camera with a magazine. A director's monitor above the stage shows what its lens sees, at 24, 35, 50 or 85 mm (full frame, 16:9).
- Snap writes a frame to a six-frame storyboard card and a row to the shot list: lens, camera height and distance to the creature, in set metres.
- The set is parked on a room anchor and its pose is saved, so the next session opens with it where you left it.

## Built on

Immersive Web SDK (WebXR, three.js): hand tracking with one-hand, two-hand and distance grab, gaze targeting on the Meta VR Glasses profile with head fallback on Quest, scene understanding (planes and labelled room meshes), persistent spatial anchors, passthrough, spatial UI (UIKitML), and the IWSDK CLI and emulator for the build loop.

## Run it

```
npm install
npm run dev
```

The managed browser opens with the emulator. `npm run build` writes `dist/` for any static host.

## Type and art

Big Shoulders Stencil by Patric King and Schibsted Grotesk by Schibsted, both under the SIL Open Font License (`public/ui/fonts/OFL.txt`). The chalk drawings were generated on my own machine from a written art direction and keyed by hand; the mark, the wordmark and every number were set, not generated.

## Licence

MIT.
