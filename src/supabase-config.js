// Supabase project coordinates. Both values are deliberately public: the
// publishable key can only do what Row Level Security allows, and no table
// grants anything to the anon role — see supabase/migrations/0001_init.sql.
// The service_role key must NEVER appear in this repo.
export const SUPABASE_URL = 'https://wmouolcpesvknqcjuqtq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RwSfNURVQqKDRLWA-nXdjA_HLJB8lqN';

// Cloudflare Worker that backs the in-gym AI chat (see worker/). Empty until
// deployed — the chat bar only appears when this is set, so the app is
// unaffected otherwise. Not a secret; it's a public endpoint that auth-gates
// itself against your Supabase session.
export const WORKOUT_CHAT_URL = 'https://workout-chat.talmazor2.workers.dev';
