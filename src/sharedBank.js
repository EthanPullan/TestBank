// ---------------------------------------------------------------------------
// Shared question bank backed by Supabase.
//
// The whole bank lives in a single row (id = 'main') of the `bank` table as
// JSON: { questions, groups, images, courses }. Teachers sign in to read and
// publish it; with no project configured the app stays in local/file mode.
//
// The Supabase SDK is loaded on demand so the main bundle stays small (and the
// network is only touched) when the shared bank is actually switched on.
// ---------------------------------------------------------------------------

import { SUPABASE_URL, SUPABASE_ANON_KEY, SHARED_BANK_ENABLED } from "./supabaseConfig";

export const sharedBankEnabled = SHARED_BANK_ENABLED;

const ROW_ID = "main";

let clientPromise = null;
function getClient() {
  if (!SHARED_BANK_ENABLED) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    );
  }
  return clientPromise;
}

/* ---- auth ---- */

export async function getSession() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session || null;
}

// Subscribe to sign-in/sign-out. Returns a promise resolving to an unsubscribe fn.
export async function onAuthChange(cb) {
  const c = await getClient();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const c = await getClient();
  if (!c) throw new Error("Shared bank is not configured.");
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const c = await getClient();
  if (c) await c.auth.signOut();
}

/* ---- bank read / write ---- */

// Returns { data, revision, updatedAt, updatedBy } or null if not configured.
export async function fetchBank() {
  const c = await getClient();
  if (!c) return null;
  const { data, error } = await c
    .from("bank")
    .select("data,revision,updated_at,updated_by")
    .eq("id", ROW_ID)
    .single();
  if (error) throw error;
  return {
    data: data.data || {},
    revision: data.revision || 0,
    updatedAt: data.updated_at || null,
    updatedBy: data.updated_by || null,
  };
}

// Optimistic-concurrency publish: only writes when the row is still at
// expectedRevision, so a teacher never silently overwrites someone else's save.
// Resolves to { revision }; throws an Error with code "conflict" on a mismatch.
export async function publishBank(bankData, expectedRevision, updatedBy) {
  const c = await getClient();
  if (!c) throw new Error("Shared bank is not configured.");
  const nextRevision = (expectedRevision || 0) + 1;
  const { data, error } = await c
    .from("bank")
    .update({
      data: bankData,
      revision: nextRevision,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || null,
    })
    .eq("id", ROW_ID)
    .eq("revision", expectedRevision)
    .select("revision")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const conflict = new Error("Someone else published since you loaded. Reload and reapply your changes.");
    conflict.code = "conflict";
    throw conflict;
  }
  return { revision: data.revision };
}

/* ---- saved tests (separate `tests` table, one row per test) ----
   Shared across teachers — RLS lets any signed-in teacher read every row, but
   only the owner can update or delete their own. Kept out of the bank row so a
   save is a single instant write, independent of the bank's publish/revision
   flow. */

// True when the `tests` table isn't set up yet, so callers can degrade to
// local-only quietly instead of nagging before the migration SQL is run.
export function isMissingTableError(e) {
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message || "") + " " + (e.details || "");
  return /could not find the table|relation .*tests.* does not exist/i.test(msg);
}

// Every shared test, newest first. Each item is the stored test record plus
// ownerId / ownerEmail / updatedAt read off its row.
export async function listTests() {
  const c = await getClient();
  if (!c) return [];
  const { data, error } = await c
    .from("tests")
    .select("id,data,owner,owner_email,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...(r.data || {}),
    id: r.id,
    ownerId: r.owner || null,
    ownerEmail: r.owner_email || null,
    updatedAt: r.updated_at || null,
  }));
}

// Insert or update one test row. RLS only permits writing rows you own (owner
// defaults to auth.uid() on insert), so editing someone else's test errors —
// callers should duplicate those instead.
export async function upsertTest(rec, ownerEmail) {
  const c = await getClient();
  if (!c) throw new Error("Shared bank is not configured.");
  const { error } = await c.from("tests").upsert({
    id: rec.id,
    data: rec,
    title: rec.title || null,
    owner_email: ownerEmail || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// Delete one test row (RLS: only the owner can).
export async function deleteTest(id) {
  const c = await getClient();
  if (!c) throw new Error("Shared bank is not configured.");
  const { error } = await c.from("tests").delete().eq("id", id);
  if (error) throw error;
}
