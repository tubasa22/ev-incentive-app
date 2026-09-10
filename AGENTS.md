# AGENTS.md — EV 인센티브 자격확인/매칭 앱

이 문서는 Codex가 매 세션 시작 시 자동으로 읽는 아키텍처 스펙입니다.
Codex는 작업을 완료할 때마다 이 문서와 README.md를 함께 갱신합니다 (아래 0번 규칙 참고).

## 0. 작업 완료 시 필수 규칙

0. 작업을 완료하면 이 AGENTS.md의 "현재 상태" 섹션과 "다음 세션에서 할 일" 섹션을 갱신한다.
1. 사용자(Jaden)에게 새로 확인이 필요한 사항이 생기면 "확인 필요 항목" 섹션에 추가한다.
2. README.md는 사람이 읽는 문서이므로, 기능이 추가/변경되면 README.md의 기능 목록도 함께 갱신한다.
3. 기존 파일 구조를 임의로 재구성하지 않는다. 재구성이 필요하다고 판단되면 코드를 바꾸지 말고
   "제안 사항" 섹션에 이유와 함께 기록한다.
4. 개인정보(소득, 연락처 등)를 다루는 코드를 수정할 때는 Google Sheets 저장 경로와
   localStorage 저장 경로를 명확히 구분해서 유지한다 — 민감정보는 localStorage에 남기지 않는다.
5. CONFIG 객체(프로그램별 금액·소득기준)를 수정할 때는 로직 코드는 건드리지 않는다.
6. 변경 후 git commit을 남긴다. 커밋 메시지는 한국어로 무엇을/왜 바꿨는지 명시한다.

## 1. 프로젝트 목적

캘리포니아 EV 인센티브 프로그램(RYR, Clean Cars 4 All, DCAP, MyFirstEV, CALeVIP,
유틸리티 충전기 리베이트)에 대해 고객의 정보를 받아 자격을 판정하고, 어떤 프로그램에
신청 가능한지 매칭해주는 웹앱. 신청 이후에는 케이스 상태를 이력과 함께 관리한다.

## 2. 파일 구조

```
index.html          — 메인 앱 (단일 파일, 인라인 CSS/JS)
admin.html          — 대표님(운영자) 전용 관리 화면
landing.html        — 소셜 광고 유입용 랜딩 페이지
about.html          — 서비스 소개 및 제작 취지
legal.html          — 법적고지, 개인정보처리방침, 면책조항
site-config.js      — 공개 페이지 공통 설정(문의 이메일 등)
apps-script/Code.gs — Google Apps Script 백엔드 (Apps Script 에디터에 수동 배포)
AGENTS.md            — 이 문서
README.md            — 사람이 읽는 설명서
```

## 3. index.html 요구사항

### 3.1 인테이크 폼 (다단계, 진행률 표시)
- 신청자 기본정보: 이름, 전화, 이메일, 우편번호, 주택소유여부(자가/렌트)
- 소득정보: 가구원수, 가구총소득(또는 신고소득), 신고연도
- 기존차량: 연식, 연료타입, 본인명의여부, 스모그체크통과여부
- 희망사항: 신차/인증중고/충전기만, 희망차종, 기존EV보유여부
- 신청이력: 과거 CVRP/RYR/CC4A/DCAP 신청여부(있으면 프로그램명+결과)

### 3.2 우편번호 매핑
- ZIP → air district(South Coast AQMD 여부), 유틸리티 회사 매핑을 JS 객체로 하드코딩
- 정확한 전국 매핑이 아니므로 "추정치 — 확인 필요" 배지를 항상 표시

### 3.3 매칭 룰 엔진 (순수 JS 함수로 분리, 테스트 가능하게)
- FPL % 계산 함수
- 프로그램별 자격 판정 함수 (boolean + 사유 텍스트 반환)
- 최종 추천: 금액 내림차순 정렬, 상호배타 조합은 경고 배지

