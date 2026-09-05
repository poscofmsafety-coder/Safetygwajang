#!/usr/bin/env python3
import fitz, json, re, subprocess, math, shutil, os
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATA_DIR=ROOT/'data'
ASSET_ROOT=ROOT/'assets'/'cbt'/'fire-facility-manager'
PDF_ROOT=Path('/mnt/data')
SUBJECTS=[
 {'name':'소방안전관리론 및 화재역학','range':[1,25]},
 {'name':'소방수리학·약제화학 및 소방전기','range':[26,50]},
 {'name':'소방관련법령','range':[51,75]},
 {'name':'위험물의 성상 및 시설기준','range':[76,100]},
 {'name':'소방시설의 구조원리','range':[101,125]},
]
CIRCLE_TO_NUM={'①':1,'②':2,'③':3,'④':4,'❶':1,'❷':2,'❸':3,'❹':4}
NORMAL_CIRCLE={1:'①',2:'②',3:'③',4:'④'}
ALL_CIRCLES='①②③④❶❷❸❹'
BOILER=(
 '전자문제집 CBT 홈페이지','기출문제 및 해설집 다운로드','전자문제집 CBT 앱','전자문제집 CBT란?',
 '종이 문제집이 아닌','인터넷으로 문제를 풀고','모의고사, 오답 노트','PC 버전 및 모바일 버전',
 '교사용/학생용 관리기능','최신 수정된','최강 자격증 기출문제 전자문제집 CBT',
 '오답 및 오탈자가 수정된','전자문제집 CBT 에서 확인하세요'
)
PLATFORM_TRIGGER=re.compile(r'(?:관련\s*규정\s*개정|문제\s*오류|가답안|확정\s*답안|실제\s*시험|기존\s*정답|정답\s*처리|누르면\s*정답|여기서는)',re.I)
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
         ('소방시설관리사' in t and '필기 기출문제' in t) or
         ('최강 자격증' in t and '전자문제집 CBT' in t))

def extract_ordered(pdf):
 doc=fitz.open(pdf)
 qrec={i:{'body':[],'regions':defaultdict(lambda:[1e9,-1e9])} for i in range(1,126)}
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
    if current==125 and any(k in txt for k in BOILER[:5]): stop=True; break
    if skip_line(txt): continue
    m=re.match(r'^(\d{1,3})\.\s*(.*)',txt); black=(color==0)
    if m and black and int(m.group(1))==expected:
     current=expected; expected+=1
     qrec[current]['body'].append(f'{current}. {m.group(2)}'.strip())
     qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0)
     qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1)
     continue
    if current is None: continue
    if current==125 and len(re.findall(r'[①②③④]',txt))>=4: continue
    if black:
     qrec[current]['body'].append(txt)
     qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0)
     qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1)
   if stop: break
 doc.close(); return qrec,expected-1

def extract_answers(pdf):
 text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-'],text=True,encoding='utf-8',errors='replace')
 rows=[]
 for line in text.splitlines()[-460:]:
  toks=re.findall(r'[①②③④]',line)
  if len(toks)>=5:
   rows.append([CIRCLE_TO_NUM[t] for t in (toks[-10:] if len(toks)>=10 else toks[-5:])])
 if len(rows)<13: raise ValueError(f'{pdf.name}: answer rows {len(rows)}')
 ans=[]
 for row in rows[-13:]: ans.extend(row)
 ans=ans[-125:]
 if len(ans)!=125: raise ValueError(f'{pdf.name}: answers {len(ans)}')
 return ans

def join_text(lines):
 t=' '.join(clean_line(x) for x in lines if clean_line(x))
 t=re.sub(r'\s+',' ',t).strip().replace('ㆍ','·')
 t=re.sub(r'\s+([,.:;?%)])',r'\1',t)
 return t

def clean_platform_note(s):
 if not PLATFORM_TRIGGER.search(s): return re.sub(r'\s+',' ',s).strip()
 # only remove parenthetical/standalone platform grading guidance; preserve the exam stem itself
 s=re.sub(r'\((?=[^)]*(?:관련\s*규정\s*개정|문제\s*오류|가답안|확정\s*답안|실제\s*시험|기존\s*정답|정답\s*처리|누르면\s*정답|여기서는))[^)]*\)','',s,flags=re.I)
 s=re.sub(r'(?:문제\s*오류|가답안|확정\s*답안|기존\s*정답|관련\s*규정\s*개정)[^.?!]*(?:정답\s*처리|누르면\s*정답|해설을\s*참고)[^.?!]*[.?!]?','',s,flags=re.I)
 s=re.sub(r'\s+',' ',s).strip()
 return s

