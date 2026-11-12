# Sources

Every number Setpiece shows, or that the README and the submission state, and where it comes from. A number is one of three things: a measurement this build made, with the file that holds it; a published source, with its name and year; or a design choice, which is marked as one and claims nothing about the world.

Numbers with no source do not go on the page. Two figures the Phase 0 card carried from October (a storyboard rate card attributed to Seb Antoniou, and a day rate attributed to StoryboardArt.org) could not be found again on 9 November 2026 and are retired; the YunoJuno figure below replaces them.

## The job

| Number | Source |
|---|---|
| A storyboard artist's average day rate is £373, and the average hourly rate $61 | YunoJuno, "Storyboard Artist Contractor Rates 2026", "based on real booking data from YunoJuno's global talent network", read 9 November 2026: https://www.yunojuno.com/freelancer-rates-job-role/storyboard-artist |
| On a creature shoot the eyeline stand-in is a tennis ball on a stand at the creature's eye height | Ian Failes, "Meet the true unsung hero of visual effects: the tennis ball", befores & afters, 4 March 2023: https://beforesandafters.com/2023/03/04/meet-the-true-unsung-hero-of-visual-effects-the-tennis-ball/ . Quoted there: Joe Bauer, visual effects supervisor, Game of Thrones: "When Daenerys' dragons were 3' long they were tennis balls on sticks." Scott Squires, visual effects supervisor, Dragonheart: "Trying to get actors to look where you need them to is always an issue." |
| For a small or close creature, balls on rods are placed at the eye position, which also gives post-production something to track | The VES Handbook of Visual Effects (Focal Press), chapter on on-set data and stand-ins: "When a creature is very close or small, then it may be useful to place ping-pong or tennis balls on rods. These would be placed at the eye position." https://www.oreilly.com/library/view/visual-effects-society/9780240812427/09_chapter3a.xhtml |
| The brief's own bar: something satisfying in ten minutes or less, hands first, seated; performant on Meta Quest hardware at a minimum of 60 frames a second | The competition's overview and judging pages, read 29 October, 9 and 10 November 2026: https://start-developer-competition-26.devpost.com/ and https://start-developer-competition-26.devpost.com/details/judging |
| 5,704 participants on 10 November 2026 (5,537 on 9 November); last year over 2,900 developers and more than 650 submissions | The same overview page, which states last year's figures in its introduction |

## Measured on the headset

All on a Meta Quest 3S in the Quest Browser, hands tracked, on the live site.

| Number | Source |
|---|---|
| A median of 90.0 frames a second through normal use: 46 one-second samples over two days, 5 and 6 November 2026, lowest 65.5 (the first minute after entering), none under 60; measured on those days' builds, not the one submitted | `devpost/results/quest-frame-rate.json`, written by the read-only session logger (tmp/q-log.py) that sampled requestAnimationFrame once a minute while the wearer used the app |
| 90 fps with the set still (median frame 11.1 ms, p95 13.1 ms, none over 20 ms in 720 frames); 78 fps carrying two pieces (median 12.7 ms, 2 of 392 over 20 ms); 109 draw calls, about 11,500 triangles | Spot measurements on 5 November 2026 with tmp/quest-check.py fps, recorded the same day in `PHASE0.md` ("Device session on Nov 5") |
| 74 fps with the car, fire, smoke and water on the slate, against 76 just before they were added | Same method, same day, recorded in `PHASE0.md` |
| With three actors, the ball, a horse and a truck on the set and both hands tracked, 66 to 68 frames a second on 11 November 2026 (build 5f1bca4): 12.8 ms of JavaScript a frame against a budget of 11.1, of which 5.1 drawing 163 calls, 2.7 in the pointer system and 2.4 redrawing the monitor. With the hands out of view the same set ran at 90 | `devpost/results/quest-frame-time.json`, read by a three-second probe attached over the DevTools protocol (tmp/q-prof.js, tmp/q-sys.js, tmp/q-input.js); the fix is in the builds after it and is not yet measured on the headset |
| 11.2 s from opening the address to a set ready on the first visit; 3.4 s on a reload | `devpost/results/load-and-size.json` |
| The speech recogniser, run on the headset and fed four recorded sentences, wrote every piece, colour, count and verb in all four, each in about a quarter of the time the sentence takes to say (slowest 0.25), on 12 November 2026 (build 7a50ef5). The voice was synthetic and went straight to the recogniser: the headset's microphone is not in this number. Pressed on the headset the same day with nobody speaking, Say a scene was listening 2.1 s after the press and gave up after its 8 s limit, so the microphone opens there; a person's words through it are still to be heard. The sixteen control sentences ("snap", "eighty five", "camera on the dragon" and the rest), fed to the headset's recogniser in two synthetic voices on build 93ad62d, were written down so that all 32 were read as the control that was said, each in 0.20 to 0.29 of the time it takes to say | `devpost/results/quest-voice.json`, from probes attached over the Chrome DevTools Protocol (tmp/q-voice-probe.py, tmp/q-mic.py, tmp/read-heard.mjs) |
| The headset's hit test answered on 1,080 of 1,080 frames along each hand and 589 of 892 along the head, in a room with no scan | A probe run inside the live session on 5 November 2026 (tmp/q-hit2.js), recorded in `PHASE0.md` |
| A closed hand reads 0.7 of the palm's length from wrist to middle knuckle; an open one 1.5 to 1.8 | Measured on the wearer's hand on 5 November 2026; the thresholds built from it are `FIST_SHUT` and `FIST_OPEN` in `src/hand-reading.ts` |

