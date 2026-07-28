# Founder Response — FieldMark Lab and Breast Cancer Development Review

**Responding to:** package `9b7a1aebeb6c4968a02101945da730d1`, created 2026-07-27
**Development review completed against:** HEAD `e28acea` (not the packaged baseline — see below)
**Date:** 2026-07-27

---

## Disposition

**REVISION_REQUIRED.**

The architecture is sound in its lane separation, its truth-labelling discipline, and its
insistence that promotion moves a reviewed release package rather than a database. Those are
kept. The revision is required because the central safety argument — prove it in an isolated
Lab, then deterministically replay to production — is invalid for precisely the operations that
carry production risk.

This is a revision, not a rejection. The Lab survives as the environment for functional proof.
It must stop claiming to discharge the cross-TA safety gate, because it structurally cannot.

---

## Baseline correction

The package pins review to `48540a5005f31c566036b7dde2cfcdf0e2276ba9`. That commit is **73
commits behind** current HEAD, not the ~40 initially assumed. Three post-baseline changes
materially affect the plan:

1. **The Community qualification gate hardcodes the NSCLC UUID in four live Postgres function
   overloads** (`sql/community_qualification_gate.sql`, functions `get_community_filtered` and
   `get_community_filtered_count`), plus two application layers
   (`scripts/narrative/generate_narratives_v2.py`, `frontend/src/lib/api.ts`). Wave 3 treats
   Community as "likely reusable generalization." It is not.

2. **Scientific Pulse is an entire new per-TA surface** added post-baseline and absent from the
   plan. It carries NSCLC-hardcoded SQL, a route defaulting to NSCLC, an NSCLC-only fixture, an
   Edge Function, and a cache table. It must enter the Wave 3 admission matrix.

3. **Cutting the plan's way:** the publication-intersection RPCs and the established/rising
   filtered families are cleanly TA-parameterised. Their NSCLC references are comments only.
   Not Breast blockers.

Wave 0's "identify intervening changes" step is therefore substantial and should be scoped
accordingly.

---

## The decisive finding

`build_author_flat.sql` opens with `DROP TABLE IF EXISTS author_pub_flat` and rebuilds the
entire table from the whole corpus with no TA parameter and no scoping predicate. The
orchestrator documents this in its own comments: a full-corpus rebuild, O(corpus), TA-agnostic,
invoked unconditionally on every cycle.

Tracing every stage the orchestrator invokes, the cross-TA writers are:

| Stage | Shared-state effect | Cross-TA |
|---|---|---|
| 1b OpenAlex enrich | enriches all un-enriched DOI pubs, not batch-scoped | yes, additive |
| 1c build_author_flat | DROP + CREATE whole table | yes, destructive rebuild |
| 2 create_hcps | writes shared canonical identity | yes, on hash collision |
| 7 dedup_merge | DELETE from canonical HCP table + FK re-parenting | yes, irreversible |

Consequence: an isolated Lab database holding Breast plus bounded NSCLC fixtures can prove that
these stages still *function*. It cannot prove that a `DROP TABLE` executed against a live
multi-million-row corpus is safe, that rebuilding at production scale shifts no identity hashes,
or that a merge won't attach a Breast record to the wrong existing person.

The plan already names "cross-TA mutation" as the Stage 4 risk. The finding is that the chosen
environment cannot retire it.

---

## Required changes before implementation

1. **Separate functional proof from safety proof.** State explicitly that the isolated Lab
   discharges functional readiness only, and that the cross-TA safety gate requires a
   co-resident, production-scale dataset. The Lab is retained for what it is good at:
   migrations, RLS, configuration-driven rendering, per-stage mechanics.

2. **Add a pre-write identity-reconciliation audit.** Identity hash is corpus-invariant only
   where ORCID is present. Without ORCID it derives from the modal display name and modal
   institution across an author's shards — both of which can shift when Breast authorships are
   added, producing a new hash for a person who already exists, and therefore a duplicate
   canonical row. The non-ORCID share of the HCP table is currently unmeasured. It must be
   measured before any write.

3. **Reclassify `dedup_merge` as irreversible.** It deletes canonical rows and re-parents
   foreign keys. It cannot be deterministically replayed to the same state and cannot be cleanly
   reversed. Either exclude it from the replay path or gate it behind a snapshotted manual step.

4. **Replace the five-file frontend estimate.** Development review enumerated roughly twenty
   functional single-indication consumers plus the Pulse surface, and additional backend
   hardcodes (a KOL surname allowlist keyed to the NSCLC UUID, trial TA mapping, an established
   scoring TA allowlist). Wave 4 is approximately four times its current scope.

5. **Define a production read-availability strategy for the flatten stage.** Every downstream
   consumer full-scans that table. A `DROP TABLE` must never execute under live production reads.
   Append-only flatten or swap-in rebuild.

---

## Founder decisions

**Scope.** Oncology is the platform's strategic direction. Breast is the correct first
expansion. US-first bounded proof is approved. One launch indication with subtype concepts as
corpus features — not subtype product indications — is approved.

**HER2-low.** Include as an enrichment and validation anchor in Wave 1 as proposed. HER2-ultralow
deferred.

**Paid stages.** No paid narrative or theme generation in the first bounded proof. Those enter
only after core identity, linkage, and scoring proofs pass, under a separate cap.

**Merge ownership.** The primary development agent owns the integration branch and final merge.
Unchanged from the proposal.

**Budgets and entitlement.** Deferred pending the revised plan. Both depend on the revised
sequencing.

---

## Pre-emptive platform work

Independent of this program, the flatten stage is being reworked from a full-corpus DROP and
rebuild to an incremental or swap-in operation. This removes the single most dangerous shared
-state mutation in the pipeline, benefits every future indication, and materially shrinks the
Breast risk surface before the program begins. The revised plan should assume this work is
either complete or in flight, and should not design around the destructive rebuild.

---

## Authorised next step

**One ticket only: a read-only identity-reconciliation harness.**

No writes. No Lab creation. No schema change. No Supabase mutation. No branch or worktree.

Against a dataset that co-resides real-scale existing inventory with a bounded Breast shard set,
recompute the identity hash for every affected non-ORCID person and report:

- the non-ORCID fraction of the canonical HCP population
- how many existing hashes shift under the Breast shard set
- projected duplicate creations

This settles whether deterministic replay is viable at all, and sizes the blast radius of the
cross-TA finding. It is the gating evidence for everything downstream, and it is the cheapest
possible way to obtain it.

Return the revised architecture and Breast plan incorporating the five required changes, plus
the harness design, for a second review. No further authority is granted by this response.

---

## Timeline

The 5–8 focused working day estimate to promotion readiness is not accepted. Development review
puts functional Lab readiness at approximately 12–18 engineering days, with production-safety
proof for the cross-TA mutations a distinct and larger effort that the current architecture does
not provide.

Critical path: corpus validation → identity harness → (SQL generalisation ∥ frontend
generalisation) → cross-TA rehearsal.

Revise the timeline against that path.

---

## What the package got right

Recorded because it should be preserved through the revision:

- Promotion as a reviewed release package moving through separate lanes, never a database copy.
- Shared canonical identity with TA-scoped derived intelligence as the platform model.
- Deterministic identity-aware upsert as the default data path for additive stages — correct,
  and it will replay cleanly for publications, inventory, TA membership, and links.
- Visibility as the lowest-risk rollback lever, with shared records preserved.
- Truth labelling at the point of use: repository expectation, static schema, Lab-observed,
  production-observed, inference, unverified assumption. This discipline is the reason the
  review could be conducted at all.
- The Breast scientific scope and the US-first bounded-proof sequencing. No objection.
