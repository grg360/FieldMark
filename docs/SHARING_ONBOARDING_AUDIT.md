# Sharing & Cold-User Onboarding — Pre-Build Audit

**Date:** 2026-07-17 · **Scope:** read-only. Two surfaces: (1) making it frictionless for a logged-in
user to share their invite, and (2) the brand-new user's first-run experience. **Nothing was changed.**

**Built on:** invite-system Stage 1/2 (`invites`, `invite_redemptions`, `redeem_invite`, `check_invite`)
and Stage 3a/3b (admin RPCs + `/admin`). Every user gets a personal quota-10 invite minted at signup by
`redeem_invite()` (`inviter_id = auth.uid()`, redeemable at `/join/<code>`).

---

## 0. Headline findings

- **The user's own invite code is surfaced NOWHERE in the app.** There is no `supabase.from("invites")`
  call anywhere in `frontend/src`, no display of a personal code, no `/join/<code>` link generated for the
  logged-in user. The `invites_select_own` RLS policy (Stage 1) exists but is **never exercised by the
  client**. Sharing is 100% net-new UI.
- **`redeem_invite()` already hands the client the freshly-minted own code — and the app throws it away.**
  `RedeemResult.invite_code` is returned (`lib/invites.ts:6`) but `SignupScreen.tsx:48-49` destructures
  only `data` and checks `data?.ok`; the code is never read or stored. The very first moment we could show
  "here's your invite link" is currently discarded.
- **Own invites are client-readable; the own referral sub-graph is NOT.** A user can read their own
  `invites` rows via SELECT-own (confirmed live) — **no new RPC needed for the code + quota**. But
  "who have I invited" lives in `invite_redemptions`, which is client-locked (`REVOKE ALL`), and invitee
  profiles are behind own-row RLS on `msl_profiles`. So the referral sub-graph **does** need a small new
  SECURITY DEFINER RPC. (Detail in §1.2.)
- **There is no product onboarding of any kind** — no tour, coach-marks, walkthrough, or getting-started
  checklist. The one built welcome banner (`WelcomeBanner.tsx`) is **dead code, never imported.**
- **A new user lands on the generic browse feed (`/`), not their dashboard (`/me`).** Because the feed is
  populated with HCP cards regardless of the user's own data, first-run never *looks* cold — but the
  personalized dashboard, the natural home for a "first action," is only reached by manual nav.
- **The `/me` dashboard for a zero-data user is a wall of "0 / all caught up / coming soon."** Only the
  Coverage Gaps tile offers a real first action, and it hides itself entirely in unsupported TAs.
- **Field Insights shows fabricated mock data instead of an empty state** (`FieldInsightsScreen.tsx`
  substitutes `MOCK_INSIGHTS` — 7 invented insights attributed to real-named KOLs — when the user has
  none). A cold user sees a page that looks populated with someone else's data. Flagged as a correctness
  issue, not just polish (see §5).
- **Polish batch:** "Work email" → STILL-NEEDS-FIX; company pre-fill → ALREADY-FIXED (no guessing);
  job_function "Other" free-text → STILL-NEEDS-FIX. (Detail in §7.)

---

# PART 1 — SHARING

## 1.1 Where the invite is surfaced today (nowhere) + where it should live

