import json, re, copy
from pathlib import Path

ROOT=Path('/mnt/data/safetygwajang_v25_instructor')
DATA=ROOT/'data/safety-instructor-study.json'
V23=Path('/mnt/data/safetygwajang_v23_instructor/data/safety-instructor-study.json')

def law_search(title):
    from urllib.parse import quote
    return 'https://www.law.go.kr/lsSc.do?query='+quote(title)

def adm_search(title):
    from urllib.parse import quote
    return 'https://www.law.go.kr/admRulSc.do?menuId=5&query='+quote(title)

with DATA.open(encoding='utf-8') as f:
    d=json.load(f)

# ---------- official source library ----------
sources=[
 {'id':'osh_act','type':'법','title':'산업안전보건법','query':'산업안전보건법','url':'https://www.law.go.kr/법령/산업안전보건법','focus':'조문·위임규정'},
 {'id':'osh_decree','type':'시행령','title':'산업안전보건법 시행령','query':'산업안전보건법 시행령','url':'https://www.law.go.kr/법령/산업안전보건법시행령','focus':'대상·규모·별표'},
 {'id':'osh_rule','type':'시행규칙','title':'산업안전보건법 시행규칙','query':'산업안전보건법 시행규칙','url':'https://www.law.go.kr/법령/산업안전보건법시행규칙','focus':'절차·주기·별표'},
 {'id':'osh_std','type':'규칙','title':'산업안전보건기준에 관한 규칙','query':'산업안전보건기준에 관한 규칙','url':'https://www.law.go.kr/법령/산업안전보건기준에관한규칙','focus':'기계·설비·작업별 안전기준'},
 {'id':'serious_act','type':'법','title':'중대재해 처벌 등에 관한 법률','query':'중대재해 처벌 등에 관한 법률','url':'https://www.law.go.kr/법령/중대재해처벌등에관한법률','focus':'중대산업재해·중대시민재해'},
 {'id':'serious_decree','type':'시행령','title':'중대재해 처벌 등에 관한 법률 시행령','query':'중대재해 처벌 등에 관한 법률 시행령','url':'https://www.law.go.kr/법령/중대재해처벌등에관한법률시행령','focus':'안전보건관리체계·반기 점검'},
 {'id':'safety_inspection','type':'고시','title':'안전검사 고시','query':'안전검사 고시','url':'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000281066','focus':'2026.6.26 시행 · 검사기준 별표1~14'},
 {'id':'safety_inspection_proc','type':'고시','title':'안전검사 절차에 관한 고시','query':'안전검사 절차에 관한 고시','url':'https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000281068','focus':'신청·검사·표시·경과조치'},
 {'id':'self_confirm_proc','type':'고시','title':'안전인증·자율안전확인신고의 절차에 관한 고시','query':'안전인증 자율안전확인신고 절차 고시','url':'https://law.go.kr/admRulLsInfoP.do?admRulSeq=2100000214148','focus':'대상·신고·면제·변경'},
 {'id':'machine_cert','type':'고시','title':'위험기계·기구 안전인증 고시','query':'위험기계 기구 안전인증 고시','url':'https://law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000228814','focus':'프레스·크레인 등 안전인증 기준'},
 {'id':'guard_cert','type':'고시','title':'방호장치 안전인증 고시','query':'방호장치 안전인증 고시','url':'https://law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000199056','focus':'방호장치·가설기자재 안전인증'},
 {'id':'risk_guide','type':'지침','title':'사업장 위험성평가에 관한 지침','query':'사업장 위험성평가에 관한 지침','url':'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000251014','focus':'최초·수시·정기·상시평가·인정'},
 {'id':'edu_rule','type':'고시','title':'안전보건교육규정','query':'안전보건교육규정','url':'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000269024','focus':'교육과정·교육시간·강사기준'},
 {'id':'metal1','type':'지침','title':'제1차 금속산업 안전작업지침','query':'제1차 금속산업 안전작업지침','url':'https://www.law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000186126','focus':'제2조 정의 · 용광로·용해로·주조·단조·압연'},
 {'id':'construction_cost','type':'고시','title':'건설업 산업안전보건관리비 계상 및 사용기준','query':'건설업 산업안전보건관리비 계상 및 사용기준','url':'https://law.go.kr/LSW/admRulLsInfoP.do?admRulSeq=2100000254546','focus':'계상·사용·별표'},
 {'id':'psm','type':'고시','title':'공정안전보고서 제출·심사·확인 및 이행상태평가 관련 규정','query':'공정안전보고서 제출 심사 확인 이행상태평가 고시','url':adm_search('공정안전보고서 제출 심사 확인 이행상태평가'),'focus':'PSM 대상·구성·심사·평가'},
 {'id':'hazard_plan','type':'고시','title':'제조업 등 유해·위험방지계획서 제출·심사·확인 관련 고시','query':'제조업 유해위험방지계획서 제출 심사 확인 고시','url':adm_search('제조업 유해 위험방지계획서 제출 심사 확인'),'focus':'대상·제출·심사·확인'},
 {'id':'restricted_work','type':'규칙','title':'유해·위험작업의 취업 제한에 관한 규칙','query':'유해 위험작업 취업 제한 규칙','url':law_search('유해 위험작업의 취업 제한에 관한 규칙'),'focus':'자격·면허·기능·경험'},
 {'id':'elevator_act','type':'법','title':'승강기 안전관리법','query':'승강기 안전관리법 제32조 안전검사','url':'https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1026949909','focus':'제32조 정기·수시·정밀안전검사'},
 {'id':'elevator_rule','type':'시행규칙','title':'승강기 안전관리법 시행규칙','query':'승강기 안전관리법 시행규칙 안전검사','url':'https://www.law.go.kr/법령/승강기안전관리법시행규칙','focus':'검사주기·검사기준'},
 {'id':'construction_tech','type':'법','title':'건설기술진흥법','query':'건설기술진흥법 안전관리계획','url':'https://www.law.go.kr/법령/건설기술진흥법','focus':'안전관리계획·설계안전성검토'},
 {'id':'construction_tech_decree','type':'시행령','title':'건설기술진흥법 시행령','query':'건설기술진흥법 시행령 안전관리계획','url':'https://www.law.go.kr/법령/건설기술진흥법시행령','focus':'대상·절차·별표'},
 {'id':'kosha_guide','type':'KOSHA GUIDE','title':'KOSHA GUIDE 통합검색','query':'KOSHA GUIDE 기계안전','url':'https://smartsearch.kosha.or.kr/','focus':'M·E·P·C 등 분야별 기술지침'},
]
source_by_id={s['id']:s for s in sources}

