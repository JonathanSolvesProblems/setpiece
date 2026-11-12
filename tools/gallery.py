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


def font_uri(name: str) -> str:
    """A face from the app's own fonts, carried inside the slide: a composed page may not load a file from disk."""
    return 'data:font/ttf;base64,' + base64.b64encode((ROOT / 'public' / 'ui' / 'fonts' / name).read_bytes()).decode()


W, H = 1500, 1000

fps = json.loads((ROOT / 'devpost/results/quest-frame-rate.json').read_text(encoding='utf-8'))
voice = json.loads((ROOT / 'devpost/results/voice-recognition.json').read_text(encoding='utf-8'))
quest_voice = json.loads((ROOT / 'devpost/results/quest-voice.json').read_text(encoding='utf-8'))
frame_time = json.loads((ROOT / 'devpost/results/quest-frame-time.json').read_text(encoding='utf-8'))
heavy = frame_time['before']
heavy_after = frame_time.get('after')
quest_controls = quest_voice['control_sentences_fed_to_the_recogniser_on_the_headset']
load = json.loads((ROOT / 'devpost/results/load-and-size.json').read_text(encoding='utf-8'))
checks = (ROOT / 'devpost/checks/last-run.md').read_text(encoding='utf-8')
catalog = (ROOT / 'src/catalog.ts').read_text(encoding='utf-8')

