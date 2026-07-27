# Playground FSD 구조 정리 및 파일별 역할

작성일: 2026-07-27

이 문서는 현재 Playground 저장소를 Feature-Sliced Design(FSD) 기준으로 어떻게 구분할지, 어떤 파일이 어떤 기능을 담당하는지 정리한 문서다.
보안상 `.env`, 실제 토큰, DB 비밀번호, API 키, 개인 계정 값, 빌드 산출물(`dist`, `node_modules`)의 내부 내용은 포함하지 않는다.

## 1. FSD 구분 기준

FSD는 "기술 종류"보다 "비즈니스 의미와 의존 방향"을 기준으로 나눈다.

| 계층 | 기준 | 이 프로젝트에서의 예시 |
|---|---|---|
| `app` | 앱 시작점, 전역 provider, 라우팅, 전역 스타일 연결 | `src/app/main.tsx`, `src/app/App.tsx`, `apps/*/src/main.tsx`, `apps/study-planner/src/app/App.tsx` |
| `pages` | 사용자가 직접 진입하는 화면 단위 | `src/pages/my-page/MyPage.tsx`, 앱별 메인 화면 |
| `widgets` | 여러 feature/entity를 조합한 큰 UI 블록 | 탭 네비게이션, 미니 타이머, 대시보드 패널 |
| `features` | 사용자의 행동 하나를 완성하는 기능 | 공부 타이머 시작/정지, 노트 작성, 그룹 관리, 알림 구독, 매수/매도 |
| `entities` | 도메인 핵심 데이터와 규칙 | 사용자, 과목, 세션, 노트, 프로젝트, 주식 계좌, 친구 |
| `shared` | 도메인 의미가 없는 공용 코드 | API 클라이언트, 시간 포맷, UUID, 색상 유틸, 공용 UI |

의존 방향은 항상 아래 방향만 허용한다.

```txt
app -> pages -> widgets -> features -> entities -> shared
```

예를 들어 `features/timer`는 `entities/session`과 `shared/lib/time`을 사용할 수 있지만, `entities/session`이 `features/timer`를 import하면 안 된다.

## 2. 현재 구조 판단

현재 저장소는 "멀티 앱 모노레포"에 가깝다.

```txt
Playground/
  src/                  루트 포털 React 앱
  apps/                 독립 실행되는 Vite 앱들
  backend/              Spring Boot API 서버
  server/               Express 기반 배포/프록시/인증 보조 서버
  public/               루트 정적 파일, 서비스 워커
  scripts/              운영/동기화 스크립트
  baekjoonhub-.../      백준허브 웹훅 도구
```

이미 `apps/study-planner`는 FSD 형태가 어느 정도 적용되어 있다. 다른 앱들은 대부분 `App.tsx` 중심 구조라서, 다음 리팩터링 대상은 `todo`, `day-schedule`, `focus-room`, `mock-invest`, `dev-action-hub` 순서가 적합하다.

## 3. 권장 목표 구조

루트 포털:

```txt
src/
  app/
    App.tsx
    main.tsx
    styles.css
  pages/
    home/
    my-page/
    github/
    friends/
  widgets/
    app-grid/
    notice-board/
    auth-panel/
  features/
    app-favorite/
    feature-request/
    notice-create/
    github-status/
    push-subscription/
  entities/
    app-item/
    user/
    notice/
  shared/
    api/
    lib/
    ui/
```

독립 앱:

```txt
apps/{app-name}/src/
  app/
  pages/
  widgets/
  features/
  entities/
  shared/
```

백엔드:

현재 Java 백엔드는 이미 도메인 기준 구조다.

```txt
backend/src/main/java/com/playground/
  config/
  domain/
    actionnotifier/
    codinglog/
    devhub/
    devnotes/
    feature/
    friend/
    mockinvest/
    notice/
    notification/
    study/
    user/
```

백엔드는 FSD보다 DDD/Layered Architecture 기준으로 유지하는 것이 맞다.

