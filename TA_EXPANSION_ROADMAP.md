# FieldMark TA Expansion Roadmap

Living document. Update as TAs are added, market priorities shift, or build costs change with experience.

Last updated: May 26, 2026

---

## Current State (Foundation TAs)

Three TAs in the platform at v2 launch:

| TA | Status | HCP Volume | Notes |
|---|---|---|---|
| Hepatology | Production | ~142K candidates / 11,389 Established | Primary launch TA. PBC anchor indication. Clean data foundation. |
| NSCLC | Production | ~70K candidates / 11,389 Established | Strong oncology demo TA. Trial-rich. |
| Rare Disease | Limited | ~44 HCPs scored | Foundation present but data shallow — pediatric-heavy. Tricky to scale due to fragmented MeSH coverage and small per-indication populations. |

---

## Selection Criteria for Adding a TA

Priority signal: **active MSL marketplace activity.** Beyond that:

1. **MSL team size** — How many MSLs work this TA across pharma? Big teams = bigger TAM for FieldMark subscriptions.
2. **Pipeline activity** — Are there many ongoing clinical trials? Strong pipelines mean MSL teams expanding.
3. **Data tractability** — Does the TA have clean MeSH terms, distinct drug categories in Open Payments, identifiable Medicare codes?
4. **Rising Star surface area** — Does the TA have a meaningful "next generation" of researchers we can credibly identify? Older, slower-moving TAs surface fewer rising stars.
5. **Competitive whitespace** — Where are Veeva Link, H1, IQVIA weakest? Smaller specialty TAs they ignore = our opportunity.

---

## TA Pipeline (Next 12-18 Months)

### Tier 1 — On Deck (Build Order)

**1. Immunology**
- Why: Largest MSL specialty area outside oncology. Massive pipeline (IBD, RA, psoriasis, atopic dermatitis, lupus, MS overlap).
- Data shape: Clean. MeSH terms well-developed. Major pharma engagement (AbbVie, Lilly, J&J, BMS, Pfizer). Open Payments drug categories distinct (Humira/Stelara/Skyrizi/Rinvoq/Dupixent ecosystem).
- Rising Star surface: Strong. Newer biologics mean new investigator generation.
- Build cost estimate: 2 weeks (clean data + large existing literature).
- Avalere overlap: Yes; not a barrier.