rules=[
 (r'승강기|엘리베이터', ['elevator_act','elevator_rule']),
 (r'용해로|용광로|큐폴라|제강로|평로|전로|도가니로|전호로|금속산업', ['metal1','osh_std']),
 (r'중대산업재해|중대시민재해|중대재해.?처벌|경영책임자|반기', ['serious_act','serious_decree']),
 (r'안전보건관리규정', ['osh_act','osh_rule']),
 (r'근로자.?대표|산업안전보건위원회|명예산업안전감독관|지도사 직무|산업안전지도사', ['osh_act','osh_decree']),
 (r'위험성평가', ['osh_act','risk_guide']),
 (r'안전검사|배풍기|국소배기장치|고소작업대.*검사|훅.*검사', ['osh_decree','osh_rule','safety_inspection','safety_inspection_proc']),
 (r'자율안전|안전인증|주요 구조부', ['osh_act','self_confirm_proc','machine_cert','guard_cert']),
 (r'프레스|전단기|크레인|리프트|압력용기|곤돌라|원심기|롤러기|사출성형기|컨베이어|산업용.?로봇|혼합기|파쇄기|분쇄기|보일러|지게차|예초기|포장기계|동력.?차단|동력.?작동문|공작기계|선반|와이어.?로프|훅|줄걸이', ['osh_std','safety_inspection','machine_cert','guard_cert','kosha_guide']),
 (r'특별교육|안전보건교육|교육', ['osh_act','osh_rule','edu_rule']),
 (r'유해.?위험.?방지.?계획서|유해위험방지계획서', ['osh_act','osh_decree','osh_rule','hazard_plan']),
 (r'공정안전보고서|PSM', ['osh_act','osh_decree','psm']),
 (r'산업안전보건관리비|안전관리비', ['osh_act','construction_cost']),
 (r'안전관리계획|설계안전|건설기술진흥법|비계|타워크레인|굴착|건설', ['osh_std','construction_tech','construction_tech_decree','kosha_guide']),
 (r'화재감시자|용접|아세틸렌|가스집합', ['osh_std','kosha_guide']),
 (r'유해.?위험작업.*취업|자격.*작업', ['restricted_work','osh_act']),
]

