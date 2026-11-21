import type { ExtractedSourceItem, StudioNotebook } from '@/types/study';

const STORAGE_KEY_PREFIX = 'econnotes_studio_notebooks_v1_';
const ACTIVE_ID_PREFIX = 'econnotes_studio_active_nb_v1_';

const NOTEBOOK_EMOJIS = ['📘', '🧠', '🎯', '📐', '⚖️', '🧬', '💻', '📊', '📚', '✨'];

export function pickNotebookEmoji(index: number): string {
  return NOTEBOOK_EMOJIS[Math.abs(index) % NOTEBOOK_EMOJIS.length];
}

export function createEmptyNotebook(params?: {
  title?: string;
  course?: string;
  emoji?: string;
  index?: number;
}): StudioNotebook {
  const now = new Date().toISOString();
  return {
    id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: params?.title?.trim() || 'Yeni Çalışma Defteri',
    course: params?.course?.trim() || '',
    emoji: params?.emoji || pickNotebookEmoji(params?.index ?? 0),
    createdAt: now,
    updatedAt: now,
    sources: [],
    checkedSourceIds: [],
    checkedMaterialIds: [],
    materialIds: [],
    pinnedNotes: [],
    messages: [],
  };
}

function sanitizeSourceForStorage(src: ExtractedSourceItem): ExtractedSourceItem {
  // Strip heavy base64 images/audio when serializing to localStorage so quota is never exceeded
  return {
    id: src.id,
    name: src.name,
    kind: src.kind,
    originNoteId: src.originNoteId,
    originType: src.originType,
    course: src.course,
    text: (src.text || '').slice(0, 65_000),
    pagesOrSlides: src.pagesOrSlides,
    wordCount: src.wordCount,
    charCount: src.charCount,
    isScannedOcr: src.isScannedOcr,
  };
}

function sanitizeNotebooksForStorage(notebooks: StudioNotebook[]): StudioNotebook[] {
  return notebooks.slice(0, 20).map((nb) => ({
    ...nb,
    sources: nb.sources.slice(0, 24).map(sanitizeSourceForStorage),
    pinnedNotes: nb.pinnedNotes.slice(0, 40),
    messages: nb.messages.slice(-32).map((m) => ({
      ...m,
      attachmentPreviews: undefined,
    })),
  }));
}

export function loadUserNotebooks(userId: string): StudioNotebook[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((nb: Partial<StudioNotebook>, idx: number) => ({
          id: nb.id || `nb-restored-${idx}`,
          title: nb.title || 'Çalışma Defterim',
          course: nb.course || '',
          emoji: nb.emoji || pickNotebookEmoji(idx),
          createdAt: nb.createdAt || new Date().toISOString(),
          updatedAt: nb.updatedAt || new Date().toISOString(),
          sources: Array.isArray(nb.sources) ? nb.sources : [],
          checkedSourceIds: Array.isArray(nb.checkedSourceIds) ? nb.checkedSourceIds : [],
          checkedMaterialIds: Array.isArray(nb.checkedMaterialIds) ? nb.checkedMaterialIds : [],
          materialIds: Array.isArray(nb.materialIds) ? nb.materialIds : [],
          pinnedNotes: Array.isArray(nb.pinnedNotes) ? nb.pinnedNotes : [],
          messages: Array.isArray(nb.messages) ? nb.messages : [],
        }));
      }
    }
  } catch {
    // Ignore storage read errors
  }

  return [
    createEmptyNotebook({
      title: 'Çalışma Defterim',
      course: '',
      emoji: '📘',
    }),
  ];
}

export function saveUserNotebooks(userId: string, notebooks: StudioNotebook[]): void {
  const key = `${STORAGE_KEY_PREFIX}${userId}`;
  try {
    const clean = sanitizeNotebooksForStorage(notebooks);
    localStorage.setItem(key, JSON.stringify(clean));
  } catch {
    // Quota fallback: trim source text aggressively and keep metadata + notes + chat
    try {
      const compact = notebooks.slice(0, 12).map((nb) => ({
        ...nb,
        sources: nb.sources.slice(0, 12).map((s) => ({
          ...sanitizeSourceForStorage(s),
          text: (s.text || '').slice(0, 8_000),
        })),
        pinnedNotes: nb.pinnedNotes.slice(0, 20),
        messages: nb.messages.slice(-16).map((m) => ({
          ...m,
          attachmentPreviews: undefined,
        })),
      }));
      localStorage.setItem(key, JSON.stringify(compact));
    } catch {
      // Non-fatal
    }
  }
}

export function loadActiveNotebookId(userId: string): string | null {
  try {
    return localStorage.getItem(`${ACTIVE_ID_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

export function saveActiveNotebookId(userId: string, notebookId: string): void {
  try {
    localStorage.setItem(`${ACTIVE_ID_PREFIX}${userId}`, notebookId);
  } catch {
    // Non-fatal
  }
}
