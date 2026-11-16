# Submission form

One field per block. Nothing in a block but the value. Open values are marked `[X ...]` and the form is not filled in until none remain. Every number traces to `sources.md`.

## Name

```
Setpiece
```

## Tagline

```
Say a film shot out loud and a 1:10 set starts building on your table within two seconds. Move it by hand, leave with the storyboard.
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
I wanted to be a VFX filmmaker before I switched to computer science. In the short I'm least embarrassed by, the creature went in weeks after the shoot. On the day the actor had nothing to look at and I had nothing to frame against.

Setpiece is the table I needed that week, for an indie director or a VFX supervisor in prep: say the shot, see it built at 1:10 in your own room, frame it, leave with the boards.

## The first minute

Open the link in the Quest Browser, sit at a table, press Enter XR. Point at the table and pinch, and a film set lands on it. A set designer builds a first set by itself, says out loud what it built, then hands over, and a small arrow points at Talk. Say "a night chase, a red car racing past a burning truck, two actors running at camera, a dragon on a rooftop". The pieces drop onto your table one at a time as it writes them, posed, painted and lit for night, with the camera placed. What the library doesn't have, like the rooftop, it makes from wooden shapes. Then it looks through its own camera and reframes if it needs to. The walkthrough can be skipped.

## Then it's yours

Pick up any piece with your fingers, or say what to change: "make the dragon bigger", "add rain". Pick a lens from 18 to 135 mm and snap, and the frame goes on a storyboard with its lens and height. Say "cover it" and it plans a wide and closer shots, then shoots them onto the board while you watch. Step inside and the set grows to full size around you. You leave with the board as an image, a shot list and a short animatic.

## How it's built

Immersive Web SDK in the Quest Browser, nothing to install. Passthrough makes your table the stage, hit testing lands the set where you point with no room scan, a spatial anchor keeps it there, and hands do everything. If the set is out of view, an arrow points back to it. Speech becomes text on the headset; the designer gets the words, the list of pieces and the camera's picture, never your voice. It's Claude behind a server function with the catalog and a strict reply format, so each piece lands as soon as its line is written, and code checks its work: an actor it stood inside a car is moved out before the camera is placed. ElevenLabs reads its replies, and only lines it wrote. Without it, a reader built into the app still builds from the library's 51 pieces.

## Measured

On a Quest 3S, two sentences in my own words put the first piece down 1.6 s after I stopped speaking, and the whole set at 3.3 s and 3.7 s, the second on this live site. Asking the designer to begin at once cut the slowest tenth of first pieces from 5.0 s to 2.1 s, over 33 requests each way. With both hands tracked, its sets ran at 87 to 89 frames a second standing and 71 to 83 with a piece moving.

## Not yet proven

Cover it and stepping inside have run on the live page and in the emulator, not yet on the headset. Nor has the set coming back to the same spot after the headset is closed and opened again, or any room but mine.

[X, measured: one unbroken take, headset on to a six-frame board, in minutes.]

[X, Jonathan: future plans, and who you wrote to.]
```

## Hand interactions, and what excites me about VR

```
Everything is done with hands. Reach out and pinch a piece, or close your fist on it, and it comes with you. Point and pinch for anything further away. A pinch held on the striped edge moves the whole set. Twisting your wrist turns what you're holding, and tilts the camera. I measured my own hand to set where a fist starts, because the first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. Held actors squirm a little in your fingers, and you can turn that off.

A newcomer is walked through once: the designer says each step out loud and a small arrow points at the button or the piece, and it can be skipped. Nobody has to learn what to do with a tiny wooden actor. You pick it up. And nobody has to learn a menu to build a set: you say it, and then you pick it up. At full size, you point at the floor and pinch to walk the set without standing up.
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
