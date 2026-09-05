#!/usr/bin/env python3
import fitz, json, re, subprocess, shutil, math, difflib
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATA_DIR=ROOT/'data'
ASSET_ROOT=ROOT/'assets'/'cbt'/'fire-mechanical'
PDF_ROOT=Path('/mnt/data')
SUBJECTS=[
 {'name':'소방원론','range':[1,20]},
 {'name':'소방유체역학','range':[21,40]},
 {'name':'소방관계법규','range':[41,60]},
 {'name':'소방기계시설의 구조 및 원리','range':[61,80]},
]
CIRCLE_TO_NUM={'①':1,'②':2,'③':3,'④':4,'❶':1,'❷':2,'❸':3,'❹':4}
NORMAL_CIRCLE={1:'①',2:'②',3:'③',4:'④'}
VISUAL_RE=re.compile(r'(다음\s*(그림|도표|표|식|계통도|도면)|그림은|그림과|그림에서|그림의|표와\s*같|표를\s*참고|구조식|아래\s*(그림|표|식)|다음과\s*같은|배관.*그림|수조.*그림|U\s*자형|오리피스|피토|노즐.*그림|속도분포|유선|유량\s*Q|㉠|㉡|ⓐ|ⓑ)')
BOILER=(
 '전자문제집 CBT 홈페이지','기출문제 및 해설집 다운로드','전자문제집 CBT 앱','전자문제집 CBT란?',
 '종이 문제집이 아닌','인터넷으로 종이 없이','오답 및 오탈자가 수정된','최강 자격증 기출문제 전자문제집 CBT',
 '기출문제 해설은 최강 자격증','본 해설집은 최강 자격증','해설을 제공해 주신 모든 분들께 감사'
)
try: FONT=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',30)
except Exception: FONT=ImageFont.load_default()

def date_from_name(p):
 m=re.search(r'(20\d{2})(\d{2})(\d{2})',p.name)
 if not m: raise ValueError(p.name)
 y,mo,d=m.groups(); return f'{y}-{mo}-{d}',int(y),int(mo),int(d)
def subject_for(n): return next(s['name'] for s in SUBJECTS if s['range'][0]<=n<=s['range'][1])
def clean_line(s): return re.sub(r'\s+',' ',s.replace('\u00a0',' ').replace('\ufeff',' ')).strip()
def skip_line(t):
 return (not t or any(k in t for k in BOILER) or bool(re.search(r'^\s*\d과목\s*:',t)) or
         ('소방설비기사' in t and '필기 기출문제' in t) or t.startswith('본 해설집은') or t.startswith('해설을 제공해 주신'))

def extract_ordered(pdf):
 doc=fitz.open(pdf)
 qrec={i:{'body':[],'expl':[],'regions':defaultdict(lambda:[1e9,-1e9])} for i in range(1,81)}
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
    if y0<48 or y1>page.rect.height-14: continue
    colors=[sp.get('color',0) for sp in spans if sp.get('text','').strip()]
    color=colors[0] if colors else 0
    col=0 if (x0+x1)/2<mid else 1
    lines.append((col,y0,x0,y1,txt,color))
  for col in (0,1):
   for _,y0,x0,y1,txt,color in sorted((z for z in lines if z[0]==col),key=lambda z:(z[1],z[2])):
    if current==80 and any(k in txt for k in BOILER[:4]): stop=True; break
    if skip_line(txt): continue
    m=re.match(r'^(\d{1,2})\.\s*(.*)',txt); black=color==0
    if m and black and int(m.group(1))==expected:
     current=expected; expected+=1
     qrec[current]['body'].append(f'{current}. {m.group(2)}'.strip())
     qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0)
     qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1)
     continue
    if current is None: continue
    # final answer table should never leak into question 80
    if current==80 and re.fullmatch(r'(?:\d{1,2}\s+){4,}\d{1,2}',txt): continue
    if current==80 and len(re.findall(r'[①②③④]',txt))>=5: continue
    key=(pno,col)
    if color==255 or txt.startswith('<문제 해설>') or txt.startswith('[해설') or txt.startswith('[관리자') or txt.startswith('[오류') or txt.startswith('[추가'):
     qrec[current]['expl'].append(txt)
    elif black:
     qrec[current]['body'].append(txt)
     qrec[current]['regions'][key][0]=min(qrec[current]['regions'][key][0],y0)
     qrec[current]['regions'][key][1]=max(qrec[current]['regions'][key][1],y1)
   if stop: break
 doc.close(); return qrec,expected-1

def extract_answers(pdf):
 text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-'],text=True,encoding='utf-8',errors='replace')
 ans=[]
 for line in text.splitlines()[-420:]:
  toks=re.findall(r'[①②③④]',line)
  if len(toks)>=10: ans.extend(CIRCLE_TO_NUM[t] for t in toks[-10:])
 if len(ans)>80: ans=ans[-80:]
 if len(ans)!=80: raise ValueError(f'{pdf.name}: 정답 {len(ans)}개')
 return ans

