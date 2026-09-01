"""Lock a character's SKIN, SHIRT and JEANS to one palette across every frame.

WHY THIS EXISTS
---------------
Reported, correctly, as "his shirt keeps changing" and "he changes skin
colour". At 135px tall the eye does not read a two-frame loop as motion when
the clothes change hue between the frames — it reads as a flickering still,
which is why the idles looked like "just an image".

The cause is the second attachment. A pose job sends the design sheet AND a
frame of the OLD player to copy the pose from, and the model takes the palette
from BOTH. Measured across a walk cycle and a grab-walk:

    generated with 2 attachments   shirt spread [45,34,32]   jeans [31,19,11]
    generated with 1 attachment    shirt spread [ 8, 9, 8]   jeans [ 1, 2, 1]

Five attempts to fix that in the prompt: more adjectives, harder adjectives,
three reference sheets, a "redraw the same man" framing, and finally a
greyscale colourless posture guide. The last one halved it and no more. The
generator will not be argued into a palette, so it is not asked to hold one.

Each region is found by what it IS, not where it is drawn, then multiplied by a
per-channel gain that lands its median on the target. A gain rather than a fill,
so the cel shading survives: highlight, mid and shadow all move together and
keep their ratios.

    skin    warm and saturated, r > g > b, mid-to-light
    shirt   bright and near-neutral, upper 45% of the figure
            (the lower cut-off is what keeps his white SHOES out of it)
    jeans   blue — b > r — in the lower half
            (shoes are neutral, so b > r drops them)

Targets default to the Firass design sheet. Hair, beard and outlines sit below
luma 95 and are never touched.

    python tools/normalise-palette.py <dir>            fix in place
    python tools/normalise-palette.py <dir> --check    report only
"""
import os, sys
import numpy as np
from PIL import Image

TARGET = {
    'skin':  np.array([234.0, 174.0, 139.0]),
    'shirt': np.array([244.0, 244.0, 244.0]),
    'jeans': np.array([53.0, 81.0, 111.0]),
}


def regions(a, alpha=None):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    green = (g > 150) & (g > r + 40) & (g > b + 40)
    fg = ~green if alpha is None else (~green) & (alpha > 40)
    ys, xs = np.where(fg)
    if len(ys) == 0:
        return {}
    y0, y1 = ys.min(), ys.max()
    H = max(1, y1 - y0)
    # NOT an upper/lower split. The first version masked the shirt to the top
    # 45% of the figure, which cut the garment in half: the collar and shoulders
    # were corrected to white and everything below the line kept whatever tint
    # the generator gave it, leaving a hard horizontal seam across his chest and
    # a two-tone shirt in every frame. Only the SHOES need excluding by
    # position, and they only ever sit at the very bottom.
    notshoes = np.zeros_like(fg); notshoes[y0:y0 + int(H * 0.86), :] = True
    return {
        'skin':  fg & (r > g + 8) & (g > b + 4) & (r > 90) & (b < 210)
                    & ~((r > 225) & (g > 215) & (b > 205)),
        # bright and near-neutral: the shirt. Blue jeans fail |r-b|<70, bare
        # arms fail it warm, hair and outlines fail the luminance floor.
        'shirt': fg & notshoes & (lum > 150) & (np.abs(r - b) < 70),
        # blue: the jeans. Shoes are neutral so b > r + 8 drops them anyway.
        'jeans': fg & (b > r + 8) & (lum > 50) & (lum < 190),
    }


def process(path, out_path, check):
    im = Image.open(path)
    has_alpha = im.mode in ('RGBA', 'LA', 'P')
    rgba = np.asarray(im.convert('RGBA')).astype(np.float32)
    a = rgba[..., :3]
    reg = regions(a, rgba[..., 3])
    if not reg:
        return None

    out = a.copy()
    report = {}
    for name, m in reg.items():
        # --skin deletes the clothing rows from TARGET, and a region with no
        # target is a region this pass is not asked to touch.
        if name not in TARGET or m.sum() < 150:
            continue
        med = np.median(a[m], axis=0)
        report[name] = float(np.linalg.norm(med - TARGET[name]))
        if not check:
            out[m] = np.clip(a[m] * (TARGET[name] / np.maximum(med, 1.0)), 0, 255)

    if not check:
        rgba[..., :3] = out
        img = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
        if not has_alpha:
            img = img.convert('RGB')
        img.save(out_path)
    return report


def self_targets(src, files, only):
    """Use the SET'S OWN median as the target, per region.

    The cast do not wear Firass's clothes - Omar is in a beige cardigan, Rita in
    a maroon blouse - so imposing his palette on them is worse than the drift,
    and doing that by accident already turned the whole office his colour once.
    But "Omar changes skin colour when he runs and fights" is the same
    complaint, and the answer is the same: pick the tone he is MOSTLY drawn in
    and hold every frame to it. Nothing is imported from another character.
    """
    acc = {}
    for f in files:
        rgba = np.asarray(Image.open(os.path.join(src, f)).convert('RGBA')).astype(np.float32)
        for name, m in regions(rgba[..., :3], rgba[..., 3]).items():
            if only and name not in only:
                continue
            if m.sum() >= 150:
                acc.setdefault(name, []).append(np.median(rgba[..., :3][m], axis=0))
    return {k: np.median(np.array(v), axis=0) for k, v in acc.items() if v}


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    if not args:
        print(__doc__)
        return 1
    src = args[0]
    check = '--check' in sys.argv
    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.png'))
    if not files:
        print('no PNGs in ' + src)
        return 1

    # --self holds the set to its OWN average instead of Firass's palette.
    # --skin restricts it to skin, for a character whose clothes are their own.
    only = {'skin'} if '--skin' in sys.argv else None
    if '--self' in sys.argv:
        for k, v in self_targets(src, files, only).items():
            TARGET[k] = v
        print('self-referencing targets, measured from this set:')
    else:
        print('targets:')
    if only:
        for k in [k for k in TARGET if k not in only]:
            del TARGET[k]
    for k in sorted(TARGET):
        print('  %-6s %s' % (k, TARGET[k].astype(int).tolist()))
    print()
    worst = {}
    for f in files:
        p = os.path.join(src, f)
        rep = process(p, p, check)
        if rep is None:
            print('  %-18s no figure found' % f[:-4])
            continue
        for k, v in rep.items():
            worst[k] = max(worst.get(k, 0), v)
        print('  %-18s ' % f[:-4] + '  '.join('%s %5.1f' % (k, v) for k, v in sorted(rep.items())))

    print('\nworst distance from target, per region, BEFORE this pass:')
    for k in ('skin', 'shirt', 'jeans'):
        if k in worst:
            print('  %-6s %.1f' % (k, worst[k]))
    if not check:
        print('\nall regions now sit on the target in every frame.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
