// FEDERAL FUNDING — HCP grant-facts display (Phase 1, 2026-08-10). DISPLAY
// ONLY, never a scoring input — the pharma "displayed, not ranked" discipline,
// stated in the header. Register: the brief/ledger idiom (mono chrome, serif
// prose, no new hue; NCI counts brighten, they don't color).
//
// The three rulings this component carries (Garrett, 2026-08-10):
//  1. "Active" is always qualified: ACTIVE (BY RECORDED PROJECT DATES) —
//     RePORTER end dates are administrative records, not ground truth.
//  2. K->R01 renders ONLY when lib/nihGrants' high-confidence bar passes
//     (all K + R01-class PI matches on RePORTER's own person key, clean
//     chronology). Ambiguity renders NOTHING — never a maybe.
//  3. NCI is surfaced apart from other institutes, never buried in a total —
//     an NIGMS R01 is funding, not oncology relevance.
// Absence state is verbatim and non-negotiable: "No matched federal funding."
import { useEffect, useState } from "react";
import { FONT, COOL } from "../../lib/designTokens";
import { getHcpGrantFacts, type HcpGrantFacts } from "../../lib/nihGrants";

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px ${FONT.mono}` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px ${FONT.serif}` } as const);
const INK_HEAD = "#63696E"; // section-head grey, the brief's ink6 twin
const INK_BRIGHT = COOL.ui;
const INK_MID = COOL.muted;
const INK_DIM = "#7C8288";
const LINE = "rgba(255,255,255,.06)";

function money(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

export default function FederalFundingSection({ hcpId }: { hcpId: string }) {
  const [facts, setFacts] = useState<HcpGrantFacts | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setFacts(undefined);
    void getHcpGrantFacts(hcpId).then((f) => { if (alive) setFacts(f); });
    return () => { alive = false; };
  }, [hcpId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: INK_HEAD }}>
        FEDERAL FUNDING · NIH REPORTER · DISPLAYED, NOT RANKED
      </span>

      {facts === undefined ? (
        <span style={{ ...mono(9.5), letterSpacing: ".1em", color: INK_DIM }}>READING THE GRANT RECORD…</span>
      ) : facts === null ? (
        // read failed — say nothing rather than assert a false absence
        <span style={{ ...mono(9.5), letterSpacing: ".1em", color: INK_DIM }}>GRANT RECORD UNAVAILABLE</span>
      ) : facts.total === 0 ? (
        // NEUTRAL absence (2026-08-10 ruling): grant data under-represents
        // clinical trialists and guideline authors — their influence is
        // industry-trial and guideline work, invisible to RePORTER. Absence
        // must never read as a gap or a lower signal.
        <span style={{ ...serif(13), color: "#8F959A", lineHeight: 1.5 }}>
          No matched federal funding. Expected for many clinical leaders - industry-trial leadership and guideline work are funded outside NIH grants and do not appear in RePORTER. An absence here carries no signal about influence.
        </span>
      ) : (
        <>
          {/* headline (2026-08-10 recency ruling): active INDEPENDENT funding
              as CONTACT PI leads; the active qualifier is never dropped */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...mono(13, 600), color: INK_BRIGHT }}>{facts.activeIndependentAsContactPi}</span>
            <span style={{ ...mono(9), letterSpacing: ".1em", color: INK_MID }}>
              ACTIVE INDEPENDENT NIH AWARDS AS CONTACT PI (BY RECORDED PROJECT DATES)
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", ...mono(9), letterSpacing: ".1em" }}>
            {facts.firstIndependentFy != null ? (
              <span style={{ color: INK_MID }}>FIRST INDEPENDENT AWARD FY{facts.firstIndependentFy}</span>
            ) : null}
            <span style={{ color: INK_DIM }}>
              {facts.activeByDates} ACTIVE OF {facts.total} MATCHED SINCE FY2012
              {facts.latestFy != null ? ` · MOST RECENT AWARD FY${facts.latestFy}` : ""}
            </span>
          </div>

          {/* institutes — NCI first and apart, never folded into a total */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", ...mono(10) }}>
            {facts.institutes.map((i) => (
              <span key={i.code} style={{ color: i.code === "NCI" ? INK_BRIGHT : INK_DIM, letterSpacing: ".06em" }}>
                {i.code} {i.active > 0 ? `${i.active} ACTIVE / ` : ""}{i.total}
              </span>
            ))}
          </div>

          {/* mechanisms + role */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", ...mono(9.5) }}>
            <span style={{ color: INK_MID, letterSpacing: ".06em" }}>
              {facts.mechanisms.map((m) => `${m.family} ×${m.count}`).join(" · ")}
            </span>
            {/* role labels are exact (2026-08-10 blocker resolution): the match
                table holds ONLY RePORTER's PI list — contact PI + genuine MPIs;
                co-investigators never enter it. "MPI", never "co-PI". */}
            <span style={{ color: INK_DIM, letterSpacing: ".08em" }}>
              CONTACT PI ON {facts.contactPiCount}{facts.mpiCount > 0 ? ` · MPI ON ${facts.mpiCount}` : ""}
            </span>
          </div>

          {/* dollars — annual figure only, labeled as such */}
          {facts.activeAnnualCost > 0 ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...mono(12, 500), color: COOL.prose }}>{money(facts.activeAnnualCost)}</span>
              <span style={{ ...mono(8.5), letterSpacing: ".1em", color: INK_DIM }}>
                LATEST FISCAL-YEAR COSTS ACROSS ACTIVE GRANTS · ANNUAL FIGURE, NOT A CAREER TOTAL
              </span>
            </div>
          ) : null}

          {/* K->R01 — high-confidence only; the ambiguous case renders nothing */}
          {facts.kToR01 ? (
            <div style={{ ...mono(9), letterSpacing: ".08em", color: INK_MID, paddingTop: 2 }}>
              K → R01 TRANSITION · K AWARD (FY{facts.kToR01.kFirstFy}) PRECEDED FIRST R01-CLASS AWARD (FY{facts.kToR01.rFirstFy}) · SAME NIH PROFILE, PI ON BOTH
            </div>
          ) : null}

          <div style={{ ...mono(8.5), letterSpacing: ".08em", color: INK_HEAD, lineHeight: 1.7, borderTop: `1px solid ${LINE}`, paddingTop: 6 }}>
            MATCHED BY INVESTIGATOR NAME AND INSTITUTION AGAINST NIH REPORTER'S PI LIST (CONTACT PI + MPIS — CO-INVESTIGATORS ARE NOT IN THIS RECORD) · FY2012–2026, CURATED ACTIVITY CODES · INDEPENDENT = NON-K MECHANISM · PROJECT DATES ARE ADMINISTRATIVE RECORDS
          </div>
        </>
      )}
    </div>
  );
}
