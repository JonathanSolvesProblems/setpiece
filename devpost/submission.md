# Submission form

One field per block. Nothing in a block but the value. Open values are marked `[X ...]` and the form is not filled in until none remain. Every number traces to `sources.md`.

## Name

```
Setpiece
```

## Tagline

```
Say the shot and a 1:10 film set builds itself on your table, piece by piece. Block it by hand; never under 60 fps on a Quest 3S.
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
I wanted to be a VFX filmmaker before I switched to computer science. The short I'm least embarrassed by has a creature added weeks after the shoot; on the day, the actor had nothing to look at and I had nothing to frame against.

Setpiece is the table I needed that week, for an indie director or VFX supervisor: a board for the scene, built in prep and opened again on the day.

Point at your kitchen table, pinch, and a 1:10 film set lands on it in your room. Then say the shot: "a night chase, a red car racing past a burning truck, two actors running at camera, a dragon on a rooftop". A set designer reads it, and the pieces drop onto the table one by one as it writes them, posed, painted and at true scale, with the camera placed and given a lens. What the library lacks, it makes from simple wooden shapes: a rooftop, a castle gate. Code checks its work: an actor it stood inside a car steps out before the camera is placed. Then it looks through that camera, with what each piece covers measured beside the picture, and reframes the shot, up to twice. From a desktop the first piece lands a median of 1.8 s after the request (7 sentences, 1.1 to 7.0 s); the first request after an hour's quiet took 9.6 s.

Then it's yours. Pick up any piece with your fingers, or say what to change: "make the dragon bigger", "add rain". Pick a lens from 18 to 135 mm and snap: the frame goes on a storyboard with its lens, height, distance and eyelines. Step inside and the set grows to full size around you; point at the floor and pinch to walk it. Record a take, carry an actor across, and they walk it back.

You leave with a board image, a shot list and a short animatic, every number measured from where the pieces stood. Your voice becomes text on the headset: the designer is sent the words, the list of pieces on the set and, for its look, the camera's picture, never your voice. If it can't be reached, a reader built into the app builds from the library's 51 pieces, and nothing else depends on it.

How I built it: Immersive Web SDK in the Quest Browser, nothing to install. Passthrough makes your table the stage, hit testing lands the set where you point with no room scan, and hands do everything. The designer is a server function giving Claude the catalog and a strict reply format; each piece lands as soon as its line is complete. On a Quest 3S the app ran at a median of 89.9 frames a second in normal use, never under 60 (48 samples over three days). [X, the number on the submitted build.]

Not yet proven on the headset: the designer's time there, a real voice heard with no word list, and the set returning to the same spot after a relaunch. [X, update after the next headset session.]

[X, measured: one unbroken take, headset on to a six-frame board, in minutes.]

[X, Jonathan: future plans, and who you wrote to.]
```

## Hand interactions, and what excites me about VR

```
Everything is done with hands. Reach out and pinch a piece, or close your fist on it, and it comes with you. Point and pinch for anything further away. A pinch held on the striped edge moves the whole set. Twisting your wrist turns what you're holding, and tilts the camera. I measured my own hand to set where a fist starts, because the first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. Held actors squirm a little in your fingers, and you can turn that off.

Nobody has to learn what to do with a tiny wooden actor. You pick it up. And nobody has to learn a menu to build a set: you say it, and then you pick it up. At full size, you point at the floor and pinch to walk the set without standing up.
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