### 3.4 결과 화면
- 고객에게는 매칭 프로그램 카드, 예상금액, 자격사유, 필요서류를 표시하지 않는다.
- 인테이크 제출 시 매칭 룰 엔진은 계속 계산하고 `매칭결과JSON`으로 Cases에 저장한다.
- 제출 완료 화면에는 감사 메시지와 "입력하신 정보를 검토한 후, 영업일 기준 1~2일 내로 전화 또는 이메일로 연락드리겠습니다" 안내만 표시한다.
- 고객 연락 선호 방법(전화/이메일/문자)을 수집하고 전화·이메일은 제출 전 필수 검증한다.

### 3.5 케이스 이력 관리 화면
- CaseID/전화번호로 검색
- 상태 변경: 대기 → 서류접수 → 제출 → 승인 → 거절/정산완료
  - 상태 변경 시 StatusHistory에 append (기존 이력 절대 덮어쓰지 않음)
- 상태별 파이프라인(칸반) 뷰

## 4. Google Sheets 데이터 구조

**Sheet 1 "Cases"**: CaseID, 생성일시, 담당자, 신청자정보(JSON), 매칭프로그램목록(JSON), 연락선호방법, 매칭결과JSON, 현재상태, 최종수정일시, 컨트랙터ID, 배정일시

**Sheet 2 "StatusHistory"**: CaseID, 타임스탬프, 이전상태, 새상태, 메모, 담당자 (append-only, row 삭제/수정 금지)

**Sheet 3 "Contractors"**: 컨트랙터ID, 이름, 연락처, 액세스코드, 계약시작일, 계약서Drive링크, 건당단가, 활성여부, 생성일시, 최종수정일시

**Sheet 4 "Payments"**: CaseID, 컨트랙터ID, 하청비지급액, 하청비지급일, 하청비지급상태(대기/완료), 정부정산수령액, 정부정산수령일, 정부정산수령상태(대기/완료)

**Code.gs 함수**: `doPost(e)` 케이스 생성/상태갱신 분기, `doGet(e)` CaseID/전화번호 조회.
상태 갱신 시 Cases 갱신 + StatusHistory append가 항상 같이 일어나야 함.

## 4.1 admin.html 요구사항

- 초기 버전은 단일 관리자 비밀번호로 로그인한다. 비밀번호는 프런트엔드에 보관하지 않고 Apps Script Script Properties에서 검증한다.
- **업체 관리**: 이름, 연락처, 액세스코드, 계약시작일, 계약서 Drive 링크, 건당 단가, 활성 여부를 등록·수정·비활성화하고 업체별 배정/완료/평균 처리기간을 표시한다.
- **일감 배정**: 미배정 Cases를 활성 업체에 배정하고, Cases 갱신과 함께 StatusHistory에 담당자=관리자, 새 상태=배정됨을 append한다.
- **대시보드**: 대기/배정됨/시공중/시공완료/서류제출완료/정산완료 칸반 요약, 업체별 집계, 배정 후 지정 일수 이상 변동 없는 지연 건을 표시한다.
- **정산**: 시공완료·미지급 건의 하청비를 지급 처리하며, 정부 정산 수령은 별도 필드로 독립 기록한다.
- **케이스 상세**: 관리자만 매칭결과JSON의 프로그램명, 예상금액, 자격사유, 필요서류를 확인하며, "고객에게 연락함"으로 `결과안내완료` 상태를 StatusHistory에 기록할 수 있다.
- `Code.gs`는 `registerContractor`, `updateContractor`, `assignCaseToContractor`, `getUnassignedCases`, `getDashboardSummary`, `recordSubPayment`, `recordGovReimbursement` 동작을 API 분기로 제공한다.

## 4.2 공개 페이지 요구사항

- **landing.html**: 모바일 우선 광고 유입 페이지로, 무료 자격 확인 CTA(index.html), 혜택 요약, 민간 신청 지원 서비스 고지, 소개/법적고지 링크를 제공한다. 확정 지원금 광고 문구는 사용하지 않는다.
- **about.html**: 서비스의 정보 격차 해소 취지, 대상 프로그램, 민간 신청 대행·시공 연결 역할, 운영자/라이선스/연락처를 안내한다.
- **legal.html**: 비공식 관계·예비 판정·운영 조건 변경·비자문 면책, 고객 무료 원칙, 개인정보 수집·Google Sheets 보관·비판매·SSN 미수집·삭제 요청 절차를 고지한다.
- 모든 공개 페이지의 문의 이메일은 `site-config.js`의 `SITE_CONFIG.contactEmail`을 사용하며, 값은 `jdlee.electric@gmail.com`으로 통일한다.

