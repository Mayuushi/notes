import { useEffect, useMemo, useState } from 'react';

const emptyForm = { title: '', content: '', tag: '' };
const emptyCredentials = { username: '', password: '' };
const newNoteId = '__new__';

function formatDate(value) {
  if (!value) return 'Just now';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function compareByUpdatedAt(noteA, noteB, sortOrder) {
  const dateA = new Date(noteA.updatedAt).getTime();
  const dateB = new Date(noteB.updatedAt).getTime();

  return sortOrder === 'oldest' ? dateA - dateB : dateB - dateA;
}

function getVisibleNotes(notes, showUniqueTitles, sortOrder) {
  const sortedNotes = [...notes].sort((noteA, noteB) => compareByUpdatedAt(noteA, noteB, sortOrder));

  if (!showUniqueTitles) {
    return sortedNotes;
  }

  const seenTitles = new Set();
  const visibleNotes = [];

  for (const note of sortedNotes) {
    const titleKey = note.title.trim().toLowerCase();

    if (seenTitles.has(titleKey)) {
      continue;
    }

    seenTitles.add(titleKey);
    visibleNotes.push(note);
  }

  return visibleNotes;
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
  const [sortOrder, setSortOrder] = useState('newest');
  const [showUniqueTitles, setShowUniqueTitles] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const visibleNotes = useMemo(
    () => getVisibleNotes(notes, showUniqueTitles, sortOrder),
    [notes, showUniqueTitles, sortOrder],
  );
  const searchedNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return visibleNotes;
    }

    return visibleNotes.filter((note) => {
      const haystack = `${note.title} ${note.content} ${note.tag || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, visibleNotes]);
  const selectedNote = useMemo(
    () => visibleNotes.find((note) => note.id === selectedId) || null,
    [visibleNotes, selectedId],
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
      setForm({ title: selectedNote.title, content: selectedNote.content, tag: selectedNote.tag || '' });
    } else {
      setForm(emptyForm);
    }
  }, [selectedNote, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (visibleNotes.length === 0) {
      setSelectedId(null);
      return;
    }

    if (selectedId === newNoteId) {
      return;
    }

    if (!visibleNotes.some((note) => note.id === selectedId)) {
      setSelectedId(visibleNotes[0].id);
    }
  }, [visibleNotes, selectedId, session]);

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
      const nextNotes = data.notes || [];
      const nextVisibleNotes = getVisibleNotes(nextNotes, showUniqueTitles, sortOrder);

      setNotes(nextNotes);
      setSelectedId((currentSelectedId) => currentSelectedId || nextVisibleNotes[0]?.id || null);
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
      tag: form.tag.trim(),
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

        const remainingNotes = notes.filter((note) => note.id !== noteId);
        const remainingVisibleNotes = getVisibleNotes(remainingNotes, showUniqueTitles, sortOrder);
        return remainingVisibleNotes[0]?.id || null;
      });
      setMessage('Notebook entry deleted.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete note.');
    } finally {
      setSaving(false);
    }
  }

  function startNewNote() {
    setSelectedId(newNoteId);
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
      <aside className="sidebar-shell">
        <section className="sidebar-section sidebar-history">
          <label className="sidebar-search">
            <span>Search notes</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search titles and content"
            />
          </label>

          <div className="sidebar-section-header">
            <h2>Notes</h2>
            <span>{searchedNotes.length}</span>
          </div>

          <button className="sidebar-link sidebar-new-note" onClick={startNewNote} type="button">
            + New note
          </button>

          {loading ? (
            <div className="sidebar-empty">Loading notes...</div>
          ) : searchedNotes.length === 0 ? (
            <div className="sidebar-empty">
              <strong>{searchQuery ? 'No matches found.' : 'No notes yet.'}</strong>
              <span>{searchQuery ? 'Try a different search term.' : 'Create your first notebook entry in the editor.'}</span>
            </div>
          ) : (
            <div className="sidebar-note-list">
              {searchedNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className={`sidebar-note ${note.id === selectedId ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(note.id)}
                >
                    <strong>{note.title}</strong>
                    {note.tag ? <span className="note-tag">#{note.tag}</span> : null}
                    <span>{formatDate(note.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="sidebar-section sidebar-footer">
          <p>{session.username}</p>
          <button className="ghost-button sidebar-signout" type="button" onClick={logout}>
            Sign out
          </button>
        </section>
      </aside>

      <main className="app-frame">
        <section className="workspace">
          <section className="editor-panel">
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
                <span>Tag</span>
                <input
                  value={form.tag}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, tag: event.target.value }))}
                  placeholder="Example: planning"
                  maxLength={40}
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