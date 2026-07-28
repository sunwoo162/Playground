# 프로젝트별 폴더 구분 및 FSD 기준

작성일: 2026-07-27

이 저장소는 여러 프로젝트가 한 저장소에 들어있는 모노레포 형태다. 최상위 폴더는 프로젝트 경계를 의미하고, 각 프론트엔드 프로젝트 내부는 FSD 기준으로 나눈다.

## 1. 최상위 프로젝트 경계

| 폴더 | 프로젝트 | 기준 |
|---|---|---|
| `src/` | 놀이터 포털 | 여러 앱으로 이동하는 메인 React 포털 |
| `apps/study-planner/` | 스터디 플래너 | 독립 실행되는 공부 관리 앱 |
| `apps/focus-room/` | 몰입형 가상 면학석 | 360도 공부 공간 앱 |
| `apps/todo/` | Todo | 오늘 할 일 관리 앱 |
| `apps/day-schedule/` | 하루 시간표 | 하루/주간 일정 관리 앱 |
| `apps/dev-notes/` | 개발자 노트 | 프로젝트 문서/명세 관리 앱 |
| `apps/dev-action-hub/` | 개발 액션 허브 | 개발 알림/문서/채팅형 작업 허브 |
| `apps/life-tracker/` | Life Tracker | 실패/낭비시간/성취 기록 앱 |
| `apps/cornell-notes/` | 코넬 노트 | 학습 노트 앱 |
| `apps/coding-log/` | 코테 일지 | 알고리즘 풀이 기록 앱 |
| `apps/school-meal/` | 학교 알리미 | 급식/시간표 조회 앱 |
| `apps/mock-invest/` | 모의 투자 | 가상 주식 투자 앱 |
| `apps/action-notifier/` | Action 알리미 | GitHub Actions 알림 앱 |
| `apps/code-run-visualizer/` | 코드 실행 시각화 | 코드 실행 흐름 시각화 앱 |
| `apps/voice-phishing/` | 보이스피싱 체험 | 전화 수신/피해 상황을 재현하는 보안 교육 앱 |
| `apps/*-extension/` | 브라우저 확장 | Chrome 확장 프로그램 |
| `backend/` | Spring Boot API | 서버 도메인/API 프로젝트 |
| `server/` | Express 서버 | 정적 서빙, OAuth, 프록시, 운영 보조 서버 |
| `scripts/` | 운영 스크립트 | Notion 동기화 등 운영 도구 |
| `public/` | 포털 정적 페이지 | 포털에서 바로 여는 안내/정적 파일 |

## 2. 프론트엔드 FSD 계층 기준

의존 방향:

```txt
app -> pages -> widgets -> features -> entities -> shared
```

| 계층 | 넣는 기준 |
|---|---|
| `app/` | 앱 엔트리, 최상위 App, 전역 스타일, provider, 라우팅 |
| `pages/` | 사용자가 직접 진입하는 화면 |
| `widgets/` | 여러 feature/entity를 조합한 큰 화면 블록 |
| `features/` | 사용자의 행동 하나를 완성하는 기능 |
| `entities/` | 도메인 데이터 타입, 저장소, 핵심 규칙 |
| `shared/` | 도메인 의미 없는 공용 API, UI, 유틸 |

## 3. 현재 적용된 루트 포털 구조

```txt
src/
  app/
    main.tsx
    App.tsx
    styles.css
  entities/
    app-item/
    github-status/
    notice/
    user/
  pages/
    my-page/
      MyPage.tsx
  features/
    app-favorite/
    push-subscription/
    study-timer-badge/
      api/
        push.ts
  shared/
    api/
      auth.ts
```

### 분리 기준

- `src/app/main.tsx`: React 마운트와 전역 초기화만 담당한다.
- `src/app/App.tsx`: 포털 화면 조립을 담당한다. 앱 목록, 주요 타입, 즐겨찾기 저장소, 스터디 타이머 유틸은 entities/features로 분리했다.
- `src/entities/app-item/model/apps.ts`: 놀이터에 표시되는 독립 웹앱 목록이다.
- `src/entities/app-item/model/types.ts`: 앱 카드 타입이다.
- `src/entities/user/model/types.ts`: 로그인 사용자 타입이다.
- `src/entities/notice/model/types.ts`: 공지사항 타입이다.
- `src/entities/github-status/model/types.ts`: 로컬 GitHub 상태 타입이다.
- `src/features/app-favorite/model/storage.ts`: 앱 즐겨찾기 localStorage 저장 로직이다.
- `src/features/study-timer-badge/model/timer.ts`: 스터디 플래너 타이머 뱃지 복원/포맷 로직이다.
- `src/pages/my-page/MyPage.tsx`: 사용자가 직접 보는 마이페이지 화면이다.
- `src/features/push-subscription/api/push.ts`: 푸시 구독 등록이라는 사용자 기능에 속한다.
- `src/shared/api/auth.ts`: 인증 토큰 시간 계산처럼 여러 화면에서 재사용 가능한 API 보조 로직이다.

## 4. 다음 분리 순서

루트 포털 `src/app/App.tsx`는 아직 기능이 많이 섞여 있으므로 다음 순서로 쪼개는 것이 안전하다.

```txt
1. APPS 배열과 AppItem 타입 -> src/entities/app-item/
2. 즐겨찾기 저장 로직 -> src/features/app-favorite/
3. 공지 조회/작성 로직 -> src/entities/notice/ + src/features/notice-create/
4. 기능 요청 로직 -> src/features/feature-request/
5. 앱 카드 그리드 -> src/widgets/app-grid/
6. 공지 영역 -> src/widgets/notice-board/
7. 헤더/인증 상태 표시 -> src/widgets/app-header/
```

큰 앱은 한 번에 전부 옮기지 않고, 빌드 가능한 단위로 한 기능씩 이동한다.

## 5. 백엔드 기준

`backend/`는 프론트엔드 FSD가 아니라 도메인 기반 Layered Architecture를 유지한다.

```txt
backend/src/main/java/com/playground/
  config/
  domain/
    {domain}/
      controller/
      service/
      repository/
      entity/
      dto/
```

백엔드에서는 `study`, `devnotes`, `mockinvest`, `friend`처럼 비즈니스 도메인 기준으로 나누는 것이 맞다.
