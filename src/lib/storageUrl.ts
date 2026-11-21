import { supabase } from '@/integrations/supabase/client';

export const NOTES_BUCKET = 'notes';

function safeDecodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Depoda tutulan (public/sign/authenticated/ham yol biçimli) bir bağlantıdan
 * olası tüm normalize edilmiş Storage nesne yollarını çıkarır.
 * Fazladan başındaki `notes/` bucket önekini ve query parametrelerini güvenle temizler.
 */
export const extractStoragePathCandidates = (
  url?: string | null,
  bucket = NOTES_BUCKET,
): string[] => {
  if (!url || typeof url !== 'string') return [];
  const trimmed = url.trim();
  if (!trimmed) return [];

  const candidates: string[] = [];
  const push = (val: string | null | undefined) => {
    if (!val) return;
    const clean = val.replace(/^\/+/, '').trim();
    if (clean && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  const bucketPrefixRx = new RegExp(`^${bucket}/+`, 'i');

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const { pathname } = new URL(trimmed);
      const patterns = [
        new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`, 'i'),
        new RegExp(`/storage/v1/object/${bucket}/(.+)$`, 'i'),
        new RegExp(`/storage/v1/render/image/(?:public|sign|authenticated)/${bucket}/(.+)$`, 'i'),
      ];
      for (const rx of patterns) {
        const match = pathname.match(rx);
        if (match && match[1]) {
          const rawMatch = match[1].replace(/^\/+/, '');
          const decoded = safeDecodePath(rawMatch).replace(/^\/+/, '');
          push(decoded.replace(bucketPrefixRx, ''));
          push(decoded);
          push(rawMatch.replace(bucketPrefixRx, ''));
          push(rawMatch);
          break;
        }
      }
    } catch {
      return [];
    }
    return candidates;
  }

  const withoutQuery = trimmed.split('?')[0].split('#')[0].replace(/^\/+/, '');
  const decoded = safeDecodePath(withoutQuery).replace(/^\/+/, '');
  push(decoded.replace(bucketPrefixRx, ''));
  push(withoutQuery.replace(bucketPrefixRx, ''));
  push(decoded);
  push(withoutQuery);
  return candidates;
};

/**
 * Depoda tutulan (public/sign/authenticated biçimli) bir bağlantıdan dosya yolunu çıkarır.
 * Zaten düz bir yol verilmişse normalize edip döner.
 */
export const storagePathFromUrl = (url?: string | null, bucket = NOTES_BUCKET): string | null => {
  const candidates = extractStoragePathCandidates(url, bucket);
  return candidates.length > 0 ? candidates[0] : null;
};

export interface SignedUrlResult {
  signedUrl: string | null;
  path: string | null;
  error: string | null;
}

/**
 * Hata nedenini gizlemeden `notes` deposundan imzalı bağlantı üretir.
 * Süresi dolmak üzere olan oturumu otomatik yeniler ve normalize edilmiş aday yolları sırayla dener.
 */
export const signedNoteUrlWithDetail = async (
  urlOrPath?: string | null,
  expiresIn = 3600,
): Promise<SignedUrlResult> => {
  const candidates = extractStoragePathCandidates(urlOrPath, NOTES_BUCKET);
  if (candidates.length === 0) {
    return {
      signedUrl: null,
      path: null,
      error: 'Not kaydında geçerli bir dosya yolu bulunamadı.',
    };
  }

  // Refresh session proactively if access token is missing or about to expire (<60s)
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const expiresAtMs = (sessionData.session?.expires_at ?? 0) * 1000;
    if (!sessionData.session?.access_token || (expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000)) {
      await supabase.auth.refreshSession().catch(() => null);
    }
  } catch {
    // Continue and let storage call report exact error if session is unavailable
  }

  let lastError: string | null = null;
  for (const path of candidates) {
    const { data, error } = await supabase.storage.from(NOTES_BUCKET).createSignedUrl(path, expiresIn);
    if (!error && data?.signedUrl) {
      return { signedUrl: data.signedUrl, path, error: null };
    }
    if (error?.message) {
      lastError = error.message;
    }
  }

  return {
    signedUrl: null,
    path: candidates[0],
    error: lastError || 'İmzalı dosya bağlantısı oluşturulamadı.',
  };
};

/**
 * `notes` deposu özel olduğu için dosyalara yalnızca imzalı bağlantı ile erişilir.
 * Süresi dolan bağlantılar yeniden üretilebilir.
 */
export const signedNoteUrl = async (
  urlOrPath?: string | null,
  expiresIn = 3600,
): Promise<string | null> => {
  const res = await signedNoteUrlWithDetail(urlOrPath, expiresIn);
  return res.signedUrl;
};

/** İmzalı bağlantıyı yeni sekmede açar. */
export const openSignedNote = async (urlOrPath?: string | null) => {
  const signed = await signedNoteUrl(urlOrPath);
  if (signed) window.open(signed, '_blank', 'noopener,noreferrer');
  return signed;
};