def join_text(lines):
 t=' '.join(clean_line(x) for x in lines if clean_line(x)); t=re.sub(r'\s+',' ',t).strip().replace('ㆍ','·')
 t=re.sub(r'\s+([,.:;?%)])',r'\1',t)
 return t

def clean_platform_note(q):
 # Remove CBT-site instructions while preserving the historical exam wording.
 q=re.sub(r'\(관련\s*규정\s*개정전\s*문제로\s*여기서는.*?해설을\s*참고하세요\.?\)','',q,flags=re.I)
 q=re.sub(r'\(관련\s*규정\s*개정전\s*문제.*?정답\s*처리.*?\)','',q,flags=re.I)
 q=q.replace('※ 문제의 정답은 시행 당시 기준입니다.','')
 return re.sub(r'\s+',' ',q).strip()

def parse_question(no,body):
 raw=re.sub(rf'^{no}\.\s*','',join_text(body)); ms=list(re.finditer(r'[①②③④❶❷❸❹]',raw))
 if len(ms)>=4:
  q=clean_platform_note(raw[:ms[0].start()].strip())
  ch=[raw[ms[i].end():(ms[i+1].start() if i<3 else len(raw))].strip() for i in range(4)]
 else:
  q=clean_platform_note(raw.strip()); ch=[]
 while len(ch)<4: ch.append('그림 선택지')
 ch=[('그림 선택지' if not c or c in {'-','·'} else clean_platform_note(c)) for c in ch[:4]]
 return q or f'{no}번 문제',ch

def vdist(r,y0,y1):
 if r.y1<y0:return y0-r.y1
 if r.y0>y1:return r.y0-y1
 return 0

def graphic_clips(pdf,regions,needed):
 doc=fitz.open(pdf); cand=[]; maxdist=60 if needed else 0
 for (pno,col),(y0,y1) in regions.items():
  if y1<=y0 or y0>1e8:continue
  page=doc[pno]; mid=page.rect.width/2; cx0=22 if col==0 else mid+3; cx1=mid-3 if col==0 else page.rect.width-22
  for b in page.get_text('dict').get('blocks',[]):
   if b.get('type')!=1:continue
   r=fitz.Rect(b['bbox']); center=(r.x0+r.x1)/2
   if cx0<=center<=cx1 and r.width>10 and r.height>7:
    dist=vdist(r,y0,y1)
    if dist<=maxdist:cand.append((dist,pno,r))
 if not cand: doc.close(); return []
 mind=min(c[0] for c in cand); chosen=[c for c in cand if c[0]<=max(4,mind+12)]; out=[]
 for _,p,r in sorted(chosen,key=lambda x:(x[1],round(x[2].y0,1),round(x[2].x0,1))):
  if any(p==pp and (r&rr).get_area()>0.8*min(r.get_area(),rr.get_area()) for pp,rr in out):continue
  out.append((p,r))
 doc.close();return out

def _clip_choice_index(doc,pno,r,regions):
 page=doc[pno]; mid=page.rect.width/2; col=0 if (r.x0+r.x1)/2<mid else 1
 rg=regions.get((pno,col)) if regions else None
 if rg and rg[1]>rg[0] and rg[0]<1e8: ymin=min(rg[0],r.y0)-38; ymax=max(rg[1],r.y1)+38
 else: ymin=r.y0-55; ymax=r.y1+55
 markers=[]
 for b in page.get_text('dict').get('blocks',[]):
  for line in b.get('lines',[]):
   for sp in line.get('spans',[]):
    txt=sp.get('text',''); m=re.search(r'[①②③④❶❷❸❹]',txt)
    if not m:continue
    sr=fitz.Rect(sp['bbox']); sc=0 if (sr.x0+sr.x1)/2<mid else 1
    if sc!=col or (sr.y0+sr.y1)/2<ymin or (sr.y0+sr.y1)/2>ymax:continue
    markers.append((CIRCLE_TO_NUM[m.group()],sr))
 if not markers:return None
 cx=(r.x0+r.x1)/2; cy=(r.y0+r.y1)/2; best=None
 for idx,sr in markers:
  sx=(sr.x0+sr.x1)/2; sy=(sr.y0+sr.y1)/2; penalty=0 if sr.x1<=r.x1 else 50
  dist=abs(cx-sx)+1.4*abs(cy-sy)+penalty
  if best is None or dist<best[0]:best=(dist,idx)
 # A diagram belonging to the question can sit above image-only choices.
 # Do not assign a choice number when the nearest printed marker is too far away.
 if not best or best[0] > 150:
  return None
 return best[1]

