# Builder Headless Worker

`builder-worker/`는 Builder control plane의 claim을 받아 실제 Agent Runtime을 끝까지 실행하는 UI 없는 Node 프로세스입니다. `apps/desktop`은 현재 사용자용 데스크톱 펫이 아니라, 기존 Git/GitHub/Codex OS-bound Runtime을 추출하는 동안 Rust Runtime host로만 재사용합니다.

## 실행 흐름

1. Builder API에서 lease 기반으로 Run을 claim합니다.
2. snapshot이 없으면 Intake를 실행하고 `planning` snapshot을 저장합니다.
3. PM planning만 실행한 뒤 공용 `orchestrationCore` 정책을 적용하고 `repository` snapshot을 저장합니다.
4. 그 다음에만 deterministic repository bootstrap을 실행합니다.
5. PM Task DAG를 `taskRuns`로 만들고 최대 2개 Agent task를 wave 단위로 실행합니다.
6. snapshot에 `running` task가 남아 있으면 새 실행 전에 `reconcile_interrupted_agent_task`로 branch/HEAD/remote/PR/session evidence를 검증합니다.
7. 모든 writer PR에 Code Review -> Reviewer -> QA 증거가 있을 때만 merge gate를 통과합니다.
8. Integration 결과를 `completed` snapshot으로 저장한 뒤에만 Builder Run을 complete 처리합니다.

Repository bootstrap과 PR merge는 retry 가능한 경계로 취급합니다. Repository가 이미 존재하면 기존 origin/workspace를 검증해 재사용하고, integration 중 worker가 종료된 경우 이미 `MERGED`인 동일 PR은 `develop` base와 merge evidence를 확인해 복구합니다.

## 준비

```bash
pnpm install --frozen-lockfile
pnpm run build:builder-worker
pnpm run build:builder-runtime-bridge
```

Worker 머신에는 다음 CLI가 실제로 설치되고 로그인되어 있어야 합니다.

- Git
- GitHub CLI (`gh auth login`)
- Codex CLI (`codex login`, ChatGPT 로그인 모드)
- Rust/Cargo (Runtime bridge를 직접 빌드하는 경우)

## 환경변수

필수:

```text
BUILDER_WORKER_TOKEN=32자 이상의 worker 전용 secret
BUILDER_GITHUB_ORGANIZATION=target-org
BUILDER_WORKSPACE_ROOT=/srv/builder-workspaces
```

선택:

```text
BUILDER_API_BASE_URL=http://localhost:8080
BUILDER_WORKER_ID=builder-host-01
BUILDER_TEAM_ID=rose
BUILDER_TEAM_NAME=Rose
BUILDER_RUNTIME_BRIDGE_PATH=/custom/path/builder-runtime-bridge
BUILDER_WORKER_POLL_INTERVAL_MS=5000
BUILDER_WORKER_HEARTBEAT_INTERVAL_MS=30000
```

`BUILDER_RUNTIME_BRIDGE_PATH`를 생략하면 `apps/desktop/src-tauri/target/release/builder-runtime-bridge`를 사용하며 Windows에서는 `.exe`를 자동으로 붙입니다.

## 실행

```bash
pnpm run start:builder-worker
```

프로세스는 한 번에 한 Run lease를 소유하고 heartbeat를 유지합니다. `SIGINT`/`SIGTERM`을 받으면 현재 cycle이 끝난 뒤 새 claim을 받지 않습니다. 운영 환경에서는 systemd, PM2, container supervisor 등 별도 process supervisor 아래에서 실행하는 것을 권장합니다.

## 검증

```bash
pnpm --dir apps/desktop run test:allocation
pnpm run build:builder-worker
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

`headlessBuilderExecutor.policy-test.ts`는 외부 side-effect 전에 snapshot이 저장되는지, 독립 task가 최대 2개까지만 동시에 실행되는지, 중단된 `running` task를 evidence reconciliation 없이 재실행하지 않는지를 검증합니다.
