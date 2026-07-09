# 학교 알리미 확장프로그램

Chrome 확장 아이콘을 누르면 학교 알리미 웹앱을 작은 팝업 창으로 엽니다.

기본 서비스 주소:

```text
https://playground.https.gsmsv.site/apps/school-meal/
```

## 설치

### Chrome 웹 스토어

Chrome 웹 스토어에 등록한 뒤에는 스토어 페이지에서 `Chrome에 추가`를 누르면 설치됩니다.

### 개발자 모드로 설치

1. Chrome 주소창에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위의 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 누릅니다.
4. 이 폴더를 선택합니다: `apps/school-meal-extension`

## 사용

설치 후 Chrome 오른쪽 위 확장 아이콘에서 `학교 알리미`를 누르면 급식표와 시간표가 있는 학교 알리미가 팝업으로 열립니다.

## 주소 변경

다른 서버를 쓰려면 확장프로그램 상세 정보에서 `확장 프로그램 옵션`을 열고 서비스 주소를 수정합니다.

## 웹 스토어 업로드 zip 만들기

PowerShell에서 실행합니다.

```powershell
.\apps\school-meal-extension\package-webstore.ps1
```

생성 파일:

```text
dist-webstore\school-meal-extension.zip
```
