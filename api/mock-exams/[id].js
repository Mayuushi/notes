import { ObjectId } from 'mongodb';

import { getDb } from '../_lib/mongodb.js';
import { requireSession } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!requireSession(req, res)) {
    return;
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const examId = String(req.query?.id || '').trim();

  if (!ObjectId.isValid(examId)) {
    res.status(400).json({ error: 'Invalid exam id.' });
    return;
  }

  const db = await getDb();
  const result = await db.collection('mock_exams').deleteOne({ _id: new ObjectId(examId) });

  if (!result.deletedCount) {
    res.status(404).json({ error: 'Mock exam not found.' });
    return;
  }

  res.status(204).end();
}