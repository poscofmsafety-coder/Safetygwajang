import json, re, glob, os
from pathlib import Path
from collections import defaultdict, Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT=Path('/mnt/data/safetygwajang_v24_instructor')
V23=json.load(open('/mnt/data/safetygwajang_v23_instructor/data/safety-instructor-study.json',encoding='utf-8'))

# ---------- helpers ----------
def clean(s):
    return re.sub(r'\s+',' ',str(s or '')).strip()

def source_query(q):
    s=clean(q)
    for a,b in {
        '중대 시민 재해':'중대시민재해','중대 시민 해재':'중대시민재해','화재감사인':'화재감시자',
        '유해위험 방지 계획서':'유해위험방지계획서','산업안전보건계획서':'안전보건계획'
    }.items(): s=s.replace(a,b)
    s=re.sub(r'\([^)]*년\)','',s)
    s=re.sub(r'에 대하여 설명하시오|대하여 설명하시오|설명하시오|설명해보세요|말해보세요|설명|무엇입니까|관한 설명으로|옳지 않은 것은|옳은 것은',' ',s)
    s=re.sub(r'\s+',' ',s).strip(' ?.')
    return s[:90]

# ---------- 1차 : 2회 이상 중복 주제 자동 정리 ----------
exam_files=sorted(glob.glob(str(ROOT/'data/산업안전지도사 20*.json')))
qs=[]
for p in exam_files:
    d=json.load(open(p,encoding='utf-8'))
    m=re.search(r'(20\d{2})',os.path.basename(p)); year=int(m.group(1)) if m else 0
    for q in d.get('questions',[]):
        stem=clean(q.get('question'))
        norm=stem
        norm=re.sub(r'산업안전보건법령상|다음 중|관한 설명으로|에 관한 설명으로|에 관한|으로 옳은 것을 모두 고른 것은|으로 옳지 않은 것은|으로 옳은 것은|옳지 않은 것은|옳은 것은|해당하는 것은|해당하지 않는 것은|\?', ' ', norm)
        norm=re.sub(r'[^가-힣A-Za-z0-9]+',' ',norm)
        norm=clean(norm)
        qs.append({'year':year,'no':q.get('no'),'subject':q.get('subject'),'question':stem,'norm':norm,'choices':q.get('choices') or [],'answer':q.get('answer'),'explanation':clean(q.get('explanation'))})

vec=TfidfVectorizer(analyzer='char_wb',ngram_range=(2,5),min_df=1).fit_transform([x['norm'] for x in qs])
sim=cosine_similarity(vec)
parent=list(range(len(qs)))
def find(a):
    while parent[a]!=a:
        parent[a]=parent[parent[a]]; a=parent[a]
    return a
def union(a,b):
    a,b=find(a),find(b)
    if a!=b: parent[b]=a

TH=0.70
for i in range(len(qs)):
    for j in range(i+1,len(qs)):
        if qs[i]['year']==qs[j]['year'] or qs[i]['subject']!=qs[j]['subject']: continue
        if sim[i,j]>=TH: union(i,j)
clusters=defaultdict(list)
for i in range(len(qs)): clusters[find(i)].append(i)

GENERIC_PAT=re.compile(r'^(다음|에서 설명하고 있는|에 들어갈|아래|그림|표|내용|것)$')
repeats=[]
for ids in clusters.values():
    years=sorted(set(qs[i]['year'] for i in ids))
    if len(years)<2: continue
    # keep one item per year, choose latest as representative
    rows=sorted([qs[i] for i in ids], key=lambda x:(x['year'],x['no']))
    rep=rows[-1]
    if len(rep['norm'])<5 or GENERIC_PAT.search(rep['norm']): continue
    # reject clusters that are only generic visual/passages
    if all(re.match(r'^(다음|\(\)|서로 독립|아래)', r['question']) for r in rows) and len(set(r['norm'] for r in rows))>1:
        continue
    a=rep.get('answer')
    answer_text=''
    if isinstance(a,int) and 1<=a<=len(rep['choices']): answer_text=rep['choices'][a-1]
    topic=rep['question']
    topic=re.sub(r'^산업안전보건법령상\s*','',topic)
    topic=re.sub(r'(에 관한 설명으로|에 대한 설명으로|에 관한 설명|에 대한 설명|에서)\s*(옳지 않은 것은|옳은 것은|해당하지 않는 것은|해당하는 것은|옳은 것을 모두 고른 것은).*$', '', topic)
    topic=clean(topic).strip(' ?')
    # compact explanation; keep source-derived stored explanation, not commercial uploaded notes
    exp=rep['explanation'] or f"정답은 {a}번입니다. 선택지의 적용대상·주체·기한·수치·예외를 나눠 비교하세요."
    if len(exp)>420: exp=exp[:417].rstrip()+"…"
    repeats.append({
        'id':f'f1-{len(repeats)+1:03d}','subject':rep['subject'],'topic':topic,'frequency':len(years),'years':years,
        'question':rep['question'],'choices':rep['choices'],'answer':a,'answerText':answer_text,'explanation':exp,
        'sourceQuery':source_query(topic),'latestYear':rep['year']
    })