def get_links(text, query=''):
    ids=[]
    s=(text+' '+query).replace(' ', '')
    for pat, srcs in rules:
        if re.search(pat.replace(' ',''), s, re.I):
            for sid in srcs:
                if sid not in ids: ids.append(sid)
    if not ids: ids=['osh_act','osh_decree','osh_rule','osh_std','kosha_guide']
    return [copy.deepcopy(source_by_id[i]) for i in ids[:6]]

# ---------- 1차: keep only 2+ repeats, clean source links ----------
for x in d['first']['repeats']:
    x['officialLinks']=get_links(x.get('question',''),x.get('sourceQuery',''))
    # keep the actual question+answer; explanation already belongs to supplied JSONs

# ---------- 2차 fixed answer upgrades ----------
answer_override={
 'q002': '안전보건관리규정은 사업장의 안전·보건을 유지하기 위한 내부 기준입니다.\n① 포함사항: 안전·보건 관리조직과 직무, 안전보건교육, 작업장의 안전·보건관리, 사고조사 및 대책, 그 밖의 안전·보건 사항\n② 작성대상: 시행규칙 별표2의 사업·상시근로자 수 기준\n③ 작성기한: 작성 사유가 발생한 날부터 30일 이내, 변경 사유가 생긴 경우에도 30일 이내\n④ 절차: 산업안전보건위원회 심의·의결, 위원회가 없으면 근로자대표 동의\n⑤ 단체협약·취업규칙에 반할 수 없고 사업주와 근로자 모두 준수해야 합니다.',
 'q003': '복원문에 대상 기계명이 빠져 있어 “대상/비대상” 결론은 확정할 수 없습니다. 시험 답안은 ① 시행령 제78조의 안전검사대상기계 해당 여부 ② 기계별 적용제외 ③ 안전검사 고시의 정의·검사범위 ④ 시행규칙 제126조 검사주기를 순서대로 대입해 결론을 씁니다. 기계명이 확인되면 이 4단계로 대상 여부를 단정합니다.',
 'q004': '복원문에 대상 기계명이 빠져 있어 “대상/비대상” 결론은 확정할 수 없습니다. 시험 답안은 ① 시행령 제78조의 안전검사대상기계 해당 여부 ② 기계별 적용제외 ③ 안전검사 고시의 정의·검사범위 ④ 시행규칙 제126조 검사주기를 순서대로 대입해 결론을 씁니다. 기계명이 확인되면 이 4단계로 대상 여부를 단정합니다.',
 'q007': '자율안전확인 대상판단은 ① 법·시행령상 자율안전확인대상 품목 확인 ② 고시의 세부 종류·규격·형식 확인 ③ 적용제외·면제 확인 ④ 제시된 용량·출력·이송거리 등 수치를 대입 ⑤ 대상이면 안전기준 적합성을 확인해 신고하는 순서입니다. 바로 뒤의 사례형 문항(분쇄기·컨베이어)은 이 기준을 대입해 결론을 냅니다.',
 'q017': '현행 안전검사 대상은 프레스, 전단기, 크레인, 리프트, 압력용기, 곤돌라, 국소배기장치, 원심기, 롤러기, 사출성형기, 고소작업대, 컨베이어, 산업용 로봇, 혼합기, 파쇄기·분쇄기입니다.\n검사주기: ① 크레인(이동식 제외)·리프트(이삿짐 제외)·곤돌라는 설치 후 3년 이내 최초, 이후 2년마다. 건설현장은 설치일부터 6개월마다 ② 이동식 크레인·이삿짐운반용 리프트·고소작업대는 신규등록 후 3년 이내 최초, 이후 2년마다 ③ 나머지 대상기계는 설치 후 3년 이내 최초, 이후 2년마다이며 PSM 확인 압력용기는 4년마다입니다.',
 'q022': '근로자대표가 사업주에게 통지를 요청할 수 있는 사항은 ① 산업안전보건위원회 또는 노사협의체 의결사항 ② 안전보건진단 결과 ③ 안전보건개선계획의 수립·시행 ④ 도급인의 산업재해 예방조치 이행사항 ⑤ 물질안전보건자료 ⑥ 작업환경측정 ⑦ 그 밖에 고용노동부령으로 정하는 안전·보건 사항입니다. 암기는 “위-진-개-도-MSDS-측-기타”로 합니다.',
 'q040': '화재감시자 배치장소는 ① 용접·용단 작업반경 11m 이내에 건물 구조 자체나 내부에 가연성물질이 있는 장소 ② 작업반경 11m 이내 바닥 하부에 있는 가연성물질이 불꽃에 의해 쉽게 발화될 우려가 있는 장소 ③ 가연성물질이 금속 칸막이·벽·천장·지붕의 반대쪽에 인접하여 열전도·열복사로 발화할 우려가 있는 장소입니다. 같은 장소에서 상시·반복 작업하고 경보설비와 소화설비 등이 갖춰진 경우에는 예외가 있습니다.',
 'q044': '상시평가는 월·주·일 단위의 일상적 안전활동에 위험성평가 절차를 결합하는 방식입니다. 상시평가를 실시하면 정기평가를 실시한 것으로 볼 수 있는 요건을 갖춰야 하며, 수시평가 사유가 발생한 때에는 해당 유해·위험요인에 대해 즉시 평가합니다. 세부요건은 「사업장 위험성평가에 관한 지침」의 상시평가 조항을 기준으로 답합니다.',
 'q050': '위험성평가 인정사업장은 인정 유효기간 동안 고용노동부장관이 별도로 지정한 안전보건 감독·점검을 유예할 수 있고, 위험성평가를 실시하거나 인정을 받은 사업장은 정부 포상·표창 우선 추천 등 혜택을 받을 수 있습니다. 인정 여부는 사업주의 관심도, 위험성평가 실행수준, 구성원의 참여·이해, 재해발생 수준을 심사합니다.',
 'q059': '위험성평가는 최초평가, 수시평가, 정기평가 또는 상시평가로 실시합니다. 수시평가는 건설물·기계·기구·설비의 설치·이전·변경·해체, 원재료 변경, 작업방법·절차의 신규 도입·변경, 정비·보수, 중대산업사고 또는 산업재해 발생 등 새로운 위험이 생기거나 기존 위험이 달라진 때 실시합니다. 숫자 암기보다 현행 지침의 수시평가 사유를 그대로 묶어 외웁니다.',
 'q077': '위험성평가는 최초평가, 수시평가, 정기평가 또는 상시평가로 구분합니다. 최초평가는 사업이 성립된 날부터 일정 기간 안에 사업장 전체를 대상으로 실시하고, 수시평가는 설비·원재료·작업방법 등의 변경, 정비·보수, 재해발생 등 위험이 새로 생기거나 달라질 때 실시합니다. 정기·상시평가는 현행 「사업장 위험성평가에 관한 지침」 기준을 적용합니다.',
 'q079': '위험성평가는 최초평가, 수시평가, 정기평가 또는 상시평가로 구분합니다. 수시평가는 설비·원재료·작업방법 등의 신규 도입·변경, 정비·보수, 산업재해 발생 등 새로운 유해·위험요인이 생기거나 위험성이 달라지는 때 실시합니다. 답안에는 “언제 평가하는가”와 “평가 후 감소대책을 실행하는가”를 함께 씁니다.',
 'q084': '산업재해발생건수 등의 공표는 법령이 정한 고위험·위반 사업장을 대상으로 합니다. 답안은 ① 사망재해 등 재해지표 기준 ② 중대산업사고 발생 ③ 산업재해 은폐 ④ 산업재해 보고의 반복적 미이행 등 현행 시행령상 공표대상을 구분해 씁니다. 정확한 인원·횟수는 최신 시행령 조문을 기준으로 합니다.',
 'q092': '화재감시자는 용접·용단 작업이 화재감시자 배치요건에 해당하면 지정·배치합니다. 다만 같은 장소에서 상시·반복적으로 용접·용단 작업을 하고, 그 장소에 경보용 설비·기구와 소화설비 또는 소화기가 갖추어진 경우에는 화재감시자를 별도로 지정·배치하지 않을 수 있습니다.',
 'q099': '산업안전지도사의 법정 직무는 ① 공정상의 안전에 관한 평가·지도 ② 유해·위험 방지대책에 관한 평가·지도 ③ 위 사항과 관련된 계획서·보고서 작성 ④ 위험성평가 지도 ⑤ 안전보건개선계획서 작성 ⑥ 그 밖의 산업안전에 관한 자문·조언입니다. 기계안전 분야의 세부 업무범위는 시행령 별표31에 따라 기계·기구·설비의 안전성 평가와 기술지도 등을 포함합니다.',
 'q100': '일정 규모 이상의 회사 대표이사는 매년 회사의 안전·보건에 관한 계획을 수립해 이사회에 보고하고 승인을 받아야 합니다. 계획에는 안전·보건 경영방침, 안전·보건관리 조직의 구성·인원·역할, 관련 예산·시설의 현황과 계획, 전년도 활동실적과 다음 연도 활동계획 등이 포함됩니다. 대상 사업·규모는 시행령의 현행 기준을 적용합니다.',
 'q101': '유해·위험방지계획서는 법령상 대상 사업·건설공사에서 착공 또는 해당 작업 전에 유해·위험요인과 예방대책을 미리 작성하여 공단의 심사를 받는 제도입니다. 답안은 ① 제출대상 ② 계획서 포함내용 ③ 제출시기·제출처 ④ 심사결과(적정·조건부 적정·부적정) ⑤ 공사 중 확인·변경·개선조치 순으로 씁니다.',
 'q107': '유해·위험방지계획서 절차는 “대상판단 → 계획서 작성 → 법정기한 내 공단 제출 → 공단 심사 → 적정·조건부 적정·부적정 통지 → 착공·설치 후 계획 이행 → 법정주기에 따른 확인 → 변경·추가 위험요인 개선” 순입니다.',
 'q115': '안전·보건에 관한 계획은 대상 회사의 대표이사가 매년 수립해 이사회에 보고하고 승인을 받습니다. 계획에는 경영방침, 안전·보건관리 조직의 구성·인원·역할, 안전·보건 예산·시설 현황과 계획, 전년도 활동실적과 다음 연도 활동계획 등이 포함됩니다. 대상 규모는 최신 시행령을 확인합니다.',
 'q117': '안전난간은 추락위험 장소에 설치하는 집단방호설비로 상부난간대, 중간난간대, 발끝막이판, 난간기둥 등으로 구성합니다. 상부난간대 높이, 중간난간대 배치, 발끝막이판 높이와 구조·강도는 「산업안전보건기준에 관한 규칙」의 안전난간 구조 및 설치요건을 그대로 적용합니다.',
 'q118': '프레스 특별교육은 프레스의 위험성과 방호장치, 금형의 부착·해체 및 조정작업, 안전작업방법, 점검·정비 시 동력차단과 재가동 방지, 사고사례와 비상조치 등을 중심으로 실시합니다. 법정 세부 교육내용과 시간은 시행규칙 별표4·5 및 안전보건교육규정을 기준으로 합니다.',
 'q128': '자율안전확인대상 기계·기구 등을 제조하거나 수입하는 자는 제품의 안전기준 적합성을 스스로 확인하여 고용노동부장관에게 신고하고 자율안전확인표시를 해야 합니다. 답안은 대상품목 → 세부 종류·규격 → 적용제외·신고면제 → 안전기준 적합 확인 → 신고 → 표시 순으로 씁니다.',
 'q134': '안전보건개선계획은 산업재해 예방을 위해 개선이 필요한 사업장에 고용노동부장관이 수립·시행을 명할 수 있는 계획입니다. 사업주는 근로자대표의 의견을 들어 계획을 수립하고, 안전·보건 시설·설비 개선, 안전보건관리체계와 교육 등 필요한 개선사항을 포함하여 제출·이행합니다. 구체 대상은 법·시행령의 현행 기준을 적용합니다.',
 'q136': '유해·위험방지계획서는 대상 사업·건설공사가 착공·설치 전에 유해·위험요인과 예방대책을 작성해 공단의 심사를 받는 제도입니다. 답안은 제출대상 → 포함내용 → 제출시기·제출처 → 심사 → 확인 → 변경·개선 순으로 씁니다.',
 'q139': '근로자 안전보건교육은 정기교육, 채용 시 교육, 작업내용 변경 시 교육, 특별교육으로 구분합니다. 관리감독자 교육과 직무교육은 별도 체계로 구분하고, 각 교육은 대상·시간·교육내용·교육기록을 법정 기준에 따라 실시합니다. 유해·위험작업은 시행규칙 별표의 특별교육 대상과 세부내용을 함께 적습니다.',
 'q140': '기계안전 분야 산업안전지도사의 업무는 산업안전지도사의 법정 직무에 더해 시행령 별표31의 기계안전 분야 업무범위를 적용합니다. 핵심은 기계·기구·설비의 설계·배치·보수·유지와 위험기계·자동화설비 등에 대한 안전성 평가·기술지도, 관련 계획서·보고서 작성 지도 및 교육·자문입니다.',
 'extra-142': '식품가공용 기계는 원료 투입·절단·혼합·분쇄·반죽 등 과정에서 끼임·절단 위험이 있는 부분에 덮개·울 또는 인터록 등 방호조치를 하고, 청소·수리·점검 시에는 운전을 정지하고 기동장치를 잠그거나 표지를 설치하여 불시기동을 방지해야 합니다. 세부 3가지 조치는 「산업안전보건기준에 관한 규칙」의 식품가공용 기계 조항을 기준으로 적습니다.',
 'extra-143': '안전인증대상 프레스의 주요 구조부 변경 여부는 안전성능에 영향을 주는 프레스의 종류·구조·능력 및 주요 사양을 기준으로 판단합니다. 시험에서는 고시에 열거된 “주요 구조부” 항목을 그대로 쓰는 것이 채점상 안전하므로, 해당 프레스 형식의 고시 조항에서 항목을 확인하여 5개를 순서대로 적습니다.',
 'extra-144': '국소배기장치의 기본 구성은 ① 후드 ② 덕트 ③ 공기정화장치 ④ 배풍기 ⑤ 배기구입니다. 암기는 “후-덕-정-배-출”입니다. 안전검사에서는 배풍기의 회전상태·이상음/진동, 구동부·벨트·풀리 등 동력전달부의 상태와 방호, 성능 유지 여부를 안전검사 고시의 국소배기장치 기준에 따라 확인합니다.'
}

