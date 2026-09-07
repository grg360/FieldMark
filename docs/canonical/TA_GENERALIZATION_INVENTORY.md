# TA Generalization Inventory

Every code, SQL, script, and config surface that hardcodes NSCLC or assumes a
single indication. This is the artifact that sizes the Breast (and any future
multi-indication) waves. Keep it current: when a consumer is generalized, move
its row to **Done** or delete it; when a new one lands, add it here.

## Provenance

- **Baseline commit:** `0dfec51` (`foundation-rebuild`).
- **Method:** read-only repository inspection — two exhaustive sweeps (frontend
  `frontend/src`; SQL/Python/config elsewhere) for the literal `NSCLC`, the NSCLC
  UUID `c0065b03-a25e-4e9a-bde4-4b4d0db7827d`, `?? "nsclc"` / `|| "NSCLC"`
  fallbacks, and single-indication structural assumptions. Every row cites the
  file and line it was verified against.
- **Not exhaustive for:** comment-only mentions and mock/fixture sample content
  (listed compactly at the end, not row-by-row).

## Fields

Each row carries seven fields:

1. **Consumer** — `path:line` or SQL object / symbol.
2. **Assumption** — what it hardcodes or assumes.
3. **Class** — the five-way disposition (see legend below).
4. **Breast change** — the generalization required.
5. **Config-only?** — can it be resolved by configuration alone (`yes`), or does
   it need code (`no` / `mixed`).
6. **Risk / note** — blocker severity or caveat.
7. **Wave** — maps to `docs/Umbra/02_Umbra_Breast_Cancer_Build_Plan.md` waves
   (W2 config · W3 pipeline/SQL · W4 frontend).

**Class legend (five-way):**

- `P` — **already TA-parameterized**: code accepts any TA; needs at most a data/
  config row it already reads.
- `CFG` — **configuration-only**: resolved by authoring config/data, no logic change.
- `BND` — **bounded code generalization**: mechanical logic change (remove a
  `?? "nsclc"`, thread a TA param, widen a single-entry map, TA-key a switch).
- `ARCH` — **architectural refactor**: structural change to the parent/child model.
  **Zero rows — see Class summary.**
- `DEF` — **not required for the first Breast proof**: cosmetic, mock data, or
  one-off tooling; defer.
