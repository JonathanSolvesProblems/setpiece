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

Point at your kitchen table, pinch, and a 1:10 film set lands on it in your room. A set designer builds a first set by itself to show how it goes, says aloud what it built, and tells you the next one is yours. So say the shot: "a night chase, a red car racing past a burning truck, two actors running at camera, a dragon on a rooftop". It says what it is building, and the pieces drop onto the table one by one as it writes them, posed, painted, cast as a man or a woman and at true scale, with the camera placed and given a lens, and the light chosen: a night chase is night, a duel at sunset golden hour. What the library lacks, it makes from simple wooden shapes: a rooftop, a castle gate. Code checks its work: an actor it stood inside a car steps out before the camera is placed. Then it looks through that camera, with what each piece covers measured beside the picture, and reframes the shot, up to twice. From a desktop the first piece lands a median of 1.3 s after the request (7 sentences, 0.9 to 1.9 s; the night chase 0.9 s), and 1.0 s for the first request after an hour's quiet.

Then it's yours. Pick up any piece with your fingers, or say what to change: "make the dragon bigger", "add rain". Pick a lens from 18 to 135 mm and snap: the frame goes on a storyboard with its lens, height, distance and eyelines. Or say "cover it": the designer plans the coverage, a wide then closer shots, and shoots each one onto the board while you watch. Step inside and the set comes off the table and grows to full size around you, into its own sky; point at the floor and pinch to walk it. Record a take, carry an actor across, and they walk it back.

You leave with a board image, a shot list and a short animatic, every number measured from where the pieces stood. Your voice becomes text on the headset: the designer is sent the words, the list of pieces on the set and, for its look, the camera's picture, never your voice. Its reply is read aloud by ElevenLabs, in her voice, his or none; that voice reads only lines the designer wrote, and it says each step to a newcomer once, so nobody has to read a manual in a headset. If it can't be reached, a reader built into the app builds from the library's 51 pieces, and nothing else depends on it.

How I built it: Immersive Web SDK in the Quest Browser, nothing to install. Passthrough makes your table the stage, hit testing lands the set where you point with no room scan, and hands do everything. The designer is a server function giving Claude the catalog and a strict reply format; each piece lands as soon as its line is complete. Claude thinks before it answers, and on a busy sentence that left the table empty for seconds; one line asking it to begin at once cut the slowest tenth of first pieces from 5.0 s to 2.1 s, measured on 33 sentences asked both ways, with no more sets flagged. On a Quest 3S, with both hands tracked, the designer's sets (6 to 14 pieces) ran at 87 to 89 frames a second standing and 71 to 83 with a piece moving, and no shader is compiled while a set goes up. The fourteen sounds are synthesised, not sampled: a knock as each piece lands (lower for a truck), the clap on Snap, crickets once you step inside a night set.

On the headset, a sentence in my own words, heard with no word list, put the first piece down 1.6 s after I stopped speaking and the whole set at 3.3 s (one sentence). Not yet proven: the set returning to the same spot after the headset resets its boundary; when it does not, a clap brings it back to land where you point.

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