## 4. 루트 포털 파일별 역할

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/app/main.tsx` | `app` | React 루트 마운트. 전역 다크 테마 고정. |
| `src/app/App.tsx` | 현재 `app + pages + widgets + features` 혼재 | 앱 카드 목록, 즐겨찾기, 로그인 상태, 공지, 기능 요청, GitHub 관리 화면 전환을 담당. 분리 1순위. |
| `src/app/styles.css` | `app/styles` | 루트 포털 전역 스타일과 다크 토큰. |
| `src/pages/my-page/MyPage.tsx` | `pages/my-page` | 내 정보/계정 관련 페이지 UI. |
| `src/shared/api/auth.ts` | `shared/api` 또는 `entities/user/api` | 인증 토큰 만료 시간 계산 및 인증 관련 API 보조 로직. |
| `src/features/push-subscription/api/push.ts` | `features/push-subscription/api` | 웹 푸시 구독 등록 처리. |
| `public/sw.js` | `app/service-worker` | 브라우저 푸시 알림 수신 서비스 워커. |
| `index.html` | `app` | Vite HTML 엔트리. |
| `vite.config.ts` | 설정 | 루트 포털 빌드 설정. |
| `tsconfig.json` | 설정 | TypeScript 컴파일 설정. |
| `package.json` | 설정 | 루트 포털, Express 서버, 전체 앱 빌드 스크립트. |
| `ecosystem.config.js` | 운영 설정 | PM2 실행 설정. 민감 값은 문서화하지 않음. |
| `restart_production.sh` | 운영 스크립트 | 배포/재시작 보조 스크립트. |

## 5. 앱별 파일 구조와 기능

### `apps/study-planner`

현재 가장 FSD에 가깝게 정리되어 있는 앱이다.

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/app/App.tsx` | `app` | 스터디 플래너 전체 상태와 화면 조합. |
| `src/app/App.css` | `app/styles` | 앱 단위 스타일. |
| `src/index.css` | `app/styles` | 전역 스타일 토큰. |
| `src/features/timer/ui/Timer.tsx` | `features/timer` | 공부 타이머 UI와 동작. |
| `src/features/notes/ui/Notes.tsx` | `features/notes` | 공부 노트 작성/조회 UI. |
| `src/features/calendar/ui/CalendarView.tsx` | `features/calendar` | 공부 기록 달력/히트맵 화면. |
| `src/features/stats/ui/Stats.tsx` | `features/stats` | 공부 통계 화면. |
| `src/features/subjects/ui/Subjects.tsx` | `features/subjects` | 과목 생성/수정/삭제 UI. |
| `src/features/group/ui/Group.tsx` | `features/group` | 스터디 그룹 관련 UI. |
| `src/widgets/tab-nav/TabNav.tsx` | `widgets/tab-nav` | 주요 탭 네비게이션. |
| `src/widgets/mini-timer/MiniTimer.tsx` | `widgets/mini-timer` | 축약 타이머 위젯. |
| `src/widgets/stop-modal/StopModal.tsx` | `widgets/stop-modal` | 타이머 종료 확인/입력 모달. |
| `src/entities/subject/model/types.ts` | `entities/subject` | 과목 타입 정의. |
| `src/entities/subject/model/storage.ts` | `entities/subject` | 과목 로컬 저장소 로직. |
| `src/entities/session/model/types.ts` | `entities/session` | 공부 세션 타입 정의. |
| `src/entities/session/model/storage.ts` | `entities/session` | 공부 세션 저장/조회 로직. |
| `src/entities/session/model/selectors.ts` | `entities/session` | 세션 데이터 파생 계산. |
| `src/entities/note/model/types.ts` | `entities/note` | 노트 타입 정의. |
| `src/entities/note/model/storage.ts` | `entities/note` | 노트 저장/조회 로직. |
| `src/shared/lib/api.ts` | `shared/api` | API 요청 공용 함수. |
| `src/shared/lib/time.ts` | `shared/lib` | 시간 계산/포맷 유틸. |
| `src/shared/lib/uuid.ts` | `shared/lib` | UUID 생성 유틸. |
| `src/shared/lib/colors.ts` | `shared/lib` | 색상 관련 유틸. |
| `src/shared/lib/notification.ts` | `shared/lib` | 브라우저 알림 보조 로직. |
| `src/shared/lib/useAuth.ts` | `shared/lib` 또는 `entities/user` | 사용자 인증 상태 조회 훅. |
| `src/shared/model/types.ts` | `shared/model` | 여러 기능에서 공유하는 타입. |
| `public/icons.svg`, `public/favicon.svg` | 정적 자산 | 앱 아이콘. |

