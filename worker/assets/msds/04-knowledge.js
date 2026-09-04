/* =========================================================
   MSDS 기본 템플릿
   - 특정 회사/물질 샘플 데이터 없음
   - 제조·수입자 MSDS에서 추출되지 않은 항목은 임의 생성하지 않음
   ========================================================= */
const FALLBACK_TEMPLATE = {
    name:'(제품명 입력 필요)',
    subtitle:'원본 MSDS 확인',
    manufacturer:'',
    supplier:'',
    cas:'-',
    signalWord:'원본 확인',
    pictograms:[],
    pictogramsSource:'원본 MSDS 2항 확인 필요',
    tags:[],
    hazards:['MSDS 2항 유해성·위험성 문구를 확인하세요.'],
    pPrevention:['MSDS 2항 예방조치문구를 확인하세요.'],
    pResponse:[],
    pStorage:[],
    pDisposal:[],
    handling:['MSDS 7항 취급 및 저장방법을 확인하세요.'],
    ppe:['MSDS 8항 노출방지 및 개인보호구를 확인하세요.'],
    firstAid:['MSDS 4항 응급조치요령을 확인하세요.'],
    isSpecial:null,
    envTarget:null,
    healthTarget:null,
    specialMaterials:[],
    composition:[],
    regulatoryProfile:{source:'수동 입력',workEnvTarget:null,specialHealthTarget:null,specialManagement:null,evidence:[]}
};
