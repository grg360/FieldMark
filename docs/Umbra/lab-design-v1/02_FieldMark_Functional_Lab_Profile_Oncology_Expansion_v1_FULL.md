<!--
LOSSLESS STRUCTURED-ARTIFACT EXPORT
Organizational work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Selected source path: content
Source text characters: 9704
Rendered characters: 10732
-->

Design and review only. No Lab instance, branch, worktree, clone, container, database, service, Supabase connection, FieldMark mutation, public-source query, corpus package, vocabulary acceptance, pipeline run, provider call, deployment, or production promotion is authorized.

# FieldMark Functional Lab Profile — Oncology Expansion

Design version: functional-lab-design.v1
Work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Created: 2026-07-28T01:01:37.119240Z

Evidence classifications:
- Umbra-verified repository evidence: `48540a5005f31c566036b7dde2cfcdf0e2276ba9`
- Development-agent-reported current HEAD: `0dfec51` (DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD)
- Static structural evidence: `local-artifact-2f62a90b5a7567fff8a3df6ad500420f` at `2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee`
- Author-flatten operating evidence: DEVELOPMENT_AGENT_REPORTED_PRODUCTION_VERIFICATION

Authority boundary:
Design and review only. No Lab instance, branch, worktree, clone, container, database, service, Supabase connection, FieldMark mutation, public-source query, corpus package, vocabulary acceptance, pipeline run, provider call, deployment, or production promotion is authorized.

Unresolved assumptions:
- The exact approved implementation commit and the current
  `docs/design/TA_GENERALIZATION_INVENTORY.md` must be obtained or registered
  before source admission.
- Application start, migration, health, reset, and validation commands require
  current-HEAD development review.
- Lab budgets, public-source scope, retention, Rising model, Oncology
  entitlement, and production thresholds remain founder decisions.

## Purpose and truth boundary

The first profile proves that Breast Cancer functions as a second indication
under Oncology without claiming production-scale shared-state safety.
Evidence is labelled LAB_OBSERVED_FUNCTIONAL_BEHAVIOR.

The Lab may establish schema and migration compatibility, Lab-role RLS,
configuration validity, vocabulary hit/collision behavior, bounded corpus,
publication/author/HCP/trial linkage mechanics, scoring, Community, Scientific
Pulse, parent-to-indication UI, NSCLC regression, repeat-run behavior, runtime
and resource use. It cannot establish production identity stability,
production-scale performance/availability, live-role RLS, unrestricted
cross-TA mutation safety, production idempotency, deployment safety,
activation readiness, or scientific validity merely from plausible terms.

## Evidence source boundary

Umbra independently inspected only audit commit `48540a...`. Current HEAD
`0dfec51` and `docs/design/TA_GENERALIZATION_INVENTORY.md` are
DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD until registered. The public-schema
snapshot is structural evidence, not current migration or runtime proof.

Accepted review findings:
- Author flatten is RESOLVED through SIDE_TABLE_BUILD_AND_ATOMIC_SWAP. Reported
  verification preserved 3,372,771 rows, 802 MB relation size, indexes, grants
  and concurrent reads in about 65 seconds.
- Identity is MEASURED_NOT_BLOCKING: 290,205 canonical HCPs; 14,937 with
  ORCID; 275,268 without; 231,551 non-ORCID with OpenAlex shards; 1,411 fragile
  identities; 155 duplicate-signature groups. The fragile-identity prewrite
  audit and delta against 155 remain operational guards.
- `dedup_merge` is EXCLUDED_FROM_BREAST_REPLAY. Read-only detection may run;
  mutation requires a separate workflow.
- OpenAlex status is RETAIN_GLOBAL_BACKLOG_BEHAVIOR. Its operating principle is
  BOUND_THE_INPUT_NOT_THE_SHARED_ENRICHMENT_STAGE: Breast safety bounds the
  input corpus, not the shared enrichment implementation. Existing NSCLC/AD
  backlog is separate work and cost.
- TA consumer architecture requires bounded generalization, not an
  architectural refactor. Reported counts are approximate and may guide
  sizing, not substitute for the registered inventory.

## Source and workspace model

The primary FieldMark development agent owns the integration branch. A future
authorized Lab may use a dedicated managed worktree or clone pinned in the
manifest. UmbraOS never writes to the immutable audit checkout. Lab changes
stay isolated until development and QA review. Promotion moves reviewed code,
migrations, configuration and replay instructions, never the Lab database.

## Database bootstrap profile

1. Provision a new isolated local PostgreSQL database.
2. Apply the current repository migrations as the authoritative bootstrap.
3. Compare the result with the registered static snapshot for structural drift.
4. Install only approved extensions and Lab-only roles.
5. Load authorized Tier 1 fixtures and bounded packages.
6. Load DomainProposalPackages in AWAITING_CORPUS_VALIDATION state.
7. Verify constraints, row counts, role behavior, schema and migration hashes.

The static snapshot supports structural understanding, bootstrap comparison and
drift detection. It is not a replacement for current migrations.

## Service discovery contract

