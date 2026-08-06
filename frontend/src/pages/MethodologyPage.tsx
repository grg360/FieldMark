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
        Every HCP in FieldMark belongs to one of three mutually exclusive cohorts:
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
        The Established cohort surfaces HCPs whose influence is already recognized. The score is a weighted composite of three signals:
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Scientific Influence (50%)</strong> - Publication leadership in the therapeutic area. This is the largest signal because for Established HCPs, the publication record is the most direct evidence of expertise. The signal is built from senior- and first-author paper counts, citation impact, and contributions to clinical practice guidelines, weighted to reward both volume and authorship seniority.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Network Influence (35%)</strong> - Position within the therapeutic area's co-authorship network. Established HCPs are connected - to each other, to emerging researchers, and to the institutions that shape the field. We measure this using three centrality metrics from network science: degree (how many co-authorship connections), eigenvector (how connected those connections are), and betweenness (how often this HCP serves as a bridge between research subcommunities).
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Pharma Engagement (15%)</strong> - CMS Open Payments record. This reflects the breadth and depth of pharma relationships - payment volume, number of companies, drugs covered, and contract activity. It is a secondary signal because pharma engagement varies meaningfully by therapeutic area and individual HCP preference, and because publication and network signals are stronger evidence of scientific standing.
      </p>
      <p style={bodyStyle}>Established scores are computed using the formula:</p>
      <div style={formulaStyle}>
        Cohort Score = 0.50 * Scientific Influence + 0.35 * Network Influence + 0.15 * Pharma Engagement
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
        <strong style={{ color: "#F2F0EA" }}>Scientific Momentum (35%)</strong> - Change in publication output between the 2016-2020 window and the 2021-2025 window. Built from change in senior-author paper count, citation volume, and senior-author share.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Network Momentum (35%)</strong> - Change in co-authorship network centrality between the same two windows. Built from eigenvector, degree, and betweenness deltas.
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
        The 70/30 weighting of Momentum over Visibility is deliberate. An HCP with a high current footprint but flat trajectory is not a Rising Star - they are Established, or on their way. An HCP with a steep trajectory but modest current footprint is exactly what the Rising Star cohort is designed to surface. The two-level rollup also enables the Momentum-vs-Visibility quadrant visualization on each Rising Star profile, where archetype is read directly from quadrant position.
      </p>
      <p style={bodyStyle}>Each Rising Star is also assigned an archetype based on momentum signals:</p>
      <ul style={archetypeListStyle}>
        <li><strong style={{ color: COHORT_COLOR_RISING_STAR }}>Balanced Rising Star</strong> - strong on both scientific and network momentum</li>
        <li><strong style={{ color: COHORT_COLOR_RISING_STAR }}>Scientific Accelerator</strong> - strong scientific momentum, more modest network growth</li>
        <li><strong style={{ color: COHORT_COLOR_RISING_STAR }}>Network Accelerator</strong> - rapidly building network influence, more modest publication acceleration</li>
        <li><strong style={{ color: COHORT_COLOR_RISING_STAR }}>Emerging Leader</strong> - meeting the Rising Star threshold but not yet showing breakout signal in either dimension</li>
      </ul>
      <p style={bodyStyle}>
        The Rising Star cohort is restricted to academic HCPs (those classified as practicing in academic institutions) and to HCPs with 15 or fewer years since their first publication. The 15-year cap is a soft definition: beyond 15 years, an HCP is treated as Established by definition, regardless of momentum.
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
        Community HCPs must have NPI registration and demonstrated clinical activity (either Open Payments engagement or measurable Medicare patient volume) to appear at all.
      </p>

      <h2 style={sectionHeadingStyle}>Data sources</h2>
      <p style={bodyStyle}>FieldMark draws from six public data sources:</p>
      <ul style={archetypeListStyle}>
        <li><strong style={{ color: "#F2F0EA" }}>PubMed and OpenAlex</strong> - publication records, authorship attribution, citation activity, and the co-authorship edges that underlie the network influence calculations.</li>
        <li><strong style={{ color: "#F2F0EA" }}>ClinicalTrials.gov</strong> - investigator participation in registered clinical trials, including role (principal investigator vs. sub-investigator) and trial phase.</li>
        <li><strong style={{ color: "#F2F0EA" }}>CMS Open Payments</strong> - pharma payments and engagement records, refreshed quarterly. Currently using the PY2024 dataset.</li>
        <li><strong style={{ color: "#F2F0EA" }}>NPPES</strong> - National Plan and Provider Enumeration System. Provides authoritative HCP credentials, taxonomy, and practice locations.</li>
        <li><strong style={{ color: "#F2F0EA" }}>Medicare Provider Utilization and Payment Data</strong> - patient volume and practice pattern data, updated annually.</li>
      </ul>
      <p style={bodyStyle}>
        These sources are combined deliberately. NPPES provides the authoritative identity layer; PubMed and OpenAlex provide the scientific record; ClinicalTrials.gov provides operational research activity; Open Payments and Medicare provide the engagement and clinical activity context.
      </p>

      <h2 style={sectionHeadingStyle}>Limitations</h2>
      <p style={bodyStyle}>
        No methodology is perfect, and several real limitations shape what FieldMark can and cannot tell you:
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Coverage is not uniform.</strong> Open Payments has data on a minority of Established HCPs in some therapeutic areas - when pharma engagement records are absent, that HCP scores zero on the Pharma Engagement dimension, which can affect their composite even when their actual pharma engagement is non-trivial. Publication data is more uniform but still incomplete for international researchers and for HCPs whose publication records pre-date OpenAlex's earliest reliable coverage.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>HCPs without sufficient signal do not appear.</strong> The platform requires real data signal - a registered NPI, demonstrated clinical activity, or substantive publication record - to surface an HCP. A real HCP whose data footprint is too thin for any of the three cohorts will not appear in FieldMark. Coverage will improve over time as data sources expand and as MSLs flag gaps for review.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Cohort classification is not destiny.</strong> The classification reflects current signal across our data sources. An HCP near a cohort boundary can shift as new data arrives. We treat cohort assignment as a starting point for MSL judgment, not as an immutable label.
      </p>
      <p style={bodyStyle}>
        <strong style={{ color: "#F2F0EA" }}>Rising Star is academic-only by design.</strong> Non-academic emerging voices - community oncologists building reputation, biotech-affiliated researchers, international investigators not yet visible in US-centric databases - do not appear as Rising Stars in v1. Identifying emerging influence outside academia is on the roadmap but requires different signal architecture.
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
        The methodology described on this page is current as of the platform's most recent scoring run. Methodology evolves; when it does, this page will be updated first, and every surface in the platform that references the score will be updated to match.
      </p>

    </AppLayout>
  );
}
