# Key and pack the world art: props, broken props, and the tiling background strips.
#
#   python tools/cutout-world.py
#
# Props are keyed, trimmed to their own bounds and scaled to the collision size
# the game already uses, so the physics tuning survives the art drop. The sprite
# is drawn slightly larger than its collider on purpose - a chair whose art
# exactly matches its box looks like a box.

import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'world')
OUT_PROPS = os.path.join(os.path.dirname(HERE), 'assets', 'props')
OUT_BG = os.path.join(os.path.dirname(HERE), 'assets', 'bg')

# Collision sizes from js/office.js. The art is fitted to these, never the
# other way round: the feel was tuned against these numbers.
SIZES = {
    'chair': (28, 34), 'monitor': (30, 24), 'printer': (40, 28), 'phone': (16, 12),
    'mug': (14, 14), 'bin': (24, 26), 'plant': (22, 38), 'extinguisher': (16, 34),
    'stack': (20, 16), 'cooler': (26, 52), 'coffee': (26, 52), 'desk': (120, 40),
}
OVERSIZE = 1.18          # art overhangs the collider slightly so it reads as an object
SS = 2                   # supersample for high-DPI phones


def key(path, thresh=40):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 90) & (g - np.maximum(r, b) > thresh)
    alpha = np.where(green, 0, 255).astype(np.uint8)
    rgba = np.dstack([a.astype(np.uint8), alpha])
    rr, gg, bb = (rgba[..., i].astype(np.int16) for i in range(3))
    cap = np.maximum(rr, bb)
    spill = (gg > cap) & (alpha > 0)
    gg[spill] = cap[spill]
    rgba[..., 1] = gg.astype(np.uint8)
    return rgba


def largest_blob(rgba):
    """Keep only the biggest connected lump — kills stray keying speckles."""
    m = rgba[..., 3] > 0
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    cur, sizes = 0, {}
    for y in range(h):
        row = m[y]
        if not row.any():
            continue
        for x in np.where(row)[0]:
            if lab[y, x]:
                continue
            cur += 1
            stack, n = [(y, x)], 0
            lab[y, x] = cur
            while stack:
                cy, cx = stack.pop()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        stack.append((ny, nx))
            sizes[cur] = n
    if not sizes:
        return rgba
    best = max(sizes, key=sizes.get)
    out = rgba.copy()
    out[..., 3] = np.where(lab == best, rgba[..., 3], 0)
    return out


def trim(rgba):
    ys, xs = np.where(rgba[..., 3] > 0)
    if len(xs) == 0:
        return None
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def do_props():
    if not os.path.isdir(SRC):
        print('no tools/world directory'); return {}
    os.makedirs(OUT_PROPS, exist_ok=True)
    meta = {}
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.png'):
            continue
        name = os.path.splitext(f)[0]
        base = name.replace('-broken', '')
        if base not in SIZES:
            continue
        rgba = largest_blob(key(os.path.join(SRC, f)))
        t = trim(rgba)
        if t is None:
            print(f'  ! {name}: empty after keying'); continue

        cw, ch = SIZES[base]
        tw, th = cw * OVERSIZE * SS, ch * OVERSIZE * SS
        # fit inside the target box, preserving the drawn aspect ratio
        s = min(tw / t.shape[1], th / t.shape[0])
        w, h = max(1, int(t.shape[1] * s)), max(1, int(t.shape[0] * s))
        Image.fromarray(t, 'RGBA').resize((w, h), Image.LANCZOS) \
            .save(os.path.join(OUT_PROPS, name + '.png'))
        meta[name] = {'w': w, 'h': h, 'ss': SS}
        print(f'  {name:18s} {t.shape[1]:4d}x{t.shape[0]:<4d} -> {w}x{h}')
    with open(os.path.join(OUT_PROPS, 'props.json'), 'w') as fh:
        json.dump({'_comment': 'Written by tools/cutout-world.py. Sizes are '
                               'supersampled by `ss`; divide to get logical px.',
                   'props': meta}, fh, indent=1)
    print(f'wrote {len(meta)} props')
    return meta


def do_bg():
    os.makedirs(OUT_BG, exist_ok=True)
    got = []
    for name in ('bg-wall', 'bg-ceiling', 'bg-floor'):
        p = os.path.join(SRC, name + '.png')
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        # Feather the seam: the model gets close to tileable but never exact, so
        # cross-fade the last 6% into the first 6%. A visible vertical seam every
        # screen-width is far more obvious than a slightly soft join.
        w, h = im.size
        b = max(8, int(w * 0.06))
        a = np.asarray(im).astype(np.float32)
        left, right = a[:, :b].copy(), a[:, -b:].copy()
        ramp = np.linspace(0, 1, b, dtype=np.float32)[None, :, None]
        a[:, -b:] = right * (1 - ramp) + left * ramp
        out = Image.fromarray(a.astype(np.uint8), 'RGB')
        out.save(os.path.join(OUT_BG, name + '.jpg'), quality=86, optimize=True)
        got.append(name)
        print(f'  {name}  {w}x{h} -> seam feathered {b}px')
    return got


if __name__ == '__main__':
    print('PROPS'); do_props()
    print('BACKGROUND'); do_bg()
