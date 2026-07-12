### 7i. MODEL MIGRATION REPOINT — when the new cohort uses a DIFFERENT scoring model, not just a different ta_id
§7a–7h assume the new TA rides the SAME model as the reference (repoint = thread a ta_id). Rising broke that
assumption: AD rising uses a NEW model (`hcp_rising_composite_v1`, 2-axis emergence + network-influence,
scope-row shaped) replacing the OLD (`hcp_rising_star_ranks_v3`, 2x2 momentum/visibility, US-centric). That is
NOT a repoint — it's a model migration, and it changes the frontend CONTRACT (column names, dimensionality), not
just the ta_id. Signs you're in a model migration, not a repoint: the new table has different columns than the
reference RPC returns; the UI renders a different NUMBER of axes; the old model has a column the new one doesn't
(here: `archetype`, `us_rank`). When you see these, the frontend is a REWORK (types + mapper + breakdown
component + the tiles), not a one-line fetcher change. Budget accordingly — "wiring, not scoring" was true of the
DATA but undersold the FRONTEND by ~4 files + 2 sub-paths.

### 7j. AUTHOR A NEW RPC BY MIRRORING THE STRUCTURALLY-MATCHING REFERENCE, NOT THE SAME-NAMED ONE
When the new cohort's table is shape-identical to a DIFFERENT cohort's table, mirror THAT cohort's RPC. AD rising's
`hcp_rising_composite_v1` is scope-row shaped (scope_type/scope_value/rank, one row per HCP per scope) — identical
to `hcp_established_ranks_v3`, NOT to the old rising table. So `get_rising_composite_filtered` mirrors
`get_established_filtered` (true scope-row filtering) — NOT `get_rising_star_filtered`, which fakes scope with a
`us_rank` CASE trick because its table is one-row-per-HCP. **Shape match > name match.** Trace both candidate
reference bodies (`pg_get_functiondef`) before choosing; the same-named one is often the wrong template.
- Mirror the reference's WHERE/states/theme-EXISTS/ORDER BY/LIMIT verbatim; swap ONLY the table + score column;
  ADD the new model's real columns as return fields.
- Alias the new composite score into the reference's generic slots (`normalized_score`/`composite_score`) so any
  SHARED card chrome renders unchanged while the reworked breakdown reads the real new columns. Extra returned
  columns are name-keyed and harmless if unread — belt-and-suspenders against a blank-card regression.
- GRANT EXECUTE to the same role the new table's RLS admits (here: authenticated only — the table was RLS-locked
  authenticated-read; anon would 401 anyway). NOTIFY pgrst.
- New function NAME (don't overload the old one) -> collides with nothing, leaves the frozen TA's RPC untouched.

### 7k. career_first_pub_year_v2 IS CANONICAL EVERYWHERE — the one column where "mirror the reference" is WRONG
The reference (established) RPC reads plain `career_first_pub_year`; DON'T copy that. Plain is homonym-corrupted
(OpenAlex works-count/first-work); `_v2` is the correction (MIN(pub_year) over LINKED pubs, 1940 floor). Measured
divergence: **75.8% of the corpus** (214,102 / 282,464 rows) disagree. Any new RPC/view/card surfacing career
start MUST select `career_first_pub_year_v2`, aliased back to `career_first_pub_year` so frontends don't change.
This is load-bearing for RISING specifically (career-start drives early-career eligibility) — but it's a display
correctness issue for every cohort. **Established's RPC still reads plain = a latent CARD-DISPLAY bug** (ranks are
safe — the scorers already gate on `_v2`, verified by grep; only the projection column is wrong). Fix TA-wide when
convenient. LESSON: "mirror the reference" is a STRUCTURAL heuristic; for any column that's a known data-quality
correction, verify which column holds correct data (`count(*) FILTER (WHERE a IS DISTINCT FROM b)` + a spot-check
of known-affected rows) and use the corrected one regardless of what the reference does.

### 7l. THE RPC RETURN SHAPE IS A CONTRACT — trace the CONSUMER before finalizing it (the empty-render trap)
Producer/consumer disagreement is this project's #1 recurring bug (count-RPC v2/v3 §30ep, themes tag, feed
loadMore §30es). A column-name mismatch renders EMPTY or ZERO, not an error — it LOOKS like data. Before shipping
any cohort RPC, grep the consumer half and confirm the exact field names it reads:
  - the mapper (`enrichAndMapCohortRows` / the cohort branch in api.ts),
  - the type (`types.ts`), the data model (`hcpData.ts`),
  - the detail-breakdown component AND its separate builder query (the detail breakdown is often fed by its OWN
    direct-table query, NOT the feed mapper — AD rising's `getRisingStarScoreBreakdown` reads the old table
    directly; that's a SECOND repoint hiding behind the first).
If the consumer speaks a different vocabulary than the new model emits (AD rising's entire read path spoke the old
2x2 momentum/visibility names — nothing read the new columns), the frontend is a rework, and you either (a) rework
the consumer to the new names [correct], or (b) alias the new columns into the old names in the RPC [a lie in the
data layer — rejected]. Do (a).

### 7m. DEPRECATE, DON'T PORT, a construct whose premise was retired
`archetype` was labels for positions in the old 2x2 grid. The advisor pass that designed the new model killed one
of those axes AS DISHONEST (recent centrality = current connectedness, not growth). So archetype named positions
in a grid whose axes no longer mean what they claimed — porting it forward would carry a retired premise. RULE:
when a model changes, don't reflexively preserve every downstream label; ask whether the label's MEANING survives
the new axes. If not, drop it (stub cleanly; leave the old subsystem live for the frozen TA that still uses the
old table) and, if the capability is still wanted, DERIVE IT HONESTLY from the new axes as new design work —
don't reconstruct the old one. (For AD rising: emergence-high/network-low = "surging on science, not yet
connected" vs the inverse — a real, honest quadrant story, deferred as an open design Q until the 2-tile render
is seen.)

