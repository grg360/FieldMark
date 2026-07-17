# Admin Page — Pre-Build Audit (Invite System Stage 3)

**Date:** 2026-07-16 · **Scope:** read-only. What building the Garrett-only admin page requires — to replace
hand-SQL invite management (mint invites, referral graph, kill-switch, quotas, user overrides). Establishes the
server-side privileged-action layer that invite-emails will later reuse. **Nothing was changed.**

**Built on:** Stage 1 security foundation (`admin_users`, `is_admin()`, `app_config`, `invites`,
`invite_redemptions`, the column-lock trigger) + Stage 2 signup. See `mossy-twirling-melody.md` plan.

---

## 0. Headline findings

- **No admin surface exists anywhere** — grep `admin|isAdmin|is_admin` over `frontend/src` returns **0 files**.
  This is the **first** admin route/page. Everything below is net-new.
- **No admin write RPCs exist.** The only `SECURITY DEFINER` functions today are `is_admin()`, `check_invite()`,
  `redeem_invite()`, `live_ta_parent_slugs()` (invite system) + two unrelated pipeline functions. Every admin
  action needs a new RPC.
- **`admin_users` has 0 rows** — nobody is an admin yet. The **first admin must be bootstrapped via direct SQL**
  (`INSERT INTO admin_users …`), because every admin RPC will gate on `is_admin()` and there's no admin to grant
  the first grant. This is the Stage 1 operational seed step, still pending.
- **The security model is already correct-by-construction:** `admin_users` + `app_config` are client-locked (RLS
  on, no policies, grants revoked), so the frontend **cannot** touch them via `.from()`. Admin actions are only
  possible through `SECURITY DEFINER` RPCs that check `is_admin()` first. A hidden route is cosmetic; the real gate
  is server-side.

---

## 1. Admin access gating

**Existing admin-route pattern?** None. This is the first. Routing today (`App.tsx`): public routes (`/demo`,
`/join`) sit outside `AuthWrapper`; everything else is inside `AuthWrapper` (requires session + profile). The admin
page belongs **inside `AuthWrapper`** (admins are authenticated users) at a route like `/admin`.

**Frontend "am I admin" check:** call the existing RPC — `supabase.rpc("is_admin")` (returns `boolean`; already
`GRANT EXECUTE … TO authenticated`). On mount, if `false` → redirect to `/me` (or render 404). This only controls
**visibility**, not authority.

**Real protection is server-side (confirmed):** `is_admin()` reads `admin_users`, which is client-locked — a user
cannot read it, write it, or self-add. Every admin mutation is a `SECURITY DEFINER` RPC whose **first statement is
an `is_admin()` check**. So even if a non-admin discovers `/admin` and calls the RPCs directly (via devtools /
`supabase.rpc`), every call raises `not authorized`. The hidden route is convenience; the RPC gate is the fence.

> Note: `is_admin()` currently has `EXECUTE` for **anon** as well as authenticated. Harmless — for anon
> `auth.uid()` is null so it returns `false` — but it can be tightened to authenticated-only. Low priority.

---

## 2. Server-side action layer (the RPCs to build)

`app_config` and `admin_users` are client-locked and `msl_profiles` is own-row-RLS'd, so **none** of these can be
done via `.from()`. Each operation needs a **new `SECURITY DEFINER` RPC**, owned by postgres (bypasses RLS), whose
**first line is `IF NOT is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;`**. All are net-new.

| RPC | Reads / Writes | Why SECURITY DEFINER + is_admin() |
|---|---|---|
| `mint_invite(p_inviter uuid=null, p_quota int=10, p_note text=null)` → code | INSERT `invites` with a **high-entropy code** (`replace(gen_random_uuid()::text,'-','')`, same as auto-mint) | writes `invites` (client INSERT revoked); privileged |
| `list_invites()` → rows | SELECT `invites` (+ redemption counts) — **all** rows (clients only see own via RLS) | must bypass `invites` SELECT-own policy |
| `referral_graph()` / `list_redemptions()` → edges | SELECT `invite_redemptions` JOIN `msl_profiles` (inviter + invitee names/company) | `invite_redemptions` is client-locked |
| `toggle_signups(p_enabled bool)` | UPDATE `app_config.signups_enabled`, set `updated_by=auth.uid()` | `app_config` client-locked (the kill-switch) |
| `set_signup_cap(p_cap int)` | UPDATE `app_config.global_signup_cap` | same |
| `list_users()` → rows | SELECT `msl_profiles` (**all** rows) JOIN `auth.users` (email) + admin/`invited_by` | bypasses own-row RLS; **email lives in `auth.users`**, only reachable by a definer/service context |
| `set_user_entitlement(p_user uuid, p_slugs text[])` | UPDATE `msl_profiles.allowed_ta_slugs` for another user | column-locked to clients; definer (postgres) passes the trigger — **this is literally entitlement-granting, tightest gate** |
| `deactivate_user(p_user uuid)` | see §7 — needs a decision (profile flag vs GoTrue ban) | privileged |

Every one is confirmed to **require** both `SECURITY DEFINER` (to reach the locked objects) and an `is_admin()`
gate (the definer bypass makes the gate the sole protection — it is load-bearing and must be first).

---

## 3. What exists today vs. net-new

| Piece | Status |
|---|---|
| `admin_users` table + `is_admin()` | **Exists** (Stage 1). `admin_users` **empty** — seed pending. |
| `app_config` (kill-switch storage) | **Exists** (Stage 1), client-locked. |
| `invites`, `invite_redemptions`, `msl_profiles.invited_by` | **Exist** (Stage 1). |
| Auto-mint of a user's own invite on redeem | **Exists** (inside `redeem_invite`). |
| Any admin RPC (`mint_invite`, `toggle_signups`, `list_*`, …) | **Net-new** — none exist. |
| Any admin route / page / component | **Net-new** — none exist. |
| Frontend `is_admin` check | **Net-new** (RPC exists; no caller). |
| `AppLayout` page shell + dark design system | **Exists** — reuse. |

