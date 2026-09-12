# TA build — day-zero precheck

**Run this before any sequencing. It gates the build.**

Derived 2026-09-12 from the breast evidence-model work, which cost about an hour and
would have saved a week on colorectal. Colorectal reached week two before anyone
established that its anchor drugs were not in the data at all, and the whole evidence
model had to be redesigned around that.

The precheck answers one question: **what can this TA's evidence model actually
claim, given what the sources contain?**

---

## P0 — Ask the national source, never the ingested tables

`hcp_hcpcs_detail` and `hcp_part_d_oncology_v1` contain only already-ingested HCPs.
For a TA that does not yet exist, its specialists are absent from them **by
construction**, so any count taken there is a fact about the current population, not
about medicine. (Exception class E6.)

Ask these instead:

    Medicare/medicare_provider_service_<year>.parquet
      Part B, clinic-administered. 9,123,164 rows for 2023.
      Columns: npi, hcpcs_code, provider_type, place_of_service,
               total_beneficiaries, total_services, total_bene_day_services

    Medicare/Medicare_Part_D_Prescribers_by_Provider_and_Drug_<year>.csv
      Part D, pharmacy-dispensed.
      Columns: Prscrbr_NPI, Prscrbr_Type, Brnd_Name, Gnrc_Name,
               Tot_Clms, Tot_30day_Fills, Tot_Benes

`pyarrow` reads the parquet with column pruning; pandas reads the CSV in chunks with
`usecols`. Both fit comfortably in a single pass.

---

## P1 — Enumerate the payment channels

**There are at least three, and only two are on disk.**

| channel | what it holds | covered? |
|---|---|---|
| Part B non-institutional | clinic/office-administered drugs | yes — the parquet |
| Part D | pharmacy-dispensed outpatient prescriptions | yes — the CSV |
| **Part B oral anticancer via DME MAC** | oral oncology drugs J8520/J8521/J8522 etc. | **NO** |
| **Hospital outpatient institutional** | infusions billed by hospital-owned practices | **NO** |

Verified 2026-09-12: J8520, J8521, J8522, J8530, J8560, J8600, J8610 and J8700 all
return **0 rows** in `medicare_provider_service_2023.parquet`, while J9035 returns
1,842 in the same scan. The Physician & Other Practitioners file excludes DMEPOS MAC
claims.

For each candidate drug, establish which channel pays it before grading it. A drug
paid through an uncovered channel must be marked *not observable from these sources*
and must not be graded from a count that does not exist.

---

## P2 — Resolve exact name forms by scan

Stem matching silently returns ABSENT. Generic-only matching silently merges
indications.

Scan `Gnrc_Name` for the stem, list the distinct forms, then match on the exact
strings. Real forms found for breast: `Ribociclib Succinate`, `Tamoxifen Citrate`,
`Talazoparib Tosylate`, `Neratinib Maleate`, `Lapatinib Ditosylate`, `Elacestrant
Hcl`, `Ribociclib Succinate/Letrozole`, `Fam-Trastuzumab Deruxtecn-Nxki`,
`Pertuzumab-Trastuzumab-Hy-Zzxf`, `Ado-Trastuzumab Emtansine`, and the biosimilar
suffix family `Trastuzumab-Qyyp / -Anns / -Dttb / -Dkst / -Pkrb`.

**Read `Brnd_Name` alongside `Gnrc_Name`.** Generic names merge distinct indications:
everolimus is Afinitor (oncology) and Zortress (transplant immunosuppression);
alpelisib is Piqray (breast) and Vijoice (PIK3CA-related overgrowth). Grading on the
generic name puts transplant physicians into an oncology board.

Do the same on the Part B side for biosimilars. Anchoring on a reference product
alone is hollow where biosimilars carry their own Q-codes — bevacizumab needed
Q5107/Q5118/Q5126/Q5129 beside J9035, and trastuzumab has the identical structure.

---

## P3 — Apply the two suppression rules, and know which is which

    Part B   any NPI x HCPCS x place-of-service row under 11 BENEFICIARIES is redacted
    Part D   any prescriber-drug row under 11 CLAIMS is dropped

