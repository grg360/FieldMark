# Scientific Pulse — Build Roadmap
*Last updated: 2026-07-22. Companion docs: SCIENTIFIC_PULSE_STRATEGY.md (why/what + advisor reversal), FIELDMARK_DESIGN_TOKENS.md (aesthetic).*

---

## 0. What Pulse is (one paragraph)
A weekly, TA-level scientific-intelligence view for MSLs — "where is the scientific conversation moving?" —
synthesized from public + platform data. AGGREGATE momentum only: no user forum, no individual posts, no named
private activity. Powered by data the pipeline already produces. An outside advisor called it potentially
"the feature that defines FieldMark." Launches with ZERO community input (cold-start dissolved: it depends on
EVIDENCE, not users); community later becomes a VALIDATION/confidence layer, not a content source.

Naming discipline: say "scientific attention converged / the conversation is shifting" — NOT "discussion"
(which implies user-generated dialogue). Pulse synthesizes the literature + conference ecosystem.

---

## 1. The key finding that makes Pulse buildable NOW (not in 4-8 weeks)
Pulse's whole identity is "what changed this week" → needs a theme TIME-SERIES. Current theme state
(hcp_research_themes_v2) is HCP-level, LLM-derived, overwrite-on-rerun, keeps only ≤3 example PMIDs — so it is
a RED HERRING for history; you cannot reconstruct historical theme counts from it.

