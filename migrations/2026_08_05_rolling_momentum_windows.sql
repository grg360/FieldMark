-- Rolling momentum windows (2026-08-05): the two comparison windows are now
-- computed at run time (trailing 60 whole months vs the prior 60), so the
-- tables that carry window-scoped figures record the actual date ranges as
-- data. Fixed-label rows (hist_2016_2020 / recent_2021_2025 / 10yr / 5yr)
-- keep NULL ranges; rolling rows ('early_roll' / 'recent_roll') fill them.
ALTER TABLE hcp_network_centrality_v2
  ADD COLUMN IF NOT EXISTS window_start date,
  ADD COLUMN IF NOT EXISTS window_end date;

ALTER TABLE hcp_scientific_momentum_v1
  ADD COLUMN IF NOT EXISTS early_window_start date,
  ADD COLUMN IF NOT EXISTS early_window_end date,
  ADD COLUMN IF NOT EXISTS recent_window_start date,
  ADD COLUMN IF NOT EXISTS recent_window_end date;

ALTER TABLE hcp_network_momentum_v1
  ADD COLUMN IF NOT EXISTS early_window_start date,
  ADD COLUMN IF NOT EXISTS early_window_end date,
  ADD COLUMN IF NOT EXISTS recent_window_start date,
  ADD COLUMN IF NOT EXISTS recent_window_end date;
