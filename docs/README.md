# TestBank documentation

Reference docs for **TestBank** — a teacher's question bank and printable-test
builder. A single-page React app (Vite + Tailwind) deployed as a static site to
GitHub Pages, with an optional Supabase backend so a few trusted teachers share
one live bank of questions and tests.

> **Live:** https://ethanpullan.github.io/TestBank/
> **Audience:** teachers only (students never use the app — it just makes
> printable tests). Sign-ups are off; teacher accounts are added by hand.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand how the whole thing fits together | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Know the exact shape of every entity & storage key | [DATA-MODEL.md](./DATA-MODEL.md) |
| Understand the shared **question** bank (Supabase) | [SHARED-BANK.md](./SHARED-BANK.md) |
| Understand shared **saved tests** (Supabase) | [SHARED-TESTS.md](./SHARED-TESTS.md) |
| Set up / verify / roll back the Supabase backend | [SUPABASE-SETUP.md](./SUPABASE-SETUP.md) |
| Understand question suggestions & moderation | [SUBMISSIONS.md](./SUBMISSIONS.md) |
| Understand how tests are laid out and printed | [PRINTING.md](./PRINTING.md) |
| Build, deploy, verify, or troubleshoot | [OPERATIONS.md](./OPERATIONS.md) |

## The 60-second tour

- **One big component.** Almost the entire UI and all logic live in
  [`src/QuestionBankApp.jsx`](../src/QuestionBankApp.jsx). The other source files
  are small: the Supabase layer (`src/sharedBank.js`), its config
  (`src/supabaseConfig.js`), deploy/moderation config (`src/config.js`), and the
  entry point (`src/main.jsx`).
- **Two run modes**, chosen by whether `src/supabaseConfig.js` has keys:
  - **File mode** (keys blank): the bank seeds from `public/seed-bank.json` and is
    published by committing that file. No login.
  - **Shared-bank mode** (keys set — *current*): teachers sign in to a Supabase
    project and Publish/Pull one live bank. Saved tests sync to a second table.
- **Local-first storage.** Everything lives in the browser (`localStorage`) under
  `bank:*` and `img:*` keys; the Supabase tables are the shared source of truth
  when signed in. See [DATA-MODEL.md](./DATA-MODEL.md).
- **Deploys on push to `main`** via `.github/workflows/deploy.yml` (GitHub Pages,
  base path `/TestBank/`). See [OPERATIONS.md](./OPERATIONS.md).

## Conventions in these docs

- Code is referenced by **symbol name + file** (e.g. `publishBank` in
  `src/sharedBank.js`) rather than line numbers, which drift as the single big
  file changes. Grep the symbol to find it.
- SQL blocks are **copy-paste ready** for the Supabase SQL editor.
- ⚠️ marks a gotcha that has bitten us or will bite a future maintainer.

## Project history (why this exists)

The app began as a purely local/file-mode tool. The shared bank (Supabase) was
added so a small group of teachers could edit one live bank instead of emailing
JSON around; saved tests were then added to the same backend so built tests
persist across devices and are visible to the team. The Supabase backend was
verified end-to-end on 2026-06-16 (auth, RLS, publish→rev 1). The terse,
agent-facing summary lives in [`../CLAUDE.md`](../CLAUDE.md); these docs are the
long form.
