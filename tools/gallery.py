"""The submission gallery, rendered from the live site, the headset captures and the results files.

    py tools/gallery.py                 renders every slide to devpost/gallery/
    py tools/gallery.py 03 07           renders only those slides

Each slide is 1500 by 1000: a badge that names where its picture or number comes from, a headline,
the picture or the result, and a one-line caption under 140 characters. The captions also go to
devpost/gallery/captions.md, one fenced block each, so they can be pasted into the form as they are.
Change a number in devpost/results and the slide that shows it re-renders with the new one.

Needs Python 3 with playwright and Pillow, and the fonts in public/ui/fonts.
"""
import asyncio, base64, io, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
# The live site, unless GALLERY_BASE points at a development build; the badge on those slides then says so.
LIVE = os.environ.get('GALLERY_BASE', 'https://setpiece.jonathansolvesproblems.com/')
OUT = ROOT / 'devpost' / 'gallery'


def font_uri(name: str) -> str:
    """A face from the app's own fonts, carried inside the slide: a composed page may not load a file from disk."""
    return 'data:font/ttf;base64,' + base64.b64encode((ROOT / 'public' / 'ui' / 'fonts' / name).read_bytes()).decode()


W, H = 1500, 1000

fps = json.loads((ROOT / 'devpost/results/quest-frame-rate.json').read_text(encoding='utf-8'))
# Shoot coverage on the headset: the run in which all six planned shots went on the board.
COVERAGE_SECONDS = next(run['seconds_from_press_to_done'] for session in json.loads((ROOT / 'devpost/results/quest-coverage-and-world.json').read_text(encoding='utf-8'))['sessions'] for run in session['shoot_coverage'] if run['shot'] == run['planned'])
voice = json.loads((ROOT / 'devpost/results/voice-recognition.json').read_text(encoding='utf-8'))
quest_voice = json.loads((ROOT / 'devpost/results/quest-voice.json').read_text(encoding='utf-8'))
frame_time = json.loads((ROOT / 'devpost/results/quest-frame-time.json').read_text(encoding='utf-8'))
heavy = frame_time['before']
heavy_after = frame_time.get('after')
quest_controls = quest_voice['control_sentences_fed_to_the_recogniser_on_the_headset']
load = json.loads((ROOT / 'devpost/results/load-and-size.json').read_text(encoding='utf-8'))
checks = (ROOT / 'devpost/checks/last-run.md').read_text(encoding='utf-8')
catalog = (ROOT / 'src/catalog.ts').read_text(encoding='utf-8')
designer = json.loads((ROOT / 'devpost/results/designer-latency.json').read_text(encoding='utf-8'))
quest_designer = json.loads((ROOT / 'devpost/results/quest-voice-designer.json').read_text(encoding='utf-8'))
hurry = json.loads((ROOT / 'devpost/results/designer-hurry.json').read_text(encoding='utf-8'))['summary']['with']
designer_frames = json.loads((ROOT / 'devpost/results/quest-frame-time-designer.json').read_text(encoding='utf-8'))
designer_sets = [designer_frames['second_run_hands_open']['night_chase'], designer_frames['second_run_hands_open']['funeral_in_the_rain'], designer_frames['first_run_hands_pointing']['castle_gate']]
spoken_lines = json.loads((ROOT / 'public/audio/voice/lines.json').read_text(encoding='utf-8'))['lines']

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
    'designer_first_s': f"{designer['summary']['firstPieceMs']['median'] / 1000:.1f}",
    'designer_whole_s': f"{designer['summary']['wholeMs']['median'] / 1000:.1f}",
    'designer_sentences': designer['summary']['sentences'],
    # One sentence in the wearer's own words on the headset: from the end of the sentence to the first piece, and to the whole set.
    'quest_first_s': f"{quest_designer['runs'][0]['firstPieceMs'] / 1000:.1f}",
    'quest_whole_s': f"{quest_designer['runs'][0]['wholeSetMs'] / 1000:.1f}",
    'spoken_lines': len(spoken_lines),
    # The designer's sets on the headset, as the submission quotes them (tools/check-claims.mjs reads the same three).
    'coverage_s': COVERAGE_SECONDS,
    'sets_standing': (lambda v: f'{min(v)} to {max(v)}')([round(s['frames_per_second']['idle']) for s in designer_sets]),
    'sets_moving': (lambda v: f'{min(v)} to {max(v)}')([round(s['frames_per_second']['one_piece_moving']) for s in designer_sets]),
    'checks_passed': re.search(r'\*\*(\d+) of (\d+) passed', checks).group(1),
    'checks_total': re.search(r'\*\*(\d+) of (\d+) passed', checks).group(2),
}
QUEST = 'Quest 3S · headset capture · 6 Nov 2026'
QUEST_17 = 'Quest 3S · headset capture · 17 Nov 2026'
QUEST_18 = 'Quest 3S · headset capture · 18 Nov 2026'
LIVE_BADGE = 'Live site · setpiece.jonathansolvesproblems.com' if 'GALLERY_BASE' not in os.environ else 'Development build · desktop browser'

