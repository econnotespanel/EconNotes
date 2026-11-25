import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSafeStoragePath,
  isDangerousPreviewMime,
  isSafeMessageAttachmentPath,
  sanitizeCsvCell,
  sanitizePreviewMimeType,
  validateStrongPassword,
  validateUploadFile,
} from '@/lib/fileSecurity';
import { clearAllUserClientState, registerQueryClientClearer } from '@/lib/sessionCleanup';
import { summaryJobManager } from '@/lib/studySummaryJobManager';
import { clearAllVectorIndexData, loadAllChunks } from '@/lib/neural/vectorIndex';
import { EMERGENCY_NOTES } from '@/data/emergencyNotes';
import {
  extractDocumentTextViaPaddleOcrVl,
  invokeMultimodalVisionCascade,
} from '@/lib/multimodalVisionClient';
import { detectPreviewFileKind } from '@/lib/adminNotePreview';

const ROOT = process.cwd();

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relPath), 'utf-8');
}

function makeBinaryFile(name: string, mime: string, bytes: number[]): File {
  const arr = new Uint8Array(bytes);
  const f = new File([arr], name, { type: mime });
  Object.defineProperty(f, 'arrayBuffer', {
    value: async () => arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength),
  });
  Object.defineProperty(f, 'slice', {
    value: (start?: number, end?: number) => {
      const sliced = arr.slice(start ?? 0, end ?? arr.length);
      return {
        arrayBuffer: async () =>
          sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength),
      };
    },
  });
  return f;
}