for x in d['second']['pastQuestions']:
    if x['id'] in answer_override: x['answer']=answer_override[x['id']]
    x['officialLinks']=get_links(x.get('question',''), x.get('sourceQuery',''))
    x['origin']='기출'

# Build new 2nd questions. Start with V24 variants, then selected high value V23 radar converted to Q/A.
newqs=[]
for x in d['second'].get('variants',[]):
    y=copy.deepcopy(x); y['origin']='신출'; y['id']='n-'+y.get('id','')
    y['officialLinks']=get_links(y.get('question',''),y.get('sourceQuery',''))
    newqs.append(y)

if V23.exists():
    v23=json.load(V23.open(encoding='utf-8'))
    for r in v23.get('newQuestionRadar',[]):
        if r.get('grade') not in ('S','A'): continue
        # Avoid same question text as existing new set.
        if any(n.get('question')==r.get('question') for n in newqs): continue
        mem=r.get('memorize') or []
        answer='\n'.join(f'{i+1}. {v}' for i,v in enumerate(mem))
        if r.get('id')=='r03':
            answer='현행 안전검사 대상은 프레스, 전단기, 크레인, 리프트, 압력용기, 곤돌라, 국소배기장치, 원심기, 롤러기, 사출성형기, 고소작업대, 컨베이어, 산업용 로봇, 혼합기, 파쇄기·분쇄기입니다. 대표 제외기준은 시행령 제78조와 안전검사 고시의 기계별 적용범위를 함께 적용합니다. 암기: 프전크리압곤 / 국원롤사고컨산 / 혼파분.'
        elif r.get('id')=='r09':
            answer='국소배기장치의 기본 구조는 후드 → 덕트 → 공기정화장치 → 배풍기 → 배기구입니다. 배풍기는 회전·진동·이상음, 구동부와 동력전달부의 상태, 방호 및 성능유지 여부를 안전검사 고시 기준으로 점검합니다. 암기: 후-덕-정-배-출.'
        elif r.get('id')=='r05':
            answer='안전인증과 자율안전확인신고는 주로 제조·수입 단계의 제품 안전성을 확인하는 제도이고, 안전검사는 사용 중인 안전검사대상기계의 안전성능 유지 여부를 법정주기로 확인하는 제도입니다. 답안에는 각 제도의 대상, 의무주체, 시점, 표시·검사, 면제·변경절차를 비교해 씁니다.'
        y={
          'id':'radar-'+r['id'],'origin':'신출','field':r.get('field','기계안전'),'base':r.get('title',''),
          'question':r.get('question',''),'answer':answer,'sourceQuery':r.get('sourceQuery',''),
          'mnemonic':r.get('mnemonic',''),'source':r.get('source',''),'grade':r.get('grade','A')
        }
        y['officialLinks']=get_links(y['question'],y['sourceQuery'])
        newqs.append(y)

