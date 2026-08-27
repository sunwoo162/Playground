# 버리데이(Beriday) Product Design

- Date: 2026-08-27
- Team: 벚꽃 (`cherry-blossom`)
- Status: approved product direction, pre-implementation
- Internal slug: `beriday`
- Working product name: `버리데이`
- Product class: public-data-based household waste schedule and disposal guidance web app

> `버리데이`는 개발용 작업명이다. 공개 출시 전 동일·유사 상표/서비스명 확인을 다시 수행하고, 충돌 가능성이 있으면 브랜드명만 교체한다. 내부 slug와 데이터 모델은 브랜드명에 결합하지 않는다.

## 1. Product summary

버리데이는 사용자가 직접 선택한 행정구역을 기준으로 **오늘 무엇을 언제 배출할 수 있는지**를 빠르게 알려주는 생활 도구다.

핵심 질문은 하나다.

> 그래서 오늘 밤에 뭘 버릴 수 있는데?

서비스는 폐기물을 직접 수거·운반·처리하거나 수거업체를 중개하지 않는다. 공공데이터를 정규화하고 날짜/시간 규칙을 계산해 사용자에게 안내한다.

## 2. Target users

### Primary

- 원룸, 기숙사, 자취방, 오피스텔 등에 거주하며 지역별 배출 규칙을 자주 확인해야 하는 사용자
- 이사 후 새 지역의 배출 요일과 방법에 익숙하지 않은 사용자
- 분리배출 품목은 알지만 해당 지역의 실제 배출 가능 날짜를 모르는 사용자

### Secondary

- 가족의 쓰레기 배출 일정을 대신 확인하는 사용자
- 여러 지역의 배출 규칙을 비교하거나 관리해야 하는 사용자

## 3. Job to be done

사용자는 쓰레기를 버리기 전에 지자체 페이지나 검색 결과를 다시 찾아보지 않고, 저장된 지역에서 오늘 배출 가능한 품목과 시간을 5초 안에 확인할 수 있어야 한다.

## 4. Product principles

1. **Today first**: 첫 화면은 지도가 아니라 오늘 배출 가능 여부를 보여준다.
2. **Official evidence first**: 각 지역 규칙에는 출처, 기준일 또는 수집시점, 담당기관 정보를 연결한다.
3. **No fabricated certainty**: 원본 데이터가 모호하거나 서로 충돌하면 확정 답변처럼 표시하지 않는다.
4. **Minimal personal data**: MVP는 GPS와 상세 주소를 사용하지 않는다.
5. **Information service only**: 직접 수거, 결제, 폐기물 처리, 수거업체 중개를 하지 않는다.
6. **No account required**: 로그인 없이 핵심 기능이 완성되어야 한다.
7. **Deterministic build**: 사용자 브라우저가 원본 공공데이터를 직접 파싱하지 않는다. 검증 완료된 normalized artifact만 앱이 소비한다.

## 5. MVP scope

### 5.1 Region setup

사용자는 다음 3단계로 지역을 직접 선택한다.

- 시/도
- 시/군/구
- 관리구역 또는 행정동

공공데이터의 `관리구역`이 행정동과 정확히 일치하지 않는 경우 앱은 임의로 행정동으로 바꾸지 않고 원본 관리구역 이름을 표시한다.

선택 결과는 브라우저 LocalStorage에 저장한다.

MVP에서는 다음을 사용하지 않는다.

- GPS/geolocation
- 도로명 상세 주소
- 건물명
- 동·호수
- 서버 기반 위치 이력

### 5.2 Today view

홈 화면은 현재 날짜와 선택 지역을 기준으로 다음을 표시한다.

- 생활쓰레기 배출 가능 여부
- 음식물쓰레기 배출 가능 여부
- 재활용품 배출 가능 여부
- 배출 시작/종료 시간
- 오늘 불가능한 경우 가장 가까운 다음 배출일
- 미수거일 또는 예외 규칙
- 데이터 출처와 신뢰 상태

상태는 다음 5개로 고정한다.

- `가능`: 현재 배출 가능 시간대
- `예정`: 오늘 배출일이지만 배출 시간이 아직 시작되지 않음
- `마감`: 오늘 배출일이지만 오늘의 배출 시간이 종료됨
- `불가`: 오늘 배출 대상이 아님
- `확인 필요`: 원본 규칙이 불완전하거나 서로 충돌함

