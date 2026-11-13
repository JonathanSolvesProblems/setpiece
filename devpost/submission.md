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
I wanted to be a VFX filmmaker before I switched to computer science. The short I'm least embarrassed by has a creature added weeks after the shoot. On the day there was nothing for the actor to look at and nothing to frame against.

Setpiece is the table I needed a week before that shoot. It is for an indie director or a VFX supervisor in prep: a board for each scene, built in the days before the shoot and opened again on the day.

You sit down, point at your kitchen table and pinch. A 1:10 film set lands on it, in your real room. Then you say the shot: "a night chase, a red car racing past a burning truck, two actors running at camera, a dragon on a rooftop". A set designer reads the sentence and the set as it stands, and the pieces drop onto the table one by one as it writes them: posed, painted, at true scale, with the camera stood, aimed and given a lens for the shot. What the library does not have, it makes from simple wooden shapes: a rooftop, a castle gate, a cafe table. Then it looks through the camera it placed: it is shown the camera's picture and a report measured from the pieces (what covers the frame, what is cut off, what stands in front of what), and moves the camera until the subject reads. From a desktop the first piece lands a median of 1.8 s after the request.

Then it's yours. Pick up any piece with your fingers. Say what to change: "make the dragon bigger", "add rain", "low angle on the dragon". Pick a lens from 18 to 135 mm, look through the camera, snap: the frame goes on a storyboard with its lens, camera height, distance and eyelines written on it. Step inside and the set grows to full size around you; point at the floor and pinch to walk it. Record a take and carry an actor across the set, and they walk it back to you.

You leave with a board image, a shot list and a short animatic. Every number on the board is measured from where the pieces stood. Your voice is turned into text on the headset; only the words go to the designer. If it can't be reached, a reader built into the app builds what it can from the library's 51 pieces, and nothing else depends on it.

How I built it: Immersive Web SDK in the Quest Browser, nothing to install. Passthrough makes your table the stage, hit testing lands the set where you point with no room scan, and hands do everything. The designer is a small server function that gives Claude the library's catalog and a strict reply format; the headset reads the reply as it streams and puts each piece down as soon as its line is complete. On a Quest 3S the app ran at a median of 89.9 frames a second in normal use, never under 60 (48 samples over three days). [X, the number on the submitted build.]

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
