<!--
LOSSLESS STRUCTURED-ARTIFACT EXPORT
Organizational work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Selected source path: content
Source text characters: 9254
Rendered characters: 11090
-->

## Accepted design areas

- Functional Lab proof remains separate from production-safety proof.
- The first proof uses local PostgreSQL plus a managed worktree on K11.
- The containerized Lab remains a follow-on parity milestone.
- Dataset tiers, evidence contracts, DomainProposalPackage and AWAITING_CORPUS_VALIDATION remain accepted.
- Ontologist proposals require empirical corpus evidence and founder review.
- Numeric calibration and KOL-board judgment remain founder-owned.
- dedup_merge remains excluded from Breast replay.
- OpenAlex remains bounded through admitted input.
- Command admission and run-scoped egress remain explicit.
- Design approval remains distinct from Lab-creation authorization.

Design reconciliation, governed static inspection, and authorization package preparation only. No Lab, database, branch, worktree, container, dataset, service, Supabase or production access, FieldMark mutation, pipeline, corpus query, Ontologist execution, provider call, deployment, or promotion is authorized.

# FieldMark Functional Lab Profile — Oncology Expansion — Revision 4

Revision: 4
Design version: functional-lab-design.v4
Work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Created: 2026-07-28T03:58:36.751096Z
Original Revision 3 artifact: `functional-lab-design-r3-artifact-6c88fc199e477994e451ade273d9b126`
Prior status: `SUPERSEDED_BY_REVISION_4`
Reviewed branch: `foundation-rebuild`
Reviewed commit: `UNKNOWN_FROM_REVIEW_RESPONSE`

Evidence:
- Umbra independently inspected only `48540a5005f31c566036b7dde2cfcdf0e2276ba9`.
- Branch findings are `DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD`.
- The reviewed response did not provide a commit; none is invented.
- Static schema candidate: `local-artifact-2f62a90b5a7567fff8a3df6ad500420f` at
  `2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee`.

Incorporated findings:
- The repository-root schema.sql is incomplete for clean PostgreSQL bootstrap.
- The authoritative Breast generalization surface is 24 scripts, not the repository-wide discovery count.
- FieldMark v2 targeting requires a code-level pre-Lab safeguard, not operator memory alone.

Accepted design retained:
- Functional Lab proof remains separate from production-safety proof.
- The first proof uses local PostgreSQL plus a managed worktree on K11.
- The containerized Lab remains a follow-on parity milestone.
- Dataset tiers, evidence contracts, DomainProposalPackage and AWAITING_CORPUS_VALIDATION remain accepted.
- Ontologist proposals require empirical corpus evidence and founder review.
- Numeric calibration and KOL-board judgment remain founder-owned.
- dedup_merge remains excluded from Breast replay.
- OpenAlex remains bounded through admitted input.
- Command admission and run-scoped egress remain explicit.
- Design approval remains distinct from Lab-creation authorization.

Authority boundary:
Design reconciliation, governed static inspection, and authorization package preparation only. No Lab, database, branch, worktree, container, dataset, service, Supabase or production access, FieldMark mutation, pipeline, corpus query, Ontologist execution, provider call, deployment, or promotion is authorized.

Unresolved dependencies:
- A complete schema-only bootstrap artifact must be admitted.
- The exact FieldMark HEAD and commit-specific SQL/command manifests require
  primary development-agent verification.
- Lab Foundation, Tier 1 fixtures and the v2 patch require a separate founder
  authorization; Breast corpus work remains separately authorized.

## Bootstrap

Model: `COMPLETE_SCHEMA_DUMP_PLUS_LIVE_SQL_MANIFEST`.

Repository-root `schema.sql` is explicitly insufficient. The admitted baseline
must contain extensions or an equivalent self-contained UUID-function source,
types where required, sequences, approximately 175 tables, constraints,
indexes, grants, RLS/policies, schemas/ownership and functions, with no rows or
credentials.

Current candidate disposition: `INCOMPLETE`.

Because it is not complete, `bootstrap_artifact_status` is
`AWAITING_COMPLETE_SCHEMA_ARTIFACT`; the current artifact is
`SUPERSEDED_FOR_LAB_BOOTSTRAP` while retained as historical structural
evidence. Lab creation authorization is unavailable until a passing immutable
artifact is supplied and admitted.

Future sequence:
1. Apply the admitted complete schema-only dump.
2. Discover and hash `sql/README.md` at the exact approved commit.
3. Apply its reported live files: community qualification gate, shared
   publications, partner publications and congress social.
4. Execute `NOTIFY pgrst, 'reload schema';`.
5. Validate the empty database before fixtures.

Wave 1 later fails as `FAILED_BOOTSTRAP_VALIDATION` unless extensions, schemas,
expected tables, `hcps_v2`, `publications_v2`, sequences, indexes, grants,
RLS/policies, live functions/overloads and reload all verify with zero data.
A second clean replay must yield the same structural result and hashes.

## Bounded execution surface

The repository contains approximately 210 Python scripts only as discovery
context. `docs/design/TA_GENERALIZATION_INVENTORY.md` defines the authoritative
24-script Breast generalization and execution surface. The first manifest
admits only the required subset of those 24, with exact commands, arguments,
target version, input/output objects, expected changes, network/credentials,
runtime/cost/retry/idempotency/destructive classification, checks and evidence.

## v2 safeguard

`fieldmark_v2_enforcement = REQUIRED_PRE_LAB_PLATFORM_CONTROL`.
Status: `DESIGNED_PENDING_IMPLEMENTATION_AUTHORIZATION`.

Preferred order, subject to current-source review:
1. Change admitted scripts to default v2 through a real shared argument or
   configuration mechanism where one exists.
