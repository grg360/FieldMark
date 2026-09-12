# Breast (TA #4) — evidence model, advisor-reviewed

Date: 2026-09-12. Measured against the national CMS source files in `Medicare/`,
not the ingested FieldMark population. 2023 program year. Clinical grades from the
advisor review of the same day, graded against the **2023** therapeutic landscape
deliberately — 2026 labels would introduce hindsight error, especially for tucatinib,
talazoparib and sacituzumab.

## Verdict

Breast does not have colorectal's attribution problem. CDK4/6 anchors cleanly and
fulvestrant gives an unexpectedly strong second anchor. **The problem is recall and
subtype observability, not anchor specificity.**

| TA | anchors on |
|---|---|
| nsclc | Part B molecules |
| colorectal-cancer | Part B *pattern*, no anchor tier |
| **breast** | **CDK4/6 (Part D) + fulvestrant (Part B), both true anchors** |

## THE SCHEMA CHANGE: specificity and attribution are two fields, not one

The advisor's most important structural correction. A three-way STRICT /
CROSS-INDICATION / NON-SPECIFIC grade cannot drive attribution on its own.
Aromatase inhibitors prove it: anastrozole is pharmacologically breast-specific,
yet an anastrozole claim is not evidence that the prescriber is an active breast
oncologist. **Drug indication specificity and claim attribution strength are
different properties.**

`ta_hcpcs_codes` / the drug config needs a second field:

```
specificity_grade              STRICT | CROSS-INDICATION | NON-SPECIFIC
standalone_attribution_eligible  boolean
```

    anastrozole   STRICT, standalone FALSE
    palbociclib   STRICT, standalone TRUE
    fulvestrant   STRICT, standalone TRUE

This is better than deliberately mis-grading anastrozole as cross-indication to make
the downstream algorithm behave. It generalises — colorectal should be re-examined
against it.

## THREE CLAIMS CHANNELS, NOT TWO

Capecitabine appears 4 times nationally in the Part D file. An earlier explanation —
an 11-claim dosing-schedule artifact — was a plausible story that fit the number and
is **not the cause**. Medicare pays oral anticancer drugs like capecitabine under the
**Part B oral drug benefit, processed by DME MACs** (HCPCS J8520/J8521/J8522). The
Physician & Other Practitioners file explicitly excludes DMEPOS MAC claims.

Verified: J8520, J8521, J8522, J8530, J8560, J8600, J8610 and J8700 all return
**0 rows** in `medicare_provider_service_2023.parquet`, while J9035 returns 1,842 in
the same scan.

**There is a whole payment channel neither current file covers.** Capecitabine must
not be graded or used from the Part D file at all.

The claims floors still exist and still matter, they just are not the capecitabine
explanation:
- Part B: any NPI x HCPCS x place-of-service row under **11 beneficiaries** is redacted.
- Part D: any prescriber-drug row under **11 claims** is dropped.

Dosing correction: palbociclib and ribociclib are 21 days on / 7 off, not continuous;
abemaciclib is continuous. Dispensing rhythm is roughly monthly either way, so the
operational point holds — these clear 11 claims far more easily than a finite-course
oral.

## LIVE DEFECT FOUND WHILE MEASURING: NP and PA are invisible to the specialty filter

Filtering `Prscrbr_Type` on `Oncology|Hematology` silently excludes every nurse
practitioner and physician assistant.

| | Hem-Onc | Med Onc | NP | PA | IM+FP+GP | Urology |
|---|---:|---:|---:|---:|---:|---:|
| anastrozole (21,808) | 25.1% | 8.2% | **21.5%** | **6.8%** | 28.6% | 2.9% |
| letrozole (13,388) | 34.4% | 11.9% | 22.7% | 6.6% | 17.0% | — |
| tamoxifen (8,447) | 40.2% | 13.6% | 20.8% | 6.0% | 13.5% | — |
| exemestane (5,264) | 44.4% | 15.3% | 20.1% | 5.6% | 11.1% | — |
| palbociclib (4,134) | 55.1% | 18.4% | **13.2%** | **3.9%** | 6.3% | — |

In oncology practice NPs and PAs write a large share of prescriptions under a
supervising physician, and `Prscrbr_Type` gives them **no specialty at all** — an
oncology NP and a primary-care NP are identical in this field.

**This is not a breast problem.** `hcp_part_d_oncology_v1` and the Med-Onc/Heme-Onc
taxonomy gate running the live 4,794-member CRC community board have the same blind
spot. Exception class E8.

Two findings that fall out of the same table:
- **Letrozole's fertility cross-indication does not apply in Medicare data** — no
  Obstetrics/Gynecology appears at all, because the population is 65+. Keep the
  advisor's grade for any other source; note the exemption for this one.
