# FieldMark Lab and Governed Promotion System

## Executive explanation

FieldMark Lab is an isolated environment in which Umbra can build, ingest,
validate, and demonstrate a new therapeutic-area indication without production
credentials or production mutation authority.

A governed promotion does not copy the Lab database into production. It moves a
reviewed release package through separate code, schema, configuration, data,
frontend, validation, activation, and rollback lanes.

The repository evidence supports this separation. FieldMark models one canonical
HCP row per person while derived intelligence is scoped per HCP and therapeutic
area. The current frontend already models a parent therapeutic area plus an
indication, and Breast is present as an inactive Oncology option. Those facts make
Breast a useful next indication, but they do not prove that the current pipeline
is repeatable in a live environment.

## System boundaries

- **UmbraOS** governs work, evidence, authority, cost, review, and promotion
  records. It does not become the FieldMark application or a production database
  client.
- **FieldMark source repository** remains the application source of record.
- **Immutable audit workspace** remains detached, clean, and read-only at the
  cited commit. It is evidence, never an implementation checkout.
- **Writable Breast development workspace** would be a separately authorized
  branch/worktree created from an approved source commit. It does not exist yet.
- **FieldMark Lab** would run Breast-capable code and bounded fixtures against an
  isolated database. It has Lab credentials only.
- **FieldMark production** remains a separate deployment and database authority.
- **Lab frontend** points only at Lab; the production frontend points only at
  production.
- **Founder/operator** authorizes waves, promotion, visibility, and any production
  action.
- **Primary development agent** owns technical review, merge guidance, and the
  agreed implementation branch.
- **QA reviewer** independently verifies gates and promotion evidence.

Recommended layout:

```text
UmbraOS
├── FieldMark audit workspace (immutable, detached, read-only)
├── FieldMark Breast development worktree (future, writable, isolated)
├── FieldMark Lab
│   ├── isolated Supabase project
│   ├── Lab-only credentials
│   ├── Lab frontend
│   ├── Breast configuration
│   ├── bounded NSCLC regression fixtures
│   └── generated validation evidence
└── governed promotion package (separately authorized)
```

## Lab choice

Start with a **separate persistent Supabase Lab project**, subject to development
review. It is the stronger first proving environment because it is persistent
across sessions and is more likely to reproduce hosted PostgreSQL extensions,
functions, RLS, policies, authentication behavior, and migration semantics.
Credential isolation is also easier to demonstrate: Umbra receives Lab-only
values, while production credentials never enter the Lab or UmbraOS.

Local Supabase remains valuable for fast migration rehearsal, reset tests, and
offline developer loops. Its weaknesses are environment drift, extension or
auth differences, per-machine state, and weaker demonstration of hosted runtime
behavior. The simplest dependable approach is therefore two-tiered: local
Supabase for quick disposable migration checks when the development agent wants
it, and one persistent isolated project as the authoritative Lab evidence source.
The development review must confirm extension parity, RLS behavior, reset/snapshot
support, cost, and whether the persistent project is operationally justified.

## Git and workspace model

Keep the production branch protected. Keep the audit checkout detached at the
immutable evidence commit. After explicit Lab-foundation authorization, create a
new writable worktree and a named development-agent branch from an agreed current
production commit, not automatically from the older audit commit. The audit
commit remains provenance; the development agent must first identify intervening
changes.

The primary development agent owns the integration branch and final merge.
Umbra-owned contributions, if later authorized, use a separate narrow branch.
Umbra fetches and rebases before beginning a wave and again before review;
she never rewrites the development agent's branch. Conflicts stop the wave and
return to the development agent. Promotion manifests identify the exact reviewed
commit, clean-worktree result, source baseline, and merge decision.

## Credential model

Use separate environment files and secret stores for Lab and production.
Lab code may receive only the Lab URL and Lab keys. Production credentials stay
with the separately authorized production operator and must never be copied into
UmbraOS, artifacts, prompts, logs, screenshots, manifests, or shell history.
Redact URLs and keys from logs; record only environment labels, secret versions,
and rotation timestamps. Rotating one environment must not require changing the
other. Provider authority and database authority remain separate: a provider call
cannot request more repository evidence or any database credential.

## Promotion lanes

**Code lane.** Future Umbra work occurs only in the isolated writable worktree.
Tests precede development-agent review, QA review, founder-approved merge, and
deployment. Deploying Breast-capable code does not activate Breast.

**Schema lane.** Author idempotent forward migrations. Rehearse them from the
agreed baseline in Lab, verify constraints/functions/policies, and include exact
migration IDs and hashes in the package. A schema dump is evidence, not a
migration mechanism. Production application requires separate authorization.

**Configuration lane.** Version Oncology parent and Breast indication metadata,
corpus/query rules, concepts, therapies, biomarkers, trial mappings, specialties,
scope, and visibility. Hash the immutable bundle. Breast defaults hidden.

