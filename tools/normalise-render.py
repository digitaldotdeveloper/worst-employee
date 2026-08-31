"""Rescale new green-screen renders so the FIGURE matches the set's datum.

WHY THIS EXISTS

The generator does not honour "same size as the reference", and it has cost
renders three separate times now — a boss sit 85% too tall, a sami hurt3 92%,
and a whole cast batch at 65-80%. Saying it again in different words works
sometimes and is a coin flip.

The reason it looks unfixable from the prompt is that it is usually not a ZOOM
at all: the generator quietly changes the CANVAS. The cast was drawn on
1024x559 landscape; asking for a figure with generous margins above and below
returned 977x1024 portrait. The figure occupies a sane fraction of its own
frame either way — 84% and 87% — which is exactly why a fraction-of-image check
passes it and cutout.py's absolute height check then rejects it.

So stop arguing with the generator. Measure the figure in the datum render,
measure it in the new one, scale the new one by the ratio and re-canvas it onto
the datum's dimensions with the feet on the same line. Deterministic, free, and
it cannot drift.

    python tools/normalise-render.py <set> <pose> [<pose> ...]
    python tools/normalise-render.py npc-rita hurt2 hurt3
"""
import os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def figure_box(im):
    a = np.array(im.convert('RGBA')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fig = ~((g > 90) & (g > r + 40) & (g > b + 40))
    ys, xs = np.where(fig)
    if not len(ys):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def main(setname, poses):
    src = os.path.join(HERE, 'renders-' + setname)
    datum_p = os.path.join(src, 'idle.png')
    datum = Image.open(datum_p).convert('RGBA')
    db = figure_box(datum)
    if not db:
        print('!! no figure in the datum'); return 1
    dh = db[3] - db[1]
    print('datum %s: canvas %dx%d, figure %dpx tall, feet at y=%d'
          % (setname, datum.width, datum.height, dh, db[3]))

    for pose in poses:
        p = os.path.join(src, pose + '.png')
        if not os.path.exists(p):
            print('  !! %s: missing' % pose); continue
        im = Image.open(p).convert('RGBA')
        bx = figure_box(im)
        if not bx:
            print('  !! %s: no figure found' % pose); continue
        fh = bx[3] - bx[1]
        k = dh / float(fh)
        # A pose can be legitimately shorter (doubled over) or taller (arms up),
        # so match on figure height only when the difference is a SCALE problem
        # — a canvas change — rather than a pose difference. Over 25% is scale.
        if 0.8 <= k <= 1.25:
            print('  ok %-7s already within 25%% of the datum (x%.2f)' % (pose, k))
            continue
        cropped = im.crop(bx)
        nw = max(1, int(round(cropped.width * k)))
        nh = max(1, int(round(cropped.height * k)))
        scaled = cropped.resize((nw, nh), Image.LANCZOS)
        out = Image.new('RGBA', (datum.width, datum.height), (0, 255, 0, 255))
        # centre horizontally on the datum's figure centre, feet on its ground line
        cx = (db[0] + db[2]) // 2
        out.alpha_composite(scaled, (max(0, cx - nw // 2), max(0, db[3] - nh)))
        out.save(p)
        print('  fixed %-7s x%.2f  %dx%d -> %dx%d, figure %d -> %d'
              % (pose, k, im.width, im.height, out.width, out.height, fh, nh))
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2:]))