# frequency desc, then latest year
repeats.sort(key=lambda x:(x['frequency'],x['latestYear']),reverse=True)
# Keep all robust clusters, but cap UI payload to 90.
repeats=repeats[:90]

# ---------- 2차 : 기존 기출 + 고정 모범답안 보강 ----------
fixed={
8:'분쇄기의 안전검사 대상 여부는 처리용량만으로 단정하지 않고 시행령 제78조 및 안전검사 고시의 적용범위·제외조건을 함께 봐야 합니다. 2026년 6월 26일부터 파쇄기·분쇄기가 안전검사 대상에 편입되었으므로, 해당 기계가 고시상 파쇄기·분쇄기의 정의와 적용범위에 해당하는지 먼저 판단하고, 적용제외에 해당하지 않으면 안전검사 대상입니다.',
9:'분쇄 용량이 작더라도 용량 숫자만으로 비대상이라고 결론내리면 안 됩니다. 2026년 6월 26일부터 파쇄기·분쇄기가 안전검사 대상에 편입되었으므로 고시의 기계 정의, 적용범위와 적용제외를 순서대로 확인해 대상 여부를 판단해야 합니다.',
10:'벨트 컨베이어의 자율안전확인 또는 안전검사 대상 여부는 이송거리 하나가 아니라 동력, 구조, 용도, 적용제외 조건을 함께 확인합니다. 답안은 ① 컨베이어 정의 ② 고시상 대상 규격 ③ 적용제외 ④ 제시조건 대입 ⑤ 결론 순으로 씁니다. 제시조건의 10m는 고시 원문에 대입해 최종 판단합니다.',
11:'컨베이어의 구동기 출력과 이송거리 조건은 고시상 적용범위·제외조건을 판단하는 핵심 수치입니다. 0.7kW, 3m라는 제시조건을 자율안전확인 또는 안전검사 고시의 규격 기준에 각각 대입한 뒤 대상/비대상을 결론으로 적고, 근거 조항·별표를 함께 적습니다.',
28:'커플링은 두 축을 계속 연결해 동력을 전달하는 요소이고, 클러치는 운전 중 필요에 따라 동력 전달을 연결·차단하는 요소입니다. 프레스에서는 플라이휠의 회전력을 클러치로 슬라이드 구동부에 연결하고 브레이크와 연동해 정지시키며, 축 연결부에는 커플링을 사용합니다. 안전상 클러치·브레이크의 확동성과 방호, 예기치 않은 재기동 방지가 핵심입니다.',
36:'공작기계의 덮개는 위험점에 작업자가 접촉하지 못하도록 충분한 강도와 구조로 설치하고, 쉽게 임의 제거되지 않아야 하며, 개방이 필요한 경우에는 기계가 위험한 상태로 운전되지 않도록 연동기능을 두는 것이 원칙입니다. 세부 치수와 예외는 해당 공작기계 안전기준 일반 지침 제6조 원문을 확인해 답안에 씁니다.',
55:'절삭칩은 가공재료와 절삭조건에 따라 연속형, 전단형, 균열형 등으로 나타납니다. 연속형은 연성이 큰 재료와 적절한 절삭조건에서 길게 이어지고, 전단형은 전단면을 따라 분절되며, 균열형은 취성재료에서 작은 조각으로 발생합니다. 긴 칩은 말림·베임 위험이 있어 칩브레이커와 전용 제거공구를 사용합니다.',
58:'동력차단장치는 청소·정비·검사·수리 등 작업 중 기계의 불시기동이나 에너지 방출을 막기 위한 조치입니다. 운전을 정지하고 전원·유압·공압 등 에너지원을 차단한 뒤 잠금·표지하고 잔류에너지를 제거하며, 작업자가 안전한 상태를 확인한 후 작업합니다. 작업 종료 후에는 인원·공구 확인 뒤 정해진 절차로 복구합니다.',
85:'이동식 비계는 평탄하고 견고한 바닥에 설치하고 바퀴에는 갑작스런 이동을 막는 제동장치를 사용합니다. 작업발판과 안전난간을 확보하고, 작업자가 탑승한 상태에서 비계를 이동하지 않으며, 전도 우려가 있으면 아웃트리거 등 전도방지 조치를 합니다. 승강은 전용 승강설비를 이용합니다.',
91:'가스집합장치와 아세틸렌 용접장치는 화기·충격·고온을 피하고 통풍이 양호한 장소에 설치하며, 용기 전도방지, 역화방지기, 압력조정기와 차단장치를 갖추어야 합니다. 가스 누설 여부를 점검하고 산소와 가연성가스를 안전하게 구분·관리하며, 점화원과 적정거리를 확보합니다. 세부 거리와 구조기준은 기준규칙 원문으로 최종 확인합니다.',
92:'화재감시자는 화재위험작업 주변에 가연성물질이 있거나 불티가 비산해 화재가 발생할 우려가 있는 경우 배치하는 것이 원칙입니다. 다만 작업장 주변의 가연성물질을 제거·격리하고 불티 비산방지 등으로 화재위험이 없도록 조치한 경우 등 규칙에서 정한 예외에 해당하는지 확인합니다. 답안은 배치대상과 예외를 반드시 나눠 씁니다.',
95:'프레스 보유대수만으로 모든 안전관리 의무를 판단하지 않습니다. 질문이 안전관리자 선임, 유해위험방지계획서, 감독대상 또는 자체검사 등 어느 제도를 묻는지 먼저 특정하고, 해당 법령·고시의 업종·근로자수·설비대수 기준에 대입해야 합니다. 원문이 확인되지 않은 상태에서는 숫자를 임의로 단정하지 않는 것이 맞습니다.',
103:'산업안전보건법의 목적은 산업 안전·보건 기준을 확립하고 책임 소재를 명확히 하며 자율적인 재해예방활동을 촉진해 산업재해를 예방하고 쾌적한 작업환경을 조성함으로써 노무를 제공하는 사람의 안전과 보건을 유지·증진하는 것입니다. 사업주는 법령상 재해예방기준 준수, 쾌적한 작업환경·근로조건 개선, 안전보건정보 제공 등 법 제5조의 의무를 이행해야 합니다.',
112:'건조설비에 대한 유해위험방지계획서 제출 여부는 설비의 종류·용량·사용물질과 시행령 제42조의 대상기계·설비 기준에 따라 판단합니다. 답안은 ① 설비 정의 ② 대상 규격 ③ 설치·이전·주요구조부 변경 여부 ④ 제출시기·심사절차를 적고, 주어진 사양을 최신 시행령·규칙에 대입해 결론냅니다.',
113:'승강기 안전장치는 문이 열린 상태의 운행을 막는 인터록, 과속 시 작동하는 조속기·비상정지장치, 과상승·과하강 방지장치, 완충장치, 출입문 잠금장치 등으로 구성됩니다. 답안은 장치명과 기능을 1대1로 연결해 쓰고, 산업용 리프트와 승강기의 법적 구분을 혼동하지 않습니다.',
123:'지게차 헤드가드는 낙하물로부터 운전자를 보호하는 상부 방호구조입니다. 충분한 강도를 갖추고 운전자의 시야와 조작을 방해하지 않아야 하며, 쉽게 변형·탈락되지 않도록 견고하게 설치합니다. 세부 강도·치수는 산업안전보건기준에 관한 규칙과 방호조치 기준을 확인합니다.',
129:'크레인의 권과방지장치는 훅블록이나 달기기구가 상부구조물에 충돌하기 전에 권상동작을 정지시키는 장치입니다. 리미트스위치식, 중추식 등 기계 구조에 맞는 방식이 사용되며, 장치는 정상 작동 상태를 유지하고 임의 해제하지 않아야 합니다. 안전검사 시 작동상태를 확인합니다.',
134:'안전보건개선계획은 산업재해 위험이 높거나 안전·보건 상태 개선이 필요한 사업장에 대해 고용노동부장관이 수립·시행을 명할 수 있는 제도입니다. 답안은 수립명령 대상, 계획에 포함할 개선사항, 근로자대표 의견 반영, 제출·승인 및 이행 순으로 정리하고 최신 시행령·규칙의 대상기준을 확인합니다.',
135:'줄걸이 작업의 안전율은 달기구가 받는 하중에 대해 충분한 파단강도를 확보하기 위한 기준입니다. 와이어로프·체인·섬유로프·훅·샤클 등 종류별 안전계수가 다르므로 재질과 용도에 맞는 법정 기준을 적용하고, 사용 전 손상·변형·마모·부식 여부를 점검합니다.',
138:'승강기의 주요 안전장치는 출입문 인터록, 조속기, 비상정지장치, 과부하방지장치, 과상승·과하강 방지장치, 완충장치 등입니다. 장치별 목적을 함께 쓰는 것이 핵심이며, 질문 대상이 산업용 리프트인지 승강기인지 먼저 구분해야 합니다.',
139:'안전보건교육은 정기교육, 채용 시 교육, 작업내용 변경 시 교육, 특별교육 등으로 구분합니다. 답안에는 교육 대상·시기·시간·내용·기록을 구분해 쓰고, 유해·위험작업은 시행규칙 별표의 특별교육 대상과 내용을 추가로 확인합니다.',
141:'설비사고의 인적 요인은 절차 미준수, 오조작, 교육·숙련 부족, 피로·주의력 저하, 의사소통 불량 등이 있고, 물적 요인은 설계결함, 방호장치 미비, 노후·마모, 정비불량, 안전장치 고장 등이 있습니다. 대책은 본질안전 설계와 방호·인터록, 예방정비, 표준작업·교육, 점검과 위험성평가를 함께 적용하는 것입니다.'
}

