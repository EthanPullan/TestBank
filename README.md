# Question Bank

A teacher's filing cabinet for test questions — write, tag, and store questions,
then assemble and print/export polished tests and answer keys. Runs entirely in
the browser and is deployed as a static site on **GitHub Pages**.

**Live site:** https://EthanPullan.github.io/TestBank/

- Write multiple-choice, numeric, true/false, matching, and written-response questions
- Filter/search the bank; build tests with shuffling, two versions, and a layout optimizer
- Print or download tests + answer keys as standalone HTML
- Import questions from old tests (paste JSON Claude extracts) and back everything up
- **Suggest a question:** visitors can propose questions that a maintainer approves
- **Shared bank (optional):** a few trusted teachers sign in to one live,
  Supabase-backed bank and Publish/Pull questions and saved tests together

Your bank is stored in the browser's `localStorage`, so it persists between visits
on the same device. Use **Bank → Back up** to export everything to a file. When the
shared bank is configured (`src/supabaseConfig.js`), signed-in teachers also sync to
a Supabase project.

## Documentation

Full reference docs live in [`docs/`](./docs/):

- [Architecture](./docs/ARCHITECTURE.md) · [Data model](./docs/DATA-MODEL.md)
- [Shared question bank](./docs/SHARED-BANK.md) · [Shared saved tests](./docs/SHARED-TESTS.md) · [Supabase setup & runbook](./docs/SUPABASE-SETUP.md)
- [Suggestions & moderation](./docs/SUBMISSIONS.md) · [Building & printing tests](./docs/PRINTING.md) · [Operations & troubleshooting](./docs/OPERATIONS.md)

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

The Vite `base` is set to `/TestBank/` (the repo name) in `vite.config.js` so asset
paths resolve correctly on GitHub Pages. If you rename the repo, update `base` and
the values in `src/config.js`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and
publishes `dist/` to GitHub Pages. The first run enables Pages automatically
(`actions/configure-pages` with `enablement: true`); if your org disallows that,
enable Pages once under **Settings → Pages → Build and deployment → GitHub Actions**.

## Submitting questions (pending approval)

Because the site is static (no server), submissions flow through **GitHub issues**:

1. A visitor opens the **Suggest a question** tab, writes a question, and submits.
2. The app opens a pre-filled GitHub issue (labelled `question-submission`) that
   contains a readable summary **and** a JSON block. The visitor presses
   *Submit new issue*. A free GitHub account is required to file it.
3. The maintainer reviews issues and approves a suggestion in one of two ways:
   - **Settings → Moderation** → paste the issue's JSON block → *Approve pasted question(s)*, or
   - any locally-submitted suggestion can be approved/rejected directly in the queue.
4. Approving adds the question to the maintainer's bank. To **publish it to every
   visitor**, use **Settings → Published bank → Export `seed-bank.json`** and commit
   the file to `public/seed-bank.json` (a full backup — questions, diagrams, and
   question-sets). New visitors are seeded from it, and returning visitors can pull
   updates with *Sync published questions*. (A questions-only `public/seed-questions.json`
   is also accepted as a fallback.)

### Moderation access

The moderation queue is hidden behind a passphrase (`ADMIN_PASSPHRASE` in
`src/config.js`, default `approve`). Open the site with `?admin=1` to reveal the
unlock box quickly. This only hides the approve/reject controls from casual
visitors — approving only changes the maintainer's own browser copy until the seed
file is committed — so treat it as convenience, not security. Change the passphrase
and redeploy to rotate it.

### Repository setup

- Create a `question-submission` label so submission issues are grouped and the
  issue form can apply it.
- `.github/ISSUE_TEMPLATE/question-submission.yml` provides a manual fallback form
  for people who'd rather not use the in-app composer.

## Project layout

```
index.html                 Vite entry
src/main.jsx               Mounts the app
src/QuestionBankApp.jsx    The whole application
src/config.js              Repo owner/name, submission label, moderation passphrase
src/sharedBank.js          Supabase layer (auth, shared bank row, tests table)
src/supabaseConfig.js      Supabase URL + publishable key (blank = file mode)
src/index.css              Tailwind entry
public/seed-bank.json      The published bank everyone sees on first visit (full backup)
.github/workflows/deploy.yml                      Build + deploy to GitHub Pages
.github/ISSUE_TEMPLATE/question-submission.yml    Manual submission form
docs/                      Full reference documentation
CLAUDE.md                  Terse project memory for AI agents
```
