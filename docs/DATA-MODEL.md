# Data model

Exact shapes of every entity, every browser-storage key, and every import/export
JSON format. Source of truth: `blankQuestion()` and the storage helpers in
`src/QuestionBankApp.jsx`, and `src/sharedBank.js`.

## Conventions

- **IDs** come from `uid(prefix)` → `"<prefix>_<base36 time><random>"`, e.g.
  `q_mq9x4nl3pmp0q`. Prefixes: `q` (question), `grp` (group), `t` (test),
  `sub` (submission).
- **Dates**: `todayISO()` gives a `YYYY-MM-DD` day string (used for `createdAt`,
  `lastUsed`); `new Date().toISOString()` (full timestamp) is used for
  `exportedAt`, `submittedAt`, and Supabase `updated_at`.
- **Rich text**: question/answer text supports `^{...}` superscript and `_{...}`
  subscript, rendered by `renderRich`. The editor offers a `SYMBOLS` palette
  (²³°πΔθλΩμ±×÷·≤≥≠≈→√¼½¾αβ).

## Enumerations (constants near the top of `QuestionBankApp.jsx`)

| Constant | Values |
| --- | --- |
| `TYPE_ORDER` / `TYPE_META` keys | `mc` (Multiple choice / MC), `numeric` (Numeric response / NR), `tf` (True / False), `matching` (Matching / MATCH), `written` (Written response / WR) |
| `DIFFS` | `easy`, `medium`, `hard` |
| `STATUSES` | `polished` (Polished), `revise` (Needs revision), `retired` (Retired) |
| `PAPER_SIZES` keys | `letter` (8.5×11"), `legal` (8.5×14"), `a4` (210×297mm) |

> The Bank-tab filter also offers a pseudo-status **`active`**, which means "not
> retired" — it is a filter convenience, not a stored value. Stored `status` is
> always one of `STATUSES`.

## Entity: Question

Factory: `blankQuestion(defaults)`. Every question always carries **all five**
type-specific sub-objects (`mc/num/tf/match/wr`); only the one matching `type` is
used, but the others stay present (and are exported) so switching type loses
nothing.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string | `uid("q")` | Unique id |
| `type` | enum | `"mc"` | One of `TYPE_ORDER` |
| `text` | string | `""` | The stem/prompt (supports `^{}`/`_{}`) |
| `imageId` | string·null | `null` | Key into `img:<id>` storage for a diagram |
| `imageCaption` | string | `""` | Caption under the image |
| `imageNote` | string | `""` | Describes a missing diagram (when `imageId` is null) |
| `groupId` | string·null | `null` | Links to a shared stimulus group (see below) |
| `table` | object·null | `null` | Inline data table `{ headers:[], rows:[[]], caption:"" }` |
| `course` | string | `""` | Course code, e.g. `Science 9` |
| `unit` | string | `""` | Unit/topic within the course |
| `tags` | string[] | `[]` | Free-text search tags |
| `difficulty` | enum | `"medium"` | One of `DIFFS` |
| `points` | number | `1` | Marks (currently normalized to 1 on save) |
| `outcome` | string | `""` | Curriculum outcome code |
| `source` | string | `""` | Provenance (`"Sample"`, an old test name, …) |
| `status` | enum | `"polished"` | One of `STATUSES` |
| `notes` | string | `""` | Private annotations (not printed) |
| `lastUsed` | string·null | `null` | `YYYY-MM-DD` a test last used it (stamped by `finalizeTest`) |
| `createdAt` | string | `todayISO()` | `YYYY-MM-DD` created |

Type-specific sub-objects:

| `type` | Field | Shape |
| --- | --- | --- |
| `mc` | `mc` | `{ options: string[4], correct: number }` — `correct` is the 0-based index |
| `numeric` | `num` | `{ answer: string, units: string, tolerance: string }` |
| `tf` | `tf` | `{ answer: boolean }` |
| `matching` | `match` | `{ pairs: [{ left: string, right: string }, …] }` (≥2 pairs; right column shuffled per test) |
| `written` | `wr` | `{ lines: number, rubric: string }` — `lines` = blank answer lines; `rubric` shows on the key |

## Entity: Group (question-set / shared stimulus)

Stored as a **map** `{ [groupId]: group }` (key `bank:groups`). A group is a
shared stimulus (passage, figure, or table) that several questions reference via
their `groupId`; on a printed test, consecutive same-group questions render
together under the stimulus.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `uid("grp")` |
| `label` | string | Optional title for the stimulus |
| `text` | string | Shared stimulus text |
| `imageId` | string·null | Shared stimulus image (key into `img:<id>`) |
| `imageNote` | string | Describes a missing stimulus image |
| `table` | object·null | Shared data table (same shape as `question.table`) |

## Entity: Settings (key `bank:settings`)

```js
{ teacher: string, school: string, courses: string[] }
```

