# Cloudflare 공공데이터 API 연결 설정

이 프로젝트는 `/api/*`를 `worker-api.js`가 처리하고 나머지 파일은 정적 사이트로 제공합니다. 인증키는 GitHub에 넣지 말고 Cloudflare **Secret**으로 저장합니다.

## 1. 안전보건법령 스마트검색
Cloudflare Dashboard → **Workers & Pages → safetygwajang → Settings → Variables and Secrets → Add**

- Type: `Secret`
- Name: `KOSHA_LAW_API_KEY`
- Value: 공공데이터포털의 **일반 인증키(Decoding)**

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
- `https://safetygwajang.com/api/laws/search?q=밀폐공간&limit=3`
- `https://safetygwajang.com/api/msds/lookup?cas=7664-93-9`

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
