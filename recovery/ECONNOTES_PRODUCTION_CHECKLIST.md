# EconNotes 2.0 – Production Migration & Release Checklist

**Generated:** 2026-11-05  
**Target Architecture:** Independent Supabase Backend + Vercel Hosting + OpenAI AI Gateway  

---

## 1. Pre-Flight Verification & Backup Immutability

- [x] **Local Backup Integrity:** 33 academic notes, 33 binary PDF/PPTX assets (103.89 MB), 16 announcements, 4 banners, and 1 site config verified via SHA-256 in [file-integrity-report.md](file:///c:/Users/Kaan%20Çolakoğlu/Downloads/EconNotes-main%20(5)/recovery/file-integrity-report.md).
- [x] **Read-Only Preservation:** Original backup files in `backup/` and `Downloads/` preserved untouched.
- [x] **Baseline Validation:** Unit test suite passing (31/31 tests across 8 suites) and production build passing in 13.74s.
- [x] **Git Safety Branch:** Working tree isolated on `recovery/econnotes-2.0-rebuild`.

---

## 2. Independent Supabase Infrastructure Provisioning

- [ ] **Create Independent Supabase Project:**
  - Organization: Independent / Self-Governed
  - Region: Central EU (Frankfurt) or closest to Turkish student userbase.
- [ ] **Apply PostgreSQL Schema Migrations:**
  - Execute the 40 incremental migrations from `supabase/migrations/` in order.
  - Verifies creation of 32 tables, 22 functions, 17 triggers, and 107 RLS policies.
- [ ] **Enable Required Extensions:**
  - `pg_cron` (For automated ticket closing and maintenance routines).
- [ ] **Configure Storage Buckets:**
  - Bucket `notes`: Public read, authenticated insert/update/delete.
  - Bucket `avatars`: Public read, user-scoped insert/update/delete.

---

## 3. Authentication & Account Restoration (Preserving Original Identity)

- [ ] **Seed Primary Content Author with Preserved UUID:**
  - Primary UUID: `a08bce8e-5c25-41b6-a80a-ebef6634d7ba`
  - Email: `kaancolakogullari1@gmail.com`
  - Method: Supabase Admin API (`auth.admin.createUser`) to prevent foreign key or author dissociation.
- [ ] **OAuth Identity Configuration:**
  - Google OAuth: Add Client ID and Client Secret in Supabase Auth -> Providers -> Google.
  - Apple OAuth: Add Services ID, Team ID, and Private Key in Supabase Auth -> Providers -> Apple.
  - Redirect URIs:
    - `https://econnotes.online/**`
    - `https://<independent-project>.supabase.co/auth/v1/callback`
- [ ] **Email & SMTP Configuration:**
  - Configure Custom SMTP (or Resend) for welcome emails, password reset invitations, and ticket alerts.

---

## 4. Centralized OpenAI AI Gateway Configuration

- [ ] **Configure Server-Side Secrets in Supabase:**
  - `OPENAI_API_KEY`: Official OpenAI API key with access to `gpt-4o`, `gpt-4o-mini`, `tts-1`, and `whisper-1`.
  - `ONESIGNAL_REST_API_KEY`: Server-side secret for push notification dispatch via `send-notification` edge function.
- [ ] **Deploy Rebuilt Edge Functions:**
  - `supabase functions deploy academic-assistant`
  - `supabase functions deploy generate-kpss`
  - `supabase functions deploy generate-study-material`
  - `supabase functions deploy study-coach`
  - `supabase functions deploy summarize-live-lecture`
  - `supabase functions deploy send-notification`
  - `supabase functions deploy admin-reset-password`
  - `supabase functions deploy admin-user-emails`
  - `supabase functions deploy admin-delete-user`
  - `supabase functions deploy delete-my-account`
  - `supabase functions deploy complete-password-change`

---

## 5. Data Restoration & Binary Asset Hydration

- [ ] **Execute Automated Restore Engine:**
  ```bash
  TARGET_SUPABASE_URL="https://<independent-project>.supabase.co" \
  TARGET_SERVICE_ROLE_KEY="<service-role-key>" \
  node recovery/restore_to_independent_supabase.cjs --execute
  ```
  - Verifies upload of all 33 files into `notes/{author_uuid}/`
  - Inserts 33 notes with updated CDN paths
  - Inserts 16 announcements, 4 banners, and site configuration
  - Preserves all author attributions and foreign keys

---

## 6. Frontend Environment Configuration & Production Cutover

- [ ] **Update Frontend Environment Variables (`.env`):**
  - `VITE_SUPABASE_URL`: Point to new independent Supabase instance.
  - `VITE_SUPABASE_PUBLISHABLE_KEY`: Point to new independent Supabase public anon key.
- [ ] **Verify Production Build:**
  - Run `npm run test` -> Verify all 31 tests pass.
  - Run `npm run build` -> Verify clean Vite production bundle.
- [ ] **Custom Domain & SSL Verification:**
  - Verify DNS CNAME for `econnotes.online` pointing to production hosting (Vercel).
  - Verify SSL certificate issuance and HTTPS redirection.
- [ ] **Rollback Plan:**
  - If any unexpected regression occurs, frontend `.env` can instantly be repointed, or git branch can be rolled back to `v2.20.102` (`3905aa7`).
