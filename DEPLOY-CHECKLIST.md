# 배포 체크리스트

## 1. GitHub
ZIP을 풀고 내용물 자체를 `safetygwajang` 저장소 루트에 덮어씁니다. 루트에 `index.html`, `worker-api.js`, `wrangler.jsonc`, `package.json`, `css`, `js`, `data`, `worker`가 보여야 합니다.

## 2. Cloudflare Workers Builds
기존 `safetygwajang` Worker의 Git 연결을 유지합니다. Build/Deploy 설정에서 Deploy command가 다음인지 확인합니다.

```bash
npx wrangler deploy
```

`wrangler.jsonc`는 정적 Assets와 Worker API를 함께 배포하고 `/api/*` 요청에서 Worker를 먼저 실행하도록 구성되어 있습니다. 기존 Cloudflare Secret은 같은 Worker에 그대로 유지됩니다.

## 3. API 확인
배포 후 다음을 주소창에서 직접 열어 JSON이 나오는지 확인합니다. HTML 홈페이지가 나오면 Worker API가 배포되지 않은 것입니다.
- `https://safetygwajang.com/api/health`
- `https://safetygwajang.com/api/news`
- `https://safetygwajang.com/api/laws/search?q=난간&limit=1`
- `https://safetygwajang.com/api/msds/lookup?cas=7664-93-9`

법령 검색만 접근거부가 나면 공공데이터포털의 **안전보건법령 스마트검색(15123696)** 활용신청 상태를 확인합니다. Secret은 `KOSHA_API_KEY` 외에 `KOSHA_LAW_API_KEY` / `KOSHA_SMART_SEARCH_API_KEY`도 자동 인식합니다.

## 4. 화면 확인
- 메인: 취준생/재직자 전환, 한국시간 시계, 실시간 안전뉴스
- 재직자: 현장 작업 대시보드 → 안전보건교육 → 위험성평가 → 실무가이드 → 법령·지침 → MSDS → 밀폐공간·온열질환 → 사고·아차사고
- MSDS: 1항 제품명·공급자, 3항 성분/CAS/함유량, 경고표지, 작업공정별 관리요령, PDF 저장, 작업환경측정, 특수건강진단
- 모바일: 메뉴/카드/표 가로넘침 확인

## 5. AdSense 재검토 전
수동 광고 슬롯은 승인 전에 추가하지 않습니다. `ads.txt`, 개인정보처리방침, 이용약관, 콘텐츠 운영원칙과 설명형 콘텐츠를 유지하고 Search Console 색인/sitemap 상태를 확인합니다.
