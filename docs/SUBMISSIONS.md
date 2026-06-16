# Question suggestions & moderation

How outside contributors propose questions and how a maintainer approves them.
This subsystem predates the Supabase backend and works in **both** modes.

## The shape of it

Because the site is static (no server), suggestions flow through **GitHub
issues**. The in-app form pre-fills an issue (including a machine-readable JSON
block); the maintainer reviews and approves it; approval adds the question to
their bank; publishing it to everyone uses the normal bank-publish path.

```
Visitor → "Suggest a question" form → submitQuestion()
   ├─ saves a local record to bank:submissions  (status: "pending")
   └─ window.open( pre-filled GitHub issue, labelled "question-submission" )
                                   │  visitor presses "Submit new issue"
                                   ▼
Maintainer → reviews issues → approves via one of:
   • Settings → Moderation queue  (approve a locally-submitted suggestion), or
   • paste the issue's JSON block → Import  (approve from another device)
        └─ approveSubmission()/import → upsertQuestion()  (new id, status "polished")
                                   │
Publish to everyone:
   • shared mode: Settings → Shared bank → Publish
   • file mode:   Settings → export seed-bank.json → commit to public/
```

## Config — `src/config.js`

| Export | Value | Use |
| --- | --- | --- |
| `GITHUB_OWNER` | `"EthanPullan"` | Issue URL `https://github.com/<owner>/<repo>/issues/new?…` |
| `GITHUB_REPO` | `"TestBank"` | Issue URL |
| `SUBMISSION_LABEL` | `"question-submission"` | Applied to the issue (create this label in the repo) |
| `ADMIN_PASSPHRASE` | `"approve"` | Unlocks the in-app moderation queue |

If you rename/fork the repo, update these (and Vite's `base`).

## The "Suggest a question" flow

- **`SuggestTab`** collects an optional submitter name and calls `onCompose`,
  which opens **`EditorModal` in `mode="suggest"`** (same fields as the normal
  editor, but image upload is disabled).
- Submitting calls **`submitQuestion(q, submitter)`**, which:
  1. Prepends a record to `bank:submissions` (`{ id:uid("sub"), submittedAt,
     submitter, status:"pending", question }`).
  2. `window.open`s the URL from **`buildSubmissionIssueUrl(q, submitter)`** — a
     `…/issues/new?title=…&body=…&labels=question-submission` link whose body has
     a human summary **and** a collapsible `<details>` block containing
     `JSON.stringify([q], null, 2)` for one-click maintainer import.

> **Definitive:** the app **does** hand off to GitHub (it opens the new-issue
> page). It does **not** call any API or write to a server — filing the issue
> requires the visitor to press "Submit new issue" (a free GitHub account). The
> local `bank:submissions` copy is just so the submitter can see what they sent.

There is also a manual fallback issue form at
`.github/ISSUE_TEMPLATE/question-submission.yml` for people who'd rather not use
the in-app composer.

## Moderation queue

Lives in **Settings** (`ModerationPanel` inside `SettingsTab`). It is hidden
behind a passphrase:

- Unlock by entering `ADMIN_PASSPHRASE` (default `approve`), **or** open the site
  with **`?admin=1`** to reveal the unlock box quickly (`setAdmin(true)`).
- **Approve** (`approveSubmission`): re-creates the question fresh —
  `{ ...blankQuestion(), ...sub.question, id:uid("q"), createdAt:today,
  lastUsed:null, status:"polished" }` — via `upsertQuestion` (which also adds any
  new course), and flips the submission to `approved`.
- **Reject** (`rejectSubmission`): marks it `rejected`.
- **Clear reviewed** (`clearReviewedSubmissions`): drops all non-`pending`
  records.

Approving from a **different device** (e.g. the maintainer didn't receive the
local record): paste the issue's JSON block into the normal **Import** — it
files the question(s) the same way.

⚠️ **Security note (from `config.js`):** the passphrase only hides the controls
from casual visitors. Approving changes **only the maintainer's own browser copy**
until it's published (committed to `seed-bank.json` in file mode, or **Publish**ed
in shared mode). Treat it as convenience, not real security; rotate by changing
`ADMIN_PASSPHRASE` and redeploying.

## Publishing approved questions

Approval is local. To make an approved question visible to everyone:

- **Shared-bank mode (current):** Settings → Shared bank → **Publish**
  (see [SHARED-BANK.md](./SHARED-BANK.md)).
- **File mode:** Settings → export **`seed-bank.json`** → commit it to `public/`.
  New visitors seed from it; returning visitors additively pull new questions.
