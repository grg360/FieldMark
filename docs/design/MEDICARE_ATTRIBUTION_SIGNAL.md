# Medicare Administration-Attribution Signal

*A record of reasoning behind the Administered Volume block and the
provider-level signal it rests on. This is not a build spec. It exists so that
someone returning to this work in six months can reconstruct what the signal is,
what it deliberately is not, and why three earlier candidate metrics were tried
and thrown out. Where a number appears below, it is load-bearing — it was the
evidence that settled a decision — not decoration.*

## 1. Data constraints

Everything downstream is shaped by the grain of the source. The CMS provider
utilization file gives us **one row per provider, per HCPCS code, per year**.
There is no patient linkage anywhere in it: two rows for the same provider tell
us that both codes were billed, never that they were billed for the same person.
Any metric that needs to follow a patient through a course of care is impossible
from this data, and we should stop reaching for one.

The file also carries a **suppression floor of eleven beneficiaries**, which we
confirmed empirically rather than taking on faith: across the 59,754 drug rows,
the minimum `tot_benes` is exactly 11 and the median is 20. The practical
consequence is that absence is not zero. When a provider does not appear for a
drug, it means *fewer than eleven* beneficiaries received it under this billing
path — not that it was never given. This asymmetry is the single most common way
to misread the data, and it recurs in later sections.

Two further exclusions bound what "the practice" even means here. First, this is
**Original Medicare fee-for-service only**. Medicare Advantage, commercial
payers, Medicaid, and any patient under 65 are all invisible. A younger panel, or
one concentrated in Advantage plans, will read small here and may not be small at
all. Second, the drug rows are **office-setting only** — 59,748 rows coded `O`
against just 6 coded `F`. Facility-administered drugs are billed by the
institution under its own identifier, not by the physician, so they never surface
against the individual NPI. What we see is the office infusion suite, not the
hospital.

## 2. Coverage

The funnel from "physician we know about" to "physician this block renders for"
is steep, and it is steep by design. Of 49,888 HCPs carrying an NPI, **26,620
appear in Medicare claims at all** — about 53%. Of those, only **~3,370 have
office drug rows**. The large middle group is the telling one: **21,474 HCPs have
facility rows but no drug rows**. That is a billing arrangement, not clinical
inactivity — these are physicians whose drug administration is billed by their
institution, exactly the facility/office split described above.

Netting out, the Administered Volume block renders for **roughly one HCP in ten**.
This should be stated as a designed property of the signal, not apologized for as
a gap. The block measures office-based, fee-for-service drug administration
attributable to an individual NPI. Most physicians do not practice that way, and
the honest response is to say so on the profiles where the signal is absent,
rather than to stretch the metric to cover people it was never measuring.

## 3. Rejected metrics

Three candidate metrics were built far enough to evaluate and then rejected. They
are recorded here in full because each is an attractive idea that a future reader
will independently reinvent, and each fails for a reason worth remembering.

**Regimen inference from drug co-occurrence.** The hope was to read a provider's
billed drugs as evidence of the regimens they run. It fails first on the missing
patient linkage: co-occurrence of two codes on a provider is not co-administration
to a patient. It fails again on the suppression floor — ramucirumab, for
instance, is entirely absent below the eleven-beneficiary cutoff, so any regimen
that depends on it is structurally unobservable. And it fails on specificity:
of 508 providers billing the carboplatin / paclitaxel / nab-paclitaxel /
pembrolizumab set, 153 also bill fulvestrant or trastuzumab, meaning the
"lung backbone" we thought we were seeing collides directly with breast practice.
A provider is not a tumour type, and treating the drug mix as a diagnosis label
was the fundamental error.

**`tot_srvcs / tot_benes` read as cycles.** The ratio looks like
administrations-per-patient, but `tot_srvcs` counts *billable dosage units*, and
the unit is defined per HCPCS code. The ratio therefore scales with the code's
unit definition, not with anything clinical. Pembrolizumab lands at 701 and
carboplatin at 16.7 — a 42x spread that is an artifact of milligram-versus-vial
unit definitions, not a difference in how the drugs are given. This is the same
trap the Administered Volume block warns about on screen when it refuses to show a
services column for drugs.

**Days per beneficiary as treatment intensity.** Cleaner in principle, since it
uses beneficiary-days, but in practice the medians compress to roughly 2.0–4.0
across every agent regardless of dosing schedule — pembrolizumab 2.9 against
carboplatin 2.4. Drugs with completely different administration calendars land on
top of each other, so the metric carries almost no discriminating information at
the agent level and cannot support a claim about intensity.

