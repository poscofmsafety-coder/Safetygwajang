#!/usr/bin/env python3
import fitz, json, re, subprocess, shutil
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]; DATA_DIR=ROOT/'data'; ASSET_ROOT=ROOT/'assets'/'cbt'/'hazmat-industry'; PDF_ROOT=Path('/mnt/data')
SUBJECTS=[
 {'name':'일반화학','range':[1,20]},
 {'name':'화재예방과 소화방법','range':[21,40]},
 {'name':'위험물의 성질과 취급','range':[41,60]},
]
CIRCLE_TO_NUM={'①':1,'②':2,'③':3,'④':4,'❶':1,'❷':2,'❸':3,'❹':4}; NORMAL_CIRCLE={1:'①',2:'②',3:'③',4:'④'}
VISUAL_RE=re.compile(r'(다음\s*(그림|도표|표|식|반응식)|그림은|그림과|그림에서|표와\s*같|표를\s*참고|구조식|밑줄|다음과\s*같은|아래\s*(그림|표|식)|반응식의\s*계수|다음\s*화합물)')
BOILER=('전자문제집 CBT 홈페이지','기출문제 및 해설집 다운로드','전자문제집 CBT 앱','전자문제집 CBT란?','종이 문제집이 아닌','인터넷으로 종이 없이','오답 및 오탈자가 수정된','최강 자격증 기출문제 전자문제집 CBT','기출문제 해설은 최강 자격증')
try: FONT=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',30)
except Exception: FONT=ImageFont.load_default()

def date_from_name(p):
 m=re.search(r'(20\d{2})(\d{2})(\d{2})',p.name); y,mo,d=m.groups(); return f'{y}-{mo}-{d}',int(y),int(mo),int(d)
def subject_for(n): return next(s['name'] for s in SUBJECTS if s['range'][0]<=n<=s['range'][1])
def clean_line(s): return re.sub(r'\s+',' ',s.replace('\u00a0',' ').replace('\ufeff',' ')).strip()
def skip_line(t):
 return (not t or any(k in t for k in BOILER) or bool(re.search(r'^\s*\d과목\s*:',t)) or ('위험물산업기사' in t and '필기 기출문제' in t) or t.startswith('본 해설집은') or t.startswith('해설을 제공해 주신'))

def extract_ordered(pdf):
 doc=fitz.open(pdf); qrec={i:{'body':[],'expl':[],'regions':defaultdict(lambda:[1e9,-1e9])} for i in range(1,61)}; expected=1; current=None; stop=False
 for pno,page in enumerate(doc):
  if stop: break
  mid=page.rect.width/2; lines=[]
  for b in page.get_text('dict').get('blocks',[]):
   for line in b.get('lines',[]):
    spans=line.get('spans',[])
    if not spans: continue
    txt=clean_line(''.join(sp.get('text','') for sp in spans));
    if not txt: continue
    x0,y0,x1,y1=line['bbox']
    if y0<48 or y1>page.rect.height-14: continue
    colors=[sp.get('color',0) for sp in spans if sp.get('text','').strip()]; color=colors[0] if colors else 0; col=0 if (x0+x1)/2<mid else 1
    lines.append((col,y0,x0,y1,txt,color))
  for col in (0,1):
   for _,y0,x0,y1,txt,color in sorted((z for z in lines if z[0]==col),key=lambda z:(z[1],z[2])):
    if current==60 and any(k in txt for k in BOILER[:4]): stop=True; break
    if skip_line(txt): continue
    m=re.match(r'^(\d{1,2})\.\s*(.*)',txt); black=color==0
    if m and black and int(m.group(1))==expected:
     current=expected; expected+=1; qrec[current]['body'].append(f'{current}. {m.group(2)}'.strip()); qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0); qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1); continue
    if current is None: continue
    if current==60 and re.fullmatch(r'(?:\d{1,2}\s+){4,}\d{1,2}',txt): continue
    if current==60 and len(re.findall(r'[①②③④]',txt))>=5: continue
    key=(pno,col)
    if color==255 or txt.startswith('<문제 해설>') or txt.startswith('[해설') or txt.startswith('[관리자') or txt.startswith('[오류') or txt.startswith('[추가'):
     qrec[current]['expl'].append(txt)
    elif black:
     qrec[current]['body'].append(txt); qrec[current]['regions'][key][0]=min(qrec[current]['regions'][key][0],y0); qrec[current]['regions'][key][1]=max(qrec[current]['regions'][key][1],y1)
   if stop: break
 doc.close(); return qrec,expected-1

