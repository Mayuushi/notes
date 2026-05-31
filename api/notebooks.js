import { getDb } from './_lib/mongodb.js';
import { requireSession } from './_lib/auth.js';

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

export default async function handler(req, res) {
  if (!requireSession(req, res)) {
    return;
  }

  const db = await getDb();
  const collection = db.collection('notes');

  if (req.method === 'GET') {
    const notes = await collection
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.status(200).json({ notes: notes.map(serializeNote) });
    return;
  }

  if (req.method === 'POST') {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const tag = String(req.body?.tag || '').trim();

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required.' });
      return;
    }

    const now = new Date().toISOString();
    const result = await collection.insertOne({
      title,
      content,
      tag,
      createdAt: now,
      updatedAt: now,
    });

    const createdNote = await collection.findOne({ _id: result.insertedId });
    res.status(201).json({ note: serializeNote(createdNote) });
    return;
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).json({ error: 'Method not allowed.' });
}