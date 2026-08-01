import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export type ScoringExplainedScrollTarget =
  | "overview"
  | "established"
  | "rising_stars"
  | "community"
  | "workhorse"
  | "data_sources"
  | "refinement"
  | "faq";

export interface ScoringExplainedModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, scrolls the modal body to this section after open. */
  scrollToSection?: ScoringExplainedScrollTarget | null;
}

const bodyText: CSSProperties = {
  fontSize: 13,
  color: "#9B9892",
  lineHeight: 1.6,
  margin: 0,
};

const headingStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#E8E6DF",
  margin: "0 0 8px",
};

const subStyle: CSSProperties = {
  fontSize: 12,
  color: "#6B6A65",
  margin: "0 0 12px",
};

const monoBlock: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.55,
  color: "#B8B4AC",
  backgroundColor: "#0F0F11",
  border: "1px solid #1E1E22",
  borderRadius: 4,
  padding: "10px 12px",
  marginTop: 12,
};

const FAQ_ITEMS: readonly { q: string; a: string }[] = [
  {
    q: "Why don't I see a specific HCP in the platform?",
    a: "HCPs are surfaced only when they have sufficient data signal — a registered NPI, demonstrated clinical activity, or substantive publication record. If a recognized HCP is missing from FieldMark, the most common reason is that our data sources don't yet have the linkage needed to surface them. Coverage improves continuously as new data is ingested and as MSLs flag gaps for review.",
  },
  {
    q: "I disagree with a classification. What can I do?",
    a: "Flag the HCP on any card. The platform captures classification disagreements from MSLs as community signal that informs methodology refinement. Your flag adds a data point — patterns of disagreement across users help us identify where our methodology needs to evolve. Cohort classifications are not static; they reflect our current best signal from the data we have.",
  },
  {
    q: "Where does the data come from?",
    a: "FieldMark draws from five sources: Open Payments (CMS Sunshine Act) for pharma engagement, Medicare Provider Utilization & Payment Data for clinical patient volume, NPPES for provider credentials and addresses, PubMed and OpenAlex for publication and citation activity, and ClinicalTrials.gov for trial investigator records. We combine these signals to build a comprehensive picture of each HCP's role in the field. See the Data Sources section above for full details.",
  },
  {
    q: "How current is this data?",
    a: "Data refresh varies by source. Open Payments is updated quarterly from CMS as new data is released. Medicare Provider Utilization data is updated annually. NPPES is refreshed monthly. Publication data from PubMed and OpenAlex is refreshed monthly. We pull from public sources on these standard cadences — there is no real-time feed.",
  },
  {
    q: "Can HCPs opt out of FieldMark?",
    a: "Yes. HCPs can request removal from the platform by emailing optout@besselanalytics.com. Opt-out requests are honored within 5 business days. Once removed, the HCP no longer appears in any cohort view and is excluded from search results. We respect provider autonomy and treat opt-out as a one-way action — opted-out HCPs are not re-added even if new data signals appear.",
  },
  {
    q: "What's the difference between Rising Stars and Established?",
    a: "Established HCPs are field-shaping senior figures with sustained presence — they've consistently published, advised pharma, and led trials over a career. Rising Stars are emerging voices whose recent acceleration in publication velocity, citation trajectory, or trial investigator activity suggests they're on a trajectory toward Established status. Established describes a current state. Rising Stars describes momentum.",
  },
  {
    q: "What's the difference between Community and Workhorse?",
    a: "Community describes practicing clinicians who are active in pharma engagement and demonstrate clinical activity. Workhorse is a subset of Community — practitioners with substantial Medicare patient volume but unusually low pharma engagement. Workhorses are 'underleveraged' from a pharma standpoint: they have real clinical impact but haven't been actively engaged by pharma teams. Both cohorts represent legitimate MSL targets, but they suggest different engagement strategies.",
  },
  {
    q: "Can I export HCP profiles or data from the platform?",
    a: "Not in v1.0. Planned for v1.1: the ability to email yourself a PDF copy of an HCP profile for offline reference or sharing with teammates. Bulk export of lists or cohort data is being scoped for later releases. Email optout@besselanalytics.com if you have specific export needs you'd like considered for the roadmap.",
  },
  {
    q: "What does the score number mean? How do I interpret 78.3 vs 65.4?",
    a: "Scores are percentile-rank based within each cohort, normalized to 0-100. A Community HCP with a score of 78 ranks higher than 78% of other Community HCPs on the weighted composite. The score is relative to the cohort, not absolute — a 78 in Community is not directly comparable to a 78 in Workhorse because they use different formulas. Higher scores indicate stronger signal across the weighted components for that cohort.",
  },
  {
    q: "Why are some HCP cards missing engagement data (showing dashes)?",
    a: "Not every HCP has Open Payments or Medicare records in our source data. About 85% of Community HCPs have Open Payments data; about 65% have Medicare data. When a metric is missing, we display a dash rather than guessing or filling with zero. The missing field doesn't disqualify the HCP — they qualified for their cohort based on other available signals.",
  },
];

