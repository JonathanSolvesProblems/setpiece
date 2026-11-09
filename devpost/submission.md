# Submission form

One field per block. Nothing in a block but the value. Open values are marked `[X ...]` and the form is not filled in until none remain. Every number traces to `sources.md`.

## Name

```
Setpiece
```

## Tagline

```
Block a VFX shot on your kitchen table with your hands and leave with the storyboard. Hands only, 90 frames a second on a Quest 3S.
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

On a real creature shoot the stand-in is a tennis ball on a stand, raised to the creature's eye height. Joe Bauer, the visual effects supervisor on Game of Thrones, put it this way in befores & afters in 2023: "When Daenerys' dragons were 3' long they were tennis balls on sticks." Scott Squires, who supervised Dragonheart: "Trying to get actors to look where you need them to is always an issue." Setpiece is that table, a week before the shoot, on your own.

You sit down, point at the table and pinch. A 1:10 set lands on it, in your real room. You pick up wooden stand-ins with your fingers, put the ball where the creature will be, pick a lens from 18 to 135 mm and look through the camera. The monitor shows what that lens sees. Snap, and the frame goes on a storyboard with its lens, camera height, distance and eyelines already written on it.

Record a take and carry an actor across the set: they walk it back to you, in step. Add a second camera and cut between the two while you record. Say "a Mexican standoff after a car chase" and three actors take their marks, each aiming at the next, with two crashed cars behind them. Rain over a fire puts it out, and a car that hits an actor knocks them down, because a blocking problem you can't see is one you find on the day.

You leave with a board image, a shot list and a short animatic. Every number on the board is measured from where the pieces stood at that moment. Nothing on it is estimated or generated, and voice runs on the headset, so what you say stays there.

How I built it: Immersive Web SDK in the Quest Browser, nothing to install. The set is 51 hand-built pieces and 10 starting scenes, made in code as plain maquettes you paint yourself. Passthrough makes your table the stage. Hit testing lands the set where you point with no room scan at all, and scene understanding finds a labelled table when there is one. [X, only once proven on the headset: anchors bring it back where you left it.] On a Quest 3S it held 90 frames a second through two sessions of normal use (the median of 59 one-second samples; the lowest was 65.5, in the first minute). A second view of the set is drawn only on frames where something moved, which is how a live monitor fits inside the frame budget. Meta's metavr tooling did the docs lookups during the build [X, once run on the device: and a Perfetto trace of a session].

[X, measured: one unbroken take, headset on to a six-frame board, in minutes.]

[X, Jonathan: what you want to do next, in your words, and the person you wrote to: "I've written to <name>, a <storyboard artist / previs supervisor>, to put it in front of <them> before <date>."]
```

## Hand interactions, and what excites me about VR

```
Everything is done with hands. Reach out and pinch a piece, or close your fist on it, and it comes with you. Point and pinch for anything further away. A pinch held on the striped edge moves the whole set. Twisting your wrist turns what you're holding, and tilts the camera. I measured my own hand to set where a fist starts, because the first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. Held actors squirm a little in your fingers, and you can turn that off.

What excites me is that hands make a skill people already have useful. Nobody needs to learn what to do with a tiny wooden actor.
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
