# Cut the rig pose into body parts for the paper-doll skeleton.
#
#   python tools/rig-slice.py                 slice tools/rig/rig-a.png
#   python tools/rig-slice.py --debug         also write a colour-coded overlay
#   python tools/rig-slice.py <name>.png      slice a garment variant
#
# HOW THE CUTS ARE FOUND (no hand-tuned magic numbers):
# The mask itself tells us the anatomy, via two different signals.
#
# ARMS - by row WIDTH, not by counting runs. Arms attach to the torso at the
# shoulder, so a scan line through them is one continuous span, never three
# separate ones. What marks the arm band is that those rows are far wider than
# the torso: measure the torso width at mid-height and take every row more than
# 1.5x that as arm.
#
# LEGS - by run COUNT, which does work below the crotch: the mask splits into
# two runs and stays split. That row is the hip line.
#
# Everything else follows from the shoulder line, the hip line, and the torso's
# own x-range measured on a clean row between them.

import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RIG = os.path.join(HERE, 'rig')
OUT = os.path.join(os.path.dirname(HERE), 'assets', 'rig')

ELBOW = 0.52     # fraction along the arm, shoulder -> fist
KNEE = 0.48      # fraction down the leg, hip -> foot
BLEED = 3        # px of overlap kept at each cut so joints do not show a gap
ARM_LIFT = 0     # Keep the shoulder cap OUT of the arm part. Any material above
                 # the arm band is torso, and when the arm swings down to hang at
                 # the side that strip rotates out as a horizontal slab across the
                 # shoulders. The torso is drawn over the shoulder joint anyway.


