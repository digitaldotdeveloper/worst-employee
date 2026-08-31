"""Recompute the `heads` block in every anchors.json, in place.

WHY THIS EXISTS
---------------
`find_head` in cutout.py picks "the largest connected region of skin". Its
docstring argues that against "topmost blob", and that argument is right: an arm
raised over the head, a punch, or a prone pose all break topmost.

But largest-blob has its own failure, and it is the one that shipped. Skin
regions are CONNECTED THROUGH THIN BRIDGES — the head joins the neck joins the
chest, a bare forearm brushes the cheek. On any pose where that happens the
"largest region" is head + arm + throat as one blob, so:

  * the centre lands on the shoulder or the chest, not the face, and
  * the radius, taken from that merged bbox, roughly doubles.

Measured on player/base: 8 of 41 poses were wrong, radius median 11.0 with
outliers at 24.0 (c1-hit) and 25.1 (grab-slap). In game that draws the
expression as a big disc over the torso while the character's real, drawn face
is still visible above it — the "two faces" bug. cast/boss-rage was worse (5 of
14, up to 35.0 against a median of 18.7).

THE FIX
-------
1. ERODE the skin mask a few pixels before running connected components. A neck
   or a wrist is a thin bridge and erosion severs it; a face is a wide blob and
   survives. Then "largest" means the head again, and it still holds upside
   down, which is what the original docstring cared about.
2. Radius from WIDTH, not max(width, height). cutout.py's own comment says
   "Width beats height: a neck and a bare throat extend the blob downward and
   would inflate a height-derived radius" — and then the code takes the max.
3. Clamp to the set's median. A head does not change size between poses, so any
   frame still more than 35% off the median is a detection failure by
   definition, and the median is a better answer than the measurement.

Reads and rewrites ONLY the `heads` block, straight from the packed pose PNGs.
It regenerates no art, re-slices nothing and costs no Gemini Studio quota.

    python tools/fix-heads.py            # report only
    python tools/fix-heads.py --write    # apply
    python tools/fix-heads.py --check    # audit what shipped; non-zero on failure
"""
import json, os, sys, glob
import numpy as np
from PIL import Image

ERODE = 3          # px; wider than any neck or wrist, narrower than any face
ERODE_MAX = 14     # give up past here and take the best we have
CLAMP = 0.35       # relative deviation from the set median that counts as junk
# A head is about a seventh of a standing figure, so its RADIUS cannot exceed
# roughly an eighth of standing height. npc-omar wears a light tan shirt that
# passes the skin test, so at a fixed erosion his whole torso survived as one
# blob and every action pose came back with a radius of 27-34 against a cast
# median of 9. An anatomical ceiling catches that without hand-listing the
# character it happened to.
HEAD_MAX = 0.13    # x standingH
# What the detector measures is EXPOSED FACE SKIN, not the drawn head: hair and
# beard are not skin. So the radius came out at 5.5 for bearded npc-sami and
# 16.0 for npc-omar — a 3x difference that is facial hair, not head size, and it
# would draw Sami a tiny expression and Omar a huge one. Every character in this
# cast is packed to the same standing height, and a head is about a seventh of a
# figure, so the SIZE is a constant and only the POSITION needs detecting.
HEAD_R = 0.105     # x standingH — the radius actually written out


def skin_mask(rgba):
    a = rgba[..., 3] > 16
    r = rgba[..., 0].astype(np.int16)
    g = rgba[..., 1].astype(np.int16)
    b = rgba[..., 2].astype(np.int16)
    # Unchanged from cutout.py: the mask was never the problem.
    return (a & (r > 70) & (r > g + 12) & (g >= b - 6) & (r - b > 22)
            & (r - b < 165) & (r.astype(np.int32) + g + b > 190))


def erode(m, k):
    """Binary erosion by a (2k+1) cross. No scipy on this machine."""
    for _ in range(k):
        e = m.copy()
        e[1:, :] &= m[:-1, :]
        e[:-1, :] &= m[1:, :]
        e[:, 1:] &= m[:, :-1]
        e[:, :-1] &= m[:, 1:]
        m = e
    return m


def blobs(m):
    """Every connected component, as (pixels, x0, x1, y0, y1)."""
    H, W = m.shape
    seen = np.zeros_like(m)
    out = []
    ys, xs = np.where(m)
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
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        n = len(px)
        pys = np.fromiter((q[0] for q in px), dtype=np.int32, count=n)
        pxs = np.fromiter((q[1] for q in px), dtype=np.int32, count=n)
        out.append((n, int(pxs.min()), int(pxs.max()), int(pys.min()), int(pys.max())))
    return out


