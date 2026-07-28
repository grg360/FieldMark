<!--
LOSSLESS STRUCTURED-ARTIFACT EXPORT
Organizational work ID: 3ec81bc4b1f347eebe16158e94e42a0c
Selected source path: content
Source text characters: 11996
Rendered characters: 13024
-->

Design and review only. No Lab instance, branch, worktree, clone, container, database, service, Supabase connection, FieldMark mutation, public-source query, corpus package, vocabulary acceptance, pipeline run, provider call, deployment, or production promotion is authorized.

# UmbraOS Governed Functional Lab Platform Design

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

## Executive design

UmbraOS should govern application Labs through a generic control plane and
replaceable application profiles. A Lab is an isolated proving environment,
not a copy of production and not production authority. The platform records
what may run, on which immutable inputs, for how long, within which network and
cost boundaries, and preserves the resulting evidence after the environment is
reset or destroyed.

Conceptual hierarchy:

UmbraOS → Lab Platform → Application Lab Profile → Lab Instance → Dataset
Package → Domain Proposal Package → Validation Run → Evidence Package →
Promotion Candidate.

## Conceptual entities

### LabDefinition

Reusable specification with `lab_definition_id`, `application_id`,
`owning_workspace_id`, `application_profile_version`,
`repository_source_policy`, service and database topologies,
schema-bootstrap policy, dataset and domain-proposal policies, network,
secrets, provider, validation, reset, retention and cost policies, and a
promotion-policy reference. A definition describes capability; it does not
prove a Lab exists.

### LabInstance

Authorized realization with `lab_instance_id`, definition, pinned source
commit and workspace reference, lifecycle, authorization record, provisioned
resource identifiers, private network identity, isolated database/volume
identity, approved dataset and proposal package IDs, resource caps, and
creation/reset/expiry/destruction timestamps.

### LabDatasetPackage

Immutable content-addressed input with application/profile, dataset class,
provenance, counts, indication scope, inclusion/exclusion rules, privacy
classification, checksums, timestamp, and retention. A package is admissible
only when its provenance and data boundary match the run authorization.

### DomainProposalPackage

Immutable proposal with application and indication, proposing role, proposal
type, structural reference, terms/signatures, intended concepts, signature
types, synonyms, exclusions, collision and ontology-lag warnings, confidence,
validation evidence references, founder status, checksums, and supersession.
States: DRAFT, PROPOSED, AWAITING_CORPUS_VALIDATION, VALIDATION_FAILED,
VALIDATED_WITH_FINDINGS, FOUNDER_REVIEW_REQUIRED, ACCEPTED, REJECTED,
SUPERSEDED. Proposal is never synonymous with accepted configuration.

### LabRun

Bounded execution with instance, objective, explicitly authorized and
prohibited stages, source commit, schema version, dataset, proposal and
configuration packages, timestamps, runtime, spend, state, and failure facts.

### LabEvidencePackage

Immutable output with run ID, claims and truth labels, validation outputs,
term-level hit counts, representative samples, tests, row counts, hashes,
rendered evidence, limitations, and reviewer disposition.

### LabAuthorization

Founder or delegated boundary with target definition/instance, operations,
prohibitions, budget/duration/data/network/provider/domain-agent boundaries,
expiry, authorizer and status. Provisioning and each run receive separate
authorization records.

These are implementation contracts for a later ticket, not database entities
created by this design.

## Lifecycle

DRAFT → DESIGN_REVIEW → READY_FOR_AUTHORIZATION → AUTHORIZED → PROVISIONING →
ACTIVE → VALIDATING → REVIEW_REQUIRED → ACCEPTED → ARCHIVED → DESTROYED.

BLOCKED, FAILED, EXPIRED and REVOKED are explicit side states. Design approval
does not authorize provisioning. Provisioning does not authorize every run.
Vocabulary proposals require empirical validation and founder review.
Production promotion is separate. Archived or destroyed instances cannot run,
but their authorizations, manifests, evidence, spend and failures remain.
Inside an active authorization wave, not-yet-running work is PENDING or
AUTHORIZED; only the current component is RUNNING.

