# Pull the pass-13 animation renders out of the Gemini Studio library.
#
# TWO TRAPS THIS GUARDS AGAINST, both of which have cost a full pass before:
#
#  1. jobIds REPEAT across projects in the shared library. Matching on jobId
#     alone once matched 16 of this game's ids to 48 rows and filled the faces
#     folder with pizzas from another project. So every row is confirmed
#     against the first 90 characters of the prompt that was actually sent.
#  2. /api/state trims finished jobs out of its `jobs` array once they land in
#     the library, so anything that polls that array to decide "am I done"
#     waits forever. The library index is the only complete record.
import json, io, os, shutil, sys

LIB = 'C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/library'
HERE = os.path.dirname(os.path.abspath(__file__))

jobs = json.load(io.open(os.path.join(HERE, 'pass13-jobs.json'), encoding='utf-8'))
idx = json.load(io.open(LIB + '/index.json', encoding='utf-8'))

# newest first, so a re-run of the same label wins with the latest render
idx = sorted(idx, key=lambda i: i.get('createdAt') or 0, reverse=True)

got, seen, wrong = {}, set(), 0
for it in idx:
    j = it.get('jobId')
    rec = jobs.get(j)
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
    who, pose = label.split('__', 1)
    # cutout.py names its source folder after the OUTFIT ('base', 'hood', ...),
    # not after the label prefix, and it appends to the folder that already
    # holds that set — which is what keeps the new frames in the same shared
    # crop as the old ones instead of in a second, differently-anchored set.
    if who.startswith('player-'):
        who = who[7:]
    d = os.path.join(HERE, 'renders-' + who)
    os.makedirs(d, exist_ok=True)
    shutil.copyfile(src, os.path.join(d, pose + '.png'))
    seen.add(label)
    got[who] = got.get(who, 0) + 1

for k, v in sorted(got.items()):
    print('%-18s %d' % (k, v))
print('---')
print('collected %d / %d' % (len(seen), len(jobs)))
if wrong:
    print('%d rows rejected: jobId matched but the prompt did not' % wrong)

missing = sorted(r['label'] for r in jobs.values() if r['label'] not in seen)
if missing:
    print('missing (%d): %s' % (len(missing), ', '.join(missing[:14])
                                + (' ...' if len(missing) > 14 else '')))
sys.exit(0)