**Data lane.** Never restore the entire Lab database over production. FieldMark
shares HCPs, publications, institutions, identities, trials, and cross-indication
relationships. The preferred production path is approved configuration, reviewed
code, approved public-source inputs, and deterministic replay using identity-aware
idempotent upserts. Existing canonical people stay shared; Breast adds membership
and TA-scoped outputs. Log failed rows, preserve run/checkpoint lineage, estimate
runtime and cost first, and verify that NSCLC identities are not duplicated.
A future controlled bundle may load into staging tables for comparison and
reconciliation, but deterministic replay is the default unless Lab proves it
impractical.

**Frontend lane.** Implement `Oncology → NSCLC | Breast Cancer` from configuration,
not a Breast-only branch. Deploy capability hidden, preserve existing NSCLC
routes, propagate active indication into API calls and Telescope, keep
entitlement parent-aware, and point each build to its own environment. Activation
is: deploy hidden capability, apply configuration hidden, replay data, validate,
obtain founder visibility authority, then expose Breast.

## Promotion package

```text
fieldmark-promotion/
├── manifest.json
├── source-commit.txt
├── migrations/
├── configuration/
├── ontology-and-query/
├── pipeline-runbook/
├── expected-operations/
├── validation-results/
├── frontend-acceptance/
├── production-replay-plan/
├── cost-and-duration-estimate/
├── rollback-plan/
└── SHA256SUMS
```

The manifest records source and target environments, exact commit and baseline,
migration IDs, artifact/configuration/ontology hashes, public-input dates,
expected inserts and updates, expected unchanged surfaces, cost and runtime
estimates, QA and development-review status, founder authorization ID, activation
flag, and rollback instructions.

## Lifecycle and gates

Use `DRAFT → LAB_BUILDING → LAB_VALIDATING → DEVELOPMENT_REVIEW → QA_REVIEW →
PROMOTION_READY → FOUNDER_AUTHORIZED → PRODUCTION_STAGING → PRODUCTION_REPLAY →
PRODUCTION_VERIFYING → ACTIVATION_PENDING → ACTIVE`. Failure states are
`REVISION_REQUIRED`, `PROMOTION_BLOCKED`, `ROLLBACK_REQUIRED`, and `ROLLED_BACK`.
Only the current component is RUNNING; later authorized work remains PENDING or
AUTHORIZED.

Gates cover configuration validation; clean source state; migration replay;
deterministic ingestion; identity collisions; TA-scoped links; representative
publication/HCP/trial review; scoring sanity; NSCLC regression; frontend
navigation; RLS/policies; cost/runtime; artifact hashes; QA; development review;
and founder visibility approval.

## Rollback

Make visibility the lowest-risk rollback lever: hide Breast, stop later waves,
disable its configuration, revert application code where required, apply
compensating migrations for safely reversible TA-specific structures, and
quarantine Breast-derived outputs. Preserve shared HCP, publication, institution,
trial, and identity rows. Never recommend a blind production restore or bulk
deletion of shared records. Take pre-promotion snapshots, classify reversible
versus irreversible operations, retain row/run lineage, and document where a down
migration is unsafe.

## Authority matrix

- Repository inspection and planning: Umbra may perform under this assignment.
- Worktree/branch creation and code change: only after a future wave authorization;
  branch ownership follows development-agent review.
- Public-source queries, Lab migrations/writes, and pipeline/provider execution:
  only under explicit wave scope and cap.
- Merge/deployment: primary development agent plus established founder/QA gates.
- Production migrations, ingestion, visibility, and rollback: explicit founder
  authorization only.
- Production credentials in UmbraOS, Lab-to-production writes, audit-checkout
  modification, and blind shared-row deletion: prohibited.

Every wave receives an estimate, cap, retry rule, expected duration, actual spend,
and unknown-cost treatment. High-cost research and production replay require
separate approval. Truth labels remain distinct: repository expectation, static
schema structure, Lab-observed behavior, production-observed behavior, inference,
and unresolved assumption.

## Roadmap

1. **Planning/architecture approval** — approve the reviewed architecture and
   decisions; prerequisite is development reaction; deliverable is a revised
   plan; authority is founder review; duration roughly one focused day; risk is
   solving the wrong environment; exit is written disposition.
2. **Lab foundation** — create isolated worktree/project/secret boundary; requires
   Wave authorization; deliverable is a tested empty Lab; roughly one to two
   engineering days; risk is parity drift; exit is migration/RLS/credential proof.
3. **Breast Lab Wave 1** — author ontology/config and bounded corpus proof; roughly
   one to two engineering days plus pipeline time; risk is corpus noise/identity
   pressure; exit is validated sample and NSCLC regression.
4. **Full Lab validation** — run approved stages and representative QA; roughly
   one to two days plus wall-clock ingestion; risk is cross-TA mutation; exit is
   complete evidence and actual cost/runtime.