---

## 4. Referral-graph data (sufficient?)

**Sufficient — no fields missing.** Edges live in `invite_redemptions` (`redeemed_by`, `inviter_id`,
`invite_code`, `redeemed_at`); `msl_profiles.invited_by` mirrors the parent link. Root nodes = admin-seeded invites
(`inviter_id IS NULL`). Query (run inside `referral_graph()` RPC):

```sql
SELECT r.redeemed_by,
       ip.first_name || ' ' || ip.last_name AS inviter_name, ip.company AS inviter_company,
       rp.first_name || ' ' || rp.last_name AS invitee_name, rp.company AS invitee_company,
       rp.job_function, r.invite_code, r.redeemed_at
FROM invite_redemptions r
LEFT JOIN msl_profiles ip ON ip.user_id = r.inviter_id
LEFT JOIN msl_profiles rp ON rp.user_id = r.redeemed_by
ORDER BY r.redeemed_at;
```

One caveat: **email is not on `msl_profiles`** — it's in `auth.users`. To show emails (user list / graph labels)
the RPC must JOIN `auth.users`, which only a definer/service context can read. `list_users()`/`referral_graph()`
being `SECURITY DEFINER` handles this.

---

## 5. Frontend home & patterns

- **Route:** add `/admin` **inside** `AuthWrapper` in `App.tsx` (alongside `/me`, `/me/settings`, etc.). Gate the
  component on `is_admin()`.
- **Shell:** use **`AppLayout`** (`components/AppLayout.tsx`) — `TopBar` + optional breadcrumbs + children +
  `GlobalFooter`, `maxWidth` prop (default 960; admin can use wider). This is the established non-feed page shell
  (used by settings, watchlists, institutions).
- **Tables/lists:** there is **no generic DataTable component**. Existing list pages (`WatchlistsPage`,
  `FollowUpsPage`, `PublicationsListPage`) render **inline-styled `div`/list markup** in the dark palette
  (`#0A0A0B` bg, `#111113` cards, `#1E1E22` borders, `#E8E6DF` text, `#E8A020` accent, monospace for data). Admin
  tables should follow that — plain styled `<table>`/rows, no new dependency.

---

## 6. Security surfaces (each gated server-side)

| Attack | Mitigation (server-side) |
|---|---|
| **Route discovery** (`/admin` found by a non-admin) | Cosmetic only; every mutation RPC re-checks `is_admin()`. Page shows nothing actionable. |
| **RPC called directly** (skip the UI) | Each RPC's first statement is `is_admin()`; non-admins get `not authorized`. |
| **Self-promotion to admin** | `admin_users` client-locked (no INSERT path). No `grant_admin` RPC at launch → only direct SQL (or an is_admin-gated RPC later) can add admins. First admin seeded via SQL. |
| **Entitlement escalation** via `set_user_entitlement` | is_admin-gated; a non-admin cannot call it. (Recall a user still cannot self-edit their own `allowed_ta_slugs` — column-lock, verified Stage 1.) |
| **Kill-switch tamper** | `toggle_signups`/`set_signup_cap` is_admin-gated; `app_config` client-locked. |
| **Email/PII exposure** via `list_users` | Only readable through the is_admin-gated definer RPC; `auth.users` is never client-reachable. |
| `is_admin()` callable by anon | Returns `false` (null uid) — no leak. Optional tighten to authenticated. |

**Load-bearing invariant:** because admin RPCs are `SECURITY DEFINER` (they bypass RLS by design), the
`is_admin()` check is the *only* thing between a caller and a privileged action. It MUST be the first statement in
every admin RPC, and no admin RPC may take an "actor" argument — the actor is always `auth.uid()`.

---

## 7. Recommended build plan (dependency-ordered)

**Bootstrap (prerequisite):** seed the first admin — `INSERT INTO public.admin_users (user_id) VALUES ('<garrett>');`
via SQL (postgres). Without this, `is_admin()` is false for everyone and the page is inert.

**Minimum for launch — replaces hand-SQL, not a full console:**
1. **Server RPCs (action layer first):** `mint_invite`, `list_invites`, `referral_graph`, `toggle_signups`,
   `set_signup_cap`, `list_users` — all `SECURITY DEFINER`, is_admin-gated, in one Stage 3 migration.
2. **Frontend `/admin` page** (in `AuthWrapper`, `AppLayout` shell, `is_admin()` mount-gate) with:
   - Kill-switch toggle + cap field (`toggle_signups`/`set_signup_cap`)
   - Mint-invite form (quota, optional note) + invite list (`mint_invite`/`list_invites`)
   - Referral list (`referral_graph`) — plain table
   - User list (`list_users`) — plain table
3. **Admin gate wiring:** `is_admin()` check (redirect non-admins) + rely on the server gate as the real fence.

**Nice-to-have (defer):**
- `set_user_entitlement` admin override UI (the RPC is simple; the UI is post-launch).
- **Hard user deactivation** — needs a decision: a `msl_profiles`-flag + `AuthWrapper` enforcement (soft, app-level)
  vs. a **GoTrue ban** (`banned_until` via the admin API — requires an **Edge Function**, since SQL can't call
  GoTrue). For launch, Garrett can ban in the Supabase dashboard; defer the RPC.
- Referral **graph visualization** (vs. the plain table), invite revocation UI, quota-edit inline, bulk ops.

**Bounding:** minimum = mint invites + kill-switch + read invites/referrals/users. That fully replaces hand-SQL.
Everything visual/graph/override beyond that is post-launch.