d['second']['newQuestions']=newqs
# Keep variants for backward compatibility, but new UI will not use them.

# ---------- 3차: clean + add 2026 reconstructed past questions ----------
def clean_text(v):
    v=str(v or '')
    v=re.sub(r'\s*;\s*', ' / ', v)
    v=re.sub(r'\s+', ' ', v).strip()
    v=v.replace('해재','재해').replace('화재감사인','화재감시자')
    return v

for x in d['third']['questions']:
    x['question']=clean_text(x.get('question'))
    x['modelAnswer']=clean_text(x.get('modelAnswer'))
    x['reference']=clean_text(x.get('reference'))
    x['officialLinks']=get_links(x['question'],x.get('sourceQuery',''))

# Corrections for the first two statutory answers that were OCR-ish.
for x in d['third']['questions']:
    if x['id']=='i001':
        x['modelAnswer']='산업안전지도사의 직무는 ① 공정상의 안전에 관한 평가·지도 ② 유해·위험 방지대책에 관한 평가·지도 ③ 위 사항과 관련된 계획서·보고서 작성 ④ 위험성평가 지도 ⑤ 안전보건개선계획서 작성 ⑥ 그 밖의 산업안전에 관한 자문·조언입니다.'
        x['reference']='산업안전보건법 제142조·시행령 제101조'
    if x['id']=='i002':
        x['modelAnswer']='기계안전 분야는 기계·기구·설비의 안전성 평가와 기술지도, 관련 계획서·보고서 작성 지도, 위험기계와 자동화·제어설비의 위험방지, 설계·배치·보수·유지 단계의 안전기술, 그 밖의 교육·기술지도 업무를 수행합니다. 세부 범위는 시행령 별표31을 기준으로 답합니다.'
        x['reference']='산업안전보건법 시행령 제102조·별표31'

