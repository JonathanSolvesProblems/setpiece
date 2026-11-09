"""The submission gallery, rendered from the live site, the headset captures and the results files.

    py tools/gallery.py                 renders every slide to devpost/gallery/
    py tools/gallery.py 03 07           renders only those slides

Each slide is 1500 by 1000: a badge that names where its picture or number comes from, a headline,
the picture or the result, and a one-line caption under 140 characters. The captions also go to
devpost/gallery/captions.md, one fenced block each, so they can be pasted into the form as they are.
Change a number in devpost/results and the slide that shows it re-renders with the new one.

Needs Python 3 with playwright and Pillow, and the fonts in public/ui/fonts.
"""
import asyncio, base64, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
LIVE = 'https://setpiece.jonathansolvesproblems.com/'
OUT = ROOT / 'devpost' / 'gallery'
FONTS = (ROOT / 'public' / 'ui' / 'fonts').as_uri()
W, H = 1500, 1000

fps = json.loads((ROOT / 'devpost/results/quest-frame-rate.json').read_text(encoding='utf-8'))
voice = json.loads((ROOT / 'devpost/results/voice-recognition.json').read_text(encoding='utf-8'))
load = json.loads((ROOT / 'devpost/results/load-and-size.json').read_text(encoding='utf-8'))
checks = (ROOT / 'devpost/checks/last-run.md').read_text(encoding='utf-8')
catalog = (ROOT / 'src/catalog.ts').read_text(encoding='utf-8')

