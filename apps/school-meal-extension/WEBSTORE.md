# Chrome Web Store 제출 정보

## 이름

학교 알리미

## 한 줄 설명

확장 아이콘을 누르면 학교 급식표와 시간표를 바로 확인할 수 있습니다.

## 자세한 설명

학교 알리미는 사용자가 설정한 학교 알리미 웹앱을 작은 팝업 창으로 열어 급식표와 시간표를 빠르게 확인할 수 있게 해주는 Chrome 확장프로그램입니다.

기본 서비스 주소는 `https://playground.https.gsmsv.site/apps/school-meal/`이며, 확장프로그램 옵션에서 다른 주소로 변경할 수 있습니다.

주요 기능:

- 확장 아이콘 클릭으로 학교 알리미 바로 열기
- 급식표 확인
- 시간표 확인
- 서비스 주소 변경 지원

## 카테고리

Productivity

## 권한 사용 사유

### storage

사용자가 옵션 페이지에서 입력한 학교 알리미 서비스 주소를 저장하기 위해 사용합니다.

## 개인정보 처리 안내

이 확장프로그램은 사용자의 개인정보를 외부 서버로 직접 수집하거나 전송하지 않습니다.

확장프로그램은 다음 정보만 Chrome 동기화 저장소에 저장합니다.

- 사용자가 입력한 학교 알리미 서비스 주소

급식표와 시간표 데이터는 사용자가 여는 학교 알리미 웹앱에서 처리됩니다.

## 기본 서비스 URL

```text
https://playground.https.gsmsv.site/apps/school-meal/
```

## 업로드 파일 만들기

PowerShell에서 실행:

```powershell
.\apps\school-meal-extension\package-webstore.ps1
```

생성 파일:

```text
dist-webstore\school-meal-extension.zip
```
