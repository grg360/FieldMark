# Inline-style → token migration plans: HCPCard & DetailScreen

These two components are the NSCLC list card and the HCP profile. Both are large,
inline-styled, and carry cohort variants the design never saw. They are **deferred to their own
branch + review** (per the scoping split). This document is the plan to review *before* touching
either file. Nothing here is implemented yet.

Two rules bind both plans:
- **Do not invent cohort colors.** Rising Star / Dark Horse (violet `#9B6DFF`), Workhorse (teal
  `#4ECDC4`), Community (slate `#7B9EBD`) have no design reference — the design only ever showed the
  Established cohort. Leave every cohort accent exactly as-is; only the *Established* path gets the
  amber/role-1 treatment (where amber already coincides with the cohort accent).
- Roles/tokens referenced are from `docs/FIELDMARK_DESIGN_SYSTEM.md`.

---

## A. HCPCard.tsx (~750 lines, 5 cohort variants) — the list card

Reference: `FieldMark List.dc.html` (Established card only).

| # | Style cluster | Current | Design-system target | Risk |
|---|---|---|---|---|
| 1 | Card container (709–723) | `#1C1C20` bg, `1px #2A2A2E` border, `borderLeft 3px` cohort accent, radius 4 | `.elevation-card` (tier 1, `#171512`, radius 11, top-highlight + soft shadow) + `.elevation-interactive` hover→tier 3. **Keep** the cohort left-border accent. | **Med** — replacing border-separation with shadow-separation changes the 2-col grid rhythm; hover `translateY(-2px)` inside a grid needs a reflow check. |
| 2 | Expert name (736–746) | 17 / 500 / `#E8E6DF` | Role 3 *card title*: 21 / 600 / `-0.015em` / `#F2F0EA` | **Med** — +4px name can add a line and change card height in the 2-col grid. |
| 3 | Institution subline (814–855) | 12 / `#B8B4AC`, dotted-underline link `#6B6A65` | Role 8 *body UI* + institution link → `--indigo-link` underline; ` · STATE` sans (§2, place = sans) | **Low** — link recolor to indigo is intended (selection/nav → indigo). |
| 4 | Score badge (859–889) | 28 / 600 cohort accent, top-right; rank line 10 / `#E8E6DF` | Role 1 *score numeral*: 42 / 600 / `-0.03em` / **`--amber` for Established only**; rank line mono (`#N`) + sans unit labels (` US`, ` GLOBAL`), tabular. Non-Established: keep cohort accent at role-1 size. | **High** — 28→42 numeral is a big jump; must verify it doesn't collide with the name row or overflow narrow cards. Amber applies to Established *only*. |
| 5 | Prose summary band (956–980) | filled pill `#2A2A30`, sans 12 / `#D0CCC4`, 3-line clamp | Role 7 *body prose*: serif 13.5 / `#A29E96`, 3-line clamp, **no filled band** (design sets prose directly on the card) | **Med** — removing the band background is a small structural change (kept within the card boundary; no IA change). |
| 6 | Metric strip — default cohort (1039–1105) | 3× `StatPillWithTooltip` (shared primitive: `#0D0D10` pill, `1px #3A3A40`, value 14 mono) | Tier-2 *well* strip: 3 cols, 1px gaps on `--hair`, each cell `#0d0c0b`, micro-label (role 6), value 17 mono, 2px **indigo** bar (`metricColor` >0 → indigo, 0 → flat) | **High** — `StatPillWithTooltip` is a **shared** primitive (see §cross-use); restyle in place vs. fork for the card. The tooltip copy dictionary must survive. Rising tiles (`RisingStarSignalTile`, teal/amber) are cohort-colored → leave. |
| 7 | Footer provenance (1108–1225) | status pill, `📝 insightCount`, follow-up `📌`, bookmark (`#3FB8AF`/`#5A9B7F`) | TARGETED → role-6 micro-label; docs → `--indigo-link` + mono count; bookmark → `--info` `#4FA3C7` shape | **Low–Med** — icon/color swaps; keep all conditional logic (targeted flag, counts). |
| 8 | Score chip `renderScoreChip` (574–705) | cohort-colored chip | Leave cohort colors; Established chip already amber-family | **Low** — cohort-scoped, do not touch colors. |

**Cross-use caution (cluster 6):** `StatPillWithTooltip` is shared. Confirm every other caller before
restyling in place; if any exist outside the list card, fork a card-local variant so the well-strip
restyle can't leak.

