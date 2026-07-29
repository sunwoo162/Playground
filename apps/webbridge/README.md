# WebBridge

API가 없는 웹 서비스들을 규칙 기반으로 연결하는 Chrome 확장 프로그램입니다.

## 주요 기능

- 현재 페이지에서 데이터 추출
- 추출 데이터 변환
- 웹훅/HTTP 요청 전송
- 다른 사이트 폼 자동 입력
- 확장 저장소에 데이터 저장
- 저장 데이터 다시 읽기
- 브라우저 알림
- 수동 실행, 페이지 로드 실행, 주기 실행, 단축키 실행
- 팝업에서 현재 탭 규칙 실행
- 옵션 페이지에서 규칙 생성/수정/복제/삭제

## 설치 웹

`index.html`을 브라우저로 열면 기능 설명과 설치 방법을 볼 수 있습니다.
`guide.html`을 열면 기능별 사용법, 파일별 역할, 규칙 예시 생성기를 사용할 수 있습니다.

```txt
C:\Users\user\Documents\Playground\apps\webbridge\index.html
C:\Users\user\Documents\Playground\apps\webbridge\guide.html
```

## Chrome 설치 방법

1. Chrome 주소창에 `chrome://extensions`를 입력합니다.
2. 오른쪽 위 `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 누릅니다.
4. `C:\Users\user\Documents\Playground\apps\webbridge` 폴더를 선택합니다.
5. 확장 아이콘을 고정합니다.
6. 팝업의 `관리` 버튼을 눌러 규칙을 만듭니다.

## 파일 구조

```txt
webbridge/
  manifest.json          확장 프로그램 권한, 엔트리, 명령 설정
  background.js          규칙 실행, 알람, 탭/웹훅/알림 처리
  content.js             웹페이지 DOM에서 추출/자동화 수행
  popup/
    popup.html           확장 팝업 UI
    popup.css            팝업 스타일
    popup.js             현재 탭 규칙 실행, 검색, 토글
  options/
    options.html         규칙 관리 화면
    options.css          관리 화면 스타일
    options.js           규칙 생성/수정/복제/삭제, 단계 JSON 편집
  examples/
    examples.json        예제 규칙 모음
  icons/
    icon16.png
    icon48.png
    icon128.png
  index.html             설치/기능 설명 웹 페이지
```

## 규칙 예시

```json
[
  {
    "type": "extract",
    "fields": {
      "title": "h1"
    }
  },
  {
    "type": "notify",
    "title": "WebBridge",
    "message": "추출 완료: {{data.title}}"
  }
]
```

## 안전 기준

- 사용자가 만든 규칙만 실행합니다.
- 비밀번호 자동 입력, 로그인 우회, 캡차 우회 목적 사용은 금지합니다.
- 외부 웹훅 URL에는 민감한 값이 포함되지 않도록 주의해야 합니다.
- API 키나 토큰은 규칙 JSON에 직접 넣지 않는 것이 좋습니다.