`courses` is auto-populated from question `course` values (via `upsertQuestion`)
and can be edited in Settings. `teacher`/`school` print on test headers.

## Entity: Test (saved test)

Built in `BuildTab`, persisted by `finalizeTest` (key `bank:tests`, an array).
See [PRINTING.md](./PRINTING.md) for how each field affects the printout.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `uid("t")` (stable across edits) |
| `title` | string | Test name on the header |
| `courseLabel` | string | Course printed on the header |
| `teacher` | string | Teacher printed on the header |
| `dateLabel` | string | Date line on the header |
| `instructions` | string | Printed under the header |
| `questionIds` | string[] | Question ids, in chosen order (references the bank) |
| `seed` | number | RNG seed → reproducible shuffles (generated once) |
| `twoVersions` | boolean | Generate an A **and** B variant |
| `shuffleMC` | boolean | Shuffle MC option order (seeded) |
| `shuffleOrder` | boolean | Reorder questions in version B (within type sections) |
| `optimize` | boolean | Reflow within sections to minimize pages |
| `paper` | enum | One of `PAPER_SIZES` |
| `createdAt` | string | `YYYY-MM-DD` first saved |
| `ownerEmail` | string·null | **Shared mode**: email of the teacher who saved it |
| `ownerId` | string·null | **Shared mode**: Supabase user id (added by `listTests`) |
| `updatedAt` | string | **Shared mode**: last-saved timestamp (from the `tests` row) |

⚠️ `layoutMode` (`standard`/`ab`/`opt-a`/`opt-ab`) is **UI-only** state in
`BuildTab`; it is decomposed into the stored `twoVersions` + `optimize` booleans
and not itself persisted.

## Entity: Submission (key `bank:submissions`, an array)

A locally-recorded question suggestion (also opens a GitHub issue — see
[SUBMISSIONS.md](./SUBMISSIONS.md)).

```js
{
  id: "sub_…",
  submittedAt: ISOstring,
  submitter: string,                       // optional name, trimmed
  status: "pending" | "approved" | "rejected",
  question: { …full Question… },
}
```

Approving (`approveSubmission`) re-creates the question fresh (`uid("q")`,
`status:"polished"`) into the bank and flips the submission to `approved`.

## Browser-storage keys

All under the storage layer described in [ARCHITECTURE.md](./ARCHITECTURE.md)
(`window.storage` → `localStorage` → memory).

| Key | Type | Contents |
| --- | --- | --- |
| `bank:questions` | JSON array | All questions |
| `bank:groups` | JSON map | Groups by id |
| `bank:settings` | JSON object | `{ teacher, school, courses }` |
| `bank:tests` | JSON array | Saved tests (mirrors the `tests` table in shared mode) |
| `bank:submissions` | JSON array | Local suggestion records |
| `bank:pubSeen` | JSON array | Question ids already seen from the file-mode seed (prevents re-importing) |
| `bank:localBackup` | JSON object | `{ questions, groups, savedAt }` — stashed before a shared Pull/sign-out overwrites local data |
| `img:<id>` | raw string | One image as a (usually JPEG) data URL; can be large |

## Import / export JSON formats

All three are produced by `QuestionBankApp.jsx` and consumed by `doImport`.
Common envelope: `{ app:"question-bank", version:1, exportedAt, … }`.

### Full backup — `question-bank-backup-YYYY-MM-DD.json`
Everything needed to restore one teacher's app:
```js
{ app:"question-bank", version:1, exportedAt,
  settings:{ teacher, school, courses },
  questions:[…], groups:{…}, images:{ [imageId]: dataURL },
  tests:[…] }              // tests appear ONLY in the full backup
```

### Published seed bank — `public/seed-bank.json`
The file-mode public library. Same as a full backup **without `tests`** and with
`settings` reduced to just `courses`:
```js
{ app:"question-bank", version:1, exportedAt,
  settings:{ courses:[…] },
  questions:[…], groups:{…}, images:{…} }
```

### Single test — `test-<title>-YYYY-MM-DD.json`
A self-contained test bundled with exactly the questions/groups/images it uses:
```js
{ app:"question-bank", version:1, kind:"test", exportedAt,
  settings:{ courses:[…] },
  questions:[…], groups:{…}, images:{…},
  tests:[ <the one test> ] }
```

Import is tolerant: a bare JSON **array** of questions is accepted too, and a
full backup re-creates groups/tests with fresh ids while re-linking
`questionIds` (see `doImport`).

## Supabase shapes (shared mode)

See [SHARED-BANK.md](./SHARED-BANK.md) / [SHARED-TESTS.md](./SHARED-TESTS.md).

- **`bank` row** (`fetchBank`): `{ data:{ questions, groups, images, courses },
  revision, updatedAt, updatedBy }` — the whole bank in one row's `data` jsonb.
- **`tests` row** (`listTests` maps to): the stored test record spread, plus
  `ownerId`, `ownerEmail`, `updatedAt` from the row's columns.
