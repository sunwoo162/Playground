# 버리데이 Product Design

Updated: 2026-08-27
Owner: Team Sakura (벚꽃)
Status: Design review

## 1. Product Summary

버리데이(working title)는 사용자가 직접 선택한 행정동을 기준으로 **오늘 무엇을 언제 배출할 수 있는지** 가장 먼저 보여주는 생활쓰레기 일정·분리배출 안내 서비스다.

핵심 Job-to-be-Done은 하나다.

> 사용자가 5초 안에 "오늘 밤 어떤 쓰레기를 버릴 수 있는지" 판단할 수 있어야 한다.

버리데이는 폐기물을 직접 수거·운반·처리하거나 수거업체를 중개하는 서비스가 아니다. 공식·이용가능 공공데이터를 정규화해 지역별 배출 규칙을 계산하고, 품목별 분리배출 안내와 다음 배출 가능 시간을 결합해 제공하는 정보 서비스다.

## 2. Target Users

### Primary

- 자취생, 1인 가구, 기숙사·원룸 거주자처럼 생활쓰레기 배출 규칙을 자주 확인하는 사용자
- 이사 또는 지역 이동으로 새 동네의 배출 요일과 시간을 모르는 사용자

### Secondary

- 가족 단위 가구 중 동네 배출 규칙을 반복해서 확인해야 하는 사용자
- 특정 품목을 어떻게 버리는지 즉시 확인하려는 사용자

## 3. Validated Problem

생활쓰레기 배출 규칙은 지자체와 관리구역에 따라 종류, 요일, 시간, 미수거일이 다르다. 정보는 존재하지만 사용자가 실제 행동을 결정하려면 여러 행정 페이지나 안내문을 다시 해석해야 한다.

제품 기회는 새로운 폐기물 처리망을 만드는 것이 아니라 다음 세 정보를 하나의 행동 화면으로 합치는 데 있다.

1. 내 지역의 공식 배출 규칙
2. 오늘 날짜·현재 시간 기준 배출 가능 여부
3. 특정 품목의 올바른 분리배출 방법

경쟁 서비스와 차별화할 포지션은 `분리배출 지식`이나 `대형폐기물 처리` 자체가 아니라 **내 지역 + 오늘 + 다음 행동**이다.

## 4. Product Principles

1. **Today first**: 지도나 긴 설명보다 오늘 배출 가능 여부가 첫 화면의 중심이다.
2. **Official evidence**: 규칙마다 출처와 데이터 기준일을 추적할 수 있어야 한다.
3. **Privacy by minimization**: MVP는 GPS, 정확한 집 주소, 회원가입을 요구하지 않는다.
4. **No false certainty**: 데이터가 오래됐거나 충돌하면 확정 답변처럼 표시하지 않는다.
5. **No regulated operations**: 직접 수거, 운반, 처리, 수거대행 결제·중개는 MVP 범위 밖이다.
6. **Local-first where possible**: 사용자의 선택 지역과 알림 기본 설정은 서버가 필요하지 않으면 로컬에 저장한다.

## 5. MVP Scope

### 5.1 Region Setup

사용자가 다음 계층을 직접 선택한다.

- 시·도
- 시·군·구
- 행정동 또는 데이터셋에서 실제 제공되는 관리구역

정확한 도로명 주소나 동·호수는 받지 않는다.

선택 결과는 브라우저 LocalStorage에 저장하며, MVP 서버에는 사용자 위치를 저장하지 않는다.

### 5.2 Today View

홈 화면은 선택 지역을 기준으로 현재 날짜의 배출 가능 항목을 보여준다.

각 항목은 최소 다음 정보를 포함한다.

- 쓰레기 종류
- 오늘 배출 가능 여부
- 배출 시작·종료 시간
- 다음 배출 가능일 또는 다음 확인 시점
- 데이터 기준일
- 공식 출처

예시:

```text
오늘 20:00 ~ 02:00
일반쓰레기        배출 가능
음식물쓰레기      내일
재활용품          배출 가능
종이/캔           목요일
```