def save_graphics(pdf,date,no,clips,choices,regions):
 if not clips:return None
 doc=fitz.open(pdf); has_placeholder=any(c=='그림 선택지' for c in choices); mapped=[]
 if has_placeholder:
  for p,r in clips:mapped.append(_clip_choice_index(doc,p,r,regions))
  if all(x in (1,2,3,4) for x in mapped) and len(set(mapped))==len(mapped):
   paired=sorted(zip(mapped,clips),key=lambda z:z[0]); mapped=[x for x,_ in paired]; clips=[c for _,c in paired]
 pieces=[]
 for p,r in clips:
  page=doc[p]; rr=fitz.Rect(max(0,r.x0-3),max(0,r.y0-3),min(page.rect.width,r.x1+3),min(page.rect.height,r.y1+3))
  pix=page.get_pixmap(matrix=fitz.Matrix(2.1,2.1),clip=rr,alpha=False)
  pieces.append(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
 doc.close()
 if not pieces:return None
 label_images=has_placeholder and any(x in (1,2,3,4) for x in mapped); lw=58 if label_images else 0; gap=14
 maxw=max(i.width for i in pieces)+lw; h=sum(i.height for i in pieces)+gap*(len(pieces)-1)
 can=Image.new('RGB',(maxw,h),'white'); y=0; labs={1:'①',2:'②',3:'③',4:'④'}
 for i,im in enumerate(pieces):
  x=lw if label_images else (maxw-im.width)//2
  if label_images:
   lab=mapped[i] if i<len(mapped) and mapped[i] in labs else None
   if lab: ImageDraw.Draw(can).text((5,y+max(0,(im.height-34)//2)),labs[lab],font=FONT,fill='black')
  can.paste(im,(x,y)); y+=im.height+gap
 od=ASSET_ROOT/date; od.mkdir(parents=True,exist_ok=True); out=od/f'q{no:02d}.png'; can.save(out,'PNG',optimize=True)
 return out,can.width,can.height,label_images,set(x for x in mapped if x in (1,2,3,4))

def clean_source(lines):
 parts=[]
 for raw in lines:
  t=clean_line(raw)
  if not t or t=='<문제 해설>':continue
  if t.startswith('[해설작성자'):
   if len(' '.join(parts))>=30:break
   continue
  if t.startswith('[관리자') or t.startswith('[오류') or t.startswith('[추가') or '오류 신고' in t or '오류신고' in t:continue
  t=re.sub(r'\[해설작성자[^\]]*\]','',t); t=t.replace('==>>','→').replace('-->','→').replace('->','→')
  t=re.sub(r'ㅎㅎ+|ㅋㅋ+|ㅠㅠ+','',t); t=re.sub(r'\b(thx|thanks)\b[:)]*','',t,flags=re.I)
  if t:parts.append(t)
  if len(' '.join(parts))>850:break
 return re.sub(r'\s+',' ',' '.join(parts)).strip()[:900]

def professionalize_source(src):
 s=re.sub(r'\s+',' ',src).strip()
 s=re.sub(r'\[해설작성자[^\]]*\]','',s)
 s=re.sub(r'(쉽게\s*(?:생각하면|말하면|외우면|외웁시다)?|그냥|무조건|꼭\s*외우(?:세요|시기\s*바랍니다)?|반드시\s*외우(?:세요|기)?|시험장[^.!?]*|화이팅|가즈아|ㅋㅋ+|ㅎㅎ+)', ' ', s, flags=re.I)
 s=re.sub(r'(?:따라서\s*)?(?:정답|답)은?\s*\d+번[^.!?]*(?:[.!?]|$)', ' ', s)
 s=re.sub(r'!+','.',s); s=s.replace('..','.').replace('됩니다..','됩니다.')
 return re.sub(r'\s+',' ',s).strip(' .')

def norm_q(s):
 s=re.sub(r'\([^)]*\)',' ',s)
 s=re.sub(r'[^0-9A-Za-z가-힣]+','',s).lower()
 return s

def sc(c):
 c=re.sub(r'\s+',' ',c).strip(); return c if len(c)<120 else c[:117]+'...'
def concl(a,c): return f"따라서 {a}번 ‘{sc(c)}’이 정답입니다."

def source_match(q,bank):
 nq=norm_q(q); best=(0,None)
 if len(nq)<12:return None
 for bq,src in bank:
  score=difflib.SequenceMatcher(None,nq,bq).ratio()
  if score>best[0]:best=(score,src)
 return best[1] if best[0]>=0.82 else None

def numbers(q): return [float(x.replace(',','')) for x in re.findall(r'(?<![A-Za-z])([0-9][0-9,]*(?:\.[0-9]+)?)',q)]

def fire_expl(q,ch,a,src,subject,bank):
 corr=ch[a-1]; compact=re.sub(r'\s+','',q); low=q.lower(); source=professionalize_source(src) if src else ''
 matched=source_match(q,bank) if not source else None
 if not source and matched: source=professionalize_source(matched)

 # ---------- 소방원론 / 공통 계산 ----------
 if ('확산속도' in compact or '그레이엄' in compact) and ('분자량' in compact or '할론' in compact):
  vals=numbers(q)
  if len(vals)>=2:
   # Prefer the two molecular weights if present: small (air), large gas.
   mol=[x for x in vals if 10<=x<=300]
   if len(mol)>=2:
    m1,m2=mol[-2],mol[-1]; ratio=math.sqrt(max(m1,m2)/min(m1,m2))
    return f"그레이엄의 법칙에 따르면 기체의 확산속도는 분자량의 제곱근에 반비례합니다. 따라서 두 기체의 확산속도비는 √(M₂/M₁)로 계산하며, 주어진 분자량을 대입하면 약 {ratio:.2f}배입니다. {concl(a,corr)}"
 if ('이산화탄소' in q or 'CO2' in q) and '산소' in q and ('농도' in q or 'vol%' in q):
  m=re.search(r'산소(?:의)?\s*(?:농도)?\s*(?:를|가)?\s*([0-9.]+)\s*(?:vol)?%',q,re.I)
  if m:
   o=float(m.group(1)); c=(21-o)/21*100
   return f"공기 중 산소를 CO₂로 희석한다고 보면, 필요한 CO₂ 농도는 C=(21-O₂)/21×100으로 계산합니다. O₂={o:g}%를 대입하면 C=(21-{o:g})/21×100≈{c:.1f}%입니다. {concl(a,corr)}"
 if '혼합' in q and ('폭발하한' in q or '연소하한' in q):
  # Le Chatelier: Lmix=100 / sum(yi/Li), yi in vol%.
  ps=[float(x) for x in re.findall(r'([0-9.]+)\s*vol\.?%',q,re.I)]
  if len(ps)>=6:
   comps=ps[:3]; limits=ps[-3:]
   denom=sum(y/L for y,L in zip(comps,limits)); Lmix=100/denom
   return f"혼합가스의 폭발하한계는 르샤틀리에 식 L=100/Σ(yᵢ/Lᵢ)을 사용합니다. 각 성분의 체적%와 폭발하한을 대입하면 L≈{Lmix:.2f} vol.%입니다. {concl(a,corr)}"
 if ('복사' in q or '스테판' in q or '열을 방출' in q) and ('온도' in q or '℃' in q):
  vals=numbers(q)
  if len(vals)>=2:
   t1,t2=vals[0],vals[1]
   if -100<t1<1000 and -100<t2<1200:
    ratio=((t2+273.15)/(t1+273.15))**4
    return f"복사열은 스테판-볼츠만 법칙에 따라 절대온도의 4제곱에 비례합니다. 따라서 열방출비는 (({t2:g}+273)/({t1:g}+273))⁴≈{ratio:.2f}배입니다. {concl(a,corr)}"
 if ('기화열' in q or '증발잠열' in q or '융해열' in q) and ('cal' in q or 'kcal' in q):
  return f"상변화 열량은 Q=mL, 온도 변화가 함께 있으면 Q=mcΔT를 각 구간별로 더합니다. 물은 비열과 증발잠열이 커서 많은 열을 흡수하므로 냉각소화 효과가 큽니다. {concl(a,corr)}"
 if ('위험도' in q or '위험도(H)' in q) and ('연소범위' in q or '폭발범위' in q):
  return f"연소범위를 이용한 위험도는 일반적으로 H=(상한계-하한계)/하한계로 비교합니다. 하한계가 낮고 연소범위가 넓을수록 작은 농도에서도 점화될 수 있어 위험도가 커집니다. {concl(a,corr)}"
 if '증기비중' in q and ('분자량' in q or '공기' in q):
  return f"기체의 증기비중은 같은 온도·압력에서 분자량에 비례하므로 ‘기체 분자량/공기 평균분자량(약 29)’으로 계산합니다. 값이 1보다 크면 공기보다 무거워 낮은 곳에 체류하기 쉽습니다. {concl(a,corr)}"
 if any(k in q for k in ['제1종 분말','제2종 분말','제3종 분말','제4종 분말','분말소화약제']):
  return f"분말소화약제는 주성분과 적응화재를 구분해야 합니다. 제1종은 NaHCO₃, 제2종은 KHCO₃, 제3종은 NH₄H₂PO₄(ABC급), 제4종은 KHCO₃와 요소 계열입니다. 문제의 조건과 주성분을 대응하면 됩니다. {concl(a,corr)}"
 if any(k in q for k in ['제1류 위험물','제2류 위험물','제3류 위험물','제4류 위험물','제5류 위험물','제6류 위험물','위험물의 유별']):
  return f"위험물의 류별 성질은 제1류 산화성 고체, 제2류 가연성 고체, 제3류 자연발화성·금수성, 제4류 인화성 액체, 제5류 자기반응성, 제6류 산화성 액체로 구분합니다. {concl(a,corr)}"
 if any(k in q for k in ['냉각소화','질식소화','제거소화','억제소화','소화원리','소화방법']):
  return f"소화의 기본원리는 냉각(열 제거), 질식(산소 공급 차단), 제거(가연물 제거), 억제(연쇄반응 차단)입니다. 불활성가스로 산소농도를 낮추는 것은 질식소화이고, 할로겐계 약제로 자유활성기를 억제하는 것은 억제소화입니다. {concl(a,corr)}"
 if '보일 오버' in q or 'Boil over' in q or '보일오버' in q:
  return f"보일오버는 고비점 유류 탱크 화재에서 열파가 탱크 하부의 물층에 도달해 물이 급격히 비등·팽창하면서 연소유를 탱크 밖으로 분출시키는 현상입니다. 외부 주수로 기름이 넘치는 슬롭오버와 구분합니다. {concl(a,corr)}"
 if '슬롭 오버' in q or 'Slop over' in q or '슬롭오버' in q:
  return f"슬롭오버는 연소 중인 유류 표면에 물이나 포가 유입되어 수분이 급격히 기화하면서 연소유가 탱크 밖으로 넘치거나 비산하는 현상입니다. 탱크 바닥의 물층이 원인이 되는 보일오버와 구분합니다. {concl(a,corr)}"
 if 'BLEVE' in q or '블레비' in q:
  return f"BLEVE는 가압된 액화가스 용기가 외부 가열 등으로 파열되면서 과열 액체가 급격히 기화·팽창하는 폭발현상입니다. 가연성 물질이면 파이어볼과 강한 복사열이 동반될 수 있습니다. {concl(a,corr)}"
 if '플래시 오버' in q or 'Flash over' in q or '플래시오버' in q:
  return f"플래시오버는 실내 화재 성장 과정에서 축적된 열복사로 가연물 표면이 거의 동시에 착화되어 화재실 전체가 급격히 최성기로 전이되는 현상입니다. {concl(a,corr)}"
 if 'Halon 1301' in q or '할론 1301' in q:
  return f"Halon 1301의 화학식은 CF₃Br이며, 할론 번호는 C-F-Cl-Br 원자 수를 순서대로 나타냅니다. 할로겐화합물계는 주로 연쇄반응 억제효과로 소화합니다. {concl(a,corr)}"
 if 'Halon 1211' in q or '할론 1211' in q:
  return f"Halon 1211의 화학식은 CF₂ClBr입니다. 할론 번호는 C-F-Cl-Br의 원자수를 차례대로 나타내므로 1-2-1-1과 대응합니다. {concl(a,corr)}"

 # ---------- 소방유체역학 ----------
 if subject=='소방유체역학':
  if ('유량' in q or '유속' in q) and ('직경' in q or '지름' in q or '단면적' in q):
   return f"연속방정식 Q=AV를 적용합니다. 원형관의 단면적은 A=πD²/4이므로 같은 유량에서는 유속이 직경의 제곱에 반비례합니다. 질량유량이 주어지면 Q=ṁ/ρ로 먼저 체적유량으로 바꿉니다. {concl(a,corr)}"
  if '레이놀즈' in q or 'Reynolds' in q:
   return f"레이놀즈수는 Re=ρVD/μ=VD/ν로, 관성력과 점성력의 비를 나타내는 무차원수입니다. 원관에서는 Re가 작으면 층류, 커지면 난류 경향이 강해집니다. {concl(a,corr)}"
  if any(k in q for k in ['베르누이','압력수두','속도수두','위치수두','피토']):
   return f"정상·비압축성 유동에서는 베르누이식 P/γ+V²/(2g)+z=일정(손실이 있으면 손실수두를 차감)을 사용합니다. 피토관은 정압과 동압의 합인 정체압을 이용해 유속을 구합니다. {concl(a,corr)}"
  if '체적탄성계수' in q:
   return f"체적탄성계수는 K=-ΔP/(ΔV/V)로 정의됩니다. K가 클수록 압력 변화에 대해 체적 변화가 작아 비압축성에 가까운 유체입니다. {concl(a,corr)}"
  if '마찰계수' in q or '동력손실' in q or '손실수두' in q:
   return f"관 마찰 손실은 Darcy-Weisbach 식 h_f=f(L/D)·V²/(2g)을 사용하고, 손실동력은 P=ρgQh_f로 계산합니다. 주어진 유량에서 먼저 V=Q/A를 구하는 것이 핵심입니다. {concl(a,corr)}"
  if '수동력' in q or ('펌프' in q and '동력' in q):
   return f"펌프의 수동력은 P_h=ρgQH입니다. 실제 축동력은 효율 η를 고려해 P=P_h/η로 계산하며, 흡입·토출 압력 차는 수두로 환산하여 전양정 H에 포함합니다. {concl(a,corr)}"
  if '오리피스' in q or ('수조' in q and '유량' in q):
   return f"손실을 무시한 수조의 작은 오리피스 유출속도는 토리첼리식 V=√(2gh), 따라서 유량 Q=AV는 수두 h의 제곱근에 비례합니다. 수두가 절반이면 유량은 1/√2배가 됩니다. {concl(a,corr)}"
  if '전단응력' in q or '속도구배' in q or '점성계수' in q:
   return f"뉴턴 유체의 전단응력은 τ=μ(du/dy)입니다. 속도분포식을 y에 대해 미분하여 벽면 또는 지정 위치의 속도구배를 구한 뒤 점성계수 μ를 곱합니다. {concl(a,corr)}"
  if '압축계수' in q or '압축성인자' in q:
   return f"실제기체의 압축성인자는 Z=PV/(mRT)로 계산합니다. 이상기체이면 Z≈1이며, 1에서 벗어날수록 이상기체 거동과 차이가 큽니다. 압력은 절대압력, 온도는 K로 넣어야 합니다. {concl(a,corr)}"
  if '절대압력' in q or '진공' in q or '게이지압력' in q:
   return f"압력의 기본관계는 절대압력=대기압+게이지압력이며, 진공압은 대기압에서 절대압력을 뺀 값입니다. mmHg가 주어지면 760 mmHg≈101.325 kPa로 환산합니다. {concl(a,corr)}"
  if '운동량' in q or '충돌' in q or ('물제트' in q and '힘' in q):
   return f"제트가 판에 주는 힘은 운동량 방정식 F=ṁ(V_in−V_out)=ρQΔV로 계산합니다. 판이 움직이는 경우에는 판에 대한 상대속도(V−U)를 사용해야 합니다. {concl(a,corr)}"
  if '등엔트로피' in q:
   return f"등엔트로피 과정은 엔트로피가 일정한 과정이며, 이상적으로는 가역 단열과정과 같습니다. 이상기체에서는 PV^k=일정 등의 관계를 적용합니다. {concl(a,corr)}"
  if '푸리에' in q.lower() or 'Fourier' in q or '열전도' in q:
   return f"푸리에의 열전도 법칙은 Q̇=kAΔT/L입니다. 전도 열량은 열전도도 k, 단면적 A, 온도차에 비례하고 전열 두께 L에 반비례합니다. {concl(a,corr)}"
  if '표면장력' in q:
   return f"표면장력은 액체 표면의 단위 길이당 작용하는 힘(N/m)으로, 액체 내부의 응집력 때문에 표면적을 최소화하려는 성질입니다. 온도가 상승하면 일반적으로 표면장력은 감소합니다. {concl(a,corr)}"

 # ---------- 소방관계법규 ----------
 if subject=='소방관계법규':
  hist='해당 회차 출제 당시의 법령 기준을 적용해야 하는 문항입니다. '
  if any(k in q for k in ['몇 m','몇 ㎡','몇 m2','몇 리터','몇 L','며칠','몇 년','몇 회','몇 명','몇 이상','몇 이하','지정수량','과태료','벌금']):
   return f"{hist}법규형 수치문제는 시설·대상·용도와 예외조건을 먼저 확인한 뒤 해당 기준값을 대응합니다. 이 문항의 조건에 해당하는 기준은 ‘{sc(corr)}’입니다. 법령 수치는 개정될 수 있으므로 현재 실무 적용 시 최신 기준과 구분해 학습해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['소방청장','소방본부장','소방서장','시·도지사','시장','군수','구청장','권한','명할 수']):
   return f"{hist}권한 주체를 묻는 문제는 해당 법률에서 신고·허가·명령·감독 권한을 누구에게 부여했는지를 구분해야 합니다. 제시된 업무의 법정 권한 관계에 맞는 선택지는 ‘{sc(corr)}’입니다. {concl(a,corr)}"
  return f"{hist}문제에서 묻는 대상시설·행위·절차를 관련 법령의 적용범위와 대조하면 ‘{sc(corr)}’이 해당합니다. 법규 기출은 시행 당시 기준과 현재 기준이 달라질 수 있으므로 회차 기준으로 정답을 학습하고 최신 법령은 별도로 확인하는 것이 안전합니다. {concl(a,corr)}"

 # ---------- 소방기계시설 ----------
 if subject=='소방기계시설의 구조 및 원리':
  if '스프링클러' in q:
   return f"스프링클러설비는 수원·가압송수장치·배관·유수검지장치·헤드·기동장치의 연계조건을 함께 봅니다. 헤드 수, 배관구경, 방수량·방수압, 설치간격과 장애물 이격기준을 문제의 대상시설 조건에 맞춰 적용합니다. {concl(a,corr)}"
  if '옥내소화전' in q:
   return f"옥내소화전설비는 수원, 가압송수장치, 배관, 소화전함·호스·노즐로 구성됩니다. 동시사용 개수에 따른 수원량과 방수압·방수량, 호스접결구의 설치위치 기준을 구분하는 것이 핵심입니다. {concl(a,corr)}"
  if '옥외소화전' in q:
   return f"옥외소화전설비는 건축물 외부에서 방수할 수 있도록 수원·펌프·배관·소화전을 구성합니다. 설치개수, 수평거리, 방수량과 수원량 기준을 대상물 조건에 맞춰 적용합니다. {concl(a,corr)}"
  if '포소화' in q or '포헤드' in q or '프로포셔너' in q:
   return f"포소화설비는 물과 포원액을 정해진 농도로 혼합하여 형성한 포로 유류 표면을 덮어 질식·냉각합니다. 포방출방식과 혼합장치(펌프·라인·프레져사이드 프로포셔너 등)의 구조 및 적용대상을 구분해야 합니다. {concl(a,corr)}"
  if '이산화탄소소화설비' in q or '이산화탄소 소화설비' in q:
   return f"이산화탄소소화설비는 주로 산소농도를 낮추는 질식효과와 일부 냉각효과를 이용합니다. 전역방출·국소방출 방식, 저장용기 설치장소, 방호구역 안전조치와 약제량 기준을 구분해야 합니다. {concl(a,corr)}"
  if '분말소화설비' in q:
   return f"분말소화설비는 저장용기, 가압·축압용 가스, 배관, 선택밸브·분사헤드 등으로 구성됩니다. 분말 종류별 충전비와 가스량, 배관 내 잔류분말 방지 및 방사성능 기준을 함께 확인합니다. {concl(a,corr)}"
  if '물분무' in q:
   return f"물분무소화설비는 미세한 물방울로 냉각·질식 효과를 높이고 전기설비나 유류화재 등에 적용할 수 있도록 설계합니다. 방수량·방수압, 헤드 배치와 송수구·배관 기준을 대상물에 맞춰 적용합니다. {concl(a,corr)}"
  if '제연' in q:
   return f"제연설비는 화재 시 연기 확산을 억제하고 피난·소방활동을 위한 청정공간을 확보하는 설비입니다. 배출량·급기량, 차압, 유입풍속, 제연구역 구획 및 급·배기구 위치 기준을 함께 판단합니다. {concl(a,corr)}"
  if '연결송수관' in q:
   return f"연결송수관설비는 소방대가 송수구로 물을 공급하여 건물 내부 방수구에서 사용할 수 있게 하는 소방활동설비입니다. 송수구·방수구 위치, 배관 구경, 가압송수장치 설치조건을 구분합니다. {concl(a,corr)}"
  if '소화용수' in q or '채수구' in q or '상수도소화용수' in q:
   return f"소화용수설비는 소방대가 화재진압에 필요한 물을 확보하도록 하는 설비입니다. 저수량과 채수구 수·높이·접근성, 상수도소화전의 수평거리 기준을 대상물 규모에 맞춰 적용합니다. {concl(a,corr)}"
  if '피난' in q or '구조대' in q or '완강기' in q or '사다리' in q:
   return f"피난기구는 설치층·대상물·수용인원과 기구의 구조기준을 함께 봅니다. 완강기·구조대·피난사다리 등은 설치방법과 조작 안전성, 강하공간 확보가 핵심입니다. {concl(a,corr)}"
  if source and len(source)>=35:
   return f"핵심 해설: {source}. {concl(a,corr)}"[:1050]
  return f"이 문항은 {subject}에서 설비의 구성요소와 설치·성능 기준을 구분하는 문제입니다. 제시된 설비의 작동원리와 적용조건을 대조하면 ‘{sc(corr)}’이 맞습니다. {concl(a,corr)}"

 # source explanation from 2022 / near duplicate, if strong enough
 if source and len(source)>=35:
  return f"핵심 해설: {source}. {concl(a,corr)}"[:1050]

 # remaining core concept templates
 if any(k in q for k in ['인화점','발화점','연소범위','폭발범위']):
  return f"인화점은 외부 점화원에 의해 순간 착화가 가능한 최저온도이고, 발화점은 외부 점화원 없이 스스로 연소가 시작되는 최저온도입니다. 연소범위는 가연성가스가 공기 중에서 연소 가능한 농도범위입니다. {concl(a,corr)}"
 if any(k in q for k in ['피난동선','패닉','피난']):
  return f"피난계획은 단순하고 명확한 동선, 2방향 이상의 대체경로, 연기·화염으로부터의 안전구획 확보가 기본입니다. 화재 시에는 평소 사용하던 경로와 최초 행동자를 따라 이동하는 경향도 고려합니다. {concl(a,corr)}"
 if any(k in q for k in ['방화벽','방화구획','내화구조','방화구조']):
  return f"방화구획과 내화·방화구조는 화염과 연기의 확산을 제한해 피난시간을 확보하기 위한 수동적 방화대책입니다. 구조부재의 재료·두께, 개구부 방화문, 구획면적·돌출부 기준을 문제의 회차 조건에 맞춰 판단합니다. {concl(a,corr)}"
 return f"이 문항은 {subject}의 핵심 개념을 실제 조건에 적용하는 문제입니다. 정의·계산식·시설기준을 문제의 조건과 대조하면 ‘{sc(corr)}’이 가장 적절합니다. {concl(a,corr)}"

def marker_answer(body):
 m=re.search(r'[❶❷❸❹]',join_text(body)); return CIRCLE_TO_NUM[m.group()] if m else None

def build_source_bank(pdfs):
 bank=[]
 for pdf in pdfs:
  if '해설집' not in pdf.name: continue
  qrec,count=extract_ordered(pdf)
  if count!=80: continue
  for n in range(1,81):
   q,ch=parse_question(n,qrec[n]['body']); src=clean_source(qrec[n]['expl'])
   if len(src)>=25: bank.append((norm_q(q),src))
 print('source bank',len(bank))
 return bank

def import_one(pdf,bank):
 date,y,mo,d=date_from_name(pdf); qrec,count=extract_ordered(pdf)
 if count!=80: raise ValueError(f'{pdf.name}: 문항 {count}')
 ans=extract_answers(pdf); od=ASSET_ROOT/date
 if od.exists():shutil.rmtree(od)
 qs=[]; stats={'visual':0,'image_only':0,'mismatch':0,'source':0,'matched':0}
 for n in range(1,81):
  rec=qrec[n]; q,ch=parse_question(n,rec['body']); a=ans[n-1]; bm=marker_answer(rec['body']); stats['mismatch']+=int(bm is not None and bm!=a)
  needed=bool(VISUAL_RE.search(q) or any(c=='그림 선택지' for c in ch)); clips=graphic_clips(pdf,rec['regions'],needed); pd=save_graphics(pdf,date,n,clips,ch,rec['regions']) if clips else None
  if pd:
   out,w,h,image_choice,mapped_indices=pd; stats['visual']+=1
   if image_choice:stats['image_only']+=1
   ch=[(f'위 그림 {NORMAL_CIRCLE[i]}' if c=='그림 선택지' and i in mapped_indices else ('위 제시자료의 그림/식' if c=='그림 선택지' else c)) for i,c in enumerate(ch,1)]
  item={'no':n,'subject':subject_for(n),'question':q}
  if pd:
   rel=out.relative_to(ROOT).as_posix(); item['passage']=[{'type':'svg','alt':f'{n}번 문제 제시자료','content':f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{rel}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>"}]
  item['choices']=ch; item['answer']=a
  src=clean_source(rec['expl']); stats['source']+=int(bool(src)); stats['matched']+=int(bool(not src and source_match(q,bank)))
  item['explanation']=fire_expl(q,ch,a,src,subject_for(n),bank)
  qs.append(item)
 out={'examId':date,'title':f'소방설비기사(기계분야) 필기 {y}년 {mo}월 {d}일','duration':120,'passingScore':60,'subjects':SUBJECTS,'questions':qs}
 op=DATA_DIR/f'소방설비기사(기계분야) {date}.json'; op.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return op,stats

def update_index(entries):
 p=DATA_DIR/'index.json'; data=json.loads(p.read_text(encoding='utf-8'))
 data=[x for x in data if '소방설비기사(기계분야)' not in f"{x.get('id','')} {x.get('title','')}"]
 for op in entries:
  d=json.loads(op.read_text(encoding='utf-8')); y,mo,day=map(int,d['examId'].split('-'))
  data.append({'id':f"소방설비기사(기계분야) {d['examId']}",'title':'소방설비기사(기계분야) 필기','date':f'{y}년 {mo}월 {day}일','questions':80,'duration':120,'subjects':[s['name'] for s in SUBJECTS]})
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
 pdfs=sorted(PDF_ROOT.glob('소방설비기사(기계분야)*.pdf'))
 if not pdfs: raise SystemExit('no fire mechanical PDFs')
 bank=build_source_bank(pdfs); entries=[]
 if ASSET_ROOT.exists():shutil.rmtree(ASSET_ROOT)
 for p in pdfs:
  op,st=import_one(p,bank); entries.append(op); print('OK',p.name,st)
 update_index(entries); print('fire mechanical complete',len(entries))
if __name__=='__main__':main()
