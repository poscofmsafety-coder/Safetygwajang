# Cloudflare API 연결 설정

이 프로젝트는 정적 화면과 `/api/*` Worker를 함께 배포합니다. 인증키는 브라우저 코드에 넣지 않고 Cloudflare **Secrets**에서만 읽습니다.

## 필수: KOSHA 공공데이터
Cloudflare Dashboard → Workers & Pages → `safetygwajang` → Settings → Variables and Secrets에서 다음 Secret을 유지하세요.

- `KOSHA_API_KEY`: 공공데이터포털 일반 인증키(Decoding 키 권장)

기존 Secret 이름을 바꾸기 어렵다면 아래 이름도 자동 인식합니다.
- MSDS 전용: `KOSHA_MSDS_API_KEY`
- 법령 검색 전용: `KOSHA_LAW_API_KEY` 또는 `KOSHA_SMART_SEARCH_API_KEY`
- 공통 대체 이름: `PUBLIC_DATA_API_KEY`

사용 API
- 물질안전보건자료 조회 서비스: 데이터셋 `15157612`
- 안전보건법령 스마트검색: 데이터셋 `15123696`
- 안전보건공단 사고사망/국내재해사례 API: 실시간 안전뉴스 보조 소스

**중요:** 공공데이터포털 인증키 하나가 있어도 각 데이터셋의 **활용신청**이 별도로 필요할 수 있습니다. MSDS API만 승인된 키로 스마트 법령검색을 호출하면 접근거부가 날 수 있습니다.

배포 뒤 브라우저에서 아래 주소를 확인하세요.
- `/api/health` → JSON
- `/api/laws/search?q=난간&limit=1` → JSON 검색 결과
- `/api/msds/lookup?cas=7664-93-9` → 황산 CAS 조회 JSON
- `/api/news` → 뉴스 JSON

## 선택: Kakao 뉴스 검색
다음/카카오 웹 검색 결과를 뉴스에 보조로 사용하려면 Secret 중 하나를 등록하세요.
- `KAKAO_REST_API_KEY` (권장)
- `KAKAO_API_KEY` 또는 `KAKAO_REST_KEY`도 호환

Google News RSS는 별도 키 없이 Worker에서 수집하며, KOSHA 사고사망·재해사례와 함께 실패 시 보조 소스로 동작합니다.

## 선택: NAVER Search
사용 중인 NAVER 검색 API가 있다면 다음 Secret 조합도 지원합니다.
- `NAVER_API_HUB_CLIENT_ID` + `NAVER_API_HUB_CLIENT_SECRET`
- 또는 기존 `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET`

## 배포 방식
`wrangler.jsonc`의 `assets.run_worker_first`가 `/api/*`를 Worker 코드로 먼저 보냅니다. Cloudflare Builds의 **Deploy command**가 정적 업로드만 하는 설정이면 API가 HTML/404로 보일 수 있으므로 다음으로 설정하세요.

```bash
npx wrangler deploy
```

Repository root는 프로젝트 루트(`wrangler.jsonc`, `worker-api.js`, `index.html`이 있는 위치)입니다.
