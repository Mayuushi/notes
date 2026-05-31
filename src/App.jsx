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
  const [activeScreen, setActiveScreen] = useState('notes');
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [credentials, setCredentials] = useState(emptyCredentials);
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState([]);
  const [archiveBulkDeleteMode, setArchiveBulkDeleteMode] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [showUniqueTitles, setShowUniqueTitles] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [notesPopupMode, setNotesPopupMode] = useState(null);
  const [aiTopic, setAiTopic] = useState('OOP');
  const [aiTag, setAiTag] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState('');
  const [examTag, setExamTag] = useState('');
  const [examLoading, setExamLoading] = useState(false);
  const [examError, setExamError] = useState('');
  const [examList, setExamList] = useState([]);
  const [examListLoading, setExamListLoading] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [examAnswers, setExamAnswers] = useState({});
  const [examResult, setExamResult] = useState(null);
  const [examGeneratorOpen, setExamGeneratorOpen] = useState(false);
  const [examNotesPickerOpen, setExamNotesPickerOpen] = useState(false);
  const [selectedExamSourceNoteIds, setSelectedExamSourceNoteIds] = useState([]);
  const [examNotesQuery, setExamNotesQuery] = useState('');
  const [examQuestionCount, setExamQuestionCount] = useState(12);
  const [selectedNotesQuestionCount, setSelectedNotesQuestionCount] = useState(12);

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
  const selectedArchiveNotes = useMemo(
    () => notes.filter((note) => selectedNoteIds.includes(note.id)),
    [notes, selectedNoteIds],
  );
  const selectedExam = useMemo(
    () => examList.find((exam) => exam.id === selectedExamId) || null,
    [examList, selectedExamId],
  );
  const [displayedExam, setDisplayedExam] = useState(null);
  const filteredExamSourceNotes = useMemo(() => {
    const query = examNotesQuery.trim().toLowerCase();

    if (!query) {
      return notes;
    }

    return notes.filter((note) => {
      const haystack = `${note.title} ${note.content} ${note.tag || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [examNotesQuery, notes]);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!session) {
      setNotes([]);
      setSelectedId(null);
      setSelectedNoteIds([]);
      setArchiveBulkDeleteMode(false);
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

  useEffect(() => {
    if (!session || activeScreen !== 'exam') {
      return;
    }

    loadMockExams();
  }, [activeScreen, session]);

  useEffect(() => {
    if (!archiveBulkDeleteMode) {
      setSelectedNoteIds([]);
    }
  }, [archiveBulkDeleteMode]);

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

  async function loadMockExams() {
    setExamListLoading(true);
    setExamError('');

    try {
      const response = await fetch('/api/mock-exams', { credentials: 'include' });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to load saved exams.'));
      }

      const data = await response.json();
      const exams = data.exams || [];

      setExamList(exams);
      setSelectedExamId((currentExamId) => currentExamId || exams[0]?.id || null);
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to load saved exams.');
    } finally {
      setExamListLoading(false);
    }
  }

  function toggleArchiveBulkDeleteMode() {
    setArchiveBulkDeleteMode((currentMode) => !currentMode);
  }

  function toggleArchiveNoteSelection(noteId) {
    setSelectedNoteIds((currentIds) => (
      currentIds.includes(noteId)
        ? currentIds.filter((currentId) => currentId !== noteId)
        : [...currentIds, noteId]
    ));
  }

  async function deleteArchiveNote(noteId) {
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
      setSelectedNoteIds((currentIds) => currentIds.filter((currentId) => currentId !== noteId));
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

  async function deleteSelectedArchiveNotes() {
    if (selectedArchiveNotes.length === 0) {
      setError('Select one or more notes first.');
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedArchiveNotes.length} selected note(s)?`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await Promise.all(selectedArchiveNotes.map((note) => fetch(`/api/notebooks/${note.id}`, { method: 'DELETE', credentials: 'include' })));
      const deletedIds = new Set(selectedArchiveNotes.map((note) => note.id));
      const remainingNotes = notes.filter((note) => !deletedIds.has(note.id));
      const remainingVisibleNotes = getVisibleNotes(remainingNotes, showUniqueTitles, sortOrder);

      setNotes(remainingNotes);
      setSelectedNoteIds([]);
      setSelectedId((currentSelectedId) => (deletedIds.has(currentSelectedId) ? remainingVisibleNotes[0]?.id || null : currentSelectedId));
      setForm(emptyForm);
      setMessage(`${deletedIds.size} note(s) deleted.`);
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete selected notes.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAllArchiveNotes() {
    if (notes.length === 0) {
      setError('No notes to delete.');
      return;
    }

    const confirmed = window.confirm(`Delete all ${notes.length} notes?`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await Promise.all(notes.map((note) => fetch(`/api/notebooks/${note.id}`, { method: 'DELETE', credentials: 'include' })));
      setNotes([]);
      setSelectedNoteIds([]);
      setSelectedId(null);
      setForm(emptyForm);
      setMessage('All notes deleted.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete all notes.');
    } finally {
      setSaving(false);
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
      setSelectedNoteIds((currentIds) => (currentIds.includes(savedNote.id) ? currentIds : currentIds));
      setMessage(selectedNote ? 'Notebook entry updated.' : 'Notebook entry created.');
      if (notesPopupMode === 'note') {
        setNotesPopupMode(null);
      }
    } catch (requestError) {
      setError(requestError.message || 'Unable to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function generateNotesFromTopic(event) {
    event.preventDefault();

    const topic = aiTopic.trim();
    const tag = aiTag.trim();

    if (!topic) {
      setGeneratorError('Enter a topic to generate notes from.');
      return;
    }

    setGenerating(true);
    setGeneratorError('');
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/ai/generate-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ topic, tag }),
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to generate notes.'));
      }

      const data = await response.json();
      const generatedNotes = data.notes || [];

      setNotes((currentNotes) => {
        const nextNotes = [...generatedNotes, ...currentNotes];
        return nextNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      });
      setSelectedId(generatedNotes[0]?.id || null);
      setMessage(`Generated ${generatedNotes.length} notes from ${topic}${tag ? ` under #${tag}` : ''}.`);
      if (notesPopupMode === 'generate') {
        setNotesPopupMode(null);
      }
    } catch (requestError) {
      setGeneratorError(requestError.message || 'Unable to generate notes.');
    } finally {
      setGenerating(false);
    }
  }

  async function generateMockExam(event) {
    event.preventDefault();

    const tag = examTag.trim();
    const questionCount = Math.max(5, Math.min(30, Number.parseInt(String(examQuestionCount), 10) || 12));

    if (!tag) {
      setExamError('Enter a tag to generate a mock exam.');
      return;
    }

    setExamLoading(true);
    setExamError('');
    setExamResult(null);

    try {
      const response = await fetch('/api/ai/mock-exam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ tag, questionCount }),
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to generate mock exam.'));
      }

      const data = await response.json();
      const nextExam = data.exam || null;

      if (!nextExam) {
        throw new Error('Unable to read generated exam.');
      }

      setExamList((currentExams) => {
        const deduped = currentExams.filter((exam) => exam.id !== nextExam.id);
        return [nextExam, ...deduped];
      });
      setSelectedExamId(nextExam.id);
      setExamAnswers({});
      setExamGeneratorOpen(false);
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to generate mock exam.');
    } finally {
      setExamLoading(false);
    }
  }

  async function generateMockExamFromSelectedNotes(event) {
    event.preventDefault();

    const questionCount = Math.max(5, Math.min(30, Number.parseInt(String(selectedNotesQuestionCount), 10) || 12));

    if (selectedExamSourceNoteIds.length === 0) {
      setExamError('Select one or more notes first.');
      return;
    }

    setExamLoading(true);
    setExamError('');
    setExamResult(null);

    try {
      const response = await fetch('/api/ai/mock-exam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ noteIds: selectedExamSourceNoteIds, questionCount }),
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to generate mock exam from selected notes.'));
      }

      const data = await response.json();
      const nextExam = data.exam || null;

      if (!nextExam) {
        throw new Error('Unable to read generated exam.');
      }

      setExamList((currentExams) => {
        const deduped = currentExams.filter((exam) => exam.id !== nextExam.id);
        return [nextExam, ...deduped];
      });
      setSelectedExamId(nextExam.id);
      setExamAnswers({});
      setExamNotesPickerOpen(false);
      setSelectedExamSourceNoteIds([]);
      setExamNotesQuery('');
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to generate mock exam from selected notes.');
    } finally {
      setExamLoading(false);
    }
  }

  async function deleteMockExam(examId) {
    const examToDelete = examList.find((exam) => exam.id === examId);
    if (!examToDelete) {
      return;
    }

    const confirmed = window.confirm(`Delete mock exam "${examToDelete.title}"?`);
    if (!confirmed) {
      return;
    }

    setExamError('');

    try {
      const response = await fetch(`/api/mock-exams/${examId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok && response.status !== 204) {
        throw new Error(await readErrorMessage(response, 'Unable to delete mock exam.'));
      }

      setExamList((currentExams) => currentExams.filter((exam) => exam.id !== examId));
      setSelectedExamId((currentSelectedId) => {
        if (currentSelectedId !== examId) {
          return currentSelectedId;
        }

        const remainingExams = examList.filter((exam) => exam.id !== examId);
        return remainingExams[0]?.id || null;
      });
      if (selectedExamId === examId) {
        setExamAnswers({});
        setExamResult(null);
      }
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to delete mock exam.');
    }
  }

  function selectExam(examId) {
    setSelectedExamId(examId);
    setExamAnswers({});
    setExamResult(null);
    setExamError('');
  }

  useEffect(() => {
    if (!selectedExam) {
      setDisplayedExam(null);
      return;
    }

    // Build a shuffled view of the exam questions so choices appear in random order
    try {
      const copy = JSON.parse(JSON.stringify(selectedExam));
      copy.questions = (copy.questions || []).map((q) => {
        const indices = (q.options || []).map((_, i) => i);
        // Fisher-Yates shuffle
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const shuffledOptions = indices.map((i) => (q.options || [])[i]);
        return { ...q, options: shuffledOptions, shuffledToOriginalIndex: indices };
      });

      setDisplayedExam(copy);
    } catch (e) {
      // Fallback: if anything goes wrong, just show the original exam
      setDisplayedExam(selectedExam);
    }
  }, [selectedExam]);

  function selectExamAnswer(questionId, answerIndex) {
    setExamAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: answerIndex,
    }));
  }

  async function submitExamAttempt(event) {
    event.preventDefault();

    if (!selectedExam) {
      setExamError('Select an exam before submitting.');
      return;
    }

    setExamLoading(true);
    setExamError('');

    try {
      // Map answers from displayed (shuffled) indices back to the original indices
      const answersToSend = {};
      Object.keys(examAnswers).forEach((questionId) => {
        const displayedQ = (displayedExam || selectedExam)?.questions.find((q) => q.id === questionId);
        if (!displayedQ) return;
        const shuffledMap = displayedQ.shuffledToOriginalIndex || (displayedQ.options || []).map((_, i) => i);
        const chosenDisplayedIndex = examAnswers[questionId];
        const originalIndex = shuffledMap[chosenDisplayedIndex] ?? chosenDisplayedIndex;
        answersToSend[questionId] = originalIndex;
      });

      const response = await fetch('/api/mock-exams/attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          examId: selectedExam.id,
          answers: answersToSend,
        }),
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to submit exam attempt.'));
      }

      const data = await response.json();
      setExamResult(data);
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to submit exam attempt.');
    } finally {
      setExamLoading(false);
    }
  }

  function startNewNote() {
    setSelectedId(newNoteId);
    setForm(emptyForm);
    setError('');
    setMessage('');
  }

  function openAllNotes() {
    setActiveScreen('all-notes');
  }

  function openNewNotePopup() {
    setSelectedId(newNoteId);
    setForm(emptyForm);
    setNotesPopupMode('note');
  }

  function openGeneratePopup() {
    setNotesPopupMode('generate');
  }

  function closeNotesPopup() {
    setNotesPopupMode(null);
  }

  function openGenerateExamPopup() {
    setExamGeneratorOpen(true);
  }

  function closeGenerateExamPopup() {
    setExamGeneratorOpen(false);
  }

  function openExamNotesPicker() {
    setExamNotesPickerOpen(true);
    setExamError('');
  }

  function closeExamNotesPicker() {
    setExamNotesPickerOpen(false);
  }

  function toggleExamSourceNoteSelection(noteId) {
    setSelectedExamSourceNoteIds((currentIds) => (
      currentIds.includes(noteId)
        ? currentIds.filter((currentId) => currentId !== noteId)
        : [...currentIds, noteId]
    ));
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

  const examToRender = displayedExam || selectedExam;

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
      {examNotesPickerOpen ? (
        <div className="modal-overlay" role="presentation" onClick={closeExamNotesPicker}>
          <section
            className="modal-card notes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-notes-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Mock exam builder</p>
                <h2 id="exam-notes-picker-title">Generate from selected notes</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeExamNotesPicker}>
                Close
              </button>
            </div>

            <div className="modal-body">
              <form className="exam-notes-picker" onSubmit={generateMockExamFromSelectedNotes}>
                <label>
                  <span>Search notes</span>
                  <input
                    value={examNotesQuery}
                    onChange={(event) => setExamNotesQuery(event.target.value)}
                    placeholder="Search by title, tag, or content"
                  />
                </label>

                <label>
                  <span>Number of questions</span>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={selectedNotesQuestionCount}
                    onChange={(event) => setSelectedNotesQuestionCount(event.target.value)}
                  />
                </label>

                <p className="status-text">
                  Selected {selectedExamSourceNoteIds.length} note{selectedExamSourceNoteIds.length === 1 ? '' : 's'}.
                </p>

                <div className="exam-note-selection-list">
                  {filteredExamSourceNotes.length === 0 ? (
                    <p className="status-text">No matching notes found.</p>
                  ) : (
                    filteredExamSourceNotes.map((note) => (
                      <label key={note.id} className="exam-note-selection-item">
                        <input
                          type="checkbox"
                          checked={selectedExamSourceNoteIds.includes(note.id)}
                          onChange={() => toggleExamSourceNoteSelection(note.id)}
                        />
                        <div>
                          <strong>{note.title}</strong>
                          {note.tag ? <span className="note-tag">#{note.tag}</span> : null}
                          <span>{formatDate(note.updatedAt)}</span>
                        </div>
                      </label>
                    ))
                  )}
                </div>

                <div className="ai-generator-footer">
                  <p className="status-text">{examError || 'Pick multiple notes and generate one mock exam from them.'}</p>
                  <button className="primary-button" type="submit" disabled={examLoading || selectedExamSourceNoteIds.length === 0}>
                    {examLoading ? 'Generating...' : 'Generate mock exam'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {examGeneratorOpen ? (
        <div className="modal-overlay" role="presentation" onClick={closeGenerateExamPopup}>
          <section
            className="modal-card notes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-popup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Mock exam builder</p>
                <h2 id="exam-popup-title">Generate mock exam with Groq</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeGenerateExamPopup}>
                Close
              </button>
            </div>

            <div className="modal-body">
              <form className="ai-generator exam-popup-generator" onSubmit={generateMockExam}>
                <div className="ai-generator-heading">
                  <h2>Generate mock exam with Groq</h2>
                  <p>Enter a tag and Groq will build an exam based on matching notes.</p>
                </div>

                <label>
                  <span>Tag</span>
                  <input
                    value={examTag}
                    onChange={(event) => setExamTag(event.target.value)}
                    placeholder="Example: programming"
                    maxLength={40}
                  />
                </label>

                <label>
                  <span>Number of questions</span>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={examQuestionCount}
                    onChange={(event) => setExamQuestionCount(event.target.value)}
                  />
                </label>

                <div className="ai-generator-footer">
                  <p className="status-text">{examError || 'Uses all notes that share the tag to build one exam.'}</p>
                  <button className="primary-button" type="submit" disabled={examLoading}>
                    {examLoading ? 'Generating...' : 'Generate mock exam'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {notesPopupMode ? (
        <div className="modal-overlay" role="presentation" onClick={closeNotesPopup}>
          <section
            className="modal-card notes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-popup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">{notesPopupMode === 'note' ? 'New note' : 'Generate notes'}</p>
                <h2 id="notes-popup-title">{notesPopupMode === 'note' ? 'Create a note' : 'Generate from a topic'}</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeNotesPopup}>
                Close
              </button>
            </div>

            <div className="modal-body">
              {notesPopupMode === 'note' ? (
                <form className="editor-form notes-popup-form" onSubmit={saveNote}>
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
              ) : (
                <form className="ai-generator notes-popup-generator" onSubmit={generateNotesFromTopic}>
                  <div className="ai-generator-heading">
                    <h2>Generate notes with Groq</h2>
                    <p>Enter a topic and let the AI break it into focused study notes.</p>
                  </div>

                  <div className="ai-generator-grid">
                    <label>
                      <span>Topic</span>
                      <input
                        value={aiTopic}
                        onChange={(event) => setAiTopic(event.target.value)}
                        placeholder="Example: OOP"
                        maxLength={120}
                      />
                    </label>

                    <label>
                      <span>Tag</span>
                      <input
                        value={aiTag}
                        onChange={(event) => setAiTag(event.target.value)}
                        placeholder="Example: programming"
                        maxLength={40}
                      />
                    </label>
                  </div>

                  <div className="ai-generator-footer">
                    <p className="status-text">{generatorError || 'Creates separate notes for the main subtopics.'}</p>
                    <button className="primary-button" type="submit" disabled={generating}>
                      {generating ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <aside className="sidebar-shell">
        <section className="sidebar-section sidebar-navigation">
          <button
            className={`sidebar-link ${activeScreen === 'notes' ? 'is-active' : ''}`}
            type="button"
            onClick={() => setActiveScreen('notes')}
          >
            Notes Workspace
          </button>
          <button
            className={`sidebar-link ${activeScreen === 'exam' ? 'is-active' : ''}`}
            type="button"
            onClick={() => setActiveScreen('exam')}
          >
            Mock Exam Builder
          </button>
          <button
            className={`sidebar-link ${activeScreen === 'all-notes' ? 'is-active' : ''}`}
            type="button"
            onClick={() => setActiveScreen('all-notes')}
          >
            Show all notes
          </button>
        </section>

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
                <label key={note.id} className={`sidebar-note-row ${note.id === selectedId ? 'is-active' : ''}`}>
                  <button
                    type="button"
                    className={`sidebar-note ${note.id === selectedId ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(note.id)}
                  >
                    <strong>{note.title}</strong>
                    {note.tag ? <span className="note-tag">#{note.tag}</span> : null}
                    <span>{formatDate(note.updatedAt)}</span>
                  </button>
                </label>
              ))}
            </div>
          )}
        </section>

      </aside>

      <main className="app-frame">
        <section className="workspace">
          {activeScreen === 'all-notes' ? (
            <section className="editor-panel notes-archive-panel">
              <div className="workspace-header notes-archive-header">
                <button className="ghost-button" type="button" onClick={() => setActiveScreen('notes')}>
                  Back
                </button>
                <div className="notes-archive-actions">
                  {archiveBulkDeleteMode ? (
                    <>
                      <button className="ghost-button" type="button" onClick={deleteSelectedArchiveNotes} disabled={saving || selectedArchiveNotes.length === 0}>
                        Selected ({selectedArchiveNotes.length})
                      </button>
                      <button className="ghost-button" type="button" onClick={toggleArchiveBulkDeleteMode}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="ghost-button" type="button" onClick={toggleArchiveBulkDeleteMode}>
                      Multiple
                    </button>
                  )}
                  <button className="danger-button" type="button" onClick={deleteAllArchiveNotes} disabled={saving || notes.length === 0}>
                    All
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="status-text">Loading notes...</p>
              ) : notes.length === 0 ? (
                <p className="status-text">No notes saved yet.</p>
              ) : (
                <div className="notes-archive-list">
                  {[...notes]
                    .sort((noteA, noteB) => compareByUpdatedAt(noteA, noteB, sortOrder))
                    .map((note) => (
                      <div key={note.id} className={`notes-archive-row ${selectedNoteIds.includes(note.id) ? 'is-active' : ''}`}>
                        {archiveBulkDeleteMode ? (
                          <input
                            className="notes-archive-check"
                            type="checkbox"
                            checked={selectedNoteIds.includes(note.id)}
                            onChange={() => toggleArchiveNoteSelection(note.id)}
                          />
                        ) : (
                          <span className="notes-archive-check-spacer" aria-hidden="true" />
                        )}
                        <button
                          className="notes-archive-item"
                          type="button"
                          onClick={() => {
                            if (archiveBulkDeleteMode) {
                              toggleArchiveNoteSelection(note.id);
                              return;
                            }

                            setSelectedId(note.id);
                            setActiveScreen('notes');
                          }}
                        >
                          <div className="notes-archive-item-header">
                            <strong>{note.title}</strong>
                            <span>{formatDate(note.updatedAt)}</span>
                          </div>
                          {note.tag ? <span className="note-tag">#{note.tag}</span> : null}
                          <p>{note.content}</p>
                        </button>
                        <button
                          className="ghost-button notes-archive-delete"
                          type="button"
                          onClick={() => deleteArchiveNote(note.id)}
                          aria-label={`Delete ${note.title}`}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </section>
          ) : activeScreen === 'notes' ? (
            <section className="editor-panel notes-workspace">
              <div className="notes-top-actions">
                <button className="small-floating-button" type="button" onClick={openNewNotePopup} aria-label="Add note">
                  +
                </button>
                <button className="small-floating-button" type="button" onClick={openGeneratePopup}>
                  Generate
                </button>
              </div>

              <div className="notes-workspace-copy">
                <p className="eyebrow">Notes workspace</p>
                <h2>{selectedNote ? selectedNote.title : 'Select a note from the sidebar'}</h2>
                <p className="subcopy">
                  Use the fixed buttons in the top-right corner to add a note or generate new notes without taking space from the editor.
                </p>
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
          ) : (
            <section className="editor-panel exam-panel">
              <div className="exam-top-actions">
                <button className="small-floating-button floating-icon-button" type="button" onClick={openExamNotesPicker} aria-label="Generate from selected notes">
                  +
                </button>
                <button className="small-floating-button" type="button" onClick={openGenerateExamPopup}>
                  Generate
                </button>
              </div>

              <div className="exam-workspace-copy">
                <p className="eyebrow">Mock exam builder</p>
                <h2>Generate mock exam with Groq</h2>
                <p className="subcopy">Open the floating button to build an exam from notes that share a tag.</p>
              </div>

              <section className="exam-lms-layout">
                <aside className="exam-list-card">
                  <h3>Saved mock exams</h3>
                  {examListLoading ? (
                    <p className="status-text">Loading exams...</p>
                  ) : examList.length === 0 ? (
                    <p className="status-text">No saved mock exams yet.</p>
                  ) : (
                    <div className="exam-list">
                      {examList.map((exam) => (
                        <div key={exam.id} className="exam-list-row">
                          <button
                            type="button"
                            className={`exam-list-item ${exam.id === selectedExamId ? 'is-active' : ''}`}
                            onClick={() => selectExam(exam.id)}
                          >
                            <strong>{exam.title}</strong>
                            <span>#{exam.tag}</span>
                            <span>{exam.questionCount} questions</span>
                          </button>
                          <button
                            type="button"
                            className="ghost-button exam-list-delete"
                            onClick={() => deleteMockExam(exam.id)}
                            aria-label={`Delete ${exam.title}`}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </aside>

                <section className="exam-player-card">
                  {examToRender ? (
                    <form className="exam-player" onSubmit={submitExamAttempt}>
                      <div className="exam-player-header">
                        <h3>{examToRender.title}</h3>
                        <p className="status-text">
                          #{examToRender.tag} • {examToRender.questionCount} questions • {examToRender.timeLimitMinutes} min suggested time
                        </p>
                        <p className="status-text">{examToRender.instructions}</p>
                      </div>

                      <div className="exam-questions">
                        {(examToRender.questions || []).map((question, questionIndex) => (
                          <fieldset key={question.id} className="exam-question">
                            <legend>
                              {questionIndex + 1}. {question.prompt}
                            </legend>
                            <div className="exam-options">
                              {(question.options || []).map((option, optionIndex) => (
                                <label key={`${question.id}-${optionIndex}`} className="exam-option">
                                  <input
                                    type="radio"
                                    name={question.id}
                                    checked={examAnswers[question.id] === optionIndex}
                                    onChange={() => selectExamAnswer(question.id, optionIndex)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ))}
                      </div>

                      <div className="ai-generator-footer">
                        <p className="status-text">
                          {examResult ? `Score: ${examResult.score}/${examResult.total} (${examResult.percentage}%)` : 'Answer all questions, then submit your attempt.'}
                        </p>
                        <button className="primary-button" type="submit" disabled={examLoading}>
                          {examLoading ? 'Submitting...' : 'Submit attempt'}
                        </button>
                      </div>

                      {examResult ? (
                        <section className="exam-result">
                          <h4>Result breakdown</h4>
                          <p className="status-text">
                            Answered {examResult.answeredCount} of {examResult.total} • Attempt saved
                          </p>
                          <div className="exam-breakdown">
                            {(examResult.breakdown || []).map((item, itemIndex) => (
                              <article key={item.questionId} className={`exam-breakdown-item ${item.isCorrect ? 'is-correct' : 'is-wrong'}`}>
                                <strong>
                                  {itemIndex + 1}. {item.isCorrect ? 'Correct' : 'Incorrect'}
                                </strong>
                                {!item.isCorrect ? (
                                  <span>
                                    Correct option: {(selectedExam.questions.find((question) => question.id === item.questionId)?.options || [])[item.correctIndex] || 'N/A'}
                                  </span>
                                ) : null}
                                {item.explanation ? <span>{item.explanation}</span> : null}
                              </article>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </form>
                  ) : (
                    <p className="status-text">Generate or select a mock exam to begin.</p>
                  )}
                </section>
              </section>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}