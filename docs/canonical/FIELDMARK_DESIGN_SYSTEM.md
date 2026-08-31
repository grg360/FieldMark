# FieldMark Design System

**Status:** canonical. **Theme:** dark only. **Scope:** every FieldMark surface.

This document is the source of truth for how FieldMark uses type, elevation, and its single
accent. It is written from the code that implements it — `src/lib/designTokens.ts` (inline-style
tokens), the `:root` custom properties and utility classes in `src/index.css`, and the IBM Plex
font load in `index.html`. It is derived from the imported design project *“FieldMark type and
elevation system”* (Claude Design project `78ae7363-1f2c-477e-b8da-e122e89482d8`).

The governing principle, in one line: **type and spacing do the organizing work.** Chrome,
borders, and color do as little as possible.

Where a token exists in two forms, they are mirrors of each other and must stay in sync:

| Form | Location | Use in |
|---|---|---|
| CSS custom properties (`--font-sans`, `--amber`, `--ink-2`, …) | `src/index.css` `:root` | class-based CSS, `var(--token)` |
| TypeScript objects (`FONT.sans`, `COLOR.amber`, `TYPE.eyebrow`, `ELEVATION.card`) | `src/lib/designTokens.ts` | inline `style={{}}` (the app's dominant convention) |

---

## 1. Typefaces

FieldMark uses one type superfamily — **IBM Plex** — in three cuts. A single engineered family
(rather than three unrelated faces) is deliberate: the sans, serif, and mono share metrics and
color, and it reads as built by people who take the data seriously.

| Role | Face | Token | Loaded weights | Used for |
|---|---|---|---|---|
| **Display / UI** | IBM Plex Sans | `--font-sans` / `FONT.sans` | 300, 400, 500, 600, 700 | Names, page titles, the score numeral, all interface text, labels, buttons |
| **Prose** | IBM Plex Serif | `--font-serif` / `FONT.serif` | 400, 500 (+ 400/500 italic) | Analytical narrative — Why This Expert, Signal Summary, Belief Profile, card summaries |
| **Data** | IBM Plex Mono | `--font-mono` / `FONT.mono` | 400, 500, 600 | Identifiers and quantitative values — see §2 |

**Exact stacks** (fallbacks matter — Plex may not have loaded yet on first paint):

```css
--font-sans:  'IBM Plex Sans', system-ui, sans-serif;
--font-serif: 'IBM Plex Serif', Georgia, serif;
--font-mono:  'IBM Plex Mono', ui-monospace, monospace;
```

**Where it loads.** `index.html` `<head>`, via Google Fonts with `preconnect` + `display=swap`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
```

`body { font-family: var(--font-sans); }` in `index.css`, so **every surface inherits the sans by
default**; serif and mono are opt-in per the rules below. UI is never serif; prose is the only
place the serif appears.

---

## 2. The monospace rule — mono vs. sans

This is the single most important rule in this document. The old surfaces drifted (`NPI` mono but
`State` sans, by feel, in the same block). Apply this mechanically so a new component is decided
without a judgement call:

> **Monospace is used for, and only for, values that are (a) a quantity you would sort, compare,
> or do arithmetic on, or (b) an opaque identifier you would match against an external system.
> Everything drawn from a natural language — a person, place, institution, drug, category, or any
> prose — is set in the sans or serif, no matter how short it is.**

**Mono (`--font-mono` / `FONT.mono`, always `font-variant-numeric: tabular-nums`):**
- Counts and tallies: `34` RS, `294` Est, `43` co-authored papers, `9` MSLs, `8` payments
- Ranks and positions: `#1` US, `#18` GLOBAL, Rank `1`
- Scores, percentiles, percentages: the `100` score numeral, `70`, `70th`, `0%`, `82%`
- Money: `$10.6K`, `$925`, `$186`
- Cohort-chip values: EST `98`
- Opaque identifiers: NPI `1770648875`, contributor UUIDs, trial IDs
- Years used as axis/data labels: `2017`, `2026`
- Numerals appearing inside prose

**Sans or serif (never mono):**
- People: `Gregory J. Riely`, `Top: Saumil Gandhi`, `Marc Ladanyi`
- Places / categorical codes: State `NY`, the `US` / `GLOBAL` unit labels, country
- Institutions and companies: `Memorial Sloan Kettering Cancer Center`, `Mirati Therapeutics`
- Specialties and categories: `Internal Medicine, Medical Oncology`
- Section headers, field labels, button text, all prose

**Resolved edge cases (do not re-litigate):**
- `34 RS · 294 Est` is **mixed on purpose**: `34`/`294` are mono; ` RS`/` Est` are sans unit
  labels. A quantity and its unit do not share a typeface.
- `State: NY` is **correctly sans** — `NY` is a place name, not a quantity or a registry id.
- `#1 US` splits: `#1` mono (a rank), ` US` sans unit label.
- Two-letter state/country codes and `US`/`GLOBAL` scope labels are **categorical → sans**, even
  though they look tabular.

Use the `.fm-num` class (or `TYPE.dataValue`) to get mono + tabular-nums in one token. **Right-align
mono values when they sit in a column** (payment amounts, ranks, metric readouts) so digits line up.

---

## 3. Type scale — nine roles

Nine roles. **Weight, size, and color all carry hierarchy — never rely on one alone.** Each role is
available as a `TYPE.*` object in `designTokens.ts`.

Color tokens referenced below (full palette in §6):
`--ink-1:#F4F2EC · --ink-2:#C7C3BA · --ink-3:#928E86 · --ink-4:#77736B · --ink-5:#57534b · --amber:#E8A020`

| # | Role | `TYPE` key | Face | Size / line-height | Weight | Letter-spacing | Color | Where |
|---|---|---|---|---|---|---|---|---|
| 1 | **Score numeral** | `scoreNumeral` | Sans | 42–56 / 0.9 | 600 | −0.03em | `--amber` | The one hero quantity per surface |
| 2 | **Display** | `display` | Sans | 30–32 / 1.05 | 600 | −0.02em | `--ink-1` | Page title, profile name |
| 3 | **Card title** | `cardTitle` | Sans | 21 / 1.1 | 600 | −0.015em | `#F2F0EA` | Expert name on a list card |
| 4 | **Subtitle / lead** | `subtitle` | Sans | 15–16 / 1.4 | 500 | 0 | `--ink-2` | Module titles, prompts |
| 5 | **Eyebrow** | `eyebrow` | Sans | 11 / 1 | 600 | 0.18em, UPPER | `--ink-4` | Section headers (IDENTIFICATION, WHY THIS EXPERT) |
| 6 | **Micro-label** | `microLabel` | Sans | 9.5–10 / 1 | 600 | 0.10–0.12em, UPPER | `--ink-4` | Metric captions (SCIENTIFIC), sub-eyebrows (SIGNAL) |
| 7 | **Body prose** | `bodyProse` | Serif | 14.5–15 / 1.7 | 400 | 0 | `#BDB9B0` | Narrative panels; italic 400 for interpretive voice |
| 8 | **Body UI** | `bodyUI` | Sans | 12.5–13.5 / 1.5 | 400 | 0 | `--ink-3` | Meta rows, helper text, secondary labels |
| 9 | **Data value** | `dataValue` | Mono | 11–17 / 1 | 500–600 | 0 | `--ink-2` / `#DAD7CF` | Any value from §2; 600 for emphasis, tabular-nums |

Rules of application:
- **Exactly one role-1 element per card and per page.** The amber score is the anchor; nothing else
  may compete at its size or color.
- Keep **at least two steps of separation** between a title and the body beneath it (e.g. a role-3
  name at 21/600 over role-7 prose at 15/400). A title and its body must never sit at the same
  optical weight — that flatness was the core defect.
- Eyebrows (role 5) label a section; they are **sans, not mono**, because a section name is language.
- Micro-labels (role 6) break long structures into scannable parts (`SIGNAL` / `WHY NOW` /
  `ENGAGEMENT ANGLE`).

---

## 4. Elevation

Depth comes from **light logic**, not borders: raised surfaces catch a highlight on their top edge
and cast a soft shadow below; recessed surfaces sink with an inner shadow. A 1px hairline only
*contains* a shape; it never does the separating on its own. `#141414` on `#0a0a0a` was too small a
delta and read flat — this is the fix.

Four tiers. Each surface belongs to exactly one. Available as `.elevation-card` / `.elevation-well`
/ `.elevation-raised` classes and `ELEVATION.card/well/raised` objects.

```css
/* Tier 0 — GROUND. The page. Nothing sits behind it. */
--ground: #0a0a0a;

/* Tier 1 — CARD (raised). The default module: list cards, rail panels, narrative blocks.
   Warm-lifted fill + top highlight + containing hairline + soft downward shadow. */
.elevation-card {
  background: #171512;                          /* --surface-card */
  border-radius: 11px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.05),        /* light catches the top edge */
    0 0 0 1px rgba(255,255,255,0.045),           /* hairline containment, not separation */
    0 12px 26px -18px rgba(0,0,0,0.85);          /* lift off the ground */
}

/* Tier 2 — WELL (recessed). Data cut INTO a card: metric strips, inputs, the donut hole,
   note fields. The recess is what makes a card feel like an instrument. */
.elevation-well {
  background: #0d0c0b;                          /* --surface-well */
  border-radius: 8px;
  box-shadow:
    inset 0 1px 2px rgba(0,0,0,0.6),
    inset 0 0 0 1px rgba(255,255,255,0.035);
}

/* Tier 3 — RAISED (hover / active only). A card lifts on hover; a segmented control's
   selected segment sits proud of its recessed track. Motion lives only here. */
.elevation-raised {
  background: #1b1915;                          /* --surface-raised */
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 0 0 1px rgba(255,255,255,0.07),
    0 18px 34px -14px rgba(0,0,0,0.95);
}

/* Attach .elevation-interactive to a tier-1 card to get the tier-3 hover transition
   (≤160ms; disabled under prefers-reduced-motion). */
.elevation-interactive { transition: transform .16s ease, box-shadow .16s ease, background .16s ease; }
.elevation-interactive:hover { transform: translateY(-2px); /* → elevation-raised shadow */ }
```

Application:
- **Ground → card → well** is the repeating rhythm. A list card (tier 1) contains a recessed metric
  strip (tier 2). A rail panel (tier 1) contains recessed toggle chips (tier 2).
- Fills are **warm-toned near-blacks** (`#171512`, `#0d0c0b`), not neutral gray. Keep white overlays
  under 6% opacity.
- **Never** separate two cards with a visible full-weight border. Space and the tier-1 shadow
  separate them. Hairlines (`--hair` 4.5% / `--hair-strong` 10%) contain one shape or divide rows
  *within* a card.
- Motion exists only at tier 3 (hover/selected, ≤160ms). No ambient animation — this is a tool
  people keep open all day.

---

## 5. The amber rule — what earns the accent

Amber (`--amber` `#E8A020`) is FieldMark's only accent and its scarcest resource. It works only
because the score numeral is nearly the sole thing wearing it. There is no second accent, and none
may be introduced.

**Amber is earned by exactly five things, and nothing else:**

1. **The wordmark** — `FIELDMARK`, once, top-left.
2. **The single hero quantity per surface** — the Established Score numeral on a card or profile.
   One per card, one per page. The `/ 100` denominator and everything around it is neutral.
3. **The one primary action per surface** — a solid amber button (e.g. *Add Insight*). Solid amber
   fill is reserved for the primary CTA; at most one on screen. Secondary/tertiary actions are
   outlined/ghost, never amber.
4. **The analytical-thesis rule** — the 2px amber left rule on the synthesized-argument panels
   (Why This Expert, Signal Summary). This marks “this is FieldMark's claim about the expert” and is
   the one structural use of amber. Do not extend it to every card.
5. **The single most salient value in a data visualization** — the dominant slice of the engagement
   donut (Honoraria), the top-paying company row, the complete publication series. One amber
   emphasis per chart; every other series/slice/row is neutral, indigo, or muted green, at reduced
   saturation so it never out-shouts the role-1 numeral.

**Everything else that used to be amber moves to indigo, green, or a neutral:**

- **Selection and navigation state → indigo (`--indigo` `#5566E8`), not amber.** Active tabs, active
  filters, the selected cohort, links (`--indigo-link` `#8B93F2`), progress/score bars, and secondary
  buttons. This is the biggest single change and it is what protects amber's scarcity — selecting a
  filter is navigation, not the primary action or the hero value.
- Cohort / est chips stay **muted green** (`--est-green` `#5FA97E`) — a distinct semantic, never amber.
- Provenance chips (Deep Corpus, Supported by N publications) use indigo / violet (`--violet`
  `#8B78E8`), never amber. Saved/bookmark uses `--info` `#4FA3C7`.

If you are reaching for amber and your element is not one of the five above, the answer is indigo,
green, or a neutral ink. When in doubt, it is not amber.

**Cohort accent exception (documented, not a violation).** The list/detail surfaces carry a
pre-existing *cohort* accent system distinct from this rule: Rising Star / Dark Horse use violet
(`#9B6DFF`), Workhorse teal (`#4ECDC4`), Community slate-blue (`#7B9EBD`), Established amber. These
color a card's cohort identity (left border, cohort score chip) and are a **semantic**, like the est
green — not a decorative accent. They are preserved. Only the *Established* card uses amber for its
cohort accent, and there it coincides with the role-1 score numeral. New non-cohort components must
still follow the five-item amber rule above.

---

## 6. Palette reference

```css
/* Ground & surfaces (warm near-black) */
--ground:        #0a0a0a;
--surface-well:  #0d0c0b;   /* recessed */
--surface-card:  #171512;   /* raised   */
--surface-raised:#1b1915;   /* hover    */

/* Ink (warm neutral, top-toned whites) */
--ink-1:#F4F2EC;  --ink-2:#C7C3BA;  --ink-3:#928E86;  --ink-4:#77736B;  --ink-5:#57534b;

/* Accent — the only accent */
--amber:      #E8A020;
--amber-soft: rgba(232,160,32,0.16);   /* dominant chart value, thesis-rule tint */

/* Secondary — selection, links, bars, secondary actions */
--indigo:      #5566E8;
--indigo-link: #8B93F2;
--indigo-soft: rgba(85,102,232,0.12);

/* Semantic */
--est-green: #5FA97E;   /* cohort/est chips */
--violet:    #8B78E8;   /* belief/provenance strength */
--info:      #4FA3C7;   /* bookmark / saved */

/* Hairlines — containment only, never separation */
--hair:        rgba(255,255,255,0.045);
--hair-strong: rgba(255,255,255,0.10);

/* Incomplete-data fill — see §7 */
--incomplete-data: #4a4632;
```

---

## 7. The incomplete-data pattern

Some time-series periods are **still filling** — the current and prior calendar year in the
Publication Timeline, for instance, because publication indexing lags and citations have not yet
accrued. These must be visually distinguished from complete periods so a reader never mistakes a
half-populated bar for a real decline.

**Canonical treatment:** a period that is not yet complete renders its bar in the muted, de-ambered
fill `--incomplete-data` (`#4a4632`) instead of the live series color (`rgba(232,160,32,0.82)` for
the amber publication series). Complete periods render at **full presence** — bar opacity is not used
to encode anything on this chart, so a faded bar means exactly one thing: incomplete. The muted fill
reads as “provisional” without competing for attention.

```tsx
// Only the current calendar year is still filling — indexing lag in this corpus is weeks, so the
// prior year is already complete. Opacity encodes nothing here; the muted fill is the sole cue.
const isProjected = p.year >= currentYear;
const barColor = isProjected ? 'var(--incomplete-data)' /* #4a4632 */
                             : 'rgba(232,160,32,0.82)';   /* live amber series, full presence */
```

Apply the same pattern to any surface showing a period that is still accumulating: use
`--incomplete-data` for the provisional segment and the live series color for complete segments,
and — where space allows — label the provisional segment (a caption, a hatch, or a legend note).

> **History.** Before this system, the timeline's greyed recent years were *not* an explicit
> incomplete-period treatment — they were an emergent side effect of a citation-maturity opacity
> formula (recent papers have few citations → low bar opacity). That was coincidental, not canonical:
> a genuinely low-but-complete year would also grey out, and a highly-cited recent preprint would
> not. This treatment is now implemented explicitly in `DetailScreen.tsx` (the Publication Timeline):
> `isProjected = p.year >= new Date().getFullYear()` drives the `--incomplete-data` fill for the
> current year only (the prior year is complete — real indexing lag here is weeks), and the hover
> tooltip labels it “In progress — indexing lag.” The citation-maturity opacity heuristic is **fully
> retired**: it overloaded one visual channel (opacity) with two meanings a viewer could not tell
> apart (maturity vs. incompleteness). Opacity now encodes nothing on this chart; the muted
> `--incomplete-data` fill is the single, unambiguous cue for “still filling.”

---

## 8. Applying this to a new component — checklist

1. Pick a surface tier: a module (`.elevation-card`) or a value display cut into one
   (`.elevation-well`)? Ground → card → well is the rhythm.
2. One entry point: is there a single most-important number? If so it is the role-1 amber numeral,
   sized well above everything else. If not, nothing is amber.
3. Run every value through §2: quantity or identifier → mono (`.fm-num` / `TYPE.dataValue`),
   tabular, right-aligned in columns; language → sans/serif.
4. Prose → serif (role 7), with numerals inside it set mono (role 9). Break long prose with role-6
   micro-labels.
5. Enforce two steps of separation between any title and its body.
6. Accent audit: is every amber pixel one of the five in §5 (or a documented cohort/est semantic)?
   If not, recolor to indigo / green / ink.
7. No borders separating cards; depth comes from tier shadows. Motion only on hover/selection.
8. Keyboard focus must be visible — the global `:focus-visible` indigo ring covers it; don't remove
   outlines without replacing them.

---

## Field Intelligence — anchored-discussion patterns (additions)

Introduced by the Field Intelligence Forum (anchored discussion + moderation).
Additions, not replacements: the surface already had pseudonymous handles,
verification badges, reply counts and the topic-only footer. All patterns reuse
the existing palette — none introduces a new accent hue. Red (`COLOR.danger`)
appears only for removal, at the same chroma and lightness as amber and indigo.
Implemented in `components/FieldIntelligenceForum/fiUi.tsx`.

**01 · Publication anchor** — indigo, 2px left rule. A card carrying PMID,
journal, year, citation count and title, with a scope statement naming what is
on and off topic. The indigo left rule marks it as platform-authored rather than
user-authored. Required at the head of every thread; collapses to a chip in
lists, composers and on mobile. Never editable by the poster.

**02 · Compliance-state chip** — four states only: on anchor (muted green),
under review (amber), context note attached (indigo), removed (red). One chip
per post, always with a reason fragment — never a bare colour. Amber is reserved
for "a human is looking at this"; red only ever means an action has already been
taken. This is the one place the system uses a fifth hue, at the same chroma and
lightness as amber and indigo.

**03 · Attached note** — auto-signal / peer-flag. A tinted block below the post
body, labelled with its source. It explains the concern in the paper's own terms
and states what happens next and by when. The note is additive — the post stays
legible. This is the pattern that lets borderline content stay visible while
being visibly qualified, which is the difference between a moderated forum and a
censored one.

**04 · Removal placeholder** — keeps its slot. A removed post keeps its position
and depth in the thread and states the clause, the timing, whether the author was
notified, and the appeal window. Removed text is visible to the author and to
reviewers, never to peers. Silent deletion is not available in the design — an
invisible removal cannot be audited — and it is not available in the schema
either: removal is modelled as a state, never a delete. The queue counts
prevented drafts alongside removals for the same reason.

**05 · Simulation marker** — `SIMULATED`. Dashed amber outline, mono, per post —
dashed because no production state uses a dashed border, so it can never be
mistaken for a live compliance state. Paired with a persistent header strip.
Prototype-only, and it is the marker that must survive any screenshot: real
papers, fabricated discussion, no real individual named as a participant. If a
single post is cropped out of the page, the chip must be in the crop.

**06 · Discuss affordance** — on every publication card. A fixed block on the
right of any publication card, in two states: dashed and empty ("No discussion
yet. Ask the first question.") or filled indigo with a reply count and a recency
line. It is the only way to open a thread — there is no composer on the forum
surface at all. That makes the anchor structural: a post without a citation is
not refused, it is unreachable. Appears in the year bibliography, co-authored
publications and institution partner publications; congress abstracts pending a
decision on whether an abstract anchors strongly enough. Compliance state is
never shown on this block.

---

## Ink temperature follows reading mode — at the block level

Two ink ramps: **COOL** (`COOL.*`, nine steps) for scanning surfaces and
**WARM** (`WARM.*`, three steps: prose/body/muted) for long-dwell reading.
Ground, line, chrome and gold are cool **everywhere, without exception**.

**The rule: ink temperature is chosen per block, not per page — and a block is
whatever the eye scans as one thing** (a table row, a card, a stat cluster, a
summary panel). Within one block, ink is a single temperature. A warm ink set
adjacent to a cool ink inside the same block makes the cool one read blue — that
is the failure this rule prevents (it read blue on Administered Therapy and on
Trials before their fixes).

Consequences:
- A **scanned data block** (figures, rows, a board) is cool throughout — its
  serif elements render in cool ink (`COOL.ui`/`COOL.prose`), not warm. This is
  what the Trials and Administered-Therapy reclassifications did: remap the
  local ink ramp onto `COOL.*`, serif included.
- A **long-dwell reading block** (an asset monograph, a position statement you
  read as prose) is warm throughout; its surrounding chrome (labels, rules,
  timestamps) stays cool, because chrome is cool everywhere — a warm reading
  body beside cool chrome is the two-ramp working, not an adjacency fault.
- A **deliberate two-column split** (Field Insights: warm observation left, cool
  analysis right) is two blocks, so two temperatures — each column is internally
  one temperature.
- Summary/narrative blocks are read consistently across the profile spines:
  the academic, community and rising signal summaries all render cool serif.

Do not fix an adjacency by nudging one hue a step (the pre-rule habit). Decide
what the eye scans as one unit, classify that unit read-vs-scan, and set the
whole unit to one ramp.
