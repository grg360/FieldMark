-- FieldMark Database Schema
-- Run this in Supabase SQL Editor in order

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────
-- THERAPEUTIC AREAS (lookup table)
-- ─────────────────────────────────────────
create table therapeutic_areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique   -- e.g. 'rare-disease', 'oncology', 'immunology'
);

insert into therapeutic_areas (name, slug) values
  ('Rare Disease',  'rare-disease'),
  ('Oncology',      'oncology'),
  ('Immunology',    'immunology');

-- ─────────────────────────────────────────
-- HCP PROFILES (core entity)
-- ─────────────────────────────────────────
create table hcps (
  id             uuid primary key default gen_random_uuid(),
  npi_number     text unique,           -- National Provider Identifier (US)
  first_name     text not null,
  last_name      text not null,
  credentials    text,                  -- e.g. 'MD, PhD'
  institution    text,
  city           text,
  state          text,
  zip_code       text,                  -- For MSL territory mapping
  country        text default 'US',
  specialty      text,                  -- e.g. 'Hematology'
  subspecialty   text,                  -- e.g. 'CAR-T / Cell Therapy'
  opt_out        boolean default false, -- HCP privacy: opt-out flag
  is_claimed     boolean default false, -- HCP has verified their own profile
  created_at     timestamp with time zone default now(),
  updated_at     timestamp with time zone default now()
);

-- ─────────────────────────────────────────
-- HCP ↔ THERAPEUTIC AREA (many-to-many with strength score for heat map)
-- ─────────────────────────────────────────
create table hcp_therapeutic_areas (
  id                   uuid primary key default gen_random_uuid(),
  hcp_id               uuid not null references hcps(id) on delete cascade,
  therapeutic_area_id  uuid not null references therapeutic_areas(id),
  strength_score       float default 0,  -- 0–100; drives TA heat map
  last_calculated      timestamp with time zone default now(),
  unique (hcp_id, therapeutic_area_id)
);

-- ─────────────────────────────────────────
-- PUBLICATIONS (PubMed-sourced)
-- ─────────────────────────────────────────
create table publications (
  id             uuid primary key default gen_random_uuid(),
  hcp_id         uuid not null references hcps(id) on delete cascade,
  pubmed_id      text unique not null,
  title          text,
  journal        text,
  pub_year       integer,
  citation_count integer default 0,
  doi            text,
  ingested_at    timestamp with time zone default now()
);

-- ─────────────────────────────────────────
-- CLINICAL TRIALS (ClinicalTrials.gov-sourced)
-- ─────────────────────────────────────────
create table clinical_trials (
  id                uuid primary key default gen_random_uuid(),
  nct_id            text unique not null,  -- e.g. 'NCT04567890'
  title             text,
  phase             text,                  -- 'Phase 1', 'Phase 2', etc.
  status            text,                  -- 'Recruiting', 'Active', 'Completed'
  sponsor           text,
  start_date        date,
  completion_date   date,
  ingested_at       timestamp with time zone default now()
);

-- ─────────────────────────────────────────
-- TRIAL INVESTIGATORS (HCP ↔ trial junction)
-- ─────────────────────────────────────────
create table trial_investigators (
  id        uuid primary key default gen_random_uuid(),
  hcp_id    uuid not null references hcps(id) on delete cascade,
  trial_id  uuid not null references clinical_trials(id) on delete cascade,
  role      text,  -- 'Principal Investigator', 'Co-Investigator', 'Sub-Investigator'
  unique (hcp_id, trial_id)
);

-- ─────────────────────────────────────────
-- HCP SCORES (scoring outputs, versioned)
-- ─────────────────────────────────────────
create table hcp_scores (
  id                       uuid primary key default gen_random_uuid(),
  hcp_id                   uuid not null references hcps(id) on delete cascade,
  therapeutic_area_id      uuid references therapeutic_areas(id),
  composite_score          float,   -- 0–100 overall rising star score
  pub_velocity_score       float,   -- Recent pubs vs career baseline
  citation_trajectory_score float,  -- Citation growth rate
  trial_investigator_score float,   -- PI/Co-I roles, phase weighting
  congress_score           float,   -- Abstracts and presentations
  msl_signal_score         float,   -- Anonymized field contributions
  score_version            text,    -- e.g. 'v1.0' — allows algorithm iteration
  calculated_at            timestamp with time zone default now()
);