all_fps = [s['fps'] for s in fps['samples']]
N = {
    'fps_median': sorted(all_fps)[len(all_fps) // 2],
    'fps_min': min(all_fps),
    'fps_samples': len(all_fps),
    'fps_under60': sum(1 for v in all_fps if v < 60),
    # The days the samples were taken on, as "5, 6 and 12 Nov", read from the summary so a new session re-words the caption.
    'fps_days': (lambda d: (', '.join(d[:-1]) + ' and ' + d[-1]) if len(d) > 1 else d[0])([str(int(row['date'][-2:])) for row in fps['summary']]),
    # The heavier set of 11 Nov, both hands tracked: before the fix, and after it once that is measured.
    'heavy_fps': f"{round(min(heavy['frames_per_second']))} to {round(max(heavy['frames_per_second']))}",
    'heavy_then': ('before a fix still to be re-measured' if heavy_after is None
                   else f"{round(min(heavy_after['frames_per_second']))} to {round(max(heavy_after['frames_per_second']))} after the fix"),
    'voice_heard': voice['heard_the_beat'],
    'voice_runs': voice['standoff_runs'],
    # Recorded sentences fed to the recogniser inside the headset's browser: how many, and how many were read as what was said.
    'quest_voice_clips': quest_voice['summary']['sentences'] + quest_controls['clips'],
    'quest_voice_read': quest_voice['summary']['read_the_same_as_what_was_said'] + quest_controls['read_as_the_control_that_was_said'],
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
    dict(slug='heard', badge='Result · devpost/results/quest-voice.json', headline='What the headset wrote down', picture=('result', 'voice'),
         caption='{quest_voice_read} of {quest_voice_clips} recorded sentences read as what was said, inside the Quest Browser, in about a quarter of real time. A real voice is next.'),
    dict(slug='board', badge=LIVE_BADGE, headline='Six setups, each with its numbers', picture=('live', 'board'),
         caption='Each frame on the board is stamped with its lens, camera height, distance and every actor’s eyeline, measured where the pieces stood.'),
    dict(slug='lenses', badge=LIVE_BADGE, headline='Six lenses, 18 to 135 mm', picture=('live', 'lenses'),
         caption='The same blocking through an 18 mm and a 50 mm. The monitor above the set shows what the lens sees before you snap.'),
    dict(slug='take', badge=LIVE_BADGE, headline='Record a take', picture=('live', 'take'),
         caption='Carry an actor across while it records and they walk it back, in step, on the floor. Up to twelve seconds, kept with the board.'),
    dict(slug='fire', badge=LIVE_BADGE, headline='Pieces answer each other', picture=('live', 'fire'),
         caption='Rain over the fire puts it out. A car pushed hard and let go drives on, and the actor in its way goes down.'),
    dict(slug='library', badge=LIVE_BADGE, headline='{assets} pieces on six shelves', picture=('live', 'pieces'),
         caption='Cast, creatures, vehicles, effects, set and props, every one a bare maquette you can paint, size and fit out. {scenes} scenes to start from.'),
    dict(slug='scene', badge=LIVE_BADGE, headline='Ten scenes to start from', picture=('live', 'dragon'),
         caption='Dragon attack: a dragon, a house on fire and two actors, placed as a blocking. Start here, then move anything.'),
    dict(slug='back', badge=QUEST, headline='It keeps your set and your board', picture='captures/quest-car-bicycle.jpg',
         caption='After a reload in the headset the panel lists what came back: the set, the pieces and the board. Same spot after a relaunch: next to prove.'),
    dict(slug='fps', badge='Result · devpost/results/quest-frame-rate.json and quest-frame-time.json', headline='{fps_median} frames a second, median', picture=('result', 'fps'),
         caption='{fps_samples} one-second samples, {fps_days} Nov: median {fps_median}, lowest {fps_min}. A heavier set on 11 Nov ran at {heavy_fps}, {heavy_then}.'),
    dict(slug='load', badge=LIVE_BADGE, headline='The wait is a call sheet', picture=('live', 'loading'),
         caption='Main script {bundle_mb} MB, down from {bundle_before_mb}. On the Quest: a set in {quest_first_s} s on a first visit, {quest_reload_s} s on a reload.'),
    dict(slug='leave', badge=LIVE_BADGE, headline='You leave holding something', picture=('live', 'exports'),
         caption='Saved from the page: the board as an image with each frame’s numbers, and the shot list as a CSV. A take saves as a short video too.'),
    dict(slug='camera', badge=QUEST, headline='Format, rig, second camera', picture='captures/quest-camera-tab.jpg',
         caption='Four sensor formats, a tripod or a drone up to 11 m on the real set, and a second camera you can cut to while a take records.'),
]

TEMPLATE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:SetStencil;src:url("{stencil}") format("truetype")}}
@font-face{{font-family:SetShoulders;src:url("{shoulders}") format("truetype")}}
@font-face{{font-family:SetGrotesk;src:url("{grotesk}") format("truetype")}}
html,body{{margin:0;width:{w}px;height:{h}px;background:#1b1411;color:#f6f7ef;overflow:hidden}}
.slide{{position:relative;width:{w}px;height:{h}px;padding:56px 72px;box-sizing:border-box;display:flex;flex-direction:column}}
.badge{{font-family:SetShoulders;font-size:26px;letter-spacing:.06em;text-transform:uppercase;color:#c7c7b7;display:flex;align-items:center;gap:16px}}
.badge::before{{content:"";width:14px;height:14px;background:#d6e13c}}
h1{{font-family:SetStencil;font-size:88px;line-height:.92;margin:14px 0 26px;letter-spacing:.005em;text-transform:uppercase}}
.pic{{flex:1;min-height:0;border:2px solid #5a4b3d;background:#2a211c;display:flex;align-items:center;justify-content:center;overflow:hidden}}
.pic img{{width:100%;height:100%;object-fit:contain;display:block}}
.caption{{font-family:SetGrotesk;font-size:30px;line-height:1.3;color:#f6f7ef;margin-top:24px}}
.result{{width:100%;height:100%;padding:28px 36px;box-sizing:border-box;font-family:SetGrotesk;font-size:28px;line-height:1.35;color:#f6f7ef}}
.result table{{border-collapse:collapse;width:100%}}
.result td,.result th{{text-align:left;padding:8px 14px;border-bottom:1px solid #5a4b3d;vertical-align:top}}
.result th{{font-family:SetShoulders;font-size:24px;letter-spacing:.05em;text-transform:uppercase;color:#c7c7b7}}
.big{{font-family:SetStencil;font-size:150px;line-height:1;color:#d6e13c;margin:10px 0 0}}
.muted{{color:#c7c7b7}} .yes{{color:#d6e13c}} .pair{{display:flex;gap:16px;height:100%}} .pair img{{flex:1;min-width:0;object-fit:contain}}
.unit{{font-family:SetShoulders;font-size:40px;color:#c7c7b7;margin-left:14px}}
.result.rows5 .big{{font-size:112px;margin:0}} .result.rows5 p{{margin:14px 0 16px}}
</style></head><body><div class="slide"><div class="badge">{badge}</div><h1>{headline}</h1><div class="pic">{body}</div><div class="caption">{caption}</div></div></body></html>"""


def data_uri(path: Path) -> str:
    mime = 'image/png' if path.suffix == '.png' else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def result_body(kind: str) -> str:
    if kind == 'fps':
        rows = ''.join(f"<tr><td>{s['date']}</td><td>{s['samples']}</td><td>{s['min']}</td><td>{s['median']}</td><td>{s['max']}</td><td>{s['under60']}</td></tr>" for s in fps['summary'])
        # The heavier set, from the frame-time probe: two three-second readings, so lowest and highest only.
        for label, run in (('before the fix', heavy), ('after the fix', heavy_after)):
            if run is None:
                continue
            both = run['frames_per_second']
            rows += (f"<tr><td>{run['date']}, {len(run['on_the_set'])} pieces, both hands, {label}</td><td>{len(both)}</td>"
                     f"<td>{min(both)}</td><td></td><td>{max(both)}</td><td>{sum(1 for v in both if v < 60)}</td></tr>")
        return (f'<div class="result rows5"><div class="big">{N["fps_median"]}<span class="unit">fps, median of {N["fps_samples"]} samples</span></div>'
                f'<p class="muted">Quest 3S, Quest Browser, hands tracked, the live site, the wearer using it normally. One second of frame timestamps about once a minute.</p>'
                f'<table><tr><th>Session</th><th>Samples</th><th>Lowest</th><th>Median</th><th>Highest</th><th>Under 60</th></tr>{rows}</table></div>')
    if kind == 'voice':
        # Two sets asked for in words, then five of the panel's controls: what went in, and what the headset wrote.
        pairs = [(s['said'], s['heard']) for s in quest_voice['sentences'][:2]]
        wanted = ['eighty five', 'camera on the dragon', 'paint the car red', 'play it back', 'snap']
        pairs += [(c['said'], c['heard'][0]) for said in wanted for c in quest_controls['written'] if c['said'] == said]
        rows = ''.join(f"<tr><td>{said}</td><td class='yes'>{heard}</td></tr>" for said, heard in pairs)
        return (f'<div class="result"><p class="muted">Recorded sentences fed to the recogniser the app ships, inside the Quest Browser on a Quest 3S. No microphone was open and nobody spoke. The right column is what it wrote down.</p>'
                f'<table><tr><th>Said</th><th>Written on the headset</th></tr>{rows}</table></div>')
    if kind == 'checks':
        lines = [l for l in checks.splitlines() if l.startswith('| ') and not l.startswith('| Check') and not l.startswith('|---')]
        rows = ''.join(f"<tr><td>{l.split('|')[1].strip()}</td><td class='{'yes' if 'pass' in l.split('|')[2] else ''}'>{l.split('|')[2].strip()}</td></tr>" for l in lines[:14])
        return (f'<div class="result"><div class="big">{N["checks_passed"]}<span class="unit">of {N["checks_total"]} checks passed</span></div>'
                f'<p class="muted">node tools/check-live.mjs, against the live site, no account and no key. The first fourteen:</p><table>{rows}</table></div>')
    raise ValueError(kind)


# Six setups a director would actually board: where the camera stands, what it looks at, the lens,
# and where actor A stands for it. Stage coordinates in metres on the slate; the lens looks along -Z.
SETUPS = [
    ('18', (-0.27, 0.17), (0.08, 0.0), (-0.02, 0.06)),    # wide, establishing
    ('35', (-0.27, -0.02), (0.1, 0.0), (-0.02, 0.06)),    # two-shot from the side
    ('50', (-0.26, 0.13), (0.2, -0.05), (-0.02, 0.06)),  # over A's shoulder to the creature
    ('24', (0.28, -0.15), (0.03, 0.0), (0.07, 0.03)),     # the creature's side, A has stepped in
    ('85', (0.27, -0.18), (0.05, -0.1), (0.07, 0.03)),   # close on B, from the front
    ('24', (0.27, 0.16), (0.04, -0.03), (0.07, 0.03)),    # reverse, past the creature
]


async def six_setups(page, click, say, count=6):
    """Two actors and the eyeline ball, then `count` frames snapped from different setups."""
    await say('new scene with two actors')
    await page.wait_for_timeout(1500)
    for lens, cam, look, actor in SETUPS[:count]:
        await click(f'.lens[data-lens="{lens}"]')
        ok = await page.evaluate("""(async ([cam, look, actor]) => {
          const w = globalThis.setpiece.world; const g = w.globals;
          const tray = [...w.getSystems()].find((s) => s.managed && s.finish);
          if (!g.trayOn.peek().includes('Creature')) { tray.toggle('Creature'); await new Promise((d) => setTimeout(d, 600)); }
          const at = (name) => w.scene.getObjectByName(name);
          const face = (o, x, z) => { o.rotation.set(0, Math.atan2(-(x - o.position.x), -(z - o.position.z)), 0); };
          const ball = at('Creature'); ball.position.set(0.2, 0, -0.05);
          const a = at('Actor A'); a.position.set(actor[0], 0, actor[1]); face(a, 0.2, -0.05);
          const b = at('Actor B'); b.position.set(0.05, 0, -0.1); face(b, 0.2, -0.05);
          const rig = at('Camera Rig'); rig.position.set(cam[0], 0, cam[1]); face(rig, look[0], look[1]);
          g.layoutChanged.value += 1;
          return g.trayOn.peek().includes('Creature');
        })""", [list(cam), list(look), list(actor)])
        assert ok, 'the eyeline ball is not on the set'
        await page.wait_for_timeout(1500)
        # The snap waits for a fresh lens pass; under software rendering one can be missed, so each is confirmed.
        last = "(() => { const f = globalThis.setpiece.world.globals.shotFrames.peek(); return f.length ? f[f.length - 1].index : 0; })()"
        before = await page.evaluate(last)
        await click('#page-snap')
        for _ in range(40):
            await page.wait_for_timeout(500)
            if await page.evaluate(last) > before:
                break
        else:
            raise RuntimeError('a frame did not land on the board')


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
    # Software GL can take the better part of a minute on a full set; the default 30 s cuts some renders off.
    await page.screenshot(path=str(path), timeout=120000)
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
        await six_setups(page, click, say)
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
        fire_png = out / 'live-fire-rain.png'
        await stage_png(page, fire_png)
        # Then a car let go while moving: it rolls on along its nose and the actor in its way goes down.
        # The roll is started on the same code path a hand push takes, at a set speed, since a script has no hand.
        await say('new scene with a car and an actor')
        await page.wait_for_timeout(1200)
        rolled = await page.evaluate("""(async () => {
          const w = globalThis.setpiece.world; const wait = (ms) => new Promise((d) => setTimeout(d, ms));
          const systems = [...w.getSystems()];
          const tray = systems.find((s) => s.managed && s.finish);
          const pieces = systems.find((s) => Array.isArray(s.rolling) && Array.isArray(s.dressed));
          const squirm = systems.find((s) => typeof s.isDown === 'function');
          const car = tray.managed.find((p) => tray.key(p) === 'Car');
          const actor = tray.managed.find((p) => tray.key(p) === 'A');
          car.object3D.position.set(-0.27, 0, -0.09); car.object3D.rotation.set(0, Math.PI / 2, 0);
          actor.object3D.position.set(0.1, 0, -0.07); actor.object3D.rotation.set(0, -Math.PI / 2, 0);
          w.globals.layoutChanged.value += 1;
          await wait(600);
          pieces.rolling.push({ index: pieces.dressed.indexOf(car), speed: 0.3 });
          await wait(2800);
          return { car: car.object3D.position.x, rolling: pieces.rolling.length, down: squirm ? squirm.isDown(actor) : null };
        })()""")
        assert rolled['rolling'] == 0 and rolled['car'] > -0.2 and rolled['down'] is True, rolled
        drive_png = out / 'live-drive.png'
        await stage_png(page, drive_png)
        from PIL import Image
        ims = [Image.open(p).convert('RGB') for p in (fire_png, drive_png)]
        h = min(i.height for i in ims)
        ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
        sheet = Image.new('RGB', (sum(i.width for i in ims) + 16, h), (27, 20, 17))
        x = 0
        for i in ims:
            sheet.paste(i, (x, 0))
            x += i.width + 16
        sheet.save(png)
    elif recipe == 'pieces':
        # Six shelves' worth of rebuilt pieces standing on the slate together.
        await say('new scene with a pickup, a motorbike, a lamp post, a tree, a crate and a rock')
        await page.wait_for_timeout(1800)
        # Spread out so each one reads: the pickup across the back, the tree behind its nose, the lamp post at the front left, the bike, crate and rock in front.
        placed = await page.evaluate("""(async () => {
          const w = globalThis.setpiece.world;
          const tray = [...w.getSystems()].find((s) => s.managed && s.finish);
          const at = { Pickup: [-0.04, -0.09, 80], Motorbike: [0.18, 0.11, 135], 'Lamp post': [-0.27, 0.04, 160], Tree: [0.26, -0.14, 0], Crate: [0.04, 0.15, 20], Rock: [-0.12, 0.15, 30] };
          const found = [];
          for (const p of tray.managed) {
            const k = tray.key(p); const spot = at[k];
            if (!spot || !p.object3D.visible) continue;
            p.object3D.position.set(spot[0], 0, spot[1]); p.object3D.rotation.set(0, spot[2] * Math.PI / 180, 0);
            found.push(k);
          }
          w.globals.layoutChanged.value += 1;
          await new Promise((d) => setTimeout(d, 800));
          return found.sort();
        })()""")
        assert placed == ['Crate', 'Lamp post', 'Motorbike', 'Pickup', 'Rock', 'Tree'], placed
        await stage_png(page, png)
    elif recipe == 'exports':
        # What a director actually leaves with: the board image and the shot list, saved by the page's own buttons.
        from PIL import Image, ImageDraw, ImageFont
        await six_setups(page, click, say)
        async with page.expect_download(timeout=30000) as waiting:
            await click('#page-save-board')
        board_path = out / 'saved-board.png'
        await (await waiting.value).save_as(str(board_path))
        async with page.expect_download(timeout=30000) as waiting:
            await click('#page-save-list')
        csv_path = out / 'saved-shot-list.csv'
        await (await waiting.value).save_as(str(csv_path))
        board = Image.open(board_path).convert('RGB')
        import csv, io
        rows = list(csv.reader(io.StringIO(csv_path.read_text(encoding='utf-8'))))[:4]
        width, height = 2400, 1300
        sheet = Image.new('RGB', (width, height), (42, 33, 28))
        bw = 1500
        bh = int(board.height * bw / board.width)
        sheet.paste(board.resize((bw, bh)), (0, (height - bh) // 2))
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype(str(ROOT / 'public/ui/fonts/SchibstedGrotesk-Medium.ttf'), 30)
        head = ImageFont.truetype(str(ROOT / 'public/ui/fonts/BigShoulders-Bold.ttf'), 40)
        draw.text((1560, 60), 'SETPIECE-SHOT-LIST.CSV', font=head, fill=(199, 199, 183))
        y = 140
        header, body = rows[0], rows[1:]
        for record in body:
            for name, cell in list(zip(header, record))[:5]:
                draw.text((1560, y), name, font=font, fill=(199, 199, 183))
                draw.text((1990, y), cell, font=font, fill=(246, 247, 239))
                y += 40
            y += 30
        sheet.save(png)
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
    # --recompose lays the slides out again from the live captures already in tmp/gallery, without driving the site.
    recompose = '--recompose' in sys.argv
    only = {arg for arg in sys.argv[1:] if not arg.startswith('--')}
    faces = dict(stencil=font_uri('BigShouldersStencil-Black.ttf'), shoulders=font_uri('BigShoulders-Bold.ttf'), grotesk=font_uri('SchibstedGrotesk-Medium.ttf'))
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
                kept = scratch / f'live-{pic[1]}.png'
                body = f'<img src="{data_uri(kept if recompose and kept.exists() else await live_capture(browser, pic[1], scratch))}">'
            else:
                body = result_body(pic[1])
            html = TEMPLATE.format(**faces, w=W, h=H, badge=s['badge'], headline=headline, body=body, caption=caption)
            page = await plain.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
            await page.set_content(html)
            await page.wait_for_timeout(400)
            await page.evaluate('document.fonts.ready')
            # A slide in a fallback face is not the app's slide: stop instead of saving it.
            missing = await page.evaluate("['SetStencil', 'SetShoulders', 'SetGrotesk'].filter((face) => !document.fonts.check('30px ' + face))")
            assert not missing, f'slide {n}: these faces did not load: {missing}'
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