### 5.3 Weekly schedule

월요일부터 일요일까지 유형별 배출 가능 여부와 시간대를 한 화면에서 보여준다.

주간 일정은 홈의 Today 계산과 동일한 schedule engine을 사용해야 하며 별도 규칙 구현을 만들지 않는다.

### 5.4 Item disposal search

사용자는 `깨진 유리`, `건전지`, `후라이팬`, `스티로폼`, `옷` 같은 품목을 검색할 수 있다.

검색 결과는 두 레이어를 구분한다.

1. **품목 분리배출 방법**: 품목 자체를 어떻게 분류하고 준비해야 하는지
2. **지역 일정**: 현재 선택 지역에서 해당 분류를 언제 배출할 수 있는지

품목별 처리방법 데이터의 출처가 생활쓰레기 일정 데이터와 다른 경우 UI에서 출처를 분리해 표시한다.

### 5.5 Large waste handling

대형폐기물은 버리데이가 직접 접수하거나 결제하지 않는다.

검색 결과가 대형폐기물에 해당하면 다음을 제공한다.

- 대형폐기물이라는 안내
- 관할 지자체의 공식 신고 절차 안내
- 확인된 공식 신고 페이지로 이동하는 링크

공식 링크를 확인할 수 없는 지역은 링크를 추측하지 않고 담당기관 정보만 제공한다.

### 5.6 Source and freshness view

사용자는 각 Today/Weekly 결과에서 최소 다음 정보를 확인할 수 있어야 한다.

- 데이터 제공기관
- 원본 데이터셋 이름
- 원본 수정일 또는 앱 import 시점
- 담당부서 또는 연락처가 존재하면 해당 정보
- `확인 필요` 상태의 이유

## 6. Explicit non-goals

MVP에서는 다음 기능을 만들지 않는다.

- 폐기물 직접 수거 또는 운반
- 민간 수거업체 자동 배정
- 폐기물 처리 수수료 직접 결제
- 수거업체 중개 수수료 모델
- GPS 기반 현재 위치 자동 탐색
- 정확한 집 주소 저장
- 별도 이메일/비밀번호 회원가입
- AI가 지역 규칙을 생성하거나 추론해 확정 답변으로 제공하는 기능
- 사용자 커뮤니티
- 지도 중심 탐색
- 광고성 푸시
- 사이트가 닫힌 상태에서 동작하는 예약 Web Push

## 7. Post-MVP candidate: reminders

배출일 알림은 사용성 가치가 있지만 MVP 정적 웹 구조에서는 안정적인 예약 Push를 위해 service worker, Push subscription 저장, scheduler/backend가 추가로 필요하다.

따라서 MVP에서는 예약 Push를 구현하지 않는다. 제품 검증 이후 알림을 추가할 경우 다음을 별도 설계한다.

- 익명 Push subscription 저장 여부
- 지역/요일/알림 시간 persistence
- unsubscribe 및 데이터 삭제
- service notification과 marketing consent의 분리
- scheduler 운영/재시도/중복전송 방지

## 8. Legal and privacy boundary

이 설계는 정보 제공 서비스 범위를 유지한다.

### 8.1 Waste-management boundary

버리데이는 폐기물을 물리적으로 수집·운반·처리하지 않는다. 수거업체를 대신 선정하거나 사용자에게 폐기물 처리 대금을 직접 받지 않는다.

향후 직접 수거, 수거 중개, 처리비 결제를 추가하려면 폐기물관리법상 허가·신고 및 관련 거래 규제를 별도 검토한 뒤 새로운 제품 설계 승인을 받아야 한다.

### 8.2 Public data boundary

핵심 일정 데이터는 공공데이터포털의 행정안전부 생활쓰레기배출정보를 우선 사용한다.

- Data portal page: `https://www.data.go.kr/data/15075534/fileData.do`
- Checked on: 2026-08-27
- Current public row count observed: 7,398
- Cost: 무료
- Usage scope shown by the portal for the standard/open public data is checked before production ingestion; the importer records the exact source and checked metadata.

지자체 웹 페이지를 별도로 크롤링해야 하는 경우 각 출처의 이용조건과 저작권/공공누리 조건을 확인하기 전에는 production 데이터로 편입하지 않는다.

### 8.3 Location and personal data boundary

MVP는 사용자의 실시간 위치를 측위하지 않는다. 사용자가 직접 고른 행정구역만 LocalStorage에 저장한다.

