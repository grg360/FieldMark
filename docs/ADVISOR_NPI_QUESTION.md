# To the advisor — NPI identity resolution

Hoping for a gut check on a data problem, and on one product
question underneath it.

## The setup

FieldMark's HCP corpus is built publication-first. HCPs are
created from OpenAlex — authors, affiliations, co-authorship —
which gives us publication record, collaboration networks and
research themes, all current.

Everything on the CMS side — Open Payments, Medicare Part B
administered volumes, practice location, practice setting,
taxonomy — is reachable only through NPI. And NPI isn't ingested.
It has to be matched, by name, against the NPPES registry.

That match is where we are stuck.

## Where coverage sits

US-ranked established NSCLC cohort, 3,253 people:

- 47% have an NPI
- Of those with an NPI, 74% have Open Payments records

So the payments data is fine once someone is matched. The join is
the constraint.

It's worse where it matters most. Of the top 200 US-established,
69% have an NPI. Top 200 rising stars, 55%.

## What's failing

We ran a rules-based matcher — exact first and last name against
the NPPES API, physician-taxonomy filter, institution city as a
tiebreak for same-name collisions. Two passes over ~2,000
unmatched HCPs produced about 500 new NPIs.

91% of the failures return zero results from NPPES. Not
ambiguity — the search finds nobody. Some concrete examples from
the top 50:

- Alexander Drilon (MSK, rank 7). NPPES stores his first_name as
  "ALEXANDER EDWARD" — first and middle concatenated in one
  field. Exact match on "Alexander" returns nothing. He's NPI
  1578876876, found by hand in about twenty seconds.
- D. Ross Camidge (Colorado, rank 4). We store the first name as
  "D. Ross", so we search "D.". He's DAVID CAMIDGE in NPPES.
- Fred Hirsch, Steven Lin, Sarah Goldberg, Sai Yendamuri —
  legal-name variants (Frederick, Stephen, Sara, Saikrishna) that
  exact matching can't bridge.
- Sanja Đačić, Balázs Halmos, Mari Mino–Kenudson — diacritics and
  en-dashes against an ASCII registry.
- Ignacio Wistuba (MD Anderson, rank 6) appears to have no
  clinical NPI at all. He's a pathologist. That's a correct
  no-match.

Practice state, which we'd assumed would narrow searches, turned
out to actively hurt — our value is derived from institution
location and frequently disagrees with the NPPES-registered
practice state. Xiuning Le is at MD Anderson but registered in
Massachusetts.

## What we're considering

Replacing exact-string matching with LLM-assisted resolution.
Query NPPES by last name only, retrieve the full candidate set,
and have a model judge which candidate is the same person given
the HCP's institution, city and specialty — with a confidence
band, cited evidence, and the ability to decline. Proposals
written to a review queue, nothing auto-applied until precision
is validated against hand-verified cases.

## What I'd value your view on

**1. Is there a commercial identity spine we should be buying
instead of building?** We're solving a problem that pharma
commercial ops has presumably solved. Definitive Healthcare, IQVIA
OneKey, H1, Veeva OpenData, Komodo. What actually gets used for
publication-author-to-NPI resolution, what does it cost at our
scale, and is licensing it viable for a company at our stage?

**2. Is NPI-derived data worth this much effort for an MSL
product?** My assumption is that Open Payments and Medicare
volumes are core — knowing who a competitor is paying, and who is
actually administering which regimens, seems central to field
intelligence. But if MSLs don't in practice use either, we're
solving an expensive problem for a marginal payoff, and we should
lean harder on the publication side where coverage is already
complete.

**3. Where's the precision bar?** A wrong NPI attaches another
physician's payment history and Medicare volumes to someone's
profile. My instinct is that this needs to be near-zero error, not
95%, and that we should hold matches in a review queue rather than
auto-apply. Is that the right posture, or over-cautious for
internal field-intelligence use?

**4. Does the ceiling matter?** Some HCPs legitimately have no
NPI — research pathologists, PhD scientists, non-US investigators.
If realistic coverage tops out around 80% for a US academic
oncology cohort, is that workable, or does a partially-populated
payments dimension do more harm than good?

Happy to go deeper on any of it.
