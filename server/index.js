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

const app = express();
const PORT = process.env.PORT || 3000;

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

// ============================================
// GitHub OAuth 라우트
// ============================================

/**
 * GET /auth/github
 * GitHub 로그인 시작 - GitHub 인증 페이지로 리다이렉트
 */
app.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.CALLBACK_URL;
  
  // GitHub OAuth 인증 URL로 이동
  // scope: read:user → 사용자 기본 정보(이름, 아바타 등) 읽기 권한
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user`;
  
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
      login: userData.login,        // GitHub 아이디
      name: userData.name,          // 표시 이름
      avatar_url: userData.avatar_url, // 프로필 사진
    };

    // 로그인 성공 → 메인 페이지로 이동
    res.redirect('/');
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎮 놀이터 서버 실행 중: http://localhost:${PORT}`);
});