개인 식별 가능한 상세 주소, GPS 좌표, 이동 이력은 수집하지 않는다.

### 8.4 Brand boundary

`버리데이`는 작업명이다. 공개 도메인/스토어/광고 집행 전 동일·유사 상표와 서비스명 충돌 가능성을 다시 확인한다.

## 9. Data source and freshness

### Primary source

- Provider: 행정안전부 / 공공데이터포털
- Dataset: 생활쓰레기배출정보
- Current public scale checked on 2026-08-27: 7,398 rows
- Update model shown by source: 수시 갱신
- Fields used: 시도, 시군구, 관리구역, 배출장소 유형, 생활/음식물/재활용 배출방법, 배출요일, 배출시간대, 미수거일, 관리부서명, 연락처

### Freshness policy

모든 normalized rule은 다음 provenance를 가진다.

```ts
export type RuleProvenance = {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string | null;
  importedAt: string;
  authorityName: string | null;
  authorityContact: string | null;
};
```

원본이 오래되었거나 기준일을 확인할 수 없는 경우 해당 규칙은 UI에서 `확인 필요` 상태로 표시할 수 있어야 한다.

## 10. Canonical data model

원본 CSV/API schema를 UI가 직접 소비하지 않는다.

```ts
export type RegionId = string;

export type WasteCategory =
  | "general"
  | "food"
  | "recycling"
  | "bulk"
  | "other";

export type Region = {
  id: RegionId;
  sido: string;
  sigungu: string;
  areaName: string;
  displayName: string;
};

export type TimeWindow = {
  start: string | null; // HH:mm
  end: string | null;   // HH:mm; may cross midnight
};

export type CollectionRule = {
  id: string;
  regionId: RegionId;
  category: WasteCategory;
  weekdays: number[]; // 0=Sunday ... 6=Saturday
  timeWindows: TimeWindow[];
  excludedDates: string[];
  instructions: string[];
  confidence: "verified" | "ambiguous";
  provenance: RuleProvenance;
};

export type SavedRegion = {
  regionId: RegionId;
  savedAt: string;
};
```

품목 검색 데이터는 일정 데이터와 분리한다.

```ts
export type DisposalItem = {
  id: string;
  names: string[];
  category: WasteCategory;
  preparation: string[];
  warnings: string[];
  sourceName: string;
  sourceUrl: string;
};
```

## 11. Schedule engine

일정 계산은 UI와 분리된 순수 함수 모듈로 구현한다.

```ts
export type ScheduleStatus =
  | "available"
  | "upcoming"
  | "closed"
  | "unavailable"
  | "needs-verification";

export type ScheduleResult = {
  category: WasteCategory;
  status: ScheduleStatus;
  currentWindow: TimeWindow | null;
  nextAvailableAt: string | null;
  instructions: string[];
  provenance: RuleProvenance[];
};

export function evaluateSchedule(
  rules: CollectionRule[],
  now: Date,
): ScheduleResult[];
```

### Schedule requirements

- 자정을 넘는 시간대(`20:00-02:00`)를 올바르게 처리한다.
- 미수거일은 정규 요일보다 우선한다.
- 동일 category에 충돌하는 규칙이 존재하면 임의로 하나를 선택하지 않는다.
- 현재 시간 이후 오늘 배출이 시작되면 `upcoming`으로 반환한다.
- 오늘 배출 시간이 끝났으면 `closed`와 다음 배출시점을 반환한다.
- 데이터 자체가 불완전하면 `needs-verification`을 반환한다.
- 사용자 로컬 시간대는 `Asia/Seoul`을 기준으로 계산한다.

## 12. Architecture

버리데이는 BloomBouquet 본체에 기능을 직접 추가하지 않는다. 독립적으로 빌드·배포 가능한 repository를 만들고 BloomBouquet에는 제출 URL과 버전을 등록한다.

### 12.1 Runtime

- React
- TypeScript
- Vite
- React Router
- Vitest
- Testing Library
- Playwright
- Static hosting; MVP backend 없음

### 12.2 Data pipeline

```text
Official public dataset
  -> Node fetch/import script
  -> raw snapshot
  -> parser
  -> normalizer
  -> validation report
  -> versioned normalized JSON shards
  -> static web build
  -> region index
  -> schedule engine
  -> Today / Weekly / Search UI
```

