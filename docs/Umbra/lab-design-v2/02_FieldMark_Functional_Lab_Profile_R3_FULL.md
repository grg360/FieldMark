<!--
LOSSLESS STRUCTURED-ARTIFACT EXPORT
Organizational work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Selected source path: content
Source text characters: 10855
Rendered characters: 12433
-->

Design reconciliation and review only. No Lab, database, container, service, branch, worktree, dataset, public-source request, Supabase connection, FieldMark mutation, pipeline execution, Ontologist domain work, vocabulary acceptance, provider call, deployment, or production promotion is authorized.

# FieldMark Functional Lab Profile — Oncology Expansion — Revision 3

Revision: 3
Design version: functional-lab-design.v3
Work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Created: 2026-07-28T03:04:28.956266Z
Original artifact: `functional-lab-design-artifact-efd1df7ff559afe9de90f42c4687505f`
Prior status: `SUPERSEDED_BY_REVISION_3`

Evidence boundary:
- Umbra independently inspected only `48540a5005f31c566036b7dde2cfcdf0e2276ba9`.
- Current FieldMark HEAD `9d1e4d7` and its findings are
  `DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD`.
- Umbra does not claim independent inspection of `9d1e4d7`.
- Static structural reference: `local-artifact-2f62a90b5a7567fff8a3df6ad500420f` at `2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee`.

Incorporated development-review findings:
- Repository migrations create only two tables and cannot bootstrap the approximately 175-table structural baseline.
- The first proof should use a managed worktree and isolated local PostgreSQL before container-platform parity work.
- Public-source acquisition requires default-deny egress with an explicit run-scoped allowlist.
- The approximately 210-script repository inventory is a discovery universe, not an authorized execution set.
- Admitted commands must explicitly target v2 and fail closed against silent legacy-table or zero-output execution.

Authority boundary:
Design reconciliation and review only. No Lab, database, container, service, branch, worktree, dataset, public-source request, Supabase connection, FieldMark mutation, pipeline execution, Ontologist domain work, vocabulary acceptance, provider call, deployment, or production promotion is authorized.

Unresolved assumptions:
- The final development review must confirm the exact source commit, bootstrap
  manifest, PostgreSQL requirements, service commands, and admitted commands.
- Lab resource caps, corpus and API budgets, retention, Oncology entitlement,
  cross-TA rehearsal, production replay, final activation thresholds, and the
  Breast Rising model remain unresolved founder decisions.

## Purpose

The FieldMark profile proves Breast functional behavior as a second Oncology
indication under the truth label `LAB_OBSERVED_FUNCTIONAL_BEHAVIOR`. It does
not prove production-scale identity stability, availability, performance,
live-role RLS, unrestricted cross-TA mutation, production idempotency,
deployment safety, activation readiness, or scientific validity.

## First-proof topology

Operating model: `LOCAL_POSTGRES_PLUS_MANAGED_WORKTREE`.

- Host: Umbra K11, pending founder authorization.
- Source: one dedicated managed FieldMark Git worktree pinned to the approved
  commit; no writes to the audit checkout or integration branch.
- Database: one explicitly named isolated local PostgreSQL database.
- Processes: backend, frontend, and admitted pipeline commands run locally
  with explicit PIDs, ports, logs, configuration, environment files, health
  checks, and teardown commands.
- Evidence: durable storage outside the disposable worktree and database.
- Credentials: no production Supabase URL, database URI, service-role key, JWT
  secret, provider credential, or inherited host secret.

No worktree, database, configuration, or process is created by this design.

## Correct structural bootstrap

Repository migrations are recorded history, not the clean-room authority: at
the reviewed HEAD they reportedly create only two tables while the structural
baseline contains approximately 175.

The required first-proof sequence is:

1. Apply repository-root `schema.sql`.
2. Read and validate `sql/README.md` from the approved source commit as the
   manifest of manually applied live SQL objects.