def key(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 90) & (g - np.maximum(r, b) > 40)
    alpha = np.where(green, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    rr, gg, bb = (rgba[..., i].astype(np.int16) for i in range(3))
    cap = np.maximum(rr, bb)
    spill = (gg > cap) & (alpha > 0)
    gg[spill] = cap[spill]
    rgba[..., 1] = gg.astype(np.uint8)
    return rgba


def runs(row, min_len=4):
    """Contiguous opaque spans in one row, as (start, end) pairs."""
    idx = np.where(row > 0)[0]
    if len(idx) == 0:
        return []
    out, s, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > 2:
            if prev - s >= min_len:
                out.append((int(s), int(prev)))
            s = i
        prev = i
    if prev - s >= min_len:
        out.append((int(s), int(prev)))
    return out


def analyse(alpha, bb):
    x0, y0, x1, y1 = bb
    H = y1 - y0
    prof = {y: runs(alpha[y, x0:x1 + 1]) for y in range(y0, y1 + 1)}

    def width(y):
        r = prof.get(y, [])
        return 0 if not r else r[-1][1] - r[0][0]

    # torso width, sampled where only the torso can be: below the arms, above
    # the legs. 0.45-0.55 of the figure height is reliably that band.
    ref = int(np.median([width(y) for y in range(y0 + int(H * 0.45), y0 + int(H * 0.56))]))
    if ref <= 0:
        raise SystemExit('could not measure a torso width')

    arm_rows = [y for y in range(y0, y0 + int(H * 0.55)) if width(y) > ref * 1.5]
    if not arm_rows:
        raise SystemExit('no rows are much wider than the torso - arms are not extended')
    arm_top, arm_bot = min(arm_rows), max(arm_rows)

    # hips: first row below the arms that splits in two and stays split
    hip = None
    for y in range(arm_bot + 1, y1):
        if len(prof.get(y, [])) == 2 and all(len(prof.get(k, [])) == 2
                                             for k in range(y, min(y + 25, y1))):
            hip = y
            break
    if hip is None:
        raise SystemExit('legs never separate - cannot find the hip line')

    # torso x-range on a clean row between the arms and the hips
    clean = (arm_bot + hip) // 2
    tr = prof[clean][0]
    torso = (tr[0], tr[1])
    widest = max(arm_rows, key=width)
    span = prof[widest][0]
    return dict(prof=prof, arm_top=arm_top, arm_bot=arm_bot, hip=hip,
                torso=torso, back=(span[0], torso[0]), front=(torso[1], span[1]),
                mid=(arm_top + arm_bot) // 2, ref=ref)


def cut(rgba, x0, y0, x1, y1):
    """Copy a rectangular region into its own transparent image."""
    h, w = rgba.shape[:2]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    out = np.zeros_like(rgba)
    out[y0:y1, x0:x1] = rgba[y0:y1, x0:x1]
    return out


def trim(part):
    ys, xs = np.where(part[..., 3] > 0)
    if len(xs) == 0:
        return None, None
    return part[ys.min():ys.max() + 1, xs.min():xs.max() + 1], (int(xs.min()), int(ys.min()))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    debug = '--debug' in sys.argv
    src = args[0] if args else 'rig-a.png'
    name = os.path.splitext(os.path.basename(src))[0]
    path = src if os.path.isabs(src) else os.path.join(RIG, src)

    rgba = key(path)
    alpha = rgba[..., 3]
    ys, xs = np.where(alpha > 0)
    bb = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    a = analyse(alpha, bb)

    x0, y0, x1, y1 = bb
    off = x0                       # runs are measured inside the bbox
    back = (a['back'][0] + off, a['back'][1] + off)
    torso = (a['torso'][0] + off, a['torso'][1] + off)
    front = (a['front'][0] + off, a['front'][1] + off)

    print(f'figure      x{x0}..{x1}  y{y0}..{y1}')
    print(f'arm band    y{a["arm_top"]}..{a["arm_bot"]}   (scan row {a["mid"]})')
    print(f'  back arm  x{back[0]}..{back[1]}')
    print(f'  torso     x{torso[0]}..{torso[1]}')
    print(f'  front arm x{front[0]}..{front[1]}')
    print(f'hip line    y{a["hip"]}')

    shoulder_y = (a['arm_top'] + a['arm_bot']) // 2
    parts = {}

    # ---- head: cut at the NECK, not across the shoulders ----
    # Cutting at the shoulder line puts the shoulder tops in the head part with a
    # flat bottom edge, and since the head draws last that edge shows as a hard
    # line straight across the shoulders. The neck is the narrowest row between
    # the chin and the shoulders, so the mask can find it.
    def row_run(y):
        r = a['prof'].get(y, [])
        return None if not r else (r[0][0] + off, r[-1][1] + off)

    head_lo = y0 + int((a['arm_top'] - y0) * 0.55)
    neck_y, neck_w = a['arm_top'], 10 ** 9
    for y in range(head_lo, a['arm_top']):
        rr_ = row_run(y)
        if rr_ and (rr_[1] - rr_[0]) < neck_w:
            neck_w, neck_y = rr_[1] - rr_[0], y
    print(f'neck line   y{neck_y}  (width {neck_w})')

    head_x0 = min(row_run(y)[0] for y in range(y0, neck_y + 1) if row_run(y))
    head_x1 = max(row_run(y)[1] for y in range(y0, neck_y + 1) if row_run(y))
    parts['head'] = (cut(rgba, head_x0 - 2, y0 - 2, head_x1 + 2, neck_y + BLEED),
                     ((torso[0] + torso[1]) // 2, neck_y))             # pivot: neck

    # ---- torso: neck to hips, in two bands ----
    # Shoulders are wider than the waist, so the torso is cut wide above the arm
    # band (where the shoulders live) and narrow below it (where widening would
    # start eating the arms).
    sh_run = row_run(max(y0, a['arm_top'] - 2)) or torso
    upper = cut(rgba, sh_run[0] - BLEED, neck_y - BLEED, sh_run[1] + BLEED, a['arm_top'])
    lower = cut(rgba, torso[0] - BLEED, a['arm_top'] - BLEED,
                torso[1] + BLEED, a['hip'] + BLEED)
    body = np.maximum(upper, lower)
    parts['torso'] = (body, ((torso[0] + torso[1]) // 2, a['hip']))    # pivot: hip

    joints = {'neck': [(torso[0] + torso[1]) // 2, int(neck_y)],
              'hip': [(torso[0] + torso[1]) // 2, int(a['hip'])]}

    # Arms attach to the torso, so a rectangle cut at the torso edge drags in
    # shirt from above and below the armpit. That extra material is invisible at
    # rest but swings out as a horizontal slab across the shoulders the moment
    # the arm rotates down. The arms are horizontal in the rig pose, so masking
    # each one to a band around the shoulder line removes exactly the torso and
    # keeps exactly the arm. Band height comes from the arm's own thickness,
    # measured out near the fist where there is no torso to confuse it.
    def arm_band_height(lo_x, hi_x):
        th = []
        for x in range(min(lo_x, hi_x), max(lo_x, hi_x)):
            col = np.where(alpha[a['arm_top']:a['arm_bot'] + 1, x] > 0)[0]
            if len(col):
                th.append(col.max() - col.min() + 1)
        return int(np.median(th) * 1.45) if th else (a['arm_bot'] - a['arm_top'])

    def mask_band(part, half):
        out = np.zeros_like(part)
        lo = max(0, shoulder_y - half)
        hi = min(part.shape[0], shoulder_y + half)
        out[lo:hi] = part[lo:hi]
        return out

    # ---- arms: horizontal, so the elbow is an x split ----
    for side, run_, out_dir in (('front', front, +1), ('back', back, -1)):
        sx = torso[1] if out_dir > 0 else torso[0]                     # shoulder end
        fx = run_[1] if out_dir > 0 else run_[0]                       # fist end
        ex = int(sx + (fx - sx) * ELBOW)                               # elbow
        lo, hi = (sx, ex) if out_dir > 0 else (ex, sx)
        outer_lo = int(sx + (fx - sx) * 0.55)
        half = max(6, arm_band_height(outer_lo, fx) // 2)
        parts[f'arm-{side}-upper'] = (
            mask_band(cut(rgba, lo - BLEED, a['arm_top'] - ARM_LIFT,
                          hi + BLEED, a['arm_bot'] + BLEED), half),
            (sx, shoulder_y))
        joints[f'shoulder-{side}'] = [int(sx), int(shoulder_y)]
        joints[f'elbow-{side}'] = [int(ex), int(shoulder_y)]
        joints[f'fist-{side}'] = [int(fx), int(shoulder_y)]
        lo, hi = (ex, fx) if out_dir > 0 else (fx, ex)
        parts[f'arm-{side}-fore'] = (
            mask_band(cut(rgba, lo - BLEED, a['arm_top'] - ARM_LIFT,
                          hi + BLEED, a['arm_bot'] + BLEED), half + 4),
            (ex, shoulder_y))

    # ---- legs: diagonal, so the knee is a y split ----
    leg_rows = {y: r for y, r in a['prof'].items() if y > a['hip'] and len(r) == 2}
    foot_y = max(leg_rows)
    knee_y = int(a['hip'] + (foot_y - a['hip']) * KNEE)
    hip_cx = (torso[0] + torso[1]) // 2

    for i, side in enumerate(('back', 'front')):        # runs are left-to-right
        # follow this leg down the rows to get a tight box, and find the knee x
        cols = []
        for y in sorted(leg_rows):
            r = leg_rows[y][i]
            cols.append((y, r[0] + off, r[1] + off))
        upper = [c for c in cols if c[0] <= knee_y + BLEED]
        lower = [c for c in cols if c[0] >= knee_y - BLEED]
        knee_row = min(cols, key=lambda c: abs(c[0] - knee_y))
        knee_x = (knee_row[1] + knee_row[2]) // 2

        ux0 = min(c[1] for c in upper) - BLEED
        ux1 = max(c[2] for c in upper) + BLEED
        parts[f'leg-{side}-thigh'] = (
            cut(rgba, ux0, a['hip'] - BLEED, ux1, knee_y + BLEED), (hip_cx, a['hip']))

        lx0 = min(c[1] for c in lower) - BLEED
        lx1 = max(c[2] for c in lower) + BLEED
        parts[f'leg-{side}-shin'] = (
            cut(rgba, lx0, knee_y - BLEED, lx1, foot_y + 3), (knee_x, knee_y))

        foot_row = max(cols, key=lambda c: c[0])
        joints[f'knee-{side}'] = [int(knee_x), int(knee_y)]
        joints[f'foot-{side}'] = [int((foot_row[1] + foot_row[2]) // 2), int(foot_y)]

    print(f'knee line   y{knee_y}')

    # ---- write ----
    os.makedirs(OUT, exist_ok=True)
    meta = {'_comment': 'Written by tools/rig-slice.py. Pivots are in source-image '
                        'pixels; the game scales them by standingH.',
            'source': name,
            'figure': {'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1},
            'groundY': int(y1), 'centreX': int(hip_cx),
            'standingH': int(y1 - y0),
            'joints': joints,
            'lines': {'shoulderY': int(shoulder_y), 'hipY': int(a['hip']),
                      'kneeY': int(knee_y), 'neckY': int(a['arm_top'])},
            # bone -> the two joints it spans; the renderer derives each bone's
            # rest angle from these, so no angles are hard-coded anywhere
            'bones': {
                'torso': ['hip', 'neck'],
                'head': ['neck', None],
                'arm-front-upper': ['shoulder-front', 'elbow-front'],
                'arm-front-fore': ['elbow-front', 'fist-front'],
                'arm-back-upper': ['shoulder-back', 'elbow-back'],
                'arm-back-fore': ['elbow-back', 'fist-back'],
                'leg-front-thigh': ['hip', 'knee-front'],
                'leg-front-shin': ['knee-front', 'foot-front'],
                'leg-back-thigh': ['hip', 'knee-back'],
                'leg-back-shin': ['knee-back', 'foot-back'],
            },
            'parts': {}}

    sub = os.path.join(OUT, name)
    os.makedirs(sub, exist_ok=True)
    for pname, (img, pivot) in parts.items():
        t, origin = trim(img)
        if t is None:
            print('  ! empty part: ' + pname)
            continue
        Image.fromarray(t, 'RGBA').save(os.path.join(sub, pname + '.png'))
        meta['parts'][pname] = {
            'w': int(t.shape[1]), 'h': int(t.shape[0]),
            # pivot expressed inside the trimmed part
            'px': int(pivot[0] - origin[0]), 'py': int(pivot[1] - origin[1]),
        }
        print(f'  {pname:20s} {t.shape[1]:3d}x{t.shape[0]:3d}  pivot ({meta["parts"][pname]["px"]},{meta["parts"][pname]["py"]})')

    with open(os.path.join(sub, 'rig.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'\nwrote {len(meta["parts"])} parts to assets/rig/{name}/')

    if debug:
        dbg = rgba.copy()
        def line(y, c):
            dbg[max(0, y - 1):y + 2, x0:x1] = c + [255]
        def vline(x, c):
            dbg[y0:y1, max(0, x - 1):x + 2] = c + [255]
        line(a['arm_top'], [255, 0, 0]); line(a['arm_bot'], [255, 0, 0])
        line(a['hip'], [0, 120, 255]); line(knee_y, [255, 255, 0])
        vline(torso[0], [255, 0, 255]); vline(torso[1], [255, 0, 255])
        Image.fromarray(dbg, 'RGBA').save(os.path.join(RIG, name + '-debug.png'))
        print('wrote ' + name + '-debug.png')


if __name__ == '__main__':
    main()
