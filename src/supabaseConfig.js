// ---------------------------------------------------------------------------
// Supabase project configuration for the shared question bank.
//
// These two values are PUBLIC and safe to ship in a static site — write access
// is controlled by row-level security + teacher logins, not by hiding the key.
// (Never put the project's `service_role` key here; that one is an admin secret.)
//
// Leave both blank to keep the app in local/file mode (the current behaviour).
// Fill them in — Project Settings -> API -> Project URL and the `anon` `public`
// key — to switch every teacher over to the one shared, live bank.
// ---------------------------------------------------------------------------

export const SUPABASE_URL = "https://fjnnregdvlosbpmykbwm.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_uytMtdzl_TK68tnDJxSqqQ_2CcCBxtz";

// True once both values are present; the rest of the app keys off this.
export const SHARED_BANK_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
