"""Turn the rendered head portraits into head CUTOUTS the game can wear.

The renders come back framed head-and-shoulders on green. What the game needs is
the head alone, keyed, trimmed at the neck, with a recorded centre and width so
it can be scaled onto a body's head anchor at any size.

Neck detection: scan the figure's row widths from the top. A head widens to the
cheekbones, narrows at the neck, then widens hard into the shoulders. The neck
is the narrowest row between the widest head row and the point the width runs
away — cutting there is what keeps a collar and a tie out of the cutout.
"""
import os, json, glob
import numpy as np
from PIL import Image

SRC = 'tools/renders-faces'
OUT = 'assets/faces/heads'


def key_green(im):
    a = np.array(im.convert('RGBA')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 90) & (g > r + 40) & (g > b + 40)
    out = a.copy()
    out[..., 3] = np.where(green, 0, 255)
    # de-fringe: pull green out of the surviving edge pixels
    edge = (~green) & (g > r + 12) & (g > b + 12)
    out[..., 1] = np.where(edge, (r + b) // 2, out[..., 1])
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def head_box(al):
    ys, xs = np.where(al)
    if not len(ys):
        return None
    y0, y1 = int(ys.min()), int(ys.max())
    widths = []
    for y in range(y0, y1 + 1):
        row = np.where(al[y])[0]
        widths.append((y, 0 if not len(row) else int(row.max() - row.min() + 1)))
    if not widths:
        return None
    top = widths[0][0]
    span = widths[-1][0] - top
    # widest row in the top 45% is the cheekbones; the neck is the narrowest row
    # after it, searched only as far as 80% down so shoulders cannot win.
    upper = [w for w in widths if w[0] <= top + span * 0.45]
    if not upper:
        return None
    cheek = max(upper, key=lambda w: w[1])
    after = [w for w in widths if cheek[0] < w[0] <= top + span * 0.80]
    neck = min(after, key=lambda w: w[1]) if after else widths[-1]
    cut = neck[0] + 2
    sub = al[y0:cut + 1]
    ys2, xs2 = np.where(sub)
    return (int(xs2.min()), y0, int(xs2.max()) + 1, cut + 1)


os.makedirs(OUT, exist_ok=True)
meta = {}
for p in sorted(glob.glob(os.path.join(SRC, '*.png')) + glob.glob(os.path.join(SRC, '*.jpg'))):
    name = os.path.splitext(os.path.basename(p))[0]
    im = key_green(Image.open(p))
    al = np.array(im)[..., 3] > 40
    bx = head_box(al)
    if not bx:
        print('  !! %s: no figure' % name)
        continue
    head = im.crop(bx)
    # trim fully transparent margins
    a2 = np.array(head)[..., 3] > 40
    ys, xs = np.where(a2)
    head = head.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    head.thumbnail((256, 256), Image.LANCZOS)
    head.save(os.path.join(OUT, name + '.png'))
    meta[name] = {'w': head.width, 'h': head.height}
    print('  %-22s %dx%d' % (name, head.width, head.height))

json.dump({'_comment': 'Head cutouts, keyed and trimmed at the neck by tools/cut-faces.py.',
           'heads': meta}, open(os.path.join(OUT, 'heads.json'), 'w', encoding='utf-8'), indent=1)
print('\n%d head cutouts -> %s' % (len(meta), OUT))