**Today:** nothing. Confirmed absences (all read):
- `UserMenu.tsx` — no invite item.
- `HomePage.tsx` — no share affordance in the tile stack.
- `ProfileScreen.tsx` (`/me/settings`) — no invite references at all.
- `WelcomeBanner.tsx` — greeting/stats only (and it's dead code anyway).
- The one "invite"-named UI is a **decoy**: `HomePage/InviteModal.tsx` + `TeamIntelligenceTile.tsx` are a
  *waitlist* lead-capture ("Get notified when team features launch") that INSERTs into `msl_team_invites`
  (`lib/home.ts:562-583`) — a **different table**, unrelated to the `invites` invite system. It generates
  no code and no `/join` link.

**Recommended placement (two complementary surfaces, both low-friction):**

1. **UserMenu → ACCOUNT section**, a new "Invite a colleague" item immediately after Settings
   (`UserMenu.tsx:288`) and before the conditional Admin item. Reuse the exact pattern: a
   `<button className="fm-menu-item" style={menuItemStyle}>` with `onClick={() => { setOpen(false);
   navigate(...) }}`. This is the always-available entry point. ACCOUNT is the user-centric group; DISCOVER
   is feature-nav, so it doesn't belong there.

2. **HomePage tile** — replace/repurpose `TeamIntelligenceTile` (rendered `HomePage.tsx:212`). It already
   owns the "invite teammates" concept, already takes `userId`, and already uses the `HomeTile` wrapper.
   Swap its "Coming Soon / Get notified" waitlist CTA for a real "Invite a colleague — share your link"
   card that reads the user's own code. This puts the affordance on the dashboard without adding a tile.

**Destination for the menu item** — recommend a lightweight **modal** (mirrors the existing `InviteModal`
shell) over a dedicated route, for v1. If the referral sub-graph (below) grows, promote to a
`/me/invite` page. A modal keeps the first cut to link + copy + quota with no routing change.

## 1.2 What the user needs to see, and the data paths (confirmed against live DB)

Target content: **their `/join/<code>` link, copy-to-clipboard, uses remaining**, and (nice-to-have)
**who they've invited**.

**(a) Own code + quota — CLIENT-READABLE, no new RPC. Confirmed.**
- `invites` client grants to `authenticated`: only `REFERENCES/TRIGGER/TRUNCATE` (no direct SELECT grant),
  but the `invites_select_own` **RLS policy** (`FOR SELECT … USING (inviter_id = auth.uid())`) is what
  authorizes the read. A `supabase.from("invites").select(...)` returns only the caller's own rows.
- Columns exposed by that SELECT (from Stage 1 schema — note the real names):
  `code`, `inviter_id`, `uses_remaining`, `is_active`, `note`, `created_at`.
  ⚠️ There is no `quota`/`uses` column — **remaining uses is `uses_remaining`**.
- Build the link client-side: `${window.location.origin}/join/${code}` (same shape AdminInvites already
  uses).
- **Natural home for the helper:** add `getMyInvites()` (or `getMyInviteCode()`) to `lib/invites.ts`
  alongside `checkInvite`/`redeemInvite`:
  ```ts
  // returns the caller's own invite rows (RLS scopes to inviter_id = auth.uid())
  supabase.from("invites").select("code, uses_remaining, is_active, note, created_at")
          .order("created_at", { ascending: false })
  ```

**(b) "Who I've invited" (own referral sub-graph) — NOT client-readable; needs a new RPC. Confirmed.**
- `invite_redemptions` has **no anon/authenticated grants** (`REVOKE ALL`, Stage 1) → a client cannot read
  its own redemptions directly.
- Invitee profiles are behind `msl_profiles` own-row RLS (`"Users can view their own profile" … USING
  (auth.uid() = user_id)`) → a user cannot read invitees' names/companies either.
- Therefore, showing "you've invited N people: …" requires a **new SECURITY DEFINER RPC** — call it
  `my_referrals()` — that returns redemptions where `inviter_id = auth.uid()` joined to invitee
  name/company. This is the *user-scoped* twin of the admin `referral_graph()`: same shape, but the actor
  filter is hardwired to `auth.uid()` (no admin gate — every user may see their own). Load-bearing
  invariant still applies (no actor argument; the actor is `auth.uid()`).
- **Recommendation:** ship v1 with only (a) — link + copy + uses-remaining. Defer the sub-graph (b) and its
  RPC to a fast-follow; it's a delight feature, not a blocker to sharing.

## 1.3 Sent-email path — `send_invite_email(recipient_email, personal_note?)`

**Prerequisite (Garrett):** a transactional email provider account + API key. **Recommend Resend**
(simple REST API, good deliverability, Deno-friendly). No provider is wired today — the only "Resend"
references in the repo are in methodology/roadmap **docs**, not code. This is a hard blocker for the email
path (not for link-sharing).

**Shape — an Edge Function, reusing the existing pattern.** The repo already has two Deno Edge Functions
(`supabase/functions/generate-brief/`, `generate-hcp-synthesis/`); `send-invite-email` follows the same
mold:

- **Auth:** read the `Authorization` header, build a user-scoped client
  (`createClient(url, anon, { global: { headers: { Authorization: authHeader } } })`), call
  `auth.getUser()`, 401 if absent — exactly as `generate-brief/index.ts:237-262`.
- **Server-authoritative invite selection:** do NOT trust a client-supplied code. Inside the function,
  look up the caller's own active invite (service-role or definer read of `invites WHERE inviter_id =
  user.id AND is_active AND uses_remaining > 0`). This keeps the code server-picked and prevents a caller
  from emailing someone else's link.
- **Compose:** `joinUrl = ${APP_ORIGIN}/join/${code}` (APP_ORIGIN from a function env var, e.g.
  `https://app.besselanalytics.com`); subject "{inviterName} invited you to FieldMark"; body =
  inviter name + optional `personal_note` (sanitized) + the join link + a short product line.
- **Send:** `POST https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}` (secret set
  via `supabase secrets set`, never in the client). Return `{ ok: true }` or a mapped error.
- **Rate/abuse guard:** cap sends per user per window (the invite quota already bounds redemptions, but
  emailing should have its own light throttle to avoid using us as a spam relay).
- **Call site:** a `sendInviteEmail(recipientEmail, note?)` wrapper in `lib/invites.ts` using
  `supabase.functions.invoke("send-invite-email", { body })` — the same one-liner `lib/briefs.ts:87` uses;
  supabase-js attaches the session JWT automatically. Invoked from the invite modal's "Send by email" form.

**Env/secret checklist (Garrett):** `RESEND_API_KEY` (function secret), a verified sender domain in Resend,
and an `APP_ORIGIN`/`APP_URL` function env var so the link host isn't hardcoded.

## 1.4 Recommended build order (Part 1)

1. **Link-sharing UX — no external dependency, build FIRST.**
   - `getMyInvites()` in `lib/invites.ts` (client SELECT-own).
   - Invite modal/section: show `/join/<code>`, copy-to-clipboard, "N of 10 uses remaining".
   - Wire from UserMenu (ACCOUNT) + repurpose `TeamIntelligenceTile`.
   - Bonus quick win: stop discarding `RedeemResult.invite_code` at signup — it's the first share moment.
2. **Sent-email — needs the provider, build SECOND.**
   - Prereq: Garrett provisions Resend (API key + verified domain).
   - `send-invite-email` Edge Function (server-picks the code, sends via Resend).
   - `sendInviteEmail()` wrapper + "Send by email" form in the modal.
3. **(Fast-follow) Own referral sub-graph** — `my_referrals()` RPC + "who you've invited" list.

---

# PART 2 — COLD-USER ONBOARDING

## 2.5 First-run trace + what a zero-data user sees

**Flow: signup → WelcomeWizard → `/` (browse feed).** Not `/me`.
- `AuthWrapper.tsx:41-45` — the only first-run gate: any authenticated user with **no `msl_profiles` row**
  is redirected to `/welcome`.
- `WelcomeWizard.tsx:22-130` — a 4-step **profile-collection** form (name → company → function → territory).
  It is data capture, not orientation; it never explains what FieldMark does. On finish
  (`handleComplete`) it calls **`navigate("/")` (`WelcomeWizard.tsx:129`)**.
- `App.tsx:1349` — `/` is `<FeedLayout />` (the Oncology/NSCLC browse feed), populated with HCP cards
  independent of the user's own data. `App.tsx:1341` — `/me` (the personalized `HomePage`) is only reached
  via logo/nav. Note the inconsistency: returning sign-in goes to `/me` (`App.tsx:351`), but a *new* user
  goes to `/`.

**Consequence:** first-run never *looks* barren (the feed is full), but the user gets **zero orientation**
and never sees a "start here" moment. The dashboard that would host one is skipped.

**What `/me` shows a zero-data user** (`HomePage.tsx:189-215`, 10 parallel queries):
- **HomeHero** — "Good morning, {firstName}." then the literal line **"0 overdue follow-ups · 0 open
  actions · 0 watched investigators"** (`HomeHero.tsx:62-70`) + two pills to empty pages.
- **NextActionsTile** — "You're all caught up." / "No overdue or scheduled follow-ups."
- **YourInstitutionsTile** — returns `null` (hidden) when no pins.
- **CoverageGapsTile** — the one useful surface: for a fresh user in a supported TA it lists **untracked
  territory HCPs** with one-click "+ Track" (`CoverageGapsTile.tsx:218-402`). Hidden entirely when
  `gaps.length === 0` (`:108`) — so unsupported-TA users get nothing.
- **Overdue/Open Follow-Ups** — "You're all caught up." / "No open follow-ups."
- **RecentInsightsTile** — "No insights recorded yet. Start capturing what you observe."
- **RecentBriefsTile** — "No briefs generated yet. Generate one from any HCP."
- **TeamIntelligenceTile** — "No colleagues connected yet." + "Coming Soon."
- **RecentActivityTile** — "Your activity will appear here as you work."

Net: a wall of "0 / all caught up / coming soon," with Coverage Gaps the sole actionable tile.

## 2.6 Onboarding empty-state inventory (classified)

**ONBOARDING empty states (new user, no data) — the ones that matter here:**

| Component | Copy | Quality |
|---|---|---|
| `WatchlistsEmptyState.tsx:31-63` (all-tracked) | "You haven't tracked any HCPs yet." + "Explore cohorts or your Home page Coverage Gaps to start tracking investigators." + **"Open Coverage Gaps"** button → `/me` | **Good** — names a first action, links to it |
| `WatchlistsEmptyState.tsx:10-28` (a watchlist) | "This watchlist is empty." + "Add HCPs from any HCP detail page…" | OK — guides, no button |
| `FollowUpsEmptyState.tsx:35-55` | checkmark + **"You're all caught up."** + "Follow-ups appear here when you create them…" | **Weak/misleading** — "all caught up" implies completed work a new user never did; no CTA |
| `YourInstitutionsTile.tsx:94-116` | "No pinned institutions yet." + **"Browse institutions"** button | **Dead** — tile returns `null` at `:66` before this renders; cold user never sees it |
| `FieldInsights/EmptyInsightsState.tsx:18-39` | **"What do you know about {firstName} that FieldMark doesn't?"** + "Add Insight" | **Strongest prompt in the app** — but per-HCP (only on an HCP page), so a cold user with no tracked HCPs won't hit it |
| `FieldInsightsScreen.tsx` (`/me/insights`) | genuine empty state ("No field insights yet") exists at `:715-754` but is **unreachable** | **Broken** — see §2.5 note below |

**TA-data-absence states (NOT onboarding, listed for completeness):** `App.tsx:919-940` ("{indication} —
coming soon"), `App.tsx:943-967` ("Community cohort not available outside the US"), `App.tsx:873-907`
(Telescope availability), `SocialTrackEmpty.tsx`, `CoverageGapsTile` hide-on-empty for AD.

**⚠️ Correctness flag — Field Insights fabricated data.** `FieldInsightsScreen.tsx:78-184,218-227`
substitutes **`MOCK_INSIGHTS`** — 7 invented insights attributed to real-named KOLs (John V. Heymach,
Suresh Ramalingam, …) — whenever the user has zero insights. The real `EmptyState()` (`:715-754`) only
renders if `insights.length === 0`, which never happens because of the mock fallback. A cold user's
`/me/insights` therefore looks fully populated with fabricated notes about real people. This is more than an
onboarding gap — presenting invented data as genuine is a correctness/trust problem and should be removed
regardless of the onboarding work.

## 2.7 Is there any tour / first-run guidance? — No.

- **No** product tour, coach-marks, tooltip walkthrough, getting-started checklist, or orientation state
  anywhere. Grep for `tour|onboarding|getting started|coach|walkthrough|firstRun|welcome` surfaces only the
  profile wizard, the public `/demo` marketing video (`DemoPage.tsx`), and incidental string matches.
- **`WelcomeBanner.tsx` is dead code** — never imported or rendered (grep returns only the file itself).
  It's also hardcoded to "NSCLC." It would have shown a territory greeting with a dismiss "×".
- No `localStorage`/flag tracks "has seen tour." The only first-run signal is `msl_profiles.onboarded_at`
  (set `WelcomeWizard.tsx:118`) + the profile null-check gate — both gate the *form*, not orientation.

**Minimal "5-min-to-value" first-run (recommended shape):**
1. **Send new users to `/me`, not `/`** — change `WelcomeWizard.tsx:129` `navigate("/")` → `navigate("/me")`
   so first-run lands on the surface that can guide them. (Cheapest single highest-leverage change.)
2. **A dismissible first-run welcome state on `/me`** — revive the intent of `WelcomeBanner` (de-hardcode
   the TA): "Welcome to FieldMark. Here's how to get value in 5 minutes:" with 2-3 concrete next actions,
   dismiss persisted via a profile flag or localStorage.
3. **Frame Coverage Gaps as the first action** — it already is the de-facto "sample HCPs to explore" (it
   lists untracked territory HCPs with one-click Track). Give it an onboarding header for zero-data users
   ("Start here — track your first investigator") and a fallback for unsupported-TA users so it never leaves
   the user with nothing.
4. **Fix Follow-Ups empty copy** — replace "You're all caught up." with a new-user variant that doesn't
   imply prior work, plus a CTA.
5. **Fix Field Insights** — remove the mock-data fallback so the real empty state (with its "Add Insight"
   prompt) shows.

## 2.7b Polish batch (locate + confirm)

| # | Item | file:line | Current | Verdict |
|---|---|---|---|---|
| a | Signup email label | `SignupScreen.tsx:183` | `placeholder="Work email"` | **STILL-NEEDS-FIX** → "Email" |
| b | Wizard company pre-fill | `WelcomeWizard.tsx:30`, input `:225-232` | `useState("")`; only first/last **name** prefilled from OAuth (`:35-54`); no company guess, placeholder only | **ALREADY-FIXED** |
| c | Wizard job_function "Other" | `WelcomeWizard.tsx:236-265`, persist `:116` | picks "Other" → `setJobFunction("other")` (`:249`), stores raw `"other"`; **no free-text input** | **STILL-NEEDS-FIX** → capture free-text |

Detail on (c): there's no conditional text input when `jobFunction === "other"`, no separate state, and no
`job_function_other` column. The fix needs both a small UI addition (free-text when Other is selected) and a
place to store it — either a new nullable `msl_profiles.job_function_other` column or storing the free-text
directly in `job_function`.

---

## 8. Consolidated build plan (dependency-ordered)

**A. Quick wins — no dependency, do first (small, high-leverage):**
- Polish (a) "Work email" → "Email" (`SignupScreen.tsx:183`).
- Polish (c) job_function "Other" free-text (`WelcomeWizard.tsx` + a nullable column).
- Redirect new users to `/me` after the wizard (`WelcomeWizard.tsx:129`).
- Remove Field Insights mock-data fallback so the real empty state shows.

**B. Link-sharing UX — no external dependency:**
- `getMyInvites()` in `lib/invites.ts` (client SELECT-own; `uses_remaining`, `code`).
- Invite modal/section: `/join/<code>`, copy button, "N of 10 uses remaining".
- Entry points: UserMenu ACCOUNT item + repurpose `TeamIntelligenceTile`.
- Stop discarding `RedeemResult.invite_code` at signup.

**C. Cold-user first-run guidance — no external dependency:**
- Dismissible `/me` welcome state (de-hardcoded `WelcomeBanner` intent) with 2-3 first actions.
- Coverage Gaps onboarding framing + unsupported-TA fallback.
- Fix Follow-Ups "all caught up" new-user copy.

**D. Sent-email invite — BLOCKED on provider (Garrett provisions Resend first):**
- Prereq: `RESEND_API_KEY` (function secret), verified sender domain, `APP_ORIGIN` env var.
- `send-invite-email` Edge Function (auth-gated, server-picks the caller's code, sends via Resend,
  throttled).
- `sendInviteEmail()` wrapper + "Send by email" form in the invite modal.

**E. Fast-follow — own referral sub-graph:**
- `my_referrals()` SECURITY DEFINER RPC (actor hardwired to `auth.uid()`, no admin gate) — user-scoped twin
  of admin `referral_graph()`.
- "Who you've invited" list in the invite modal/page.

**Bounding:** A+B+C are all no-dependency and deliver a frictionless share link + a real first-run without
waiting on anything external. D is the only provider-gated piece. E is delight, not launch.
