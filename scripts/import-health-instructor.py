#!/usr/bin/env python3
import fitz, json, re, subprocess, math, shutil
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATA_DIR=ROOT/'data'
ASSET_ROOT=ROOT/'assets'/'cbt'/'health-instructor'
PDF_ROOT=Path('/mnt/data')
SUBJECTS=[
 {'name':'산업안전보건법령','range':[1,25]},
 {'name':'산업보건일반','range':[26,50]},
 {'name':'기업진단ㆍ지도','range':[51,75]},
]
CIRCLE_TO_NUM={'①':1,'②':2,'③':3,'④':4,'⑤':5,'❶':1,'❷':2,'❸':3,'❹':4,'❺':5}
NORMAL_CIRCLE={1:'①',2:'②',3:'③',4:'④',5:'⑤'}
FILLED=set('❶❷❸❹❺')
ALL_CIRCLES='①②③④⑤❶❷❸❹❺'
BOILER=(
 '전자문제집 CBT 홈페이지','기출문제 및 해설집 다운로드','전자문제집 CBT 앱','전자문제집 CBT란?',
 '종이 문제집이 아닌','인터넷으로 문제를 풀고','모의고사, 오답 노트','PC 버전 및 모바일 버전',
 '교사용/학생용 관리기능','최신 수정된','최강 자격증 기출문제 전자문제집 CBT',
 '오답 및 오탈자가 수정된','전자문제집 CBT 에서 확인하세요'
)
PLATFORM_PATTERNS=(
 r'문제\s*오류로?[^)]*?정답\s*처리[^)]*',
 r'가답안[^)]*?여기서는[^)]*?정답\s*처리[^)]*',
 r'확정\s*답안[^)]*?여기서는[^)]*?정답\s*처리[^)]*',
 r'여기서는\s*(?:가답안인\s*)?\d+번을\s*누르면\s*정답\s*처리[^)]*',
)
VISUAL_RE=re.compile(r'(표이다|표를\s*보고|표와\s*같|다음\s*(?:그림|도표|표|내용|자료|보기)|아래\s*(?:그림|도표|표|내용)|그림에서|그림의|그래프|결함수|FTA|회로|도식|배치도|계통도|관계도|특성요인도|박스|보기에서|모두\s*고른|ㄱ|ㄴ|ㄷ|ㄹ|ㅁ)')
try:
 FONT=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',28)
except Exception:
 FONT=ImageFont.load_default()

def date_from_name(p):
 m=re.search(r'(20\d{2})(\d{2})(\d{2})',p.name)
 if not m: raise ValueError(p.name)
 y,mo,d=m.groups(); return f'{y}-{mo}-{d}',int(y),int(mo),int(d)

def subject_for(n):
 return next(s['name'] for s in SUBJECTS if s['range'][0] <= n <= s['range'][1])

def clean_line(s):
 return re.sub(r'\s+',' ',s.replace('\u00a0',' ').replace('\ufeff',' ')).strip()

def skip_line(t):
 return (not t or any(k in t for k in BOILER) or bool(re.search(r'^\s*\d과목\s*:',t)) or
         ('산업보건지도사' in t and '필기 기출문제' in t) or
         ('최강 자격증' in t and '전자문제집 CBT' in t))

def extract_ordered(pdf):
 doc=fitz.open(pdf)
 qrec={i:{'body':[],'regions':defaultdict(lambda:[1e9,-1e9])} for i in range(1,76)}
 expected=1; current=None; stop=False
 for pno,page in enumerate(doc):
  if stop: break
  mid=page.rect.width/2; lines=[]
  for b in page.get_text('dict').get('blocks',[]):
   for line in b.get('lines',[]):
    spans=line.get('spans',[])
    if not spans: continue
    txt=clean_line(''.join(sp.get('text','') for sp in spans))
    if not txt: continue
    x0,y0,x1,y1=line['bbox']
    if y0<45 or y1>page.rect.height-18: continue
    colors=[sp.get('color',0) for sp in spans if sp.get('text','').strip()]
    color=colors[0] if colors else 0
    col=0 if (x0+x1)/2<mid else 1
    lines.append((col,y0,x0,y1,txt,color))
  for col in (0,1):
   col_lines=sorted((z for z in lines if z[0]==col),key=lambda z:(z[1],z[2]))
   for _,y0,x0,y1,txt,color in col_lines:
    if current==75 and any(k in txt for k in BOILER[:5]): stop=True; break
    if skip_line(txt): continue
    m=re.match(r'^(\d{1,2})\.\s*(.*)',txt); black=(color==0)
    if m and black and int(m.group(1))==expected:
     current=expected; expected+=1
     qrec[current]['body'].append(f'{current}. {m.group(2)}'.strip())
     qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0)
     qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1)
     continue
    if current is None: continue
    if current==75 and len(re.findall(r'[①②③④⑤]',txt))>=5: continue
    if black:
     qrec[current]['body'].append(txt)
     qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0)
     qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1)
   if stop: break
 doc.close(); return qrec,expected-1

