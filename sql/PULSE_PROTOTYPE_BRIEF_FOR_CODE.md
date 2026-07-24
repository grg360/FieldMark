# BUILD BRIEF — Scientific Pulse prototype (NSCLC)

For Claude Code. Read this fully before writing any component.

## What you are building

A single-page therapeutic-area view called **Scientific Pulse**. Audience is pharmaceutical
Medical Science Liaisons — scientifically sophisticated, institutionally skeptical of black boxes.
The page answers one question: *where is scientific attention in this therapeutic area, and what
changed?*

It is a read-only view. No user-generated content, no interactions that write.

## Data

One JSON payload produced by `sql/04_pulse_payload.sql`. For the prototype, hardcode the payload
as a constant in a single file (`pulseFixture.ts`) and type it. Do not build API plumbing yet —
the persisted snapshot table does not exist and the query shape may still change.

Payload shape:

```
{
  therapeutic_area: string,
  generated_at: string,
  window: { current_start, current_end, prior_start, prior_end, lag_days, window_days },
  totals: { current_pubs: number, prior_pubs: number },
  themes: [{
    name, description,
    cur_pubs, prior_pubs, lifetime_pubs,
    cur_share, prior_share,        // percent, may be null
    reviews, trials, commentary, guidance   // counts within current window
  }],
  events: [{ theme, type, title, journal, date }]   // may be empty
}
```

`type` is one of `guideline` | `consensus` | `retraction`.

## HARD RULES — these are the product, not preferences

**1. The 20-count display gate.** If `cur_pubs < 20`, never render a percentage or a
percentage-change arrow for that theme. Render the absolute count and a qualitative label only.
At these volumes a percentage is Poisson noise wearing a suit. Themes below the gate are expected
(ADC and KRAS G12C both run ~10 per window) — this path will be exercised immediately, so build
it first, not as an afterthought.

**2. Qualitative labels replace arrows below the gate.** Allowed vocabulary, nothing else:
`Increasing attention` · `Steady` · `Decreasing attention` · `Emerging` (lifetime_pubs < 600 and
cur_pubs > prior_pubs). Derive from the count delta. No numbers in the label.

**3. Show the window, always.** A persistent line reading
`Updated through {window.current_end}` near the header. Publication indexing lags, so the newest
period is deliberately excluded. Users must never be shown a period that is still filling.

**4. Never fabricate.** If `events` is empty, render a real empty state that says nothing
happened in the window. If `cur_share` is null, render an em dash. No placeholder rows, no sample
data, no "coming soon" cards. This codebase previously shipped fabricated insights attributed to
real named people and had to remove them — do not reintroduce that pattern in any form.

**5. Every number traceable.** Each theme row exposes its underlying counts on expand
(cur_pubs, prior_pubs, lifetime_pubs, and the composition breakdown). No aggregate appears
without its components reachable in one interaction.

## Components

Build in this order. Stop after 3 and show Garrett before continuing.

**1. Header + confidence stack.** Title, TA name, window line. Then a compact "Confidence"
block listing evidence streams with state:

```
  Publications      active
  Clinical trials   active
  Congress          not connected
  Guidelines        active
  Community         not connected
```

Only Publications, Clinical trials and Guidelines have data. The greyed rows are deliberate —
they disclose coverage rather than hiding it. Do not remove them.

**2. Consensus Snapshot.** Share of attention across themes in the current window. Horizontal
proportional bars, ranked, not a pie and not a treemap — the existing app already uses horizontal
bars for score breakdowns and this should read as the same family. Label the denominator plainly:
these are primary-theme publications in the window, not all publications.

**3. Theme list.** Ranked by `cur_pubs`. Each row: name, count, share (or em dash if gated),
movement label, and an expand affordance revealing description + composition counts. This is the
core of the page.

**4. Events.** Guidelines, consensus statements and retractions in the window, newest first, with
theme and journal. Rare by nature — 80 guidelines exist across the entire 30-year corpus — so an
empty state is the likely default and must not look like an error.

**5. Composition.** Per theme: research-to-review ratio and trial count. Ratio only when
`cur_pubs >= 20`; below that, counts. Do not build a four-way composition pie — editorials are
1.2% of the corpus and guidance 0.09%, so percentage breakdowns at window scale are meaningless.

## Design

Follow `docs/FIELDMARK_DESIGN_TOKENS.md` exactly — this is a shipping app's visual language, not
a greenfield brief. Summary: near-black `#0a0a0a` background; cards `#141414`–`#1a1a1a` separated
by contrast rather than borders; amber `#E0A82E` used sparingly for the wordmark, key figures and
primary actions; blue/indigo for secondary bars and buttons; section headers in letterspaced
uppercase muted grey; body in light grey; values right-aligned; restrained micro-charts. Mood is
clinical and calm — Bloomberg terminal meets Nature.

Mark synthesized content with the existing `✦` sparkle convention. Nothing in this prototype is
AI-generated yet, so it should not appear at all — do not add it decoratively.

## Stack

React / Vite / TypeScript, matching the existing frontend. Tailwind. Type the payload properly;
no `any`. Component files under the existing frontend structure — match surrounding conventions
rather than introducing new ones.

## Out of scope

Do not build: AI synthesis prose, momentum curves over time, sub-theme breakdowns, congress data,
community validation chips, or any write path. Several are planned; none have data yet.

## Note on the numbers you will see

Themes will range from roughly 175 publications (EGFR-mutant treatment) down to under 10
(antibody-drug conjugates). The small ones are not errors and must not be hidden — they are the
frontier themes the audience most wants surfaced, and the gate exists precisely so they can be
shown honestly.