- Database: discover engine/extensions/migration tooling; private network only;
  persistent per instance; SQL and migration logs retained; volume destroyed
  on teardown.
- Backend/API: discover start command and dependencies; expose only through the
  Lab network or loopback gateway; health endpoint required; logs retained;
  ephemeral.
- Frontend: discover build/start commands and configuration; loopback exposure;
  route and asset health checks; build output/log retention; ephemeral.
- Pipeline runner: discover entry points and checkpoint storage; no inbound
  exposure; stage-level health/status; authorized output persistence.
- Object storage if required: discover actual dependency before inclusion;
  private; isolated volume; inventory and teardown evidence.
- Evidence collector: adapter-owned, read-only access to declared outputs;
  checksum health; retained package.
- Health monitor: control-plane service; no application mutation; retained run
  status.
- Vocabulary validator: bounded corpus package only; no public network unless
  the run separately authorizes it; term counts/samples retained.

Unsupported commands must be supplied by current-HEAD development review; this
design intentionally does not invent them.

## Dataset strategy

Tier 1 synthetic structural fixtures exercise schema, constraints, RLS,
routes/UI, validation failures and reset without production-derived identity.
Tier 2 bounded public-source packages exercise Breast publication, author,
institution, trial, scoring, hit-count and sampling mechanics; each source
requires run-specific network and cost authorization. Tier 3 sanitized
regression fixtures preserve representative NSCLC, fragile identity,
duplicate-signature and vocabulary edge conditions without unrestricted
production rows. Every fixture records provenance, sanitization, assertion,
retention, checksum and review authority.

## First bounded Breast proof

US-first, one Breast indication under Oncology; subtypes are corpus concepts.
HER2-low is a validation anchor, HER2-ultralow is deferred. Paid narratives,
paid theme generation and dedup merge are prohibited.

Validate configuration, proposal loading and empirical vocabulary checks,
bounded discovery, authorship/institution processing, identity-aware upsert
mechanics, trials, Established scoring, Rising only after founder model choice,
Community, Scientific Pulse without paid synthesis, parent navigation,
NSCLC/Breast switching, hidden Lab visibility, reruns, failure and reset.

## Functional acceptance

Acceptance requires schema/migration equivalence findings, healthy services,
bounded package provenance, successful reset/recreation, deterministic rerun
comparison, fragile identity and duplicate-signature guard results, term-level
validation, representative review, NSCLC regression, resource/spend evidence,
development disposition and founder review. It remains functional evidence,
not production authorization.

**Design type:** FUNCTIONAL_LAB_DESIGN

**Design version:** functional-lab-design.v1

## Evidence classifications

**Author flatten classification:** DEVELOPMENT_AGENT_REPORTED_PRODUCTION_VERIFICATION

**Current head:** 0dfec51

**Current head classification:** DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD

**Current head independently inspected:** False

**Schema artifact id:** local-artifact-2f62a90b5a7567fff8a3df6ad500420f

**Schema hash:** 2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee

**Umbra verified repository commit:** 48540a5005f31c566036b7dde2cfcdf0e2276ba9

## Executive summary

Design and review only. No Lab instance, branch, worktree, clone, container, database, service, Supabase connection, FieldMark mutation, public-source query, corpus package, vocabulary acceptance, pipeline run, provider call, deployment, or production promotion is authorized.

Admit current source, implement Lab foundation, structure unvalidated Breast proposals, generalize bounded consumers, validate an authorized corpus, then perform functional review.

Validate actual stack topology, versions/extensions, bootstrap and service commands, current-head inventory, corpus hooks, reset feasibility, resource estimates and missing parity.

Resolve source/workspace ownership, technology and resource caps, network/API/provider budgets, retention, dataset tiers, Rising model, entitlement and later production gates.

Use Umbra K11 with a replaceable rootless OCI adapter, one private network, isolated workspace and PostgreSQL volume per Lab, default-deny outbound access, and manifest-driven reset.

Design review is ready for a reusable UmbraOS Functional Lab platform and a bounded FieldMark Oncology profile; no Lab exists.

**Implementation status:** NOT_AUTHORIZED

## Provenance

**Branch or worktree created:** False

**Container or database created:** False

**Current head evidence classification:** DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD

**Current head independently inspected:** False

**Fieldmark mutated:** False

**Lab creation authorized:** False

**Parent plan id:** governed-promotion-plan-c531287a557bec1e86f723ebf1198a6f

**Parent work id:** 9b7a1aebeb6c4968a02101945da730d1

**Provider calls added:** 0

**Provider cost:** 0.00

**Provider invoked:** False

**Public source queried:** False

**Retry count:** 0

**Review disposition:** APPROVED_FOR_FUNCTIONAL_LAB_DESIGN

**Reviewed repository head:** 0dfec51

**Source artifact hash:** 2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee

**Source artifact id:** local-artifact-2f62a90b5a7567fff8a3df6ad500420f

**Supabase accessed:** False

**Umbra verified repository commit:** 48540a5005f31c566036b7dde2cfcdf0e2276ba9

**Vocabulary accepted:** False

**Review status:** FUNCTIONAL_LAB_DESIGN_READY_FOR_REVIEW
