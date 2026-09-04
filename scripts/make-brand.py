"""Build every BlackGATE brand asset from the one supplied wordmark.

    python scripts/make-brand.py

The input is `assets/brand/wordmark-source.png`, exactly as it was supplied: the
BlackGATE wordmark in its own charcoal on a near-white ground. Everything the
product draws is cut from that file rather than redrawn, so the tab mark, the
app icon and the wordmark in the top bar are the same letterforms and not three
near-misses of each other.

Two things are worth knowing about how the cutting works.

The ground is knocked out by coverage rather than by a threshold. Each pixel's
alpha is how far it sits between the paper and the ink, so the anti-aliased
edges of the supplied artwork survive, and the same mask can be inked in either
direction — charcoal for light surfaces, white for dark ones — without one of
them growing a halo.

The tab mark is the B from the wordmark, cut out and set on the product black.
A wordmark is unreadable at 16 pixels, and a letter traced by hand would be a
different B from the one on every other surface; taking the real one costs
nothing and cannot drift.
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOURCE = os.path.join(ROOT, 'assets', 'brand', 'wordmark-source.png')
BRAND_DIR = os.path.join(ROOT, 'assets', 'brand')

# Measured off the supplied file: the paper and the ink it was drawn with.
GROUND = 253.0
INK = 51.0

# The brand's own charcoal, for light surfaces. White is used on dark ones.
INK_RGB = (51, 51, 51)
WHITE_RGB = (255, 255, 255)

# Wordmark output scale. The console draws it around 130px wide and the site
# around 100px, so 3x the supplied artwork is retina-sharp everywhere with no
# file worth shrinking.
WORDMARK_SCALE = 3

# --- tile icon ---------------------------------------------------------------
TILE = 64            # design units the radius and cap height are expressed in
SS = 8               # supersample factor
BG = (10, 10, 10)    # product black
RING = (255, 255, 255, 40)
RADIUS = 14          # tile corner, in design units
MARK_H = 38          # cap height of the B inside the 64 tile


# Paper is not perfectly even: the supplied file ranges over a couple of levels
# either side of GROUND. Anything under this much coverage is that unevenness
# rather than ink, and is flattened so the artwork is a wordmark on transparency
# and not a wordmark on a faint grey rectangle.
FLOOR = 6


def coverage(img: Image.Image) -> Image.Image:
    """How much ink covers each pixel, as an 8-bit mask.

    0 where the supplied artwork is paper, 255 where it is solid ink, and the
    real in-between at every anti-aliased edge.
    """
    grey = img.convert('L')
    span = GROUND - INK

    def level(v: int) -> int:
        cov = round((GROUND - v) / span * 255)
        return 0 if cov < FLOOR else max(0, min(255, cov))

    return grey.point(level)


def scaled(mark: Image.Image, height: int) -> Image.Image:
    """The mark's coverage mask at a given cap height, with a crisp edge.

    Scaling happens on the mask, never on an inked RGBA image. Resampling RGBA
    mixes the colour of fully transparent pixels into their neighbours, and the
    colour of a transparent pixel is not defined — here it is black, so an
    inked-then-scaled glyph comes out ringed in grey. Scaling coverage and
    inking afterwards has nothing to mix.

    The supplied wordmark is a screenshot, so its B is only about fifty pixels
    tall and every large icon is an enlargement. Lanczos widens the edge ramp as
    it enlarges, which reads as a blurred letter rather than a smooth one, so
    coverage is pushed back through a steeper ramp afterwards: the edge returns
    to about a pixel and stays anti-aliased instead of going stair-stepped.
    """
    width = max(1, round(mark.width * height / mark.height))
    out = mark.resize((width, height), Image.LANCZOS)
    if height <= mark.height:
        return out

    # Half-width of the ramp to keep, in coverage levels: one source pixel
    # spreads over this many output pixels, and one output pixel is what we want.
    edge = max(24.0, 255 / (2 * height / mark.height))

    def steepen(v: int) -> int:
        t = (v - 128) / edge
        if t <= -1:
            return 0
        if t >= 1:
            return 255
        u = (t + 1) / 2
        return round(255 * u * u * (3 - 2 * u))  # smoothstep, no corner in it

    return out.point(steepen)


def inked(mask: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """The mask, painted in one flat colour on transparency."""
    out = Image.new('RGBA', mask.size, rgb + (0,))
    out.putalpha(mask)
    return out


def trim(mask: Image.Image) -> tuple[int, int, int, int]:
    """The box the ink actually occupies. Alpha is authoritative, not colour."""
    box = mask.getbbox()
    if box is None:
        raise SystemExit(f'{SOURCE} has no ink in it')
    return box


def tile(size: int, mark: Image.Image, ring: bool = True, bg=BG) -> Image.Image:
    """One square icon at `size` px, rendered SS-times up and boxed down."""
    s = size * SS
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = RADIUS / TILE * s
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=bg + (255,))
    if ring:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, outline=RING,
                            width=max(1, round(s / TILE)))

    glyph = inked(scaled(mark, round(MARK_H / TILE * s)), WHITE_RGB)
    im.alpha_composite(glyph, (round((s - glyph.width) / 2), round((s - glyph.height) / 2)))
    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    source = Image.open(SOURCE).convert('RGB')
    mask = coverage(source)
    word_box = trim(mask)
    word = mask.crop(word_box)

    # The B is the first run of ink in the wordmark. Found by walking the
    # columns rather than hard-coded, so re-cutting from a differently cropped
    # supply still finds the right letter.
    cols = [max(word.crop((x, 0, x + 1, word.height)).getdata()) for x in range(word.width)]
    end = next((x for x in range(1, len(cols)) if cols[x] == 0 and cols[x - 1] > 0), word.width)
    b_mask = word.crop((0, 0, end, word.height))
    b_mask = b_mask.crop(trim(b_mask))

    os.makedirs(BRAND_DIR, exist_ok=True)
    size = (word.width * WORDMARK_SCALE, word.height * WORDMARK_SCALE)
    big = word.resize(size, Image.LANCZOS)

    # `logo-light` is what a light surface gets; `logo-dark` is for dark ones.
    # The names say which surface, not which ink, and match what the app imports.
    inked(big, INK_RGB).save(os.path.join(BRAND_DIR, 'logo-light.png'))
    inked(big, WHITE_RGB).save(os.path.join(BRAND_DIR, 'logo-dark.png'))

    # Kept as a coverage mask, not as an inked image — see scaled().
    mark = b_mask

    public = os.path.join(ROOT, 'public')

    # .ico — what browsers fetch from / by convention, and what Windows uses for
    # pinned sites. 48/32/16 covers every place it is drawn.
    tile(256, mark).save(os.path.join(public, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    tile(32, mark).save(os.path.join(public, 'favicon-32x32.png'))
    tile(16, mark).save(os.path.join(public, 'favicon-16x16.png'))

    # iOS home screen: no ring (the OS masks the corners itself) and no
    # transparency, drawn to the edge.
    apple = tile(180, mark, ring=False)
    flat = Image.new('RGB', apple.size, BG)
    flat.paste(apple, (0, 0), apple)
    flat.save(os.path.join(public, 'apple-touch-icon.png'))

    # Android / PWA install icons.
    tile(192, mark).save(os.path.join(public, 'icon-192.png'))
    tile(512, mark).save(os.path.join(public, 'icon-512.png'))

    # The SVG the browser actually draws in a tab. The tile is vector so its
    # corner stays exact at any size; the letter is the cut-out B at 512, because
    # a hand-traced outline would be a second, slightly different B and this one
    # is already sharper than a favicon is ever drawn.
    import base64
    import io

    buf = io.BytesIO()
    glyph = inked(scaled(mark, round(MARK_H / TILE * 512)), WHITE_RGB)
    glyph_w = glyph.width
    glyph.save(buf, format='PNG', optimize=True)
    data = base64.b64encode(buf.getvalue()).decode('ascii')
    gx = (TILE - glyph_w * TILE / 512) / 2
    gy = (TILE - MARK_H) / 2
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {TILE} {TILE}" width="{TILE}" height="{TILE}" role="img" aria-label="BlackGATE">
  <!-- The tab mark: the B from the BlackGATE wordmark, white on the product
       black. The tile is vector so its corner radius is exact at any size; the
       letter is the wordmark's own B rather than a traced outline, so the tab
       and every other surface show the same letterform. Generated by
       scripts/make-brand.py — edit the wordmark, not this file. -->
  <rect width="{TILE}" height="{TILE}" rx="{RADIUS}" fill="#0A0A0A"/>
  <rect x="0.5" y="0.5" width="{TILE - 1}" height="{TILE - 1}" rx="{RADIUS - 0.5}" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>
  <image x="{gx:.3f}" y="{gy:.3f}" width="{glyph_w * TILE / 512:.3f}" height="{MARK_H}" xlink:href="data:image/png;base64,{data}"/>
</svg>
'''
    with open(os.path.join(public, 'icon.svg'), 'w', encoding='utf-8') as fh:
        fh.write(svg)

    # Expo assets. The native icon and splash are drawn on the tile; the Expo web
    # favicon is the small tile again.
    assets = os.path.join(ROOT, 'assets')
    tile(1024, mark, ring=False).save(os.path.join(assets, 'icon.png'))
    tile(48, mark).save(os.path.join(assets, 'favicon.png'))

    # Splash: the mark alone on the product black, at the proportion Expo expects
    # for an adaptive foreground (the glyph sits well inside the safe circle).
    splash = Image.new('RGBA', (1024, 1024), BG + (255,))
    sg = inked(scaled(mark, 300), WHITE_RGB)
    splash.alpha_composite(sg, ((1024 - sg.width) // 2, (1024 - sg.height) // 2))
    splash.save(os.path.join(assets, 'splash-icon.png'))

    # Android adaptive icon: a flat black plate with the white B on it, and a
    # monochrome layer for themed icons.
    fg = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    fgg = inked(scaled(mark, 190), WHITE_RGB)
    fg.alpha_composite(fgg, ((512 - fgg.width) // 2, (512 - fgg.height) // 2))
    fg.save(os.path.join(assets, 'android-icon-foreground.png'))
    Image.new('RGBA', (512, 512), BG + (255,)).save(os.path.join(assets, 'android-icon-background.png'))

    mono = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
    mg = inked(scaled(mark, 160), WHITE_RGB)
    mono.alpha_composite(mg, ((432 - mg.width) // 2, (432 - mg.height) // 2))
    mono.save(os.path.join(assets, 'android-icon-monochrome.png'))

    print(f'wordmark {size[0]}x{size[1]}, mark {b_mask.width}x{b_mask.height}')
    print('brand assets written')


if __name__ == '__main__':
    main()
