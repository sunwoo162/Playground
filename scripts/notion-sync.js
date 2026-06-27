/**
 * Notion 동기화 스크립트
 * 놀이터 프로젝트 개발 내용을 Notion 페이지에 정리
 *
 * 사용법:
 *   node scripts/notion-sync.js          # 전체 문서 초기화 + 작성
 *   node scripts/notion-sync.js update   # 최근 커밋 내용 추가
 */

require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PAGE_ID = process.env.NOTION_PAGE_ID;

// ── 헬퍼 ────────────────────────────────────────────
const h1 = (text) => ({
  object: 'block', type: 'heading_1',
  heading_1: { rich_text: [{ type: 'text', text: { content: text } }] }
});
const h2 = (text) => ({
  object: 'block', type: 'heading_2',
  heading_2: { rich_text: [{ type: 'text', text: { content: text } }] }
});
const h3 = (text) => ({
  object: 'block', type: 'heading_3',
  heading_3: { rich_text: [{ type: 'text', text: { content: text } }] }
});
const p = (text) => ({
  object: 'block', type: 'paragraph',
  paragraph: { rich_text: [{ type: 'text', text: { content: text } }] }
});
const bullet = (text) => ({
  object: 'block', type: 'bulleted_list_item',
  bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] }
});
const divider = () => ({ object: 'block', type: 'divider', divider: {} });
const callout = (text, emoji = '💡') => ({
  object: 'block', type: 'callout',
  callout: {
    rich_text: [{ type: 'text', text: { content: text } }],
    icon: { type: 'emoji', emoji }
  }
});
const code = (text, language = 'plain text') => ({
  object: 'block', type: 'code',
  code: {
    rich_text: [{ type: 'text', text: { content: text } }],
    language
  }
});
const toggle = (title, children) => ({
  object: 'block', type: 'toggle',
  toggle: {
    rich_text: [{ type: 'text', text: { content: title } }],
    children
  }
});

// ── 기존 내용 삭제 ───────────────────────────────────
async function clearPage() {
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: PAGE_ID, start_cursor: cursor });
    for (const block of res.results) {
      await notion.blocks.delete({ block_id: block.id });
    }
    cursor = res.next_cursor;
  } while (cursor);
}

// ── 블록 추가 (100개 제한 분할) ──────────────────────
async function appendBlocks(blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: PAGE_ID,
      children: blocks.slice(i, i + 100)
    });
  }
}

