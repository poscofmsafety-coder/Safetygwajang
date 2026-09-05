# Cloudflare 연계 데이터 API 연결 설정

이 프로젝트는 `/api/*`를 `worker-api.js`가 처리하고 나머지 파일은 정적 사이트로 제공합니다. 인증키는 GitHub에 넣지 말고 Cloudflare **Secret**으로 저장합니다.

## 1. 안전보건법령 스마트검색
Cloudflare Dashboard → **Workers & Pages → safetygwajang → Settings → Variables and Secrets → Add**

- Type: `Secret`
- Name: `KOSHA_LAW_API_KEY`
- Value: 데이터 서비스의 **일반 인증키(Decoding)**

하나의 인증키를 공통으로 쓸 경우 Name을 `KOSHA_API_KEY`로 저장해도 됩니다. 코드는 두 이름을 모두 인식합니다.

사용 서비스: 한국산업안전보건공단 **안전보건법령 스마트검색** (`15123696`)

## 2. MSDS 조회 서비스
같은 인증키를 사용하는 경우 `KOSHA_API_KEY` 하나로 충분합니다. 별도 키라면 `KOSHA_MSDS_API_KEY`로 추가합니다.

사용 서비스: 한국산업안전보건공단 **물질안전보건자료 조회 서비스** (`15157612`)

## 3. 가장 중요한 배포 방식
Secret을 저장한 뒤 반드시 Worker 코드를 다시 배포해야 합니다. Cloudflare 빌드 설정의 **Deploy command**를 다음으로 사용하세요.

```bash
npx wrangler deploy
```

`wrangler.jsonc`와 `worker-api.js`, `index.html`이 같은 저장소 루트에 있어야 합니다. 정적 파일 업로드만 하면 `/api/laws/search`가 실행되지 않습니다.

## 4. 배포 후 확인
브라우저에서 순서대로 확인하세요.

- `https://safetygwajang.com/api/health`
  - `lawSearchConfigured: true`
  - `lawSecretName: "KOSHA_LAW_API_KEY"` 또는 `"KOSHA_API_KEY"`
- `https://safetygwajang.com/api/safety-law/search?q=밀폐공간&limit=3` (권장, `law`/`guide`/`media` 분리 응답)
- `https://safetygwajang.com/api/laws/search?q=밀폐공간&limit=3` (기존 호환용 `items` 응답)
- `https://safetygwajang.com/api/msds/lookup?cas=7664-93-9`


## 4-1. 법령 탭 연동 호환

기존 운영 사이트 코드가 `/api/safety-law/search`를 호출하고, 구버전 페이지가 `/api/laws/search`를 호출하는 경우가 있어 **두 경로를 모두 지원**합니다. 두 경로 모두 Cloudflare Secret의 `KOSHA_API_KEY`를 자동 인식합니다.

- `/api/safety-law/search`: `law`, `guide`, `media` 배열로 분리하여 반환
- `/api/laws/search`: 기존처럼 `items` 배열 반환
- 검색어 강조는 브라우저에서 `<mark>`로 처리하며, 긴 본문은 결과 카드 내부 세로 스크롤로 확인합니다.