def parse_question(no,body):
 lines=[clean_line(x) for x in body if clean_line(x)]
 if lines: lines[0]=re.sub(rf'^{no}\.\s*','',lines[0]).strip()
 qlines=[]; buckets={i:[] for i in range(1,5)}; started=False; active=None
 marker_re=re.compile(rf'[{ALL_CIRCLES}]')
 for line in lines:
  valid=[]
  for m in marker_re.finditer(line):
   idx=CIRCLE_TO_NUM[m.group()]
   before=line[max(0,m.start()-9):m.start()]
   after=line[m.end():m.end()+5]
   is_ref=(bool(re.search(r'(?:위|상기|제)\s*$',before)) or bool(re.match(r'\s*(?:항|번|호|식)',after)))
   if m.start()==0 or not is_ref: valid.append((m,idx))
  if not started and valid: started=True
  if started and valid:
   prefix=line[:valid[0][0].start()].strip()
   if prefix and active in buckets: buckets[active].append(prefix)
   for j,(m,idx) in enumerate(valid):
    endpos=valid[j+1][0].start() if j+1<len(valid) else len(line)
    seg=line[m.end():endpos].strip(); buckets[idx].append(seg); active=idx
  elif started:
   if active in buckets: buckets[active].append(line)
  else:
   qlines.append(line)
 q=clean_platform_note(join_text(qlines)).strip()
 choices=[]
 for i in range(1,5):
  c=clean_platform_note(join_text(buckets[i])).strip()
  choices.append(c if c and c not in {'-','·'} else '그림 선택지')
 return q or f'{no}번 문제',choices

def marker_answer(body):
 m=re.search(r'[❶❷❸❹]',join_text(body)); return CIRCLE_TO_NUM[m.group()] if m else None

def vdist(r,y0,y1):
 if r.y1<y0:return y0-r.y1
 if r.y0>y1:return r.y0-y1
 return 0

def graphic_clips(pdf,regions):
 doc=fitz.open(pdf); cand=[]
 for (pno,col),(y0,y1) in regions.items():
  if y1<=y0 or y0>1e8: continue
  page=doc[pno]; mid=page.rect.width/2
  cx0=22 if col==0 else mid+3; cx1=mid-3 if col==0 else page.rect.width-22
  for b in page.get_text('dict').get('blocks',[]):
   if b.get('type')!=1: continue
   r=fitz.Rect(b['bbox']); center=(r.x0+r.x1)/2
   if cx0<=center<=cx1 and r.width>14 and r.height>8 and vdist(r,y0,y1)<=10:
    cand.append((pno,r))
 doc.close(); out=[]
 for p,r in sorted(cand,key=lambda x:(x[0],round(x[1].y0,1),round(x[1].x0,1))):
  if any(p==pp and (r&rr).get_area()>0.82*min(r.get_area(),rr.get_area()) for pp,rr in out): continue
  out.append((p,r))
 return out

def _clip_choice_index(doc,pno,r,regions):
 page=doc[pno]; mid=page.rect.width/2; col=0 if (r.x0+r.x1)/2<mid else 1
 rg=regions.get((pno,col)) if regions else None
 if rg and rg[1]>rg[0] and rg[0]<1e8:
  ymin=min(rg[0],r.y0)-40; ymax=max(rg[1],r.y1)+40
 else: ymin=r.y0-60; ymax=r.y1+60
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
 if not best or best[0]>125:return None
 return best[1]