---

## 11. PER-TA COHORT FORK — routing a new model without touching the frozen TA (added July 12, AD Rising)

### 11a. NSCLC-frozen is an ARCHITECTURAL GUARANTEE, not vigilance
"Be careful not to touch NSCLC" is a promise; "NSCLC's code path is never in the diff" is a guarantee. Build the
guarantee. When a new TA needs a different cohort model, do NOT globally swap the RPC — FORK at the dispatch site
so the frozen TA's path is byte-for-byte unchanged (not "preserved" — literally the same literals).

### 11b. Fork at the CALL SITE, never inside the shared fetcher
`fetchCohortViaRpc` takes the RPC/table names as PARAMETERS; the per-cohort literals live at the call sites
(`getRisingStars` / `getEstablished` / `getCommunity`), where `taId` is already resolved two lines above. Fork
there:

    const risingRowsRpc  = taId === TA_ID_MAP["atopic-dermatitis"] ? "get_rising_composite_filtered" : "get_rising_star_filtered";
    const risingCountRpc = taId === TA_ID_MAP["atopic-dermatitis"] ? "get_rising_composite_filtered_count" : "get_rising_star_filtered_count";
    const risingTable    = taId === TA_ID_MAP["atopic-dermatitis"] ? "hcp_rising_composite_v1" : "hcp_rising_star_ranks_v3";
    const risingCohortTag= taId === TA_ID_MAP["atopic-dermatitis"] ? "rising_composite" : "rising_star";

The frozen TA hits the SAME four literals it does today. `enrichAndMapCohortRows` already discriminates on the
`cohort` tag -> the new TA gets a NEW mapping branch; the old branch is untouched. (This is §7e's additive
guardrail applied to the whole model, not just a ta_id.)

### 11c. CAPTURE THE FROZEN TA'S FINGERPRINT BEFORE the edit — it's the regression oracle
Before any change, snapshot the frozen TA's cohort output (top-N via its RPC, verbatim). Post-change, the
identical call must reproduce it byte-for-byte. AD-rising example: NSCLC top-10 global via
`get_rising_star_filtered(<nsclc_ta_id>, 'global', ARRAY['global'], …, 10, 0)` — ranks 1–10, all "Balanced Rising
Star", captured to diff after. Pair with §7g (browser gate): typecheck/build passing ≠ renders; the frozen TA
must look IDENTICAL logged-in.

### 11d. BACK-MIGRATION OF THE FROZEN TA IS DEFERRABLE — split-brain is an acceptable, DELIBERATE state
Reconciling the frozen TA onto the new model (so both TAs share one model) is NOT a precondition to shipping the
new TA. If the frozen TA's DB is load-bearing (AD: NSCLC holds mentor records), DEFER it: the per-TA fork lets the
new TA use the new model while the frozen TA keeps the old, indefinitely. Two live models = a maintenance concern,
not a correctness/safety one. Log it as deliberate; reconcile on the founder's schedule. (Note: the back-migration
would NOT mutate the frozen table anyway — it writes new rows into the new table — but "don't run it" stands when
the founder says the TA is frozen.)

---

## 12. GLOBAL-FIRST TAs — the scope default + the global short-circuit (added July 12, AD Rising)

### 12a. Some TAs are GLOBAL-FIRST — and the frontend defaults to US
A TA's international skew is a product fact, not an edge case: AD is ~82% international; its rising/established
cohorts LIVE in global scope. But `resolveFilterScope` (rank-filters.ts) DEFAULTS to region/US, and
`fetchCohortViaRpc` SHORT-CIRCUITS global to empty (api.ts ~476–478: `if scopeType==="global" ||
scopeValues.length===0 return {rows:[],total:0}`). So for a global-first TA, the DEFAULT view is the wrong lens
AND explicit-global returns empty. Global rising is served NOWHERE today (traced: no global branch in
`getRisingStars`, every direct old-table read is US-only/count/detail) — a pre-existing gap, latent because
NSCLC is US-heavy and never exercised it.

### 12b. Global-first is a DEFINITION-OF-DONE question, decided by the founder, not an engineering afterthought
If the demo needs the international cohort visible (AD: yes — the international researchers ARE the point), global
is part of Tier 1 DoD, not a deferrable enhancement. Shipping US-defaulted would under-serve exactly the cohort
the TA exists to show. This forces TWO edits in TWO files: relax the 476–478 short-circuit (shared infra — governs
all 3 cohorts, trace its blast radius) AND change the region/US default for that TA (rank-filters.ts). Both
potentially TA-conditional (mirror §11b's fork discipline — don't change the default for the frozen US-centric TA).

### 12c. BEFORE designing global-first scope, check whether the REFERENCE TA already solved it
The pivotal question that sizes the work: does the reference TA (which faced the same international problem) ALREADY
handle global-default, or did it ship US-defaulted? If solved -> MIRROR the existing scope pattern (clean). If not
-> the reference has the SAME latent gap, and you're designing global-first scope for the first time (bigger, and
it fixes both TAs). Trace the reference's default-scope resolution and whether it bypasses the 476–478 short-circuit
BEFORE writing the new TA's scope spec. [OPEN for AD as of this writing — routed to Code; resolves whether AD Rising
Tier 1 is "mirror" or "design-new."]