describe('EconNotes Comprehensive Security Audit Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  // =========================================================================
  // 1. FILE UPLOAD MAGIC-BYTE, XSS & PATH ISOLATION SECURITY
  // =========================================================================
  describe('1. File Upload Validation, Stored XSS & DM Path Security', () => {
    it('blocks HTML, SVG, JS, PHP, and EXE uploads across ALL surfaces (note, avatar, announcement, message, report)', async () => {
      const dangerousFiles = [
        makeBinaryFile('xss.html', 'text/html', Array.from(new TextEncoder().encode('<script>alert(1)</script>'))),
        makeBinaryFile('logo.svg', 'image/svg+xml', Array.from(new TextEncoder().encode('<svg onload=alert(1)/>'))),
        makeBinaryFile('evil.js', 'application/javascript', Array.from(new TextEncoder().encode('fetch("/")'))),
        makeBinaryFile('shell.php', 'application/x-httpd-php', Array.from(new TextEncoder().encode('<?php echo 1;'))),
        makeBinaryFile('dropper.exe', 'application/octet-stream', [0x4d, 0x5a, 0x90, 0x00]),
      ];

      for (const surface of ['note', 'avatar', 'announcement', 'message', 'report'] as const) {
        for (const f of dangerousFiles) {
          const res = await validateUploadFile(f, surface);
          expect(res.ok).toBe(false);
        }
      }
    });

    it('detects extension/MIME spoofing via binary magic-byte inspection (HTML disguised as .pdf or .png)', async () => {
      const htmlBytes = Array.from(new TextEncoder().encode('<!DOCTYPE html><script>alert(document.cookie)</script>'));
      const fakePdf = makeBinaryFile('notes.pdf', 'application/pdf', htmlBytes);
      const fakePng = makeBinaryFile('avatar.png', 'image/png', htmlBytes);
      const fakeTxtHtml = makeBinaryFile('readme.txt', 'text/plain', htmlBytes);

      expect((await validateUploadFile(fakePdf, 'note')).ok).toBe(false);
      expect((await validateUploadFile(fakePng, 'avatar')).ok).toBe(false);
      expect((await validateUploadFile(fakeTxtHtml, 'note')).ok).toBe(false);
    });

    it('accepts genuine PDF, PNG, JPEG, and OOXML (DOCX/PPTX) binaries and generates traversal-safe UUID paths', async () => {
      const realPdf = makeBinaryFile('iktisat.pdf', 'application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
      const realPng = makeBinaryFile('avatar.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const realJpg = makeBinaryFile('photo.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const realDocx = makeBinaryFile(
        'hukuk.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00],
      );

      expect((await validateUploadFile(realPdf, 'note')).ok).toBe(true);
      expect((await validateUploadFile(realPng, 'avatar')).ok).toBe(true);
      expect((await validateUploadFile(realJpg, 'report')).ok).toBe(true);
      expect((await validateUploadFile(realDocx, 'note')).ok).toBe(true);

      const p = buildSafeStoragePath('user-123/../escape', 'pdf');
      expect(p).not.toContain('..');
      expect(p.endsWith('.pdf')).toBe(true);
    });

    it('enforces strict DM attachment path allowlist (prevents cross-user notes bucket IDOR)', () => {
      const validUid = '11111111-2222-3333-4444-555555555555';
      expect(isSafeMessageAttachmentPath(`messages/${validUid}/1732400000_abc.pdf`)).toBe(true);
      expect(isSafeMessageAttachmentPath(`messages/${validUid}/photo.png`)).toBe(true);

      // Cross-user private note path in `notes` bucket -> BLOCKED!
      expect(isSafeMessageAttachmentPath(`${validUid}/secret-exam-note.pdf`)).toBe(false);
      // Traversal -> BLOCKED!
      expect(isSafeMessageAttachmentPath(`messages/${validUid}/../../${validUid}/secret.pdf`)).toBe(false);
      // External URL -> BLOCKED!
      expect(isSafeMessageAttachmentPath('https://evil.example/payload.pdf')).toBe(false);
      // Active HTML/SVG -> BLOCKED!
      expect(isSafeMessageAttachmentPath(`messages/${validUid}/exploit.html`)).toBe(false);
      expect(isSafeMessageAttachmentPath(`messages/${validUid}/exploit.svg`)).toBe(false);
    });

    it('neutralizes active preview MIME types and rejects HTML/SVG in adminNotePreview', () => {
      expect(isDangerousPreviewMime('text/html')).toBe(true);
      expect(isDangerousPreviewMime('image/svg+xml')).toBe(true);
      expect(isDangerousPreviewMime('application/xhtml+xml')).toBe(true);
      expect(sanitizePreviewMimeType('text/html; charset=utf-8')).toBe('application/octet-stream');
      expect(sanitizePreviewMimeType('image/svg+xml')).toBe('application/octet-stream');
      expect(sanitizePreviewMimeType('text/javascript')).toBe('application/octet-stream');
      expect(sanitizePreviewMimeType('application/pdf')).toBe('application/pdf');

      expect(detectPreviewFileKind({ fileName: 'attack.svg', fileType: 'image/svg+xml' })).toBe('unsupported');
      expect(detectPreviewFileKind({ fileName: 'attack.html', fileType: 'text/html' })).toBe('unsupported');
      expect(detectPreviewFileKind({ fileName: 'lecture.pdf', fileType: 'application/pdf' })).toBe('pdf');
    });

    it('ensures no raw notes exist in public/storage/ and EMERGENCY_NOTES leaks zero public Storage URLs', () => {
      const publicStorageDir = path.resolve(ROOT, 'public/storage');
      const existsWithFiles = fs.existsSync(publicStorageDir) && fs.readdirSync(publicStorageDir).length > 0;
      expect(existsWithFiles).toBe(false);
      expect(EMERGENCY_NOTES).toEqual([]);
    });
  });

  // =========================================================================
  // 2. CROSS-USER SESSION ISOLATION, PASSWORD POLICY & CSV INJECTION
  // =========================================================================
  describe('2. Session Isolation, Password Policy & CSV Injection Defense', () => {
    it('clearAllUserClientState purges React Query, storage keys, summaryJobManager & vectorIndex while preserving theme', async () => {
      const qcClearMock = vi.fn();
      registerQueryClientClearer(qcClearMock);

      localStorage.setItem('theme', 'dark');
      localStorage.setItem('econnotes_wheel_bonus_quota', '99');
      localStorage.setItem('econnotes:neural:srs_v1', '[{"front":"userA private"}]');
      localStorage.setItem('study_notebooks_userA', '{"text":"secret"}');
      sessionStorage.setItem('econnotes_return_tour_pending', '1');

      await clearAllUserClientState();

      expect(qcClearMock).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(localStorage.getItem('econnotes_wheel_bonus_quota')).toBeNull();
      expect(localStorage.getItem('econnotes:neural:srs_v1')).toBeNull();
      expect(localStorage.getItem('study_notebooks_userA')).toBeNull();
      expect(sessionStorage.getItem('econnotes_return_tour_pending')).toBeNull();

      expect(summaryJobManager.getSnapshot().activeJob).toBeNull();
      expect(summaryJobManager.getSnapshot().lastPdfBytes).toBeNull();
      expect(summaryJobManager.getSnapshot().completedMaterial).toBeNull();

      await clearAllVectorIndexData();
      expect(await loadAllChunks()).toEqual([]);
    });

    it('enforces unified strong password policy (>=8 chars, uppercase, digit)', () => {
      expect(validateStrongPassword('Ab123')).not.toBeNull(); // too short
      expect(validateStrongPassword('lowercase123')).not.toBeNull(); // no uppercase
      expect(validateStrongPassword('NoDigitsHere')).not.toBeNull(); // no digit
      expect(validateStrongPassword('StrongPass2026')).toBeNull();
    });

    it('neutralizes CSV formula injection payloads (CWE-1236)', () => {
      expect(sanitizeCsvCell('=CMD|\' /C calc\'!A0')).toBe('"\'=CMD|\' /C calc\'!A0"');
      expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe('"\'+SUM(A1:A10)"');
      expect(sanitizeCsvCell('-2+3')).toBe('"\'-2+3"');
      expect(sanitizeCsvCell('@HYPERLINK("http://evil.com")')).toBe('"\'@HYPERLINK(""http://evil.com"")"');
      expect(sanitizeCsvCell('Normal Öğrenci')).toBe('"Normal Öğrenci"');
    });

    it('blocks direct browser uploads of student files to unauthenticated public HuggingFace Spaces', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const ocrText = await extractDocumentTextViaPaddleOcrVl([]);
      const visionReply = await invokeMultimodalVisionCascade({
        systemPrompt: 'sys',
        userQuestion: 'q',
        history: [],
        images: [],
        report: () => {},
      });
      expect(ocrText).toBe('');
      expect(visionReply).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // =========================================================================
  // 3. BACKEND EDGE FUNCTIONS, HEADERS & SQL MIGRATION INVARIANTS
  // =========================================================================
  describe('3. Edge Function, CORS, Auth, AI Prompt & Database RLS Security Invariants', () => {
    it('eliminates wildcard CORS (*), Pollinations exfiltration, and getClaims-before-getUser across ALL Edge Functions', () => {
      const fnDir = path.resolve(ROOT, 'supabase/functions');
      const entries = fs.readdirSync(fnDir, { withFileTypes: true });
      const tsFiles: string[] = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const subDir = path.join(fnDir, e.name);
        for (const f of fs.readdirSync(subDir)) {
          if (f.endsWith('.ts')) tsFiles.push(path.join(subDir, f));
        }
      }

      expect(tsFiles.length).toBeGreaterThanOrEqual(18);
      for (const file of tsFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        // Zero wildcard Supabase corsHeaders imports!
        expect(content, `${path.basename(path.dirname(file))}/${path.basename(file)} imports wildcard cors`).not.toContain(
          "npm:@supabase/supabase-js@2/cors",
        );
        // Zero private data exfiltration to public text.pollinations.ai!
        expect(content, `${path.basename(file)} references pollinations`).not.toContain('text.pollinations.ai');
        // Zero Gemini API key in URL query string (?key=)!
        expect(content, `${path.basename(file)} passes Gemini API key in query string`).not.toMatch(
          /generativelanguage\.googleapis\.com\/[^\s'"]+\?key=/,
        );
      }

      // Verify _shared/request-security.ts strictly verifies sessions via auth.getUser (not getClaims)
      const reqSec = readProjectFile('supabase/functions/_shared/request-security.ts');
      expect(reqSec).not.toContain('.getClaims(');
      expect(reqSec).toContain('supabase.auth.getUser(token)');
      expect(reqSec).toContain("url.hostname.endsWith('.econnotes.online')");
      expect(reqSec).not.toContain("'.vercel.app'");
      expect(reqSec).not.toContain("'.lovable.app'");
      expect(reqSec).toContain("'Cache-Control', 'no-store'");
      expect(reqSec).toContain('check_rate_limit');
      expect(reqSec).toContain('ANTI_INJECTION_SYSTEM_GUARD');
    });

    it('verifies Critical Edge fixes: sms-2fa takeover guard, claim-wheel-xp legacy removal, complete-password-change & admin-reset-password', () => {
      const sms2fa = readProjectFile('supabase/functions/sms-2fa/index.ts');
      expect(sms2fa).toContain('assertCanModifyEnrollment');
      expect(sms2fa).toContain('enforceRateLimit');
      expect(sms2fa).not.toContain('.getClaims(');
      expect(sms2fa).toContain("case 'disable':");

      const wheel = readProjectFile('supabase/functions/claim-wheel-xp/index.ts');
      expect(wheel).not.toContain('legacy_claim');
      expect(wheel).not.toContain('payload.amount');
      expect(wheel).not.toContain('payload.transactionId');
      expect(wheel).toContain('enforceRateLimit');

      const completePw = readProjectFile('supabase/functions/complete-password-change/index.ts');
      expect(completePw).not.toContain('updated_at');
      expect(completePw).toContain('password: newPassword');
      expect(completePw).toContain('must_change_password = false');

      const adminReset = readProjectFile('supabase/functions/admin-reset-password/index.ts');
      expect(adminReset).toContain('targetIsAdmin');
      expect(adminReset).toContain('enforceRateLimit');

      const adminPreview = readProjectFile('supabase/functions/admin-note-preview/index.ts');
      expect(adminPreview).toContain('isSafeOwnedObjectPath');
      expect(adminPreview).toContain('ALLOWED_LEGACY_HOSTS');
      expect(adminPreview).not.toContain('triedPaths');

      const downloadNote = readProjectFile('supabase/functions/download-note/index.ts');
      expect(downloadNote).toContain('is_approved_unbanned_user');
      expect(downloadNote).toContain('get_download_quota');
      expect(downloadNote).toContain('note_password_unlocks');
    });

    it('verifies frontend security controls: PDF.js CVE-2024-4367 mitigation, AuthContext zero hardcoded admins, headers, SW & index.html origin checks', () => {
      // PDF.js CVE-2024-4367: every getDocument in production src/ sets isEvalSupported: false
      const extractFileSrc = readProjectFile('src/lib/extractFile.ts');
      const attachSrc = readProjectFile('src/lib/assistantAttachments.ts');
      const previewSrc = readProjectFile('src/components/NotePreviewViewer.tsx');
      expect(extractFileSrc).toMatch(/getDocument\(\{[^}]*isEvalSupported:\s*false/);
      expect(attachSrc).toMatch(/getDocument\(\{[^}]*isEvalSupported:\s*false/);
      expect(previewSrc).toMatch(/getDocument\(\{[^}]*isEvalSupported:\s*false/);

      // AuthContext: zero hardcoded admin emails, no searchParams access_token
      const authCtx = readProjectFile('src/contexts/AuthContext.tsx');
      expect(authCtx).not.toContain('kaancolakogullari1@gmail.com');
      expect(authCtx).not.toContain('econnotespanel@gmail.com');
      expect(authCtx).not.toContain("searchParams.get('access_token')");
      expect(authCtx).toContain('clearAllUserClientState');
      expect(authCtx).toContain('approve_legacy_user_if_eligible');

      // SupportNotificationListener enforces AGENTS.md is_admin RPC rule
      const supportListener = readProjectFile('src/components/SupportNotificationListener.tsx');
      expect(supportListener).toContain('verifyMessageAdmins');

      // HTTP Security Headers in public/_headers
      const headersFile = readProjectFile('public/_headers');
      expect(headersFile).toContain('Strict-Transport-Security:');
      expect(headersFile).toContain('X-Content-Type-Options: nosniff');
      expect(headersFile).toContain('X-Frame-Options: DENY');
      expect(headersFile).toContain('Content-Security-Policy:');
      expect(headersFile).toContain("frame-ancestors 'none'");
      expect(headersFile).toContain("object-src 'none'");

      // Service Worker & index.html origin checks
      expect(readProjectFile('public/sw.js')).toContain('parsed.origin === self.location.origin');
      expect(readProjectFile('public/OneSignalSDKWorker.js')).toContain('parsed.origin === self.location.origin');
      expect(readProjectFile('index.html')).toContain('parsedLink.origin === location.origin');
      expect(readProjectFile('index.html')).not.toContain('user-scalable=no');

      // Zero pollinations in active frontend AI clients
      expect(readProjectFile('src/lib/assistantClient.ts')).not.toContain('fetch(PUBLIC_REASONING_ENDPOINT');
      expect(readProjectFile('src/lib/studyAiClient.ts')).not.toContain('fetch(PUBLIC_REASONING_URL');
    });

    it('verifies master SQL hardening migration covers every critical RLS, trigger, secret, quota, and 2FA control', () => {
      const sql = readProjectFile('supabase/migrations/20261124180000_comprehensive_security_hardening.sql');

      // C-1: profiles privileged column trigger + drop owner delete policy
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_profiles_privileged_columns()');
      expect(sql).toContain('DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.approve_legacy_user_if_eligible()');

      // C-2 & C-3: XP minting & wheel RNG bypass closed (strip SQL comments before checking executable SQL)
      const executableSql = sql.replace(/--[^\n]*/g, '');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_monday_wheel_xp(INTEGER, TEXT) FROM PUBLIC, anon, authenticated;');
      expect(executableSql).not.toContain('raw_user_meta_data');

      // C-4 & C-5 & H-1: notes moderation/file_url trigger + storage policy hardening
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_notes_moderation_and_path()');
      expect(sql).toContain('CREATE POLICY "Notes files require note access"');
      expect(sql).toContain("DROP POLICY IF EXISTS \"Avatars publicly accessible\" ON storage.objects;");

      // H-2: messages immutable columns + user_blocks
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_messages_immutable_columns()');
      expect(sql).toContain('FROM public.user_blocks ub');

      // H-3: rate limiting + approved/unbanned helper
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.api_rate_limits');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.check_rate_limit(');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.is_approved_unbanned_user(');

      // H-4: note_secrets isolation + verify_note_password rate limit
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.note_secrets');
      expect(sql).toContain('REVOKE ALL ON TABLE public.note_secrets FROM PUBLIC, anon, authenticated;');
      expect(sql).toContain("check_rate_limit('note_pw:'");

      // H-5: sms_2fa & sms_2fa_sessions versioned + RLS locked
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.sms_2fa');
      expect(sql).toContain('ALTER TABLE public.sms_2fa ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE public.sms_2fa_sessions ENABLE ROW LEVEL SECURITY;');

      // M-1, M-2, M-3, M-5, M-7, L-3, L-5
      expect(sql).toContain('IF _user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller)');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.archive_expired_revision_notes() FROM PUBLIC, anon, authenticated;');
      expect(sql).toContain("AND status = 'pending'");
      expect(sql).toContain('IF v_attempt.expires_at IS NOT NULL AND now() > v_attempt.expires_at');
      expect(sql).toContain('LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100)');

      // Schema-compatibility & Lucky Wheel / Trivia trigger safety regressions
      expect(sql).toContain('DROP FUNCTION IF EXISTS public.reconcile_missing_gamification_xp(BOOLEAN, UUID);');
      expect(sql).toContain('s.daily_period');
      expect(sql).toContain('s.xp_awarded');
      expect(sql).toContain('a.quiz_date');
      expect(sql).toContain("COALESCE(current_setting('app.trusted_profile_mutation', true), '') = 'true'");
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.award_points(_reason TEXT, _amount INTEGER)\nRETURNS INTEGER');
      expect(sql).toContain('allowed_downloads INTEGER');
      expect(sql).toContain('can_download BOOLEAN');
      expect(sql).toContain('rank INTEGER');
    });
  });

  // =========================================================================
  // 4. MFA GATE HOOKS STABILITY REGRESSION (FE C-4)
  // =========================================================================
  describe('4. TwoFactor MfaGate Rules-of-Hooks Regression', () => {
    it('places useSiteConfig() BEFORE all conditional returns in MfaGate', () => {
      const twoFactorSrc = readProjectFile('src/components/TwoFactor.tsx');
      const mfaIdx = twoFactorSrc.indexOf('export const MfaGate');
      expect(mfaIdx).toBeGreaterThan(-1);
      const mfaBody = twoFactorSrc.slice(mfaIdx);
      const useSiteIdx = mfaBody.indexOf('useSiteConfig()');
      const firstConditionalReturn = mfaBody.indexOf('if (loading ||');
      expect(useSiteIdx).toBeGreaterThan(-1);
      expect(firstConditionalReturn).toBeGreaterThan(-1);
      expect(useSiteIdx).toBeLessThan(firstConditionalReturn);
    });
  });
});
