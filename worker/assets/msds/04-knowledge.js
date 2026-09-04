/* =========================================================
   [4] MSDS 지식베이스 (CAS 정확매칭 + 강/약 키워드 점수제)
   ========================================================= */
const MSDS_KNOWLEDGE_BASE = [
    {
        id: 'sulfuric_acid',
        casNumbers: ['7664-93-9'],
        strongKeywords: ['황산', 'sulfuric acid', 'sulphuric acid', 'h2so4'],
        weakKeywords: ['sulfate', '유산'],
        template: {
            name: '황산 (Sulfuric Acid)',
            subtitle: '7664-93-9',
            manufacturer: '(파일 참조)',
            supplier: '(공급자 참조)',
            cas: '7664-93-9',
            signalWord: '위험',
            pictograms: ['GHS05','GHS06'],
            tags: ['special'],
            hazards: [
                '피부에 심한 화상과 눈 손상 (부식성 1A)',
                '삼키면 유해함',
                '흡입 시 호흡기 자극·부식',
                '금속에 대한 부식성 물질',
                '장기·반복 노출 시 치아 부식·호흡기 장애'
            ],
            pPrevention: [
                '개인보호구(내산장갑·보안경·보호복) 필수 착용',
                '분진·미스트·증기 흡입 회피',
                '물을 산에 붓지 말 것 (반드시 산을 물에 천천히 첨가)',
                '통풍이 잘되는 곳에서만 취급',
                '취급 후 손과 얼굴을 철저히 세척'
            ],
            pResponse: [
                '피부 접촉 시: 오염된 의복 즉시 제거 후 다량의 물로 15분 이상 세척, 즉시 의료조치',
                '눈 접촉 시: 15분 이상 흐르는 물로 세척 후 즉시 안과 진료',
                '흡입 시: 신선한 공기가 있는 곳으로 이동, 호흡 곤란 시 즉시 진료',
                '섭취 시: 구토 유발 금지, 즉시 의료기관 이송'
            ],
            pStorage: [
                '내산성 용기에 밀폐 보관',
                '금속·알칼리·유기물과 분리 저장',
                '서늘하고 통풍이 잘되는 곳에 보관 (직사광선 회피)'
            ],
            pDisposal: [
                '중화 후 폐기물관리법에 따라 지정폐기물로 처리',
                '하수·토양·수계 배출 절대 금지'
            ],
            handling: [
                '반드시 국소배기 설비가 있는 곳에서 취급',
                '희석 시: 반드시 물에 산을 천천히 첨가 (역순 금지)',
                '내산성 개인보호구 필수',
                '식음·흡연·화장 금지'
            ],
            ppe: [
                '내산성 장갑 (부틸고무·네오프렌)',
                '전면형 보안경 또는 안면보호구',
                '방독마스크 (산성가스용)',
                '내산성 보호복·앞치마·안전화'
            ],
            firstAid: [
                '눈: 15분 이상 다량의 물로 세척 후 즉시 안과 진료',
                '피부: 오염된 의복 제거 후 15분 이상 세척, 화상 부위 의료조치',
                '흡입: 신선한 공기가 있는 곳으로 이동, 호흡 곤란 시 산소 공급',
                '섭취: 구토 유발 금지, 의식 있으면 물·우유 소량 섭취 후 즉시 이송'
            ],
            isSpecial: true,
            specialMaterials: [{
                name: '황산', nameEn: 'Sulfuric Acid', content: '95~98%',
                cas: '7664-93-9', acute: true, carcino: false, mutagen: false, repro: false
            }]
        }
    },
    {
        id: 'nmp',
        casNumbers: ['872-50-4'],
        strongKeywords: ['n-methyl-2-pyrrolidone', 'nmp', 'n-메틸-2-피롤리돈', '엔엠피'],
        weakKeywords: ['pyrrolidone'],
        template: {
            name: 'N-Methyl-2-pyrrolidone (NMP)',
            subtitle: '872-50-4',
            manufacturer: '(주)엘지화학',
            supplier: '(주)엘지화학 (02-3773-1114)',
            cas: '872-50-4',
            signalWord: '위험',
            pictograms: ['GHS08','GHS07'],
            tags: ['special'],
            hazards: ['태아 손상 가능 (생식독성 1B)','눈에 심한 자극','피부 자극','호흡기 자극'],
            pPrevention: ['임신 중 취급 금지','증기 흡입 회피','개인보호구 착용','국소배기 필수'],
            pResponse: ['눈: 15분 세척 후 진찰','피부: 즉시 세척','흡입: 신선한 공기'],
            pStorage: ['서늘하고 통풍이 잘되는 곳에 밀폐 보관'],
            pDisposal: ['지정폐기물로 처리'],
            handling: ['가임여성 근로자 취업 제한','국소배기','피부접촉 회피'],
            ppe: ['방독마스크(유기가스)','보안경','내화학장갑(부틸)','보호복'],
            firstAid: ['눈: 15분 세척','피부: 세척','흡입: 신선공기','섭취: 진찰'],
            isSpecial: true,
            specialMaterials: [{name:'N-Methyl-2-pyrrolidone',nameEn:'NMP',content:'99%',cas:'872-50-4',acute:false,carcino:false,mutagen:false,repro:true}]
        }
    },
    {
        id: 'ethanol',
        casNumbers: ['64-17-5'],
        strongKeywords: ['ethanol', '에탄올', 'ethyl alcohol', '에틸알코올'],
        weakKeywords: [],
        template: {
            name:'에탄올 (Ethanol)',
            subtitle:'64-17-5',
            manufacturer:'(파일 참조)',
            supplier:'(공급자 참조)',
            cas:'64-17-5',
            signalWord:'위험',
            pictograms:['GHS02','GHS07'],
            tags:[],
            hazards:['고인화성 액체 및 증기','눈에 심한 자극','졸음·현기증 유발'],
            pPrevention:['화기 엄금','정전기 방지','통풍장소 취급','증기 흡입 회피'],
            pResponse:['화재 시 이산화탄소·분말 소화기 사용','피부·눈 접촉 시 물로 세척'],
            pStorage:['서늘하고 통풍이 잘되는 곳에 밀폐 보관, 화기 금지'],
            pDisposal:['위험물 폐기 절차 준수'],
            handling:['정전기 방지 접지','국소배기','인화성 물질 관리'],
            ppe:['내화학장갑','보안경','정전기 방지복'],
            firstAid:['눈: 세척','피부: 세척','흡입: 신선공기','섭취: 진찰'],
            isSpecial:false,
            specialMaterials:[]
        }
    },
    {
        id: 'ipa',
        casNumbers: ['67-63-0'],
        strongKeywords: ['isopropanol', 'isopropyl alcohol', '이소프로판올', '이소프로필알코올', 'ipa'],
        weakKeywords: ['2-propanol'],
        template: {
            name:'이소프로필알코올 (IPA)',
            subtitle:'67-63-0',
            manufacturer:'(파일 참조)',
            supplier:'(공급자 참조)',
            cas:'67-63-0',
            signalWord:'위험',
            pictograms:['GHS02','GHS07'],
            tags:[],
            hazards:['고인화성 액체 및 증기','눈에 심한 자극','졸음·현기증'],
            pPrevention:['화기 엄금','정전기 방지','통풍장소 취급'],
            pResponse:['화재 시 CO2·분말 소화기','피부·눈 접촉 시 세척'],
            pStorage:['서늘한 곳 밀폐 보관, 화기 금지'],
            pDisposal:['위험물 폐기 절차 준수'],
            handling:['정전기 방지 접지','국소배기'],
            ppe:['내화학장갑','보안경','정전기 방지복'],
            firstAid:['눈: 세척','피부: 세척','흡입: 신선공기','섭취: 진찰'],
            isSpecial:false,
            specialMaterials:[]
        }
    },
    {
        id: 'acetone',
        casNumbers: ['67-64-1'],
        strongKeywords: ['acetone', '아세톤'],
        weakKeywords: ['dimethyl ketone', 'propanone'],
        template: {
            name:'아세톤 (Acetone)',
            subtitle:'67-64-1',
            manufacturer:'(파일 참조)',
            supplier:'(공급자 참조)',
            cas:'67-64-1',
            signalWord:'위험',
            pictograms:['GHS02','GHS07'],
            tags:[],
            hazards:['고인화성 액체 및 증기','눈에 심한 자극','졸음·현기증'],
            pPrevention:['화기 엄금','정전기 방지','통풍장소 취급'],
            pResponse:['화재 시 CO2·분말 소화기','피부·눈 접촉 시 세척'],
            pStorage:['서늘한 곳 밀폐 보관, 화기 금지'],
            pDisposal:['위험물 폐기 절차 준수'],
            handling:['정전기 방지 접지','국소배기'],
            ppe:['내화학장갑','보안경','정전기 방지복'],
            firstAid:['눈: 세척','피부: 세척','흡입: 신선공기','섭취: 진찰'],
            isSpecial:false,
            specialMaterials:[]
        }
    },
    {
        id: 'aramco_lubricant',
        casNumbers: ['64742-54-7', '64742-52-5', '64742-65-0'],
        strongKeywords: ['aramco', 'aramcoultra', '윤활기유', 'base oil', 'paraffinic oil', '광유계 윤활'],
        weakKeywords: ['lubricant', 'petroleum'],
        template: {
            name: 'aramcoULTRA 윤활기유 (Base Oil)',
            subtitle: '64742-54-7',
            manufacturer: 'Aramco / S-Oil (02-2129-5114)',
            supplier: 'S-Oil (02-2129-5114)',
            cas: '64742-54-7',
            signalWord: '경고',
            pictograms: ['GHS08'],
            tags: [],
            hazards: ['흡인 시 유해할 수 있음', '장기적 노출 시 특정표적장기 독성', '수생생물에 유해'],
            pPrevention: ['흡입·섭취·피부접촉 회피', '취급 후 세척', '화기·스파크로부터 격리', '개인보호구 착용'],
            pResponse: ['흡입 시: 신선한 공기', '섭취 시: 의료조치, 구토 금지', '피부: 비누·물 세척', '눈: 15분 세척'],
            pStorage: ['잘 환기되는 곳 밀폐 저장', '40°C 이하 보관'],
            pDisposal: ['지정폐기물 처리', '수계 배출 금지'],
            handling: ['국소배기', '피부접촉 회피', '흡연·음식섭취 금지'],
            ppe: ['내유성 장갑 (니트릴)', '보안경', '유증기용 방독마스크', '내유성 안전화'],
            firstAid: ['눈: 15분 세척', '피부: 비누와 물', '흡입: 신선한 공기', '섭취: 진찰'],
            isSpecial: false,
            specialMaterials: []
        }
    }
];

const FALLBACK_TEMPLATE = {
    name:'(자동추출 실패 - 원본 확인 필요)',
    subtitle:'-',
    manufacturer:'MSDS 원본 참조',
    supplier:'MSDS 원본 참조',
    cas:'-',
    signalWord:'경고',
    pictograms:['GHS07'],
    tags:[],
    hazards:['MSDS 원본의 2. 유해성·위험성 항목 참조'],
    pPrevention:['개인보호구 착용','환기 유지','화기 및 열원 격리','MSDS 원본 참조'],
    pResponse:['이상 증상 시 즉시 신선한 공기로 이동','필요시 의료진 상담'],
    pStorage:['서늘하고 건조하며 통풍이 잘되는 곳에 밀폐 보관'],
    pDisposal:['폐기물관리법에 따라 지정폐기물로 처리'],
    handling:['MSDS 및 작업표준서 준수','국소배기·개인보호구 착용'],
    ppe:['보안경','내화학장갑','방독/방진마스크','보호복'],
    firstAid:['눈: 15분 이상 세척 후 진찰','피부: 세척','흡입: 신선공기','섭취: 의사 진찰'],
    isSpecial:false,
    specialMaterials:[]
};
