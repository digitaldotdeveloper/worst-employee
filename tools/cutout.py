# Turn the generated green-screen poses into game-ready sprites.
#
#   python tools/cutout.py            process tools/renders/ -> assets/player/
#   python tools/cutout.py --check    validate only, write nothing
#
# THE IMPORTANT DECISION IN HERE:
# Every pose is cropped to the SAME rectangle in source space rather than
# trimmed individually. Trimming each sprite to its own bounds and re-anchoring
# it is where character animation usually goes wrong - the feet end up on
# slightly different lines and the character bobs and slides between states.
# One shared crop means one shared coordinate system, and the anchor is a
# constant instead of a per-frame guess.

import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
# Which outfit to pack: `python tools/cutout.py hood`. Each outfit is a full
# set of drawn frames, so it gets its own folder under assets/player/.
OUTFIT = ([a for a in sys.argv[1:] if not a.startswith('--')] or ['base'])[0]
SRC = os.path.join(HERE, 'renders-' + OUTFIT)
# Cast members go to assets/cast/; player outfits to assets/player/.
_KIND = 'cast' if OUTFIT.startswith(('npc-', 'boss-')) else 'player'
OUT = os.path.join(os.path.dirname(HERE), 'assets', _KIND, OUTFIT)

# The pose that defines the ground line and the standing height.
DATUM = 'idle'
# Standing height in output pixels. The game draws the player 62px tall, so 2x
# gives a little headroom for high-DPI phones without bloating the download.
TARGET_H = 124
PAD = 8


def key(path):
    """Chroma-key flat green, despill the fringe, return RGBA uint8."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 90) & (g - np.maximum(r, b) > 40)

    alpha = np.where(green, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])

    # Despill: the hard key leaves a green rim. Pull g down to max(r,b)
    # wherever it runs ahead of both, which neutralises the fringe without
    # touching genuinely green-ish pixels elsewhere (there are none by design).
    rr = rgba[..., 0].astype(np.int16)
    gg = rgba[..., 1].astype(np.int16)
    bb = rgba[..., 2].astype(np.int16)
    cap = np.maximum(rr, bb)
    spill = (gg > cap) & (alpha > 0)
    gg[spill] = cap[spill]
    rgba[..., 1] = gg.astype(np.uint8)
    return rgba


def bbox(rgba):
    ys, xs = np.where(rgba[..., 3] > 0)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def main():
    check_only = '--check' in sys.argv
    if not os.path.isdir(SRC):
        print('no renders directory at ' + SRC)
        return

    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.png'))
    if not files:
        print('no PNGs in ' + SRC)
        return

    keyed, boxes, problems = {}, {}, []
    for f in files:
        name = os.path.splitext(f)[0]
        rgba = key(os.path.join(SRC, f))
        bb = bbox(rgba)
        if bb is None:
            problems.append(f'{name}: EMPTY after keying (background may not be green)')
            continue
        keyed[name] = rgba
        boxes[name] = bb

        h, w = rgba.shape[:2]
        # A figure touching the frame edge has been cropped by the generator.
        if bb[0] <= 1 or bb[1] <= 1 or bb[2] >= w - 2 or bb[3] >= h - 2:
            problems.append(f'{name}: touches the frame edge - limb is cut off')
        cover = (rgba[..., 3] > 0).mean() * 100
        if cover > 30:
            problems.append(f'{name}: {cover:.0f}% coverage - key probably failed')

    if DATUM not in keyed:
        print(f'missing the datum pose "{DATUM}.png" - cannot establish scale')
        return

    d = boxes[DATUM]
    datum_h = d[3] - d[1]
    ground_y = d[3]

    print(f'{"pose":14s} {"bbox":28s} {"h":>5s} {"vs idle":>8s}')
    for name in sorted(boxes):
        bb = boxes[name]
        hh = bb[3] - bb[1]
        drift = (hh / datum_h - 1) * 100
        flag = ''
        # Feet-off-the-ground poses are legitimately shorter; only flag a pose
        # that is TALLER, which means the generator zoomed in.
        if drift > 12:
            flag = '  <-- SCALE DRIFT'
            problems.append(f'{name}: {drift:+.0f}% taller than idle - regenerate')
        print(f'{name:14s} {str(bb):28s} {hh:5d} {drift:+7.0f}%{flag}')

    # one shared crop window across every pose
    x0 = min(b[0] for b in boxes.values()) - PAD
    y0 = min(b[1] for b in boxes.values()) - PAD
    x1 = max(b[2] for b in boxes.values()) + PAD
    y1 = max(b[3] for b in boxes.values()) + PAD
    H, W = next(iter(keyed.values())).shape[:2]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W - 1, x1), min(H - 1, y1)

    scale = TARGET_H / datum_h
    fw = int(round((x1 - x0) * scale))
    fh = int(round((y1 - y0) * scale))

    print(f'\nshared crop  x{x0}..{x1}  y{y0}..{y1}   scale {scale:.3f}   frame {fw}x{fh}')
    print(f'ground line  {(ground_y - y0) * scale:.1f}px from the top of the frame')

    if problems:
        print('\nPROBLEMS:')
        for p in problems:
            print('  ! ' + p)
    else:
        print('\nno problems found')

    if check_only:
        return

    os.makedirs(OUT, exist_ok=True)
    for name, rgba in keyed.items():
        crop = rgba[y0:y1, x0:x1]
        img = Image.fromarray(crop, 'RGBA').resize((fw, fh), Image.LANCZOS)
        img.save(os.path.join(OUT, name + '.png'))

    meta = {
        '_comment': 'Written by tools/cutout.py. Every frame shares one crop and '
                    'one scale, so groundY and centreX are constants, not per-frame values.',
        'frameW': fw,
        'frameH': fh,
        'groundY': round((ground_y - y0) * scale, 1),
        'centreX': round(((d[0] + d[2]) / 2 - x0) * scale, 1),
        'standingH': TARGET_H,
        'poses': sorted(keyed),
    }
    with open(os.path.join(OUT, 'anchors.json'), 'w') as fh_:
        json.dump(meta, fh_, indent=1)
    print(f'\nwrote {len(keyed)} sprites + anchors.json to assets/player/')


if __name__ == '__main__':
    main()
