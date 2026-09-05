#!/usr/bin/env python3
import fitz, json, re, subprocess, shutil, math, difflib
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATA_DIR=ROOT/'data'
ASSET_ROOT=ROOT/'assets'/'cbt'/'fire-electrical'
PDF_ROOT=Path('/mnt/data')
SUBJECTS=[
 {'name':'소방원론','range':[1,20]},
 {'name':'소방전기회로','range':[21,40]},
 {'name':'소방관계법규','range':[41,60]},
 {'name':'소방전기시설의 구조 및 원리','range':[61,80]},
]
CIRCLE_TO_NUM={'①':1,'②':2,'③':3,'④':4,'❶':1,'❷':2,'❸':3,'❹':4}
NORMAL_CIRCLE={1:'①',2:'②',3:'③',4:'④'}
VISUAL_RE=re.compile(r'(다음\s*(그림|도표|표|식|계통도|도면)|그림은|그림과|그림에서|그림의|표와\s*같|표를\s*참고|구조식|아래\s*(그림|표|식)|다음과\s*같은|배관.*그림|수조.*그림|U\s*자형|오리피스|피토|노즐.*그림|속도분포|유선|유량\s*Q|㉠|㉡|ⓐ|ⓑ|회로|논리식|블록선도|시퀀스|전달함수|파형|배선|결선|자계|전압계|전류계|다이오드|트랜지스터)')
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
 # Remove source-site answer guidance / grading notices from the problem stem.
 q=re.sub(r'\((?=[^)]*(?:관련\s*규정\s*개정|문제\s*오류|가답안|확정답안|실제\s*시험|여기서는|누르면\s*정답|정답\s*처리))[^)]*\)','',q,flags=re.I)
 q=re.sub(r'(?:관련\s*규정\s*개정전\s*문제로?|문제\s*오류로?)[^?。]*?(?:해설을\s*참고하세요\.?|정답\s*처리(?:됩니다|되었습니다|되었음)\.?|$)','',q,flags=re.I)
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
  if len(clips)==4:
   # Four isolated formula/diagram choices are already in page reading order (top-left to bottom-right).
   mapped=[1,2,3,4]
  elif all(x in (1,2,3,4) for x in mapped) and len(set(mapped))==len(mapped):
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

 # ---------- 소방전기회로 ----------
 if subject=='소방전기회로':
  if ('공진' in q or '공진주파수' in q) and any(k in q for k in ['L','C','RLC','LC']):
   return f"LC 또는 RLC 회로의 공진은 유도성 리액턴스 X_L=2πfL과 용량성 리액턴스 X_C=1/(2πfC)가 같아지는 조건입니다. 따라서 공진주파수는 f₀=1/(2π√(LC))이며, 직렬공진에서는 임피던스가 최소가 되어 전류가 최대가 됩니다. {concl(a,corr)}"
  if '리액턴스' in q and ('인덕턴스' in q or '코일' in q):
   return f"코일의 유도성 리액턴스는 X_L=2πfL입니다. 주파수 f 또는 인덕턴스 L이 커질수록 교류에 대한 방해가 커집니다. 문제에 주어진 f와 L의 단위를 Hz, H로 맞춘 뒤 계산합니다. {concl(a,corr)}"
  if '리액턴스' in q and ('콘덴서' in q or '정전용량' in q):
   return f"콘덴서의 용량성 리액턴스는 X_C=1/(2πfC)입니다. 주파수와 정전용량이 커질수록 X_C는 작아집니다. C가 μF라면 F로 환산해 계산해야 합니다. {concl(a,corr)}"
  if ('합성저항' in q or '저항' in q) and ('직렬' in q or '병렬' in q):
   return f"저항의 직렬합성은 R=R₁+R₂+…이고, 병렬합성은 1/R=1/R₁+1/R₂+…입니다. 같은 전압이 병렬에 걸리고 같은 전류가 직렬에 흐른다는 점을 이용해 회로를 단계적으로 단순화합니다. {concl(a,corr)}"
  if '저항률' in q or ('도선' in q and '길이' in q and '단면적' in q):
   return f"도선 저항은 R=ρL/A입니다. 재질이 같아 ρ가 일정하면 저항은 길이 L에 비례하고 단면적 A에 반비례합니다. 지름이 주어지면 A=πd²/4로 바꾸어 계산합니다. {concl(a,corr)}"
  if ('전력' in q or '소비전력' in q) and any(k in q for k in ['전압','전류','역률','복소전력','VA']):
   return f"교류의 유효전력은 P=VIcosφ, 무효전력은 Q=VIsinφ, 복소전력은 S=P+jQ이며 |S|=VI입니다. 저항·리액턴스가 주어지면 S=I²(R+jX)로도 계산할 수 있습니다. {concl(a,corr)}"
  if '변압기' in q and any(k in q for k in ['철손','동손','효율','손실']):
   return f"변압기의 철손은 부하와 거의 무관한 일정손으로 보고, 동손은 전류의 제곱에 비례해 부하율 x에서 x²P_cu로 계산합니다. 전체 손실은 철손+동손이며, 시간별 부하가 다르면 각 구간의 손실전력×시간을 합산합니다. {concl(a,corr)}"
  if '변압기' in q and any(k in q for k in ['권수','전압비','전류비']):
   return f"이상 변압기에서는 V₁/V₂=N₁/N₂=I₂/I₁입니다. 전압은 권수에 비례하고 전류는 권수에 반비례하므로, 주어진 1·2차 권수와 전압·전류를 같은 비례식에 대입합니다. {concl(a,corr)}"
  if ('전압계' in q or '전류계' in q) and any(k in q for k in ['배율기','분류기','측정범위']):
   return f"전압계의 측정범위 확대에는 큰 저항의 배율기를 직렬로, 전류계의 측정범위 확대에는 작은 저항의 분류기를 병렬로 접속합니다. 계기 내부저항과 최대지시전류를 이용해 전압·전류 분담 조건을 세웁니다. {concl(a,corr)}"
  if '정전용량' in q or ('콘덴서' in q and any(k in q for k in ['전하','용량','병렬','직렬'])):
   return f"콘덴서는 Q=CV를 사용합니다. 병렬에서는 C=C₁+C₂+…이고 각 콘덴서 양단 전압이 같으며, 직렬에서는 1/C=Σ(1/Cᵢ)이고 저장 전하량의 크기가 같습니다. {concl(a,corr)}"
  if '유도기전력' in q or '패러데이' in q:
   return f"패러데이 법칙에 따라 유도기전력의 크기는 e=N|dΦ/dt|입니다. 같은 자속 변화라면 권선수 N에 비례하므로 권선수를 늘리면 유도기전력도 같은 비율로 증가합니다. {concl(a,corr)}"
  if '합성인덕턴스' in q or ('상호인덕턴스' in q and 'M' in q):
   return f"상호결합 코일의 직렬 합성인덕턴스는 자속이 서로 돕는 가동결합이면 L=L₁+L₂+2M, 서로 반대면 L=L₁+L₂−2M입니다. 점표시 또는 권선 방향으로 가동·차동을 먼저 판별합니다. {concl(a,corr)}"
  if '논리식' in q or '불대수' in q or 'AND' in q or 'OR회로' in q or 'NOT' in q:
   return f"논리회로는 AND를 곱(·), OR를 합(+), NOT을 보수(¯)로 바꾸어 불대수로 정리합니다. A+A=A, A·A=A, A+1=1, A·0=0, A+Ā=1과 드모르간 법칙을 이용하면 식을 최소화할 수 있습니다. {concl(a,corr)}"
  if '시퀀스' in q or '자기유지' in q or '인터록' in q:
   return f"시퀀스 회로에서는 a접점은 여자 시 닫히고 b접점은 여자 시 열립니다. 자기유지회로는 기동버튼과 병렬로 자기 자신의 a접점을 두어 버튼을 놓아도 코일 여자상태를 유지하고, 인터록은 상호 동시동작을 방지합니다. {concl(a,corr)}"
  if '전달함수' in q or '블록선도' in q:
   return f"전달함수는 초기조건을 0으로 두었을 때 출력의 라플라스변환/입력의 라플라스변환, 즉 G(s)=Y(s)/X(s)입니다. 블록선도는 직렬은 곱, 병렬은 합, 피드백은 G/(1±GH) 관계로 단순화합니다. {concl(a,corr)}"
  if '추종제어' in q or '정치제어' in q or '프로그램 제어' in q or '비율 제어' in q:
   return f"제어목표에 따른 분류에서 정치제어는 일정 목표값, 프로그램제어는 미리 정한 시간함수, 추종제어는 임의로 변하는 목표값을 따라가며, 비율제어는 두 변수의 일정 비율을 유지합니다. {concl(a,corr)}"
  if any(k in q for k in ['SCR','TRIAC','IGBT','사이리스터','다이오드']):
   return f"전력용 반도체는 도통방향과 게이트 제어 여부를 구분합니다. SCR은 단방향 제어정류소자, TRIAC은 양방향 사이리스터로 교류 양방향 전력제어에 적합합니다. 다이오드는 기본적으로 한 방향 도통 특성을 가집니다. {concl(a,corr)}"
  if '3상' in q or 'Y결선' in q or 'Δ결선' in q or '선간전압' in q:
   return f"대칭 3상에서 Y결선은 V_L=√3V_P, I_L=I_P이고, Δ결선은 V_L=V_P, I_L=√3I_P입니다. 3상 유효전력은 P=√3V_LI_Lcosφ를 사용합니다. {concl(a,corr)}"
  if '중첩' in q or '테브난' in q or '노턴' in q:
   return f"중첩의 원리는 독립 전원을 하나씩 남겨 각 전원에 의한 응답을 합합니다. 다른 독립 전압원은 단락, 전류원은 개방합니다. 테브난 등가에서는 단자 개방전압 V_th와 독립전원을 제거해 본 등가저항 R_th를 구합니다. {concl(a,corr)}"
  if '보정률' in q or '오차율' in q or ('참값' in q and '지시값' in q):
   return f"측정오차는 지시값과 참값의 차이로 정의합니다. 보정값은 참값−지시값이고, 보정률은 보정값을 지시값 또는 규정된 기준값으로 나눈 백분율 형태를 문제의 정의에 맞춰 적용합니다. {concl(a,corr)}"
  if source and len(source)>=35:
   return f"핵심 해설: {source}. {concl(a,corr)}"[:1050]
  return f"이 문항은 소방전기회로의 회로법칙·교류·제어·계측 개념을 적용하는 문제입니다. 회로의 접속관계와 주어진 물리량의 단위를 먼저 정리한 뒤 해당 공식에 대입하면 ‘{sc(corr)}’이 맞습니다. {concl(a,corr)}"

 # ---------- 소방관계법규 ----------
 if subject=='소방관계법규':
  hist='해당 회차 출제 당시의 법령 기준을 적용해야 하는 문항입니다. '
  if any(k in q for k in ['몇 m','몇 ㎡','몇 m2','몇 리터','몇 L','며칠','몇 년','몇 회','몇 명','몇 이상','몇 이하','지정수량','과태료','벌금']):
   return f"{hist}법규형 수치문제는 시설·대상·용도와 예외조건을 먼저 확인한 뒤 해당 기준값을 대응합니다. 이 문항의 조건에 해당하는 기준은 ‘{sc(corr)}’입니다. 법령 수치는 개정될 수 있으므로 현재 실무 적용 시 최신 기준과 구분해 학습해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['소방청장','소방본부장','소방서장','시·도지사','시장','군수','구청장','권한','명할 수']):
   return f"{hist}권한 주체를 묻는 문제는 해당 법률에서 신고·허가·명령·감독 권한을 누구에게 부여했는지를 구분해야 합니다. 제시된 업무의 법정 권한 관계에 맞는 선택지는 ‘{sc(corr)}’입니다. {concl(a,corr)}"
  return f"{hist}문제에서 묻는 대상시설·행위·절차를 관련 법령의 적용범위와 대조하면 ‘{sc(corr)}’이 해당합니다. 법규 기출은 시행 당시 기준과 현재 기준이 달라질 수 있으므로 회차 기준으로 정답을 학습하고 최신 법령은 별도로 확인하는 것이 안전합니다. {concl(a,corr)}"

 # ---------- 소방전기시설 ----------
 if subject=='소방전기시설의 구조 및 원리':
  hist='해당 회차 출제 당시의 화재안전기준·기술기준을 적용하는 문항입니다. '
  if '자동화재탐지' in q or '경계구역' in q or '수신기' in q or '발신기' in q:
   return f"{hist}자동화재탐지설비는 감지기→발신기·중계기→수신기로 화재신호를 전달하고 경계구역별로 위치를 식별합니다. 수신기 종류, 경계구역 설정, 발신기 수평거리와 표시등 기준을 대상물 조건에 맞춰 구분합니다. {concl(a,corr)}"
  if '감지기' in q:
   return f"{hist}감지기는 화재의 열·연기·불꽃 등을 감지해 신호를 수신기에 전달합니다. 차동식·정온식·보상식 열감지기, 이온화식·광전식 연기감지기, 불꽃감지기의 감지원리와 설치 제외장소를 구분해야 합니다. {concl(a,corr)}"
  if '비상방송' in q:
   return f"{hist}비상방송설비는 자동화재탐지설비와 연동하여 화재층과 필요한 관련층에 음성경보를 전달합니다. 확성기 수평거리, 음향장치 성능, 우선경보방식, 배선과 비상전원 유지시간 기준을 묻는 문제가 반복됩니다. {concl(a,corr)}"
  if '비상벨' in q or '자동식사이렌' in q or '비상경보' in q:
   return f"{hist}비상경보설비는 화재발생을 음향으로 신속히 알리는 설비입니다. 발신기 설치거리, 음향장치의 음압, 비상전원 용량과 부식·습기 환경의 설치조건을 구분합니다. {concl(a,corr)}"
  if '누전경보기' in q or '영상변류기' in q or 'ZCT' in q:
   return f"{hist}누전경보기는 영상변류기(ZCT)가 누설전류를 검출하고 수신부가 경보를 발합니다. 변류기·수신부·음향장치·표시등의 기능과 설치 대상·거리·성능기준을 구분해야 합니다. {concl(a,corr)}"
  if '유도등' in q or '유도표지' in q or '비상조명' in q:
   return f"{hist}유도등·유도표지는 피난구와 피난방향을 식별하게 하는 피난설비입니다. 대상물과 층·용도에 따른 종류, 설치높이·간격, 비상전원 유지시간 및 점등방식을 구분합니다. {concl(a,corr)}"
  if '자동화재속보' in q or '속보기' in q:
   return f"{hist}자동화재속보설비는 화재신호를 수신하면 소방관서에 자동 통보하는 설비입니다. 속보 개시시간, 반복 통보횟수, 설치대상과 다른 설비와의 연동조건을 해당 회차 기준으로 판단합니다. {concl(a,corr)}"
  if '무선통신보조' in q or '누설동축' in q or '무선기기 접속단자' in q:
   return f"{hist}무선통신보조설비는 지하층·터널 등 전파가 약한 곳에서 소방대의 무선통신을 보조합니다. 누설동축케이블·분배기·증폭기·접속단자와 비상전원의 설치거리·고정간격·작동시간 기준을 구분합니다. {concl(a,corr)}"
  if '비상콘센트' in q:
   return f"{hist}비상콘센트설비는 소방대가 화재현장에서 전원을 사용할 수 있게 하는 소방활동설비입니다. 설치층·수평거리, 콘센트 용량·전압, 전용회로와 보호함·표시등 및 비상전원 기준을 적용합니다. {concl(a,corr)}"
  if '비상전원수전설비' in q or '소방회로배선' in q or '내화배선' in q or '내열배선' in q:
   return f"{hist}소방시설의 전원·배선은 화재 중에도 기능을 유지하도록 일반회로와 분리하고 내화·내열 성능을 확보해야 합니다. 전용회로, 이격거리, 배선방법과 비상전원 전환·용량 기준을 구분합니다. {concl(a,corr)}"
  if '가스누설경보기' in q or '가스누설' in q:
   return f"{hist}가스누설경보기는 가연성·독성가스 누설을 검지해 경보하는 설비입니다. 가스의 비중에 따른 검지부 위치, 수신부·경보부 설치장소와 감지농도 기준을 구분합니다. {concl(a,corr)}"
  if '시각경보' in q:
   return f"{hist}시각경보장치는 청각장애인 등에게 섬광으로 화재를 알리는 장치입니다. 설치대상, 설치높이·간격, 동기점멸과 자동화재탐지설비 연동기준을 확인해야 합니다. {concl(a,corr)}"
  if any(k in q for k in ['몇 m','몇 ㎡','몇 m2','몇 초','몇 분','몇 dB','몇 V','몇 lx','몇 회','몇 층','몇 %']):
   return f"{hist}전기시설 수치문제는 설비 종류와 대상물 조건을 먼저 특정한 뒤 해당 화재안전기준·형식승인 기술기준의 수치를 적용합니다. 이 문항의 조건에 해당하는 값은 ‘{sc(corr)}’입니다. 개정 가능성이 있으므로 현행 실무기준과는 구분해 학습합니다. {concl(a,corr)}"
  if source and len(source)>=35:
   return f"핵심 해설: {source}. {concl(a,corr)}"[:1050]
  return f"이 문항은 소방전기시설의 구성요소·작동원리·설치기준을 구분하는 문제입니다. 설비가 수행하는 기능과 신호 흐름, 비상전원·배선·경보 기준을 문제 조건에 대조하면 ‘{sc(corr)}’이 적절합니다. {concl(a,corr)}"

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
 out={'examId':date,'title':f'소방설비기사(전기분야) 필기 {y}년 {mo}월 {d}일','duration':120,'passingScore':60,'subjects':SUBJECTS,'questions':qs}
 op=DATA_DIR/f'소방설비기사(전기분야) {date}.json'; op.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return op,stats

def update_index(entries):
 p=DATA_DIR/'index.json'; data=json.loads(p.read_text(encoding='utf-8'))
 data=[x for x in data if '소방설비기사(전기분야)' not in f"{x.get('id','')} {x.get('title','')}"]
 for op in entries:
  d=json.loads(op.read_text(encoding='utf-8')); y,mo,day=map(int,d['examId'].split('-'))
  data.append({'id':f"소방설비기사(전기분야) {d['examId']}",'title':'소방설비기사(전기분야) 필기','date':f'{y}년 {mo}월 {day}일','questions':80,'duration':120,'subjects':[s['name'] for s in SUBJECTS]})
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
 pdfs=sorted(PDF_ROOT.glob('소방설비기사(전기분야)*.pdf'))
 if not pdfs: raise SystemExit('no fire electrical PDFs')
 bank=build_source_bank(pdfs); entries=[]
 if ASSET_ROOT.exists():shutil.rmtree(ASSET_ROOT)
 for p in pdfs:
  op,st=import_one(p,bank); entries.append(op); print('OK',p.name,st)
 update_index(entries); print('fire electrical complete',len(entries))
if __name__=='__main__':main()