// ── 메인 문서 작성 ───────────────────────────────────
async function writeFullDoc() {
  const today = new Date().toLocaleDateString('ko-KR');

  const blocks = [
    // 제목 & 개요
    h1('🎮 놀이터 (Playground) 개발 문서'),
    callout(`마지막 업데이트: ${today}`, '📅'),
    p('나만의 작은 웹앱들을 모아둔 포털 사이트. GitHub OAuth 로그인 하나로 모든 앱을 사용할 수 있으며, 친구 추가 및 알림 기능을 갖춘 소셜 플랫폼.'),
    divider(),

    // 프로젝트 개요
    h2('📌 프로젝트 개요'),
    bullet('사이트 URL: https://playground.https.gsmsv.site'),
    bullet('GitHub: https://github.com/sunwoo162/Playground'),
    bullet('배포 서버: Ubuntu (학교 서버 gsmsv.site)'),
    bullet('개발 기간: 2024 ~'),
    divider(),

    // 기술 스택
    h2('🛠 기술 스택'),
    h3('Frontend'),
    bullet('React 19 + TypeScript + Vite'),
    bullet('SPA 구조, CSS Variables 기반 다크 테마'),
    bullet('Web Push API (Service Worker)'),
    h3('Backend'),
    bullet('Spring Boot 3.3 (Java 17) - REST API 서버 (8080포트)'),
    bullet('Node.js + Express - OAuth 처리 및 정적 파일 서빙 (3000포트)'),
    bullet('MySQL 8.0 - 데이터 영속성'),
    bullet('Spring Security + JWT (HMAC-SHA256)'),
    h3('Infrastructure'),
    bullet('PM2 - 프로세스 관리 (ecosystem.config.js)'),
    bullet('nginx - 리버스 프록시 + SSL termination'),
    bullet('Let\'s Encrypt - 무료 SSL 인증서'),
    bullet('GitHub Actions - CI/CD 자동 배포'),
    divider(),

    // 아키텍처
    h2('🏗 아키텍처'),
    code(
      '브라우저\n' +
      '  ↓ HTTPS\n' +
      'nginx (80/443)\n' +
      '  ↓ HTTP proxy\n' +
      'Node.js :3000 (Express)\n' +
      '  ├── GitHub OAuth 처리\n' +
      '  ├── JWT 발급 (Access 1h / Refresh 7d)\n' +
      '  ├── Web Push 발송 (web-push)\n' +
      '  └── /api/** → proxy → Spring Boot :8080\n' +
      '                           ├── 인증 (JwtAuthFilter)\n' +
      '                           ├── Dev Notes API\n' +
      '                           ├── Study Planner API\n' +
      '                           ├── Friend API\n' +
      '                           └── Push Subscription API',
      'plain text'
    ),
    divider(),

    // 인증 시스템
    h2('🔐 인증 시스템'),
    h3('GitHub OAuth Flow'),
    bullet('1. /auth/github → GitHub 인증 페이지'),
    bullet('2. 콜백: GitHub에서 code 수신'),
    bullet('3. code → GitHub access_token 교환'),
    bullet('4. GitHub API로 유저 정보 조회'),
    bullet('5. JWT Access Token(1h) + Refresh Token(7d) 발급 → 쿠키 저장'),
    bullet('6. Spring Boot JwtAuthFilter에서 쿠키 검증'),
    h3('토큰 자동 갱신'),
    bullet('만료 5분 전 자동으로 /api/auth/refresh 호출'),
    bullet('Refresh Token으로 새 Access Token 발급 (DB에서 유저 정보 조회)'),
    bullet('프론트 헤더에 남은 시간 실시간 표시 (🔑 59분 23초)'),
    divider(),

    // 구현된 앱
    h2('📱 구현된 앱'),
    h3('1. 개발자 노트 (Dev Notes)'),
    bullet('프로젝트별 기능명세서, API 명세서, 사용자 분석 관리'),
    bullet('API 명세서: Method, Endpoint, Headers, Query Params, Request/Response Body'),
    bullet('데이터 DB 영속 저장 (MySQL)'),
    bullet('로그인한 유저별 독립 데이터'),
    h3('2. 스터디 플래너 (Study Planner)'),
    bullet('과목별 공부 시간 타이머'),
    bullet('공부 세션 기록 및 통계'),
    bullet('일일 목표 설정'),
    bullet('달력 히트맵'),
    h3('3. Life Tracker (준비 중)'),
    bullet('실패, 버린 시간, 작은 성취 기록'),
    divider(),

    // 소셜 기능
    h2('👥 소셜 기능'),
    h3('친구 시스템'),
    bullet('GitHub 아이디로 놀이터 가입 유저 검색'),
    bullet('친구 요청 / 수락 / 거절 / 삭제'),
    bullet('최근 가입자 목록 표시'),
    bullet('받은 친구 요청 알림 뱃지'),
    h3('Web Push 알림'),
    bullet('VAPID 키 기반 Web Push (브라우저 꺼져도 알림)'),
    bullet('친구 요청 시 상대방에게 실시간 알림'),
    bullet('Service Worker로 백그라운드 수신'),
    bullet('알림 클릭 시 해당 페이지로 이동'),
    divider(),

    // DB 스키마
    h2('🗄 데이터베이스 스키마'),
    toggle('users', [
      code('github_id (PK), login, name, avatar_url, created_at, last_login_at', 'plain text')
    ]),
    toggle('projects', [
      code('id (PK), user_id (FK), title, description, overview (JSON), created_at, updated_at', 'plain text')
    ]),
    toggle('feature_specs', [
      code('id (PK), project_id (FK), title, description, priority (ENUM), status (ENUM)', 'plain text')
    ]),
    toggle('api_specs', [
      code('id (PK), project_id (FK), method (ENUM), endpoint, description, headers (TEXT), query_params (TEXT), request_body, response_body', 'plain text')
    ]),
    toggle('user_analyses', [
      code('id (PK), project_id (FK), persona, goal, pain_point', 'plain text')
    ]),
    toggle('subjects', [
      code('id (PK), user_id, name, color, daily_goal_minutes', 'plain text')
    ]),
    toggle('study_sessions', [
      code('id (PK), user_id, subject_id, date, start_time, end_time, duration_seconds, duration_minutes, memo', 'plain text')
    ]),
    toggle('daily_goals', [
      code('user_id (PK), total_minutes', 'plain text')
    ]),
    toggle('friendships', [
      code('id (PK), requester_id, receiver_id, status (PENDING/ACCEPTED/REJECTED), created_at', 'plain text')
    ]),
    toggle('push_subscriptions', [
      code('id (PK), user_id, endpoint, p256dh, auth_key, created_at', 'plain text')
    ]),
    divider(),

    // API 목록
    h2('🔌 API 목록'),
    h3('인증'),
    bullet('GET /api/auth/me - 현재 유저 정보'),
    bullet('POST /api/auth/refresh - Access Token 갱신'),
    h3('개발자 노트'),
    bullet('GET /api/dev-notes/projects - 프로젝트 목록'),
    bullet('POST /api/dev-notes/projects - 프로젝트 생성'),
    bullet('PUT /api/dev-notes/projects/:id - 프로젝트 수정'),
    bullet('DELETE /api/dev-notes/projects/:id - 프로젝트 삭제'),
    h3('스터디 플래너'),
    bullet('GET/POST /api/study/subjects - 과목 목록/생성'),
    bullet('PUT/DELETE /api/study/subjects/:id - 과목 수정/삭제'),
    bullet('GET/POST /api/study/sessions - 세션 목록/기록'),
    bullet('GET/PUT /api/study/goal - 일일 목표'),
    h3('친구'),
    bullet('GET /api/friends - 친구 목록'),
    bullet('GET /api/friends/search?q= - 유저 검색'),
    bullet('GET /api/friends/recent - 최근 가입자'),
    bullet('GET /api/friends/requests - 받은 요청'),
    bullet('POST /api/friends/request/:id - 친구 요청'),
    bullet('POST /api/friends/accept/:id - 수락'),
    bullet('POST /api/friends/reject/:id - 거절'),
    bullet('DELETE /api/friends/:id - 친구 삭제'),
    h3('Push 알림'),
    bullet('POST /api/push/subscribe - 구독 등록'),
    bullet('DELETE /api/push/unsubscribe - 구독 해제'),
    divider(),

    // CI/CD
    h2('🚀 CI/CD 파이프라인'),
    bullet('트리거: main 브랜치 push'),
    bullet('1. GitHub Actions: Spring Boot JAR 빌드 (Gradle)'),
    bullet('2. SCP로 서버에 JAR 전송'),
    bullet('3. SSH로 서버 접속'),
    bullet('4. git reset --hard (서버 로컬 변경사항 초기화)'),
    bullet('5. npm install + 프론트 전체 빌드'),
    bullet('6. PM2로 playground(Node.js) 재시작 (환경변수 포함)'),
    bullet('7. PM2로 backend(Spring Boot) 재시작'),
    bullet('8. nginx reload'),
    divider(),

    // 배포 환경
    h2('🌐 배포 환경'),
    bullet('도메인: https://playground.https.gsmsv.site'),
    bullet('서버: Ubuntu 22.04 (학교 서버)'),
    bullet('SSH 포트: 24136'),
    bullet('nginx: HTTP 80 → 3000 proxy (학교 인프라가 HTTPS 처리)'),
    bullet('SSL: Let\'s Encrypt (2026-09-24 만료, 자동 갱신)'),
    bullet('PM2 ecosystem.config.js로 프로세스 관리'),
    divider(),

    // 향후 계획
    h2('📋 향후 개발 계획'),
    bullet('개발자 노트 - 프로젝트 공유 기능 (친구에게 공유)'),
    bullet('Life Tracker 백엔드 API 구현'),
    bullet('알림 센터 (받은 알림 히스토리)'),
    bullet('마이페이지 - 활동 통계'),
    bullet('다크/라이트 테마 토글'),
    divider(),

    // 트러블슈팅
    h2('🔧 트러블슈팅'),

    toggle('JWT 시크릿 불일치 → API 401 에러', [
      p('문제: Node.js에서 발급한 JWT를 Spring Boot가 검증 실패'),
      p('원인: HMAC-SHA256은 최소 32바이트 키 필요. "playground-jwt-secret-2024" (26자)가 너무 짧음'),
      p('해결: JWT_SECRET을 34자 이상으로 변경, Node.js/.env와 Spring Boot application.yml 동일하게 맞춤'),
      code('JWT_SECRET=playground-jwt-secret-2024-secure-key  # 34자', 'plain text'),
    ]),

    toggle('getPrincipal() 순환 참조 → StackOverflow', [
      p('문제: Spring Security AbstractAuthenticationToken.getName()이 무한 루프'),
      p('원인: getPrincipal()을 this로 반환했을 때 getName()이 getPrincipal().toString() 호출 → 순환'),
      p('해결: JwtAuthenticationToken에 getName() 명시적 오버라이드'),
      code('@Override\npublic String getName() { return userId; }', 'java'),
    ]),

    toggle('프록시 POST/PUT 요청 바디 유실', [
      p('문제: Node.js → Spring Boot 프록시 시 POST/PUT 요청의 body가 비어있음'),
      p('원인: express.json()이 바디를 파싱한 후 req 스트림이 소비됨. req.pipe()로 전달 불가'),
      p('해결: 파싱된 req.body를 JSON.stringify로 재직렬화 후 content-length 재계산하여 전달'),
      code('const bodyData = req.body && Object.keys(req.body).length > 0\n  ? JSON.stringify(req.body) : null;\nif (bodyData) {\n  headers["content-length"] = Buffer.byteLength(bodyData).toString();\n  proxyReq.write(bodyData);\n  proxyReq.end();\n}', 'javascript'),
    ]),

    toggle('PM2 restart 시 환경변수 초기화', [
      p('문제: pm2 restart 후 .env 환경변수가 사라져 서버 크래시'),
      p('원인: PM2는 restart 시 초기 실행 시의 환경변수만 유지. .env를 자동으로 재로드하지 않음'),
      p('해결: ecosystem.config.js 생성 + 배포 시 pm2 delete → export env → pm2 start 순서로 변경'),
      code('pm2 delete playground\nexport $(grep -v "^#" .env | xargs)\npm2 start ecosystem.config.js --only playground', 'bash'),
    ]),

    toggle('ERR_TOO_MANY_REDIRECTS (nginx 리다이렉트 루프)', [
      p('문제: https://playground.https.gsmsv.site 접속 시 무한 리다이렉트'),
      p('원인: 학교 서버 인프라에서 HTTPS를 처리 후 HTTP로 nginx에 전달. nginx가 다시 HTTPS로 301 리다이렉트'),
      p('해결: nginx에서 HTTP→HTTPS 리다이렉트 제거, X-Forwarded-Proto: https 헤더 강제 설정'),
      code('server {\n  listen 80;\n  location / {\n    proxy_pass http://127.0.0.1:3000;\n    proxy_set_header X-Forwarded-Proto https;\n  }\n}', 'nginx'),
    ]),

    toggle('Web Push 알림 권한 차단 (HTTP에서 denied)', [
      p('문제: Notification.permission이 "denied"로 알림 팝업이 뜨지 않음'),
      p('원인: Chrome은 HTTP 사이트에서 알림 권한 요청을 자동 차단. HTTPS 필수'),
      p('해결: Let\'s Encrypt SSL 인증서 발급 + nginx HTTPS 설정'),
      code('sudo certbot --nginx -d playground.https.gsmsv.site', 'bash'),
    ]),

    toggle('Push Subscription 404 → 401 → 정상화', [
      p('문제: Node.js에서 /internal/push/subscriptions/{userId} 호출 시 404'),
      p('원인 1: PushController mapping이 /api/push였는데 /internal/push로 호출'),
      p('원인 2: /api/** 패턴에 걸려 인증 필요 → 401'),
      p('해결: 엔드포인트를 /api/push/subscriptions/{userId}로 통일, SecurityConfig에 permitAll 추가'),
      code('.requestMatchers("/api/push/subscriptions/**").permitAll()', 'java'),
    ]),

    toggle('server/index.js git 추적 안 됨', [
      p('문제: git status에서 server/index.js가 M(수정됨)으로 뜨는데 git add 해도 커밋 안 됨'),
      p('원인: server/index.js가 main 브랜치에 한 번도 커밋된 적 없어서 git이 추적 불가'),
      p('해결: git add -f server/index.js로 강제 추가 후 커밋'),
    ]),

    toggle('application.yml git reset으로 덮어씌워지는 문제', [
      p('문제: 서버에서 application.yml 직접 수정 후 git pull 하면 충돌'),
      p('원인: git pull이 로컬 변경사항을 보존하려다 충돌'),
      p('해결: 배포 스크립트를 git pull → git fetch + git reset --hard origin/main으로 변경'),
      p('근본 해결: application.yml의 설정값을 환경변수로 관리 (.env)'),
    ]),

    toggle('subscriptions.map is not a function', [
      p('문제: sendPushNotification에서 TypeError: subscriptions.map is not a function'),
      p('원인: /internal/push/subscriptions 응답이 배열이 아닌 다른 형태로 파싱됨 (404/401 응답)'),
      p('해결: 엔드포인트 경로 수정 + permitAll 설정으로 올바른 배열 응답 수신'),
    ]),

    toggle('Notion Integration 연결 오류 (object_not_found)', [
      p('문제: Notion API 호출 시 "Could not find block" 404 에러'),
      p('원인: Integration이 해당 페이지에 연결되지 않음'),
      p('해결: Notion 페이지 → ... → Connections → Integration 추가'),
    ]),
  ];

  await appendBlocks(blocks);
  console.log('✅ Notion 문서 작성 완료!');
}

