# Schema Generation and Final Review Sequence

Read the complete Revision 4 design package first.

Then perform the following two-stage task.

## Stage 1 — Generate the complete schema bootstrap package

Generate the complete FieldMark schema-only bootstrap artifact from the live
database.

This is a read-only production operation.

Do not modify production data or schema.

Requirements:

1. Use `pg_dump --schema-only` against the current live FieldMark database.
2. Record the exact current `foundation-rebuild` HEAD.
3. The schema artifact must include, where present:

   - extensions, including the source of `gen_random_uuid()`;
   - schemas and types;
   - sequences;
   - tables;
   - primary and foreign-key constraints;
   - indexes;
   - functions and triggers;
   - grants;
   - RLS enablement and policies.

4. It must contain no:

   - table rows;
   - `COPY` payloads;
   - top-level data `INSERT` statements;
   - credentials;
   - connection strings;
   - passwords;
   - API keys;
   - JWTs.

5. Keep the separately managed live SQL files distinct from the `pg_dump`
   artifact:

   - `sql/community_qualification_gate.sql`
   - `sql/get_shared_publications.sql`
   - `sql/get_partner_publications.sql`
   - `sql/get_congress_social.sql`

6. Produce:

   - `fieldmark-complete-schema-bootstrap.sql`
   - `manifest.json`
   - `README.md`
   - `SHA256SUMS`

7. The manifest must include:

   - exact FieldMark HEAD;
   - source branch;
   - `pg_dump` version;
   - PostgreSQL server version;
   - creation timestamp;
   - schema-file SHA-256;
   - byte and line counts;
   - object-class counts;
   - no-data scan result;
   - sensitive-value scan result;
   - known limitations.

8. Place the completed package in:

   `/mnt/shared/umbra-os/fieldmark-breast-development-review/schema-bootstrap/`

Return the exact file paths and SHA-256 values.

## Stage 2 — Perform the final technical review

Review Revision 4 using:

1. the attached Revision 4 design documents;
2. the actual FieldMark repository at the reported HEAD;
3. the complete schema-only bootstrap artifact generated in Stage 1;
4. `docs/design/TA_GENERALIZATION_INVENTORY.md`;
5. the commit-specific `sql/README.md` manifest.

Follow the exact response structure in:

`13_Final_Development_Review_Prompt_R4_FULL.md`

Do not implement the Lab, create a worktree or local database, modify FieldMark,
run Breast pipelines, or begin Breast implementation.
