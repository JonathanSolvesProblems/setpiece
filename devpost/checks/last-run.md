# Live site checks

Run on 2026-11-17 18:02 UTC against https://setpiece.jonathansolvesproblems.com/ by `node tools/check-live.mjs`. Build served: daeac08-20261117T1801.

**54 of 54 passed.**

| Check | Result | Detail |
|---|---|---|
| the page answers over HTTPS | pass | 200, 134 ms |
| it is Setpiece | pass |  |
| search engines are allowed to index it | pass | no X-Robots-Tag |
| the loading card is in the page | pass |  |
| the page controls start locked until the set is ready | pass |  |
| the page signs itself | pass |  |
| the app script is named in the page | pass | assets/index-CXV5YQNt.js |
| version.json is served | pass | 200 |
| version.json names a build | pass | daeac08-20261117T1801 |
| the app script is served | pass | 200, 2.74 MB |
| the app script is under 3 MB | pass | 2.74 MB |
| the served script carries the same build as version.json | pass |  |
| the voice words include the directing words | pass | 2 chunks |
| the icon library is not in any chunk | pass |  |
| the headset panel is served | pass |  |
| the panel has btn-snap | pass |  |
| the panel has btn-record | pass |  |
| the panel has btn-voice | pass |  |
| the panel has btn-life | pass |  |
| the panel has tab-assets | pass |  |
| the panel has btn-find-table | pass |  |
| the panel has btn-more | pass |  |
| the panel has btn-shelf-more | pass |  |
| the panel has btn-undo | pass |  |
| the panel has btn-inside | pass |  |
| every panel element id is used once | pass |  |
| the page has the Shot box and three shots to try | pass |  |
| the set designer answers and has its key | pass | 200, ready true |
| another site is refused by the set designer | pass | 403 |
| a sentence comes back as a set with a horse in it | pass | 200, end_turn, first piece of the reply at 1784 ms, whole 3050 ms |
| the reply carries a pass for the line it will speak | pass | "A horse stands in an open field by a tree and fence at dawn," |
| the reply streams: its first part arrives well before its last | pass | 57 parts, the first 1849 ms after the request and the last at 3049 ms |
| the voice answers and has its key | pass | 200, ready true |
| the designer's line comes back read aloud | pass | 200, audio/mpeg, 46855 bytes in 377 ms |
| words with no pass, or with the pass of another line, are not read | pass | 403, 403 |
| another site is refused by the voice | pass | 403 |
| the designer's 12 recorded lines are served in both voices | pass | 24 of 24 files |
| baked type BigShoulders-Medium is served with its page | pass | 200/200 |
| baked type BigShoulders-Bold is served with its page | pass | 200/200 |
| baked type BigShouldersStencil-Bold is served with its page | pass | 200/200 |
| baked type BigShouldersStencil-Black is served with its page | pass | 200/200 |
| baked type SchibstedGrotesk-Medium is served with its page | pass | 200/200 |
| baked type SchibstedGrotesk-SemiBold is served with its page | pass | 200/200 |
| the scene file is served | pass |  |
| the recogniser is served | pass | 200, 1146 bytes |
| the preview image is served | pass | 200, 159233 bytes |
| the icon is served | pass | 200, 360 bytes |
| the loading card drawing is served | pass | 200, 105024 bytes |
| the clap is served | pass | 200, 26504 bytes |
| the press tick is served | pass | 200, 5336 bytes |
| the heavy knock is served | pass | 200, 19448 bytes |
| the air of a night set is served | pass | 200, 198494 bytes |
| the voice model is served, 40 to 45 MB | pass | 200, 41.1 MB |
| a wrong address is a 404, not a soft 200 | pass | 404 |