function SectionDivider() {
  return <div style={{ height: 1, backgroundColor: "#1E1E22", margin: "24px 0" }} />;
}

export default function ScoringExplainedModal({ open, onClose, scrollToSection }: ScoringExplainedModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  const [sheetEntered, setSheetEntered] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 599px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) {
      setSheetEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSheetEntered(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (!body) return;

    const run = () => {
      if (!scrollToSection) {
        body.scrollTop = 0;
        return;
      }
      const el = document.getElementById(`fm-scoring-${scrollToSection}`);
      if (!el) return;
      const b = body.getBoundingClientRect();
      const t = el.getBoundingClientRect();
      const next = body.scrollTop + (t.top - b.top) - 12;
      body.scrollTo({ top: Math.max(0, next), behavior: "smooth" });
    };

    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, scrollToSection]);

  if (!open) return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 500,
    backgroundColor: "rgba(0,0,0,0.72)",
    display: "flex",
    alignItems: mobile ? "flex-end" : "center",
    justifyContent: "center",
    padding: mobile ? 0 : 16,
    fontFamily: "system-ui, -apple-system, sans-serif",
  };

  const panelStyle: CSSProperties = mobile
    ? {
        width: "100%",
        maxHeight: "min(100dvh, 100vh)",
        height: "min(100dvh, 100vh)",
        backgroundColor: "#0A0A0B",
        borderTop: "1px solid #1E1E22",
        borderLeft: "1px solid #1E1E22",
        borderRight: "1px solid #1E1E22",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
        transform: sheetEntered ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)",
      }
    : {
        width: "100%",
        maxWidth: 720,
        maxHeight: "90vh",
        backgroundColor: "#0A0A0B",
        border: "1px solid #1E1E22",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
      };

  return (
    <div
      role="presentation"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fm-scoring-modal-title"
        style={panelStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid #1E1E22",
            backgroundColor: "#0A0A0B",
          }}
        >
          <h2 id="fm-scoring-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "#E8E6DF" }}>
            Scoring explained
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              border: "1px solid #1E1E22",
              backgroundColor: "#111113",
              color: "#9B9892",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <div
          ref={bodyRef}
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "16px 18px 28px",
          }}
        >
          <section id="fm-scoring-overview">
            <h3 style={headingStyle}>How FieldMark Classifies HCPs</h3>
            <p style={bodyText}>
              FieldMark organizes HCPs into four cohorts based on their role in the field. Each cohort uses different signals
              because the question &apos;who matters?&apos; differs by context.
            </p>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Established voices are the field-shaping figures. Rising Stars are emerging voices building momentum. Community
              HCPs are practicing clinicians active in pharma engagement. Each cohort has a subset that surfaces specific
              high-value patterns.
            </p>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Cohort assignments are mutually exclusive — an HCP belongs to exactly one cohort at a time.
            </p>
          </section>

          <SectionDivider />

          <section id="fm-scoring-established">
            <h3 style={headingStyle}>Established</h3>
            <p style={subStyle}>Field-shaping senior figures</p>
            <p style={bodyText}>
              An HCP qualifies as Established by meeting any one of four paths:
            </p>
            <p style={{ ...bodyText, marginTop: 12, fontWeight: 600, color: "#B8B4AC" }}>PATH 1 — Output + Career</p>
            <p style={bodyText}>
              50+ first or last author publications AND 10+ years since NPI enumeration. Demonstrates sustained leadership over
              a career.
            </p>
            <p style={{ ...bodyText, marginTop: 12, fontWeight: 600, color: "#B8B4AC" }}>PATH 2 — High Volume</p>
            <p style={bodyText}>
              500+ career publications AND 5+ years since NPI enumeration. The publication record itself signals established
              voice.
            </p>
            <p style={{ ...bodyText, marginTop: 12, fontWeight: 600, color: "#B8B4AC" }}>PATH 3 — Recognized Advisor</p>
            <p style={bodyText}>
              Engaged with 10+ pharma companies AND $100K+ in consulting/honoraria over the past 3 years, with corroborating
              signal from publications or career length.
            </p>
            <p style={{ ...bodyText, marginTop: 12, fontWeight: 600, color: "#B8B4AC" }}>PATH 4 — Sustained Output</p>
            <p style={bodyText}>
              800+ career publications. At this volume, the publication record itself is sufficient — career stage doesn&apos;t
              need separate verification.
            </p>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Established HCPs are not ranked within the cohort by composite score in v1.0. They&apos;re surfaced by virtue of
              qualification.
            </p>
          </section>

          <SectionDivider />

          <section id="fm-scoring-rising_stars">
            <h3 style={headingStyle}>Rising Stars</h3>
            <p style={subStyle}>Emerging voices building momentum</p>
            <p style={bodyText}>
              Rising Stars are identified by a composite scoring pipeline that evaluates publication velocity, citation
              trajectory, clinical trial activity, conference presence, and MSL signals. HCPs in the top tier of this composite
              are classified Rising Stars.
            </p>
            <p style={{ ...bodyText, marginTop: 12, fontWeight: 600, color: "#B8B4AC" }}>DARK HORSE subset:</p>
            <p style={bodyText}>
              Rising Stars in the top 5% of composite score, with positive publication velocity OR trial investigator signal.
              These are the elite emerging voices most likely to break through to Established status.
            </p>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Note: Some scoring components (citation trajectory, congress presence, MSL signal) are sparsely populated in
              v1.0 — Dark Horse identification relies primarily on publication velocity and trial activity. Coverage will improve
              in v1.1.
            </p>
          </section>

          <SectionDivider />

          <section id="fm-scoring-community">
            <h3 style={headingStyle}>Community</h3>
            <p style={subStyle}>Practicing clinicians active in pharma engagement</p>
            <p style={bodyText}>
              Community HCPs are practicing clinicians with NPI registration and demonstrated clinical activity (Open Payments
              engagement OR Medicare patient volume). They are ranked within the cohort by a composite score (0–100):
            </p>
            <div style={monoBlock}>
              <div>40% — Medicare patient volume (3-year unique beneficiaries)</div>
              <div style={{ marginTop: 6 }}>30% — Pharma engagement (Open Payments dollars)</div>
              <div style={{ marginTop: 6 }}>15% — Group practice signal (practice setting)</div>
              <div style={{ marginTop: 6 }}>10% — Career stage (years since NPI enumeration)</div>
              <div style={{ marginTop: 6 }}>5% — Publication signal (publication activity)</div>
            </div>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Patient volume is weighted highest because it is the most direct measure of community clinical reach. Pharma
              engagement is itself a signal of clinical relevance at the community level. Practice setting, career stage, and
              publication activity provide practice-level grounding.
            </p>
            <p style={{ ...bodyText, marginTop: 12, fontWeight: 600, color: "#B8B4AC" }}>WORKHORSE subset:</p>
            <p style={bodyText}>
              Community HCPs in the top quartile of Medicare patient volume but the bottom quartile of pharma engagement. These
              are high-volume practitioners pharma hasn&apos;t engaged — untapped clinical influence.
            </p>
          </section>

          <SectionDivider />

          <section id="fm-scoring-workhorse">
            <h3 style={headingStyle}>Workhorse</h3>
            <p style={subStyle}>Underleveraged high-volume practitioners</p>
            <p style={bodyText}>
              Workhorses use a different composite because their defining trait — low pharma engagement — would penalize them
              under the Community formula. Workhorse score (0–100):
            </p>
            <div style={monoBlock}>
              <div>60% — Medicare patient volume</div>
              <div style={{ marginTop: 6 }}>40% — Career stage</div>
            </div>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Higher score indicates a more established practitioner with substantial patient volume. The cohort surfaces HCPs
              whose practice impact is invisible to pharma engagement metrics.
            </p>
          </section>

          <SectionDivider />

          <section id="fm-scoring-data_sources">
            <h3 style={headingStyle}>Data Sources</h3>
            <p style={bodyText}>FieldMark draws from:</p>
            <ul style={{ ...bodyText, paddingLeft: 20, marginTop: 8 }}>
              <li style={{ marginBottom: 6 }}>Open Payments (CMS Sunshine Act) — pharma payments and engagement</li>
              <li style={{ marginBottom: 6 }}>Medicare Provider Utilization &amp; Payment Data — patient volume and practice patterns</li>
              <li style={{ marginBottom: 6 }}>NPPES (National Plan and Provider Enumeration System) — provider credentials and practice locations</li>
              <li style={{ marginBottom: 6 }}>PubMed / OpenAlex — publications, author attribution, citation data</li>
              <li style={{ marginBottom: 6 }}>ClinicalTrials.gov — trial investigator activity</li>
            </ul>
            <p style={{ ...bodyText, marginTop: 16, fontWeight: 600, color: "#B8B4AC" }}>LIMITATIONS:</p>
            <ul style={{ ...bodyText, paddingLeft: 20, marginTop: 8 }}>
              <li style={{ marginBottom: 6 }}>HCPs without sufficient data signal are not surfaced (not classified into any cohort)</li>
              <li style={{ marginBottom: 6 }}>Some scoring components in Rising Stars are sparsely populated in v1.0</li>
              <li style={{ marginBottom: 6 }}>International researchers may be misclassified due to address parsing</li>
              <li style={{ marginBottom: 6 }}>Industry-affiliated HCPs are excluded from cohort classification when identifiable</li>
            </ul>
          </section>

          <SectionDivider />

          <section id="fm-scoring-refinement">
            <h3 style={headingStyle}>Help us improve</h3>
            <p style={bodyText}>
              No methodology is perfect. If you disagree with a classification, flag it on any HCP card. We use MSL community
              signal to refine the methodology over time.
            </p>
            <p style={{ ...bodyText, marginTop: 12 }}>
              Cohort classifications will evolve as data accumulates and feedback patterns emerge.
            </p>
          </section>

          <SectionDivider />

          <section id="fm-scoring-faq">
            <h3 style={headingStyle}>Frequently Asked Questions</h3>
            <div style={{ marginTop: 16 }}>
              {FAQ_ITEMS.map((item, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: i < FAQ_ITEMS.length - 1 ? 18 : 0,
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#E8E6DF",
                      lineHeight: 1.45,
                    }}
                  >
                    {item.q}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "#9B9892",
                      lineHeight: 1.6,
                    }}
                  >
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
