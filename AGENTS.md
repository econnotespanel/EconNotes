# Project architecture rules

- Keep the visible application version in `src/lib/version.ts` and import its labels everywhere, so releases never display conflicting versions.
- Detect long-return sessions before updating `profiles.last_login`, and keep the tour acknowledgement versioned in browser storage to avoid redirect loops.