# EV 인센티브 자격확인/매칭 앱

캘리포니아 EV 인센티브 프로그램(RYR, Clean Cars 4 All, DCAP, MyFirstEV, CALeVIP,
유틸리티 충전기 리베이트)에 대한 고객 자격을 확인하고, 어떤 프로그램에 신청할 수
있는지 매칭해주는 도구입니다. 신청 이후 케이스 상태를 이력과 함께 관리합니다.

## 현재 상태

인테이크 기반의 프로그램 매칭과 Google Sheets 케이스 이력 관리 기능이 구현되었습니다.

## 기술 스택

- 프론트엔드: 단일 HTML 파일 (인라인 CSS/JS), 별도 설치·서버 불필요
- 백엔드: Google Sheets + Google Apps Script
- 배포: GitHub Pages

## 배포 방법

1. 이 저장소를 GitHub Pages로 배포 (Settings → Pages → main 브랜치 선택)
2. `apps-script/Code.gs` 내용을 Google Apps Script 프로젝트에 붙여넣고 웹앱으로 배포
3. 배포된 Apps Script URL을 `index.html` 상단 CONFIG에 입력

## 기능 목록

- [x] 다단계 인테이크 폼
- [x] 프로그램 자격 판정 및 매칭
- [x] 케이스 저장 (Google Sheets)
- [x] 케이스 상태 이력 관리
