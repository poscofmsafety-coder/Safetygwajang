#!/usr/bin/env python3
import fitz, json, re, subprocess, math, shutil
from pathlib import Path
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT/'data'
ASSET_ROOT = ROOT/'assets'/'cbt'/'ergonomics'
PDF_ROOT = Path('/mnt/data')
SUBJECTS=[
 {'name':'인간공학개론','range':[1,20]},
 {'name':'작업생리학','range':[21,40]},
 {'name':'산업심리학 및 관계법규','range':[41,60]},
 {'name':'근골격계질환 예방을 위한 작업관리','range':[61,80]},
]
CIRCLE_TO_NUM={'①':1,'②':2,'③':3,'④':4,'❶':1,'❷':2,'❸':3,'❹':4}
NORMAL_CIRCLE={1:'①',2:'②',3:'③',4:'④'}
VISUAL_RE=re.compile(r'(다음\s*(그림|도표|표|식)|그림은|그림과|그림에서|표와\s*같|표를\s*참고|다음에서\s*설명|다음과\s*같은\s*(그림|표|식)|심볼|도식|블록도|회로|아래\s*(그림|표|식)|A~E|A～E)')
BOILER=('전자문제집 CBT 홈페이지','기출문제 및 해설집 다운로드','전자문제집 CBT 앱','전자문제집 CBT란?','종이 문제집이 아닌','인터넷으로 종이 없이','오답 및 오탈자가 수정된','최강 자격증 기출문제 전자문제집 CBT','기출문제 해설은 최강 자격증')

try:
    FONT = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 30)
except Exception:
    FONT = ImageFont.load_default()

def date_from_name(path):
    m=re.search(r'(20\d{2})(\d{2})(\d{2})',path.name); y,mo,d=m.groups(); return f'{y}-{mo}-{d}',int(y),int(mo),int(d)
def subject_for(no):
    return next(s['name'] for s in SUBJECTS if s['range'][0]<=no<=s['range'][1])
def clean_line(s): return re.sub(r'\s+',' ',s.replace('\u00a0',' ').replace('\ufeff',' ')).strip()
def skip_line(t):
    return (not t or any(k in t for k in BOILER) or bool(re.search(r'^\s*\d과목\s*:',t)) or ('인간공학기사' in t and '필기 기출문제' in t) or t.startswith('본 해설집은') or t.startswith('해설을 제공해 주신'))

def extract_ordered_questions(pdf):
    doc=fitz.open(pdf); qrec={i:{'body':[],'expl':[],'regions':defaultdict(lambda:[1e9,-1e9])} for i in range(1,81)}
    expected=1; current=None; stop=False
    for pno,page in enumerate(doc):
        if stop: break
        mid=page.rect.width/2; page_lines=[]
        for block in page.get_text('dict').get('blocks',[]):
            for line in block.get('lines',[]):
                spans=line.get('spans',[])
                if not spans: continue
                txt=clean_line(''.join(sp.get('text','') for sp in spans));
                if not txt: continue
                x0,y0,x1,y1=line['bbox']
                if y0<48 or y1>page.rect.height-14: continue
                colors=[sp.get('color',0) for sp in spans if sp.get('text','').strip()]
                color=colors[0] if colors else 0; col=0 if (x0+x1)/2<mid else 1
                page_lines.append((col,y0,x0,y1,txt,color))
        for col in (0,1):
            for _,y0,x0,y1,txt,color in sorted((r for r in page_lines if r[0]==col),key=lambda z:(z[1],z[2])):
                if current==80 and any(k in txt for k in BOILER[:4]): stop=True; break
                if skip_line(txt): continue
                m=re.match(r'^(\d{1,2})\.\s*(.*)',txt); is_black=color==0
                if m and is_black and int(m.group(1))==expected:
                    current=expected; expected+=1; qrec[current]['body'].append(f'{current}. {m.group(2)}'.strip())
                    qrec[current]['regions'][(pno,col)][0]=min(qrec[current]['regions'][(pno,col)][0],y0); qrec[current]['regions'][(pno,col)][1]=max(qrec[current]['regions'][(pno,col)][1],y1); continue
                if current is None: continue
                if current==80 and re.fullmatch(r'(?:\d{1,2}\s+){4,}\d{1,2}',txt): continue
                if current==80 and len(re.findall(r'[①②③④]',txt))>=5: continue
                key=(pno,col)
                if color==255 or txt.startswith('<문제 해설>') or txt.startswith('[해설') or txt.startswith('[관리자') or txt.startswith('[오류'):
                    qrec[current]['expl'].append(txt)
                elif is_black:
                    qrec[current]['body'].append(txt); qrec[current]['regions'][key][0]=min(qrec[current]['regions'][key][0],y0); qrec[current]['regions'][key][1]=max(qrec[current]['regions'][key][1],y1)
            if stop: break
    doc.close(); return qrec,expected-1

def extract_answer_table(pdf):
    text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-'],text=True,encoding='utf-8',errors='replace'); lines=text.splitlines(); start=0
    for i,l in enumerate(lines):
        if '오답 및 오탈자가 수정된' in l: start=i
    candidates=lines[start:] if start else lines[-250:]; ans=[]
    for line in candidates:
        toks=re.findall(r'[①②③④]',line)
        if len(toks)>=10: ans.extend(CIRCLE_TO_NUM[t] for t in toks[-10:])
    if len(ans)!=80:
        ans=[]
        for line in lines[-280:]:
            toks=re.findall(r'[①②③④]',line)
            if len(toks)>=10: ans.extend(CIRCLE_TO_NUM[t] for t in toks[-10:])
    if len(ans)!=80: raise ValueError(f'{pdf.name}: answer count {len(ans)}')
    return ans

def join_text(lines):
    t=' '.join(clean_line(x) for x in lines if clean_line(x)); t=re.sub(r'\s+',' ',t).strip().replace('ㆍ','·'); t=re.sub(r'\s+([,.:;?%)])',r'\1',t); t=re.sub(r'([(])\s+',r'\1',t); return t

def parse_question(no,body):
    raw=re.sub(rf'^{no}\.\s*','',join_text(body)); ms=list(re.finditer(r'[①②③④❶❷❸❹]',raw))
    if len(ms)>=4:
        question=raw[:ms[0].start()].strip(); choices=[]
        for i in range(4): choices.append(raw[ms[i].end():(ms[i+1].start() if i<3 else len(raw))].strip())
    else: question=raw.strip(); choices=[]
    while len(choices)<4: choices.append('그림 선택지')
    choices=[('그림 선택지' if not c or c in {'-','·'} else c) for c in choices[:4]]
    # 명백한 PDF/OCR 단위 오인식만 정규화합니다. 원문 내용·선택지 순서는 바꾸지 않습니다.
    question=question.replace('L/mm','L/min').replace('sene','sone')
    choices=[c.replace('L/mm','L/min').replace('sene','sone') for c in choices]
    if not question: question=f'{no}번 문제'
    return question,choices

def vertical_distance(r,y0,y1):
    if r.y1<y0: return y0-r.y1
    if r.y0>y1: return r.y0-y1
    return 0

def graphic_clips(pdf,regions,visual_needed=False):
    doc=fitz.open(pdf); cand=[]
    maxdist = 52 if visual_needed else 0
    for (pno,col),(y0,y1) in regions.items():
        if y1<=y0 or y0>1e8: continue
        page=doc[pno]; mid=page.rect.width/2; cx0=22 if col==0 else mid+3; cx1=mid-3 if col==0 else page.rect.width-22
        for b in page.get_text('dict').get('blocks',[]):
            if b.get('type')!=1: continue
            r=fitz.Rect(b['bbox']); center=(r.x0+r.x1)/2
            if not (cx0<=center<=cx1) or r.width<12 or r.height<8: continue
            dist=vertical_distance(r,y0,y1)
            if dist<=maxdist: cand.append((dist,pno,r))
        # Vector drawings are only searched when the wording says a figure/formula is required.
        local=[c for c in cand if c[1]==pno and c[0]<=maxdist]
        if visual_needed and not local:
            for dr in page.get_drawings():
                r=dr.get('rect')
                if not r: continue
                r=fitz.Rect(r); center=(r.x0+r.x1)/2
                if not (cx0<=center<=cx1) or r.width<18 or r.height<8: continue
                dist=vertical_distance(r,y0,y1)
                if dist<=30: cand.append((dist,pno,r))
    # Keep all candidates at/very near the question; if nearest is outside region, keep same cluster.
    if not cand: doc.close(); return []
    mind=min(c[0] for c in cand); threshold=max(4,mind+10)
    chosen=[c for c in cand if c[0]<=threshold]
    # dedup heavily overlapping boxes
    out=[]
    for _,pno,r in sorted(chosen,key=lambda x:(x[1],round(x[2].y0,1),round(x[2].x0,1))):
        if any(pno==pp and (r & rr).get_area()>0.8*min(r.get_area(),rr.get_area()) for pp,rr in out): continue
        out.append((pno,r))
    doc.close(); return out

def _clip_choice_index(doc,pno,r,regions):
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
                m=re.search(r'[①②③④❶❷❸❹]',sp.get('text',''))
                if not m: continue
                sr=fitz.Rect(sp['bbox']); sc=0 if (sr.x0+sr.x1)/2<mid else 1
                if sc!=col or (sr.y0+sr.y1)/2<ymin or (sr.y0+sr.y1)/2>ymax: continue
                markers.append((CIRCLE_TO_NUM[m.group()],sr))
    if not markers:return None
    cx=(r.x0+r.x1)/2; cy=(r.y0+r.y1)/2; best=None
    for idx,sr in markers:
        sx=(sr.x0+sr.x1)/2; sy=(sr.y0+sr.y1)/2; penalty=0 if sr.x1<=r.x1 else 50
        dist=abs(cx-sx)+1.4*abs(cy-sy)+penalty
        if best is None or dist<best[0]:best=(dist,idx)
    return best[1] if best else None

