# AdSense 적용 상태

게시자 ID: `ca-pub-9283463208175336`

## 적용 완료

- 모든 HTML 페이지의 `<head>`에 AdSense 코드 스니펫 1회 삽입
- 루트 `ads.txt`에 게시자 정보 삽입
- 수동 광고 슬롯 ID는 임의 생성하지 않음

`ads.txt` 내용:

```text
google.com, pub-9283463208175336, DIRECT, f08c47fec0942fa0
```

## 배포 후 확인

1. `https://safetygwajang.com/ads.txt` 접속 후 위 한 줄이 보이는지 확인
2. AdSense > 사이트에서 `safetygwajang.com` 연결/검토 상태 확인
3. AdSense > 광고 > 사이트별 설정에서 **자동 광고(Auto ads)** 를 켜면 사이트 전반에서 Google이 적절한 위치를 자동으로 선택
4. 특정 위치에 수동 광고를 넣으려면 AdSense에서 광고 단위를 만든 뒤 발급되는 `data-ad-slot` 값을 코드에 추가해야 함

주의: 실제 광고 단위의 `data-ad-slot` 값은 AdSense에서 발급받아야 하므로 코드에서 임의 생성하면 안 됩니다.
