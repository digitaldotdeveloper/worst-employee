"""Put one skin tone on every frame of a character.

WHY THIS EXISTS
---------------
The generator tans him. Not occasionally — reproducibly, in 46 of 49 frames,
and it cannot be argued out of it:

    one design sheet, described in words   ->  [163,110,84] .. [234,174,139]
    the same, with the words hardened      ->  [217,189,172]  (washed out grey)
    THREE design sheets on every job       ->  [180,121,88]   (still tanned)

Three strategies, measured, all wrong. The reference images agree with each
other to within 3 points of RGB, so the instruction could not be clearer; the
model simply has a bias. Adjectives are a dial with no numbers on it, and each
attempt costs quota, so the fix belongs in the pipeline instead: measure the
skin that came back, and put it where it should be.

That is safe to do arithmetically because skin is genuinely separable here:

    beard, hair, outlines   luma < 80     [58,43,36]   identical in every frame
    SKIN                    luma 95-235, saturated warm, r > g > b
    white shirt and shoes   warm but flat: r - b is about 30, never > 45
    blue jeans              b > r, excluded by the warm test

So the mask is "warm AND saturated AND not dark", and the correction is a
per-channel gain that lands the frame's own skin median on the target. A gain
rather than a replacement, so the cel shading survives: highlights, mid tones
and shadow all move together and keep their ratios.

    python tools/normalise-skin.py <dir>                 fix in place
    python tools/normalise-skin.py <dir> --check         report only
    python tools/normalise-skin.py <dir> --out <dir2>    write elsewhere

The target defaults to the mean of the three Firass design sheets,
[236,175,140]; override with --target R,G,B.
"""
import os, sys
import numpy as np
from PIL import Image

TARGET = np.array([235.7, 174.7, 140.3])


def skin_mask(a):
    """Warm, saturated, mid-to-light pixels: his skin and nothing else."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    green_bg = (g > 150) & (g > r + 40) & (g > b + 40)
    return (~green_bg) & (r > g) & (g >= b) & (r - b > 45) & (lum > 95) & (lum < 238)


def measure(a, m):
    return np.median(a[m], axis=0) if m.sum() >= 300 else None


def normalise(path, out_path, target, check=False):
    im = Image.open(path)
    has_alpha = im.mode in ('RGBA', 'LA')
    rgba = np.asarray(im.convert('RGBA')).astype(np.float32)
    a = rgba[..., :3]

    m = skin_mask(a)
    med = measure(a, m)
    if med is None:
        return None, None, 0

    gain = target / np.maximum(med, 1.0)
    before = float(np.linalg.norm(med - target))
    if check:
        return before, None, int(m.sum())

    out = a.copy()
    out[m] = np.clip(a[m] * gain, 0, 255)
    after_med = np.median(out[m], axis=0)
    after = float(np.linalg.norm(after_med - target))

    rgba[..., :3] = out
    img = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    if not has_alpha:
        img = img.convert('RGB')
    img.save(out_path)
    return before, after, int(m.sum())


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    if not args:
        print(__doc__)
        return 1
    src = args[0]
    check = '--check' in sys.argv
    dst = src
    if '--out' in sys.argv:
        dst = sys.argv[sys.argv.index('--out') + 1]
        os.makedirs(dst, exist_ok=True)
    target = TARGET
    if '--target' in sys.argv:
        target = np.array([float(x) for x in sys.argv[sys.argv.index('--target') + 1].split(',')])

    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.png'))
    if not files:
        print('no PNGs in ' + src)
        return 1

    print('target skin %s   %d frames in %s\n' % (target.astype(int).tolist(), len(files), src))
    worst, fixed, skipped = 0.0, [], []
    for f in files:
        before, after, npx = normalise(os.path.join(src, f),
                                       os.path.join(dst, f), target, check)
        if before is None:
            skipped.append(f[:-4])
            continue
        worst = max(worst, before if check else after)
        if check:
            print('  %-16s d=%6.1f  (%d px)' % (f[:-4], before, npx))
        else:
            fixed.append((f[:-4], before, after))
            print('  %-16s %6.1f -> %5.1f' % (f[:-4], before, after))

    if skipped:
        print('\nno skin found (left alone): ' + ' '.join(skipped))
    print('\nworst distance from target after this pass: %.1f' % worst)
    return 0


if __name__ == '__main__':
    sys.exit(main())
