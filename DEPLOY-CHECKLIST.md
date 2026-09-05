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
- `GROQ_API_KEY`: 자기소개서 AI + 순회점검 사진 분석 + KRAS 위험성평가 AI 초안

키 값은 GitHub나 `wrangler.jsonc`에 직접 적지 않습니다. 기존 Worker에 Secret으로 저장하면 GitHub를 비공개로 바꿔도 자동 배포 연결을 유지할 수 있습니다.

## 4. 연결 확인
배포 후 다음을 주소창에서 직접 열어 JSON이 나오는지 확인합니다. HTML 홈페이지가 나오면 Worker API가 배포되지 않은 것입니다.
- `https://safetygwajang.com/api/health`
- `https://safetygwajang.com/api/news`
- `https://safetygwajang.com/api/safety-law/search?q=난간&limit=1` (권장)
- `https://safetygwajang.com/api/laws/search?q=난간&limit=1` (기존 호환)
- `https://safetygwajang.com/api/msds/lookup?cas=7664-93-9`

법령 검색만 접근거부가 나면 데이터 서비스의 **안전보건법령 스마트검색(15123696)** 활용신청 상태를 확인합니다. Secret은 `KOSHA_API_KEY` 외에 `KOSHA_LAW_API_KEY` / `KOSHA_SMART_SEARCH_API_KEY`도 자동 인식합니다.

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


## 최신 안전관리자 채용공고
- 메인 재직자 화면의 실시간 안전 뉴스 아래에 `/api/jobs` 기반 채용공고 영역이 추가되었습니다.
- 별도 API 키 없이 공개 구인 목록을 읽고, 가능한 경우 사람인/잡코리아/인크루트/자소설닷컴/기업 채용페이지 원문 링크로 연결합니다.
- 회사명 + 직무명 + 근무지 기준으로 중복 공고를 제거하며, 서버 캐시와 브라우저 캐시로 첫 화면 지연을 줄였습니다.
- 최초 접속 때는 목록을 먼저 보여주고 원문 출처 확인은 백그라운드에서 보강합니다.


## v8 채용공고 안정화
- 첫 화면은 최근 확인된 대기업 안전/EHS 공고를 즉시 표시하고, 최신 목록은 백그라운드에서 갱신합니다.
- 서버 수집 결과는 대기업·중견 우선 패턴과 공공기관 계열만 화면에 반영해 소규모 업체 노출을 줄였습니다.
- `/api/jobs` 캐시 키가 v2로 변경되어 이전 소규모 공고 캐시를 재사용하지 않습니다.

## v13 채용공고 수집 보완
- 단일 원천(`isafety.co.kr/is/job`) 의존을 줄이고 사람인 `안전관리`/`EHS` 검색결과를 서버에서 직접 읽는 보조 수집원을 추가했습니다.
- `/api/jobs` 캐시 키를 `v3`로 변경하여 기존 3개 시드만 남은 캐시를 즉시 폐기합니다.
- 수동 새로고침(`?refresh=1`)은 기존 캐시를 바로 반환하지 않고 실제 수집을 한 번 수행한 뒤 결과를 반환합니다.
- 서버 응답에 `liveCount`, `sourceStats`, `sourceErrors` 진단 필드를 포함하여 어떤 수집원이 실패했는지 확인할 수 있습니다.
- 실시간 원천이 모두 실패해도 검증된 대기업·중견기업 최근 공고를 7건까지 표시하고, 마감일 이후 자동 제외합니다.
- 사람인/중계 게시판 수집 결과는 대기업·중견·공공기관 우선 필터 후 회사명+직무+근무지 기준으로 중복 제거합니다.

- KRAS: 기존 Excel/CSV/TSV/JSON 가져오기, 헤더 자동매핑, Groq AI 초안 생성, AI 결과가 재검토 필요 상태로 저장되는지 확인

## v16 추가 점검
- [ ] Cloudflare Secret `PUBLIC_DATA_API_KEY` 저장
- [ ] 데이터 서비스에서 기상청·에어코리아·화학물질안전원·산불위험·소방청 화재정보 활용승인 확인
- [ ] `/api/health`에서 `publicDataConfigured: true` 확인
- [ ] 재직자 홈 `오늘의 현장 안전환경`에서 시·도 선택 후 카드 표시 확인
- [ ] `내 위치 사용` 버튼을 눌러 브라우저 위치 권한 허용/거부 양쪽 동작 확인
- [ ] KRAS AI에서 연계 데이터 불러오기 후 AI 초안 생성 확인
- [ ] KRAS TBM 기록에서 사진 1개 + PDF 서명록 1개 저장/다운로드/삭제 확인
- [ ] `KRAS에서 등록 계속하기` 버튼이 `https://portal.kosha.or.kr/kras/implement/real`로 새 탭 연결되는지 확인
- [ ] 모바일 390px/430px에서 상단 헤더 한 줄, 취준생·재직자 빠른 메뉴 2열 확인
- [ ] 데스크톱 메인 대형 제일이 클릭 시 랜덤 안전문구와 모션 확인
- [ ] 한국전기안전공사 API Secret은 불필요(v16 미사용)
## v18 추가 점검
- [ ] 메인 대형 제일이에 별도의 고정 슬로건이 없고 캐릭터가 카드 중앙에 정돈되는지 확인
- [ ] 취준생/재직자 시작 버튼과 KRAS 관련 버튼에 불필요한 화살표가 없는지 확인
- [ ] 작업 데이터 관리에서 `안전보건관리책임자`와 `팀장` 결재 항목이 표시되는지 확인
- [ ] 안전보건교육에서 부서명/근로자명 검색, 원청/협력사 전환, 협력사명 조건부 입력을 확인
- [ ] 교육강사의 직책/성함 입력과 `직접 입력` 직책 필드 표시를 확인
- [ ] 근로자별 `작업내용 변경 시 교육` 대상 지정과 기록을 확인
- [ ] 근로자별 특별교육 대상을 2개 이상 추가·삭제하고 직접 입력한 작업명이 저장/복원되는지 확인
- [ ] 교육 CSV/JSON 내보내기·복원 후 새 필드가 유지되는지 확인
- [ ] 모바일/PC에서 기본 글자가 브라우저 확대 없이 읽기 쉬운지 확인

