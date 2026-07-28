<!--
LOSSLESS STRUCTURED-ARTIFACT EXPORT
Organizational work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Selected source path: content
Source text characters: 10559
Rendered characters: 12137
-->

Design reconciliation and review only. No Lab, database, container, service, branch, worktree, dataset, public-source request, Supabase connection, FieldMark mutation, pipeline execution, Ontologist domain work, vocabulary acceptance, provider call, deployment, or production promotion is authorized.

# UmbraOS Governed Functional Lab Platform Design — Revision 3

Revision: 3
Design version: functional-lab-design.v3
Work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Created: 2026-07-28T03:04:28.956266Z
Original artifact: `functional-lab-design-artifact-949bbb1f160b081747132ddb5576e48c`
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

## Executive correction

The reusable UmbraOS Lab control plane remains the destination, but the first
Breast proof deliberately uses `LOCAL_POSTGRES_PLUS_MANAGED_WORKTREE`. A known-good functional build
will become the parity reference for the later rootless OCI Lab adapter. This
is sequencing, not abandonment of the generic platform.

The generic hierarchy remains:

UmbraOS → Lab Platform → Application Lab Profile → Lab Instance → Dataset
Package → Domain Proposal Package → Validation Run → Evidence Package →
Promotion Candidate.

Design approval still does not authorize provisioning. A provisioned Lab still
does not authorize arbitrary runs, domain proposals, network access, or
production promotion.

## First-proof control plane and data plane

UmbraOS records definitions, source admission, authorizations, resource and
network caps, command admission, dataset and proposal registrations, run
manifests, evidence, spend, review, reset, and destruction.

The future first-proof data plane consists of one approved FieldMark managed
worktree, one isolated local PostgreSQL database, locally executed application
processes, isolated configuration, Tier 1 fixtures, logs, and disposable
intermediate outputs. Durable manifests and evidence live outside both the
disposable workspace and database.

The primary development agent owns the integration branch. The future managed
worktree pins an approved commit and never writes to the immutable audit
checkout. Promotion moves reviewed code, SQL, configuration, validated domain
packages, and replay instructions—not the Lab database.

## Network policy

`DEFAULT_DENY_WITH_RUN_SCOPED_ALLOWLIST` is the platform rule.

Default state:
- no outbound authorization;
- no public-source, provider, or production credentials;
- no production Supabase endpoint or database access.

A separately authorized LabRun may name domains, protocols, credential
references, request/rate limits, API cost, runtime, retries, dataset objective,
and evidence. The adapter enforces the policy without embedding FieldMark
domains in the generic orchestrator. At run end it removes temporary
credentials, closes egress, records contacted domains, requests and costs, and
preserves acquisition provenance. An unapproved destination fails the run.
Local Supabase-compatible application APIs, if later required, are distinct
from production Supabase access.

## Generic command admission

Every application profile supplies an explicit command-admission manifest.
Each entry records command ID, repository path, purpose, wave, arguments,
target objects, outputs, network and credential needs, runtime/cost estimate,
idempotency expectation, destructive classification, evidence checks, and
prohibited side effects. Commands absent from the manifest cannot run.

Application-specific target-version rules belong in the profile. The generic
platform verifies declared arguments, input predicates, allowed effects, and
post-run evidence before classifying success.

## Containerized destination

`FOLLOW_ON_PLATFORM_MILESTONE` retains the accepted rootless OCI adapter design:
private per-Lab network, isolated workspace/database volumes, read-only
content-addressed inputs, bounded secrets, and manifest-driven recreation.
After the first Breast proof, it must reproduce the accepted functional build,
bootstrap, outputs, evidence, network controls, reset, and teardown before it
can replace the simple topology.

## Reproducibility and failure semantics

Every Lab manifest records platform/profile versions, approved source commit,
workspace/database identifiers, schema and live-SQL hashes, database/tool
versions, configuration, dataset and proposal hashes, command manifest,
authorizations, process IDs, ports, logs, network/provider policies, resource
caps, and timestamps.

Reset remains `DESTROY_AND_RECREATE_FROM_MANIFEST`. Durable history, evidence,
domain proposals, validation, spend, review, and failures survive. Process
exit zero is only transport completion; application-profile postconditions
determine validity. `FAILED_VALIDATION` remains a failed run.

## Preserved governance

Dataset tiering, DomainProposalPackage, `AWAITING_CORPUS_VALIDATION`, per-term
hit counts, zero-result and collision checks, representative-publication
sampling, founder vocabulary review, durable truth-labelled evidence,
functional-proof versus production-safety boundaries, dedup-merge exclusion,
OpenAlex bound-the-input behavior, founder corpus calibration, KOL-board
judgment, and deferred Rising-model selection remain unchanged.

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

**Original artifact id:** functional-lab-design-artifact-949bbb1f160b081747132ddb5576e48c

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
