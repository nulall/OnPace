// OnPace Garmin proxy — Cloudflare Worker scaffold.
//
// Required setup (see DESIGN.md):
//   wrangler secret put GARMIN_CLIENT_ID
//   wrangler secret put GARMIN_CLIENT_SECRET
//   wrangler secret put SESSION_SECRET
//   KV namespace binding: STORE
//
// NOTE: Garmin endpoint paths below are indicative. Verify against the
// Training API documentation issued with Garmin Connect Developer Program
// approval before deploying.

const GARMIN_API = {
  authorize: "https://connect.garmin.com/oauth2Confirm",
  token:     "https://diauth.garmin.com/di-oauth2-service/oauth/token",
  workouts:  "https://apis.garmin.com/training-api/workouts",
  schedule:  "https://apis.garmin.com/training-api/schedule",
  user:      "https://apis.garmin.com/wellness-api/rest/user/id",
};

const APP_URL = "https://nulall.github.io/OnPace/"; // redirect target after auth

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const route = url.pathname;
    try {
      if (route === "/auth/login")    return authLogin(url, env);
      if (route === "/auth/callback") return authCallback(url, env);

      const session = await getSession(req, env);
      if (!session) return json({ error: "not_connected" }, 401);

      if (route === "/api/config" && req.method === "GET")
        return json((await env.STORE.get(`cfg:${session.userId}`, "json")) || null);
      if (route === "/api/config" && req.method === "PUT") {
        await env.STORE.put(`cfg:${session.userId}`, JSON.stringify(await req.json()));
        return json({ ok: true });
      }
      if (route === "/api/workouts/push" && req.method === "POST")
        return pushWorkouts(await req.json(), session, env);
      if (route === "/api/workouts/reschedule" && req.method === "POST")
        return reschedule(await req.json(), session, env);

      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};

// ── OAuth2 + PKCE ─────────────────────────────────────────────────────────────

async function authLogin(url, env) {
  const state = crypto.randomUUID();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await sha256(verifier));
  await env.STORE.put(`pkce:${state}`, verifier, { expirationTtl: 600 });
  const q = new URLSearchParams({
    response_type: "code", client_id: env.GARMIN_CLIENT_ID,
    code_challenge: challenge, code_challenge_method: "S256",
    state, redirect_uri: `${url.origin}/auth/callback`,
  });
  return Response.redirect(`${GARMIN_API.authorize}?${q}`, 302);
}

async function authCallback(url, env) {
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const verifier = await env.STORE.get(`pkce:${state}`);
  if (!code || !verifier) return json({ error: "bad_callback" }, 400);

  const res = await fetch(GARMIN_API.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, code_verifier: verifier,
      client_id: env.GARMIN_CLIENT_ID, client_secret: env.GARMIN_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  if (!res.ok) return json({ error: "token_exchange_failed" }, 502);
  const tokens = await res.json();

  const userRes = await fetch(GARMIN_API.user, { headers: bearer(tokens) });
  const userId = (await userRes.json()).userId;

  await env.STORE.put(`tok:${userId}`, JSON.stringify({ ...tokens, obtained: Date.now() }));
  const cookie = await signSession(userId, env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: APP_URL,
      "Set-Cookie": `onpace_s=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000`,
    },
  });
}

// ── Training API ──────────────────────────────────────────────────────────────

async function pushWorkouts({ workouts }, session, env) {
  const tokens = await freshTokens(session.userId, env);
  const results = [];
  for (const w of workouts) {
    const created = await garmin("POST", GARMIN_API.workouts, w.workout, tokens);
    const sched   = await garmin("POST", GARMIN_API.schedule,
      { workoutId: created.workoutId, date: w.date }, tokens);
    results.push({ date: w.date, workoutId: created.workoutId, scheduleId: sched.scheduleId });
  }
  // Remember what we pushed so it can be edited/rescheduled later.
  await env.STORE.put(`pushed:${session.userId}`, JSON.stringify(results));
  return json({ ok: true, results });
}

async function reschedule({ scheduleId, newDate }, session, env) {
  const tokens = await freshTokens(session.userId, env);
  const updated = await garmin("PUT", `${GARMIN_API.schedule}/${scheduleId}`, { date: newDate }, tokens);
  return json({ ok: true, updated });
}

async function garmin(method, endpoint, body, tokens) {
  const res = await fetch(endpoint, {
    method, headers: { ...bearer(tokens), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`garmin_${res.status}: ${await res.text()}`);
  return res.json();
}

async function freshTokens(userId, env) {
  const t = await env.STORE.get(`tok:${userId}`, "json");
  if (!t) throw new Error("no_tokens");
  if (Date.now() - t.obtained < (t.expires_in - 300) * 1000) return t;
  const res = await fetch(GARMIN_API.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: t.refresh_token,
      client_id: env.GARMIN_CLIENT_ID, client_secret: env.GARMIN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error("refresh_failed");
  const next = { ...(await res.json()), obtained: Date.now() };
  await env.STORE.put(`tok:${userId}`, JSON.stringify(next));
  return next;
}

// ── Session + crypto helpers ──────────────────────────────────────────────────

function bearer(t) { return { Authorization: `Bearer ${t.access_token}` }; }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": new URL(APP_URL).origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

async function signSession(userId, env) {
  const payload = btoa(JSON.stringify({ userId, iat: Date.now() }));
  const sig = b64url(await hmac(payload, env.SESSION_SECRET));
  return `${payload}.${sig}`;
}

async function getSession(req, env) {
  const m = (req.headers.get("Cookie") || "").match(/onpace_s=([^;]+)/);
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  if (b64url(await hmac(payload, env.SESSION_SECRET)) !== sig) return null;
  return JSON.parse(atob(payload));
}

async function sha256(s) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); }
async function hmac(s, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s));
}
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
