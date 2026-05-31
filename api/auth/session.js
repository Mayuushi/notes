import { getAuthIdentity, getSessionFromRequest } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const session = getSessionFromRequest(req);

  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }

  res.status(200).json({ authenticated: true, user: getAuthIdentity() });
}