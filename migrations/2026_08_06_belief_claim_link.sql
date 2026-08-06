-- Belief-claim link: composer picker + render target (2026-08-06)
--
-- Makes the field-insight -> belief-position link work for real users, not just
-- seeded data. Until now `msl_hcp_notes.belief_claim_key` was written ONLY by
-- the seed script (generate_seed_insights.py); the UI createNote path never set
-- it, and nothing rendered the `claim-<key>` scroll target, so the link fell
-- back to a section scroll on every surface.
--
-- The key is the SINGLE SOURCE OF TRUTH here: computed in Postgres, mirroring
-- the seed's Python hash exactly — sha256("advocacy|"||hcp_id||"|"||sorted
-- position ids joined by ","). Verified byte-identical to an existing seed key
-- (Ramalingam "Stage III Targeted Consolidation"), so all 75 seeded links keep
-- resolving. Computing it here (not a second TS implementation) removes any
-- drift risk between the picker, the render target, and the seed.
--
-- NOT the stable-key fix: the hash is still over the random position ids, so a
-- re-extraction still orphans every link (docs/BELIEF_CLAIM_LINK_STABILITY.md).
-- pgcrypto (digest) is already installed.

-- 1. The key function — one authority, mirrors the Python seed exactly.
-- digest() is pgcrypto, installed in the `extensions` schema on Supabase —
-- qualify it so this works regardless of the caller's search_path (a SET
-- search_path=public function that inlines this would otherwise fail).
CREATE OR REPLACE FUNCTION public.belief_claim_key(p_hcp_id uuid, p_position_ids text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    extensions.digest(
      'advocacy|' || p_hcp_id::text || '|' ||
      array_to_string(ARRAY(SELECT unnest(p_position_ids) ORDER BY 1), ','),
      'sha256'
    ),
    'hex'
  );
$$;

GRANT EXECUTE ON FUNCTION public.belief_claim_key(uuid, text[]) TO anon, authenticated, service_role;

-- 2. Render target: add claim_key to each belief tier item. hcp_id is derived
-- from the claim's first representative position (all its positions belong to
-- the same HCP), so the profile RPC (hcp_profile_brief) needs no change — this
-- is the same 1-arg helper, only with claim_key added to the output.
CREATE OR REPLACE FUNCTION public.hcp_profile_tier_positions(t jsonb)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'theme', t->>'theme',
    'summary', t->>'summary',
    'evidence_count', (t->>'evidence_count')::int,
    'paper_count', (t->>'supporting_paper_count')::int,
    'confidence', (t->>'confidence')::numeric,
    'categories', t->'primary_position_categories',
    'claim_key', (
      SELECT public.belief_claim_key(
        (SELECT p.hcp_id
           FROM hcp_scientific_positions_v1 p
          WHERE p.id = (t->'representative_position_ids'->>0)::uuid),
        ARRAY(SELECT jsonb_array_elements_text(t->'representative_position_ids'))
      )
    ),
    'sources', (
      select json_agg(row_to_json(s) order by s.pub_year desc, s.citation_count desc) from (
        select distinct on (pub.id) pub.journal, pub.title, pub.pub_year, pub.doi,
               p.author_role, p.citation_count
        from jsonb_array_elements_text(t->'representative_position_ids') rid
        join hcp_scientific_positions_v1 p on p.id = rid::uuid
        join publications_v2 pub on pub.id = p.publication_id
        order by pub.id, p.citation_count desc
      ) s
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.hcp_profile_tier_positions(jsonb) TO anon, authenticated;

-- 3. Composer picker: the HCP's belief claims with their precomputed keys.
-- Empty array when the HCP has no synthesis (most HCPs — community/practice
-- have no positions); the composer states that honestly and logs unlinked.
CREATE OR REPLACE FUNCTION public.hcp_belief_claims(p_hcp_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH synth AS (
    SELECT body::jsonb b
    FROM hcp_ai_overviews
    WHERE hcp_id = p_hcp_id
      AND synthesis_type = 'scientific_positions'
      AND therapeutic_area = 'NSCLC'
      AND body ~ '^\s*\{'
    ORDER BY generated_at DESC
    LIMIT 1
  ),
  claims AS (
    SELECT c
    FROM synth,
         jsonb_array_elements(
           coalesce(b->'strongly_advocates', '[]'::jsonb) ||
           coalesce(b->'frequently_raises', '[]'::jsonb)
         ) c
  )
  SELECT coalesce(json_agg(json_build_object(
      'theme', c->>'theme',
      'summary', c->>'summary',
      'claim_key', public.belief_claim_key(
        p_hcp_id,
        ARRAY(SELECT jsonb_array_elements_text(c->'representative_position_ids'))
      ),
      'paper_count', (c->>'supporting_paper_count')::int,
      'position_count', (c->>'evidence_count')::int
    )), '[]'::json)
  FROM claims;
$$;

GRANT EXECUTE ON FUNCTION public.hcp_belief_claims(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