`SERVICE_ACCESS_DENIED_ERROR`가 나오면 해당 데이터셋의 활용신청/승인 상태를 확인합니다. `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 나오면 인증키 또는 해당 서비스 활용신청을 확인합니다.

## 5. 추가로 인식하는 Secret 이름
기존 설정을 바꾸기 어려운 경우 아래 이름도 인식합니다.

- `KOSHA_SMART_SEARCH_API_KEY`
- `PUBLIC_DATA_API_KEY`
- `DATA_GO_KR_API_KEY`
- `DATA_GO_KR_SERVICE_KEY`
- `SERVICE_KEY`
- `OPENAPI_SERVICE_KEY`

## 선택: 뉴스 API
Google News RSS는 별도 키 없이 Worker가 수집합니다. Kakao 검색을 함께 쓰려면 `KAKAO_REST_API_KEY`, Naver 검색을 쓰려면 `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET`을 Secret으로 저장할 수 있습니다.


## 6. Groq AI
Cloudflare Worker의 **Settings → Variables and Secrets**에 다음 Secret을 저장합니다.

- `GROQ_API_KEY`: 자기소개서 AI, 순회점검 이미지 분석, KRAS 위험성평가 AI 초안에 공통 사용
- 선택: `GROQ_TEXT_MODEL`
- 선택: `GROQ_VISION_MODEL`
- 선택: `GROQ_KRAS_MODEL`

KRAS AI는 `/api/ai/kras`에서 처리하며 API 키를 브라우저로 보내지 않습니다. `GROQ_KRAS_MODEL`을 별도로 지정하지 않으면 Structured Outputs strict mode를 지원하는 모델 중 코드의 기본값을 사용합니다.

배포 후 `/api/health`에서 `aiConfigured: true`인지 확인하세요. 실제 KRAS AI 호출은 같은 사이트 화면에서 POST 요청으로만 허용됩니다.

## 7. v16 연계 데이터 현장안전 연동

데이터 서비스에서 신청한 일반 인증키를 Cloudflare Secret에 아래 이름으로 **1개만** 저장하는 것을 권장합니다.

- `PUBLIC_DATA_API_KEY`: 데이터 서비스 일반 인증키(Decoding 권장)

같은 인증키라도 각 데이터셋에 대해 **활용신청/승인**이 완료되어 있어야 합니다. v16은 아래 승인 서비스가 있으면 가능한 항목부터 독립적으로 표시합니다.

- 기상청 `단기예보 조회서비스` — 현장 위치 기반 초단기실황(기온·습도·풍속·강수)
- 한국환경공단 `에어코리아_대기오염정보` — 시·도별 PM10·PM2.5·통합대기지수 참고
- 환경부 화학물질안전원 `화학물질안전관리정보` — CAS No. 기반 노출·증상 참고정보
- 산림청 국립산림과학원 `산불위험예보정보` — 화기작업 등 현장 확인 참고
- 소방청 `화재정보서비스` — 전국 화재 참고통계
- 기존 KOSHA 안전보건법령 스마트검색 / MSDS 조회 서비스

**한국전기안전공사 전기안전정보공개 API는 v16에 연동하지 않았습니다.** 해당 서비스는 사용자 확인 결과 이용 자격 제약이 있고 현재 안전과장 핵심 기능에 비해 우선순위가 낮아 제외했습니다.

### 연계 데이터 사용 위치

- 재직자 홈 → `오늘의 현장 안전환경`
- KRAS → AI 초안 작성 시 기상·대기·산불·화재 정보를 `확인 참고정보`로 전달
- KRAS → 입력한 설비·물질 텍스트에 CAS No.가 있으면 화학물질안전원 정보를 추가 참고
- MSDS → CAS 검수 화면에서 KOSHA 15항과 화학물질안전원 정보를 함께 표시

연계 데이터는 **위험성 수준, 작업중지, 법적 적합성을 자동 확정하지 않습니다.** 실제 작업조건, 측정값, 사업장 실시규정, 최신 법령 및 공급자 MSDS를 최종 확인해야 합니다.

### 배포 후 확인 URL

- `/api/health` → `publicDataConfigured: true`
- `/api/public/weather?lat=37.5665&lon=126.9780`
- `/api/public/air?sido=서울`
- `/api/public/chemical?cas=7664-93-9`
- `/api/public/wildfire`
- `/api/public/fire`
- `/api/public/safety-brief?lat=37.5665&lon=126.9780&sido=서울`

각 서비스 중 하나가 승인되지 않았거나 일시 장애가 나도 `safety-brief`는 성공한 데이터만 화면에 표시하도록 구성되어 있습니다.
