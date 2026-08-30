# Slice every garment variant and keep only the parts that option actually changes.
#
#   python tools/slice-variants.py
#
# Each variant is the same rig pose with one thing different, so it slices with
# exactly the same code as the base. The only new decision is WHICH parts to keep:
# a hairstyle only ever changes the head, so shipping its torso and legs as well
# would trailing-zero the whole size argument for doing this.
#
# Options that share a part cannot be combined - that is why the foot is cut off
# the shin (shoes and trousers would otherwise fight over the lower leg) and why
# accessories are still drawn procedurally rather than baked into the head.

import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RIG_SRC = os.path.join(HERE, 'rig')
OUT = os.path.join(os.path.dirname(HERE), 'assets', 'rig')

# option prefix -> the parts it owns
KEEP = {
    'hair': ['head'],
    'shirt': ['torso', 'arm-front-upper', 'arm-back-upper',
              'arm-front-fore', 'arm-back-fore'],
    'trousers': ['leg-front-thigh', 'leg-back-thigh',
                 'leg-front-shin', 'leg-back-shin'],
    'shoes': ['leg-front-foot', 'leg-back-foot'],
}


def main():
    if not os.path.isdir(RIG_SRC):
        print('no tools/rig directory'); return
    variants = sorted(f for f in os.listdir(RIG_SRC)
                      if f.endswith('.png') and not f.startswith('rig-')
                      and '-debug' not in f)
    if not variants:
        print('no variant PNGs in tools/rig/'); return

    index = {}
    for f in variants:
        name = os.path.splitext(f)[0]
        group = name.split('-')[0]
        keep = KEEP.get(group)
        if keep is None:
            print(f'skip {name} (no part mapping for "{group}")')
            continue

        r = subprocess.run([sys.executable, os.path.join(HERE, 'rig-slice.py'), f],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print(f'FAILED {name}: {r.stdout.strip()[-160:]} {r.stderr.strip()[-160:]}')
            continue

        d = os.path.join(OUT, name)
        rig = json.load(open(os.path.join(d, 'rig.json')))
        kept = []
        for pf in list(os.listdir(d)):
            base = os.path.splitext(pf)[0]
            if pf == 'rig.json':
                continue
            if base in keep:
                kept.append(base)
            else:
                os.remove(os.path.join(d, pf))

        # keep the geometry of the parts we kept, and the joints, so the game can
        # place a swapped part exactly where the base one sat
        rig['parts'] = {k: v for k, v in rig['parts'].items() if k in kept}
        json.dump(rig, open(os.path.join(d, 'rig.json'), 'w'), indent=1)

        missing = [k for k in keep if k not in kept]
        index[name] = {'group': group, 'parts': sorted(kept)}
        flag = ('  MISSING ' + ','.join(missing)) if missing else ''
        print(f'{name:20s} {len(kept)} parts{flag}')

    with open(os.path.join(OUT, 'variants.json'), 'w') as f:
        json.dump({'_comment': 'Written by tools/slice-variants.py. Each entry is '
                               'one character-creator option and the rig parts it '
                               'replaces.',
                   'variants': index}, f, indent=1)
    print(f'\nwrote assets/rig/variants.json with {len(index)} options')


if __name__ == '__main__':
    main()
