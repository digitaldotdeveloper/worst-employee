# Pull the pass-14 grab-slap renders out of the Gemini Studio library.
#
# Same two traps collect-pass13.py guards against, and for the same reasons:
#
#  1. jobIds REPEAT across projects in the shared library. Matching on jobId
#     alone once matched 16 of this game's ids to 48 rows and filled the faces
#     folder with pizzas from another project. Every row is confirmed against
#     the first 90 characters of the prompt that was actually sent.
#  2. /api/state trims finished jobs out of its `jobs` array once they land in
#     the library, so the library index is the only complete record.
#
# Lands in tools/renders-pass14/ — the batch folder, per the sprite-artist
# handoff contract. NOTE FOR WHOEVER CUTS THESE: copy them into
# tools/renders-base/ before running `python tools/cutout.py base`. cutout.py
# names its source folder after the OUTFIT and appends to the set that is
# already there, and that shared crop is exactly what keeps the new frames on
# the same ground line as grab-hold and grab-slap.
import json, io, os, shutil, sys

LIB = 'C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/library'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'renders-pass14')

jobs = json.load(io.open(os.path.join(HERE, 'pass14-jobs.json'), encoding='utf-8'))
idx = json.load(io.open(LIB + '/index.json', encoding='utf-8'))

# newest first, so a retry of the same label wins with the latest render
idx = sorted(idx, key=lambda i: i.get('createdAt') or 0, reverse=True)

os.makedirs(OUT, exist_ok=True)
seen, wrong = set(), 0
for it in idx:
    rec = jobs.get(it.get('jobId'))
    if not rec or not it.get('file'):
        continue
    label, probe = rec['label'], rec['probe']
    if probe not in (it.get('prompt') or ''):
        wrong += 1                      # same id, different project — skip it
        continue
    if label in seen:
        continue
    src = os.path.join(LIB, it['file'])
    if not os.path.exists(src):
        continue
    pose = label.split('__', 1)[1]
    shutil.copyfile(src, os.path.join(OUT, pose + '.png'))
    seen.add(label)
    print('  %s' % pose)

labels = {r['label'] for r in jobs.values()}
print('collected %d / %d labels' % (len(seen), len(labels)))
if wrong:
    print('%d rows rejected: jobId matched but the prompt did not' % wrong)
missing = sorted(l for l in labels if l not in seen)
if missing:
    print('missing: %s' % ', '.join(missing))
sys.exit(0)
