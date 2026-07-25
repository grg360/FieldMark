# FieldMark — visual language brief

Two screenshots attached: the NSCLC Established list and an HCP profile (Gregory J. Riely).
These are live pages from a shipping product, not concepts.

## What this is

FieldMark is a field-medical intelligence platform. It identifies and profiles the physicians and
researchers who shape clinical practice in a therapeutic area, and it is used by pharmaceutical
Medical Science Liaisons — PhD- and PharmD-level field scientists who brief those experts.

The audience is scientifically sophisticated and institutionally skeptical. They will check a
claim against PubMed before they trust it. The product's entire positioning is that every number
is sourced and defensible: note the "SHOW EVIDENCE" affordance, the "View on NPI Registry" link,
the inline percentile citations, the "43 co-authored papers" links. Provenance is the brand.

The intended mood, already established: **Bloomberg terminal meets Nature.** Clinical, dense,
calm, premium. Not a consumer dashboard. Not a SaaS marketing page.

## The ask

**Evolve this design language. Do not replace it.**

These pages ship today and there are a dozen other surfaces built on the same vocabulary. A
from-scratch reimagining is not usable — the output has to be applicable to the rest of the
product by someone following the rules you write down. Work within the existing palette and
structure; change how they are applied.

## What is working — keep

- Near-black ground (~#0a0a0a), lifted cards (~#141414–#1a1a1a)
- Amber (~#E8A020) as the single primary accent, used sparingly: wordmark, the score numeral,
  primary actions
- Indigo/blue for progress bars and secondary actions
- Letterspaced uppercase section headers (IDENTIFICATION, WHY THIS EXPERT, TOP COLLABORATORS)
- Monospace for identifiers and data values (NPI numbers, rank strings, cohort counts)
- Right-aligned numerics
- Restrained micro-charts: horizontal bars, no chrome
- Muted green cohort chips (EST 98)
- Density. This should feel like an instrument, not a brochure.

## What is broken — fix

**1. Monospace is applied inconsistently.** Within a single card, `34 RS · 294 Est` is mono while
`Top: Saumil Gandhi` beneath it is sans. On the profile, the NPI value is mono and the State value
is not. There is no stated rule for which typeface carries which kind of information, so it is
applied by feel and drifts on every new surface. This is the single most important thing to fix.

**2. The type scale is compressed.** The expert's name and the section header sit at nearly the
same optical weight. Almost everything is one or two weights. The amber `100` is the only element
with real presence on the page, which is why it works — and why everything else reads as level.

**3. Cards do not separate.** The current rule is "separation by contrast, not lines," but
#141414 on #0a0a0a is too small a delta to do that job. The page reads flat. Solve this without
reverting to heavy borders, which is what the original rule was written to avoid.

**4. Prose blocks are undifferentiated.** The narrative panels (WHY THIS EXPERT, SIGNAL SUMMARY)
are long runs of body text at a single weight. They contain the most valuable content on the page
and are the easiest thing to skip.

## What "more dynamic" means here

Not motion. Not gradients. Not illustration.

It means the page should have **hierarchy, depth, and rhythm** — a clear entry point, an obvious
path for the eye, and variation in density so that sections feel distinct rather than stacked.
Right now every element competes at the same level and the reader has to do the sorting.

Look at a Bloomberg terminal or a well-set scientific journal: both are extremely dense, and both
are effortless to scan, because type and spacing do the organizing work. That is the target.

If you want to use motion at all, restrict it to state transitions and hover — this is a tool
people keep open all day, and ambient animation becomes irritating rather than premium.

## Deliverables

**1. Redesigned NSCLC list page.**

**2. Redesigned HCP profile page.**

**3. A written type and elevation system** — this is the most important deliverable and the one
that outlives the screenshots. It must specify:
   - Typefaces for each role: display, body prose, data/numeric, eyebrow/label. Name real faces
     available via standard web font hosting.
   - A rule for when monospace is used and when it is not, stated so unambiguously that a
     developer can apply it to a new component without asking.
   - The type scale: sizes, weights, letter-spacing, line-height per role.
   - Card elevation treatment, specified as CSS.
   - The accent rule: exactly what earns amber.

Deliver 3 as text that can be pasted into a repository as a design token document.

## Constraints

- Dark theme only. There is no light mode and none is planned.
- Do not change the information architecture. Same sections, same content, same order.
- Do not introduce a second accent color.
- Do not add decorative illustration, photography, or iconography beyond functional icons.
- Every element in the screenshots exists because it carries data. Nothing is filler — if
  something looks like it could be cut, assume it is load-bearing and ask instead.

## One risk to design against

This audience distrusts polish that outpaces substance. A page that looks like a marketing site
will read as less credible, not more. The visual language should feel like it was built by people
who take the data seriously — restrained, precise, and confident enough not to decorate.
