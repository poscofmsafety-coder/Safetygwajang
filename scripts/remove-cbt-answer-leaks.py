#!/usr/bin/env python3
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
TRIGGER=re.compile(r'(?:관련\s*규정\s*개정|문제\s*오류|가답안|확정답안|실제\s*시험|기존\s*정답|정답\s*처리|누르면\s*정답|여기서는.{0,50}정답)',re.I)
# Parenthetical source-platform notices; deliberately require a trigger to avoid deleting genuine conditions.
PAREN=re.compile(r'\((?=[^)]*(?:관련\s*규정\s*개정|문제\s*오류|가답안|확정답안|실제\s*시험|기존\s*정답|정답\s*처리|누르면\s*정답|여기서는))[^)]*\)',re.I)

def strip_note(s):
    if not isinstance(s,str) or not TRIGGER.search(s): return s,False
    before=s
    s=PAREN.sub('',s)
    # Remove standalone grading notes / callouts that are not wrapped in parentheses.
    s=re.sub(r'(?:※\s*)?(?:관련\s*규정\s*개정[^\n。]*|문제\s*오류[^\n。]*)(?:\.|。)?','',s,flags=re.I)
    s=re.sub(r'\s+([,.;:?!])',r'\1',s)
    s=re.sub(r'\s+',' ',s).strip()
    return s, s!=before

def clean_passage(obj):
    changed=0
    if isinstance(obj,str):
        s,c=strip_note(obj); return s,int(c)
    if isinstance(obj,list):
        out=[]
        for v in obj:
            nv,c=clean_passage(v); changed+=c
            # drop empty passage/callout containers
            if nv in ('',None,[],{}): continue
            if isinstance(nv,dict) and not any(str(x).strip() for k,x in nv.items() if k not in ('type','alt')):
                continue
            out.append(nv)
        return out,changed
    if isinstance(obj,dict):
        out=dict(obj)
        for k,v in list(out.items()):
            if k in ('alt','type'): continue
            nv,c=clean_passage(v); out[k]=nv; changed+=c
        return out,changed
    return obj,0

def main():
    idx=json.loads((DATA/'index.json').read_text(encoding='utf-8'))
    changed_files=0; changed_questions=0; details=[]
    for ex in idx:
        eid=str(ex.get('id',''))
        if eid=='random': continue
        p=DATA/f'{eid}.json'
        if not p.exists(): continue
        d=json.loads(p.read_text(encoding='utf-8'))
        qs=d.get('questions') if isinstance(d,dict) else None
        if not isinstance(qs,list): continue
        file_changed=0
        for q in qs:
            ctot=0
            nq,c=strip_note(q.get('question','')); ctot+=int(c); q['question']=nq
            if isinstance(q.get('choices'),list):
                nc=[]
                for choice in q['choices']:
                    n,c=strip_note(str(choice)); ctot+=int(c); nc.append(n)
                q['choices']=nc
            if 'passage' in q:
                np,c=clean_passage(q['passage']); ctot+=c; q['passage']=np
                if not np: q.pop('passage',None)
            if ctot:
                # Keep provenance without exposing the answer before submission.
                msg='출제 당시 법규 개정 또는 복수정답 처리 이력이 있는 문항입니다. 문제 화면에서는 정답을 미리 노출하는 원문 플랫폼 안내를 제거했습니다.'
                expt=q.get('explanation','') or ''
                if msg not in expt:
                    q['explanation']=(expt.rstrip()+' '+msg).strip()
                changed_questions+=1; file_changed+=1; details.append((eid,q.get('no'),ctot))
        if file_changed:
            p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            changed_files+=1
    print('changed_files',changed_files,'changed_questions',changed_questions)
    for x in details: print(*x)
if __name__=='__main__': main()