## Measured elsewhere

| Number | Source |
|---|---|
| The main script is 2.59 MB, down from 6.78 MB | Vite's build output for commits 93ad62d and f140935, in `devpost/results/load-and-size.json` (34b580d was 2.54 before the rebuilt models and driving, 9807181 was 2.56 before the pickup, truck, bus and boat were rebuilt, ee2c915 was 2.57 before the spoken controls); the live size is checked by `tools/check-live.mjs` |
| The recogniser heard "Mexican standoff" in 14 of 14 sentences spoken by two synthetic voices, and wrote nearly every other word | `devpost/results/voice-recognition.json`: Windows voices played into the real recogniser through a fake microphone in desktop Chromium. Not a real voice, and not the headset's microphone |
| The voice model is 41.1 MB (the panel rounds it to "a 40 MB download") plus a 4.3 MB worker | `public/voice/`, listed by `tools/check-live.mjs`. The model is vosk-model-small-en-us-0.15, Apache-2.0: https://alphacephei.com/vosk/models |
| Jitter while a held piece is still fell by 61% and the lag of a fast turn halved, with the filter in `src/hand-turn.ts` | A simulation of tracking noise at 0.2 to 0.4 degrees against both versions of the turn code (tmp/turn-sim.mjs); the filter is the One Euro filter, Casiez, Roussel and Vogel, CHI 2012 |
| Meta's own pinch detector is a 5 cm sphere; a pinch begins with the fingers within 1.6 cm and always releases above 3 cm | Meta Horizon OS developer documentation, "Grab specs", last updated 4 May 2026: https://developers.meta.com/horizon/design/grab_specs ("Uses a 0.05 m sphere radius for detection, placed between the strongest pinching fingers"). Setpiece's own grab zones are 4 cm, and its release waits for the fingers to be seen 4 cm apart (`src/pieces.ts`) |

## Design choices

These describe the model, not the world, and are counted or read from the code by `tools/check-claims.mjs` where the README states them.

| Number | Where it lives |
|---|---|
| The set is 1:10; the slate is 60 by 40 cm, so the set is 6 by 4 m | `src/scene-assets/rig.scene-asset.ts` and `src/placement.ts` |
| Lenses 18, 24, 35, 50, 85 and 135 mm on a 35 mm camera; four sensor formats; two rigs, tripod and drone, the drone up to 11 m on the real set | `src/camera-formats.ts` |
| 51 pieces on six shelves, ten scenes, nine shot briefs, five poses and five looks per actor | `src/catalog.ts`, `src/scenes.ts`, `src/briefs.ts`, `src/tray.ts`; `tools/check-claims.mjs` fails the build when the README's counts drift from these |
| A take runs up to 12 seconds at 30 samples a second | `src/take.ts` |
| A set that has not landed floats 0.48 m ahead of and 0.34 m below the eyes; a grab in the first 0.8 s of a session is let go | `src/placement.ts`, `src/pieces.ts` |
| Eyelines are reported as the angle from each actor's eyes to the ball, in degrees, with the eye height and the distance in metres on the real set | Computed from the pieces' positions at the moment of the frame, `src/viewfinder.ts`; nothing on the board is estimated |
