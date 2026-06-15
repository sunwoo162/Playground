# 📅 스터디 플래너

공부 시간을 기록하고 성장을 추적하는 웹앱.

## 기능

- ⏱️ **과목별 타이머** — 과목 선택 후 시작/종료, 탭 전환해도 타이머 유지
- 🔔 **알림** — 1시간마다 브라우저 알림 발송
- 📊 **통계** — 총 공부 시간, 🔥 연속 일수, 주간 바 차트, 과목별 누적 시간
- 📅 **달력 히트맵** — 월별 공부량을 색상으로 시각화, 날짜 클릭 시 상세 기록
- 📚 **과목 관리** — 과목 추가/수정/삭제, 색상 선택, 하루 목표 시간 설정
- 🎯 **목표 달성률** — 오늘 목표 대비 진행률 실시간 표시

## 기술 스택

- React 19 + TypeScript
- Vite
- LocalStorage (서버 없이 데이터 저장)

## 아키텍처: FSD (Feature-Sliced Design)

레이어 간 의존성은 단방향으로만 흐른다: `app → widgets → features → entities → shared`

```
src/
├── app/                        # 앱 초기화, 전역 타이머 상태 관리
│   ├── App.tsx
│   └── App.css
│
├── widgets/                    # 독립적인 UI 블록 (여러 feature 조합)
│   ├── tab-nav/                # 하단 탭 네비게이션
│   │   ├── TabNav.tsx
│   │   └── index.ts
│   └── mini-timer/             # 헤더 미니 타이머 (타이머 실행 중 표시)
│       ├── MiniTimer.tsx
│       └── index.ts
│
├── features/                   # 비즈니스 기능 단위
│   ├── timer/
│   │   └── ui/Timer.tsx        # 타이머 UI (과목 선택, 시작/종료, 진행률)
│   ├── stats/
│   │   └── ui/Stats.tsx        # 통계 UI (주간 차트, 과목별 누적, 최근 기록)
│   ├── calendar/
│   │   └── ui/CalendarView.tsx # 달력 히트맵 UI
│   └── subjects/
│       └── ui/Subjects.tsx     # 과목 관리 UI
│
├── entities/                   # 도메인 모델 및 데이터 접근
│   ├── session/
│   │   ├── model/
│   │   │   ├── types.ts        # StudySession 타입 정의
│   │   │   ├── storage.ts      # LocalStorage CRUD
│   │   │   └── selectors.ts    # getTotalSecondsByDate, getStreak, getWeekStudyDays 등
│   │   └── index.ts
│   └── subject/
│       ├── model/
│       │   ├── types.ts        # Subject, DailyGoal 타입 정의
│       │   └── storage.ts      # LocalStorage CRUD + getDailyGoal
│       └── index.ts
│
├── shared/                     # 프로젝트 전반에서 사용하는 공통 코드
│   ├── lib/
│   │   ├── time.ts             # formatDuration, formatTimer, getTodayStr, getMonthDates 등
│   │   ├── colors.ts           # SUBJECT_COLORS 팔레트
│   │   ├── notification.ts     # 브라우저 알림 권한 요청 및 발송
│   │   └── index.ts
│   └── model/
│       └── types.ts            # TabType (공유 타입)
│
├── index.css                   # 전역 CSS 변수 및 베이스 스타일
└── main.tsx                    # 앱 진입점
```

## 실행

```bash
# 의존성 설치
npm install

# 개발 서버
npm run dev

# 빌드
npm run build
```

## 데이터 저장

모든 데이터는 브라우저 LocalStorage에 저장된다.

| 키 | 내용 |
|----|------|
| `study-planner-sessions` | 공부 세션 기록 (초 단위) |
| `study-planner-subjects` | 과목 목록 |
| `study-planner-goal` | 하루 목표 시간 |
