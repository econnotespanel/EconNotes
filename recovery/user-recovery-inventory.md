# EconNotes User Recovery Inventory

**Report Generated:** 2026-11-05  
**Scope:** Historical account records, identity mapping, audit logs, and authentication state analysis.

---

## 1. Verified Active Accounts

These accounts are explicitly referenced in application migration triggers and confirmed in previous database operational states.

| Email Address | Original Role | Primary User UUID | Status / Origin |
|---|---|---|---|
| `kaancolakogullari1@gmail.com` | Super Admin / Primary Author | `a08bce8e-5c25-41b6-a80a-ebef6634d7ba` | Verified creator of all 33 notes and 16 announcements. |
| `kaancolakogullari9@gmail.com` | Administrator | Referenced in schema triggers | Defined in `sync_oauth_profile_details` & `handle_new_user` admin triggers. |
| `econnotespanel@gmail.com` | Project / Panel Administrator | `316b23c8-3275-4e7d-b31f-cc1db7917f31` | Project owner account recorded in Supabase project metadata. |

---

## 2. Historical Accounts Identified in Audit Logs

The following accounts appear in the local CSV audit logs (`econnotes-denetim-kaydi-*.csv`) covering the period from March 2026 to October 2026:

| Email Address | Name / Label | Observed Actions | Activity Period | Verification Status |
|---|---|---|---|---|
| `kaancolakogullari1@gmail.com` | Kaan Çolakoğlu / Kaan Çolakoğulları | Note creation, deletion, moderation | March 2026 – Oct 2026 | Verified Active Primary Account |
| `kaan.colak2005.2018@gmail.com` | Kaan Berk | Note upload/deletion, administrative testing | March 2026 | Historical Account (Test / Developer) |

---

## 3. Account Deletion Records (Historical Test Accounts)

The audit logs explicitly document intentional deletions of test accounts performed between August 2026 and October 2026. These UUIDs represent deleted records and must **not** be recreated as active accounts:

| Deleted Record UUID | Deletion Timestamp | Associated Name / Description |
|---|---|---|
| `89cc1bdc-926d-43ff-95c7-f3769ea39f81` | 15.10.2026 00:32:22 | User account permanently deleted |
| `e7d3d0c3-166c-42c2-a0a4-afbd029077e4` | 04.10.2026 16:31:50 | User account permanently deleted |
| `a6ff760b-b9f3-4a75-a811-71cf1cfa76c7` | 10.08.2026 21:09:04 | User account permanently deleted |
| `87d2fbe4-790c-4417-9051-dc11f096e14d` | 10.08.2026 21:04:40 | User account permanently deleted |

---

## 4. Accounts Found in Secondary / Historical Databases

| Database Reference | User Email | User UUID | Status |
|---|---|---|---|
| `ylhjmchzejvpeaacajxm` | `kaancolakogullari1@gmail.com` | `69411082-071c-4b3d-b995-f914ac1c752d` | Operational on secondary instance. |
| `ylhjmchzejvpeaacajxm` | `test_signup_1793807715678@econnotes.online` | `262d6e01-e038-4994-8503-2ae5d237f285` | Automated test account (non-student). |
| `ylhjmchzejvpeaacajxm` | `test_query_1793807725011@econnotes.online` | `78d3a42f-f093-43ec-8eca-26e6c78b9422` | Automated test account (non-student). |
| `xzqojrwpxdjoveklckvx` | `econnotespanel@gmail.com` | `316b23c8-3275-4e7d-b31f-cc1db7917f31` | Historic primary (project deleted). |
| `xzqojrwpxdjoveklckvx` | `kaancolakogullari1@gmail.com` | `ff7b21f7-6499-4342-90f2-4cea490870c8` | Historic primary (project deleted). |

---

## 5. Password Hashes and Auth Credentials Availability

* **Bcrypt Password Hashes:** **Not available in any local file or backup.** Supabase Auth protects `auth.users.encrypted_password` from REST and Client APIs.
* **SSO / OAuth Connections:** Google and Apple provider IDs are managed in Supabase Auth tables on the remote container.
* **Email Confirmation Records:** Verified for administrator accounts in project metadata.
