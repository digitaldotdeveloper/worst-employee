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
# Poses where the body lies along the ground. These need a LENGTH check, not a
# height check: a prone figure is legitimately short, so the "is it zoomed?"
# height test can never catch one drawn too big — and the generator does draw
# them too big (measured 1.16x to 1.43x). A person lying down is about as long
# as they are tall, a little less when curled.
PRONE_POSES = {'down'}
PRONE_LEN = 0.95
# Poses the figure is LEGITIMATELY shorter in — crouched, kneeling, seated. Their
# height carries real information, so they must never be stretched up to the
# standing height; a `sit` scaled to match `idle` is a person standing on a
# chair. These are checked but never auto-corrected.
CROUCHED_POSES = {'sit', 'getup', 'land', 'c4-wind', 'dodge', 'held'}
# Above this, the generator did not zoom — it framed a different shot, and the
# line weight and detail will not match however it is scaled.
MAX_AUTOFIX = 0.55
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


def strip_ground_line(rgba):
    """Remove a drawn floor line under a prone figure.

    Asking for a body lying on the ground tends to get a helpful little
    horizontal rule drawn under it. It keys as opaque, so it both drags the
    bbox down (breaking the ground anchor) and renders in game as a stray
    streak under the character. It is trivially distinguishable from a body:
    it is only a few pixels TALL. So walk up from the bottom and clear any row
    whose opaque columns have almost no vertical thickness.
    """
    a = rgba[..., 3]
    solid = a > 16
    if not solid.any():
        return rgba
    ys = np.where(solid.any(axis=1))[0]
    bottom = int(ys.max())
    # vertical run length ending at each pixel, computed once
    run = np.zeros_like(solid, dtype=np.int32)
    run[0] = solid[0]
    for y in range(1, solid.shape[0]):
        run[y] = np.where(solid[y], run[y - 1] + 1, 0)

    cleared = 0
    for y in range(bottom, max(-1, bottom - 12), -1):
        cols = np.where(solid[y])[0]
        if len(cols) < 12:
            continue
        if np.median(run[y, cols]) <= 4:        # a few px tall => a drawn line
            rgba[y, cols, 3] = 0
            solid[y, cols] = False
            cleared += 1
        else:
            break                                # reached real body, stop
    return rgba


def rescale_about(rgba, factor, ax, ay):
    """Scale the whole frame's content by `factor`, keeping (ax, ay) fixed."""
    h, w = rgba.shape[:2]
    im = Image.fromarray(rgba, 'RGBA')
    nw, nh = max(1, int(round(w * factor))), max(1, int(round(h * factor)))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im.resize((nw, nh), Image.LANCZOS),
              (int(round(ax - ax * factor)), int(round(ay - ay * factor))))
    return np.asarray(out).copy()


