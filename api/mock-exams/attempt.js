import { ObjectId } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import { requireSession } from '../_lib/auth.js';

function normalizeAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawAnswers)
      .map(([questionId, value]) => [String(questionId), Number(value)])
      .filter(([questionId, value]) => questionId && Number.isInteger(value) && value >= 0),
  );
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const examId = String(req.body?.examId || '').trim();
  const answers = normalizeAnswers(req.body?.answers);

  if (!ObjectId.isValid(examId)) {
    res.status(400).json({ error: 'Invalid exam id.' });
    return;
  }

  const db = await getDb();
  const exam = await db.collection('mock_exams').findOne({ _id: new ObjectId(examId) });

  if (!exam) {
    res.status(404).json({ error: 'Exam not found.' });
    return;
  }

  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const breakdown = questions.map((question) => {
    const selectedIndex = Number.isInteger(answers[question.id]) ? answers[question.id] : null;
    const correctIndex = Number.isInteger(question.correctIndex) ? question.correctIndex : 0;
    const isCorrect = selectedIndex === correctIndex;

    return {
      questionId: question.id,
      prompt: question.prompt,
      selectedIndex,
      correctIndex,
      isCorrect,
      explanation: question.explanation || '',
    };
  });

  const answeredCount = breakdown.filter((item) => item.selectedIndex !== null).length;
  const correctCount = breakdown.filter((item) => item.isCorrect).length;
  const total = questions.length;
  const percentage = total ? Math.round((correctCount / total) * 100) : 0;
  const now = new Date().toISOString();

  const attemptDoc = {
    examId: exam._id,
    examTitle: exam.title,
    examTag: exam.tag || '',
    answers,
    answeredCount,
    score: correctCount,
    total,
    percentage,
    submittedAt: now,
  };

  const insertResult = await db.collection('mock_exam_attempts').insertOne(attemptDoc);

  res.status(201).json({
    attemptId: insertResult.insertedId.toString(),
    score: correctCount,
    total,
    answeredCount,
    percentage,
    breakdown,
    submittedAt: now,
  });
}