- **Urology is 631 anastrozole prescribers (2.9%)** — not survivorship, not primary
  care. Probably off-label prostate or male hypogonadism. Open question before the
  endocrine family is wired.

## Part B — national, 2023, 9,123,164 rows

| code | drug | billers | onc* | specificity | role |
|---|---|---:|---:|---|---|
| J9045 | carboplatin | 1,413 | 1,344 | NON-SPECIFIC | candidate only |
| J9267 | paclitaxel | 957 | 911 | NON-SPECIFIC | candidate only |
| **J9395** | **fulvestrant** | **227** | **218** | **STRICT** | **ANCHOR** |
| J9171 | docetaxel | 207 | 171 | NON-SPECIFIC | candidate only |
| J9070 | cyclophosphamide | 135 | 130 | NON-SPECIFIC | candidate only |
| J9264 | nab-paclitaxel | 118 | 112 | CROSS-INDICATION | support |
| Q5112/14/16/17 | trastuzumab biosimilars | 63 | 59 | CROSS-INDICATION | support |
| J9355 | trastuzumab | 8 | 8 | CROSS-INDICATION | support |
| J9358 | trastuzumab deruxtecan | 6 | 6 | CROSS-INDICATION | support |
| J9306 | pertuzumab | 1 | 1 | STRICT | ANCHOR if observable |
| J9354 | ado-trastuzumab emtansine | absent | — | STRICT | ANCHOR if observable |
| J9316 | PHESGO | absent | — | STRICT | ANCHOR if observable |
| J9317 | sacituzumab govitecan | absent | — | CROSS-INDICATION | support |

\* oncology counts understated — see the NP/PA defect above.

**Fulvestrant is an anchor, and the suppression rule is why.** A surviving Part B row
means the provider treated **more than 10 distinct Medicare FFS beneficiaries** with
a breast-specific advanced-disease drug at that place of service. Contrast Part D,
where 11 *claims* can come from a single patient on monthly refills. The Part B
threshold is a beneficiary count and is therefore much stronger evidence. Fulvestrant
skews toward advanced/metastatic HR+ practice, which is a property of the signal, not
a reason to downgrade it.

**Trastuzumab is not strict** — gastric/GEJ use. Enhertu was already cross-indication
in 2023: gastric/GEJ plus HER2-mutant NSCLC.

## Part D — national, 2023. Exact `Gnrc_Name` forms

| generic | prescribers | specificity | role |
|---|---:|---|---|
| Anastrozole | 21,808 | STRICT | never alone — endocrine support |
| Letrozole | 13,388 | CROSS-INDICATION (not in Medicare) | never alone |
| Tamoxifen Citrate | 8,447 | STRICT | never alone |
| Exemestane | 5,264 | STRICT | never alone — endocrine support |
| **Palbociclib** | **4,134** | **STRICT** | **ANCHOR** |
| **Abemaciclib** | **1,687** | **STRICT** | **ANCHOR** |
| Everolimus | 1,092 | CROSS-INDICATION | support — **brand split required** |
| Olaparib | 1,048 | CROSS-INDICATION | support |
| **Ribociclib Succinate** | **762** | **STRICT** | **ANCHOR** |
| Fulvestrant | 197 | STRICT | ANCHOR |
| Alpelisib | 132 | CROSS-INDICATION at generic level | **brand split required** |
| Tucatinib | 105 | CROSS-INDICATION | support — HER2+ CRC from 19 Jan 2023 |
| **Lapatinib Ditosylate** | **61** | **STRICT** | **ANCHOR** |
| **Elacestrant Hcl** | **59** | **STRICT** | **ANCHOR** — approved Jan 2023, ESR1-mut |
| Ribociclib Succinate/Letrozole | 55 | STRICT | ANCHOR |
| **Neratinib Maleate** | **37** | **STRICT** | **ANCHOR** |
| Talazoparib Tosylate | 10 | CROSS-INDICATION | support — HRR prostate from Jun 2023 |
| Capecitabine | 4 | — | **do not use from this file** |

**`Brnd_Name` must be read alongside `Gnrc_Name`.** Everolimus is the glaring case —
Afinitor is oncology, Zortress is transplant immunosuppression. Lumping them on the
generic name introduces transplant physicians into breast evidence. Alpelisib has the
same structure: Piqray is breast, Vijoice is PIK3CA-related overgrowth syndrome.

Name forms matter: `Ribociclib Succinate`, `Tamoxifen Citrate`, `Talazoparib
Tosylate`, `Neratinib Maleate`, `Lapatinib Ditosylate`, `Elacestrant Hcl`. Stem
matching returns ABSENT for all of them.