extra_past=[
 {
  'id':'i2026-elevator','origin':'기출','year':2026,
  'question':'승강기 수시검사를 할 경우 4가지 사항에 대해 이야기해보세요.',
  'modelAnswer':'수시검사는 다음 4가지 경우입니다. ① 승강기의 종류·제어방식·정격속도·정격용량 또는 왕복운행거리를 변경한 경우 ② 제어반 또는 구동기를 교체한 경우 ③ 승강기에 사고가 발생하여 수리한 경우 ④ 관리주체가 요청하는 경우입니다.',
  'reference':'승강기 안전관리법 제32조제1항제2호','sourceQuery':'승강기 안전관리법 제32조 수시검사','mnemonic':'변-교-사-요',
  'officialLinks':[copy.deepcopy(source_by_id['elevator_act']),copy.deepcopy(source_by_id['elevator_rule'])]
 },
 {
  'id':'i2026-melting-furnace','origin':'기출','year':2026,
  'question':'제1차 금속산업 안전작업지침에서 말하는 용해로란 무엇입니까?',
  'modelAnswer':'용해로는 금속을 용해하는 데 사용하는 노를 말합니다. 종류에는 큐폴라, 제강로, 평로, 전로, 도가니로 및 전호로 등이 포함됩니다.',
  'reference':'제1차 금속산업 안전작업지침 제2조제3호','sourceQuery':'제1차 금속산업 안전작업지침 용해로 제2조','mnemonic':'큐-제-평-전-도-전',
  'officialLinks':[copy.deepcopy(source_by_id['metal1'])]
 }
]
existing={x['id'] for x in d['third']['questions']}
for x in extra_past:
    if x['id'] not in existing: d['third']['questions'].insert(0,x)

