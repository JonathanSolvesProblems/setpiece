# Submission form

One field per block. Nothing in a block but the value. Every number traces to `sources.md`. The answers to the form's other questions (contact, team, hand interactions, capabilities) are not kept in the repo.

## Name

```
Setpiece | An AI film set that builds on your table
```

## Tagline

```
For filmmakers: say a shot and a miniature set starts building on your table about two seconds later. Move it by hand, keep the storyboard.
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
## Inspiration

About ten years ago I made short VFX films and put them online: lightning striking a back yard, a second copy of me on the couch, fire bursting out of the ground in the woods. Every effect went in on a computer weeks after the shoot. On the day I was framing the shot around empty air, with nothing for the actor to look at.

A director works that out before the shoot day, with a storyboard, and on a creature shoot with a tennis ball on a stand where the creature's eyes will be. I wanted to do that pass at my own table, with my hands, before anyone is on set.

## What it does

Setpiece is a miniature film set on your real table, for the storyboard pass a director does before a shoot day. You say the shot out loud, an AI set designer builds it at one-tenth scale, and you move the actors and the camera with your hands. You leave with a six-frame storyboard and a shot list (a spreadsheet with the lens and camera height of every shot) to send to the crew.

**The first minute.** Open the link in the Quest Browser, sit at a table and press Enter XR. Point at the table and pinch, and a film set lands on it. The set designer builds a first set by itself and says out loud what it built, then a small arrow points at Talk. Say "a night chase, a red car racing past a burning truck, a dragon on a rooftop". The pieces drop onto your table one at a time, posed, lit for night, with the camera placed. What the library doesn't have, like a castle gate, it builds from simple wooden shapes. Then it looks through its own camera and moves it if the shot is off.

**After that, by hand.** Pick up any piece with your fingers, or say what to change: "add rain". Actors hold what the scene needs (a sword, a rifle, a torch), sit, ride a horse or a dragon, and act: ask for a sword fight and they fight. A tennis ball on a stand marks where the creature's eyes will be, and each frame records how far every actor looks up at it. Pick a lens from 18 to 135 mm and snap, and the frame goes on the storyboard with its lens and camera height. Press Shoot coverage and the designer plans a wide shot and closer ones, then shoots them onto the board while you watch. Step inside and the set grows to full size around you. Say "an anime sword fight" and the set turns cartoon; say "sketch" and the board is drawn in pencil.

**The set reacts.** Pieces answer each other. Let an actor go above a car and they stand on its roof; a crate lands on the truck; a rider goes where the horse or the dragon goes. Add rain over a fire and the fire goes out, then catches again when the rain moves away. These are rules I wrote, not a physics engine, so the set stays a place you can direct: nothing falls over unless something drove into it.

Up to four boards are kept, and your set and board are there when you come back.

## How I built it

Immersive Web SDK in the Quest Browser, in passthrough: the set lands where you pointed, found by the headset's own surface detection with no room scan. You ask by voice and handle everything by hand; no controller is needed. The designer is Claude behind a small server, answering one piece at a time, so each piece lands as soon as it is written. Code then checks its work: an actor it stood inside a car is moved out before the camera is placed. If the designer can't be reached, the app still builds from its own library of 51 pieces.

The speech recogniser runs in the browser on the headset, and the designer's replies are spoken back by an ElevenLabs voice. A script in the repo (`tools/check-claims.mjs`) reads the result files and fails the build when a number in the README or on this page no longer matches them. A second one runs 57 checks against the live site, and its last run is committed.

## Challenges I ran into

Grabbing. The first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. So I measured my own hand: closed, it reads 0.7 of the palm's length from wrist to middle knuckle, and open 1.5 to 1.8. A fist now picks things up.

The designer composes a shot well and stands people inside cars. Graded by rule on 16 sentences, 13 of its sets had nothing to flag as it wrote them, and 15 after the code that moves pieces apart. That code had its own day: a knight I asked for was knocked off by his own horse, because the horse had been nudged clear of him and the set took that for a horse hitting a man.

Frame rate with both hands tracked. On Nov 11 a set of three actors, a horse and a truck ran at 66 to 68 frames a second, 12.8 ms of JavaScript a frame against a budget of 11.1. The next day the same set ran at 73 to 82.

The slow first piece. One line added to the designer's instructions, asking it to begin its answer at once, cut the slowest tenth of first pieces from 5.0 s to 2.1 s.

## Accomplishments that I'm proud of

I say a shot and the first piece is on my table 1.6 seconds later. Measured, on a Quest 3S:

Two sentences spoken in my own words (Nov 15 and 16): the first piece was on the table 1.6 s after the recogniser had my last word, both times, and the whole set stood at 3.3 s and 3.7 s. Bigger sets on Nov 17 took 4 to 7 s. On Nov 14, with both hands tracked and the designer's replies replayed, its sets ran at 87 to 89 frames a second standing and 71 to 83 with a piece moving. Going through it as a first visit on the live site (Nov 16), my own spoken shot was a frame on the board 53 seconds after I pressed Enter XR (68 on an earlier run that day). On Nov 17, Shoot coverage planned six shots and had all six on the board 25 seconds after I pressed it.

## What I learned

Let the model propose and have code check it. The designer writes a set in a few seconds, and an actor it stood inside something is moved out before you see it.

Send the answer a piece at a time. The whole set still takes a few seconds, but something lands at 1.6, and that is when it starts to look like someone is building.

The emulator is not the headset, so this page says which is which. Not yet run on the headset, only in its emulator: a controller in place of a hand, a board's tab bringing its set back as well as its frames, a saved board's picture downloading when the session ends, sizing with two hands, the lens and camera words ("eighty five", "wider"), rolling vehicles, and building without the designer. One room, mine. On Nov 17 and the night after, the heaviest sets (rain, fire, a dragon, four actors fighting) ran at 52 to 61 frames a second on the table with the headset's screen recorder running, and 76 at full size. I have not measured them with the recorder off.

## What's next for Setpiece

First, that list on the headset. Then two people around the same set, a director and a camera operator each with a headset, working on the same frame. Not built yet: a camera that follows the action, and stepping in to play one of the actors yourself.
```
