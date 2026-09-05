# v15 변경사항 — 제일이 캐릭터 전면교체 + KRAS Import/AI

## 1. 제일이 캐릭터 전면교체
- 사용자가 제공한 새 제일이 캐릭터 자료를 기준으로 웹용 투명 PNG 세트를 구성했습니다.
- `assets/jaeili-face-v4.png`: 헤더/아이콘용 얼굴
- `assets/jaeili-wave-v4.png`: 메인/재직자 홈
- `assets/jaeili-inspector-v4.png`: AI 순회점검/KRAS 스마트 시작
- `assets/jaeili-clipboard-v4.png`: 위험성평가/실무가이드/사고기록
- `assets/jaeili-thumbs-v4.png`: 확인/교육/검증
- `assets/jaeili-warning-v4.png`: 위험 경고/AI 안전장치 안내
- 기존 `jaeili-face*.png`, `jaeili-full.png`, `jaeili-hero*.png`도 새 디자인으로 덮어써 구버전 참조가 남아도 새 캐릭터가 표시됩니다.

## 2. 기존 KRAS·Excel 자료 가져오기
`worker/risk-assessment.html`의 SMART START에서 다음 파일을 읽을 수 있습니다.
- XLSX / XLS
- CSV / TSV
- 안전과장 KRAS JSON
- Excel에서 복사한 표 붙여넣기

헤더 자동탐지 예:
- 공정명 / 작업명 / 공정(작업)
- 세부작업 / 작업단계
- 유해·위험요인 / 위험한 상황과 사건
- 현재 안전보건조치 / 현재조치 / 기존대책
- 위험성 수준 / 현재 위험성 / 위험도
- 가능성·중대성 / 빈도·강도
- 감소대책 / 개선대책
- 담당자 / 완료예정일 / 조치상태
- 개선 후 위험성 / 잔여위험 / 재평가 근거

2~3행짜리 복합 헤더도 합쳐서 인식하며, KRAS 보고서의 병합셀 때문에 공정명이 아래 행에서 비어 있으면 직전 공정명을 이어받습니다.
가져온 자료는 중복을 제외해 병합하고 `needsReview=true`로 저장합니다.

## 3. Groq AI KRAS 초안
- API: `POST /api/ai/kras`
- Secret: 기존 `GROQ_API_KEY`
- 선택 환경변수: `GROQ_KRAS_MODEL`
- 기본 모델: `openai/gpt-oss-120b`
- Structured Outputs(JSON Schema strict) 사용
- API 키는 Worker에서만 사용하고 브라우저에 노출하지 않습니다.

AI 입력 최소값:
1. 공정·작업명
2. 작업내용

선택 입력:
- 설비·도구·물질
- 현재 적용 중인 안전조치
- 작업조건·인원·빈도
- 사고·아차사고·특이사항

AI 출력:
- 구체적인 위험 시나리오
- 예상 부상·질병
- 현재조치(미입력 시 현장 확인 필요)
- 잠정 위험성 수준
- 감소대책 우선순위와 구체적 대책
- 잠정 개선 후 위험성
- 현장 검증 체크사항
- 신뢰도

## 4. 안전장치
- AI 결과는 자동 확정하지 않고 항상 `재검토 필요`로 들어갑니다.
- 입력하지 않은 보호장치·인터록·환기성능·측정값·법규 충족 여부를 사실처럼 만들지 않도록 서버 프롬프트에서 제한합니다.
- 법 조문 번호·수치를 임의 생성하지 않도록 제한합니다.
- 감소대책은 제거 → 대체 → 공학적 → 관리적 → 개인보호구 순서를 우선하도록 합니다.
- 빈도·강도법의 숫자점수는 사업장 실시규정이 없으면 AI가 임의 확정하지 않습니다.
- Imported/AI records are review-required until a user confirms site conditions.

## 5. 참고한 공식 자료
- KRAS 위험성평가 지원시스템: https://portal.kosha.or.kr/kras/implement/real
- 국가법령정보센터 사업장 위험성평가에 관한 지침: https://www.law.go.kr/
- Groq Structured Outputs: https://console.groq.com/docs/structured-outputs
- Groq Models: https://console.groq.com/docs/models
