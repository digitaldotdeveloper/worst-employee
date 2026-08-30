# Pull pass-6 pose renders into tools/renders-<outfit>/ ready for cutout.py.
import json, io, os, shutil, glob, sys
LIB='C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/library'
HERE=os.path.dirname(os.path.abspath(__file__))
jobs={}
for f in glob.glob(os.path.join(HERE,'pass6-*-jobs.json')) + glob.glob(os.path.join(HERE,'pass7-*-jobs.json')):
    if 'desk' in f: continue
    jobs.update(json.load(io.open(f,encoding='utf-8')))
idx=json.load(io.open(LIB+'/index.json',encoding='utf-8'))
got={}
for it in idx:
    j=it.get('jobId')
    if j in jobs and it.get('file'):
        src=os.path.join(LIB,it['file'])
        if not os.path.exists(src): continue
        outfit,pose = jobs[j].split('__',1)
        d=os.path.join(HERE,'renders-'+outfit); os.makedirs(d,exist_ok=True)
        shutil.copyfile(src,os.path.join(d,pose+'.png'))
        got[outfit]=got.get(outfit,0)+1
for k,v in sorted(got.items()): print(f'{k}: {v}')
missing=[l for j,l in jobs.items() if not any(
    os.path.exists(os.path.join(HERE,'renders-'+l.split('__')[0], l.split('__',1)[1]+'.png')) for _ in [0])]
if missing: print('missing:', ', '.join(sorted(missing)[:12]), '...' if len(missing)>12 else '')
