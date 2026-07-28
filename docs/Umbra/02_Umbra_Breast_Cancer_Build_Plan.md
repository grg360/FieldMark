# Umbra’s Breast Cancer Build Plan

I will build Breast Cancer as a new indication under Oncology. I will first
confirm the active FieldMark build path, current production branch, and isolated
Lab design with the primary development agent. I will then define and validate
the Breast corpus, admit Breast through each pipeline stage, generalize the
Oncology indication selector, run a bounded Lab proof, and return a governed
promotion package. I will not access production Supabase, create a Lab, modify
FieldMark, or activate Breast without separate authorization.

## What I understand and what is undecided

The repository supports shared canonical HCP identity with TA-scoped derived
intelligence, JSON-driven ingestion precedent, a parent/indication frontend
context, and a staged incremental orchestrator. It also documents concentrated
frontend NSCLC assumptions and data-completeness risks. Breast already appears
as an inactive Oncology indication in the UI. These are strong reuse signals,
not proof that Breast runs end to end.

NSCLC provides the Oncology baseline. Atopic Dermatitis provides a second-TA
onboarding precedent. Reusable identity, author inventory, publication linkage,
dedup, trial, scoring, narrative, and route mechanisms must be tested rather
than copied into a Breast fork.

## Breast scientific scope

Launch Breast as one indication beneath Oncology. In Wave 1, make HR-positive /
HER2-negative, HER2-positive, triple-negative, early, locally advanced, and
metastatic disease first-class corpus concepts. Include endocrine resistance,
HER2-low, germline BRCA/HRD, PIK3CA/AKT, antibody-drug conjugates, CDK4/6
inhibitors, PARP inhibitors, and immunotherapy as enrichment/validation anchors.
Treat HER2-ultralow and narrower emerging concepts as explicit candidates for
later refinement unless sample-title validation shows they materially affect
launch recall. Do not create subtype product indications in Wave 1.

The query must require explicit breast malignancy context. It must reject breast
anatomy without cancer, benign disease, overly broad screening-only material,
animal/preclinical records outside product scope, the ambiguous abbreviation
“BC”, non-breast HER2 literature, and subtype terms without a breast anchor.

## Wave 0 — evidence and execution briefing

Confirm the canonical branch and current build playbook; identify but do not
create the future worktree; decide persistent versus local Lab; inspect Oncology
parent handling, NSCLC/AD configs, current hierarchy, active pipeline entry
points, and production-only dependencies. Resolve founder and development-agent
decisions. Return Wave 1 estimate, duration, source list, acceptance checks, and
stop conditions. My first concrete action is development review of this package.

## Wave 1 — ontology and corpus

Produce a versioned domain bundle: canonical disease name, aliases, MeSH terms,
title/abstract terms, historical terms, subtype/stage concepts, exclusions,
acronym collision analysis, therapies, drug classes, biomarkers, trial terms,
US-first and global queries, source versions, sample titles, noise taxonomy,
expected volume, and identity-pressure estimate.

Recommend US-first bounded proof before global expansion. Validate balanced
positive and negative title samples, inspect false-positive families, and retain
query provenance. Stop if noise is systematic rather than curatable.

## Wave 2 — configuration

Propose `config/therapeutic_areas/breast-cancer.json` or the development agent’s
confirmed canonical equivalent. Include slug/display name, Oncology parent,
indication level, retrieval configuration, NPPES specialties, trial mappings,
therapies, biomarkers, hidden visibility, geographic scope, corpus metadata, and
source versions. Reconcile the documented file-versus-database ingestion-config
split before considering the bundle complete.

## Wave 3 — pipeline admission matrix

| Stage | Current path/evidence | Breast requirement | Expected change | Validation |
|---|---|---|---|---|
| TA registration | TA config + `therapeutic_areas` | Oncology child, hidden | configuration/migration | parent/slug/visibility check |
| PubMed retrieval | `pubmed_pipeline.py` | bounded validated query | configuration | precision/recall sample |
| Publication ingest | ingestion scripts / `publications_v2` | idempotent Breast tagging | likely config; dual-source review | repeat dry proof/counts |
| OpenAlex enrichment | reingest stage 1b | authorships for bounded pubs | unchanged/config | enrichment completeness |
| Author inventory | `build_author_flat.sql`, incremental inventory SQL | current author bridge | unchanged unless scale finding | inventory deltas |
| HCP construction | `create_hcps_v2.py` | shared canonical identities | configuration/generalization check | collision and reuse report |
| Identity hash | `backfill_identity_hash.py` / creation path | consistent recovery | unchanged | duplicate-hash review |
| Publication-author link | `rebuild_publication_authors_v2.py` | Breast HCP scope | configuration/CLI | link completeness sample |
| TA assignment | TA tagging path | Breast membership | configuration | per-TA counts/no NSCLC loss |
| NPPES | TA-aware precedent | oncology specialty strategy | configuration/domain review | representative specialties |
| Institutions | shared institution paths | preserve shared records | likely unchanged | orphan/duplicate check |
| Trials | trial ingest/classifier | Breast conditions/interventions | mappings plus hardcode review | representative trials |
| Dedup detect | `dedup_detect.py` | report-only candidates | unchanged | false split/merge sample |
| Dedup merge | `dedup_merge.py` | shared-state survivor rules | no unattended broadening | dry run/blast radius |
| Leadership | publication leadership stage | Breast TA scope | config/generalization | sampled positions |
| Network influence | per-TA outputs | Breast network | likely config | cross-TA isolation |
| Pharma engagement | drug/class anchors | Breast therapies | configuration | representative payments |
| Established | TA-scoped rank/score | Breast threshold | calibration required | top-HCP review |
| Rising | rising score stage | Breast model choice | decision/config or reusable change | distribution/top-HCP review |
| Community | community score paths | Breast volume gate | likely reusable generalization | cohort distribution |
| Rank recompute | per-TA ranks | Breast only | config | stable rerun |
| Themes/positions/narratives | TA-parametric evidence | Breast vocabulary | prompt/config and paid-wave choice | representative QA |
| Telescope | frontend/app paths | active indication context | reusable frontend change | route/API test |
| Lists/profiles | current API/routes | selected Breast context | replace NSCLC fallback | regression matrix |
| Entitlement/visibility | parent/indication config | hidden until founder activation | reusable config | unauthorized/authorized tests |

