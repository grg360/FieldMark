-- Full per-HCP HCPCS claim detail (Stage 2 of the overlay data task — KNOWN_ISSUES
-- "Paid-vs-administered overlay"). Source: local CMS Medicare provider-service PUFs
-- 2021/2022/2023, filtered to NPIs matched to hcps_v2 (zero NPI collisions verified;
-- (npi, code, place_of_service) proven unique per year). Loaded by script; this file
-- is DDL + grants.
--
-- Build decisions (2026-07-30 brief):
--   • PER-YEAR rows, never pre-collapsed — per-code administered volume across years is
--     the only real trend data the platform holds. Aggregate at READ time.
--   • place_of_service stays in the grain for the same reason (aggregate at read):
--     ~3.4% of (npi, code) pairs split across Office/Facility rows, and summing
--     tot_benes across them at ingest would double-count patients seen in both.
--   • avg_mdcr_pymt_per_srvc is the PER-SERVICE average — NEVER render it as a total.
--     total_paid_est (generated, avg × services) is the only total-shaped column.
--   • At drug-code (J/Q) grain, tot_srvcs counts BILLED UNITS (e.g. 1 mg increments),
--     not encounters — label accordingly wherever displayed.
--   • Codes pass through a defensive trim/upper at load; verified 0 rows altered
--     (both sides already 5-char uppercase — joins ta_hcpcs_codes, hcpcs_descriptors
--     and top_hcpcs_codes by exact equality).

create table if not exists public.hcp_hcpcs_detail (
  hcp_id                 uuid not null references public.hcps_v2(id) on delete cascade,
  npi                    text not null,
  program_year           int  not null,
  hcpcs_code             text not null,
  hcpcs_desc             text,
  hcpcs_drug_indicator   text,             -- CMS Y/N flag
  place_of_service       text not null,    -- O (office) / F (facility) — part of the grain
  tot_benes              int,
  tot_srvcs              int,              -- billed UNITS at drug-code grain, not visits
  avg_mdcr_pymt_per_srvc numeric,          -- PER-SERVICE average. Never a total.
  total_paid_est         numeric generated always as
    (round((avg_mdcr_pymt_per_srvc * tot_srvcs)::numeric, 2)) stored, -- avg × services
  source                 text generated always as
    ('medicare_provider_service_' || program_year::text || '.parquet') stored,
  primary key (hcp_id, program_year, hcpcs_code, place_of_service)
);

comment on column public.hcp_hcpcs_detail.avg_mdcr_pymt_per_srvc is
  'PER-SERVICE average Medicare payment from the CMS PUF. Never render as a total — use total_paid_est (avg × tot_srvcs).';
comment on column public.hcp_hcpcs_detail.tot_srvcs is
  'At drug-code (J/Q) grain this counts billed units (e.g. 1 mg increments), not encounters.';

create index if not exists idx_hcp_hcpcs_detail_lookup on public.hcp_hcpcs_detail (hcp_id, program_year);
create index if not exists idx_hcp_hcpcs_detail_code on public.hcp_hcpcs_detail (hcpcs_code);

grant select on public.hcp_hcpcs_detail to anon, authenticated, service_role;
