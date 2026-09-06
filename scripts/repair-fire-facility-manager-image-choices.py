#!/usr/bin/env python3
import json, re, importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ffm',ROOT/'scripts'/'import-fire-facility-manager.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
bydate={m.date_from_name(p)[0]:p for p in sorted(Path('/mnt/data').glob('소방시설관리사20*.pdf'))}
fixed=0
for jp in sorted((ROOT/'data').glob('소방시설관리사 *.json')):
 d=json.loads(jp.read_text(encoding='utf-8')); date=d['examId']; pdf=bydate[date]
 targets=[q['no'] for q in d['questions'] if q.get('passage') and any(str(c).startswith('그림 선택지') for c in q.get('choices',[]))]
 if not targets: continue
 qrec,count=m.extract_ordered(pdf)
 for no in targets:
  q,choices=m.parse_question(no,qrec[no]['body']); clips=m.graphic_clips(pdf,qrec[no]['regions'])
  saved=m.save_graphics(pdf,date,no,clips,choices,qrec[no]['regions']) if clips else None
  if not saved: raise RuntimeError(f'{date} q{no}: no image')
  fixed+=1
 print(date,'repaired',len(targets))
print('total repaired',fixed)