def extract_answers(pdf):
 text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-'],text=True,encoding='utf-8',errors='replace')
 rows=[]
 for line in text.splitlines()[-320:]:
  toks=re.findall(r'[①②③④⑤]',line)
  if len(toks)>=5:
   # Answer table is laid out in 10-column rows, with the final row containing 5 answers.
   rows.append([CIRCLE_TO_NUM[t] for t in (toks[-10:] if len(toks)>=10 else toks[-5:])])
 if len(rows)<8: raise ValueError(f'{pdf.name}: answer rows {len(rows)}')
 ans=[]
 for row in rows[-8:]: ans.extend(row)
 ans=ans[-75:]
 if len(ans)!=75: raise ValueError(f'{pdf.name}: answers {len(ans)}')
 return ans

def join_text(lines):
 t=' '.join(clean_line(x) for x in lines if clean_line(x))
 t=re.sub(r'\s+',' ',t).strip().replace('ㆍ','·')
 t=re.sub(r'\s+([,.:;?%)])',r'\1',t)
 t=t.replace(' ,',',').replace(' .','.')
 return t

def clean_platform_note(q):
 # Remove source-site grading / answer guidance while retaining legitimate exam conditions.
 q=re.sub(r'\((?=[^)]*(?:문제\s*오류|가답안|확정\s*답안|여기서는|누르면\s*정답))[^)]*\)','',q,flags=re.I)
 for p in PLATFORM_PATTERNS:
  q=re.sub(p,'',q,flags=re.I)
 q=re.sub(r'\s+',' ',q).strip()
 return q

def parse_question(no,body):
 # Parse with the original line boundaries. A line may contain two or more
 # horizontally arranged choices, and option numbers can appear out of text order.
 # Circled numbers used as references inside a choice (e.g. "위 ①항") are retained.
 lines=[clean_line(x) for x in body if clean_line(x)]
 if lines:
  lines[0]=re.sub(rf'^{no}\.\s*','',lines[0]).strip()
 qlines=[]; buckets={i:[] for i in range(1,6)}; started=False; active=None
 marker_re=re.compile(rf'[{ALL_CIRCLES}]')
 for line in lines:
  valid=[]
  for m in marker_re.finditer(line):
   idx=CIRCLE_TO_NUM[m.group()]
   before=line[max(0,m.start()-8):m.start()]
   after=line[m.end():m.end()+4]
   # "위 ①항", "②항" etc. are references, not answer-choice delimiters.
   is_ref=bool(re.search(r'위\s*$',before)) or bool(re.match(r'\s*항',after))
   if m.start()==0 or not is_ref:
    valid.append((m,idx))
  if not started and valid:
   started=True
  if started and valid:
   prefix=line[:valid[0][0].start()].strip()
   if prefix and active in buckets:
    buckets[active].append(prefix)
   for j,(m,idx) in enumerate(valid):
    endpos=valid[j+1][0].start() if j+1<len(valid) else len(line)
    seg=line[m.end():endpos].strip()
    buckets[idx].append(seg)
    active=idx
  elif started:
   if active in buckets: buckets[active].append(line)
  else:
   qlines.append(line)
 q=clean_platform_note(join_text(qlines)).strip()
 choices=[]
 for i in range(1,6):
  c=clean_platform_note(join_text(buckets[i])).strip()
  choices.append(c if c and c not in {'-','·'} else '그림 선택지')
 return q or f'{no}번 문제',choices

