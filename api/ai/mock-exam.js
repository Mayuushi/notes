import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { ObjectId } from 'mongodb';
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

function normalizeGeneratedExam(rawExam, fallbackTag, requestedQuestionCount) {
  const title = String(rawExam?.title || '').trim() || 'Generated Mock Exam';
  const instructions = String(rawExam?.instructions || '').trim() || 'Answer all questions and submit your attempt.';
  const timeLimitMinutes = Math.max(15, Math.min(120, Number(rawExam?.timeLimitMinutes) || 45));
  const questions = Array.isArray(rawExam?.questions)
    ? rawExam.questions.map((question, index) => sanitizeQuestion(question, index)).filter(Boolean)
    : [];

  return {
    title,
    instructions,
    tag: fallbackTag || 'freeform',
    timeLimitMinutes,
    questions: questions.slice(0, requestedQuestionCount),
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

async function callGroqForExam({ tag, notes = [], questionCount, sourceMode = 'tag', sourceText = '' }) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY environment variable. Add it to .env.local and restart the dev server.');
  }

  const noteContext = notes.slice(0, 25).map(serializeForPrompt).join('\n\n---\n\n');
  const freeformSource = String(sourceText || '').trim();

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
            'You create mock exams from study notes or freeform study material. Return only valid JSON with this exact shape: {"title":"...","instructions":"...","timeLimitMinutes":45,"questions":[{"prompt":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}. Do not use markdown fences or extra text.',
        },
        {
          role: 'user',
          content: [
            sourceMode === 'selection'
              ? 'Build a mock exam from these explicitly selected notes.'
              : sourceMode === 'prompt'
                ? 'Build a mock exam from the freeform study material below. The source may include code snippets, algorithms, API notes, or mixed study text.'
                : `Build a mock exam using notes with tag: ${tag}.`,
            `Create ${questionCount} multiple-choice questions with 4 options each.`,
            sourceMode === 'prompt'
              ? 'Keep questions aligned with the provided source material only and do not require any database notes.'
              : 'Keep questions aligned with the provided note content only.',
            'Provide concise explanations for the correct answers.',
            '',
            sourceMode === 'prompt' ? 'SOURCE MATERIAL:' : 'NOTES:',
            sourceMode === 'prompt' ? freeformSource : noteContext,
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
  return normalizeGeneratedExam(parsed, tag, questionCount);
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
  const prompt = String(req.body?.prompt || req.body?.sourceText || '').trim();
  const requestedQuestionCount = Number.parseInt(String(req.body?.questionCount ?? '12'), 10);
  const questionCount = Math.max(5, Math.min(30, Number.isNaN(requestedQuestionCount) ? 12 : requestedQuestionCount));
  const selectedNoteIds = Array.isArray(req.body?.noteIds)
    ? req.body.noteIds.map((noteId) => String(noteId || '').trim()).filter(Boolean)
    : [];

  const hasSelectedNotes = selectedNoteIds.length > 0;
  const hasPromptSource = Boolean(prompt);

  if (!hasSelectedNotes && !tag && !hasPromptSource) {
    res.status(400).json({ error: 'Tag or prompt text is required.' });
    return;
  }

  if (hasPromptSource && hasSelectedNotes) {
    res.status(400).json({ error: 'Use either selected notes or a freeform prompt, not both.' });
    return;
  }

  const db = await getDb();
  const collection = db.collection('notes');
  let notes = [];

  if (hasSelectedNotes) {
    const validObjectIds = selectedNoteIds
      .filter((noteId) => ObjectId.isValid(noteId))
      .map((noteId) => new ObjectId(noteId));

    if (!validObjectIds.length) {
      res.status(400).json({ error: 'No valid notes were selected.' });
      return;
    }

    notes = await collection
      .find({ _id: { $in: validObjectIds } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();
  } else {
    notes = await collection
      .find({ tag: { $regex: `^${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();
  }

  if (!hasPromptSource && notes.length === 0) {
    if (hasSelectedNotes) {
      res.status(404).json({ error: 'No selected notes were found.' });
    } else {
      res.status(404).json({ error: `No notes found with tag "${tag}".` });
    }
    return;
  }

  const resolvedTag = hasSelectedNotes
    ? (notes.length === 1 && notes[0]?.tag ? String(notes[0].tag).trim() : 'selected-notes')
    : hasPromptSource
      ? tag || 'freeform'
      : tag;

  try {
    const generatedExam = await callGroqForExam({
      tag: resolvedTag,
      notes,
      questionCount,
      sourceMode: hasSelectedNotes ? 'selection' : hasPromptSource ? 'prompt' : 'tag',
      sourceText: prompt,
    });

    if (!generatedExam.questions.length) {
      res.status(502).json({ error: 'Groq returned an invalid exam structure.' });
      return;
    }

    const now = new Date().toISOString();
    const examCollection = db.collection('mock_exams');

    const result = await examCollection.insertOne({
      title: generatedExam.title,
      tag: resolvedTag,
      instructions: generatedExam.instructions,
      timeLimitMinutes: generatedExam.timeLimitMinutes,
      questions: generatedExam.questions,
      sourceNoteCount: hasPromptSource ? 0 : notes.length,
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
