# TestBank — teacher question bank / printable-test builder

React app (single big component: `src/QuestionBankApp.jsx`) for building printable
tests. Vite + React + Tailwind. Deployed to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`. Base path `/TestBank/`.
Live: https://ethanpullan.github.io/TestBank/

- **Develop on branch `claude/festive-planck-goyx6z`**; pushing to `main` auto-deploys.
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

## Status / next step (2026-06-16)
Shared bank is deployed live; keys are in `src/supabaseConfig.js`. NOT yet
verified end-to-end because the sandbox couldn't reach `*.supabase.co` (env egress
allowlist). To verify:
1. Ensure `*.supabase.co` is in the environment's egress allowlist (a mid-session
   change needs a NEW session to take effect).
2. Run the infra checks (expected: auth health `200`; anon read of `bank` → `[]`
   due to RLS; anon insert → denied; bogus sign-in → `400` invalid credentials):

   ```bash
   URL=https://fjnnregdvlosbpmykbwm.supabase.co
   KEY=sb_publishable_uytMtdzl_TK68tnDJxSqqQ_2CcCBxtz
   curl -s -w '\n%{http_code}\n' "$URL/auth/v1/health" -H "apikey: $KEY"
   curl -s -w '\n%{http_code}\n' "$URL/rest/v1/bank?select=id,revision" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
   curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" -d '{"email":"nobody@example.com","password":"x"}' -w '\n%{http_code}\n'
   ```
3. The signed-in Publish/Pull must be tested in-browser (no teacher credential in
   the repo) OR with a throwaway teacher login the owner provides.

Rollback: blanking the two values in `src/supabaseConfig.js` instantly returns
everyone to file mode with no data loss.