## 4.3 디자인 토큰

- 컨셉: 친환경 클린 에너지와 신뢰할 수 있는 서류 대행을 함께 전달하는, 한인 이민자 가정에 따뜻하고 안심되는 톤의 "클린EV" 디자인.
- 색상: 배경 `#F7F6F1`, 프라이머리 `#0F5C4C`, 프라이머리 호버 `#0B4438`, 액센트 `#E8A33D`, 기본 텍스트 `#1C1B18`, 보조 텍스트 `#5C5A54`만 사용한다.
- 폰트: Pretendard 웹폰트(`https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css`)를 한글·영문·숫자 전체에 사용한다.
- 이미지: `site-config.js`의 `SITE_CONFIG.images`에서 이미지 경로를 관리한다. 현재는 프로젝트 `assets/`의 생성 이미지(가정 충전 EV, 따뜻한 가족 사진)를 사용하며, 실제 사진으로 바꿀 위치에는 TODO 주석을 남긴다.
- 공개 페이지 혜택은 반복 카드/그림자 패턴 대신 프라이머리 그린 SVG 라인 아이콘과 텍스트 목록으로 구성한다.

## 5. 지켜야 할 것

- FinCRM(tubasa22.github.io/Fincrm) 등 다른 저장소 파일은 건드리지 않는다 — 완전히 독립된 저장소.
- 소득 등 민감정보는 Google Sheets에만, localStorage는 세션 임시값만.
- 프로그램 기준(금액/소득기준)은 상단 CONFIG 객체로 분리.
- 관리자 전용 단가·계약정보·Payments는 admin API 응답에서만 제공하며 컨트랙터 API에는 포함하지 않는다.
- 고객/컨트랙터/관리자 앱의 기존 기능 로직은 공개 페이지 추가 시 변경하지 않으며, 푸터 링크와 공통 문의처 설정만 최소 반영한다.
- 고객용 index.html에는 상세 매칭 결과를 절대 표시하지 않고, 저장된 결과는 관리자 전용 화면에서만 검토한다.

## 5.1 Apps Script 보안 규칙

- Cases의 부분 검색과 관리자 상세 결과 조회는 `adminPassword` 인증을 통과한 관리자만 허용한다. 고객 자가 조회 기능은 현재 제공하지 않는다.
- 상태 변경은 관리자 인증 또는 해당 케이스에 실제 배정된 활성 컨트랙터의 ID·액세스코드 인증을 통과해야 한다.
- 컨트랙터 조회는 `getCasesForContractor`로만 제공하며, 소득·가구원수·신청이력·매칭결과 등 민감 필드를 제외한 축소 객체만 반환한다.
- 모든 Sheets 쓰기 함수는 `LockService` Script Lock을 획득하고 `finally`에서 항상 해제한다.

## 5.2 컨트랙터 계약·신원확인 규칙

- 컨트랙터 신원확인은 SMS OTP(자동, `FEATURES_SMS_ENABLED=true`일 때)와 CSLB 라이선스 수동확인(관리자)의 조합으로 운영한다.
- OTP는 Contractors 시트에 5분 한정으로 저장하고 검증 성공 시 즉시 초기화한다. SMS 비활성 상태에서는 관리자 수동 전화 확인 대기로 계약서를 받을 수 있다.
- `FEATURES_SMS_ENABLED` Script Property가 정확히 `true`일 때만 Twilio를 호출하며, 누락 또는 `false`면 OTP 단계를 건너뛰고 오류 없이 관리자 수동확인 대기 흐름으로 진행한다.
- 계약서 제출은 라이선스·본드·전자서명·동의를 기록한다. SMS 사용 시 OTP 통과 후 10분 내 제출만 허용한다.
- 배정에는 활성·미만료 라이선스/본드·본인확인 완료 상태가 모두 필요하다.
- 모든 UI 텍스트는 한국어.

## 6. 현재 상태

- 화면 구조:

