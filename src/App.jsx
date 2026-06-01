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
  const [archiveManageOpen, setArchiveManageOpen] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [deletePromptError, setDeletePromptError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [showUniqueTitles, setShowUniqueTitles] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
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
  const [examFreeformOpen, setExamFreeformOpen] = useState(false);
  const [selectedExamSourceNoteIds, setSelectedExamSourceNoteIds] = useState([]);
  const [examNotesQuery, setExamNotesQuery] = useState('');
  const [examQuestionCount, setExamQuestionCount] = useState(12);
  const [selectedNotesQuestionCount, setSelectedNotesQuestionCount] = useState(12);
  const [freeformExamPrompt, setFreeformExamPrompt] = useState('');
  const [freeformExamTag, setFreeformExamTag] = useState('');
  const [freeformExamQuestionCount, setFreeformExamQuestionCount] = useState(12);
  const [examAttempts, setExamAttempts] = useState([]);
  const [examAttemptsLoading, setExamAttemptsLoading] = useState(false);
  const [noteEditorMode, setNoteEditorMode] = useState('view');

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
  const archiveVisibleNotes = useMemo(() => {
    const query = archiveSearchQuery.trim().toLowerCase();
    const sortedNotes = [...notes].sort((noteA, noteB) => compareByUpdatedAt(noteA, noteB, sortOrder));

    if (!query) {
      return sortedNotes;
    }

    return sortedNotes.filter((note) => {
      const haystack = `${note.title} ${note.content} ${note.tag || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [archiveSearchQuery, notes, sortOrder]);
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
      setArchiveManageOpen(false);
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
      setNoteEditorMode(selectedId === newNoteId ? 'edit' : 'view');
    } else {
      setForm(emptyForm);
      setNoteEditorMode(selectedId === newNoteId ? 'edit' : 'view');
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

  function toggleArchiveNoteSelection(noteId) {
    setSelectedNoteIds((currentIds) => (
      currentIds.includes(noteId)
        ? currentIds.filter((currentId) => currentId !== noteId)
        : [...currentIds, noteId]
    ));
  }

  function openArchiveManage() {
    setSelectedNoteIds([]);
    setArchiveManageOpen(true);
    setError('');
  }

  function closeArchiveManage() {
    setArchiveManageOpen(false);
    setSelectedNoteIds([]);
  }

  function openDeletePrompt(prompt) {
    if (deleting) {
      return;
    }

    setDeletePromptError('');
    setDeletePrompt(prompt);
  }

  function closeDeletePrompt() {
    if (deleting) {
      return;
    }

    setDeletePromptError('');
    setDeletePrompt(null);
  }

  async function confirmDeletePrompt() {
    if (!deletePrompt) {
      return;
    }

    setDeleting(true);
    setError('');
    setMessage('');
    setDeletePromptError('');

    try {
      await deletePrompt.onConfirm();
      setDeletePrompt(null);
    } catch (requestError) {
      setDeletePromptError(requestError.message || 'Unable to delete item.');
    } finally {
      setDeleting(false);
    }
  }

  async function performDeleteArchiveNotesByIds(noteIds) {
    const uniqueIds = [...new Set(noteIds)];

    if (uniqueIds.length === 0) {
      throw new Error('Select one or more notes first.');
    }

    const notesToDelete = notes.filter((note) => uniqueIds.includes(note.id));

    if (notesToDelete.length === 0) {
      throw new Error('No notes to delete.');
    }

    try {
      const responses = await Promise.all(
        notesToDelete.map(async (note) => {
          const response = await fetch(`/api/notebooks/${note.id}`, { method: 'DELETE', credentials: 'include' });

          if (response.status === 401) {
            setSession(null);
            return response;
          }

          if (!response.ok && response.status !== 204) {
            throw new Error(await readErrorMessage(response, 'Unable to delete note.'));
          }

          return response;
        }),
      );

      if (responses.some((response) => response.status === 401)) {
        return;
      }

      const deletedIds = new Set(notesToDelete.map((note) => note.id));
      const remainingNotes = notes.filter((note) => !deletedIds.has(note.id));
      const remainingVisibleNotes = getVisibleNotes(remainingNotes, showUniqueTitles, sortOrder);

      setNotes(remainingNotes);
      setSelectedNoteIds([]);
      setSelectedId((currentSelectedId) => (deletedIds.has(currentSelectedId) ? remainingVisibleNotes[0]?.id || null : currentSelectedId));
      setForm(emptyForm);
      setMessage(`${deletedIds.size} note(s) deleted.`);
      setArchiveManageOpen(false);
    } catch (requestError) {
      throw requestError;
    }
  }

  async function deleteAllArchiveNotes() {
    openDeletePrompt({
      title: `Delete all ${notes.length} notes?`,
      description: 'This will permanently remove every note in the archive.',
      confirmLabel: 'Delete all',
      onConfirm: () => performDeleteArchiveNotesByIds(notes.map((note) => note.id)),
    });
  }

  async function deleteSelectedArchiveNotes() {
    openDeletePrompt({
      title: `Delete ${selectedNoteIds.length} selected note(s)?`,
      description: 'This will permanently remove the selected notes.',
      confirmLabel: 'Delete selected',
      onConfirm: () => performDeleteArchiveNotesByIds(selectedNoteIds),
    });
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

  async function generateMockExamFromPrompt(event) {
    event.preventDefault();

    const prompt = freeformExamPrompt.trim();
    const tag = freeformExamTag.trim();
    const questionCount = Math.max(5, Math.min(30, Number.parseInt(String(freeformExamQuestionCount), 10) || 12));

    if (!prompt) {
      setExamError('Enter study material or code snippets to generate from.');
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
        body: JSON.stringify({ prompt, tag, questionCount }),
      });

      if (response.status === 401) {
        setSession(null);
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Unable to generate mock exam from prompt.'));
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
      setExamFreeformOpen(false);
      setFreeformExamPrompt('');
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to generate mock exam from prompt.');
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

  async function performDeleteMockExam(examId) {
    const examToDelete = examList.find((exam) => exam.id === examId);
    if (!examToDelete) {
      throw new Error('Unable to delete mock exam.');
    }

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
      throw requestError;
    }
  }

  function deleteMockExam(examId) {
    const examToDelete = examList.find((exam) => exam.id === examId);

    if (!examToDelete) {
      return;
    }

    openDeletePrompt({
      title: `Delete mock exam "${examToDelete.title}"?`,
      description: 'This cannot be undone.',
      confirmLabel: 'Delete exam',
      onConfirm: () => performDeleteMockExam(examId),
    });
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

  useEffect(() => {
    if (!selectedExam) {
      setExamAttempts([]);
      return;
    }

    async function loadExamAttempts() {
      setExamAttemptsLoading(true);

      try {
        const response = await fetch(`/api/mock-exams/${selectedExam.id}/attempts`, { credentials: 'include' });

        if (response.status === 401) {
          setSession(null);
          return;
        }

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, 'Unable to load previous attempts.'));
        }

        const data = await response.json();
        setExamAttempts(data.attempts || []);
      } catch (requestError) {
        setExamError(requestError.message || 'Unable to load previous attempts.');
        setExamAttempts([]);
      } finally {
        setExamAttemptsLoading(false);
      }
    }

    loadExamAttempts();
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
      setExamAttempts((currentAttempts) => [
        {
          id: data.attemptId,
          examId: selectedExam.id,
          examTitle: selectedExam.title,
          examTag: selectedExam.tag || '',
          score: data.score,
          total: data.total,
          answeredCount: data.answeredCount,
          percentage: data.percentage,
          submittedAt: data.submittedAt,
        },
        ...currentAttempts,
      ]);
    } catch (requestError) {
      setExamError(requestError.message || 'Unable to submit exam attempt.');
    } finally {
      setExamLoading(false);
    }
  }

  function startNewNote() {
    setSelectedId(newNoteId);
    setForm(emptyForm);
    setNoteEditorMode('edit');
    setError('');
    setMessage('');
  }

  function openAllNotes() {
    setActiveScreen('all-notes');
  }

  function openNewNotePopup() {
    setSelectedId(newNoteId);
    setForm(emptyForm);
    setNoteEditorMode('edit');
    setNotesPopupMode('note');
  }

  function openGeneratePopup() {
    setNotesPopupMode('generate');
  }

  function startEditingSelectedNote() {
    if (!selectedNote) {
      return;
    }

    setForm({ title: selectedNote.title, content: selectedNote.content, tag: selectedNote.tag || '' });
    setNoteEditorMode('edit');
    setError('');
    setMessage('');
  }

  function cancelEditingSelectedNote() {
    if (!selectedNote) {
      return;
    }

    setForm({ title: selectedNote.title, content: selectedNote.content, tag: selectedNote.tag || '' });
    setNoteEditorMode('view');
    setError('');
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

  function openFreeformExamPopup() {
    setExamFreeformOpen(true);
    setExamError('');
  }

  function closeFreeformExamPopup() {
    setExamFreeformOpen(false);
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
      {deletePrompt ? (
        <div className="modal-overlay delete-confirm-overlay" role="presentation" onClick={closeDeletePrompt}>
          <section className="modal-card delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Confirm delete</p>
                <h2 id="delete-confirm-title">{deletePrompt.title}</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeDeletePrompt} disabled={deleting}>
                Close
              </button>
            </div>

            <div className="modal-body delete-confirm-body">
              <div className="delete-confirm-copy">
                <p className="status-text">{deletePrompt.description}</p>
              </div>

              {deletePromptError ? <p className="error-text delete-confirm-error">{deletePromptError}</p> : null}

              <div className="delete-confirm-actions">
                <button className="ghost-button" type="button" onClick={closeDeletePrompt} disabled={deleting}>
                  Cancel
                </button>
                <button className="danger-button delete-confirm-button" type="button" onClick={confirmDeletePrompt} disabled={deleting}>
                  {deleting ? (
                    <>
                      <span className="button-spinner" aria-hidden="true" />
                      Deleting...
                    </>
                  ) : (
                    deletePrompt.confirmLabel
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

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

      {examFreeformOpen ? (
        <div className="modal-overlay" role="presentation" onClick={closeFreeformExamPopup}>
          <section
            className="modal-card notes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-freeform-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Mock exam builder</p>
                <h2 id="exam-freeform-title">Generate from prompt or code snippet</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeFreeformExamPopup}>
                Close
              </button>
            </div>

            <div className="modal-body">
              <form className="ai-generator exam-popup-generator exam-freeform-generator" onSubmit={generateMockExamFromPrompt}>
                <div className="ai-generator-heading">
                  <h2>Generate mock exam from custom material</h2>
                  <p>Paste code, an outline, or any study notes and Groq will build an exam without needing saved notes.</p>
                </div>

                <label>
                  <span>Study material or code snippet</span>
                  <textarea
                    value={freeformExamPrompt}
                    onChange={(event) => setFreeformExamPrompt(event.target.value)}
                    placeholder={"Example:\nfunction sum(a, b) {\n  return a + b;\n}\n\nCreate an exam on closures, scope, and runtime behavior."}
                    rows={12}
                    maxLength={12000}
                  />
                </label>

                <div className="ai-generator-grid">
                  <label>
                    <span>Tag</span>
                    <input
                      value={freeformExamTag}
                      onChange={(event) => setFreeformExamTag(event.target.value)}
                      placeholder="Example: javascript"
                      maxLength={40}
                    />
                  </label>

                  <label>
                    <span>Number of questions</span>
                    <input
                      type="number"
                      min={5}
                      max={30}
                      value={freeformExamQuestionCount}
                      onChange={(event) => setFreeformExamQuestionCount(event.target.value)}
                    />
                  </label>
                </div>

                <div className="ai-generator-footer">
                  <p className="status-text">{examError || 'Best for code snippets, study outlines, or any topic you want turned into a quiz.'}</p>
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
                    onClick={() => {
                      setSelectedId(note.id);
                      setActiveScreen('notes');
                      setNoteEditorMode('view');
                    }}
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
              <div className="notes-archive-topbar">
                <div className="archive-search-float">
                  <label className="archive-search">
                    <input
                      value={archiveSearchQuery}
                      onChange={(event) => setArchiveSearchQuery(event.target.value)}
                      placeholder="Search titles, content, and tags"
                    />
                  </label>
                </div>

                <button className="small-floating-button archive-manage-button" type="button" onClick={openArchiveManage} disabled={saving || notes.length === 0}>
                  Manage
                </button>
              </div>

              {loading ? (
                <p className="status-text">Loading notes...</p>
              ) : notes.length === 0 ? (
                <p className="status-text">No notes saved yet.</p>
              ) : archiveVisibleNotes.length === 0 ? (
                <p className="status-text">No notes match your search.</p>
              ) : (
                <div className="notes-archive-list">
                  {archiveVisibleNotes.map((note) => (
                    <div key={note.id} className={`notes-archive-row ${selectedNoteIds.includes(note.id) ? 'is-active' : ''}`}>
                      <span className="notes-archive-check-spacer" aria-hidden="true" />
                      <button
                        className="notes-archive-item"
                        type="button"
                        onClick={() => {
                          setSelectedId(note.id);
                          setActiveScreen('notes');
                          setNoteEditorMode('view');
                        }}
                      >
                        <div className="notes-archive-item-header">
                          <strong>{note.title}</strong>
                          <span>{formatDate(note.updatedAt)}</span>
                        </div>
                        {note.tag ? <span className="note-tag">#{note.tag}</span> : null}
                        <p>{note.content}</p>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {archiveManageOpen ? (
                <div className="modal-overlay" role="presentation" onClick={closeArchiveManage}>
                  <section className="modal-card archive-manage-modal" role="dialog" aria-modal="true" aria-labelledby="archive-manage-title" onClick={(event) => event.stopPropagation()}>
                    <div className="modal-header">
                      <div>
                        <p className="eyebrow">Manage notes</p>
                        <h2 id="archive-manage-title">Choose notes to delete</h2>
                      </div>
                      <button className="ghost-button" type="button" onClick={closeArchiveManage}>
                        Close
                      </button>
                    </div>

                    <div className="modal-body archive-manage-body">
                      <div className="archive-manage-summary">
                        <p className="status-text">
                          {selectedNoteIds.length === 0
                            ? `${notes.length} note(s) available.`
                            : `${selectedNoteIds.length} selected for deletion.`}
                        </p>
                        <div className="archive-manage-actions">
                          <button className="primary-button" type="button" onClick={deleteSelectedArchiveNotes} disabled={deleting || selectedNoteIds.length === 0}>
                            Delete selected
                          </button>
                          <button className="danger-button" type="button" onClick={deleteAllArchiveNotes} disabled={deleting || notes.length === 0}>
                            Delete all
                          </button>
                        </div>
                      </div>

                      <div className="archive-manage-list">
                        {archiveVisibleNotes.length === 0 ? (
                          <p className="status-text">No notes match your search.</p>
                        ) : (
                          archiveVisibleNotes.map((note) => (
                            <label key={note.id} className={`archive-manage-item ${selectedNoteIds.includes(note.id) ? 'is-selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={selectedNoteIds.includes(note.id)}
                                onChange={() => toggleArchiveNoteSelection(note.id)}
                              />
                              <div>
                                <strong>{note.title}</strong>
                                {note.tag ? <span>#{note.tag}</span> : null}
                                <span>{formatDate(note.updatedAt)}</span>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
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
              {selectedId === newNoteId || noteEditorMode === 'edit' ? (
                <form className="editor-form" onSubmit={saveNote}>
                  <div className="notes-editor-header">
                    <div>
                      <p className="eyebrow">{selectedId === newNoteId ? 'New note' : 'Editing note'}</p>
                      <h3>{selectedId === newNoteId ? 'Create a note' : 'Edit the selected note'}</h3>
                    </div>
                    {selectedNote ? (
                      <button className="ghost-button" type="button" onClick={cancelEditingSelectedNote}>
                        Cancel
                      </button>
                    ) : null}
                  </div>

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
                <section className="notes-view-card">
                  <div className="notes-view-header">
                    <div>
                      <p className="eyebrow">Selected note</p>
                      <h3>{selectedNote?.title || 'No note selected'}</h3>
                    </div>
                    {selectedNote ? (
                      <button className="primary-button" type="button" onClick={startEditingSelectedNote}>
                        Edit
                      </button>
                    ) : null}
                  </div>

                  {selectedNote ? (
                    <div className="notes-view-body">
                      {selectedNote.tag ? <span className="note-tag">#{selectedNote.tag}</span> : null}
                      <span className="notes-view-meta">Updated {formatDate(selectedNote.updatedAt)}</span>
                      <p>{selectedNote.content}</p>
                    </div>
                  ) : (
                    <p className="status-text">Pick a note from the sidebar, or start a new one with the + button.</p>
                  )}
                </section>
              )}

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
                <button className="small-floating-button" type="button" onClick={openFreeformExamPopup}>
                  Prompt
                </button>
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
                            disabled={deleting}
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

                      <section className="exam-attempt-history">
                        <div className="exam-attempt-history-header">
                          <h4>Previous attempts</h4>
                          <span className="status-text">
                            {examAttemptsLoading ? 'Loading...' : `${examAttempts.length} saved`}
                          </span>
                        </div>

                        {examAttemptsLoading ? (
                          <p className="status-text">Loading previous attempts...</p>
                        ) : examAttempts.length === 0 ? (
                          <p className="status-text">No previous attempts yet.</p>
                        ) : (
                          <div className="exam-attempt-list">
                            {examAttempts.map((attempt, attemptIndex) => (
                              <article key={attempt.id} className="exam-attempt-item">
                                <strong>
                                  Attempt {attemptIndex + 1}: {attempt.score}/{attempt.total} ({attempt.percentage}%)
                                </strong>
                                <span>
                                  Answered {attempt.answeredCount} of {attempt.total}
                                </span>
                                <span>{formatDate(attempt.submittedAt)}</span>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
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