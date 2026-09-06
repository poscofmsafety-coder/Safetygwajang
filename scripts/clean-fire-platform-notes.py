#!/usr/bin/env python3
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
NOTE_RE=re.compile(r'\(([^()]*(?:문제\s*오류|관련\s*규정\s*개정전)[^()]*)\)',re.I)

def clean_one(text):
    notes=[]
    def repl(m):
        notes.append(re.sub(r'\s+',' ',m.group(1)).strip())
        return ''
    out=NOTE_RE.sub(repl,text)
    out=re.sub(r'\s+',' ',out).strip()
    return out,notes

def note_prefix(notes):
    s=' '.join(notes)
    if not s:return ''
    if re.search(r'확정\s*답안.*모두\s*정답',s):
        return '※ 당시 확정답안에서 모든 선택지가 정답 처리된 문항입니다. 연습 화면에서는 대표 선택지 1개로 채점됩니다. '
    m=re.search(r'확정\s*답안.*?([1-4](?:\s*,\s*[1-4])+)번?이?\s*정답',s)
    if not m:
        m=re.search(r'([1-4](?:\s*,\s*[1-4])+)번?이?\s*정답처리',s)
    if m:
        nums=re.sub(r'\s+','',m.group(1)).replace(',', '번·')+'번'
        return f'※ 당시 확정답안에서 {nums}이 복수 정답 처리된 문항입니다. 연습 화면에서는 대표 선택지 1개로 채점됩니다. '
    if '관련 규정 개정전' in s or re.search(r'관련\s*규정\s*개정전',s):
        return '※ 출제 당시 기준의 법규 문항이며 이후 관련 규정이 개정되었습니다. '
    return '※ 출제 당시 정답 정정 이력이 있는 문항입니다. 연습 화면에서는 대표 선택지 1개로 채점됩니다. '

def main():
    changed=0
    for p in sorted(DATA.glob('소방설비기사(기계분야) *.json')):
        d=json.loads(p.read_text(encoding='utf-8'))
        for q in d['questions']:
            nq,notes=clean_one(q['question'])
            if notes:
                q['question']=nq
                pref=note_prefix(notes)
                if pref and not q.get('explanation','').startswith('※'):
                    q['explanation']=pref+q.get('explanation','')
                changed+=1
            new_choices=[]
            for c in q['choices']:
                nc,cnotes=clean_one(c)
                new_choices.append(nc)
                if cnotes and not q.get('explanation','').startswith('※'):
                    q['explanation']=note_prefix(cnotes)+q.get('explanation','')
                    changed+=1
            q['choices']=new_choices
        p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('platform notes cleaned',changed)
if __name__=='__main__':main()