Costs and runtime are estimated per future wave. No paid narratives or themes
belong in the first bounded proof unless separately approved.

## Wave 4 — multi-indication Oncology frontend

Implement `Oncology → NSCLC | Breast Cancer` from configuration. Preserve NSCLC
deep links, keep parent and indication explicit, drive API calls from active
indication, derive labels and visibility from configuration, preserve direct-link
context, and make Telescope and TA-scoped views use the selection. The current
evidence points to `TAContext.tsx`, `routeSlugs.ts`, `IndicationFilter.tsx`,
`TAFilterChips.tsx`, and `App.tsx`; development review must identify additional
consumers and reject invented paths. Breast remains hidden until activation.

## Wave 5 — bounded Lab proof

Apply approved migrations/configuration in Lab, ingest a bounded US-first sample
(directionally hundreds to low thousands of high-confidence publications, not
the global corpus), create authors/HCPs/links, add bounded trials, verify identity
and linkage, run one representative scoring slice, show Breast in the Lab
frontend, and retain bounded NSCLC fixtures.

Stop for excessive noise, unexpected duplicate identities, missing FK paths,
cap/runtime breach, unsafe cross-TA mutation, NSCLC regression, migration drift,
or incomplete rollback evidence.

## Wave 6 — full Lab

After proof approval, expand the corpus; complete approved stages; validate
Established, Rising, and Community representatives; trial mappings; network
behavior; narratives/positions if authorized; full UI; and actual cost/runtime.

## Wave 7 — promotion package

Return exact commit, configuration, ontology, migrations, run IDs, Lab results,
failures, row/relationship deltas, representative validation, NSCLC regression,
frontend acceptance, deterministic production replay, cost/duration, rollback,
hashes, and the next authority request.

## Wave 8 — future production promotion

Merge reviewed code; deploy hidden capability; separately apply migrations and
hidden configuration; run authorized deterministic production replay; verify;
ask the founder for activation; expose Breast. Never copy the Lab database.

## Decisions and timeline

Founder decisions: US-first/global-first; broad/bounded launch; HER2-low launch
status; subtype UI depth; Oncology entitlement coverage; Lab/replay budgets;
representative HCP sample; whether to stop before paid narratives/themes; and
the merge/deployment owner.

Development decisions: Lab choice/parity, branch ownership, canonical config,
idempotent stages, staging needs, frontend consumers, irreversible operations,
minimum proof, and critical path.

Directional timeline—not a commitment: Wave 0 one day; Lab foundation one to two
engineering days; ontology/config one to two; pipeline/frontend admission two to
three; bounded ingestion several wall-clock hours to a day; full Lab one to two
days plus ingestion; QA one day; packaging one day; production replay separately
estimated. Engineering effort, pipeline wall time, provider/public-source/database
cost, and founder review time remain separate. The earlier 5–8 focused working-day
promotion-readiness estimate must be challenged by the development agent.

## Detailed pipeline admission controls

The matrix below supplements the execution-path matrix with the fields required
for implementation authorization. “Estimate in wave” means no cost/runtime is
being invented during planning; the future ticket must calculate it before the
stage can run.