| 구분 | 파일 | 역할 |
| --- | --- | --- |
| 공개 | landing.html | 소셜 광고 유입 및 무료 자격 확인 유도 |
| 공개 | about.html | 서비스 취지·프로그램·운영자 정보 안내 |
| 공개 | legal.html | 면책, 고객 무료 원칙, 개인정보처리방침 |
| 공개 | index.html | 고객 인테이크 및 인센티브 예비 매칭 |
| 앱 | contractor.html | 컨트랙터 배정 케이스 처리 화면 (추가 예정) |
| 앱 | admin.html | 운영자 업체·배정·파이프라인·정산 관리 |
| 공통 | site-config.js | 공개 페이지 문의처 설정 |

- [x] index.html 구현 완료: 다단계 인테이크, ZIP 추정 매핑, 순수 JS 매칭 룰 엔진, 결과·케이스 관리 화면
- [x] apps-script/Code.gs 구현 완료: Cases/StatusHistory 자동 생성, 케이스 생성·조회·상태 변경 API
- [x] 고객 화면(index.html): 고객 정보 수집과 인센티브 자격 매칭
- [ ] 컨트랙터 화면(contractor.html): 배정 케이스 조회용 화면은 아직 추가되지 않음
- [x] 관리자 화면(admin.html): 업체·배정·파이프라인·하청비/정부정산 관리
- [x] 관리자 API: Contractors/Payments 시트와 관리자 인증, 업체 등록·배정·정산 API 구현
- [x] 공개 페이지: 광고 랜딩, 서비스 소개, 법적고지/개인정보처리방침 및 공통 문의처 설정 구현
- [x] 클린EV 공개 페이지 디자인: 고정 팔레트·Pretendard·생성 이미지·모바일 우선 레이아웃 적용
- [x] 클린EV 이미지 자산: 생성한 가정 충전 EV·가족 사진을 `assets/`에 적용
- [x] 자격 확인 플로우: 고객은 정보·연락 선호 방법만 제출하고, 매칭 결과는 Cases에 저장하여 관리자만 검토 후 연락
- [x] Apps Script 보안 수정: 관리자 조회 인증, 상태 변경 권한 검증, 컨트랙터 축소 조회, Sheets 쓰기 잠금 적용
- [x] A. Contractors 시트 계약·라이선스·본드·OTP·수동확인 컬럼 확장
- [x] B. 컨트랙터 로그인, 배정 케이스, OTP, 계약서, 수동확인 Apps Script 함수 추가
- [x] C. contractor.html 생성됨: 로그인, 배정 건 상태 변경, 계약 관리
- [x] D. contract.html 생성됨: 재인증, OTP 게이트, 계약서·전자서명 제출
- [x] E. admin.html 업체 목록: CSLB 링크·라이선스 복사·수동확인 동작 추가

## 7. 다음 세션에서 할 일

- ZIP-유틸리티 매핑, CALeVIP 지역별 금액표 등 실제 데이터 보강
- Apps Script를 대상 Google Sheet에 바인딩하고 웹앱 URL을 index.html의 CONFIG.apiUrl에 설정
- 계정 여러 개 지원 및 역할 기반 권한 관리
- Google Drive API를 통한 계약서 링크/권한 실연동
- contractor.html 추가 후 배정 케이스 노출 API 연동
- 운영자 이름과 CA 보험업 라이선스 번호 확정 후 about.html에 반영
- 대표님 실제 촬영 사진 확보 후 `site-config.js`의 `SITE_CONFIG.images` URL 교체

## 8. 확인 필요 항목

- 프로그램별 실제 금액·소득기준과 지역별 대상 여부는 공식 공고 기준으로 검증·갱신 필요
- Apps Script Script Properties에 ADMIN_PASSWORD를 설정해야 관리자 로그인이 작동함
- 보안 수정 완료, 배포 전 재점검 필요
- CSLB는 공식 API가 없어 수동확인 방식 채택함, 추후 물량이 많아지면 유료 스크래핑 서비스(Apify 등) 검토 가능
- FEATURES_SMS_ENABLED Script Property를 Google Sheets 편집기에서 `true`로 추가하고 진짜 Twilio 값을 넣으면 SMS 기능 활성화됨
