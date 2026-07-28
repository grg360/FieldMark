Primary governed artifacts:
- FieldMark Lab and Governed Promotion System: planning-artifact-76581ca2c03b49fbaa80128cce5e38dd
- Umbra’s Breast Cancer Build Plan: planning-artifact-6eb6ce4fb6eb0327bb1f5b8efc6b77a5

# FieldMark Lab and Breast Plan — Development Review Package

## Review status

READY FOR DEVELOPMENT REVIEW. This package requests technical reaction only.
It does not authorize implementation, a writable worktree, FieldMark Lab,
Supabase access, schema changes, ingestion, deployment, or production promotion.

## Governed inputs

- FieldMark immutable audit commit:
  `48540a5005f31c566036b7dde2cfcdf0e2276ba9`.
- Registered static schema:
  `local-artifact-2f62a90b5a7567fff8a3df6ad500420f`.
- Schema SHA-256:
  `2f62a90b5a7567fff8a3df6ad500420f755e515773796d3f8f60ba8b9d1056ee`.
- Existing FieldMark mastery posture: PROVISIONAL, NOT_CERTIFIED,
  POTENTIAL_PASS_WITH_FINDINGS.
- Primary artifacts: use the two other artifacts in this same immutable
  contract version.

## Proposed architecture

UmbraOS governs evidence, work, authority, cost, review, and promotion records.
FieldMark remains the application. The immutable audit checkout remains
read-only evidence. A future Breast development worktree would be separately
authorized and branch-owned. FieldMark Lab would use isolated credentials and
an isolated database. Production would remain separately credentialed and
separately authorized.

The current recommendation is to challenge a separate persistent Supabase Lab
project as the authoritative proving environment, with local Supabase retained
as an optional fast migration/reset tool. Promotion should move a reviewed
commit, idempotent migrations, hashed configuration and ontology, public-input
provenance, deterministic replay instructions, validation evidence, cost/runtime
actuals, and rollback instructions. It should not restore a Lab database over
production.

## Proposed Git and promotion model

The primary development agent owns the integration branch and final merge path.
Umbra-owned future changes, if authorized, use a separate narrow worktree and
branch. Conflicts stop the wave. Every promotion package names its source
baseline and exact reviewed commit and passes clean-worktree gates.

Code, schema, configuration, data replay, frontend deployment, validation,
activation, and rollback remain separate lanes. Breast-capable frontend code
deploys hidden. Production data is generated through identity-aware,
checkpointed, deterministic replay. Founder visibility approval occurs only
after verification. Rollback begins by hiding Breast and preserves shared HCP,
publication, institution, trial, and identity records.

## Proposed Breast sequence

1. Confirm architecture, branch ownership, current build path, and decisions.
2. Define a Breast ontology and bounded US-first corpus with explicit noise
   controls.
3. Author hidden Oncology-child configuration.
4. Map every pipeline stage and generalize only proven NSCLC/AD assumptions.
5. Implement parent-to-indication frontend behavior without a Breast fork.
6. Run a bounded Lab sample with NSCLC regression fixtures.
7. Expand only after corpus, identity, relationship, runtime, and cost gates pass.
8. Return a signed promotion package.
9. Seek separate production replay and activation authority.

## Questions for the primary FieldMark development agent

### Overall architecture

- Is the UmbraOS / immutable audit / writable development / Lab / production
  separation technically sound and reusable beyond Breast?
- Which proposed layer is unnecessary or overbuilt?
- What is missing?

### Lab choice

- Should the first authoritative Lab use a separate persistent Supabase project
  or local Supabase?
- Which extension, auth, RLS, policy, function, persistence, snapshot, or reset
  parity gaps matter?
- What is the simplest reliable first implementation?

### Git and workspace

- Is a separate writable worktree safe?
- How should branch ownership be divided between Umbra and the primary
  development agent?
- What fetch/rebase, review, merge, and conflict path should be required?

### Schema and configuration promotion

- Are idempotent migrations and immutable configuration bundles sufficient?
- Which current FieldMark objects need special handling?
- Are any schema objects unsafe or impractical to reproduce in Lab?

### Data replay

- Is deterministic production replay the right default?
- Which pipelines are actually idempotent?
- Where are identity collisions and unsafe shared-state mutation most likely?
- Which stages need staging tables or explicit reconciliation?

### Frontend

- What remains to support Oncology with NSCLC and Breast?
- Which components are still effectively single-indication?
- Is configuration-driven visibility sufficient?
- What deployment and activation order is safest?

### Breast plan

- Is one launch indication with subtype concepts appropriate?
- Which corpus decisions must be made first?
- Which pipeline stages are underestimated?
- What should be removed from the first Lab wave?
- What is the minimum convincing bounded proof?

### Promotion and rollback

- Which operations are not safely reversible?
- What must be snapshotted?
- What should use compensating migrations?
- Which shared records must never be deleted?

### Timeline

- Is five to eight focused working days to promotion readiness realistic?
- What is the development agent’s estimate and critical path?

## Required response format

```text
Overall disposition:
APPROVE | APPROVE_WITH_CHANGES | REVISION_REQUIRED | BLOCK

Architecture assessment:
...

Lab recommendation:
...

Git/workspace recommendation:
...

Promotion assessment:
...

Breast build assessment:
...

Critical risks:
...

Required changes before implementation:
...

Recommended first implementation ticket:
...

Estimated timeline:
...

Approval boundary:
...
```

Material technical objections must cite actual repository paths or code.
Review must not begin implementation or imply Lab, Supabase, production, merge,
deployment, or Breast Wave 1 authority.

## Key assumptions

- The immutable audit commit is evidence, not necessarily the future branch
  point; the development agent will identify intervening production changes.
- One canonical HCP identity with TA-scoped derived intelligence remains the
  intended platform model.
- Breast enters as one indication beneath Oncology and is hidden until an
  explicit activation decision.
- Deterministic identity-aware replay is the preferred promotion data path;
  staging bundles remain an exception to be justified.
- The Lab must never possess production credentials or write authority.

## Known unknowns

- Which current branch, migration baseline, environment bootstrap, and
  deployment path the primary development agent considers canonical.
- Whether persistent hosted Supabase or local Supabase provides the minimum
  reliable parity at acceptable complexity and cost.
- Which active pipeline stages are demonstrably idempotent and which need
  staging, checkpoints, reconciliation, or compensating behavior.
- Which frontend/API consumers still assume one indication.
- Actual Breast corpus volume, identity pressure, runtime, paid-stage cost, and
  representative-validation burden.
- Which schema/configuration operations are not safely reversible.
