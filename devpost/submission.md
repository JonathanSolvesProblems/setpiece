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
About ten years ago I made short VFX films for YouTube: lightning in a field, a creature floating next to me in the woods. Every effect went in on a computer weeks after the shoot. On the day I was reaching for something that wasn't there and framing the shot around empty air. I switched to computer science after that.

Setpiece is a miniature film set on your real table, for a director planning a shot. You say the shot out loud, an AI set designer builds it at one-tenth scale, you move the actors and the camera with your hands, and you leave with a storyboard and a shot list. It's the table I needed back then.

## The first minute

Open the link in the Quest Browser, sit at a table, press Enter XR. Point at the table and pinch, and a film set lands on it. The set designer builds a first set by itself and says out loud what it built. Then a small arrow points at Talk. Say "a night chase, a red car racing past a burning truck, two actors running at camera, a dragon on a rooftop". The pieces drop onto your table one at a time as it writes them, with the actors posed, the light set for night and the camera placed. What the library doesn't have, a castle gate or a market stall, it builds from simple wooden shapes. Then it looks through its own camera and reframes if the shot is off.

## Then it's yours

Pick up any piece with your fingers, or say what to change: "make the dragon bigger", "add rain". Pick a lens from 18 to 135 mm and snap, and the frame goes on a storyboard with its lens and height. Say "cover it" and it plans a wide and closer shots, then shoots them onto the board while you watch. Step inside and the set grows to full size around you. You leave with the board as an image, a shot list and a short animatic. The set, its light and the board are kept, so the next day you sit down to the same shot.

## How it's built

Immersive Web SDK in the Quest Browser, nothing to install. Passthrough makes your table the stage: the set sits at arm's reach where you pointed, and you lean round it the way you would lean round a model. Hit testing lands it with no room scan, a spatial anchor holds it there, and hands do everything. Speech becomes text on the headset; the designer gets the words, the list of pieces and the camera's picture, never your voice. The designer is Claude behind a server function, answering one piece a line, so each piece lands as soon as its line is written. Code then checks its work: an actor it stood inside a car is moved out before the camera is placed. ElevenLabs reads its replies aloud. Take the designer away and there is still a tool: a reader built into the app builds from the library's 51 pieces, and everything by hand works.

## Measured

On a Quest 3S I spoke two sentences in my own words. Both times the first piece was on the table 1.6 s after I stopped speaking, and the whole set stood at 3.3 s and 3.7 s. With both hands tracked, the designer's sets ran at 87 to 89 frames a second standing and 71 to 83 with a piece moving. Going through it as a first visit on the live site, my own spoken shot was a frame on the board 53 seconds after I pressed Enter XR, and standing inside a full-size set the designer had just built, it held 86 to 89 frames a second.

## Not yet proven

Cover it and moving through the full-size set by pulling it have run on the live page and in the emulator, not yet on the headset. Every headset session so far has been in my own room.

## What's next

Two people around the same set: a director and a DP each with a headset, moving the same pieces and arguing over the same frame. Taking the board out to the tools a crew already uses, so a frame here opens as a camera in a 3D package. More of what the designer now has to build from shapes: interiors, crowds, animals. And rooms that aren't mine.
```

## Hand interactions, and what excites me about VR

```
Everything is done with hands. Reach out and pinch a piece, or close your fist on it, and it comes with you. Point and pinch for anything further away. A pinch held on the striped edge moves the whole set. Twisting your wrist turns what you're holding, and tilts the camera. I measured my own hand to set where a fist starts, because the first version only worked if you pointed in a straight line and pinched, and my hand kept trying to just grab the thing. Held actors squirm a little in your fingers, and you can turn that off.

A newcomer is walked through once: the designer says each step out loud and a small arrow points at the button or the piece, and it can be skipped. Nobody has to be taught what to do with a tiny wooden actor, and building a set has no menu: it's one spoken sentence. At full size, you pinch the air and pull to move through the set, and twist your wrist to turn it, without standing up.
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
