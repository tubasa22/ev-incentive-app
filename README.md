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
3. 배포된 Apps Script URL을 `site-config.js`의 `apiUrl`에 입력
4. Apps Script 프로젝트의 Script Properties에 관리자 비밀번호를 `ADMIN_PASSWORD` 키로 설정
5. GitHub Pages의 `/admin.html`에 접속해 해당 비밀번호로 로그인
6. SMS OTP를 사용할 경우 Apps Script Script Properties에 `FEATURES_SMS_ENABLED=true`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`을 설정
## 고객 접수확인 이메일 트리거 설정

고객 신청 화면의 제출 속도를 유지하기 위해, 접수확인 이메일은 케이스 저장 직후가 아니라 Apps Script 시간 기반 트리거가 별도로 발송합니다. 트리거를 등록하지 않으면 Cases 시트의 `확인메일발송상태`가 `대기`로 남고 메일은 발송되지 않습니다.

1. Google Sheets에 연결된 Apps Script 편집기에서 왼쪽 **트리거** 메뉴를 엽니다.
2. 오른쪽 아래 **트리거 추가**를 선택합니다.
3. 실행할 함수로 `processPendingConfirmationEmails`를 선택합니다.
4. 이벤트 소스는 **시간 기반**, 유형은 **분 단위 타이머**, 간격은 **1분마다**를 선택합니다.
5. 저장 후 권한 요청을 승인합니다.

## 배포 후 연결 테스트 체크리스트

1. `site-config.js`의 `apiUrl`을 실제 배포된 Apps Script 웹앱 URL로 교체합니다.
2. `admin.html`에서 관리자 비밀번호로 로그인해 성공 여부를 확인합니다.
3. 관리자 화면에서 테스트 업체 1개를 등록하고 Google Sheets `Contractors` 시트에 행이 생기는지 확인합니다.
4. `index.html`에서 테스트 신청서 1개를 제출하고 `Cases` 시트에 행이 생기는지 확인합니다.
5. 등록한 업체의 계약서 링크로 `contract.html`을 열어 작성한 뒤, `Contractors` 시트에 라이선스·본드 정보가 채워지는지 확인합니다.

`file://`로 직접 열면 브라우저 CORS 정책으로 호출이 실패할 수 있으므로 GitHub Pages 등 실제 웹서버로 배포한 상태에서 테스트하세요.

## 광고 유입 페이지

소셜 광고(페이스북 등)의 도착 URL은 GitHub Pages의 `/landing.html`을 사용합니다. 랜딩 페이지의 “무료 자격 확인하기” 버튼은 고객 인테이크 화면인 `/index.html`로 연결됩니다.

## 협력업체 지원서 및 검토

협력업체 공개 지원서 URL은 GitHub Pages의 `/contractor-apply.html`입니다. 로그인 없이 지원서를 접수할 수 있으며, 동일 이메일 또는 연락처의 24시간 내 중복 접수는 차단됩니다. 운영자는 `/admin.html` 로그인 후 **지원자 검토** 탭에서 상태를 선택해 지원서를 조회하고, 상세 본드·경력 정보를 확인한 뒤 승인 또는 거절할 수 있습니다. 승인하면 업체 계정과 계약서 작성 링크가 자동 생성되어 지원자 이메일로 발송됩니다. 이메일 발송이 실패한 경우에도 승인은 유지되며 화면에 표시된 액세스코드를 직접 전달하면 됩니다.

## SMS 기능 켜는 방법

기본값은 SMS 비활성입니다. Google Sheets에 연결된 Apps Script의 Script Properties에 `FEATURES_SMS_ENABLED`를 `true`로 추가하고, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`에 실제 Twilio 값을 설정하면 코드 변경 없이 SMS OTP 발송이 활성화됩니다. 해당 속성이 없거나 `false`이면 계약서 화면에서 등록된 이메일로 인증번호를 받거나, 관리자 수동 전화 확인을 선택할 수 있습니다. 이메일이 없는 직접 등록 업체는 전화 확인 경로만 사용할 수 있습니다.

## 프로그램 신청 중단·재개

`/admin.html`에 로그인한 뒤 **프로그램 관리** 탭에서 RYR, CC4A, DCAP, MyFirstEV, CALeVIP, 유틸리티리베이트의 토글을 변경하고 메모를 입력한 뒤 저장합니다. 비활성 프로그램은 새 고객 케이스의 관리자용 매칭 결과에 **현재 신청 일시중단**으로 남아, 고객에게 잘못된 신청 가능 안내가 전달되지 않도록 합니다.

## 기능 목록

- [x] 다단계 인테이크 폼
- [x] 관리자 검토 후 연락 방식의 프로그램 자격 판정 및 매칭
- [x] 케이스 저장 (Google Sheets)
- [x] 케이스 상태 이력 관리
- [x] 관리자 비밀번호 로그인
- [x] 업체(컨트랙터) 등록·수정·비활성화 및 실적 요약
- [x] 미배정 케이스의 업체 배정 및 상태 이력 기록
- [x] 전체 파이프라인·지연 케이스 대시보드
- [x] 시공완료 이후 미지급 건을 포함하는 하청비 지급과 정부 정산 수령의 독립 관리
- [x] 광고 유입용 랜딩 페이지 및 서비스 소개 페이지
- [x] 법적고지·개인정보처리방침 페이지
- [x] 컨트랙터 로그인·배정 건 상태 변경 이력 조회·계약서 제출 화면
- [x] SMS OTP(선택 기능)·이메일 OTP·관리자 전화 본인확인, CSLB 조회 링크 제공
- [x] 공개 협력업체 지원서 접수 및 관리자 승인·거절 검토