past=[]
for x in V23.get('writtenQuestions',[]):
    y=dict(x)
    if y.get('no') in fixed: y['answer']=fixed[y['no']]
    y['sourceQuery']=source_query(y.get('sourceQuery') or y.get('question'))
    # drop long strategy notes, preserve only actual uncertainty notes
    if y.get('note') and '사용자' not in y['note']: y['note']=''
    past.append(y)
for e in V23.get('part2Extra',[]):
    z=dict(e); z['no']=len(past)+1; z['id']=f"extra-{z['no']}"; z['sourceQuery']=source_query(z.get('sourceQuery') or z.get('question')); past.append(z)

variants=[
 {'field':'기계안전','base':'안전보건관리규정','question':'안전보건관리규정의 작성·변경 절차와 반드시 포함해야 할 핵심 사항을 설명하시오.','answer':'사업주는 법령상 대상 사업장에서 안전보건관리규정을 작성해야 합니다. 핵심 내용은 안전보건 관리조직·직무, 안전보건교육, 작업장 안전·보건관리, 사고조사·대책, 위험성평가 등입니다. 작성·변경 시 산업안전보건위원회의 심의·의결을 거치고, 위원회가 없는 사업장은 근로자대표의 동의를 받습니다. 대상 업종·근로자수와 세부내용은 시행규칙 별표2·3을 확인합니다.','sourceQuery':'안전보건관리규정 시행규칙 별표2 별표3'},
 {'field':'기계안전','base':'안전검사','question':'안전검사 대상기계의 판단순서와 안전검사 면제 사유를 설명하시오.','answer':'대상 판단은 ① 시행령 제78조의 기계 종류 ② 안전검사 고시의 정의·적용범위 ③ 적용제외 ④ 설치·사용 상태 순으로 합니다. 대상이라도 다른 법령에 따른 검사를 받아 안전성이 인정되는 경우 등 법령상 면제사유가 있으면 안전검사를 면제할 수 있습니다. 구체 면제사유는 시행규칙과 최신 안전검사 절차 고시를 적습니다.','sourceQuery':'안전검사 대상 면제 시행령 제78조 시행규칙'},
 {'field':'기계안전','base':'안전검사','question':'2026년 6월 26일부터 안전검사에 새로 편입된 기계를 쓰고, 기존 설치기계의 최초 검사 특례를 설명하시오.','answer':'2026년 6월 26일부터 혼합기, 파쇄기 또는 분쇄기가 안전검사 대상에 편입되었습니다. 기존 설치기계는 설치 시기에 따라 최초검사 유예기간이 다르고, 최초검사 후에는 2년마다 검사를 받는 특례가 있습니다. 시험에서는 시행규칙 부칙의 설치시기별 최초검사 기한을 원문 기준으로 구분해 쓰는 것이 안전합니다.','sourceQuery':'혼합기 파쇄기 분쇄기 안전검사 2026 6 26 특례'},
 {'field':'기계안전','base':'자율안전확인','question':'자율안전확인신고 대상 여부를 판단하는 순서를 설명하시오.','answer':'① 시행령의 자율안전확인대상 기계·기구인지 확인하고 ② 고시 별표의 세부 종류·규격을 대입한 뒤 ③ 적용제외와 신고면제 사유를 확인합니다. 대상이면 자율안전기준 적합 여부를 확인해 신고하고 표시를 해야 합니다. 사례형은 제시된 용량·출력·이송거리 등 수치를 별표에 직접 대입해 결론을 씁니다.','sourceQuery':'자율안전확인신고 대상 별표2 적용제외 신고면제'},
 {'field':'기계안전','base':'기계 대여','question':'기계를 대여하는 자와 대여받는 자의 안전조치를 구분해 설명하시오.','answer':'대여자는 대상 기계의 안전성능 유지, 점검·정비 및 필요한 안전정보 제공 등 대여단계의 조치를 하고, 대여받는 사업주는 설치·사용 전 이상 여부를 확인하고 작업계획·교육·방호조치 등 실제 사용단계의 안전조치를 합니다. 답안은 대여자와 사용자 의무를 섞지 않고 주체별로 구분합니다.','sourceQuery':'대여자 등이 안전조치 기계 기구 설비 시행령'},
 {'field':'기계안전','base':'산업안전보건위원회','question':'산업안전보건위원회의 심의·의결 사항 중 안전보건관리규정 및 재해예방과 연결되는 항목을 설명하시오.','answer':'위원회는 사업장의 산업재해 예방계획, 안전보건관리규정의 작성·변경, 안전보건교육, 작업환경 점검·개선, 건강관리, 중대재해 원인조사 및 재발방지대책, 유해·위험 기계·기구 도입 시 안전보건조치 등 법에서 정한 사항을 심의·의결합니다. 최신 조문에서 항목을 확인해 목록형으로 답합니다.','sourceQuery':'산업안전보건위원회 심의 의결 사항 법 제24조'},
 {'field':'기계안전','base':'근로자대표','question':'근로자대표가 사업주에게 통지를 요청할 수 있는 안전보건 사항을 설명하시오.','answer':'근로자대표는 산업안전보건법상 근로자 참여가 필요한 사항에 대해 사업주에게 관련 내용을 통지하거나 자료 제공을 요청할 수 있습니다. 시험에서는 안전보건진단, 작업환경측정, 건강진단, 위험성평가 등 해당 조문의 요청·참여권을 각각 구분해 정확한 조문 근거와 함께 답합니다.','sourceQuery':'근로자대표 통지 요청 산업안전보건법'},
 {'field':'기계안전','base':'위험성평가','question':'위험성평가 결과를 근로자에게 공유해야 하는 사항과 중대재해 위험요인 주지방법을 설명하시오.','answer':'근로자에게는 작업 관련 유해·위험요인, 위험성 결정 결과, 위험성 감소대책과 실행계획·이행 여부, 근로자가 준수·주의할 사항 등을 게시·주지 등의 방법으로 알립니다. 중대재해로 이어질 수 있는 유해·위험요인은 작업 전 안전점검회의(TBM) 등을 통해 상시적으로 주지합니다.','sourceQuery':'사업장 위험성평가 지침 공유 TBM 제13조'},
 {'field':'기계안전','base':'위험성평가','question':'위험성평가 상시평가를 실시할 수 있는 요건을 설명하시오.','answer':'상시평가는 매월 또는 작업 전 단계에서 유해·위험요인을 반복적으로 발굴·개선하는 체계를 갖춘 경우 정기·수시평가를 대신하는 방식입니다. 사업장 특성에 맞는 상시 위험성평가 절차, 작업 전 안전점검, 개선조치와 기록·공유가 실제로 운영되어야 합니다. 세부 요건은 현행 사업장 위험성평가에 관한 지침을 확인합니다.','sourceQuery':'사업장 위험성평가 상시평가 제15조'},
 {'field':'기계안전','base':'화재감시자','question':'화재감시자의 배치 장소와 주요 업무를 각각 설명하시오.','answer':'화재위험작업 주변에 가연성물질이 있거나 불티 비산으로 화재 위험이 있는 장소에 화재감시자를 배치합니다. 화재감시자는 작업 전·중 주변의 가연물과 소화설비 상태를 확인하고, 불티·화재 발생 여부를 감시하며, 화재 발생 시 즉시 경보·소화·대피가 이루어지도록 합니다.','sourceQuery':'화재감시자 배치 장소 업무 기준규칙 제241조의2'},
 {'field':'기계안전','base':'산업용 로봇','question':'산업용 로봇 교시작업과 점검·수리작업의 공통 안전조치를 설명하시오.','answer':'방책 안에서 작업할 때는 다른 근로자의 임의기동을 막고, 저속·수동 운전, 동작허가장치, 비상정지장치를 사용하며, 작업자 외 출입을 통제합니다. 작업 시작 전에 작업순서·신호·비상조치 등을 정하고, 작업자가 위험구역에 있는 상태에서 자동운전으로 전환되지 않도록 합니다.','sourceQuery':'산업용 로봇 교시 작업 점검 수리 기준규칙'},
 {'field':'기계안전','base':'신호','question':'산업안전보건기준에 관한 규칙 제40조의 신호방법과 신호수 지정 원칙을 설명하시오.','answer':'여러 근로자가 함께 작업하거나 운전자와 작업자가 서로 확인하기 어려워 위험이 있는 작업은 일정한 신호방법을 정하고 신호하는 사람을 지정해야 합니다. 운전자는 정해진 신호에 따라 조작하고, 작업자는 신호체계를 사전에 공유해야 합니다. 질문에서 지정한 기계·작업의 개별 신호수 규정도 함께 확인합니다.','sourceQuery':'산업안전보건기준에 관한 규칙 제40조 신호'},
 {'field':'기계안전','base':'와이어로프','question':'양중기에 사용해서는 안 되는 와이어로프의 기준을 설명하시오.','answer':'이음매가 있는 것, 한 꼬임에서 끊어진 소선 수가 기준 이상인 것, 공칭지름 감소가 기준을 초과한 것, 꼬임·심한 변형·부식이 있는 것, 열 또는 전기충격으로 손상된 것 등은 사용하지 않습니다. 비자전로프의 소선 단선 기준 등 세부 숫자는 기준규칙 제63조와 제166조를 확인합니다.','sourceQuery':'기준규칙 제63조 제166조 와이어로프 사용금지'},
 {'field':'기계안전','base':'컨베이어','question':'컨베이어 청소·정비 시 재해예방조치와 비상정지장치를 설명하시오.','answer':'청소·정비·부품교체 전에는 운전을 정지하고 동력을 차단하며 재기동 방지조치를 합니다. 회전체·풀리·벨트 등 끼임 위험부에는 덮개·울을 설치하고, 작업자가 쉽게 접근할 수 있는 위치에 비상정지장치 또는 풀코드 등을 설치해 위험 시 즉시 정지할 수 있도록 합니다.','sourceQuery':'컨베이어 청소 정비 동력차단 비상정지 안전검사'},
 {'field':'기계안전','base':'프레스','question':'프레스의 주요 구조부 변경 시 안전인증을 다시 받아야 하는 판단항목을 설명하시오.','answer':'안전인증을 받은 프레스의 주요 구조부를 변경하는 경우에는 법령·고시에서 정한 주요구조부 변경에 해당하는지 판단해 안전인증을 다시 받아야 합니다. 시험에서는 프레스 종류, 능력·행정수, 슬라이드·금형 관련 주요 치수, 클러치·브레이크 또는 제어계통 등 고시가 정한 변경항목을 정확한 명칭으로 적는 것이 핵심입니다.','sourceQuery':'프레스 주요 구조부 변경 안전인증 고시'},
 {'field':'기계안전','base':'고소작업대','question':'고소작업대의 연장구조물에 대한 안전검사 핵심기준을 설명하시오.','answer':'연장구조물은 작업대와 견고하게 결합되어 이탈·탈락 위험이 없어야 하고, 최대 적재하중과 구조강도를 확보하며, 안전난간 등 추락방지 기능을 유지해야 합니다. 연장으로 인해 안정도·전도위험이 증가하지 않도록 제조자 허용범위와 안전검사 고시의 구조기준을 확인합니다.','sourceQuery':'고소작업대 연장구조물 안전검사 고시'},
 {'field':'기계안전','base':'국소배기장치','question':'국소배기장치의 5개 기본 구성과 배풍기 점검사항을 설명하시오.','answer':'기본 구성은 후드, 덕트, 공기정화장치, 배풍기, 배기구입니다. 배풍기는 회전방향과 풍량·정압, 소음·진동, 벨트·축·베어링 상태, 케이싱 손상과 누설 등을 점검합니다. 시험에서 3가지를 요구하면 고시의 검사표현으로 3개를 정확히 골라 씁니다.','sourceQuery':'국소배기장치 구조 배풍기 안전검사 고시'},
 {'field':'기계안전','base':'지게차','question':'지게차의 방호장치와 각각의 목적을 설명하시오.','answer':'대표적으로 전조등·후미등은 시야와 차량 식별, 헤드가드는 낙하물 방호, 백레스트는 화물의 운전자 방향 낙하방지, 좌석안전띠는 전도 시 운전자 이탈 방지, 후진경보기·경광등 또는 후방감지기는 후진 충돌 예방을 위한 장치입니다. 장치명과 기능을 연결해 답합니다.','sourceQuery':'지게차 방호장치 위험기계기구 방호조치 기준'},
 {'field':'기계안전','base':'특별교육','question':'프레스 작업 특별교육에서 반드시 다뤄야 할 내용의 범주를 설명하시오.','answer':'프레스 작업의 위험성과 방호장치, 금형의 설치·해체 및 조정, 안전한 재료 송급·배출, 기계 점검과 이상 시 조치, 작업 전 점검, 보호구와 사고사례·응급조치 등을 교육합니다. 정확한 교육항목은 시행규칙 별표5의 해당 작업별 교육내용을 기준으로 씁니다.','sourceQuery':'프레스 특별교육 시행규칙 별표5'},
 {'field':'기계안전','base':'유해위험방지계획서','question':'유해위험방지계획서에서 설치·이전·주요구조부 변경을 구분해 설명하시오.','answer':'법령상 대상 업종·설비에 해당하는 사업주가 생산공정과 직접 관련된 건설물·기계·기구·설비를 설치하거나 이전하거나 주요 구조부분을 변경하려는 경우 계획서를 작성·제출합니다. 답안은 대상 업종·설비, 행위 유형, 제출시기, 심사·확인 절차를 순서대로 적고 세부 대상은 시행령 제42조와 관련 고시를 확인합니다.','sourceQuery':'유해위험방지계획서 설치 이전 주요구조부 변경 시행령 제42조'},
 {'field':'기계안전','base':'안전보건개선계획','question':'안전보건진단과 안전보건개선계획의 관계를 설명하시오.','answer':'산업재해 예방을 위해 전문적인 진단이 필요한 사업장에는 안전보건진단을 명할 수 있고, 위험성이 높은 사업장에는 안전보건개선계획의 수립·시행을 명할 수 있습니다. 일부 대상은 안전보건진단을 받아 그 결과를 바탕으로 개선계획을 수립해야 합니다. 대상기준·명령절차·계획내용을 각각 구분해 씁니다.','sourceQuery':'안전보건진단 안전보건개선계획 수립 대상'},
 {'field':'기계안전','base':'중대재해처벌법','question':'경영책임자가 반기 1회 이상 점검해야 하는 안전·보건 관계 법령 의무 이행사항을 설명하시오.','answer':'경영책임자 등은 안전·보건 관계 법령에 따른 의무가 이행되는지 반기 1회 이상 점검하고, 점검 결과 미이행 사항이 확인되면 인력 배치·예산 추가 편성 등 필요한 조치를 해야 합니다. 법정 교육이 실시되는지도 점검하고 미실시 시 즉시 이행하도록 조치합니다. 세부 내용은 중대재해처벌법 시행령 제5조를 확인합니다.','sourceQuery':'중대재해처벌법 시행령 제5조 반기 1회 점검'},
 {'field':'기계안전','base':'동력차단','question':'비상정지와 정비 시 동력차단(LOTO)의 차이를 설명하시오.','answer':'비상정지는 위험상황에서 기계의 위험동작을 신속히 멈추는 기능이고, 동력차단은 청소·정비·수리 중 불시기동과 잔류에너지 방출을 예방하기 위한 작업절차입니다. 정비 시에는 정지 후 에너지원 차단, 잠금·표지, 잔류에너지 제거, 무에너지 상태 확인까지 해야 합니다.','sourceQuery':'기계 동력차단 정비 잠금 표지 LOTO 기준규칙'},
 {'field':'기계안전','base':'안전인증','question':'안전인증과 자율안전확인신고의 차이를 대상·절차·책임 관점에서 설명하시오.','answer':'안전인증은 위험도가 높은 대상기계 등에 대해 인증기관의 심사·확인을 거쳐 적합성을 인정받는 제도이고, 자율안전확인은 제조·수입자가 자율안전기준 적합성을 확인해 신고하는 제도입니다. 대상품목과 절차, 표시, 변경·면제 기준이 서로 다르므로 시행령과 각 고시 별표를 나눠 답합니다.','sourceQuery':'안전인증 자율안전확인 차이 대상 절차'},
 {'field':'기계안전','base':'안전검사','question':'안전검사와 자율검사프로그램 인정의 관계를 설명하시오.','answer':'안전검사 대상기계는 법정 주기에 따라 안전검사를 받는 것이 원칙입니다. 사업주가 검사인력·장비·절차 등 요건을 갖춘 자율검사프로그램을 운영하고 인정을 받은 경우에는 인정범위에서 법정 안전검사를 대체할 수 있습니다. 인정요건, 유효기간, 취소사유를 최신 법령으로 확인합니다.','sourceQuery':'자율검사프로그램 인정 안전검사 산업안전보건법'},
 {'field':'기계안전','base':'작업계획서','question':'작업계획서를 작성해야 하는 기계작업 중 기계안전 분야에서 자주 출제되는 작업을 설명하시오.','answer':'차량계 하역운반기계, 차량계 건설기계, 중량물 취급, 타워크레인 설치·조립·해체 등 법령에서 정한 작업은 사전조사와 작업계획서 작성이 요구됩니다. 답안에는 대상작업을 먼저 쓰고, 해당 작업별 계획서에 운행경로·작업방법·전도·낙하·협착 방지대책 등 별표4의 핵심 내용을 연결합니다.','sourceQuery':'기준규칙 제38조 별표4 작업계획서 기계'},
]
for i,v in enumerate(variants,1):
    v['id']=f'v{i:03d}'; v['sourceQuery']=source_query(v['sourceQuery'])

