# safetygwajang.com 배포·AdSense 재검토 체크리스트

이 패키지는 **승인을 보장하는 우회책**이 아니라, Google 정책에서 강조하는 고유 콘텐츠·명확한 탐색·콘텐츠가 빈약한 화면의 광고 제한을 반영해 사이트 구조를 정리한 버전입니다.

## 1. GitHub / Cloudflare Pages 배포

- 새 GitHub 저장소 이름: `safetygwajang`
- 이 ZIP의 **내용물 전체를 저장소 루트**에 업로드합니다.
- Cloudflare Pages에서 해당 GitHub 저장소를 연결합니다.
- 정적 사이트이므로 별도 빌드 명령이 필요하지 않은 현재 구조를 유지합니다.
- 배포 후 `https://<pages-project>.pages.dev/`가 정상 동작하는지 확인합니다.

## 2. 개인 도메인 연결

Cloudflare Pages 프로젝트의 Custom domains에 다음을 연결합니다.

- `safetygwajang.com`
- 필요하면 `www.safetygwajang.com`

최종 대표 주소는 `https://safetygwajang.com/`으로 통일하는 것을 권장합니다.
`www` 또는 `pages.dev` 주소를 계속 노출할 경우 대표 도메인으로 301 리디렉션을 설정하세요.

## 3. 배포 직후 반드시 확인

브라우저에서 아래 주소가 200으로 열리는지 확인합니다.

- `/`
- `/industrial-safety-guide.html`
- `/risk-assessment-guide.html`
- `/interview.html`
- `/resume.html`
- `/about.html`
- `/editorial-policy.html`
- `/privacy.html`
- `/terms.html`
- `/ads.txt`
- `/robots.txt`
- `/sitemap.xml`

CBT 기능도 확인합니다.

1. 홈에서 산업안전기사 회차가 보이는지
2. 시험 진입이 되는지
3. 제출 후 결과·해설이 보이는지
4. 오답 재도전과 북마크가 동작하는지
5. 모바일 화면에서 메뉴·문제·버튼이 겹치지 않는지

## 4. Search Console

1. `safetygwajang.com` 도메인 속성을 등록합니다.
2. `https://safetygwajang.com/sitemap.xml`을 제출합니다.
3. 홈, 산업안전기사 공부법, 위험성평가 가이드의 URL 검사를 실행합니다.
4. 실제 색인 가능 여부와 렌더링된 HTML을 확인합니다.

## 5. AdSense 재검토 전

- 대표 도메인이 실제로 열리는 상태여야 합니다.
- `ads.txt`가 `https://safetygwajang.com/ads.txt`에서 그대로 열려야 합니다.
- AdSense 사이트 목록의 주소를 새 개인 도메인으로 등록/확인합니다.
- 수동 광고 슬롯과 쿠팡 배너는 이번 심사용 패키지에서 제거했습니다.
- `exam.html`, `result.html`, `interview-note.html`, `study.html`은 도구·동적 화면 성격이 강해 `noindex,follow`로 두었습니다.
- 콘텐츠 페이지에는 사이트 소유 확인을 위한 AdSense 로더만 남겼습니다.

## 6. 가장 중요한 권리·출처 점검

기존 원본 사이트의 푸터에는 여러 제3자 CBT/강의 자료 출처가 함께 적혀 있었습니다.
**문제와 해설의 원출처·저작권·재게시 허용 여부는 코드만으로 확인할 수 없습니다.**

재검토 전 다음을 직접 확인하세요.

- 제3자가 편집한 문제·해설을 그대로 복사한 데이터가 있는지
- 이용 허락 없이 재게시한 강의문·표현·이미지가 있는지
- 공공기관 공개자료라면 이용조건과 출처표기가 맞는지
- 권리관계가 불명확하면 공개 범위를 줄이거나 삭제할지

`editorial-policy.html`에도 이 원칙을 명시했습니다. 이 부분은 AdSense 승인뿐 아니라 사이트 운영 자체에 중요합니다.

## 7. AI 개인정보 확인

`resume.html`의 AI 기능은 입력 텍스트가 `/api/ai`를 통해 Groq로 전송될 수 있습니다.
따라서 “아무 서버에도 전송되지 않는다”는 기존 문구는 제거했고 `privacy.html`에 실제 구조를 반영했습니다.

배포 전 운영 방식이 바뀌었다면 개인정보처리방침도 함께 수정하세요.

## 8. 재검토 요청 시점

DNS/HTTPS가 안정되고 주요 페이지가 실제 도메인에서 열리며, Search Console에서 Google이 페이지를 읽을 수 있는 것을 확인한 뒤 재검토를 요청하는 편이 좋습니다.

승인은 Google의 최종 심사에 달려 있으므로 어떤 코드 변경도 승인을 보장하지 않습니다.
