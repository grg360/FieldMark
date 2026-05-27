-- regions_config_load.sql
-- Creates and populates the regions and region_countries tables used by the
-- backend scoring pipeline. The TypeScript file frontend/src/lib/regions.ts
-- is the conceptual source of truth; this SQL keeps the backend mirror in sync.
-- Run this in the Supabase SQL Editor after any change to regions.ts.

BEGIN;

-- Drop and recreate to ensure a clean state. These tables are small and
-- rebuilt entirely on each sync.
DROP TABLE IF EXISTS region_countries;
DROP TABLE IF EXISTS regions;

CREATE TABLE regions (
  region_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  is_catchall BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE region_countries (
  region_key TEXT NOT NULL REFERENCES regions(region_key) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  PRIMARY KEY (region_key, country_code)
);

CREATE INDEX idx_region_countries_country ON region_countries(country_code);

INSERT INTO regions (region_key, display_name, sort_order, is_global, is_catchall) VALUES
  ('US',     'United States',                1, FALSE, FALSE),
  ('EU5',    'EU5 (DE/FR/IT/ES/UK)',         2, FALSE, FALSE),
  ('EU',     'European Union',               3, FALSE, FALSE),
  ('UK',     'United Kingdom',               4, FALSE, FALSE),
  ('APAC',   'Asia-Pacific',                 5, FALSE, FALSE),
  ('LATAM',  'Latin America',                6, FALSE, FALSE),
  ('MENA',   'Middle East & North Africa',   7, FALSE, FALSE),
  ('Other',  'Other',                        8, FALSE, TRUE),
  ('Global', 'Global',                       9, TRUE,  FALSE);

INSERT INTO region_countries (region_key, country_code) VALUES
  ('US', 'US'),
  ('EU5', 'DE'), ('EU5', 'FR'), ('EU5', 'IT'), ('EU5', 'ES'), ('EU5', 'GB'),
  ('EU',  'DE'), ('EU', 'FR'), ('EU', 'IT'), ('EU', 'ES'), ('EU', 'NL'), ('EU', 'BE'),
  ('EU',  'AT'), ('EU', 'IE'), ('EU', 'PT'), ('EU', 'SE'), ('EU', 'DK'), ('EU', 'FI'),
  ('EU',  'PL'), ('EU', 'CZ'), ('EU', 'HU'), ('EU', 'GR'), ('EU', 'RO'), ('EU', 'BG'),
  ('EU',  'SK'), ('EU', 'SI'), ('EU', 'HR'), ('EU', 'EE'), ('EU', 'LV'), ('EU', 'LT'),
  ('EU',  'LU'), ('EU', 'MT'), ('EU', 'CY'),
  ('UK', 'GB'),
  ('APAC', 'JP'), ('APAC', 'KR'), ('APAC', 'CN'), ('APAC', 'TW'), ('APAC', 'HK'),
  ('APAC', 'AU'), ('APAC', 'NZ'), ('APAC', 'SG'), ('APAC', 'IN'), ('APAC', 'TH'),
  ('APAC', 'MY'), ('APAC', 'ID'), ('APAC', 'PH'), ('APAC', 'VN'),
  ('LATAM', 'BR'), ('LATAM', 'MX'), ('LATAM', 'AR'), ('LATAM', 'CL'),
  ('LATAM', 'CO'), ('LATAM', 'PE'), ('LATAM', 'VE'),
  ('MENA', 'EG'), ('MENA', 'SA'), ('MENA', 'AE'), ('MENA', 'IL'), ('MENA', 'TR'),
  ('MENA', 'IR'), ('MENA', 'MA'), ('MENA', 'JO'), ('MENA', 'LB');

COMMIT;

-- Verification: counts per region
SELECT r.region_key, r.display_name, COUNT(rc.country_code) AS country_count
FROM regions r
LEFT JOIN region_countries rc ON rc.region_key = r.region_key
GROUP BY r.region_key, r.display_name, r.sort_order
ORDER BY r.sort_order;
