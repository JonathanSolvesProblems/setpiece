# Submission form

One field per block. Nothing in a block but the value. Open values are marked `[X ...]` and the form is not filled in until none remain. Every number traces to `sources.md`.

## Name

```
Setpiece
```

## Tagline

```
Block a VFX shot on your kitchen table with your hands and leave with the storyboard. No controllers needed, median 90 fps on a Quest 3S.
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
I wanted to be a VFX filmmaker before I switched to computer science. The short I'm least embarrassed by has a creature added weeks after the shoot. On the day there was nothing for the actor to look at and nothing to frame against.

On a real creature shoot the stand-in is a tennis ball on a stand, raised to the creature's eye height, and getting actors to look where you need them to is a known problem on set. Setpiece puts that ball, the actors and the camera on your kitchen table a week before the shoot.

It is for an indie director or a VFX supervisor in prep: a board for each scene, built up over the days before the shoot and opened again on the day. Here the table sets the scale, your hands move the stand-ins, and the eyeline is in the room with you.

You sit down and a 1:10 set lands on your table: by itself if the headset already knows the table, with a point and a pinch if it doesn't. You pick up wooden stand-ins with your fingers, put the ball where the creature will be, pick a lens from 18 to 135 mm and look through the camera. Snap, and the frame goes on a storyboard with its lens, camera height, distance and eyelines written on it.

Record a take and carry an actor across the set: they walk it back to you. Say "a Mexican standoff after a car chase" and three actors take their marks, each aiming at the next, with two crashed cars behind them. Push a car and let go and it drives on; push it hard and an actor in its way goes down.

You leave with a board image, a shot list and a short animatic. Every number on the board is measured from where the pieces stood. No number on it is estimated. Voice runs inside the page, so what you say stays on the headset.

How I built it: Immersive Web SDK in the Quest Browser, nothing to install. Passthrough makes your table the stage; scene understanding and hit testing land the set; a room anchor keeps it there; hands do everything. The set is 51 pieces and 10 starting scenes, built in code as plain maquettes you paint yourself. On a Quest 3S it ran at a median of 90 frames a second in normal use, never under 60 (46 samples, 5 and 6 November). [X, the number on the submitted build.]

Not yet proven on the headset: the set returning to the same spot after a relaunch, voice through the headset's microphone, and the frame rate during a take. [X, update after the next headset session.]

[X, measured: one unbroken take, headset on to a six-frame board, in minutes.]

[X, Jonathan: future plans, and who you wrote to.]
```

## Hand interactions, and what excites me about VR

```
Everything is done with hands. Reach out and pinch a piece, or close your fist on it, and it comes with you. Point and pinch for anything further away. A pinch held on the striped edge moves the whole set. Twisting your wrist turns what you're holding, and tilts the camera. I measured my own hand to set where a fist starts, because the first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. Held actors squirm a little in your fingers, and you can turn that off.

Nobody has to learn what to do with a tiny wooden actor. You pick it up.
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
