# sql/ — live database objects not covered by migrations

The files listed below are the **source of record for live DB functions that
exist nowhere in `supabase/migrations/`**. Migrations were used briefly in
June 2026 and then abandoned — every schema and function change since has been
applied directly in the Supabase SQL editor. These files capture those objects
as executable DDL so they are restorable, not just described.

## Rebuilding

Apply these files after the base schema exists (tables/views they reference:
`hcp_community_ranks_v2`, `hcp_author_metrics_for_cards_v2`,
`hcp_research_themes_v2`, `theme_to_canonical_v1`, `publications_v2`,
`publication_authors_v2`, `hcps_v2`). All statements are
`CREATE OR REPLACE FUNCTION` + `GRANT` — idempotent, safe to re-run in any
order.

## Files

| File | Defines |
|---|---|
| `community_qualification_gate.sql` | All four `get_community_filtered` / `get_community_filtered_count` overloads, carrying the NSCLC community-qualification gate (rationale in the header comment). |
| `get_shared_publications.sql` | `get_shared_publications(uuid, uuid, int)` — DB-side co-authored-publication intersection for a pair of HCPs. |
| `get_partner_publications.sql` | `get_partner_publications(text, text, int)` — DB-side co-authored-publication intersection for a pair of institutions. |
| `get_pulse_synthesis_facts.sql` | `get_pulse_synthesis_facts(text)` — the allowed current-window fact set (per-theme counts/share/composition, totals, window, events) handed to the Pulse TA-synthesis model; excluded fields (prior, movement, monthly, lifetime) never leave the DB. |
| `pulse_ai_synthesis.sql` | Cache table for the Pulse TA-level AI synthesis paragraph, keyed on `(ta_slug, window_start, window_end)`; written by the `generate-pulse-synthesis` Edge Function, read on page load. |
| `congress_schema.sql` | Congress calendar tables — `congress_abstracts` (ASCO abstract **metadata only**; `AbstractBody` never stored) and `congress_confirmed_presenters` (speaker matched to exactly one NSCLC board HCP). Loaded by `scripts/congress/ingest_asco_abstracts.py`. |
| `get_congress_social.sql` | `get_congress_social(text[], date)` — per-congress social aggregation over `social_posts_v2` by hashtag set (total posts, voices, WoW, observed-days daily series). SECURITY DEFINER; returns NULL when no posts. |

Definitions were captured from the live database via `pg_get_functiondef`
(2026-07-27) and verified to match what is deployed. If a function is changed
in the SQL editor again, re-capture it here in the same commit.

Other files in this directory (`add_npi_taxonomy_specialty.sql`, the pulse
prototype files) are one-off or prototype artifacts, not part of this
restorable set.
