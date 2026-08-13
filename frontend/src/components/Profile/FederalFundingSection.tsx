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
import { CANON, FACE } from "../../lib/canonicalTokens";
import { getHcpGrantFacts, type HcpGrantFacts } from "../../lib/nihGrants";

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px ${FACE.data}` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px ${FACE.value}` } as const);
const INK_HEAD = CANON.INK.MUTE; // section-head grey, the brief's ink6 twin
const INK_BRIGHT = CANON.INK.PRIME;
const INK_MID = CANON.INK.LABEL;
const INK_DIM = CANON.INK.LABEL;
const LINE = "rgba(255,255,255,.06)";
const LINE_RULE = "rgba(255,255,255,.14)"; // sparse-state left rule (the brief's lineStrong)

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
    // height 100% + the footer's marginTop:auto pin the provenance to the
    // bottom of the pair column (frame: margin:auto 0 0), matching the
    // collaborators column's depth when this section is the shorter one.
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: INK_HEAD }}>
        FEDERAL FUNDING · NIH REPORTER · DISPLAYED, NOT RANKED
      </span>

      {facts === undefined ? (
        <span style={{ ...mono(9), letterSpacing: ".1em", color: INK_DIM }}>READING THE GRANT RECORD…</span>
      ) : facts === null ? (
        // read failed — say nothing rather than assert a false absence
        <span style={{ ...mono(9), letterSpacing: ".1em", color: INK_DIM }}>GRANT RECORD UNAVAILABLE</span>
      ) : facts.total === 0 ? (
        // NEUTRAL absence (2026-08-10 ruling): grant data under-represents
        // clinical trialists and guideline authors — their influence is
        // industry-trial and guideline work, invisible to RePORTER. Absence
        // must never read as a gap or a lower signal.
        <span style={{ ...serif(13), color: CANON.INK.LABEL, lineHeight: 1.5 }}>
          No matched federal funding. Expected for many clinical leaders - industry-trial leadership and guideline work are funded outside NIH grants and do not appear in RePORTER. An absence here carries no signal about influence.
        </span>
      ) : (
        <>
          {/* Two-state layout (The Record v2 frame, approved 2026-08-10). The
              state derives from the HCP's DATA — the frame's SPARSE/RICH pill
              was a demo control and does not ship. Rich (active independent
              awards as contact PI > 0): promoted numerals for real figures.
              Sparse (0 active): one quiet line — no giant zero. The frame's
              warm demo palette is re-inked to the app's COOL register. */}
          {facts.activeIndependentAsContactPi > 0 ? (
            <>
              {/* RICH — lead cells (label over numeral, THE RECORD's stat
                  idiom). The active qualifier is never dropped (ruling 1);
                  NCI apart, never folded into a total (ruling 3). Annual
                  dollars kept from the four-altitude build — the frame's
                  demo data simply had none. */}
              <div style={{ display: "flex", gap: 44, flexWrap: "wrap", paddingTop: 2 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 230 }}>
                  <span style={{ ...mono(9), letterSpacing: ".1em", color: INK_MID, lineHeight: 1.5 }}>
                    ACTIVE INDEPENDENT NIH AWARDS AS CONTACT PI (BY RECORDED PROJECT DATES)
                  </span>
                  <span style={{ ...mono(20, 500), color: INK_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{facts.activeIndependentAsContactPi}</span>
                </div>
                {facts.activeAnnualCost > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 230 }}>
                    <span style={{ ...mono(9), letterSpacing: ".1em", color: INK_MID, lineHeight: 1.5 }}>
                      LATEST FISCAL-YEAR COSTS ACROSS ACTIVE GRANTS · ANNUAL FIGURE, NOT A CAREER TOTAL
                    </span>
                    <span style={{ ...mono(20, 500), color: INK_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{money(facts.activeAnnualCost)}</span>
                  </div>
                ) : null}
                {(() => {
                  const nci = facts.institutes.find((i) => i.code === "NCI");
                  if (!nci) return null;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ ...mono(9), letterSpacing: ".1em", color: INK_MID, lineHeight: 1.5 }}>NCI · MATCHED</span>
                      <span style={{ ...mono(20, 500), color: INK_BRIGHT, fontVariantNumeric: "tabular-nums" }}>{nci.total}</span>
                    </div>
                  );
                })()}
              </div>

              {/* supporting facts — two lines, one visual step down */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", ...mono(9), letterSpacing: ".1em" }}>
                  {facts.firstIndependentFy != null ? (
                    <span style={{ color: INK_MID }}>FIRST INDEPENDENT AWARD FY{facts.firstIndependentFy}</span>
                  ) : null}
                  <span style={{ color: INK_DIM }}>
                    {facts.activeByDates} ACTIVE OF {facts.total} MATCHED SINCE FY2012
                    {facts.latestFy != null ? ` · MOST RECENT AWARD FY${facts.latestFy}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", ...mono(9) }}>
                  <span style={{ color: INK_MID, letterSpacing: ".06em" }}>
                    {facts.mechanisms.map((m) => `${m.family} ×${m.count}`).join(" · ")}
                  </span>
                  {/* role labels are exact (2026-08-10 blocker resolution): the
                      match table holds ONLY RePORTER's PI list — contact PI +
                      genuine MPIs; co-investigators never enter it. */}
                  <span style={{ color: INK_DIM, letterSpacing: ".08em" }}>
                    CONTACT PI ON {facts.contactPiCount}{facts.mpiCount > 0 ? ` · MPI ON ${facts.mpiCount}` : ""}
                  </span>
                </div>
                {facts.institutes.some((i) => i.code !== "NCI") ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", ...mono(11) }}>
                    {facts.institutes.filter((i) => i.code !== "NCI").map((i) => (
                      <span key={i.code} style={{ color: INK_DIM, letterSpacing: ".06em" }}>
                        {i.code} {i.active > 0 ? `${i.active} ACTIVE / ` : ""}{i.total}
                      </span>
                    ))}
                  </div>
                ) : null}
                {/* K→R01 — high-confidence only; the ambiguous case renders nothing */}
                {facts.kToR01 ? (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ ...mono(9), color: INK_BRIGHT }}>▸</span>
                    <span style={{ ...mono(9), letterSpacing: ".08em", color: INK_MID }}>
                      K → R01 TRANSITION · K AWARD (FY{facts.kToR01.kFirstFy}) PRECEDED FIRST R01-CLASS AWARD (FY{facts.kToR01.rFirstFy}) · SAME NIH PROFILE, PI ON BOTH
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            /* SPARSE — matched history but nothing currently active as an
               independent contact-PI award: one quiet left-ruled line and a
               dim fact row. Never a promoted zero. Phrasing per the approved
               frame; the parenthetical stays honest when other award types
               (e.g. a K) are still active by dates. */
            <div style={{ display: "flex", flexDirection: "column", gap: 9, borderLeft: `1px solid ${LINE_RULE}`, paddingLeft: 14, maxWidth: 560 }}>
              {/* Prose rule 2026-08-12: the section's absence statement → FACE.value,
                  matching its sibling zero-state ("No matched federal funding…") */}
              <span style={{ ...serif(13), color: CANON.INK.BODY, lineHeight: 1.6 }}>
                No active independent NIH awards ({facts.total} matched, {facts.activeByDates === 0 ? "none currently active" : `${facts.activeByDates} active by dates, none independent as contact PI`})
                {facts.latestFy != null ? ` · most recent FY${facts.latestFy}` : ""}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", ...mono(9), letterSpacing: ".06em", color: INK_DIM }}>
                {facts.firstIndependentFy != null ? <span>FIRST INDEPENDENT AWARD FY{facts.firstIndependentFy}</span> : null}
                {facts.mechanisms.length ? <span>{facts.mechanisms.map((m) => `${m.family} ×${m.count}`).join(" · ")}</span> : null}
                <span>CONTACT PI ON {facts.contactPiCount}{facts.mpiCount > 0 ? ` · MPI ON ${facts.mpiCount}` : ""}</span>
                {(() => {
                  const nci = facts.institutes.find((i) => i.code === "NCI");
                  return nci ? <span>NCI · MATCHED {nci.total}</span> : null;
                })()}
              </div>
            </div>
          )}

          {/* PROVENANCE — fine print, sentence-cased, smallest and dimmest */}
          <div style={{ ...mono(9), letterSpacing: ".04em", color: INK_HEAD, lineHeight: 1.7, borderTop: `1px solid ${LINE}`, paddingTop: 6, maxWidth: 560, marginTop: "auto" }}>
            Matched by investigator name and institution against NIH RePORTER's PI list (contact PI + MPIs — co-investigators are not in this record) · FY2012–2026, curated activity codes · independent = non-K mechanism · project dates are administrative records
          </div>
        </>
      )}
    </div>
  );
}
