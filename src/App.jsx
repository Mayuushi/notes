import { useEffect, useMemo, useState } from 'react';

const emptyForm = { title: '', content: '' };
const emptyCredentials = { username: '', password: '' };

function formatDate(value) {
  if (!value) return 'Just now';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function readErrorMessage(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    return data?.error || fallbackMessage;
  }

  const text = await response.text().catch(() => '');
  const trimmed = text.trim();

  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    return 'The API returned HTML instead of JSON. Check that the Vercel function server is running and the route exists.';
  }

  return trimmed || fallbackMessage;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [credentials, setCredentials] = useState(emptyCredentials);
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) || null,
    [notes, selectedId],
  );

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!session) {
      setNotes([]);
      setSelectedId(null);
      setForm(emptyForm);
      return;
    }

    loadNotes();
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (selectedNote) {
      setForm({ title: selectedNote.title, content: selectedNote.content });
    } else {
      setForm(emptyForm);
    }
  }, [selectedNote, session]);

  async function loadSession() {
    setAuthLoading(true);

    try {
      const response = await fetch('/api/auth/session', { credentials: 'include' });

      if (!response.ok) {
        setSession(null);
        return;
      }

      const data = await response.json();
      setSession(data.user || null);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadNotes() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/notebooks', { credentials: 'include' });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error('Unable to load notes.');
      }

      const data = await response.json();
      setNotes(data.notes || []);
      setSelectedId((currentSelectedId) => currentSelectedId || data.notes?.[0]?.id || null);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load notes.');
    } finally {
      setLoading(false);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
    };

    if (!payload.title || !payload.content) {
      setError('Both title and content are required.');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(selectedNote ? `/api/notebooks/${selectedNote.id}` : '/api/notebooks', {
        method: selectedNote ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to save note.'));
      }

      const data = await response.json();
      const savedNote = data.note;

      setNotes((currentNotes) => {
        const nextNotes = selectedNote
          ? currentNotes.map((note) => (note.id === savedNote.id ? savedNote : note))
          : [savedNote, ...currentNotes];

        return nextNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      });
      setSelectedId(savedNote.id);
      setMessage(selectedNote ? 'Notebook entry updated.' : 'Notebook entry created.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(noteId) {
    const noteToDelete = notes.find((note) => note.id === noteId);
    if (!noteToDelete) return;

    const confirmed = window.confirm(`Delete "${noteToDelete.title}"?`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`/api/notebooks/${noteId}`, { method: 'DELETE', credentials: 'include' });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok && response.status !== 204) {
        throw new Error(await readErrorMessage(response, 'Unable to delete note.'));
      }

      setNotes((currentNotes) => currentNotes.filter((note) => note.id !== noteId));
      setSelectedId((currentSelectedId) => {
        if (currentSelectedId !== noteId) return currentSelectedId;
        const remaining = notes.filter((note) => note.id !== noteId);
        return remaining[0]?.id || null;
      });
      setMessage('Notebook entry deleted.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete note.');
    } finally {
      setSaving(false);
    }
  }

  function startNewNote() {
    setSelectedId(null);
    setForm(emptyForm);
    setError('');
    setMessage('');
  }

  async function login(event) {
    event.preventDefault();
    setAuthError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Login failed.');
      }

      setCredentials(emptyCredentials);
      await loadSession();
    } catch (requestError) {
      setAuthError(requestError.message || 'Login failed.');
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setSession(null);
    setNotes([]);
    setSelectedId(null);
    setForm(emptyForm);
  }

  if (authLoading) {
    return (
      <div className="app-shell auth-shell">
        <main className="auth-card">Checking access...</main>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-shell auth-shell">
        <main className="auth-card login-card">
          <p className="eyebrow">Private notebook</p>
          <h1>Sign in to open the notebook.</h1>
          <p className="subcopy">Only the configured credentials can access this workspace and its serverless API.</p>

          <form className="editor-form" onSubmit={login}>
            <label>
              <span>Username</span>
              <input
                value={credentials.username}
                onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
                autoComplete="username"
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={credentials.password}
                onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
              />
            </label>

            <button className="primary-button" type="submit">
              Sign in
            </button>
          </form>

          {authError ? <p className="error-text">{authError}</p> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-frame">
        <button className="floating-signout ghost-button" type="button" onClick={logout}>
          Sign out
        </button>

        <section className="workspace">
          <aside className="notes-panel">
            <div className="panel-header">
              <h2>Your notes</h2>
              <button className="ghost-button" onClick={startNewNote} type="button">
                New note
              </button>
            </div>

            {loading ? (
              <div className="empty-state">Loading notes...</div>
            ) : notes.length === 0 ? (
              <div className="empty-state">
                <strong>No notes yet.</strong>
                <span>Create your first notebook entry on the right.</span>
              </div>
            ) : (
              <div className="note-list">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`note-card ${note.id === selectedId ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(note.id)}
                  >
                    <div>
                      <h3>{note.title}</h3>
                      <p>{note.content}</p>
                    </div>
                    <time>{formatDate(note.updatedAt)}</time>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="editor-panel">
            <div className="panel-header">
              <h2>{selectedNote ? 'Edit note' : 'New note'}</h2>
              {selectedNote ? (
                <button className="danger-button" type="button" onClick={() => deleteNote(selectedNote.id)}>
                  Delete
                </button>
              ) : null}
            </div>

            <form className="editor-form" onSubmit={saveNote}>
              <label>
                <span>Title</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, title: event.target.value }))}
                  placeholder="Example: Weekly project plan"
                  maxLength={120}
                />
              </label>

              <label>
                <span>Content</span>
                <textarea
                  value={form.content}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, content: event.target.value }))}
                  placeholder="Capture the important details here..."
                  rows={12}
                  maxLength={5000}
                />
              </label>

              <div className="form-footer">
                <p className="status-text">{message || 'Save changes to this notebook.'}</p>
                <button className="primary-button" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : selectedNote ? 'Update note' : 'Save note'}
                </button>
              </div>
            </form>

            {error ? <p className="error-text">{error}</p> : null}
          </section>
        </section>
      </main>
    </div>
  );
}