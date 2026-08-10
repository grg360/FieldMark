// Institutional Environment — four displayed signals (frame: Institutional
// Environment.dc.html, project 805df654, built 2026-08-10). Register: the
// institution surface's own tokens (C twins), FONT.mono/serif, C.amber gold —
// the frame's green-tinted palette is NOT imported. Tile order is the ruled
// priority: TRIAL DENSITY (anchor) → KOL CONCENTRATION → GUIDELINE-AUTHOR
// DENSITY → FEDERAL RESEARCH FOOTPRINT (texture). None of the four feeds any
// ordering; the panel renders only inside one institution's page.
//
// Captions are VERBATIM from the frame — locked for honesty, never
// paraphrased here: the trials caption reuses the ledger badge's gate
// language, the guideline caption reuses the Methodology page's proxy
// language, and the funding caption + zero-capture state carry the
// not-comparable / absence-of-matches wording exactly.
//
// ZERO-CAPTURE (the honesty-critical path, per Design's state study): when no
// matched funded investigators exist, the funding tile renders the absence
// prose ONLY — count and composition lines suppressed entirely. Never "$0",
// never "0 of N", never an empty tile. Same tile, same caption, same position.
import { useEffect, useState } from "react";
import { useMediaQuery } from "../lib/useMediaQuery";
import { FONT, GOLD } from "../lib/designTokens";
import { getInstitutionEnvironment, type InstitutionEnvironment } from "../lib/institutionEnvironment";

// Twins of InstitutionRoute's C tokens (sibling panels each carry their own).
const C = {
  bg: "#0a0a0b",
  bandBg: "#0e0e11",
  hairStrong: "#1e1e21",
  ink1: "#e6e3dc",
  ink3: "#8b887f",
  ink4: "#6a6862",
  ink5: "#575651",
  amber: GOLD.bright,
};

const mono = (size: number, opts?: { ls?: string; color?: string; weight?: number; lh?: number }) => ({
  fontFamily: FONT.mono,
  fontSize: size,
  fontWeight: opts?.weight ?? 400,
  letterSpacing: opts?.ls ?? "0.1em",
  color: opts?.color ?? C.ink3,
  lineHeight: opts?.lh ?? 1,
});

const caption = {
  ...mono(9, { ls: "0.09em", color: C.ink4, lh: 1.75 }),
  textTransform: "uppercase" as const,
};

function BigStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: FONT.serif, fontSize: 52, lineHeight: 0.9, fontWeight: 400, color: C.ink1, letterSpacing: "-0.01em" }}>{value}</div>
      <div style={{ marginTop: 9, ...mono(9, { ls: "0.16em", color: C.ink3 }), textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

const vRule = { width: 1, alignSelf: "stretch" as const, background: C.hairStrong, margin: "0 2px" };

function TileHead({ title, tag, tagColor }: { title: string; tag: string; tagColor: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
      <div style={{ ...mono(10, { ls: "0.18em", color: C.ink1, weight: 500 }), textTransform: "uppercase" }}>{title}</div>
      <div style={{ ...mono(8, { ls: "0.18em", color: tagColor }), textTransform: "uppercase" }}>{tag}</div>
    </div>
  );
}

function Unavailable() {
  // a failed read says so — it never renders as a zero
  return <div style={{ ...mono(10, { ls: "0.13em", color: C.ink4 }), textTransform: "uppercase" }}>Signal unavailable — read failed.</div>;
}

export default function InstitutionEnvironmentPanel({
  referenceInstitutionId,
  taId,
  kol,
}: {
  referenceInstitutionId: string;
  taId: string;
  kol: { established: number; rising: number; bestUsRank: number | null; bandLabel: string };
}) {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint - 2026-08-10 mobile stack pass
  const [env, setEnv] = useState<InstitutionEnvironment | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setEnv(undefined);
    void getInstitutionEnvironment(referenceInstitutionId, taId).then((e) => { if (alive) setEnv(e); });
    return () => { alive = false; };
  }, [referenceInstitutionId, taId]);

  const zeroCapture = env != null && env.funding != null && env.funding.fundedInvestigators === 0;

  return (
    <div>
      {/* group header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "6px 24px", paddingBottom: 10, borderBottom: `1px solid ${C.hairStrong}` }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10, textTransform: "uppercase" }}>
          <span style={mono(10, { ls: "0.14em", color: C.ink5 })}>|</span>
          <span style={mono(10, { ls: "0.14em", color: C.ink1, weight: 500 })}>Institutional Environment</span>
          <span style={mono(10, { color: C.ink5 })}>·</span>
          <span style={mono(10, { ls: "0.14em", color: C.ink3 })}>Four signals</span>
          <span style={mono(10, { color: C.ink5 })}>·</span>
          <span style={mono(10, { ls: "0.14em", color: C.ink3 })}>None ranks this institution</span>
        </div>
        <span style={{ ...mono(9, { ls: "0.16em", color: C.ink5 }), textTransform: "uppercase", whiteSpace: "nowrap" }}>Displayed, not ranked</span>
      </div>

      <div style={{ border: `1px solid ${C.hairStrong}`, borderTop: "none", background: C.bandBg }}>
        {/* row 1 — anchor + primary */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
          {/* TRIAL DENSITY — the anchor */}
          <div style={{ padding: "26px 28px 22px", borderRight: `1px solid ${C.hairStrong}`, borderBottom: `1px solid ${C.hairStrong}`, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: C.amber, opacity: 0.85 }} />
            <TileHead title="Trial Density" tag="Anchor" tagColor={C.amber} />
            {env === undefined ? (
              <div style={{ ...mono(9.5, { ls: "0.12em", color: C.ink4 }), textTransform: "uppercase" }}>Reading linked investigators…</div>
            ) : env === null || env.trials == null ? (
              <Unavailable />
            ) : env.trials.openTrialInvestigators === 0 ? (
              <div style={{ fontFamily: FONT.serif, fontSize: 19, lineHeight: 1.5, color: C.ink3, maxWidth: "44ch" }}>
                No open-trial investigators on record among linked HCPs.
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
                <BigStat value={env.trials.openTrialInvestigators} label="Open-trial investigators" />
                <div style={vRule} />
                <BigStat value={env.trials.openTrials} label="Open trials" />
              </div>
            )}
            <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${C.hairStrong}`, ...caption, maxWidth: "56ch" }}>
              Open-status trials only — the same gate as the ledger's open trial badge. The registry labels every site lead PI.
            </div>
          </div>

          {/* KOL CONCENTRATION — from the route's own roster, no new read */}
          <div style={{ padding: "26px 28px 22px", borderBottom: `1px solid ${C.hairStrong}`, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: C.amber, opacity: 0.85 }} />
            <TileHead title="KOL Concentration" tag="Primary" tagColor={C.amber} />
            <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
              <BigStat value={kol.established} label="Established" />
              <div style={vRule} />
              <BigStat value={kol.rising} label="Rising" />
              <div style={vRule} />
              <div style={{ paddingBottom: 2 }}>
                <div style={{ ...mono(9, { ls: "0.16em", color: C.ink3 }), textTransform: "uppercase", marginBottom: 7 }}>Best US rank</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                  <span style={{ fontFamily: FONT.serif, fontSize: 26, lineHeight: 1, color: C.ink1 }}>
                    {kol.bestUsRank != null ? `#${kol.bestUsRank} US` : "—"}
                  </span>
                  <span style={{ ...mono(9, { ls: "0.14em", color: C.amber }), textTransform: "uppercase", border: `1px solid ${C.hairStrong}`, padding: "3px 6px" }}>
                    {kol.bandLabel}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${C.hairStrong}`, ...caption, maxWidth: "58ch" }}>
              Ranked members via primary link only · cohort ranks are each on their own scale and are not compared.
            </div>
          </div>
        </div>

        {/* row 2 — GUIDELINE-AUTHOR DENSITY (supporting) */}
        <div style={{ padding: "24px 28px 22px", borderBottom: `1px solid ${C.hairStrong}`, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1.05fr)", gap: isMobile ? 14 : 34, alignItems: "start", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: C.ink5 }} />
          <div>
            <TileHead title="Guideline-Author Density" tag="Supporting" tagColor={C.ink5} />
            {env === undefined ? (
              <div style={{ ...mono(9.5, { ls: "0.12em", color: C.ink4 }), textTransform: "uppercase" }}>Reading the labeled corpus…</div>
            ) : env === null || env.guidelines == null ? (
              <Unavailable />
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
                  <span style={{ fontFamily: FONT.serif, fontSize: 38, lineHeight: 0.95, color: C.ink1 }}>{env.guidelines.authors}</span>
                  <span style={{ ...mono(9, { ls: "0.15em", color: C.ink3, lh: 1.4 }), textTransform: "uppercase", maxWidth: "11ch", display: "inline-block" }}>Guideline-proxy authors</span>
                </div>
                <div style={{ width: 1, height: 30, background: C.hairStrong }} />
                <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
                  <span style={{ fontFamily: FONT.serif, fontSize: 38, lineHeight: 0.95, color: C.ink1 }}>{env.guidelines.pubs}</span>
                  <span style={{ ...mono(9, { ls: "0.15em", color: C.ink3, lh: 1.4 }), textTransform: "uppercase", maxWidth: "13ch", display: "inline-block" }}>Guideline-linked publications</span>
                </div>
              </div>
            )}
          </div>
          <div style={{ ...caption, paddingTop: 4, lineHeight: 1.8 }}>
            Guideline linkage is a title-match proxy, not a curated guideline registry — it measures guideline-adjacent publishing, not verified guideline-committee membership.
          </div>
        </div>

        {/* row 3 — FEDERAL RESEARCH FOOTPRINT (texture; NO dollar figure) */}
        <div style={{ padding: "18px 28px 18px", background: C.bg }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 14 }}>
            <div style={{ ...mono(9, { ls: "0.2em", color: C.ink3 }), textTransform: "uppercase" }}>Federal Research Footprint</div>
            <div style={{ ...mono(8, { ls: "0.16em", color: C.ink5 }), textTransform: "uppercase" }}>Displayed, not ranked · no institutional total</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1.05fr)", gap: isMobile ? 14 : 34, alignItems: "start" }}>
            <div>
              {env === undefined ? (
                <div style={{ ...mono(9.5, { ls: "0.12em", color: C.ink4 }), textTransform: "uppercase" }}>Reading the grant record…</div>
              ) : env === null || env.funding == null ? (
                <Unavailable />
              ) : zeroCapture ? (
                // ZERO-CAPTURE — absence prose only; count + composition
                // suppressed entirely. Never "$0", never "0 of N".
                <>
                  <div style={{ ...mono(10, { ls: "0.13em", color: C.ink3 }), textTransform: "uppercase" }}>
                    No matched affiliated investigators with recorded funding.
                  </div>
                  <div style={{ marginTop: 11, paddingLeft: 12, borderLeft: `1px solid ${C.hairStrong}`, fontFamily: FONT.serif, fontSize: 16, fontStyle: "italic", lineHeight: 1.55, color: C.ink3, maxWidth: "60ch" }}>
                    An absence of matches, not an absence of funding — this institution's NIH footprint is simply not captured through our tracked investigators.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.5, color: C.ink3 }}>
                    <span style={{ color: C.ink1 }}>{env.funding.fundedInvestigators}</span> of <span style={{ color: C.ink1 }}>{env.trackedInvestigators}</span> tracked investigators hold active NIH funding{" "}
                    <span style={{ ...mono(8.5, { ls: "0.12em", color: C.ink4 }), textTransform: "uppercase", whiteSpace: "nowrap" }}>(by recorded project dates)</span>
                  </div>
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", ...mono(9.5, { ls: "0.13em", color: C.ink3 }), textTransform: "uppercase" }}>
                    <span><span style={{ color: C.amber }}>{env.funding.nciSupported}</span> NCI-supported</span>
                    <span style={{ color: C.ink5 }}>|</span>
                    <span><span style={{ color: C.amber }}>{env.funding.r01Equivalent}</span> R01-equivalent</span>
                    <span style={{ color: C.ink5 }}>|</span>
                    <span><span style={{ color: C.amber }}>{env.funding.earlyCareer}</span> Early-career/transition</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ ...caption, fontSize: 8.5, lineHeight: 1.85 }}>
              Funding held by tracked affiliated investigators — typically ~10% of the institution's total NIH footprint, not institutional funding. Not comparable across institutions.
            </div>
          </div>
        </div>
      </div>

      {/* panel footer — the no-ranking guarantee, stated on the surface */}
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 20, ...mono(8.5, { ls: "0.16em", color: C.ink5 }), textTransform: "uppercase" }}>
        <span>Nothing above feeds the institution index · bands + member counts remain the only ranking</span>
        <span>Renders only within this institution</span>
      </div>
    </div>
  );
}