**Suggested order:** container (1) → name/institution (2,3) → score (4) → prose (5) → footer (7) →
metric strip (6, last, because of the shared-primitive decision). Test all five cohorts after each.

---

## B. DetailScreen.tsx (~2063 lines) — the HCP profile

Reference: `FieldMark Profile.dc.html` (Established cohort only). The Publication-Timeline
incomplete-data treatment is **already done** (in this branch) and is out of this plan.

| # | Style cluster | Current | Design-system target | Risk |
|---|---|---|---|---|
| 1 | Two-column container `.fm-detail-body` (index.css:148–176) | one bordered grid box, 55%/45%, faux divider via `linear-gradient` seam | Design shows **separate `.elevation-card`s with a 22px gap**, main + `396px` rail, no container border/seam | **High** — this is the structural crux. Converting a bordered-grid to gapped cards touches the desktop grid AND the mobile `order`-based reflow (index.css:339–456, incl. `.fm-cohort-*` overrides). Needs its own review; may be left as bordered-grid if the reflow risk outweighs the gain. |
| 2 | Left-section wrappers (inline `padding 16px 16px 12px; borderBottom 1px #1E1E22`, e.g. 1314, 1355, 1415) | bottom-border sections inside one box | Each section = `.elevation-card` (tier 1), padding 22–28, **no bottom borders** (gap-separated) | **High** — ~9 left sections; depends on decision (1). |
| 3 | Section headers (inline 15 / uppercase / 0.06em / `#E8E6DF`) | — | Role 5 *eyebrow*: 11 / 600 / 0.18em / `--ink-4`. (Rail headers already migrated via `rightRailStyles`.) | **Low** — type-only, per-section edit. |
| 4 | Identity header (1188–1300) | name 30, Brief/List pills, bookmark | Role 2 *display* (already ~30/600); pills → ghost/outline; institution → indigo-link | **Low**. |
| 5 | Why This Expert (1312–1350) + Signal Summary (1352–1410) | inline; narrative body | Role 7 *serif* prose + **2px `--amber` left rule** (thesis rule, amber item #4); SIGNAL/WHY NOW/ENGAGEMENT ANGLE → role-6 micro-labels; embedded numerals → mono | **Low, high-value** — the amber left rule is the signature move. |
| 6 | Established Score → `ScoreBreakdownV3.tsx` | numeral 36 `#E8A020`; bars `#5C5FE8`; header inline | Role 1 numeral (already amber; mono per profile design); bars → `--indigo` `#5566E8` (near-identical); header → eyebrow | **Low** — self-contained component; `#5C5FE8`→`#5566E8` is imperceptible. |
| 7 | Engagement Mix donut (inline 441–571; `ENGAGEMENT_MIX_DEFS` 362–370) | 7-color slice palette incl. amber/indigo/green/violet/teal | One-amber-emphasis (§5.5): dominant slice `--amber`, others `--indigo`/`--est-green`/neutral at reduced saturation | **Med** — recoloring a data viz; must preserve slice→category mapping and keep exactly one amber emphasis. Some slice colors are cohort/semantic — verify none are cohort accents before recolor. |
| 8 | Belief Profile (`ScientificNarrativeSection` + `BeliefClaimReactionPanel`) | inline; corpus/provenance badges `rgba()` | Serif prose (role 7, italic for interpretive voice); provenance/strength → `--violet`; Deep Corpus → `--info` | **Med** — separate components; provenance colors already violet/info family. |
| 9 | Right rail bodies (Identification 1598–1655; `TopPharmaCompanies`; `MiniCollaboratorNetwork`; Field Intelligence 1039–1162; Field Notes 1863–1898) | inline hex | Identification NPI → mono, State → sans (§2); Top Pharma dominant row amber gradient (already matches design), est chips `--est-green`, links indigo; validation chips keep semantic greens/reds | **Low–Med** — headers already migrated; bodies are value-by-value §2 passes. |

**Cohort preservation:** `cohortAccentColor()` (violet/teal/slate) feeds the score, timeline, and
rail accents for non-Established cohorts. Leave every one. Community/Rising swap in
`ScoreBreakdownV3Community/Rising` and `ContactAccessCard` — those get the same *structural* elevation/
type treatment but keep their cohort colors.

**Suggested order:** headers (3) → narrative amber-rule (5) → score (6) → identity (4) → rail bodies
(9) → belief (8) → donut (7) → container/section elevation (1,2 together, last, behind their own
go/no-go on the mobile-reflow risk). Test Established, Rising, Community after each step.