all_fps = [s['fps'] for s in fps['samples']]
N = {
    'fps_median': sorted(all_fps)[len(all_fps) // 2],
    'fps_min': min(all_fps),
    'fps_samples': len(all_fps),
    'fps_under60': sum(1 for v in all_fps if v < 60),
    'voice_heard': voice['heard_the_beat'],
    'voice_runs': voice['standoff_runs'],
    'bundle_mb': load['main_script_mb'][-1]['mb'],
    'bundle_before_mb': load['main_script_mb'][0]['mb'],
    'quest_first_s': load['quest_3s'][0]['seconds_to_set_ready'],
    'quest_reload_s': load['quest_3s'][1]['seconds_to_set_ready'],
    'assets': len(re.findall(r"\{ label: '", catalog)) - len(re.findall(r"shelf: 'Kit'", catalog)),
    'scenes': len(re.findall(r'^\s+title: ', (ROOT / 'src/scenes.ts').read_text(encoding='utf-8'), re.M)),
    'checks_passed': re.search(r'\*\*(\d+) of (\d+) passed', checks).group(1),
    'checks_total': re.search(r'\*\*(\d+) of (\d+) passed', checks).group(2),
}
QUEST = 'Quest 3S · headset capture · 6 Nov 2026'
LIVE_BADGE = 'Live site · setpiece.jonathansolvesproblems.com'

# One entry per slide, in the order a judge scrolls. `picture` is a file under devpost/, a live
# recipe run on the deployed page, or a result rendered as text.
SLIDES = [
    dict(slug='table', badge=QUEST, headline='The shot, on your table', picture='captures/quest-set-on-table.jpg',
         caption='A 1:10 film set lands on your real table. Two wooden stand-ins, a tennis ball for the creature, a 35 mm camera, your own hands.'),
    dict(slug='pinch', badge=QUEST, headline='Reach in and pick it up', picture='captures/quest-hands-card.jpg',
         caption='Put your fingers on a piece and pinch, or close a fist around it. The pointing ray steps aside when a hand is near a piece.'),
    dict(slug='say', badge=LIVE_BADGE, headline='Say the scene', picture=('live', 'standoff'),
         caption='"A Mexican standoff after a car chase": three actors on marks, each aiming at the next, two crashed cars behind. All of it movable.'),
    dict(slug='heard', badge='Result · devpost/results/voice-recognition.json', headline='What the headset heard', picture=('result', 'voice'),
         caption='The recogniser runs inside the page, so nothing you say leaves the headset. {voice_heard} of {voice_runs} standoff lines from two synthetic voices came through.'),
    dict(slug='board', badge=LIVE_BADGE, headline='Snap, and the frame carries its numbers', picture=('live', 'board'),
         caption='Each frame on the board is stamped with its lens, camera height, distance and every actor’s eyeline, measured where the pieces stood.'),
    dict(slug='lenses', badge=LIVE_BADGE, headline='Six lenses, 18 to 135 mm', picture=('live', 'lenses'),
         caption='The same blocking through an 18 mm and a 50 mm. The monitor above the set shows what the lens sees before you snap.'),
    dict(slug='take', badge=LIVE_BADGE, headline='Record a take', picture=('live', 'take'),
         caption='Carry an actor across while it records and they walk it back, in step, on the floor. Up to twelve seconds, kept with the board.'),
    dict(slug='fire', badge=LIVE_BADGE, headline='Pieces answer each other', picture=('live', 'fire'),
         caption='Rain over a fire puts it out. A car driven into an actor knocks them down. A take replays what the blocking does, not what you wish it did.'),
    dict(slug='library', badge='Emulator · the panel at 1 mm per pixel', headline='{assets} pieces on six shelves', picture='../.design/shots/pass2/panel/assets-held.jpg',
         caption='Cast, creatures, vehicles, effects, set and props, every one a bare maquette you can paint, size and fit out. {scenes} scenes to start from.'),
    dict(slug='scene', badge=LIVE_BADGE, headline='Ten scenes to start from', picture=('live', 'dragon'),
         caption='Dragon attack: a dragon, a house on fire and two actors, placed as a blocking. Start here, then move anything.'),
    dict(slug='back', badge=QUEST, headline='Back where you left it', picture='captures/quest-car-bicycle.jpg',
         caption='Put the headset on again and the set is on the same spot of the same table, with the board you left. The panel says so.'),
    dict(slug='fps', badge='Result · devpost/results/quest-frame-rate.json', headline='{fps_median} frames a second', picture=('result', 'fps'),
         caption='{fps_samples} one-second samples over two sessions of normal use on a Quest 3S: median {fps_median}, lowest {fps_min} in the first minute, {fps_under60} under 60.'),
    dict(slug='load', badge=LIVE_BADGE, headline='It says what it is doing', picture=('live', 'loading'),
         caption='While the set builds, the card names each step. The app is {bundle_mb} MB, down from {bundle_before_mb}; a reload on the Quest is ready in {quest_reload_s} s.'),
    dict(slug='leave', badge=LIVE_BADGE, headline='You leave holding something', picture=('live', 'exports'),
         caption='Back in the browser: the board as an image, the shot list as a CSV and the take as a short animatic, saved to your own files.'),
    dict(slug='camera', badge=QUEST, headline='Format, rig, second camera', picture='captures/quest-camera-tab.jpg',
         caption='Four sensor formats, a tripod or a drone up to 11 m on the real set, and a second camera you can cut to while a take records.'),
    dict(slug='checks', badge='Result · devpost/checks/last-run.md', headline='Checks you can run yourself', picture=('result', 'checks'),
         caption='node tools/check-live.mjs asserts {checks_total} things about the live site, no account and no key. Last run: {checks_passed} of {checks_total} passed.'),
]

TEMPLATE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Stencil;src:url("{fonts}/BigShouldersStencil-Black.ttf")}}
@font-face{{font-family:Shoulders;src:url("{fonts}/BigShoulders-Bold.ttf")}}
@font-face{{font-family:Grotesk;src:url("{fonts}/SchibstedGrotesk-Medium.ttf")}}
html,body{{margin:0;width:{w}px;height:{h}px;background:#1b1411;color:#f6f7ef;overflow:hidden}}
.slide{{position:relative;width:{w}px;height:{h}px;padding:56px 72px;box-sizing:border-box;display:flex;flex-direction:column}}
.badge{{font-family:Shoulders;font-size:26px;letter-spacing:.06em;text-transform:uppercase;color:#c7c7b7;display:flex;align-items:center;gap:16px}}
.badge::before{{content:"";width:14px;height:14px;background:#d6e13c}}
h1{{font-family:Stencil;font-size:88px;line-height:.92;margin:14px 0 26px;letter-spacing:-.005em}}
.pic{{flex:1;min-height:0;border:2px solid #5a4b3d;background:#2a211c;display:flex;align-items:center;justify-content:center;overflow:hidden}}
.pic img{{width:100%;height:100%;object-fit:contain;display:block}}
.caption{{font-family:Grotesk;font-size:30px;line-height:1.3;color:#f6f7ef;margin-top:24px}}
.result{{width:100%;height:100%;padding:28px 36px;box-sizing:border-box;font-family:Grotesk;font-size:28px;line-height:1.35;color:#f6f7ef}}
.result table{{border-collapse:collapse;width:100%}}
.result td,.result th{{text-align:left;padding:8px 14px;border-bottom:1px solid #5a4b3d;vertical-align:top}}
.result th{{font-family:Shoulders;font-size:24px;letter-spacing:.05em;text-transform:uppercase;color:#c7c7b7}}
.big{{font-family:Stencil;font-size:150px;line-height:1;color:#d6e13c;margin:10px 0 0}}
.muted{{color:#c7c7b7}} .yes{{color:#d6e13c}} .pair{{display:flex;gap:16px;height:100%}} .pair img{{flex:1;min-width:0;object-fit:contain}}
.unit{{font-family:Shoulders;font-size:40px;color:#c7c7b7;margin-left:14px}}
</style></head><body><div class="slide"><div class="badge">{badge}</div><h1>{headline}</h1><div class="pic">{body}</div><div class="caption">{caption}</div></div></body></html>"""


def data_uri(path: Path) -> str:
    mime = 'image/png' if path.suffix == '.png' else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def result_body(kind: str) -> str:
    if kind == 'fps':
        rows = ''.join(f"<tr><td>{s['date']}</td><td>{s['samples']}</td><td>{s['min']}</td><td>{s['median']}</td><td>{s['max']}</td><td>{s['under60']}</td></tr>" for s in fps['summary'])
        return (f'<div class="result"><div class="big">{N["fps_median"]}<span class="unit">fps, median of {N["fps_samples"]} samples</span></div>'
                f'<p class="muted">Quest 3S, Quest Browser, hands tracked, the live site, the wearer using it normally. One second of frame timestamps about once a minute.</p>'
                f'<table><tr><th>Session</th><th>Samples</th><th>Lowest</th><th>Median</th><th>Highest</th><th>Under 60</th></tr>{rows}</table></div>')
    if kind == 'voice':
        seen = set()
        rows = []
        for r in voice['runs']:
            if r['said'] in seen or 'standoff' not in r['said']:
                continue
            seen.add(r['said'])
            rows.append(f"<tr><td>{r['said']}</td><td class='yes'>{r['heard']}</td></tr>")
        return (f'<div class="result"><p class="muted">Said by a Windows voice through a fake microphone into the page’s own recogniser. The right column is what it wrote down.</p>'
                f'<table><tr><th>Said</th><th>Heard</th></tr>{"".join(rows[:6])}</table></div>')
    if kind == 'checks':
        lines = [l for l in checks.splitlines() if l.startswith('| ') and not l.startswith('| Check') and not l.startswith('|---')]
        rows = ''.join(f"<tr><td>{l.split('|')[1].strip()}</td><td class='{'yes' if 'pass' in l.split('|')[2] else ''}'>{l.split('|')[2].strip()}</td></tr>" for l in lines[:14])
        return (f'<div class="result"><div class="big">{N["checks_passed"]}<span class="unit">of {N["checks_total"]} checks passed</span></div>'
                f'<p class="muted">node tools/check-live.mjs, against the live site, no account and no key. The first fourteen:</p><table>{rows}</table></div>')
    raise ValueError(kind)


READY = "(() => { const w = globalThis.setpiece && globalThis.setpiece.world; return !!(w && w.globals.setReady.peek()); })()"


async def wait_ready(page):
    for _ in range(400):
        await page.wait_for_timeout(100)
        if await page.evaluate(READY):
            return
    raise RuntimeError('the live site never became ready')


async def shot(page, path: Path, selector: str | None = None, bottom: int | None = None):
    """A full-viewport screenshot, cropped afterwards: a clipped capture fails under software GL."""
    from PIL import Image
    await page.screenshot(path=str(path))
    if selector is None and bottom is None:
        return
    box = await page.evaluate(f"(() => {{ const r = document.querySelector('{selector or '.flag'}').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }})()")
    im = Image.open(path)
    scale = im.width / W
    x, y, w, h = [int(v * scale) for v in box]
    bottom = None if bottom is None else int(bottom * scale)
    im.crop((x, y + h - bottom, x + w, y + h) if bottom else (x, y, x + w, y + h)).save(path)


async def stage_png(page, path: Path):
    """The set's picture, cropped towards the middle where the pieces stand."""
    from PIL import Image
    await shot(page, path, '.stage')
    im = Image.open(path)
    w, h = im.size
    im.crop((int(w * 0.14), int(h * 0.08), int(w * 0.86), int(h * 0.9))).save(path)


async def live_capture(browser, recipe: str, out: Path) -> Path:
    """Drives the deployed page into one state and saves the set's picture, or the whole viewport."""
    # Captured at twice the pixel density, so a crop of the set still fills a slide.
    ctx = await browser.new_context(viewport={'width': W, 'height': H}, color_scheme='dark', device_scale_factor=2)
    page = await ctx.new_page()
    png = out / f'live-{recipe}.png'
    if recipe == 'loading':
        async def slow(route):
            await asyncio.sleep(1.5)
            await route.continue_()
        await page.route('**/ui/fonts/baked/*.json', slow)
        await page.goto(LIVE, wait_until='commit')
        await page.wait_for_selector('#loader-step')
        await page.wait_for_timeout(2200)
        # The page is still loading, so the crop is done here rather than through shot(), which asks the page.
        await page.screenshot(path=str(png))
        from PIL import Image
        box = await page.evaluate("(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
        im = Image.open(png)
        k = im.width / W
        im.crop(tuple(int(v * k) for v in (box[0], box[1], box[0] + box[2], box[1] + box[3]))).save(png)
        await ctx.close()
        return png
    await page.goto(LIVE, wait_until='commit')
    await wait_ready(page)
    await page.wait_for_timeout(1200)
    say = lambda t: page.evaluate('(t) => globalThis.setpiece.say(t)', t)
    click = lambda s: page.evaluate(f"document.querySelector('{s}').click()")
    if recipe == 'standoff':
        await say('a mexican standoff after a car chase')
        await page.wait_for_timeout(1500)
        await stage_png(page, png)
    elif recipe == 'dragon':
        await page.evaluate('globalThis.setpiece.world.globals.sceneStart.value = 1')
        await page.wait_for_timeout(1500)
        await stage_png(page, png)
    elif recipe == 'board':
        # The library's Dragon attack, whose camera is composed for the slate, so the frames read as shots.
        await page.evaluate('globalThis.setpiece.world.globals.sceneStart.value = 1')
        await page.wait_for_timeout(1200)
        for lens, dz in [('24', 0), ('35', -0.03), ('50', 0.04), ('85', -0.02)]:
            await click(f'.lens[data-lens="{lens}"]')
            await page.evaluate(f"(() => {{ const w = globalThis.setpiece.world; const a = w.scene.getObjectByName('Actor A'); a.position.z += {dz}; w.globals.layoutChanged.value += 1; }})()")
            await page.wait_for_timeout(1200)
            await click('#page-snap')
            # The snap waits for a fresh lens pass; software rendering needs the time.
            await page.wait_for_timeout(2500)
        # The board itself, as the app saves it: the real deliverable, with every frame's numbers stamped on.
        async with page.expect_download(timeout=30000) as waiting:
            await click('#page-save-board')
        await (await waiting.value).save_as(str(png))
    elif recipe == 'lenses':
        await page.evaluate('globalThis.setpiece.world.globals.sceneStart.value = 1')
        await page.wait_for_timeout(1200)
        parts = []
        for lens in ['18', '50']:
            await click(f'.lens[data-lens="{lens}"]')
            await page.wait_for_timeout(1200)
            await click('#page-snap')
            await page.wait_for_timeout(2500)
            parts.append(await page.evaluate("[...document.querySelectorAll('#board li.filled img')].pop().src"))
        # Two frames side by side.
        from PIL import Image
        from io import BytesIO
        ims = [Image.open(BytesIO(base64.b64decode(p.split(',')[1]))).convert('RGB') for p in parts]
        h = min(i.height for i in ims)
        ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
        sheet = Image.new('RGB', (sum(i.width for i in ims) + 16, h), (27, 20, 17))
        x = 0
        for i in ims:
            sheet.paste(i, (x, 0))
            x += i.width + 16
        sheet.save(png)
    elif recipe == 'take':
        await say('new scene with two actors')
        await page.wait_for_timeout(1000)
        await click('#page-record')
        await page.wait_for_timeout(400)
        for i in range(12):
            await page.evaluate("(() => { const w = globalThis.setpiece.world; const a = w.scene.getObjectByName('Actor A'); a.position.x += 0.022; })()")
            await page.wait_for_timeout(180)
        await click('#page-record')
        await page.wait_for_timeout(1500)
        await stage_png(page, png)
    elif recipe == 'fire':
        await say('new scene with a fire, rain and an actor')
        await page.wait_for_timeout(1200)
        await page.evaluate("(() => { const w = globalThis.setpiece.world; const f = w.scene.getObjectByName('Fire'); const r = w.scene.getObjectByName('Rain'); if (f && r) { r.position.x = f.position.x; r.position.z = f.position.z; w.globals.layoutChanged.value += 1; } })()")
        await page.wait_for_timeout(2500)
        await stage_png(page, png)
    elif recipe == 'exports':
        await page.evaluate('globalThis.setpiece.world.globals.sceneStart.value = 1')
        await page.wait_for_timeout(1200)
        await click('#page-snap')
        await page.wait_for_timeout(1200)
        # A take only exists when a piece was carried, so the actor is dragged with a real mouse while it records.
        x, y = await page.evaluate("""(() => { const w = globalThis.setpiece.world; const o = w.scene.getObjectByName('Actor A');
          const v = o.getWorldPosition(o.position.clone()); v.y += 0.07; v.project(w.camera);
          const r = document.querySelector('#scene-container canvas').getBoundingClientRect();
          return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; })()""")
        await click('#page-record')
        await page.wait_for_timeout(300)
        await page.mouse.move(x, y)
        await page.wait_for_timeout(500)
        await page.mouse.down()
        await page.wait_for_timeout(500)
        for i in range(1, 10):
            await page.mouse.move(x + i * 9, y + i * 2)
            await page.wait_for_timeout(160)
        await page.mouse.up()
        await page.wait_for_timeout(400)
        await click('#page-record')
        await page.wait_for_timeout(1500)
        await shot(page, png, '.flag', bottom=300)
    else:
        raise ValueError(recipe)
    await ctx.close()
    return png


async def main():
    if '--check' in sys.argv:
        # Lengths only, printed here and nowhere else.
        for i, s in enumerate(SLIDES, 1):
            n = len(s['caption'].format(**N))
            print(f'{i:02d} {s["slug"]:8} {n}{"  OVER 140" if n > 140 else ""}')
        return
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    scratch = ROOT / 'tmp' / 'gallery'
    scratch.mkdir(parents=True, exist_ok=True)
    captions = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        # The slides themselves are composed in a plain browser: software GL cannot screenshot a set_content page.
        plain = await p.chromium.launch()
        for i, s in enumerate(SLIDES, 1):
            n = f'{i:02d}'
            caption = s['caption'].format(**N)
            headline = s['headline'].format(**N)
            assert len(caption) <= 140, f'slide {n} caption is {len(caption)} characters'
            captions.append((n, s['slug'], caption))
            if only and n not in only:
                continue
            pic = s['picture']
            if isinstance(pic, str):
                body = f'<img src="{data_uri((ROOT / "devpost" / pic).resolve())}">'
            elif pic[0] == 'live':
                body = f'<img src="{data_uri(await live_capture(browser, pic[1], scratch))}">'
            else:
                body = result_body(pic[1])
            html = TEMPLATE.format(fonts=FONTS, w=W, h=H, badge=s['badge'], headline=headline, body=body, caption=caption)
            page = await plain.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
            await page.set_content(html)
            await page.wait_for_timeout(400)
            await page.evaluate('document.fonts.ready')
            await page.screenshot(path=str(OUT / f'{n}-{s["slug"]}.png'))
            await page.close()
            print(f'{n} {s["slug"]}  caption {len(caption)}')
        await browser.close()
        await plain.close()
    lines = ['# Gallery captions', '', 'One block per image, in gallery order. Paste the block, nothing else.', '']
    for n, slug, caption in captions:
        lines += [f'## {n} {slug}', '', '```', caption, '```', '']
    (OUT / 'captions.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'{len(captions)} slides, longest caption {max(len(c) for _, _, c in captions)}')


asyncio.run(main())
