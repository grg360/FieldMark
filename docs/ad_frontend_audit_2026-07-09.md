# FieldMark Frontend Audit — Atopic Dermatitis Repoint

**Date:** 2026-07-09
**Scope:** Read-only audit to scope adding Atopic Dermatitis (AD) as a therapeutic area alongside NSCLC/Hepatology, and repointing cohort views to new backend tables.
**Method:** Static read of `frontend/src`, backend RPC/migration SQL, plus live verification against Postgres (`DATABASE_URL`, service role) and the PostgREST anon path.
**Stack:** Vite + React 18 + TypeScript, `react-router-dom` v7, `@supabase/supabase-js` v2, recharts, react-force-graph-2d. ~177 source files. Data layer centralized in `frontend/src/lib/api.ts` (~4,300 lines).

---

## TL;DR

The cohort **UI is well-parameterized** — one component renders all three cohorts for all TAs. Three things push AD from "config change" to real work:

1. **AD's ta_id (`9e4139d2…`) is not registered anywhere in the frontend.** The app knows an unrelated `immunology` TA (`4cf07827…`, AD's *parent*); AD exists only as a disabled *indication* under it.
2. **Indication selection does not scope cohort queries** — the feed is keyed on TA only. AD-as-an-indication won't fetch AD data without new plumbing. → AD must be its own TA chip.
3. **Cohort data flows through Postgres RPCs, not table names.** "Repointing tables" is mostly a database-function job; the two *new* AD models (Rising 2-axis, Community operational tables) need new RPCs.

**Overall lift: Medium**, with one Large component (Community). Established is nearly free.

Plus one finding outside the original scope: **the four new AD tables shipped with RLS disabled** — a data-exposure launch blocker (see §7).

---

## 1. Architecture map

**Cohort surfaces are one parameterized component, not per-cohort files.** `App.tsx` defines `FeedLayout` (lines 342–1021), which renders Established / Rising / Community / Social / Telescope / Field-Intelligence by branching on a `track` string from `TrackContext`. The cohort feed is a shared `.map` over `<HCPCard>` (App.tsx:895–906); fetch dispatch is a 3-way branch on `track` (App.tsx:456–462, 497–503, 533–539) calling `getEstablished` / `getCommunity` / `getRisingStars`.

**Routing** (App.tsx:1212–1263) is TA-scoped: `/:ta/:dashboard/:indication` → `FeedLayout`. Slugs resolve in `routeSlugs.ts`.

**One shared card** — `HCPCard.tsx` (1,178 lines) renders all cohorts, branching internally on `hcp.cohort_classification` (never a prop). Same for `DetailScreen.tsx`. **Adding AD is config + data-layer, not new components** — for Established.

**TA selection is fully hardcoded, and Immunology is hard-disabled:**
- `TAFilterChips.tsx`:10 — `TA_CHIPS = ["Oncology", "Hepatology", "Immunology", "Rare Disease"]`; line 29 `if (chip === "Immunology") return;` + disabled styling (56–75). **No Atopic Dermatitis chip exists.**
- `routeSlugs.ts`:8–20 — `TA_SLUG_TO_LABEL` / `TA_LABEL_TO_SLUG` hardcoded.
- `api.ts`:657–663 — `TA_ID_MAP` hardcodes 5 ta_ids. **AD's `9e4139d2-e062-4a58-8728-cdabb2d7dca1` is absent.** Only `immunology: 4cf07827…` (AD's parent) is present.
- `IndicationFilter.tsx`:14–59 — indications hardcoded. **"Atopic Dermatitis" already appears (line 51) as `active: false` under Immunology.**

---

## 2. Data layer

**How the frontend reads Supabase:** a single shared client (`lib/supabase.ts` — anon URL/key committed inline), consumed by a **services layer** of plain async functions in `lib/api.ts` plus feature libs (`home.ts`, `relationships.ts`, `watchlists.ts`, etc.). **No React Query / SWR** — components call `getEstablished(...)` in `useEffect`, hold results in `useState` (App.tsx:478–523).

**Critical nuance: the cohort feed does not read cohort tables by name — it calls Postgres RPCs.** `fetchCohortViaRpc` (api.ts:495–557) calls `get_established_filtered` / `get_rising_star_filtered` / `get_community_filtered` (+`_count`), passing `p_ta_id`. The `.from("hcp_*_ranks_v3")` references are only enrichment lookups. **So repointing cohorts is as much a database-function change as a frontend change.**

**Repoint surface — cohort tables & RPCs by cohort:**

