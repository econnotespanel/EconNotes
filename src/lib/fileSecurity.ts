/**
 * EconNotes Shared File Upload, Preview & Export Security Module
 *
 * Enforces defense-in-depth across every upload surface (notes, avatars, announcements,
 * DM attachments, study bug reports) and admin document preview:
 * - Strict extension & MIME allowlists (blocks HTML, SVG, XHTML, XML, JS, PHP, EXE)
 * - Magic-byte header inspection (PDF, PNG, JPEG, WEBP, GIF, ZIP/OOXML, OLE2)
 * - Per-surface file size caps
 * - Safe random UUID filename generation (prevents path traversal & name collisions)
 * - DM attachment path validation (prevents arbitrary private bucket path reads)
 * - Preview MIME sanitization (eliminates same-origin blob: XSS vectors)
 * - CSV formula injection neutralization (CWE-1236)
 * - Unified strong password policy validation
 */

export type UploadSurface = 'note' | 'avatar' | 'announcement' | 'message' | 'report';

export interface FileValidationResult {
  ok: boolean;
  error?: string;
  normalizedMime?: string;
  safeExtension?: string;
}

const DANGEROUS_EXTENSIONS = new Set([
  'html',
  'htm',
  'xhtml',
  'svg',
  'svgz',
  'xml',
  'xsl',
  'xslt',
  'js',
  'mjs',
  'cjs',
  'ts',
  'jsx',
  'tsx',
  'php',
  'phtml',
  'asp',
  'aspx',
  'jsp',
  'exe',
  'dll',
  'msi',
  'bat',
  'cmd',
  'ps1',
  'sh',
  'vbs',
  'hta',
  'jar',
  'swf',
]);

const ACTIVE_DANGEROUS_MIME_RE =
  /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|application\/javascript|text\/javascript|application\/x-javascript)/i;

interface SurfacePolicy {
  maxBytes: number;
  allowedExtensions: Set<string>;
  allowedMimes: Set<string>;
  label: string;
}

const SURFACE_POLICIES: Record<UploadSurface, SurfacePolicy> = {
  note: {
    maxBytes: 50 * 1024 * 1024, // 50 MB
    allowedExtensions: new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'pptx', 'doc', 'ppt', 'txt']),
    allowedMimes: new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-powerpoint',
      'text/plain',
    ]),
    label: 'PDF, Word, PowerPoint, metin veya PNG/JPG/WEBP görsel',
  },
  avatar: {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    allowedExtensions: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']),
    allowedMimes: new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']),
    label: 'PNG, JPG, WEBP veya GIF görsel',
  },
  announcement: {
    maxBytes: 15 * 1024 * 1024, // 15 MB
    allowedExtensions: new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'pptx']),
    allowedMimes: new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]),
    label: 'PDF, Word, PowerPoint veya PNG/JPG/WEBP görsel',
  },
  message: {
    maxBytes: 15 * 1024 * 1024, // 15 MB
    allowedExtensions: new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'docx', 'pptx', 'txt']),
    allowedMimes: new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ]),
    label: 'PDF, Word, PowerPoint, metin veya PNG/JPG/WEBP görsel',
  },
  report: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    allowedExtensions: new Set(['png', 'jpg', 'jpeg', 'webp', 'pdf']),
    allowedMimes: new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']),
    label: 'PNG, JPG, WEBP veya PDF',
  },
};

const EXT_TO_CANONICAL_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
};

