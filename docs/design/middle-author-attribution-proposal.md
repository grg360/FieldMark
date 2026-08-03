# Proposal: middle-author positions with honest attribution

Status: **staged, not applied.** No migration, script, or component has been
changed. This document is the go/no-go artifact. The decision criterion (from the
request): if the honest label reads as weak or confusing, do not make the change —
100% coverage of a claim nobody trusts is worse than 77% of one they do.

## What "drop the filter" actually touches

Positions flow through four surfaces, not three. Ownership is asserted most
strongly at surface 4, which was not in the original three-piece list.

| # | Surface | File | Shows role today? | Asserts ownership? |
|---|---------|------|-------------------|--------------------|
| 1 | Extraction | `extract_scientific_positions.py` `TOP_PAPERS_SQL` | filters to first/senior only | n/a (gate) |
| 2 | Position card | `HcpPositionsPage.tsx` `PositionRow` | **no** — role not rendered at all | yes, by omission |
| 3 | Evidence drawer | `EvidenceDrawer.tsx` `formatAuthorRole` | yes (`Senior Author`) | mild |
| 4 | Advocacy synthesis | `generate_scientific_position_synthesis.py` → `ScientificNarrativeSection.tsx` "Strongly Advocates" | no per-position attribution | **strongly** |

The position card (surface 2) shows no author role today. Every position reads as
"their position" by omission. Adding middle-author positions there without a marker
would silently turn "contributed to" into "advocates."

The synthesis (surface 4) is the real problem. Its prompt opens with *"This
investigator has {paper_count} senior or first-authored publications"* and asks for
themes *"the investigator has advanced."* Feed it middle-author positions unchanged
and the headline MSL-facing card asserts the investigator advocates a stance they
merely co-authored — and no card/drawer label touches that, because the theme card
carries no per-position attribution.

## The three pieces (as requested) + the fourth (required for soundness)

### Piece 1 — migration: widen the CHECK
```sql
-- migrations/2026_08_03_author_role_contributing.sql
ALTER TABLE hcp_scientific_positions_v1
  DROP CONSTRAINT hcp_scientific_positions_v1_author_role_check;
ALTER TABLE hcp_scientific_positions_v1
  ADD CONSTRAINT hcp_scientific_positions_v1_author_role_check
  CHECK (author_role IN (
    'first_author', 'senior_author',
    'co_first_author', 'co_senior_author',
    'contributing_author'
  ));
```

### Piece 2 — extractor: CASE + drop the filter
In `TOP_PAPERS_SQL`: remove `AND (pa.is_senior_author = true OR pa.is_first_author = true)`
and extend the label:
```sql
CASE
  WHEN is_senior_author THEN 'senior_author'
  WHEN is_first_author  THEN 'first_author'
  ELSE 'contributing_author'
END AS author_role
```
Caveat: OpenAlex places a true co-first author at a middle index, so
`contributing_author` will occasionally under-credit a co-first/co-senior author.
Under-crediting is the safe direction here; do not try to reconstruct co-* from the
index.

### Piece 3 — prompt + UI labels (the part that decides soundness)

**Vocabulary (one set, both surfaces):** `First Author`, `Senior Author`,
`Contributing Author`. Rejected `Co-author` (too weak — first/senior are also
co-authors) and collapsing first+senior into `Lead` (senior = PI, a *stronger*
ownership signal than first; keep them distinct).

The label alone is a byline fact. A reader won't connect "Contributing Author" to
"so this isn't their stance" on its own. The honest work is done by a **framing
gloss**, not the chip.

**Position card (`PositionRow`)** — add to the existing pill row:
- first/senior: neutral chip `Senior-authored` / `First-authored`
- contributing: distinct (outline/muted) chip `Contributed to`, **plus** a caption
  under `position_text`:
  > *From a co-authored paper — this investigator was a named author, not the lead
  > or senior author on this position.*

**Evidence drawer (`formatAuthorRole` / paper header)**:
- meta line stays `year • journal • Senior Author`; middle → `Contributing author`
- on contributing paper blocks, one qualifier line:
  > *Named author on this paper; the positions below reflect the paper's argument,
  > not necessarily this investigator's own.*

**Extractor prompt** — make the role line do work instead of just printing:
- anchored: keep *"positions the author is advancing through this work."*
- contributing: *"The investigator is a co-author on this work, not its first or
  senior author. Extract the positions the paper advances, phrased as the work's
  argument — never as the investigator's personally held stance."*

### Piece 4 — synthesis (NOT in the original list; required)
`generate_scientific_position_synthesis.py`:
- Partition `positions_block` into anchored vs contributing.
- Corpus line becomes *"N first/senior-authored + M contributing-author
  publications."*
- Rule: **only anchored positions may populate `strongly_advocates` /
  `frequently_raises`.** Contributing positions may inform `research_focus`
  (breadth of involvement) only, and must never render as the investigator's own
  advocacy.

## Recommendation

The label passes the readability test — `Contributing Author` / `Contributed to`
with the gloss is clear, not weak, not confusing. So the request's stated criterion
is met.

But the coverage it buys lands on the wrong surface. The reason to drop the filter
was to lift advocacy-synthesis coverage toward 100%. Honest handling forbids
contributing positions from feeding advocacy (piece 4) — so dropping the filter does
**not** improve the surface that matters. It only swells the raw positions list with
"Contributed to" cards, which don't strengthen "Strongly Advocates" and can dilute
it.

**Do not flip the filter globally.** Two coherent paths instead:
1. **Leave it at 77%.** The advocacy surface stays trustworthy; no new surface to
   build. Cheapest, and consistent with the request's own trust-over-coverage rule.
2. **Build a scoped "Contributed to / Research footprint" section** for HCPs with no
   first/senior NSCLC corpus, rendering contributing positions under an explicit
   non-advocacy header. This is a real feature — pieces 1–4 plus a new UI section —
   not a filter flip, and worth doing deliberately if the goal is "render *something*
   for zero-anchor HCPs."