# ---------- 3차 : 실제 교재 목차가 아니라 본문 질문표시를 파싱하여 기출/예상 분리 ----------
text=Path('/mnt/data/3cha.txt').read_text(encoding='utf-8',errors='ignore').replace('\r','')
starts=[]
for m in re.finditer(r'(?m)^["“]?\s*(\d{1,3})\s+([^\n]+?\?)\s*$',text):
    after=text[m.end():m.end()+320]
    om=re.search(r'(?m)^\s*(기출문제|예상문제)\s*(.*?)\s*$',after)
    if om:
        q=clean(m.group(2))
        # PDF 줄바꿈 때문에 질문 앞부분이 직전 줄로 밀린 경우 복원한다.
        tail=text[max(0,m.start()-340):m.start()]
        non=[clean(x) for x in tail.splitlines() if clean(x)]
        if len(non)>=2 and non[-2].strip('\f').strip()=="\"":
            prefix=non[-1].strip('\f').strip('\"“” ')
            if prefix and len(prefix)<170 and not prefix.startswith(('*','Tip')):
                q=clean(prefix+' '+q)
        starts.append({'pos':m.start(),'endq':m.end(),'no':int(m.group(1)),'question':q,'origin':om.group(1),'lineAfter':clean(om.group(2))})

# find answer text and compact it. It is intentionally summarized, not copied wholesale.
def compact_answer(block, question, origin_line):
    lines=[clean(x.strip('"“”')) for x in block.replace('\f','\n').splitlines()]
    lines=[x for x in lines if x]
    # remove question/origin/source headers
    out=[]
    skipped_origin=False
    for ln in lines:
        if question.rstrip('?') in ln or ln.endswith('?'): continue
        if ln in ('기출문제','예상문제'): skipped_origin=True; continue
        if ln.startswith('* Tip') or ln.startswith('*Tip') or ln.startswith('Tip :') or ln.startswith('*아래') or ln.startswith('아래 내용'): break
        if '본 내용물은 작성자 승인없이' in ln: continue
        # source line is useful as separate reference, not answer text
        if re.search(r'(산업안전보건|안전검사|위험기계|KOSHA|지침|고시|규칙|시행령|시행규칙|법 제\d|별표)',ln) and len(ln)<95 and not re.match(r'^\d+[.)]',ln):
            continue
        out.append(ln)
    raw=' '.join(out)
    raw=re.sub(r'\s+',' ',raw).strip()
    # collect numbered items from original answer block
    bullets=[]
    for ln in out:
        m=re.match(r'^(?:\d+|[가-하])[.)]?\s*(.+)$',ln)
        if m:
            item=clean(m.group(1)).strip(' .')
            if item and len(item)>2 and item not in bullets: bullets.append(item)
    if len(bullets)>=2:
        picked=[]
        size=0
        for item in bullets[:10]:
            if size+len(item)>430: break
            picked.append(item); size+=len(item)
        ans='; '.join(picked) + '.'
    else:
        # sentence level compacting
        sents=re.split(r'(?<=[.!?다요])\s+',raw)
        chosen=[]
        for s in sents:
            s=clean(s)
            if not s: continue
            if len(' '.join(chosen+[s]))>430: break
            chosen.append(s)
            if len(chosen)>=3: break
        ans=' '.join(chosen) if chosen else '공식 근거의 정의·대상·수치·예외를 먼저 말하고, 마지막에 현장 예방조치를 덧붙여 답합니다.'
    if len(ans)>520: ans=ans[:517].rstrip()+"…"
    # PDF 텍스트 추출에서 첫 음절이 잘린 흔한 패턴을 최소 보정한다.
    fixes=[
      (r'(?<![가-힣])업안전지도사','산업안전지도사'),(r'(?<![가-힣])업재해','산업재해'),(r'(?<![가-힣])업주는','사업주는'),
      (r'(?<![가-힣])무를 제공하는','노무를 제공하는'),(r'(?<![가-힣])움을 받고자','도움을 받고자'),(r'(?<![가-힣])금장치','잠금장치'),
      (r'(?<![가-힣])력용기','압력용기'),(r'(?<![가-힣])인리히','하인리히'),(r'(?<![가-힣])장하였습니다','주장하였습니다'),
      (r'산업재해\s*;?\s*사표','산업재해 조사표'),(r'(?<![가-힣])는 그 밖의','또는 그 밖의'),(r'인양 중인 하물','인양 중인 화물'),
      (r'(?<![가-힣])전성평가','안전성평가'),(r'압력용기의 방호장치는; 전밸브','압력용기의 방호장치는; 안전밸브'),
      (r'작업지휘자를; 치합니다','작업지휘자를 배치합니다')
    ]
    for a,b in fixes: ans=re.sub(a,b,ans)
    ans=ans.replace('말합니다. 입니다.','말합니다.').replace('입니다.입니다.','입니다.')
    ans=re.sub(r'\s+',' ',ans).strip()
    return ans