- **⚙** appended to a class = **calibration item**: someone must derive Breast-
  specific numbers/vocabulary, not find-and-replace. Sized separately in
  [Calibration subset](#calibration-subset-derivation-work-not-mechanical).

---

## Class summary (five-way)

Counts are of discrete inventory items; the ~14 `--ta nsclc` CLI defaults are
counted as one block. A handful of `BND`/`CFG` rows are also calibration items
(⚙) — the mechanical part is counted here, the derivation in the calibration
subset.

| Class | Count | Notes |
|---|---:|---|
| `P` already TA-parameterized | ~11 + ~14 CLI defaults | reference / add a data row |
| `CFG` configuration-only | ~9 | incl. the W2 `breast-cancer.json` |
| `BND` bounded code generalization | ~30 | the bulk of the frontend + pipeline work |
| `ARCH` architectural refactor | **0** | — |
| `DEF` not required for first proof | ~15 | cosmetic, mock data, one-off tools, `dedup_merge` |

**Nothing lands in architectural refactor.** The Oncology-parent / indication-child
model is already built and generic — `TAContext.tsx` models a parent plus an
indication, routes are `/oncology/<board>/<indication>`, and Breast already exists
as an inactive Oncology option. Every consumer below is a single-entry map to
widen, a `?? "nsclc"` default to remove, or a config/data row to author. Breast
slots in as a second child; the deliberate parent/child design carries it. The one
surface that *reads* structural — Telescope's AD-else-NSCLC binary file switch
(`Telescope.tsx:146-149`) — is a bounded change to TA-keyed resolution, not a refactor.

---

## Layer: Frontend — functional (Wave 4)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `components/LandscapeRoute.tsx:19` | `ta ?? "nsclc"` | BND | drive from active indication | no | paramless landscape loads NSCLC | W4 |
| `components/LandscapeRoute.tsx:25` | `indicationSlugToLabel("Oncology", …)` hardcodes parent | BND | derive parent from config | no | single-parent assumption | W4 |
| `components/InstitutionsIndexRoute.tsx:14` | `ta ?? "nsclc"` (header `:117,120`) | BND | active-indication default | no | — | W4 |
| `components/Pulse/PulsePage.tsx:40` | `params.ta ?? "nsclc"` | BND | active-indication default | no | Pulse route (post-baseline surface) | W4 |
| `components/InstitutionRoute.tsx:113` | `… ?? "nsclc"` fallback | BND | remove hard floor | no | — | W4 |
| `components/InstitutionRoute.tsx:114` | `… \|\| "NSCLC"` display name | BND | derive from config | no | feeds `getInstitutionResearchThemes` | W4 |
| `components/HomePage/StartHereCard.tsx:30` | feedPath `"/oncology/rising-stars/nsclc"` | BND | build from profile default | no | — | W4 |
| `components/HomePage/StartHereCard.tsx:42` | `default_indication_slug ?? "nsclc"` | BND | parent-aware default | no | — | W4 |
| `components/HomePage/StartHereCard.tsx:41` | parent `?? "oncology"` | P | none (Breast is Oncology) | yes | correct as-is | W4 |
| `components/HomePage/HomePage.tsx:99-101` | parent `?? "oncology"`, indication default nsclc | BND | indication from profile | mixed | seeds whole home TA | W4 |
| `components/ProfileScreen.tsx:208-209` | `?? "oncology"` / `?? "all"` on save | BND | Breast-aware persistence | mixed | — | W4 |
| `components/ProfileScreen.tsx:28-33,51-69` | `INDICATIONS` / name↔slug maps oncology-only | BND | add Breast to taxonomy | no | in-code lists | W4 |
| `components/UserMenu.tsx:189,201,213,226` | hardcoded nav to `…/nsclc` | BND | route to active indication | no | 4 menu links | W4 |
| `lib/aiOverviews.ts:11` | default arg `="NSCLC"` | BND | propagate TA | no | — | W4 |
| `lib/institutionThemes.ts:20` | default arg `="NSCLC"` | BND | propagate TA | no | — | W4 |
| `lib/institutionPins.ts:86` | default arg `="NSCLC"` | BND | propagate TA | no | — | W4 |
| `lib/publicationsList.ts:47` | default arg `="NSCLC"` | BND | propagate TA | no | sole caller also hardcodes | W4 |
| `lib/home.ts:6-7,654-656` | `TA_SLUG_TO_UUID` single NSCLC entry | BND | widen to multi-TA map | no | non-NSCLC labels fall through | W4 |
| `lib/api.ts:738-743` | `COMMUNITY_GATE_OR` from NSCLC id + 500 floor | BND ⚙ | per-TA gate config | no | app twin of live SQL gate; floor is calibration | W4 |
| `components/PublicationsListPage/PublicationsListPage.tsx:41` | passes hardcoded `"NSCLC"` | BND | pass institution's TA | no | — | W4 |
| `components/ScoreBreakdownV3Community.tsx:13-18` | NSCLC P95 constants scale all TAs | BND ⚙ | per-TA percentile constants | no | derive Breast P95 | W4 |
| `components/Telescope.tsx:146-149` + `components/TelescopeDrawer.tsx:100-101` | binary AD-else-NSCLC file switch | BND | TA-keyed graph resolution | no | non-AD TA renders NSCLC network | W4 |
| `components/ContextualizeHCPForm.tsx:5-14,52-53` | Oncology==NSCLC subspecialty list | BND | per-TA subspecialty options | no | — | W4 |
| `components/NoteEntryScreen.tsx:30-31` | `INDICATIONS_BY_TA` hardcoded taxonomy | BND | add Breast indications | no | in-code list | W4 |
| `lib/api.ts:728` | `TA_ID_MAP.nsclc` UUID | CFG | add Breast entry | yes | generic lookup | W4 |
| `lib/api.ts:2443-2444` | `TA_DISPLAY_BY_ID` UUID→label | CFG | add Breast entry | yes | — | W4 |

**Known anchors named in the plan (BND, Wave 4):** `lib/TAContext.tsx`,
`lib/routeSlugs.ts`, `components/IndicationFilter.tsx`, `components/TAFilterChips.tsx`,
`App.tsx` — the routing/context spine of the frontend wave.

## Layer: Frontend — cosmetic / label (DEF, Wave 4, low priority)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `components/InstitutionResearchThemesPanel.tsx:33` | `taDisplayName \|\| "NSCLC"` subtitle | DEF | label fallback | yes | — | W4 |
| `components/DetailScreen.tsx:1634` | `taSlug==="nsclc" ? "NSCLC" : taSlug` | DEF | slug→label helper | yes | narrative fetch normalizes anyway | W4 |
| `components/DOLListingModal.tsx:73-80` | `formatTALabel` NSCLC case | DEF | add Breast case | yes | — | W4 |
| `components/ScoreBreakdownV3Community.tsx:79` | `"Rank N NSCLC"` suffix all TAs | DEF | use active TA label | yes | mislabels non-NSCLC | W4 |
| `components/ScoreBreakdownV3.tsx:185-283` | tooltip copy hardcodes "NSCLC" | DEF | TA-parametric copy | yes | shown for all TAs | W4 |
| `components/StatPillWithTooltip.tsx:80` | tooltip "Career NSCLC publications…" | DEF | TA-parametric copy | yes | — | W4 |
| `components/FieldIntelligence.tsx:46-50` | parent default `"oncology"` | DEF | — | yes | minor nav default | W4 |
| `lib/api.ts:754,1058,3358` | slug↔label maps inline NSCLC | CFG | add Breast entries | yes | legit lookup tables | W4 |

Mock/fixture NSCLC content (DEF, not blockers): `lib/pulseFixture.ts`,
`data/mockFieldIntelligencePosts.ts`, `data/hcpData.ts:167`,
`pages/DemoPage.tsx:157`, `pages/MethodologyPage.tsx:102`.

## Layer: SQL — live / deployed (Wave 3)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `sql/community_roster_v1.sql:41`, `sql/community_count_rpc_board_repoint.sql:10,25`, `docs/state_provenance/04_filtered_family.sql:73` | NSCLC UUID predicate in all 4 `get_community_filtered`/`_count` overloads | BND ⚙ | per-TA gate config (id + volume floor) | no | **Location corrected 2026-09-03.** The previously cited `sql/community_qualification_gate.sql` is SUPERSEDED (its bodies read the retired `hcp_community_ranks_v2`); the literal lives in the files named here. It also SURVIVED the 2026-09-02 filtered-family rewrite — a rewrite is not a de-pin. Does NOT no-op other TAs: it is a `WHERE p_ta_id = <nsclc>` on the read, so every non-NSCLC TA returns zero rows by construction. Closed by `CRC_COMMUNITY_BUILD.md` phase 4.3 | W3 |
| `sql/04_pulse_payload.sql:3,79,114` | ta_id + `'NSCLC'` literal + theme scope | BND | parameterize by TA slug | no | Pulse payload NSCLC-only | W3 |
| `sql/03_pulse_signature_patch.sql:2-50` | signature seed scoped `therapeutic_area='NSCLC'` | CFG ⚙ | Breast signature seed | no | signatures are derived theme vocabulary | W3 |
| `sql/get_pulse_synthesis_facts.sql:30` | `p_ta_slug text` param | P | none | — | already TA-agnostic | — |
| `sql/get_shared_publications.sql`, `sql/get_partner_publications.sql` | fully parameterized | P | none | — | not a Breast blocker | — |

## Layer: SQL — one-off / migration (reference; not live)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `docs/04_pulse_payload_monthly.sql:3,101,146` | NSCLC hardcodes (monthly pulse variant) | DEF | regenerate per-TA when promoted | no | candidate/one-off | W3 |
| `docs/02_pulse_signature_seed.sql:1-347` | full NSCLC signature seed | DEF ⚙ | Breast equivalent | no | superset of live seed; domain vocabulary | W3 |
| `migrations/2026_06_03_hcp_research_themes_v2.sql:11` | column `DEFAULT 'NSCLC'` | BND | drop/parameterize default | no | new theme rows default NSCLC | W3 |
| `docs/2026_07_12_get_established_filtered_global.sql`, `…get_rising_composite_filtered.sql` | parameterized; NSCLC in comments only | P | none | — | not applied; clean | — |

## Layer: Backend Python — functional (Wave 3)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `scripts/narrative/generate_narratives_v2.py:162-166` | `COMMUNITY_GATE_*` (used `:758`,`:2019`) | BND ⚙ | per-TA gate config (app twin of SQL gate) | no | moves with the SQL gate; floor is calibration | W3 |
| `scripts/classify/cohort_classification_v2.py:458` | NSCLC UUID → KOL surname allowlist (`:448-455`) | BND ⚙ | derive Breast KOL surnames | no | force-classifies listed HCPs | W3 |
| `scripts/classify/trial_ta_mapping.py:31,80-135,215-219` | NSCLC condition/drug keyword lists | BND ⚙ | derive Breast condition/intervention vocab | no | trial→TA assignment | W3 |
| `scripts/score/established_scoring.py:36-37,75` | `TARGET_TA_IDS` allowlist | BND ⚙ | add Breast id (mechanical) + calibrate thresholds | no | non-listed TAs not scored | W3 |
| `scripts/utilities/backfill_belief_claim_titles.py:48` | `AND therapeutic_area='NSCLC'` | DEF | parameterize | no | backfill tool | W3 |
| `scripts/seed/generate_seed_insights.py:180,264-299` | NSCLC filter + prompt copy | DEF | Breast prompt/config | no | seed tool | W3 |
| `scripts/social/extract_external_links.py:97,109` · `extract_web_signals.py:176,188` | `ta.name='NSCLC'` | DEF | parameterize | no | social tools | W3 |
| `scripts/utilities/export_telescope_data.py:55,101` | `ta.name='NSCLC'` | DEF | parameterize | no | one-off export | W3 |

## Layer: Backend Python — per-TA config constants (Wave 2/3)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `scripts/narrative/extract_scientific_positions.py:32,46-72` | `NSCLC_TA_ID`, config, `DEFAULT_TA` | CFG | add Breast config entry | mixed | — | W3 |
| `scripts/narrative/generate_scientific_position_synthesis.py:34-73` | `NSCLC_TA_ID/NAME`, config, `DEFAULT_TA` | CFG | add Breast config entry | mixed | — | W3 |
| `scripts/classify/extract_research_themes.py:69,121-149` | NSCLC selection SQL + `DEFAULT_TA` | CFG | add Breast config | mixed | — | W3 |
| `scripts/ingest/nppes_workstream_b_dryrun.py:20,96-116` | `NSCLC_TAXONOMIES` code list | CFG | Breast (oncology) taxonomy set | no | standard oncology codes | W3 |
| `scripts/aggregate/open_payments_aggregator.py:70` · `medicare_aggregator.py:51` | `"expected_ta":"NSCLC"` assertion | CFG | Breast expected-TA | yes | guard assertion | W3 |
| `frontend/narrative_pipeline.py:17` · `scripts/utilities/ta_audit.py:48` | slug↔UUID / UUID↔label maps | P | add Breast entry | yes | tooling maps | W3 |
| `scripts/**/*.py` `--ta nsclc` **CLI defaults** (rising_score, recompute_established_ranks_v3, rising_star_scoring, pharma_engagement_scoring, network_momentum/centrality_scoring, scientific_momentum_scoring, publication_leadership_scoring, compute_top_collaborators, bucket_themes, ta_cycle:751, derive_career_first_pub_year_v2, scrape_leadership_signals) | default value only | P | pass `--ta breast-cancer` | yes | ~14 scripts; fully parameterized | W3 |

## Layer: Config & Edge functions

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `config/therapeutic_areas/nsclc.json:4` | `"ta_uuid"` NSCLC | CFG | add `config/therapeutic_areas/breast-cancer.json` | yes | the W2 deliverable | W2 |
| `supabase/functions/send-invite-email/index.ts:26` | `nsclc:"NSCLC"` slug→label map | CFG | add Breast entry | yes | edge fn | W4 |

---

## Calibration subset (derivation work, not mechanical)

The rows flagged **⚙** above need Breast-specific numbers or vocabulary derived —
this is domain work, sized separately from the mechanical generalization. The
mechanical plumbing for each is already counted in its `BND`/`CFG` class; the
derivation below is the distinct effort.

**Numeric (4):**

1. **Community gate patient-volume floor** — `sql/community_qualification_gate.sql`
   (NSCLC = 500), twinned in `generate_narratives_v2.py:162-166` and
   `lib/api.ts:738-743`. Derive Breast's floor from its volume distribution, or
   decide Breast stays ungated (the gate no-ops for non-NSCLC today, so ungated
   is the default until a floor is set).
2. **Community P95 scaling constants** — `components/ScoreBreakdownV3Community.tsx:13-18`
   (patients / payments / drugs 95th percentile). NSCLC-derived; Breast needs its own.
3. **Established scoring thresholds** — `scripts/score/established_scoring.py`
   (+ `recompute_established_ranks_v3.py`). Adding the TA id to `TARGET_TA_IDS`
   is mechanical; the threshold is the derivation.
4. **KOL surname allowlist** — `scripts/classify/cohort_classification_v2.py:448-458`.
   Derive the Breast KOL surnames; the dict wiring is mechanical.

**Domain vocabulary (2):**

5. **Breast trial condition/intervention keywords** — `scripts/classify/trial_ta_mapping.py:80-135`.
6. **Breast theme signatures** — Pulse signature seed
   (`sql/03_pulse_signature_patch.sql` / `docs/02_pulse_signature_seed.sql`).

**Decision, not a number (1):**

7. **Rising model choice** — legacy v3 vs the AD-style composite
   (`scripts/score/rising_score.py` dispatch); the plan lists it as "Breast model choice."

---

## Wave sizing (functional + config rows; cosmetic/`DEF`/`P` excluded)

- **W2 (config):** 1 new file (`breast-cancer.json`) + resolve the documented
  file-vs-DB config-authority split.
- **W3 (pipeline / SQL / scripts):** the live community gate (4 SQL overloads +
  its Python twin), Pulse SQL (payload + signatures), plus ~10 backend scripts
  and ~6 per-TA config constants.
- **W4 (frontend):** ~26 functional/default consumers **plus** the 5 plan-named
  anchors — roughly **31 files**, ~4× the plan's five-file estimate, with Pulse
  and the read-layer community gate the two surfaces the plan did not enumerate.

## Deliberately excluded from the Breast replay

- **`dedup_merge`** (`scripts/dedup/dedup_merge.py`) — irreversible shared-row
  mutation, not required for a bounded proof; run `dedup_detect` (read-only) for
  the signal only. Review Focus 1 disposition: `EXCLUDE_FROM_BREAST_REPLAY`.