**Part B carries no lung-specific anchor.** Every metric above is Part B
fee-for-service administered-drug data — general solid-tumour oncology with no
indication field — so none of it attributes activity to a tumour type. The
Medicare **Part D** prescribing file does provide a workable lung anchor
(single-indication oral targeted therapies, suppression on claims rather than
beneficiaries, and Medicare Advantage included); that reasoning and its measured
results are in [NSCLC_COHORT_EVIDENCE_TIERS.md](NSCLC_COHORT_EVIDENCE_TIERS.md).

## 4. What the signal is

What survived is deliberately narrower. The signal is
**`total_bene_day_services / tot_benes`, taken as a percentile within each
drug-year, then reduced to a median across drugs and then across years.** The
per-drug-year percentile removes the unit-definition problem that killed the
cycles metric; the double median produces one stable provider-level number rather
than twelve noisy drug-specific ones.

It validates as a single provider-level construct rather than a bundle of
drug-specific accidents. Cross-drug correlation runs **0.62–0.92**, which says
one dominant provider-level factor is doing the work, not twelve independent
facts. Year-over-year rank stability is **0.81–0.92**, so the ordering persists
across time. And the variance is substantially organizational: within-zip
standard deviation is **0.114** against an overall **0.271**, meaning much of the
spread tracks where a provider practices, not idiosyncratic individual behaviour.

Given all that, the honest description of the construct is **a
practice-associated infusion-attribution pattern, observed through the individual
provider NPI**. It is a property of how administration is attributed within a
practice setting, seen through one physician's billing — not a measure of that
physician's clinical choices.

One caveat travels with every stability figure above: **survivorship**. Only 47%
of 11–14 beneficiary cells remain reportable the following year, rising to 98% at
40 or more beneficiaries. The correlation and rank-stability numbers therefore
describe survivors — the cells large enough to persist — and not the volatile
small-cell tail that drops in and out of reportability.

## 5. Gating rules

Because the signal's reliability scales with cell size and with the number of
observations, characterisation is gated while display is not.

A **comparative statement** — anything that ranks or contrasts a provider —
requires at least two reportable years *and* at least two distinct agents, so that
the claim rests on more than a single cell. A **year-specific statement** requires
one year at 25 or more beneficiaries. Below that, at one year with 11–24
beneficiaries, the block may speak only **descriptively**: it can report what was
billed without characterising the provider.

The dividing line is deliberate: **there is no beneficiary cutoff on display, only
on characterisation.** We show what we hold, and we withhold the interpretation
until the evidence supports it.

## 6. Prohibited language

This is the section that matters most, because the metrics we rejected were
rejected precisely for implying things this signal cannot support, and careless
copy would reintroduce those errors.

This signal must **never** be described as any of the following: *treatment
intensity, persistence, duration of therapy, average cycles, longer-course
utilisation,* or *physician performance.* Each of these asserts a fact about
patient-level care or clinical quality that the data — with no patient linkage and
a unit-scaled service count — cannot establish.

Separately and equally firmly: **never state or imply that the absence of a drug
means non-use.** Absence means fewer than eleven beneficiaries under this one
billing path. It is a suppression floor, not a zero.

## 7. Interpretive note

The attribution pattern is not just one number among the Medicare-derived
figures; it **conditions all of them**. A provider whose administrations are more
distributed — spread across settings, codes, or billing identifiers — has
beneficiary counts and beneficiary-days that undercount their true activity,
because more of it falls outside what this NPI captures. A provider whose
administrations are more concentrated has claims that sit closer to complete.
Read this way, the signal is also a confidence qualifier on every other Medicare
number on the profile: it tells you how much of the real practice the rest of the
figures are likely to be seeing.

## 8. Open items

**Paclitaxel is volume-sensitive.** Its per-beneficiary measure correlates
negatively with beneficiary count (Spearman −0.23 to −0.29, consistent across
years), unlike the other agents. This is a documented exception; we carry it as-is
and apply no count adjustment, but it should be remembered before paclitaxel is
used in any comparative claim.

**Stage 12 does not refresh existing HCPs.** The weekly top-up
(`scripts/ingest/hcpcs_detail_topup.py`) is insert-only against an anti-join
target set, so it fills in newly-NPI'd HCPs but will never pick up a new CMS year
for an HCP already in the table. An annual-refresh path is a separate job that
does not yet exist; until it does, adding a CMS year is a manual backfill.

**Deliberately not built.** Count-residualised cross-drug correlations, formal
health-care-organization resolution, and a mixed-effects model were all
considered and judged unnecessary for what is currently a subordinate element of
the profile. That judgment is conditional: if this signal ever becomes an input to
ranking rather than a descriptive block, all three should be revisited before it
carries that weight.
