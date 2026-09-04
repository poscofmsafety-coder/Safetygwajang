# safetygwajang

안전관리자를 준비하는 취업준비생과 현직 안전관리자가 함께 사용하는 학습·실무 웹사이트입니다.

## 이용자 흐름
- **취준생:** 자격증 → 영어 → 자기소개서 → 면접
- **재직자:** 현장 작업 대시보드 → 안전보건교육 → 위험성평가 → 위험성평가 실무 가이드 → 법령·지침 → MSDS → 밀폐공간·온열질환 → 사고·아차사고

## 주요 기능
- 산업안전기사 CBT, 오답·북마크 학습
- 토익스피킹, 자기소개서, 면접 자료
- 실시간 안전뉴스와 KOSHA 스마트 안전보건법령 검색
- MSDS PDF/이미지 하이브리드 추출, CAS별 KOSHA 대조
- 작업환경측정: MSDS/CAS 인벤토리 → 예비조사 → 적용제외 검토 → 측정·결과 → 주기관리
- 특수건강진단 대상물질/검진기록 관리
- 현장 작업, 안전보건교육, 위험성평가, 사고·아차사고 기록

## Cloudflare
Workers Static Assets + Worker API 구조입니다. `/api/*`는 `worker-api.js`가 처리합니다.

- 배포: `npx wrangler deploy`
- 필수 Secret: `KOSHA_API_KEY`
- 선택 Secret: `KAKAO_REST_API_KEY`, NAVER 검색 API 키

자세한 점검 순서는 `DEPLOY-CHECKLIST.md`, API 연결은 `API-SETUP.md`를 확인하세요.
