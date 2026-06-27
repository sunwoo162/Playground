/**
 * Notion 동기화 스크립트
 * 사용법:
 *   node scripts/notion-sync.js          # 전체 문서 초기화 + 작성
 *   node scripts/notion-sync.js update   # 최근 커밋 내용 추가
 */
require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PAGE_ID = process.env.NOTION_PAGE_ID;

const h1 = (t) => ({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: t } }] } });
const h2 = (t) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: t } }] } });
const h3 = (t) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } });
const p  = (t) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: t } }] } });
const b  = (t) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: t } }] } });
const div = () => ({ object: 'block', type: 'divider', divider: {} });
const note = (t, e = '💡') => ({ object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: t } }], icon: { type: 'emoji', emoji: e } } });
const code = (t, lang = 'plain text') => ({ object: 'block', type: 'code', code: { rich_text: [{ type: 'text', text: { content: t } }], language: lang } });
const tog = (title, children) => ({ object: 'block', type: 'toggle', toggle: { rich_text: [{ type: 'text', text: { content: title } }], children } });

async function clearPage() {
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: PAGE_ID, start_cursor: cursor });
    for (const block of res.results) await notion.blocks.delete({ block_id: block.id });
    cursor = res.next_cursor;
  } while (cursor);
}

async function add(blocks) {
  for (let i = 0; i < blocks.length; i += 90) {
    await notion.blocks.children.append({ block_id: PAGE_ID, children: blocks.slice(i, i + 90) });
  }
}

