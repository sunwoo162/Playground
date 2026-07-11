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

async function updateRootPageTitle(title = '놀이터') {
  await notion.pages.update({
    page_id: PAGE_ID,
    properties: {
      title: {
        title: [{ type: 'text', text: { content: title } }],
      },
    },
  });
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

async function createNestedPage(parentPageId, title, blocks) {
  const page = await notion.pages.create({
    parent: { page_id: parentPageId },
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

const detailedWebDocs = [
  {
    title: '1. 놀이터',
    summary: '전체 앱으로 이동하는 메인 포털이며 로그인, 친구, 알림, 최근 활동을 한 화면에서 관리한다.',
    featureRows: [
      ['로그인', '메인', 'GitHub OAuth 로그인', 'GitHub 계정으로 로그인하고 JWT 쿠키를 발급받는다.', '로그인 후 원래 보던 페이지로 돌아가기 위해 returnTo를 유지한다.'],
      ['앱 런처', '메인', '앱 카드 이동', '개발자 노트, 스터디 플래너, 코넬노트, 코테일지, 학교 알리미로 이동한다.', '각 앱은 독립 Vite 앱이라 카드 링크는 앱별 dist 경로로 분리한다.'],
      ['친구', '친구 페이지', '친구 검색/요청/수락', '가입 유저와 최근 가입자를 조회하고 친구 요청을 처리한다.', '이미 친구이거나 요청 중인 사용자는 중복 요청을 막는다.'],
      ['알림', '전역 헤더', 'Web Push 알림', '친구 요청, 공유 초대, 스터디 알림을 브라우저 푸시로 받는다.', '앱이 닫혀도 알림이 와야 해서 Service Worker 기반 Web Push를 사용한다.'],
    ],
    apiRows: [
      ['OAuth 로그인', 'GET', '/auth/github', 'Public', 'GitHub OAuth 인증 페이지로 이동한다.', 'returnTo query를 세션에 저장한다.'],
      ['OAuth 콜백', 'GET', '/auth/github/callback', 'Public', 'GitHub code를 토큰으로 교환하고 사용자 정보를 저장한다.', 'Access/Refresh Token 쿠키 발급.'],
      ['내 정보', 'GET', '/auth/me', 'ROLE_USER', '현재 로그인한 사용자 정보를 반환한다.', '헤더 프로필과 권한 체크에 사용.'],
      ['로그아웃', 'POST', '/auth/logout', 'ROLE_USER', '인증 쿠키를 제거한다.', '프론트 상태도 함께 초기화.'],
    ],
    troubleRows: [
      ['HTTPS 리다이렉트 반복', '학교 프록시가 HTTPS를 처리한 뒤 Node에는 HTTP로 전달해 nginx가 계속 HTTPS 리다이렉트했다.', 'nginx 강제 리다이렉트를 제거하고 X-Forwarded-Proto를 https로 고정했다.', '사용자 입장에서는 접속 자체가 막히는 치명 문제라 배포 안정성을 우선했다.'],
      ['PM2 환경변수 누락', 'pm2 restart만 하면 새 .env 값이 반영되지 않았다.', 'ecosystem.config.js 기준으로 프로세스를 재시작하도록 배포 절차를 정리했다.', '재시작 방식이 매번 다르면 운영 서버에서 같은 문제가 반복되므로 배포 절차를 고정했다.'],
    ],
  },
  {
    title: '2. 개발자 노트',
    summary: '프로젝트별 기능명세서, API 명세서, 분석 내용과 공유 협업을 관리한다.',
    featureRows: [
      ['프로젝트', '목록/상세', '프로젝트 CRUD', '프로젝트를 생성하고 기능, API, 분석 문서를 관리한다.', '기능명세서와 API 명세서를 한 프로젝트 단위로 묶어 관리한다.'],
      ['공유', '공유 설정', '사용자 초대', '다른 사용자를 초대하고 수락 후 참여하도록 한다.', '초대 즉시 참여시키지 않고 수락 플로우를 둬 권한 오작동을 줄인다.'],
      ['권한', '공유 목록', 'OWNER/EDITOR 구분', '소유자와 편집자를 구분해서 표시한다.', '소유자는 share row가 없어도 목록에 보여야 해서 별도 합성한다.'],
      ['알림', '공유 초대', '초대 알림', '개발자 노트 공유 초대 시 대상 사용자에게 알림을 보낸다.', '협업 기능은 초대를 놓치면 사용성이 크게 떨어져 Web Push를 연결했다.'],
    ],
    apiRows: [
      ['프로젝트 목록', 'GET', '/api/dev-notes/projects', 'ROLE_USER', '내 프로젝트와 공유받은 프로젝트 목록을 반환한다.', 'OWNER/EDITOR role 포함.'],
      ['프로젝트 생성', 'POST', '/api/dev-notes/projects', 'ROLE_USER', '새 개발자 노트 프로젝트를 생성한다.', 'title, description 입력.'],
      ['프로젝트 수정', 'PUT', '/api/dev-notes/projects/{id}', 'OWNER/EDITOR', '프로젝트 문서 내용을 수정한다.', '권한 체크 필수.'],
      ['공유 초대', 'POST', '/api/dev-notes/projects/{id}/invites', 'OWNER', '사용자를 프로젝트에 초대한다.', '수락 전까지 pending 상태.'],
      ['초대 수락', 'POST', '/api/dev-notes/invites/{id}/accept', 'ROLE_USER', '받은 초대를 수락하고 프로젝트에 참여한다.', '수락 후 공유 멤버 생성.'],
    ],
    troubleRows: [
      ['소유자 미표시', '소유자는 project_shares에 row가 없어 공유 목록에서 빠졌다.', '소유자를 OWNER role로 별도 추가해서 목록을 합쳤다.', '공유 관점에서 소유자가 안 보이면 권한 구조를 이해하기 어려워서 명시 표시했다.'],
      ['요청 body 유실', 'Node 프록시에서 req stream을 이미 소비해 Spring으로 빈 body가 전달됐다.', 'req.body를 JSON.stringify 후 content-length를 다시 계산해 전달했다.', '프록시 계층을 유지하면서 기존 API 서버 코드를 크게 바꾸지 않는 해결책이었다.'],
    ],
  },
  {
    title: '3. 스터디 플래너',
    summary: '과목, 목표, 타이머, 그룹 초대, 공부 기록 알림을 관리한다.',
    featureRows: [
      ['과목', '메인', '과목/목표 관리', '공부 과목과 목표 시간을 관리한다.', '반복 사용 화면이라 카드보다 밀도 있는 목록을 우선한다.'],
      ['타이머', '상단/전역', '공부 타이머', '타이머 진행 상태를 헤더와 앱 내부에서 함께 보여준다.', '페이지 이동 후에도 계속 보여야 해서 localStorage로 복원한다.'],
      ['그룹', '그룹 관리', '그룹 초대/수락', '사용자를 검색해 초대하고 상대가 수락해야 참여한다.', '원치 않는 그룹 가입을 막기 위해 pending invitation 모델을 사용한다.'],
      ['알림', '스케줄러', '오전/오후 10시 알림', '매일 오전 10시, 오후 10시에 공부 기록 알림을 보낸다.', '공부 기록 습관을 만들기 위한 반복 알림이다.'],
    ],
    apiRows: [
      ['과목 목록', 'GET', '/api/study/subjects', 'ROLE_USER', '내 과목 목록을 반환한다.', '타이머와 기록에서 공통 사용.'],
      ['세션 저장', 'POST', '/api/study/sessions', 'ROLE_USER', '공부 시간 기록을 저장한다.', '타이머 종료 시 호출.'],
      ['그룹 생성', 'POST', '/api/study/groups', 'ROLE_USER', '스터디 그룹을 생성한다.', 'owner를 자동 멤버로 추가.'],
      ['그룹 초대', 'POST', '/api/study/groups/{id}/invites', 'GROUP_OWNER', '사용자를 그룹에 초대한다.', 'pending 상태로 알림 발송.'],
      ['초대 수락', 'POST', '/api/study/group-invites/{id}/accept', 'ROLE_USER', '초대를 수락하고 그룹 멤버가 된다.', '중복 멤버 방지.'],
    ],
    troubleRows: [
      ['페이지 이동 시 타이머 초기화', 'React state만 사용해 앱 이동 시 타이머가 사라졌다.', 'startTime과 subjectId를 localStorage에 저장하고 로드 시 경과 시간을 계산했다.', '타이머는 전역 기능이라 단일 페이지 state에 묶이면 UX가 깨진다.'],
      ['ISO 날짜 파싱 실패', '프론트에서 보낸 Z suffix 시간을 LocalDateTime이 파싱하지 못했다.', 'Instant.parse 후 UTC LocalDateTime으로 변환했다.', '클라이언트 시간대 차이를 고려해 표준 ISO 입력을 받는 쪽이 안정적이다.'],
    ],
  },
  {
    title: '4. 코넬노트',
    summary: '키워드/질문, 세부 내용, 요약을 코넬식으로 정리하고 공유 또는 GitHub 커밋한다.',
    featureRows: [
      ['노트 작성', '작성 화면', '코넬 3분할 입력', '키워드/질문, 세부 내용, 요약을 나눠 작성한다.', '학습 정리 흐름에 맞춰 입력 영역을 고정했다.'],
      ['날짜', '작성 화면', '작성일 고정', '노트 생성 날짜는 사용자가 임의 변경하지 못한다.', '학습 기록의 신뢰성을 위해 생성일을 기준으로 저장한다.'],
      ['GitHub', '상세 화면', 'Markdown 커밋', '설정한 repo/basePath에 노트를 Markdown으로 커밋한다.', 'TIL 저장소와 연결할 수 있도록 owner/repo 형식을 사용한다.'],
      ['공유', '상세 화면', '노트 공유', '다른 사용자와 코넬노트를 공유하고 알림을 보낸다.', '공유받은 사용자가 수락해야 참여하도록 초대 모델을 사용한다.'],
    ],
    apiRows: [
      ['GitHub 커밋', 'POST', '/github/commit-file', 'ROLE_USER', '코넬노트를 Markdown 파일로 GitHub에 커밋한다.', 'repo, filePath, content, message 필요.'],
      ['노트 목록', 'GET', '/api/cornell-notes', 'ROLE_USER', '내 노트와 공유받은 노트를 조회한다.', '로컬 저장에서 API 저장으로 확장 가능.'],
      ['노트 공유', 'POST', '/api/cornell-notes/{id}/invites', 'ROLE_USER', '사용자에게 노트 공유 초대를 보낸다.', '수락 전 pending 상태.'],
      ['초대 수락', 'POST', '/api/cornell-notes/invites/{id}/accept', 'ROLE_USER', '공유 초대를 수락한다.', '수락 후 접근 권한 부여.'],
    ],
    troubleRows: [
      ['빈 섹션 커밋', '키워드나 요약이 비어도 Markdown에 빈 제목이 들어갔다.', '값이 있는 섹션만 Markdown에 포함하도록 조건부 생성했다.', 'GitHub TIL 문서는 읽는 문서라 빈 제목이 많으면 품질이 떨어진다.'],
      ['저장 버튼 위치 혼동', '새 기능 버튼을 작성 화면 action 영역에 넣어 저장 버튼처럼 보였다.', 'GitHub 설정과 세부 내용 웹 보기를 저장 액션과 분리했다.', '작성 저장은 가장 중요한 액션이라 주변 보조 기능과 구분해야 한다.'],
    ],
  },
  {
    title: '5. 코테일지',
    summary: '알고리즘 풀이 기록, 코드, 복잡도, 공개 공유와 GitHub 커밋을 관리한다.',
    featureRows: [
      ['풀이 기록', '작성 화면', '문제/코드/복잡도 저장', '플랫폼, 난이도, 코드, 풀이 메모를 기록한다.', '복습에 필요한 정보가 한 화면에 들어오도록 구성한다.'],
      ['공개 공유', '커뮤니티', '공개 풀이 목록', '공개 설정한 풀이를 다른 사용자가 볼 수 있다.', '개인 기록과 공유 기록을 공개 여부로 분리한다.'],
      ['외부 연동', '작성 화면', 'URL 파라미터 자동 입력', '문제 제목, 난이도, 플랫폼을 URL에서 받아 자동 채운다.', 'BaekjoonHub 같은 외부 흐름과 연결하기 쉽다.'],
      ['GitHub', '상세 화면', '풀이 커밋', '선택한 repo에 풀이 코드를 커밋한다.', '알고리즘 저장소를 별도로 관리하는 사용자를 고려했다.'],
    ],
    apiRows: [
      ['풀이 목록', 'GET', '/api/coding-logs', 'ROLE_USER', '내 풀이 기록 목록을 반환한다.', '검색/필터에 사용.'],
      ['풀이 생성', 'POST', '/api/coding-logs', 'ROLE_USER', '새 풀이 기록을 저장한다.', 'title, platform, code, memo 포함.'],
      ['공개 목록', 'GET', '/api/coding-logs/public', 'Public', '공개 풀이 목록을 반환한다.', '커뮤니티 화면 사용.'],
      ['GitHub 커밋', 'POST', '/github/commit', 'ROLE_USER', '풀이 코드를 GitHub에 커밋한다.', 'repo와 path 설정 필요.'],
    ],
    troubleRows: [
      ['로그인 후 문제 정보 유실', '미로그인 상태에서 URL로 진입하면 로그인 리다이렉트 중 query가 사라졌다.', 'returnTo에 전체 URL을 저장하고 로그인 후 복귀시켰다.', '외부 연동은 URL 자체가 입력 데이터라 보존이 필수다.'],
      ['localStorage에서 DB 전환', '기존 로컬 데이터와 신규 DB 데이터의 소유자/공개 범위 모델이 달랐다.', '신규 데이터부터 DB 저장으로 전환하고 기존 로컬 데이터는 유지하지 않았다.', '무리한 자동 마이그레이션보다 데이터 일관성과 권한 모델을 우선했다.'],
    ],
  },
  {
    title: '6. 학교 알리미',
    summary: '학교 선택 후 급식표와 시간표를 날짜별로 확인하고 알림, 알레르기 표시, Chrome 확장 팝업을 제공한다.',
    featureRows: [
      ['학교 선택', '설정', '학교/학년/반 선택', 'NEIS 학교 검색 후 학년과 반을 선택한다.', '초중고 학교급에 따라 선택 가능한 학년을 제한한다.'],
      ['급식', '메인', '날짜별 급식 조회', '달력 또는 이전/다음 버튼으로 선택 날짜 급식을 본다.', '현재 시간 기준으로 아침/점심/저녁 기본 탭을 자동 선택한다.'],
      ['시간표', '메인', '날짜별 시간표 조회', '선택한 학년/반의 시간표를 조회한다.', '급식과 같은 날짜 컨트롤을 공유해 학사 정보를 함께 본다.'],
      ['알림', '설정/메인', '여러 급식 알림', '아침/점심/저녁 등 여러 알림 시간을 설정한다.', '한 개만 저장되던 문제를 배열 기반으로 바꿨다.'],
      ['식재료 표시', '설정/급식', '알레르기/싫어하는 식재료 표시', '선택한 알레르기 코드는 빨간색, 싫어하는 식재료는 주황색으로 표시한다.', 'NEIS 메뉴의 숫자 코드와 직접 입력 키워드를 함께 지원한다.'],
      ['확장프로그램', 'Chrome 팝업', 'compact 팝업 보기', '확장 아이콘을 누르면 급식/시간표만 모달처럼 보여준다.', '웹 페이지를 새 탭으로 열지 않고 iframe compact 모드로 표시한다.'],
    ],
    apiRows: [
      ['학교 검색', 'GET', '/neis/school?q=', 'Public', '학교명을 검색해 학교 코드와 교육청 코드를 반환한다.', '서버 캐시에서 includes 검색.'],
      ['급식 조회', 'GET', '/neis/meal?orgCode=&schoolCode=&date=', 'Public', '선택 날짜의 급식 정보를 반환한다.', 'MMEAL_SC_NM 기준 아침/점심/저녁 분리.'],
      ['시간표 조회', 'GET', '/neis/timetable?orgCode=&schoolCode=&schoolType=&grade=&className=&date=', 'Public', '선택 학년/반/날짜의 시간표를 반환한다.', '학교급별 NEIS endpoint 차이를 서버에서 흡수.'],
      ['확장 팝업', 'GET', '/apps/school-meal/?compact=1', 'Public', 'Chrome extension iframe용 compact 화면을 제공한다.', 'view=settings query와 postMessage로 설정 화면 전환.'],
    ],
    troubleRows: [
      ['NEIS 학교 검색 부정확', 'NEIS API의 학교명 검색은 완전 일치 성격이라 부분 검색 UX가 나빴다.', '서버 시작 시 전국 학교 목록을 캐싱하고 includes 검색으로 응답했다.', '학교 선택은 첫 진입 UX라 빠르고 관대한 검색이 필요했다.'],
      ['Vite native binding 누락', 'Linux 서버에서 rolldown/lightningcss optional dependency가 설치되지 않아 빌드가 실패했다.', '누락된 optional native package를 설치하고 npm install 절차를 정리했다.', '서버 배포에서 dist가 갱신되지 않으면 사용자는 반영이 안 된 것으로 보이므로 빌드 안정성이 중요했다.'],
      ['확장 팝업 이중 스크롤', 'iframe 내부와 popup body가 동시에 스크롤되어 사용성이 나빴다.', 'compact 모드에서 header를 숨기고 popup 외부 overflow를 hidden으로 고정했다.', '확장 팝업은 작은 창이라 스크롤 컨테이너가 하나만 있어야 한다.'],
      ['설정 화면 스크롤 불가', 'compact 설정 화면 높이를 고정해 하단 알레르기 설정까지 접근할 수 없었다.', 'settings view일 때 document 자체가 세로 스크롤되도록 dataset 기반 CSS를 분리했다.', '설정은 항목이 늘어날 수 있으므로 고정 높이보다 내용 기반 스크롤이 맞다.'],
    ],
  },
  {
    title: '7. 모의 투자',
    summary: '실제 주식 시세를 기반으로 실제 돈이 아닌 가상 자산을 사용해 매수, 매도, 포트폴리오 관리, 투자 기록을 연습하는 모의 투자 앱이다.',
    featureRows: [
      ['앱 진입', '모의 투자 홈', '놀이터 계정 기반 시작', '별도 회원가입 없이 놀이터 로그인 사용자가 모의 투자 앱을 시작한다.', '인증/회원 관리는 놀이터 공통 기능과 중복되므로 모의 투자에서는 제거한다.'],
      ['자산 지급', '내 자산', '기본 자산 지급', '최초 진입 시 사용자에게 기본 가상 자산을 지급한다.', '실제 돈이 아니라 서비스 내부 포인트 성격의 가상 자산이다.'],
      ['활동 보상', '놀이터 활동', '추가 자산 지급', '놀이터 활동에 따라 모의 투자에 사용할 가상 자산을 지속적으로 지급한다.', '출석, 공부 기록, 코테 기록, 노트 작성 같은 활동과 연결할 수 있다.'],
      ['종목 검색', '종목 검색', '종목명/티커 검색', '종목명 또는 symbol로 주식을 검색하고 현재가, 등락률, 거래량을 확인한다.', '매수 전 종목을 빠르게 찾기 위한 핵심 진입점이다.'],
      ['종목 상세', '종목 상세', '시세/차트/기업 정보', '현재가, 고가, 저가, 거래량, 시가총액, 차트, 기업 정보를 조회한다.', '매매 판단에 필요한 정보를 한 화면에 모은다.'],
      ['매수', '주문', '가상 자산 매수', '보유 현금과 주문 수량을 검증한 뒤 가상 자산으로 주식을 매수한다.', '잔고 부족, 최소 수량 미만 주문은 막는다.'],
      ['매도', '주문', '보유 종목 매도', '보유 수량을 검증한 뒤 주식을 매도하고 현금을 증가시킨다.', '보유 수량 초과 매도는 막는다.'],
      ['포트폴리오', '포트폴리오', '자산/수익률 조회', '총자산, 보유 현금, 투자금액, 평가손익, 수익률, 보유 종목을 보여준다.', '현재 투자 상태를 가장 먼저 확인하는 대시보드 역할이다.'],
      ['거래 내역', '거래 내역', '매매 기록 조회', '매수/매도 시각, 종목, 수량, 체결가, 총금액을 기록하고 조회한다.', '투자 결과를 되돌아보기 위한 이력 데이터다.'],
      ['관심 종목', '관심 종목', '즐겨찾기', '관심 있는 종목을 등록, 삭제, 조회한다.', '자주 보는 종목을 매번 검색하지 않도록 한다.'],
      ['랭킹', '랭킹', '수익률 순위', '사용자별 총자산과 수익률을 기준으로 순위를 보여준다.', '실제 자산 경쟁이 아니라 학습 동기용 지표로 사용한다.'],
      ['투자 일지', '투자 일지', '투자 판단 기록', '종목별 투자 이유, 매매 근거, 결과를 작성하고 수정/삭제한다.', '단순 매매 게임이 아니라 투자 습관을 기록하는 기능이다.'],
    ],
    apiRows: [
      ['내 투자 프로필', 'GET', '/api/mock-invest/me', 'ROLE_USER', '모의 투자 내 현금, 총자산, 수익률 정보를 반환한다.', '놀이터 계정 id 기준으로 조회한다.'],
      ['기본 자산 지급', 'POST', '/api/mock-invest/assets/initial', 'ROLE_USER', '최초 사용자에게 기본 가상 자산을 지급한다.', '이미 지급된 사용자는 중복 지급하지 않는다.'],
      ['활동 보상 지급', 'POST', '/api/mock-invest/assets/reward', 'Internal', '놀이터 활동 이벤트를 기준으로 추가 가상 자산을 지급한다.', '출석, 스터디 기록, 노트 작성 등에서 내부 호출한다.'],
      ['종목 검색', 'GET', '/api/mock-invest/stocks?keyword=', 'ROLE_USER', '종목명 또는 symbol로 종목을 검색한다.', '현재가, 등락률, 거래량 포함.'],
      ['종목 상세', 'GET', '/api/mock-invest/stocks/{symbol}', 'ROLE_USER', '선택 종목의 시세, 차트, 기업 정보를 반환한다.', '외부 주식 API 응답을 서버에서 정규화한다.'],
      ['매수', 'POST', '/api/mock-invest/trades/buy', 'ROLE_USER', 'symbol과 quantity를 받아 매수 주문을 체결한다.', '잔고 확인, 주문 금액 계산, 보유 종목 반영.'],
      ['매도', 'POST', '/api/mock-invest/trades/sell', 'ROLE_USER', 'symbol과 quantity를 받아 매도 주문을 체결한다.', '보유 수량 확인 후 현금 증가.'],
      ['포트폴리오 조회', 'GET', '/api/mock-invest/portfolio', 'ROLE_USER', '현금, 총자산, 손익, 수익률, 보유 종목을 반환한다.', '현재가 기준으로 평가금액 계산.'],
      ['거래 내역', 'GET', '/api/mock-invest/orders', 'ROLE_USER', '사용자의 매수/매도 기록을 반환한다.', '최신순 정렬.'],
      ['관심 종목 조회', 'GET', '/api/mock-invest/watchlist', 'ROLE_USER', '관심 종목 목록을 반환한다.', '종목 현재가를 함께 표시할 수 있다.'],
      ['관심 종목 등록', 'POST', '/api/mock-invest/watchlist', 'ROLE_USER', 'symbol을 관심 종목에 추가한다.', '중복 등록 방지.'],
      ['관심 종목 삭제', 'DELETE', '/api/mock-invest/watchlist/{symbol}', 'ROLE_USER', '관심 종목을 삭제한다.', '내 관심 종목만 삭제 가능.'],
      ['랭킹 조회', 'GET', '/api/mock-invest/rankings', 'ROLE_USER', '수익률 또는 총자산 기준 랭킹을 반환한다.', '닉네임, 총자산, 수익률 포함.'],
      ['투자 일지 생성', 'POST', '/api/mock-invest/journals', 'ROLE_USER', '종목, 제목, 투자 이유, 결과를 기록한다.', '매매와 분리된 회고 데이터.'],
      ['투자 일지 목록', 'GET', '/api/mock-invest/journals', 'ROLE_USER', '내 투자 일지 목록을 반환한다.', 'symbol 필터 확장 가능.'],
      ['투자 일지 수정', 'PATCH', '/api/mock-invest/journals/{journalId}', 'ROLE_USER', '투자 일지 내용을 수정한다.', '작성자만 수정 가능.'],
      ['투자 일지 삭제', 'DELETE', '/api/mock-invest/journals/{journalId}', 'ROLE_USER', '투자 일지를 삭제한다.', '작성자만 삭제 가능.'],
    ],
    troubleRows: [
      ['회원 기능 중복', '첨부 초안에는 회원가입/로그인이 별도 기능으로 있었지만 놀이터에는 이미 GitHub OAuth/JWT 인증이 있다.', '모의 투자는 놀이터 계정을 그대로 사용하고, 앱 내부에서는 투자 프로필만 생성하도록 정리했다.', '인증을 앱마다 따로 만들면 사용자 경험과 권한 관리가 중복되므로 공통 인증을 재사용하는 편이 맞다.'],
      ['가상 자산 지급 기준', '초안에는 초기 자산만 있었지만 사용자가 계속 투자하려면 추가 자산 획득 경로가 필요하다.', '기본 자산은 최초 1회 지급하고, 이후 놀이터 활동 이벤트로 추가 지급하도록 분리했다.', '투자 앱을 놀이터 전체 활동과 연결하면 다른 기능 사용 동기도 함께 만들 수 있다.'],
      ['실시간 주식 API 비용/제한', '실제 시세 API는 호출 제한과 비용 문제가 생길 수 있다.', '서버에서 주식 API 응답을 캐싱하고 검색/상세 응답을 정규화한다.', '프론트가 외부 API에 직접 의존하면 키 노출과 호출량 제어가 어렵다.'],
      ['매수/매도 동시성', '동시에 여러 주문이 들어오면 현금이나 보유 수량이 음수가 될 수 있다.', '거래 처리는 DB 트랜잭션으로 묶고 사용자 자산 row를 잠근 뒤 체결한다.', '돈처럼 보이는 가상 자산이라도 숫자 무결성이 깨지면 랭킹과 신뢰성이 무너진다.'],
      ['랭킹 악용 가능성', '활동 보상으로 자산이 지급되면 단순 총자산 랭킹은 활동량이 많은 사용자에게 치우칠 수 있다.', '수익률 랭킹과 총자산 랭킹을 분리하고, 보상 지급 내역을 별도 기록한다.', '투자 실력 지표와 활동 보상 지표를 섞지 않아야 랭킹이 납득 가능하다.'],
    ],
  },
];

const rt = (content) => [{ type: 'text', text: { content: String(content ?? '') } }];
const tableRow = (cells) => ({
  object: 'block',
  type: 'table_row',
  table_row: {
    cells: cells.map((cell) => rt(cell)),
  },
});
const table = (headers, rows) => ({
  object: 'block',
  type: 'table',
  table: {
    table_width: headers.length,
    has_column_header: true,
    has_row_header: false,
    children: [
      tableRow(headers),
      ...rows.map(tableRow),
    ],
  },
});

const featureTable = (rows) => table(
  ['기능명', '페이지', '주 기능', '설명', '비고'],
  rows,
);

const apiTable = (rows) => table(
  ['Description', 'Method', 'Authorization', 'Endpoint URL', '담당/비고'],
  rows.map(([name, method, endpoint, auth, desc, noteText]) => [
    `${name}\n${desc}`,
    method,
    auth,
    endpoint,
    noteText,
  ]),
);

const troubleTable = (rows) => table(
  ['문제', '원인', '해결', '왜 이렇게 했는지'],
  rows,
);

const featureSpecPage = (item) => [
  h1('기능명세서'),
  p(item.summary),
  div(),
  h2('기능 목록'),
  featureTable(item.featureRows),
];

const apiSpecPage = (item) => [
  h1('API 명세서'),
  p(`${item.title}에서 사용하는 주요 API와 권한을 정리한다.`),
  div(),
  h2('Endpoint'),
  apiTable(item.apiRows),
];

const troubleSpecPage = (item) => [
  h1('트러블 슈팅'),
  p(`${item.title} 개발 중 발생한 문제와 해결 이유를 정리한다.`),
  div(),
  h2('문제 해결 기록'),
  troubleTable(item.troubleRows),
];

async function createImplementedWebDocs() {
  await add([
    h2('📱 구현된 웹'),
    p('아래 항목을 클릭하면 각 웹 기능의 기능명세서, API 명세서, 트러블슈팅 문서로 이동합니다.'),
  ]);

  for (const item of detailedWebDocs) {
    const appPage = await createChildPage(item.title, [
      h1(item.title),
      p(item.summary),
      div(),
      p('아래 하위 페이지에서 기능명세서, API 명세서, 트러블 슈팅을 각각 확인한다.'),
    ]);
    await createNestedPage(appPage.id, '기능명세서', featureSpecPage(item));
    await createNestedPage(appPage.id, 'API 명세서', apiSpecPage(item));
    await createNestedPage(appPage.id, '트러블 슈팅', troubleSpecPage(item));
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
    await updateRootPageTitle();
    await clearPage();
    await writeFullDoc();
  }
}

main().catch(console.error);