5. **Promotion mechanism** — assemble signed manifest, replay, gates, and rollback;
   roughly one engineering day; risk is irreversibility; exit is QA and developer
   approval.
6. **Governed production replay** — future separate authority; risk is shared-state
   impact; exit is mechanical/representative production verification.
7. **Activation/monitoring** — founder visibility decision, progressive exposure,
   and monitored rollback; exit is stable active Breast with preserved NSCLC.

## Detailed authority, cost, and truth controls

| Operation | Umbra autonomous | Wave authorization | Explicit founder authority | Primary development agent | Prohibited |
|---|---:|---:|---:|---:|---:|
| Inspect immutable repository/schema evidence | yes, within approved scope | no | no | may review | writes remain prohibited |
| Create branch or writable worktree | no | required | required when scope changes | owns integration model | audit-checkout use |
| Change FieldMark code/configuration | no | required | required | reviews/merges | unreviewed production merge |
| Query approved public sources | no in this plan | required with scope/cap | high-cost expansion | reviews inputs | hidden evidence expansion |
| Apply Lab migrations or write Lab data | no | required | required for the wave | technical review | production credentials in Lab |
| Invoke a planning/analysis provider | only under persisted call/cost authority | required | cap escalation | may review output | retry/model escalation without authority |
| Apply production migration or replay data | no | no | separately required | executes or supervises agreed path | implied authority from Lab success |
| Activate Breast or roll back production | no | no | separately required | executes approved code action | blind restore/shared-row deletion |
| Handle production credentials | no | no | designated operator only | only if explicitly designated | artifacts, prompts, logs, UmbraOS |

Each future wave must persist its evidence package, input/output estimate,
per-wave hard cap, retry allowance, expected duration, and expected deliverable
before execution. Actual and unknown-cost provider receipts remain separate;
an unknown-cost call is never displayed as zero. Pipeline compute, public-source,
database, and provider costs are estimated independently. Monthly organization
budget visibility does not substitute for a wave authorization.

Truth must be labelled at the point of use: **repository expectation** describes
what immutable code/documentation says; **static schema structure** describes the
registered snapshot; **Lab-observed** and **production-observed** require actual
authorized execution in those environments; **inference** identifies reasoned
design recommendations; **unverified assumption** remains open. Lab success is
not production proof, and static schema cannot prove row state, transaction
behavior, data quality, idempotency, or production safety.

## Stage-by-stage implementation roadmap

| Stage | Objective | Prerequisite | Durable deliverable | Authority | Directional duration | Principal risk | Exit gate |
|---|---|---|---|---|---|---|---|
| 1 — Planning and architecture approval | Align Lab, Git, promotion, Breast scope, and ownership | This review package | Development-agent disposition and founder decisions | Review only | about 1 focused day plus review time | Building the wrong environment | Written APPROVE / changes / revision / block disposition |
| 2 — FieldMark Lab foundation | Establish isolated database, frontend, secrets, reset, and migration baseline | Stage 1 approval and a separately authorized worktree/Lab wave | Empty reproducible Lab with parity report | Separate founder wave authority | 1–2 engineering days | Hosted/local parity or credential leakage | Clean migration replay, RLS/function checks, reset proof |
| 3 — Breast Lab Wave 1 | Author ontology/config and prove a bounded high-confidence sample | Lab foundation and Wave 1 cap | Bounded corpus, HCP/link/trial/scoring slice, NSCLC regression evidence | Separate wave authority | 1–2 engineering days plus hours of pipeline time | Noise and shared-identity pressure | Corpus, collision, linkage, regression, cost/runtime gates pass |
| 4 — Breast full Lab validation | Expand approved scope and complete required stages | Bounded proof accepted | Full Lab validation dossier and actual cost/runtime | Separate wave authority | 1–2 days plus ingestion time | Cross-TA mutation or scale failure | Representative HCP/trial/network/UI/QA acceptance |
| 5 — Promotion mechanism implementation | Produce signed lanes, manifests, replay, verification, and rollback | Stable Lab result and current production baseline | Immutable promotion package with SHA256SUMS | Development review, QA, then founder readiness review | about 1 engineering day | Non-reversible operations or stale baseline | Package integrity, dry-run/rehearsal, named operators |
| 6 — Governed production replay | Apply separately approved code/schema/configuration and deterministic replay hidden | Promotion-ready package and fresh estimate | Production run ledger and verification evidence | Explicit production authorization only | separately estimated; potentially hours to days | Shared-state blast radius | Expected deltas, unchanged NSCLC surfaces, no unresolved material failures |
| 7 — Activation and monitoring | Expose Breast progressively and monitor health/rollback signals | Production verification and visibility decision | Activation record and monitoring/rollback log | Explicit founder visibility authority | review plus monitored rollout | Hidden defects after exposure | Stable indicators, accepted founder disposition, rollback window closed |
