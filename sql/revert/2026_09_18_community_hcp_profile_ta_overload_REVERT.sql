-- REVERT for migrations/2026_09_18_community_hcp_profile_ta_overload.sql
-- Date: 2026-09-18. Branch: foundation-rebuild.
--
-- The migration only ADDED an overload. Nothing was dropped, replaced or re-granted on
-- the one-argument signature, so reverting is a drop of the new sibling and nothing
-- else -- community_hcp_profile(p_hcp_id uuid) is untouched by both files and needs no
-- restore.
--
-- DROPPING THIS BRINGS THE STRANDED NARRATIVES BACK. The one-argument function still
-- fetches narratives on (hcp_id, slug, cohort) with no board gate, so both frontend
-- callers revert to rendering prose for 2,066 non-qualifying HCPs. Revert to recover
-- from a broken deploy, not to undo the gate.
--
-- ORDER MATTERS: the frontend calls the two-argument overload by name
-- ({p_ta_id, p_hcp_id}). Ship the frontend revert FIRST, or dropping this leaves every
-- community profile calling a function that no longer exists -- PostgREST answers 404
-- and the surface renders "This profile could not be loaded."

DROP FUNCTION IF EXISTS public.community_hcp_profile(uuid, uuid);
