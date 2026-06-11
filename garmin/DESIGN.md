# Garmin Direct Export — Design

Goal: push OnPace workouts straight into a user's Garmin Connect calendar (and reschedule them later), replacing the importmyworkout.com copy/paste step. OAuth identifies the user's account, so plan configuration no longer needs to travel in the URL.

## Hard requirements (read first)

1. **Garmin Connect Developer Program approval.** The Training API (create/schedule workouts) is not public. You must apply at https://developer.garmin.com/gc-developer-program/ and be issued OAuth client credentials. Hobby applications are accepted but reviewed.
2. **A small backend is mandatory.** Two reasons:
   - The OAuth client secret cannot be embedded in a static HTML page.
   - Garmin's APIs do not serve CORS headers, so the browser cannot call them directly.
   The design below uses a Cloudflare Worker (free tier is sufficient) with KV storage.
3. Endpoint paths in this document and in `worker.js` are **indicative** — verify them against the official Training API docs you receive on program approval before going live.

## Architecture

```
Browser (index.html, static)
   │  fetch(BACKEND_URL + /api/...)  — JSON, CORS-enabled, session cookie
   ▼
Cloudflare Worker (worker.js)
   │  OAuth2 token exchange + refresh; Training API calls
   ▼
Garmin Connect API
```

### Auth flow (OAuth2 + PKCE, handled by the Worker)

1. Browser hits `GET {BACKEND}/auth/login` → Worker redirects to Garmin's authorize URL (state + PKCE challenge stored in KV).
2. Garmin redirects to `GET {BACKEND}/auth/callback?code=...` → Worker exchanges the code for access/refresh tokens, stores them in KV keyed by the Garmin user ID, sets a signed session cookie, redirects back to the app.
3. All subsequent `/api/*` calls authenticate via the session cookie; the Worker refreshes Garmin tokens transparently.

### Config storage (replaces URL sharing)

- `GET/PUT {BACKEND}/api/config` — the OnPace `cfg` object stored in KV under the Garmin user ID.
- On app load: if a session exists, fetch the config from the backend; otherwise fall back to localStorage/URL (unchanged behavior, so the static no-backend mode keeps working).

### Workout push

- `POST {BACKEND}/api/workouts/push` with `{ workouts: [...] }` produced by `makeGarminWorkouts()` in index.html.
- For each workout the Worker: creates it (`POST /training-api/workouts`), then schedules it on its date (`POST /training-api/schedule`), and stores the returned `workoutId`/`scheduleId` pair in KV so it can be edited later.

### Reschedule / edit (the IMW-parity requirement)

- `POST {BACKEND}/api/workouts/reschedule` with `{ scheduleId, newDate }` → Worker updates the schedule entry.
- `DELETE {BACKEND}/api/workouts/:workoutId` → remove a pushed workout.
- Because every push records its Garmin IDs in KV, the app can later list what's on the Garmin calendar, diff it against a regenerated plan, and move or delete entries instead of duplicating them.

## Workout JSON mapping

`makeGarminWorkouts()` (added to index.html on this branch) converts plan days to Garmin's structured-workout schema:

- Pace targets are converted from `mm:ss` per mi/km strings to **m/s** ranges (Garmin's unit).
- Easy/Long → single DISTANCE step at easy pace; optional stride repeat block appended.
- Tempo → WARMUP step + TIME step at tempo pace + COOLDOWN step.
- Interval → WARMUP + RepeatStep(reps × [DISTANCE step @ interval pace, TIME recovery step]) + COOLDOWN.
- Pre-race → short DISTANCE step + 4× stride repeat block.

## Rollout plan

1. Apply to the Garmin Connect Developer Program (longest lead time — start now).
2. Deploy `worker.js` with `wrangler deploy`; set secrets `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `SESSION_SECRET`; bind a KV namespace `STORE`.
3. Set `GARMIN_BACKEND` in index.html to the Worker URL.
4. Verify endpoint paths against the official docs; adjust `GARMIN_API` constants in worker.js.
5. Test: connect account → push one workout → confirm in Garmin Connect → reschedule it → confirm date moved.
