# Wave 1 Evidence — Table Count Reconciliation (207 vs 175)

Date: 2026-07-28
Prepared by: development agent, at founder request, for attachment to the Wave 1
bootstrap evidence record.
Measured against: production (live queries via run_sql.py, read-only) and
sql/schema_full.sql at its committed blob (git blob c638ae46978172988ceface378f5c73418880802,
commit 4fc1159, restrict-directives stripped in 3b7e0b1).
No Lab access, no Lab modification, no production modification.

## 1. Exact method behind 207

`information_schema.tables WHERE table_type = 'BASE TABLE'`, summed over
non-system schemas. Reproduced verbatim on production 2026-07-28:

| table_schema | count |
|---|---:|
| public | 172 |
| auth | 23 |
| storage | 8 |
| realtime | 3 |
| vault | 1 |
| **total (non-system)** | **207** |

(pg_catalog 64 and information_schema 4 are PostgreSQL's own and excluded from
any sane census.)

Note a coincidence worth recording so it never confuses a future review: a
naive substring count of "CREATE TABLE" in sql/schema_full.sql ALSO returns
207 — but only via a false positive. Line 564 is a string literal inside an
event-trigger function body ("'CREATE TABLE', 'CREATE TABLE AS', ...").
Actual CREATE TABLE statements in the dump: **206**.

## 2. Schemas included

All non-system schemas. Only five carry base tables: public, auth, storage,
realtime, vault. The schemas extensions, graphql, graphql_public, and
pgbouncer exist but hold no base tables (extensions holds 2 extension-owned
views).

## 3. Relation types

- **Partitioned parents: counted.** realtime.messages is `PARTITION BY RANGE
  (inserted_at)` (schema_full.sql:10116-10127) and appears as BASE TABLE.
- **Partition children: none exist** (0 rows with relispartition on
  production), so none counted.
- **Extension-owned tables: one — vault.secrets** (owned by supabase_vault
  per pg_depend deptype 'e'). It IS in the 207. It is deliberately NOT in the
  dump as CREATE TABLE: pg_dump excludes extension members; CREATE EXTENSION
  supabase_vault creates it on replay. Not a defect.
- **Foreign tables: none exist.**
- **Views (9) and materialized views (4): NOT counted** — excluded by the
  `table_type = 'BASE TABLE'` filter, and dumped as CREATE [MATERIALIZED]
  VIEW, never CREATE TABLE.

## 4. Method behind the earlier 175

**"Approximately 175 tables" is design-document prose, not a measurement.**
It appears as the baseline requirement in the R3/R4 profile text
(lab-design-v3/02_..._R4_FULL.md:75, "approximately 175 tables") and predates
the Q1 final review. No artifact in the repository yields exactly 175:

- The old INCOMPLETE schema candidate (414,937 bytes / 11,548 lines) counted
  **169** create_table (R4 doc 08 object-class counts).
- The current public schema holds **172** tables (dump and live, identical).
- The hand-maintained root sql/schema.sql contains **11** create-table
  statements (an early scaffold with seed INSERTs; never a source for 175).

One correction to the framing that accompanied this request: 175 was not the
Q1 review's count of old schema.sql — the Q1 review measured that file at ~a
dozen tables and explicitly corrected the 175 attribution. "~175" is best
understood as the R3-era approximation of the app's public-schema table count
(true value then 169–172).

## 5. Reconciled explanation of the 32-table difference

207 − 175 = 32 decomposes cleanly:

- **+35: schema scope.** The managed Supabase schemas (auth 23 + storage 8 +
  realtime 3 + vault 1) are in the all-schemas census and in no app-schema
  count.
- **−3: the approximation error in "≈175".** The public schema actually holds
  172 tables, and holds exactly 172 in BOTH the dump and live production.

The distinguishing test passes: public matches exactly (172 = 172); the
entire remaining difference lives in managed schemas.

## 6. Verdict: expected scope + one extension object. Zero schema drift.

- Dump CREATE TABLE census (public 172, auth 23, storage 8, realtime 3 = 206)
  equals the live census minus exactly one table: vault.secrets, which is
  extension-owned and correctly re-created via CREATE EXTENSION rather than
  CREATE TABLE. 206 (dumped) + 1 (extension) = 207 (live).
- Expected Lab-side result of the distinguishing query after a correct
  bootstrap replay (dump + extensions): identical — public 172, auth 23,
  storage 8, realtime 3, vault 1 = 207.
- No bootstrap defect found. The Lab was not rerun or modified.

## Canonical counting rule going forward

For cross-environment comparison, use the distinguishing query above and
compare per-schema. Never compare a substring grep of a dump against an
information_schema census: they answer different questions and only
coincidentally agreed at 207 here.
