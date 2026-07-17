# First-Run Guidance — Cold-User Audit

**Date:** 2026-07-17 · **Scope:** read-only. What a brand-new MSL sees on `/me` at first-run (they now land
there after the wizard), and the minimal orientation to add. **Nothing was changed.** Goal: light orientation,
not a tour.

---

## 0. Headline findings

1. **The one surface designed to onboard an MSL is silently hidden from every new signup.** `CoverageGapsTile`
   (untracked rising-star HCPs in your territory, each with one-click **+ Track**) reads `territory_states` +
   `therapeutic_areas` from `msl_profiles`, but the WelcomeWizard writes `states_covered` + `region` and **never
   populates those two columns** — they stay NULL until the user visits Profile settings and saves. Verified
   against both real signups: `states_covered` set (Northeast), `territory_states = NULL`, `therapeutic_areas =
   NULL`. Result: `getCoverageGapsForUser` returns `[]`, and the tile returns `null`. **Fixing this column
   mismatch is the single highest-leverage first-run improvement and needs no new UI.**
2. **The most intuitive MSL "aha" action — search a KOL you know — is not available on `/me`.** The TopBar search
   bar only renders when given `currentTaId` + `onSearchSelect` (`TopBar.tsx:82,106`); `AppLayout` (which `/me`
   uses) passes neither (`AppLayout.tsx:37`). Search exists only inside the feed. A cold user on their landing
   page cannot search.
3. **The page is dominated by invite CTAs and zero-states, with nothing orienting the MSL to their own first
   productive action.** Of 12 tiles: 3 HELPFUL-but-invite-oriented, 2 gentle "start capturing" nudges, 3 BARREN
   zero panels, 2 MISLEADING "all caught up", 2 HIDDEN. No tile frames itself as "start here."
4. **Personalization data IS available at first-run.** `allowed_ta_slugs` (server-set at redemption — reliably
   `{oncology, immunology}`), `region`, `states_covered`, `company`, `job_function` are all populated. So
   onboarding copy can say "explore your Oncology KOLs," not generic. (Caveat in §5.)
5. **Scaffolding to build on already exists:** the `WelcomeShareBanner` I just shipped is a one-time,
   dismissible, sessionStorage-gated card on `/me` — the exact pattern to clone for an orientation card. No tour
   library is (or needs to be) installed.

---

## 1. What `/me` renders for a cold user (tile by tile)

Render order from `HomePage.tsx:193-220` (the `summary && userId` block). All summary counts are 0 for a new user.

| # | Tile | file:line | Cold render | Class |
|---|------|-----------|-------------|-------|
| 1 | WelcomeShareBanner | `WelcomeShareBanner.tsx:16` | "You're in! Welcome to FieldMark." + invite link (once, sessionStorage-gated) | HELPFUL |
| 2 | HomeHero | `HomeHero.tsx:36` | "**0 overdue follow-ups · 0 open actions · 0 watched investigators**"; pills "View Follow-Ups" / "Open Watchlists" (→ empty pages); territory line hidden | BARREN |
| 3 | NextActionsTile | `NextActionsTile.tsx:92` | "**You're all caught up.**" / "No overdue or scheduled follow-ups." | MISLEADING |
| 4 | InviteColleaguesTile | `InviteColleaguesTile.tsx:12` | "Share your personal link…" + invite link | HELPFUL |
| 5 | YourInstitutionsTile | `YourInstitutionsTile.tsx:14` | returns `null` (no pins, `:66`) | HIDDEN |
| 6 | **CoverageGapsTile** | `CoverageGapsTile.tsx:17` | returns `null` — empty gaps from the `territory_states` mismatch (`:108`) | **HIDDEN** |
| 7 | OverdueFollowUpsTile | `OverdueFollowUpsTile.tsx:22` | checkmark + "**You're all caught up.**" | MISLEADING |
| 8 | OpenFollowUpsTile | `OpenFollowUpsTile.tsx:33` | "No open follow-ups." | BARREN |
| 9 | RecentInsightsTile | `RecentInsightsTile.tsx:44` | "No insights recorded yet. Start capturing what you observe." | HELPFUL |
| 10 | RecentBriefsTile | `RecentBriefsTile.tsx:10` | "No briefs generated yet. Generate one from any HCP." | HELPFUL |
| 11 | TeamIntelligenceTile | `TeamIntelligenceTile.tsx:9` | "Coming Soon"; "No colleagues connected yet."; "Get notified →" | HELPFUL |
| 12 | RecentActivityTile | `RecentActivityTile.tsx:145` | "Your activity will appear here as you work." | BARREN |

**Read of the page:** not *totally* barren — the invite banners and the "start capturing / generate one" nudges
give it some life — but everything a cold MSL sees is either about inviting *other* people, a literal zero, or a
misleading "all caught up." The two tiles that would pull them into the actual product loop (Coverage Gaps, Your
Institutions) are hidden. The MSL is never shown a single HCP.

**Two copy fixes worth noting** (cheap, high-signal): HomeHero's triple-zero stat line and the two "You're all
caught up" panels (Next Actions, Overdue) read as "you've finished your work" to someone who has done nothing.

---

## 2. Highest-value first actions (the "aha")

For an MSL, the product clicks when they see FieldMark already knows their world. Ranked:

1. **Search a KOL they personally know** → they type a name they respect, and FieldMark surfaces rich scored
   intel (rank, archetype, publications, payments, network). Instant "this is real." **This is the strongest
   aha — and it's currently unreachable from `/me`** (§0.2). Highest value, biggest gap.
2. **Explore rising stars in their TA/territory** → "here are up-and-coming KOLs in Oncology you're not tracking
   yet." This is exactly what CoverageGapsTile is built to do — surface untracked, territory-scoped rising stars
   with one-click **+ Track**. The intended onboarding loop; currently hidden (§0.1).
