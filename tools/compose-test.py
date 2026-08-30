# Proof that the paper-doll plan works with style D art.
#
# Takes two generated variants that share the reference pose, cuts each at the
# neck, and composites a character that was NEVER generated: the afro from one
# and the hoodie from the other. If this reads as one coherent person, then
# every hair option x every shirt option is reachable from a handful of
# renders, which is the entire economic argument for layers.
#
#   python tools/compose-test.py

from PIL import Image
import numpy as np
import os

HERE = os.path.join(os.path.dirname(__file__), 'concepts')


def key(path):
    """Chroma-key the flat green background, return RGBA."""
    im = Image.open(os.path.join(HERE, path)).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 90) & (g - np.maximum(r, b) > 40)

    rgba = np.dstack([a, np.where(green, 0, 255)]).astype(np.uint8)

    # Despill: green fringes survive the hard key, so pull g down toward the
    # max of r and b wherever it is running ahead of both.
    rr, gg, bb = rgba[..., 0].astype(np.int16), rgba[..., 1].astype(np.int16), rgba[..., 2].astype(np.int16)
    cap = np.maximum(rr, bb)
    spill = (gg > cap) & (rgba[..., 3] > 0)
    gg[spill] = cap[spill]
    rgba[..., 1] = gg.astype(np.uint8)
    return rgba


def bbox(rgba):
    ys, xs = np.where(rgba[..., 3] > 0)
    return xs.min(), ys.min(), xs.max(), ys.max()


def main():
    hair = key('test-garment-hair.png')      # afro,  t-shirt
    hoodie = key('test-garment-hoodie.png')  # short hair, hoodie

    hb, hob = bbox(hair), bbox(hoodie)
    print('afro variant   bbox', hb)
    print('hoodie variant bbox', hob)

    # Cut at the neck. Both figures stand on the same ground line, so measuring
    # the neck from the FEET up keeps the seam in the same anatomical place even
    # though the afro makes that figure taller.
    feet = hob[3]
    body_h = hob[3] - hob[1]
    neck_y = int(feet - body_h * 0.80)
    print('seam at y =', neck_y)

    out = hoodie.copy()                       # body + hoodie from here down
    out[:neck_y, :, :] = 0                    # drop its head
    head = hair.copy()
    head[neck_y:, :, :] = 0                   # keep only the afro head

    # alpha-over: head on top of body
    a_head = head[..., 3:4].astype(np.float32) / 255.0
    out = (head[..., :3] * a_head + out[..., :3] * (1 - a_head)).astype(np.uint8)
    alpha = np.maximum(head[..., 3], hoodie[..., 3])
    alpha[:neck_y] = head[:neck_y, :, 3]
    composed = np.dstack([out, alpha])

    # crop to the figure
    ys, xs = np.where(composed[..., 3] > 0)
    crop = composed[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

    Image.fromarray(crop, 'RGBA').save(os.path.join(HERE, 'composite-proof.png'))
    print('wrote composite-proof.png', crop.shape)

    # also save the two clean cut-outs, which is what the game would ship
    for name, src in (('cutout-hair', hair), ('cutout-hoodie', hoodie)):
        ys, xs = np.where(src[..., 3] > 0)
        Image.fromarray(src[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA') \
            .save(os.path.join(HERE, name + '.png'))
        print('wrote', name + '.png')


if __name__ == '__main__':
    main()
