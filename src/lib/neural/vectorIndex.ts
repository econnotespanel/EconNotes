/**
 * Vector Index & Hybrid Semantic Search Engine for EconNotes Neural Studio.
 * Stores chunked document passages + optional dense Float32 embeddings in IndexedDB
 * (with safe in-memory fallback in SSR/test environments) and combines cosine
 * similarity with Turkish-aware BM25 lexical scoring for accurate RAG citations.
 */

export interface IndexedChunk {
  id: string;
  docId: string;
  docTitle: string;
  course: string | null;
  sectionHeading: string;
  chunkIndex: number;
  text: string;
  tokens: string[];
  embedding?: number[];
  updatedAt: number;
}

export interface SearchHit {
  chunk: IndexedChunk;
  score: number;
  semanticScore: number;
  lexicalScore: number;
}

export interface DocumentIndexSummary {
  docId: string;
  docTitle: string;
  course: string | null;
  chunkCount: number;
  hasVectors: boolean;
  updatedAt: number;
}

const DB_NAME = 'econnotes_neural_vectors_v1';
const STORE_NAME = 'chunks';
const TR_STOPWORDS = new Set([
  've', 'ile', 'için', 'bir', 'bu', 'şu', 'o', 'da', 'de', 'ki', 'mi', 'mı',
  'mu', 'mü', 'ne', 'nasıl', 'neden', 'gibi', 'olarak', 'kadar', 'daha', 'en',
  'çok', 'az', 'her', 'tüm', 'bütün', 'olan', 'olduğunu', 'olanlar', 'üzerine',
  'göre', 'ancak', 'fakat', 'lakin', 'çünkü', 'veya', 'ya', 'hem', 'ise', 'eğer',
  'ama', 'bana', 'sana', 'biz', 'siz', 'onlar', 'kendi', 'şey', 'var', 'yok',
]);

// In-memory mirror & fallback when IndexedDB is unavailable (e.g., JSDOM tests)
const memoryStore = new Map<string, IndexedChunk>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openVectorDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('docId', 'docId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function tokenizeTr(text: string): string[] {
  return (text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !TR_STOPWORDS.has(w));
}

/**
 * Splits academic source text into semantically coherent chunks while preserving
 * section headings so RAG answers cite exact sections.
 */
export function chunkDocument(
  docId: string,
  docTitle: string,
  course: string | null,
  rawText: string,
  maxChunkChars = 540,
  overlapChars = 80,
): IndexedChunk[] {
  const normalized = (rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  let currentHeading = docTitle;
  const sections: Array<{ heading: string; body: string }> = [];
  let buf: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buf.length > 0) buf.push('');
      continue;
    }
    const isHeading =
      /^#{1,4}\s+/.test(trimmed) ||
      /^---\s*(?:Sayfa|Slayt)\s+\d+\s*---$/i.test(trimmed) ||
      (/^[A-ZÇĞİÖŞÜ0-9][^.!?]{3,65}$/.test(trimmed) && trimmed.length < 70 && buf.length > 0);

    if (isHeading) {
      if (buf.join('\n').trim()) {
        sections.push({ heading: currentHeading, body: buf.join('\n').trim() });
        buf = [];
      }
      currentHeading = trimmed.replace(/^#{1,4}\s+/, '').replace(/^---\s*|\s*---$/g, '').trim();
    } else {
      buf.push(trimmed);
    }
  }
  if (buf.join('\n').trim()) {
    sections.push({ heading: currentHeading, body: buf.join('\n').trim() });
  }

  const chunks: IndexedChunk[] = [];
  const now = Date.now();
  let chunkIndex = 0;

  for (const sec of sections) {
    const paragraphs = sec.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    let current = '';

    const pushChunk = (text: string) => {
      const cleaned = text.trim();
      if (cleaned.length < 20) return;
      chunks.push({
        id: `${docId}::${chunkIndex}`,
        docId,
        docTitle,
        course,
        sectionHeading: sec.heading,
        chunkIndex,
        text: cleaned,
        tokens: tokenizeTr(`${sec.heading} ${cleaned}`),
        updatedAt: now,
      });
      chunkIndex += 1;
    };

    for (const para of paragraphs) {
      if (current.length + para.length + 2 <= maxChunkChars) {
        current = current ? `${current}\n\n${para}` : para;
      } else {
        if (current) {
          pushChunk(current);
          const tail = current.slice(-overlapChars);
          current = para.length <= maxChunkChars ? `${tail}\n${para}` : '';
        }
        if (para.length > maxChunkChars) {
          const sentences = para.split(/(?<=[.!?])\s+/);
          for (const sent of sentences) {
            if (current.length + sent.length + 1 <= maxChunkChars) {
              current = current ? `${current} ${sent}` : sent;
            } else {
              if (current) pushChunk(current);
              if (sent.length > maxChunkChars) {
                for (let s = 0; s < sent.length; s += maxChunkChars - overlapChars) {
                  pushChunk(sent.slice(s, s + maxChunkChars));
                }
                current = '';
              } else {
                current = sent;
              }
            }
          }
        } else if (!current) {
          current = para;
        }
      }
    }
    if (current) pushChunk(current);
  }

  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
}

