# BaekjoonHub Playground Webhook

BaekjoonHub가 풀이를 GitHub 레포에 push하면, 변경된 문제 파일을 감지해서 Playground 코테 일지로 바로 가져갈 수 있는 링크를 만들어주는 템플릿입니다.

이 템플릿은 GitHub Webhook 설정을 직접 요구하지 않고 GitHub Actions로 동작합니다. 그래서 다른 사용자는 파일만 자신의 BaekjoonHub 연결 레포에 복사하면 됩니다.

## 동작 방식

1. BaekjoonHub가 풀이 파일을 레포에 push합니다.
2. GitHub Actions가 push 이벤트를 감지합니다.
3. 변경된 문제 파일 경로에서 플랫폼, 문제 번호, 제목, 난이도를 추출합니다.
4. Playground 코테 일지 import 링크를 생성합니다.
5. 선택적으로 외부 webhook URL로 JSON payload를 POST합니다.

생성되는 링크 예시:

```text
https://YOUR_PLAYGROUND_DOMAIN/apps/coding-log/?title=문제명&platform=baekjoon&level=Silver&number=1000&repo=owner/repo&commitSha=abc123
```

## 설치

BaekjoonHub가 연결된 레포에 아래 파일을 그대로 복사하세요.

```text
.github/workflows/playground-coding-log.yml
scripts/baekjoonhub-webhook.mjs
```

그 다음 GitHub 레포 설정에서 Actions가 켜져 있는지만 확인하면 됩니다.

## 설정

레포의 `Settings -> Secrets and variables -> Actions -> Variables`에 아래 값을 추가하세요.

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `PLAYGROUND_URL` | 권장 | Playground 배포 주소입니다. 기본값은 `https://your-playground.example.com` 입니다. |
| `WEBHOOK_URL` | 선택 | 별도 서버로 payload를 받고 싶을 때 사용하는 URL입니다. |

레포의 `Settings -> Secrets and variables -> Actions -> Secrets`에 아래 값을 추가할 수 있습니다.

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `WEBHOOK_SECRET` | 선택 | `WEBHOOK_URL` 호출 시 `x-playground-signature` HMAC 서명에 사용됩니다. |

## Playground와 연결

현재 Playground 코테 일지는 아래 URL 파라미터를 읽습니다.

| 파라미터 | 설명 |
| --- | --- |
| `title` | 문제 제목 |
| `platform` | `baekjoon` 또는 `programmers` |
| `level` | 난이도 |
| `number` | 문제 번호 |
| `repo` | `owner/repo` |
| `commitSha` | BaekjoonHub가 push한 커밋 SHA |

사용자가 생성된 링크를 열면 코테 일지 작성 화면이 열리고, 해당 커밋의 코드 파일을 자동으로 읽어옵니다.

## Webhook Payload

`WEBHOOK_URL`을 설정하면 아래 형태로 POST합니다.

```json
{
  "repository": "owner/repo",
  "commitSha": "abc123",
  "sender": "github-login",
  "items": [
    {
      "platform": "baekjoon",
      "number": "1000",
      "title": "A+B",
      "level": "Bronze",
      "path": "백준/Bronze/1000. A+B/main.py",
      "url": "https://..."
    }
  ]
}
```

서명 검증이 필요하면 요청 헤더의 `x-playground-signature` 값을 확인하세요.

```text
x-playground-signature: sha256=<hmac>
```

## 지원 경로

대표적인 BaekjoonHub 경로를 지원합니다.

```text
백준/Bronze/1000. A+B/main.py
백준/Silver/1234. 문제명/문제명.py
프로그래머스/lv1/문제명/solution.js
Programmers/level1/문제명/solution.py
Baekjoon/Silver/1234. Problem/main.cc
```

README, markdown 파일, 이미지 파일 등은 자동으로 제외합니다.

## 로컬 테스트

```bash
GITHUB_EVENT_PATH=examples/push-event.sample.json \
GITHUB_REPOSITORY=owner/baekjoonhub-repo \
GITHUB_SHA=abc123 \
PLAYGROUND_URL=https://YOUR_PLAYGROUND_DOMAIN \
node scripts/baekjoonhub-webhook.mjs
```

Windows PowerShell에서는 아래처럼 실행하세요.

```powershell
$env:GITHUB_EVENT_PATH="examples/push-event.sample.json"
$env:GITHUB_REPOSITORY="owner/baekjoonhub-repo"
$env:GITHUB_SHA="abc123"
$env:PLAYGROUND_URL="https://YOUR_PLAYGROUND_DOMAIN"
node scripts/baekjoonhub-webhook.mjs
```