**2. Neurology**
- Why: Rising biologic/cell therapy activity (MS, Alzheimer's, ALS, migraine, rare neuro). MSL teams expanding rapidly post-Leqembi/Kisunla.
- Data shape: Mostly clean. Alzheimer's and MS have strong MeSH coverage; rare neuro indications fragment similar to Rare Disease.
- Rising Star surface: Very strong. New mechanisms (anti-amyloid, gene therapy for SMA, etc.) mean rising investigators.
- Build cost estimate: 2-3 weeks (slightly trickier due to indication fragmentation within neuro).
- Sub-indication strategy: Lead with MS + Alzheimer's, add migraine and rare neuro later.

**3. Cardiovascular**
- Why: Largest MSL footprint in pharma. Stable, mature market with consistent rising stars in HF, lipid management, anticoagulation, structural heart.
- Data shape: Very clean. Cardiology has mature literature, well-defined trial populations.
- Rising Star surface: Strong in HF (entresto/farxiga/jardiance era), lipid (PCSK9, lp(a)), and structural heart.
- Build cost estimate: 1.5-2 weeks (clean data, mature TA).
- Watch for: Cardiology has many sub-specialties (EP, HF, interventional, prevention). Decide upfront whether to launch as one "Cardiology" TA or split.

### Tier 2 — Cell & Gene Therapy Expansion (Strategic Focus)

**4. Hematologic Oncology** (lead cell/gene indication)
- Why: Already the personally-prioritized indication. CAR-T expansion (Yescarta, Kymriah, Carvykti, etc.) creates strong rising-star dynamics.
- Data shape: Clean. Heme onc has distinct from solid-tumor literature, strong trial infrastructure.
- Rising Star surface: Excellent — cell therapy is generationally young; many investigators are early career.
- Build cost estimate: 2-3 weeks.
- Strategic note: Hematologic oncology becomes the umbrella; specific cell/gene indications (multiple myeloma, AML, ALL, lymphoma) live underneath as sub-cohorts.

**5. Specific cell/gene indications** (within heme onc)
- Multiple Myeloma (CAR-T + bispecifics + ADCs)
- AML
- ALL (pediatric crossover)
- Lymphoma (DLBCL, MCL)
- Build cost: 1 week each once heme onc is established (reuse infrastructure).

### Tier 3 — Opportunistic / Lower Priority

**Dermatology** — Atopic dermatitis + psoriasis pipeline strong, but heavy overlap with Immunology. Could be sub-cohort within Immunology rather than separate TA.

**Endocrinology** — Diabetes + obesity (GLP-1 explosion). Massive market but commoditized — many platforms cover this well already.

**Nephrology** — Growing pipeline (SGLT2, complement inhibitors). Smaller MSL teams.

**Psychiatry/CNS (beyond neuro)** — Tricky. Pipeline activity uneven. Schizophrenia + depression have newer mechanisms but the field is conservative on rising-star identification.

**Pulmonology (non-oncology)** — Asthma + COPD biologics, IPF. Decent fit but smaller market.

### Deprioritized

**Rare Disease** — As you noted, tricky. Reasons:
- Population per indication too small for meaningful scoring
- MeSH terms fragmented across thousands of conditions
- Many rare diseases lack distinct Open Payments drug categories
- Pediatric-heavy means NPI/Medicare data is thin (pediatric Medicare = limited cohort)
- Better as a "platform extension" later — e.g., specific rare disease verticals (gene therapy rare diseases) once that infrastructure is mature

Keep the existing 44 Rare Disease HCPs scored. Don't actively expand.

---

## Per-TA Build Workstream (Reusable Template)

Each new TA requires the following work. Estimated 1.5-2.5 weeks per TA with proper scoping.

### Week 1: Data Foundation
1. **PubMed MeSH query construction** — Define query string (e.g., PUBMED_QUERY_IMMUNOLOGY_US). Test against PubMed. Validate hit count vs expected. (1-2 days)
2. **Run pubmed_pipeline.py** for the new TA → ingest **publications only** (no HCPs; keyed by pubmed_id, tags source_therapeutic_area_id + pubmed_authorships). (1 day runtime)
3. **Create HCPs via the OpenAlex chain** → openalex_pipeline.py (enrich pubs) → build_author_flat.sql → inventory upsert → **create_hcps_v2.py** (OpenAlex-first identity), then career_enrichment_from_clusters.py. HCP identity is minted here, NOT at ingestion. (1-2 day runtime)
4. **Trial ingestion** — Add TA-relevant ClinicalTrials.gov conditions to trial_ta_mapping.py keyword lists. (0.5 day)
5. **Run trial_ta_mapping.py** → tag trials. (15 min runtime)
6. **Run trial_investigator_matcher.py** → link trials to new HCPs. (1-2 hours runtime)

### Week 2: Signal Layer & Scoring
7. **Open Payments TA mapping** — Identify drug names + GPI codes for the TA. Update open_payments_aggregator.py drug-to-TA mapping logic. (1 day)
8. **Re-run open_payments_aggregator.py** for new TA aggregation. (1 hour runtime)
9. **Medicare TA mapping** — Identify Medicare procedure codes / drug codes for the TA. Update medicare_aggregator.py. (0.5 day)
10. **Re-run medicare_aggregator.py**. (30 min runtime)
11. **Canonical KOL validation** — Identify 5-10 known KOLs in the TA, verify they score correctly in Established cohort. (0.5 day)
12. **Run established_scoring.py --execute** for new TA. (~5 min runtime)
13. **Run scoring_pipeline.py --target-version v2** for new TA. (25 min runtime)

### Week 2.5: Community + Narratives
14. **Run community_classification.py** if eligible community HCPs need re-classification. (1 hour)
15. **Run community_scoring.py --execute** for new TA. (10 min runtime)
16. **Run claude_layer.py** to generate narratives for newly-scored HCPs in the TA. (3-6 hours runtime, depending on Claude API throughput)

### Week 2.5: NIH RePORTER Enrichment (Critical)
17. **Run nih_grants_pipeline.py** (TO BE BUILT post-ASCO) — Fetch NIH grants for the new TA's HCPs. R01, R21, K-series, U01, P01 awards.
18. **Run nih_grants_aggregator.py** — Per-HCP summary: active grants count, total funding, K-award flag, R01 flag, co-PI relationships.
19. **Add NIH funding signal to scoring** — Update Rising Star + Established formulas to incorporate funding velocity as a new signal.

Note: NIH RePORTER work is a one-time infrastructure build that benefits ALL TAs. Once nih_grants_pipeline.py exists, it runs against the entire HCP corpus. The TA-specific work is only re-running aggregation + scoring after each new TA is added.

### Frontend
20. **TA selector in UI** — Add new TA to dropdown filters.
21. **TA-specific cohort counts** — Verify fetchLiveCohortCountsForTAIds returns correct numbers.
22. **TA badge styling** — Color-code the new TA consistently with existing TAs.

---

## Strategic Notes

**NIH RePORTER is a force multiplier for TA expansion.** Once built post-ASCO, it adds funding signal to every TA we score. It's the highest-leverage Phase 2 infrastructure work because every new TA benefits.

**Multi-TA HCPs.** Many real KOLs work across TAs (e.g., a hepatologist who also publishes in NAFLD/obesity overlap; an oncologist with cardio-oncology interests). The current hcp_therapeutic_areas_v2 table supports multi-TA tagging. Future scoring iterations should reward HCPs with cross-TA breadth where appropriate.

**Don't underestimate canonical KOL validation.** Each new TA needs 5-10 known KOLs to anchor confidence. If those don't score in Established, the scoring formula needs TA-specific weight adjustment. Plan a half-day per TA for this.

**The "doctors in the wild" emphasis varies by TA.**
- Cardiology + Endocrinology have HUGE community physician populations (every PCP touches these).
- Heme onc + Cell therapy have SMALL community populations (mostly academic).
- Plan community signal weighting accordingly per TA.

**Pediatric crossover.** Many TAs have pediatric sub-populations (rare disease, heme onc, cardiology, immunology). NPI data is thinner for pediatric HCPs (less Medicare). Decide upfront whether each TA includes pediatric scope or splits adult/peds.

---

## Open Strategic Questions

1. **Sub-TA splitting strategy** — Some TAs (Cardiology) have natural sub-specialties. Launch as one TA or split immediately? Recommend: launch as one, split based on MSL feedback in Phase 8.

2. **Internal Medicine** — Most community physicians are IM-trained. Should there be a general "Internal Medicine" TA that captures the cross-TA generalists? Or do they only appear in specific TA cohorts when their practice signals indicate engagement?

3. **Specialty pharmacy** — Some TAs (rare disease, oncology) involve heavy specialty pharmacy interaction. Pharmacist HCPs aren't currently in scope. Add later?

4. **International expansion** — All current TAs are US-focused. EU + Asian markets have different signal data (no NPI, no Open Payments). Postpone international until US foundation is rock-solid across 5+ TAs.

---

## Realistic 12-Month Sequencing

Assumes ASCO 2026 launch May 29 with Hep/NSCLC/Rare Disease, then:

| Month | TA Added | Status |
|---|---|---|
| June 2026 | NIH RePORTER infrastructure | All-TA enrichment |
| July 2026 | Hematologic Oncology | Cell/gene therapy umbrella |
| August 2026 | Immunology | Largest MSL TA |
| September 2026 | (Buffer / MSL feedback) | Refine based on Phase 8 |
| October 2026 | Cardiovascular | Largest absolute MSL footprint |
| November-December 2026 | Neurology + sub-indications | MS + Alzheimer's lead |
| Q1 2027 | Cell/gene sub-indications | MM, AML, ALL, DLBCL within heme onc |
| Q2 2027 | Dermatology or Endocrinology | Based on market response |

By June 2027: 8-10 TAs in production. Platform ready for enterprise pharma conversations.
