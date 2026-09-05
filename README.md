# safetygwajang

안전관리자를 준비하는 취업준비생과 현직 안전관리자가 함께 사용하는 학습·실무 웹사이트입니다.

## 이용자 흐름
- **취준생:** 자격증 → 영어 → 자기소개서 → 면접
- **재직자:** 현장 작업 대시보드 → AI 순회점검일지 → 안전보건교육 → 위험성평가 → 위험성평가 실무 가이드 → 법령·지침 → MSDS → 밀폐공간·온열질환 → 사고·아차사고

## 주요 기능
- 산업안전기사 CBT, 오답·북마크 학습
- 토익스피킹, 최신 AI 기업조사 기반 자기소개서 작성·검토, 면접 자료
- 실시간 안전뉴스와 KOSHA 스마트 안전보건법령 검색
- MSDS PDF/이미지 하이브리드 추출, CAS별 KOSHA 대조
- 작업환경측정: MSDS/CAS 인벤토리 → 예비조사 → 적용제외 검토 → 측정·결과 → 주기관리
- 특수건강진단 대상물질/검진기록 관리
- 현장 작업, AI 사진 순회점검, 안전보건교육, KRAS 위험성평가(기존 KRAS/Excel 가져오기 + Groq AI 초안), 사고·아차사고 기록

## Cloudflare
Workers Static Assets + Worker API 구조입니다. `/api/*`는 `worker-api.js`가 처리합니다.

- 배포: `npx wrangler deploy`
- 필수 Secret: `KOSHA_API_KEY`
- AI 기능 사용 시 Secret: `GROQ_API_KEY`
- 선택 Secret: `GROQ_TEXT_MODEL`, `GROQ_VISION_MODEL`, `GROQ_KRAS_MODEL`, `KAKAO_REST_API_KEY`, NAVER 검색 API 키

자세한 점검 순서는 `DEPLOY-CHECKLIST.md`, API 연결은 `API-SETUP.md`를 확인하세요.


## 보안 및 수익화

- `js/security.js`: 우클릭 제한, 개발자도구 단축키 억제, 비정상 연속 클릭 경고
- `ads.txt` 및 모든 HTML 페이지에 AdSense `ca-pub-9283463208175336` 코드 적용
- `ADSENSE-SETUP.md`: 배포/자동광고 확인 절차
- `AUTH-PAYMENTS-PLAN.md`: 회원가입·소셜로그인·유료결제 도입 설계안

## v16 현장 공공데이터 / KRAS
- Cloudflare Secret `PUBLIC_DATA_API_KEY`를 사용해 기상·대기질·화학물질·산불·화재 공공데이터를 보조정보로 연결합니다.
- KRAS AI는 Groq 기반이며 공공데이터와 CAS 정보는 참고문맥으로만 사용합니다. AI가 위험성 수준·작업중지·법적 적합성을 자동 확정하지 않습니다.
- TBM 사진/PDF 첨부파일은 브라우저 IndexedDB에 저장됩니다.
- 한국전기안전공사 전기안전정보 API는 현재 버전에서 사용하지 않습니다.