2. Reject v1 in governed Lab mode through a shared startup assertion.
3. Fail on unexpectedly empty required v2 inputs.
4. Retain explicit `--target-version v2`.
5. Validate expected v2 outputs and record evidence.

No abstraction is invented when the source has none. The development agent
chooses the smallest clean implementation across the admitted 24-script
surface. Explicit v1, missing/unknown version, missing input and silent zero
output fail. Exit zero remains insufficient; silent zero output is
`FAILED_VALIDATION`.

**Design type:** FUNCTIONAL_LAB_DESIGN

**Design version:** functional-lab-design.v4

## Evidence classifications

### Current head

**Branch:** foundation-rebuild

**Classification:** DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD

**Commit:** UNKNOWN_FROM_REVIEW_RESPONSE

**Umbra independently inspected:** False

### Schema candidate

**Artifact id:** local-artifact-2f62a90b5a7567fff8a3df6ad500420f

**Classification:** MEASURED_LOCALLY_STATIC_ARTIFACT

**Sha256:** 2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee

### Umbra verified

**Classification:** UMBRA_VERIFIED_REPOSITORY_EVIDENCE

**Commit:** 48540a5005f31c566036b7dde2cfcdf0e2276ba9

## Executive summary

Design reconciliation, governed static inspection, and authorization package preparation only. No Lab, database, branch, worktree, container, dataset, service, Supabase or production access, FieldMark mutation, pipeline, corpus query, Ontologist execution, provider call, deployment, or promotion is authorized.

Admit the dump and exact HEAD, authorize Foundation/Tier 1/v2 patch, validate empty bootstrap, then propose corpus waves conversationally under separate authority.

Revision 4 requires a complete schema-only bootstrap artifact, uses the authoritative 24-script Breast surface, and makes v2 a code-level pre-Lab safeguard.

The next package is bounded to Foundation, Tier 1 fixtures and v2 enforcement; corpus work remains separate.

Retain local PostgreSQL plus a managed worktree on the existing 32 GB K11; block Foundation until a complete dump is admitted.

**Recommended posture:** FINAL AUTHORIZATION PACKAGE READY WITH BLOCKING ARTIFACT DEPENDENCY

**Review status:** FINAL_AUTHORIZATION_PACKAGE_READY

### What remains unproven

- No complete schema bootstrap artifact is admitted.
- The exact reviewed FieldMark commit was not supplied.
- No empty-database bootstrap or v2 patch has been executed.

**Implementation status:** NOT_AUTHORIZED

## Incorporated review findings

- The repository-root schema.sql is incomplete for clean PostgreSQL bootstrap.
- The authoritative Breast generalization surface is 24 scripts, not the repository-wide discovery count.
- FieldMark v2 targeting requires a code-level pre-Lab safeguard, not operator memory alone.

**Original artifact id:** functional-lab-design-r3-artifact-6c88fc199e477994e451ade273d9b126

## Provenance

**Branch or worktree created:** False

**Container or database created:** False

**Current head evidence classification:** DEVELOPMENT_AGENT_REPORTED_CURRENT_HEAD

**Current head independently inspected:** False

**Dataset created:** False

**Fieldmark mutated:** False

**Lab creation authorized:** False

### Original artifact ids

**Authorization checklist:** functional-lab-design-r3-artifact-a28840a30000c11b8033d96d5a3d46ed

**Decision register:** functional-lab-design-r3-artifact-65f56e6108c4d94d03e3d7c3a9d37d18

**Development handoff:** functional-lab-design-r3-artifact-0bedba61f37fa3473a22c0ad9bb2dd59

**Fieldmark profile:** functional-lab-design-r3-artifact-6c88fc199e477994e451ade273d9b126

**Founder review brief:** functional-lab-design-r3-artifact-22e61633c096dda732366596442caad7

**Platform design:** functional-lab-design-r3-artifact-2485a5d744d148bf4c8d717e52b9e607

**Schema completeness report:** functional-lab-design-r3-artifact-6c88fc199e477994e451ade273d9b126

**V2 enforcement handoff:** functional-lab-design-r3-artifact-0bedba61f37fa3473a22c0ad9bb2dd59

**Wave plan:** functional-lab-design-r3-artifact-de47d4c2374232df9051a111a71fdf96

**Original contract id:** functional-lab-design-r3-contract-5b77835b18a1de96307533e449fbda5d

**Parent plan id:** governed-promotion-plan-c531287a557bec1e86f723ebf1198a6f

**Parent work id:** 9b7a1aebeb6c4968a02101945da730d1

**Production accessed:** False

**Provider calls added:** 0

**Provider cost:** 0.00

**Provider invoked:** False

**Public source queried:** False

**Retained domain contract artifact id:** functional-lab-design-artifact-55b47aa55564cf4502c4b278639bee92

**Retry count:** 0

**Review disposition:** REVISION_REQUIRED_NARROW

**Reviewed repository branch:** foundation-rebuild

**Reviewed repository head:** UNKNOWN_FROM_REVIEW_RESPONSE

**Revision number:** 4

**Revision reason:** COMPLETE_SCHEMA_BOOTSTRAP_AND_V2_EXECUTION_GUARD

**Schema candidate disposition:** INCOMPLETE

**Service started:** False

**Source artifact hash:** 2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee

**Source artifact id:** local-artifact-2f62a90b5a7567fff8a3df6ad500420f

**Supabase accessed:** False

**Umbra verified repository commit:** 48540a5005f31c566036b7dde2cfcdf0e2276ba9

**Retained domain contract artifact id:** functional-lab-design-artifact-55b47aa55564cf4502c4b278639bee92

**Review status:** FINAL_AUTHORIZATION_PACKAGE_READY

**Revision number:** 4
