# FieldMark v1.1 Priority Backlog — Updated May 10, 2026

**Updated:** May 10, 2026 (post-dedup session)
**Status:** Living document — updates to v1.1 priority order

---

## v1.1 Priorities (ordered)

### Priority 1: Cohort classification methodology execution

**Status:** Methodology drafted (US-only, three-path Established framework). Implementation pending.

The methodology document captures:
- Three paths for Established classification (output+career / high-volume / recognized-advisor)
- Community as structural ("out in the wild") + Open Payments TA engagement
- Dark Horse for Community (high Medicare + low pharma engagement)
- US-only filter applied throughout

**Why this is priority #1:**
- TrackSwitch's Community and Established tracks currently show placeholder behavior
- Cohort badges on cards don't reflect real classification yet
- Landscape filter is blocked behind this
- All v1.0 customer demos benefit from clean cohort classification

**Estimated effort:** 3-5 sittings (methodology refinement, SQL implementation, validation, frontend wiring)

---

### Priority 2: HCP duplicate prevention (NEW — elevated from "future consideration")

**Status:** Cleanup work substantially complete (5,551 merges across 5 passes on May 9-10). Frontend dedup utility deployed at display layer. **Ingestion-time prevention work NOT YET DONE.**

**Why this is priority #2:**
Current state: historical duplicate accumulation is cleaned up. Frontend dedup catches edge cases at display time.

**The unsolved problem:** Future ingestion runs will create new duplicates the same way old runs did. Without ingestion-time prevention, every publication backfill, NPPES enrichment, and Open Payments ingestion will re-introduce the duplicate problem.

**What needs to happen:**

1. **Modify publication backfill script** to match incoming authors against existing HCPs by OpenAlex ID + name before INSERT
2. **Modify NPPES enrichment script** to join to publication-source rows by NPI matching before creating new HCP rows
3. **Modify Open Payments ingestion** to use NPI as primary key for HCP lookup
4. **Build institution normalization map** (~50 entries covering major AMCs) for consistent matching
5. **Schedule periodic dedup runs** of the existing `merge_hcp_pair` function and wrappers (Pass 2, 5, 6, 7B) — catches what slips through

**Forcing functions in place:**
- Comment blocks added to top of each ingestion script flagging the dependency
- This backlog item explicitly elevated to priority #2
- `hcp_dedup_prevention_addendum.md` documents implementation scope

**Estimated effort:** 3-5 sittings across script modifications and scheduled job setup

**Reference docs:**
- `hcp_dedup_completion_plan.md` — overall dedup roadmap
- `hcp_dedup_prevention_addendum.md` — specific prevention implementation scope
- `hcp_dedup_pass_2_completion_log.md` — what cleanup accomplished
- `hcp_deduplication_design.md` — full design document

---

### Priority 3: MSL crowdsourcing release (LinkedIn auth + tag UI)

**Status:** Frontend disclosure card built. LinkedIn OAuth submission planned for week of May 11. Real implementation pending.

Implementation requires:
- LinkedIn OAuth approval (submitted next week)
- MSL contributor verification flow
- Hashtag submission UI activation
- Personal-impact view (which MSLs surfaced which HCPs)
- Auditing and moderation for contribution quality

**Estimated effort:** 4-6 sittings post-OAuth-approval

---

### Priority 4: Landscape rewiring with cohort filter

**Status:** Deferred behind cohort classification execution. Current Landscape uses hardcoded city markers.

**What needs to happen:**
- Replace hardcoded `RARE_DISEASE_MARKERS`, `ONCOLOGY_MARKERS` etc. with `getLandscapeData(taSlug)` API call
- City-level HCP feed wired to real `getCityHCPs(city, taSlug, options)` query
- Cohort filter chip row on CityFeedScreen (All / Rising Stars / Community / Established)
- US-only for v1.0 (international expansion in v1.5+)

**Why this is priority #4:**
Depends on cohort classification (priority #1) being meaningful. The cohort filter isn't useful without real classifications behind the labels.

**Estimated effort:** 2 sittings (after priority #1 lands)

---

### Priority 5: Pre-ASCO capture infrastructure

**Status:** Schema designed, not executed. Capture scripts exist but dormant since April 27.

**Deadline:** ASCO is May 29 – June 2. Infrastructure needs to be ready by ~May 27.

**What needs to happen:**
- Execute schema SQL (`social_candidates`, `msl_users`, etc.)
- Test small Twitter capture to confirm script works after dormancy
- Build Bluesky capture script
- Build promotion pipeline (raw social_users → social_candidates with bio-text confidence)
- Refactor capture script to read from `active_capture_hashtags` table

**Note:** Has the only real external deadline among these priorities.

---

## Reordered from prior backlog state

Prior backlog placed cohort classification at v1.5 ("deferred"). Today's work elevated it to v1.1 priority #1.
Prior backlog had prevention work as "v1.1 consideration." Today's work moved it to v1.1 priority #2 with explicit forcing functions.
Other priorities (crowdsourcing, Landscape, pre-ASCO) were already documented; relative ordering reflects current dependencies.

---

*End of v1.1 backlog update.*
