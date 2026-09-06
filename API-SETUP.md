# Cloudflare 연계 데이터 API 연결 설정

이 프로젝트는 `/api/*`를 `worker-api.js`가 처리하고 나머지 파일은 정적 사이트로 제공합니다. 인증키는 GitHub에 넣지 말고 Cloudflare **Runtime variables and secrets**의 Secret으로 저장합니다.

> V32 원칙: **스마트 안전보건법령 검색과 MSDS 조회는 한국산업안전보건공단(KOSHA) OpenAPI 응답만 사용합니다.** 국가법령정보센터 등 다른 서비스로 결과를 대체하지 않습니다. KOSHA가 오류를 반환하면 그 오류를 그대로 진단 가능하게 표시합니다.

## 1. KOSHA 안전보건법령 스마트검색
Cloudflare Dashboard → **Workers & Pages → safetygwajang → Settings → Variables and Secrets → Add**

- Type: `Secret`
- 권장 Name: `KOSHA_LAW_API_KEY`
- Value: 공공데이터포털에서 발급된 일반 인증키

하나의 키를 공통으로 쓸 경우 `KOSHA_API_KEY` 하나만 저장해도 됩니다. V32는 **Encoding 키/Decoding 키 어느 쪽이 들어와도 한 번 정규화한 뒤 공공데이터포털 호출 규칙에 맞게 전송**합니다. Cloudflare 값에 따옴표나 줄바꿈이 섞여 있어도 제거합니다.

사용 서비스: 한국산업안전보건공단 **안전보건법령 스마트검색** (`15123696`)

실제 Worker 호출 대상:

- `https://apis.data.go.kr/B552468/srch/smartSearch`
- 주요 파라미터: `serviceKey`, `searchValue`, `pageNo`, `numOfRows`, `category=0`, `dataType=JSON`

## 2. KOSHA MSDS 조회 서비스
별도 키를 사용할 경우 다음 Secret을 권장합니다.

- Name: `KOSHA_MSDS_API_KEY`
- Value: 공공데이터포털에서 발급된 일반 인증키

같은 키를 쓰면 `KOSHA_API_KEY` 하나로 법령과 MSDS를 함께 사용할 수 있습니다.

사용 서비스: 한국산업안전보건공단 **물질안전보건자료 조회 서비스** (`15157612`)

실제 Worker 호출 대상:

- `https://apis.data.go.kr/B552468/msdschem/getChemList`
- `https://apis.data.go.kr/B552468/msdschem/getChemDetail15`

MSDS 검색·CAS 검수 화면도 KOSHA 응답만 사용하며 다른 화학물질 DB 결과로 대체하지 않습니다.

## 3. V32에서 수정한 API 장애 대응
처음에는 작동하다가 이후 검색이 멈추는 경우를 고려해 다음을 보완했습니다.

1. **짧은 중첩 타임아웃 제거**
   - 브라우저와 Worker의 대기시간이 서로 먼저 끊어버리던 구조를 정리했습니다.
   - KOSHA 일시 지연 시 Worker가 자동으로 재시도한 뒤 실제 오류를 반환합니다.
2. **KOSHA 응답 강제 캐시 제거**
   - 이전의 API 응답 캐시 때문에 일시적인 오류가 반복 노출될 수 있는 부분을 제거했습니다.
3. **공공데이터포털 인증키 정규화**
   - Encoding/Decoding 키, 따옴표, 공백, 줄바꿈 때문에 인증키가 이중 인코딩되는 문제를 방지합니다.
4. **여러 Runtime Secret 자동 점검**
   - 과거 Secret이 남아 있거나 이름을 바꾼 경우 한 개의 잘못된 값 때문에 전체 기능이 막히지 않도록, 등록된 KOSHA 후보 Secret을 순서대로 실제 호출해 정상 응답 키를 찾습니다.
5. **공식 에러코드 표시**
   - `Unauthorized`, `Forbidden`, `SERVICE_ACCESS_DENIED_ERROR`, `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`, `SERVICETIMEOUT_ERROR`, 호출량 초과 등을 구분합니다.
