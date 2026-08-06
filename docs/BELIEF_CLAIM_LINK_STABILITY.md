# Belief-claim link — stability & the stable-key fix (2026-08-06)

Written while wiring the composer picker + render target. **The stable-key fix
itself is deferred** (24h from the demo; changing the formula orphans all 75
seeded links and needs a re-key backfill). This is the proposal for after.

## The fragility

`msl_hcp_notes.belief_claim_key` = `sha256("advocacy|" || hcp_id || "|" ||
sorted(representative_position_ids) joined by ",")`. The key is computed over
**`hcp_scientific_positions_v1.id`**, which is `DEFAULT gen_random_uuid()`.

`extract_scientific_positions.py` **DELETEs a HCP+TA's positions and re-INSERTs**
on every run, and the INSERT does not supply `id` — so every re-extraction
mints fresh random ids. The key therefore changes on every re-extraction, and:

- the belief-profile claim's render target (`claim-<key>`) changes, and
- every existing note's stored `belief_claim_key` orphans — **silently**. The
  reader (`InsightCard.goToClaim`) falls back to a section scroll; no error, no
  visible failure. This is the same overwrite-and-lose class as the pre-cohort
  narrative key, but worse: hash-based and silent, so a broken link is
  invisible until someone recomputes.

Not currently triggered — the demo-path HCPs' keys still recompute-match
(positions stable since the seed). One `extract_scientific_positions.py --force`
on those HCPs breaks all their links.

**Operational hold:** do not run `extract_scientific_positions.py` before Friday
afternoon on any demo-path HCP.

## The fix: hash over a stable natural key

Replace the random `position.id` in the key basis with a **deterministic
identity** of the position that survives re-extraction. Proposal:

- Basis per position = `publication_id || '|' || position_category`
  (both stable across runs: `publication_id` is the paper, `position_category`
  is the controlled-vocab class). Sort and join the per-position basis strings
  exactly as today, then hash.
- Collision note: an HCP with two positions of the same category on the same
  paper would collapse to one basis token. Rare, but if it matters, extend the
  basis with `position_type` or a stable ordinal. Measure the collision rate
  over the current corpus before committing.
- Alternative: give positions a **deterministic id** at extraction
  (e.g. `md5(hcp_id||publication_id||position_category||position_text)` as the
  primary key instead of `gen_random_uuid()`), so the existing id-based key
  formula becomes stable with no formula change. This is cleaner long-term but a
  bigger migration (PK change + all FKs).

## What the change requires (all deferred)

1. Decide the basis (above); measure collisions on the live corpus.
2. Update `belief_claim_key()` (migration `2026_08_06_belief_claim_link.sql`),
   the seed's `build_advocacy_claim_key`, and `backfill_belief_claim_titles.py`
   to the new basis — all three must move together.
3. **Re-key backfill:** for every existing `msl_hcp_notes.belief_claim_key`,
   recompute the new-basis key from the note's current claim and rewrite it.
   Without this, all 75 seeded links (and any organic ones logged before the
   change) orphan. This is the step not to run 24h out.
4. Make `extract_scientific_positions.py` stop regenerating ids (or adopt the
   deterministic-PK option) so future re-extractions preserve the key.

Until then: the link works (composer writes it, profile renders the target),
but it is one re-extraction away from silently breaking. That trade was taken
deliberately for the demo.
