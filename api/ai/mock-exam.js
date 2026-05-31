import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { getDb } from '../_lib/mongodb.js';
import { requireSession } from '../_lib/auth.js';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });
loadEnv({ path: path.resolve(process.cwd(), '.env') });

function serializeForPrompt(note) {
  const title = String(note.title || '').trim();
  const content = String(note.content || '').trim();
  const tag = String(note.tag || '').trim();

  return [
    `Title: ${title}`,
    `Tag: ${tag || 'none'}`,
    `Content: ${content}`,
  ].join('\n');
}

function extractJsonText(text) {
  const trimmed = String(text || '').trim();

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function sanitizeQuestion(rawQuestion, index) {
  const prompt = String(rawQuestion?.prompt || '').trim();
  const options = Array.isArray(rawQuestion?.options)
    ? rawQuestion.options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
  const explanation = String(rawQuestion?.explanation || '').trim();
  const parsedIndex = Number(rawQuestion?.correctIndex);

  if (!prompt || options.length < 2) {
    return null;
  }

  const safeCorrectIndex = Number.isInteger(parsedIndex)
    ? Math.max(0, Math.min(parsedIndex, options.length - 1))
    : 0;

  return {
    id: `q${index + 1}`,
    prompt,
    options: options.slice(0, 6),
    correctIndex: safeCorrectIndex,
    explanation,
  };
}

function normalizeGeneratedExam(rawExam, fallbackTag) {
  const title = String(rawExam?.title || '').trim() || 'Generated Mock Exam';
  const instructions = String(rawExam?.instructions || '').trim() || 'Answer all questions and submit your attempt.';
  const timeLimitMinutes = Math.max(15, Math.min(120, Number(rawExam?.timeLimitMinutes) || 45));
  const questions = Array.isArray(rawExam?.questions)
    ? rawExam.questions.map((question, index) => sanitizeQuestion(question, index)).filter(Boolean)
    : [];

  return {
    title,
    instructions,
    tag: fallbackTag,
    timeLimitMinutes,
    questions: questions.slice(0, 30),
  };
}

function toPublicQuestion(question) {
  return {
    id: question.id,
    prompt: question.prompt,
    options: question.options,
  };
}

function serializeMockExam(exam) {
  return {
    id: exam._id.toString(),
    title: exam.title,
    tag: exam.tag,
    instructions: exam.instructions,
    timeLimitMinutes: exam.timeLimitMinutes,
    questionCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
    questions: Array.isArray(exam.questions) ? exam.questions.map(toPublicQuestion) : [],
    sourceNoteCount: exam.sourceNoteCount || 0,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
}

async function callGroqForExam(tag, notes) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY environment variable. Add it to .env.local and restart the dev server.');
  }

  const noteContext = notes.slice(0, 25).map(serializeForPrompt).join('\n\n---\n\n');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        {
          role: 'system',
          content:
            'You create mock exams from study notes. Return only valid JSON with this exact shape: {"title":"...","instructions":"...","timeLimitMinutes":45,"questions":[{"prompt":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}. Do not use markdown fences or extra text.',
        },
        {
          role: 'user',
          content: [
            `Build a mock exam using notes with tag: ${tag}.`,
            'Create 12 multiple-choice questions with 4 options each.',
            'Keep questions aligned with the provided note content only.',
            'Provide concise explanations for the correct answers.',
            '',
            'NOTES:',
            noteContext,
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText.trim() || 'Groq request failed.');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = JSON.parse(extractJsonText(content));
  return normalizeGeneratedExam(parsed, tag);
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

  const tag = String(req.body?.tag || '').trim();

  if (!tag) {
    res.status(400).json({ error: 'Tag is required.' });
    return;
  }

  const db = await getDb();
  const collection = db.collection('notes');
  const notes = await collection
    .find({ tag: { $regex: `^${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  if (notes.length === 0) {
    res.status(404).json({ error: `No notes found with tag "${tag}".` });
    return;
  }

  try {
    const generatedExam = await callGroqForExam(tag, notes);

    if (!generatedExam.questions.length) {
      res.status(502).json({ error: 'Groq returned an invalid exam structure.' });
      return;
    }

    const now = new Date().toISOString();
    const examCollection = db.collection('mock_exams');

    const result = await examCollection.insertOne({
      title: generatedExam.title,
      tag,
      instructions: generatedExam.instructions,
      timeLimitMinutes: generatedExam.timeLimitMinutes,
      questions: generatedExam.questions,
      sourceNoteCount: notes.length,
      createdAt: now,
      updatedAt: now,
    });

    const savedExam = await examCollection.findOne({ _id: result.insertedId });

    if (!savedExam) {
      res.status(500).json({ error: 'Generated exam was not saved.' });
      return;
    }

    res.status(201).json({ exam: serializeMockExam(savedExam) });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to generate mock exam.' });
  }
}
