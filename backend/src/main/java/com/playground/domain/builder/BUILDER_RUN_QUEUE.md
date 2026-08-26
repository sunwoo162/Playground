# Builder Run Queue

Builder 프로젝트는 생성 결과물의 현재 상태를, Builder Run은 개별 실행 시도 이력을 표현합니다.

## User API

- `POST /api/builder/projects/{projectId}/runs`
  - 실행 요청을 queue에 등록합니다.
  - 성공 시 `202 Accepted`와 Run response를 반환합니다.
  - 동일 프로젝트에 `queued` 또는 `running` Run이 이미 있으면 새 record를 만들지 않고 기존 active Run을 반환합니다.
- `GET /api/builder/projects/{projectId}/runs`
  - 로그인 사용자가 소유한 프로젝트의 실행 이력을 최신순으로 반환합니다.
  - worker가 claim한 Run은 `workerId`, `heartbeatAt`, `leaseExpiresAt`, `claimCount`를 함께 노출합니다.
- `GET /api/builder/projects/{projectId}/runs/{runId}`
  - 로그인 사용자가 소유한 프로젝트의 특정 실행을 반환합니다.

## Worker API

Worker API는 사용자 JWT가 아니라 별도의 `BUILDER_WORKER_TOKEN`으로 보호합니다. 모든 요청은 `X-Builder-Worker-Token` header에 서버와 동일한 32자 이상 비밀값을 전달해야 합니다. 토큰이 서버에 설정되지 않으면 endpoint는 fail-closed로 `503`을 반환하고, 잘못된 토큰은 `401`을 반환합니다.

- `POST /internal/builder/worker/runs/claim`
  - body: `{ "workerId": "..." }`
  - 가장 오래된 `queued` Run 또는 lease가 만료된 `running` Run 하나를 row lock으로 claim합니다.
  - claim 성공 시 Project/Run을 `running`으로 전이하고 90초 lease를 발급합니다.
  - 처리할 Run이 없으면 `204 No Content`를 반환합니다.
- `POST /internal/builder/worker/runs/{runId}/heartbeat`
  - 현재 lease owner만 호출할 수 있습니다.
  - heartbeat 시 lease를 다시 90초 연장합니다.
- `POST /internal/builder/worker/runs/{runId}/complete`
  - 현재 lease owner만 완료할 수 있습니다.
  - Run/Project를 `completed`로 전이하고 선택적으로 repository/preview metadata를 저장합니다.
  - 동일 worker의 동일 completed 재요청은 멱등하게 기존 terminal state를 반환합니다.
- `POST /internal/builder/worker/runs/{runId}/fail`
  - 현재 lease owner만 실패 처리할 수 있습니다.
  - Run/Project를 `failed`로 전이하고 실패 이유를 보존합니다.
  - 동일 worker의 동일 failed 재요청은 멱등하게 기존 terminal state를 반환합니다.

## Status lifecycle

```text
Project: draft -> queued -> running -> completed
                         |       |
                         |       -> failed -> queued (user retry creates a new Run)
                         |
                         -> running lease expiry -> re-claim by another worker

Run:     queued -> running -> completed
                    |
                    -> failed
                    |
                    -> lease expiry -> running under a new worker lease
```

Queue 생성만으로 `running`을 표시하지 않습니다. 실제 worker가 claim transaction을 성공시킨 뒤에만 `running`으로 전이합니다.

## Lease and concurrency rules

- claim은 `FOR UPDATE SKIP LOCKED`를 사용해 여러 worker가 같은 Run을 동시에 가져가지 않게 합니다.
- 첫 claim에서 `startedAt`을 기록하고 이후 expired lease re-claim은 최초 시작 시각을 보존합니다.
- 매 claim마다 `claimCount`가 증가하며 현재 worker identity와 새 lease를 기록합니다.
- heartbeat/complete/fail은 Run row를 pessimistic write lock으로 다시 읽고 현재 `workerId`와 `running` 상태를 확인합니다.
- lease가 만료된 뒤 다른 worker가 re-claim하면 이전 worker는 workerId mismatch로 heartbeat/terminal update를 할 수 없습니다.
- terminal 상태에서는 lease를 제거하고 `finishedAt`을 기록합니다.

## User queue safety rules

- 프로젝트 소유권을 항상 `ownerId`로 확인합니다.
- 실행 요청 시 Project row에 pessimistic write lock을 사용합니다.
- active Run(`queued`, `running`)이 이미 있으면 요청은 idempotent하게 처리합니다.
- `completed` Project는 현재 재실행을 허용하지 않습니다.
- Project status와 active Run 상태가 일치하지 않으면 active Run을 기준으로 Project status를 복구합니다.
- active Run은 없지만 Project가 `queued`/`running`인 비정상 상태에서는 새 Run을 추정 생성하지 않고 요청을 거부합니다.

## Next boundary

이 계약은 durable queue ownership과 worker lifecycle을 제공하지만 아직 claimed project를 실제 Intake/PM/Agent DAG에 자동 전달하지 않습니다. 다음 단계는 headless worker adapter가 이 API를 poll/heartbeat하면서 기존 Luna orchestration safety gates를 재사용해 실제 Project Intake, PM, Agent scheduler를 실행하고, 검증된 terminal evidence에 따라서만 `complete` 또는 `fail`을 호출하도록 연결하는 것입니다.
