/**
 * BloomBouquet public server
 *
 * Responsibilities:
 * 1. Serve the BloomBouquet production bundle from root dist/.
 * 2. Proxy Spring Boot API/OAuth traffic without changing request bodies.
 * 3. Preserve the legacy Builder GitHub sign-in boundary while Builder mode remains available.
 *
 * Published projects that require end-user authentication do NOT use this GitHub session.
 * They use the shared 꽃다발 Identity Provider under /api/bouquet/**.
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET || 'playground-jwt-secret-2024';

if (IS_PRODUCTION && (JWT_SECRET.length < 32 || JWT_SECRET.includes('playground-jwt-secret-2024'))) {
  throw new Error('JWT_SECRET must be set to a private value with at least 32 characters.');
}

const app = express();
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return cookies;
      const key = part.slice(0, separator);
      const value = part.slice(separator + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function resolveGithubCallbackUrl(req) {
  const configured = process.env.CALLBACK_URL;
  const host = req.get('x-forwarded-host') || req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  if (!host) return configured;

  const requestBasedCallback = `${protocol}://${host}/auth/github/callback`;
  if (!configured) return requestBasedCallback;

  try {
    const configuredUrl = new URL(configured);
    const requestHost = host.toLowerCase();
    const configuredHost = configuredUrl.host.toLowerCase();
    const localRequest = requestHost.startsWith('localhost') || requestHost.startsWith('127.0.0.1');
    const localConfigured = configuredHost.startsWith('localhost') || configuredHost.startsWith('127.0.0.1');
    if (
      configuredUrl.pathname === '/auth/github/callback'
      && (configuredHost === requestHost || (localRequest && localConfigured))
    ) {
      return configured;
    }
  } catch {
    return requestBasedCallback;
  }

  return requestBasedCallback;
}

function normalizedBuilderUser(payload) {
  if (!payload || payload.type === 'refresh' || !payload.id || !payload.login) return null;
  return {
    id: String(payload.id),
    login: String(payload.login),
    name: payload.name || payload.login,
    avatar_url: payload.avatar_url || '',
  };
}

function issueBuilderAccessCookie(res, user) {
  const token = jwt.sign(
    {
      id: String(user.id),
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url || '',
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );

  res.cookie('playground_token', token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000,
    path: '/',
  });
}

function getBuilderUser(req, res) {
  if (req.session.user) return req.session.user;

  const cookies = parseCookies(req.headers.cookie || '');
  if (cookies.playground_token) {
    try {
      const user = normalizedBuilderUser(jwt.verify(cookies.playground_token, JWT_SECRET));
      if (user) {
        req.session.user = user;
        return user;
      }
    } catch {
      // Fall through to refresh-token recovery.
    }
  }

  if (cookies.playground_refresh) {
    try {
      const payload = jwt.verify(cookies.playground_refresh, JWT_SECRET);
      if (payload?.type === 'refresh') {
        const user = normalizedBuilderUser({ ...payload, type: 'access' });
        if (user) {
          req.session.user = user;
          issueBuilderAccessCookie(res, user);
          return user;
        }
      }
    } catch {
      res.clearCookie('playground_token', { path: '/' });
      res.clearCookie('playground_refresh', { path: '/' });
    }
  }

  return null;
}

function proxyToBackend(req, res) {
  const targetUrl = new URL(req.originalUrl, BACKEND_URL);
  const client = targetUrl.protocol === 'https:' ? https : http;
  const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress]
    .filter(Boolean)
    .join(', ');

  const headers = {
    ...req.headers,
    host: targetUrl.host,
    origin: BACKEND_URL,
    'x-forwarded-host': req.headers.host || '',
    'x-forwarded-proto': req.get('x-forwarded-proto') || req.protocol || 'http',
    'x-forwarded-for': forwardedFor,
  };

  const proxyReq = client.request(
    targetUrl,
    {
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    console.error(`[BloomBouquet proxy] ${req.method} ${req.originalUrl}:`, error.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'backend_unavailable' });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

// Spring Boot owns BloomBouquet, 꽃다발 SSO, Builder, and internal worker APIs.
app.use('/api', proxyToBackend);
app.use('/oauth2', proxyToBackend);
app.use('/login/oauth2', proxyToBackend);

// Builder-only GitHub sign-in. Published projects use 꽃다발 SSO instead.
app.get('/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = resolveGithubCallbackUrl(req);
  if (!clientId || !callbackUrl) {
    return res.status(503).json({ error: 'github_oauth_not_configured' });
  }

  if (typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/')) {
    req.session.returnTo = req.query.returnTo;
  }

  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', clientId);
  githubAuthUrl.searchParams.set('redirect_uri', callbackUrl);
  githubAuthUrl.searchParams.set('scope', 'read:user');
  res.redirect(githubAuthUrl.toString());
});

app.get('/auth/github/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const callbackUrl = resolveGithubCallbackUrl(req);
  if (!code) return res.redirect('/?mode=builder&error=no_code');

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      return res.redirect('/?mode=builder&error=token_failed');
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bloombouquet-builder',
      },
    });
    if (!userResponse.ok) return res.redirect('/?mode=builder&error=user_failed');

    const githubUser = await userResponse.json();
    const user = {
      id: String(githubUser.id),
      login: githubUser.login,
      name: githubUser.name || githubUser.login,
      avatar_url: githubUser.avatar_url || '',
    };
    req.session.user = user;
    issueBuilderAccessCookie(res, user);

    const refreshToken = jwt.sign(
      { ...user, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.cookie('playground_refresh', refreshToken, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    const returnTo = req.session.returnTo || '/?mode=builder';
    delete req.session.returnTo;
    return res.redirect(returnTo);
  } catch (error) {
    console.error('[BloomBouquet GitHub OAuth]', error);
    return res.redirect('/?mode=builder&error=auth_failed');
  }
});

app.get('/auth/me', (req, res) => {
  res.json({ user: getBuilderUser(req, res) });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('playground_token', { path: '/' });
    res.clearCookie('playground_refresh', { path: '/' });
    res.json({ success: true });
  });
});

const DIST_DIR = path.join(__dirname, '..', 'dist');
app.use(express.static(DIST_DIR));

app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌸 BloomBouquet server: http://localhost:${PORT}`);
});
