# Rounds 10 to 13

## Round 9 (blind critic: 5/10)

The critic's hits and what was done:

1. A grey void around the slate, one hard light, black shadows. Fix: a tabletop under the stage in the flat preview (hidden in XR, where the real table is), a hemisphere fill so shadows are shaded, and a small cool practical on the monitor.
2. Figures with their backs to the viewer, identical stiff poses. Fix: the creature moved to the front right and the actors turned three-quarter toward it; a stance per lay figure (A points at the mark, B stands with a hand on the hip and a foot forward).
3. The 85 mm snap landed on a headless torso; thumbnails illegible inside the scene. Fix: the lens tilts on its own to the nearest actor's eyes (yaw stays with the rig), and the storyboard is rendered on the page under the frame at page scale, with the lens and camera height on each frame.
4. Two stripe vocabularies, the 2D bar on the frame and the 3D stripe on the stage. Answered, not changed: the slate on the table is the object and the page frame quotes it; the bar now runs the full width of the frame (round 11 fix) so it reads as the slate's top edge rather than a decal.
5. The bottom of the first screen unresolved, controls 20 px from the fold. Fix: the readouts and the controls merged into one strip on the slate's face; the board under the frame; the left column ends on the board's line.
6. "LENS" twice, inside and outside the frame. Fix: the lens picker is the readout.
7. Tracked-caps microlabels and debug values. Fix: tracking cut to 0.02 em, labels 15 px, values written as a line ("A looks up 30°", "2 of 6").
8. Enter XR button and caption misaligned. Fix: caption under the button.
9. Snap and Reset used the same underline as the active lens. Fix: Snap is an outline button, Reset a text button, the active lens the only underline.
10. A dark tab at top centre. It was the emulator's overlay, not the page; captures now hide it.
11. Light theme a palette swap. Fix: the frame is a paper card with a pencil-weight outline, and the stage inside stays dark in both themes, because a stage is dark.
12. Phone layout broken. Fix: Enter XR under the headline, a 4:5 viewport with its own camera, the frames field hidden, Snap full width.
13. Headline wedge. Fix: two even lines at 440 px.

## Round 11 (blind critic: 6/10)

1. Hard horizon line where the table plane ends in grey. Fix: a wall gradient behind the table (dark high, warmer where the key reaches) and a table with a visible front edge.
2. The stripe neither a hinge nor a bar. Fix: the full width of the frame, hanging past the left edge.
3. Dead space between the CTA and the "try it" line. Fix: the "try it" line sits under the CTA; the shot list fills the column's end, on the board's line.
4. Two primary buttons. Fix: Snap frame is an outline button; Enter XR is the only filled one.
5. Phone: Enter XR on a device that cannot enter XR, viewport cropping the set. Fix: when the browser cannot run an immersive-ar session the button becomes "Copy the link for your Quest" and copies the address; the portrait camera backs off so the whole set fits.
6. Three tops within 20 px. Fix: headline cap top on the stripe's line.
7. Labels 9 px, "A" unlabelled in the scene. Fix: labels 15 px; chalk name tags over A, B and the creature, on a render layer the shot lens does not see.
8. Light viewport muddy. Fix: dark stage inside the paper frame.
9. Default scrollbar. Fix: thin, in the rule colour.
10. Phone wordmark near headline size. Fix: 104 px on phone.

Not changed: the tripod and figure shadows come from one key light; the critic's two-direction reading was the monitor's reflection.

## Round 12

Strip wrapped to two lines at 704 px and pushed the board under the fold; the name tags read too small and the creature's sat on the frame's top edge. Fix: tighter strip, tags 7 cm wide, camera backed off 10 cm.

## Round 13 (blind critic: 5/10)

Deployed to https://setpiece-xr.vercel.app and verified there in both themes and sizes. The critic's
hits and what was done in round 14:

1. Four yellow lines converging on the ball: two were the real eyelines, two were the eyelines as seen
   by the shot lens, drawn inside the monitor. Fix: the eyelines moved to the layer the lens does not
   render, so a frame shows the shot alone.
2. The storyboard row jumped after the first snap (the shot list grew and the end-aligned board moved
   down). Fix: both start-aligned; the board stays put, the list grows.
3. The frame count sat between the lens and the eyeline. Fix: the count moved beside the shot list.
4. Eyeline reported A only. Fix: "A up 30° · B up 35°".
5. Three button styles. Fix: one family at one size and weight: filled, outline, text.
6. Phone: no instruction above the viewport, the creature's tag clipped. Fix: the "try it" line above the
   frame, the portrait camera shifted.

Not changed, and why: the critic's "default Three.js room" is the remaining gap and it is 3D work (a
mounted monitor, a fuller backdrop, better materials on the figures and the ball). The scores across
rounds 9, 11 and 13 were 5, 6 and 5 from three critic instances that disagreed with each other on the
stripe, the bottom edge and the light theme. The loop is paused here; the hackathon's critical path (the
first on-device run) comes first, and the next design round should start with the scene, not the page.

## Round 14

Captured and deployed; lint clean. Last blind critic score: 5/10 (target 3 or under, not reached).
