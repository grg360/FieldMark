CREATE TABLE IF NOT EXISTS pulse_concept_blocklist_v1 (
  concept_name text PRIMARY KEY,
  reason text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS theme_concept_signature_v1 (
  canonical_id uuid NOT NULL REFERENCES theme_canonical_v1(id) ON DELETE CASCADE,
  concept_name text NOT NULL,
  concept_id text,
  weight real NOT NULL DEFAULT 1.0,
  can_set_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_id, concept_name)
);

CREATE TABLE IF NOT EXISTS theme_keyword_signature_v1 (
  canonical_id uuid NOT NULL REFERENCES theme_canonical_v1(id) ON DELETE CASCADE,
  term text NOT NULL,
  match_mode text NOT NULL DEFAULT 'substring',
  field_scope text NOT NULL DEFAULT 'title',
  weight real NOT NULL DEFAULT 1.0,
  can_set_primary boolean NOT NULL DEFAULT true,
  observed_title_hits integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_id, term),
  CONSTRAINT theme_keyword_signature_v1_match_mode_chk CHECK (match_mode IN ('substring','word')),
  CONSTRAINT theme_keyword_signature_v1_field_scope_chk CHECK (field_scope IN ('title','title_abstract'))
);

CREATE TABLE IF NOT EXISTS publication_theme_v1 (
  publication_id uuid NOT NULL REFERENCES publications_v2(id) ON DELETE CASCADE,
  canonical_id uuid NOT NULL REFERENCES theme_canonical_v1(id) ON DELETE CASCADE,
  therapeutic_area_id uuid NOT NULL,
  score real NOT NULL,
  method text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  labeler_version text NOT NULL,
  labeled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publication_id, canonical_id),
  CONSTRAINT publication_theme_v1_method_chk CHECK (method IN ('concept','keyword','mesh','hybrid','llm_tiebreak'))
);

CREATE INDEX IF NOT EXISTS publication_theme_v1_canonical_idx ON publication_theme_v1 (canonical_id);

CREATE INDEX IF NOT EXISTS publication_theme_v1_ta_idx ON publication_theme_v1 (therapeutic_area_id);

CREATE INDEX IF NOT EXISTS publication_theme_v1_primary_idx ON publication_theme_v1 (canonical_id, is_primary) WHERE is_primary;

CREATE INDEX IF NOT EXISTS publication_theme_v1_pub_idx ON publication_theme_v1 (publication_id);

GRANT SELECT ON pulse_concept_blocklist_v1 TO anon, authenticated;

GRANT SELECT ON theme_concept_signature_v1 TO anon, authenticated;

GRANT SELECT ON theme_keyword_signature_v1 TO anon, authenticated;

GRANT SELECT ON publication_theme_v1 TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
