# Shared question bank (Supabase)

How the live, multi-teacher **question** bank works. For the saved-tests table see
[SHARED-TESTS.md](./SHARED-TESTS.md); for the SQL/verification runbook see
[SUPABASE-SETUP.md](./SUPABASE-SETUP.md).

## Goal & trust model

A few **trusted teachers** edit one shared bank instead of passing JSON files
around. Students never use the app. Therefore:

- Auth is **email + password** (Supabase Auth). **Sign-ups are off**; teacher
  accounts are created by hand in the dashboard.
- Row-level security (RLS) grants read/write to the **`authenticated`** role only.
  Anonymous visitors (the publishable key alone) can read and write **nothing**.
- The publishable ("anon") key in `src/supabaseConfig.js` is public by design —
  it identifies the project, it does not grant access. Access is gated by RLS +
  login. (Never put the `service_role` key in the repo.)

## Turning it on/off

`src/supabaseConfig.js`:

```js
export const SUPABASE_URL = "https://<project>.supabase.co"; // blank = file mode
export const SUPABASE_ANON_KEY = "sb_publishable_…";          // blank = file mode
export const SHARED_BANK_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
```

`SHARED_BANK_ENABLED` gates everything. Blank both values → instant, lossless
return to file mode (local data untouched). This is the rollback switch.

## Backend schema

One table, **one row**. The entire bank lives in that row's `data` jsonb.

```sql
-- public.bank  (reference schema — already created in the project)
create table public.bank (
  id         text primary key,                    -- always 'main'
  data       jsonb       not null default '{}'::jsonb,
  revision   integer     not null default 0,      -- optimistic-concurrency counter
  updated_at timestamptz not null default now(),
  updated_by text                                 -- email of last publisher
);
alter table public.bank enable row level security;
create policy "bank read"   on public.bank for select to authenticated using (true);
create policy "bank update" on public.bank for update to authenticated using (true) with check (true);
```

- `data` holds `{ questions, groups, images, courses }` — the same shapes as the
  local bank (see [DATA-MODEL.md](./DATA-MODEL.md)).
- There is **no INSERT policy** and the app never inserts. The single
  `id='main'` row is seeded once by hand (see the gotcha below).

⚠️ **The `id='main'` row must already exist at `revision 0`.** `publishBank` only
ever **UPDATE**s; with no row, the first Publish updates 0 rows and is reported as
a (misleading) conflict, so the bank can never be seeded. Seed it once:
```sql
insert into public.bank (id, data, revision) values ('main', '{}'::jsonb, 0)
  on conflict (id) do nothing;
```

## The code layer — `src/sharedBank.js`

The Supabase SDK is **lazy-loaded** (`import("@supabase/supabase-js")` inside
`getClient`) so the main bundle stays small and the network is only touched once
the shared bank is actually used.

| Export | Purpose |
| --- | --- |
| `sharedBankEnabled` | Re-export of `SHARED_BANK_ENABLED` |
| `getSession()` | Current Supabase session or `null` |
| `onAuthChange(cb)` | Subscribe to sign-in/out; resolves to an unsubscribe fn |
| `signIn(email, pw)` / `signOut()` | Password auth |
| `fetchBank()` | Reads row `main` → `{ data, revision, updatedAt, updatedBy }` |
| `publishBank(data, expectedRevision, updatedBy)` | Optimistic UPDATE → `{ revision }`, or throws `code:"conflict"` |

`publishBank` writes **only when the row is still at `expectedRevision`**:

```js
update({ data, revision: expectedRevision + 1, updated_at, updated_by })
  .eq("id", "main").eq("revision", expectedRevision)
```

If someone else published in the meantime, 0 rows match → it throws a conflict so
no one silently clobbers another teacher's save.

## App wiring — `QuestionBankApp.jsx`

- **Sign in/out:** `SettingsTab` → **Shared bank** card → `sharedSignIn` /
  `sharedSignOut`. A session is restored on load (`getSession` + `onAuthChange`).
- **Pull (auto on sign-in, and the "Pull latest" button):** `pullShared` →
  `fetchBank` → `applyBank`. `applyBank` writes incoming images, then replaces
  local questions/groups and merges courses, persisting each. Before overwriting
  non-empty local data it stashes `bank:localBackup`.
- **Publish:** `publishShared` → `buildBankPayload` (assembles
  `{questions, groups, images, courses}`, dropping `lastUsed` and only including
  images actually referenced) → `publishBank(payload, sharedRevRef.current, email)`
  → updates `sharedRevRef` + the "rev N · updated … by …" indicator.
- `sharedRevRef` tracks the revision the client last saw; conflicts surface the
  "Someone else published since you loaded. Reload and reapply." message.

> Saved **tests do not ride in the bank row** — they have their own table so a
> test save never republishes the whole bank. See [SHARED-TESTS.md](./SHARED-TESTS.md).

## First-run migration

CLAUDE.md's "migration": the first teacher signs in (local bank intact), clicks
**Publish** → the empty `main` row (rev 0) becomes the real bank at **rev 1**;
everyone else pulls it on reload. Because a Pull can replace local data, a
recoverable copy is stashed to `bank:localBackup` first.

## File mode vs shared mode (behavioral diff)

| | File mode (keys blank) | Shared mode (keys set) |
| --- | --- | --- |
| Seed source | `public/seed-bank.json` on first visit | Supabase `bank` row on sign-in |
| Auto-sync on reload | Additive pull of newly published questions (`bank:pubSeen`) | Pull replaces/merges from the shared row |
| Publishing | Commit `seed-bank.json` to `public/` | **Publish** button (any signed-in teacher) |
| Login | none | required to read or write |

The file-mode seed code is explicitly skipped when `sharedBankEnabled`.

## Verifying & operating

SQL, teacher-account creation, the egress note, the `curl` infra checks (with
expected outputs), and rollback all live in [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).
Operational troubleshooting is in [OPERATIONS.md](./OPERATIONS.md).
