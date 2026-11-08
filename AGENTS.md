# Project architecture rules

- Keep the visible application version in `src/lib/version.ts` and import its labels everywhere, so releases never display conflicting versions.
- Detect long-return sessions before updating `profiles.last_login`, and keep the tour acknowledgement versioned in browser storage to avoid redirect loops.
- Generate `public/sitemap.xml` with `scripts/generate-sitemap.ts` before dev/build; keep its entries aligned with public content routes and exclude account/auth/admin tools to avoid advertising private surfaces.
- Keep personal direct messages in `Mesajlar` strictly out of `Destek Merkezi`; administrators initiate official user conversations by selecting the user inside `Destek Merkezi`, verify admin senders through the server-side `is_admin` RPC, and mark only opened conversation messages as read.