-- ─────────────────────────────────────────
-- USERS (MSL / field medical, LinkedIn OAuth)
-- ─────────────────────────────────────────
create table users (
  id              uuid primary key default gen_random_uuid(),
  linkedin_id     text unique not null,
  email           text,
  full_name       text,
  role_verified   text,        -- 'MSL', 'Medical Director', 'Field Medical' etc.
  institution     text,        -- Pharma company (not required at signup)
  is_active       boolean default true,
  created_at      timestamp with time zone default now()
);

-- ─────────────────────────────────────────
-- MSL CONTRIBUTIONS (anonymous, structured, verified-contributor)
-- Contributor identity is known to the system but never exposed publicly.
-- field_type is an enum-style constraint — no free text allowed.
-- ─────────────────────────────────────────
create table msl_contributions (
  id                    uuid primary key default gen_random_uuid(),
  hcp_id                uuid not null references hcps(id) on delete cascade,
  contributor_id        uuid not null references users(id),
  field_type            text not null check (field_type in (
                          'congress_presentation',   -- HCP presented at a congress
                          'clinical_trial_activity', -- Active in a trial not yet in CT.gov
                          'institutional_move',      -- Changed institutions
                          'therapeutic_area_shift',  -- Moving into a new TA
                          'peer_recognition',        -- Recognized by peers as rising
                          'patient_advocacy_role'    -- Involved in patient advocacy
                        )),
  field_value           text not null,  -- Structured value: congress name, trial phase, institution name, etc.
  therapeutic_area_slug text references therapeutic_areas(slug),
  is_verified           boolean default false,  -- Future: corroborated by 2+ MSLs
  submitted_at          timestamp with time zone default now()
);

-- ─────────────────────────────────────────
-- HCP WATCHLIST (private to each MSL user)
-- ─────────────────────────────────────────
create table hcp_watchlist (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  hcp_id    uuid not null references hcps(id) on delete cascade,
  notes     text,   -- Private MSL notes — never visible to others
  added_at  timestamp with time zone default now(),
  unique (user_id, hcp_id)
);

-- ─────────────────────────────────────────
-- HCP CLAIMS (HCP requests control of their profile)
-- ─────────────────────────────────────────
create table hcp_claims (
  id            uuid primary key default gen_random_uuid(),
  hcp_id        uuid not null references hcps(id) on delete cascade,
  user_id       uuid not null references users(id),
  status        text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at  timestamp with time zone default now(),
  resolved_at   timestamp with time zone
);

-- ─────────────────────────────────────────
-- INDEXES (performance)
-- ─────────────────────────────────────────
create index on hcps (zip_code);
create index on hcps (state);
create index on hcps (last_name);
create index on hcp_scores (hcp_id, therapeutic_area_id, calculated_at desc);
create index on publications (hcp_id, pub_year desc);
create index on clinical_trials (status, phase);
create index on msl_contributions (hcp_id, field_type);
create index on hcp_watchlist (user_id);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (Supabase RLS — public vs private)
-- ─────────────────────────────────────────

-- HCPs and scores are public-readable
alter table hcps enable row level security;
create policy "hcps_public_read" on hcps for select using (opt_out = false);

alter table hcp_scores enable row level security;
create policy "scores_public_read" on hcp_scores for select using (true);

-- Watchlist is private to each user
alter table hcp_watchlist enable row level security;
create policy "watchlist_owner_only" on hcp_watchlist
  for all using (auth.uid() = user_id);

-- Contributions: visible to authenticated users, contributor_id hidden from output
alter table msl_contributions enable row level security;
create policy "contributions_auth_read" on msl_contributions
  for select to authenticated using (true);
create policy "contributions_owner_insert" on msl_contributions
  for insert with check (auth.uid() = contributor_id);
