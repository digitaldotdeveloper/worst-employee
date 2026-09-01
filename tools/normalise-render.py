"""Rescale new green-screen renders so the FIGURE matches the set's datum.

WHY THIS EXISTS

The generator does not honour "same size as the reference", and it has cost
renders three separate times now — a boss sit 85% too tall, a sami hurt3 92%,
and a whole cast batch at 65-80%. Saying it again in different words works
sometimes and is a coin flip.

The reason it looks unfixable from the prompt is that it is usually not a ZOOM
at all: the generator quietly changes the CANVAS. The cast was drawn on
1024x559 landscape; asking for a figure with generous margins above and below
returned 977x1024 portrait. The figure occupies a sane fraction of its own
frame either way — 84% and 87% — which is exactly why a fraction-of-image check
passes it and cutout.py's absolute height check then rejects it.

So stop arguing with the generator. Measure the figure in the datum render,
measure it in the new one, scale the new one by the ratio and re-canvas it onto
the datum's dimensions with the feet on the same line. Deterministic, free, and
it cannot drift.

    python tools/normalise-render.py <set> <pose> [<pose> ...]
    python tools/normalise-render.py npc-rita hurt2 hurt3
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

# Fraction of STANDING height each pose shape should occupy. Only poses that are
# not upright need a row; everything else is 1.0.
POSE_HEIGHT = {
    'dodge': 0.72,     # a low forward lunge, nowhere near standing height
    'sit':   0.80,
    'getup': 0.72,
    'land':  0.86,
    'hurt2': 0.86,     # doubled over
    'down':  0.34,     # flat on the floor
    # Held off the ground: the FIGURE is roughly standing height, but its feet
    # are in the air, so the packer must not stretch it to the ground line.
    'held2': 0.97, 'held3': 0.97, 'choked': 0.97,
    'grab-jump': 0.94,
    # THE RUN CYCLE MUST NOT PULSE. A running figure is genuinely a little
    # shorter than a standing one — leaning costs height — but the six frames
    # came back spread from -1% to -17%, so he visibly swelled and shrank once
    # per stride. Reported as "he is bigger when idle than when moving". A real
    # run bobs by a few percent, not seventeen, and the head detector cannot
    # settle it on its own here: he is in short sleeves, so a bare forearm by
    # the chin is a bigger skin blob than his face. Stating the height is what
    # makes the cycle uniform.
    'run-1': 0.95, 'run-2': 0.95, 'run-3': 0.95,
    'run-4': 0.95, 'run-5': 0.95, 'run-6': 0.95,
}

# Head detection is shared with fix-heads.py rather than reimplemented, because
# two copies of a heuristic drift and this one has been tuned four times.
_spec = importlib.util.spec_from_file_location('fh', os.path.join(HERE, 'fix-heads.py'))
FH = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(FH)


def head_width(path, standing_h):
    """Diameter of the character's head, or None.

    THE SCALE INVARIANT IS THE HEAD, NOT THE FIGURE.
    Matching figure HEIGHT is only right for upright poses. `dodge` is a
    horizontal lunge — 480 wide by 476 tall — so forcing its height to a
    standing figure's 481 scaled the whole character up, and in game he visibly
    grew every time you dodged. A head is the same size whatever the body is
    doing, which is exactly the property a scale reference needs.
    """
    h = FH.head_of(path, standing_h)
    return None if not h else h[2] * 2.0


def figure_box(im):
    a = np.array(im.convert('RGBA')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fig = ~((g > 90) & (g > r + 40) & (g > b + 40))
    ys, xs = np.where(fig)
    if not len(ys):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def main(setname, poses):
    src = os.path.join(HERE, 'renders-' + setname)
    datum_p = os.path.join(src, 'idle.png')
    datum = Image.open(datum_p).convert('RGBA')
    db = figure_box(datum)
    if not db:
        print('!! no figure in the datum'); return 1
    dh = db[3] - db[1]
    print('datum %s: canvas %dx%d, figure %dpx tall, feet at y=%d'
          % (setname, datum.width, datum.height, dh, db[3]))

    for pose in poses:
        p = os.path.join(src, pose + '.png')
        if not os.path.exists(p):
            print('  !! %s: missing' % pose); continue
        im = Image.open(p).convert('RGBA')
        bx = figure_box(im)
        if not bx:
            print('  !! %s: no figure found' % pose); continue
        fh = bx[3] - bx[1]
        # Scale by HEAD first — see head_width. Figure height is the fallback
        # for a frame whose head cannot be found, and it is only trustworthy
        # for upright poses.
        # HOW TALL SHOULD THIS POSE BE, as a fraction of standing?
        # Matching every pose to the standing figure's height is what made the
        # player visibly GROW when he dodged: a lunge is 480 wide by 476 tall,
        # and forcing 476 to equal a standing 481 scales the whole man up.
        # Head detection is no help here — it finds a fist on an outstretched
        # arm — so this is anatomy, stated once, per pose shape.
        target = dh * POSE_HEIGHT.get(pose, 1.0)
        k = target / float(fh)
        basis = 'pose height %.0f%% of standing' % (POSE_HEIGHT.get(pose, 1.0) * 100)
        # A pose can be legitimately shorter (doubled over) or taller (arms up),
        # so match on figure height only when the difference is a SCALE problem
        # — a canvas change — rather than a pose difference. Over 25% is scale.
        same_canvas = (im.width == datum.width and im.height == datum.height)
        # Re-canvas whenever the CANVAS differs, even if the figure height
        # happens to match. cutout.py crops every pose to one shared rectangle
        # in source space, so a frame on a different canvas has its feet at a
        # different y and gets sliced — `dodge` came back 1376x768 against the
        # set's 1024x559 with a figure only 1% off the datum, sailed through a
        # scale check, and packed with its legs cut off at the knee.
        # An explicit POSE_HEIGHT is a STATED intent, not an inference, so it is
        # always applied. The 25% tolerance existed for poses with no entry, and
        # it silently passed `getup` frames sitting 15-20% oversize on two of
        # four characters — visibly bigger getting up than standing, which is
        # exactly what the tolerance band was hiding.
        stated = pose in POSE_HEIGHT
        if not stated and same_canvas and 0.8 <= k <= 1.25:
            print('  ok %-7s already matches the datum (x%.2f, %s)' % (pose, k, basis))
            continue
        cropped = im.crop(bx)
        nw = max(1, int(round(cropped.width * k)))
        nh = max(1, int(round(cropped.height * k)))
        scaled = cropped.resize((nw, nh), Image.LANCZOS)
        out = Image.new('RGBA', (datum.width, datum.height), (0, 255, 0, 255))
        # centre horizontally on the datum's figure centre, feet on its ground line
        cx = (db[0] + db[2]) // 2
        out.alpha_composite(scaled, (max(0, cx - nw // 2), max(0, db[3] - nh)))
        out.save(p)
        print('  fixed %-7s x%.2f by %s  %dx%d -> %dx%d'
              % (pose, k, basis, im.width, im.height, out.width, out.height))
    return 0


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2:]))
