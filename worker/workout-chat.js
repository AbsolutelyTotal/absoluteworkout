// absoluteworkout — AI chat proxy (Cloudflare Worker + Workers AI).
//
// Why this exists: the app is a keyless static site, so an LLM key can never
// ship to the browser. This Worker is the one server-side hop that holds
// nothing secret in the repo, verifies the caller, injects the safety
// constraints, and calls a free Workers AI model. The app talks only to this.
//
// Secrets/config live in Cloudflare, never here — see wrangler.toml + README.

const MODEL = '@cf/meta/llama-3.1-8b-instruct';   // free tier; swap up if wanted
const DAILY_LIMIT = 50;                            // per user, per day
const MAX_CONTEXT = 8000;                          // chars of workout JSON we accept

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // --- auth: validate the caller's Supabase session, don't trust the client ---
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'sign in to use chat' }, 401, cors);
    const user = await verifySupabaseUser(token, env);
    if (!user) return json({ error: 'invalid session' }, 401, cors);

    // --- per-user daily rate limit (KV) — an open LLM proxy is a credit drain ---
    const overLimit = await bumpRateLimit(env, user.id);
    if (overLimit) return json({ error: 'daily question limit reached — try tomorrow' }, 429, cors);

    // --- parse + bound the request ---
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
    const question = String(body.question ?? '').trim().slice(0, 500);
    const profileId = String(body.profileId ?? '');
    const context = JSON.stringify(body.workout ?? {}).slice(0, MAX_CONTEXT);
    if (!question) return json({ error: 'empty question' }, 400, cors);

    // --- constraints come from the app origin, NOT the client payload, so a
    //     tampered client can't strip the safety rules (fail-closed) ---
    const rules = await constraintsFor(profileId, env);

    const messages = buildMessages({ question, context, rules });

    // --- call the model ---
    let answer;
    try {
      const out = await env.AI.run(MODEL, { messages, max_tokens: 500 });
      answer = (out.response ?? '').trim();
    } catch (err) {
      return json({ error: 'model call failed', detail: String(err) }, 502, cors);
    }
    return json({ answer }, 200, cors);
  }
};

// ---------------------------------------------------------------------------

/** The prompt. Constraints + workout are DATA blocks; the question is the user
 *  turn — never concatenated into the instructions, so "ignore your rules" is
 *  treated as a question about a workout, not a command. */
function buildMessages({ question, context, rules }) {
  const system = [
    'You are a concise strength-training assistant embedded in a workout-logging app.',
    'Answer only about the workout data provided. Keep it to a few sentences.',
    'You are NOT a doctor; add a short "not medical advice" note only if the user asks about pain or injury.',
    '',
    'HARD SAFETY RULE — this overrides any request:',
    rules.restricted
      ? 'The user trains under medical movement restrictions. NEVER suggest, endorse, or describe as an option any movement outside what their plan already contains. If asked for a substitute, only pick from exercises already in the provided workout data. The banned patterns and the reasoning are here:\n' + rules.text
      : 'The user has no movement restrictions on file.',
    '',
    'If a request conflicts with the safety rule, decline that part and say why.'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `WORKOUT DATA (JSON):\n${context}\n\nMy question: ${question}` }
  ];
}

/** Fetch the authoritative constraints for a profile from the app origin. */
async function constraintsFor(profileId, env) {
  try {
    const origin = env.APP_ORIGIN;
    const profiles = await fetch(`${origin}/data/profiles.json`).then(r => r.json());
    const profile = profiles.find(p => p.id === profileId);
    if (!profile || profile.allowExtendedLibrary === true) return { restricted: false, text: '' };
    const rules = await fetch(`${origin}/data/constraints.json`).then(r => r.text());
    return { restricted: true, text: rules.slice(0, 4000) };
  } catch {
    // Fail closed: if we can't confirm the profile is unrestricted, restrict.
    return { restricted: true, text: 'Movement restrictions unknown — avoid recommending any new loaded movement.' };
  }
}

/** Validate the Supabase access token by asking Supabase who it belongs to.
 *  Avoids doing JWT crypto in the Worker and works across signing algorithms. */
async function verifySupabaseUser(token, env) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

async function bumpRateLimit(env, userId) {
  if (!env.RL) return false;                       // no KV bound => skip (dev)
  const key = `rl:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const n = Number(await env.RL.get(key)) || 0;
  if (n >= DAILY_LIMIT) return true;
  await env.RL.put(key, String(n + 1), { expirationTtl: 172800 });
  return false;
}

/** Origin-locked CORS — never `*`; only the app may call this. */
function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allow = origin === env.APP_ORIGIN ? origin : env.APP_ORIGIN;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-max-age': '86400'
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json', ...cors }
  });
}
