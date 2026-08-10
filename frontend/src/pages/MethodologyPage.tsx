import AppLayout from "../components/AppLayout";
import PageHero from "../components/PageHero";
import { useScoringDate, formatScoringDate } from "../lib/scoringMeta";

const COHORT_COLOR_ESTABLISHED = "#FFD700";
const COHORT_COLOR_RISING_STAR = "#9B6DFF";
const COHORT_COLOR_COMMUNITY = "#7B9EBD";

const sectionHeadingStyle = {
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: "#F2F0EA",
  marginTop: 32,
  marginBottom: 12,
  fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
};

const subheadingStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: "#F2F0EA",
  marginTop: 16,
  marginBottom: 8,
};

const bodyStyle = {
  fontSize: 14,
  color: "#C8C5BE",
  lineHeight: 1.7,
  marginTop: 0,
  marginBottom: 14,
};

const formulaStyle = {
  fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  color: "#B8B4AC",
  backgroundColor: "#0d0c0b",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: "14px 16px",
  marginTop: 12,
  marginBottom: 20,
  lineHeight: 1.55,
  whiteSpace: "pre-line" as const,
};

const archetypeListStyle = {
  fontSize: 14,
  color: "#C8C5BE",
  lineHeight: 1.7,
  paddingLeft: 20,
  marginTop: 8,
  marginBottom: 14,
};



