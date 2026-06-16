# Architecture

How TestBank is structured, top to bottom. For exact field shapes see
[DATA-MODEL.md](./DATA-MODEL.md); for the backend see [SHARED-BANK.md](./SHARED-BANK.md)
and [SHARED-TESTS.md](./SHARED-TESTS.md).

## What it is

A client-only React single-page app that lets a teacher write/tag/store test
**questions**, assemble them into **tests**, and print or download those tests
(plus answer keys) as standalone HTML. There is **no application server** — the
app runs entirely in the browser and is served as static files from GitHub Pages.
Persistence is the browser's `localStorage`, optionally backed by a Supabase
project so a few teachers share one live bank.

## Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| UI | **React 18** (`react`, `react-dom` 18.3.1) | Function components + hooks |
| Build | **Vite 5** (`@vitejs/plugin-react`) | `base: "/TestBank/"` in `vite.config.js` |
| Styling | **Tailwind 3** (+ PostCSS, autoprefixer) | Plus hand-written "index-card/manila" CSS and print CSS |
| Icons | **lucide-react** 0.453.0 | |
| Backend (optional) | **Supabase** (`@supabase/supabase-js` ^2) | Auth + Postgres + RLS; **lazy-loaded** so the main bundle stays small |
| Hosting | **GitHub Pages** | Built `dist/` published by Actions on push to `main` |

The app is JS/JSX only — no TypeScript, no test runner, no linter in CI. CI does
exactly one thing: `npm install && npm run build` → publish `dist/`.

## Source layout

```
index.html                     Vite entry; mounts #root
vite.config.js                 base path "/TestBank/" + react plugin
tailwind.config.js, postcss.config.js
public/seed-bank.json          File-mode seed bank (a full backup: questions, groups, images)
src/
  main.jsx                     createRoot(...).render(<QuestionBankApp/>)
  index.css                    Tailwind entry
  QuestionBankApp.jsx          ~2800 lines: ALL UI + logic (see "The one big component")
  sharedBank.js                Supabase layer (auth + bank row + tests table)
  supabaseConfig.js            SUPABASE_URL + publishable key + SHARED_BANK_ENABLED
  config.js                    GITHUB_OWNER/REPO, SUBMISSION_LABEL, ADMIN_PASSPHRASE
.github/
  workflows/deploy.yml         Build + deploy to GitHub Pages
  ISSUE_TEMPLATE/question-submission.yml   Manual question-suggestion form
docs/                          You are here
CLAUDE.md                      Terse project memory for AI agents
```

## The one big component

`src/QuestionBankApp.jsx` holds the top-level `QuestionBankApp` component plus
every sub-component and helper. Rough map (grep these symbols):

- **Constants/utilities** (top of file): `TYPE_META`, `TYPE_ORDER`, `DIFFS`,
  `STATUSES`, `SECTION_TEXT`, `PAPER_SIZES`, `PRINT_CSS`; storage helpers
  (`rawGet/rawSet/rawDel/jGet/jSet`), `uid`, `todayISO`, `blankQuestion`,
  `mulberry32`, `shuffleSeeded`, `buildDoc`, `buildSubmissionIssueUrl`.
- **`QuestionBankApp`** (the default export): all React state, persistence
  callbacks, the shared-bank/tests logic, and the render tree (header + folder
  **tabs** + modals + toast).
- **Tab components:** `BankTab`, `BuildTab`, `TestsTab`, `SuggestTab`,
  `SettingsTab` (which contains the **Shared bank** card and **Moderation**
  panel), and `PrintView` (full-screen, replaces the app while printing).
- **Modals:** `EditorModal` (used for both editing and `mode="suggest"`),
  `ImportModal`.

State lives in `QuestionBankApp` and flows down as props; children call back up
(`onSave`, `onFinalize`, `onDelete`, …). There is no Redux/Context store.

## The two modes

Toggled entirely by whether `src/supabaseConfig.js` is filled in
(`SHARED_BANK_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)`):

### File mode (keys blank)
- First visit with no local bank seeds from `public/seed-bank.json`.
- Returning visits additively pull **newly published** questions from the seed
  file (tracked in `bank:pubSeen`, cache-busted fetch) without clobbering local
  edits.
- "Publishing" = export `seed-bank.json` and commit it to `public/`.
- No login, no Supabase calls. See [SUBMISSIONS.md](./SUBMISSIONS.md) for how
  approved suggestions get published in this mode.

### Shared-bank mode (keys set — current)
- Teachers **sign in** (Supabase Auth) and Publish/Pull one live bank row.
- The file seed/auto-sync path is **disabled** (the seed only runs when
  `!sharedBankEnabled`).
- Saved **tests** sync to a separate `tests` table.
- See [SHARED-BANK.md](./SHARED-BANK.md) and [SHARED-TESTS.md](./SHARED-TESTS.md).

Rollback between modes is instant and lossless: blank the two values in
`supabaseConfig.js` to return everyone to file mode (local data untouched).

## Storage layer

A tiny abstraction at the top of `QuestionBankApp.jsx` with a three-tier
fallback, chosen once at load:

1. `window.storage` (the original Anthropic sandbox's async API), else
2. `window.localStorage` (the real deployment — persists per device/origin), else
3. an in-memory `Map` (last resort; lost on refresh — drives the "Storage isn't
   available" banner via `hasStorage`).

- `rawGet/rawSet/rawDel` move strings; `jGet/jSet` wrap them with JSON.
- Structured data uses **`bank:*`** keys; images use **`img:<id>`** raw keys
  (data URLs, which can be large). Full key list in [DATA-MODEL.md](./DATA-MODEL.md).

## Data flow

```
                       ┌─────────────────────────── browser ───────────────────────────┐
  public/seed-bank.json│  React state (questions, groups, settings, tests, submissions) │
        (file mode) ──▶│        ▲  │                                                     │
                       │   load │  │ save (jSet)                                         │
                       │        │  ▼                                                     │
                       │   localStorage:  bank:questions / bank:groups / bank:settings   │
                       │                  bank:tests / bank:submissions / img:<id> / …   │
                       └────────▲───────────────────────────────────────────▲───────────┘
                                │ fetchBank / publishBank                    │ listTests /
                                │ (one row id='main', revision)              │ upsertTest / deleteTest
                       ┌────────┴───────────────┐                  ┌─────────┴──────────────┐
                       │  Supabase: public.bank │                  │  Supabase: public.tests│
                       │  (shared question bank)│                  │  (shared saved tests)  │
                       └────────────────────────┘                  └────────────────────────┘
                          shared-bank mode only                       shared-bank mode only
```

Submissions take a different path: they're stored locally **and** open a
pre-filled **GitHub issue** for the maintainer (see [SUBMISSIONS.md](./SUBMISSIONS.md)).

## Render & print pipeline

`Bank` (browse/edit) → `Build a test` (`BuildTab`: pick questions + options) →
`finalizeTest` (stamps `lastUsed`, saves the test record, mirrors to the `tests`
table if signed in) → `PrintView` renders the document via `buildDoc` with
deterministic seeded shuffling, and prints or downloads standalone HTML. Full
detail in [PRINTING.md](./PRINTING.md).

## Deploy

Push to `main` → `.github/workflows/deploy.yml` runs `npm install && npm run
build` and publishes `dist/` to GitHub Pages (Node 20, `actions/deploy-pages`).
The Vite `base` must equal the repo name (`/TestBank/`) or assets 404. Develop on
a feature branch and merge to `main` to release. See [OPERATIONS.md](./OPERATIONS.md).
