# 클린EV 소셜 이미지 생성 도구

기존 `assets/logo-icon.svg`와 `assets/clean-ev-hero.png`를 조합해 페이스북 프로필·커버 및 링크 공유 이미지를 생성합니다. 사이트 본체와는 독립된 도구입니다.

## 생성 방법

Node.js 18 이상과 Chrome 또는 Edge가 필요합니다.

```powershell
cd tools/social-images
npm install
npm run render
```

Chrome을 자동으로 찾지 못하면 `CHROME_PATH` 환경 변수에 실행 파일 경로를 지정합니다. 렌더러는 Pretendard 웹폰트가 로드되고 `document.fonts.ready`가 완료된 뒤 PNG를 캡처합니다. 웹폰트 로드에 실패하면 템플릿의 `Noto Sans KR` 대체 폰트를 사용합니다.

생성 결과는 `assets/social/`에 저장됩니다.

- `profile-1000x1000.png`
- `cover-1640x624.png`
- `share-1200x630.png`

