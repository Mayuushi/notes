import { ObjectId } from 'mongodb';

import { getDb } from '../../_lib/mongodb.js';
import { requireSession } from '../../_lib/auth.js';

function serializeAttempt(attempt) {
  return {
    id: attempt._id.toString(),
    examId: attempt.examId.toString(),
    examTitle: attempt.examTitle || '',
    examTag: attempt.examTag || '',
    score: attempt.score || 0,
    total: attempt.total || 0,
    answeredCount: attempt.answeredCount || 0,
    percentage: attempt.percentage || 0,
    submittedAt: attempt.submittedAt,
  };
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const examId = String(req.query?.id || '').trim();

  if (!ObjectId.isValid(examId)) {
    res.status(400).json({ error: 'Invalid exam id.' });
    return;
  }

  const db = await getDb();
  const attempts = await db
    .collection('mock_exam_attempts')
    .find({ examId: new ObjectId(examId) })
    .sort({ submittedAt: -1 })
    .limit(20)
    .toArray();

  res.status(200).json({ attempts: attempts.map(serializeAttempt) });
}