function matchesMagicBytes(ext: string, head: Uint8Array): boolean {
  if (head.length < 4) return ext === 'txt';

  const startsWith = (sig: number[]) =>
    sig.length <= head.length && sig.every((b, idx) => head[idx] === b);

  switch (ext) {
    case 'pdf':
      // %PDF-
      return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'png':
      return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg':
    case 'jpeg':
      return startsWith([0xff, 0xd8, 0xff]);
    case 'gif':
      return startsWith([0x47, 0x49, 0x46, 0x38]);
    case 'webp':
      // RIFF....WEBP
      return (
        head.length >= 12 &&
        startsWith([0x52, 0x49, 0x46, 0x46]) &&
        head[8] === 0x57 &&
        head[9] === 0x45 &&
        head[10] === 0x42 &&
        head[11] === 0x50
      );
    case 'docx':
    case 'pptx':
      // PK\x03\x04 (ZIP / OOXML container)
      return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);
    case 'doc':
    case 'ppt':
      // OLE2 Compound Document or OOXML ZIP
      return (
        startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ||
        startsWith([0x50, 0x4b, 0x03, 0x04])
      );
    case 'txt': {
      // Reject binary nulls or embedded HTML/SVG script signatures disguised as .txt
      for (let i = 0; i < Math.min(head.length, 512); i++) {
        if (head[i] === 0x00) return false;
      }
      const preview = new TextDecoder('utf-8', { fatal: false }).decode(head.slice(0, 512)).trimStart();
      if (/^<!doctype\s+html|^<html\b|^<svg\b|^<script\b/i.test(preview)) return false;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Validates an uploaded File on extension, MIME type, file size, AND binary magic bytes.
 */
export async function validateUploadFile(
  file: File,
  surface: UploadSurface,
): Promise<FileValidationResult> {
  const policy = SURFACE_POLICIES[surface];
  if (!file || typeof file.name !== 'string') {
    return { ok: false, error: 'Geçerli bir dosya seçilmedi.' };
  }

  if (file.size <= 0) {
    return { ok: false, error: 'Boş dosya yüklenemez.' };
  }

  if (file.size > policy.maxBytes) {
    const mb = Math.round(policy.maxBytes / (1024 * 1024));
    return { ok: false, error: `Dosya boyutu en fazla ${mb} MB olabilir.` };
  }

  const ext = (file.name.split('.').pop() || '').trim().toLowerCase();
  if (!ext || DANGEROUS_EXTENSIONS.has(ext) || !policy.allowedExtensions.has(ext)) {
    return {
      ok: false,
      error: `Desteklenmeyen veya güvensiz dosya türü (.${ext || '?'}). İzin verilen türler: ${policy.label}.`,
    };
  }

  const rawMime = (file.type || '').trim().toLowerCase();
  if (rawMime) {
    if (ACTIVE_DANGEROUS_MIME_RE.test(rawMime)) {
      return { ok: false, error: 'Güvenlik politikası gereği HTML/SVG/betik dosyaları yüklenemez.' };
    }
    if (rawMime !== 'application/octet-stream' && !policy.allowedMimes.has(rawMime)) {
      return {
        ok: false,
        error: `Dosya MIME türü (${rawMime}) izin verilen formatlarla uyuşmuyor.`,
      };
    }
  }

  // Read magic-byte header (first 512 bytes) to prevent extension/MIME spoofing
  try {
    const slice = file.slice(0, 512);
    const buf =
      typeof slice.arrayBuffer === 'function'
        ? await slice.arrayBuffer()
        : await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 512));
    if (!matchesMagicBytes(ext, head)) {
      return {
        ok: false,
        error: `Dosya içeriği .${ext} biçimiyle uyuşmuyor veya bozuk. Güvenlik nedeniyle yükleme engellendi.`,
      };
    }
  } catch {
    return { ok: false, error: 'Dosya içeriği doğrulanamadı.' };
  }

  return {
    ok: true,
    normalizedMime: EXT_TO_CANONICAL_MIME[ext] || 'application/octet-stream',
    safeExtension: ext,
  };
}

/**
 * Generates an unpredictable, traversal-proof storage object key under the specified prefix.
 */
export function buildSafeStoragePath(prefix: string, safeExtension: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '').replace(/\.\./g, '');
  const cleanExt = safeExtension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${cleanPrefix}/${Date.now()}_${rand}.${cleanExt}`;
}

/**
 * Strictly validates that a direct-message attachment path stays inside `messages/<uuid>/<file>`
 * with no traversal segments and no active web extensions.
 */
export function isSafeMessageAttachmentPath(path: string | null | undefined): boolean {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\') || /^https?:\/\//i.test(trimmed)) {
    return false;
  }
  if (!/^messages\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(trimmed)) {
    return false;
  }
  const ext = (trimmed.split('.').pop() || '').toLowerCase();
  return Boolean(ext) && !DANGEROUS_EXTENSIONS.has(ext);
}

/**
 * Never permits creating a same-origin `blob:` URL with an active executable MIME type
 * (`text/html`, `image/svg+xml`, `application/xhtml+xml`, `text/xml`, JS).
 */
export function sanitizePreviewMimeType(rawMime: string | null | undefined): string {
  const clean = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (!clean || ACTIVE_DANGEROUS_MIME_RE.test(clean)) {
    return 'application/octet-stream';
  }
  if (clean.startsWith('text/')) {
    return 'text/plain; charset=utf-8';
  }
  return clean;
}

export function isDangerousPreviewMime(rawMime: string | null | undefined): boolean {
  const clean = (rawMime || '').split(';')[0].trim().toLowerCase();
  return ACTIVE_DANGEROUS_MIME_RE.test(clean);
}

/**
 * Neutralizes spreadsheet CSV formula injection (CWE-1236) before RFC-4180 quoting.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const neutralized = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/**
 * Unified strong password validator used across Register, ResetPassword, Profile, and ForcePasswordChange.
 */
export function validateStrongPassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Şifre en az 8 karakter olmalıdır.';
  }
  if (password.length > 128) {
    return 'Şifre en fazla 128 karakter olabilir.';
  }
  if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Şifre en az 1 büyük harf ve 1 rakam içermelidir.';
  }
  return null;
}
