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
3. **Class** — `F` functional single-indication (must change) · `D` default
   fallback (must add a Breast branch) · `C` cosmetic/label (low priority) ·
   `P` already parameterized (reference only, no change).
4. **Breast change** — the generalization required.
5. **Config-only?** — can it be resolved by configuration alone (`yes`), or does
   it need code (`no` / `mixed`).
6. **Risk / note** — blocker severity or caveat.
7. **Wave** — maps to `docs/Umbra/02_Umbra_Breast_Cancer_Build_Plan.md` waves
   (W2 config · W3 pipeline/SQL · W4 frontend).

---

## Layer: Frontend — functional (Wave 4)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `components/LandscapeRoute.tsx:19` | `ta ?? "nsclc"` | F | drive from active indication; no NSCLC floor | no | paramless landscape silently loads NSCLC | W4 |
| `components/LandscapeRoute.tsx:25` | `indicationSlugToLabel("Oncology", …)` hardcodes parent | F | derive parent from config | no | single-parent assumption | W4 |
| `components/InstitutionsIndexRoute.tsx:14` | `ta ?? "nsclc"` (also header `:117,120`) | F | active-indication default | no | — | W4 |
| `components/Pulse/PulsePage.tsx:40` | `params.ta ?? "nsclc"` | F | active-indication default | no | Pulse route (post-baseline surface) | W4 |
| `components/InstitutionRoute.tsx:113` | `… ?? "nsclc"` fallback | F | remove hard floor | no | guarded but hard NSCLC floor | W4 |
| `components/InstitutionRoute.tsx:114` | `… \|\| "NSCLC"` display name | F | derive from config | no | feeds `getInstitutionResearchThemes` | W4 |
| `components/HomePage/StartHereCard.tsx:30` | feedPath `"/oncology/rising-stars/nsclc"` | F | build from profile default | no | — | W4 |
| `components/HomePage/StartHereCard.tsx:42` | `default_indication_slug ?? "nsclc"` | F | parent-aware default | no | — | W4 |
| `components/HomePage/StartHereCard.tsx:41` | parent `?? "oncology"` | D | add Breast under Oncology | yes | — | W4 |
| `components/HomePage/HomePage.tsx:99-101` | parent `?? "oncology"`, indication default | D/F | parent+indication from profile | mixed | seeds whole home TA | W4 |
| `components/ProfileScreen.tsx:208-209` | `?? "oncology"` / `?? "all"` on save | D | Breast-aware persistence | mixed | — | W4 |
| `components/ProfileScreen.tsx:28-33,51-69` | `INDICATIONS` / name↔slug maps oncology-only | F | add Breast to indication taxonomy | no | picker+persistence oncology-only | W4 |
| `components/UserMenu.tsx:189,201,213,226` | hardcoded nav to `…/nsclc` and `/institutions/nsclc` | F | route to active indication | no | 4 menu links | W4 |
| `lib/aiOverviews.ts:11` | default arg `therapeuticArea="NSCLC"` | D | require/propagate TA | no | fallback if caller omits | W4 |
| `lib/institutionThemes.ts:20` | default arg `="NSCLC"` | D | propagate TA | no | — | W4 |
| `lib/institutionPins.ts:86` | default arg `="NSCLC"` | D | propagate TA | no | — | W4 |
| `lib/publicationsList.ts:47` | default arg `="NSCLC"` | D | propagate TA | no | sole caller also hardcodes (below) | W4 |
| `lib/home.ts:6-7,654-656` | `TA_SLUG_TO_UUID` single NSCLC entry; territory profile | F | multi-TA map | no | non-NSCLC labels fall through | W4 |
| `lib/api.ts:738-743` | `COMMUNITY_GATE_OR` built from NSCLC id + 500 floor | F | per-TA gate config (see SQL twin) | no | read-layer community gate NSCLC-only | W4 |
| `components/PublicationsListPage/PublicationsListPage.tsx:41` | passes hardcoded `"NSCLC"` | F | pass institution's actual TA | no | — | W4 |
| `components/ScoreBreakdownV3Community.tsx:13-18` | NSCLC P95 constants scale bars for all TAs | F | per-TA percentile constants | no | cross-TA mis-scaling | W4 |
| `components/Telescope.tsx:146-149` + `components/TelescopeDrawer.tsx:100-101` | binary AD-else-NSCLC file switch | F | TA-keyed graph file resolution | no | any non-AD TA renders NSCLC network | W4 |
| `components/ContextualizeHCPForm.tsx:5-14,52-53` | Oncology==NSCLC subspecialty list | F | per-TA subspecialty options | no | — | W4 |
| `components/NoteEntryScreen.tsx:30-31` | `INDICATIONS_BY_TA` hardcoded taxonomy | F | add Breast indications | no | — | W4 |
| `lib/api.ts:728` | `TA_ID_MAP.nsclc` UUID | P | add Breast entry | yes | legit lookup; inlined UUID | W4 |
| `lib/api.ts:2443-2444` | `TA_DISPLAY_BY_ID` UUID→label | P | add Breast entry | yes | — | W4 |