## Tiers to ship

    ANCHOR      palbociclib, ribociclib, abemaciclib, fulvestrant, elacestrant,
                neratinib, lapatinib; pertuzumab / T-DM1 / PHESGO when observable
    SUPPORTED   oncology-specialty AI/tamoxifen; alpelisib after brand handling;
                PARP inhibitors; trastuzumab family; Enhertu; tucatinib;
                sacituzumab; everolimus after brand handling
    CANDIDATE   taxanes, platinum, cyclophosphamide, other non-specific oncology
    ENDOCRINE_ONLY   Med-Onc/Heme-Onc with AI or tamoxifen evidence and no strict
                observable breast anchor

`endocrine_only` is a fifth state and it earns its place: that cohort is probably real
breast practice, but it tells an MSL something clinically different from a physician
with visible metastatic or targeted activity. Preserve it explicitly rather than
discarding it or promoting it to anchored.

## Combinations — characterise, don't establish

Breast has good single-drug anchors, so combinations should rescue weak evidence and
characterise the observed practice, not carry the model the way they had to for CRC.

- CDK4/6 + AI or fulvestrant — very high-confidence HR-driven breast practice
- fulvestrant + CDK4/6 — strong advanced HR+ footprint
- **alpelisib + fulvestrant** — PIK3CA-mutant HR+/HER2- fingerprint; the Piqray label
  pairs them explicitly
- AI/tamoxifen + another breast-specific endocrine agent, same NPI-year — rescues an
  `endocrine_only` physician
- tucatinib + an independent breast signal — raises the probability the tucatinib is
  breast rather than CRC
- olaparib/talazoparib + strong breast evidence — disambiguates PARP away from
  ovarian/prostate/pancreatic

**Never** build a breast anchor from carboplatin + paclitaxel + cyclophosphamide or
docetaxel. A general community oncologist or a gyn-onc-heavy practice generates the
same fingerprint. In breast, unlike colorectal, **specific molecule beats regimen
reconstruction.**

## Subtype: expose evidence flags, never label the physician

Do **not** classify physicians as "HR+", "HER2" or "TNBC" oncologists. In community
oncology the same breast or general medical oncologist treats all three; there is no
separate species of HER2 doctor. What FieldMark misses is HER2-directed **activity**,
not an identifiable population of HER2-exclusive physicians.

Expose three independent flags instead — HR-directed observed, HER2-directed
observed, TNBC-compatible observed — any combination allowed, and absence must render
as **not observed in these CMS files**, never as "does not treat this subtype".

Observability is radically uneven: HR+ has excellent Part D visibility, HER2+ has poor
Part B visibility, TNBC is cross-indication and hospital-outpatient heavy. Labelling a
physician HR+ because CMS exposes their palbociclib while suppressing their pertuzumab
would be **mistaking the measurement mechanism for clinical specialisation.**

## Stated product limitation

> The breast community cohort is more sensitive to HR+/HER2- practice than to HER2+ or
> TNBC practice, because of differential observability in public CMS data.

HER2 is hit from three sides at once: minority subtype, 11-beneficiary suppression,
and hospital-outpatient institutional billing which this dataset does not contain. The
~78 visible HER2 providers are a severe underestimate of community use. There is no
good universal surrogate for the missing activity.

## Expected skew and the false positives to watch

The list will skew toward HR+/HER2- practice, long-duration oral prescribers,
practices with enough Medicare FFS volume to survive suppression, and independent or
community practices whose Part B administration lands in non-institutional claims. It
will under-represent HER2-heavy and TNBC-heavy activity, hospital-owned practices
billing institutionally, and low-volume generalist breast treaters.

**Do not present it as a neutral census of community breast oncologists.**

False positives to watch:
- gynecologic oncologists via olaparib + taxanes/carboplatin
- GU oncologists via olaparib/talazoparib
- GI/CRC oncologists via tucatinib or capecitabine
- renal/NET clinicians or **transplant prescribers via generic everolimus**
- non-oncology prescribers admitted by endocrine therapy
- anyone admitted from cytotoxic chemotherapy alone

The advisor would distrust the board immediately if FieldMark called AI-only
prescribers anchored, treated trastuzumab as breast-exclusive, treated generic
everolimus as one disease signal, inferred subtype absence from missing CMS evidence,
read Part D claims as patient counts, or read missing Part B HER2 rows as absence of
HER2 treatment.

---
Source of record: the project doc `claude/breast-ta4-evidence-model-2026-09-12.md`.
This is a copy for on-disk consumption. If they disagree, re-derive from the
`Medicare/` source files rather than trusting either.
