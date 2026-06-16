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
