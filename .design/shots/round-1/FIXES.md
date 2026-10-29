# Round 1

Captured 2026-10-28 from the dev session at 1280 by 720: dark top, dark monitor section, light top, in-XR view (`artifacts/round1-*.png`). Linter: one error (a comma in the hidden h2), fixed; the rest are long dashes in Meta's generated AGENTS.md, excluded.

## Faults and exact fixes

1. The chalk drawing sits in a faintly lighter square on both grounds, because pixels of the raw slate between lum 28 and 138 kept partial alpha. Fix: alpha = (lum - 78) / 70, saturated pixels kept, green key removed; re-keyed all seven drawings.
2. The frame strip reads as a pale plank floating over the set (0.68 m wide, wider than the monitor). Fix: a storyboard card 0.344 by 0.145 m under the monitor, three frames across, two down, thumbnails laid in that grid.
3. The slate's field strip was under the camera at the left edge and invisible from the seat. Fix: the strip runs along the back edge (0.56 by 0.08 m), title at the left, fields in a row: LENS, SHOTS, EYELINE A, EYELINE B.
4. "Snap frame" and the lens numbers in the panel were left-aligned inside their boxes. Fix: `text-align: center` on `.primary` and `.lens`.
5. The SDK's own Enter XR pill duplicated the page button. Fix: `offer: "none"` in `iwsdk.config.json`; the page button and the panel button call `launchXR()`; verified the emulated session starts from the page button.
6. The wordmark was chalk on paper in the light theme. Fix: `wordmark-ink.svg` swapped in by `prefers-color-scheme: light` and `data-theme="light"`.
7. The primary button was chalk on paper in the light theme. Fix: background `var(--ink)`, text `var(--ground)`.

Kept as is: the hero composition, the stripe under the loud line, the field list, the bezel around the live stage, the footer sentence.