def extract_answers(pdf):
 text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-'],text=True,encoding='utf-8',errors='replace'); lines=text.splitlines(); ans=[]
 for line in lines[-280:]:
  toks=re.findall(r'[①②③④]',line)
  if len(toks)>=10: ans.extend(CIRCLE_TO_NUM[t] for t in toks[-10:])
 # pick final six answer rows if text contained other 10-choice lines
 if len(ans)>60: ans=ans[-60:]
 if len(ans)!=60: raise ValueError(f'{pdf.name}: 정답 {len(ans)}개')
 return ans

def join_text(lines):
 t=' '.join(clean_line(x) for x in lines if clean_line(x)); t=re.sub(r'\s+',' ',t).strip().replace('ㆍ','·'); t=re.sub(r'\s+([,.:;?%)])',r'\1',t); return t

def parse_question(no,body):
 raw=re.sub(rf'^{no}\.\s*','',join_text(body)); ms=list(re.finditer(r'[①②③④❶❷❸❹]',raw))
 if len(ms)>=4:
  q=raw[:ms[0].start()].strip(); ch=[raw[ms[i].end():(ms[i+1].start() if i<3 else len(raw))].strip() for i in range(4)]
 else: q=raw.strip(); ch=[]
 while len(ch)<4: ch.append('그림 선택지')
 ch=[('그림 선택지' if not c or c in {'-','·'} else c) for c in ch[:4]]
 return q or f'{no}번 문제',ch

def vdist(r,y0,y1):
 if r.y1<y0:return y0-r.y1
 if r.y0>y1:return r.y0-y1
 return 0

def graphic_clips(pdf,regions,needed):
 doc=fitz.open(pdf); cand=[]
 maxdist=54 if needed else 0
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
 mind=min(c[0] for c in cand); chosen=[c for c in cand if c[0]<=max(4,mind+10)]; out=[]
 for _,p,r in sorted(chosen,key=lambda x:(x[1],round(x[2].y0,1),round(x[2].x0,1))):
  if any(p==pp and (r&rr).get_area()>0.8*min(r.get_area(),rr.get_area()) for pp,rr in out):continue
  out.append((p,r))
 doc.close();return out

def _clip_choice_index(doc,pno,r,regions):
 # Map an image-only choice to the printed ①/②/③/④ marker by geometry.
 page=doc[pno]; mid=page.rect.width/2; col=0 if (r.x0+r.x1)/2<mid else 1
 rg=regions.get((pno,col)) if regions else None
 if rg and rg[1]>rg[0] and rg[0]<1e8:
  ymin=min(rg[0],r.y0)-35; ymax=max(rg[1],r.y1)+35
 else:
  ymin=r.y0-50; ymax=r.y1+50
 markers=[]
 for b in page.get_text('dict').get('blocks',[]):
  for line in b.get('lines',[]):
   for sp in line.get('spans',[]):
    txt=sp.get('text',''); m=re.search(r'[①②③④❶❷❸❹]',txt)
    if not m: continue
    sr=fitz.Rect(sp['bbox']); sc=0 if (sr.x0+sr.x1)/2<mid else 1
    if sc!=col or (sr.y0+sr.y1)/2<ymin or (sr.y0+sr.y1)/2>ymax: continue
    markers.append((CIRCLE_TO_NUM[m.group()],sr))
 if not markers:return None
 cx=(r.x0+r.x1)/2; cy=(r.y0+r.y1)/2
 best=None
 for idx,sr in markers:
  sx=(sr.x0+sr.x1)/2; sy=(sr.y0+sr.y1)/2
  # Choice markers normally sit immediately to the left of the option image.
  penalty=0 if sr.x1<=r.x1 else 50
  dist=abs(cx-sx)+1.4*abs(cy-sy)+penalty
  if best is None or dist<best[0]:best=(dist,idx)
 return best[1] if best else None

