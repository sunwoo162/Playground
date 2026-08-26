# Builder Run Queue

Builder 프로젝트는 생성 결과물의 현재 상태를, Builder Run은 개별 실행 시도 이력을 표현합니다.

## User API

- `POST /api/builder/projects/{projectId}/runs`
  - 실행 요청을 queue에 등록합니다.
  - 성공 시 `202 Accepted`와 Run response를 반환합니다.
  - 동일 프로젝트에 `queued` 또는 `running` Run이 이미 있으면 새 record를 만들지 않고 기존 active Run을 반환합니다.
- `GET /api/builder/projects/{projectId}/runs`
  - 로그인 사용자가 소유한 프로젝트의 실행 이력을 최신순으로 반환합니다.
- `GET /api/builder/projects/{projectId}/runs/{runId}`
  - 로그인 사용자가 소유한 프로젝트의 특정 실행을 반환합니다.

## Current statuses

- Project: `draft` → `queued`
- Run: `queued`

`running`, `completed`, `failed`는 worker lifecycle 연결 단계에서 실제 evidence를 확인한 뒤에만 전이합니다. 현재 worker가 연결되지 않은 상태에서는 queue 생성만으로 `running`을 표시하지 않습니다.

## Safety rules

- 프로젝트 소유권을 항상 `ownerId`로 확인합니다.
- 실행 요청 시 Project row에 pessimistic write lock을 사용합니다.
- active Run(`queued`, `running`)이 이미 있으면 요청은 idempotent하게 처리합니다.
- `completed` Project는 현재 재실행을 허용하지 않습니다.
- Project status와 active Run 상태가 일치하지 않으면 active Run을 기준으로 Project status를 복구합니다.
- active Run은 없지만 Project가 `queued`/`running`인 비정상 상태에서는 새 Run을 추정 생성하지 않고 요청을 거부합니다.

## Next boundary

다음 단계는 웹 Builder가 생성 직후 이 API를 호출하도록 연결하고, 이후 별도 worker identity로 queued Run을 claim하여 실제 Agent Orchestrator에 전달하는 것입니다.