export default function MethodologyPage() {
  const scoredAt = useScoringDate();
  const breadcrumbs = [
    { label: "Home", path: "/me" },
    { label: "Methodology" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="reading">
      {/* Reduced H1 (PageHero, Commit B 2026-08-05): same eyebrow + serif title
          family as the register mastheads, smaller, no stats cluster. */}
      <div style={{ marginBottom: 24 }}>
        <PageHero
          reduced
          eyebrow="Fieldmark · Methodology"
          meta={`CURRENT AS OF ${formatScoringDate(scoredAt)}`}
          title="How FieldMark Works"
          dek="FieldMark identifies and ranks Healthcare Professionals (HCPs) in specific therapeutic areas using public scientific and administrative data. This page explains how that works - what we measure, why, and the boundaries of what the platform can and cannot tell you."
        />
      </div>

      <h2 style={sectionHeadingStyle}>The cohort model</h2>
      <p style={bodyStyle}>
        Within each therapeutic area, every HCP is assigned one of four mutually exclusive career-structure classes. Three of them - Established, Rising Star, Community - are the scored cohorts described below. The fourth, early-career (fewer than three years since first publication), is classified and tracked but not ranked: three years of signal is not enough to score a trajectory honestly. Classification is per therapeutic area, so an HCP can be Established in one TA and Community in another. The three scored cohorts:
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: COHORT_COLOR_ESTABLISHED }}>Established</strong> - Field-shaping figures already recognized across pharma. These are senior investigators with sustained publication records, deep co-authorship networks, and active pharma engagement.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: COHORT_COLOR_RISING_STAR }}>Rising Star</strong> - Academic HCPs whose recent trajectory is accelerating. These are not necessarily today's most prominent voices, but they are gaining momentum in ways that suggest they will be tomorrow's.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: COHORT_COLOR_COMMUNITY }}>Community</strong> - Practicing clinicians active in their field. These are the HCPs MSLs encounter at conferences, in advisory boards, and in the practice settings where day-to-day decisions about therapy get made.
      </p>
      <p style={bodyStyle}>
        Each cohort uses a different scoring formula because "influence" means different things in different contexts. A high-volume community oncologist is not measured the same way as a senior NSCLC investigator, and neither is measured the same way as a fellow whose publication output has just begun to accelerate.
      </p>
      <p style={bodyStyle}>
        Every HCP receives a FieldMark Score from 0 to 100, normalized within their cohort. A score of 100 means top of cohort. The score is not absolute and is not comparable across cohorts - a 95 in Rising Star is not the same kind of signal as a 95 in Established.
      </p>

      <h2 style={{ ...sectionHeadingStyle, color: COHORT_COLOR_ESTABLISHED }}>Established Scoring</h2>
      <p style={bodyStyle}>
        The Established cohort surfaces HCPs whose influence is already recognized. The score is a weighted composite of two ranked signals, with a third (pharma engagement) displayed but not ranked:
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Scientific Influence (60%)</strong> - Publication leadership in the therapeutic area, expressed as a percentile within the cohort. This is the largest signal because for Established HCPs, the publication record is the most direct evidence of expertise. The signal is built from senior- and first-author paper counts, citation impact, and guideline-linked publications, weighted to reward both volume and authorship seniority. Guideline linkage is a title-match proxy, not a curated guideline registry: a publication counts if it is typed as a Practice Guideline or Consensus Statement, or if its title matches guideline-language patterns (guideline, consensus, recommendation, expert panel, position statement) after filtering out papers <em>about</em> guidelines - adherence studies, implementation research, surveys. It measures guideline-adjacent publishing, not verified guideline-committee membership.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Network Influence (40%)</strong> - Position within the therapeutic area's co-authorship network, measured over a 10-year window. Established HCPs are connected - to each other, to emerging researchers, and to the institutions that shape the field. We measure this using three centrality metrics from network science: degree (how many co-authorship connections), eigenvector (how connected those connections are), and betweenness (how often this HCP serves as a bridge between research subcommunities).
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Pharma Engagement (0% - displayed, not ranked)</strong> - CMS Open Payments record: payment volume, number of companies, drugs covered, and contract activity. This signal is shown on profiles and ledgers but carries no weight in the Established ranking. Open Payments covers only a minority of Established HCPs (roughly a third of the US top 200), and any nonzero weight at that coverage rewards absence: an HCP with no payment record would outrank an engaged peer on identical science. The weight will be revisited if coverage materially improves.
      </p>
      <p style={bodyStyle}>Established scores are computed using the formula:</p>
      <div style={formulaStyle}>
        Cohort Score = 0.60 * Scientific Influence + 0.40 * Network Influence{"\n"}
        Pharma Engagement: computed and displayed, weight 0.00 in ranking
      </div>
      <p style={bodyStyle}>
        Each input is itself a percentile rank within the cohort, so the composite is meaningfully bounded between 0 and 100.
      </p>

      <h2 style={{ ...sectionHeadingStyle, color: COHORT_COLOR_RISING_STAR }}>Rising Star Scoring</h2>
      <p style={bodyStyle}>
        Rising Stars are the HCPs MSLs most want to find and most often miss. They are not the people already on the conference rosters and advisory boards. They are the next generation, and they are defined by trajectory more than by current position.
      </p>
      <p style={bodyStyle}>The Rising Star score is built from four signals, organized into two composites:</p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Scientific Momentum (35%)</strong> - Change in publication output between two rolling five-year windows, recomputed at every scoring run: the recent window is the trailing 60 complete months ending with the last finished month; the early window is the 60 months before that. Built from change in senior-author paper count, citation volume, and senior-author share. Because the windows roll with the calendar, a newly indexed paper counts the week it lands, and scores measure current trajectory rather than distance from a fixed baseline year. The exact window dates are recorded on every score row.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Network Momentum (35%)</strong> - Change in co-authorship network centrality between the same two rolling windows. Built from eigenvector, degree, and betweenness deltas.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Scientific Visibility (15%)</strong> - Current publication footprint in the recent window: total publications and citation rate.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Network Visibility (15%)</strong> - Current co-authorship centrality in the recent 5-year window.
      </p>
      <p style={bodyStyle}>The four signals roll up through two intermediate composites:</p>
      <div style={formulaStyle}>
        Momentum   = 0.50 * Scientific Momentum + 0.50 * Network Momentum{"\n"}
        Visibility = 0.50 * Scientific Visibility + 0.50 * Network Visibility{"\n\n"}
        Cohort Score = 0.70 * Momentum + 0.30 * Visibility
      </div>
      <p style={bodyStyle}>
        The 70/30 weighting of Momentum over Visibility is deliberate. An HCP with a high current footprint but flat trajectory is not a Rising Star - they are Established, or on their way. An HCP with a steep trajectory but modest current footprint is exactly what the Rising Star cohort is designed to surface. The two-level rollup also enables the Momentum-vs-Visibility quadrant visualization on each Rising Star profile.
      </p>
      <p style={bodyStyle}>
        The Rising Star cohort is gated by an industry classifier and hard eligibility floors, not by self-described affiliation. An HCP enters the momentum-model board only if classified academic by our institution classifier, with 15 or fewer years since first publication, and with at least 5 publications in each comparison window (network momentum additionally requires at least 20 collaborators per window). The 15-year cap is a hard predicate in the scoring query, not a soft convention. In therapeutic areas running the emergence model, eligibility instead comes from the per-TA career-structure taxonomy - a career age of 3-10 years plus a TA publication floor - and the industry gate also admits government investigators at NCI/NIH (engageable trialists, not regulators).
      </p>

      <h2 style={{ ...sectionHeadingStyle, color: COHORT_COLOR_COMMUNITY }}>Community Scoring</h2>
      <p style={bodyStyle}>
        The Community cohort surfaces practicing clinicians whose influence flows from patient care rather than from publication or pharma standing alone. The scoring formula reflects that:
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Patient Volume (40%)</strong> - Estimated unique Medicare beneficiaries over a 3-year window. The largest single signal because patient volume is the most direct measure of community clinical reach.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Pharma Engagement (30%)</strong> - Total payments and engagement breadth from CMS Open Payments. Significant in this cohort because community-level pharma engagement is itself a signal of clinical relevance.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Group Practice Signal (15%)</strong> - Practice setting context, including group affiliation and practice size.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Career Years (10%)</strong> - Years since NPI enumeration, providing career-stage grounding.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Publication Signal (5%)</strong> - Publication activity. Weighted low because Community HCPs are defined by practice, not by publication output.
      </p>
      <p style={bodyStyle}>
        Community membership comes from the career-structure taxonomy, per therapeutic area - not from an NPI or payments gate. An HCP is classified Community in a TA when their career structure doesn't support Established or Rising membership there: a long or high-volume career without sufficient publications in this TA, a rising-age career below the TA publication floor, or no usable career data at all. NPI registration and CMS activity are then what make a Community HCP <em>rankable</em>: the scoring signals (patient volume, payments, practice setting) exist only where an NPI has been matched, so Community HCPs without one are classified and searchable but carry no score.
      </p>
      <p style={bodyStyle}>
        Where sources differ in how directly they evidence practice in a therapeutic area, that difference is kept explicit rather than averaged away: Community rows carry an evidence tier - anchored (TA-specific prescribing observed) above supported (cross-indication activity observed) - so a rank never hides how direct its underlying evidence is.
      </p>

      <h2 style={sectionHeadingStyle}>Data sources</h2>
      <p style={bodyStyle}>FieldMark draws from the following public data sources:</p>
      <ul style={archetypeListStyle}>
        <li><strong style={{ color: "#F2F0EA" }}>PubMed and OpenAlex</strong> - publication records, authorship attribution, citation activity, and the co-authorship edges that underlie the network influence calculations.</li>
        <li><strong style={{ color: "#F2F0EA" }}>ClinicalTrials.gov</strong> - investigator participation in registered clinical trials, including role (principal investigator vs. sub-investigator) and trial phase.</li>
        <li><strong style={{ color: "#F2F0EA" }}>CMS Open Payments</strong> - pharma payments and engagement records, refreshed quarterly. Currently using the PY2024 dataset.</li>
        <li><strong style={{ color: "#F2F0EA" }}>NPPES</strong> - National Plan and Provider Enumeration System. Provides authoritative HCP credentials, taxonomy, and practice locations.</li>
        <li><strong style={{ color: "#F2F0EA" }}>Medicare Provider Utilization and Payment Data</strong> - patient volume and practice pattern data, updated annually.</li>
        <li><strong style={{ color: "#F2F0EA" }}>Medicare Part D prescriber data</strong> - drug-level prescribing for oral oncology agents, which grounds the Community evidence tiers.</li>
        <li><strong style={{ color: "#F2F0EA" }}>NIH RePORTER</strong> - federal grant funding records, matched to investigators.</li>
        <li><strong style={{ color: "#F2F0EA" }}>X (Twitter)</strong> - public posts and profile signals for HCPs with verified handles, feeding the social voice surfaces.</li>
      </ul>
      <p style={bodyStyle}>
        These sources are combined deliberately. NPPES provides the authoritative identity layer; PubMed and OpenAlex provide the scientific record; ClinicalTrials.gov and NIH RePORTER provide operational research activity; Open Payments and Medicare provide the engagement and clinical activity context.
      </p>

      <h2 style={sectionHeadingStyle}>Limitations</h2>
      <p style={bodyStyle}>
        No methodology is perfect, and several real limitations shape what FieldMark can and cannot tell you:
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Coverage is not uniform.</strong> Open Payments has data on a minority of Established HCPs, which is why it carries no weight in the Established composite: it is displayed as context rather than scored. Publication data is more uniform but still incomplete for international researchers and for HCPs whose publication records pre-date OpenAlex's earliest reliable coverage.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>HCPs without sufficient signal do not appear.</strong> The platform requires real data signal - a registered NPI, demonstrated clinical activity, or substantive publication record - to surface an HCP. A real HCP whose data footprint is too thin for any of the three cohorts will not appear in FieldMark. Coverage will improve over time as data sources expand and as MSLs flag gaps for review.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Cohort classification is not destiny.</strong> The classification reflects current signal across our data sources. An HCP near a cohort boundary can shift as new data arrives. We treat cohort assignment as a starting point for MSL judgment, not as an immutable label.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Rising Star excludes industry and most non-academic affiliations by design.</strong> HCPs classified as industry, unclassifiable, or (outside NCI/NIH) government do not enter the Rising Star boards. Community clinicians building reputation and international investigators not yet visible in US-centric databases are likewise absent. Identifying emerging influence outside academia is on the roadmap but requires different signal architecture.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>International coverage is imperfect.</strong> Address parsing and institution normalization across countries is harder than within the US, and some international researchers may be misclassified. The current cohort logic is calibrated against US-skewed data.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Industry-affiliated HCPs are excluded from cohort classification when identifiable.</strong> HCPs whose primary affiliation is pharma or biotech are removed from the cohort universe to keep the platform focused on field-side voices. This filter is imperfect - some industry-affiliated HCPs are not yet identified and may appear; some academic researchers with industry consulting roles are correctly retained.
      </p>

      <h2 style={sectionHeadingStyle}>A note on community refinement</h2>
      <p style={bodyStyle}>
        FieldMark is built on the premise that no algorithm is final. Every HCP card has a flag affordance - if you disagree with a classification, flag it, and your signal becomes part of the methodology refinement loop. We treat MSL disagreement as data, not as noise.
      </p>
      <p style={bodyStyle}>
        The methodology described on this page is reconciled against the shipped scoring pipeline as of the date shown above. The pipeline code is authoritative: methodology changes land there first, and this page is brought current at the following scoring run. If this page and any surface in the platform disagree, treat that as a defect and flag it - the discrepancy, not the older text, is the error.
      </p>

    </AppLayout>
  );
}
