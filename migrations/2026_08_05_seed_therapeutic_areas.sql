-- Seed: therapeutic_areas (6 rows, dumped 2026-08-05).
-- This reference table was hand-seeded with no producer in the repo
-- (2026-08-05 orphan-table sweep). This file makes it reproducible.
-- Idempotent: ON CONFLICT DO NOTHING per row.

INSERT INTO public."therapeutic_areas" ("id", "name", "slug", "parent_ta_id", "ta_level") VALUES ('833e7b38-d01b-409e-82c0-71eb29e138a0', 'Rare Disease', 'rare-disease', NULL, 'broad_ta') ON CONFLICT ("id") DO NOTHING;
INSERT INTO public."therapeutic_areas" ("id", "name", "slug", "parent_ta_id", "ta_level") VALUES ('9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e', 'Hepatology', 'hepatology', NULL, 'broad_ta') ON CONFLICT ("id") DO NOTHING;
INSERT INTO public."therapeutic_areas" ("id", "name", "slug", "parent_ta_id", "ta_level") VALUES ('095bc902-c3dc-48a3-8167-52ee55795d60', 'Oncology', 'oncology', NULL, 'broad_ta') ON CONFLICT ("id") DO NOTHING;
INSERT INTO public."therapeutic_areas" ("id", "name", "slug", "parent_ta_id", "ta_level") VALUES ('c0065b03-a25e-4e9a-bde4-4b4d0db7827d', 'NSCLC', 'nsclc', '095bc902-c3dc-48a3-8167-52ee55795d60', 'indication') ON CONFLICT ("id") DO NOTHING;
INSERT INTO public."therapeutic_areas" ("id", "name", "slug", "parent_ta_id", "ta_level") VALUES ('4cf07827-ff1c-451e-832e-0e0a14ea9c86', 'Immunology', 'immunology', NULL, 'broad_ta') ON CONFLICT ("id") DO NOTHING;
INSERT INTO public."therapeutic_areas" ("id", "name", "slug", "parent_ta_id", "ta_level") VALUES ('9e4139d2-e062-4a58-8728-cdabb2d7dca1', 'Atopic Dermatitis', 'atopic-dermatitis', '4cf07827-ff1c-451e-832e-0e0a14ea9c86', 'indication') ON CONFLICT ("id") DO NOTHING;
