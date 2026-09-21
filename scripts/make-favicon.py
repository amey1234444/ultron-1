"""Build the ULTRON tab mark.

The U is not a font glyph — it is the U traced off assets/brand/logo-dark.png,
measured at 40 x 50 with a 10-wide stem and a bowl made of two circles
concentric on (20, 30) at r=20 and r=10. That makes it a true monoline, which
is what the wordmark is, and it means the tab mark and the wordmark are the
same letter rather than two near-misses.
"""
from PIL import Image, ImageDraw

TILE = 64          # design units
SS = 16            # supersample
BG = (10, 10, 10)  # --u-bg
INK = (255, 255, 255)
RING = (255, 255, 255, 40)
RADIUS = 14        # tile corner
U_H = 38           # cap height of the U inside the 64 tile


def u_mask(px):
    """Alpha mask of the U, drawn in a px-wide box at the source 40:50 ratio."""
    s = px / 40.0
    w, h = round(40 * s), round(50 * s)
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    # outer silhouette: the shoulders, plus the full bowl circle
    d.rectangle([0, 0, 40 * s, 30 * s], fill=255)
    d.ellipse([0, 10 * s, 40 * s - 1, 50 * s - 1], fill=255)
    # counter: punch the inner shoulders and the inner circle back out
    d.rectangle([10 * s, 0, 30 * s, 30 * s], fill=0)
    d.ellipse([10 * s, 20 * s, 30 * s - 1, 40 * s - 1], fill=0)
    return m


def tile(size, ring=True, bg=BG):
    """One square icon at `size` px, rendered SS-times up and boxed down."""
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = RADIUS / TILE * S
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=bg + (255,))
    if ring:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r,
                            outline=RING, width=max(1, round(S / TILE)))

    uh = U_H / TILE * S
    uw = uh * 40 / 50
    m = u_mask(round(uw))
    ink = Image.new('RGBA', m.size, INK + (255,))
    im.paste(ink, (round((S - m.size[0]) / 2), round((S - m.size[1]) / 2)), m)
    return im.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    import sys
    out = sys.argv[1]

    # .ico — the file browsers fetch from / by convention, and the one Windows
    # uses for pinned sites. 48/32/16 covers every place it is drawn.
    ico = tile(256)
    ico.save(out + '/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])

    # Bare PNGs for the explicit <link rel="icon"> pair.
    tile(32).save(out + '/favicon-32x32.png')
    tile(16).save(out + '/favicon-16x16.png')

    # iOS home screen: no ring (the OS masks the corners itself) and no
    # transparency, drawn to the edge.
    ap = tile(180, ring=False)
    flat = Image.new('RGB', ap.size, BG)
    flat.paste(ap, (0, 0), ap)
    flat.save(out + '/apple-touch-icon.png')

    # Android / PWA install icon.
    tile(192).save(out + '/icon-192.png')
    tile(512).save(out + '/icon-512.png')
    print('icons written to', out)