**These are not equivalent, and the asymmetry is load-bearing.**

A surviving Part B row means the provider treated **more than ten distinct
beneficiaries** with that drug at that site. A surviving Part D row can be one
patient on monthly refills. A Part B row is therefore materially stronger evidence
than a Part D row of the same apparent size — which is why fulvestrant at 227 Part B
billers anchors while an aromatase inhibitor at 21,808 Part D prescribers does not.

Consequences to check per drug:

- **Minority-subtype drugs vanish.** HER2+ is 15–20% of breast cancer, so community
  HER2 volume falls under 11 beneficiaries and the whole franchise reads as ~78
  providers nationally. Absence here is suppression, not absence of treatment.
- **Dosing schedule filters Part D.** A continuously dosed oral reaches 11 claims
  from one patient in a year; a finite-course or cyclical oral may not. But do not
  stop at this explanation — see E7. Capecitabine looked like a dosing artifact and
  was actually a missing payment channel.

---

## P4 — Check specialty concentration, not prescriber count

An abundant drug with a low specialist share is a trap, not an anchor. Measured
examples, 2023:

    bevacizumab        1,840 Part B billers, 15 oncology       <- ophthalmology
    anastrozole       21,808 Part D prescribers, 33% physician oncologist
    palbociclib        4,134 Part D prescribers, 74% physician oncologist

**`Prscrbr_Type` carries no specialty for nurse practitioners or physician
assistants.** They were 21.5% of anastrozole prescribers and 13.2% of palbociclib's.
Filtering on `Oncology|Hematology` silently drops all of them (exception class E8).
Enumerate the distribution before filtering on a subset of it.

---

## P5 — Grade specificity and attribution SEPARATELY

A three-way specificity grade cannot drive attribution on its own.

    specificity_grade                STRICT | CROSS-INDICATION | NON-SPECIFIC
    standalone_attribution_eligible  boolean

Anastrozole is pharmacologically breast-specific — STRICT — yet an anastrozole claim
is not evidence that the prescriber is an active breast oncologist, because long-term
adjuvant prescribing passes to primary care and gynecology. So: STRICT, standalone
FALSE.

This is better than deliberately mis-grading a drug as cross-indication to make the
downstream algorithm behave. Grade against **the therapeutic landscape of the data
year**, not today's labels — 2026 indications applied to 2023 claims introduce
hindsight error.

---

## P6 — State the observability skew before anyone sells against the list

The cohort will not be a neutral census, and the ways it is skewed are knowable in
advance from P3 and P4. Write them down as a product limitation.

For breast: *the community cohort is more sensitive to HR+/HER2− practice than to
HER2+ or TNBC practice, because of differential observability in public CMS data.*

Related rule: **never label a physician by the subtype you happened to observe.**
Expose independent evidence flags — HR-directed observed, HER2-directed observed,
TNBC-compatible observed — where absence renders as *not observed in these sources*,
never as *does not treat*. Calling someone an HR+ oncologist because CMS exposes
their palbociclib while suppressing their pertuzumab is mistaking the measurement
mechanism for clinical specialisation.

---

## P7 — Advisor review, against the measurements

Take P0–P6 to the clinical advisor as a table of numbers with a proposed
anchor/support/never-alone split, and ask him to attack it. The colorectal review
happened against a half-built model and found a real defect late. The breast review
happened against a page of measurements and changed the schema before a line was
written.

Ask specifically for:

1. the two grades per drug, per P5
2. which single drugs can establish a physician and which can only corroborate
3. combinations that mean more than their parts, bearing in mind there is no
   patient-level linkage — co-occurrence on an NPI is not co-administration
4. **what would make him distrust the finished list.** This is the question that
   tells you whether the model should exist, where the others only refine it.

---

## Exit condition

The precheck is complete when every candidate drug has: a payment channel, an exact
name form, a suppression note, a specialty concentration, both grades, and an
advisor sign-off — and when the observability skew is written down.

Only then does sequencing start.
