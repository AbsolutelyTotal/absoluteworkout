# workout-chat — AI chat proxy

A Cloudflare Worker that lets the app ask a free Workers AI model about a
specific workout, without ever putting an API key in the browser.

**Status: proposal.** The Worker is complete; the app does not call it yet
(the chat UI is a separate step). Nothing here ships to GitHub Pages — it
deploys to Cloudflare separately.

## Why a Worker

The app is a keyless static site. An LLM key can't live client-side, so one
server-side hop has to hold it. Cloudflare is chosen because the domain is
already there, **Workers AI is free** at this scale, and the Worker is *both*
the key-holder and the model host — no separate model provider, no Supabase
edge function.

## What it does

1. Verifies the caller's Supabase session (so it isn't an open, billable proxy).
2. Rate-limits per user per day (KV).
3. Fetches the caller's constraint profile **from the app origin** — not from the
   request body — so a tampered client can't strip the L5-S1 safety rules.
4. Builds a prompt where the constraints and workout are *data*, the question is
   the user turn (no raw-input concatenation), and the safety rule overrides any
   request.
5. Calls `@cf/openai/gpt-oss-120b` (biggest free instruct model; set `CHAT_MODEL` to change) and returns the answer.

## Deploy

```bash
cd worker
npm i -g wrangler          # if needed
wrangler login             # your Cloudflare account
wrangler kv namespace create RL   # paste the id into wrangler.toml
wrangler secret put SUPABASE_ANON_KEY   # paste the publishable key
wrangler deploy
```

Then add the Worker's URL to the app and to Supabase is not needed — the app
calls the Worker directly with the user's Supabase access token in the
`Authorization` header.

## Client call (for when the chat UI lands)

```js
const { data: { session } } = await client.auth.getSession();
const r = await fetch('https://workout-chat.<subdomain>.workers.dev', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
  body: JSON.stringify({
    profileId: db.profile.id,
    workout: currentSessionOrPrescription,   // the few-KB local object
    question: userText
  })
});
const { answer, error } = await r.json();
// render `answer` through mount()/scrub(), never innerHTML
```

## Cost

Workers AI free tier is a daily "neurons" allowance well above a few people
asking a handful of questions. The `DAILY_LIMIT` in the Worker is a second
brake. If you outgrow the free tier, the same Worker points at a paid model by
changing one string.

## Privacy note

The free model runs on Cloudflare's infrastructure. This is personal training
data, not company/customer data, so it's your call — but know that free AI
tiers generally do not guarantee zero-retention or no-training-on-inputs.
