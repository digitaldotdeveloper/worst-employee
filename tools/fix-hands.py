"""Measure the HAND anchor for every player pose.

WHY
---
`HAND` in art.js is where a held thing sits for a given drawn pose. It was
measured off the art for 28 poses and simply MISSING for 13 more — including
walk-1..4, grab-hold and grab-slap, which are the poses you are in most of the
time while actually carrying something. A missing entry falls back to `idle`,
whose hand is down at the hip, so a chair you picked up floated behind your head
while your arms reached forward holding nothing.

The hand is found as the skin blob furthest FORWARD (the character faces right
in every source frame) that is not the head. Head detection is shared with
fix-heads.py, which is the whole reason that one had to be right first.

Angles cannot be measured — a hand position says where the grip is, never which
way the object points — so this prints positions and leaves the angle to the
table in art.js.

    python tools/fix-hands.py           # print measured x/y for every pose
    python tools/fix-hands.py --missing # only the poses art.js has no entry for
"""
import json, os, re, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
_spec = importlib.util.spec_from_file_location(
    'fixheads', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fix-heads.py'))
FH = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(FH)

SET = 'assets/player/base'


def hand_of(path, standing_h, head):
    rgba = np.array(Image.open(path).convert('RGBA'))
    m = FH.skin_mask(rgba)
    if not m.any():
        return None
    hx, hy, hr = head if head else (None, None, None)
    best = None
    for k in (1, 2, 3):
        e = FH.erode(m, k)
        if not e.any():
            continue
        for n, x0, x1, y0, y1 in FH.blobs(e):
            if n < 8:
                continue
            cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
            # not the head, and not the same blob the head sits in
            if hx is not None and (cx - hx) ** 2 + (cy - hy) ** 2 < (hr * 1.2) ** 2:
                continue
            # The existing table was measured at the MOST-EXTENDED skin pixel,
            # not the blob centre, so match that or the new rows sit in a
            # different space from the 28 rows already there.
            fx, fy = float(x1), cy
            if best is None or fx > best[0]:
                best = (fx, fy)
        if best:
            break
    return best


def main(only_missing):
    d = json.load(open(os.path.join(SET, 'anchors.json'), encoding='utf-8'))
    src = open('js/art.js', encoding='utf-8').read()
    blk = src[src.index('const HAND = {'):src.index('export function drawWeapon')]
    have = set(re.findall(r"'([^']+)':\s*\[", blk))
    heads = d.get('heads', {})
    gy = d['groundY']
    cx0 = d['centreX']
    # art.js works in units where the body is 62 tall and the sprite 124; the
    # table is in sprite pixels relative to (centreX, that pose's ground line).
    for pose in sorted(d['poses']):
        if only_missing and pose in have:
            continue
        p = os.path.join(SET, pose + '.png')
        if not os.path.exists(p):
            continue
        h = hand_of(p, d['standingH'], heads.get(pose))
        if not h:
            print("  // '%s': no hand found" % pose)
            continue
        bottom = d.get('poseBottom', {}).get(pose, gy)
        # art.js's table is in 62-unit body space; the sprites are 124 tall.
        print("  '%s': [%.1f, %.1f]," % (pose, (h[0] - cx0) / 2.0, (h[1] - bottom) / 2.0))


if __name__ == '__main__':
    main('--missing' in sys.argv)