adjacent=[
 ('i-new-metal-n','제1차 금속산업 안전작업지침에서 “노”의 정의를 말해보세요.','노는 광석 또는 금속을 용융하거나 고온을 연속적으로 작용시키기 위해 내화성 재료를 내장한 강제 프레임으로 만든 구조물 또는 실을 말합니다.','제1차 금속산업 안전작업지침 제2조제1호','제1차 금속산업 안전작업지침 노 정의','metal1'),
 ('i-new-blast','제1차 금속산업 안전작업지침에서 “용광로”의 정의를 말해보세요.','용광로는 내화벽돌 등을 사용하고 외부를 철로 보강한 수직형 또는 원통형 노로, 코크스·원료·용제를 섞은 광석에 가압공기를 공급하여 광석을 용해해 선철을 얻는 노입니다.','제1차 금속산업 안전작업지침 제2조제2호','제1차 금속산업 안전작업지침 용광로 정의','metal1'),
 ('i-new-cupola','제1차 금속산업 안전작업지침에서 “큐폴라”란 무엇입니까?','큐폴라는 코크스와 용제를 섞은 선철을 용융하기 위해 압축공기를 보내 반응시키는 수직형 노로, 상부에 연소가스 배출용 굴뚝을 갖추고 내부에 내화성 재료를 내장합니다.','제1차 금속산업 안전작업지침 제2조제4호','제1차 금속산업 안전작업지침 큐폴라 정의','metal1'),
 ('i-new-elevator-precision','승강기 정밀안전검사를 하는 경우를 말해보세요.','정밀안전검사는 ① 정기·수시검사 결과 결함 원인이 불명확하여 필요하다고 인정되는 경우 ② 승강기 결함으로 중대한 사고 또는 중대한 고장이 발생한 경우 ③ 설치검사 후 15년이 지난 경우 ④ 성능 저하로 이용자 안전을 위협할 우려가 있어 필요하다고 인정되는 경우에 실시합니다. 15년 경과의 경우 이후 3년마다 정밀안전검사를 받습니다.','승강기 안전관리법 제32조제1항제3호','승강기 안전관리법 제32조 정밀안전검사','elevator_act')
]
qset={x['question'] for x in d['third']['questions']}
for iid,q,a,ref,sq,sid in adjacent:
    if q not in qset:
        d['third']['questions'].append({'id':iid,'origin':'신출예상','question':q,'modelAnswer':a,'reference':ref,'sourceQuery':sq,'mnemonic':'','officialLinks':[copy.deepcopy(source_by_id[sid])]})

