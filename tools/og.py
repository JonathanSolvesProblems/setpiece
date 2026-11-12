"""Compose public/og.png, the picture a link to the site shows when it is shared: 1200 by 630.

    py tools/og.py

The charter's laws for a submission image apply (.design/brand/CHARTER.md): black cloth for the ground, chalk for
the type, one loud line in the stencil, the clapper stripe once and under it, and the drawing straight on the cloth
with nothing behind it. The drawing is public/art/anchor.png, cut out of its key colour: it is laid down with its
transparency, and whatever of the key colour is left along its edges is taken off first. The faces travel inside the
page, because a page composed this way may not load a font from disk, and the tool stops if one does not load.

Needs Python 3 with playwright and Pillow.
"""
import asyncio
import base64
import io
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
CLOTH = '#1b1411'
CHALK = '#f6f7ef'
MUTED = '#c7c7b7'


def font_uri(name: str) -> str:
    return 'data:font/ttf;base64,' + base64.b64encode((ROOT / 'public' / 'ui' / 'fonts' / name).read_bytes()).decode()


def drawing_uri() -> str:
    """The chalk drawing with its transparency, the key colour's leftovers removed, and its outer edge trimmed."""
    art = Image.open(ROOT / 'public' / 'art' / 'anchor.png').convert('RGBA')
    px = art.load()
    w, h = art.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # What is left of the green it was cut from: far greener than it is red or blue. And the
            # faintest of the haze, which on cloth reads as a plate behind the drawing.
            if a > 0 and (a < 56 or (g > r + 40 and g > b + 40)):
                px[x, y] = (r, g, b, 0)
    art = art.crop((8, 8, w - 8, h - 8))
    out = io.BytesIO()
    art.save(out, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()


def wordmark() -> str:
    svg = (ROOT / '.design' / 'brand' / 'wordmark-chalk.svg').read_text(encoding='utf-8')
    return svg[svg.index('<svg'):]


PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:SetShoulders;src:url("{shoulders}") format("truetype")}}
@font-face{{font-family:SetGrotesk;src:url("{grotesk}") format("truetype")}}
html,body{{margin:0;width:{w}px;height:{h}px;background:{cloth};overflow:hidden}}
.card{{position:relative;width:{w}px;height:{h}px}}
.words{{position:absolute;left:76px;top:118px;width:560px}}
.words svg{{display:block;width:540px;height:auto}}
.stripe{{margin-top:34px;width:540px;height:18px;background:repeating-linear-gradient(-45deg,{chalk} 0 18px,{cloth} 18px 36px)}}
.line{{margin-top:30px;font-family:SetShoulders;font-size:50px;line-height:1.02;color:{chalk};letter-spacing:.01em}}
.small{{margin-top:16px;font-family:SetGrotesk;font-size:25px;line-height:1.3;color:{muted}}}
.art{{position:absolute;right:54px;top:62px;height:506px;width:auto}}
</style></head><body><div class="card">
<div class="words">{wordmark}<div class="stripe"></div><div class="line">Block the shot on your kitchen table</div>
<div class="small">Hands-first previs for Meta Quest. Runs in the headset's browser.</div></div>
<img class="art" src="{art}" alt=""></div></body></html>"""


async def main():
    html = PAGE.format(shoulders=font_uri('BigShoulders-Bold.ttf'), grotesk=font_uri('SchibstedGrotesk-Medium.ttf'), w=W, h=H,
                       cloth=CLOTH, chalk=CHALK, muted=MUTED, wordmark=wordmark(), art=drawing_uri())
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
        await page.set_content(html)
        await page.wait_for_timeout(400)
        await page.evaluate('document.fonts.ready')
        missing = await page.evaluate("['SetShoulders', 'SetGrotesk'].filter((face) => !document.fonts.check('30px ' + face))")
        assert not missing, f'these faces did not load: {missing}'
        # Nothing may sit on the wordmark or the words: the drawing has to clear them.
        boxes = await page.evaluate("[document.querySelector('.words'), document.querySelector('.art')].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.right]; })")
        assert boxes[0][1] <= boxes[1][0], f'the drawing overlaps the words: {boxes}'
        out = ROOT / 'public' / 'og.png'
        await page.screenshot(path=str(out))
        await browser.close()
    print(out, Image.open(out).size)


asyncio.run(main())