def find_reference(block, line_after):
    cands=[]
    if line_after: cands.append(line_after)
    for ln in block.splitlines()[:8]: cands.append(clean(ln))
    for c in cands:
        if re.search(r'(산업안전보건|안전검사|위험기계|KOSHA\s*GUIDE|사업장 위험성평가|고시|기준에 관한 규칙|시행령|시행규칙|벌목 표준)',c,re.I):
            # strip origin/question words
            c=re.sub(r'^(기출문제|예상문제)\s*','',c).strip()
            if c and len(c)<140:return c
    return ''

def mnemonic_from_block(block):
    items=[]
    for ln in block.replace('\f','\n').splitlines():
        ln=clean(ln)
        m=re.match(r'^\d+[.)]?\s*([가-힣A-Za-z])',ln)
        if m: items.append(m.group(1))
    code=''.join(items[:7])
    return code if 3<=len(code)<=7 else ''

third=[]
for idx,s in enumerate(starts):
    end=starts[idx+1]['pos'] if idx+1<len(starts) else min(len(text),s['pos']+4000)
    block=text[s['pos']:end]
    ref=find_reference(block,s['lineAfter'])
    third.append({
        'id':f'i{s["no"]:03d}','no':s['no'],'origin':'기출' if s['origin']=='기출문제' else '신출예상',
        'question':s['question'],'modelAnswer':compact_answer(block,s['question'],s['origin']),
        'reference':ref,'sourceQuery':source_query(ref or s['question']),'mnemonic':mnemonic_from_block(block)
    })

