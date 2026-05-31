import { getDb } from './_lib/mongodb.js';
import { requireSession } from './_lib/auth.js';

function toPublicQuestion(question) {
  return {
    id: question.id,
    prompt: question.prompt,
    options: Array.isArray(question.options) ? question.options : [],
  };
}

function serializeMockExam(exam) {
  return {
    id: exam._id.toString(),
    title: exam.title,
    tag: exam.tag || '',
    instructions: exam.instructions || '',
    timeLimitMinutes: exam.timeLimitMinutes || 45,
    questionCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
    questions: Array.isArray(exam.questions) ? exam.questions.map(toPublicQuestion) : [],
    sourceNoteCount: exam.sourceNoteCount || 0,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
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

  const tag = String(req.query?.tag || '').trim();
  const filter = tag ? { tag: { $regex: `^${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } } : {};

  const db = await getDb();
  const exams = await db
    .collection('mock_exams')
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  res.status(200).json({ exams: exams.map(serializeMockExam) });
}
