<!--
LOSSLESS STRUCTURED-ARTIFACT EXPORT
Organizational work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Selected source path: content
Source text characters: 9227
Rendered characters: 10805
-->

Design reconciliation and review only. No Lab, database, container, service, branch, worktree, dataset, public-source request, Supabase connection, FieldMark mutation, pipeline execution, Ontologist domain work, vocabulary acceptance, provider call, deployment, or production promotion is authorized.

# FieldMark Lab Generalization Wave Plan — Revision 3

Revision: 3
Design version: functional-lab-design.v3
Work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Created: 2026-07-28T03:04:28.956266Z
Original artifact: `functional-lab-design-artifact-d62ef31926c31808aa2d70e1c9cda98e`
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

## Wave 0 — Source and command admission

- Approve the exact source commit and inspect changes after `9d1e4d7`.
- Verify clean source state and approve the managed-worktree policy.
- Load `docs/design/TA_GENERALIZATION_INVENTORY.md`.
- Read and hash `sql/README.md`.
- Build `LAB_COMMAND_ADMISSION_MANIFEST`; the approximately 210 scripts are
  discovery scope, not execution authority.
- Identify every command requiring `--target-version v2`.
- Record Umbra-verified versus development-agent-reported evidence labels.

Exit gate: final development review confirms source, bootstrap and command
admission; founder has not yet authorized provisioning.

## Wave 1 — Simple Lab Foundation

Later implementation may provision only after explicit authorization:
managed worktree, isolated local PostgreSQL, isolated configuration,
`schema.sql`, discovered live-SQL manifest, PostgREST reload where applicable,
local backend/frontend process boundaries, health/log/reset/teardown controls,
Tier 1 synthetic fixtures, and evidence capture.

Exit gate: structural bootstrap and reset prove repeatable without production
credentials or external egress.

## Wave 2 — Breast configuration and domain proposals

Register Breast under Oncology, visibility hidden. Load trial vocabulary,
subtype/biomarker mappings, Pulse themes/signatures, exclusions, synonyms and
collision warnings as `AWAITING_CORPUS_VALIDATION`. No vocabulary acceptance.

## Wave 3 — Backend, SQL, and admitted pipeline generalization

Use the current generalization inventory and explicit command manifest.
Authorize no directory or script family wholesale. Require v2 targeting and
pre/post evidence. Generalize the bounded Community, Pulse, scoring, trial,
TA-map, allowlist and other admitted surfaces only.

## Wave 4 — Frontend generalization

Validate inventory-based indication routes, API defaults, parent selection,
Community, Pulse, Telescope file resolution, hidden state, loading/empty/error
states, and NSCLC regression. Do not infer current paths absent final review.

## Wave 5 — Bounded Breast corpus and vocabulary validation

Requires separate authorization for domains, corpus rules, requests/API cost,
runtime/retries, retention, Ontologist validation, command admission, and
explicit v2 targets. Use bounded public inputs, dedup detection only, fragile
identity guard and duplicate-signature delta. Capture term hits, zero and
implausibly high results, acronym/short-term collisions, representative
publication samples and theme coherence. Failed proposals return for revision.

## Wave 6 — Functional validation

Require deterministic rerun, Breast functional checks, targeted scoring,
representative HCP/publication review, cross-indication UI, NSCLC regression,
vocabulary evidence, development review and founder review. Silent zero-output
commands are `FAILED_VALIDATION`. This wave is not production authorization.

## Follow-on Wave 7 — Containerized Lab parity

After an accepted Breast functional build exists, port its known-good topology
to the separately authorized rootless OCI adapter. Compare bootstrap, services,
outputs, evidence, network, secrets, reset and teardown. Wave 7 is not required
to begin or complete the first functional proof.

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

**Original artifact id:** functional-lab-design-artifact-d62ef31926c31808aa2d70e1c9cda98e

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
