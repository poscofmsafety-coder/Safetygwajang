# 배포 체크리스트

## 1. GitHub
ZIP을 풀고 내용물 자체를 `safetygwajang` 저장소 루트에 덮어씁니다. 루트에 `index.html`, `worker-api.js`, `wrangler.jsonc`, `package.json`, `css`, `js`, `data`, `worker`가 보여야 합니다.

## 2. Cloudflare Workers Builds
기존 `safetygwajang` Worker의 Git 연결을 유지합니다. Build/Deploy 설정에서 Deploy command가 다음인지 확인합니다.

```bash
npx wrangler deploy
```

`wrangler.jsonc`는 정적 Assets와 Worker API를 함께 배포하고 `/api/*` 요청에서 Worker를 먼저 실행하도록 구성되어 있습니다. 기존 Cloudflare Secret은 같은 Worker에 그대로 유지됩니다.

## 3. Runtime variables and secrets
Cloudflare Worker의 **Settings → Variables and Secrets**에서 다음을 확인합니다.
- `KOSHA_API_KEY`: 법령·MSDS 공식자료 조회
- `GROQ_API_KEY`: 자기소개서 AI + 순회점검 사진 분석

키 값은 GitHub나 `wrangler.jsonc`에 직접 적지 않습니다. 기존 Worker에 Secret으로 저장하면 GitHub를 비공개로 바꿔도 자동 배포 연결을 유지할 수 있습니다.

## 4. 연결 확인
배포 후 다음을 주소창에서 직접 열어 JSON이 나오는지 확인합니다. HTML 홈페이지가 나오면 Worker API가 배포되지 않은 것입니다.
- `https://safetygwajang.com/api/health`
- `https://safetygwajang.com/api/news`
- `https://safetygwajang.com/api/safety-law/search?q=난간&limit=1` (권장)
- `https://safetygwajang.com/api/laws/search?q=난간&limit=1` (기존 호환)
- `https://safetygwajang.com/api/msds/lookup?cas=7664-93-9`

법령 검색만 접근거부가 나면 공공데이터포털의 **안전보건법령 스마트검색(15123696)** 활용신청 상태를 확인합니다. Secret은 `KOSHA_API_KEY` 외에 `KOSHA_LAW_API_KEY` / `KOSHA_SMART_SEARCH_API_KEY`도 자동 인식합니다.

## 5. 화면 확인
- 메인: 취준생/재직자 전환, 한국시간 시계, 실시간 안전뉴스
- 재직자: 현장 작업 대시보드 → 순회점검 → 안전보건교육 → 위험성평가 → 실무가이드 → 법령·지침 → MSDS → 밀폐공간·온열질환 → 사고·아차사고
- MSDS: 1항 제품명·공급자, 3항 성분/CAS/함유량, 경고표지, 작업공정별 관리요령, PDF 저장, 작업환경측정, 특수건강진단
- 모바일/태블릿: iPhone·Galaxy·iPad·Galaxy Tab에서 메뉴 가로 스크롤, 카드 1열/2열 전환, 입력창 확대 방지, 표 가로 스크롤 확인
- 법령 검색: 초기 연결점검 없이 즉시 화면 표시, 검색어 형광펜 강조, 긴 본문 카드 내부 세로 스크롤, 법령/KOSHA GUIDE/자료 분리 확인
- 순회점검: 휴대폰 카메라/사진 선택, 클립보드 이미지 붙여넣기, AI 자동입력, 위험성평가 O 선택 시 수시평가 계획·실시 기록 자동 연계 확인
- 자기소개서: 실제 지원 문항 입력, 회사 공식자료·DART·최근 뉴스 교차분석, 전략/초안/빨간펜 검토 확인

## 6. AdSense 재검토 전
수동 광고 슬롯은 승인 전에 추가하지 않습니다. `ads.txt`, 개인정보처리방침, 이용약관, 콘텐츠 운영원칙과 설명형 콘텐츠를 유지하고 Search Console 색인/sitemap 상태를 확인합니다.