3. Apply the manifest entries in reviewed order.
4. Execute `NOTIFY pgrst, 'reload schema';`.
5. Run structural validation before fixtures.

At `9d1e4d7`, the development agent reports this live-object set:

1. `sql/community_qualification_gate.sql`
2. `sql/get_shared_publications.sql`
3. `sql/get_partner_publications.sql`
4. `sql/get_congress_social.sql`

The profile records that reviewed list as evidence, but implementation must
discover and hash the manifest at the approved commit. The generic platform
must not hardcode the list.

Bootstrap fails unless it verifies expected table count, `hcps_v2`,
`publications_v2`, required functions and overloads, indexes, grants, Lab-only
roles, schema reload, the `schema.sql` hash, manifest hash, and every applied
live-SQL file hash. The registered static schema remains structural evidence
for comparison and drift detection, not a substitute for approved source
bootstrap.

## Command admission and v2 fail-closed rule

The repository reportedly contains approximately 210 scripts. That is the
discovery universe. The execution set is only `LAB_COMMAND_ADMISSION_MANIFEST`, derived from
`docs/design/TA_GENERALIZATION_INVENTORY.md` and approved wave objectives.
Directory membership never grants admission.

For every admitted command supporting target-version selection:

- literal `--target-version v2` is present in the command manifest;
- authorization displays it;
- the LabRun manifest and evidence retain it;
- preflight verifies it before process start.

Preflight fails if v2 is omitted, v1 is selected, behavior is unknown, expected
v2 inputs are absent, or objective-required v2 inputs are unexpectedly empty
without an approved explanation.

Post-run validation confirms intended v2 targets or artifacts changed, required
outputs are nonzero, TA/provenance is correct, legacy v1 tables were not used,
and rerun behavior matches declared idempotency. Exit zero alone is not
success. Silent zero-output completion is `FAILED_VALIDATION`.

This design does not change FieldMark defaults.

## Network acquisition

Foundation runs with outbound network disabled. A future bounded corpus run
requires a separate authorization naming approved PubMed/NCBI, OpenAlex,
ClinicalTrials.gov, or other founder-approved domains; protocols; credentials;
request, cost, runtime and retry caps; objective; retention; and evidence.
OpenAlex remains bounded through the admitted input corpus, not by rewriting
the shared enrichment stage.

## Functional scope retained

The accepted proof still covers configuration, empirically validated
Ontologist vocabulary, bounded publication/author/institution/HCP mechanics,
trial linkage, Established scoring, Rising only after founder model choice,
Community, Scientific Pulse without paid synthesis, parent-to-indication UI,
NSCLC regression, rerun behavior, failure and reset. `dedup_merge` is excluded.
No paid narrative or theme generation is included.

Dataset tiers and the retained Dataset, Domain Proposal, and Evidence Contract
govern fixtures and future corpus packages. No proposal is accepted without
hit counts, zero/high-result and collision checks, representative publication
samples, coherence review, and founder validation.

**Design type:** FUNCTIONAL_LAB_DESIGN

**Design version:** functional-lab-design.v3

## Evidence classifications

### Current head

**Classification:** DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD

**Commit:** 9d1e4d7

**Umbra independently inspected:** False

### Umbra verified

**Classification:** UMBRA_VERIFIED_REPOSITORY_EVIDENCE

**Commit:** 48540a5005f31c566036b7dde2cfcdf0e2276ba9

## Executive summary

Design reconciliation and review only. No Lab, database, container, service, branch, worktree, dataset, public-source request, Supabase connection, FieldMark mutation, pipeline execution, Ontologist domain work, vocabulary acceptance, provider call, deployment, or production promotion is authorized.

Admit exact source and commands, establish the simple Foundation, load unvalidated proposals, generalize bounded surfaces, authorize a bounded corpus separately, validate functionally, then prove container parity.

The first Breast proof now uses a managed worktree and isolated local PostgreSQL, bootstrapped from schema.sql plus the current live-SQL manifest. Commands are explicitly admitted and v2 targeting fails closed.

