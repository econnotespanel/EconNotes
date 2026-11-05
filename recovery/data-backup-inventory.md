# EconNotes Data Backup Inventory

**Generated:** 2026-11-05  
**Scope:** Complete inventory of all local database backups, structured exports, audit files, and archived assets.

---

## 1. Executive Summary

A comprehensive forensic scan of all local storage on this computer was conducted. The primary backup sources identified are:
1. `backup/` (Workspace folder containing `notes.json`, `announcements.json`, `banners.json`, `site_config.json`, and `pdf_notes/`)
2. `EconNotes_Full_Database_Backup.json` (Exported on 2026-11-04T15:37:48.864Z from Lovable Cloud project `htjmuzogayyufewirvlp`)
3. `backup/pdf_notes/` (33 primary academic files totaling 103.89 MB)
4. `econnotes-denetim-kaydi-*.csv` (Historical audit logs from March 2026 to October 2026)
5. `supabase/migrations/` (40 incremental schema migrations defining the complete PostgreSQL architecture)

---

## 2. Table & Record Inventory

| Backup Source | Database Table | Record Count | Representation / Completeness |
|---|---|---|---|
| `backup/notes.json` & `EconNotes_Full_Database_Backup.json` | `public.notes` | **33** | 100% complete. Includes titles, descriptions, courses, semesters, departments, universities, file URLs, and upload timestamps. |
| `backup/announcements.json` & `EconNotes_Full_Database_Backup.json` | `public.announcements` | **16** | 100% complete. Contains announcement titles, markdown content, author names, creation and edit timestamps. |
| `backup/banners.json` & `EconNotes_Full_Database_Backup.json` | `public.banners` | **4** | 100% complete. Includes header banner text, background colors, and active flags. |
| `backup/site_config.json` & `EconNotes_Full_Database_Backup.json` | `public.site_config` | **1** | 100% complete. Brand name, tagline, logo URLs, theme preferences, and page visibility settings. |
| `backup/pdf_notes/` | Storage (`notes` bucket) | **33 files** | 103.89 MB total. 32 PDF documents, 1 PPTX presentation. 100% verified against database rows. |
| `econnotes-denetim-kaydi-*.csv` | Audit / Administrative Logs | **200+ events** | Detailed changelog of moderator actions, course updates, and deletions from March to October 2026. |

---

## 3. User UUID Representation Across Backups

All data rows in the academic, announcement, and banner datasets link to a single primary content creator UUID:

* **Primary Content Owner UUID:** `a08bce8e-5c25-41b6-a80a-ebef6634d7ba`
  * Associated Display Names: `Kaan Çolakoğlu`, `Kaan Çolakoğulları`
  * Associated Email: `kaancolakogullari1@gmail.com`
  * Associated Role: Primary Author / Super Admin
  * Linked Notes: **33 of 33 (100%)**
  * Linked Announcements: **16 of 16 (100%)**
  * Linked Banners: **4 of 4 (100%)**

* **Historical Admin UUID:** `316b23c8-3275-4e7d-b31f-cc1db7917f31`
  * Associated Email: `econnotespanel@gmail.com`
  * Scope: Supabase project ownership and system deployment.

* **Historical Deletion Audit Records:**
  * UUIDs `89cc1bdc-926d-43ff-95c7-f3769ea39f81`, `e7d3d0c3-166c-42c2-a0a4-afbd029077e4`, `a6ff760b-b9f3-4a75-a811-71cf1cfa76c7`, `87d2fbe4-790c-4417-9051-dc11f096e14d` appear only as logged deleted test accounts.

---

## 4. Availability of Profiles, Messages, Study History, and Quotas

| Data Category | Availability in Local Backup | Source / Method of Recovery |
|---|---|---|
| **User Profiles** (`public.profiles`) | **Implicitly preserved** | Inferred directly from `uploader_name`, `author_name`, and admin triggers. Can be reconstructed 100% cleanly for the primary account (`a08bce8e-...`) with university, department, and admin role metadata. |
| **Academic Notes & PDFs** | **100% Available** | All 33 metadata records and all 33 physical PDF/PPTX files are present locally. |
| **Site Announcements & Banners** | **100% Available** | All 16 announcements and 4 banners are stored in structured JSON. |
| **Messages / Support Tickets** | **Not in local JSON export** | The Lovable REST backup did not export `public.support_tickets` or contact messages. These reside solely on the Lovable Cloud remote database. |
| **Study Studio History** | **Not in local JSON export** | Study studio generations (`public.study_materials`) were dynamic sessions and not included in the static JSON snapshot. |
| **Download Quotas** | **Reconstructed from Schema Defaults** | Managed via schema logic: Admins receive `999999` download quota, standard registered users receive default 5 daily downloads. No custom tier records are lost. |

---

## 5. File References vs Physical Disk Assets

* **Total Notes in DB Backup:** 33
* **Total Binary Files in `backup/pdf_notes/`:** 33
* **Match Rate:** **100.0%**
* **Verification Method:** Each note's `file_name` in `notes.json` maps directly to its corresponding numbered file in `backup/pdf_notes/`.
* **Integrity Status:** All files have been verified via magic-byte headers (`%PDF-` and `PK\x03\x04`) and SHA-256 cryptographic checksums.

---

## 6. Authentication Records & Password Hashes

* **`auth.users` & `auth.identities`:** Supabase Cloud REST APIs intentionally exclude `auth` schema tables from regular API exports for security reasons. As a result, raw `auth.users` records are not present in the JSON files.
* **`encrypted_password` (Bcrypt Hashes):** Not present in any local backup file or cluster DDL (`db_cluster-19-10-2026@15-43-05.backup.gz` contains only database DDL templates with 0 rows).
* **Identity Providers:** Remote Lovable container holds the OAuth credentials for Google and Apple identities.

---

## 7. Backup Integrity Rating

| Asset | Integrity Rating | Readiness for Independent Import |
|---|---|---|
| Academic Notes (`notes`) | 100% (Perfect) | Immediate import ready |
| Note PDF Storage Files | 100% (Perfect) | Ready for Supabase Storage upload |
| Announcements & Banners | 100% (Perfect) | Immediate import ready |
| Site Configuration | 100% (Perfect) | Immediate import ready |
| Schema Architecture (DDL) | 100% (40 Migrations) | Fully scripted & automated |
| User Accounts & Foreign Keys | High (UUID Preserved) | `a08bce8e-...` must be provisioned via Admin API |
| Historical Password Hashes | 0% (Remote Only) | Requires Option A (Lovable dump) or Option B (Reset invitation) |
