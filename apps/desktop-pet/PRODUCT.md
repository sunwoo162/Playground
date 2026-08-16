# Product Definition — Playground Desktop Pet

## User

Windows에서 Playground를 사용하면서 화면 위에 상시 존재하는 캐릭터형 런처와 데스크톱 펫을 원하는 사용자.

## Problem

기존 Playground는 사용자가 포털을 직접 열고 앱을 선택해야 한다. 또한 일반 웹은 로컬 프로그램 실행과 항상 위에 떠 있는 캐릭터 UI를 자연스럽게 제공할 수 없다.

## MVP Workflow

1. 사용자가 Desktop Pet을 실행한다.
2. 캐릭터가 Always On Top 상태로 화면 위에 나타난다.
3. 캐릭터는 설정된 행동 중 랜덤 행동을 한다.
4. 사용자는 캐릭터를 드래그해서 위치를 바꾼다.
5. `/` 입력 시 명령 팔레트가 열린다.
6. 사용자는 `/code`, `/sleep` 등의 명령을 실행한다.
7. 사용자는 설정 파일과 assets 폴더를 보고 자신의 행동 이미지/명령어를 추가한다.

## Non-goals for MVP

- AI 대화
- 클라우드 동기화
- Live2D/Spine 리깅
- 마켓/캐릭터 공유
- macOS/Linux 지원

## Stack

- .NET 8 + WPF
- 로컬 JSON 설정
- 사용자 이미지/음원은 `%APPDATA%/PlaygroundDesktopPet`

WPF를 선택한 이유는 Windows에서 투명 창, Always On Top, 로컬 프로그램 실행, 전역 입력 감지 등 브라우저에서 제한되는 기능을 직접 구현해야 하기 때문이다.

## Persistence

MVP는 개인용 단일 기기 도구이므로 서버가 필요하지 않다. 설정과 assets는 로컬에 저장한다.

## Required User Inputs

프로그램 실행 자체에는 필수 입력이 없다. 실제 캐릭터를 사용하려면 사용자가 상태별 투명 PNG를 준비해야 한다. MVP 예시에는 이미지가 없어도 확인 가능한 fallback 캐릭터가 들어 있다.

## Error / Empty / Permission States

- 이미지 없음: fallback 캐릭터 사용
- 잘못된 이미지 경로: fallback 캐릭터 사용
- 없는 명령어: 말풍선 오류 표시
- 앱/URL 실행 실패: 말풍선으로 오류 표시
- 잘못된 JSON: 예제 설정으로 fallback

## Production Blockers

- 실제 Windows 환경에서 `dotnet build`, `dotnet run`, publish 검증 필요
- 코드 서명/설치 프로그램 결정 필요
- 전역 `/` 트리거 UX 개선 필요
- 사용자 설정 GUI 필요
- 실제 캐릭터 asset 라이선스 확인 필요