def marker_answer(body):
 raw=' '.join(body)
 m=re.search(r'[❶❷❸❹❺]',raw)
 return CIRCLE_TO_NUM[m.group()] if m else None

def vdist(r,y0,y1):
 if r.y1<y0:return y0-r.y1
 if r.y0>y1:return r.y0-y1
 return 0

def graphic_clips(pdf,regions,needed=True):
 doc=fitz.open(pdf); cand=[]
 maxdist=8 if needed else 0
 for (pno,col),(y0,y1) in regions.items():
  if y1<=y0 or y0>1e8: continue
  page=doc[pno]; mid=page.rect.width/2
  cx0=22 if col==0 else mid+3; cx1=mid-3 if col==0 else page.rect.width-22
  for b in page.get_text('dict').get('blocks',[]):
   if b.get('type')!=1: continue
   r=fitz.Rect(b['bbox']); center=(r.x0+r.x1)/2
   if cx0<=center<=cx1 and r.width>14 and r.height>8:
    dist=vdist(r,y0,y1)
    if dist<=maxdist: cand.append((dist,pno,r))
 if not cand:
  doc.close(); return []
 # retain all blocks overlapping/very near the question, in page order
 out=[]
 for _,p,r in sorted(cand,key=lambda x:(x[1],round(x[2].y0,1),round(x[2].x0,1))):
  if any(p==pp and (r&rr).get_area()>0.82*min(r.get_area(),rr.get_area()) for pp,rr in out): continue
  out.append((p,r))
 doc.close(); return out

def _clip_choice_index(doc,pno,r,regions):
 page=doc[pno]; mid=page.rect.width/2; col=0 if (r.x0+r.x1)/2<mid else 1
 rg=regions.get((pno,col)) if regions else None
 if rg and rg[1]>rg[0] and rg[0]<1e8:
  ymin=min(rg[0],r.y0)-40; ymax=max(rg[1],r.y1)+40
 else:
  ymin=r.y0-60; ymax=r.y1+60
 markers=[]
 for b in page.get_text('dict').get('blocks',[]):
  for line in b.get('lines',[]):
   for sp in line.get('spans',[]):
    txt=sp.get('text',''); m=re.search(rf'[{ALL_CIRCLES}]',txt)
    if not m: continue
    sr=fitz.Rect(sp['bbox']); sc=0 if (sr.x0+sr.x1)/2<mid else 1
    if sc!=col or (sr.y0+sr.y1)/2<ymin or (sr.y0+sr.y1)/2>ymax: continue
    markers.append((CIRCLE_TO_NUM[m.group()],sr))
 if not markers:return None
 cx=(r.x0+r.x1)/2; cy=(r.y0+r.y1)/2; best=None
 for idx,sr in markers:
  sx=(sr.x0+sr.x1)/2; sy=(sr.y0+sr.y1)/2
  penalty=0 if sr.x1<=r.x1+10 else 45
  dist=abs(cx-sx)+1.35*abs(cy-sy)+penalty
  if best is None or dist<best[0]: best=(dist,idx)
 if not best or best[0]>155:return None
 return best[1]

