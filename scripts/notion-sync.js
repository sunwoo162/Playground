require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PAGE_ID = process.env.NOTION_PAGE_ID;

const h1 = (t) => ({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: t } }] } });
const h2 = (t) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: t } }] } });
const h3 = (t) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } });
const b  = (t) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: t } }] } });
const p  = (t) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: t } }] } });
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

async function addToPage(pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 90) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 90) });
  }
}

async function createChildPage(title, blocks) {
  const page = await notion.pages.create({
    parent: { page_id: PAGE_ID },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: title } }],
      },
    },
  });
  await addToPage(page.id, blocks);
  return page;
}

const sectionTemplate = (featureItems, apiItems = [], troubleItems = []) => [
  h2('📋 기능명세서'),
  ...(featureItems.length ? featureItems.map(b) : [p('추가 예정')]),
  div(),
  h2('🔌 API 명세서'),
  ...(apiItems.length ? apiItems.map(b) : [p('해당 없음 또는 추가 예정')]),
  div(),
  h2('🔧 트러블슈팅'),
  ...(troubleItems.length ? troubleItems.map(b) : [p('추가 예정')]),
];

const implementedWebDocs = [
  {
    title: '1. 놀이터',
    features: [
      '여러 웹앱으로 이동할 수 있는 포털 홈',
      'GitHub OAuth 로그인 및 로그인 상태 표시',
      '친구 요청, 최근 가입자, 받은 요청 뱃지',
      '전역 Web Push 알림 및 앱별 이동 링크',
    ],
    apis: [
      'GET /auth/github - GitHub OAuth 시작',
      'GET /auth/github/callback - OAuth 콜백 처리 및 JWT 발급',
      'GET /auth/me - 현재 로그인 사용자 조회',
      'POST /auth/logout - 로그아웃',
      'POST /internal/push/send - 내부 Web Push 발송',
    ],
    troubles: [
      'HTTPS 프록시 환경에서 ERR_TOO_MANY_REDIRECTS 발생 → nginx 리다이렉트 제거 및 X-Forwarded-Proto 보정',
      'PM2 restart 시 환경변수 누락 → ecosystem.config.js 기준으로 프로세스 재시작',
    ],
  },
  {
    title: '2. 개발자 노트',
    features: [
      '프로젝트별 기능명세서, API 명세서, 사용자 분석 관리',
      '프로젝트 공유 및 에디터 권한 관리',
      '프로젝트 수정 시 팀원에게 Web Push 알림',
      '공유 팀원 목록에서 OWNER/EDITOR 역할 표시',
    ],
    apis: [
      'Dev Notes API - 프로젝트 CRUD',
      'Project Share API - 공유 초대/수락/권한 관리',
      'Push API - 프로젝트 공유 및 수정 알림',
    ],
    troubles: [
      '공유 팀원 목록에 소유자 미표시 → 소유자를 OWNER 역할로 목록에 별도 추가',
      '프록시 POST/PUT 요청 바디 유실 → req.body 재직렬화 및 content-length 재계산',
    ],
  },
  {
    title: '3. 스터디 플래너',
    features: [
      '과목별 공부 타이머',
      '공부 세션 기록, 통계, 달력 히트맵',
      '타이머 실행 중 전역 헤더 뱃지 표시',
      '그룹 초대 및 수락 기반 참여',
      '매일 오전/오후 10시 공부 기록 알림',
    ],
    apis: [
      'Study Planner API - 과목/세션/목표 CRUD',
      'Study Group API - 그룹 초대/수락/멤버 관리',
      'Push API - 스터디 알림 발송',
    ],
    troubles: [
      '다른 앱 이동 후 타이머 초기화 → 시작 시각을 localStorage에 저장하고 로드 시 경과 시간 복원',
      'ISO 8601 Z suffix 파싱 실패 → Instant.parse 후 LocalDateTime 변환',
    ],
  },
  {
    title: '4. 코넬노트',
    features: [
      '키워드/질문, 세부 내용, 요약 3단 구조 노트',
      '과목별 분류 및 색상 관리',
      '노트 검색 및 목록/상세/수정 화면',
      'GitHub 레포 설정 후 Markdown 커밋',
      '세부 내용 웹 보기 및 공유 기능',
    ],
    apis: [
      'POST /github/commit-file - 코넬노트 Markdown 파일 GitHub 커밋',
      'Cornell Notes localStorage 저장 구조 - 노트/과목 설정 저장',
    ],
    troubles: [
      'GitHub 레포 입력 형식 혼동 → owner/repo 형식으로 정규화 안내',
      '커밋 시 빈 키워드/요약도 포함됨 → 내용이 있을 때만 Markdown 섹션 생성',
    ],
  },
  {
    title: '5. 코테일지',
    features: [
      '프로그래머스/백준 풀이 기록',
      '접근법, 코드, 시간복잡도, 태그 관리',
      '공개 풀이 커뮤니티 공유',
      'Discord 봇 연동으로 풀이 작성 링크 제공',
      'GitHub 레포에 풀이 코드 커밋',
    ],
    apis: [
      'Coding Log API - 풀이 CRUD 및 공개 목록 조회',
      'POST /github/commit - 코딩테스트 풀이 GitHub 커밋',
      'BaekjoonHub webhook - 풀이 성공 이벤트 처리',
    ],
    troubles: [
      '로그아웃 상태 URL 직접 접근 시 문제 정보 소실 → returnTo 저장 후 로그인 복귀',
      'localStorage에서 DB 전환 후 기존 데이터 미노출 → 신규 데이터부터 DB 저장 정책으로 정리',
    ],
  },
  {
    title: '6. 학교 알리미',
    features: [
      '학교 검색 및 학년/반 선택',
      '급식표와 시간표 날짜별 조회',
      '아침/점심/저녁 탭 및 시간대별 기본 선택',
      '여러 급식 알림 설정',
      '알레르기/싫어하는 식재료 카테고리 표시',
      'Chrome 확장프로그램 compact 팝업 제공',
    ],
    apis: [
      'GET /neis/school?q= - 학교 검색',
      'GET /neis/meal?orgCode=&schoolCode=&date= - 급식 조회',
      'GET /neis/timetable?orgCode=&schoolCode=&schoolType=&grade=&className=&date= - 시간표 조회',
    ],
    troubles: [
      'NEIS API 부분 검색 미지원 → 서버 시작 시 전국 학교 목록 캐싱 후 includes 검색',
      'Vite optional native binding 누락 → Linux용 rolldown/lightningcss optional dependency 추가',
      '확장 팝업에서 스크롤 이중 생성 → compact 모드별 스크롤 컨테이너 분리',
    ],
  },
];

