# EconNotes 2.0 – Migration Blockers & Risk Analysis

**Generated:** 2026-11-05  
**Platform Version:** `v2.20.102`  
**Classification:** Critical Pre-Migration Audit  

---

## 1. Primary Operational Blockers

### Blocker 1: Original Lovable Cloud Backend Unresponsiveness
* **Impact:** 100% of authentication requests, database reads/writes, and storage downloads via `https://htjmuzogayyufewirvlp.supabase.co` are completely hanging.
* **Evidence:** Probing `https://htjmuzogayyufewirvlp.supabase.co/auth/v1/health` with valid apikey times out indefinitely (>30 seconds), causing the client-side timeout in `Login.tsx` to throw: *"Giriş sunucusuna veya veritabanına ulaşılamadı"*.
* **Resolution:** Migration to an independently owned, self-governed Supabase backend is strictly required.

---

### Blocker 2: Absence of Bcrypt Password Hashes in Local Exports
* **Impact:** No local backup file (`notes.json`, `announcements.json`, `db_cluster-*.backup.gz`) contains `auth.users.encrypted_password`.
* **Technical Reality:** Supabase REST APIs and Client APIs deliberately protect `auth.users` and never return password hashes.
* **Two-Track Resolution Strategy:**
  * **Option A (Zero-reset path):** Requires Lovable Support to reboot container `htjmuzogayyufewirvlp` or provide an export of the PostgreSQL `auth` schema.
  * **Option B (Independent account recovery path):** Provision the verified primary account (`kaancolakogullari1@gmail.com`) using the Supabase Service Role Admin API with the **exact original UUID** (`a08bce8e-5c25-41b6-a80a-ebef6634d7ba`). When the user signs in with Google OAuth or clicks a 1-click password reset invitation, they instantly regain access to 100% of their existing academic notes, author attribution, and admin rights.

---

### Blocker 3: UUID Preservation via Standard Client Signup is Impossible
* **Technical Reality:** Calling `supabase.auth.signUp()` generates a randomly assigned UUID. If the primary user signs up as a new user, they will receive a new UUID, severing all foreign key relationships with the 33 academic notes and 16 announcements.
* **Resolution:** The primary user account **must** be created using either:
  1. Supabase Admin API: `adminClient.auth.admin.createUser({ id: 'a08bce8e-5c25-41b6-a80a-ebef6634d7ba', email: 'kaancolakogullari1@gmail.com', email_confirm: true, password: '...' })`
  2. Direct SQL insertion into `auth.users` using the independent project's SQL editor.
* Both methods preserve the exact UUID and all relational integrity.

---

## 2. AI Architecture & Gateway Blockers

### Blocker 4: All 5 AI Functions are Hardcoded to Lovable AI Gateway & Gemini
* **Impact:** `academic-assistant`, `generate-kpss`, `generate-study-material`, `study-coach`, and `summarize-live-lecture` currently call `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY` and Google Gemini model IDs (`google/gemini-2.5-pro`).
* **Resolution:** Rebuild all 5 functions into a unified server-side OpenAI Gateway:
  * Text generation & Structured Outputs: OpenAI Responses API / Chat Completions with JSON schema using verified models:
    * `gpt-4o` (High-reasoning academic tutoring, live lecture summarization, KPSS generation)
    * `gpt-4o-mini` (Fast study coach chat, flashcards)
  * Neural Audio Speech: OpenAI Audio Speech API (`tts-1` / `tts-1-hd` with voices `alloy`, `echo`, `nova`) replacing Lovable audio endpoint.
  * Audio Transcription: OpenAI Whisper API (`whisper-1`) for live class capture.
  * API Key Storage: `OPENAI_API_KEY` configured exclusively as a Supabase backend secret.

---

## 3. Security Vulnerabilities Identified in Audit

### Blocker 5: Client-Side OneSignal REST API Key Exposure
* **Location:** `src/lib/onesignal.ts` (lines 11-20)
* **Vulnerability:** A base64-encoded OneSignal REST API Key was previously stored directly in client code (`[MASKED_ONESIGNAL_REST_KEY]`).
* **Risk:** Anyone inspecting the client bundle can extract the key and broadcast push notifications to all EconNotes users.
* **Resolution:** Remove the REST API key from client code. Any administrative push notification dispatch must be routed through a protected Supabase Edge Function that checks `is_admin(auth.uid())`.

---

## 4. Environment & Migration Prerequisites

Before remote writes or migration execution:

1. **Independent Supabase Project:**
   - Needs: Project URL, Anon Key, and Service Role Key (kept strictly in local `.env` and Supabase secrets).
2. **OpenAI Platform Account:**
   - Needs: Valid `OPENAI_API_KEY` with access to `gpt-4o`, `gpt-4o-mini`, `tts-1`, and `whisper-1`.
3. **Approval Gate:**
   - As per Phase 0 safety protocol, no remote modifications, database writes, or DNS redirects will be performed without explicit user confirmation.