**Known anchors named in the build plan (frontend, verify + generalize in W4):**
`lib/TAContext.tsx`, `lib/routeSlugs.ts`, `components/IndicationFilter.tsx`,
`components/TAFilterChips.tsx`, `App.tsx` — the plan's five; treat as the core
routing/context spine of the frontend wave.

## Layer: Frontend — cosmetic / label (Wave 4, low priority)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `components/InstitutionResearchThemesPanel.tsx:33` | `taDisplayName \|\| "NSCLC"` subtitle | C | label fallback | yes | — | W4 |
| `components/DetailScreen.tsx:1634` | `taSlug==="nsclc" ? "NSCLC" : taSlug` | C | slug→label helper | yes | narrative fetch normalizes anyway | W4 |
| `components/DOLListingModal.tsx:73-80` | `formatTALabel` NSCLC case | C | add Breast case | yes | — | W4 |
| `components/ScoreBreakdownV3Community.tsx:79` | `"Rank N NSCLC"` suffix for all TAs | C | use active TA label | yes | mislabels non-NSCLC | W4 |
| `components/ScoreBreakdownV3.tsx:185-283` | tooltip copy hardcodes "NSCLC" | C | TA-parametric copy | yes | shown for all TAs | W4 |
| `components/StatPillWithTooltip.tsx:80` | tooltip "Career NSCLC publications…" | C | TA-parametric copy | yes | — | W4 |
| `components/FieldIntelligence.tsx:46-50` | parent default `"oncology"` | C | — | yes | minor nav default | W4 |
| `lib/api.ts:754,1058,3358` | slug↔label maps inline NSCLC | P | add Breast entries | yes | legit lookup tables | W4 |

Mock/fixture NSCLC content (cosmetic, not blockers): `lib/pulseFixture.ts`,
`data/mockFieldIntelligencePosts.ts`, `data/hcpData.ts:167`,
`pages/DemoPage.tsx:157`, `pages/MethodologyPage.tsx:102`.

## Layer: SQL — live / deployed (Wave 3)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `sql/community_qualification_gate.sql:71,98,130,147` | NSCLC UUID predicate in all 4 `get_community_filtered`/`_count` overloads | F | per-TA gate config (id + volume floor) | no | live functions; leading `<>` no-ops other TAs today | W3 |
| `sql/04_pulse_payload.sql:3,79,114` | ta_id + `'NSCLC'` literal + theme scope | F | parameterize by TA slug | no | Pulse payload NSCLC-only | W3 |
| `sql/03_pulse_signature_patch.sql:2-50` | signature seed scoped `therapeutic_area='NSCLC'` | F | Breast signature seed | no | data seed | W3 |
| `sql/get_pulse_synthesis_facts.sql:30` | `p_ta_slug text` param | P | none | — | already TA-agnostic | — |
| `sql/get_shared_publications.sql`, `sql/get_partner_publications.sql` | fully parameterized | P | none | — | not a Breast blocker | — |

## Layer: SQL — one-off / migration (reference; not live)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `docs/04_pulse_payload_monthly.sql:3,101,146` | NSCLC hardcodes (monthly pulse variant) | F | regenerate per-TA when promoted | no | candidate/one-off | W3 |
| `docs/02_pulse_signature_seed.sql:1-347` | full NSCLC signature seed | F | Breast equivalent | no | superset of live A3 | W3 |
| `migrations/2026_06_03_hcp_research_themes_v2.sql:11` | column `DEFAULT 'NSCLC'` | F | drop/parameterize default | no | new theme rows default NSCLC | W3 |
| `docs/2026_07_12_get_established_filtered_global.sql`, `…get_rising_composite_filtered.sql` | parameterized (`p_ta_id`); NSCLC in comments only | P | none | — | not applied; clean | — |

