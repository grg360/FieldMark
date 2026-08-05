-- Seed: regions (9 rows, dumped 2026-08-05).
-- This reference table was hand-seeded with no producer in the repo
-- (2026-08-05 orphan-table sweep). This file makes it reproducible.
-- Idempotent: ON CONFLICT DO NOTHING per row.

INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('US', 'United States', 1, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('EU5', 'EU5 (DE/FR/IT/ES/UK)', 2, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('EU', 'European Union', 3, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('UK', 'United Kingdom', 4, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('APAC', 'Asia-Pacific', 5, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('LATAM', 'Latin America', 6, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('MENA', 'Middle East & North Africa', 7, false, false) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('Other', 'Other', 8, false, true) ON CONFLICT ("region_key") DO NOTHING;
INSERT INTO public."regions" ("region_key", "display_name", "sort_order", "is_global", "is_catchall") VALUES ('Global', 'Global', 9, true, false) ON CONFLICT ("region_key") DO NOTHING;
