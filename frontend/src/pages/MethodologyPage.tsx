import { useMediaQuery } from "../lib/useMediaQuery";
// Methodology — direction 1B "Weight Ledger" (frame: Methodology Directions
// .dc.html, project 0512b0fa, built 2026-08-09). Presentation layer ONLY: the
// content shipped in commit 4808893 is LOCKED — every number, weight, formula
// and claim below is verbatim from that commit; this file arranges it, it does
// not edit it. The 1B devices: four cohort cards (scored-ranked vs
// classified-not-ranked), every formula as a full-width proportion bar whose
// widths ARE the weights (pharma 0.00 renders as an EMPTY tray — the exclusion
// is visible, not just stated), the evidence-tier ladder, and the data-source
// inventory grid.
// REGISTER: the platform's (ledger/drawer), not the frame's own palette —
// Source Serif for headings/content, IBM Plex Mono for labels/chrome, GOLD.rank
// as the one gold accent, and the LEDGER's cohort hues (EST sage #6E8F76,
// RS violet #9A8CC8, COM rose #B0848F — cohortLedger.ts COH map; never
// invented) so the page reads as continuous with the ledger.
import { Fragment } from "react";
import AppLayout from "../components/AppLayout";
import PageHero from "../components/PageHero";
import { useScoringDate, formatScoringDate } from "../lib/scoringMeta";
import { FONT, GOLD, GROUND, COOL } from "../lib/designTokens";

// Ledger cohort hues (cohortLedger.ts EST/RS/COM markerColor — same values).
const EST = "#6E8F76";
const RS = "#9A8CC8";
const COM = "#B0848F";

const INK_HEAD = "#F2F0EA";
const INK_BODY = "#C8C5BE";
const INK_DIM = "#8B857B";
const LINE_HAIR = "rgba(255,255,255,0.08)";
const LINE_MED = "rgba(255,255,255,0.12)";

const serif = (s: number, w = 400) => ({ fontFamily: FONT.serif, fontSize: s, fontWeight: w });
const mono = (s: number, w = 400) => ({ fontFamily: FONT.mono, fontSize: s, fontWeight: w });

const sectionStyle = {
  padding: "40px 0",
  borderBottom: `1px solid ${LINE_MED}`,
  display: "flex",
  flexDirection: "column" as const,
  gap: 18,
};

const headRowStyle = { display: "flex", alignItems: "baseline", gap: 16 };

// Full container width — no measure cap (2026-08-10, Garrett): prose runs the
// same width as the bars, cards and grids, so the page reads as one column.
const bodyStyle = {
  ...serif(14.5),
  color: INK_BODY,
  lineHeight: 1.7,
  margin: 0,
};

const chromeStyle = { ...mono(10), letterSpacing: ".16em", color: COOL.label, textTransform: "uppercase" as const };

const formulaStyle = {
  ...mono(11.5),
  color: "#C9CFD6",
  backgroundColor: GROUND.g1,
  border: `1px solid ${LINE_HAIR}`,
  padding: "14px 16px",
  margin: 0,
  lineHeight: 1.8,
  whiteSpace: "pre-wrap" as const,
};

