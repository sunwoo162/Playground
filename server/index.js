/**
 * 놀이터 서버
 * 
 * 역할:
 * 1. GitHub OAuth 로그인 처리 (인증 플로우)
 * 2. 정적 파일 서빙 (프론트엔드 + 앱들)
 * 3. 세션 관리
 * 
 * GitHub OAuth 플로우:
 * ┌─────────┐     ┌──────────┐     ┌────────┐
 * │ 사용자   │────▶│ 우리 서버  │────▶│ GitHub │
 * │ 브라우저  │◀────│ (Express) │◀────│ API    │
 * └─────────┘     └──────────┘     └────────┘
 * 
 * 1. 사용자가 "GitHub 로그인" 클릭
 * 2. 서버가 GitHub 인증 페이지로 리다이렉트
 * 3. 사용자가 GitHub에서 승인
 * 4. GitHub이 우리 서버의 /auth/github/callback으로 코드를 보냄
 * 5. 서버가 그 코드로 GitHub API에서 access_token을 받음
 * 6. access_token으로 사용자 정보를 가져옴
 * 7. 세션에 사용자 정보 저장 → 로그인 완료
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');

const JWT_SECRET = process.env.JWT_SECRET || 'playground-jwt-secret-2024';

// Web Push VAPID 설정
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@playground.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

// 세션 설정 (로그인 상태 유지)
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // HTTPS 사용 시 true로 변경
    maxAge: 24 * 60 * 60 * 1000, // 24시간
  },
}));

app.use(express.json());

function proxyToBackend(req, res) {
  const targetUrl = new URL(req.originalUrl, BACKEND_URL);
  const client = targetUrl.protocol === 'https:' ? https : http;

  // 쿠키 전달 확인용 로그
  const cookieHeader = req.headers['cookie'] || '';
  const hasToken = cookieHeader.includes('playground_token');
  console.log(`[Proxy] ${req.method} ${req.originalUrl} | token: ${hasToken}`);

  // express.json()이 바디를 파싱했으므로 다시 직렬화
  const bodyData = req.body && Object.keys(req.body).length > 0
    ? JSON.stringify(req.body)
    : null;

  const headers = {
    ...req.headers,
    host: targetUrl.host,
    origin: BACKEND_URL,
  };

  if (bodyData) {
    headers['content-length'] = Buffer.byteLength(bodyData).toString();
    headers['content-type'] = 'application/json';
  }

  const proxyReq = client.request(
    targetUrl,
    {
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    console.error('Backend proxy error:', error);
    res.status(502).json({ error: 'backend_unavailable' });
  });

  if (bodyData) {
    proxyReq.write(bodyData);
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
}

app.use(['/api'], proxyToBackend);

// ============================================
// 나이스 급식 API 프록시
// ============================================
const NEIS_BASE = 'https://open.neis.go.kr/hub';

// 전국 학교 목록 캐시 (서버 시작 시 로드)
let schoolCache = [];
let schoolCacheLoaded = false;

async function loadSchoolCache() {
  if (schoolCacheLoaded) return;
  console.log('[NEIS] 전국 학교 목록 로딩 중...');
  try {
    let page = 1;
    const all = [];
    const apiKey = process.env.NEIS_API_KEY;
    console.log('[NEIS] API Key 확인:', apiKey ? apiKey.slice(0, 8) + '...' : '없음');
    while (true) {
      const url = `${NEIS_BASE}/schoolInfo?KEY=${apiKey}&Type=json&pSize=1000&pIndex=${page}`;
      const r = await fetch(url);
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { console.error('[NEIS] JSON 파싱 실패:', text.slice(0, 200)); break; }
      const rows = data?.schoolInfo?.[1]?.row || [];
      if (rows.length === 0) { console.log('[NEIS] page', page, '결과 없음, 로딩 종료'); break; }
      all.push(...rows.map(s => ({
        name: s.SCHUL_NM,
        orgCode: s.ATPT_OFCDC_SC_CODE,
        schoolCode: s.SD_SCHUL_CODE,
        address: s.ORG_RDNMA,
        type: s.SCHUL_KND_SC_NM,
        region: s.LCTN_SC_NM,
      })));
      console.log(`[NEIS] page ${page}: ${rows.length}개 로드 (누적 ${all.length}개)`);
      if (rows.length < 1000) break;
      page++;
    }
    schoolCache = all;
    schoolCacheLoaded = true;
    console.log(`[NEIS] 학교 목록 로딩 완료: ${all.length}개`);
  } catch (e) {
    console.error('[NEIS] 학교 목록 로딩 실패:', e.message);
  }
}

// 서버 시작 후 백그라운드에서 로드
setTimeout(loadSchoolCache, 3000);

/** GET /neis/school?q=검색어 - 학교 부분 검색 */
app.get('/neis/school', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });
  
  // 캐시에서 부분 검색
  if (schoolCacheLoaded && schoolCache.length > 0) {
    const results = schoolCache
      .filter(s => s.name.includes(q) || s.address?.includes(q))
      .slice(0, 20);
    return res.json(results);
  }

  // 캐시 없으면 API 직접 호출
  try {
    const url = `${NEIS_BASE}/schoolInfo?KEY=${process.env.NEIS_API_KEY}&Type=json&SCHUL_NM=${encodeURIComponent(q)}&pSize=20`;
    const r = await fetch(url);
    const data = await r.json();
    const rows = data?.schoolInfo?.[1]?.row || [];
    res.json(rows.map(s => ({
      name: s.SCHUL_NM,
      orgCode: s.ATPT_OFCDC_SC_CODE,
      schoolCode: s.SD_SCHUL_CODE,
      address: s.ORG_RDNMA,
      type: s.SCHUL_KND_SC_NM,
      region: s.LCTN_SC_NM,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /neis/meal?orgCode=&schoolCode=&date=YYYYMMDD - 급식 조회 */
app.get('/neis/meal', async (req, res) => {
  const { orgCode, schoolCode, date } = req.query;
  if (!orgCode || !schoolCode) return res.status(400).json({ error: 'orgCode, schoolCode required' });
  const today = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    const url = `${NEIS_BASE}/mealServiceDietInfo?KEY=${process.env.NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${orgCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_YMD=${today}`;
    const r = await fetch(url);
    const data = await r.json();
    const rows = data?.mealServiceDietInfo?.[1]?.row || [];
    res.json(rows.map(m => ({
      mealType: m.MMEAL_SC_NM,  // 조식/중식/석식
      menu: m.DDISH_NM?.replace(/<br\/>/g, '\n').replace(/\d+\./g, '').trim(),
      calories: m.CAL_INFO,
      date: m.MLSV_YMD,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /neis/timetable?orgCode=&schoolCode=&schoolType=&grade=&className=&date=YYYYMMDD - 시간표 조회 */
app.get('/neis/timetable', async (req, res) => {
  const { orgCode, schoolCode, schoolType, grade, className, date } = req.query;
  if (!orgCode || !schoolCode || !grade || !className) {
    return res.status(400).json({ error: 'orgCode, schoolCode, grade, className required' });
  }

  const targetDate = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const type = String(schoolType || '');
  const endpoint = type.includes('초등') ? 'elsTimetable' : type.includes('중학교') ? 'misTimetable' : 'hisTimetable';

  try {
    const url = `${NEIS_BASE}/${endpoint}?KEY=${process.env.NEIS_API_KEY}&Type=json&ATPT_OFCDC_SC_CODE=${orgCode}&SD_SCHUL_CODE=${schoolCode}&GRADE=${grade}&CLASS_NM=${encodeURIComponent(className)}&ALL_TI_YMD=${targetDate}`;
    const r = await fetch(url);
    const data = await r.json();
    const rows = data?.[endpoint]?.[1]?.row || [];
    res.json(rows
      .map(t => ({
        period: Number(t.PERIO || 0),
        subject: t.ITRT_CNTNT || '',
        date: t.ALL_TI_YMD,
      }))
      .filter(t => t.period > 0 && t.subject)
      .sort((a, b) => a.period - b.period));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// Web Push
// ============================================

/** VAPID 공개키 반환 */
app.get('/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

/** 특정 유저에게 Web Push 발송 */
async function sendPushNotification(userId, payload) {
  try {
    const subscriptions = await new Promise((resolve) => {
      const targetUrl = new URL(`/api/push/subscriptions/${userId}`, BACKEND_URL);
      const client = targetUrl.protocol === 'https:' ? https : http;
      const req = client.get(targetUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve([]); }
        });
      });
      req.on('error', () => resolve([]));
    });

    await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          JSON.stringify(payload)
        )
      )
    );
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

/**
 * POST /internal/push/send
 * Spring Boot에서 호출 → Node.js가 Web Push 발송
 * { userId, title, body, url }
 */
app.post('/internal/push/send', async (req, res) => {
  const { userId, title, body, url } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  await sendPushNotification(userId, { title, body, url });
  res.json({ success: true });
});

// ============================================
// GitHub 커밋 API
// ============================================

app.post('/github/commit-file', async (req, res) => {
  const githubToken = req.session?.githubToken;
  if (!githubToken) return res.status(401).json({ error: 'GitHub token is required. Please sign in again.' });

  const { repo, filePath, content, message } = req.body;
  if (!repo || !filePath || !content) {
    return res.status(400).json({ error: 'repo, filePath, and content are required.' });
  }

  try {
    const headers = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'playground-app',
      'Content-Type': 'application/json',
    };

    let sha;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, { headers });
    if (getRes.ok) {
      const getData = await getRes.json();
      sha = getData.sha;
    }

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: message || `Update ${filePath}`,
        content: Buffer.from(content, 'utf-8').toString('base64'),
        ...(sha && { sha }),
      }),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      return res.status(putRes.status).json({ error: err.message });
    }

    const result = await putRes.json();
    res.json({ success: true, url: result.content?.html_url, sha: result.content?.sha });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /github/commit
 * 코테 일지 풀이를 GitHub 레포에 커밋
 * { repo, problemTitle, platform, language, code }
 */
app.post('/github/commit', async (req, res) => {
  const githubToken = req.session?.githubToken;
  if (!githubToken) return res.status(401).json({ error: 'GitHub 토큰 없음. 다시 로그인해주세요.' });

  const { repo, problemTitle, platform, language, code } = req.body;
  if (!repo || !problemTitle || !code) return res.status(400).json({ error: '필수 값 누락' });

  const LANG_EXT = {
    python: 'py', javascript: 'js', typescript: 'ts', java: 'java',
    cpp: 'cpp', c: 'c', kotlin: 'kt', swift: 'swift', go: 'go', rust: 'rs',
  };
  const ext = LANG_EXT[language?.toLowerCase()] || 'txt';
  const langName = language ? language.charAt(0).toUpperCase() + language.slice(1) : 'Code';

  // 파일 경로: codingtest.py/프로그래머스/문제이름 (Python).py
  const platformDir = platform === 'programmers' ? '프로그래머스' : '백준';
  const safeTitle = problemTitle.replace(/[\\/:*?"<>|]/g, '_');
  const filePath = `codingtest.py/${platformDir}/${safeTitle} (${langName}).${ext}`;

  try {
    const headers = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'playground-app',
      'Content-Type': 'application/json',
    };

    // 기존 파일 SHA 조회 (업데이트 시 필요)
    let sha;
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, { headers });
    if (getRes.ok) {
      const getData = await getRes.json();
      sha = getData.sha;
    }

    // 파일 생성/업데이트
    const body = {
      message: `[${platform === 'programmers' ? '프로그래머스' : '백준'}] ${problemTitle}`,
      content: Buffer.from(code, 'utf-8').toString('base64'),
      ...(sha && { sha }),
    };

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      return res.status(putRes.status).json({ error: err.message });
    }

    const result = await putRes.json();
    res.json({ success: true, url: result.content?.html_url, sha: result.content?.sha });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.CALLBACK_URL;

  // returnTo 세션에 저장
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo;
  }
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user,repo`;
  res.redirect(githubAuthUrl);
});

/**
 * GET /auth/github/callback
 * GitHub에서 인증 후 돌아오는 콜백
 * GitHub이 ?code=xxx 파라미터와 함께 여기로 리다이렉트함
 */
app.get('/auth/github/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('/?error=no_code');
  }

  try {
    // 1단계: code를 access_token으로 교환
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log('Token response status:', tokenResponse.status);
    console.log('Token response body:', tokenText.slice(0, 200));

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      return res.redirect('/?error=token_parse_failed');
    }

    if (tokenData.error) {
      console.error('Token error from GitHub:', tokenData);
      return res.redirect('/?error=token_failed&detail=' + encodeURIComponent(tokenData.error_description || tokenData.error));
    }

    // 2단계: access_token으로 사용자 정보 가져오기
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'playground-app',
      },
    });

    const userData = await userResponse.json();

    // 3단계: 세션에 사용자 정보 저장
    req.session.user = {
      id: userData.id,
      login: userData.login,
      name: userData.name,
      avatar_url: userData.avatar_url,
    };
    req.session.githubToken = tokenData.access_token; // GitHub API 사용용

    // 4단계: JWT 발급 (Spring Boot API 인증용)
    const userPayload = {
      id: String(userData.id),
      login: userData.login,
      name: userData.name || userData.login,
      avatar_url: userData.avatar_url,
    };

    // 액세스 토큰 (1시간)
    const accessToken = jwt.sign(
      { ...userPayload, type: 'access' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 리프레시 토큰 (7일)
    const refreshToken = jwt.sign(
      { id: userPayload.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 액세스 토큰 쿠키 (1시간)
    res.cookie('playground_token', accessToken, {
      httpOnly: false, // 프론트에서 읽을 수 있게
      maxAge: 60 * 60 * 1000, // 1시간
      sameSite: 'lax',
    });

    // 리프레시 토큰 쿠키 (7일, HttpOnly로 보안 강화)
    res.cookie('playground_refresh', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      sameSite: 'lax',
    });

    // 로그인 성공 → returnTo가 있으면 거기로, 없으면 메인
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (error) {
    console.error('OAuth error:', error);
    console.error('GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID);
    console.error('GITHUB_CLIENT_SECRET 길이:', process.env.GITHUB_CLIENT_SECRET?.length ?? '없음');
    console.error('CALLBACK_URL:', process.env.CALLBACK_URL);
    res.redirect('/?error=auth_failed&detail=' + encodeURIComponent(String(error)));
  }
});

/**
 * GET /auth/me
 * 현재 로그인한 사용자 정보 반환
 */
app.get('/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.json({ user: null });
  }
});

/**
 * POST /auth/logout
 * 로그아웃 - 세션 파기
 */
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('playground_token');
    res.clearCookie('playground_refresh');
    res.json({ success: true });
  });
});

// ============================================
// 정적 파일 서빙
// ============================================

// 놀이터 메인 (Vite 빌드 결과물)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Life Tracker 앱 (서브 경로에서 서빙)
app.use('/apps/life-tracker', express.static(path.join(__dirname, '..', 'apps', 'life-tracker', 'dist')));
app.get('/apps/life-tracker/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'life-tracker', 'dist', 'index.html'));
});

// Dev Notes 앱
app.use('/apps/dev-notes', express.static(path.join(__dirname, '..', 'apps', 'dev-notes', 'dist')));
app.get('/apps/dev-notes/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'dev-notes', 'dist', 'index.html'));
});

// Study Planner 앱
app.use('/apps/study-planner', express.static(path.join(__dirname, '..', 'apps', 'study-planner', 'dist')));
app.get('/apps/study-planner/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'study-planner', 'dist', 'index.html'));
});

// Cornell Notes 앱
app.use('/apps/cornell-notes', express.static(path.join(__dirname, '..', 'apps', 'cornell-notes', 'dist')));
app.get('/apps/cornell-notes/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'cornell-notes', 'dist', 'index.html'));
});

// Coding Log 앱
app.use('/apps/coding-log', express.static(path.join(__dirname, '..', 'apps', 'coding-log', 'dist')));
app.get('/apps/coding-log/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'coding-log', 'dist', 'index.html'));
});

// School Meal 앱
app.use('/apps/school-meal', express.static(path.join(__dirname, '..', 'apps', 'school-meal', 'dist'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));
app.get('/apps/school-meal/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'school-meal', 'dist', 'index.html'));
});

// Mock Invest 앱
app.use('/apps/mock-invest', express.static(path.join(__dirname, '..', 'apps', 'mock-invest', 'dist')));
app.get('/apps/mock-invest/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'apps', 'mock-invest', 'dist', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 놀이터 서버 실행 중: http://localhost:${PORT}`);
});
