# Brief persistence — execution plan (for Monday, after the Friday demo)

Deferred from 2026-08-06: a coordinated migration + edge-function + frontend
change that breaks brief generation if the pieces land out of order — not worth
running 24h before recording, and it changes nothing on camera. This doc is so
Monday is execution, not rediscovery. **Do not apply the migration or deploy the
edge function until all three are ready and land in the lockstep order below.**

## The problem (why this is worth doing)

`msl_hcp_briefs` conflates two things under one 24h number:
- **Cache freshness** — should this brief be regenerated?
- **Artifact retention** — can I read the brief I took into Tuesday's meeting?

Today they are the same 24h TTL, and the table has `UNIQUE (user_id, hcp_id)`
(`msl_hcp_briefs_user_hcp_key`) with the edge function **upserting** on it. So:
- One row per (user, HCP); **regeneration overwrites in place** — the version an
  MSL prepared with is destroyed on the next generation. It is evidence of what
  they knew before an engagement, and it is being lost.
- Opening a brief >24h old is a cache miss → it **regenerates and overwrites**,
  silently burning an API call and replacing the artifact.
- A `GENERATE BRIEF` button that returns a cached brief within 24h is a lie in
  the label (it neither generates nor tells the truth).

`getRecentBriefsForUser` (`frontend/src/lib/home.ts:382`) already lists by
`generated_at desc limit N` — count-based, no TTL filter — so the workspace list
needs nothing beyond the rows existing.

## Target behaviour

- Briefs **persist indefinitely** — records of what was known before an engagement.
- **Opening reads the stored brief. Never regenerates.**
- **Regeneration is explicit** and **appends a new row** (new id, new
  `generated_at`), never replacing the prior.
- The button reflects reality: **"OPEN BRIEF · generated 4 Aug"** when one
  exists, **"GENERATE BRIEF"** when none does, with a separate **regenerate**
  action beside it.
- (Deferred niceties, not required for the core fix: brief history on the
  profile, workspace listing changes beyond what falls out of the above.)

`hcp_id` is already on `msl_hcp_briefs` — no column add needed.

## The three changes

### 1. Migration — `migrations/2026_MM_DD_brief_persistence.sql`
```sql
-- Briefs are append-only records, not one-per-HCP caches.
ALTER TABLE public.msl_hcp_briefs
  DROP CONSTRAINT IF EXISTS msl_hcp_briefs_user_hcp_key;

-- Read path is "latest for (user, hcp)" — index it (NOT unique).
CREATE INDEX IF NOT EXISTS idx_msl_hcp_briefs_user_hcp_generated
  ON public.msl_hcp_briefs (user_id, hcp_id, generated_at DESC);

NOTIFY pgrst, 'reload schema';
```
`expires_at` stays on the table (harmless) but is no longer read as a freshness
gate — freshness becomes a UI hint from `generated_at`, not a hard cutoff.

### 2. Edge function — `supabase/functions/generate-brief/index.ts`
Two edits, and one resilience requirement so deploy order can't break generation:
- **Remove the cache-hit early-return** (~lines 267–286: the
  `msl_hcp_briefs … expires_at > now() … if (cachedBrief) return`). Generation
  is now explicit; there is nothing to short-circuit.
- **Change the write from `upsert(on_conflict:"user_id,hcp_id")` to `insert`**
  (~lines 540–560, the `serviceClient.from("msl_hcp_briefs").upsert(...)`).
- **Resilience during the deploy gap (important):** wrap the insert so it works
  whether or not the unique constraint still exists. A plain `insert` throws a
  unique-violation while the constraint is still present (before migration #1
  lands). Catch that specific error (Postgres `23505`) and fall back to an
  update of the existing (user, hcp) row. Once the migration drops the
  constraint, the catch branch never fires and every call appends. This is what
  lets the edge function deploy **before** the migration without a breakage
  window.

### 3. Frontend
- **Read path.** Add `getLatestBrief(hcpId)` — the latest stored brief for the
  current user + HCP, **read-only, never generates**. Two ways:
  - **Recommended:** a `SECURITY DEFINER` RPC `get_latest_brief(p_hcp_id uuid)`
    returning the newest row for `auth.uid()` + hcp — no RLS change, consistent
    with the codebase's RPC pattern. (The current cache read uses a service
    client precisely because direct reads aren't assumed.)
  - Alternative: a direct `supabase.from("msl_hcp_briefs").select().eq(user).
    eq(hcp).order(generated_at desc).limit(1)` — **only if** an RLS SELECT policy
    `user_id = auth.uid()` exists on `msl_hcp_briefs`; verify before relying on it.
- **`frontend/src/lib/briefs.ts`:** add `getLatestBrief`; keep `generateBrief`
  (now always appends). Consider a `regenerateBrief` alias for call-site clarity
  (same invoke).
- **`BriefPage`** (`frontend/src/components/BriefPage/BriefPage.tsx`): on open,
  call `getLatestBrief` and render the stored brief; do **not** auto-generate.
  Generate only on an explicit action.
- **The buttons.** They currently navigate/generate unconditionally:
  - `HcpProfileBrief.tsx:282` (`✦ GENERATE BRIEF`),
  - `RisingHcpProfile.tsx:348` (`+ GENERATE BRIEF`),
  - community/practice `HeaderActions` (`✦ BRIEF`, in `CommunityHcpProfile.tsx`
    and `PracticeFirstProfile.tsx`).
  Each should query `getLatestBrief` for state and render **"OPEN BRIEF ·
  generated <date>"** (→ open the stored brief) when one exists, **"GENERATE
  BRIEF"** when none, plus a small **Regenerate** affordance beside the open
  action. A generated-N-days-ago hint reads off `generated_at`, not a TTL.

## Lockstep deploy order (no order breaks generation)

The constraint drop and the insert-switch are mutually blocking if done
independently:
- Migration first → the still-deployed upsert's `on_conflict` targets a dropped
  constraint → **all** generation errors.
- Insert-switch first, plain insert, constraint still present → the 2nd
  generation for any HCP hits a unique violation.

The `23505` fallback in change #2 resolves this. Deploy in this order:

1. **Edge function** (`supabase functions deploy generate-brief`) — with the
   insert + `23505`→update fallback. Works in **both** DB states: with the
   constraint it behaves like replace; without it, appends.
2. **Migration #1** — drop the constraint, add the index. Now the fallback never
   fires; every call appends.
3. **Frontend push** — read path + button states. Reads now return stored
   briefs; the button tells the truth.

Rolling back is the reverse and equally safe because of the fallback.

## Verification (after each step)
- After 1: generate a brief twice for the same HCP — during the gap the second
  still succeeds (fallback updates in place); no error surfaced to the user.
- After 2: generate twice → **two rows** for (user, hcp), distinct
  `generated_at`; opening returns the newest; the prior row still exists.
- After 3: the button reads "OPEN BRIEF · generated <date>"; opening never mints
  a row (watch `count(*)` hold); Regenerate appends one.
- Confirm `getRecentBriefsForUser` now shows multiple rows per HCP over time
  (the history the workspace can later surface).

## Demo-day note (Friday, current behaviour unchanged)
The 24h cache is still live. For the log-insight → generate-brief beat to show a
freshly logged insight, ensure **no brief for the demo HCP was generated in the
prior 24h** — or delete that HCP's `msl_hcp_briefs` row immediately before
rehearsing, so the generate is a cache miss that reads the live insight. There
is no force-regenerate path until this plan ships.