def save_graphics(pdf,date,no,clips,choices,regions):
    if not clips: return None
    doc=fitz.open(pdf); has_placeholder=any(c=='그림 선택지' for c in choices); mapped=[]
    if has_placeholder:
        for p,r in clips:mapped.append(_clip_choice_index(doc,p,r,regions))
        if all(x in (1,2,3,4) for x in mapped) and len(set(mapped))==len(mapped):
            paired=sorted(zip(mapped,clips),key=lambda z:z[0]); mapped=[x for x,_ in paired]; clips=[c for _,c in paired]
    pieces=[]
    for pno,r in clips:
        page=doc[pno]; rr=fitz.Rect(max(0,r.x0-2),max(0,r.y0-2),min(page.rect.width,r.x1+2),min(page.rect.height,r.y1+2))
        pix=page.get_pixmap(matrix=fitz.Matrix(2.0,2.0),clip=rr,alpha=False); pieces.append(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
    doc.close()
    if not pieces:return None
    label_images=has_placeholder and any(x in (1,2,3,4) for x in mapped); gap=14; label_w=58 if label_images else 0; maxw=max(im.width for im in pieces)+label_w; totalh=sum(im.height for im in pieces)+gap*(len(pieces)-1)
    canvas=Image.new('RGB',(maxw,totalh),'white'); y=0; labels={1:'①',2:'②',3:'③',4:'④'}
    for i,im in enumerate(pieces):
        x=label_w if label_images else (maxw-im.width)//2
        if label_images:
            lab=mapped[i] if i<len(mapped) and mapped[i] in labels else None
            if lab:ImageDraw.Draw(canvas).text((5,y+max(0,(im.height-34)//2)),labels[lab],font=FONT,fill='black')
        canvas.paste(im,(x,y)); y+=im.height+gap
    outdir=ASSET_ROOT/date; outdir.mkdir(parents=True,exist_ok=True); out=outdir/f'q{no:02d}.png'; canvas.save(out,'PNG',optimize=True)
    return out,canvas.width,canvas.height,label_images,set(x for x in mapped if x in (1,2,3,4))

def clean_source_explanation(lines):
    if not lines: return ''
    parts=[]; started=False
    for raw in lines:
        t=clean_line(raw)
        if not t or t=='<문제 해설>': started=True; continue
        if t.startswith('[해설작성자'):
            if parts: break
            continue
        if t.startswith('[관리자') or t.startswith('[오류') or '오류 신고' in t: continue
        if t.startswith('본 해설집') or t.startswith('기출문제 해설은'): continue
        t=re.sub(r'\[해설작성자[^\]]*\]','',t)
        t=t.replace('==>>','→').replace('-->','→')
        t=re.sub(r'\b(thx|thanks)\b[:)]*','',t,flags=re.I)
        t=re.sub(r'ㅎㅎ+|ㅋㅋ+','',t)
        if t: parts.append(t)
        if len(' '.join(parts))>520: break
    text=' '.join(parts); text=re.sub(r'\s+',' ',text).strip()
    return text[:650]

def short_choice(c):
    c=re.sub(r'\s+',' ',c).strip(); return c if len(c)<=110 else c[:107]+'...'
def conclusion(answer,choice): return f"따라서 {answer}번 ‘{short_choice(choice)}’이 정답입니다."

def calc_cr(q):
    m=re.search(r'레버를\s*([0-9.]+)°.*?레버의 길이가\s*([0-9.]+)cm.*?(?:커서는|지침이)\s*([0-9.]+)cm',q)
    if not m:
        m=re.search(r'레버를\s*([0-9.]+)°.*?(?:커서는|지침이)\s*([0-9.]+)cm.*?레버의 길이가\s*([0-9.]+)cm',q)
        if m: theta,resp,L=map(float,m.groups())
        else: return None
    else: theta,L,resp=map(float,m.groups())
    travel=2*math.pi*L*(theta/360); return travel/resp

def expert_explanation(question,choices,answer,source=''):
    q=question; corr=choices[answer-1]; low=q.lower(); compact=re.sub(r'\s+','',q)
    # calculations / formulas first (원문 띄어쓰기를 유지해 수치 정규식에 사용)
    if 'c/r' in low or '조종-반응' in q or '제어-반응' in q or '제어반응' in q:
        val=calc_cr(q)
        if val:
            return f"C/R비는 조종장치의 이동거리÷표시장치의 반응거리입니다. 회전 레버의 이동거리는 2πL×(θ/360)로 계산하므로 C/R≈{val:.2f}입니다. {conclusion(answer,corr)}"
        return f"C/R비는 조종장치의 이동거리를 표시장치의 반응거리로 나눈 값입니다. 일반적으로 C/R비가 작을수록 장치는 민감해져 이동시간은 짧아지고 정밀 조종에 필요한 시간은 길어집니다. {conclusion(answer,corr)}"

    # ------------------------------------------------------------------
    # 계산형 기출은 일반 개념 설명보다 '공식 -> 수치 대입 -> 판정'을
    # 우선합니다. CBT 학습자가 그대로 계산을 따라갈 수 있는 수준으로
    # 반복 출제되는 대표 공식을 명시적으로 풀이합니다.
    # ------------------------------------------------------------------
    if 'sone' in low and 'phon' in low:
        # 1 sone = 40 phon, 음량수준이 10 phon 증가할 때 sone은 2배.
        ms=re.search(r'([0-9.]+)\s*sone.*?몇\s*phon',q,re.I|re.S)
        if ms:
            s=float(ms.group(1)); phon=40+10*math.log(s,2)
            return f"sone과 phon의 기준은 1 sone=40 phon이며, 10 phon 증가할 때마다 sone 값은 2배가 됩니다. 따라서 {s:g} sone은 40+10·log₂({s:g})={phon:.0f} phon입니다. {conclusion(answer,corr)}"
        mp=re.search(r'(?:phon\D*|음량수준\D*)([0-9.]+).*?sone',q,re.I|re.S)
        if mp:
            phon=float(mp.group(1)); s=2**((phon-40)/10)
            return f"1 sone=40 phon이고 10 phon 증가할 때마다 주관적 음량(sone)은 2배가 됩니다. 따라서 {phon:g} phon은 2^(({phon:g}-40)/10)={s:g} sone입니다. {conclusion(answer,corr)}"
        md=re.search(r'1000\s*Hz\D*([0-9.]+)\s*dB',q,re.I)
        if md:
            db=float(md.group(1)); s=2**((db-40)/10)
            return f"1,000 Hz 순음에서는 dB 값과 phon 값이 같습니다. 따라서 {db:g} dB={db:g} phon이고, sone=2^((phon-40)/10)=2^(({db:g}-40)/10)={s:g} sone입니다. {conclusion(answer,corr)}"

    if '반사율' in compact and '대비' in compact:
        vals=[float(x) for x in re.findall(r'([0-9.]+)\s*%',q)]
        if len(vals)>=2:
            hi,lo=max(vals[:2]),min(vals[:2]); c=(hi-lo)/hi*100
            return f"명암 대비는 밝은 면을 기준으로 C=(ρmax-ρmin)/ρmax×100으로 계산합니다. C=({hi:g}-{lo:g})/{hi:g}×100={c:.1f}%이므로 약 {round(c):d}%입니다. {conclusion(answer,corr)}"

    if ('소음' in compact or '음압' in compact) and '떨어' in compact and 'dB' in q:
        m=re.search(r'([0-9.]+)\s*m.*?([0-9.]+)\s*dB(?:\(A\))?.*?([0-9.]+)\s*m',q,re.I|re.S)
        if m:
            r1,L1,r2=map(float,m.groups()); L2=L1-20*math.log10(r2/r1)
            return f"점음원의 자유음장 거리감쇠는 L₂=L₁-20log₁₀(r₂/r₁)입니다. {r1:g} m에서 {L1:g} dB이므로 {r2:g} m에서는 {L1:g}-20log₁₀({r2:g}/{r1:g})={L2:.1f} dB입니다. {conclusion(answer,corr)}"

    if ('1L' in compact or '1ℓ' in compact) and '산소' in compact and 'kcal' in low:
        return f"작업생리학에서 산소 1 L의 에너지 당량은 일반적으로 약 5 kcal로 봅니다. 따라서 산소소비량(L/min)에 약 5 kcal/L를 곱하면 분당 에너지소비량을 근사할 수 있습니다. {conclusion(answer,corr)}"

    if '소시오메트리' in compact and '응집성' in compact:
        m=re.search(r'([0-9]+)명.*?([0-9]+)\s*쌍',q,re.S)
        if not m: m=re.search(r'([0-9]+)명.*?관계의\s*수가\s*([0-9]+)',q,re.S)
        if m:
            n,pairs=map(int,m.groups()); maxpairs=n*(n-1)/2; idx=pairs/maxpairs
            return f"소시오메트리의 집단 응집성지수는 실제 긍정적 상호관계 수를 가능한 최대 상호관계 수로 나눕니다. {n}명의 최대 쌍은 {n}×({n}-1)/2={maxpairs:.0f}쌍이므로, {pairs}/{maxpairs:.0f}={idx:.3f}입니다. {conclusion(answer,corr)}"

    if '매시간마다' in compact and '에러' in compact and '신뢰도' in compact:
        m=re.search(r'매시간마다([0-9.]+).*?([0-9.]+)시간',compact)
        if m:
            p,t=map(float,m.groups()); R=(1-p)**t
            return f"매 시간의 오류확률이 p={p:g}이고 각 시간이 독립이면, 한 시간의 성공확률은 1-p={1-p:g}입니다. {t:g}시간 연속 무오류 신뢰도는 R=(1-p)^t=({1-p:g})^{t:g}={R:.3f}입니다. {conclusion(answer,corr)}"

    if ('직렬체계' in compact or '직렬시스템' in compact) and '신뢰도' in compact:
        vals=[float(x)/100 for x in re.findall(r'([0-9.]+)\s*%',q)]
        if len(vals)>=2:
            R=vals[0]*vals[1]
            return f"직렬체계는 모든 요소가 성공해야 하므로 전체 신뢰도는 각 요소 신뢰도의 곱입니다. R={vals[0]:.2f}×{vals[1]:.2f}={R:.3f}, 즉 {R*100:.1f}%입니다. {conclusion(answer,corr)}"

    if ('중복' in compact or '2인1조' in compact) and '신뢰도' in compact:
        m=re.search(r'신뢰도(?:가|는)?\s*([0-9.]+)',q)
        if m:
            r=float(m.group(1)); r=r/100 if r>1 else r; R=1-(1-r)**2
            return f"두 작업자 중 한 명만 성공해도 검사 기능이 유지되는 중복(병렬) 구조이므로 두 사람이 동시에 실패할 확률을 제외합니다. R=1-(1-{r:g})²={R:.4f}입니다. {conclusion(answer,corr)}"

    if '도수율' in compact and '강도율' in compact and ('1건당' in compact or '재해1건' in compact):
        m=re.search(r'도수율(?:은|이)?\s*([0-9.]+).*?강도율(?:은|이)?\s*([0-9.]+)',q,re.S)
        if m:
            F,S=map(float,m.groups()); days=1000*S/F
            return f"도수율 F=재해건수×10⁶/연근로시간, 강도율 S=근로손실일수×10³/연근로시간입니다. 두 식을 나누면 재해 1건당 손실일수=1,000·S/F=1,000×{S:g}/{F:g}={days:.0f}일입니다. {conclusion(answer,corr)}"

    if '강도율' in compact and '총근로손실' in compact:
        m=re.search(r'(?:상시\s*)?근로자(?:가|는)?\s*([0-9,]+)명.*?강도율(?:이|은)?\s*([0-9.]+).*?1인당\s*연간\s*([0-9,]+)시간',q,re.S)
        if m:
            n=float(m.group(1).replace(',','')); S=float(m.group(2)); h=float(m.group(3).replace(',','')); total=n*h; days=S*total/1000
            return f"강도율 S=근로손실일수×1,000/연근로시간이므로 손실일수=S×연근로시간/1,000입니다. 연근로시간={n:g}×{h:g}={total:,.0f}시간, 따라서 {S:g}×{total:,.0f}/1,000={days:,.0f}일입니다. {conclusion(answer,corr)}"

    if '도수율' in compact and '상시근로자' in compact and '재해' in compact and '1일' in compact:
        m=re.search(r'근로자(?:가|는)?\s*([0-9,]+)명.*?연간\s*([0-9,]+)건.*?1일\s*([0-9.]+)시간.*?연간\s*([0-9,]+)일',q,re.S)
        if m:
            n=float(m.group(1).replace(',','')); acc=float(m.group(2).replace(',','')); hd=float(m.group(3)); days=float(m.group(4).replace(',','')); total=n*hd*days; F=acc*1_000_000/total
            return f"도수율은 F=재해건수×1,000,000/연근로시간입니다. 연근로시간={n:g}×{hd:g}×{days:g}={total:,.0f}시간이므로 F={acc:g}×1,000,000/{total:,.0f}={F:.2f}입니다. {conclusion(answer,corr)}"

    if '도수율' in compact and '해석' in compact:
        return f"도수율은 연근로시간 1,000,000시간당 발생한 재해건수를 뜻합니다. 즉 도수율 2는 연근로시간 1,000,000시간당 재해가 2건 발생했다는 의미입니다. {conclusion(answer,corr)}"

    if '워크샘플링' in compact and '추정비율' in compact and '허용오차' in compact:
        mp=re.search(r'(?:p\)?(?:이|=)?\s*([0-9.]+))',q)
        mz=re.search(r'(?:2\.58|1\.96)',q)
        me=re.search(r'허용오차(?:는|가)?\s*([0-9.]+)',q)
        if mp and mz and me:
            p=float(mp.group(1)); z=float(mz.group(0)); e=float(me.group(1)); N=z*z*p*(1-p)/(e*e)
            return f"워크샘플링의 필요 관측횟수는 N=z²p(1-p)/e²로 계산합니다. z={z:g}, p={p:g}, e={e:g}를 대입하면 N={z:g}²×{p:g}×{1-p:g}/{e:g}²={N:.1f}이므로 약 {math.ceil(N):,}회가 필요합니다. {conclusion(answer,corr)}"

    if '워크샘플링' in compact and '초기idlerate가0.06' in compact and '허용오차' not in compact:
        return f"워크샘플링의 필요 관측횟수는 N=z²p(1-p)/e²로 산정하므로 추정비율 p와 신뢰계수 z뿐 아니라 허용오차 e가 반드시 필요합니다. 이 기출은 허용오차가 문장에서 누락된 오류 문항이어서 제시 조건만으로 151회를 역산할 수 없으며, 시험 답안은 151회로 처리된 문항입니다. {conclusion(answer,corr)}"

    if '워크샘플링' in compact and '손목' in compact and '200회' in compact and '30번' in compact:
        return f"워크샘플링에서 손목꺾임의 관측비율은 30/200=0.15입니다. 3시간 중 추정 손목꺾임 시간은 180분×0.15=27분이고, 시간당으로 환산하면 27/3=9분/시간입니다. {conclusion(answer,corr)}"

    if '관측횟수' in compact and '관측평균시간' in compact and '표준편차' in compact and '허용오차' in compact:
        m=re.search(r'평균시간(?:은)?\s*([0-9.]+)분.*?표준\s*편차(?:는)?\s*([0-9.]+)분.*?t\([^)]*\)는\s*([0-9.]+)',q,re.S)
        if m:
            mean,sd,t=map(float,m.groups()); e_m=re.search(r'허용오차\s*[±]?\s*([0-9.]+)\s*%',q); e=float(e_m.group(1))/100 if e_m else .05; N=(t*sd/(e*mean))**2
            return f"상대 허용오차를 이용한 필요 관측횟수는 N=(t·s/(e·x̄))²입니다. t={t:g}, s={sd:g}, e={e:g}, x̄={mean:g}를 대입하면 N≈{N:.1f}이므로 충분한 관측횟수는 약 {math.ceil(N):d}회 수준입니다. {conclusion(answer,corr)}"

    if '내경법' in compact and '실측시간' in compact and '레이팅' in compact and '여유율' in compact:
        m=re.search(r'평균이\s*([0-9.]+)분.*?여유율(?:이|은)?\s*([0-9.]+)%.*?레이팅.*?([0-9.]+)%',q,re.S)
        if m:
            obs,A,R=map(float,m.groups()); nt=obs*R/100; st=nt/(1-A/100)
            return f"먼저 정미시간은 {obs:g}×{R/100:g}={nt:.2f}분입니다. 내경법은 여유율이 표준시간에 포함되는 비율이므로 ST=NT/(1-A)={nt:.2f}/(1-{A/100:g})={st:.2f}분입니다. {conclusion(answer,corr)}"

    if '외경법' in compact and '관측평균시간' in compact and '레이팅' in compact and '여유율' in compact:
        m=re.search(r'관측평균시간(?:이|은)?\s*([0-9.]+)분.*?레이팅.*?([0-9.]+)%.*?여유율(?:이|은)?\s*([0-9.]+)%',q,re.S)
        if m:
            obs,R,A=map(float,m.groups()); nt=obs*R/100; st=nt*(1+A/100)
            return f"정미시간 NT={obs:g}×{R/100:g}={nt:.2f}분입니다. 외경법은 정미시간을 기준으로 여유를 더하므로 ST=NT×(1+A)={nt:.2f}×(1+{A/100:g})={st:.2f}분입니다. {conclusion(answer,corr)}"

    if '외경법' in compact and '부품1개' in compact and '관측평균시간' in compact:
        m=re.search(r'관측평균시간(?:이|은)?\s*([0-9.]+)분.*?rating.*?([0-9.]+)%.*?여유율(?:이|은)?\s*([0-9.]+)',q,re.I|re.S)
        if m:
            obs,R,A=map(float,m.groups()); nt=obs*R/100; st=nt*(1+A/100); allowance_clock=480*(A/100)/(1+A/100)
            return f"정미시간은 {obs:g}×{R/100:g}={nt:.2f}분, 외경법 표준시간은 {nt:.2f}×(1+{A/100:g})={st:.2f}분입니다. 외경법 여유율 {A:g}%를 8시간 실근무시간의 여유분으로 환산하면 480×{A/100:g}/(1+{A/100:g})={allowance_clock:.0f}분입니다. {conclusion(answer,corr)}"

    if '여유시간은0.05분' in compact and '관측평균은1분' in compact:
        return f"관측평균 1분에 레이팅 120%를 적용하면 정미시간은 1×1.20=1.20분입니다. 여유시간 0.05분을 포함한 표준시간은 1.25분이고, 내경법 여유율은 0.05/1.25×100=4.0%입니다. {conclusion(answer,corr)}"

    if '8시간근무중에서24분' in compact and '관측시간치의평균' in compact:
        return f"정미시간은 0.6×1.20=0.72분입니다. 8시간 중 여유 24분의 내경법 여유율은 24/480=0.05이므로 ST=0.72/(1-0.05)=0.758분≈0.76분입니다. {conclusion(answer,corr)}"

    if '정미시간(normal time)이5분' in compact and '레이팅계수는110%' in compact:
        return f"이 기출에서는 제시된 5분에 수행도 110%를 보정해 정상시간 5×1.10=5.5분으로 보고, 정미시간 기준 여유 10%를 더해 5.5×1.10=6.05분으로 계산합니다. 보기에서는 약 6분입니다. {conclusion(answer,corr)}"

    if 'Murrell' in q or 'murrell' in low:
        # E: 작업 에너지, A: 허용 평균 에너지, B: 휴식 에너지, T: 작업-휴식 총시간
        # R=T(E-A)/(E-B)
        if '1.5L/min' in compact and '4시간' in compact:
            E=1.5*5; A=5; B=1.5; T=240; R=T*(E-A)/(E-B)
            return f"Murrell 휴식식은 R=T(E-A)/(E-B)입니다. 산소소비량 1.5 L/min은 약 {E:g} kcal/min(산소 1 L≈5 kcal), 허용 평균 A=5, 휴식대사 B≈1.5로 두면 R=240×({E:g}-5)/({E:g}-1.5)={R:.0f}분입니다. {conclusion(answer,corr)}"
        if all(x in compact for x in ['휴식중의에너지소비량이1.5kcal/min','평균8kcal','60분','5kcal/min']):
            B,E,T,A=1.5,8,60,5; R=T*(E-A)/(E-B)
            return f"Murrell식은 R=T(E-A)/(E-B)입니다. 총시간 T=60분, 작업대사 E=8, 허용평균 A=5, 휴식대사 B=1.5 kcal/min이므로 R=60×(8-5)/(8-1.5)=27.7분, 약 28분입니다. {conclusion(answer,corr)}"
        if all(x in compact for x in ['평균에너지값이6kcal/min','60분','상한은4kcal/min']):
            B,E,T,A=1.5,6,60,4; R=T*(E-A)/(E-B)
            return f"Murrell식 R=T(E-A)/(E-B)를 적용합니다. E=6, 허용평균 A=4, 휴식대사 B=1.5 kcal/min, T=60분이므로 R=60×(6-4)/(6-1.5)=26.7분입니다. {conclusion(answer,corr)}"
        m=re.search(r'휴식.*?([0-9.]+)kcal/min.*?평균\s*([0-9.]+)kcal.*?([0-9.]+)분.*?권장.*?([0-9.]+)kcal/min',q,re.S)
        if m:
            B,E,T,A=map(float,m.groups()); R=T*(E-A)/(E-B)
            return f"Murrell식 R=T(E-A)/(E-B)를 사용합니다. T={T:g}분, 작업에너지 E={E:g}, 허용 평균 A={A:g}, 휴식에너지 B={B:g}이므로 R={T:g}×({E:g}-{A:g})/({E:g}-{B:g})={R:.1f}분, 약 {round(R):d}분입니다. {conclusion(answer,corr)}"

    if '에너지대사율' in compact and '산소소비량' in compact and '기초대사량' in compact:
        m=re.search(r'작업시산소소비량이?([0-9.]+)L/min.*?안정시산소소비량이?([0-9.]+)L/min.*?기초대사량이?([0-9.]+)kcal/min',compact,re.I)
        if m:
            work,rest,bmr=map(float,m.groups()); net=(work-rest)*5; rmr=net/bmr
            return f"RMR은 작업으로 추가된 에너지소비량을 기초대사량으로 나눈 값입니다. 순산소소비량=({work:g}-{rest:g})={work-rest:g} L/min, 에너지로는 ×5={net:g} kcal/min이므로 RMR={net:g}/{bmr:g}={rmr:.2f}입니다. {conclusion(answer,corr)}"

    if 'NIOSH' in q and ('LiftingIndex' in compact or '들기지수' in compact):
        m=re.search(r'권장무게한계(?:가|는)?\s*([0-9.]+)kg.*?무게(?:가|는)?\s*([0-9.]+)kg',q,re.S)
        if m:
            rwl,load=map(float,m.groups()); li=load/rwl
            return f"NIOSH 들기지수는 LI=실제 하중/RWL입니다. LI={load:g}/{rwl:g}={li:.2f}로 1을 초과하므로 권고수준을 넘는 작업이며 요통·근골격계 부담이 증가해 개선 검토가 필요합니다. {conclusion(answer,corr)}"

    if '공정효율' in compact and all(x in compact for x in ['3분','5분','4분']):
        eff=(3+5+4)/(3*5)*100
        return f"사이클타임은 가장 긴 공정시간인 5분입니다. 공정효율=총 작업시간/(작업장 수×사이클타임)×100=(3+5+4)/(3×5)×100={eff:.0f}%입니다. {conclusion(answer,corr)}"

    if '주머니로운반' in compact and '15.2TMU' in compact:
        return f"동시에 수행되는 결합동작은 가장 오래 걸리는 동작의 시간이 그 구간 시간을 결정합니다. 중간 결합구간은 max(15.2, 5.6, 4.1)=15.2 TMU이고, 제시표의 앞·뒤 동작 5.6 TMU씩을 더하면 5.6+15.2+5.6=26.4 TMU입니다. {conclusion(answer,corr)}"

    if '중간정도의의존성(15%)' in compact and 'HEP' in q and 'THERP' in q:
        return f"THERP의 중간 의존도 15%에서는 조건부 실패확률을 P(A|B)=d+(1-d)P(A)로 계산합니다. d=0.15, 기초 HEP=0.001이므로 0.15+0.85×0.001=0.15085≈0.151입니다. {conclusion(answer,corr)}"

    if '의식수준과주의력' in compact:
        return f"의식수준은 0단계(무의식·수면), I단계(의식 흐림·피로/단조), II단계(편안하고 안정된 상태), III단계(명료하고 적극적인 상태), IV단계(과긴장·공황)로 구분합니다. 작업 신뢰도와 주의력은 III단계에서 가장 높고, 0·I·IV단계에서는 낮아집니다. {conclusion(answer,corr)}"

    if ('팔꿈치의반작용력' in compact and 'CG1' in q and 'CG2' in q):
        # 기출 그림: W1=98 N at 35.5 cm, W2=15.7 N at 17.2 cm.
        reaction=98+15.7; moment=98*0.355+15.7*0.172
        return f"팔꿈치를 회전축으로 정적 평형을 적용합니다. 수직 반작용력은 W₁+W₂=98+15.7={reaction:.1f} N이고, 모멘트는 98×0.355+15.7×0.172={moment:.1f} N·m입니다. {conclusion(answer,corr)}"

    if '팔꿈치' in compact and '10kg' in compact and '1.3kg' in compact and '반작용' in compact:
        reaction=(10+1.3)*9.8
        return f"이 문항은 팔꿈치에 작용하는 수직 반작용력의 크기만 묻습니다. 정적 평형에서 Re=(10+1.3)×9.8={reaction:.1f} N이며, 제시된 거리값은 모멘트를 구할 때 사용하는 값입니다. {conclusion(answer,corr)}"

    if '평균흡기량' in compact and '배기량' in compact and '산소' in compact and 'L/min' in q:
        m0=re.search(r'평균흡기량과배기량이각각([0-9.]+)L/min과([0-9.]+)L/min.*?산소.*?([0-9.]+)%.*?산소.*?([0-9.]+)%',compact,re.I)
        if m0:
            vi,ve,feo2,fio2=map(float,m0.groups()); vo2=vi*fio2/100-ve*feo2/100
            return f"분당 산소소비량은 흡기 중 산소량에서 배기 중 산소량을 뺍니다. VO₂={vi:g}×{fio2/100:g}-{ve:g}×{feo2/100:g}={vo2:.1f} L/min입니다. {conclusion(answer,corr)}"
        m=re.search(r'평균흡기량.*?([0-9.]+)L/min.*?배기량.*?([0-9.]+)L/min.*?산소.*?([0-9.]+)%.*?산소.*?([0-9.]+)%',compact,re.I)
        if m:
            vi,ve,feo2,fio2=map(float,m.groups()); vo2=vi*fio2/100-ve*feo2/100
            return f"분당 산소소비량은 흡기 중 산소량에서 배기 중 산소량을 뺍니다. VO₂={vi:g}×{fio2/100:g}-{ve:g}×{feo2/100:g}={vo2:.1f} L/min입니다. {conclusion(answer,corr)}"

    if '흡기량은40L/min' in compact and '배기량은30L/min' in compact and '15%' in compact:
        vo2=40*.21-30*.15
        return f"흡기 공기의 산소농도를 21%로 두면 산소소비량은 VO₂=40×0.21-30×0.15=8.4-4.5={vo2:.1f} L/min입니다. {conclusion(answer,corr)}"

    if '10분간산소소비량' in compact and '100리터배기량' in compact and '산소가15%' in compact and '이산화탄소가6%' in compact:
        # 배기 100 L/10 min = 10 L/min, 질소비 보정 후 이 기출 조건에서는 약 0.6 L/min.
        return f"배기량은 100 L/10분=10 L/min입니다. 배기 중 O₂ 15%, CO₂ 6%이므로 질소는 79%로 흡기 공기의 질소비와 같아 흡기량도 약 10 L/min으로 볼 수 있습니다. 따라서 VO₂=10×(0.21-0.15)=0.60 L/min입니다. {conclusion(answer,corr)}"

    if '더글라스백' in compact and '배기량이75L' in compact and '산소가16%' in compact and '이산화탄소' in compact:
        ve=75/5; feo2=.16; feco2=.04; fen2=1-feo2-feco2; vin2=.79; fio2=.21
        vi=ve*fen2/vin2; vo2=vi*fio2-ve*feo2; kcal=vo2*5
        return f"5분 배기 75 L이므로 Vₑ=15 L/min입니다. Haldane 보정으로 Vᵢ=15×(1-0.16-0.04)/0.79={vi:.3f} L/min, VO₂=Vᵢ×0.21-15×0.16={vo2:.4f} L/min입니다. 산소 1 L≈5 kcal를 적용하면 에너지는 약 {kcal:.2f} kcal/min입니다. {conclusion(answer,corr)}"

    if '평균심박수' in compact and '일박출량' in compact and '심박출량' in compact:
        m=re.search(r'평균심박수는([0-9.]+)회/분.*?일박출량.*?([0-9.]+)mL',compact,re.I)
        if m:
            hr,sv=map(float,m.groups()); co=hr*sv/1000
            return f"심박출량은 CO=심박수(HR)×1회박출량(SV)입니다. {hr:g}회/min×{sv:g} mL/회={hr*sv:g} mL/min={co:.1f} L/min입니다. {conclusion(answer,corr)}"

    if 'Cd의점광원' in compact and '조도' in compact:
        m=re.search(r'([0-9.]+)Cd.*?([0-9.]+)m',compact,re.I)
        if m:
            I,d=map(float,m.groups()); E=I/(d*d)
            return f"점광원의 수직 조도는 역제곱법칙 E=I/d²를 사용합니다. I={I:g} cd, d={d:g} m이므로 E={I:g}/{d:g}²={E:g} lux입니다. {conclusion(answer,corr)}"

    compact_num=compact.replace(',','')
    if ('상시작업자' in compact or '상시근로자' in compact) and '강도율이0.6' in compact and '2400시간' in compact_num:
        m=re.search(r'(?:상시작업자|상시근로자).*?([0-9,]+)명',compact)
        if m:
            n=float(m.group(1).replace(',','')); total=n*2400; loss=.6*total/1000
            return f"강도율=근로손실일수×1,000/연근로시간입니다. 연근로시간={n:g}×2,400={total:,.0f}시간이므로 손실일수=0.6×{total:,.0f}/1,000={loss:,.0f}일입니다. {conclusion(answer,corr)}"

    # PDF 줄바꿈 때문에 단어 사이에 끼어든 공백은 개념 분류 단계에서 제거합니다.
    q = re.sub(r'\s+', '', q) + ' ' + re.sub(r'\s+', '', corr)
    low = q.lower()
    if 'fitts' in low or '피츠' in q:
        return f"Fitts 법칙에서 이동시간은 목표까지의 거리 D가 길고 표적 폭 W가 작을수록 증가합니다(MT=a+b·log₂(2D/W)). 즉 멀고 작은 표적일수록 난이도가 높습니다. {conclusion(answer,corr)}"
    if '정보량' in q or '정보 이론' in q or '정보이론' in q or 'hick' in low:
        if 'hick' in low:
            return f"Hick-Hyman 법칙은 선택대안의 수가 늘수록 선택반응시간이 log₂N에 비례해 증가한다는 관계입니다. 대안 수 자체에 단순 비례하는 것이 아니라 정보량에 비례한다는 점이 핵심입니다. {conclusion(answer,corr)}"
        return f"정보이론에서 사건 하나의 정보량은 I=log₂(1/p), 동일 확률의 N개 대안에 대한 정보량은 H=log₂N으로 나타냅니다. 발생이 확실할수록 정보량은 작고 불확실성이 클수록 정보량은 커집니다. {conclusion(answer,corr)}"
    if '신호검출' in q or 'signal detection' in low or '허위' in q and '경보' in q:
        return f"신호검출이론은 실제 신호 유무와 판단 결과를 Hit, Miss, False Alarm, Correct Rejection으로 구분합니다. 판정기준이 보수적으로 이동하면 신호라고 판단하는 빈도가 줄어 허위경보는 감소하지만 누락은 증가할 수 있습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['인체측정','인체 측정','인체치수','퍼센타일','백분위','오금 높이','좌판','작업공간','작업 공간']):
        return f"인체측정 설계의 기본은 ‘작은 사람이 닿아야 하는 범위는 최소치, 큰 사람이 들어가야 하는 여유공간은 최대치, 개인차가 큰 항목은 조절식’입니다. 기능적 치수는 실제 동작범위에서 측정하고 구조적 치수는 정적 표준자세에서 측정합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['시력','망막','수정체','동공','원추','간상','암순응','명순응','황반','시각','조도','휘도','반사율','대비']):
        return f"시각계에서는 망막의 원추체가 색과 세부 식별, 간상체가 저조도 시각에 주로 관여하며 황반 중심부에서 시력이 가장 높습니다. 조도는 표면에 도달하는 빛, 휘도는 표면에서 눈으로 오는 밝기의 척도라는 구분도 중요합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['청각','음압','소음','phon','sone','은폐','차폐','주파수','진동수','경보신호','경계신호']):
        return f"청각 설계에서는 신호가 배경소음에 묻히지 않도록 주파수와 세기를 구분하고, 즉각적인 주의 환기가 필요할 때 청각 표시를 우선합니다. masking(은폐)은 한 소리가 다른 소리의 검출을 방해하는 현상이며 phon은 음량수준, sone은 주관적 음량의 비율척도입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['표시장치','표시 장치','동침','동목','계수형','디지털','아날로그','눈금','조종장치','제어장치']):
        return f"표시장치는 목적에 따라 정확한 수치 판독에는 디지털/계수형, 변화의 방향·추세 파악에는 아날로그 표시가 유리합니다. 눈금·지침은 시차오류를 줄이고 조작 방향과 표시 변화가 자연스럽게 양립하도록 설계해야 합니다. {conclusion(answer,corr)}"
    if '양립성' in q or 'compatibility' in low:
        return f"인간공학의 양립성은 공간적 양립성, 운동 양립성, 개념적 양립성처럼 사용자의 기대와 표시·조작의 관계를 일치시키는 원칙입니다. 사용자가 예상하는 방향과 의미를 따를수록 오류와 반응시간이 줄어듭니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['기억','주의','시배분','정보처리','아이코닉','단기기억','작업기억','장기기억','7±2','7+2']):
        return f"인간의 정보처리는 감각저장→작업(단기)기억→장기기억의 흐름으로 이해합니다. 작업기억의 용량은 제한적이며, 여러 과업에 주의를 나누는 시배분은 처리자원이 겹칠수록 수행 저하가 커집니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['사용성','휴리스틱','User Test','Focus Group','Observation Ethnography','인터페이스']):
        return f"사용성 평가는 효율성, 학습용이성, 기억용이성, 오류, 만족도 등을 중심으로 봅니다. 휴리스틱 평가는 전문가가 원칙에 따라 점검하는 방법이고, 사용자 테스트·현장관찰은 실제 사용자의 수행과 행동을 확인하는 방법입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['인간-기계','인간기계','시스템','체계']) and any(k in q for k in ['신뢰도','직렬','병렬']):
        return f"직렬 시스템의 신뢰도는 각 요소 신뢰도의 곱(R=R₁R₂…)이고, 병렬 중복 시스템은 모든 요소가 동시에 실패할 확률을 제외해 계산합니다. 따라서 중복 설계는 일반적으로 시스템 신뢰도를 높입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['인간-기계','인간기계','시스템 설계','체계분석','체계 분석']):
        return f"인간-기계 시스템 설계의 목적은 인간의 능력·한계를 고려해 인간과 기계에 기능을 적절히 배분하고 전체 시스템의 안전성과 성능을 높이는 것입니다. 인간에게는 판단·유연성, 기계에는 반복성·속도·정밀성이 상대적으로 유리합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['실험','분산','상관','유의수준','종속 변수','독립 변수','피험자']):
        return f"실험설계에서는 독립변수를 조작하고 그 영향으로 변하는 종속변수를 측정합니다. 통계 해석에서는 분산은 자료의 퍼짐, 상관계수는 두 변수의 선형관계, 유의수준은 제1종 오류를 허용하는 기준으로 구분합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['근육','근력','관절','심박','산소','MAP','에너지','대사','혈액','젖산','순환기']):
        return f"작업생리학에서는 작업강도가 증가할수록 산소섭취량·심박수·심박출량이 증가하고, 근육의 정적 수축은 혈류를 제한해 피로가 빨리 누적될 수 있습니다. MAP(최대산소소비능력)은 개인의 유산소 작업능력을 평가하는 대표 지표입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['WBGT','고열','한랭','열스트레스','실효온도','온열','체온']):
        return f"온열환경 평가는 기온뿐 아니라 습도·복사열·기류와 작업강도를 함께 고려해야 합니다. WBGT는 고열작업의 열스트레스를 평가하는 대표 지수이며, 작업-휴식 배분과 수분·염분 보충 등 관리대책과 연계합니다. {conclusion(answer,corr)}"
    if '진동' in q:
        return f"진동의 영향은 주파수, 진폭, 노출시간과 신체 전달경로에 따라 달라집니다. 전신진동과 국소진동은 영향을 받는 신체부위와 관리기준이 다르므로 문제에서 제시한 주파수대와 작업형태를 구분해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['모멘트','반작용력','생체역학','허리','압축력']) and any(ch.isdigit() for ch in q):
        return f"생체역학 문제는 관절을 회전축으로 두고 힘×모멘트팔의 합이 평형을 이루도록 계산합니다(ΣM=0). 물체가 몸에서 멀어질수록 모멘트팔이 커져 관절·허리에 필요한 근력이 증가합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['스트레스','셀리에','Selye','Yerkes','A형','B형','직무 스트레스']):
        return f"직무스트레스는 요구도와 개인의 대처능력·통제수준의 불균형에서 커질 수 있으며, Selye의 일반적응증후군은 경고→저항→소진 단계로 설명합니다. 적정 각성수준을 넘어서면 수행이 저하될 수 있다는 점도 핵심입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['Maslow','매슬로','Alderfer','ERG','Herzberg','허즈버그','McGregor','동기','욕구','X이론','Y이론']):
        return f"동기이론은 욕구의 수준과 직무에서 작동하는 요인을 구분해 이해해야 합니다. Maslow는 5단계 욕구, Alderfer는 존재·관계·성장(ERG), Herzberg는 위생요인과 동기요인, McGregor는 X·Y이론으로 인간관을 설명합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['리더','리더십','조직','권한','직계식','참모']):
        return f"조직·리더십 문제는 권한의 원천과 조직구조의 특징을 구분하는 것이 핵심입니다. 직계식은 명령계통이 단순하고 책임이 명확하며, 보상·강압·합법·전문성 권한은 영향력을 행사하는 근거가 서로 다릅니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['휴먼에러','휴먼 에러','human error','실수','착오','위반','omission','commission','THERP']):
        return f"휴먼에러는 의도와 행동의 단계에 따라 slip(의도는 맞지만 실행이 잘못됨), mistake(판단·계획 자체가 잘못됨), violation(규칙의 의도적 위반) 등으로 구분합니다. THERP는 작업단계를 분석해 인간오류확률을 정량적으로 평가하는 기법입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['FTA','FMEA','ETA','결함나무','고장모드','사상나무','안전분석','신뢰성 블록']):
        return f"시스템 안전분석에서 FTA는 정상사상에서 원인을 거슬러 내려가는 연역적 분석, ETA는 초기사상 이후 결과를 전개하는 귀납적 분석, FMEA는 고장모드와 영향을 체계적으로 검토하는 정성·반정량 분석입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['하인리히','Heinrich','버드','Bird','재해','불안전한 행동','불안전한 상태']):
        return f"재해예방 이론은 사고의 직접원인인 불안전한 행동·상태뿐 아니라 관리적·조직적 근본원인을 함께 통제해야 한다는 점을 강조합니다. 문제에서 요구하는 이론의 단계와 원인 분류를 정확히 대응시키는 것이 핵심입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['워크샘플링','work sampling','표준시간','정미시간','레이팅','여유율','시간연구','스톱워치']):
        return f"작업측정에서는 관측시간에 레이팅을 적용해 정미시간을 구하고, 여유율을 반영해 표준시간을 산정합니다. 워크샘플링은 임의 시점의 관측 비율로 작업상태를 추정하므로 긴 주기·비반복 작업이나 여러 작업자를 동시에 관측할 때 유리합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['MTM','MOST','PTS','서블릭','Therblig','동작경제','공정도','ECRS','파레토','간트']):
        return f"작업연구는 불필요한 동작을 제거하고 방법을 표준화해 생산성과 안전성을 높이는 것이 목적입니다. ECRS는 제거(Eliminate)·결합(Combine)·재배열(Rearrange)·단순화(Simplify)의 순서로 개선안을 검토합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['NIOSH','들기','중량물','RWL','LI','Lifting']):
        return f"NIOSH 들기식은 수평거리, 수직위치·이동거리, 비대칭각도, 빈도, 결합상태 등을 보정해 권고중량한계(RWL)를 구하고 실제 중량과의 비(LI)를 평가합니다. 하중을 몸에 가깝게 하고 비틀림을 줄일수록 부담이 감소합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['OWAS','RULA','REBA','작업자세','자세 평가']):
        return f"자세평가기법은 관찰한 신체부위의 자세와 하중·반복성을 점수화해 개선 우선순위를 정합니다. OWAS는 허리·팔·다리 자세와 하중을 코드화하고, RULA는 상지 중심, REBA는 전신 자세 평가에 주로 사용됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['근골격계','수근관','건초염','백색수지','외상과염','결절종','부담작업']):
        return f"근골격계질환은 반복동작, 과도한 힘, 부자연스러운 자세, 진동, 접촉스트레스 등이 복합적으로 작용해 발생합니다. 수근관증후군은 손목의 정중신경 압박, 백색수지증은 진동에 의한 말초혈관 장애와 관련됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['인간공학','ergonomics','HumanFactors']):
        return f"인간공학은 사람을 기계에 맞추는 것이 아니라 인간의 신체적·인지적 특성과 한계에 맞게 작업·도구·환경을 설계하여 안전, 편의, 효율을 함께 높이는 학문입니다. {conclusion(answer,corr)}"

    # ---- 인간공학개론: 감각·인지·평가·설계 세부 개념 ----
    if any(k in q for k in ['Weber','웨버','JND','최소변화감지역']):
        return f"Weber 법칙은 감각할 수 있는 최소 변화량 ΔI가 기준자극 I에 대해 일정한 비율(ΔI/I)을 갖는다는 법칙입니다. Weber비가 작을수록 작은 자극 변화도 구별할 수 있어 감각 민감도가 높습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['외이와중이','고막','달팽이관','귀의청각과정','공기전도','액체전도']):
        return f"소리는 외이의 공기전도→중이의 기계적 진동 전달→내이 달팽이관의 액체전도와 신경변환 순으로 처리됩니다. 외이와 중이의 경계는 고막이며, 내이의 유모세포가 주파수 정보를 신경신호로 바꿉니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['반응시간','신체반응시간']):
        return f"단순 반응시간은 자극을 감지한 뒤 동작을 시작하기까지의 시간입니다. 일반적으로 청각 자극의 단순 반응이 시각 자극보다 빠르며, 선택해야 할 대안이 많아질수록 Hick-Hyman 법칙에 따라 반응시간이 증가합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['후각','냄새']):
        return f"후각은 특정 냄새에 빠르게 순응하는 특성이 있어 지속 경보수단으로는 한계가 있습니다. 절대적인 냄새 식별보다 상대적인 강도 비교가 쉬우며 훈련을 통해 식별능력을 향상시킬 수 있습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['피부','통각','압각','온각','냉각','촉각']):
        return f"피부감각에는 압력·접촉, 온도 변화, 통증 등이 포함되며 미각은 피부감각이 아닙니다. 촉각 민감도는 신체부위와 피부온도에 따라 달라지고 손가락 끝이 세밀한 식별에 유리합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['통화이해도','명료도지수','통화간섭','SIL','AI(']):
        return f"통화 이해도는 음성 신호가 소음 속에서 얼마나 정확히 전달되는지를 평가합니다. 명료도지수(AI)와 통화간섭수준(SIL)처럼 음성과 배경소음의 관계를 반영하는 척도를 사용하며 단순한 소음 인식수준과는 구분합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['제1종오류','제2종오류','검출력','유의수준']):
        return f"제1종 오류는 참인 귀무가설을 기각하는 오류로 확률을 α(유의수준)로 둡니다. 제2종 오류는 거짓 귀무가설을 기각하지 못하는 오류 β이며, 검정력은 1-β입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['타당성','신뢰성','민감성','무오염성','평가척도','기준척도']):
        return f"좋은 평가척도는 측정하려는 목적을 제대로 반영하는 타당성, 반복 시 일관된 결과를 주는 신뢰성, 차이를 구별하는 민감성, 다른 변수의 영향을 받지 않는 무오염성을 갖춰야 합니다. 용어의 정의를 서로 바꾸어 놓은 선택지를 주의해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['부품배치','구성요소배치','공간배치','공간의구성요소','작업대공간배치']):
        return f"작업공간의 구성요소는 중요도, 사용빈도, 사용순서, 기능적 연관성을 기준으로 배치합니다. 자주 쓰거나 중요한 조작부는 정상 작업영역의 편리한 위치에 두어 이동거리와 탐색시간을 줄이는 것이 원칙입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['암호','코드화','coding','Coding']):
        return f"정보 코딩은 검출성, 변별성, 양립성, 표준성을 확보해야 합니다. 서로 다른 코드가 확실히 구별되고 사용자가 이미 가진 의미 연상과 일치해야 하며, 필요하면 색·형태·크기 등 여러 차원을 중복해 오류를 줄입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['광도','candela','lux','lumen','lambert','빛의밀도']):
        return f"광도는 광원이 특정 방향으로 내는 빛의 세기로 단위는 candela(cd), 조도는 표면에 도달하는 광속밀도로 lux(lx)를 사용합니다. 휘도는 관찰 방향에서 보이는 표면 밝기를 나타내므로 세 용어를 구분해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['깊이','3차원','상대적크기','직선조망','입체']):
        return f"깊이 지각은 양안시차뿐 아니라 상대적 크기, 선원근법, 겹침, 명암과 그림자 같은 단안 단서를 이용합니다. 단순한 시각적 탐색은 물체의 깊이를 알려주는 기하학적 단서가 아닙니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['광삼현상','irradiation']):
        return f"광삼(irradiation)은 밝은 영역이 주변의 어두운 영역으로 번져 실제보다 크게 보이는 시각현상입니다. 밝기 대비가 클수록 두드러지므로 표시장치 설계에서 선 굵기와 배경 대비를 함께 고려합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['7자리를','전화기','청크','chunk']):
        return f"작업기억의 제한된 용량을 보완하려면 여러 정보를 의미 있는 묶음(chunk)으로 조직하는 것이 효과적입니다. 전화번호처럼 긴 숫자열은 3~4자리 정도의 묶음으로 나누면 기억과 재생이 쉬워집니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['고령자','노령자']):
        return f"고령자를 위한 정보설계는 감각기능 저하와 처리속도 감소를 고려해 불필요한 이중과업을 줄이고, 글자·신호를 충분히 크게 하며, 학습·반응시간에 여유를 주는 것이 핵심입니다. 지나치게 세밀하고 많은 정보는 인지부하를 높이므로 바람직하지 않습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['인간이기계를능가','기계가인간보다','인간과기계의역할']):
        return f"기계는 빠른 반복처리·정밀성·대량 정보저장에 강하고, 인간은 예상 밖 상황의 해석, 새로운 해결책의 탐색, 유연한 판단에 상대적으로 강합니다. 기능배분은 이 장단점을 기준으로 해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['시스템설계과정','설계과정']):
        return f"시스템 설계는 목표·성능명세를 먼저 정하고 시스템을 정의한 뒤 기본설계와 인간-기계 계면설계를 구체화하고 시험·평가로 검증하는 흐름을 따릅니다. 상위 목표가 정해지기 전에 세부 인터페이스부터 설계하는 순서는 적절하지 않습니다. {conclusion(answer,corr)}"

    # ---- 작업생리학: 해부·생리·조명·온열 세부 개념 ----
    if any(k in q for k in ['Oxford','옥스퍼드']):
        return f"Oxford 지수는 고온환경을 습구온도와 건구온도로 종합하는 지수로, 습구온도에 더 큰 가중치를 둡니다(OI≈0.85×습구+0.15×건구). 주어진 온도를 식에 대입해 계산합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['혈류량','혈류분포','혈액의분포']):
        return f"격한 작업에서는 활동근육과 심장·피부로 혈류가 재분배되고 소화기관·신장 등으로 가는 혈류는 감소합니다. 뇌혈류는 비교적 일정하게 유지되는 것이 특징입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['뇌파','알파','베타','세타','델타','EEG']):
        return f"뇌파는 각성상태에 따라 달라집니다. α파(약 8~13 Hz)는 눈을 감고 편안히 깨어 있을 때, β파는 긴장·정신활동 시, θ파는 졸림·얕은 수면, δ파는 깊은 수면에서 주로 나타납니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['심방수축','P파','QRS','심전도','ECG']):
        return f"심전도에서 P파는 심방의 탈분극, QRS군은 심실 탈분극, T파는 심실 재분극을 나타냅니다. 따라서 심방수축 직전의 전기적 사건은 P파와 대응합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['전완','회내','회외','굴곡','신전','외전','내전','해부학적자세']):
        return f"해부학적 동작은 기준자세를 중심으로 구분합니다. 굴곡은 관절각을 감소시키고 신전은 증가시키며, 전완의 회외(supination)는 손바닥을 위·앞쪽으로, 회내(pronation)는 아래·뒤쪽으로 돌리는 동작입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['시상면','관상면','전두면','횡단면','좌우로나누','전·후로나누','전후로나누']):
        return f"해부학적 면에서 시상면은 신체를 좌·우, 관상(전두)면은 전·후, 횡단면은 상·하로 나눕니다. 문제의 분할 방향을 기준으로 면의 명칭을 대응시키면 됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['교대작업','교대근무','야간근무','생체리듬','일주기']):
        return f"교대근무는 일주기 생체리듬을 교란하므로 야간근무의 연속횟수와 회전주기를 관리하고 충분한 휴식을 확보해야 합니다. 심야~새벽에는 각성수준과 체온이 낮아져 졸음과 오류가 증가하기 쉽습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['중추신경계','자율신경계','교감','부교감','신경계','반사와통합']):
        return f"중추신경계는 뇌와 척수로 구성되어 정보의 통합과 반사를 담당합니다. 자율신경계에서 교감신경은 활동·긴장 시 심박 증가 등 각성을 높이고, 부교감신경은 휴식·회복 기능을 촉진합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['골격','경추','흉추','요추','척추','조혈']):
        return f"골격은 신체 지지·장기 보호·운동의 지렛대 역할과 조혈·무기질 저장 기능을 합니다. 척추는 경추 7개, 흉추 12개, 요추 5개가 기본이며 천추·미추는 성인에서 융합됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['Borg','RPE','주관적으로지각','평점등급']):
        return f"Borg RPE는 작업자가 느끼는 주관적 운동강도를 보통 6~20 척도로 평가하는 방법입니다. 값에 약 10을 곱하면 심박수 수준과 대략 대응하도록 설계되어 현장 작업부하 평가에 활용됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['호흡계','폐환기','호흡']):
        return f"호흡계의 핵심 기능은 산소를 체내로 공급하고 이산화탄소를 배출하며 산-염기 평형 유지에 기여하는 것입니다. 운동강도가 높아지면 산소 요구량 증가에 따라 환기량도 증가합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['열교환','전도','대류','복사','증발']):
        return f"인체와 환경 사이의 열교환은 전도, 대류, 복사, 증발의 네 경로로 이루어집니다. 고온환경에서는 땀의 증발이 중요한 방열수단이며 습도가 높으면 증발효율이 떨어져 열부담이 커집니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['휘광','눈부심','반사휘광','조명','VDT']):
        return f"눈부심은 광원의 직접 노출이나 화면·작업면의 반사로 생기며 시인성과 피로를 악화시킵니다. 광원을 시선에서 벗어나게 배치하고 확산·차광, 무광택 표면, 적절한 화면 방향으로 반사를 줄이는 것이 원칙입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['골격근','수의근','불수의근','근섬유','연축','T관','운동단위']):
        return f"골격근은 수의적으로 조절되며 운동단위는 하나의 운동신경과 그 신경이 지배하는 근섬유군입니다. 근수축 시 액틴과 마이오신 필라멘트 길이는 거의 변하지 않고 서로 미끄러지며, T관은 흥분을 근섬유 내부로 전달합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['RMR','상대대사율','대사','기초대사','에너지전환']):
        return f"에너지대사는 영양소의 화학에너지를 기계적 일과 열로 전환하는 과정입니다. RMR은 작업 시 추가된 대사량을 기초대사량과 비교해 상대적 작업강도를 나타내는 지표로 사용합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['정적평형','평형상태','시소','힘의총합','외부모멘트']):
        return f"정적 평형의 조건은 모든 힘의 벡터합이 0이고 동시에 모든 모멘트의 합도 0인 것입니다(ΣF=0, ΣM=0). 시소 문제는 회전축에 대한 ‘힘×거리’가 양쪽에서 같도록 계산합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['정신피로','중추신경계의피로','플리커','CFF']):
        return f"중추성·정신적 피로는 임계융합주파수(CFF, flicker), 뇌파, 반응시간, 주관적 피로도 등의 변화로 평가할 수 있습니다. 단순한 근력이나 국소 근전도만으로 정신피로를 직접 평가하기는 어렵습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['환기기준','전체환기','공기정화','환기']):
        return f"환기는 오염물질을 제거하거나 희석해 작업환경 농도를 관리하는 수단입니다. 발생원이 특정된 고농도 유해물질은 국소배기가 우선이며, 저독성 물질이 넓게 분산되는 경우 전체환기를 적용하는 것이 기본입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['가시광선','파장']):
        return f"사람이 볼 수 있는 가시광선은 대략 380~780 nm 범위이며, 짧은 파장 쪽이 보라·파랑, 긴 파장 쪽이 주황·빨강에 해당합니다. 자외선과 적외선은 가시범위 밖입니다. {conclusion(answer,corr)}"

    # ---- 산업심리학·안전관리: 집단, 법규, 인간신뢰도, 재해지표 ----
    if any(k in q for k in ['집단','응집성','응집력','소시오메트리','sociometry','군중','모브','갈등']):
        return f"집단역학에서는 구성원 간 상호매력과 결속을 응집성으로 보며, sociometry는 선호·거부 관계를 조사해 집단 내 관계구조를 분석합니다. 갈등관리에서는 회피는 자기·상대 관심 모두 낮고, 협력은 양쪽 관심이 모두 높은 전략입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['제조물책임','제조물책임법','PL','결함','리콜']):
        return f"제조물책임의 대표 결함은 제조상 결함, 설계상 결함, 표시·경고상의 결함입니다. 합리적인 대체설계를 채택하지 않아 위험이 남으면 설계결함, 필요한 설명·경고가 부족하면 표시결함이며 리콜은 위험제품을 회수·수리·교환하는 시정조치입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['managementgrid','관리그리드','매니지리얼그리드']):
        return f"Management Grid는 생산에 대한 관심과 인간에 대한 관심을 각각 1~9 수준으로 평가합니다. 대표적으로 (9,9)는 팀형, (9,1)은 과업형, (1,9)는 인기·컨트리클럽형, (1,1)은 무관심형입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['Lewin','Levin','레윈','레빈','B=f']):
        return f"Lewin의 행동방정식은 B=f(P,E)로, 행동(B)은 개인(P)의 특성과 환경(E)의 상호작용 결과라고 봅니다. 개인 요인과 환경 요인을 서로 바꾸어 해석하지 않는 것이 핵심입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['3E','Harvey','하비']):
        return f"안전대책의 3E는 Engineering(공학적 대책), Education(교육), Enforcement(규정·관리의 시행)입니다. 세 영역을 함께 적용해 설비·사람·관리 측면의 위험을 동시에 낮추는 접근입니다. {conclusion(answer,corr)}"
    if '신뢰도' in q or '인간신뢰도' in q or '성능신뢰도' in q:
        if any(k in q for k in ['100시간','200시간','에러를범할확률']):
            return f"오류발생률이 시간에 따라 일정한 경우 신뢰도는 지수분포 R(t)=e^(-λt)로 계산합니다. 100시간당 오류 1회라면 λ=0.01/h이므로 200시간에서 R=e^-2≈0.135입니다. {conclusion(answer,corr)}"
        return f"독립된 두 작업자를 중복 배치해 어느 한 사람만 성공해도 되는 구조라면 병렬 신뢰도는 R=1-(1-R₁)(1-R₂)로 계산합니다. 반대로 둘 모두 성공해야 하는 직렬 구조는 각 신뢰도의 곱을 사용합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['연천인률','도수율','강도율','재해통계']):
        return f"재해지표는 분모를 정확히 구분해야 합니다. 연천인률은 연간 재해자수/평균근로자수×1,000, 도수율은 재해건수/연근로시간×10⁶으로 사고 발생빈도를 나타냅니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['의식수준','Phase','페이즈','과도하게긴장']):
        return f"안전심리의 의식수준은 수면·무의식에 가까운 단계부터 정상적 적극활동, 과도한 긴장 상태까지 구분합니다. 정상적으로 주의가 집중된 Phase III에서 오류 가능성이 가장 낮고, 지나친 긴장·흥분 상태에서는 판단이 경직되어 오류가 다시 증가합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['Rasmussen','라스무센']):
        return f"Rasmussen은 인간행동을 skill-based, rule-based, knowledge-based 행동으로 구분합니다. 숙련된 자동적 수행, 익숙한 규칙 적용, 새로운 상황의 지식기반 문제해결이라는 차이를 기준으로 선택지를 판단합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['Swain','Guttman','누락오류','순서오류','시간오류']):
        return f"Swain-Guttmann의 인간오류 분류는 필요한 행동의 누락(omission), 잘못된 행동의 수행(commission), 순서 오류, 시간 오류 등으로 나눕니다. 사례에서 ‘무엇을 하지 않았는지/잘못 했는지/순서·시간이 틀렸는지’를 구분하면 됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['호손','Hawthorne']):
        return f"Hawthorne 연구는 물리적 작업조건만큼이나 집단의 사회적 관계, 감독자의 관심, 소속감 같은 심리·사회적 요인이 작업능률에 영향을 준다는 점을 보여주었습니다. 이를 단순한 조명효과로만 해석하면 안 됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['게스탈트','Gestalt']):
        return f"Gestalt 지각원리는 근접성, 유사성, 연속성, 폐쇄성, 공통운명 등 요소들을 하나의 형태로 조직해 지각하는 경향을 설명합니다. 목록에 없는 별개의 심리 개념과 구분해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['A형','TypeA','빨리빨리','경쟁적']):
        return f"Type A 행동양식은 시간압박, 경쟁성, 성취지향, 조급함이 강한 특성이 대표적입니다. 반대로 Type B는 상대적으로 느긋하고 경쟁적 긴장이 낮습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['foolproof','fail-safe','Fail-safe','풀프루프','페일세이프','안전마개']):
        return f"Fool-proof는 사용자가 실수해도 위험한 조작이 성립하지 않도록 설계하는 원칙이고, fail-safe는 장치가 고장 나더라도 안전한 상태로 이행하도록 하는 원칙입니다. 어린이 안전마개처럼 사용자의 능력차를 고려한 설계는 오조작 자체를 어렵게 만듭니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['정서노동','emotional']):
        return f"정서노동은 조직이 요구하는 감정표현 규칙에 맞추기 위해 실제 감정과 관계없이 감정을 조절·표현해야 하는 노동을 말합니다. 단순한 육체적 피로나 고객응대 횟수 자체와는 구분됩니다. {conclusion(answer,corr)}"

    # ---- 작업관리: 작업연구, 레이아웃, 동작분석, 유해요인조사 ----
    if any(k in q for k in ['WorkFactor','WF(','워크팩터']):
        return f"Work Factor는 미리 정해진 동작시간 자료를 이용하는 PTS 기법입니다. 기본 동작시간은 사용 신체부위, 이동거리, 수동조절 정도, 중량·저항 등의 요인으로 보정하므로 이 체계에 없는 요소를 구분해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['관측횟수','허용오차','신뢰도95%','표준편차']):
        return f"시간연구의 필요 관측횟수는 요구 신뢰수준, 표준편차, 허용오차에 의해 결정됩니다. 상대오차를 사용하는 경우 N≈(t·s/(e·x̄))² 형태로 계산하므로 변동이 크거나 허용오차가 작을수록 더 많은 관측이 필요합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['TMU','TimeMeasurementUnit']):
        return f"PTS에서 1 TMU는 0.00001시간, 즉 0.036초입니다. 따라서 1시간은 100,000 TMU이며 시간 단위 변환 문제는 이 기준으로 계산합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['라인','공정효율','균형효율','CycleTime','주기시간','컨베이어']):
        return f"라인 밸런싱 효율은 각 작업요소 시간의 합을 ‘작업장 수×사이클타임’으로 나눈 뒤 100을 곱해 계산합니다. 병목공정의 시간이 사이클타임을 결정하므로 작업 재분할은 유휴시간을 최소화하는 방향으로 해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['다중활동분석표','작업자-기계','작업자와기계','기계대수']):
        return f"작업자-기계 분석은 작업자의 활동·유휴시간과 기계의 가동·유휴시간을 같은 시간축에 놓고 중첩을 줄이는 방법입니다. 담당 기계대수는 작업자 시간과 기계 자동가동시간의 비를 이용해 양쪽의 유휴가 최소가 되도록 정합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['서어블릭','therblig','Therblig']):
        return f"Therblig은 손 작업을 찾기, 선택, 잡기, 운반, 위치결정, 조립 등 기본동작으로 분해하는 미세동작분석법입니다. 작업에 직접 기여하지 않는 찾기·선택·지연·휴식 등의 비효율 동작을 줄이는 것이 개선의 핵심입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['수공구','손공구']):
        return f"수공구는 손목을 중립에 가깝게 유지하고, 힘을 큰 근육군에 분산하며, 손잡이의 크기·형상·마찰을 작업과 사용자에 맞추는 것이 원칙입니다. 과도한 손가락 집기나 손목 굴곡·편향을 유발하는 설계는 피해야 합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['중립자세','입식작업대','작업대의개선','작업대높이']):
        return f"좋은 작업자세는 관절이 중립범위에 있고 어깨가 들리지 않으며 손목·허리의 과도한 굴곡과 비틀림을 줄인 자세입니다. 입식 작업대는 정밀작업은 팔꿈치보다 약간 높게, 힘을 쓰는 작업은 팔꿈치보다 낮게 두는 것이 일반적입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['문제분석','특성요인도','마인드맵','Pareto','파레토','유통선도','flowdiagram','유통선로']):
        return f"문제분석 도구는 목적에 따라 선택합니다. 파레토도는 빈도와 누적비율로 핵심 소수 원인을 찾고, 특성요인도는 결과와 원인을 계통적으로 전개하며, flow diagram은 사람·물자의 이동경로를 평면도 위에 표시합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['시설배치','공정별배치','제품별배치','셀생산','Cell생산','설비의배치']):
        return f"제품별 배치는 대량·반복생산에 유리하고 흐름이 단순하지만 변화 대응성이 낮습니다. 공정별 배치는 다양한 제품과 공정변화에 유연한 대신 운반·대기가 늘 수 있으며, 셀 생산은 다품종 소량생산에 적합합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['표준자료법','간접측정','표준시간산정']):
        return f"표준자료법과 PTS는 과거에 확립된 표준시간 또는 기본동작시간 자료를 조합하는 간접측정법입니다. 스톱워치 시간연구처럼 작업현장에서 실제 시간을 직접 재는 방법과 구분합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['작업구분','요소작업','단위작업','공정','동작분석']):
        return f"작업연구는 공정→작업→요소작업→기본동작처럼 큰 단위에서 작은 단위로 세분해 분석합니다. 동작분석은 불필요한 움직임을 제거하고 양손·신체동작을 단순화하여 피로와 시간을 줄이는 데 목적이 있습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['준비시간','셋업','setup']):
        return f"준비·교체시간 단축은 가능한 작업을 외부준비로 전환하고, 조정·체결을 단순화하며, 공구와 재료를 사전에 표준화해 대기와 반복조정을 줄이는 방향으로 실시합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['작업연구','작업관리','생산성향상','작업개선']):
        return f"작업관리의 핵심 목적은 가장 안전하고 효율적인 작업방법을 개발·표준화하고 합리적인 표준시간을 설정해 생산성을 높이는 것입니다. 단순히 작업속도를 높이는 것이 아니라 불필요한 동작·대기·운반을 제거하는 접근입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['유해요인조사','표본작업','JSI','JobStrainIndex']):
        return f"근골격계 유해요인조사는 반복성, 힘, 자세, 진동, 접촉스트레스와 노출시간을 파악해 개선 우선순위를 정합니다. JSI는 힘의 강도·지속시간, 분당 노력횟수, 손목자세, 작업속도, 1일 작업시간 등을 평가합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['SEARCH','대안의도출','브레인스토밍','아이디어']):
        return f"개선안 도출 단계에서는 문제의 원인을 충분히 분석한 뒤 가능한 대안을 폭넓게 생성하고, 안전성·효과·비용·실행가능성을 기준으로 평가합니다. 브레인스토밍은 비판을 유보하고 자유로운 결합·수정을 허용해 아이디어 수를 늘리는 기법입니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['수행도평가','레이팅','Westinghouse','웨스팅하우스']):
        return f"수행도 평가는 관측한 작업속도를 정상 작업속도로 보정하기 위한 절차입니다. Westinghouse법은 기능, 노력, 작업조건, 일관성 등을 평가하며 보정된 정상시간에 여유를 더해 표준시간을 구합니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['OQAS','OWAS']):
        return f"OWAS 계열 자세평가는 작업자의 허리·팔·다리 자세와 취급하중을 코드화해 조치수준을 정합니다. 작업자세 부담의 선별평가에 적합하지만 손목 등 세부 관절의 정밀평가에는 한계가 있습니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['영상표시단말기','VDT취급근로자']):
        return f"VDT 작업은 화면 높이·거리, 키보드·마우스 위치, 의자와 책상 높이를 조절해 목·어깨·손목이 중립자세를 유지하도록 해야 합니다. 화면 반사와 눈부심을 줄이고 주기적인 시각·자세 휴식을 제공하는 것도 중요합니다. {conclusion(answer,corr)}"

    # ---- 세부 기출 포인트: 위 범주만으로 설명이 충분하지 않은 문항 ----
    if '정보의전달량' in q or 'Equivocation=H(X)-T(X,Y)' in q:
        return f"정보전달계에서 입력 엔트로피 H(X)는 실제 전달정보 T(X,Y)와 애매도(Equivocation)로 나뉘므로 Equivocation=H(X)-T(X,Y)입니다. 출력 엔트로피 H(Y)는 전달정보와 잡음(Noise)의 합으로 표현합니다. {conclusion(answer,corr)}"
    if '접수창구' in q:
        return f"접수대 높이는 출입구처럼 큰 사람을 수용하거나 손이 닿는 한계를 정하는 문제가 아니라, 다수 사용자가 공통으로 사용하는 작업면의 기준높이를 정하는 사례입니다. 조절식이 현실적으로 적용되지 않는 경우 대표집단의 평균치를 적용합니다. {conclusion(answer,corr)}"
    if '효율적인공간의배치' in q or '작업대공간의배치원리' in q:
        return f"작업장 구성요소의 대표 배치원리는 중요도, 사용빈도, 사용순서, 기능적 연관성입니다. ‘작업방법’이나 ‘오류방지’는 좋은 설계원칙이지만 이 네 가지 배치원리 자체에는 포함되지 않습니다. {conclusion(answer,corr)}"
    if '음원의위치' in q or '위상차' in q:
        return f"음원의 좌우 위치는 두 귀에 도달하는 시간·위상차와 음압(강도) 차이를 주요 단서로 판단합니다. 특히 저주파 영역에서는 양 귀 사이의 시간·위상차가 중요한 위치 단서가 됩니다. {conclusion(answer,corr)}"
    if '시식별' in q:
        return f"시식별 능력은 표적의 크기와 대비, 휘도·조도, 노출시간, 표적 또는 관찰자의 움직임 등에 직접 영향을 받습니다. 일반적인 온·습도는 시각표적의 식별성을 규정하는 직접 광학요인이 아닙니다. {conclusion(answer,corr)}"
    if '중복률' in q:
        return f"정보의 중복률은 최대 가능한 정보량 Hmax와 실제 평균정보량 H를 비교해 R=(1-H/Hmax)×100(%)로 계산합니다. 각 대안의 확률로 H를 구한 뒤 동일확률일 때의 Hmax와 비교하면 됩니다. {conclusion(answer,corr)}"
    if any(k in q for k in ['출입문','탈출구','통로의공간','줄사다리의강도']):
        return f"사람이 통과하거나 들어가야 하는 공간·강도처럼 ‘큰 사람도 수용해야 하는’ 설계에는 상위 백분위의 최대치 원칙을 적용합니다. 반대로 손이 닿아야 하는 거리나 조작힘은 작은 사람 기준의 최소치 원칙을 사용합니다. {conclusion(answer,corr)}"
    if '빛의검출성' in q:
        return f"빛의 검출성은 표적의 휘도와 배경과의 대비, 표적 크기, 노출시간, 시야조건 등에 좌우됩니다. 신호등 유리의 재질 자체는 이러한 기본 시각 검출 변수로 분류되지 않습니다. {conclusion(answer,corr)}"
    if '암조응' in q or 'Darkadaptation' in q:
        return f"암조응은 밝은 곳에서 어두운 곳으로 이동할 때 간상체의 감도가 서서히 회복되는 과정으로 완전 적응에는 수십 분이 걸립니다. 적색광은 간상체의 암순응을 비교적 덜 방해하므로 적색 안경이 암조응 보존에 이용됩니다. {conclusion(answer,corr)}"
    if '음량의측정' in q or '물리적소리강도' in q:
        return f"물리적 음의 세기와 사람이 느끼는 음량은 단순 비례하지 않습니다. 청각은 로그적 특성을 가지며 dB는 물리적 음압수준, phon·sone은 주관적 음량을 나타내는 척도입니다. {conclusion(answer,corr)}"
    if '행동유도성' in q or 'affordance' in low:
        return f"행동유도성(affordance)은 제품의 형태·배치가 사용 가능한 행동을 자연스럽게 암시하도록 하는 성질입니다. 좋은 설계는 필요한 행동을 유도하면서 물리적·논리적 제약(constraint)도 활용해 잘못된 조작을 줄입니다. {conclusion(answer,corr)}"
    if '기계화시스템' in q:
        return f"기계화 시스템에서는 동력·반복작업은 기계가 담당하지만 감시·판단·일부 제어는 사람이 맡습니다. 사람이 거의 개입하지 않는 무인공장은 기계화 수준을 넘어 자동화 시스템의 대표 사례입니다. {conclusion(answer,corr)}"

    if '신체활동의부하' in q or ('생리적반응치' in q and '폐활량' in q):
        return f"작업부하에 따라 즉시 변화하는 대표 생리반응은 심박수, 산소섭취량, 환기량, 체온, 근전도 등입니다. 폐활량은 개인의 호흡기 용적 특성을 나타내는 비교적 정적인 지표로 작업강도에 따른 즉각적 반응치로 보기 어렵습니다. {conclusion(answer,corr)}"
    if 'positioning' in low or '위치동작' in q:
        return f"Positioning은 물체를 목표 위치와 방향에 정확히 맞추는 동작으로, 이동거리·표적크기·접근방향에 따라 정확도와 시간이 달라집니다. 손의 자연스러운 운동방향과 어긋나는 방향을 일률적으로 더 정확하다고 보는 진술은 부적절합니다. {conclusion(answer,corr)}"
    if ('힘에대한설명' in q and '속도에비례' in q):
        return f"힘의 기본 관계는 F=ma로 질량과 가속도의 곱이며 속도 자체에 비례하는 물리량이 아닙니다. 생체역학에서도 힘의 크기와 모멘트팔을 구분해 해석해야 합니다. {conclusion(answer,corr)}"
    if '능동적힘' in q or '수동적힘' in q or '근절의안정길이' in q:
        return f"근육의 길이-장력 관계에서 능동장력은 액틴·미오신의 겹침이 적절한 안정길이 부근에서 가장 크고, 수동장력은 근육이 안정길이보다 늘어날수록 증가합니다. 두 장력의 합이 특정한 ‘안정길이의 50%’에서 최대가 된다고 일반화할 수 없습니다. {conclusion(answer,corr)}"
    if 'EOG' in q or '생체신호' in q:
        return f"생체신호 측정은 EEG=뇌파, EOG=안구운동, ECG=심전도, EMG=근전도로 구분합니다. 따라서 EOG를 뇌의 전기활동 측정법으로 연결한 것은 잘못입니다. {conclusion(answer,corr)}"
    if '침상생활' in q or '쉽게골절' in q:
        return f"뼈는 기계적 하중에 적응해 구조를 유지·재형성합니다. 장기간 침상생활처럼 체중부하와 근육력이 줄면 골흡수가 증가해 골밀도가 떨어질 수 있으며, 이는 골격이 지렛대·지지구조로서 받는 기계적 자극이 감소한 결과로 이해할 수 있습니다. {conclusion(answer,corr)}"
    if '긴장지수' in q or ('복합지수' in q and '열' in q):
        return f"온열환경의 대표 복합지수에는 WBGT, 유효온도(ET), 열스트레스지수(HSI) 등이 있습니다. Strain Index는 상지의 반복·힘·자세 등 근골격계 부담을 평가하는 지표이므로 온열 복합지수와는 성격이 다릅니다. {conclusion(answer,corr)}"
    if '스킬라' in q or '스칼라' in q or 'scalar' in low:
        return f"스칼라(scalar)는 크기만 갖는 물리량이고 벡터(vector)는 크기와 방향을 함께 갖습니다. 스칼라가 벡터와 유사하되 방향만 다르다는 설명은 정의에 맞지 않습니다. {conclusion(answer,corr)}"
    if 'tremor' in low or '떨림' in q:
        return f"정적 자세에서의 생리적 떨림은 팔·손을 공중에 지지할 때 커집니다. 몸통과 작업부위를 안정적으로 지지하고 불필요한 정적 근수축을 줄이면 떨림과 미세작업 오차를 감소시킬 수 있습니다. {conclusion(answer,corr)}"
    if '가로세관' in q or 'transversetubules' in low:
        return f"가로세관(T-tubule)은 근세포막의 활동전위를 근섬유 깊숙한 곳까지 전달하여 근소포체의 Ca²⁺ 방출을 유도합니다. 이 과정이 흥분-수축 연결의 핵심입니다. {conclusion(answer,corr)}"
    if '1N이란' in q or '생리적스트레인의척도' in q:
        return f"뉴턴(N)은 힘의 SI 단위로 1 N은 1 kg 질량에 1 m/s²의 가속도를 만드는 힘입니다. kg은 질량, N은 힘이라는 단위 차이를 구분해야 합니다. {conclusion(answer,corr)}"
    if '생체역학적모형' in q:
        return f"생체역학적 모형은 작업자세, 외력, 하중 위치와 신체분절 치수를 이용해 관절 모멘트·압축력 같은 역학적 부하를 추정합니다. 작업조건을 바꿨을 때 신체부담이 어떻게 달라지는지 사전에 비교하는 데 특히 유용합니다. {conclusion(answer,corr)}"
    if '막전위차' in q or '세포막' in q and 'Na+' in q:
        return f"활동전위가 시작되면 Na⁺ 통로가 열리면서 Na⁺ 투과성이 증가해 탈분극이 일어나고, 이어 K⁺ 투과성이 증가해 재분극이 진행됩니다. 자극 시 Na⁺를 투과시키지 않는다는 설명은 반대입니다. {conclusion(answer,corr)}"
    if 'moment' in low and '방향' in q:
        return f"모멘트는 회전축에서 힘의 작용선까지의 수직거리와 힘의 곱(M=F·d)이며 회전방향에 따라 시계·반시계 방향의 부호가 달라집니다. 힘의 방향과 무관하게 모멘트 방향이 항상 같다는 설명은 틀립니다. {conclusion(answer,corr)}"
    if '액틴' in q and '미오신' in q and '길이' in q:
        return f"근수축의 미끄럼 필라멘트 이론에서는 액틴과 미오신 필라멘트 자체의 길이가 짧아지는 것이 아니라 서로 겹치는 정도가 증가하면서 근절(sarcomere)이 짧아집니다. {conclusion(answer,corr)}"
    if '작업부하및휴식시간' in q:
        return f"휴식시간은 작업의 대사부하와 국소 근피로, 환경조건, 지속시간을 함께 고려해 결정합니다. 전신피로가 장기화되면 회복이 지연되고 직무만족 저하와 건강위험 증가로 이어질 수 있으므로 적정한 작업-휴식 배분이 필요합니다. {conclusion(answer,corr)}"

    if '1000개의부품' in q and '0.81' in q:
        return f"실제 불량 200개 중 100개를 놓쳤으므로 전체 1,000개 기준 인간오류확률은 0.1, 한 로트에서 오류를 범하지 않을 확률은 0.9로 봅니다. 독립된 동일 로트 2개에서 모두 오류가 없을 확률은 0.9²=0.81입니다. {conclusion(answer,corr)}"
    if '피로를줄이기' in q or '피로를방지' in q:
        return f"피로저감은 과도한 정적근수축을 줄이고 자세·작업속도를 개선하며 적절한 휴식과 작업교대를 제공하는 방향으로 실시합니다. 필요한 동적 움직임까지 제거하면 혈류와 작업유연성이 오히려 떨어질 수 있어 적절한 대책이 아닙니다. {conclusion(answer,corr)}"
    if 'AND게이트' in q or '모든입력이동시에' in q:
        return f"FTA에서 AND 게이트는 모든 입력사상이 동시에 발생해야 출력사상이 발생하는 논리게이트입니다. OR 게이트는 입력 중 하나 이상만 발생해도 출력이 발생한다는 점과 구분합니다. {conclusion(answer,corr)}"
    if '사고의재현성' in q:
        return f"사고는 우연성과 복합원인성 때문에 동일 조건에서 반드시 같은 결과가 반복되는 ‘재현성’을 일반적 특성으로 보지 않습니다. 사고분석은 반복 가능한 직접원인뿐 아니라 잠재·관리 원인을 함께 다룹니다. {conclusion(answer,corr)}"
    if '적정한지능수준' in q:
        return f"직무수행은 지능이 높을수록 무조건 좋아지는 것이 아니라 과업의 복잡도와 요구수준에 맞는 능력·적성이 중요합니다. 각 작업에는 요구되는 적정 지능수준이 있으며 다른 적성·경험과 함께 배치에 고려합니다. {conclusion(answer,corr)}"
    if '억측판단' in q:
        return f"억측판단은 충분한 객관적 근거 없이 ‘아마 괜찮을 것’이라고 주관적으로 추정해 행동하는 상태입니다. 신호가 바뀌었는데도 차량이 당장 움직이지 않을 것이라고 임의로 판단해 횡단하는 사례가 이에 해당합니다. {conclusion(answer,corr)}"
    if 'Exclusion' in q or '오류를범할수없도록' in q:
        return f"Exclusion 설계는 잘못된 조작이나 위험행동 자체가 물리적으로 성립하지 않도록 가능성을 제거하는 오류방지 설계입니다. 사용자가 실수하더라도 위험한 상태로 진행하지 못하게 만드는 것이 핵심입니다. {conclusion(answer,corr)}"
    if '안전수단을생략' in q:
        return f"안전수단 생략은 작업불편, 시간압박, 안전의식 부족, 습관화와 같은 작업·인지 요인과 관련됩니다. 단순한 ‘감정’은 안전장치를 생략하게 만드는 대표적인 직접 요인으로 분류되지 않습니다. {conclusion(answer,corr)}"
    if '직무행동의결정요인' in q:
        return f"직무행동은 개인의 능력·동기와 작업환경·상황요인의 영향을 받아 나타납니다. 수행(performance)은 이러한 요인의 결과로 평가되는 준거이지 직무행동을 선행해 결정하는 독립요인으로 보지 않습니다. {conclusion(answer,corr)}"
    if 'Engineering,Education,Economy' in q:
        return f"안전의 3E는 Engineering(공학), Education(교육), Enforcement(규정·관리의 시행)입니다. Economy는 안전투자의 고려요소가 될 수 있으나 전통적인 3E 구성요소는 아닙니다. {conclusion(answer,corr)}"
    if 'adjustabledesign' in low or '조절설계' in q:
        return f"인간오류 방지를 위한 설계에는 위험행동의 배제·예방, fail-safe, fool-proof처럼 오류가 사고로 이어지지 않게 만드는 원칙이 핵심입니다. 조절식 설계는 사용자 신체치수 적합성을 높이는 인간공학 원칙이지만 오류방지 설계의 고유 원칙은 아닙니다. {conclusion(answer,corr)}"
    if '상해의종류' in q and '협착' in q:
        return f"협착은 기계·물체 사이에 끼이는 ‘사고 발생형태’에 해당합니다. 상해의 종류는 골절, 절단, 타박상, 화상처럼 사고로 인해 인체에 생긴 손상의 형태를 말하므로 분류수준이 다릅니다. {conclusion(answer,corr)}"
    if '카페인' in q:
        return f"카페인은 섭취 후 위장관에서 빠르게 흡수되며 일반적으로 약 30분 전후부터 각성효과가 뚜렷해집니다. 개인차와 섭취조건에 따라 변동이 있으나 기출에서는 약 30분을 기준으로 봅니다. {conclusion(answer,corr)}"
    if '수면' in q and '사이클' in q:
        return f"정상 수면은 NREM과 REM 단계가 반복되며 한 주기는 대략 90분 내외입니다. 밤 동안 이러한 주기가 여러 차례 반복되면서 깊은 수면과 REM 수면의 비율이 변합니다. {conclusion(answer,corr)}"
    if '선호신분지수' in q or '소시오그램' in q:
        return f"소시오그램의 선호신분지수는 해당 구성원이 받은 긍정적 선택수를 가능한 선택관계 수로 나누어 계산합니다. 그림에서 B가 받은 선택관계를 세어 분모의 가능한 관계수와 비교하면 제시된 비율이 나옵니다. {conclusion(answer,corr)}"
    if '교육프로그램' in q and '경제적가치' in q:
        return f"교육평가에서 결과(result) 준거는 교육 이후 생산성, 품질, 사고감소, 비용절감처럼 조직이 얻은 최종 성과를 평가합니다. 회사에 대한 경제적 가치는 반응·학습보다 결과 준거와 가장 직접적으로 연결됩니다. {conclusion(answer,corr)}"

    if '중력이송원리' in q:
        return f"동작경제의 작업장 배치 원칙은 공구·재료를 정해진 위치에 두고 중력식 공급·낙하장치를 활용해 손의 이동거리와 되돌림 동작을 줄이는 것입니다. 중력이송 용기를 사용 장소 가까이에 두는 것은 대표적인 개선 사례입니다. {conclusion(answer,corr)}"
    if 'therbling' in low or ('손동작' in q and '효율적' in q):
        return f"Therblig(서블릭)은 손 작업을 18개의 기본동작으로 분해하고 각 동작을 작업에 기여하는 효율동작과 지연·찾기·휴식 등의 비효율동작으로 구분하는 미세동작분석 체계입니다. {conclusion(answer,corr)}"
    if '5W1H' in q:
        return f"5W1H 개선에서는 What·Why로 작업의 필요성을 검토해 제거를, Where·When·Who로 장소·시기·담당의 재배열을, How로 방법의 단순화를 검토합니다. 이를 서로 뒤바꾼 설명은 잘못입니다. {conclusion(answer,corr)}"
    if 'WorkSampling법' in q or '랜덤한시점' in q:
        return f"Work Sampling은 무작위 시점에 작업상태를 순간 관측하고, 각 상태가 관측된 비율로 전체 시간에서의 점유율을 추정하는 통계적 작업측정법입니다. 연속 관측이 아니라 충분히 많은 랜덤 표본을 사용하는 것이 핵심입니다. {conclusion(answer,corr)}"
    if '셀(Cell)생산' in q or '셀생산' in q:
        return f"Cell 생산은 여러 공정을 한 셀에 묶어 다기능 작업자가 제품 단위로 완결하는 방식으로, 품종변화가 잦은 다품종·중소량 제품에 적합합니다. 컴퓨터처럼 사양변형과 조립조합이 많은 제품이 대표적인 적용대상입니다. {conclusion(answer,corr)}"
    if '양팔은동시에같은방향' in q:
        return f"동작경제 원칙에서는 두 손이 가능하면 동시에 시작하고 동시에 끝나며, 대칭적이고 서로 반대방향으로 움직이게 해 신체균형과 리듬을 유지하는 것이 좋습니다. 두 팔을 같은 방향으로 동시에 움직이라는 진술은 원칙과 다릅니다. {conclusion(answer,corr)}"
    if '부적절한자세' in q and '중립적인위치' in q:
        return f"중립자세는 관절이 중간범위에 있어 근육·인대 부담이 가장 작은 자세로 ‘부적절한 자세’의 반대 개념입니다. 따라서 중립적인 위치를 부적절한 자세라고 정의한 진술은 틀립니다. {conclusion(answer,corr)}"
    if '미세동작연구' in q or 'SIMO' in q:
        return f"미세동작연구는 영상으로 매우 짧은 기본동작을 반복 관찰하고 SIMO 차트 등으로 양손 동작을 정밀하게 분석할 수 있다는 장점이 있습니다. 반면 촬영·분석에 시간과 비용이 많이 드는 것이 단점입니다. {conclusion(answer,corr)}"
    if '입식작업보다는좌식' in q:
        return f"좌식 작업은 몸을 안정적으로 지지할 수 있어 정밀한 손작업, 작은 부품 조립, 지속적인 시각집중에 유리합니다. 큰 힘을 쓰거나 넓은 작업영역을 이동해야 하는 작업은 입식이 더 적합합니다. {conclusion(answer,corr)}"
    if '[보기]' in q and '문제해결절차' in q:
        return f"디자인 문제해결은 일반적으로 문제·요구사항을 명확히 한 뒤 자료를 분석하고, 대안을 생성·구체화한 후 평가·선정하는 순서로 진행합니다. 제시된 보기의 단계도 이 논리적 흐름에 맞게 배열해야 합니다. {conclusion(answer,corr)}"
    if '최대한발휘할수있는힘의30%' in q:
        return f"반복·지속 작업에서는 최대수의근력의 높은 비율을 계속 사용하면 국소 근피로가 빠르게 증가합니다. 작업설계에서는 지속시간과 반복빈도에 따라 허용힘을 충분히 낮춰야 하므로 ‘항상 최대힘의 30%까지 유지’하는 식의 일률적 기준은 적절하지 않습니다. {conclusion(answer,corr)}"
    if '작업강도를조절하여작업시간을단축' in q:
        return f"관리적 개선은 작업·휴식시간 조정, 작업순환, 인원배치, 교육처럼 노출시간과 작업방식을 관리하는 방법입니다. 단순히 작업강도를 높여 시간을 줄이는 것은 순간부하를 키울 수 있어 올바른 유해요인 관리로 보기 어렵습니다. {conclusion(answer,corr)}"
    if '탄도동작' in q or 'BallisticsMovements' in low:
        return f"탄도동작(ballistic movement)은 일단 시작되면 중간 피드백에 의한 세밀한 수정이 적은 빠른 동작으로, 제한·통제된 정밀동작보다 일반적으로 빠릅니다. ‘더 느리고 부정확하다’고 일괄 설명한 것은 옳지 않습니다. {conclusion(answer,corr)}"
    if '위험작업의관리적개선' in q or ('작업자의신체에맞는작업장개선' in q):
        return f"작업장·설비의 높이와 구조를 작업자 신체에 맞게 변경하는 것은 위험원 자체를 줄이는 공학적 개선입니다. 작업순환·휴식·교육·인원배치처럼 관리절차로 노출을 조절하는 것이 관리적 개선입니다. {conclusion(answer,corr)}"
    if '3시간동안' in q and '200회' in q and '30번' in q:
        return f"Work Sampling에서 손목꺾임의 관측비율은 30/200=0.15, 즉 전체시간의 15%로 추정합니다. 3시간 중 15%는 27분이므로 시간당 평균은 27÷3=9분입니다. {conclusion(answer,corr)}"
    if '시계조립' in q or ('정밀한작업' in q and '작업대' in q):
        return f"정밀작업은 눈과 손을 작업물에 가까이 두고 상체 굴곡을 줄이기 위해 작업면을 팔꿈치 높이보다 약간 높게 배치합니다. 일반적으로 팔꿈치보다 약 5~15 cm 높은 작업대가 적절합니다. {conclusion(answer,corr)}"

    if '직무수행준거' in q and '사고' in q:
        return f"직무수행 준거는 생산량·품질·결근·사고처럼 실제 직무성과를 평가하는 기준입니다. 개인의 근무연수 변화에 따라 숙련도나 생산성은 비교적 달라질 수 있지만, 사고는 우발적·저빈도 사건이라 연속적으로 같은 방향의 변화가 나타나는 준거로 보기 어렵습니다. {conclusion(answer,corr)}"
    if '정신적작업부하' in q and '폐활량' in q:
        return f"정신적 작업부하는 심박변이, 뇌파, 동공반응, 임계융합주파수 등 중추·자율신경계 반응과 수행지표를 활용해 평가합니다. 폐활량은 폐의 용적능력을 나타내는 비교적 정적인 호흡기 지표이므로 정신적 부하의 민감한 생리측정치로 보기 어렵습니다. {conclusion(answer,corr)}"

    if '뇌간' in q or 'brainstem' in low or 'brain stem' in low:
        return f"뇌간(brain stem)은 중뇌(midbrain), 뇌교(pons), 연수(medulla oblongata)로 구성되며 호흡·심혈관 조절과 각성 등 생명유지 기능에 관여합니다. 간뇌(diencephalon)는 시상·시상하부 등을 포함하는 별도 영역이므로 뇌간에 포함되지 않습니다. {conclusion(answer,corr)}"

    # source explanation can add specificity, but only after filtering community/meta text.
    if source and len(source)>=25:
        s=source
        s=re.sub(r'(^|\s)(쉽게|외우|암기|그냥|문제는|답은|정답은)\s*',' ',s)
        s=re.sub(r'\s+',' ',s).strip()
        return f"핵심 해설: {s} {conclusion(answer,corr)}"[:900]
    topic={'인간공학개론':'인간공학의 정의·설계원칙','작업생리학':'작업생리와 생체반응','산업심리학 및 관계법규':'산업심리·인간오류·안전관리','근골격계질환 예방을 위한 작업관리':'작업관리와 근골격계 부담평가'}.get(subject_for(1),'핵심 개념')
    return f"이 문항은 해당 개념의 정의와 적용 조건을 정확히 구분하는 문제입니다. 선택지 중 ‘{short_choice(corr)}’만이 문제에서 요구한 조건과 일치하며, 나머지는 개념의 방향·범위 또는 적용 대상을 바꾼 표현입니다. {conclusion(answer,corr)}"

def body_marker_answer(lines):
    m=re.search(r'[❶❷❸❹]',join_text(lines)); return CIRCLE_TO_NUM[m.group()] if m else None

def import_one(pdf):
    date,y,mo,d=date_from_name(pdf); qrec,count=extract_ordered_questions(pdf)
    if count!=80: raise ValueError(f'{pdf.name}: qcount {count}')
    answers=extract_answer_table(pdf); questions=[]; stats={'visual':0,'image_only':0,'mismatch':0}
    # Clear stale full-question crops for this date.
    outdir=ASSET_ROOT/date
    if outdir.exists(): shutil.rmtree(outdir)
    for no in range(1,81):
        rec=qrec[no]; ans=answers[no-1]; question,choices=parse_question(no,rec['body']); bm=body_marker_answer(rec['body'])
        if bm is not None and bm!=ans: stats['mismatch']+=1
        visual=bool(VISUAL_RE.search(question) or any(c=='그림 선택지' for c in choices))
        clips=graphic_clips(pdf,rec['regions'],visual)
        passage_data=save_graphics(pdf,date,no,clips,choices,rec['regions']) if clips else None
        if passage_data:
            out,w,h,image_choice,mapped_indices=passage_data; stats['visual']+=1
            if image_choice: stats['image_only']+=1
            choices=[(f'위 그림 {NORMAL_CIRCLE[i]}' if c=='그림 선택지' and i in mapped_indices else ('위 제시자료의 그림/식' if c=='그림 선택지' else c)) for i,c in enumerate(choices,1)]
        q={'no':no,'subject':subject_for(no),'question':question}
        if passage_data:
            rel=out.relative_to(ROOT).as_posix(); q['passage']=[{'type':'svg','alt':f'{no}번 문제 제시자료','content':f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' role='img'><image href='{rel}' width='{w}' height='{h}' preserveAspectRatio='xMidYMid meet'/></svg>"}]
        q['choices']=choices; q['answer']=ans
        src=clean_source_explanation(rec['expl'])
        q['explanation']=expert_explanation(question,choices,ans,src)
        questions.append(q)
    out={'examId':date,'title':f'인간공학기사 필기 {y}년 {mo}월 {d}일','duration':120,'passingScore':60,'subjects':SUBJECTS,'questions':questions}
    op=DATA_DIR/f'인간공학기사 {date}.json'; op.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); return op,stats

def update_index(entries):
    p=DATA_DIR/'index.json'; data=json.loads(p.read_text(encoding='utf-8')); data=[x for x in data if '인간공학기사' not in f"{x.get('id','')} {x.get('title','')}"]
    for op in entries:
        d=json.loads(op.read_text(encoding='utf-8')); y,mo,day=map(int,d['examId'].split('-'))
        data.append({'id':f"인간공학기사 {d['examId']}",'title':'인간공학기사 필기','date':f'{y}년 {mo}월 {day}일','questions':80,'duration':120,'subjects':[s['name'] for s in SUBJECTS]})
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    pdfs=sorted(PDF_ROOT.glob('인간공학기사*.pdf')); entries=[]
    for pdf in pdfs:
        op,st=import_one(pdf); entries.append(op); print('OK',pdf.name,st)
    update_index(entries); print('ergonomics complete',len(entries))
if __name__=='__main__': main()
