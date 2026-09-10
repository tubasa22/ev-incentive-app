# EV 인센티브 자격확인/매칭 앱

캘리포니아 EV 인센티브 프로그램(RYR, Clean Cars 4 All, DCAP, MyFirstEV, CALeVIP,
유틸리티 충전기 리베이트)에 대한 고객 자격을 확인하고, 어떤 프로그램에 신청할 수
있는지 매칭해주는 도구입니다. 신청 이후 케이스 상태를 이력과 함께 관리합니다.

## 현재 상태

고객 인테이크 기반의 프로그램 매칭, 케이스 이력 관리 및 운영자 관리자 화면이 구현되었습니다.

## 기술 스택

- 프론트엔드: 단일 HTML 파일 (인라인 CSS/JS), 별도 설치·서버 불필요
- 백엔드: Google Sheets + Google Apps Script
- 배포: GitHub Pages

## 배포 방법

1. 이 저장소를 GitHub Pages로 배포 (Settings → Pages → main 브랜치 선택)
2. `apps-script/Code.gs` 내용을 Google Apps Script 프로젝트에 붙여넣고 웹앱으로 배포
3. 배포된 Apps Script URL을 `index.html` 및 `admin.html` 상단 `CONFIG.apiUrl`에 입력
4. Apps Script 프로젝트의 Script Properties에 관리자 비밀번호를 `ADMIN_PASSWORD` 키로 설정
5. GitHub Pages의 `/admin.html`에 접속해 해당 비밀번호로 로그인

## 광고 유입 페이지

소셜 광고(페이스북 등)의 도착 URL은 GitHub Pages의 `/landing.html`을 사용합니다. 랜딩 페이지의 “무료 자격 확인하기” 버튼은 고객 인테이크 화면인 `/index.html`로 연결됩니다.

## 기능 목록

- [x] 다단계 인테이크 폼
- [x] 관리자 검토 후 연락 방식의 프로그램 자격 판정 및 매칭
- [x] 케이스 저장 (Google Sheets)
- [x] 케이스 상태 이력 관리
- [x] 관리자 비밀번호 로그인
- [x] 업체(컨트랙터) 등록·수정·비활성화 및 실적 요약
- [x] 미배정 케이스의 업체 배정 및 상태 이력 기록
- [x] 전체 파이프라인·지연 케이스 대시보드
- [x] 하청비 지급과 정부 정산 수령의 독립 관리
- [x] 광고 유입용 랜딩 페이지 및 서비스 소개 페이지
- [x] 법적고지·개인정보처리방침 페이지
