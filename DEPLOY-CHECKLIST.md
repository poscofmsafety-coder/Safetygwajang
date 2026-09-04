# 배포 체크리스트

## 1. GitHub
- ZIP을 풀고 **내용물 자체**를 `safetygwajang` 저장소 루트에 업로드합니다.
- 저장소 첫 화면에서 `index.html`, `css`, `data`, `worker` 폴더가 바로 보여야 합니다.

## 2. Cloudflare
- 현재 사용 중인 `safetygwajang` Workers Static Assets 프로젝트에 GitHub 저장소를 연결합니다.
- 배포 완료 후 `https://safetygwajang.com`에서 새 메인 화면이 보이는지 확인합니다.
- 메인 상단의 **취준생 / 재직자** 탭을 각각 눌러 확인합니다.

## 3. 필수 화면 확인
- 취준생: CBT → 토익스피킹 → 자기소개서 → 면접
- 재직자: 위험성평가 → MSDS → 밀폐공간 → 교육 → 법령 → 사고·아차사고
- 모바일에서 상단 탭과 카드가 한 열로 정렬되는지 확인합니다.

## 4. 데이터/기능
- CBT 문제 및 토익 자료는 기존 `data/`를 유지합니다.
- 자기소개서 AI는 `/api/ai` 프록시가 없으면 개인 키 또는 프롬프트 복사 방식으로 동작할 수 있습니다.
- 제공된 EHS 앱의 `functions/`는 Cloudflare Pages Functions 형식입니다. 현재처럼 Workers Static Assets로 배포할 경우
  서버 API 기능은 별도 Worker 라우팅이 필요할 수 있으므로, 우선 UI·로컬 기능을 확인한 뒤 API 기능을 따로 연결합니다.

## 5. AdSense 재검토 전
- 수동 광고 슬롯은 승인 전 추가하지 않습니다.
- `ads.txt`, 개인정보처리방침, 이용약관, 콘텐츠 운영원칙을 유지합니다.
- 홈과 설명형 콘텐츠의 텍스트가 정상 노출되는지 확인합니다.
- Search Console에서 새 도메인 색인 상태와 sitemap을 확인한 뒤 AdSense 검토를 요청합니다.
