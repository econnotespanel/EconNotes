import { supabase } from '@/integrations/supabase/client';

const NOTES_BUCKET = 'notes';

/**
 * Depoda tutulan (public/sign/authenticated biçimli) bir bağlantıdan dosya yolunu çıkarır.
 * Zaten düz bir yol verilmişse olduğu gibi döner.
 */
export const storagePathFromUrl = (url?: string | null, bucket = NOTES_BUCKET): string | null => {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return url.replace(/^\/+/, '');
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(
      new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`),
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

/**
 * `notes` deposu özel olduğu için dosyalara yalnızca imzalı bağlantı ile erişilir.
 * Süresi dolan bağlantılar yeniden üretilebilir.
 */
export const signedNoteUrl = async (
  urlOrPath?: string | null,
  expiresIn = 3600,
): Promise<string | null> => {
  const path = storagePathFromUrl(urlOrPath);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(NOTES_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

/** İmzalı bağlantıyı yeni sekmede açar. */
export const openSignedNote = async (urlOrPath?: string | null) => {
  const signed = await signedNoteUrl(urlOrPath);
  if (signed) window.open(signed, '_blank', 'noopener,noreferrer');
  return signed;
};