### 5.3 Item Search

사용자는 `깨진 유리`, `스티로폼`, `후라이팬`, `건전지`, `옷` 등 품목명을 검색할 수 있다.

검색 결과는 두 종류의 정보를 분리해 표시한다.

- `분리배출 방법`: 품목 자체의 일반적인 처리 방법
- `내 지역 일정`: 선택 지역에서 해당 분류를 배출할 수 있는 다음 시점

두 정보의 출처가 다르면 각각 독립적으로 표기한다.

### 5.4 Weekly Schedule

월~일 기준으로 지역의 배출 종류와 시간대를 요약한다.

사용자가 `오늘` 화면에서 다음 일정을 이해하는 보조 화면이며, 캘린더 자체가 핵심 홈 화면을 대체하지 않는다.

### 5.5 Reminder

MVP 알림은 `배출일 알림`만 다룬다.

마케팅 알림과 절대 결합하지 않는다. 웹 푸시 또는 브라우저 알림을 도입할 경우 사용자 명시적 권한 허용 뒤에만 동작한다.

초기 구현에서 안정적인 백그라운드 알림 보장이 어려우면 LocalStorage에 알림 설정 UI와 다음 배출일 표시만 제공하고, production blocker로 명확히 표시한다. 알림을 작동한다고 가장하는 mock은 금지한다.

### 5.6 Bulky Waste

대형폐기물은 서비스가 직접 신고·결제·수거하지 않는다.

품목이 대형폐기물로 분류되는 경우 다음만 제공한다.

- 대형폐기물임을 안내
- 해당 지자체 공식 신고 페이지 또는 공식 안내 페이지 링크
- 필요 시 관할 부서 연락처

## 6. Explicitly Out of Scope

MVP에는 다음을 넣지 않는다.

- GPS 또는 실시간 위치 추적
- 정확한 집 주소 저장
- 별도 이메일·비밀번호 회원가입
- 쓰레기 직접 수거·운반·처리
- 민간 수거업체 배정 또는 중개
- 대형폐기물 처리 비용 결제
- 생성형 AI 답변
- 사용자 게시판·커뮤니티
- 지도 중심 탐색
- 광고성 푸시

향후 계정 동기화가 필요해질 경우 BloomBouquet 제품 계약에 맞춰 꽃다발 Identity Provider의 Authorization Code + PKCE S256을 사용하고 별도의 패스워드 저장소를 만들지 않는다.

## 7. Legal and Policy Boundaries

이 설계는 법률자문이 아니라 제품 리스크 통제를 위한 구현 계약이다. 출시 직전 최신 법령과 데이터 이용조건을 다시 확인한다.

### 7.1 Waste Management

서비스는 폐기물을 실제로 수집·운반·처리하지 않는다. 폐기물처리업으로 오인될 기능이나 표현을 넣지 않는다.

`대신 버려드립니다`, `수거 예약`, `기사 배정` 같은 기능은 별도 법적 검토 없이 추가할 수 없다.

### 7.2 Public Data

초기 데이터 소스는 이용조건이 확인된 공공데이터를 우선한다. 원본 데이터에는 최소 다음 provenance를 저장한다.

- dataset/source name
- source URL or official identifier
- source organization
- source updated date
- imported at
- license/use condition summary

지자체 웹페이지를 추가 파싱하거나 크롤링하는 경우 해당 페이지의 이용조건과 저작권 범위를 별도로 확인한다.

### 7.3 Privacy

MVP는 사용자가 직접 선택한 행정구역만 로컬 저장한다. 서버에서 개인을 식별하는 위치 프로필을 만들지 않는다.

GPS, 위도·경도, 실시간 위치를 도입하는 변경은 위치정보 관련 법률·약관·신고 필요성을 다시 검토한 뒤 별도 spec으로 진행한다.

### 7.4 Notifications

배출일 안내와 마케팅 메시지는 데이터 모델과 UI에서 분리한다. MVP에서는 마케팅 발송 기능을 구현하지 않는다.