## Control plane and data plane

UmbraOS control plane owns definitions, authorizations, lifecycle, caps,
package registration, orchestration, evidence, spend, review and teardown.
The Lab data plane contains the application workspace, isolated database and
services, bounded inputs, unvalidated proposal configurations, outputs,
Lab-only logs and caches. Creating a Lab never grants the control plane
production credentials. Domain agents receive only the proposal or validation
scope explicitly authorized for a run.

## Recommended first topology

- Host the initial implementation on Umbra K11.
- Use OCI-compatible rootless containers behind a replaceable Lab adapter.
- Create one private network, one application workspace and one isolated
  database volume per instance.
- Mount approved source artifacts content-addressed and read-only.
- Make only declared output locations writable.
- Disable outbound network by default; authorize domains and request ceilings
  per run.
- Never mount production Supabase credentials or inherited host secret files.
- Keep application databases and mutable volumes isolated from every other Lab.
- Never promote by copying the Lab database.

Preferred implementation technology is rootless Podman with Compose-compatible
descriptors because it offers local isolation without coupling the platform
contract to a vendor. Docker/Compose may satisfy the adapter if K11 support,
rootless isolation, health checks, resource caps and teardown are equivalent.

## Application Lab adapter

Each application profile supplies allowed repository sources and commits,
workspace model, service definitions, database requirements, schema bootstrap,
migration and fixture commands, start/stop and health commands, reset,
validation, proposal schema, corpus hooks, artifact collectors, prohibited
operations, promotion-package builder, cost estimator and expected outputs.
The generic orchestrator passes manifests and authorizations; it never
hardcodes FieldMark commands.

## Reproducibility and reset

Every instance manifest records UmbraOS and profile versions, source commit and
workspace ID, schema/migration/tool/image/configuration hashes, database engine,
dataset/proposal hashes, authorizations, network/provider policies, caps and
timestamps. Reset policy is DESTROY_AND_RECREATE_FROM_MANIFEST. Destruction may
remove ephemeral databases, containers, caches, temporary workspaces and
unretained intermediates; it must preserve run history, evidence, proposals,
validation, spend, reviews and failures.

## Secrets, connectors and evidence

No production URL, database URI, service-role key, JWT secret or unrestricted
row export enters a Lab. Secrets are mounted only for an authorized run,
redacted from logs/evidence and removed at completion. Future application
profiles request bounded connectors by declaring protocol, destinations,
credentials class, read/write capability, volume/rate/cost ceilings and
evidence hooks; approval extends the instance authorization without changing
the generic platform.

## Resource and cost model

Planning estimate for the later foundation:
- Engineering: 5–8 focused days for the generic core plus first FieldMark
  adapter, subject to current-HEAD command discovery.
- CPU/memory: 8–16 vCPU and 24–48 GB RAM for bounded local pipeline runs;
  validate against K11 before authorization.
- Storage: 20–40 GB steady for source, database, packages and retained
  evidence; 50–80 GB temporary cap during rebuilds and ingestion.
- Flatten planning floor: reported 802 MB steady relation and about 1.6 GB
  transient for side-table plus live-table copies; this is reported production
  evidence, not a guaranteed Lab measurement.
- Foundation runtime: provisioning/reset target 10–30 minutes; bounded Breast
  validation may require hours and must be estimated per run.
- Provider cost for first functional proof: $0 unless separately authorized.
- Local compute is existing capacity; public APIs, cloud database, provider,
  Ontologist validation, engineering review and founder time are separate
  future budget lines.

Founder-set caps are mandatory for storage, runtime, outbound requests, API and
provider spend, retries, and retained evidence.

## Promotion boundary

Promotion candidates contain reviewed source changes, migrations,
configuration, empirically validated vocabulary, deterministic replay
instructions, evidence, rollback and visibility controls. They never contain
the Lab database, credentials, temporary identities/caches, unvalidated
proposals, unreviewed output or raw volumes. Functional acceptance,
development review, vocabulary validation, founder calibration, required
cross-TA rehearsal, replay/rollback plans and activation approval remain
separate gates.

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
