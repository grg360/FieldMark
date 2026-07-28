# FieldMark Breast Cancer Development Review Bundle

## Purpose

This package contains Umbra's proposed FieldMark Lab architecture, governed
promotion model, Breast Cancer implementation plan, and development-review
instructions.

It is intended for technical review by the primary FieldMark development agent
before any implementation begins.

## Recommended reading order

1. `01_Lab_and_Governed_Promotion_System.md`
2. `02_Umbra_Breast_Cancer_Build_Plan.md`
3. `03_Development_Review_Package.md`
4. `04_Founder_Review_Brief.md`
5. `05_Development_Agent_Prompt.md`

## Technical evidence

The `evidence/` directory contains the static, schema-only FieldMark Supabase
snapshot.

It contains:

- tables and columns;
- keys and constraints;
- indexes;
- functions and triggers;
- views;
- RLS and grants where present.

It does not contain:

- table rows;
- HCP or publication data;
- database credentials;
- Supabase API keys;
- connection strings;
- live database access.

## Repository baseline

Review against:

`48540a5005f31c566036b7dde2cfcdf0e2276ba9`

The canonical audit checkout was detached and clean when this package was
created.

## Authority boundary

This package authorizes technical review only.

It does not authorize:

- creating FieldMark Lab;
- accessing Supabase;
- modifying FieldMark;
- creating branches or worktrees;
- running Breast pipelines;
- deploying frontend changes;
- promoting anything to production.