| Stage | Current repository path | Current schema objects | Breast requirement | Config only? | Code change? | Known blocker/unknown | Validation | Cost/runtime treatment |
|---|---|---|---|---:|---:|---|---|---|
| TA registration | TA config precedent and orchestration | `therapeutic_areas`, parent reference | Hidden Oncology child with immutable slug | likely | migration/config loader may be needed | file-vs-database config authority | parent/slug/visibility/hash | deterministic; estimate in foundation wave |
| PubMed retrieval | `scripts/ingest/pubmed_pipeline.py` | publication ingestion targets | bounded US-first query and provenance | likely | only if TA assumptions remain | corpus precision/volume | positive/negative sample and query replay | public-source/runtime estimate before Wave 1 |
| Publication ingest | active ingestion paths | `publications_v2`, TA relationships | idempotent shared publications plus Breast membership | mixed | unresolved | existing-row and TA-link behavior | repeat-run deltas, failures, unchanged NSCLC | database/runtime estimate per sample size |
| OpenAlex enrichment | `scripts/reingest_cycle.py` dispatch | author/OpenAlex bridge structures | enrich only admitted publications | likely | unresolved | external coverage/rate limits | completeness and unresolved authors | public-source/runtime estimate |
| Author inventory | `build_author_flat.sql`, incremental inventory evidence | author inventory/bridge objects | current authorship universe for Breast | likely no | only if scale/scope defect | current producer and checkpoint semantics | row deltas, duplicate author keys | SQL/runtime estimate |
| HCP construction | `scripts/classify/create_hcps_v2.py` | `hcps_v2`, identity fields | reuse canonical people across indications | no | only reusable fix if TA assumption found | live collision/idempotency unproven | identity-hash collisions, reuse/creation counts | compute/runtime estimate |
| Identity hash | `scripts/classify/backfill_identity_hash.py` and creation path | `identity_hash` constraints | same derivation/recovery policy | no | expected no | live uniqueness/data quality | null/duplicate/collision report | deterministic SQL/runtime estimate |
| Publication-author link | `scripts/classify/rebuild_publication_authors_v2.py` | publication-author relationships | correct Breast scope and authorship position | mixed | unresolved | Step-F scope/under-link risk | representative linkage and orphan counts | SQL/runtime estimate |
| TA assignment | active TA assignment path | HCP/publication TA join objects | Breast links without duplicating shared entities | yes/mixed | unresolved | exact active assignment producer | insert/update/unchanged counts | deterministic, bounded by corpus |
| NPPES and institutions | TA-aware ingestion/config precedent | HCP/institution relationships | Oncology specialty scope; shared institutions | likely | possible generalization | production-only dependencies | representative specialties, orphans, duplicate institutions | source/database estimate |
| Trials and TA mapping | current trial ingest/classifier paths | trial and trial-TA objects | Breast condition/intervention mapping | mixed | likely generalization | hard-coded TA conditions | representative trial set and link counts | source/runtime estimate |
| Dedup detection | `scripts/dedup/dedup_detect.py` | canonical HCP inputs | report Breast pressure without mutation | no | expected no | false split/merge doctrine under new corpus | reviewed candidate sample | compute estimate; no auto-merge |
| Dedup merge | `scripts/dedup/dedup_merge.py` | HCP-referencing FKs | preserve survivor rules and shared-state safety | no | only after defect | broad FK mutation and disconnected log utility | dry-run blast radius and post-merge checks | separately capped mutation wave |
| Leadership/network/pharma | `scripts/reingest_cycle.py` stage dispatch and active modules | TA-scoped derived outputs | Breast-scoped derived intelligence | mixed | generalize only proven assumptions | volume thresholds and drug vocabulary | distribution and cross-TA isolation | stage-specific runtime/provider/source cost |
| Established/Rising/Community/ranks | scoring/rank paths named by orchestrator | scoring/rank outputs | calibrated Breast distributions | mixed | likely calibration/generalization | NSCLC/AD thresholds may not transfer | representative top/cohort review and stable rerun | deterministic compute estimate |
| Themes/positions/narratives | TA-parametric later stages | derived text/theme outputs | Breast vocabulary only after core proof | mixed | prompt/config changes possible | paid cost and scientific review | sampled QA and receipt accounting | excluded from Wave 1; separate cap |
| Telescope/lists/profiles | `frontend/src/lib/TAContext.tsx`, `routeSlugs.ts`, `IndicationFilter.tsx`, `TAFilterChips.tsx`, `App.tsx` | API-backed TA-scoped views | explicit parent/indication in routes and calls | no | reusable frontend change likely | additional consumers not yet enumerated | route/API/deep-link and NSCLC regression | engineering estimate |
| Entitlement/visibility | current TA context/config surface | TA active/visibility structure | hidden until founder activation, parent-aware entitlement | mixed | development review required | whether Oncology entitlement covers both children | unauthorized/authorized visibility matrix | no activation in Lab planning |

## Effort, time, and cost envelope

These are ranges for planning, not promises. Wave 0 and development review are
roughly one focused day plus reviewer latency. Lab foundation is roughly one to
two engineering days. Ontology/configuration is one to two; pipeline admission
and frontend foundation two to three; bounded ingestion several wall-clock hours
to one day; full Lab one to two days plus source/runtime latency; QA about one
focused day; packaging about one; production replay is estimated only from
approved corpus and Lab actuals.

Track separately: engineering effort; wall-clock pipeline time; provider cost;
public-source fees/rate limits; Lab database/hosting cost; production replay
database cost; QA effort; founder review time. Every executable wave receives a
fresh cap and stop conditions. No timeline or budget here grants authority.
