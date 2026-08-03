-- Field Intelligence Forum — real-vs-seed provenance (2026-08-03).
-- Adds is_seed to every content table. Existing rows (6 anchors, 8 threads,
-- 18 posts, post_notes, 4 moderation records) backfill to TRUE via the NOT NULL
-- DEFAULT true. The default STAYS true (fail-safe): only fi_create_thread /
-- fi_create_reply set is_seed=false, so anything not minted by the founder-gated
-- RPC is treated as fabricated. Compliance-safe: unknown provenance reads as seed.
BEGIN;

ALTER TABLE public.field_intel_anchors            ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT true;
ALTER TABLE public.field_intel_threads            ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT true;
ALTER TABLE public.field_intel_posts              ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT true;
ALTER TABLE public.field_intel_post_notes         ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT true;
ALTER TABLE public.field_intel_moderation_records ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT true;

-- Existing rows are all seed; the DEFAULT true above backfilled them. Re-affirm
-- explicitly so the intent is auditable and the migration is safe to re-run.
UPDATE public.field_intel_anchors            SET is_seed = true;
UPDATE public.field_intel_threads            SET is_seed = true;
UPDATE public.field_intel_posts              SET is_seed = true;
UPDATE public.field_intel_post_notes         SET is_seed = true;
UPDATE public.field_intel_moderation_records SET is_seed = true;

COMMIT;

NOTIFY pgrst, 'reload schema';