| Cohort | Frontend fn | RPC | Live RPC reads | AD target (per brief) |
|---|---|---|---|---|
| Established | `getEstablished` (api.ts:976) | `get_established_filtered` | `hcp_established_ranks_v3` | **`hcp_established_ranks_v3`** — *same table* |
| Rising | `getRisingStars` (api.ts:934) | `get_rising_star_filtered` | `hcp_rising_star_ranks_v3` (old momentum) | **`hcp_rising_composite_v1` + `hcp_scientific_emergence_v1`** — *new shape* |
| Community | `getCommunity` (api.ts:1018) | `get_community_filtered` | `hcp_community_ranks_v2` | **`community_practitioners` + `community_practitioner_payments`** — *new operational tables* |

All three RPCs are **ta_id-parameterized and `SECURITY INVOKER`** (verified against `pg_proc`). Established RPC already reads v3; Rising RPC reads v3 (old model); Community RPC reads v2.

**Pagination:** the known 1000-row issue is *mostly* handled. The feed uses server-side RPC pagination (`p_limit`/`p_offset`, api.ts:530–534) + 20-row "Load More" UI (App.tsx:525–547). A `fetchAllPaginated` helper (1000-page loop) exists at api.ts:843. Watch spots: a raw `.limit(10000)` at api.ts:1217 and various `.in("hcp_id", hcpIds)` batch lookups (bounded by page size in the feed). Any AD code path fetching a full cohort at once should reuse `fetchAllPaginated`.

---

## 3. The Rising 2×2 → 2-axis rework

The **old momentum/visibility 2×2 is real and threaded deep.** It renders in **three on-screen blocks**:

1. **HCPCard 2×2 grid** — `HCPCard.tsx`:952–986, gated on literal `cohort === "rising_star"`. Four `RisingStarSignalTile`s (tile 44–113) reading `scientific_momentum_percentile` (964), `network_momentum_percentile` (970), `scientific_visibility_percentile` (976), `network_visibility_percentile` (982).
2. **`ScoreBreakdownV3Rising.tsx`** (in DetailScreen) — 2×2 of four `ScoreKpiTile`s at 160–192 reading the same four fields; headline `rising_star_percentile` (104), archetype badge (105, 125–141), footer narrative on `momentum_component`/`visibility_component` (202–203).
3. **DetailScreen inline "Network Trajectory"** — `DetailScreen.tsx`:1706–1825, subtext reading `network_momentum_percentile` (1821).

**New AD model is simpler** — from `scripts/score/rising_composite_scoring.py`, `hcp_rising_composite_v1` row shape:
```
therapeutic_area_id, scope_type, scope_value, hcp_id,
rank, rising_composite_score,
emergence_pctile,            -- Emergence axis
network_influence_pctile     -- Network axis  (default weights 0.75 / 0.25)
```
Two axes, not four. `network_influence_pctile` is the **same field name Established already uses**, so the frontend type already carries it. `RisingStarSignalTile` is reusable as-is.