# Remove obvious parser fragments and duplicate numbers; keep the most complete question per number.
by_no={}
for x in third:
    if x['no'] not in by_no or len(x['question'])>len(by_no[x['no']]['question']): by_no[x['no']]=x
third=[by_no[k] for k in sorted(by_no)]

# ---------- output ----------
out={
 'meta':{
   'title':'산업안전지도사 학습실','version':'V24','updated':'2026-09-06',
   'scope':'1차는 2013~2026 CBT 중복주제, 2차와 3차는 제공된 기계안전 기출·면접자료를 중심으로 구성',
   'copyright':'상업 교재의 문장을 그대로 게시하지 않고 출제 주제 파악에만 참고했으며, 답변은 요약·재구성하고 공식 법령·고시·KOSHA 원문 확인 기능을 연결합니다.'
 },
 'first':{
   'summary':{'questions':75,'minutes':90,'subjects':['산업안전보건법령','산업안전일반','기업진단·지도'],'pass':'각 과목 40점 이상 + 전 과목 평균 60점 이상'},
   'repeats':repeats
 },
 'second':{'pastQuestions':past,'variants':variants},
 'third':{
   'template':['답부터 한 문장','요구한 항목을 3~6개로 나열','법령·고시 질문이면 근거 1개','예방대책 질문이면 현장조치로 마무리'],
   'questions':third
 },
 'live':{
   'lawQueries':['산업안전보건법 개정','산업안전보건기준에 관한 규칙 개정','안전검사 고시','안전검사 절차에 관한 고시','자율안전확인 신고 고시','사업장 위험성평가에 관한 지침'],
   'newsKeyword':'산업안전 중대재해 안전보건'
 }
}
json.dump(out,open(ROOT/'data/safety-instructor-study.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print('first repeats',len(repeats))
print('second past',len(past),'variants',len(variants))
print('third',len(third),Counter(x['origin'] for x in third))