BUT publication/trial-velocity momentum is **BACKFILLABLE retroactively** from dated, concept-tagged records
already in the DB. You do NOT wait 4-8 weeks for the important momentum signal. Only social/congress CHATTER
momentum is genuinely forward-only (and it's the garnish, not the entrée).

### Sizing checks (run 2026-07-22 — both blockers are SMALL):
- **Concept coverage: 98.5%** (82,173 / 83,398 NSCLC pubs have openalex_concepts) → a concept-based pub→theme
  labeler can attribute ~all of the corpus. The keystone works.
- **pub_date gap: 16,971 NULL total, 9,088 in the 2026 recent window** (~96% of pubs already dated). The fix is
  a RE-PARSE from the OpenAlex payload the enricher already fetches (and PubMed) — NOT 17K new API calls. Light.

---

## 2. The two foundation blockers (both fixable, neither is a "wait")
### Blocker A — no durable pub→theme mapping  [THE KEYSTONE]
No publication_themes / theme_publications table exists; theme membership is HCP-level only. Cannot say
"pub P belongs to theme X" for the corpus.
→ Build a **pub→theme labeler** over durable per-pub features (openalex_concepts [98.5% coverage], mesh_terms,
title) matched to canonical themes (theme_canonical_v1). Runs retroactively over all retained pubs, then
forward each cycle. Persist as e.g. `publication_theme(pub_id, canonical_theme_id, ta_id, score)`.
Everything downstream depends on this.

### Blocker B — recent pubs have pub_date=None (only pub_year)
pubmed_pipeline.py:1274 writes pub_date=None; only pub_year set. At year-granularity you can only build an
ANNUAL curve, not the monthly/weekly the mockup shows — and it bites hardest in the recent window the curve
needs.
→ **pub_date backfill:** one-pass re-parse from the OpenAlex work payload (already fetched) / PubMed
(ingest_publications.parse_pub_date already exists). ~17K pubs. Also FIX pubmed_pipeline to write pub_date
going forward.

---

## 3. Card-by-card feasibility (from Code audit)
| Card | Ship in v1? | Backfillable momentum? | Needs |
|---|---|---|---|
| **5. Consensus Snapshot** (topic-share treemap) | ✅ v1 (cheapest, best real-data card) | current-state, no history needed | per-TA GROUP BY over openalex_concepts / canonical themes |
| **3. Emerging Voices** (N rising-stars/theme, aggregate) | ✅ v1 (cumulative count; drop "+3/this month" until history) | partial | pub→theme link; extract_research_themes already writes rising-star-cohort themes |
| **6. What Changed** (diff feed) | ✅ v1 (cohort-shift + new-trial rows) | n/a | repoint reingest_diff to v3 (KNOWN BUG); add "new trial this week" query |
| **2. Rising Themes** (ranked ↑/↓%) | ⚠️ v1 as ranked LIST (no arrows); arrows after backfill | YES after A+B | pub→theme labeler + pub_date backfill → theme×week aggregation |
| **1. This Week's Movement** (AI synthesis prose) | ⏳ v2 (degraded v1 = LLM over What-Changed + top themes) | n/a | new TA-level LLM synthesis step (Anthropic infra exists; reingest_diff_v2.why_context is the reserved seam) |
| **7. Expanded Theme** (6-mo curve, sub-themes, source comp) | ⏳ v2 (curve needs history; sub-themes are net-new) | curve YES after A+B | monthly snapshot; theme↔trial + theme↔congress joins; sub-theme LLM extraction |
| **4. Conference Pulse** (congress spikes) | ⏳ v2 | forward-only | congress-abstract ingest OR LLM-tag congress-window social→theme + baseline |
| **v-next: "SO WHAT?/Field Implication"** | ⏳ v2 (Garrett loves this — turns intel into PREPARATION) | n/a | per-insight LLM line (cheap once insight text exists) |
| **v-next: Confidence Stack** (N pubs/congress/trials/experts) | ⏳ v2 (pubs cheap, rest expensive) | n/a | pub count cheap; trial count needs theme↔trial link; congress/expert = new sources |

Momentum split (Q4): ↑% arrows = publication(+trial) velocity → backfillable (chatter-inclusive % is partly
forward-only). 6-month curve = backfillable at named-theme granularity after A+B. Declining themes =
backfillable (same series, negative slope). Sub-theme momentum = mostly net-new.

---

## 4. Two decisions to make BEFORE building
1. **Unit of momentum:** canonical buckets (~24/TA, stable) vs raw themes (mockup's "42", noisier).
   → RECOMMEND CANONICAL. Stable signal beats noisy granularity; noisy arrows would undermine trust.
2. **Sub-themes (SHP2/SOS1/MET under KRAS):** don't exist as data — need dedicated LLM sub-theme extraction.
   → Treat every sub-tag in the mockup as NET-NEW / v2. v1 ships without sub-theme breakdowns.

---

## 5. Build order
### Phase 0 — PIPELINE FIRST (Pulse's foundation rides on the weekly cron)
- [ ] Finish current end-to-end run (stage 9) → confirm SUCCESS marker
- [ ] Commit all pipeline work (OpenAlex sub-sequence, --primary-pmids-out + quiet-week gate, --yes/DEVNULL,
      run_sql --param/--statement-timeout, build_author_flat index+grant recreation)
- [ ] Confirm Code's build_author_flat.sql auto index+grant fix is committed
- [ ] ONE cron-readiness validation run → prove AUTOMATIC index/grant recreation works (this run used MANUAL
      indexes; the cron must recreate them itself)
- [ ] Schedule Monday 3am ET cron (`reingest_cycle.py --ta nsclc`)
- NOTE: also verify the completion marker is written on --resume-from runs (currently showed a stale FAILED
  marker after a successful resume — minor, cron won't use resume, but confirm)

### Phase 1 — PULSE FOUNDATION (data plumbing; rides on the same cron)
- [ ] **pub_date backfill** (~17K pubs, re-parse from OpenAlex payload / PubMed) + fix pubmed_pipeline to
      write pub_date forward
- [ ] **pub→theme labeler** [KEYSTONE] — openalex_concepts/mesh/title → theme_canonical_v1, persist
      publication_theme table, run retroactively over corpus, then per-cycle. (98.5% concept coverage.)
- [ ] **theme_momentum_snapshot** (canonical_theme × ta × week/month → pub_count [+ trial_count,
      rising_star_count]) — SEED from backfilled dates (last ~6 months), maintain forward each cycle
- [ ] Wire snapshot maintenance into reingest_cycle so momentum stays current

### Phase 2 — PULSE v1 (cheap cards, real data)
- [ ] Card 5 Consensus Snapshot (per-TA concept/theme share treemap) — start here, cheapest
- [ ] Card 3 Emerging Voices (cumulative rising-star-per-theme, aggregate/anonymized)
- [ ] Card 6 What Changed (repoint reingest_diff to v3 + new-trial rows)
- [ ] Card 2 Rising Themes as ranked list → add ↑/↓% arrows once snapshot history (backfilled) is in
- [ ] Apply FieldMark design tokens (dark + amber, see FIELDMARK_DESIGN_TOKENS.md) — dark mockup already approved

### Phase 3 — PULSE v2 (real new pipeline + LLM)
- [ ] Card 1 This Week's Movement (TA-level LLM synthesis step; degraded v1 = LLM over What-Changed + top themes)
- [ ] Card 7 full Expanded Theme (6-mo curve from snapshot history + source composition + sub-themes)
- [ ] Card 4 Conference Pulse (congress ingest or theme-classified social + baseline)
- [ ] "SO WHAT? / Field Implication" line (per-insight LLM — turns intelligence into preparation)
- [ ] Confidence Stack (pubs cheap; trial/congress/expert need theme↔trial link + new sources)
- [ ] Community as CONFIDENCE LAYER: Agree / Disagree / Needs nuance / Missing context on synthesized insights
      (extends existing Field Intelligence validation-chip pattern from HCP-level to theme-level)

---

## 6. Forward-only (accrues from when capture starts — NOT backfillable)
- Social/conference CHATTER per theme (social_posts_v2 starts ~late-May 2026, not theme-classified; congress
  abstracts don't exist; congress_score is a 0.0 placeholder). The "2.4x baseline discussion" / "conversation
  converged" chatter flavor accrues forward. Fine — it's the garnish. Publication-velocity momentum (the
  entrée) is backfillable now.

---

## 7. Known adjacent fixes surfaced along the way (do as they fit)
- reingest_diff.py points at legacy contaminated table (hcp_score_ranks_v2) → repoint to
  hcp_rising_star_ranks_v3 / hcp_established_ranks_v3. (Blocks Card 6 correctness.)
- Second pass mints side-effect HCPs (NULL run_id) — create_hcps_v2 should be sole HCP authority (follow-up).
- Steady-state perf cluster: Step F → affected-set scope (now safe post-Group-B), append-only flatten,
  whole-graph rescore-every-cycle. Optimize post-launch. (See INCREMENTAL_REINGEST_SEQUENCE.md.)
- social/congress capture runs manually, outside the weekly pipeline — wire in when doing Conference Pulse.