# One entry per slide, in the order a judge scrolls. `picture` is a file under devpost/, a live
# recipe run on the deployed page, or a result rendered as text.
SLIDES = [
    dict(slug='castle', badge=QUEST_18, headline='The shot, on your table', picture='captures/quest-castle-on-table.jpg',
         caption='Asked for a knight charging a castle, then two knights fighting, then rain. A 1:10 set on the real table, the fight playing.'),
    dict(slug='evolve', badge=QUEST_18, headline='One scene, four sentences', picture='captures/quest-evolution.jpg',
         caption='Said in the headset, one after another. Each change lands in seconds and leaves the rest of the set as it was.'),
    dict(slug='rider', badge=QUEST_18, headline='By hand', picture='captures/quest-rider-in-hand.jpg',
         caption='A hand on the dragon, its rider seated on its back. Pinch a piece or close a fist on it. Controllers work too.'),
    dict(slug='inside', badge=QUEST_18, headline='Step inside', picture='captures/quest-inside-castle.jpg',
         caption='The same set at full size around you: the knights at eye level, the dragon overhead. Back to the table in one pinch.'),
    dict(slug='say', badge=LIVE_BADGE, headline='Say the shot', picture=('live', 'designer'),
         caption='"A night chase, a red car past a burning truck, two actors running at camera, a dragon on a rooftop", built piece by piece.'),
    dict(slug='table', badge=QUEST_17, headline='The shot, on your table', picture='captures/quest-aircraft-on-table.jpg',
         caption='Asked for workers building an aircraft, then for a ladder with a worker on its roof. A 1:10 set on the real table, its sky behind it.'),
    dict(slug='made', badge=LIVE_BADGE, headline='It makes what the library lacks', picture=('live', 'castle'),
         caption='Asked for a castle gate, it built the gate and two towers from simple wooden shapes, then two guards and a horse, low and wide.'),
    dict(slug='look', badge=LIVE_BADGE, headline='The designer checks its own frame', picture=('live', 'look'),
         caption="Once the set is up it is shown its own camera's picture and how much of the frame each piece takes. It moves the camera if the shot is off."),
    dict(slug='dresser', badge='Replayed plan · devpost/results/designer-eval.json', headline='Nobody stands inside a car', picture=('live', 'dresser'),
         caption="The designer's own plan stood two actors inside a car parked side-on. Code stepped them out beside it before the camera was placed."),
    dict(slug='speed', badge='Measured on a Quest 3S · devpost/results', headline='{quest_first_s} s from your last word', picture=('result', 'designer'),
         caption='On the headset: the first piece {quest_first_s} s after my last word, sets whole in 3 to 7 s, six shots on the storyboard {coverage_s} s after Shoot coverage.'),
    dict(slug='voice', badge='Recorded lines · public/audio/voice/lines.json', headline='It talks you through', picture=('result', 'lines'),
         caption='It reads its own reply aloud while the pieces land, and says each step once to a newcomer. Her voice, his, or none.'),
    dict(slug='light', badge=QUEST_17, headline='Four sets on one table', picture='captures/quest-four-sets.jpg',
         caption='In the headset: the night chase it builds first, then three built up by voice: a road crew, a deck in snow, an aircraft in the rain.'),
    dict(slug='draw', badge=LIVE_BADGE, headline='Draw it your way', picture=('live', 'draw'),
         caption='One frame four ways: as the lens sees it, a pencil storyboard, anime (the set itself turns cartoon), and hard black and white.'),
    dict(slug='coverage', badge=QUEST_17, headline='Shoot coverage', picture='captures/quest-coverage-filling.jpg',
         caption='Shot 3 of 6, in the headset: the designer planned the shots, the camera goes to each one and the board fills by itself. Six in {coverage_s} s.'),
    dict(slug='pinch', badge=QUEST_17, headline='Reach in and pick it up', picture='captures/quest-dragon-in-hand.jpg',
         caption='A hand carries the dragon off the roof onto the truck. Pinch a piece or close a fist on it; let go in the air and a dragon stays there.'),
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
    dict(slug='back', badge=QUEST, headline='It keeps your set and your board', picture='captures/quest-car-bicycle.jpg',
         caption='After a reload in the headset the panel lists what came back: the set, the pieces and the board. Same spot after a relaunch: next to prove.'),
    dict(slug='fps', badge='Result · devpost/results/quest-frame-rate.json and quest-frame-time.json', headline='{fps_median} frames a second, median', picture=('result', 'fps'),
         caption='{fps_samples} one-second samples, {fps_days} Nov: median {fps_median}, lowest {fps_min}. A heavier set on 11 Nov ran at {heavy_fps}, {heavy_then}.'),
    dict(slug='leave', badge=LIVE_BADGE, headline='What you leave with', picture=('live', 'exports'),
         caption='Saved from the page: the board the designer shot, each frame with its lens and height, and the shot list as a CSV for the crew.'),
    dict(slug='camera', badge=QUEST, headline='Format, rig, second camera', picture='captures/quest-camera-tab.jpg',
         caption='Four sensor formats, a tripod or a drone up to 11 m on the real set, and a second camera you can cut to while a take records.'),
]

