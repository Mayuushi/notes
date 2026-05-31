import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { getDb } from '../_lib/mongodb.js';
import { requireSession } from '../_lib/auth.js';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });
loadEnv({ path: path.resolve(process.cwd(), '.env') });

function serializeNote(note) {
  return {
    id: note._id.toString(),
    title: note.title,
    content: note.content,
    tag: note.tag || '',
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function normalizeGeneratedNotes(rawNotes, topic, count, fallbackTag) {
  if (!Array.isArray(rawNotes)) {
    return [];
  }

  return rawNotes
    .slice(0, count)
    .map((note, index) => {
      const title = String(note?.title || '').trim();
      const content = String(note?.content || '').trim();
      const tag = String(note?.tag || fallbackTag || topic).trim();

      if (!title || !content) {
        return null;
      }

      return {
        title,
        content,
        tag,
        order: index,
      };
    })
    .filter(Boolean);
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

function deriveNoteCount(topic) {
  const normalizedTopic = String(topic || '').trim();
  const words = normalizedTopic.split(/[\s,/:;-]+/).filter(Boolean);
  const baseCount = Math.max(4, Math.min(6, words.length + 3));
  const complexityBonus = /[A-Z]{2,}|[\-_]/.test(normalizedTopic) ? 1 : 0;

  return Math.max(4, Math.min(8, baseCount + complexityBonus));
}

async function callGroqForNotes(topic, fallbackTag) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const count = deriveNoteCount(topic);

  if (!apiKey) {
    throw new Error('Missing GROQ_API_KEY environment variable. Add it to .env.local and restart the dev server.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'You create study notes. Return only valid JSON with this exact shape: {"notes":[{"title":"...","content":"...","tag":"..."}]}. Do not include markdown, code fences, or extra commentary.',
        },
        {
          role: 'user',
          content: [
            `Topic: ${topic}`,
            `Create exactly ${count} separate notes that break the topic into distinct subtopics.`,
            'Each note should be concise, useful, and suitable for studying.',
            `Use this tag for every note if it is provided: ${fallbackTag || '(no tag provided)'}.`,
            'If no tag is provided, use a short lowercase tag based on the topic.',
            'Titles should be short and specific to the subtopic.',
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

  return normalizeGeneratedNotes(parsed?.notes || [], topic, count, fallbackTag);
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

  const topic = String(req.body?.topic || '').trim();
  const tag = String(req.body?.tag || '').trim();

  if (!topic) {
    res.status(400).json({ error: 'Topic is required.' });
    return;
  }

  let generatedNotes;

  try {
    generatedNotes = await callGroqForNotes(topic, tag);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to generate notes.' });
    return;
  }

  if (generatedNotes.length === 0) {
    res.status(502).json({ error: 'The AI did not return any usable notes.' });
    return;
  }

  const now = new Date().toISOString();
  const db = await getDb();
  const collection = db.collection('notes');

  const docs = generatedNotes.map((note) => ({
    title: note.title,
    content: note.content,
    tag: note.tag,
    createdAt: now,
    updatedAt: now,
  }));

  const result = await collection.insertMany(docs);
  const insertedIds = Object.values(result.insertedIds);
  const createdNotes = await collection
    .find({ _id: { $in: insertedIds } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  res.status(201).json({ notes: createdNotes.map(serializeNote) });
}