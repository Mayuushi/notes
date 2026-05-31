import { ObjectId } from 'mongodb';
import { requireSession } from '../_lib/auth.js';
import { getDb } from '../_lib/mongodb.js';

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

  const { id } = req.query;

  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid note id.' });
    return;
  }

  const db = await getDb();
  const collection = db.collection('notes');
  const filter = { _id: new ObjectId(id) };

  if (req.method === 'GET') {
    const note = await collection.findOne(filter);

    if (!note) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.status(200).json({ note: serializeNote(note) });
    return;
  }

  if (req.method === 'PATCH') {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    const tag = String(req.body?.tag || '').trim();

    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required.' });
      return;
    }

    const now = new Date().toISOString();
    const result = await collection.updateOne(
      filter,
      {
        $set: {
          title,
          content,
          tag,
          updatedAt: now,
        },
      },
    );

    if (!result.matchedCount) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const updatedNote = await collection.findOne(filter);

    if (!updatedNote) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.status(200).json({ note: serializeNote(updatedNote) });
    return;
  }

  if (req.method === 'DELETE') {
    const result = await collection.deleteOne(filter);

    if (!result.deletedCount) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    res.status(204).end();
    return;
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  res.status(405).json({ error: 'Method not allowed.' });
}