# ---------- source hit counts ----------
def link_ids(item): return {x.get('id') for x in item.get('officialLinks',[]) if x.get('id')}
for s in sources:
    sid=s['id']; counts={'first':0,'second':0,'third':0}
    counts['first']=sum(sid in link_ids(x) for x in d['first']['repeats'])
    counts['second']=sum(sid in link_ids(x) for x in d['second']['pastQuestions'])
    counts['third']=sum(sid in link_ids(x) for x in d['third']['questions'] if x.get('origin')=='기출')
    counts['total']=sum(counts.values())
    s['hits']=counts

d['sources']=sources
# Latest refresh queries: precise terms that surface changed regulations and interview-new territory.
d['live']['lawQueries']=[
 '산업안전보건법 2026 개정','산업안전보건법 시행령 2026 개정','산업안전보건법 시행규칙 2026 개정',
 '산업안전보건기준에 관한 규칙 2026 개정','안전검사 고시 2026','안전검사 절차에 관한 고시',
 '안전보건교육규정','사업장 위험성평가에 관한 지침','안전인증 자율안전확인신고 고시',
 '제1차 금속산업 안전작업지침','승강기 안전관리법 제32조','KOSHA GUIDE 기계안전'
]
d['meta']['updated']='2026-09-06'
d['meta']['version']='V25'
d['meta']['note']='문제-정답-원문 중심'

with DATA.open('w',encoding='utf-8') as f: json.dump(d,f,ensure_ascii=False,indent=2)

print('saved',DATA)
print('first repeats',len(d['first']['repeats']))
print('second past',len(d['second']['pastQuestions']),'new',len(d['second']['newQuestions']))
from collections import Counter
print('third',len(d['third']['questions']),Counter(x.get('origin') for x in d['third']['questions']))
print('sources',len(sources))