원본 파싱과 정규화는 사용자 브라우저에서 수행하지 않는다.

`pnpm data:refresh`가 공식 source를 내려받아 raw snapshot, normalized artifact, validation report를 갱신한다. `pnpm build`는 마지막으로 검증된 normalized artifact만 소비해 deterministic하게 동작한다.

공식 source가 일시적으로 실패했다고 기존 production build가 깨지지 않도록 data refresh와 application build를 분리한다.

### 12.3 Initial persistence

- `SavedRegion`: LocalStorage
- normalized public rules: versioned static application data
- server user database: 없음
- Push subscription database: 없음

로그인 없이 핵심 기능을 완성한다.

## 13. Authentication policy

MVP는 인증이 필요하지 않다.

향후 즐겨찾기 여러 지역, 사용자 설정 동기화, 여러 기기 동기화 등 서버 계정이 필요해지면 BloomBouquet의 꽃다발 인증 정책을 적용한다.

이 경우 별도 이메일/비밀번호 credential store를 만들지 않고 꽃다발 Authorization Code + PKCE 흐름을 사용한다.

## 14. Core screens

### Region onboarding

- 서비스 가치 한 줄 설명
- 시/도 선택
- 시/군/구 선택
- 관리구역/동 선택
- 데이터 가용성 상태
- 저장 후 Today 이동

### Today

- 선택 지역
- 현재 날짜/시간
- 생활쓰레기/음식물/재활용 카드
- 상태, 시간, 다음 배출일
- `이거 어떻게 버리지?` 검색 진입
- 출처/기준 정보

### Weekly

- 7일 일정
- 각 날짜별 category와 시간
- 미수거/예외 표시

### Item search

- 검색 입력
- 품목명 alias 검색
- 분류 및 준비 방법
- 선택 지역 일정 결합
- 대형폐기물의 경우 공식 절차 이동

### Settings

- 지역 변경
- 저장된 로컬 데이터 초기화
- 데이터 출처 및 면책 안내

## 15. Empty, loading, error and permission states

### Empty

지역을 선택하지 않은 상태에서는 Today 결과를 추측하지 않고 지역 설정 CTA를 보여준다.

### Loading

데이터 로딩 중 기존 지역을 다른 지역으로 잘못 표시하지 않는다.

### Data error

지역에 normalized rule이 없으면 `정보 없음`과 관할 담당기관 확인 경로를 보여준다.

### Ambiguous data

서로 충돌하는 규칙은 `확인 필요`로 표시하고 충돌한 출처를 보여준다.

### Offline

이미 앱에 포함된 normalized dataset과 저장 지역으로 계산 가능한 기능은 계속 동작한다.

## 16. Accessibility

- 모든 주요 기능은 키보드만으로 사용할 수 있어야 한다.
- status는 색상만으로 전달하지 않는다.
- form label과 오류 설명을 명시한다.
- focus-visible 상태를 제공한다.
- `aria-live`는 실제 상태 변화 알림에 제한적으로 사용한다.
- WCAG 2.2 AA 수준을 제품 품질 목표로 둔다.

## 17. Performance

- 첫 화면에서 전체 7,000+ rule을 반복 파싱하지 않는다.
- normalized dataset은 region index와 지역별 shard를 가진다.
- item search는 초기 dataset 규모에서 클라이언트 검색을 사용하되 bundle 크기를 측정한다.
- Today 계산은 현재 region의 rule subset만 평가한다.
- production build에서 주요 route JavaScript, normalized dataset, region shard 크기를 기록한다.

## 18. Security

- 외부 official URL은 허용된 `https` URL만 렌더링한다.
- dataset text를 HTML로 직접 삽입하지 않는다.
- LocalStorage 값은 신뢰하지 않고 RegionId 존재 여부를 검증한다.
- 외부 링크에는 `rel="noopener noreferrer"`를 사용한다.
- data refresh script는 expected host allowlist 밖의 redirect를 거부한다.

## 19. Data quality and operations

정규화 파이프라인은 import 시 다음 validation report를 생성한다.

```ts
export type ValidationReport = {
  sourceRows: number;
  acceptedRows: number;
  rejectedRows: number;
  ambiguousRows: number;
  coveredRegions: number;
  importedAt: string;
  sourceUpdatedAt: string | null;
  criticalErrors: string[];
  warnings: string[];
};
```

production artifact 생성은 malformed time, unknown weekday, missing region key 등 critical validation error가 남으면 실패한다.