def save_graphics(pdf,date,no,clips,choices,regions):
 if not clips:return None
 doc=fitz.open(pdf)
 has_placeholder=any(c=='그림 선택지' for c in choices)
 mapped=[]
 if has_placeholder:
  for p,r in clips:mapped.append(_clip_choice_index(doc,p,r,regions))
  if len(clips)==5:
   mapped=[1,2,3,4,5]
  elif all(x in (1,2,3,4,5) for x in mapped) and len(set(mapped))==len(mapped):
   paired=sorted(zip(mapped,clips),key=lambda z:z[0]); mapped=[x for x,_ in paired]; clips=[c for _,c in paired]
 pieces=[]
 for p,r in clips:
  page=doc[p]
  rr=fitz.Rect(max(0,r.x0-3),max(0,r.y0-3),min(page.rect.width,r.x1+3),min(page.rect.height,r.y1+3))
  pix=page.get_pixmap(matrix=fitz.Matrix(2.1,2.1),clip=rr,alpha=False)
  pieces.append(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
 doc.close()
 if not pieces:return None
 label_images=has_placeholder and any(x in (1,2,3,4,5) for x in mapped)
 lw=58 if label_images else 0; gap=14
 maxw=max(i.width for i in pieces)+lw; h=sum(i.height for i in pieces)+gap*(len(pieces)-1)
 can=Image.new('RGB',(maxw,h),'white'); y=0; labs=NORMAL_CIRCLE
 for i,im in enumerate(pieces):
  x=lw if label_images else (maxw-im.width)//2
  if label_images:
   lab=mapped[i] if i<len(mapped) and mapped[i] in labs else None
   if lab: ImageDraw.Draw(can).text((5,y+max(0,(im.height-34)//2)),labs[lab],font=FONT,fill='black')
  can.paste(im,(x,y)); y+=im.height+gap
 od=ASSET_ROOT/date; od.mkdir(parents=True,exist_ok=True)
 out=od/f'q{no:02d}.png'; can.save(out,'PNG',compress_level=6)
 return out,can.width,can.height,label_images,set(x for x in mapped if x in (1,2,3,4,5))

def sc(c):
 c=re.sub(r'\s+',' ',c).strip(); return c if len(c)<=120 else c[:117]+'...'

def concl(a,c): return f"{a}번 ‘{sc(c)}’이 정답입니다."

def explain(q,ch,a,subject):
 corr=ch[a-1] if 1<=a<=len(ch) else ''
 qc=re.sub(r'\s+','',q)
 # ---- 법령 ----
 if subject=='산업안전보건법령':
  hist='이 문항은 해당 회차 출제 당시의 산업안전보건법령을 기준으로 채점해야 합니다. '
  if '안전보건관리책임자' in q:
   return hist+f"안전보건관리책임자는 사업장의 안전·보건 업무를 총괄하며 안전관리자와 보건관리자의 지도·조언을 실제 조치로 연결하는 위치입니다. 문제의 인원·업종·직무 조건을 시행령의 선임 및 업무 범위와 대조하면 {concl(a,corr)}"
  if '산업안전보건위원회' in q:
   return hist+f"산업안전보건위원회는 근로자위원과 사용자위원을 같은 수로 구성하고, 법에서 정한 안전·보건 중요사항을 심의·의결하는 노사 참여기구입니다. 구성요건·회의요건·심의사항을 구분하면 {concl(a,corr)}"
  if any(k in q for k in ['도급인','수급인','관계수급인','도급의 승인','도급금지','도급인가']):
   return hist+f"도급 관련 문제는 도급금지·승인 대상과 도급인의 안전보건조치, 협의체·순회점검·작업조정 의무를 서로 구분해야 합니다. 문제에 제시된 작업과 주체의 법적 의무를 대응하면 {concl(a,corr)}"
  if '안전보건교육' in q or '직무교육' in q or '교육시간' in q:
   return hist+f"교육 문제는 교육대상, 교육과정, 교육시기와 최소시간을 각각 분리해서 판단하는 것이 핵심입니다. 정기·채용 시·작업내용 변경 시·특별교육 또는 직무교육 중 어느 유형인지 먼저 확정하면 {concl(a,corr)}"
  if '안전인증' in q or '자율안전확인' in q or '안전검사' in q:
   return hist+f"안전인증·자율안전확인·안전검사는 대상 기계·기구와 실시시기, 면제·취소 사유가 서로 다릅니다. 문항에서 묻는 제도와 대상 설비를 정확히 짝지어 판단하면 {concl(a,corr)}"
  if '산업재해' in q and any(k in q for k in ['보고','기록','공표','중대재해','발생건수']):
   return hist+f"산업재해 관련 법규는 중대재해의 정의, 발생기록·조사표 제출, 공표대상 요건을 구분하는 문제입니다. 사고 결과와 보고·보존 의무의 주체 및 기한을 대조하면 {concl(a,corr)}"
  if '안전보건표지' in q:
   return hist+f"안전보건표지는 금지·경고·지시·안내의 종류별 색채와 그림, 설치·부착 원칙을 구분해 기억해야 합니다. 문항의 표지 종류와 색채·표현 기준을 대응하면 {concl(a,corr)}"
  if '건강진단' in q:
   return hist+f"건강진단은 일반·특수·배치전·수시·임시 건강진단의 대상과 실시주기, 결과 보호 및 사후조치를 구분해야 합니다. 문제의 대상 근로자와 진단 유형을 대조하면 {concl(a,corr)}"
  if '작업환경측정' in q:
   return hist+f"작업환경측정 문제는 측정대상 유해인자, 측정주기·방법, 결과 설명과 기록 의무를 구분하는 것이 핵심입니다. 문항의 조건을 당시 시행규칙·고시 기준에 맞추면 {concl(a,corr)}"
  if '물질안전보건자료' in q or 'MSDS' in q:
   return hist+f"물질안전보건자료(MSDS)는 화학물질의 유해·위험성 정보 전달, 경고표지와 교육, 자료의 제공·비치 의무를 중심으로 판단합니다. 제조·수입·사용 주체의 의무를 구분하면 {concl(a,corr)}"
  if '산업안전지도사' in q or '산업보건지도사' in q:
   return hist+f"지도사 제도 문제는 자격 취득·등록, 업무범위, 결격사유와 직무수행 기준을 구분해야 합니다. 문항에서 묻는 자격·등록 또는 업무 범위와 법정 요건을 대조하면 {concl(a,corr)}"
  return hist+f"법규형 문제는 대상 사업·근로자·기계·행위와 의무 주체, 기한·수치 및 예외조건을 분리해 보는 것이 핵심입니다. 이 회차 기준으로 제시조건에 부합하는 내용은 ‘{sc(corr)}’입니다. {concl(a,corr)}"

 # ---- 산업보건일반 ----
 if subject=='산업보건일반':
  if any(k in q for k in ['TWA','STEL','Ceiling','C값','노출기준','허용농도','TLV']):
   return f"노출기준 문제는 시간가중평균(TWA), 단시간노출기준(STEL), 최고노출기준(C)의 적용시간과 의미를 구분해야 합니다. 여러 물질이 함께 존재하면 혼합노출 평가식까지 확인해야 하므로, 문항의 시간조건·단위·노출형태를 먼저 정리하면 {concl(a,corr)}"
  if any(k in q for k in ['ppm','mg/m3','mg/m³','분자량','기체상','증기량','환기량']):
   return f"기체·증기 농도 계산은 온도와 압력을 확인한 뒤 이상기체 관계와 ppm↔mg/m³ 변환을 적용합니다. 25℃·1기압 기준에서는 mg/m³=ppm×분자량/24.45를 기본으로 하되, 문제에서 다른 온도·압력을 주면 몰부피를 보정해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['국소배기','후드','덕트','제어풍속','반송속도','정압','동압','송풍기','압력손실']):
   return f"국소배기설비는 오염원을 후드에서 포착해 덕트·공기정화장치·송풍기로 이송하는 계통입니다. 기본 유량관계 Q=AV, 후드 형식별 제어풍속, 덕트 반송속도와 정압·동압·압력손실의 관계를 순서대로 적용하면 {concl(a,corr)}"
  if any(k in q for k in ['입자상','분진','흄','미스트','에어로졸','공기역학적 직경','Martin','마틴직경']):
   return f"입자상 물질은 생성기전과 입자크기 정의에 따라 분진·흄·미스트 등을 구분합니다. 호흡기 침착과 시료채취에서는 공기역학적 직경이 중요하며, 현미경 직경·Martin 직경 등은 정의가 서로 다르므로 문항의 측정원리를 대조하면 {concl(a,corr)}"
  if any(k in q for k in ['시료채취','채취매체','활성탄','실리카겔','여과지','펌프','유량보정','개인시료','지역시료']):
   return f"작업환경측정의 시료채취는 유해인자의 물리·화학적 특성에 맞는 매체와 유량을 선택하고, 개인노출 평가는 호흡영역에서 채취하는 것이 기본입니다. 펌프 유량보정, 공시료·회수율 등 품질관리 조건을 함께 확인하면 {concl(a,corr)}"
  if any(k in q for k in ['흡광광도','분광광도','가스크로마토','GC','HPLC','원자흡광','검량선','분석법']):
   return f"산업위생 분석법은 대상 물질과 검출원리에 따라 선택합니다. 크로마토그래피는 혼합성분 분리, 분광법은 빛의 흡수·방출 특성, 검량선은 표준농도와 기기응답의 관계를 이용하므로 분석대상과 원리를 대응하면 {concl(a,corr)}"
  if any(k in q for k in ['소음','dB','데시벨','등가소음','옥타브','청력','진동']):
   return f"소음은 로그척도이므로 dB 값을 단순 산술합하지 않으며, 노출시간과 음압수준을 함께 평가합니다. 주파수 분석은 옥타브밴드 등을 이용하고 청력보존에서는 노출평가·공학적 개선·보호구·청력검사를 연계하므로 {concl(a,corr)}"
  if any(k in q for k in ['고열','WBGT','열스트레스','한랭','온열','습도','복사열']):
   return f"온열환경 평가는 기온만이 아니라 습도·기류·복사열과 작업강도를 함께 봐야 합니다. WBGT는 자연습구온도·흑구온도·건구온도를 작업환경 조건에 따라 조합하므로 실내외·일사 유무를 먼저 구분하면 {concl(a,corr)}"
  if any(k in q for k in ['조도','조명','휘도','반사율','눈부심']):
   return f"조명 문제는 조도, 휘도, 반사율과 눈부심의 개념을 구분해야 합니다. 작업면에서 필요한 시각정보를 충분히 확보하면서 명암비와 반사를 관리하는 것이 기본 원칙이므로 문항의 단위와 대상면을 확인하면 {concl(a,corr)}"
  if any(k in q for k in ['독성','LD50','LC50','발암','흡수','대사','생물학적','BEI','중독']):
   return f"산업독성학에서는 유해물질의 흡수-분포-대사-배설 경로와 표적장기, 용량-반응 관계를 구분합니다. LD50·LC50은 급성독성 지표이고 생물학적 노출지표는 체내 흡수량을 반영하므로 지표의 의미를 대조하면 {concl(a,corr)}"
  if any(k in q for k in ['역학','유병률','발생률','상대위험도','교차비','오즈비','코호트','환자대조군','민감도','특이도']):
   return f"산업역학 문제는 발생률·유병률의 분모와 관찰기간을 구분하고, 연구설계에 따라 상대위험도(RR) 또는 교차비(OR)를 사용합니다. 코호트와 환자-대조군 연구의 시간방향 및 지표를 정확히 대응하면 {concl(a,corr)}"
  if any(k in q for k in ['통계','정규분포','대수정규','기하평균','기하표준편차','표준편차','신뢰구간']):
   return f"작업환경 농도는 대수정규분포를 따르는 경우가 많아 기하평균(GM)과 기하표준편차(GSD)를 사용합니다. 정규분포와 대수정규분포의 중심·산포 지표를 구분하고 제시된 범위의 면적비를 적용하면 {concl(a,corr)}"
  if any(k in q for k in ['호흡보호구','방진마스크','방독마스크','보호구','APF','보호계수','산소결핍']):
   return f"호흡용 보호구는 산소농도와 오염물질의 종류·농도를 먼저 확인한 뒤 여과식·정화통식·공기공급식 중 적합한 방식을 선택합니다. 산소결핍이나 즉시생명위험농도에서는 일반 여과식 보호구를 사용할 수 없다는 원칙을 기준으로 보면 {concl(a,corr)}"
  if any(k in q for k in ['MSDS','물질안전보건자료','경고표지','GHS','그림문자']):
   return f"GHS/MSDS 문제는 유해·위험성 분류, 경고표지 요소와 물질안전보건자료의 정보전달 의무를 구분해야 합니다. 그림문자·신호어·유해위험문구의 역할과 사업주의 확인·교육 의무를 대조하면 {concl(a,corr)}"
  if any(k in q for k in ['근골격','들기지수','RWL','NIOSH','OWAS','RULA','REBA','인간공학']):
   return f"근골격계 부담 평가에서는 작업자세·중량·빈도·거리·비틀림 등 부담요인을 체계적으로 봅니다. NIOSH 들기식은 권장무게한계(RWL)를 산정한 뒤 실제하중/RWL로 들기지수(LI)를 구하므로 계수의 의미와 범위를 확인하면 {concl(a,corr)}"
  if any(k in q for k in ['건강진단','직업병','건강관리','사후관리','유소견자']):
   return f"근로자 건강관리는 노출평가와 건강진단 결과를 연결해 이상소견을 조기에 발견하고 사후조치를 시행하는 과정입니다. 일반·특수·배치전·수시·임시 건강진단의 대상과 목적을 구분하면 {concl(a,corr)}"
  return f"산업보건일반은 작업환경 유해인자의 인지·평가·관리와 산업독성학, 작업환경측정, 환기, 보호구, 직업건강관리의 원리를 종합적으로 다룹니다. 문항의 유해인자·측정단위·관리방법을 단계별로 대조하면 ‘{sc(corr)}’이 가장 적절합니다. {concl(a,corr)}"

 # ---- 기업진단·지도 ----
 if any(k in q for k in ['EOQ','경제적주문량','재고','MRP','JIT','SCM','공급사슬','채찍효과']):
  if 'EOQ' in q or '경제적주문량' in q:
   return f"경제적주문량(EOQ)은 주문비용과 재고유지비용의 합을 최소화하는 주문량으로 Q*=√(2DS/H)를 사용합니다. 기본모형은 수요와 조달기간이 알려져 있고 품절이 없으며 단가가 주문량에 따라 변하지 않는다는 가정을 둡니다. {concl(a,corr)}"
  return f"생산·재고관리에서는 MRP, JIT, SCM, VMI 등 각 기법이 어떤 정보를 입력으로 사용하고 재고·납기·공급망을 어떻게 통제하는지 구분해야 합니다. 문항의 목적과 운영방식을 대응하면 {concl(a,corr)}"
 if any(k in q for k in ['PERT','CPM','주공정','프로젝트']):
  return f"PERT/CPM은 활동의 선후관계를 네트워크로 표현해 프로젝트 일정을 관리합니다. PERT는 불확실한 작업시간의 확률적 추정, CPM은 비교적 확정적인 작업시간과 비용-기간 관계 및 주공정 관리에 초점을 둡니다. {concl(a,corr)}"
 if any(k in q for k in ['직무분석','직무평가','직무설계','직무기술서','직무명세서','직무충실화','직무확대']):
  return f"직무분석은 직무의 과업·책임과 요구조건을 체계적으로 파악하는 과정이며, 결과는 직무기술서와 직무명세서 작성에 활용됩니다. 직무평가는 직무의 상대적 가치, 직무설계는 업무구조 개선을 다루므로 개념을 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['리더십','피들러','하우스','경로-목표','변혁적','거래적']):
  return f"리더십 이론은 리더 특성보다 상황과 행동유형의 적합성을 묻는 경우가 많습니다. 피들러의 상황적합이론과 하우스의 경로-목표이론처럼 이론별 리더 유형과 상황변수를 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['동기부여','허즈버그','매슬로','맥그리거','기대이론','공정성이론']):
  return f"동기부여 이론은 욕구의 내용에 초점을 둔 내용이론과 동기가 형성되는 과정을 설명하는 과정이론으로 구분할 수 있습니다. 각 학자의 핵심 개념과 보상·성과의 관계를 대응하면 {concl(a,corr)}"
 if any(k in q for k in ['평정오류','후광','관대화','엄격화','중앙집중','초두효과']):
  return f"인사평정 오류는 한 특성이 전체평가에 번지는 후광효과, 실제보다 후하게 주는 관대화, 지나치게 낮게 주는 엄격화, 평균에 몰리는 중앙집중 등을 구분해야 합니다. 문항의 평가행동을 오류 유형에 대응하면 {concl(a,corr)}"
 if any(k in q for k in ['신뢰도','타당도','심리검사','상관계수']):
  return f"심리검사의 신뢰도는 측정의 일관성, 타당도는 측정하려는 속성을 제대로 재는 정도를 뜻합니다. 내적일치·검사-재검사·평가자간 신뢰도와 내용·구성·준거타당도의 검증방법을 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['직무스트레스','KOSS','주의','경계','Yerkes','여키스','근골격계']):
  return f"작업심리·인간공학 영역은 스트레스 요인, 주의의 선택·지속 특성, 작업부담과 근골격계 위험요인을 구분해 적용합니다. 문항에서 제시한 인간 특성과 작업조건의 관계를 기준으로 보면 {concl(a,corr)}"
 if any(k in q for k in ['작업환경측정','노출기준','STEL','TWA','Ceiling','건강진단','산업위생','유기용제','분진','국소배기','후드','덕트']):
  return f"산업위생 영역에서는 유해인자의 인지-평가-관리 흐름과 TWA·STEL·C 같은 노출기준, 시료채취·분석 및 공학적 관리원칙을 연결해야 합니다. 측정대상·단위·채취매체와 관리방법을 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['BSC','균형성과','6시그마','Six Sigma','TQM','품질']):
  return f"경영관리 기법은 목적과 관리지표를 구분하는 것이 핵심입니다. BSC는 재무·고객·내부프로세스·학습과 성장 관점을 균형 있게 보고, 6시그마는 데이터 기반으로 변동과 결함을 줄이는 개선체계를 사용합니다. {concl(a,corr)}"
 return f"기업진단·지도 과목은 조직·인사·생산관리·산업심리와 작업환경관리의 원리를 종합해 사업장을 진단하는 능력을 봅니다. 문항에서 요구하는 개념의 정의와 적용범위를 비교하면 ‘{sc(corr)}’이 가장 적절합니다. {concl(a,corr)}"

def main():
 pdfs=sorted(PDF_ROOT.glob('산업보건지도사20*.pdf'))
 if len(pdfs)!=13: print(f'WARNING: expected 13 PDFs, got {len(pdfs)}')
 ASSET_ROOT.mkdir(parents=True,exist_ok=True)
 # remove previous imports for repeatable runs
 for p in DATA_DIR.glob('산업보건지도사 *.json'): p.unlink()
 if ASSET_ROOT.exists():
  for d in ASSET_ROOT.iterdir():
   if d.is_dir(): shutil.rmtree(d)
 summary=[]
 for pdf in pdfs:
  date,y,mo,day=date_from_name(pdf)
  qrec,count=extract_ordered(pdf)
  if count!=75: raise ValueError(f'{pdf.name}: parsed {count}')
  answers=extract_answers(pdf)
  questions=[]; mismatch=[]; passages=0
  for no in range(1,76):
   q,choices=parse_question(no,qrec[no]['body'])
   a=answers[no-1]
   ma=marker_answer(qrec[no]['body'])
   if ma is not None and ma!=a: mismatch.append((no,ma,a))
   clips=graphic_clips(pdf,qrec[no]['regions'],True)
   passobj=None
   if clips:
    saved=save_graphics(pdf,date,no,clips,choices,qrec[no]['regions'])
    if saved:
     out,w,h,label_images,mapped=saved
     href=str(out.relative_to(ROOT)).replace('\\','/')
     passobj=[{'type':'svg','alt':f'{no}번 문제 제시자료','content':f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{href}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>"}]
     passages+=1
     if label_images:
      # Image-only options are selected using the neutral 1-5 buttons below the image.
      choices=[f'그림 선택지 {i}' if c=='그림 선택지' else c for i,c in enumerate(choices,1)]
   exp=explain(q,choices,a,subject_for(no))
   item={'no':no,'subject':subject_for(no),'question':q,'choices':choices,'answer':a,'explanation':exp}
   if passobj:item['passage']=passobj
   questions.append(item)
  if mismatch:
   raise ValueError(f'{pdf.name}: body/final answer mismatches {mismatch[:10]} count={len(mismatch)}')
  data={
   'examId':date,
   'title':f'산업보건지도사 1차 필기 {y}년 {mo}월 {day}일',
   'duration':90,
   'passingScore':60,
   'subjects':SUBJECTS,
   'questions':questions,
  }
  out=DATA_DIR/f'산업보건지도사 {date}.json'
  out.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
  summary.append((date,len(questions),passages))
  print(pdf.name,'=>',out.name,'questions',len(questions),'passages',passages,'mismatch',len(mismatch))
 # update index
 idxp=DATA_DIR/'index.json'; idx=json.loads(idxp.read_text(encoding='utf-8'))
 idx=[x for x in idx if '산업보건지도사' not in (str(x.get('id',''))+' '+str(x.get('title','')))]
 for date,y,mo,day in [date_from_name(p) for p in pdfs]:
  idx.append({
   'id':f'산업보건지도사 {date}',
   'title':'산업보건지도사 1차 필기',
   'date':f'{y}년 {mo}월 {day}일',
   'questions':75,
   'duration':90,
   'subjects':[s['name'] for s in SUBJECTS],
  })
 idxp.write_text(json.dumps(idx,ensure_ascii=False,indent=2),encoding='utf-8')
 print('index total',len(idx),'summary',summary)

if __name__=='__main__': main()
