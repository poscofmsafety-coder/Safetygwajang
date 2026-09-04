# KOSHA MSDS OpenAPI 연결

MSDS 자동 법규검토는 한국산업안전보건공단의 2026년 현재 공공데이터포털 서비스
`한국산업안전보건공단_물질안전보건자료 조회 서비스(데이터셋 15157612)`를 사용하도록 구성되어 있습니다.

## 1. 공공데이터포털 활용신청
- 데이터셋: https://www.data.go.kr/data/15157612/openapi.do
- 공공데이터포털 현재 안내상 개발단계는 자동승인, 운영단계는 심의승인입니다.
- 발급받은 일반 인증키(Decoding)를 준비합니다.

## 2. Cloudflare에 인증키를 Secret으로 저장
Cloudflare Dashboard > Workers & Pages > safetygwajang > Settings > Variables and Secrets에서
다음 Secret을 추가합니다.

- 이름: `KOSHA_API_KEY`
- 값: 공공데이터포털에서 발급받은 인증키

인증키를 HTML/JavaScript/GitHub에 직접 넣지 마세요.

CLI를 사용하는 경우:
```bash
npx wrangler secret put KOSHA_API_KEY
```

## 3. 재배포
GitHub에 이 프로젝트를 push하면 `wrangler.jsonc` 기준으로 정적 사이트와 API Worker가 함께 배포됩니다.

## 자동검토 원칙
- 업로드한 제조사/공급자 MSDS의 2항·3항·15항을 1차 근거로 사용합니다.
- KOSHA API는 CAS 및 KOSHA MSDS 15항을 교차확인하는 보조 근거입니다.
- 작업환경측정: 산업안전보건법 시행규칙 별표 21 최신본 확인
- 특수건강진단 대상: 시행규칙 별표 22 최신본 확인
- 특수건강진단 시기·주기: 시행규칙 별표 23 최신본 확인
- 특별관리물질: 산업안전보건기준에 관한 규칙 별표 12 및 제440조 최신본 확인
- 공단 화학물질정보는 MSDS 작성·검토 참고용입니다. 제조·수입자의 원본 MSDS와 최신 법령, 실제 취급·노출조건을 최종 기준으로 확인하도록 설계했습니다.
- 인증키가 없거나 API가 일시적으로 실패하면 가짜 판정을 만들지 않고 `확인 필요` 상태를 유지합니다.
