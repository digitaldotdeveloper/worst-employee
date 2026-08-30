# Copy finished pass-3 renders out of the Gemini Studio library into tools/renders/.
import json, io, os, shutil, sys
LIB = 'C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/library'
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, 'renders')
jobs = json.load(io.open(os.path.join(HERE, 'pass3-jobs.json'), encoding='utf-8'))
os.makedirs(DEST, exist_ok=True)
idx = json.load(io.open(LIB + '/index.json', encoding='utf-8'))
got = 0
for it in idx:
    j = it.get('jobId')
    if j in jobs and it.get('file'):
        src = os.path.join(LIB, it['file'])
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(DEST, jobs[j] + '.png')); got += 1
print(f'collected {got}/{len(jobs)}')
missing = sorted(set(jobs.values()) - {os.path.splitext(f)[0] for f in os.listdir(DEST)})
if missing: print('missing:', ', '.join(missing))