function SectionHead({ title, color, note }: { title: string; color: string; note?: string }) {
  return (
    <div style={headRowStyle}>
      <h2 style={{ ...serif(24, 500), color, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
      <span style={{ flex: 1, height: 1, background: LINE_MED }} />
      {note ? <span style={{ ...mono(10), letterSpacing: ".14em", color: COOL.label }}>{note}</span> : null}
    </div>
  );
}

// A mono lead-in label inside a body paragraph (the committed <strong> labels,
// uppercased by CSS only — the source string is untouched).
function Lead({ color, children }: { color: string; children: string }) {
  return <span style={{ ...mono(11), color, letterSpacing: ".08em", textTransform: "uppercase" }}>{children} </span>;
}

// One segment of a proportion bar. Width IS the weight — never rounded.
function Seg({ pct, bg, num, label, dark }: { pct: number; bg: string; num: string; label: string; dark?: boolean }) {
  return (
    <div style={{ width: `${pct}%`, background: bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 14px", gap: 2, borderLeft: `2px solid ${GROUND.g0}`, overflow: "hidden" }}>
      <span style={{ ...mono(17, 600), color: dark ? "#0B0D10" : INK_HEAD }}>{num}</span>
      <span style={{ ...mono(9), letterSpacing: ".1em", color: dark ? "rgba(11,13,16,.75)" : "#C9CFD6", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

export default function MethodologyPage() {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint — 2026-08-10 mobile stack pass
  const scoredAt = useScoringDate();
  const breadcrumbs = [
    { label: "Home", path: "/me" },
    { label: "Methodology" },
  ];

  const cohortCard = (hue: string, name: string, tag: string, body: React.ReactNode, dim?: boolean) => (
    <div style={{ background: dim ? "rgba(255,255,255,.03)" : `${hue}22`, borderTop: `3px solid ${hue}`, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ ...mono(11), letterSpacing: ".14em", color: hue }}>{name}</span>
      <span style={{ ...mono(9.5), letterSpacing: ".1em", color: COOL.label }}>{tag}</span>
      <p style={{ ...serif(13.5), lineHeight: 1.6, color: dim ? INK_DIM : INK_BODY, margin: 0 }}>{body}</p>
    </div>
  );

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="wide">
      <div style={{ marginBottom: 8 }}>
        <PageHero
          reduced
          eyebrow="Fieldmark · Methodology"
          meta={`CURRENT AS OF ${formatScoringDate(scoredAt)}`}
          title="How FieldMark Works"
        />
        {/* Dek rendered page-side, NOT via PageHero's dek slot (2026-08-10):
            PageHero pins deks to a 620px measure by its own rule; this page
            runs one full-width column, so the dek joins it. Text unchanged. */}
        <p style={{ ...bodyStyle, marginTop: 12 }}>
          FieldMark identifies and ranks Healthcare Professionals (HCPs) in specific therapeutic areas using public scientific and administrative data. This page explains how that works - what we measure, why, and the boundaries of what the platform can and cannot tell you.
        </p>
      </div>

      {/* ── Therapeutic area scope — what the Lung Cancer TA covers ──────
          Added 2026-08-15 with the NSCLC -> Lung Cancer rename. The page had no
          copy stating the corpus boundary at all; under "NSCLC" a reader could
          infer it from the name, and under "Lung Cancer" they cannot. */}
      <div style={sectionStyle}>
        <SectionHead title="Therapeutic area scope" color={INK_HEAD} note="WHAT THE LUNG CANCER TA COVERS" />
        <p style={bodyStyle}>
          The Lung Cancer therapeutic area covers non-small cell lung cancer (NSCLC) and small cell
          lung cancer (SCLC). Scores, ranks, and cohort assignment are computed across the full lung
          cancer corpus.
        </p>
        <p style={bodyStyle}>
          Coverage is not even across the two. The underlying literature query was authored for NSCLC
          terms and later widened to match what it retrieved, so NSCLC representation is denser than
          SCLC. An expert whose work is predominantly SCLC will be represented, but less completely
          than an NSCLC counterpart of comparable standing.
        </p>
        <p style={bodyStyle}>
          Mesothelioma is excluded. It is a pleural malignancy rather than a lung parenchymal cancer,
          and is typically covered by separate field teams.
        </p>
      </div>

      {/* ── The cohort model — four cards, scored vs classified ─────────── */}
      <div style={sectionStyle}>
        <SectionHead title="The cohort model" color={INK_HEAD} note="FOUR MUTUALLY EXCLUSIVE CLASSES · PER THERAPEUTIC AREA" />
        <p style={bodyStyle}>
          Within each therapeutic area, every HCP is assigned one of four mutually exclusive career-structure classes. Three of them - Established, Rising Star, Community - are the scored cohorts described below. The fourth, early-career (fewer than three years since first publication), is classified and tracked but not ranked: three years of signal is not enough to score a trajectory honestly. Classification is per therapeutic area, so an HCP can be Established in one TA and Community in another. The three scored cohorts:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 2 }}>
          {cohortCard(EST, "ESTABLISHED", "SCORED · RANKED", "Field-shaping figures already recognized across pharma. These are senior investigators with sustained publication records, deep co-authorship networks, and active pharma engagement.")}
          {cohortCard(RS, "RISING STAR", "SCORED · RANKED", "Academic HCPs whose recent trajectory is accelerating. These are not necessarily today's most prominent voices, but they are gaining momentum in ways that suggest they will be tomorrow's.")}
          {cohortCard(COM, "COMMUNITY", "SCORED · RANKED", "Practicing clinicians active in their field. These are the HCPs MSLs encounter at conferences, in advisory boards, and in the practice settings where day-to-day decisions about therapy get made.")}
          {cohortCard(COOL.faint, "EARLY-CAREER", "CLASSIFIED · NOT RANKED", "fewer than three years since first publication - classified and tracked but not ranked: three years of signal is not enough to score a trajectory honestly.", true)}
        </div>
        <p style={bodyStyle}>
          Each cohort uses a different scoring formula because "influence" means different things in different contexts. A high-volume community oncologist is not measured the same way as a senior NSCLC investigator, and neither is measured the same way as a fellow whose publication output has just begun to accelerate.
        </p>
        <p style={bodyStyle}>
          Every HCP receives a FieldMark Score from 0 to 100, normalized within their cohort. A score of 100 means top of cohort. The score is not absolute and is not comparable across cohorts - a 95 in Rising Star is not the same kind of signal as a 95 in Established.
        </p>
      </div>

      {/* ── Established — 0.60 / 0.40 bar, 0.00 as an empty tray ────────── */}
      <div style={sectionStyle}>
        <SectionHead title="Established Scoring" color={EST} note="2 RANKED SIGNALS + 1 DISPLAYED" />
        <p style={bodyStyle}>
          The Established cohort surfaces HCPs whose influence is already recognized. The score is a weighted composite of two ranked signals, with a third (pharma engagement) displayed but not ranked:
        </p>
        {/* widths are the ACTUAL weights: 60% / 40% */}
        <div style={{ display: "flex", height: 60 }}>
          <Seg pct={60} bg={EST} num="0.60" label="SCIENTIFIC INFLUENCE" dark />
          <Seg pct={40} bg={`${EST}52`} num="0.40" label="NETWORK INFLUENCE" />
        </div>
        {/* pharma 0.00 — the exclusion rendered as an EMPTY tray, zero filled width */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, border: `1px dashed rgba(255,255,255,.22)`, padding: "12px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 150, flexShrink: 0 }}>
            <span style={{ ...mono(17, 600), color: COOL.faint }}>0.00</span>
            <span style={{ ...mono(9), letterSpacing: ".1em", color: COOL.faint }}>PHARMA ENGAGEMENT</span>
          </div>
          <span style={{ ...mono(9.5), letterSpacing: ".08em", color: COOL.label }}>
            COMPUTED AND DISPLAYED, WEIGHT 0.00 IN RANKING — ZERO FILLED WIDTH, BY DESIGN
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px 32px" }}>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={EST}>Scientific Influence (60%)</Lead>- Publication leadership in the therapeutic area, expressed as a percentile within the cohort. This is the largest signal because for Established HCPs, the publication record is the most direct evidence of expertise. The signal is built from senior- and first-author paper counts, citation impact, and guideline-linked publications, weighted to reward both volume and authorship seniority. Guideline linkage is a title-match proxy, not a curated guideline registry: a publication counts if it is typed as a Practice Guideline or Consensus Statement, or if its title matches guideline-language patterns (guideline, consensus, recommendation, expert panel, position statement) after filtering out papers <em>about</em> guidelines - adherence studies, implementation research, surveys. It measures guideline-adjacent publishing, not verified guideline-committee membership.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ ...bodyStyle, fontSize: 13.5 }}>
              <Lead color={EST}>Network Influence (40%)</Lead>- Position within the therapeutic area's co-authorship network, measured over a 10-year window. Established HCPs are connected - to each other, to emerging researchers, and to the institutions that shape the field. We measure this using three centrality metrics from network science: degree (how many co-authorship connections), eigenvector (how connected those connections are), and betweenness (how often this HCP serves as a bridge between research subcommunities).
            </p>
            <p style={{ ...bodyStyle, fontSize: 13.5, color: INK_DIM }}>
              <Lead color={COOL.label}>Pharma Engagement (0% - displayed, not ranked)</Lead>- CMS Open Payments record: payment volume, number of companies, drugs covered, and contract activity. This signal is shown on profiles and ledgers but carries no weight in the Established ranking. Open Payments covers only a minority of Established HCPs (roughly a third of the US top 200), and any nonzero weight at that coverage rewards absence: an HCP with no payment record would outrank an engaged peer on identical science. The weight will be revisited if coverage materially improves.
            </p>
          </div>
        </div>
        <p style={bodyStyle}>Established scores are computed using the formula:</p>
        <pre style={formulaStyle}>
          {"Cohort Score = 0.60 * Scientific Influence + 0.40 * Network Influence\nPharma Engagement: computed and displayed, weight 0.00 in ranking"}
        </pre>
        <p style={bodyStyle}>
          Each input is itself a percentile rank within the cohort, so the composite is meaningfully bounded between 0 and 100.
        </p>
      </div>

      {/* ── Rising Star — 4 signals → 2 composites → 1 score ────────────── */}
      <div style={sectionStyle}>
        <SectionHead title="Rising Star Scoring" color={RS} note="4 SIGNALS → 2 COMPOSITES → 1 SCORE" />
        <p style={bodyStyle}>
          Rising Stars are the HCPs MSLs most want to find and most often miss. They are not the people already on the conference rosters and advisory boards. They are the next generation, and they are defined by trajectory more than by current position.
        </p>
        <p style={bodyStyle}>The Rising Star score is built from four signals, organized into two composites:</p>
        {/* rollup diagram — every width is the actual weight (50/50 rows, 70/30 rollup) */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 40px 280px", gap: isMobile ? 14 : 0, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", height: 40 }}>
              <Seg pct={50} bg={`${RS}D9`} num="0.50" label="SCIENTIFIC MOMENTUM (35%)" dark />
              <Seg pct={50} bg={`${RS}8C`} num="0.50" label="NETWORK MOMENTUM (35%)" dark />
            </div>
            <div style={{ display: "flex", height: 40 }}>
              <Seg pct={50} bg={`${RS}4D`} num="0.50" label="SCIENTIFIC VISIBILITY (15%)" />
              <Seg pct={50} bg={`${RS}2E`} num="0.50" label="NETWORK VISIBILITY (15%)" />
            </div>
          </div>
          {isMobile ? null : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, color: COOL.faint, ...mono(14) }}>
              <span>→</span>
              <span>→</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ height: 40, background: `${RS}B3`, display: "flex", alignItems: "center", padding: "0 16px", justifyContent: "space-between" }}>
              <span style={{ ...mono(11, 600), letterSpacing: ".1em", color: "#0B0D10" }}>MOMENTUM</span>
              <span style={{ ...mono(15, 600), color: "#0B0D10" }}>0.70</span>
            </div>
            <div style={{ height: 40, background: `${RS}3D`, display: "flex", alignItems: "center", padding: "0 16px", justifyContent: "space-between" }}>
              <span style={{ ...mono(11), letterSpacing: ".1em", color: INK_HEAD }}>VISIBILITY</span>
              <span style={{ ...mono(15, 600), color: INK_HEAD }}>0.30</span>
            </div>
            <div style={{ display: "flex", height: 24, marginTop: 8, border: `1px solid rgba(255,255,255,.14)` }}>
              <div style={{ width: "70%", background: `${RS}B3` }} />
              <div style={{ width: "30%", background: `${RS}3D` }} />
            </div>
            <span style={{ ...mono(9.5), letterSpacing: ".14em", color: COOL.label }}>COHORT SCORE — 70 / 30</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "12px 32px" }}>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={RS}>Scientific Momentum (35%)</Lead>- Change in publication output between two rolling five-year windows, recomputed at every scoring run: the recent window is the trailing 60 complete months ending with the last finished month; the early window is the 60 months before that. Built from change in senior-author paper count, citation volume, and senior-author share. Because the windows roll with the calendar, a newly indexed paper counts the week it lands, and scores measure current trajectory rather than distance from a fixed baseline year. The exact window dates are recorded on every score row.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={RS}>Network Momentum (35%)</Lead>- Change in co-authorship network centrality between the same two rolling windows. Built from eigenvector, degree, and betweenness deltas.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={RS}>Scientific Visibility (15%)</Lead>- Current publication footprint in the recent window: total publications and citation rate.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={RS}>Network Visibility (15%)</Lead>- Current co-authorship centrality in the recent 5-year window.
          </p>
        </div>
        <p style={bodyStyle}>The four signals roll up through two intermediate composites:</p>
        <pre style={formulaStyle}>
          {"Momentum   = 0.50 * Scientific Momentum + 0.50 * Network Momentum\nVisibility = 0.50 * Scientific Visibility + 0.50 * Network Visibility\n\nCohort Score = 0.70 * Momentum + 0.30 * Visibility"}
        </pre>
        <p style={bodyStyle}>
          The 70/30 weighting of Momentum over Visibility is deliberate. An HCP with a high current footprint but flat trajectory is not a Rising Star - they are Established, or on their way. An HCP with a steep trajectory but modest current footprint is exactly what the Rising Star cohort is designed to surface. The two-level rollup also enables the Momentum-vs-Visibility quadrant visualization on each Rising Star profile.
        </p>
        <p style={bodyStyle}>
          The Rising Star cohort is gated by an industry classifier and hard eligibility floors, not by self-described affiliation. An HCP enters the momentum-model board only if classified academic by our institution classifier, with 15 or fewer years since first publication, and with at least 5 publications in each comparison window (network momentum additionally requires at least 20 collaborators per window). The 15-year cap is a hard predicate in the scoring query, not a soft convention. In therapeutic areas running the emergence model, eligibility instead comes from the per-TA career-structure taxonomy - a career age of 3-10 years plus a TA publication floor - and the industry gate also admits government investigators at NCI/NIH (engageable trialists, not regulators).
        </p>
        <p style={bodyStyle}>
          A Rising Star must also have <strong style={{ color: INK_HEAD }}>moved</strong>. The board requires at least three more senior-author publications in the recent five-year window than in the one before it - not three papers, but three more than the prior window produced. An HCP publishing steadily at the same level does not qualify however high that level is, and an HCP whose senior-author output fell does not qualify at all.
        </p>
        <p style={bodyStyle}>
          The floor was raised from "any increase". Any increase meant a single extra paper cleared the board, which admitted two in five members on the smallest measurable change and left no room beneath the threshold - nobody could be one paper away from entering, because entering required only the first one. Three papers is far enough above the noise that crossing it is a fact about someone's trajectory rather than about which window a manuscript landed in, and it leaves a visible approach: an HCP at two is close, and that is a thing worth knowing.
        </p>
        <p style={bodyStyle}>
          This is what separates the Rising Star board from the Established one. Established measures standing - how much, how cited, how connected, in absolute terms. Rising measures change, and a large body of work earns no place here on its size alone. The two boards are not a ranking of the same people at different career stages; they answer different questions.
        </p>
      </div>

      {/* ── Community — 40/30/15/10/5 bar + evidence-tier ladder ────────── */}
      <div style={sectionStyle}>
        <SectionHead title="Community Scoring" color={COM} note="5 SIGNALS · 40 / 30 / 15 / 10 / 5" />
        <p style={bodyStyle}>
          The Community cohort surfaces practicing clinicians whose influence flows from patient care rather than from publication or pharma standing alone. The scoring formula reflects that:
        </p>
        <div style={{ display: "flex", height: 56 }}>
          <Seg pct={40} bg={COM} num="40%" label="PATIENT VOLUME" dark />
          <Seg pct={30} bg={`${COM}9E`} num="30%" label="PHARMA ENGAGEMENT" dark />
          <Seg pct={15} bg={`${COM}61`} num="15%" label="GROUP PRACTICE" />
          <Seg pct={10} bg={`${COM}3D`} num="10%" label="CAREER YRS" />
          <Seg pct={5} bg={`${COM}21`} num="5%" label="PUB" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "12px 32px" }}>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={COM}>Patient Volume (40%)</Lead>- Estimated unique Medicare beneficiaries over a 3-year window. The largest single signal because patient volume is the most direct measure of community clinical reach.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={COM}>Pharma Engagement (30%)</Lead>- Total payments and engagement breadth from CMS Open Payments. Significant in this cohort because community-level pharma engagement is itself a signal of clinical relevance.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={COM}>Group Practice Signal (15%)</Lead>- Practice setting context, including group affiliation and practice size.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={COM}>Career Years (10%)</Lead>- Years since NPI enumeration, providing career-stage grounding.
          </p>
          <p style={{ ...bodyStyle, fontSize: 13.5 }}>
            <Lead color={COM}>Publication Signal (5%)</Lead>- Publication activity. Weighted low because Community HCPs are defined by practice, not by publication output.
          </p>
        </div>
        <p style={bodyStyle}>
          Community membership comes from the career-structure taxonomy, per therapeutic area - not from an NPI or payments gate. An HCP is classified Community in a TA when their career structure doesn't support Established or Rising membership there: a long or high-volume career without sufficient publications in this TA, a rising-age career below the TA publication floor, or no usable career data at all. NPI registration and CMS activity are then what make a Community HCP <em>rankable</em>: the scoring signals (patient volume, payments, practice setting) exist only where an NPI has been matched, so Community HCPs without one are classified and searchable but carry no score.
        </p>
        {/* evidence tiers — the ladder */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start", borderTop: `1px solid ${LINE_HAIR}`, paddingTop: 20 }}>
          <p style={{ ...bodyStyle, flex: "1 1 380px" }}>
            Where sources differ in how directly they evidence practice in a therapeutic area, that difference is kept explicit rather than averaged away: Community rows carry an evidence tier - anchored (TA-specific prescribing observed) above supported (cross-indication activity observed) - so a rank never hides how direct its underlying evidence is.
          </p>
          <div style={{ width: 360, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1px solid ${COM}73`, background: `${COM}14` }}>
              <span style={{ ...mono(9.5), color: COM, letterSpacing: ".16em" }}>TIER 1</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ ...mono(12.5), color: INK_HEAD, letterSpacing: ".06em" }}>anchored</span>
                <span style={{ ...serif(12.5), color: INK_DIM }}>TA-specific prescribing observed</span>
              </div>
            </div>
            <div style={{ height: 16, width: 1, background: "rgba(255,255,255,.18)", marginLeft: 34 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: `1px solid ${LINE_MED}` }}>
              <span style={{ ...mono(9.5), color: COOL.label, letterSpacing: ".16em" }}>TIER 2</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ ...mono(12.5), color: "#C9CFD6", letterSpacing: ".06em" }}>supported</span>
                <span style={{ ...serif(12.5), color: INK_DIM }}>cross-indication activity observed</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Data sources — inventory grid ───────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionHead title="Data sources" color={INK_HEAD} note="PUBLIC SOURCES · INVENTORY" />
        <p style={bodyStyle}>FieldMark draws from the following public data sources:</p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(170px, 220px) 1fr minmax(120px, 160px)", borderTop: `1px solid rgba(255,255,255,.14)`, fontSize: 13.5 }}>
          {isMobile ? null : (
            <>
              <div style={{ padding: "10px 14px 10px 0", borderBottom: `1px solid ${LINE_HAIR}`, ...chromeStyle }}>Source</div>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE_HAIR}`, ...chromeStyle }}>Contributes</div>
              <div style={{ padding: "10px 0 10px 14px", borderBottom: `1px solid ${LINE_HAIR}`, ...chromeStyle }}>Layer</div>
            </>
          )}
          {(
            [
              ["PubMed and OpenAlex", "publication records, authorship attribution, citation activity, and the co-authorship edges that underlie the network influence calculations.", "scientific record", GOLD.rank],
              ["ClinicalTrials.gov", "investigator participation in registered clinical trials, including role (principal investigator vs. sub-investigator) and trial phase.", "operational research", RS],
              ["CMS Open Payments", "pharma payments and engagement records, refreshed quarterly. Currently using the PY2024 dataset.", "engagement / clinical", COM],
              ["NPPES", "National Plan and Provider Enumeration System. Provides authoritative HCP credentials, taxonomy, and practice locations.", "identity", "#C9CFD6"],
              ["Medicare Provider Utilization and Payment Data", "patient volume and practice pattern data, updated annually.", "engagement / clinical", COM],
              ["Medicare Part D prescriber data", "drug-level prescribing for oral oncology agents, which grounds the Community evidence tiers.", "engagement / clinical", COM],
              ["NIH RePORTER", "federal grant funding records, matched to investigators.", "operational research", RS],
              ["X (Twitter)", "public posts and profile signals for HCPs with verified handles, feeding the social voice surfaces.", "social", COOL.label],
            ] as Array<[string, string, string, string]>
          ).map(([name, desc, layer, hue]) => (
            <Fragment key={name}>
              <div style={{ padding: "13px 14px 13px 0", borderBottom: `1px solid rgba(255,255,255,.07)`, ...serif(13.5, 600), color: INK_HEAD }}>{name}</div>
              <div style={{ padding: "13px 14px", borderBottom: `1px solid rgba(255,255,255,.07)`, ...serif(13.5), color: INK_BODY, lineHeight: 1.6 }}>{desc}</div>
              <div style={{ padding: "13px 0 13px 14px", borderBottom: `1px solid rgba(255,255,255,.07)`, ...mono(10.5), color: hue }}>{layer}</div>
            </Fragment>
          ))}
        </div>
        <p style={{ ...bodyStyle, color: INK_DIM }}>
          These sources are combined deliberately. NPPES provides the authoritative identity layer; PubMed and OpenAlex provide the scientific record; ClinicalTrials.gov and NIH RePORTER provide operational research activity; Open Payments and Medicare provide the engagement and clinical activity context.
        </p>
      </div>

      {/* ── Limitations — prose, unchanged content ──────────────────────── */}
      <div style={sectionStyle}>
        <SectionHead title="Limitations" color={INK_HEAD} />
        <p style={bodyStyle}>
          No methodology is perfect, and several real limitations shape what FieldMark can and cannot tell you:
        </p>
        <p style={bodyStyle}>
          <strong style={{ color: INK_HEAD }}>Coverage is not uniform.</strong> Open Payments has data on a minority of Established HCPs, which is why it carries no weight in the Established composite: it is displayed as context rather than scored. Publication data is more uniform but still incomplete for international researchers and for HCPs whose publication records pre-date OpenAlex's earliest reliable coverage.
        </p>
        <p style={bodyStyle}>
          <strong style={{ color: INK_HEAD }}>HCPs without sufficient signal do not appear.</strong> The platform requires real data signal - a registered NPI, demonstrated clinical activity, or substantive publication record - to surface an HCP. A real HCP whose data footprint is too thin for any of the three cohorts will not appear in FieldMark. Coverage will improve over time as data sources expand and as MSLs flag gaps for review.
        </p>
        <p style={bodyStyle}>
          <strong style={{ color: INK_HEAD }}>Cohort classification is not destiny.</strong> The classification reflects current signal across our data sources. An HCP near a cohort boundary can shift as new data arrives. We treat cohort assignment as a starting point for MSL judgment, not as an immutable label.
        </p>
        <p style={bodyStyle}>
          <strong style={{ color: INK_HEAD }}>Rising Star excludes industry and most non-academic affiliations by design.</strong> HCPs classified as industry, unclassifiable, or (outside NCI/NIH) government do not enter the Rising Star boards. Community clinicians building reputation and international investigators not yet visible in US-centric databases are likewise absent. Identifying emerging influence outside academia is on the roadmap but requires different signal architecture.
        </p>
        <p style={bodyStyle}>
          <strong style={{ color: INK_HEAD }}>International coverage is imperfect.</strong> Address parsing and institution normalization across countries is harder than within the US, and some international researchers may be misclassified. The current cohort logic is calibrated against US-skewed data.
        </p>
        <p style={bodyStyle}>
          <strong style={{ color: INK_HEAD }}>Industry-affiliated HCPs are excluded from cohort classification when identifiable.</strong> HCPs whose primary affiliation is pharma or biotech are removed from the cohort universe to keep the platform focused on field-side voices. This filter is imperfect - some industry-affiliated HCPs are not yet identified and may appear; some academic researchers with industry consulting roles are correctly retained.
        </p>
      </div>

      {/* ── A note on community refinement ──────────────────────────────── */}
      <div style={{ ...sectionStyle, borderBottom: "none" }}>
        <span style={{ ...mono(10), letterSpacing: ".18em", textTransform: "uppercase", color: GOLD.rank }}>A note on community refinement</span>
        <p style={bodyStyle}>
          FieldMark is built on the premise that no algorithm is final. Every HCP card has a flag affordance - if you disagree with a classification, flag it, and your signal becomes part of the methodology refinement loop. We treat MSL disagreement as data, not as noise.
        </p>
        <p style={{ ...bodyStyle, color: INK_DIM }}>
          The methodology described on this page is reconciled against the shipped scoring pipeline as of the date shown above. The pipeline code is authoritative: methodology changes land there first, and this page is brought current at the following scoring run. If this page and any surface in the platform disagree, treat that as a defect and flag it - the discrepancy, not the older text, is the error.
        </p>
      </div>
    </AppLayout>
  );
}
