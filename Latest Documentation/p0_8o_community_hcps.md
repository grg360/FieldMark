### 8o. Regional/community HCPs and DOLs invisible to publication-based methodology — strategic gap (NEW May 5 Tuesday evening, ELEVATED based on Neurocrine MSL Field Engagement audience input)

**Problem:** FieldMark's current scoring methodology — publication velocity, citation trajectory, trial investigator activity — systematically privileges academic medical center HCPs whose research output is captured in PubMed, OpenAlex, and ClinicalTrials.gov. This methodology produces a defensible "academic rising stars" cohort but is structurally blind to two HCP populations that MSL field engagement teams identify as critically important targets:

1. **Regional and community HCPs.** Practitioners at suburban hospitals, regional medical centers, large group practices, and independent specialty clinics. Often see 3-5x more patients than academic KOLs and make most actual prescribing decisions affecting commercial outcomes. Geographically dispersed. Minimal publication footprint, minimal citation count, often no trial PI activity. **Currently invisible to FieldMark.**

2. **Digital opinion leaders (DOLs).** HCPs whose influence is built through Twitter/X presence, LinkedIn engagement, podcast appearances, conference speaking, patient advocacy involvement, and other non-publication channels. Often have minimal academic publication output. Listed in original FieldMark product positioning ("identifies rising star HCPs and digital opinion leaders") but not addressed by current implementation methodology.

**Audience signal (May 5 Tuesday evening, Neurocrine Biosciences MSL Field Engagement team):** Regional and community HCP identification surfaced as a top priority multiple times during the conversation. DOLs also surfaced repeatedly. This audience represents the actual buyer of the FieldMark product. The gap between the platform's current methodology and the audience's stated priorities is wide enough that it constitutes a strategic risk to v1 launch positioning, not a v1.5 enhancement.

**Why P0:** The current rising-star feed surfaces academic figures who MSL teams may already know through traditional KOL databases. The platform's distinctive value proposition — surfacing HCPs that traditional databases miss — is undermined when "the HCPs we miss" doesn't include the regional and community practitioners who are precisely the targets MSLs need help finding. Without addressing this gap, FieldMark v1 is positioned as "another academic KOL tool" rather than "the platform that surfaces the HCPs your existing tools don't show you."

**Architectural context:** This is not a methodology tweak. The current scoring pipeline cannot identify regional/community HCPs because the underlying data sources (publications, trials) don't capture them. Addressing the gap requires new data ingestion layers parallel to the existing publication pipeline.

**Enrichment data sources — Tier 1 (high feasibility, available now):**