## 8. Data Architecture

```text
Official Public Dataset(s)
        ↓
Raw Import Snapshot
        ↓
Normalizer
        ↓
Canonical Region Rules
        ↓
Schedule Engine
        ↓
Today / Weekly / Item Search Views
```

### 8.1 Raw Snapshot

원본 데이터를 변형 없이 보관 가능한 구조로 저장하거나 빌드 시 정규화 입력으로 보존한다. 원본 필드명이 바뀌어도 canonical 모델 변경 없이 importer만 수정할 수 있어야 한다.

### 8.2 Canonical Region Rule

최소 모델:

```ts
type WasteCategory =
  | "general"
  | "food"
  | "recyclable"
  | "paper"
  | "can_glass"
  | "vinyl"
  | "other";

interface RegionRule {
  id: string;
  sido: string;
  sigungu: string;
  areaName: string;
  category: WasteCategory;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  exclusionNotes: string[];
  disposalNotes: string[];
  sourceId: string;
  sourceUpdatedAt: string | null;
}
```

요일은 JavaScript `0=Sunday ... 6=Saturday`를 canonical contract로 사용한다.

자정을 넘는 시간대(예: 20:00~02:00)는 같은 배출 window로 계산해야 한다.

### 8.3 Source Metadata

```ts
interface SourceMetadata {
  id: string;
  title: string;
  organization: string;
  url: string;
  updatedAt: string | null;
  importedAt: string;
  licenseSummary: string;
}
```

UI의 모든 규칙은 최소 하나의 `sourceId`를 가져야 한다.

## 9. Schedule Engine

Schedule Engine은 UI와 분리된 pure domain module로 구현한다.

주요 책임:

- 특정 날짜에 category가 배출 가능한지 계산
- 현재 시각이 배출 window 내부인지 계산
- 다음 배출 가능 날짜·시간 탐색
- 자정 경계 처리
- 미수거일 또는 exclusion 처리
- 데이터 부족 상태 반환

예상 결과 타입:

```ts
type ScheduleConfidence = "confirmed" | "stale" | "incomplete" | "conflict";

interface ScheduleResult {
  status: "available_now" | "later_today" | "not_today" | "unknown";
  nextWindowStart: string | null;
  nextWindowEnd: string | null;
  confidence: ScheduleConfidence;
  sourceIds: string[];
  message: string;
}
```

데이터가 충돌하거나 필요한 필드가 없으면 추측하지 않고 `unknown`, `incomplete`, `conflict` 중 적절한 상태를 반환한다.

## 10. Item Knowledge Model

품목 검색은 지역 스케줄과 분리된 knowledge dataset을 사용한다.

```ts
interface DisposalItem {
  id: string;
  names: string[];
  category: WasteCategory | "bulky" | "special";
  instructions: string[];
  cautions: string[];
  sourceIds: string[];
}
```

검색은 exact alias와 normalized text matching부터 시작한다. 생성형 AI나 불확실한 자동 분류는 MVP에 넣지 않는다.

## 11. Frontend Information Architecture

### Primary routes

- `/` Today
- `/region` 지역 설정
- `/search` 품목 검색
- `/schedule` 주간 일정
- `/settings` 알림·데이터 출처·고지

### Today Screen priority

1. 현재 선택 지역
2. 오늘 배출 상태 카드
3. 다음 배출 일정
4. 빠른 품목 검색
5. 데이터 기준일 및 출처

지역이 설정되지 않았다면 Today 화면 대신 지역 설정 CTA를 표시한다.

## 12. Error, Empty, and Stale States

### Region has no data

`해당 지역의 공식 배출 데이터를 아직 제공하지 못하고 있습니다.`를 표시하고 없는 데이터를 만들어내지 않는다.

### Source is stale

운영 기준에서 정한 freshness threshold를 넘긴 소스는 `정보가 오래되었을 수 있음` 배지를 표시한다. MVP 기본 threshold는 180일이며, sourceUpdatedAt이 없는 경우 stale이 아니라 `기준일 확인 불가`로 별도 표시한다.