def save_graphics(pdf,date,no,clips,choices,regions):
 if not clips:return None
 doc=fitz.open(pdf)
 has_placeholder=any(c=='그림 선택지' for c in choices)
 mapped=[]
 if has_placeholder:
  for p,r in clips:mapped.append(_clip_choice_index(doc,p,r,regions))
  # If geometry resolved distinct option numbers, reorder by actual printed choice number.
  if all(x in (1,2,3,4) for x in mapped) and len(set(mapped))==len(mapped):
   paired=sorted(zip(mapped,clips),key=lambda z:z[0]); mapped=[x for x,_ in paired]; clips=[c for _,c in paired]
 pieces=[]
 for p,r in clips:
  page=doc[p]; rr=fitz.Rect(max(0,r.x0-2),max(0,r.y0-2),min(page.rect.width,r.x1+2),min(page.rect.height,r.y1+2)); pix=page.get_pixmap(matrix=fitz.Matrix(2,2),clip=rr,alpha=False); pieces.append(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
 doc.close()
 label_images=has_placeholder and any(x in (1,2,3,4) for x in mapped)
 lw=58 if label_images else 0; gap=14; maxw=max(i.width for i in pieces)+lw; h=sum(i.height for i in pieces)+gap*(len(pieces)-1); can=Image.new('RGB',(maxw,h),'white'); y=0; labs={1:'①',2:'②',3:'③',4:'④'}
 for i,im in enumerate(pieces):
  x=lw if label_images else (maxw-im.width)//2
  if label_images:
   lab=mapped[i] if i<len(mapped) and mapped[i] in labs else None
   if lab: ImageDraw.Draw(can).text((5,y+max(0,(im.height-34)//2)),labs[lab],font=FONT,fill='black')
  can.paste(im,(x,y)); y+=im.height+gap
 od=ASSET_ROOT/date; od.mkdir(parents=True,exist_ok=True); out=od/f'q{no:02d}.png'; can.save(out,'PNG',optimize=True)
 return out,can.width,can.height,label_images,set(x for x in mapped if x in (1,2,3,4))

def clean_source(lines):
 parts=[]; author_seen=False
 for raw in lines:
  t=clean_line(raw)
  if not t or t=='<문제 해설>':continue
  if t.startswith('[해설작성자'):
   if len(' '.join(parts))>=30:break
   continue
  if t.startswith('[관리자') or t.startswith('[오류') or t.startswith('[추가') or '오류 신고' in t or '오류신고' in t:continue
  t=re.sub(r'\[해설작성자[^\]]*\]','',t); t=t.replace('==>>','→').replace('-->','→').replace('->','→')
  t=re.sub(r'ㅎㅎ+|ㅋㅋ+|ㅠㅠ+','',t); t=re.sub(r'\b(thx|thanks)\b[:)]*','',t,flags=re.I)
  # remove chatty lead-ins without changing technical content
  t=re.sub(r'^(쉽게\s*말하면|쉽게\s*생각하면|외우기|암기|그냥)\s*[:：-]?\s*','',t)
  if t:parts.append(t)
  if len(' '.join(parts))>600:break
 return re.sub(r'\s+',' ',' '.join(parts)).strip()[:700]

def sc(c):
 c=re.sub(r'\s+',' ',c).strip(); return c if len(c)<110 else c[:107]+'...'
def concl(a,c): return f"따라서 {a}번 ‘{sc(c)}’이 정답입니다."

def professionalize_source(src):
 s=re.sub(r'\s+',' ',src).strip()
 # Remove forum/mnemonic chatter while preserving technical statements and calculations.
 s=re.sub(r'(쉽게\s*(?:생각하면|말하면|외우면|외웁시다)?|그냥|무조건|꼭\s*외우(?:세요|시기\s*바랍니다)?|반드시\s*외우(?:세요|기)?|시험장[^.!?]*|화이팅|가즈아)', ' ', s, flags=re.I)
 s=re.sub(r'(?:따라서\s*)?(?:정답|답)은?\s*\d+번[^.!?]*(?:[.!?]|$)', ' ', s)
 s=re.sub(r'(?:따라서\s*)?(?:정답|답)은?\s*[^.!?]{0,50}(?:[.!?]|$)', ' ', s)
 s=re.sub(r'!+','.',s)
 s=s.replace('..','.').replace('됩니다..','됩니다.')
 s=re.sub(r'\s+',' ',s).strip(' .')
 return s

def haz_expl(q,ch,a,src,subject):
 corr=ch[a-1]; low=q.lower()
 cleaned=professionalize_source(src) if src else ''
 # 반복 출제되는 핵심 문항은 커뮤니티식 원문 해설보다 교재형 근거를 우선합니다.
 if '가연성 액체' in q and all(x in q+''.join(ch) for x in ['HNO3','H2O2']):
  return f"질산(HNO₃), 과염소산(HClO₄), 과산화수소(H₂O₂)는 제6류 위험물인 산화성 액체로, 다른 물질의 연소를 촉진할 수 있지만 그 자체를 가연성 액체로 분류하지 않습니다. 따라서 제시 물질은 모두 가연성 액체가 아닙니다. {concl(a,corr)}"
 if '물을 전기분해' in q and '5.6L' in q:
  return f"물의 전기분해에서는 (+)극(양극)에서 O₂, (-)극(음극)에서 H₂가 발생합니다. 반응식 2H₂O → 2H₂ + O₂에서 기체 몰비가 H₂:O₂=2:1이므로 O₂가 5.6 L이면 H₂는 11.2 L입니다. {concl(a,corr)}"
 if 'FeCl3' in q and '정색' in q:
  return f"염화철(Ⅲ) 정색반응은 방향족 고리에 -OH가 직접 결합한 페놀류의 확인반응입니다. 페놀·크레졸·살리실산은 정색반응을 나타내지만, 벤질알코올은 -OH가 벤젠고리에 직접 결합하지 않아 페놀류가 아니므로 정색반응을 나타내지 않습니다. {concl(a,corr)}"
 if '과망간산칼륨' in q and '혼촉' in q:
  return f"과망간산칼륨(KMnO₄)은 강한 산화제이므로 에테르·글리세린 같은 유기물과의 접촉은 산화·발열 위험이 큽니다. 염산과는 염소 발생 등 위험한 반응이 가능하지만 물은 이러한 가연성·환원성 물질에 비해 혼촉 위험이 가장 낮습니다. {concl(a,corr)}"
 if '스프링클러설비' in q:
  return f"스프링클러설비는 초기 화재의 자동 진압에 효과적이고 물을 소화약제로 사용해 경제성이 높으며 운전 조작도 비교적 간단합니다. 다만 배관·헤드·수원·펌프·제어장치 등 여러 설비가 연계되므로 다른 단순 소화설비보다 시공이 간단하다고 볼 수 없습니다. {concl(a,corr)}"
 if '볼타 전지' in q:
  return f"볼타전지는 자발적인 산화·환원반응으로 전기를 얻는 갈바니 전지입니다. 이온화경향이 큰 금속의 (-)극(양극)에서 산화가 일어나고, (+)극(음극)에서는 환원이 일어납니다. 전자는 (-)극에서 (+)극으로 이동하며 전류 방향은 그 반대입니다. {concl(a,corr)}"
 # 해설집에 충분한 기술 근거가 있으면 원문 내용을 교재형 문장으로 우선 사용합니다.
 # 이는 넓은 키워드 규칙이 다른 주제에 잘못 적용되는 것을 방지합니다.
 if len(cleaned)>=45:
  return f"핵심 해설: {cleaned}. {concl(a,corr)}"[:950]
 if any(k in q for k in ['pH','pOH','수소이온','OH-','[OH','[H']):
  return f"수용액의 산·염기 계산은 pH=-log[H⁺], pOH=-log[OH⁻], 25℃에서 pH+pOH=14를 사용합니다. 강산·강염기는 해리 후의 이온농도를 바로 적용하고 약산·약염기는 해리평형을 고려합니다. {concl(a,corr)}"
 if any(k in q for k in ['몰분율','몰수','분자량','원자량','기체상태','이상기체','기압','부피']) and subject=='일반화학':
  return f"일반화학 계산은 먼저 질량을 몰수(n=m/M)로 바꾸고, 기체 문제는 PV=nRT 또는 일정 온도에서 P₁V₁=P₂V₂를 적용합니다. 단위(atm, L, K)를 통일한 뒤 보기와 일치하는 값을 선택합니다. {concl(a,corr)}"
 if any(k in q for k in ['산화수','산화','환원','환원력','산화력']):
  return f"산화는 전자를 잃어 산화수가 증가하는 과정이고, 환원은 전자를 얻어 산화수가 감소하는 과정입니다. 환원력이 큰 물질일수록 자신은 더 쉽게 산화되므로 반응 전후 산화수 변화를 비교하면 됩니다. {concl(a,corr)}"
 if any(k in q for k in ['전기분해','패러데이','Faraday','전극']):
  return f"전기분해는 반쪽반응의 전자수와 생성물의 몰수비를 먼저 맞춥니다. 1 F는 전자 1 mol의 전기량(약 9.65×10⁴ C)이며 Q=It를 이용해 전류와 시간을 환산합니다. {concl(a,corr)}"
 if any(k in q for k in ['결합','배위결합','공유결합','이온결합','수소결합']):
  return f"화학결합은 구성 원자의 성질과 전자 제공 방식으로 구분합니다. 배위결합은 공유전자쌍을 한쪽 원자가 모두 제공하고, 금속-비금속 사이에는 이온결합, 비금속 원자 사이에는 주로 공유결합이 형성됩니다. {concl(a,corr)}"
 if any(k in q for k in ['용해도','용해도곱','침전','포화용액','석출']):
  return f"용해도 문제는 기준 용매 질량에 대한 용질의 양을 비례식으로 환산하고, 냉각·농축 후 남을 수 있는 용질량과의 차이로 석출량을 구합니다. 이온곱 Q가 용해도곱 Ksp보다 크면 침전이 생성됩니다. {concl(a,corr)}"
 if any(k in q for k in ['평형상수','평형','르샤틀리에']):
  return f"화학평형에서는 반응식의 계수를 지수로 하여 K=(생성물 농도항)/(반응물 농도항)을 세웁니다. 고체·순수액체는 평형상수식에서 제외하고, 농도·압력·온도 변화에 대한 평형 이동은 르샤틀리에 원리로 판단합니다. {concl(a,corr)}"
 if any(k in q for k in ['연소','완전연소','불완전연소','폭발범위','인화점','발화점','연소범위']):
  return f"연소는 가연물·산소공급원·점화원이 충족될 때 지속됩니다. 인화점은 점화원에 의해 순간적으로 착화할 수 있는 최저온도, 발화점은 외부 점화원 없이 스스로 연소가 시작되는 최저온도이므로 서로 구분해야 합니다. {concl(a,corr)}"
 if '화학적 에너지원' in q or '화학적에너지원' in q:
  return f"위험물 화재의 점화·에너지원 분류에서 마찰열은 물체의 접촉과 운동에 의해 발생하는 기계적 에너지원입니다. 화학반응 과정에서 발생하는 반응열과 구분해야 합니다. {concl(a,corr)}"
 if any(k in q for k in ['소화','소화약제','소화설비','소화기','포소화','이산화탄소','할로겐화합물']):
  return f"소화의 기본원리는 제거소화·질식소화·냉각소화·억제소화입니다. 위험물의 성질과 화재 형태에 맞는 약제를 선택해야 하며, 물과 반응하거나 물보다 가벼운 인화성 액체에는 물의 직접 방사가 오히려 위험할 수 있습니다. {concl(a,corr)}"
 if any(k in q for k in ['제1류','제2류','제3류','제4류','제5류','제6류','위험물']):
  return f"위험물은 류별 공통성질과 대표 물질을 함께 기억해야 합니다. 제1류는 산화성 고체, 제2류는 가연성 고체, 제3류는 자연발화성·금수성, 제4류는 인화성 액체, 제5류는 자기반응성, 제6류는 산화성 액체입니다. {concl(a,corr)}"
 if any(k in q for k in ['지정수량','배수','저장','취급','탱크','옥내저장','옥외저장','주유취급']):
  return f"위험물 저장·취급 기준은 위험물의 류, 품명, 지정수량 배수와 시설 종류에 따라 적용됩니다. 서로 반응 위험이 있는 물질은 혼재를 피하고, 누출·가열·충격·수분 접촉 등 해당 물질의 주요 위험요인을 차단하는 것이 기본입니다. {concl(a,corr)}"
 if any(k in q for k in ['페놀','벤젠','에탄올','메탄올','톨루엔','알코올','알켄','알칸','이성질체','유기']):
  return f"유기화학 문항은 작용기와 대표 반응을 기준으로 판단합니다. 알코올의 산화, 알켄의 첨가반응, 방향족의 치환반응 등 반응 전후 작용기의 변화를 확인하면 선택지를 구분할 수 있습니다. {concl(a,corr)}"
 if cleaned:
  return f"핵심 해설: {cleaned}. {concl(a,corr)}"[:950]
 return f"이 문항은 {subject}의 핵심 정의와 적용조건을 묻습니다. 문제에서 제시한 조건을 물질의 성질·반응성 또는 법정 기준에 대입하면 ‘{sc(corr)}’이 조건에 일치합니다. {concl(a,corr)}"

def marker_answer(body):
 m=re.search(r'[❶❷❸❹]',join_text(body)); return CIRCLE_TO_NUM[m.group()] if m else None

def import_one(pdf):
 date,y,mo,d=date_from_name(pdf); qrec,count=extract_ordered(pdf)
 if count!=60: raise ValueError(f'{pdf.name}: 문항 {count}')
 ans=extract_answers(pdf); od=ASSET_ROOT/date
 if od.exists():shutil.rmtree(od)
 qs=[]; stats={'visual':0,'image_only':0,'mismatch':0}
 for n in range(1,61):
  rec=qrec[n]; q,ch=parse_question(n,rec['body']); a=ans[n-1]; bm=marker_answer(rec['body']); stats['mismatch']+=int(bm is not None and bm!=a)
  needed=bool(VISUAL_RE.search(q) or any(c=='그림 선택지' for c in ch)); clips=graphic_clips(pdf,rec['regions'],needed); pd=save_graphics(pdf,date,n,clips,ch,rec['regions']) if clips else None
  if pd:
   out,w,h,image_choice,mapped_indices=pd; stats['visual']+=1
   if image_choice: stats['image_only']+=1
   ch=[(f'위 그림 {NORMAL_CIRCLE[i]}' if c=='그림 선택지' and i in mapped_indices else ('위 제시자료의 그림/식' if c=='그림 선택지' else c)) for i,c in enumerate(ch,1)]
  item={'no':n,'subject':subject_for(n),'question':q}
  if pd:
   rel=out.relative_to(ROOT).as_posix(); item['passage']=[{'type':'svg','alt':f'{n}번 문제 제시자료','content':f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{rel}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>"}]
  item['choices']=ch; item['answer']=a; src=clean_source(rec['expl']); item['explanation']=haz_expl(q,ch,a,src,subject_for(n)); qs.append(item)
 out={'examId':date,'title':f'위험물산업기사 필기 {y}년 {mo}월 {d}일','duration':90,'passingScore':60,'subjects':SUBJECTS,'questions':qs}; op=DATA_DIR/f'위험물산업기사 {date}.json'; op.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); return op,stats

def update_index(entries):
 p=DATA_DIR/'index.json'; data=json.loads(p.read_text(encoding='utf-8')); data=[x for x in data if '위험물산업기사' not in f"{x.get('id','')} {x.get('title','')}"]
 for op in entries:
  d=json.loads(op.read_text(encoding='utf-8')); y,mo,day=map(int,d['examId'].split('-')); data.append({'id':f"위험물산업기사 {d['examId']}",'title':'위험물산업기사 필기','date':f'{y}년 {mo}월 {day}일','questions':60,'duration':90,'subjects':[s['name'] for s in SUBJECTS]})
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
 pdfs=sorted(PDF_ROOT.glob('위험물산업기사*.pdf')); entries=[]
 for p in pdfs:
  op,st=import_one(p); entries.append(op); print('OK',p.name,st)
 update_index(entries); print('hazmat industry complete',len(entries))
if __name__=='__main__':main()