def find_head(rgba, box):
    """Locate the head as (x, y, radius) in this frame's pixel space.

    THIS LIVES IN CUTOUT ON PURPOSE. It used to be a separate step run after
    packing, and repacking silently threw the head data away — which does not
    crash anything, it just makes every facial expression in the game stop
    drawing, because `FACES.drawOnHead` bails out when `meta.heads` is missing.
    A derived value belongs in the tool that derives everything else.

    Found by SKIN, not by geometry. "Topmost blob" breaks the moment somebody
    raises an arm over their head, throws a punch, or lies down — and three of
    those are poses this game uses constantly. The head is simply the largest
    connected region of skin in the drawing: bigger than a hand every time,
    and it stays the largest whichever way up the character is.
    """
    a = rgba[..., 3] > 16
    r = rgba[..., 0].astype(np.int16)
    g = rgba[..., 1].astype(np.int16)
    b = rgba[..., 2].astype(np.int16)
    # Warm, mid-to-light, red-dominant, not grey. Covers the range of skin
    # tones in the cast without picking up wood, cardboard or a tan blazer,
    # which sit either too dark or too desaturated.
    skin = (a & (r > 70) & (r > g + 12) & (g >= b - 6) & (r - b > 22)
            & (r - b < 165) & (r.astype(np.int32) + g + b > 190))
    if not skin.any():
        return None

    # Connected components, iterative flood fill on a boolean grid. No scipy on
    # this machine, and a recursive fill blows the stack on a 700px render.
    H, W = skin.shape
    seen = np.zeros_like(skin)
    best, best_n = None, 0
    ys, xs = np.where(skin)
    for i in range(len(ys)):
        sy, sx = int(ys[i]), int(xs[i])
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        px = []
        while stack:
            y, x = stack.pop()
            px.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and skin[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(px) > best_n:
            best_n, best = len(px), px

    if not best or best_n < 40:
        return None
    pys = np.fromiter((p[0] for p in best), dtype=np.int32, count=best_n)
    pxs = np.fromiter((p[1] for p in best), dtype=np.int32, count=best_n)
    # Centre of the blob, and a radius from its width. Width beats height: a
    # neck and a bare throat extend the blob downward and would inflate a
    # height-derived radius, while the width is just the face.
    cx = (int(pxs.min()) + int(pxs.max())) / 2.0
    cy = (int(pys.min()) + int(pys.max())) / 2.0
    rad = max(int(pxs.max()) - int(pxs.min()), int(pys.max()) - int(pys.min())) / 2.0
    return cx, cy, rad


def foot_x(rgba, box):
    """Horizontal centre of the feet — the bottom 8% of the figure's rows.

    A better datum than the bbox centre for lining two frames up. The bbox
    centre moves with whatever the arms are doing, so aligning on it drags a
    punching frame sideways; the feet stay under the body in every standing
    pose.
    """
    x0, y0, x1, y1 = box
    band = max(1, int((y1 - y0) * 0.08))
    sub = rgba[max(0, y1 - band):y1 + 1, :, 3] > 16
    xs = np.where(sub.any(axis=0))[0]
    if len(xs) == 0:
        return (x0 + x1) / 2.0
    return (int(xs.min()) + int(xs.max())) / 2.0


def translate(rgba, dx, dy):
    """Shift the frame's content, cropping whatever falls off the canvas."""
    out = np.zeros_like(rgba)
    h, w = rgba.shape[:2]
    dx, dy = int(round(dx)), int(round(dy))
    sx0, sx1 = max(0, -dx), min(w, w - dx)
    sy0, sy1 = max(0, -dy), min(h, h - dy)
    if sx0 >= sx1 or sy0 >= sy1:
        return out
    out[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = rgba[sy0:sy1, sx0:sx1]
    return out


def bbox(rgba):
    ys, xs = np.where(rgba[..., 3] > 16)
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
        if name in ('down',):
            rgba = strip_ground_line(rgba)
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
    datum_foot_x = foot_x(keyed[DATUM], d)

    # Correct prone frames drawn at the wrong scale, measured by LENGTH against
    # the standing height. Scaled about the body's bottom-centre so it stays on
    # the ground and stays put horizontally.
    for name in list(keyed):
        if name not in PRONE_POSES:
            continue
        bb = boxes[name]
        length = bb[2] - bb[0]
        want = datum_h * PRONE_LEN
        ratio = length / want
        if abs(ratio - 1) < 0.06:
            print(f'{name:14s} prone length {length} vs target {want:.0f} — ok')
            continue
        f = want / length
        print(f'{name:14s} prone length {length} vs target {want:.0f} '
              f'({ratio:+.0%} off) — rescaling by {f:.3f}')
        keyed[name] = rescale_about(keyed[name], f, (bb[0] + bb[2]) / 2, bb[3])
        nb = bbox(keyed[name])
        if nb:
            boxes[name] = nb

    # Correct upright frames the generator zoomed in on. Roughly one frame in ten
    # comes back 30-40% too big, and re-prompting is unreliable — the same pose
    # was asked for twice with an explicit scale clause and came back oversized
    # both times. The DRAWING is right; only the framing is wrong, so scale it
    # about the feet and keep it. Anything cropped by the frame edge is excluded
    # above: rescaling a figure with its feet cut off just moves the damage.
    cropped = {pr.split(':')[0] for pr in problems if 'cut off' in pr}
    for name in list(keyed):
        if name in PRONE_POSES or name in CROUCHED_POSES or name in cropped:
            continue
        bb = boxes[name]
        hh = bb[3] - bb[1]
        ratio = hh / datum_h
        if ratio <= 1.12 or ratio - 1 > MAX_AUTOFIX:
            continue
        f = 1.0 / ratio
        print(f'{name:14s} {ratio - 1:+.0%} oversized — rescaling by {f:.3f} '
              f'and standing it back on the ground line')
        fx = foot_x(keyed[name], bb)
        keyed[name] = rescale_about(keyed[name], f, fx, bb[3])
        # SIZE IS ONLY HALF OF IT. These frames come back on a different canvas
        # entirely, not merely zoomed — one measured its feet 192px below the
        # ground line. Scaling about their own feet leaves them exactly that far
        # down, so the character renders sunk through the floor. Put the feet
        # where the datum's feet are.
        nb = bbox(keyed[name])
        if nb:
            keyed[name] = translate(keyed[name],
                                    datum_foot_x - foot_x(keyed[name], nb),
                                    ground_y - nb[3])
            nb = bbox(keyed[name])
        if nb:
            boxes[name] = nb

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

    heads, no_head = {}, []
    for name in sorted(keyed):
        h = find_head(keyed[name], boxes[name])
        if h is None:
            no_head.append(name)
            continue
        heads[name] = [round((h[0] - x0) * scale, 1),
                       round((h[1] - y0) * scale, 1),
                       round(h[2] * scale, 1)]
    print(f'heads: {len(heads)}/{len(keyed)}'
          + (f'  (no skin found: {", ".join(no_head)})' if no_head else ''))
    # Anything the detector missed borrows idle's head rather than losing its
    # expression entirely — a face in roughly the right place beats no face.
    if 'idle' in heads:
        for n in no_head:
            heads[n] = heads['idle']

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
        # Per-pose lowest opaque row, in frame pixels. The shared groundY is
        # derived from the IDLE pose, which is right for anything standing and
        # wrong for anything lying flat: a knocked-down body is drawn wherever
        # the generator felt like putting it on the canvas, so anchoring it to
        # the standing feet line leaves it hovering. Poses the game marks as
        # prone anchor to this instead.
        'poseBottom': {n: round((boxes[n][3] - y0) * scale, 1) for n in sorted(keyed)},
        'poseTop': {n: round((boxes[n][1] - y0) * scale, 1) for n in sorted(keyed)},
        # Where the face goes, per pose, in the same frame pixels. Missing this
        # does not throw — expressions just quietly stop appearing.
        'heads': heads,
    }
    with open(os.path.join(OUT, 'anchors.json'), 'w') as fh_:
        json.dump(meta, fh_, indent=1)
    print(f'\nwrote {len(keyed)} sprites + anchors.json to assets/player/')


if __name__ == '__main__':
    main()
