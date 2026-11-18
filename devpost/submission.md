# Submission form

One field per block. Nothing in a block but the value. Open values are marked `[X ...]` and the form is not filled in until none remain. Every number traces to `sources.md`.

## Name

```
Setpiece | An AI film set that builds on your table
```

## Tagline

```
Say a film shot and a miniature set starts building on your table about two seconds later. Move it by hand, leave with a storyboard.
```

## Track

```
Productivity
```

## Division

```
New Experience
```

## Description

```
About ten years ago I made short VFX films for YouTube: lightning in a field, a creature floating next to me in the woods. Every effect went in on a computer weeks after the shoot. On the day I was framing the shot around empty air, with nothing for the actor to look at.

Setpiece is a miniature film set on your real table, for the storyboard pass a director does before a shoot day. You say the shot out loud, an AI set designer builds it at one-tenth scale, and you move the actors and the camera with your hands. You leave with a six-frame storyboard and a shot list (a spreadsheet with the lens and camera height of every shot) to send to the crew.

## The first minute

Open the link in the Quest Browser, sit at a table and press Enter XR. Point at the table and pinch, and a film set lands on it. The set designer builds a first set by itself and says out loud what it built, then a small arrow points at Talk. Say "a night chase, a red car racing past a burning truck, a dragon on a rooftop". The pieces drop onto your table one at a time, posed, lit for night, with the camera placed. What the library doesn't have, like a castle gate, it builds from simple wooden shapes. Then it looks through its own camera and moves it if the shot is off.

## After that, by hand

Pick up any piece with your fingers, or say what to change: "add rain". A tennis ball on a stand marks where the creature's eyes will be, and each frame records how far every actor looks up at it. Pick a lens from 18 to 135 mm and snap, and the frame goes on the storyboard with its lens and camera height. Press Shoot coverage and the designer plans a wide shot and closer ones, then shoots them onto the board while you watch. Step inside and the set grows to full size around you. Say "an anime sword fight" and the set turns cartoon; say "sketch" and the board is drawn in pencil.

Up to four boards are kept, and your set and board are there when you come back.

## How it's built

Immersive Web SDK in the Quest Browser, in passthrough: the set lands where you pointed, found by the headset's own surface detection with no room scan, and hands do everything. The designer is Claude behind a small server, answering one piece at a time, so each piece lands as soon as it is written. Code then checks its work: an actor it stood inside a car is moved out before the camera is placed. If the designer can't be reached, the app still builds from its own library of 51 pieces.

## Measured, on a Quest 3S

Two sentences spoken in my own words (Nov 15 and 16): the first piece was on the table 1.6 s after the recogniser had my last word, both times, and the whole set stood at 3.3 s and 3.7 s. Bigger sets on Nov 17 took 4 to 7 s. On Nov 14, with both hands tracked, the designer's sets ran at 87 to 89 frames a second standing and 71 to 83 with a piece moving. Going through it as a first visit on the live site (Nov 16), my own spoken shot was a frame on the board 53 seconds after I pressed Enter XR (68 on an earlier run that day). On Nov 17, Shoot coverage planned six shots and had all six on the board 25 seconds after I pressed it.

Limits. Run only in the headset emulator so far: walking the full-size set and its turn buttons, the sketch and noir looks, the designer picking the look from the sentence, the Sitting pose, a rider on a horse or a dragon, eleven of the twelve things an actor can hold (swords have been held on the headset), saving a board in-session, a board bringing its set back, recorded takes, sizing with two hands, the spoken controls, rolling vehicles, and building without the designer. The board and shot list have been saved from the desktop page. One room, mine; the set lands by live surface detection, not a stored layout. The heaviest set (17 pieces, four effects) ran at 52 to 61 frames a second with the headset's screen recorder running, which I measured the day before to cost about ten. I have not measured it again with the recorder off.

## What's next

Two people around the same set, a director and a camera operator each with a headset, working on the same frame.
```

## Hand interactions, and what excites me about VR

```
Everything is done with hands. Reach out and pinch a piece, or close your fist on it, and it comes with you. Point and pinch for anything further away. A pinch held on the striped edge moves the whole set. Twisting your wrist turns what you're holding, and tilts the camera. I measured my own hand to set where a fist starts, because the first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. Held actors squirm a little in your fingers, and you can turn that off.

A newcomer is walked through once: the designer says each step out loud and a small arrow points at the button or the piece, and it can be skipped. At full size, you point at the floor and pinch to walk there, and turn with two buttons on the panel, without standing up.
```

## Target launch date

```
[X, Jonathan to choose]
```

## Team

```
Jonathan Andrei, jon_andrei04@hotmail.com, solo developer
```

## Links the form asks for

```
Live: https://setpiece.jonathansolvesproblems.com
Repo: https://github.com/JonathanSolvesProblems/setpiece
Video: [X, after Nov 14]
```
