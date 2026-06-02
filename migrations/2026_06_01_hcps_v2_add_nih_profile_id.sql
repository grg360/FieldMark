/* Add NIH profile_id to hcps_v2 for fast-path matching against NIH grant investigators */

ALTER TABLE public.hcps_v2 ADD COLUMN IF NOT EXISTS nih_profile_id bigint;

CREATE INDEX IF NOT EXISTS idx_hcps_v2_nih_profile_id ON public.hcps_v2 (nih_profile_id) WHERE nih_profile_id IS NOT NULL;

/* The column is nullable. Only HCPs matched against NIH grants will have this populated. */
/* Index is partial — skips null entries which are the majority */