def largest_blob(m):
    H, W = m.shape
    seen = np.zeros_like(m)
    best, best_n = None, 0
    ys, xs = np.where(m)
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
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(px) > best_n:
            best_n, best = len(px), px
    return best, best_n


def measure(m, k):
    """Erode by k, take the largest surviving blob, return (cx, cy, radius)."""
    e = erode(m, k) if k else m
    if not e.any():
        return None
    blob, n = largest_blob(e)
    if not blob or n < 12:
        return None
    pys = np.fromiter((p[0] for p in blob), dtype=np.int32, count=n)
    pxs = np.fromiter((p[1] for p in blob), dtype=np.int32, count=n)
    x0, x1 = int(pxs.min()), int(pxs.max())
    y0, y1 = int(pys.min()), int(pys.max())
    # Add the erosion back: this blob is the face inset by k on every side, so
    # half its width plus k is half the original width.
    return (x0 + x1) / 2.0, (y0 + y1) / 2.0, (x1 - x0) / 2.0 + k


def head_of(path, standing_h):
    """Pick the face blob by SHAPE, not by size alone.

    Largest-blob put npc-omar's expression on his chest for every pose: his tan
    cardigan passes the skin test, so the biggest surviving region is a piece of
    knitwear. A face, though, is compact and roughly round; a fragment of
    clothing is irregular and elongated. Scoring on that separates them, and it
    does not care whether the character is upright, lunging or face-down — which
    is the property cutout.py's docstring rightly insisted on.
    """
    rgba = np.array(Image.open(path).convert('RGBA'))
    m = skin_mask(rgba)
    if not m.any():
        return None
    op = rgba[..., 3] > 16
    lum = (0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2])
    lo, hi = 0.035 * standing_h, HEAD_MAX * standing_h
    best, best_score = None, -1e9
    for k in (2, 3, 4, 6, 8):
        e = erode(m, k)
        if not e.any():
            continue
        for n, x0, x1, y0, y1 in blobs(e):
            if n < 12:
                continue
            w, h = (x1 - x0) + 1, (y1 - y0) + 1
            rad = w / 2.0 + k
            if not (lo <= rad <= hi):
                continue
            # THE DISCRIMINATOR. Shape cannot tell a face from a fist — both are
            # compact, round and skin-coloured, which is why scoring on shape
            # alone put the boss's expression on his own knuckles. A face has
            # EYES: dark pixels sitting inside the skin. A fist has almost none.
            # Grown a little past the eroded blob, because erosion eats exactly
            # the rim where brows and hairline live.
            g = k + 2
            ry0, ry1 = max(0, y0 - g), min(rgba.shape[0], y1 + g + 1)
            rx0, rx1 = max(0, x0 - g), min(rgba.shape[1], x1 + g + 1)
            win_op = op[ry0:ry1, rx0:rx1]
            win_lum = lum[ry0:ry1, rx0:rx1]
            if not win_op.any():
                continue
            skin_lum = float(np.median(win_lum[win_op]))
            dark = float((win_op & (win_lum < skin_lum * 0.62)).sum()) / float(win_op.sum())
            fill = n / float(w * h)
            aspect = min(w, h) / float(max(w, h))
            # dark dominates; shape only breaks ties between two faces-ish blobs
            score = min(dark, 0.35) * 10.0 + fill * 2.0 + aspect
            if score > best_score:
                best_score = score
                best = ((x0 + x1) / 2.0, (y0 + y1) / 2.0, rad)
        if best is not None and best_score > 2.0:
            break
    if best is None:
        # Nothing plausible: fall back to the old behaviour rather than dropping
        # the pose, because a missing head silently kills the expression.
        for k in range(ERODE, ERODE_MAX + 1):
            r = measure(m, k)
            if r is None:
                break
            best = r
            if r[2] <= hi:
                break
    return best