### `apps/focus-room`

몰입형 360도 공부 공간 앱이다.

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/App.tsx` | 현재 `app + pages + features` 혼재 | 장소 선택, 몰입 공간 상태, 노트북 내부 학습 화면 진입을 조합. |
| `src/PanoramaViewer.tsx` | `widgets/panorama-viewer` | 360도 파노라마 렌더링과 시점 회전 UI. |
| `src/style.css` | `app/styles` | 몰입 공간, 장소 선택, 노트북 화면 스타일. |
| `src/assets/*-panorama.png` | `shared/assets` | 장소별 파노라마 이미지. 스터디카페, 교실, 카페, 도서관, 야간 독서실, 공원, 기차, 빗소리 카페. |
| `src/vite-env.d.ts` | 설정 | Vite 타입 보조. |

권장 분리:

```txt
features/place-select/
features/desk-customize/
widgets/panorama-viewer/
widgets/laptop-screen/
entities/place/
shared/assets/panoramas/
```

### `apps/todo`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/App.tsx` | 현재 `pages + features` 혼재 | 오늘 할 일 생성, 체크, 삭제, 완료 상태 관리. |
| `src/style.css` | `app/styles` | Todo 앱 스타일. |
| `src/vite-env.d.ts` | 설정 | Vite 타입 보조. |

권장 분리: `entities/todo`, `features/todo-create`, `features/todo-toggle`, `features/todo-delete`, `widgets/todo-list`.

### `apps/day-schedule`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/App.tsx` | 현재 `pages + features` 혼재 | 하루 일정 생성, 시간 중복 검증, 일/주 시간표 표시. |
| `src/style.css` | `app/styles` | 원형/시간표 UI 스타일. |
| `src/vite-env.d.ts` | 설정 | Vite 타입 보조. |

권장 분리: `entities/schedule-event`, `features/event-create`, `features/event-conflict-check`, `widgets/day-timeline`, `widgets/week-timetable`.

### `apps/dev-notes`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/App.tsx` | `app` | 프로젝트 목록/상세 화면 라우팅. |
| `src/pages/ProjectList.tsx` | `pages/project-list` | 프로젝트 목록 화면. |
| `src/pages/ProjectDetail.tsx` | `pages/project-detail` | 프로젝트 상세 화면과 탭 조합. |
| `src/pages/tabs/ProjectOverview.tsx` | `features/project-overview` | 프로젝트 개요 편집/표시. |
| `src/pages/tabs/FeatureSpec.tsx` | `features/feature-spec` | 기능 명세 작성/관리. |
| `src/pages/tabs/ApiSpec.tsx` | `features/api-spec` | API 명세 작성/관리. |
| `src/pages/tabs/UserAnalysis.tsx` | `features/user-analysis` | 사용자 분석 정보 작성/관리. |
| `src/api/projectApi.ts` | `entities/project/api` | 프로젝트 API 요청 함수. |
| `src/storage.ts` | `entities/project/model` 또는 `shared/lib` | 로컬 저장소 보조 로직. |
| `src/types.ts` | `entities/project/model` | 프로젝트 관련 타입. |
| `src/utils/uuid.ts` | `shared/lib` | UUID 생성. |
| `src/hooks/useAuth.ts` | `entities/user` | 인증 상태 조회 훅. |
| `src/components/ConfirmModal.tsx` | `shared/ui` | 확인 모달. |
| `src/components/StudyTimerBadge.tsx` | `widgets/study-timer-badge` | 공부 타이머 상태 뱃지. |
| `src/index.css`, `src/App.css` | `app/styles` | 전역/앱 스타일. |

### `apps/dev-action-hub`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/push.ts` | `features/push-subscription` | 푸시 알림 구독/등록 로직. |
| `src/styles.css` | `app/styles` | Discord형 개발 허브 레이아웃과 패널 스타일. |

참고: 이 앱은 메인 기능 코드가 `main.tsx`에 크게 모여 있을 가능성이 높다. `features/actions`, `features/discord-webhook`, `features/devhub-chat`, `widgets/server-rail`, `widgets/channel-sidebar`, `widgets/workspace-panel`로 분리하는 것이 좋다.

### `apps/life-tracker`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트, 다크 테마 고정. |
| `src/App.tsx` | 현재 `app + pages + widgets` 혼재 | 실패 기록, 버린 시간, 작은 성취 화면 조합. |
| `src/components/FailureLog.tsx` | `features/failure-log` | 실패 기록 작성/조회. |
| `src/components/WastedTime.tsx` | `features/wasted-time` | 낭비 시간 기록/조회. |
| `src/components/SmallWins.tsx` | `features/small-wins` | 작은 성취 기록/조회. |
| `src/components/TabNav.tsx` | `widgets/tab-nav` | 탭 전환 UI. |
| `src/components/DateFilter.tsx` | `features/date-filter` | 날짜 필터 UI. |
| `src/components/EmojiPicker.tsx` | `shared/ui` | 이모지 선택 UI. |
| `src/components/ConfirmModal.tsx` | `shared/ui` | 확인 모달. |
| `src/components/StudyTimerBadge.tsx` | `widgets/study-timer-badge` | 공부 타이머 상태 뱃지. |
| `src/hooks/useAuth.ts` | `entities/user` | 인증 상태 조회. |
| `src/storage.ts` | `entities/life-log/model` | 로컬 저장소 로직. |
| `src/types.ts` | `entities/life-log/model` | 기록 타입 정의. |
| `src/index.css`, `src/App.css` | `app/styles` | 스타일. |

### `apps/cornell-notes`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트. |
| `src/App.tsx` | 현재 `pages + features` 혼재 | 코넬 노트 작성/목록/상세 UI. |
| `src/StudyTimerBadge.tsx` | `widgets/study-timer-badge` | 공부 타이머 뱃지. |
| `src/useAuth.ts` | `entities/user` | 인증 상태 조회. |
| `src/storage.ts` | `entities/cornell-note/model` | 노트 저장/조회 로직. |
| `src/types.ts` | `entities/cornell-note/model` | 노트 타입 정의. |
| `src/index.css` | `app/styles` | 스타일. |

### `apps/coding-log`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트. |
| `src/App.tsx` | 현재 `pages + features` 혼재 | 코딩 문제 풀이 기록, 목록, 검색/필터, 작성 UI. |
| `src/useAuth.ts` | `entities/user` | 인증 상태 조회. |
| `src/storage.ts` | `entities/coding-log/model` | 풀이 기록 저장/조회. |
| `src/types.ts` | `entities/coding-log/model` | 풀이 기록 타입. |
| `src/index.css` | `app/styles` | 스타일. |

### `apps/school-meal`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트. |
| `src/App.tsx` | 현재 `pages + features` 혼재 | 학교 급식/시간표 조회 화면. |
| `src/index.css` | `app/styles` | 스타일. |

### `apps/mock-invest`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 앱 마운트. |
| `src/App.tsx` | 현재 `pages + features + entities` 혼재 | 모의 투자 계좌, 종목, 주문, 포트폴리오, 관심종목 UI. |
| `src/index.css` | `app/styles` | 투자 대시보드 스타일. |

권장 분리: `entities/account`, `entities/holding`, `entities/order`, `entities/watchlist`, `features/buy-stock`, `features/sell-stock`, `features/price-alert`, `widgets/portfolio-summary`.

### `apps/action-notifier`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | GitHub Actions 알림 앱의 전체 UI와 로직. |
| `src/styles.css` | `app/styles` | 알림 앱 스타일. |
| `public/sw.js` | `app/service-worker` | 알림 수신 서비스 워커. |

권장 분리: `features/watch-repository`, `features/action-notification`, `entities/repository-watch`, `shared/api`.

### `apps/code-run-visualizer`

| 파일 | FSD 분류 | 역할 |
|---|---|---|
| `src/main.tsx` | `app` | 코드 실행 시각화 UI와 상태 관리. |
| `src/styles.css` | `app/styles` | 코드/실행 단계/시각화 스타일. |

권장 분리: `features/code-run`, `features/step-visualize`, `entities/execution-step`, `widgets/code-editor`, `widgets/execution-timeline`.

## 6. 브라우저 확장 프로그램 파일

### `apps/school-meal-extension`

| 파일 | 역할 |
|---|---|
| `manifest.json` | 확장 프로그램 권한, 엔트리, 메타데이터. 민감 토큰 없음. |
| `background.js` | 백그라운드 이벤트 처리. |
| `popup.html`, `popup.css`, `popup.js` | 확장 팝업 UI와 동작. |
| `options.html`, `options.css`, `options.js` | 설정 페이지 UI와 저장 로직. |
| `icons/icon.svg` | 확장 아이콘. |
| `package-webstore.ps1` | 웹스토어 패키징 스크립트. |
| `README.md`, `WEBSTORE.md` | 사용/배포 설명. |

### `apps/mock-invest-extension`

| 파일 | 역할 |
|---|---|
| `manifest.json` | 확장 프로그램 설정. |
| `popup.html`, `popup.css`, `popup.js` | 팝업 UI와 동작. |
| `options.html`, `options.css`, `options.js` | 설정 화면. |
| `icons/icon.svg` | 확장 아이콘. |
| `package-webstore.ps1` | 패키징 스크립트. |
| `README.md` | 설명 문서. |

## 7. 백엔드 파일별 역할

공통 설정:

| 파일 | 역할 |
|---|---|
| `backend/src/main/java/com/playground/PlaygroundApplication.java` | Spring Boot 애플리케이션 엔트리. |
| `backend/src/main/java/com/playground/config/SecurityConfig.java` | Spring Security 설정. |
| `backend/src/main/java/com/playground/config/AuthController.java` | 인증 관련 컨트롤러. |
| `backend/src/main/java/com/playground/config/JwtUtil.java` | JWT 생성/검증 유틸. 실제 secret 값은 문서화하지 않음. |
| `backend/src/main/java/com/playground/config/JwtAuthFilter.java` | 요청에서 JWT 인증 처리. |
| `backend/src/main/java/com/playground/config/JwtAuthenticationToken.java` | 인증 토큰 객체. |
| `backend/src/main/resources/application.yml` | DB/API 설정 파일. 보안상 값은 문서에 포함하지 않음. |

도메인별 기준:

| 도메인 | controller | service | repository | entity | dto | 기능 |
|---|---|---|---|---|---|---|
| `user` | - | - | `UserRepository` | `User` | - | 사용자 계정 데이터. |
| `study` | `StudyController`, `StudyGroupController` | `StudyService`, `StudyGroupService` | `SubjectRepository`, `StudySessionRepository`, `StudyGroupRepository`, `StudyGroupMemberRepository`, `DailyGoalRepository` | `Subject`, `StudySession`, `StudyGroup`, `StudyGroupMember`, `DailyGoal` | `StudyDto` | 과목, 공부 세션, 일일 목표, 스터디 그룹. |
| `devnotes` | `ProjectController` | `ProjectService` | `ProjectRepository`, `ProjectShareRepository` | `Project`, `ProjectShare`, `ApiSpec`, `FeatureSpec`, `UserAnalysis` | `ProjectDto` | 프로젝트 문서, 명세, 공유. |
| `devhub` | `DevHubController` | `DevHubService` | `DevHubServerRepository`, `DevHubServerMemberRepository`, `DevHubChatMessageRepository`, `DevHubDirectMessageRepository` | `DevHubServer`, `DevHubServerMember`, `DevHubChatMessage`, `DevHubDirectMessage` | `DevHubDto` | 개발자 허브 서버/채팅/DM. |
| `codinglog` | `CodingLogController`, `CodingLogSocialController` | `CodingLogService` | `CodingLogRepository`, `CodingLogLikeRepository`, `CodingLogCommentRepository` | `CodingLog`, `CodingLogLike`, `CodingLogComment` | `CodingLogDto` | 코딩 문제 풀이 기록, 좋아요, 댓글. |
| `mockinvest` | `MockInvestController` | `MockInvestService`, `MockInvestPriceAlertService`, `TwelveDataStockClient`, `StockProviderException` | `MockInvestAccountRepository`, `MockInvestHoldingRepository`, `MockInvestOrderRepository`, `MockInvestJournalRepository`, `MockInvestRewardRepository`, `MockInvestStockRequestRepository`, `MockInvestWatchlistRepository`, `MockInvestPriceAlertStateRepository` | `MockInvestAccount`, `MockInvestHolding`, `MockInvestOrder`, `MockInvestJournal`, `MockInvestReward`, `MockInvestStockRequest`, `MockInvestWatchlist`, `MockInvestPriceAlertState` | `MockInvestDto` | 모의 투자 계좌, 주문, 보유 종목, 관심종목, 가격 알림. |
| `actionnotifier` | `ActionNotifierController` | `ActionNotifierService`, `GitHubActionsClient` | `ActionRepositoryWatchRepository` | `ActionRepositoryWatch` | `ActionNotifierDto` | GitHub Actions 감시와 알림. |
| `notification` | `PushController` | - | `PushSubscriptionRepository` | `PushSubscription` | - | 웹 푸시 구독 저장. |
| `feature` | `FeatureRequestController` | `FeatureRequestService` | `FeatureRequestRepository` | `FeatureRequest` | `FeatureRequestDto` | 사용자 기능 요청. |
| `notice` | `NoticeController` | `NoticeService` | `NoticeRepository` | `Notice` | `NoticeDto` | 공지사항. |
| `friend` | `FriendController` | `FriendService` | `FriendshipRepository` | `Friendship` | `FriendDto` | 친구 관계. |

## 8. Node 서버와 스크립트

| 파일 | 역할 |
|---|---|
| `server/index.js` | Express 기반 서버. 정적 앱 서빙, 인증/프록시/운영 API를 담당할 가능성이 큼. 민감한 환경 변수 값은 문서화하지 않음. |
| `scripts/notion-sync.js` | Notion 연동/동기화 스크립트. API 키 등은 환경 변수로 관리해야 함. |
| `baekjoonhub-playground-webhook/scripts/baekjoonhub-webhook.mjs` | 백준허브 push 이벤트를 처리하는 웹훅 스크립트. |
| `baekjoonhub-playground-webhook/examples/push-event.sample.json` | 웹훅 테스트용 샘플 이벤트. |
| `baekjoonhub-playground-webhook/README.md` | 웹훅 사용 설명. |

## 9. 리팩터링 우선순위

1. 루트 `src/app/App.tsx` 분리
   - `entities/app-item`
   - `entities/user`
   - `entities/notice`
   - `features/app-favorite`
   - `features/feature-request`
   - `widgets/app-grid`
   - `widgets/notice-board`

2. 작은 앱부터 FSD 적용
   - `todo`, `day-schedule`는 파일 수가 작아서 리팩터링 리스크가 낮다.

3. `focus-room` 분리
   - 파노라마 뷰어, 장소 선택, 노트북 화면을 분리하면 추후 노트북 내부 기능 추가가 쉬워진다.

4. 데이터가 많은 앱 분리
   - `mock-invest`, `dev-action-hub`는 기능이 많으므로 먼저 타입/엔티티를 빼고, 이후 feature 단위로 나눈다.

5. 백엔드는 현재 구조 유지
   - 이미 도메인별로 나뉘어 있으므로, controller/service/repository/entity/dto 규칙만 계속 지키면 된다.

## 10. 보안 기준

문서나 커밋에 포함하면 안 되는 것:

- `.env` 실제 값
- JWT secret
- GitHub token
- Notion token
- DB URL, DB 계정, DB 비밀번호
- 웹푸시 VAPID private key
- 외부 API key
- 개인 계정, 세션 쿠키, refresh token
- 실제 운영 서버 IP/접속 정보

문서화해도 되는 것:

- 파일 경로
- 파일의 책임과 기능
- 공개된 패키지 이름
- FSD 목표 구조
- 민감 값이 제거된 설정 설명

## 11. 다음 실제 코드 정리 권장안

바로 다음 커밋에서 하면 좋은 작업은 루트 포털의 `src/app/App.tsx` 추가 분리다.

추천 순서:

```txt
1. APPS 배열 -> src/entities/app-item/model/apps.ts
2. AppItem/User/Notice 타입 -> entities/*/model/types.ts
3. 즐겨찾기 로직 -> features/app-favorite/model/storage.ts
4. 공지 API -> entities/notice/api/noticeApi.ts
5. 기능 요청 API -> features/feature-request/api/featureRequestApi.ts
6. 앱 카드 그리드 UI -> widgets/app-grid/AppGrid.tsx
7. 공지 UI -> widgets/notice-board/NoticeBoard.tsx
```

이 순서로 하면 동작을 거의 유지하면서 파일 구조만 안정적으로 나눌 수 있다.
