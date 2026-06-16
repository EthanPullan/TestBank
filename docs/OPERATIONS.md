# Operations & troubleshooting

Build, deploy, verify, and fix. Backend SQL/checks are in
[SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

## Local development

```bash
npm install
npm run dev                         # dev server (Vite)
npm run build                       # production build → dist/
npm run preview -- --port 4318      # serve the build; GET http://localhost:4318/TestBank/
```

⚠️ The app is served under the base path **`/TestBank/`** — hit
`http://localhost:4318/TestBank/`, not `/`, or you get a blank page.

## Branch & release flow

- **Deploys on push to `main`** via `.github/workflows/deploy.yml`
  (`npm install && npm run build`, Node 20, publish `dist/` to GitHub Pages,
  `concurrency: pages`, no cancel-in-progress).
- **Develop on a feature branch, then merge to `main`** to release. Branch names
  rotate per working session; `main` is the deploy branch.
- A docs-only change still triggers a Pages rebuild — harmless, since markdown
  isn't part of the bundle.

Typical release:
```bash
git checkout -b <feature-branch>
# …edit…
npm run build                       # MUST pass — a build error breaks the deploy
git commit -am "…"
git checkout main && git merge --ff-only <feature-branch>
git push origin main                # auto-deploys
```
Confirm the run goes green in the repo's **Actions** tab.

## Routine runbooks

**Add a teacher** — Supabase → Authentication → Users → Add user → email +
password → ✅ Auto Confirm. See [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

**Publish questions to everyone**
- Shared mode: Settings → Shared bank → **Publish** (any signed-in teacher).
- File mode: Settings → export **`seed-bank.json`** → commit to `public/`.

**Rotate the moderation passphrase** — change `ADMIN_PASSPHRASE` in
`src/config.js`, redeploy.

**Roll the whole backend off** — blank the two values in
`src/supabaseConfig.js`, redeploy → everyone returns to file mode, no data loss.

## Verification checklists

**Backend (anon, no login):** run the `curl` block in
[SUPABASE-SETUP.md](./SUPABASE-SETUP.md#verification-anon-curl-checks). Healthy:
auth `200`; anon read of `bank`/`tests` → `[]`; anon insert → `401`; bogus
sign-in → `400`.

**In-browser (signed in):**
1. Sign in (Settings → Shared bank). Indicator shows `rev N`.
2. Edit a question → **Publish** → "Published to shared bank · rev N+1".
3. **Build a test** → finalize → it appears in **Saved tests** "· by you".
4. Second browser/incognito → sign in → **Pull latest** → see the question and,
   under **Everyone**, the test (with **Duplicate**, not Edit).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| First **Publish** fails with "Someone else published since you loaded… conflict" on a fresh project | `bank` row `id='main'` missing → `publishBank`'s UPDATE matches 0 rows ⚠️ | Seed it: `insert into public.bank (id,data,revision) values ('main','{}'::jsonb,0) on conflict (id) do nothing;` ([SHARED-BANK.md](./SHARED-BANK.md)) |
| Saving a test doesn't sync; "is the shared tests table set up?" | `tests` table not created; anon read returns `404 PGRST205` | Run migration 2 in [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) |
| Tests/bank silently local-only | Not signed in, or `SHARED_BANK_ENABLED` false | Sign in; check `src/supabaseConfig.js` keys |
| "Couldn't load the shared bank" on sign-in | `main` row missing (so `fetchBank`'s `.single()` errors), or network | Seed the row; re-check egress |
| Sandbox/CI can't reach Supabase | Egress allowlist missing **`*.supabase.co`** (wildcard, not apex); mid-session change needs a new session | Add `*.supabase.co`; start a fresh session ([SUPABASE-SETUP.md](./SUPABASE-SETUP.md#sandbox-egress-note-)) |
| Sign-in always "Invalid login credentials" | User unconfirmed, or sign-ups off and no account exists | Create/confirm the user (Auto Confirm) |
| One teacher can't edit another's test | Working as designed — RLS owner-only write; non-owners get **Duplicate** | Duplicate, then edit your copy |
| Deployed site is blank / assets 404 | Vite `base` ≠ repo name, or visiting `/` not `/TestBank/` | Keep `base:"/TestBank/"`; visit the base path |
| Pages didn't deploy | Push wasn't to `main`, or Pages not enabled | Push to `main`; first run enables Pages (`configure-pages enablement:true`) or enable under Settings → Pages |
| Lost local data after a Pull | A shared Pull replaced local data | Recover from `bank:localBackup` (stashed before overwrite) |

## Where things live (quick index)

| Need | File / symbol |
| --- | --- |
| All UI + logic | `src/QuestionBankApp.jsx` |
| Supabase calls | `src/sharedBank.js` (`fetchBank`, `publishBank`, `listTests`, `upsertTest`, `deleteTest`) |
| Backend on/off + keys | `src/supabaseConfig.js` |
| Owner/repo, label, passphrase | `src/config.js` |
| Dev/deploy | `.github/workflows/deploy.yml`, `vite.config.js` |
| File-mode public bank | `public/seed-bank.json` |
| Agent memory | `CLAUDE.md` |
| These docs | `docs/` |