단, 원본이 명시적으로 정보를 제공하지 않는 지역은 전체 build failure로 취급하지 않고 앱에서 `정보 없음` 상태를 표시한다.

## 20. Testing strategy

### Unit

- weekday parsing
- time parsing
- midnight crossover
- excluded dates
- next available calculation
- conflict detection
- invalid persisted RegionId
- unsafe external URL rejection

### Integration

- raw fixture -> normalized region rules
- normalized region -> Today result
- item category -> regional schedule join
- validation report counts

### UI

- region selection keyboard flow
- Today five-state rendering
- empty/data-error/ambiguous states
- source/provenance disclosure

### E2E

Critical flow:

```text
first visit
-> choose region
-> Today shows official-derived schedule
-> search an item
-> item guidance joins regional schedule
-> open Weekly
-> reload
-> selected region remains
```

## 21. Production blockers

다음 조건을 충족하기 전에는 public production-ready로 판정하지 않는다.

1. 독립 Beriday repository와 deployment target이 준비되어야 한다.
2. 공식 dataset importer가 실제 source를 읽고 validation report를 생성해야 한다.
3. 최소 3개 서로 다른 지자체의 fixture 또는 실데이터로 schedule engine을 검증해야 한다.
4. 자정 교차 시간과 미수거일 regression test가 통과해야 한다.
5. source/provenance UI가 실제 데이터와 일치해야 한다.
6. 대형폐기물 링크는 확인된 공식 URL만 포함해야 한다.
7. 모바일/데스크톱 주요 viewport에서 UI QA를 수행해야 한다.
8. 접근성 자동검사와 keyboard smoke test를 수행해야 한다.
9. public deployment URL의 smoke test가 통과해야 한다.
10. 공개 출시 직전 실제 수집 항목 기준으로 이용약관/개인정보처리방침 필요 범위를 다시 대조해야 한다.
11. `버리데이` 명칭을 공개 브랜드로 사용할 경우 동일·유사 상표/서비스명 확인을 완료해야 한다.

## 22. Success criteria

MVP 완료 조건은 사용자 수 같은 검증되지 않은 시장 수치가 아니다.

제품 완료 기준은 다음과 같다.

- 처음 방문한 사용자가 지역 설정 후 Today 결과까지 막힘 없이 도달한다.
- Today 카드의 모든 판단을 canonical rule과 provenance로 설명할 수 있다.
- 품목 검색 결과가 분리배출 방법과 지역 일정을 혼동하지 않는다.
- 데이터가 없거나 모호할 때 거짓 확정 답변을 하지 않는다.
- 핵심 기능이 로그인/GPS/backend 없이 동작한다.
- build, unit/integration/E2E, mobile/desktop QA가 실제로 검증된다.

## 23. Luna Agent ownership

- Idea / UX Research: 문제 정의, 사용자 여정, 경쟁/대안 검증
- PM: 범위, DAG, acceptance criteria, repository bootstrap
- Design System / Designer: mobile-first information hierarchy and states
- Frontend: Region/Today/Weekly/Search/Settings implementation
- API Integration: official data fetch/import contract
- Database: MVP server persistence를 만들지 않는다는 결정을 검증하고 불필요한 DB 추가를 차단
- Security: privacy boundary, external URL validation, storage/input review
- Accessibility: WCAG/keyboard/semantics review
- Performance: dataset/bundle/rendering measurements
- Test Automation: parser/schedule/UI/E2E repeatable coverage
- Data & Marketing: source-backed market positioning, SEO query hypothesis, launch experiment
- Documentation: verified product/run/data-source documentation
- Code Review / Reviewer / QA: independent merge gates
- User A / User B: first-use and repeat-use workflow verification
- Process Evaluator: product result and Agent process evaluation

## 24. Recommended implementation sequence

1. independent repository bootstrap + PRODUCT/README
2. canonical data contract + fixture-based parser/normalizer
3. schedule engine
4. real public-data refresh script + validation report
5. region selector
6. Today
7. Weekly
8. item disposal dataset/search
9. source/provenance UI
10. accessibility/performance/security hardening
11. E2E/QA
12. static deployment + BloomBouquet submission

이 순서는 실제 데이터와 schedule engine을 먼저 증명하고, 검증되지 않은 계정/알림/지도 기능에 시간을 쓰지 않도록 의도한 것이다.
