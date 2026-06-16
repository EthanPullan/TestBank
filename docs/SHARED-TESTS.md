# Shared saved tests (Supabase)

How built/saved **tests** persist to the shared backend so they survive across
devices and are visible to the whole team. Companion to
[SHARED-BANK.md](./SHARED-BANK.md); SQL/verification in
[SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

## Why a separate table (not the bank row)

A test is a small JSON record that references questions by id (`questionIds`) — it
embeds **no images** (those come from the referenced questions already in the bank
row). Tests are created often. So instead of folding them into the single `bank`
row (which would mean republishing the whole bank, and fighting its revision
counter, every time you save a test), each test is **one row in a `tests` table**:

- A save is a **single instant write**, independent of the bank's Publish/revision
  flow — no whole-bank republish, no concurrency conflict with question edits.
- Natural **per-test ownership** and attribution.
- Either shared-to-all or private-per-teacher by flipping **one** RLS line.

## Backend schema

```sql
create table public.tests (
  id          text primary key,
  data        jsonb not null,                 -- the full test record (see DATA-MODEL)
  title       text,
  owner       uuid  not null default auth.uid(),
  owner_email text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.tests enable row level security;
create policy "tests read"   on public.tests for select to authenticated using (true);                    -- everyone sees all
create policy "tests insert" on public.tests for insert to authenticated with check (owner = auth.uid());  -- own rows only
create policy "tests update" on public.tests for update to authenticated using (owner = auth.uid());
create policy "tests delete" on public.tests for delete to authenticated using (owner = auth.uid());
```

**Ownership model:** `owner` defaults to `auth.uid()` on insert; only the owner
can update/delete. The `read` policy `using (true)` makes it **shared** — every
signed-in teacher sees every test. To make it **private-per-teacher** instead,
change that one policy to `using (owner = auth.uid())`. No seed row is needed
(these are plain inserts — unlike the `bank` row).

## The code layer — `src/sharedBank.js`

| Export | Purpose |
| --- | --- |
| `listTests()` | All rows, newest first; maps each to the stored record **plus** `ownerId`, `ownerEmail`, `updatedAt` |
| `upsertTest(rec, ownerEmail)` | Insert/update one row (`id, data, title, owner_email, updated_at`); RLS blocks writing others' rows |
| `deleteTest(id)` | Delete one row (RLS: owner only) |
| `isMissingTableError(e)` | True for "table not set up yet" (`42P01` / `PGRST205` / "could not find the table") so callers can degrade quietly |

`upsert` omits `owner`, so the DB default (`auth.uid()`) fills it on insert and it
is left unchanged on update — RLS guarantees you can only write your own rows.

## App wiring — `QuestionBankApp.jsx`

- **Load:** `pullTests` runs on sign-in (and via **Pull latest**, which calls
  `pullEverything` = `pullShared` + `pullTests`). It fetches remote tests and
  **merges** them with any local-only ones (remote wins for rows on both sides),
  reading the canonical local copy from `bank:tests` to avoid a load race.
- **Save:** `finalizeTest` saves locally, then — if signed in — stamps the record
  with `ownerEmail` and best-effort `upsertTest`s it, then re-pulls. A failure
  (other than "table missing") warns but never blocks the local save/print.
- **Delete:** `TestsTab`'s delete removes locally and best-effort `deleteTest`s.
- **Graceful degradation:** every DB call is wrapped; `isMissingTableError`
  suppresses noise before the table exists, so the app behaves exactly like the
  pre-feature version until the migration SQL is run.

## UI — the Saved tests tab (`TestsTab`)

When signed in:

- A **Mine / Everyone** toggle (defaults to **Mine**). "Mine" = tests you own
  (`ownerEmail === your email`, or unattributed local ones).
- Each card shows **"· by you"** or **"· by &lt;email&gt;"** when attributed.
- **Owner-only Edit and Delete.** Other teachers' tests show **Duplicate**
  instead (loads a copy with a fresh id + "(copy)" title, so finalizing creates a
  new test **you** own). Open (print) and Export are available to everyone.

Signed out / file mode: no toggle, all local tests are treated as yours
(full local control), and no DB calls are made.

## One-time "push my local tests" migration

On the first pull after sign-in, any **local-only** tests (made before the
feature existed, or never pushed) trigger a one-time top-of-screen prompt:
*"Push N local tests to the shared bank?"* (`migrateTests` state →
`pushLocalTests`). Push stamps each with your email, `upsertTest`s them, and
re-pulls. "Not now" dismisses for the session.

## Referential integrity (intentionally loose)

Tests store `questionIds`; the questions live in the `bank` row. There is **no
foreign key** — by design:

- The editor drops ids no longer in the bank (with a warning), and `buildDoc`
  filters missing questions and reports a count. A shared test that points at a
  question a colleague later deleted still opens, minus that question.
- This keeps tests decoupled from bank-publish timing. The Saved tests card shows
  a live `live/total` question count so drift is visible.

## Contrast with the bank row

| | `bank` row | `tests` table |
| --- | --- | --- |
| Rows | exactly one (`id='main'`) | one per test |
| Concurrency | `revision` optimistic counter | none needed (per-row, owner-scoped) |
| Write trigger | manual **Publish** (whole bank) | automatic on **save** (one test) |
| Seed row required | **yes** (⚠️) | no |
| Sharing | all-or-nothing | per-row, owner-attributed |
