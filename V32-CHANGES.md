# V32 변경사항 — KOSHA API 복구 · 면접 잠금 · 재직자 헤더 통일

기준 버전: V31  
수정일: 2026-09-06

## 1. 면접 > 기업별 예상질문 잠금

- `기업별 예상질문` 탭을 잠금 상태로 시작하도록 변경했습니다.
- 잠금 화면에 `대치동만 이용가능`을 표시합니다.
- 입장코드: `0901`
- 잠금 해제 전에는 기업별 JSON 데이터를 불러오지 않습니다.
- 브라우저 세션 동안만 해제 상태를 유지합니다.

## 2. KOSHA 안전보건법령·MSDS API 복구

스마트 법령 검색 및 MSDS는 KOSHA OpenAPI만 사용하도록 고정했습니다.

### 안전보건법령 스마트검색

- 호출 API: `https://apis.data.go.kr/B552468/srch/smartSearch`
- `/api/laws/search`, `/api/safety-law/search` 모두 KOSHA 응답만 반환합니다.
- 국가법령정보센터 등 비-KOSHA fallback을 제거했습니다.
- KOSHA 실패 시 다른 결과를 보여주지 않고 KOSHA의 실제 오류코드를 반환합니다.

### MSDS

- 호출 API:
  - `https://apis.data.go.kr/B552468/msdschem/getChemList`
  - `https://apis.data.go.kr/B552468/msdschem/getChemDetail15`
- MSDS 검색·CAS 조회·법적 항목 확인을 KOSHA 응답 기준으로 처리합니다.
- 화학물질안전원 등 다른 API를 MSDS 결과에 합치지 않습니다.

### 장애 대응 보강

- Encoding/Decoding 인증키 정규화
- Secret 값의 공백·개행·따옴표 제거
- KOSHA Runtime Secret 후보를 순서대로 실제 호출해 정상 키 자동 선택
- 중복 Secret 값은 한 번만 호출
- KOSHA API 강제 캐시 제거
- 일시 지연·기관 서버 오류 자동 재시도
- `Unauthorized`, `Forbidden`, `SERVICE_ACCESS_DENIED_ERROR`, `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`, `SERVICETIMEOUT_ERROR`, 호출량 초과 등 공식 오류 구분
- 브라우저 측 짧은 타임아웃 및 장시간 실패 캐시 완화

### 운영 진단

- `/api/health?probe=1&service=law`
- `/api/health?probe=1&service=msds`
- `/api/health?probe=1`

실제 성공한 Secret 이름만 `secretBinding`으로 표시하며 Secret 값은 노출하지 않습니다.

## 3. 재직자 실무 상단 헤더 통일

재직자 실무 페이지의 상단 구조를 동일하게 맞췄습니다.

1. 안전과장 로고
2. 홈 / 취준생 / 재직자
3. 현장 대시보드
4. 순회점검
5. 안전교육
6. 위험성평가
7. 실무가이드
8. 법령·지침
9. MSDS
10. 현재 시간
11. 재직자 홈

현재 페이지는 동일한 방식으로 강조하며 메뉴 글자 크기·간격·타원 스타일을 공통 CSS로 처리합니다.

## 4. CBT 중복기출 모음집 다시 잠그기

- 중복기출 모음집을 입장코드로 해제한 뒤, 활성화된 `중복기출 모음집` 탭을 한 번 더 누르면 즉시 다시 잠깁니다.
- 세션의 잠금해제 값도 삭제됩니다.
- 다시 이용하려면 기존 입장코드를 재입력해야 합니다.

## 5. 검증

- `worker-api.js` JavaScript 문법 검사
- `js/main.js` JavaScript 문법 검사
- `js/safety-instructor-hub.js` JavaScript 문법 검사
- `worker/assets/msds/01-inspect.js` JavaScript 문법 검사
- 면접 및 법령 페이지 inline JavaScript 문법 검사
- KOSHA 스마트검색 정상응답 mock 검사
- KOSHA 일시 오류 후 재시도 mock 검사
- KOSHA 인증/권한 오류 시 비-KOSHA fallback이 발생하지 않는지 검사
- 잘못된 우선 Secret + 정상 보조 Secret 자동 전환 검사
- KOSHA MSDS XML 파싱 및 Secret 자동 전환 검사
- 재직자 실무 10개 페이지 상단 메뉴 구조 통일 검사
- ZIP 무결성 검사