// ── 커밋 업데이트 추가 ───────────────────────────────
async function addCommitUpdate() {
  const { execSync } = require('child_process');
  let commitMsg, commitHash, author;
  try {
    commitMsg = execSync('git log -1 --pretty=%s').toString().trim();
    commitHash = execSync('git log -1 --pretty=%h').toString().trim();
    author = execSync('git log -1 --pretty=%an').toString().trim();
  } catch {
    commitMsg = '알 수 없음';
    commitHash = '-';
    author = '-';
  }

  const today = new Date().toLocaleString('ko-KR');
  const blocks = [
    bullet(`[${today}] ${commitHash} - ${commitMsg} (${author})`)
  ];

  // 업데이트 로그 섹션 찾아서 추가 (없으면 새로 만들기)
  await appendBlocks([
    h3(`🔄 최근 업데이트 (${today})`),
    bullet(`커밋: ${commitHash} - ${commitMsg}`),
    bullet(`작성자: ${author}`),
  ]);
  console.log('✅ 커밋 업데이트 추가 완료!');
}

// ── 실행 ─────────────────────────────────────────────
async function main() {
  const mode = process.argv[2];
  if (mode === 'update') {
    await addCommitUpdate();
  } else {
    console.log('📝 Notion 전체 문서 초기화 중...');
    await clearPage();
    await writeFullDoc();
  }
}

main().catch(console.error);
