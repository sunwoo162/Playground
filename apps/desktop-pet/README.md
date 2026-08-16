# Playground Desktop Pet

Playground V2용 Windows 데스크톱 펫 MVP입니다.

## 목표

- 항상 화면 위에 떠 있는 투명 데스크톱 펫
- 사용자가 직접 행동 이미지와 명령어를 추가
- `/` 입력 시 게임 대화창 스타일 명령 팔레트 표시
- 앱, URL, 사운드, 캐릭터 행동, 메시지를 명령어로 실행
- 캐릭터 행동은 코드가 아니라 설정 파일을 중심으로 확장

## 현재 MVP 기능

- 투명/Always On Top WPF 창
- 캐릭터 드래그 이동
- 랜덤 행동 엔진
- 행동별 가중치와 지속 시간
- 클릭/드래그 반응
- 전역 `/` 키 감지 후 명령 팔레트 열기
- 명령어 검색 및 실행
- `message`, `behavior`, `app`, `url`, `sound` 액션
- 사용자 데이터는 `%APPDATA%/PlaygroundDesktopPet`에 저장
- 이미지가 없을 때는 기본 도형 캐릭터로 동작

## 실행

Windows에서 .NET 8 SDK가 필요합니다.

```powershell
cd apps/desktop-pet
dotnet run
```

빌드:

```powershell
dotnet build -c Release
```

배포 파일 생성 예시:

```powershell
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

## 캐릭터 이미지 추가

앱을 한 번 실행하면 아래 폴더가 만들어집니다.

```text
%APPDATA%\PlaygroundDesktopPet\assets
```

예제 설정은 다음 파일에 생성됩니다.

```text
%APPDATA%\PlaygroundDesktopPet\pet.config.json
```

기본 예제 행동 이름에 맞춰 아래처럼 투명 PNG를 넣으면 자동 사용됩니다.

```text
idle.png
blank.png
tired.png
sleep.png
surprised.png
focus.png
happy.png
drag.png
```

이미지 파일명이 달라도 `pet.config.json`의 `assetPath`만 바꾸면 됩니다.

### 행동 예시

```json
{
  "id": "reading",
  "displayName": "독서",
  "assetPath": "reading.png",
  "weight": 2,
  "durationMs": 3500,
  "randomEnabled": true
}
```

`weight`가 높을수록 랜덤 행동에서 자주 선택됩니다. `randomEnabled`가 false면 명령이나 이벤트 전용 행동으로 사용할 수 있습니다.

## 명령어 예시

```json
{
  "trigger": "/music",
  "description": "공부 음악 실행",
  "actions": [
    { "type": "behavior", "value": "happy" },
    { "type": "sound", "value": "study.mp3" },
    { "type": "message", "value": "음악 틀었어!" }
  ]
}
```

지원 액션:

- `message`: 말풍선 표시
- `behavior`: 등록된 행동 ID 실행
- `app`: 프로그램/명령 실행
- `url`: 기본 브라우저로 URL 실행
- `sound`: assets 폴더의 음원 재생

## 사용자 UX

캐릭터 우클릭 메뉴에서 다음 작업을 할 수 있습니다.

- 명령어 열기
- 설정 파일 열기
- 캐릭터 이미지 폴더 열기
- 설정 다시 불러오기
- 종료

## 현재 제한사항

- 전역 `/` 키는 현재 키를 가로채지 않습니다. 명령 팔레트는 열리지만 원래 포커스된 프로그램에도 `/`가 입력될 수 있습니다. 일반적인 `/` 입력을 망가뜨리지 않기 위한 MVP 동작입니다.
- 행동 프레임 애니메이션은 아직 없고 행동당 하나의 PNG를 사용합니다.
- 설정 GUI는 아직 없으며 JSON 편집 방식입니다.
- Windows 전용입니다.

## 다음 단계

1. 여러 프레임 행동 애니메이션 지원
2. 행동/명령어를 코드 없이 추가하는 설정 UI
3. 마우스 속도에 따른 drag 모션
4. 사용자 지정 전역 단축키 및 `/` 스마트 감지
5. Windows 시작 프로그램 등록
6. 설치 프로그램/자동 업데이트
7. Playground 계정/웹앱 명령 연동
