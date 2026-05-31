import crypto from 'node:crypto';

const COOKIE_NAME = 'notebook_auth';
const sessionSecret = process.env.AUTH_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-me';
const username = process.env.AUTH_USERNAME || 'admin';
const password = process.env.AUTH_PASSWORD || 'admin';

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function createToken() {
  const payload = base64UrlEncode(JSON.stringify({
    username,
    issuedAt: Date.now(),
  }));

  return `${payload}.${sign(payload)}`;
}

export function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) {
          return [cookie, ''];
        }

        const key = cookie.slice(0, separatorIndex);
        const value = cookie.slice(separatorIndex + 1);
        return [key, value];
      }),
  );
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];

  if (!token) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (session.username !== username) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function requireSession(req, res) {
  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(401).json({ error: 'Unauthorized.' });
    return null;
  }

  return session;
}

export function verifyCredentials(providedUsername, providedPassword) {
  return providedUsername === username && providedPassword === password;
}

export function createSessionCookie() {
  const token = createToken();
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = 60 * 60 * 24 * 30;
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
}

export function getAuthIdentity() {
  return { username };
}