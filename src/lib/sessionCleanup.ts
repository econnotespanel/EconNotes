/**
 * Centralized Cross-User Session & Client Cache Cleanup
 *
 * Prevents User A's private study documents, RAG vector chunks, generated PDF bytes,
 * SRS flashcards, React Query responses, and OneSignal push identity from leaking
 * to User B on shared browsers/devices after sign-out or account switch.
 */

const PRESERVED_LOCAL_KEYS = new Set([
  'theme',
  'econnotes-theme',
  'econnotes_theme',
  'econnotes_pwa_installed',
]);

let queryClientClearer: (() => void) | null = null;

export function registerQueryClientClearer(fn: () => void): void {
  queryClientClearer = fn;
}

function deleteIndexedDbSafe(dbName: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
      setTimeout(resolve, 400);
    } catch {
      resolve();
    }
  });
}

function wipeUserStorage(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || PRESERVED_LOCAL_KEYS.has(k)) continue;
      if (
        k.startsWith('econnotes') ||
        k.startsWith('study_') ||
        k.startsWith('neural_') ||
        k.startsWith('trivia_') ||
        k.startsWith('wheel_') ||
        k.startsWith('birthday_')
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      storage.removeItem(k);
    }
  } catch {
    // Ignore storage access errors in strict privacy browsers
  }
}

/**
 * Purges ALL client-side user-scoped state (React Query, OneSignal identity,
 * Study Summary singleton & IndexedDB, Neural Vector RAG store, localStorage/sessionStorage).
 */
export async function clearAllUserClientState(): Promise<void> {
  try {
    queryClientClearer?.();
  } catch {
    // ignore
  }

  // Clear localStorage & sessionStorage user-scoped keys
  if (typeof window !== 'undefined') {
    wipeUserStorage(window.localStorage);
    wipeUserStorage(window.sessionStorage);
  }

  // Clear in-memory singletons + IndexedDB stores lazily to avoid circular imports
  await Promise.allSettled([
    import('@/lib/studySummaryJobManager')
      .then((m) => m.summaryJobManager.resetForLogout())
      .catch(() => {}),
    import('@/lib/neural/vectorIndex')
      .then((m) => m.clearAllVectorIndexData())
      .catch(() => {}),
    import('@/lib/onesignal')
      .then((m) => m.logoutOneSignalUser())
      .catch(() => {}),
    deleteIndexedDbSafe('econnotes_summary_jobs_v1'),
    deleteIndexedDbSafe('econnotes_neural_vectors_v1'),
  ]);
}