async function writeFullDoc() {
  const today = new Date().toLocaleDateString('ko-KR');

  await add([
    h1('🎮 놀이터 (Playground) 개발 문서'),
    note(`마지막 업데이트: ${today}`, '📅'),
    p('나만의 작은 웹앱들을 모아둔 포털 사이트. GitHub OAuth 로그인 하나로 모든 앱을 사용할 수 있으며, 친구 추가 및 알림 기능을 갖춘 소셜 플랫폼.'),
    div(),
    h2('📌 프로젝트 개요'),
    b('사이트 URL: https://playground.https.gsmsv.site'),
    b('GitHub: https://github.com/sunwoo162/Playground'),
    b('Discord: https://discord.gg/HMGqRsJYcD'),
    b('배포 서버: Ubuntu (학교 서버 gsmsv.site)'),
    b('개발 기간: 2026-06-14 ~'),
    div(),
  ]);

  await add([
    h2('🛠 기술 스택'),
    h3('Frontend'),
    b('React 19 + TypeScript + Vite'),
    b('SPA 구조, CSS Variables 기반 다크 테마'),
    b('Web Push API (Service Worker)'),
    h3('Backend'),
    b('Spring Boot 3.3 (Java 17) - REST API 서버 (8080포트)'),
    b('Node.js + Express - OAuth 처리 및 정적 파일 서빙 (3000포트)'),
    b('MySQL 8.0 - 데이터 영속성'),
    b('Spring Security + JWT (HMAC-SHA256)'),
    h3('Infrastructure'),
    b('PM2 - 프로세스 관리 (ecosystem.config.js)'),
    b('nginx - 리버스 프록시 + SSL termination'),
    b("Let's Encrypt - 무료 SSL 인증서"),
    b('GitHub Actions - CI/CD 자동 배포'),
    div(),
  ]);

  await add([
    h2('🏗 아키텍처'),
    code('브라우저\n  ↓ HTTPS\nnginx (80)\n  ↓ HTTP proxy\nNode.js :3000\n  ├── GitHub OAuth\n  ├── JWT 발급 (Access 1h / Refresh 7d)\n  ├── Web Push 발송\n  └── /api/** → Spring Boot :8080\n        ├── JwtAuthFilter\n        ├── Dev Notes API\n        ├── Study Planner API\n        ├── Friend API\n        └── Push Subscription API'),
    div(),
    h2('🔐 인증 시스템'),
    h3('GitHub OAuth Flow'),
    b('1. /auth/github → GitHub 인증 페이지'),
    b('2. 콜백에서 code 수신 → access_token 교환'),
    b('3. GitHub API로 유저 정보 조회'),
    b('4. JWT Access Token(1h) + Refresh Token(7d) 발급 → 쿠키'),
    b('5. Spring Boot JwtAuthFilter에서 쿠키 검증'),
    h3('토큰 자동 갱신'),
    b('만료 5분 전 자동으로 /api/auth/refresh 호출'),
    b('Refresh Token으로 새 Access Token 발급 (DB에서 유저 정보 조회)'),
    b('프론트 헤더에 남은 시간 실시간 표시 (🔑 59분 23초)'),
    div(),
  ]);

  await add([
    h2('📱 구현된 앱'),
    h3('1. 개발자 노트 (Dev Notes)'),
    b('프로젝트별 기능명세서, API 명세서, 사용자 분석 관리'),
    b('API 명세서: Method, Endpoint, Headers, Query Params, Request/Response Body'),
    b('친구와 공동 작업 (소유자/에디터 권한)'),
    b('공유/수정 시 팀원에게 Web Push 알림'),
    h3('2. 스터디 플래너 (Study Planner)'),
    b('과목별 공부 시간 타이머'),
    b('공부 세션 기록 및 통계'),
    b('일일 목표 설정 + 달력 히트맵'),
    h3('3. Life Tracker (준비 중)'),
    b('실패, 버린 시간, 작은 성취 기록'),
    div(),
    h2('👥 소셜 기능'),
    h3('친구 시스템'),
    b('GitHub 아이디로 놀이터 가입 유저 검색'),
    b('친구 요청 / 수락 / 거절 / 삭제'),
    b('최근 가입자 목록 표시'),
    h3('Web Push 알림'),
    b('VAPID 키 기반 Web Push (브라우저 꺼져도 알림)'),
    b('친구 요청 / 프로젝트 공유 / 수정 시 실시간 알림'),
    b('Service Worker로 백그라운드 수신'),
    div(),
  ]);

  await add([
    h2('🗄 데이터베이스 스키마'),
    tog('users', [code('github_id (PK), login, name, avatar_url, created_at, last_login_at')]),
    tog('projects', [code('id (PK), user_id, title, description, overview (JSON), created_at, updated_at')]),
    tog('feature_specs', [code('id (PK), project_id (FK), title, description, priority, status')]),
    tog('api_specs', [code('id (PK), project_id (FK), method, endpoint, headers, query_params, request_body, response_body')]),
    tog('project_shares', [code('id (PK), project_id (FK), user_id, created_at')]),
    tog('user_analyses', [code('id (PK), project_id (FK), persona, goal, pain_point')]),
    tog('subjects', [code('id (PK), user_id, name, color, daily_goal_minutes')]),
    tog('study_sessions', [code('id (PK), user_id, subject_id, date, start_time, end_time, duration_minutes')]),
    tog('daily_goals', [code('user_id (PK), total_minutes')]),
    tog('friendships', [code('id (PK), requester_id, receiver_id, status (PENDING/ACCEPTED/REJECTED), created_at')]),
    tog('push_subscriptions', [code('id (PK), user_id, endpoint, p256dh, auth_key, created_at')]),
    div(),
  ]);

  await add([
    h2('🔌 API 목록'),
    h3('인증'),
    b('GET /api/auth/me | POST /api/auth/refresh'),
    h3('개발자 노트'),
    b('GET/POST /api/dev-notes/projects'),
    b('PUT/DELETE /api/dev-notes/projects/:id'),
    b('POST /api/dev-notes/projects/:id/share/:userId'),
    b('DELETE /api/dev-notes/projects/:id/share/:userId'),
    b('GET /api/dev-notes/projects/:id/share'),
    h3('스터디 플래너'),
    b('GET/POST /api/study/subjects | PUT/DELETE /api/study/subjects/:id'),
    b('GET/POST /api/study/sessions | GET/PUT /api/study/goal'),
    h3('친구'),
    b('GET /api/friends | GET /api/friends/search?q='),
    b('GET /api/friends/recent | GET /api/friends/requests'),
    b('POST /api/friends/request/:id | POST /api/friends/accept/:id'),
    b('POST /api/friends/reject/:id | DELETE /api/friends/:id'),
    h3('Push 알림'),
    b('POST /api/push/subscribe | DELETE /api/push/unsubscribe'),
    div(),
  ]);

  await add([
    h2('🚀 CI/CD 파이프라인'),
    b('트리거: main 브랜치 push'),
    b('1. Spring Boot JAR 빌드 (Gradle)'),
    b('2. SCP로 서버에 JAR 전송'),
    b('3. git reset --hard origin/main'),
    b('4. npm install + 프론트 빌드'),
    b('5. PM2 playground/backend 재시작'),
    b('6. nginx reload'),
    b('7. Notion 자동 업데이트'),
    div(),
    h2('🌐 배포 환경'),
    b('도메인: https://playground.https.gsmsv.site'),
    b('서버: Ubuntu 22.04 (학교 서버)'),
    b('SSH 포트: 24136'),
    b('nginx: HTTP 80 → 3000 proxy (학교 인프라가 HTTPS 처리)'),
    b("SSL: Let's Encrypt (2026-09-24 만료, 자동 갱신)"),
    div(),
    h2('📋 향후 개발 계획'),
    b('Life Tracker 백엔드 API 구현'),
    b('알림 센터 (받은 알림 히스토리)'),
    b('마이페이지 - 활동 통계'),
    b('다크/라이트 테마 토글'),
    div(),
  ]);

  await add([
    h2('🔧 트러블슈팅'),
    note('개발 중 발생한 문제와 해결 과정을 기록합니다.', '🐛'),
    h3('1. JWT 시크릿 불일치 → API 401'),
    b('문제: Node.js JWT를 Spring Boot가 검증 실패'),
    b('원인: HMAC-SHA256 최소 32바이트 필요, 기존 키 26자'),
    b('해결: JWT_SECRET 34자로 변경 (playground-jwt-secret-2024-secure-key)'),
    h3('2. getPrincipal() 순환 참조 → StackOverflow'),
    b('문제: getName()이 무한 루프 → 500 에러'),
    b('원인: getPrincipal()=this → getName()→getPrincipal()→...'),
    b('해결: @Override public String getName() { return userId; }'),
    h3('3. 프록시 POST/PUT 바디 유실'),
    b('문제: Node.js→Spring Boot 프록시 시 body 빈 값'),
    b('원인: express.json()이 스트림 소비 → req.pipe() 불가'),
    b('해결: JSON.stringify 재직렬화 + content-length 재계산'),
    h3('4. PM2 restart 환경변수 초기화'),
    b('문제: restart 후 .env 소실 → 크래시 (메모리 4.0kb)'),
    b('해결: ecosystem.config.js + pm2 delete → export → pm2 start'),
    h3('5. ERR_TOO_MANY_REDIRECTS'),
    b('원인: 학교 인프라 HTTPS 처리 후 nginx가 또 301 리다이렉트'),
    b('해결: nginx 리다이렉트 제거 + proxy_set_header X-Forwarded-Proto https'),
    h3('6. Web Push 권한 차단'),
    b('원인: HTTP 사이트에서 Chrome 알림 자동 차단'),
    b('해결: Let\'s Encrypt SSL 인증서 발급'),
    h3('7. Push Subscription 404 → 401'),
    b('원인: 잘못된 엔드포인트 경로 + /api/** 인증 필요'),
    b('해결: /api/push/subscriptions + SecurityConfig permitAll 추가'),
    h3('8. server/index.js git 추적 불가'),
    b('원인: main 브랜치에 한 번도 커밋 안 됨'),
    b('해결: git add -f server/index.js'),
    h3('9. application.yml 배포 충돌'),
    b('원인: 서버 로컬 수정 후 git pull 충돌'),
    b('해결: git reset --hard origin/main으로 강제 동기화'),
    h3('10. 공유 팀원에 소유자 미표시'),
    b('원인: project_shares에 소유자 row 없음'),
    b('해결: 소유자를 OWNER 역할로 목록 앞에 별도 추가'),
  ]);

  console.log('✅ Notion 문서 작성 완료!');
}

async function addCommitUpdate() {
  const { execSync } = require('child_process');
  let msg = '알 수 없음', hash = '-', author = '-';
  try {
    msg    = execSync('git log -1 --pretty=%s').toString().trim();
    hash   = execSync('git log -1 --pretty=%h').toString().trim();
    author = execSync('git log -1 --pretty=%an').toString().trim();
  } catch {}
  const today = new Date().toLocaleString('ko-KR');
  await add([
    h3(`🔄 업데이트 (${today})`),
    b(`커밋: ${hash} - ${msg}`),
    b(`작성자: ${author}`),
  ]);
  console.log('✅ 커밋 업데이트 추가 완료!');
}

async function main() {
  if (process.argv[2] === 'update') {
    await addCommitUpdate();
  } else {
    console.log('📝 Notion 전체 문서 초기화 중...');
    await clearPage();
    await writeFullDoc();
  }
}

main().catch(console.error);
