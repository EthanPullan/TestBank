# Supabase setup & runbook

Everything operational about the backend: project config, the SQL migrations,
creating teacher accounts, the sandbox egress note, the verification checks (with
real expected outputs), and rollback. Architecture is in
[SHARED-BANK.md](./SHARED-BANK.md) / [SHARED-TESTS.md](./SHARED-TESTS.md).

## Project & app config

- Supabase project ref (current): **`fjnnregdvlosbpmykbwm`** →
  `https://fjnnregdvlosbpmykbwm.supabase.co`.
- `src/supabaseConfig.js` holds `SUPABASE_URL` + the **publishable** key. Both are
  public by design (access is gated by RLS + login). **Never** commit the
  `service_role` key.
- `SHARED_BANK_ENABLED` is `true` whenever both values are set.

## Migrations (run once each, in the SQL editor)

Dashboard → **SQL Editor** → paste → Run. SQL editor runs as a privileged role
and bypasses RLS.

### 1. `bank` table (shared question bank)
```sql
create table public.bank (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  revision   integer     not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.bank enable row level security;
create policy "bank read"   on public.bank for select to authenticated using (true);
create policy "bank update" on public.bank for update to authenticated using (true) with check (true);

-- ⚠️ REQUIRED seed row — publishBank only UPDATEs, so 'main' must exist at rev 0
insert into public.bank (id, data, revision) values ('main', '{}'::jsonb, 0)
  on conflict (id) do nothing;
```

### 2. `tests` table (shared saved tests)
```sql
create table public.tests (
  id          text primary key,
  data        jsonb not null,
  title       text,
  owner       uuid  not null default auth.uid(),
  owner_email text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.tests enable row level security;
create policy "tests read"   on public.tests for select to authenticated using (true);
create policy "tests insert" on public.tests for insert to authenticated with check (owner = auth.uid());
create policy "tests update" on public.tests for update to authenticated using (owner = auth.uid());
create policy "tests delete" on public.tests for delete to authenticated using (owner = auth.uid());
```
No seed row needed. For **private-per-teacher** tests, change the read policy to
`using (owner = auth.uid())`.

## Creating teacher accounts

Sign-ups are **off**, so add teachers by hand: Dashboard → **Authentication →
Users → Add user → Create new user** → email + password → **check "Auto Confirm
User"** (an unconfirmed user can't sign in with a password). The app's
sign-in form is in Settings → **Shared bank**.

- There is no separate "username" — login is the email + password you set here.
- Passwords are stored hashed and can't be read back; reset from this page.
- Auth deliberately returns the same "Invalid login credentials" for both
  wrong-password and unknown-email (no user enumeration).

## Sandbox egress note ⚠️

In a restricted sandbox/CI, outbound traffic is governed by an egress allowlist.
Project traffic is on the **`fjnnregdvlosbpmykbwm.supabase.co`** subdomain, so the
allowlist entry must be a wildcard **`*.supabase.co`** (not the bare apex). A
mid-session allowlist change only takes effect in a **new** session.

## Verification (anon `curl` checks)

Run anytime egress allows `*.supabase.co`. These use only the public key (no
login), so they prove the **anon/locked-out** posture. Expected results below are
the real ones observed on 2026-06-16.

```bash
URL=https://fjnnregdvlosbpmykbwm.supabase.co
KEY=sb_publishable_uytMtdzl_TK68tnDJxSqqQ_2CcCBxtz

# Auth reachable?            → 200
curl -s -w '\n%{http_code}\n' "$URL/auth/v1/health" -H "apikey: $KEY"

# Anon read of bank/tests    → []  (RLS hides rows; table exists & is exposed —
#                                   a MISSING table returns 404 PGRST205, not [])
curl -s -w '\n%{http_code}\n' "$URL/rest/v1/bank?select=id,revision"  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s -w '\n%{http_code}\n' "$URL/rest/v1/tests?select=id"          -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# Anon insert                → 401, "new row violates row-level security policy"
curl -s -X POST "$URL/rest/v1/tests" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"id":"x","data":{},"title":"x"}' -w '\n%{http_code}\n'

# Bogus sign-in              → 400, invalid_credentials
curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" \
  -H "Content-Type: application/json" -d '{"email":"nobody@example.com","password":"x"}' -w '\n%{http_code}\n'
```

| Check | Healthy result |
| --- | --- |
| `auth/v1/health` | `200` `{"name":"GoTrue",…}` |
| anon read `bank` / `tests` | `[]` · `200` (rows hidden by RLS) |
| anon read a **missing** table | `404` `{"code":"PGRST205","message":"Could not find the table …"}` |
| anon insert | `401` `{"code":"42501",…"violates row-level security policy"}` |
| bogus sign-in | `400` `{"error_code":"invalid_credentials"}` |

The **signed-in** Publish/Pull and test save/load can't be done with only the
anon key (sign-ups off, no credential in the repo). Verify in-browser, or with a
throwaway teacher login. A correctly-seeded, never-published bank shows
`revision 0`; the first Publish takes it to **rev 1** with your email in
`updated_by`.

Quick owner-side health check (SQL editor, bypasses RLS):
```sql
select id, revision, updated_at, updated_by, jsonb_typeof(data) from public.bank;   -- expect one row: main / 0 / object
select count(*) from public.tests;
```

## Rollback

Blank `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `src/supabaseConfig.js` and
redeploy → every teacher returns to **file mode** instantly. Local data is
untouched; the Supabase rows remain and reconnect if you restore the keys. This
is the safe panic switch if anything backend-side misbehaves.