def save_graphics(pdf,date,no,clips,choices,regions):
 if not clips:return None
 doc=fitz.open(pdf); has_placeholder=any(c=='그림 선택지' for c in choices); mapped=[]
 if has_placeholder:
  for p,r in clips:mapped.append(_clip_choice_index(doc,p,r,regions))
  if len(clips)==4:
   mapped=[1,2,3,4]
  else:
   # Keep the main stem diagram(s) first and sort only actual image choices 1-4.
   paired=list(zip(mapped,clips))
   labelled=[z for z in paired if z[0] in (1,2,3,4)]
   unlabelled=[z for z in paired if z[0] not in (1,2,3,4)]
   if len(labelled)==4 and len({z[0] for z in labelled})==4:
    labelled=sorted(labelled,key=lambda z:z[0])
    mapped=[z[0] for z in unlabelled+labelled]
    clips=[z[1] for z in unlabelled+labelled]
 pieces=[]
 for p,r in clips:
  page=doc[p]; rr=fitz.Rect(max(0,r.x0-3),max(0,r.y0-3),min(page.rect.width,r.x1+3),min(page.rect.height,r.y1+3))
  pix=page.get_pixmap(matrix=fitz.Matrix(2.1,2.1),clip=rr,alpha=False)
  pieces.append(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
 doc.close()
 if not pieces:return None
 label_images=has_placeholder and any(x in (1,2,3,4) for x in mapped); lw=58 if label_images else 0; gap=14
 maxw=max(i.width for i in pieces)+lw; h=sum(i.height for i in pieces)+gap*(len(pieces)-1)
 can=Image.new('RGB',(maxw,h),'white'); y=0
 for i,im in enumerate(pieces):
  x=lw if label_images else (maxw-im.width)//2
  if label_images:
   lab=mapped[i] if i<len(mapped) and mapped[i] in NORMAL_CIRCLE else None
   if lab: ImageDraw.Draw(can).text((5,y+max(0,(im.height-34)//2)),NORMAL_CIRCLE[lab],font=FONT,fill='black')
  can.paste(im,(x,y)); y+=im.height+gap
 od=ASSET_ROOT/date; od.mkdir(parents=True,exist_ok=True); out=od/f'q{no:03d}.png'; can.save(out,'PNG',compress_level=6)
 return out,can.width,can.height,label_images,set(x for x in mapped if x in (1,2,3,4))

def sc(c):
 c=re.sub(r'\s+',' ',c).strip(); return c if len(c)<=130 else c[:127]+'...'
def concl(a,c): return f"따라서 {a}번 ‘{sc(c)}’이 정답입니다."

def explain(q,ch,a,subject,raw_note=False):
 corr=ch[a-1] if 1<=a<=len(ch) else ''
 note='※ 원자료에 문제오류·가답안·법규개정 등 정답처리 안내가 있던 문항은 문제 화면에서 그 안내를 제거하고, 제공된 교사용 최종 정답 기준으로 대표 선택지 1개를 채점합니다. ' if raw_note else ''
 # 1. 소방안전관리론
 if subject=='소방안전관리론 및 화재역학':
  if '폭발하한' in q or '연소하한' in q or '폭발한계' in q or '연소범위' in q:
   return note+f"가연성 가스의 연소·폭발 위험은 하한계가 낮고 범위가 넓을수록 커집니다. 혼합가스의 하한계 계산 문제는 르샤틀리에 식 L=100/Σ(yᵢ/Lᵢ)을 적용하고, 단일물질 비교는 하한계와 상한계를 함께 봅니다. {concl(a,corr)}"
  if any(k in q for k in ['인화점','연소점','발화점']):
   return note+f"인화점은 외부 점화원에 의해 순간 착화가 가능한 최저온도, 연소점은 점화원을 제거해도 연소가 지속되는 최저온도, 발화점은 외부 점화원 없이 스스로 발화하는 최저온도입니다. 세 개념의 온도순서와 정의를 구분하면 {concl(a,corr)}"
  if any(k in q for k in ['플래시오버','flash over','Flash over']):
   return note+f"플래시오버는 구획실 화재가 성장하면서 축적된 복사열로 실내 가연물이 거의 동시에 착화되어 전체 화재로 급격히 전이되는 현상입니다. 산소 유입으로 폭발적으로 재연소하는 백드래프트와 구분해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['백드래프트','Back draft','back draft']):
   return note+f"백드래프트는 밀폐공간의 불완전연소 상태에서 가연성 열분해가스가 축적된 뒤 공기가 급격히 유입될 때 폭발적으로 연소하는 현상입니다. 전면적인 동시착화를 의미하는 플래시오버와 구분하면 {concl(a,corr)}"
  if any(k in q for k in ['보일오버','Boil over']):
   return note+f"보일오버는 중질유 탱크화재에서 열파가 하부 수층에 도달해 물이 급격히 기화하면서 연소유를 탱크 밖으로 분출시키는 현상입니다. 외부에서 물이 들어가 넘치는 슬롭오버와 구별해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['슬롭오버','Slop over']):
   return note+f"슬롭오버는 연소 중인 유류 표면에 물이나 포가 유입되어 수분이 급격히 기화하면서 유류가 넘치거나 비산하는 현상입니다. 탱크 바닥 수층이 원인이 되는 보일오버와 구분하면 {concl(a,corr)}"
  if any(k in q for k in ['BLEVE','블레비']):
   return note+f"BLEVE는 가압된 액화가스 용기가 외부 가열 등으로 파열되면서 과열액체가 순간적으로 기화·팽창하는 물리적 폭발입니다. 가연성 물질이면 파이어볼과 강한 복사열이 동반될 수 있습니다. {concl(a,corr)}"
  if any(k in q for k in ['폭굉','폭연','DDT','유도거리']):
   return note+f"폭연은 화염전파속도가 음속보다 낮고, 폭굉은 충격파를 동반하며 미반응 매질의 음속보다 빠르게 전파됩니다. 초기압력·점화에너지·관경·혼합기의 반응성은 폭굉 전이거리에 영향을 줍니다. {concl(a,corr)}"
  if any(k in q for k in ['냉각소화','질식소화','제거소화','억제소화','소화방법','소화원리']):
   return note+f"소화의 네 원리는 냉각(열 제거), 질식(산소농도 저하), 제거(가연물 제거), 억제(연쇄반응 차단)입니다. 물·불활성가스·가연물 차단·할로겐계 약제를 각각 어떤 원리에 대응하는지 보면 {concl(a,corr)}"
  if any(k in q for k in ['복사','스테판','열유속','열전달']):
   return note+f"화재 열전달은 전도·대류·복사로 구분합니다. 복사열은 스테판-볼츠만 법칙에 따라 절대온도의 4제곱에 크게 좌우되고, 전도는 두께에 반비례하며 대류는 유체의 이동을 통해 전달됩니다. {concl(a,corr)}"
  if any(k in q for k in ['피난','Fail safe','Fool proof','귀소본능','추종본능','지광본능','좌회본능']):
   return note+f"피난계획은 경로의 단순·명료성, 2방향 피난, 안전구획과 인간행동 특성을 함께 고려합니다. Fail-safe는 한 수단이 실패해도 다른 수단으로 안전을 확보하고, Fool-proof는 사용자의 실수 가능성을 구조적으로 줄이는 설계원칙입니다. {concl(a,corr)}"
  if any(k in q for k in ['내화구조','방화구획','방화구조','피난안전구역','건축물']):
   return note+f"건축방재 문제는 화재확대 억제와 피난시간 확보가 목적입니다. 내화구조·방화구획·피난안전구역·개구부 기준은 대상 건축물과 해당 회차의 법령 조건을 정확히 대조해야 합니다. {concl(a,corr)}"
  return note+f"소방안전관리론은 연소·폭발·소화원리, 화재성상, 건축방재와 피난을 종합해서 판단하는 과목입니다. 문제의 현상 정의와 조건을 먼저 분리한 뒤 원리와 대응시키면 ‘{sc(corr)}’이 가장 적절합니다. {concl(a,corr)}"

 # 2. 수리/약제/전기
 if subject=='소방수리학·약제화학 및 소방전기':
  if any(k in q for k in ['연속방정식','유량','유속']) and any(k in q for k in ['관','배관','직경','지름','단면']):
   return note+f"관로 유동의 기본은 연속방정식 Q=AV입니다. 원형관은 A=πD²/4이므로 같은 유량에서 관경이 작아질수록 유속이 커집니다. 질량유량이 주어지면 밀도로 나눠 체적유량으로 바꾸고 계산합니다. {concl(a,corr)}"
  if any(k in q for k in ['베르누이','수두','압력','피토관']) and any(k in q for k in ['유체','관','유속','펌프']):
   return note+f"베르누이 방정식은 압력수두 P/γ, 속도수두 V²/2g, 위치수두 z의 에너지 관계를 나타냅니다. 실제 배관에서는 마찰·국부손실수두와 펌프가 더해주는 수두를 함께 반영합니다. {concl(a,corr)}"
  if any(k in q for k in ['마찰손실','손실수두','Darcy','다르시','Hazen','하젠']):
   return note+f"배관 손실은 Darcy-Weisbach 또는 문제에서 지정한 Hazen-Williams 관계를 사용합니다. Darcy 식에서는 h_f=f(L/D)V²/(2g)로 길이와 속도제곱에 비례하며 관경 증가 시 손실이 크게 줄어듭니다. {concl(a,corr)}"
  if any(k in q for k in ['펌프','NPSH','축동력','수동력','양정','캐비테이션']):
   return note+f"펌프 문제는 전양정, 유량, 효율을 이용해 수동력 ρgQH와 축동력 P=ρgQH/η를 구합니다. NPSH가 부족하면 캐비테이션이 생기므로 흡입조건과 증기압·손실수두를 함께 확인해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['점성','레이놀즈','Reynolds','층류','난류']):
   return note+f"레이놀즈수 Re=ρVD/μ=VD/ν는 관성력과 점성력의 비입니다. 값이 작으면 층류, 커지면 난류 경향이 강해지며, 점성계수·유속·관경의 변화가 유동상태와 손실에 미치는 영향을 함께 봅니다. {concl(a,corr)}"
  if any(k in q for k in ['표면장력','모세관']):
   return note+f"모세관 현상은 표면장력과 접촉각 때문에 발생합니다. 평행판이나 관의 치수, 액체의 비중량과 표면장력을 이용해 상승·하강 높이를 구하며, 관경 또는 간격이 작을수록 효과가 커집니다. {concl(a,corr)}"
  if any(k in q for k in ['이산화탄소','CO2']) and any(k in q for k in ['mol','몰','체적','부피','질량','기체']):
   return note+f"기체상태량 계산은 이상기체식 PV=nRT와 몰수 n=m/M을 기본으로 합니다. 온도는 K, 압력은 절대압력으로 넣고 표준상태라면 몰부피를 직접 이용할 수 있습니다. {concl(a,corr)}"
  if any(k in q for k in ['분말소화약제','제1종','제2종','제3종','제4종']):
   return note+f"분말소화약제는 주성분과 적응화재를 연결해 기억해야 합니다. 제1종 NaHCO₃, 제2종 KHCO₃, 제3종 NH₄H₂PO₄(ABC급), 제4종은 탄산수소칼륨·요소계가 대표적입니다. {concl(a,corr)}"
  if any(k in q for k in ['포소화약제','포소화','팽창비','혼합비']):
   return note+f"포소화는 포수용액을 공기와 혼합해 생성한 포로 유류표면을 덮어 질식·냉각하는 방식입니다. 원액농도, 수용액량, 팽창비와 최종 포체적의 관계를 정확히 구분해 계산하면 {concl(a,corr)}"
  if any(k in q for k in ['할론','할로겐','청정소화','GWP','ODP','NOAEL','LOAEL']):
   return note+f"가스계 소화약제는 소화농도뿐 아니라 인체안전성과 환경영향 지표를 함께 봅니다. ODP는 오존층 파괴잠재력, GWP는 지구온난화잠재력, NOAEL/LOAEL은 인체영향 농도 판단에 사용됩니다. {concl(a,corr)}"
  if any(k in q for k in ['옴의 법칙','저항','직렬','병렬','전류','전압']) and any(k in q for k in ['회로','Ω','V','A']):
   return note+f"직류회로는 옴의 법칙 V=IR을 기본으로 합니다. 직렬회로는 전류가 같고 저항이 합산되며, 병렬회로는 전압이 같고 합성저항의 역수가 각 저항 역수의 합이 됩니다. {concl(a,corr)}"
  if any(k in q for k in ['교류','역률','유효전력','무효전력','피상전력','3상','삼상','전동기']):
   return note+f"교류전력은 단상 P=VIcosφ, 3상 P=√3VIcosφ를 기본으로 하고 효율이 주어지면 입력·출력전력을 구분합니다. 역률은 유효전력/피상전력의 비이므로 위상관계까지 함께 확인합니다. {concl(a,corr)}"
  if any(k in q for k in ['변압기','권수','2차','1차']):
   return note+f"이상변압기는 전압비가 권수비와 같아 V₁/V₂=N₁/N₂가 성립하고 전류비는 그 역관계입니다. 제시된 1·2차 권수와 전압을 같은 방향의 비로 놓으면 {concl(a,corr)}"
  if any(k in q for k in ['논리회로','논리식','AND','OR','NAND','NOR','부울']):
   return note+f"논리회로는 입력 조합에 대한 출력 진리표를 먼저 확인하면 오류가 줄어듭니다. AND·OR·NOT의 기본관계와 드모르간 법칙을 이용해 회로 또는 논리식을 간소화하면 {concl(a,corr)}"
  return note+f"이 과목은 유체의 에너지·배관·펌프, 소화약제의 물성·반응, 전기회로 원리를 함께 다룹니다. 단위와 주어진 조건을 먼저 정리하고 해당 기본식 또는 물성원리에 적용하면 ‘{sc(corr)}’이 맞습니다. {concl(a,corr)}"

 # 3. 법령
 if subject=='소방관련법령':
  hist='이 문항은 출제 회차 당시의 소방 관계 법령을 기준으로 학습해야 합니다. '
  if any(k in q for k in ['소방시설관리사','소방시설관리업','자체점검','점검']):
   return note+hist+f"관리사·관리업 관련 문제는 자격·등록, 자체점검 주체와 보고·조치의무, 장비·기술인력 기준을 구분하는 것이 핵심입니다. 문항의 주체와 행위를 당시 법령의 요건에 대조하면 {concl(a,corr)}"
  if any(k in q for k in ['소방시설공사업법','감리','설계업','공사업','완공검사']):
   return note+hist+f"소방시설공사업법 영역은 설계·시공·감리의 업무범위와 등록·완공검사 절차를 구분해야 합니다. 누가 어떤 서류를 제출하고 어떤 기관이 확인하는지 주체를 나누어 보면 {concl(a,corr)}"
  if any(k in q for k in ['소방기본법','소방청장','소방본부장','소방서장','시·도지사','시장','군수']):
   return note+hist+f"소방기본법 문제는 권한주체와 소방활동·소방용수·화재경계·지원활동의 범위를 구분해야 합니다. 문항의 행위가 누구의 법정 권한인지 확인하면 {concl(a,corr)}"
  if any(k in q for k in ['벌금','과태료','징역','취소','영업정지','행정처분']):
   return note+hist+f"벌칙·행정처분은 위반행위의 유형과 제재수준을 정확히 대응해야 합니다. 숫자는 개정될 수 있으므로 이 회차의 법령을 기준으로 보되, 현재 실무 적용 때는 최신 조문을 다시 확인해야 합니다. {concl(a,corr)}"
  return note+hist+f"법규형 문제는 대상물·행위·의무주체·기한·수치·예외를 각각 분리해서 판단하는 것이 가장 안전합니다. 제시된 조건을 당시 적용 법령과 대응하면 ‘{sc(corr)}’이 맞습니다. {concl(a,corr)}"

 # 4. 위험물
 if subject=='위험물의 성상 및 시설기준':
  if any(k in q for k in ['제1류','제2류','제3류','제4류','제5류','제6류']):
   return note+f"위험물은 제1류 산화성 고체, 제2류 가연성 고체, 제3류 자연발화성·금수성, 제4류 인화성 액체, 제5류 자기반응성, 제6류 산화성 액체로 구분합니다. 품명·성질·소화방법·금수성 여부를 함께 연결하면 {concl(a,corr)}"
  if '지정수량' in q or '위험등급' in q:
   return note+f"지정수량은 위험물의 종류별 규제 기준량이며 위험등급·저장취급 기준과 연결됩니다. 수치문제는 물질의 정확한 품명과 류를 먼저 확정하고 해당 회차 법령의 지정수량을 적용하면 {concl(a,corr)}"
  if any(k in q for k in ['제조소','저장소','취급소','주유취급소','옥내저장소','옥외탱크','이동탱크']):
   return note+f"제조소등 시설기준 문제는 보유공지, 건축구조, 배관·탱크, 표지·게시판, 안전거리·방유제 등 시설별 고유기준을 구분해야 합니다. 시설종류를 먼저 확정해 당시 기준을 적용하면 {concl(a,corr)}"
  if any(k in q for k in ['황린','칼륨','나트륨','알킬알루미늄','알킬리튬','탄화칼슘']):
   return note+f"금수성·자연발화성 물질은 물 또는 공기와의 반응성 때문에 저장·소화방법 선택이 중요합니다. 물과 접촉해 가연성가스나 열을 발생하는지, 공기 중 자연발화성이 있는지 확인하면 {concl(a,corr)}"
  if any(k in q for k in ['질산','과산화수소','과염소산','산화성']):
   return note+f"산화성 위험물은 자체가연성보다 다른 물질의 연소를 강하게 촉진하는 성질이 핵심입니다. 산화성 액체·고체의 분류와 혼촉위험, 저장용기 재질 및 소화상 주의점을 구분하면 {concl(a,corr)}"
  return note+f"이 과목은 위험물의 류별 성상과 반응위험, 지정수량, 제조소등의 위치·구조·설비기준을 함께 묻습니다. 물질의 분류를 먼저 확정하고 시설기준과 연결하면 ‘{sc(corr)}’이 적절합니다. {concl(a,corr)}"

 # 5. 소방시설 구조원리
 hist='기술기준·수치가 포함된 문항은 출제 회차 당시의 기준을 적용합니다. '
 if '스프링클러' in q:
  return note+hist+f"스프링클러설비는 수원·가압송수장치·배관·유수검지장치·헤드·기동장치의 연계를 봅니다. 헤드 설치조건, 방수량·방수압, 수원량과 배관기준을 대상물 조건에 맞춰 적용하면 {concl(a,corr)}"
 if '옥내소화전' in q:
  return note+hist+f"옥내소화전설비는 수원, 펌프, 배관, 소화전함·호스·노즐로 구성됩니다. 동시사용 개수에 따른 수원량과 방수압·방수량, 기동·정지방식과 배관기준을 구분하면 {concl(a,corr)}"
 if '옥외소화전' in q:
  return note+hist+f"옥외소화전설비는 외부 소방활동을 위한 수원·가압송수장치·배관·소화전으로 구성됩니다. 설치개수, 수평거리, 방수량·수원량을 대상물 규모와 연결하면 {concl(a,corr)}"
 if '포소화' in q or '프로포셔너' in q:
  return note+hist+f"포소화설비는 물과 포원액을 정해진 농도로 혼합해 포를 만들고 유류표면을 덮어 질식·냉각합니다. 포방출방식과 혼합장치의 원리, 방사량·팽창비 기준을 구분하면 {concl(a,corr)}"
 if '이산화탄소' in q and '소화설비' in q:
  return note+hist+f"이산화탄소소화설비는 전역·국소방출 방식, 저장용기와 선택밸브·기동장치, 방호구역 안전조치를 함께 봐야 합니다. 인명안전 대책과 약제량 산정조건을 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['할론소화','할로겐화합물','불활성기체 소화설비']):
  return note+hist+f"가스계 소화설비는 저장용기, 선택밸브, 배관·분사헤드, 기동장치와 방출 전 안전조치가 핵심입니다. 약제별 설계농도·저장방식과 방호구역 조건을 대조하면 {concl(a,corr)}"
 if '분말소화설비' in q:
  return note+hist+f"분말소화설비는 저장용기와 가압·축압가스, 배관, 선택밸브·분사헤드로 구성됩니다. 분말 종류별 성질과 충전·방사조건, 배관 잔류 방지 기준을 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['자동화재탐지','감지기','수신기','발신기']):
  return note+hist+f"자동화재탐지설비는 감지기-발신기-수신기-음향장치의 신호 흐름과 경계구역, 배선·비상전원 기준을 함께 판단합니다. 감지기 종류별 적응장소와 설치높이 조건을 확인하면 {concl(a,corr)}"
 if '비상방송' in q:
  return note+hist+f"비상방송설비는 화재 시 필요한 층에 명확한 음성경보를 전달하도록 증폭기·조작부·확성기·배선·비상전원을 구성합니다. 우선경보 방식과 배선의 단락·단선 대비 조건을 구분하면 {concl(a,corr)}"
 if any(k in q for k in ['유도등','유도표지','피난기구','완강기','구조대']):
  return note+hist+f"피난설비는 용도·층·수용인원에 따른 설치대상과 위치, 비상전원·표시면, 조작공간을 함께 봅니다. 피난기구 종류와 유도등 설치조건을 대상물에 맞춰 적용하면 {concl(a,corr)}"
 if '제연' in q:
  return note+hist+f"제연설비는 연기확산을 억제해 피난과 소방활동의 청정공간을 확보합니다. 제연구역, 배출·급기량, 차압·방연풍속, 풍도·댐퍼·송풍기 설치조건을 함께 확인하면 {concl(a,corr)}"
 if any(k in q for k in ['연결송수관','연결살수','비상콘센트','무선통신보조']):
  return note+hist+f"소방활동설비는 소방대의 진압활동을 지원하는 설비입니다. 송수구·방수구·헤드·콘센트·통신구성품의 위치, 배관·배선 및 설치대상 기준을 각각 구분하면 {concl(a,corr)}"
 if '내진' in q or '버팀대' in q:
  return note+hist+f"소방시설 내진설계는 배관·기기·수조 등이 지진 시 이탈하거나 파손되지 않도록 지진분리이음, 버팀대, 고정장치 등을 적용합니다. 횡·종방향 버팀대와 설치간격·하중 기준을 구분하면 {concl(a,corr)}"
 return note+hist+f"소방시설의 구조원리는 각 설비의 구성요소, 작동순서, 설치·성능기준을 실제 대상물 조건에 적용하는 과목입니다. 설비 종류를 먼저 확정하고 수원·배관·기동·경보·제어 요소를 연결하면 ‘{sc(corr)}’이 맞습니다. {concl(a,corr)}"

def main():
 pdfs=sorted(PDF_ROOT.glob('소방시설관리사20*.pdf'))
 if len(pdfs)!=16: print(f'WARNING: expected 16 PDFs, got {len(pdfs)}')
 resume=os.environ.get('RESUME')=='1'
 if not resume:
  for p in DATA_DIR.glob('소방시설관리사 *.json'): p.unlink()
  if ASSET_ROOT.exists(): shutil.rmtree(ASSET_ROOT)
 ASSET_ROOT.mkdir(parents=True,exist_ok=True)
 summary=[]
 for pdf in pdfs:
  date,y,mo,day=date_from_name(pdf)
  existing=DATA_DIR/f'소방시설관리사 {date}.json'
  if resume and existing.exists():
   d=json.loads(existing.read_text(encoding='utf-8')); summary.append((date,len(d.get('questions',[])),'existing','existing')); print('SKIP existing',existing.name); continue
  qrec,count=extract_ordered(pdf)
  if count!=125: raise ValueError(f'{pdf.name}: parsed {count}')
  answers=extract_answers(pdf); questions=[]; mismatch=[]; passages=0; placeholders=0
  for no in range(1,126):
   raw=' '.join(qrec[no]['body']); raw_note=bool(PLATFORM_TRIGGER.search(raw))
   q,choices=parse_question(no,qrec[no]['body']); a=answers[no-1]; ma=marker_answer(qrec[no]['body'])
   if ma is not None and ma!=a: mismatch.append((no,ma,a))
   clips=graphic_clips(pdf,qrec[no]['regions']); passobj=None
   if clips:
    saved=save_graphics(pdf,date,no,clips,choices,qrec[no]['regions'])
    if saved:
     out,w,h,label_images,mapped=saved; href=str(out.relative_to(ROOT)).replace('\\','/')
     passobj=[{'type':'svg','alt':f'{no}번 문제 제시자료','content':f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{href}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>"}]
     passages+=1
     if label_images:
      choices=[f'그림 선택지 {i}' if c=='그림 선택지' else c for i,c in enumerate(choices,1)]
   placeholders+=sum(1 for c in choices if c.startswith('그림 선택지'))
   item={'no':no,'subject':subject_for(no),'question':q,'choices':choices,'answer':a,
         'explanation':explain(q,choices,a,subject_for(no),raw_note)}
   if passobj:item['passage']=passobj
   questions.append(item)
  if mismatch: raise ValueError(f'{pdf.name}: body/final answer mismatches {mismatch[:12]} count={len(mismatch)}')
  data={'examId':date,'title':f'소방시설관리사 1차 필기 {y}년 {mo}월 {day}일','duration':125,'passingScore':60,'subjects':SUBJECTS,'questions':questions}
  out=DATA_DIR/f'소방시설관리사 {date}.json'; out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  summary.append((date,len(questions),passages,placeholders)); print(pdf.name,'=>',out.name,'questions',len(questions),'passages',passages,'placeholder_choices',placeholders)
 idxp=DATA_DIR/'index.json'; idx=json.loads(idxp.read_text(encoding='utf-8'))
 idx=[x for x in idx if '소방시설관리사' not in (str(x.get('id',''))+' '+str(x.get('title','')))]
 for pdf in pdfs:
  date,y,mo,day=date_from_name(pdf)
  idx.append({'id':f'소방시설관리사 {date}','title':'소방시설관리사 1차 필기','date':f'{y}년 {mo}월 {day}일','questions':125,'duration':125,'subjects':[s['name'] for s in SUBJECTS]})
 idxp.write_text(json.dumps(idx,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('index total',len(idx),'summary',summary)

if __name__=='__main__': main()
