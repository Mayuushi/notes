import { createSessionCookie, verifyCredentials } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  if (!verifyCredentials(username, password)) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  res.setHeader('Set-Cookie', createSessionCookie());
  res.status(200).json({ ok: true });
}