3. **Track their first HCP** → the first save that makes the dashboard theirs (turns the zeros into real
   counts, seeds watchlists/follow-ups/briefs). This is the conversion the whole `/me` page is waiting for.

The through-line: **get the MSL to look at one real HCP.** Search (a KOL they know) and Coverage Gaps (KOLs they
don't) are the two doors, and both are currently closed on the landing page.

---

## 3. Scaffolding to build on

- **No tour library** in `package.json` (no joyride/shepherd/intro.js/driver.js) — and none is needed for a light
  orientation.
- **`WelcomeBanner.tsx` is gone** (deleted in the earlier cleanup). But its replacement pattern is better:
- **`WelcomeShareBanner.tsx` (just shipped) is the reusable scaffold** — a one-time, dismissible card on `/me`,
  gated on a sessionStorage key, that returns `null` once dismissed. Cloning it for a "Start here" orientation
  card is the natural, lightest path. `HomeTile.tsx` is the card primitive; the dark palette is established.
- **Empty-state components already exist** and are mostly reusable copy; two need a new-user variant (§1). The
  `WatchlistsEmptyState` even has a good "Open Coverage Gaps" CTA (→ `/me`) — which only helps once Coverage Gaps
  actually renders.
- **CoverageGapsTile is fully built** (rows, Track button, AI-synthesis blurbs, rank pills). It needs *data*, not
  code — see §0.1. So most of "show the MSL an HCP" already exists behind the column bug.

Net: this is **mostly wiring/data, lightly net-new UI** — not a from-scratch onboarding build.

---

## 4. Recommended minimal design (orientation, not a tour)

**A one-time, dismissible "Start here" card at the top of `/me`**, personalized by TA, with 2-3 suggested first
actions — cloning the `WelcomeShareBanner` pattern (sessionStorage-gated so it shows for the first few visits,
then goes away; a "Dismiss" also clears it).

Suggested content (personalized via `allowed_ta_slugs` → primary TA label, e.g. "Oncology"):
- **"Explore your Oncology rising stars"** → the feed (`/oncology/rising-stars/nsclc`). One click into real HCPs.
- **"Look up a KOL you know"** → opens search (requires wiring search onto `/me`, or routes into the feed where
  search lives).
- **"Track your first HCP"** → framed as the payoff; naturally satisfied by the above two.

**But the highest-leverage move needs no card at all:** fix the `territory_states`/`therapeutic_areas` mismatch so
**CoverageGapsTile renders for new users**. That instantly turns the dead middle of the page into a personalized
"here are 5 untracked HCPs in your Northeast Oncology territory — + Track" surface. If only one thing ships, ship
this.

Keep it to: the data fix + one dismissible card + the two empty-state copy fixes. No multi-step tour, no
coach-marks, no library.

---

## 5. Personalization available at first-run (Q5)

**Available and reliable** (populated before the user touches Profile settings):
- `allowed_ta_slugs` — server-set at redemption, e.g. `{oncology, immunology}`. Use for "explore your **Oncology**
  KOLs." *This is the one to key onboarding copy off.*
- `region` (e.g. `northeast`), `states_covered` (the actual state list), `company`, `job_function` — all set by
  the wizard.

**NOT available at first-run** (NULL until Profile settings is saved — this is the §0.1 bug):
- `territory_states`, `therapeutic_areas` — the columns `getUserTerritoryContext` / CoverageGaps actually read.

**Caveats to design around:**
- `allowed_ta_slugs` is the *entitlement set* (all live TAs), not a single picked TA — the wizard never asks
  which TA is primary. `default_ta_slug` exists (`oncology` on recent signups) and is a better "primary TA"
  signal for copy. Granularity is TA-level ("Oncology") + territory (the `states_covered` list), which is plenty
  for "explore your Oncology KOLs in the Northeast."
- `TA_SLUG_TO_UUID` (`home.ts`) currently maps **only NSCLC** → so even once `therapeutic_areas` is populated,
  coverage resolves to NSCLC only. Fine for launch (Oncology/NSCLC is the live cohort), but note it when
  extending to Immunology/AD.

---

## 6. Minimal build plan (dependency-ordered)

1. **Fix the Coverage-Gaps data mismatch (highest leverage, ~no new UI).** Make the cold user's territory/TA
   reach the coverage function. Two options:
   - (a) Have the wizard's completion write `territory_states` (= `statesCovered`) and `therapeutic_areas`
     (derived from `allowed_ta_slugs`/`default_ta_slug`) alongside the existing columns — the smaller change; or
   - (b) Have `getUserTerritoryContext` fall back to `states_covered` + `allowed_ta_slugs` when the `territory_*`
     columns are empty — no write-path change, covers existing users too.
   Recommend **(b)** (fixes already-signed-up users too), or both. This un-hides CoverageGapsTile for new users —
   the whole first-run "show them an HCP" goal, for free.
2. **One-time "Start here" orientation card** on `/me`, cloned from `WelcomeShareBanner`, personalized by
   `default_ta_slug`/`allowed_ta_slugs`, 2-3 actions, dismissible.
3. **Two empty-state copy fixes**: HomeHero's zero line and the "You're all caught up" panels get a new-user
   variant that doesn't imply completed work.
4. **(Optional) Wire KOL search onto `/me`** so "look up a KOL you know" is reachable at first-run — pass
   `currentTaId` (from `default_ta_slug`) + an `onSearchSelect` into AppLayout's TopBar. Higher value but more
   than a copy change; can follow.

**Bounding:** items 1-3 are light and deliver a real orientation (a personalized HCP surface + a start-here card +
honest empty states). Item 4 is the stretch that closes the search gap. No tour, no library, no heavy build.
