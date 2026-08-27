# 꽃다발 Shared Authentication Standard

## Purpose

꽃다발은 Luna가 생성하는 로그인/회원가입 필요 프로젝트에서 사용하는 **공통 인증 계약**입니다. 특정 OAuth 공급자나 프레임워크를 하나로 고정하는 SDK가 아니라, 프로젝트가 어떤 provider를 선택하더라도 동일하게 지켜야 하는 session, UI state, route 의미, redirect, cookie, secret, 오류 처리 기준을 정의합니다.

`ProjectPlan.needsAuth`가 `true`이면 Luna PM runtime은 `ensureBouquetAuthPlan()`을 적용해 인증 구현이 계획에서 빠지지 않도록 강제합니다.

## Planning contract

인증이 필요한 계획에는 다음 두 repository-changing Task가 각각 정확히 하나 존재해야 합니다.

```text
bouquet-auth-server (Backend)
  ↓
bouquet-auth-client (Frontend)
```

Backend Task가 없으면 Luna가 추가하고, Frontend Task가 없으면 Backend Task를 직접 의존하도록 추가합니다. 기존 PM 계획에 같은 표준 Task가 이미 있으면 프로젝트별 acceptance criteria는 보존하되 꽃다발 필수 기준을 병합합니다. 이름만 표준처럼 붙이고 보안 기준을 약하게 만든 Task는 검증을 통과할 수 없습니다.

`technologyDecisions`에는 `authentication` 영역의 꽃다발 선택과 사용 이유가 기록됩니다. 인증 Task 주입 이후 기존 Data & Marketing → Documentation → Code Review → Reviewer → QA 품질 chain이 적용되므로 auth 구현도 일반 제품 코드와 동일한 review/QA 경로를 거칩니다.

`needsAuth=false`인 프로젝트에는 꽃다발 Task를 추가하지 않습니다.

## Shared client session states

클라이언트는 아래 상태 의미를 유지합니다.

- `checking`: 최초 session 확인 중. 이 상태에서 보호 콘텐츠를 먼저 노출하지 않습니다.
- `anonymous`: 유효한 session이 없는 상태입니다.
- `submitting`: 로그인/회원가입 요청 처리 중입니다.
- `authenticated`: 서버가 확인한 유효한 session이 있는 상태입니다.
- `error`: 인증 확인 또는 사용자 인증 동작이 실패했고 재시도 경로가 필요한 상태입니다.

UI의 색상, 레이아웃, 컴포넌트 디자인은 제품마다 달라도 이 상태 의미와 전이는 임의로 재정의하지 않습니다.

## Route meaning

공통 route 의미는 다음과 같습니다.

```text
/auth/session
/auth/sign-in
/auth/sign-up
/auth/callback
/auth/sign-out
```

프레임워크 라우팅 규칙 때문에 실제 URL이 달라질 수는 있지만, 각 프로젝트 문서에서 위 공통 의미와 실제 route의 대응 관계를 명시해야 합니다.

## Server-owned session rules

- provider access/refresh token과 auth secret을 `localStorage`, `sessionStorage`, URL query 같은 브라우저 영속 영역에 저장하지 않습니다.
- 브라우저 인증 상태는 서버가 소유하는 session 계약을 기준으로 합니다.
- production session cookie는 `HttpOnly`, `Secure`, 명시적인 `SameSite`, 필요한 최소 `Path`/`Domain` 범위를 사용합니다.
- 로그인/회원가입 성공 시 session fixation 방지를 위해 session identifier를 회전합니다.
- 로그아웃 시 클라이언트 표시만 바꾸는 것이 아니라 서버 session을 실제로 무효화합니다.
- 보호 API는 인증 누락/만료/권한 부족을 일관된 `401`/`403` 또는 명시적 auth error 계약으로 처리합니다.

## Redirect safety

`returnTo` 또는 유사 redirect 입력은 같은 origin의 허용된 로컬 경로만 통과시킵니다. absolute external URL, scheme-relative URL 등 외부 이동이 가능한 입력을 그대로 신뢰하지 않습니다.

## Secret and error boundaries

- provider credential, session secret, signing key 등 실제 secret 값은 환경변수 또는 secret store에서 주입합니다.
- secret 값은 repository, client bundle, 로그, 문서에 기록하지 않습니다.
- 인증 오류는 계정 존재 여부, provider token, 내부 stack trace 또는 secret을 노출하지 않는 안정적인 오류 코드/메시지로 정규화합니다.

## Provider adapters

꽃다발은 GitHub, Google, 이메일/비밀번호 또는 다른 provider 하나를 전역 강제하지 않습니다. 제품 요구, 운영 환경, 비용, 보안, 사용자 특성에 근거해 provider를 선택하고 Backend Agent가 provider-specific 동작을 공통 session 계약 뒤의 adapter 경계에 둡니다.

따라서 현재 구현을 "모든 프로젝트에 바로 설치하는 단일 인증 SDK"라고 표현하면 안 됩니다. 현재 Luna가 제공하는 것은 **provider/framework 중립의 인증 contract + PM 계획 자동 주입 + acceptance-criteria enforcement + policy verification**입니다.

## Verification

꽃다발 policy test는 다음을 확인합니다.

- `needsAuth=false` 계획은 변경하지 않음
- Backend/Frontend 표준 Task 자동 주입
- Frontend → Backend 직접 dependency
- authentication technology decision 기록
- 재실행 시 중복 Task/decision을 만들지 않는 idempotency
- 기존 표준 Task의 프로젝트별 기준 보존
- 필수 cookie/session/redirect/secret/UI 기준 강제 병합
- 누락된 dependency 자동 복구
- 필수 기준 삭제와 중복 표준 Task 거부
- 인증 구현이 Data & Marketing 이후 Code Review → Reviewer → QA 품질 topology 안에 포함됨

PR #55의 GitHub Harness #149에서 Luna frontend build, 전체 Project Teams policy tests, Tauri `cargo check`, repository harness invariants가 모두 통과했습니다.
