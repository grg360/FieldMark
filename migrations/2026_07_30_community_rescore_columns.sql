-- Community re-score (2026-07-30, approved after two dry runs) — schema part.
-- The NSCLC therapy-activity signal replaces the untraceable patient_volume input with
-- TWO separate, stored, traceable components (the old score's opaque 9,992 is exactly
-- what this prevents recurring). Data is written by the recompute script; this file is
-- columns + comments only.

alter table public.hcp_community_scores_v2
  add column if not exists nsclc_spend_3yr numeric,
  add column if not exists nsclc_volume_2023_est numeric,
  add column if not exists spend_signal numeric,
  add column if not exists volume_signal numeric;

comment on column public.hcp_community_scores_v2.nsclc_spend_3yr is
  'Σ total_paid_est across the curated NSCLC-relevant drug set (ta_hcpcs_codes drug_admin ∪ 2026-07-30 additions, minus denosumab/leuprolide), 2021-2023, from hcp_hcpcs_detail. Proxy: drugs cross indications; never label as NSCLC-verified.';
comment on column public.hcp_community_scores_v2.nsclc_volume_2023_est is
  'ESTIMATED distinct-patient FLOOR: MAX(tot_benes) across the NSCLC drug set, 2023 (most recent complete year), place-of-service deduped by MAX. Never a verified patient count — label "estimated" everywhere.';
comment on column public.hcp_community_scores_v2.spend_signal is
  'nsclc_spend_3yr min-max normalized 0-100 within the US NSCLC community cohort. Blended 50/50 with volume_signal into the 40% practice-activity component of composite_score.';
comment on column public.hcp_community_scores_v2.volume_signal is
  'nsclc_volume_2023_est min-max normalized 0-100 within the US NSCLC community cohort. Blended 50/50 with spend_signal into the 40% practice-activity component of composite_score.';
comment on column public.hcp_community_scores_v2.patient_volume is
  'LEGACY (pre-2026-07-30 re-score): stale, untraceable volume input. Superseded by spend_signal/volume_signal. Do not use for scoring or display.';

-- Corrected Medicare-paid lives beside (not over) the defective column, which is
-- retained for traceability and marked. See KNOWN_ISSUES "hcp_medicare_summary_v2 —
-- two semantics defects".
alter table public.hcp_medicare_summary_v2
  add column if not exists total_paid_3yr_corrected numeric;

comment on column public.hcp_medicare_summary_v2.total_paid_3yr_corrected is
  'Σ hcp_hcpcs_detail.total_paid_est (avg_per_service × services) across all codes, 2021-2023 — the real Medicare-paid figure.';
comment on column public.hcp_medicare_summary_v2.total_medicare_payment_3yr is
  'DEFECTIVE (verified 2026-07-30): computed as Σ(avg_per_service × beneficiaries) — not a total of anything; ~9.5× understated vs reality. Use total_paid_3yr_corrected. Retained for traceability only.';