Approve only final design review now; source, resources, retention, corpus scope, budgets and model choices remain separate decisions.

**Headline:** Functional Lab design Revision 3 ready for final review

Use a managed worktree and isolated local PostgreSQL for the first proof; retain the containerized Lab as a separately authorized parity milestone.

**Recommended posture:** READY FOR FINAL DEVELOPMENT REVIEW

**Review status:** FOUNDER_REVIEW_REQUIRED

### What changed

- Repository migrations create only two tables and cannot bootstrap the approximately 175-table structural baseline.
- The first proof should use a managed worktree and isolated local PostgreSQL before container-platform parity work.
- Public-source acquisition requires default-deny egress with an explicit run-scoped allowlist.
- The approximately 210-script repository inventory is a discovery universe, not an authorized execution set.
- Admitted commands must explicitly target v2 and fail closed against silent legacy-table or zero-output execution.

### What remains unproven

- The final development agent has not confirmed the corrected bootstrap and command set.
- No Lab, database, worktree, service, fixture, or corpus exists.
- Functional proof will not establish production safety.

**Implementation status:** NOT_AUTHORIZED

## Incorporated review findings

- Repository migrations create only two tables and cannot bootstrap the approximately 175-table structural baseline.
- The first proof should use a managed worktree and isolated local PostgreSQL before container-platform parity work.
- Public-source acquisition requires default-deny egress with an explicit run-scoped allowlist.
- The approximately 210-script repository inventory is a discovery universe, not an authorized execution set.
- Admitted commands must explicitly target v2 and fail closed against silent legacy-table or zero-output execution.

**Original artifact id:** functional-lab-design-artifact-efd1df7ff559afe9de90f42c4687505f

## Provenance

**Branch or worktree created:** False

**Container or database created:** False

**Current head evidence classification:** DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD

**Current head independently inspected:** False

**Dataset created:** False

**Fieldmark mutated:** False

**Lab creation authorized:** False

### Original artifact ids

**Authorization checklist:** functional-lab-design-artifact-3ee30369ed7d8bbf4ea56c5358d5c2ab

**Decision register:** functional-lab-design-artifact-8216ea2b649af9bace0bc2c2faa8dce6

**Development handoff:** functional-lab-design-artifact-60ba0c030724bc8797d270490104e3bf

**Fieldmark profile:** functional-lab-design-artifact-efd1df7ff559afe9de90f42c4687505f

**Founder review brief:** functional-lab-design-artifact-a1af49abfe16731af302c389e1a95063

**Platform design:** functional-lab-design-artifact-949bbb1f160b081747132ddb5576e48c

**Wave plan:** functional-lab-design-artifact-d62ef31926c31808aa2d70e1c9cda98e

**Original contract id:** functional-lab-design-contract-d8cce2cca7f5946bfee57b9743a8a580

**Parent plan id:** governed-promotion-plan-c531287a557bec1e86f723ebf1198a6f

**Parent work id:** 9b7a1aebeb6c4968a02101945da730d1

**Provider calls added:** 0

**Provider cost:** 0.00

**Provider invoked:** False

**Public source queried:** False

**Retained domain contract artifact id:** functional-lab-design-artifact-55b47aa55564cf4502c4b278639bee92

**Retry count:** 0

**Review disposition:** REVISION_REQUIRED

**Reviewed repository head:** 9d1e4d7

**Revision number:** 3

**Revision reason:** LAB_BOOTSTRAP_AND_FIRST_PROOF_TOPOLOGY

**Service started:** False

**Source artifact hash:** 2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee

**Source artifact id:** local-artifact-2f62a90b5a7567fff8a3df6ad500420f

**Supabase accessed:** False

**Umbra verified repository commit:** 48540a5005f31c566036b7dde2cfcdf0e2276ba9

**Retained domain contract artifact id:** functional-lab-design-artifact-55b47aa55564cf4502c4b278639bee92

**Review status:** FOUNDER_REVIEW_REQUIRED

**Revision number:** 3