async function createImplementedWebDocs() {
  await add([
    h2('📱 구현된 웹'),
    p('아래 항목을 클릭하면 각 웹 기능의 기능명세서, API 명세서, 트러블슈팅 문서로 이동합니다.'),
  ]);

  for (const item of implementedWebDocs) {
    await createChildPage(
      item.title,
      sectionTemplate(item.features, item.apis, item.troubles),
    );
  }

  await add([div()]);
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
    b('React 19 + TypeScript + Vite (각 앱별 독립 빌드)'),
    b('SPA 구조, CSS Variables 기반 다크 테마'),
    b('Web Push API (Service Worker) - 브라우저 푸시 알림'),
    b('localStorage / API 하이브리드 데이터 저장'),
    h3('Backend'),
    b('Spring Boot 3.3 (Java 17) - REST API 서버 (8080포트)'),
    b('Node.js + Express - OAuth 처리 / 정적 파일 서빙 / API 프록시 (3000포트)'),
    b('MySQL 8.0 - 데이터 영속성'),
    b('Spring Security + JWT (HMAC-SHA256, Access 1h / Refresh 7d)'),
    h3('외부 API'),
    b('GitHub OAuth - 로그인'),
    b('나이스(NEIS) Open API - 전국 학교 급식 정보'),
    b('Discord Webhook - 코딩테스트 풀이 알림'),
    h3('Infrastructure'),
    b('PM2 ecosystem.config.js - 프로세스 관리'),
    b('nginx - 리버스 프록시 + SSL termination'),
    b("Let's Encrypt - 무료 SSL 인증서"),
    b('GitHub Actions - CI/CD 자동 배포'),
    div(),
  ]);

  await add([
    h2('🏗 시스템 아키텍처'),
    code('브라우저\n  ↓ HTTPS\nnginx (80)\n  ↓ HTTP proxy\nNode.js :3000\n  ├── GitHub OAuth (로그인/콜백)\n  ├── JWT 발급 (Access 1h / Refresh 7d)\n  ├── Web Push 발송 (web-push + VAPID)\n  ├── 나이스 API 프록시 (/neis/**)\n  ├── 정적 파일 서빙 (각 앱 dist)\n  └── /api/** → Spring Boot :8080\n        ├── JwtAuthFilter (쿠키 토큰 검증)\n        ├── Dev Notes API\n        ├── Study Planner API\n        ├── Friend API\n        ├── Push Subscription API\n        ├── Coding Log API\n        └── Project Share API'),
    div(),
    h2('🔐 인증 시스템'),
    h3('GitHub OAuth + JWT 흐름'),
    b('1. /auth/github → GitHub OAuth 인증 페이지 (returnTo 세션 저장)'),
    b('2. GitHub 콜백 → code → access_token 교환'),
    b('3. GitHub API로 유저 정보 조회 → DB upsert'),
    b('4. JWT Access Token(1h) + Refresh Token(7d) 발급 → 쿠키'),
    b('5. Spring Boot JwtAuthFilter: 쿠키에서 토큰 추출 → 검증 → SecurityContext'),
    b('6. 로그인 후 returnTo 세션 값으로 원래 페이지 복귀'),
    h3('토큰 자동 갱신'),
    b('만료 5분 전 자동으로 /api/auth/refresh 호출'),
    b('Refresh Token payload에 id만 포함 → DB에서 유저 정보 조회 후 재발급'),
    b('헤더에 남은 시간 실시간 표시 + 1초마다 갱신'),
    div(),
  ]);

  await createImplementedWebDocs();

  await add([
    h2('📱 구현된 앱'),
    h3('1. 개발자 노트 (Dev Notes)'),
    b('프로젝트별 기능명세서, API 명세서, 사용자 분석 통합 관리'),
    b('API 명세서: Method, Endpoint, Headers, Query Params, Request/Response Body'),
    b('프로젝트 공유: 소유자/에디터 권한으로 다중 사용자 공동 작업'),
    b('수정 시 모든 팀원에게 Web Push 알림'),
    b('공유 팀원 목록: 소유자(OWNER)와 에디터(EDITOR) 구분 표시'),
    h3('2. 스터디 플래너 (Study Planner)'),
    b('과목별 타이머 + 1시간마다 Web Push 알림 (3초 후 자동 닫힘)'),
    b('타이머 상태 localStorage 영속화 → 다른 페이지 이동 후 복귀해도 유지'),
    b('메인 헤더에 타이머 실행 중 뱃지 표시 (모든 앱에서 확인 가능)'),
    b('타이머 종료 시 모달: 오늘 공부 끝? → 코넬 노트 바로가기'),
    b('공부 세션 기록 + 통계 + 달력 히트맵'),
    h3('3. 코넬 노트 (Cornell Notes)'),
    b('키워드/질문 + 세부 내용 + 요약 3단 구조'),
    b('과목별 분류 + 검색 기능'),
    b('색상 커스터마이징 과목 관리'),
    h3('4. 코테 일지 (Coding Log)'),
    b('프로그래머스 · 백준 풀이 기록 (접근법 + 코드 + 시간복잡도 + 태그)'),
    b('공개/비공개 설정 → 커뮤니티 탭에서 공개 풀이 공유'),
    b('작성자 프로필(아바타 + @login) 표시'),
    b('Discord 봇 연동: 코딩테스트 성공 커밋 → 디스코드 알림 → 해설 작성 링크'),
    b('URL 파라미터로 문제 정보 자동 채우기 (?title=&level=&platform=)'),
    b('미로그인 상태 접근 시 returnTo 저장 → 로그인 후 자동 복귀'),
    h3('5. 급식 알리미 (School Meal)'),
    b('나이스 API로 전국 12,660개 학교 정보 서버 캐싱'),
    b('학교명 부분 검색 (예: "화" 입력 → 화 포함 모든 학교)'),
    b('날짜 이동 (전날/다음날) + 아침/점심/저녁 탭'),
    b('급식 시간 전 Web Push 알림 (시간 설정 가능)'),
    h3('6. Life Tracker'),
    b('실패 기록, 버린 시간, 작은 성취를 날짜별로 기록'),
    h3('준비 중'),
    b('습관 트래커, 독서 기록, 가계부, 운동 로그 등'),
    div(),
  ]);

  await add([
    h2('👥 소셜 기능'),
    h3('친구 시스템'),
    b('놀이터 가입 유저 GitHub 아이디 부분 검색'),
    b('친구 요청 / 수락 / 거절 / 삭제'),
    b('최근 가입자 목록 표시'),
    b('받은 친구 요청 뱃지'),
    h3('Web Push 알림'),
    b('VAPID 키 기반 Web Push (브라우저 꺼져도 수신)'),
    b('트리거: 친구 요청 / 프로젝트 공유 / 프로젝트 수정 / 스터디 1시간 달성'),
    b('Service Worker (/sw.js)로 백그라운드 수신'),
    b('알림 클릭 시 해당 페이지로 이동'),
    b('3초 후 자동 닫힘 (tag로 중복 방지)'),
    div(),
  ]);

  await add([
    h2('🌐 배포 환경'),
    b('도메인: https://playground.https.gsmsv.site'),
    b('서버: Ubuntu 22.04 (학교 서버, SSH 포트: 24136)'),
    b('nginx: HTTP 80 → 3000 proxy (학교 인프라가 HTTPS 처리)'),
    b("SSL: Let's Encrypt (2026-09-24 만료, 자동 갱신)"),
    b('PM2 ecosystem.config.js로 playground + backend 프로세스 관리'),
    div(),
    h2('📋 향후 개발 계획'),
    b('급식 알리미 - 크롬 확장 프로그램으로 다른 웹에서도 확인'),
    b('코테 일지 - 커뮤니티 풀이 좋아요/댓글'),
    b('개발자 노트 - 실시간 공동 편집 (WebSocket)'),
    b('Life Tracker 백엔드 API 구현'),
    b('알림 센터 (받은 알림 히스토리)'),
    b('마이페이지 활동 통계'),
    div(),
  ]);

  await add([
    h2('🔧 트러블슈팅'),
    note('개발 중 발생한 문제와 해결 과정을 기록합니다.', '🐛'),
    h3('[ 백엔드 ]'),
  ]);

  await add([
    h3('1. JWT 시크릿 길이 부족 → API 401'),
    b('문제: Node.js JWT를 Spring Boot가 검증 실패'),
    b('원인: HMAC-SHA256 최소 32바이트 필요, 기존 키 26자'),
    b('해결: JWT_SECRET 34자로 변경 (playground-jwt-secret-2024-secure-key)'),
    h3('2. getPrincipal() 순환 참조 → StackOverflow'),
    b('문제: Spring Security getName() 무한 루프 → 500 에러'),
    b('원인: getPrincipal()=this → getName()→getPrincipal()→...'),
    b('해결: @Override public String getName() { return userId; }'),
    h3('3. Refresh Token에 유저 정보 없음'),
    b('문제: 토큰 갱신 후 이름/아바타가 null인 Access Token 발급'),
    b('원인: Refresh Token payload에 id만 있고 login/name/avatarUrl 없음'),
    b('해결: /api/auth/refresh에서 DB 조회 후 유저 정보 포함해 발급'),
    h3('4. DateTimeParseException - ISO 8601 Z suffix 파싱 실패'),
    b('문제: 스터디 세션 저장 시 500 에러'),
    b('원인: LocalDateTime.parse()가 "2026-07-02T02:06:33.669Z" 파싱 불가'),
    b('해결: Instant.parse(s).atOffset(ZoneOffset.UTC).toLocalDateTime() 사용'),
    h3('5. 공유 팀원 목록에 소유자 미표시'),
    b('원인: project_shares에 소유자 row 없음'),
    b('해결: 소유자를 OWNER 역할로 목록 맨 앞에 별도 추가'),
  ]);

  await add([
    h3('[ 프론트엔드 ]'),
    h3('6. 프록시 POST/PUT 요청 바디 유실'),
    b('문제: Node.js→Spring Boot 프록시 시 body가 빈 값으로 전달'),
    b('원인: express.json()이 req 스트림 소비 → req.pipe() 불가'),
    b('해결: req.body를 JSON.stringify 재직렬화 + content-length 재계산'),
    code('const bodyData = JSON.stringify(req.body);\nheaders["content-length"] = Buffer.byteLength(bodyData).toString();\nproxyReq.write(bodyData); proxyReq.end();', 'javascript'),
    h3('7. PM2 restart 환경변수 초기화 (메모리 4.0kb)'),
    b('문제: pm2 restart 후 .env 환경변수 소실 → 앱 크래시'),
    b('원인: PM2는 restart 시 초기 환경변수만 유지, .env 재로드 안 함'),
    b('해결: ecosystem.config.js 생성 + 배포 시 pm2 delete → export → pm2 start'),
    h3('8. ERR_TOO_MANY_REDIRECTS'),
    b('원인: 학교 인프라가 HTTPS 처리 후 HTTP로 전달, nginx가 또 301 리다이렉트'),
    b('해결: nginx 리다이렉트 제거, proxy_set_header X-Forwarded-Proto https 강제'),
    h3('9. Web Push 알림 권한 차단 (permission: denied)'),
    b('원인: HTTP 사이트에서 Chrome 알림 자동 차단'),
    b('해결: Let\'s Encrypt HTTPS 적용 → 알림 권한 팝업 정상 표시'),
    h3('10. server/index.js git 추적 불가'),
    b('원인: main 브랜치에 한 번도 커밋 안 됨 (history 없음)'),
    b('해결: git add -f server/index.js로 강제 추가'),
    h3('11. 스터디 플래너 다른 앱 이동 후 타이머 초기화'),
    b('문제: 페이지 이동 시 React state 초기화됨'),
    b('해결: 타이머 시작 시각을 localStorage에 저장, 앱 로드 시 경과 시간 계산해 복원'),
    code('localStorage.setItem("study-planner-timer", JSON.stringify({running:true, startTime:now.toISOString(), subjectId}));', 'javascript'),
    h3('12. 코테 일지 로그아웃 상태 URL 직접 접근 허용'),
    b('문제: useAuth가 "/" 리다이렉트 시 URL 파라미터(문제 정보)가 소실'),
    b('해결 1: useAuth에서 /?returnTo=현재URL로 이동'),
    b('해결 2: /auth/github?returnTo=URL → 서버 세션에 저장 → 로그인 후 복귀'),
    h3('13. NEIS API 부분 검색 미지원'),
    b('문제: SCHUL_NM 파라미터가 완전 일치만 지원, "화" 입력 시 결과 없음'),
    b('해결: 서버 시작 시 전국 12,660개 학교 목록 캐시 (13페이지 × 1000개)'),
    b('캐시에서 includes() 부분 검색으로 즉시 응답'),
    h3('14. 코테 일지 DB 전환 후 기존 데이터 소실'),
    b('문제: localStorage → DB 전환 시 이전 데이터 접근 불가'),
    b('원인: 정상 동작, localStorage 데이터는 DB로 마이그레이션 안 됨'),
    b('결론: 신규 데이터부터 DB 저장, 이전 데이터는 버림'),
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
