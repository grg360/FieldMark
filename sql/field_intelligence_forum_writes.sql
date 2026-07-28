-- Field Intelligence Forum — founder-gated write path (demo).
--
-- Writes are enabled for ONE user id only, enforced in Postgres, not the UI.
-- There are still no INSERT grants on the field_intel_* tables. The only write
-- path is these SECURITY DEFINER functions, which (a) reject any caller whose
-- auth.uid() is not the founder, and (b) run the composer content check
-- server-side so a borderline draft cannot sail through. A non-founder JWT — or
-- a raw insert attempt — cannot write, because the tables grant no INSERT and
-- the function self-gates. Everyone else keeps the read-only, inert surface.
--
-- Content check mirrors the composer promise: recommendation language, off-label
-- vocabulary, and HCP names (against hcps_v2) are caught and the draft returned
-- with the reason. It is deliberately a pattern matcher, not a classifier.

BEGIN;

-- Who may write. A hardcoded id, not a flag or an allowlist table anyone could
-- edit — changing it requires a schema migration.
CREATE OR REPLACE FUNCTION public.fi_writer_id()
RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT 'f0a8352f-3846-4a85-b96d-f91d8b3109f4'::uuid $$;

-- Content check. Returns a human reason when the draft fails, NULL when it passes.
CREATE OR REPLACE FUNCTION public.fi_content_check(p_text text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t    text := lower(coalesce(p_text, ''));
  hcp  record;
BEGIN
  -- 1 · Recommendation phrasing — advice / directing behaviour rather than
  --     discussing what the paper reports.
  IF t ~ '(^|[^a-z])(i would (move|start|switch|sequence|put|treat|give|recommend|use)|i''d (move|start|recommend|switch|put)|i recommend|you should|i have been telling|i''ve been telling|telling my accounts|in my practice i|move (this|it|them|the patient|patients) (in)?to (first|second|third)[ -]line|start (them|patients|him|her) on|directing (prescriber|prescribing))'
  THEN
    RETURN 'Reads as clinical recommendation — the draft advises a course of action rather than discussing what the anchored paper reports.';
  END IF;

  -- 2 · Off-label / unapproved use vocabulary.
  IF t ~ '(^|[^a-z])(off[- ]label|unapproved|not approved for|beyond the label|compassionate use|outside the label|off label use)'
  THEN
    RETURN 'Off-label or unapproved use — the draft discusses use outside the approved indication.';
  END IF;

  -- 3 · HCP name — the draft appears to name a real physician from hcps_v2.
  --     Full-name match, guarded to plausible name lengths to limit false hits.
  SELECT first_name, last_name INTO hcp
  FROM public.hcps_v2
  WHERE length(first_name) >= 3 AND length(last_name) >= 4
    AND p_text ILIKE '%' || first_name || ' ' || last_name || '%'
  LIMIT 1;
  IF FOUND THEN
    RETURN 'Identifies an HCP — the draft appears to name a real physician ('
           || hcp.first_name || ' ' || hcp.last_name
           || '). Discuss the paper, not named individuals.';
  END IF;

  RETURN NULL;
END;
$$;

-- Journal abbreviation for a newly-anchored publication (display only).
CREATE OR REPLACE FUNCTION public.fi_journal_abbrev(p_journal text)
RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE
     WHEN p_journal ILIKE '%new england%'      THEN 'NEJM'
     WHEN p_journal ILIKE '%clinical oncology%' THEN 'JCO'
     WHEN p_journal ILIKE '%nature medicine%'   THEN 'Nature Medicine'
     WHEN p_journal ILIKE 'nature'              THEN 'Nature'
     WHEN p_journal ILIKE '%lancet%'            THEN 'Lancet'
     WHEN p_journal ILIKE '%annals of oncology%' THEN 'Ann Oncol'
     ELSE left(coalesce(p_journal, 'Journal'), 40)
   END $$;

-- Recompute the honest COUNT(*) counts for one thread + its anchor.
CREATE OR REPLACE FUNCTION public.fi_recount(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_anchor uuid;
BEGIN
  UPDATE field_intel_threads t SET
    reply_count        = (SELECT count(*) FROM field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown),
    under_review_count = (SELECT count(*) FROM field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown AND p.compliance_state = 'under_review'),
    removed_count      = (SELECT count(*) FROM field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown AND p.compliance_state = 'removed'),
    context_note_count = (SELECT count(*) FROM field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown AND p.compliance_state = 'context_note'),
    participant_count  = (SELECT count(DISTINCT h) FROM (
                            SELECT t.author_handle AS h
                            UNION SELECT p.author_handle FROM field_intel_posts p WHERE p.thread_id = t.id AND p.placeholder_shown
                          ) s)
  WHERE t.id = p_thread_id
  RETURNING anchor_id INTO v_anchor;

  UPDATE field_intel_anchors a SET
    thread_count = (SELECT count(*) FROM field_intel_threads t WHERE t.anchor_id = a.id),
    reply_count  = (SELECT count(*) FROM field_intel_posts p JOIN field_intel_threads t ON t.id = p.thread_id WHERE t.anchor_id = a.id AND p.placeholder_shown)
  WHERE a.id = v_anchor;
END;
$$;

-- Create a thread from a publication card. Finds or creates the anchor, so the
-- discuss affordance can open a thread on any corpus publication.
CREATE OR REPLACE FUNCTION public.fi_create_thread(
  p_pubmed_id text,
  p_question_title text,
  p_question_body text,
  p_handle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text;
  v_anchor uuid;
  v_thread uuid;
  v_pub_id uuid;
  v_journal text;
  v_handle text := coalesce(nullif(trim(p_handle), ''), '@demo_msl');
BEGIN
  IF auth.uid() IS DISTINCT FROM fi_writer_id() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Not authorized to post on this surface.');
  END IF;
  IF coalesce(trim(p_question_title), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'A question is required to open a thread.');
  END IF;

  v_reason := fi_content_check(p_question_title || ' ' || coalesce(p_question_body, ''));
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_reason);
  END IF;

  SELECT id INTO v_anchor FROM field_intel_anchors WHERE pubmed_id = p_pubmed_id;
  IF v_anchor IS NULL THEN
    SELECT id, journal INTO v_pub_id, v_journal FROM publications_v2 WHERE pubmed_id = p_pubmed_id;
    IF v_pub_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'That publication is not in the FieldMark corpus.');
    END IF;
    INSERT INTO field_intel_anchors(publication_id, pubmed_id, journal_abbrev, scope_on_topic, scope_off_topic)
      VALUES (v_pub_id, p_pubmed_id, fi_journal_abbrev(v_journal),
        'results, endpoints, methods and limitations as published here',
        'treatment recommendations, sequencing advice, comparisons to trials this paper was not designed against, and inferences beyond the powered analyses')
      RETURNING id INTO v_anchor;
  END IF;

  INSERT INTO field_intel_threads(anchor_id, question_title, question_body, author_handle, recency_label, is_primary, simulated)
    VALUES (v_anchor, trim(p_question_title), nullif(trim(p_question_body), ''), v_handle, 'just now', true, true)
    RETURNING id INTO v_thread;

  PERFORM fi_recount(v_thread);
  RETURN jsonb_build_object('ok', true, 'thread_id', v_thread, 'anchor_id', v_anchor);
END;
$$;

-- Reply within a thread. Depth caps at 2 (flatten deeper); on-anchor by default.
CREATE OR REPLACE FUNCTION public.fi_create_reply(
  p_thread_id uuid,
  p_parent_post_id uuid,
  p_body text,
  p_handle text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text;
  v_depth  integer := 1;
  v_ord    integer;
  v_post   uuid;
  v_handle text := coalesce(nullif(trim(p_handle), ''), '@demo_msl');
BEGIN
  IF auth.uid() IS DISTINCT FROM fi_writer_id() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Not authorized to post on this surface.');
  END IF;
  IF coalesce(trim(p_body), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'A reply cannot be empty.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM field_intel_threads WHERE id = p_thread_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Thread not found.');
  END IF;

  v_reason := fi_content_check(p_body);
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_reason);
  END IF;

  IF p_parent_post_id IS NOT NULL THEN
    SELECT least(depth + 1, 2) INTO v_depth FROM field_intel_posts WHERE id = p_parent_post_id;
    v_depth := coalesce(v_depth, 1);
  END IF;
  SELECT coalesce(max(ordinal), 0) + 1 INTO v_ord FROM field_intel_posts WHERE thread_id = p_thread_id;

  INSERT INTO field_intel_posts(thread_id, parent_post_id, depth, ordinal, author_handle, body, compliance_state, recency_label, placeholder_shown, simulated)
    VALUES (p_thread_id, p_parent_post_id, v_depth, v_ord, v_handle, trim(p_body), 'on_anchor', 'just now', true, true)
    RETURNING id INTO v_post;

  PERFORM fi_recount(p_thread_id);
  RETURN jsonb_build_object('ok', true, 'post_id', v_post);
END;
$$;

-- EXECUTE to authenticated only (writes require a login); the gate inside each
-- function limits the effect to the founder. Content check is safe to expose.
REVOKE ALL ON FUNCTION public.fi_create_thread(text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.fi_create_reply(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fi_create_thread(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fi_create_reply(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fi_content_check(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fi_writer_id() TO authenticated, anon;

COMMIT;

-- Client-facing "may I write?" mirror of the gate (UI reflects server authority).
CREATE OR REPLACE FUNCTION public.fi_can_write() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT auth.uid() IS NOT DISTINCT FROM public.fi_writer_id() $$;
GRANT EXECUTE ON FUNCTION public.fi_can_write() TO authenticated, anon;