**To swap the model:** the *visual* change is small — collapse two 2×2 grids to two tiles each (HCPCard 952–986; ScoreBreakdownV3Rising 160–205) + one DetailScreen subtext. The *cost* is the data layer: a new RPC over the composite/emergence tables + re-mapping ~6 field sites (`api.ts` mappers/selects, `types.ts`:102–108, `hcpData.ts`:68–74, `App.tsx`:320–326). **`archetype` appears orthogonal to the new axes** — decide whether it survives (the new model doesn't emit it).

---

## 4. Cohort card anatomy (Established template)

`HCPCard.tsx` is the shared template AD mirrors. Root `<div className="fm-hcp-card">` at 704; render order: identity (719–826) → score badge top-right (828–859) → cohort badges (888–924) → narrative band (926–950) → stat pills (952–1054) → operational badges (1056–1173).

- **Composite score:** 849–851, `formatScoreInt(hcp.cohortScore ?? hcp.score)`.
- **#rank:** 852–858, `#{displayRank}` + country + optional `· #N GLOBAL`.
- **Scientific / Network / Pharma chips:** `cohortStatKeys → ["SCIENTIFIC","NETWORK","PHARMA"]` (255); values via `statValueForKey` (280–285): `scientificInfluencePctile` / `networkInfluencePctile` / `pharmaEngagementPctile`, rendered as `StatPillWithTooltip` (988–1053).
- **Narrative:** 926–950 — card shows only `why_now ?? narrative` (3-line clamp). `engagement_angle` / `caution_flags` / `signal_strength` surface only in DetailScreen.
- **Badges:** left-border tier accent `cohortBorderAccentColor` (263–277: Established `#FFD700`); Dark Horse (889–906) / Workhorse (907–924); rising archetype pill (758–781).
- **Cohort branching:** all on `hcp.cohort_classification` — `cohort`/`effectiveCohort` (491–495), `isDarkHorse`/`isWorkhorse`/`isCommunityPlain` (500–502). This is the seam AD data flows through once `cohort_classification` is populated.

**Cleanup before cloning the template:** a `console.log` gated on `last_name === "McKean"` (HCPCard.tsx:513–524) and a large unused `renderScoreChip()` (569–700). NSCLC strings live in `StatPillWithTooltip.tsx` (line 79 "Career NSCLC publications"; line 59 conference hashtags).

---

## 5. Concrete diff to light up AD **Established** (frontend)

Smallest shippable slice — makes AD selectable and renders real Established data, `HCPCard` untouched. Recommended: a **dedicated top-level "Atopic Dermatitis" TA chip** bound to ta_id `9e4139d2`, mirroring how the "Oncology" chip is really NSCLC.

1. **Register the ta_id** — `api.ts`:657 add to `TA_ID_MAP`: `"atopic-dermatitis": "9e4139d2-e062-4a58-8728-cdabb2d7dca1"`. Also `TA_DISPLAY_BY_ID` (api.ts:2149) → `"9e4139d2…": "Atopic Dermatitis"`, and `resolveTASlug`'s `slugByLabel` (api.ts:825).
2. **Slug ↔ label maps** — `routeSlugs.ts`:8–20 add both directions; `taLabelToApiSlug` (119) add `case "Atopic Dermatitis": return "atopic-dermatitis";` (**load-bearing** — the feed passes this as `filters.therapeuticArea`, which must be a `TA_ID_MAP` key).
3. **Add the chip + make it clickable** — `TAFilterChips.tsx`:10 add `"Atopic Dermatitis"`; remove the Immunology disable guard (29) and disabled styling (56–75).
4. **Give the TA an indication list** — `IndicationFilter.tsx`:14 add `"Atopic Dermatitis": [{ label: "All", active: true, count: <n> }]`; add matching slug map in `routeSlugs.ts`:88.
5. **Un-hardcode the detail route** — `App.tsx`:1051 change `therapeuticArea: "nsclc"` → `therapeuticArea: taLabelToApiSlug(selectedTA)` (selectedTA already read at 1030). Also `InstitutionsInTerritoryPanel taSlug="nsclc"` (App.tsx:841).

~6 files, all additive to hardcoded maps. **No `HCPCard` change, no new RPC** — Established rides the existing generic function.

---

## 6. Live data verification (service role, via `DATABASE_URL`)

| Table | AD rows (`9e4139d2`) | Control | Status |
|---|---|---|---|
| `hcp_established_ranks_v3` | **7,462** (global 5,131 / region-US 447) | NSCLC 22,364 | ✅ populated |
| `hcp_rising_composite_v1` | **5,719** (global 3,052 / region 2,667) | — | ✅ populated |
| `hcp_scientific_emergence_v1` | **3,052** | — | ✅ populated |
| `community_practitioners` | 19,351 (not TA-keyed) | — | ⚠️ raw, no cohort model |
| `community_practitioner_payments` | present (`ad_drug_payments_3yr` etc.) | — | ⚠️ raw operational |
| `hcp_narratives_v2` (slug `atopic-dermatitis`) | **0** | NSCLC 3,213 | ❌ not generated |

`therapeutic_areas` record confirmed: `Atopic Dermatitis` / slug `atopic-dermatitis` / `ta_level=indication` / parent Immunology `4cf07827`.

**Community tables are a different shape**, not a repoint: keyed on `npi_number` with nullable `matched_hcp_id`, **no `therapeutic_area_id`, no `rank`/`composite_score`**. Many practitioners aren't linked to `hcps_v2`, so the existing `getCommunity` → `HCPCard` → `/hcp/:id` flow won't work for them. This is why the uncommitted `CommunityExplorer.jsx` + "Community Explorer" PNG mockups exist at repo root — Community is being redesigned around these operational tables.

---

## 7. RLS / anon-path verification — data-exposure finding

Verified via Postgres catalog (`pg_class.relrowsecurity`, `pg_policies`) and live anon PostgREST probes with the committed anon key.

| Table | RLS | Policy | Anon can read? |
|---|---|---|---|
| `hcp_established_ranks_v3` | ON | `Authenticated read access → authenticated` | ❌ logged-in only |
| `hcp_rising_star_ranks_v3` | ON | `Allow public read access → public` | ✅ |
| `hcps_v2` | ON | `hcps_v2_public_read → public` | ✅ |
| `hcp_narratives_v2` | ON | `hcp_narratives_v2_public_read → public` | ✅ |
| `hcp_rising_composite_v1` | **OFF** | none | ✅ (wide open) |
| `hcp_scientific_emergence_v1` | **OFF** | none | ✅ (wide open) |
| `community_practitioners` | **OFF** | none | ✅ (wide open) |
| `community_practitioner_payments` | **OFF** | none | ✅ (wide open) |

**Interpretation of the anon probe:** bare anon (no session) got `*/0` on `hcp_established_ranks_v3` for **both** AD and NSCLC, and the `SECURITY INVOKER` RPC inherited that empty result. That's expected — the real app runs behind `AuthWrapper` (authenticated JWT), and the policy admits `authenticated`. So:

> **AD Established is NOT blocked** — it inherits the exact working posture of production NSCLC (data exists, RPC generic, RLS admits authenticated). Ship the §5 diff → renders for logged-in users.

**The real surprise (opposite of the worry):** the four new AD tables have **RLS disabled entirely** — readable by anyone with the public anon key (committed in the JS bundle), no login. Most sensitive: **`community_practitioner_payments`** — Sunshine Act payment detail on 19,351 named practitioners with NPIs.

**Fix (drafted, not run):** `migrations/2026_07_09_ad_tables_rls_lockdown.sql` — enables RLS + `authenticated`-only read on all four, revokes the `anon` grant. Pipelines use `DATABASE_URL` (service_role/postgres, bypasses RLS) so ingestion/scoring are unaffected. **Launch blocker on the security side; independent of frontend timing.**

---

## 8. Revised lift & recommended sequence

| Cohort | Data | Backend | RLS/readable | Frontend | Lift |
|---|---|---|---|---|---|
| Established | ✅ 7,462 (narratives pending) | ✅ RPC generic, reads v3 | ✅ authenticated (= NSCLC) | §5 config diff | **Small** |
| Rising | ✅ 5,719 + 3,052 | ⚠️ new RPC | 🔴 RLS off — lock down | 2-tile rework | **Medium** |
| Community | ⚠️ 19,351 raw, no model | ⚠️ new model + RPC | 🔴 RLS off — lock down (payments!) | new UI (in flight) | **Large / separate** |

**Recommended order:**
1. **Run the RLS lock-down** (`migrations/2026_07_09_ad_tables_rls_lockdown.sql`) — regardless of frontend timing.
2. **Ship AD Established** behind the §5 diff — fastest path to a live second TA (minus narratives until backend gen runs).
3. **Rising** — data's ready; bounded rework (one RPC + two-tile render).
4. **Community** — scope as its own project aligned with the CommunityExplorer redesign, not the legacy card.

---

## Risks / surprises (consolidated)

1. 🔴 **Indication does not scope cohort data** (App.tsx:454, 494–495) — AD must be its own top-level TA chip, not the disabled Immunology indication.
2. 🔴 **New AD tables have RLS off** (§7) — data exposure, esp. payments.
3. 🟠 **Hardcoded NSCLC**: `getHCPDetail(..., "nsclc")` (App.tsx:1051); `InstitutionsInTerritoryPanel taSlug="nsclc"` (841); `isTelescopeAvailable` Oncology/NSCLC (124); `StatPillWithTooltip` NSCLC labels. Build doc estimates ~74 files / 246 references.
4. 🟠 **"Oncology" is really NSCLC** — `taLabelToApiSlug("Oncology") → "nsclc"`. AD follows the same one-chip = one-ta_id pattern.
5. 🟠 **AD narratives = 0** — cards render but show "Narrative generating" until backend gen (build-doc step 12).
6. 🟡 **No shared TA config** — TA identity duplicated across ≥5 hardcoded maps. A central `TA_REGISTRY` would de-risk AD and future TAs (backend already moved to JSON-per-TA; frontend has no equivalent).
7. 🟡 **Left-behind debug/dead code** in the card template (HCPCard.tsx:513–524 console.log; 569–700 unused `renderScoreChip`).

---

*Generated during a Claude Code session, 2026-07-09. Findings verified against live Postgres + PostgREST at time of audit.*
