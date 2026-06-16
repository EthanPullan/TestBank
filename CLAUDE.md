# TestBank — teacher question bank / printable-test builder

React app (single big component: `src/QuestionBankApp.jsx`) for building printable
tests. Vite + React + Tailwind. Deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`. Base path `/TestBank/`.
Live: https://ethanpullan.github.io/TestBank/

**Full docs:** [`docs/`](docs/) — architecture, data model, shared bank, shared
tests, Supabase setup/runbook, submissions, printing, operations. This file is the
terse summary; `docs/` is the long form.

- **Develop on the session's feature branch, then merge to `main`**; pushing to
  `main` auto-deploys.
- Build/verify: `npm install` then `npm run build` (outputs `dist/`). Preview:
  `npm run preview -- --port 4318` then GET `http://localhost:4318/TestBank/`.

## Storage & data model
- Bank persists in the browser via `jGet/jSet` + `rawSet/getImage` (keys like
  `bank:questions`, `bank:groups`, `bank:settings`, `img:<id>`).
- Entities: questions; question-sets ("groups"); diagrams (images keyed by id).

## Two modes (toggled by `src/supabaseConfig.js`)
- **File mode** (when keys are blank): first visit seeds from
  `public/seed-bank.json`; returning visits auto-pull *newly published* questions
  (additive by id, tracked in `bank:pubSeen`, cache-busted fetch). Publishing =
  Settings → Export `seed-bank.json` → commit to `public/`.
- **Shared-bank mode** (when keys are set — CURRENT): teachers sign in to a
  Supabase-backed shared bank and Publish/Pull. File seed/auto-sync is disabled.

## Shared bank (Supabase)
- Config: `src/supabaseConfig.js` — `SUPABASE_URL` + publishable key (public by
  design; writes gated by RLS + logins). `SHARED_BANK_ENABLED` gates everything.
- Layer: `src/sharedBank.js` — lazy-loaded `@supabase/supabase-js`: `getSession`,
  `onAuthChange`, `signIn`, `signOut`, `fetchBank`, `publishBank` (optimistic
  concurrency via a `revision` counter).
- Backend: table `public.bank`, single row `id='main'`, columns `data jsonb`,
  `revision int`, `updated_at`, `updated_by`. RLS: select + update for
  `authenticated` only (teacher-only — students never use the app). Email
  sign-ups are OFF; teacher users are added manually in Supabase.
- UI: Settings → **Shared bank** card (sign-in form, Publish, Pull latest,
  Download backup).
- Migration: first teacher signs in (local bank stays intact), clicks **Publish**
  → seeds the shared bank at rev 1; others pull on reload. A recoverable copy is
  stashed to `bank:localBackup` before the shared bank ever replaces local data.
- Saved tests: separate table `public.tests` (one row per test; `data jsonb`,
  `owner uuid default auth.uid()`, `owner_email`, `updated_at`). RLS: select for
  all `authenticated`, insert/update/delete owner-only. Layer: `listTests` /
  `upsertTest` / `deleteTest` / `isMissingTableError`. Synced on sign-in & Pull,
  mirrored on `finalizeTest`; `TestsTab` has a Mine/Everyone filter + owner-only
  edit/delete (others Duplicate); one-time prompt pushes local-only tests. No
  seed row needed; degrades to local-only if the table is missing. See
  `docs/SHARED-TESTS.md`.

## Status (verified live 2026-06-16)
Shared bank is deployed **and verified end-to-end**. Infra checks (run against the
project URL + publishable key) all pass:
- auth health `/auth/v1/health` → `200`
- anon read `rest/v1/bank` → `[]` (RLS hides rows from anon; the table exists and
  is exposed — a missing table would `404`, not `[]`)
- anon insert → `401` "new row violates row-level security policy"
- anon update of `id=main` → `[]` (0 rows; RLS blocks anon writes)
- bogus sign-in → `400` invalid credentials

In-browser teacher flow confirmed live: sign-in → auto-pull rev 0 → **Publish →
rev 1** with `updated_by` recorded. The `main` row now holds the real bank at
revision 1.

Shared **saved tests** shipped + verified the same day: `public.tests` created,
anon read `[]`/`200` and anon insert `401` (RLS) confirmed, live on `main`.
Long-form docs now live in `docs/`.

**Gotcha for any fresh setup:** `publishBank` is UPDATE-only (`update().eq('id',
'main').eq('revision', expected)`), so the `id='main'` row MUST pre-exist at
`revision 0` or the first Publish matches 0 rows and throws a *misleading*
"conflict" toast. The row is already seeded here, so this is handled — but a brand
new project needs `insert into public.bank (id, data, revision) values ('main',
'{}'::jsonb, 0)` first (or change `publishBank` to upsert + add an INSERT policy).

Infra re-check (anytime egress allows `*.supabase.co`):

   ```bash
   URL=https://fjnnregdvlosbpmykbwm.supabase.co
   KEY=sb_publishable_uytMtdzl_TK68tnDJxSqqQ_2CcCBxtz
   curl -s -w '\n%{http_code}\n' "$URL/auth/v1/health" -H "apikey: $KEY"
   curl -s -w '\n%{http_code}\n' "$URL/rest/v1/bank?select=id,revision" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"email":"nobody@example.com","password":"x"}' -w '\n%{http_code}\n'
   ```

Rollback: blanking the two values in `src/supabaseConfig.js` instantly returns
everyone to file mode with no data loss.