def main(write):
    sets = sorted(glob.glob('assets/player/*/anchors.json') +
                  glob.glob('assets/cast/*/anchors.json'))
    total_fixed = 0
    for ap in sets:
        d = json.load(open(ap, encoding='utf-8'))
        folder = os.path.dirname(ap)
        old = d.get('heads', {})
        found = {}
        for pose in d['poses']:
            p = os.path.join(folder, pose + '.png')
            if not os.path.exists(p):
                continue
            h = head_of(p, d['standingH'])
            if h:
                found[pose] = [round(h[0], 1), round(h[1], 1), round(h[2], 1)]
        if not found:
            print('  !! %s: no heads found' % ap)
            continue
        med = float(np.median([v[2] for v in found.values()]))
        # Keep the detected centre, replace the detected size. See HEAD_R.
        target = round(HEAD_R * d['standingH'], 1)
        clamped = sum(1 for v in found.values() if abs(v[2] - target) / target > CLAMP)
        for v in found.values():
            v[2] = target
        moved = sum(1 for k, v in found.items()
                    if k in old and (abs(v[0] - old[k][0]) > 3 or abs(v[1] - old[k][1]) > 3
                                     or abs(v[2] - old[k][2]) > 2))
        rs = [v[2] for v in found.values()]
        name = ap.replace('assets/', '').replace('/anchors.json', '')
        print('  %-18s n=%-3d  detected median %.1f -> written %.1f   '
              'old spread %.2fx   moved %d  size-outliers %d'
              % (name, len(found), med, target,
                 (max(v[2] for v in old.values()) / min(v[2] for v in old.values())) if old else 0,
                 moved, clamped))
        total_fixed += moved
        if write:
            d['heads'] = found
            json.dump(d, open(ap, 'w', encoding='utf-8'), indent=1)
    print('\n%s: %d pose anchors changed' % ('WRITTEN' if write else 'DRY RUN', total_fixed))


def check():
    """Audit the heads that actually shipped.

    ONE HARD CHECK AND ONE ADVISORY LIST, on purpose.

    Hard: the core of the head disc must land on the drawn character. That is
    unambiguous and it fails loudly, so it gates.

    Advisory: everything else. The obvious second test — "does this look like a
    face" via dark pixels for eyes — cannot be made to gate. Absolute cutoffs are
    character-dependent (npc-omar is bald and pale and his correct heads score
    lower than npc-sami's beard does when Sami's anchor is WRONG). Judging each
    character against its own median does not rescue it either: what that number
    actually measures is how much dark HAIR falls inside the disc, and that
    legitimately varies between a front-facing idle and a profile run.

    So the feature score is printed as a ranking to eyeball, never as a verdict.
    A checker that cries wolf is a checker nobody runs — the same reason
    verify.js exempts boss-calm from the flat pose list. The real ground truth
    for placement is the contact sheet: render every pose with the expression
    composited and look at it.
    """
    fail = 0
    total = 0
    for ap in sorted(glob.glob('assets/player/*/anchors.json') +
                     glob.glob('assets/cast/*/anchors.json')):
        d = json.load(open(ap, encoding='utf-8'))
        folder = os.path.dirname(ap)
        name = os.path.basename(folder)
        rows = []
        for pose, h in d.get('heads', {}).items():
            fp = os.path.join(folder, pose + '.png')
            if not os.path.exists(fp):
                continue
            a = np.array(Image.open(fp).convert('RGBA'))
            op = a[..., 3] > 16
            lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
            cx, cy, r = h
            H, W = op.shape
            ri = r * 0.6
            yy, xx = np.mgrid[0:H, 0:W]
            disc = ((xx - cx) ** 2 + (yy - cy) ** 2) <= ri * ri
            cover = (disc & op).sum() / max(1, disc.sum())
            win = disc & op
            if not win.any():
                rows.append((pose, cover, 0.0))
                continue
            sl = float(np.median(lum[win]))
            dark = float((win & (lum < sl * 0.62)).sum()) / float(win.sum())
            rows.append((pose, cover, dark))
        if not rows:
            continue
        total += len(rows)
        med_dark = float(np.median([r[2] for r in rows]))
        bad = [(p_, 'core off the character (%.2f)' % c) for p_, c, _ in rows if c < 0.60]
        fail += len(bad)
        weak = sorted((r for r in rows if r[1] >= 0.60), key=lambda r: r[2])[:3]
        mark = 'FAIL ' if bad else 'ok   '
        print('  %s%-12s %2d poses' % (mark, name, len(rows)))
        for b in bad:
            print('         FAIL %-12s %s' % b)
        print('         least confident: ' +
              ', '.join('%s %.3f' % (w[0], w[2]) for w in weak))
    print()
    print('%d/%d head anchors land on the character. '
          'The three least confident per set are listed to eyeball, not to fail.'
          % (total - fail, total))
    return 1 if fail else 0


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(check())
    main('--write' in sys.argv)
