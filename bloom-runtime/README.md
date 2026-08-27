# Bloom Runtime

Bloom은 아이디어를 실제 소프트웨어 프로젝트로 실행하는 Agent 플랫폼입니다. 이 디렉터리는 Luna 데스크톱 펫과 분리된 Bloom 전용 실행 코드를 보관합니다.

## 구성

- `ts/` — PM Task DAG 정책, Agent orchestration, worker lease/snapshot adapter, merge gate와 policy tests
- `src/` — Git/GitHub/Codex를 직접 사용하는 Rust Runtime
- `src/bin/bloom-runtime-bridge.rs` — headless Node worker가 stdio JSON으로 호출하는 Runtime bridge
- `docs/` — Agent 조직, 인증, 세션 복구, E2E/시장 분석 정책 문서

## 원칙

- Luna는 데스크톱 펫 제품만 담당합니다.
- Bloom Web/Worker/Runtime은 Luna UI나 Tauri window lifecycle에 의존하지 않습니다.
- PM planning과 repository side effect는 snapshot 경계로 분리합니다.
- 중단된 `running` task는 재실행하기 전에 repository/session evidence reconciliation을 수행합니다.
- 모든 repository writer PR은 Code Review → Reviewer → QA 증거를 통과한 뒤에만 integration 대상이 됩니다.

## 검증

```bash
pnpm exec tsc -p bloom-runtime/tsconfig.policy-tests.json
pnpm exec tsc -p bloom-runtime/tsconfig.worker.json
cargo check --manifest-path bloom-runtime/Cargo.toml
```

Policy test 실행과 Bloom worker/bridge 빌드는 루트 `package.json` 스크립트에서 관리합니다.
