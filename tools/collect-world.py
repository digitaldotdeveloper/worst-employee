# Pull finished pass-5 renders out of the Gemini Studio library into tools/world/.
import json, io, os, shutil, glob
LIB='C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/library'
HERE=os.path.dirname(os.path.abspath(__file__))
DEST=os.path.join(HERE,'world'); os.makedirs(DEST,exist_ok=True)
jobs={}
for f in glob.glob(os.path.join(HERE,'pass5-*-jobs.json')):
    jobs.update(json.load(io.open(f,encoding='utf-8')))
idx=json.load(io.open(LIB+'/index.json',encoding='utf-8'))
got=0
for it in idx:
    j=it.get('jobId')
    if j in jobs and it.get('file'):
        s=os.path.join(LIB,it['file'])
        if os.path.exists(s):
            shutil.copyfile(s,os.path.join(DEST,jobs[j]+'.png')); got+=1
print(f'collected {got}/{len(jobs)}')
have={os.path.splitext(f)[0] for f in os.listdir(DEST)}
miss=sorted(set(jobs.values())-have)
if miss: print('missing:', ', '.join(miss))