6. **국가법령정보센터 fallback 금지**
   - `/api/laws/search`, `/api/safety-law/search`, MSDS 경로에서 KOSHA가 실패해도 다른 법령/API 결과로 바꾸지 않습니다.

## 4. 인식하는 Runtime Secret 이름
가능하면 아래 권장 이름만 남기는 것이 관리하기 쉽습니다. 다만 기존 설정 호환을 위해 V32는 다음 이름을 모두 확인합니다.

법령 스마트검색 후보 순서:

1. `KOSHA_LAW_API_KEY`
2. `KOSHA_SMART_SEARCH_API_KEY`
3. `KOSHA_API_KEY`
4. `PUBLIC_DATA_API_KEY`
5. `DATA_GO_KR_API_KEY`
6. `DATA_GO_KR_SERVICE_KEY`
7. `SERVICE_KEY`
8. `OPENAPI_SERVICE_KEY`

MSDS 후보 순서:

1. `KOSHA_MSDS_API_KEY`
2. `KOSHA_API_KEY`
3. `PUBLIC_DATA_API_KEY`
4. `DATA_GO_KR_API_KEY`
5. `DATA_GO_KR_SERVICE_KEY`
6. `SERVICE_KEY`
7. `OPENAPI_SERVICE_KEY`

같은 값이 여러 이름에 들어 있으면 중복 호출하지 않습니다.

## 5. 배포 및 실제 KOSHA 응답 확인
Secret을 저장한 뒤 **Production 환경에 Worker를 다시 배포**합니다. 정적 파일만 업로드하면 `/api/*`가 현재 `worker-api.js`를 실행하지 않을 수 있습니다.

```bash
npx wrangler deploy
```

`wrangler.jsonc`와 `worker-api.js`, 정적 파일이 같은 프로젝트 루트에 있어야 합니다. 현재 `wrangler.jsonc`는 `/api/*`에 Worker를 먼저 실행하도록 설정되어 있습니다.

배포 후 아래 주소를 순서대로 확인합니다.

- `/api/health`
  - `workerRuntime: "cloudflare-worker"`
  - `lawSearchConfigured: true`
  - `msdsConfigured: true`
  - `koshaOnly: true`
  - `nationalLawFallback: false`
- `/api/health?probe=1&service=law`
  - KOSHA 법령 스마트검색을 실제 1회 호출합니다.
  - 성공 시 `probes.law.ok: true`와 실제 성공한 `secretBinding`을 확인할 수 있습니다.
- `/api/health?probe=1&service=msds`
  - KOSHA MSDS를 실제 1회 호출합니다.
  - 성공 시 `probes.msds.ok: true`를 확인할 수 있습니다.
- `/api/health?probe=1`
  - 법령 + MSDS를 모두 실제 호출합니다.
- `/api/safety-law/search?q=밀폐공간&limit=3`
- `/api/laws/search?q=밀폐공간&limit=3`
- `/api/msds/lookup?cas=7664-93-9`
- `/api/msds/search?q=톨루엔`

### 진단 결과별 조치

- `Forbidden` / `SERVICE_ACCESS_DENIED_ERROR`
  - 해당 KOSHA API의 **활용신청·운영계정 승인 상태**를 확인합니다.
- `Unauthorized` / `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`
  - 인증키가 현재 프로젝트/서비스에 등록된 키인지 확인합니다.
- `SERVICETIMEOUT_ERROR`, `Error receiving response from backend server`
  - KOSHA 또는 공공데이터포털의 일시 지연으로 보고 자동 재시도 후에도 실패했을 때만 화면에 오류를 표시합니다.
- `API token quota exceeded`, `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR`
  - 일일 트래픽 한도 또는 운영계정 트래픽을 확인합니다.

공공데이터포털 안내상 두 KOSHA 서비스 모두 **개발단계는 자동승인, 운영단계는 심의승인**입니다. 사이트 운영용이면 Runtime Secret이 있어도 해당 API의 운영계정 승인이 만료·중지·미승인 상태이면 KOSHA가 권한 오류를 반환할 수 있습니다.

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
- MSDS → KOSHA 물질안전보건자료 조회 서비스만 사용. 화학물질안전원 등 다른 API 결과를 MSDS 판정에 합치지 않음

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
