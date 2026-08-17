-- Established narrative prompt v3.0 -> v3.1 — engagement_angle opens on the
-- stance, not on the meeting.
--
-- Paired with the prompt change in scripts/narrative/generate_narratives_v2.py
-- (build_prompt_established, engagement_angle constraint). Per the design
-- contract on narrative_prompt_versions, the row moves in the SAME change as the
-- prompt text — the generator reads current_version from this table at startup
-- and stamps it on everything it writes, so a prompt edit without this UPDATE
-- would stamp v3.0 on v3.1 output, which is invisible afterwards.
--
-- ── What was wrong ──────────────────────────────────────────────────────────
-- 134 of 229 established_v3.0 narratives (59%) opened engagement_angle with a
-- meeting frame; 118 used the literal string "Conversations anchored in".
-- The v3.0 instruction read:
--
--   "engagement_angle: exactly 2 sentences. Where this expert's perspective adds
--    value — anchored, where possible, in the specific stances above (a topic
--    they have argued a position on is a better angle than a topic they merely
--    publish in). Practical and scientific."
--
-- Three structural causes, no bad exemplar involved (the field has no example):
--   1. LEXICAL PRIMING. The instruction contained "anchored"; the outputs opened
--      "Conversations anchored in". The prompt supplied the participle.
--   2. FRAMED AS A PLACE. "Where this expert's perspective adds value" asks for a
--      venue, so the model returned a venue.
--   3. ASKED FOR A TOPIC. Both sides of its own comparison are topics ("a topic
--      ... is a better angle than a topic ..."). It never asked for the claim.
--   Plus: it was the only consequential prose field with no opener constraint —
--   narrative forbids opening on rank, why_now forbids opening on the TA.
--
-- ── What v3.1 asks for instead ─────────────────────────────────────────────
-- Sentence 1 states a specific argued position with its content, attributed by
-- surname, with the expert (not the encounter) as grammatical subject. Sentence 2
-- carries the MSL framing. The claim/topic distinction is stated explicitly with
-- a worked contrast pair.
--
-- DELIBERATELY NOT A BANNED-PHRASE LIST. Enumerating forbidden openers produces
-- stilted avoidance — the model routes around the list rather than changing what
-- it reaches for. The fix changes the request. Evidence it lands: a minority of
-- v3.0 rows already produced the target form unprompted (Drilon, Le, Yu, Lou,
-- Bauer all open on the named expert's published argument).
--
-- ── Effect on stored rows ──────────────────────────────────────────────────
-- The 229 stored established_v3.0 narratives become is_current = false. That is
-- the truthful state and nothing acts on it: no display gate is wired to
-- is_current (see 2026_08_14_narrative_prompt_versions.sql). No narrative is
-- deleted, rewritten, or hidden by this migration. Regeneration is a separate,
-- deliberate step.

BEGIN;

UPDATE narrative_prompt_versions
SET current_version = 'established_v3.1',
    updated_at      = now()
WHERE cohort = 'established';

DO $$
DECLARE
  v_version text;
  v_stale   integer;
BEGIN
  SELECT current_version INTO v_version
  FROM narrative_prompt_versions WHERE cohort = 'established';

  IF v_version IS DISTINCT FROM 'established_v3.1' THEN
    RAISE EXCEPTION 'established current_version is %, expected established_v3.1', v_version;
  END IF;

  SELECT count(*) INTO v_stale
  FROM hcp_narratives_v2
  WHERE prompt_version = 'established_v3.0';

  RAISE NOTICE 'established -> established_v3.1; % stored v3.0 narratives now report is_current=false', v_stale;
END $$;

COMMIT;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Revert this row AND the prompt text together; they must never diverge.
-- BEGIN;
--   UPDATE narrative_prompt_versions
--   SET current_version = 'established_v3.0', updated_at = now()
--   WHERE cohort = 'established';
-- COMMIT;