# The gallery as it is submitted: eleven slides in the order of a first visit. A cold judge read on 15 Nov found
# nineteen too many, with some repeating others, and a second on 16 Nov asked for the numbers on one slide; the rest stay above for anyone who wants to render them.
# (Eight since 18 Nov: the form takes eight, and four of them are from that night's headset run.)
SUBMITTED = ['castle', 'say', 'evolve', 'look', 'rider', 'inside', 'coverage', 'leave']
SLIDES = [next(slide for slide in SLIDES if slide['slug'] == slug) for slug in SUBMITTED]

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
.pic.fill img{{object-fit:cover}}
.caption{{font-family:SetGrotesk;font-size:30px;line-height:1.3;color:#f6f7ef;margin-top:24px}}
.result{{width:100%;height:100%;padding:28px 36px;box-sizing:border-box;font-family:SetGrotesk;font-size:28px;line-height:1.35;color:#f6f7ef}}
.result table{{border-collapse:collapse;width:100%}}
.result td,.result th{{text-align:left;padding:8px 14px;border-bottom:1px solid #5a4b3d;vertical-align:top}}
.result th{{font-family:SetShoulders;font-size:24px;letter-spacing:.05em;text-transform:uppercase;color:#c7c7b7}}
.big{{font-family:SetStencil;font-size:150px;line-height:1;color:#d6e13c;margin:10px 0 0}}
.muted{{color:#c7c7b7}} .yes{{color:#d6e13c}} .pair{{display:flex;gap:16px;height:100%}} .pair img{{flex:1;min-width:0;object-fit:contain}}
.unit{{font-family:SetShoulders;font-size:40px;color:#c7c7b7;margin-left:14px}}
.result.stats{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 44px;align-content:center;padding:20px 48px}}
.stat .big{{font-size:170px}} .stat p{{margin:18px 0 0;font-size:30px;line-height:1.3}} .foot{{grid-column:1 / -1;margin:44px 0 0;font-size:26px}}
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
    if kind == 'designer':
        wholes = [run['wholeSetMs'] / 1000 for run in quest_designer['runs']]
        cell = lambda big, unit, words: (f'<div class="stat"><div class="big">{big}<span class="unit">{unit}</span></div><p>{words}</p></div>')
        return ('<div class="result stats">'
                + cell(N['quest_first_s'], 's', f'from my last word to the first piece on the table. Spoken on a Quest 3S, {len(quest_designer["runs"])} sentences in my own words.')
                + cell(f'{max(wholes):.1f}', 's', f'to the whole set standing, the slower of those two ({" and ".join(f"{v:.1f}" for v in wholes)} s). Sets with more pieces, 17 Nov: 4 to 7 s.')
                + cell(str(COVERAGE_SECONDS), 's', f'from pressing Shoot coverage to six shots planned, shot and on the storyboard. On the headset, 17 Nov.')
                + f'<p class="muted foot">From a desktop, {hurry["plans"]} requests: first piece a median {hurry["firstPieceMs"]["median"] / 1000:.1f} s, slowest {hurry["firstPieceMs"]["slowest"] / 1000:.1f} s.</p></div>')
    if kind == 'lines':
        when = {
            'land': 'The set has not landed yet',
            'mine': 'It has built the first set itself',
            'block': 'Your first set is up',
            'full': 'The board is full',
        }
        rows = ''.join(f"<tr><td class='muted'>{moment}</td><td>{spoken_lines[key]}</td></tr>" for key, moment in when.items() if key in spoken_lines)
        return (f'<div class="result rows5"><div class="big">{N["spoken_lines"]}<span class="unit">lines recorded, in two voices</span></div>'
                f'<p class="muted">What it built and what it changed through the lens are read aloud as it writes them. These never change, so they ship as files and are said once each. Four of them:</p>'
                f'<table><tr><th>When</th><th>She says</th></tr>{rows}</table></div>')
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


def cut(text: str, most: int = 66) -> str:
    """A line no longer than fits under a picture, ended at a word, with three points when it was cut."""
    if len(text) <= most:
        return text
    return text[:most].rsplit(' ', 1)[0].rstrip(',;:') + '...'


async def stage_png(page, path: Path):
    """The set's picture, cropped towards the middle where the pieces stand."""
    from PIL import Image
    await shot(page, path, '.stage')
    im = Image.open(path)
    w, h = im.size
    # As wide as the slide's picture frame (1356 by 632), so no dark bars stand beside it.
    cw = int(w * 0.94)
    ch = min(h, int(cw * 632 / 1356))
    top = max(0, min(h - ch, int(h * 0.5 - ch / 2)))
    im.crop(((w - cw) // 2, top, (w - cw) // 2 + cw, top + ch)).save(path)


async def live_capture(browser, recipe: str, out: Path) -> Path:
    """Drives the deployed page into one state and saves the set's picture, or the whole viewport."""
    # Captured at twice the pixel density, so a crop of the set still fills a slide.
    # A development build is served with a local certificate.
    ctx = await browser.new_context(viewport={'width': W, 'height': H}, color_scheme='dark', device_scale_factor=2, ignore_https_errors='GALLERY_BASE' in os.environ)
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
    if recipe in ('designer', 'castle', 'look'):
        said = {
            'designer': 'a night chase, a red car racing past a burning truck, two actors running at camera, and a dragon on a rooftop',
            'castle': 'a medieval castle gate with two guards and a horse, low angle',
            'look': 'two people arguing beside a red car in front of a house, a tree to one side, in daylight',
        }[recipe]
        # What the designer was shown at its first look, kept from the request the page sends.
        await page.evaluate('''() => {
          const real = window.fetch;
          globalThis.__looks = [];
          window.fetch = async (url, init) => {
            if (String(url).includes('/api/director') && init?.method === 'POST') {
              const body = JSON.parse(init.body);
              if (body.image) globalThis.__looks.push({ image: body.image, report: body.report ?? '' });
            }
            return real(url, init);
          };
        }''')
        await page.fill('#page-ask-text', said)
        await click('#page-ask-go')
        await page.wait_for_function('globalThis.setpiece.world.globals.designing.peek() === true', timeout=20000)
        await page.wait_for_function('globalThis.setpiece.world.globals.designing.peek() === false', timeout=90000)
        # The looks through the lens follow by themselves; the page's own view then glides to frame the set.
        # Under software GL a frame takes most of a second, so a look can start well after the last one ended: the
        # designer must have been idle for eight seconds running before the picture is taken.
        idle = 0
        for _ in range(400):
            await page.wait_for_timeout(500)
            busy = await page.evaluate('globalThis.setpiece.world.globals.designing.peek()')
            idle = 0 if busy else idle + 1
            if idle >= 16:
                break
        await page.wait_for_timeout(1000)
        lens = '''() => { const v = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.copyMonitor === 'function');
          v.refresh(); const c = document.createElement('canvas'); v.copyMonitor(c); return c.toDataURL('image/png'); }'''
        if recipe == 'designer':
            await stage_png(page, png)
        elif recipe == 'castle':
            # From outside the set, so the gate and its towers show whole: the lens stands low and close to the guards.
            await page.wait_for_timeout(800)
            await stage_png(page, png)
        else:
            from PIL import Image, ImageDraw, ImageFont
            await page.wait_for_timeout(800)
            after = await page.evaluate(lens)
            looks = await page.evaluate('globalThis.__looks')
            note = await page.inner_text('#page-ask-note')
            measured = await page.evaluate("[...globalThis.setpiece.world.getSystems()].find((s) => typeof s.frameReport === 'function').frameReport()")
            if not looks:
                raise RuntimeError('the designer did not look through the lens')
            first = Image.open(io.BytesIO(base64.b64decode(looks[0]['image']))).convert('RGB').resize((1280, 720))
            last = Image.open(io.BytesIO(base64.b64decode(after.split(',')[1]))).convert('RGB').resize((1280, 720))
            sheet = Image.new('RGB', (2640, 1150), (27, 20, 17))
            sheet.paste(first, (0, 0))
            sheet.paste(last, (1360, 0))
            draw = ImageDraw.Draw(sheet)
            face = ImageFont.truetype(str(ROOT / 'public' / 'ui' / 'fonts' / 'SchibstedGrotesk-Medium.ttf'), 34)
            label = ImageFont.truetype(str(ROOT / 'public' / 'ui' / 'fonts' / 'BigShoulders-Bold.ttf'), 40)
            draw.text((0, 740), 'WHAT IT SAW FIRST', font=label, fill=(214, 225, 60))
            draw.text((1360, 740), 'AFTER IT LOOKED', font=label, fill=(214, 225, 60))
            import textwrap, re
            # A piece is named once: "Truck (Truck)" is the truck, "A (Actor A)" is actor A.
            named = lambda text: re.sub(r'^([^(:]+) \(([^)]+)\):', lambda m: m.group(2) + ':', text)
            # A piece's line, short: its share of the frame and where, and that it is hidden when it is.
            def brief(line):
                body = line[2:]
                parts = body.split(';')[0].split(', ')
                hidden = re.search(r'hidden behind [^;,.]+', body)
                return named(', '.join(parts[:2]) if len(parts) > 1 else body) + (f' ({hidden.group(0)})' if hidden else '')
            # What it was told about its first frame: the first words of each piece's line, whole.
            y = 800
            for line in looks[0]['report'].split('\n')[:4]:
                draw.text((0, y), brief(line), font=face, fill=(199, 199, 183))
                y += 46
            # Its own note says what it changed, in full; the lines under it are measured from the frame it left.
            words = note.split(' | ', 1)[-1].split('. ', 1)[-1] if 'THROUGH THE LENS' not in note else note.split(' | ', 1)[-1]
            y = 800
            for row in textwrap.wrap(words, 70)[:3]:
                draw.text((1360, y), row, font=face, fill=(246, 247, 239))
                y += 46
            for line in measured.split('\n')[:4]:
                draw.text((1360, y), brief(line), font=face, fill=(199, 199, 183))
                y += 46
            sheet.save(png)
    elif recipe == 'dresser':
        from PIL import Image, ImageDraw, ImageFont
        runs = json.loads((ROOT / 'devpost/results/designer-eval.json').read_text(encoding='utf-8'))['runs']
        run = next(r for r in runs if r['said'] == 'zombies attacking a gas station')
        # The plan arrives whole; the reply's end waits for globalThis.__release, and a look through the lens keeps
        # the frame, so nothing here asks the model.
        await page.evaluate('''(plan) => {
          const real = window.fetch;
          const enc = new TextEncoder();
          window.fetch = async (url, init) => {
            if (!(String(url).includes('/api/director') && init?.method === 'POST')) return real(url, init);
            const body = JSON.parse(init.body);
            const reply = body.image ? { ...plan, fresh: false, remove: [], things: [], camera: { ...plan.camera, keep: true } } : plan;
            const text = JSON.stringify(reply);
            const stream = new ReadableStream({ async start(c) {
              // All at once: under software GL a timer fires about once a frame, so a slow trickle would take a minute.
              c.enqueue(enc.encode(JSON.stringify({ t: 'd', s: text }) + '\\n'));
              if (!body.image) { globalThis.__held = true; await new Promise((go) => { globalThis.__release = go; }); }
              c.enqueue(enc.encode(JSON.stringify({ t: 'end', stop: 'end_turn', ms: 1 }) + '\\n'));
              c.close();
            } });
            return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
          };
        }''', run['plan'])
        await page.fill('#page-ask-text', run['said'])
        await click('#page-ask-go')
        await page.wait_for_function('globalThis.__held === true', timeout=30000)
        # Every piece has landed; the page's view frames them and is then held still for both pictures.
        hold = '''async () => {
          const view = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.fit === 'function' && typeof s.ensureRoom === 'function');
          view.fit();
          await new Promise((d) => setTimeout(d, 2500));
          globalThis.__view = { p: view.camera.position.toArray(), q: view.camera.quaternion.toArray() };
        }'''
        keep = '''() => {
          const view = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.fit === 'function' && typeof s.ensureRoom === 'function');
          view.refit = false; view.refitAt = 0; view.gliding = false;
          view.camera.position.fromArray(globalThis.__view.p);
          view.camera.quaternion.fromArray(globalThis.__view.q);
        }'''
        # Where the car and the two actors are on the page, in CSS pixels, from the page's own view.
        where = '''() => {
          const w = globalThis.setpiece.world;
          const view = [...w.getSystems()].find((s) => typeof s.fit === 'function' && typeof s.ensureRoom === 'function');
          const pieces = [...w.getSystems()].find((s) => Array.isArray(s.rolling) && Array.isArray(s.dressed));
          const rect = document.querySelector('.stage canvas').getBoundingClientRect();
          const out = {};
          for (const piece of pieces.dressed) {
            const label = pieces.key(piece).split(':').pop();
            if (!['Car', 'A', 'B'].includes(label) || !piece.object3D?.visible) continue;
            const o = piece.object3D;
            const v = o.localToWorld(o.position.clone().set(0, label === 'Car' ? 0.07 : 0.09, 0)).project(view.camera);
            out[label] = [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
          }
          return out;
        }'''
        await page.wait_for_timeout(800)
        await page.evaluate(hold)
        before = png.with_name('live-dresser-before.png')
        await page.screenshot(path=str(before), timeout=120000)
        marks_before = await page.evaluate(where)
        await page.evaluate('globalThis.__release()')
        await page.wait_for_function('globalThis.setpiece.world.globals.designing.peek() === false', timeout=30000)
        for _ in range(12):
            await page.evaluate(keep)
            await page.wait_for_timeout(250)
        after = png.with_name('live-dresser-after.png')
        await page.screenshot(path=str(after), timeout=120000)
        marks_after = await page.evaluate(where)
        # One crop for both, around the car and the actors as they stood before and after, at 16:9.
        points = list(marks_before.values()) + list(marks_after.values())
        x0 = min(p[0] for p in points) - 160
        x1 = max(p[0] for p in points) + 160
        y0 = min(p[1] for p in points) - 120
        y1 = max(p[1] for p in points) + 120
        if (x1 - x0) / (y1 - y0) < 16 / 9:
            grow = ((y1 - y0) * 16 / 9 - (x1 - x0)) / 2
            x0, x1 = x0 - grow, x1 + grow
        else:
            grow = ((x1 - x0) * 9 / 16 - (y1 - y0)) / 2
            y0, y1 = y0 - grow, y1 + grow
        ring = (214, 225, 60)

        def framed(path, marks):
            im = Image.open(path).convert('RGB')
            k = im.width / W
            pic = im.crop(tuple(int(v * k) for v in (x0, y0, x1, y1))).resize((1280, 720))
            pen = ImageDraw.Draw(pic)
            scale = 1280 / (x1 - x0)
            for label in ('A', 'B'):
                if label not in marks:
                    continue
                cx = (marks[label][0] - x0) * scale
                cy = (marks[label][1] - y0) * scale
                r = 38 * scale
                pen.ellipse((cx - r, cy - r * 1.5, cx + r, cy + r * 1.5), outline=ring, width=6)
            return pic

        sheet = Image.new('RGB', (2640, 720 + 260), (27, 20, 17))
        sheet.paste(framed(before, marks_before), (0, 0))
        sheet.paste(framed(after, marks_after), (1360, 0))
        size = (1280, 720)
        draw = ImageDraw.Draw(sheet)
        face = ImageFont.truetype(str(ROOT / 'public' / 'ui' / 'fonts' / 'SchibstedGrotesk-Medium.ttf'), 34)
        label = ImageFont.truetype(str(ROOT / 'public' / 'ui' / 'fonts' / 'BigShoulders-Bold.ttf'), 40)
        y = size[1] + 30
        draw.text((0, y), 'AS THE DESIGNER WROTE IT', font=label, fill=(214, 225, 60))
        draw.text((1360, y), 'AFTER THE SET DRESSER', font=label, fill=(214, 225, 60))
        draw.text((0, y + 64), 'Two actors standing inside the car', font=face, fill=(199, 199, 183))
        draw.text((1360, y + 64), 'Stepped out beside it, before the camera is placed', font=face, fill=(246, 247, 239))
        sheet.save(png)
    elif recipe == 'draw':
        from PIL import Image, ImageDraw, ImageFont
        # A duel from the real designer, then the same frame snapped in each of the four styles: what goes on the
        # board is what the app itself draws (src/frame-style.ts, and in anime the set as a cartoon, src/toon.ts).
        await page.fill('#page-ask-text', 'a knight facing a red dragon in front of a castle gate, a tree and a horse beside them, in daylight, low and wide')
        await click('#page-ask-go')
        await page.wait_for_function('globalThis.setpiece.world.globals.designing.peek() === true', timeout=20000)
        idle = 0
        for _ in range(400):
            await page.wait_for_timeout(500)
            busy = await page.evaluate('globalThis.setpiece.world.globals.designing.peek()')
            idle = 0 if busy else idle + 1
            if idle >= 16:
                break
        names = ('photo', 'sketch', 'anime', 'noir')
        frames = []
        for style in names:
            await page.evaluate('(style) => { globalThis.setpiece.world.globals.frameStyle.value = style; }', style)
            await page.wait_for_timeout(1500)
            before = await page.evaluate('globalThis.setpiece.world.globals.shotFrames.peek().length')
            await page.evaluate('globalThis.setpiece.world.globals.snapRequested.value += 1')
            for _ in range(240):
                await page.wait_for_timeout(250)
                if await page.evaluate('globalThis.setpiece.world.globals.shotFrames.peek().length') > before:
                    break
            else:
                raise RuntimeError(f'no frame was snapped in the {style} style')
            url = await page.evaluate('globalThis.setpiece.world.globals.shotFrames.peek().at(-1).dataUrl')
            frames.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB').resize((1280, 720), Image.LANCZOS))
        await page.evaluate("globalThis.setpiece.world.globals.frameStyle.value = 'photo'")
        if len({frame.tobytes()[:200000:997] for frame in frames}) < len(frames):
            raise RuntimeError('two styles gave the same picture')
        gap, band = 24, 64
        sheet = Image.new('RGB', (1280 * 2 + gap, (720 + band) * 2 + gap), (42, 33, 28))
        draw = ImageDraw.Draw(sheet)
        label = ImageFont.truetype(str(ROOT / 'public' / 'ui' / 'fonts' / 'BigShoulders-Bold.ttf'), 44)
        for i, (name, frame) in enumerate(zip(names, frames)):
            x = (i % 2) * (1280 + gap)
            y = (i // 2) * (720 + band + gap)
            sheet.paste(frame, (x, y))
            draw.text((x + 6, y + 720 + 8), name.upper(), font=label, fill=(214, 225, 60))
        sheet.save(png)
    elif recipe in ('light', 'coverage', 'exports'):
        from PIL import Image
        # One set from the real designer, let settle (its looks through the lens follow by themselves).
        await page.fill('#page-ask-text', 'a night chase, a red car racing past a burning truck by a house and a street lamp, two actors running at camera')
        await click('#page-ask-go')
        await page.wait_for_function('globalThis.setpiece.world.globals.designing.peek() === true', timeout=20000)
        idle = 0
        for _ in range(400):
            await page.wait_for_timeout(500)
            busy = await page.evaluate('globalThis.setpiece.world.globals.designing.peek()')
            idle = 0 if busy else idle + 1
            if idle >= 16:
                break
        lens = '''() => { const v = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.copyMonitor === 'function');
          v.refresh(); const c = document.createElement('canvas'); v.copyMonitor(c); return c.toDataURL('image/png'); }'''
        if recipe == 'light':
            from PIL import ImageDraw, ImageFont
            # A wide of that set, so the street, the house and the lamp are in it: the camera is put there by the
            # app's own camera placing, at the front of the stage, looking at the car.
            await page.evaluate('''() => {
              const director = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.frameShot === 'function');
              director.frameShot({ keep: false, x: 0.4, z: 3.9, height: 2.4, lens: 18, look_at: 'Car', look_x: 0, look_y: 1, look_z: 0 });
            }''')
            await page.wait_for_timeout(1500)
            # The shot camera's own picture of it in four of its lights, two by two, each with its name.
            names = ('day', 'golden hour', 'overcast', 'night')
            frames = []
            for light in names:
                await page.evaluate('(light) => { globalThis.setpiece.world.globals.setLight.value = light; }', light)
                await page.wait_for_timeout(1500)
                # The lens is only drawn again when something changes, and under software rendering a frame can take
                # seconds: a fresh pass is asked for and waited on, so each picture is of its own light.
                await page.evaluate('''() => { const v = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.copyMonitor === 'function');
                  globalThis.__passes = v.lensPasses; v.refresh(); }''')
                for _ in range(120):
                    await page.wait_for_timeout(250)
                    if await page.evaluate("[...globalThis.setpiece.world.getSystems()].find((s) => typeof s.copyMonitor === 'function').lensPasses >= globalThis.__passes + 2"):
                        break
                else:
                    raise RuntimeError(f'the lens was not drawn again in the {light} light')
                url = await page.evaluate('''() => { const v = [...globalThis.setpiece.world.getSystems()].find((s) => typeof s.copyMonitor === 'function');
                  const c = document.createElement('canvas'); v.copyMonitor(c); return c.toDataURL('image/png'); }''')
                frames.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGB').resize((1280, 720)))
            if len({frame.tobytes()[:200000:997] for frame in frames}) < len(frames):
                raise RuntimeError('two lights gave the same picture')
            gap, band = 24, 64
            sheet = Image.new('RGB', (1280 * 2 + gap, (720 + band) * 2 + gap), (42, 33, 28))
            draw = ImageDraw.Draw(sheet)
            label = ImageFont.truetype(str(ROOT / 'public' / 'ui' / 'fonts' / 'BigShoulders-Bold.ttf'), 44)
            for i, (name, frame) in enumerate(zip(names, frames)):
                x = (i % 2) * (1280 + gap)
                y = (i // 2) * (720 + band + gap)
                sheet.paste(frame, (x, y))
                draw.text((x + 6, y + 720 + 8), name.upper(), font=label, fill=(214, 225, 60))
            sheet.save(png)
        else:
            # The designer plans the coverage and the app shoots it onto the board; the board is then saved by the
            # page's own button, as the app saves it (and, for the slide of what leaves, the shot list with it).
            await page.evaluate('globalThis.setpiece.world.globals.coverageRequested.value += 1')
            await page.wait_for_function('globalThis.setpiece.world.globals.coverageRunning.peek() === true', timeout=20000)
            await page.wait_for_function('globalThis.setpiece.world.globals.coverageRunning.peek() === false', timeout=600000)
            frames = await page.evaluate('globalThis.setpiece.world.globals.shotFrames.peek().length')
            if frames < 3:
                raise RuntimeError(f'coverage put only {frames} frames on the board')
            board_path = png if recipe == 'coverage' else out / 'saved-board.png'
            async with page.expect_download(timeout=30000) as waiting:
                await click('#page-save-board')
            await (await waiting.value).save_as(str(board_path))
            if recipe == 'exports':
                # What a director leaves with: that board and its shot list, saved by the page's own buttons.
                from PIL import ImageDraw, ImageFont
                import csv
                async with page.expect_download(timeout=30000) as waiting:
                    await click('#page-save-list')
                csv_path = out / 'saved-shot-list.csv'
                await (await waiting.value).save_as(str(csv_path))
                board = Image.open(board_path).convert('RGB')
                rows = list(csv.reader(io.StringIO(csv_path.read_text(encoding='utf-8'))))
                # As wide as the slide's picture frame (1356 by 632), so nothing is left dark around it.
                width, height = 2712, 1264
                sheet = Image.new('RGB', (width, height), (42, 33, 28))
                bw = 1720
                bh = int(board.height * bw / board.width)
                sheet.paste(board.resize((bw, bh)), (40, (height - bh) // 2))
                draw = ImageDraw.Draw(sheet)
                font = ImageFont.truetype(str(ROOT / 'public/ui/fonts/SchibstedGrotesk-Medium.ttf'), 38)
                head = ImageFont.truetype(str(ROOT / 'public/ui/fonts/BigShoulders-Bold.ttf'), 46)
                left = bw + 110
                draw.text((left, 150), 'SETPIECE-SHOT-LIST.CSV', font=head, fill=(214, 225, 60))
                header, body = rows[0], rows[1:]
                at = {name: header.index(name) for name in ('Frame', 'Shot', 'Lens mm', 'Camera height m')}
                columns = [('Frame', '#', 0), ('Shot', 'SHOT', 70), ('Lens mm', 'LENS', 520), ('Camera height m', 'HEIGHT', 680)]
                y = 240
                for name, title, x in columns:
                    draw.text((left + x, y), title, font=head, fill=(199, 199, 183))
                y += 70
                draw.line((left, y - 8, width - 60, y - 8), fill=(90, 75, 61), width=3)
                for record in body[:6]:
                    for name, title, x in columns:
                        cell = record[at[name]]
                        if name == 'Lens mm':
                            cell += ' mm'
                        if name == 'Camera height m':
                            cell = f'{float(cell):.2f} m'
                        draw.text((left + x, y + 14), cell[:22], font=font, fill=(246, 247, 239))
                    y += 88
                    draw.line((left, y - 6, width - 60, y - 6), fill=(60, 50, 42), width=2)
                sheet.save(png)
    elif recipe == 'standoff':
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
            filled = await page.evaluate("document.querySelectorAll('#board li.filled img').length")
            await click('#page-snap')
            # Under software GL a frame can take several seconds to reach the board.
            await page.wait_for_function(f"document.querySelectorAll('#board li.filled img').length > {filled}", timeout=60000)
            await page.wait_for_timeout(500)
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
        import csv
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
    # A full run leaves only this list's slides: a slide renumbered or dropped is not left behind to be uploaded.
    if not only:
        keep = {f'{n}-{slug}.png' for n, slug, _ in captions}
        for old in OUT.glob('*.png'):
            if old.name not in keep:
                old.unlink()
                print('removed', old.name)
    lines = ['# Gallery captions', '', 'One block per image, in gallery order. Paste the block, nothing else.', '']
    for n, slug, caption in captions:
        lines += [f'## {n} {slug}', '', '```', caption, '```', '']
    (OUT / 'captions.md').write_text('\n'.join(lines), encoding='utf-8')
    print(f'{len(captions)} slides, longest caption {max(len(c) for _, _, c in captions)}')


asyncio.run(main())