## Layer: Backend Python — functional (Wave 3)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `scripts/narrative/generate_narratives_v2.py:162-166` | `COMMUNITY_GATE_NSCLC_TA_ID` + `COMMUNITY_GATE_OR` (used `:758`,`:2019`) | F | per-TA gate config (app twin of live SQL gate) | no | must move with the SQL gate | W3 |
| `scripts/classify/cohort_classification_v2.py:458` | NSCLC UUID → KOL surname allowlist (`:448-455`) | F | per-TA KOL config or drop | no | force-classifies listed HCPs | W3 |
| `scripts/classify/trial_ta_mapping.py:31,80-135,215-219` | NSCLC condition/drug keyword lists | F | Breast condition/intervention mapping | no | trial→TA assignment | W3 |
| `scripts/score/established_scoring.py:36-37,75` | `TARGET_TA_IDS` hardcoded allowlist | F | add Breast TA id / generalize | no | non-listed TAs not scored | W3 |
| `scripts/utilities/backfill_belief_claim_titles.py:48` | `AND therapeutic_area='NSCLC'` | F | parameterize | no | backfill tool | W3 |
| `scripts/seed/generate_seed_insights.py:180,264-299` | NSCLC filter + NSCLC prompt copy | F | Breast prompt/config | no | seed tool | W3 |
| `scripts/social/extract_external_links.py:97,109` · `extract_web_signals.py:176,188` | `ta.name='NSCLC'` | F | parameterize | no | social tools | W3 |
| `scripts/utilities/export_telescope_data.py:55,101` | `ta.name='NSCLC'` | F | parameterize | no | one-off export | W3 |

## Layer: Backend Python — per-TA config constants (Wave 2/3)

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `scripts/narrative/extract_scientific_positions.py:32,46-72` | `NSCLC_TA_ID`, `"nsclc"` config, `DEFAULT_TA` | D | add Breast config entry | mixed | parameterized elsewhere | W3 |
| `scripts/narrative/generate_scientific_position_synthesis.py:34-73` | `NSCLC_TA_ID/NAME`, config, `DEFAULT_TA` | D | add Breast config entry | mixed | — | W3 |
| `scripts/classify/extract_research_themes.py:69,121-149` | NSCLC selection SQL + `DEFAULT_TA` | D | add Breast config | mixed | — | W3 |
| `scripts/ingest/nppes_workstream_b_dryrun.py:20,96-116` | `NSCLC_TAXONOMIES` code list | F | Breast (oncology) taxonomy set | no | specialty masking | W3 |
| `scripts/aggregate/open_payments_aggregator.py:70` · `medicare_aggregator.py:51` | `"expected_ta":"NSCLC"` assertion | D | Breast expected-TA | yes | guard assertion | W3 |
| `frontend/narrative_pipeline.py:17` · `scripts/utilities/ta_audit.py:48` | slug↔UUID / UUID↔label maps | P | add Breast entry | yes | tooling maps | W3 |
| `scripts/**/*.py` `--ta nsclc` **CLI defaults** (rising_score, recompute_established_ranks_v3, rising_star_scoring, pharma_engagement_scoring, network_momentum/centrality_scoring, scientific_momentum_scoring, publication_leadership_scoring, compute_top_collaborators, bucket_themes, reingest_cycle:751, derive_career_first_pub_year_v2, scrape_leadership_signals) | default value only | P | pass `--ta breast-cancer` | yes | low concern; fully parameterized | W3 |

## Layer: Config & Edge functions

| Consumer | Assumption | Class | Breast change | Config-only? | Risk / note | Wave |
|---|---|---|---|---|---|---|
| `config/therapeutic_areas/nsclc.json:4` | `"ta_uuid"` NSCLC | P | add `config/therapeutic_areas/breast-cancer.json` | yes | the W2 deliverable | W2 |
| `supabase/functions/send-invite-email/index.ts:26` | `nsclc:"NSCLC"` slug→label map | D | add Breast entry | yes | edge fn | W4 |

---

## Wave sizing (functional + default rows only; cosmetic/`P` excluded)

- **W2 (config):** 1 new file (`breast-cancer.json`) + resolve the documented
  file-vs-DB config-authority split.
- **W3 (pipeline / SQL / scripts):** the live community gate (4 SQL overloads +
  its Python twin), Pulse SQL (payload + signatures), plus ~10 backend scripts
  (cohort KOL map, trial mapping, established scoring, NPPES taxonomy, social /
  seed / export tools) and ~6 per-TA config constants.
- **W4 (frontend):** ~26 functional/default consumers above **plus** the 5
  plan-named anchors — roughly **31 files**, ~4× the plan's five-file estimate,
  with Pulse and the read-layer community gate the two surfaces the plan did not
  originally enumerate.

## Deliberately excluded from the Breast replay

- **`dedup_merge`** (`scripts/dedup/dedup_merge.py`) — irreversible shared-row
  mutation, not required for a bounded proof; run `dedup_detect` (read-only) for
  the signal only. See the review's Focus 1 disposition: `EXCLUDE_FROM_BREAST_REPLAY`.
