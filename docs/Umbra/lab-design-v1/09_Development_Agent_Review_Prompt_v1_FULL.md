# Functional Lab Design — Development-Agent Review

Review this Functional Lab platform design and FieldMark Oncology Expansion
profile against the actual FieldMark stack at the exact current HEAD.

This review grants no implementation authority.

Assess:

1. Can the proposed K11/rootless OCI topology run the actual stack?
2. What PostgreSQL version, extensions, roles and functions are required?
3. What are the exact current schema-bootstrap and migration commands?
4. What are the exact backend, frontend, pipeline and dependency start/health
   commands?
5. Is a managed worktree or clone safer, and who owns integration?
6. What changed after 0dfec51?
7. Does the design match docs/design/TA_GENERALIZATION_INVENTORY.md?
8. Are the three dataset tiers sufficient and appropriately bounded?
9. Does DomainProposalPackage fit trial and Scientific Pulse structures?
10. Can the current code generate per-term corpus counts, representative
    samples, zero/high-result and collision checks without unsafe access?
11. Which tests and validations must run per wave?
12. Is DESTROY_AND_RECREATE_FROM_MANIFEST feasible, including teardown?
13. What CPU, memory, steady/peak storage and wall-clock ranges are realistic?
14. Which production-parity assumptions are missing?

## Required response

### Overall disposition

APPROVE | APPROVE_WITH_CHANGES | REVISION_REQUIRED | BLOCK

### Repository state

- Exact current HEAD:
- Worktree state:
- Review date:

### Topology assessment

...

### Database and extension requirements

...

### Source/workspace recommendation

...

### Bootstrap, service, health and validation commands

...

### Dataset and DomainProposalPackage assessment

...

### Corpus-validation feasibility

...

### Reset and teardown assessment

...

### Resource and timeline estimate

...

### Missing parity assumptions and required changes

...

### Recommended bounded Lab Foundation ticket

...

### Approval boundary

...

Material objections must cite current repository paths, symbols, SQL objects,
commands, or the registered generalization inventory.

Do not create a branch, worktree, Lab, database, container, migration, dataset,
or implementation while performing this review.