- **NPPES (National Plan and Provider Enumeration System).** Federal NPI registry. Free, public, complete US provider dataset. Contains practice address (city, state, zip), primary taxonomy (specialty), subspecialty taxonomies, group affiliations. Currently captured for only 18% of FieldMark HCPs. Full backfill is the foundation for community HCP identification — without it, every other regional/community signal lacks the ability to connect back to FieldMark records. **Sequencing dependency: blocks all other community HCP work.** Estimated effort: 1-2 weeks focused engineering. (Already captured as P0 #8l.)

- **Open Payments / Sunshine Act data.** Federal database of every payment from pharmaceutical companies and device makers to physicians ($10+ payments). Anyone receiving speaker bureau payments is by definition a community DOL within the commercial pharmaceutical universe. Consulting and research payments indicate industry engagement. Geographic distribution of payments reveals where field-medical activity is happening. (Already captured as P0 #8n; elevated in priority by Neurocrine input.)

- **State medical board licensing data.** Every state publishes physician license data. Geographic, contains specialty board certifications. Patchier than NPPES but provides verification cross-check.

**Enrichment data sources — Tier 2 (moderate feasibility, real value):**

- **Doximity.** Physician-only social network with self-curated profile data for approximately 80% of US physicians. Includes practice location, specialty, education, hospital affiliations. API access is restrictive; partnerships exist. High data quality.

- **Healthgrades / Vitals / Zocdoc.** Patient-facing physician directories aggregating physician data including location, specialty, hospital affiliations. Broad coverage, variable quality. Backfill via partnership or scraping.

- **HRSA (Health Resources and Services Administration).** Federal data on community health center providers, FQHCs, HPSA designated providers. Useful for identifying rural/underserved community practice.

- **Conference programs and speaker lists.** ASCO, AASLD, AAN, AHA, and other major specialty society annual meetings publish speaker programs. Community HCPs often present case studies and attend training sessions. Programs publicly available. Less structured but contains actual engagement signal.

**Enrichment data sources — Tier 3 (high value, lower feasibility):**

- **Commercial claims databases (Komodo Health, Definitive Healthcare, IQVIA).** Track actual prescribing behavior, patient volumes, referral networks. Industry standard for high-volume prescriber identification. Subscription cost typically $100K+ annual.

- **B2B contact databases (LinkedIn Sales Navigator, Apollo, ZoomInfo).** Healthcare provider segments with practice location, specialty data. Subscription-based, lower cost than claims data.

- **Twitter/X social listening (Brandwatch, Sprinklr, or Twitter API direct).** DOL identification through TA-relevant hashtag monitoring and physician engagement tracking. Multi-month buildout.

- **Speaker bureau program lists.** Industry-maintained speaker bureaus. Sometimes obtainable through industry sources, FDA filings, or compliance databases. Patchwork access.

**MSL contributor surfacing — fourth source, highest strategic alignment:**

The platform's existing crowdsourced intelligence thesis already plans MSL-anonymous contributions for verification. The same architecture extends to community HCP and DOL identification. Let MSLs flag specific community HCPs, regional KOLs, and DOLs they encounter in their territories. This crowdsources the long tail of HCP knowledge that public data sources cannot capture, while reinforcing the platform's distinctive positioning as a network-effect intelligence tool rather than a static database.

This addresses regional/community HCP identification through the platform's core value proposition rather than relying entirely on external data sources.

**Recommended v1 sequencing:**

1. **NPPES full backfill (existing P0 #8l).** Foundation. Connect every FieldMark HCP record to NPI when available, capturing geographic and specialty data. 1-2 weeks engineering.

2. **Open Payments integration (existing P0 #8n).** Cross-reference HCPs against Open Payments data to identify industry-engaged community HCPs and speakers. After NPPES backfill so payments are connectable to records. 2-3 weeks engineering.

3. **MSL contributor surfacing (new feature, builds on existing contributor architecture).** UI for MSLs to flag community HCPs and DOLs in their territories. Crowdsources the long tail. 3-4 weeks frontend + backend.

4. **Combined "regional intelligence" view.** UI surface that displays community HCPs by territory/state with aggregated signal from NPPES + Open Payments + MSL contributions. This is the product feature that answers "who should I be talking to in my territory" rather than "who's the academic rising star nationally."

Total: 6-10 weeks for substantial community HCP coverage. Probably 4-6 weeks for a credible v1.5 demonstrating the capability to Neurocrine and similar field engagement teams.

**DOL identification (parallel workstream, longer horizon):**

DOL identification through social media and digital channel signals is a separate ingestion pipeline. Twitter/X social listening, LinkedIn engagement tracking, podcast/blog presence detection. Probably v2 work — substantial buildout, requires partnership or API access, requires methodology design for "what does DOL ranking look like" since it's distinct from rising star scoring.

For v1, DOL identification can be partially addressed through MSL contributor surfacing (#3 above) — MSLs know who the DOLs are in their TAs and can flag them. This won't capture the long tail but addresses the immediate gap for v1 launch.

**Estimated effort for full P0 #8o resolution:** 6-10 weeks for community HCP coverage via NPPES + Open Payments + contributor model. DOL coverage extends into v2.

**Why this changes v1 launch positioning:**

If addressed in v1: FieldMark positions as "the platform that surfaces academic rising stars AND community/regional HCPs and DOLs your traditional databases miss." Substantially differentiated.

If deferred: FieldMark positions as "academic rising stars in NSCLC, hepatology, rare disease." Useful but commoditized — competing with established KOL databases on a slice of their value proposition.

**Decision needed:** Garrett to confirm whether NPPES backfill + Open Payments + MSL contributor surfacing should be moved into v1 launch scope (compressing v1 timeline by 4-6 weeks) or held for v1.5 (preserving current launch timeline but with narrower v1 positioning).

Per Garrett's stated direction May 5 Tuesday evening: "I want to prioritize regional/community immediately." Treating as v1 launch scope item.