### Conflicting rules

같은 지역·카테고리·요일에 서로 다른 rule이 겹치고 자동으로 우선순위를 정할 공식 근거가 없다면 `conflict` 상태로 반환하고 두 출처를 보여준다.

### Network unavailable

배포 구조가 정적 canonical dataset을 포함하면 기존 데이터로 계속 동작한다. 외부 실시간 API를 사용하는 경우 마지막 정상 snapshot을 사용하되 마지막 갱신 시각을 표시한다.

## 13. Technology Choice

기존 Playground 프로토콜에 맞춰 일반 웹앱 기술을 우선한다.

- React
- TypeScript
- Vite
- CSS or existing repository styling convention
- Vitest for domain/unit tests
- Testing Library for important UI flows
- LocalStorage for region and local settings

MVP는 데이터가 정적 snapshot으로 충분하면 별도 DB와 backend를 만들지 않는다. 서버 지속성이 실제 필요해지는 기능이 추가될 때 별도 설계를 한다.

제품 코드는 BloomBouquet 평가 플랫폼 본체와 결합하지 않고 독립 프로젝트로 관리하는 것을 기본으로 한다. BloomBouquet에는 배포된 버전을 submission으로 등록한다.

## 14. First Complete Workflow

사용자의 첫 성공 흐름은 다음과 같다.

```text
Open app
→ 지역 미설정 상태 확인
→ 시/도 선택
→ 시/군/구 선택
→ 행정동 선택
→ 저장
→ Today 화면 이동
→ 오늘 배출 가능한 종류와 시간 확인
→ 품목 검색
→ 품목 분리 방법 + 해당 category의 내 지역 다음 배출 시점 확인
```

이 workflow가 실제 데이터로 끝까지 동작하기 전에는 대시보드, 커뮤니티, AI 등 확장 기능을 개발하지 않는다.

## 15. Verification Strategy

### Unit

- weekday matching
- same-day window
- overnight window (20:00~02:00)
- next available day
- exclusion day
- missing time
- conflicting rules
- stale source classification
- item alias matching

### Integration

- region selection persists locally
- Today screen derives from selected region
- item search combines knowledge result with region schedule
- source metadata is visible from a rule
- no-data region shows explicit empty state

### Build

- TypeScript compile
- Vite production build
- tests pass
- obvious mobile and desktop layout failures checked

### Legal/product regression

Tests or policy checks should prevent accidental MVP regressions that introduce:

- required GPS access
- exact-address requirement
- direct collection/transport wording
- fake reminder success without browser capability
- rules with no source metadata

## 16. Production Blockers

The product is not production-ready until all of these are satisfied:

1. Real public dataset import and provenance are present.
2. At least one target region completes the full workflow with verified source data.
3. Region coverage and unsupported regions are explicit.
4. Data source usage conditions are rechecked at release time.
5. Privacy notice accurately reflects local-only region storage and any analytics actually used.
6. If web notifications are enabled, real browser permission and delivery behavior are verified.
7. Broken or stale source handling is visible in UI.
8. Terms/copy do not imply that 버리데이 performs waste collection or official government functions.

## 17. Success Criteria for MVP

MVP is successful when:

- a first-time user can choose a supported region and reach an actionable Today result without account creation;
- the user can answer `오늘 무엇을 언제 버릴 수 있나` from the first screen;
- a searched item explains both disposal method and local next disposal timing when mappings exist;
- every displayed rule has traceable official source metadata;
- unsupported, stale, incomplete, and conflicting data are visible rather than silently guessed;
- GPS, exact address, direct waste collection, payment, AI, and separate password auth remain absent.

## 18. Future Work Requiring New Approval

The following are separate architectural changes and require fresh product/legal design before implementation:

- GPS/current-location detection
- 꽃다발 account sync across devices
- server-side user profiles
- municipality admin portal
- crowdsourced corrections
- push notification backend
- private waste collector marketplace
- collection reservation/payment
- AI disposal assistant
