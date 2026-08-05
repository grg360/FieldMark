-- Seed: pulse_concept_blocklist_v1 (29 rows, dumped 2026-08-05).
-- This reference table was hand-seeded with no producer in the repo
-- (2026-08-05 orphan-table sweep). This file makes it reproducible.
-- Idempotent: ON CONFLICT DO NOTHING per row.

INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Stage (stratigraphy)', 'OpenAlex homonym: cancer staging mapped to geology', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Paleontology', 'OpenAlex homonym: parent of Stage (stratigraphy)', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Infiltration (HVAC)', 'OpenAlex disambiguation artifact', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Refractory (planetary science)', 'OpenAlex disambiguation artifact', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Context (archaeology)', 'OpenAlex disambiguation artifact', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Incidence (geometry)', 'OpenAlex disambiguation artifact', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Docking (animal)', 'OpenAlex disambiguation artifact', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Adenocarcinoma', 'Histology-generic, non-thematic', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Lung', 'Histology-generic, non-thematic', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Hazard ratio', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Confidence interval', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Proportional hazards model', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Survival analysis', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Multivariate analysis', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Univariate analysis', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Univariate', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Multivariate statistics', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Odds ratio', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Log-rank test', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Receiver operating characteristic', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Nomogram', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Logistic regression', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Subgroup analysis', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Cochrane Library', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('MEDLINE', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Systematic review', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Meta-analysis', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Randomized controlled trial', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
INSERT INTO public."pulse_concept_blocklist_v1" ("concept_name", "reason", "added_at") VALUES ('Performance status', 'Study-design vocabulary', '2026-07-24T10:57:10.373721+00:00') ON CONFLICT ("concept_name") DO NOTHING;