export async function upsertDocumentChunks(
  docId: string,
  chunks: IndexedChunk[],
): Promise<void> {
  for (const key of Array.from(memoryStore.keys())) {
    if (key.startsWith(`${docId}::`)) memoryStore.delete(key);
  }
  for (const ch of chunks) {
    memoryStore.set(ch.id, ch);
  }

  if (!hasIndexedDb()) return;
  try {
    const db = await openVectorDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('docId');
      const getKeysReq = index.getAllKeys(IDBKeyRange.only(docId));
      getKeysReq.onsuccess = () => {
        for (const key of getKeysReq.result) {
          store.delete(key);
        }
        for (const ch of chunks) {
          store.put(ch);
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Fallback to in-memory store safely
  }
}

export async function loadAllChunks(docIds?: string[]): Promise<IndexedChunk[]> {
  let all: IndexedChunk[] = [];
  if (hasIndexedDb()) {
    try {
      const db = await openVectorDb();
      all = await new Promise<IndexedChunk[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve((req.result || []) as IndexedChunk[]);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    } catch {
      all = Array.from(memoryStore.values());
    }
  } else {
    all = Array.from(memoryStore.values());
  }

  if (!docIds || docIds.length === 0) return all;
  const allowed = new Set(docIds);
  return all.filter((c) => allowed.has(c.docId));
}

export async function getIndexedDocuments(): Promise<DocumentIndexSummary[]> {
  const chunks = await loadAllChunks();
  const map = new Map<string, DocumentIndexSummary>();
  for (const ch of chunks) {
    const existing = map.get(ch.docId);
    if (!existing) {
      map.set(ch.docId, {
        docId: ch.docId,
        docTitle: ch.docTitle,
        course: ch.course,
        chunkCount: 1,
        hasVectors: Boolean(ch.embedding && ch.embedding.length > 0),
        updatedAt: ch.updatedAt,
      });
    } else {
      existing.chunkCount += 1;
      existing.hasVectors = existing.hasVectors && Boolean(ch.embedding && ch.embedding.length > 0);
      existing.updatedAt = Math.max(existing.updatedAt, ch.updatedAt);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeDocumentIndex(docId: string): Promise<void> {
  for (const key of Array.from(memoryStore.keys())) {
    if (key.startsWith(`${docId}::`)) memoryStore.delete(key);
  }
  if (!hasIndexedDb()) return;
  try {
    const db = await openVectorDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.index('docId').getAllKeys(IDBKeyRange.only(docId));
      req.onsuccess = () => {
        for (const k of req.result) store.delete(k);
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

export async function clearVectorIndex(): Promise<void> {
  memoryStore.clear();
  if (!hasIndexedDb()) return;
  try {
    const db = await openVectorDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

/**
 * Hybrid retrieval over indexed document chunks combining dense cosine vectors
 * (when available) and length-normalized BM25 lexical scoring.
 */
export function rankChunksHybrid(
  chunks: IndexedChunk[],
  query: string,
  topK = 5,
  queryVector?: number[],
): SearchHit[] {
  if (chunks.length === 0 || !query.trim()) return [];
  const qTokens = tokenizeTr(query);
  const avgLen =
    chunks.reduce((acc, ch) => acc + Math.max(1, ch.tokens.length), 0) / chunks.length;

  // Compute IDF across chunks
  const df = new Map<string, number>();
  for (const ch of chunks) {
    const unique = new Set(ch.tokens);
    for (const qt of qTokens) {
      if (unique.has(qt) || Array.from(unique).some((u) => u.startsWith(qt) || qt.startsWith(u))) {
        df.set(qt, (df.get(qt) || 0) + 1);
      }
    }
  }

  const k1 = 1.4;
  const b = 0.7;
  const totalDocs = chunks.length;

  const hits: SearchHit[] = [];
  let maxLexical = 0;

  const rawScores = chunks.map((ch) => {
    let bm25 = 0;
    const dl = Math.max(1, ch.tokens.length);
    for (const qt of qTokens) {
      let tf = 0;
      for (const tok of ch.tokens) {
        if (tok === qt) tf += 1;
        else if (tok.length >= 4 && qt.length >= 4 && (tok.startsWith(qt) || qt.startsWith(tok))) {
          tf += 0.65;
        }
      }
      if (tf > 0) {
        const docFreq = df.get(qt) || 0;
        const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
        bm25 += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / avgLen)));
      }
    }
    if (bm25 > maxLexical) maxLexical = bm25;
    const sem =
      queryVector && ch.embedding && ch.embedding.length === queryVector.length
        ? cosineSimilarity(queryVector, ch.embedding)
        : 0;
    return { ch, bm25, sem };
  });

  for (const { ch, bm25, sem } of rawScores) {
    const lexNorm = maxLexical > 0 ? bm25 / maxLexical : 0;
    const hasBoth = Boolean(queryVector && ch.embedding && ch.embedding.length === queryVector.length);
    const combined = hasBoth ? sem * 0.68 + lexNorm * 0.32 : lexNorm;
    if (combined > 0.04) {
      hits.push({
        chunk: ch,
        score: Number(combined.toFixed(4)),
        semanticScore: Number(sem.toFixed(4)),
        lexicalScore: Number(lexNorm.toFixed(4)),
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function searchChunks(params: {
  query: string;
  docIds?: string[];
  topK?: number;
  queryVector?: number[];
}): Promise<SearchHit[]> {
  const chunks = await loadAllChunks(params.docIds);
  return rankChunksHybrid(chunks, params.query, params.topK ?? 5, params.queryVector);
}
