# safetygwajang

산업안전기사 CBT 문제풀이와 안전관리자 취업 학습을 연결하는 정적 웹사이트입니다.

## 주요 구성

- `index.html` — 콘텐츠 중심 홈 + CBT 진입
- `industrial-safety-guide.html` — 산업안전기사 기출·오답 학습 가이드
- `risk-assessment-guide.html` — 위험성평가 실무 기초
- `interview.html` — 면접 가이드
- `resume.html` — 자기소개서 작성·검토 도구
- `about.html` — 사이트 소개
- `editorial-policy.html` — 콘텐츠 운영원칙
- `privacy.html` — 개인정보처리방침
- `terms.html` — 이용약관
- `robots.txt`, `sitemap.xml`, `ads.txt` — 검색/광고 기본 파일
- `DEPLOY-CHECKLIST.md` — Cloudflare·Search Console·AdSense 배포 점검
- `DATA-FIXES.md` — 원본 ZIP에서 발견한 JSON·파일명·JavaScript 오류 수정 내역

## AdSense 심사 대비 변경 방향

- 홈을 메뉴/광고 위주의 화면에서 독자적인 학습 콘텐츠가 있는 랜딩페이지로 재구성
- 수동 AdSense 광고 슬롯과 제휴 배너를 심사 전 제거
- 정적 가이드·About·운영원칙·개인정보·이용약관 추가
- 도구성 화면은 `noindex,follow`
- 대표 도메인 canonical을 `https://safetygwajang.com/`으로 통일
- sitemap/robots/404/보안 헤더 추가
- 자기소개서 AI의 외부 AI 전송 가능성을 개인정보처리방침에 반영

## 주의

Google AdSense 승인은 보장되지 않습니다. 또한 기존 데이터의 문제·해설 중 제3자 자료가 있다면 원출처와 재게시 권한을 운영자가 별도로 확인해야 합니다.
