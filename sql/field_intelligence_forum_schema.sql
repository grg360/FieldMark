-- Field Intelligence Forum — schema (read-only preview, no write paths).
-- Anchored discussion: every thread hangs off a real publications_v2 row; posts
-- are threaded and carry one of four compliance states; removal is a STATE, never
-- a delete (a removed post keeps its slot). All discussion content is fabricated
-- (SIMULATED) for compliance review — the publication anchors are the only real data.
--
-- Naming follows the congress_* convention (feature-prefixed, snake_case): field_intel_*.
-- Read-only: RLS on, public SELECT policy, SELECT granted; NO write grants — the
-- inertness of the build is enforced at the database, not just the UI.

BEGIN;

-- ── Anchors: a publication's presence in the forum ──────────────────────────
-- FK to publications_v2 is the source of truth for title/year/citation_count.
-- journal_abbrev + scope + display aggregates are forum-display data.
CREATE TABLE IF NOT EXISTS public.field_intel_anchors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id  uuid NOT NULL REFERENCES public.publications_v2(id),
  pubmed_id       text NOT NULL UNIQUE,
  journal_abbrev  text NOT NULL,
  scope_on_topic  text NOT NULL,
  scope_off_topic text NOT NULL,
  thread_count    integer NOT NULL DEFAULT 0,   -- Design's displayed aggregate
  reply_count     integer NOT NULL DEFAULT 0,   -- Design's displayed aggregate
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Threads: one question under an anchor ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_intel_threads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_id           uuid NOT NULL REFERENCES public.field_intel_anchors(id),
  question_title      text NOT NULL,
  question_body       text,                     -- present on fully-built threads
  author_handle       text NOT NULL,
  scope_label         text,                     -- e.g. "ONCOLOGY / SCLC"
  recency_label       text NOT NULL,            -- Design's verbatim "2h ago" etc.
  reply_count         integer NOT NULL DEFAULT 0,
  participant_count   integer NOT NULL DEFAULT 0,
  under_review_count  integer NOT NULL DEFAULT 0,
  removed_count       integer NOT NULL DEFAULT 0,
  context_note_count  integer NOT NULL DEFAULT 0,
  is_primary          boolean NOT NULL DEFAULT true,   -- headline question for the anchor
  simulated           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fi_threads_anchor ON public.field_intel_threads(anchor_id);

-- ── Posts: threaded replies. Removal is a state; the row and its slot persist ──
CREATE TABLE IF NOT EXISTS public.field_intel_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           uuid NOT NULL REFERENCES public.field_intel_threads(id),
  parent_post_id      uuid REFERENCES public.field_intel_posts(id),
  depth               integer NOT NULL DEFAULT 1,
  ordinal             integer NOT NULL DEFAULT 0,   -- render order within the thread
  author_handle       text NOT NULL,
  body                text NOT NULL,               -- peer-visible body ('' when removed)
  compliance_state    text NOT NULL DEFAULT 'on_anchor'
                        CHECK (compliance_state IN ('on_anchor','under_review','context_note','removed')),
  anchor_fragment     text,                        -- "REPORTED RESULT" / "STUDY DESIGN"
  recency_label       text NOT NULL,
  -- Removal detail (compliance_state='removed'). Body-visible-to-reviewers-only
  -- lives in removed_body; the peer-facing body is the placeholder, handled in UI.
  removed_body            text,
  removed_detected_phrases text[],
  placeholder_shown       boolean NOT NULL DEFAULT true,  -- false = nested removal, no slot
  simulated           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fi_posts_thread ON public.field_intel_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_fi_posts_parent ON public.field_intel_posts(parent_post_id);

-- ── Attached notes: auto-signal / peer-flag. Additive; the post stays legible ──
CREATE TABLE IF NOT EXISTS public.field_intel_post_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid NOT NULL REFERENCES public.field_intel_posts(id),
  note_type        text NOT NULL CHECK (note_type IN ('auto_signal','peer_flag')),
  label            text NOT NULL,     -- "CROSS-TRIAL COMPARISON" / "2 FLAGS · ..."
  body_text        text NOT NULL,     -- the concern in the paper's own terms
  disposition_text text NOT NULL,     -- what happens next and by when
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fi_notes_post ON public.field_intel_post_notes(post_id);

-- ── Moderation records: clause, timing, notification, appeal, audit log ──────
-- post_id nullable: "blocked at composer" has no post (never published).
CREATE TABLE IF NOT EXISTS public.field_intel_moderation_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number       text NOT NULL UNIQUE,
  post_id           uuid REFERENCES public.field_intel_posts(id),
  thread_id         uuid REFERENCES public.field_intel_threads(id),
  anchor_pubmed_id  text,
  author_handle     text NOT NULL,
  queue_state       text NOT NULL CHECK (queue_state IN
                      ('open_peer_flag','open_auto_signal','blocked_at_composer','resolved_removed')),
  clause_cited      text,             -- "Scope 3.2" / "Scope 3.2 + 3.4"
  clause_text       text,
  timing_label      text,             -- "Queued 28m ago · target action within 4h ..."
  sla_label         text,             -- "3h 32m of SLA remaining"
  notification_state text,
  appeal_window_days integer,
  classifier_score  numeric,
  account_history   text,
  anchor_check_text text,
  decision_text     text,
  follow_up_text    text,
  blocked_reason    text,             -- for blocked_at_composer
  audit_log         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{t, event}]
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fi_mod_post ON public.field_intel_moderation_records(post_id);

-- ── Read-only access: RLS on, public read, no write grants ──────────────────
ALTER TABLE public.field_intel_anchors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_intel_threads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_intel_posts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_intel_post_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_intel_moderation_records  ENABLE ROW LEVEL SECURITY;

CREATE POLICY fi_anchors_read  ON public.field_intel_anchors            FOR SELECT USING (true);
CREATE POLICY fi_threads_read  ON public.field_intel_threads            FOR SELECT USING (true);
CREATE POLICY fi_posts_read    ON public.field_intel_posts              FOR SELECT USING (true);
CREATE POLICY fi_notes_read    ON public.field_intel_post_notes         FOR SELECT USING (true);
CREATE POLICY fi_mod_read      ON public.field_intel_moderation_records FOR SELECT USING (true);

GRANT SELECT ON public.field_intel_anchors             TO anon, authenticated, service_role;
GRANT SELECT ON public.field_intel_threads             TO anon, authenticated, service_role;
GRANT SELECT ON public.field_intel_posts               TO anon, authenticated, service_role;
GRANT SELECT ON public.field_intel_post_notes          TO anon, authenticated, service_role;
GRANT SELECT ON public.field_intel_moderation_records  TO anon, authenticated, service_role;

COMMIT;
