# Phase 0 card

Filled in on 2026-10-24, after the first three commits (the card process arrived
on 2026-10-23). Every field is from evidence: the competition pages, the 2025
winners' announcement, the 2025 gallery, the live gallery (dark), rate cards,
and the repo. Long-form reasoning: `~/.claude/hackathon-archive.md`, section
"Gate checks, long form", and the rules cited in brackets.

## 1. Event, odds, currency [rules 16, 29, 75, 79, 92]
- Event, deadline, results date: Meta VR Start Developer Competition 2026 (Devpost). Deadline Nov 18, 2026, 3:00 pm EST. Judging on or around Nov 18 to Dec 9. Winners on or around Dec 11, 2026.
- Entries (gallery count, or last edition's): gallery unpublished on Oct 24. 3,865 participants on Oct 24. Last edition: 2,900 participants, 655 submissions (22.6%), so expect about 870 submissions. Two random 2025 gallery pages put productivity/utility at 2 of 24 each, about 8%, so about 70 productivity entries split across New and Adapted; New Productivity is likely 40 to 60 entries.
- Prizes I am eligible for, and the track I enter (smallest defensible, plus every parallel track): Best New Productivity Experience $70,000 and runner-up $35,000 (the thinnest of the three tracks, and the only one that names "creative tools"). Parallel, decided across all tracks: Best First Five Minutes $25,000, Best Reason to Come Back $25,000, Boldest Original Concept $25,000, Best Accessibility Forward Experience $25,000, Judge's Choice 2 x $20,000. Best Agentic Interaction $25,000 only if a real model loop ships (field 4). Not Social & Multiplayer.
- What the event pays out for (its currency), and proof I can produce it in the window: a hands-first, seated experience a judge launches from a link and has a complete, polished moment with in ten minutes, scored 25% each on Innovation & Creativity, Experience Design, Technical Implementation, Polish & Presentation, after a pass/fail viability stage. Proof so far: the viewfinder, grab, table placement, anchoring and restore run in the emulator (commits 9674c7f, f81f255, 5a7d505). Not yet proven: anything on a real headset. No headset is owned or ordered on Oct 24. See field 12.
- Other builds I am running in this window: Floodplain (Nebius x NVIDIA) has its build finished and only the form and video left, due Oct 30. Watermark and Orvandel are submitted and waiting for results. No other build starts before Nov 18.
- RED: currency I cannot mint; only an open catch-all track; field over 1,000 entries while another major build is running. Status: the field is over 1,000 and Floodplain's remaining work is a submission, not a build; satisfied once Floodplain is submitted on Oct 30 and nothing else is started. The headset is the real risk and is ordered today.

## 2. The winners' verb [check 1, rules 76, 87, 93]
- Three winners of the last comparable event, and what each one's user ended the session HOLDING: Tiny Golf (2025, $100,000, casual): a mini-golf course they built with a pinch. Inkphony (2025, $100,000, lifestyle): a composition made from the objects in their room. DreamSpace (2025, $100,000, entertainment): their own room, transformed. Saber Punks (2025, $100,000, social): a fight they played.
- That in one verb, and the adjectives on its object from the title, subtitle and track text: MAKE, with your hands, in your room, seated. 2026 adjectives: "hands-first", "natural, responsive, deeply immersive", "seated, stationary", "something satisfying in 10 minutes or less", "original, not a wrapper". Productivity track: "make you more effective anywhere", "creative tools", "specific daily moments".
- What my user ends the session holding: a storyboard, a shot list with lens, camera height and distance, and the eyeline for each actor, for a creature scene they blocked on their own table with their hands, delivered to their phone.
- RED: they make and I check; I am building beside the main event (governor, watcher, infrastructure, wrapper, auditor). Status: not red. The user makes a board. The eyeline readout is a feature inside a maker, not the product.

## 3. A person, and how often [rules 12, 22, 93, 95, 98]
- The person (me, someone I interviewed, or a labelled composite) and the moment the story opens on: me. I wanted to be a VFX filmmaker and switched to computer science. The story opens on the day I shot "Pokemon in Real Life!" (51 s, youtube.com/@jonathanandrei6411) on a Canon T5i: the creature was added weeks later, so on the day there was nothing for the actor to look at, nothing to frame against, and the eyeline was a guess I fixed in compositing.
- Times per month they hit this task: during prep for a shoot, daily. A creature scene gets re-blocked several times a week before the shoot day, and a working storyboard artist boards 15 to 25 frames a day (Seb Antoniou's 2026 rate card). Between projects, zero. The event's adjectives are hands-first and seated, not repetitive or everyday, and the Productivity track names "creative tools" as its own category beside daily habits.
- RED: no person; story opens on a statistic; under 4 a month at an event whose text says chore, repetitive, everyday or background (unless the agent keeps working on a schedule between visits); the idea came from hardware I own. Status: not red. I own no VR hardware; the idea came from the shoot, and the device is the event's.

## 4. The loop [rule 103]
- "At step X the model chooses between A, B and C, based on what it just observed": there is no model in the track entry, and that is by design for this event. 0 of the 4 2025 track winners used a model. The sponsor's primitive is Horizon OS and the Immersive Web SDK, not a model. The hard requirements and all four criteria never mention AI; Meta's AI framing is development tooling (Meta VR CLI) plus one $25,000 special award. Rule 103 is written for agent hackathons. If the core ships by Nov 8, the Agentic Interaction award gets a real loop: a voice-blocking agent that, at each turn, looks at the current viewfinder render and chooses between moving a piece, changing the lens, moving the camera, or snapping the frame. If it does not ship, the award is not claimed and no agent is described.
- RED: no real branch; the model only classifies or summarises at steps my code fixed; the only agent-framework object is a chat. Status: not applicable to the track entry (platform event, no model); the special award is conditional and will not be described unless the branch above exists in code.

## 5. Where the result lands [rules 4, 27, 33, 101, 103]
- The system the result is written into, which the user already opens (email, ticket, PR, filing, calendar, the sponsor's product): the filmmaker's phone and prep documents. "Send board" builds a PDF contact sheet (every frame with lens, camera height, distance and eyelines) and a CSV shot list in the columns StudioBinder and Google Sheets import, uploads both, and shows a QR code in the headset; the phone opens the PDF before the headset comes off.
- What the agent keeps and does on its own after the first run: the stage, every piece, the frames and the shot list persist (room anchor plus local storage), so the next session opens with the set where it was left and the board intact, and shots accumulate across sessions.
- RED: the only destination is a page I built; nothing persists; nothing happens after the report. Status: RED on Oct 24 (the board is a strip inside the app). Fix: build Send board with the QR hand-off by Nov 5, on the same Vercel host the submission allows. Stage persistence is done; piece and shot persistence ships with it.

## 6. The headline number [check 5, rules 59, 65, 67, 102, 104]
- The number, in world units (seconds, dollars, cases, people): minutes from headset on to a six-shot board open on the phone, in one unbroken take; target under 10 minutes, which is the brief's own bar, with the first frame under 60 seconds for Best First Five Minutes.
- Who grades it, that I did not build and cannot influence: the clock in an unbroken screen recording that anyone can time, against the brief's own ten-minute threshold, and against published rate cards for the human alternative: 15 to 25 frames per day at £450 (Seb Antoniou, 2026), $450 to $700 a day for a senior storyboard artist (StoryboardArt.org, 2026). Plus three people outside the project doing the six-shot task cold, timed, by Nov 12.
- The sponsor-model call that produces it: none; this is a platform event. The number is produced by hand tracking, scene understanding and anchors on a real Quest 3S, not in the emulator.
- Can it be collected (would a busy stranger answer this in one sentence): yes. "It took me seven minutes" is a sentence.
- If the system beats an official record, that sentence, written as a win: none exists.
- RED: my code grades my code; a counterfactual my code both causes and counts; it needs information counterparties withhold. Status: RED on Oct 24 because the number does not exist (no device). Fix: measured on device by Nov 7. If the unbroken take is over ten minutes, cut scope until it is under; the number is the criterion.

## 7. Sponsor surface [check 6, rules 72, 88, 97, 105]
- The sponsor's primitive (models, APIs, tools, SDK features, managed services, data volume): Horizon OS features through the Immersive Web SDK: hand tracking (one-hand, two-hand and distance grab, pinch), gaze targeting on the VR Glasses profile with head fallback, scene understanding (planes and labelled bounded meshes), persistent spatial anchors, passthrough, spatial UI (UIKitML, Horizon kit), spatial audio; and the development tooling the brief names: Meta VR CLI, IWSDK CLI, the IWER emulator.
- Every service and bonus item the brief lists, with my planned use beside each: "Build hands-first": every action is pinch or grab, no controller needed (done). "Explore new tech across Meta VR Glasses and Meta Quest": gaze targeting on the glasses profile (to do), scene understanding (done), anchors (done), passthrough (done). "Accelerate your development with AI tooling, including Meta VR CLI": the build loop runs through the IWSDK CLI and emulator automation; named with specifics in "how I built it" (bonus item, must not be skipped). "Getting Started with Hands & Eyes" tutorial: applied for gaze. Special awards: First Five Minutes (instant-on, first frame under 60 s), Reason to Come Back (persistent set and board), Accessibility Forward (gaze plus pinch, 48 dp targets, a voice alternative if time allows), Boldest Original Concept.
- Winners' or nearest neighbours' count of that primitive, against my planned count: Tiny Golf used hands, passthrough and a course creator (3). The 2025 hand-interaction award winners used several grab and gesture types. Mine: 7 platform features plus 3 CLI tools; the one still unbuilt is gaze.
- Data size, against what the sponsor's product is for: no data product. The size axis here is content depth: placeable pieces (4 today, target 12 or more: actors in poses, creature sizes, props, a light, a dolly track), lens presets (4, target 6), export formats (0, target 2).
- The ablation (same task, sponsor switched off) and what I expect it to show: hands-only is the hard requirement and is the first ablation. Without scene understanding the stage floats in front of you; without anchors, 0 of 5 relaunches restore the set against 5 of 5 with them. Both measured on device and stated in the product.
- RED: my count is below the winners' median; a named bonus skipped; the product still works with the sponsor switched off. Status: not red if gaze ships and Meta VR CLI is credited with specifics. Without the platform there is no product.

## 8. The crowd, measured [check 7, rules 30, 71, 94, 99]
- Gallery search terms, and how many taglines state my thesis (or funded products, if the gallery is dark): gallery unpublished on Oct 24 ("The hackathon managers haven't published this gallery yet", checked by HTTP). Proxies: the 2025 gallery had 1 previs entry in 655 ("Previs to Render Pipeline"). Funded products in the space: FrameForge, Previs Pro, Cinetracer, Shot Designer, Unreal virtual scouting, so by rule 94 assume ten or more entrants will touch previs or storyboarding; none of those products is hands-first tabletop MR. Meta's own inspiration list includes Table Troopers, a tabletop MR game, so the tabletop format is one the sponsor likes.
- Did that crowd win last time? The biggest neighbour's size number, against mine: the previs crowd was one entry and did not place; too small to read. The sentence no competitor can say: "I shot a creature short with nothing to look at, and this is the table I needed." Depth targets in field 7 are how I stay the biggest build if the lane turns out crowded.
- devpost.com/stephensookra checked (Devpost events): checked Oct 24. His recent entries (Reproof, Pru, Showhand, Labelhand, Soundcheck, Loka Pay, Lullabuy, Pace, Attest) include no Meta VR Start entry, and his winning shape (operator tools on public rules) is not this event's.
- RED: the crowd is losing; the crowd is winning and mine is the smallest build in it. Status: not red on the evidence available; re-run the gallery search the day it opens and at T-minus 48 hours.

## 9. Who pays the sponsor [check 8, rules 69, 70, 78]
- Who pays the sponsor, and does this make them buy more: people buying Quest and Meta VR Glasses and software on the Horizon Store. Meta's glasses pitch is "a portable workspace", and the track text names creative tools. A filmmaker planning shots on the glasses is a reason to buy the glasses.
- Would the sponsor's sales team show it on Monday: yes, as a creative-professional use case for hands-first productivity on the glasses.
- RED: it argues their customers out of buying; the headline is the sponsor's product failing. Status: not red.

## 10. Traps and name [check 2, rules 40, 44, 63, 100]
- User and subject (if different, is the subject a person being measured): the same person, the filmmaker. Nobody is measured.
- The genre in three seconds, "it is X but with Y": "a storyboard and previs tool, like FrameForge, but on your kitchen table with your hands."
- Name checked in the package registry, GitHub, the hackathon gallery and my own projects: the working name Eyeline collides on Devpost with Eyeline, a film continuity tool that won IBM 1st at Agentic Cinema in September 2026, so a Devpost search would show a different film tool first. Renamed to Setpiece on Oct 24: free on npm; GitHub has an unrelated macOS window manager of that name; no VR, film or previs project found; the competition gallery cannot be searched until it opens (re-check then). The eyeline remains the feature's name.
- RED: a human subject who did not ask; no nameable genre; infrastructure as the product; the name is taken in my namespace. Status: fixed by the rename.

## 11. Pitch and tagline [check 4, rules 56, 104]
- "[person] can [want] and [outcome with a price on it]": a director prepping a creature scene can block it on their kitchen table with their hands and leave with the storyboard, shot list and eyelines on their phone in ten minutes, instead of a $450 storyboard day.
- Tagline draft, leading with the best result as a win: "Six storyboard frames, with lenses and eyelines, from your kitchen table to your phone in under ten minutes. Hands only." (120 characters; the measured time replaces "under ten minutes" once field 6 exists.)

## 12. Demo [rules 25, 54, 101]
- The final shot (the thing the verb produces, or a live success landing in field 5's system, never a number being revealed): a phone held up beside the real table, showing the PDF board with six frames, each with its lens and eyeline note, while the miniature set is still sitting on the table behind it.
- The first live end-to-end success, on real data, with the sponsor's model in the loop, by (date, day 3 at the latest): Quest 3S ordered Oct 24, delivered Oct 25, confirmed in hand Oct 28. The app is live at https://setpiece-xr.vercel.app (Vercel, production, deployed Oct 28; setpiece-kohl.vercel.app also resolves). First unbroken headset-on-to-board run on the real device by Oct 29. If it has not happened by then, everything else stops until it does.

Demo script, 75 seconds, final shot first in mind:

1. (0 to 10 s) The Pokemon short, one shot. "I shot this on a Canon T5i. The creature was added weeks later, so on the day there was nothing to look at and the eyeline was a guess."
2. (10 to 20 s) Passthrough, my kitchen table. The stage lands on it by itself. "Setpiece puts the shot on your table."
3. (20 to 40 s) Two-hand grab moves the creature. Pinch the camera, drag it, look through the viewfinder. Change the lens, the frame updates. Snap. A frame appears in the strip with the eyeline note.
4. (40 to 55 s) Three more shots in quick cuts; the strip fills.
5. (55 to 70 s) Pinch Send board. A QR appears. My phone opens the PDF: six frames, lenses, eyelines, shot list.
6. (70 to 75 s) The phone beside the table with the set still on it. Title card: Setpiece. Built with Immersive Web SDK.

## Validation on Oct 29 against the official judging, FAQ and rules pages

Read from the pages themselves (judging, FAQs, updates, rules), not from memory. What changed on the card:

- Field 1: 4,440 participants on Oct 29 (3,865 on Oct 24). At last year's 22.6% that is about 1,000 submissions. Each entry can win one prize only, the highest it qualifies for, so the special awards are a fallback, not a stack.
- Field 1: judging is two stages. Stage One is pass/fail on fit with the theme, the track and "reasonably applies the required tools and features". Stage Two is the four criteria at 25% each, by human judges; the rules say AI tools may assist judging.
- Field 5: the FAQ says "Your experience should not require a third-party device to operate." The phone hand-off stays, but as an extra: the full board (six frames, lens, camera height, distance, eyelines) must be readable inside the headset, and a judge without a phone must lose nothing.
- Field 7: judges review on Quest 3 or Quest 3S only, and the FAQ says builds must be playable on Quest 3/3S. Neither has eye tracking, so gaze on the glasses profile is dropped. What the criteria name and I can still score on: hand tracking, passthrough with the table as the play surface, scene understanding, persistent anchors, FoV-aware design.
- Field 6 and Technical Implementation: "min 60 fps" on Quest hardware and "holding up in rooms the developer never tested". Neither is measured. The stage only auto-places on a surface labelled Table or Desk; a judge whose room has no labelled table gets a floating stage. Fix: if no table arrives within a few seconds, pinch on any horizontal surface to place (hit test is already enabled).
- Experience Design: "clear onboarding" and "a rewarding, habit-forming purpose". There is no first-run guidance in the headset, and frames and shots do not persist across sessions yet.
- Polish & Presentation names sound design. The app has one chime.
- Video: "show real gameplay that honestly represents the experience... Don't lean on AI-generated video." The demo script is all real capture plus my own 2014 short.
- Teardown: the build must "remain available until the Winner Announcement" (on or around Dec 11) with no changes after Nov 18 12:00 PT. The teardown reminder moves from Dec 9 to Dec 14, and nothing is deployed after the deadline.
- Honesty fixes made today: the README claimed one-hand and two-hand grab and gaze; the scene ships distance grab only and no gaze code. README corrected.
- Bugs found and fixed today in emulated XR: the name tags and eyelines sat on render layer 1, which three.js draws in the left eye only; and a sprite threw inside the hand ray every frame. Both fixed and verified in an immersive-ar session (snap works, no errors in 15 s).
- Field 12 is overdue: the first run on the real headset was due today and has not happened. By the card, everything else waits for it.

## Build dates

- Oct 24: headset ordered, rename, card committed. Oct 25: headset delivered.
- Oct 28: public build live on Vercel; Oct 29: first unbroken run on device (field 12).
- Nov 5: Send board to phone (field 5), gaze on the glasses profile (field 7), piece and shot persistence.
- Nov 7: headline number measured on device (field 6).
- Nov 12: depth (12 pieces, 6 lenses, 2 exports), polish pass, three outside testers timed.
- Nov 14: video. Nov 16: pre-submit gate (T-minus 48 hours), gallery re-check, tagline final. Nov 18: submit.
- Submission session: teardown reminder for Dec 14, after the Dec 11 announcement (delete uploaded boards on the host; the app itself stays up as the archive), entry recorded as pending. No deploys between Nov 18 12:00 PT and the announcement.

## Verdict

**Verdict:** GO

Fixes made for each RED: field 1, the headset is ordered on Oct 24 and no other build starts before Nov 18; field 5, Send board with the QR hand-off to the phone by Nov 5; field 6, the unbroken-take number measured on device by Nov 7 and three outside testers by Nov 12; field 10, renamed to Setpiece on Oct 24; field 12, first on-device end-to-end run by Oct 31 or everything else stops.
