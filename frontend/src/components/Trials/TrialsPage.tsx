// Trials surface — /trials. Frame: docs/design/Trials Surface.dc.html.
//
// Live SET 1 (open NSCLC-lung trials naming >=1 ranked investigator) from
// get_nsclc_trials_surface() over the gated view trial_investigators_rendered_v1.
// Every figure is derived live (lib/trials.ts) — the header count is whatever the
// set is on the day. Territory uses the platform's established 5-region model
// (us-regions.ts), not the frame's 11-region sample. Bulk noInvs tier dropped.
// The frame's own palette/type are used verbatim (per the ledger build precedent),
// with the real NavBar from AppLayout replacing the frame's stale nav.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../AppLayout";
import HCPChip, { HCPChipRow, toChipCohort } from "../HCPChip";
import { taLabelForSlug } from "../../lib/taLabels";

// The trials RPC is TA-locked (get_nsclc_trials_surface). Slug is the pin.
const TRIALS_TA_SLUG = "nsclc";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { fetchTrials, buildSurface, type Trial, type Region, type TrialsSurface } from "../../lib/trials";
import { CANON, DEPTH, FACE } from "../../lib/canonicalTokens";

// Two Ramps consolidation 2026-08-05, completed same day: Trials is a SCANNING
// surface in the applied table, so the whole palette is cool — grounds, rules
// and every ink step. ink0, briefly WARM.prose (its extracted source), is
// COOL.ui here; the warm value now ships only on the asset monograph. The four
// sub-muted warm greys collapse into the ramp's chrome steps by nearest value:
// ink4 → faint and ink5 → floor carry live micro-text on non-text steps —
// flagged for Design with the same pattern on the rising footer and DIM2 on
// the Drugs index. link and the amber-tinted active-chip values (#4a3a1c) are
// semantics, not ramp members.
// CANONICAL MIGRATION 2026-08-13. Same P-object shape (and the same legacy
// sources) as CohortLedger, so it takes the same from→census map. No VIZ here:
// this surface has no charts — the phase and recruiting colours encode STATE in
// the interface, not categories in data, so they stay on semantic tokens.
// Composition: page ground comes from the shell; the board is the section
// PANEL; nothing floats, so no OVERHANG.
// WINDOW ROWS 2026-08-15 — reverses "rows are flat" above, matching the
// treatment settled on Institutions the same day. The flat list was held
// together by two hexes the canonical migration never reached: a 1px #16140f
// rule measuring 1.034:1 on its own ground (i.e. not a boundary at all) and a
// decorative 2px #4e3a16 left rail that encoded NOTHING — constant on every
// row, unconditioned by phase, status or recruiting. Both are gone. Separation
// is now FILL, not line: the row list sits in a well cut back to GROUND.BASE
// (the page-canvas value, so it reads as a hole in the board rather than a
// fifth plane) and each row is raised to GROUND.RAISE with DEPTH.RIM for the
// lit top edge. The step is 1.062:1 — invisible as a 1px border, a container
// across a block. The 14px gap is what lets BASE show between rows.
const P = {
  // rowWell/rowFill were board/well, which had no consumers. The well is BASE so
  // the rows sit ABOVE the region holding them; the row is RAISE, genuinely
  // lighter than what's behind it (1.062:1).
  rowWell: CANON.GROUND.BASE, panel: CANON.GROUND.RAISE, rowFill: CANON.GROUND.RAISE,
  line: CANON.LINE.HAIR, line2: CANON.LINE.HAIR, line3: CANON.LINE.EDGE,
  amber: CANON.GOLD.PRIME, amberHi: CANON.GOLD.RANK, amberDim: CANON.GOLD.EDGE, rosterLink: CANON.GOLD.PRIME,
  ink0: CANON.INK.PRIME, ink1: CANON.INK.BODY, ink2: CANON.INK.LABEL, ink3: CANON.INK.LABEL,
  // ink4/ink5/ink6 previously sat on COOL.faint/floor — below the text floor,
  // which the file's own header flagged as carrying live micro-text. Raised to
  // MUTE (rule 4): a step below GHOST never carries live text.
  ink4: CANON.INK.MUTE, ink5: CANON.INK.MUTE, ink6: CANON.INK.MUTE,
  link: CANON.ACTION.LINK, // was steel #a9bfc7 — one action colour, as on institutions
  // Active-chip amber tint: the hand-mixed #191309 well + #7a5a1f edge become
  // the canonical gold wash and rule-weight gold, same semantic.
  chipOn: CANON.GOLD.WASH, chipOnEdge: CANON.GOLD.EDGE,
};
const MONO = FACE.data;
const SERIF = FACE.value; // Newsreader — was the Source Serif fallback rendering live
const mono = (s: number, w = 400, ls = ".13em") => ({ fontFamily: MONO, fontSize: s, fontWeight: w, letterSpacing: ls });
const serif = (s: number, w = 400) => ({ fontFamily: SERIF, fontSize: s, fontWeight: w });

const CRAWL = "12 JUN 2026";
const REFRESH = "27 JUL 2026";

const DISCLOSURES: [string, string][] = [
  ["ROLE", "Named on the registry record as an investigator. ClinicalTrials.gov labels every site lead Principal Investigator, so we do not say who leads a study."],
  ["MATCHES", "Only investigator matches at or above the confidence threshold appear (the gated view). Matches below it are held for review. Read every list here as a floor, not a complete list."],
  ["TERRITORY", "Territory is the practice state of a matched investigator, not the trial's sites. Investigators with no resolved state appear in no region view."],
  ["REFRESH", `Registry status is refreshed weekly. Recruiting means recruiting as of the ${REFRESH} refresh, not as of now.`],
  ["DISCOVERY", `New trials arrive by manual crawl, not on the weekly cycle. The set is complete as of the ${CRAWL} crawl; status inside it is weekly-fresh.`],
  ["CHANGE", "The trials table is overwritten in place with no history. We can say a trial is recruiting today. We cannot say it changed, or that it is new."],
  ["SPONSOR", "Shown as recorded on the trial. Counts are of open trials in this set and are not a measure of a sponsor, a programme or an asset."],
  ["ORDER", "Ordering is by status, phase or start date only. Nothing here ranks trials against each other."],
];

type Order = "recruiting" | "phase" | "start";
const PHASE_RANK: Record<string, number> = { "PHASE 3": 0, "PHASE 2/3": 1, "PHASE 2": 2, "PHASE 1/2": 3, "PHASE 1": 4, "EARLY PHASE 1": 5, "N/A": 6 };

export default function TrialsPage() {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [all, setAll] = useState<Trial[]>([]);
  // Tracking now comes from the shared context rather than a local snapshot, so
  // a bookmark tapped on a trial row updates the roster strip in the same tick
  // and agrees with the ledger and the portfolio.
  const { isTracked, toggleSave } = useRelationships();
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [onlyRecruiting, setOnlyRecruiting] = useState(false);
  const [order, setOrder] = useState<Order>("recruiting");

  useEffect(() => {
    let alive = true;
    (async () => {
      const trials = await fetchTrials();
      if (alive) { setAll(trials); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const surface = useMemo(() => buildSurface(all, region), [all, region]);

  const listed = useMemo(() => {
    let t = surface.trials;
    if (onlyRecruiting) t = t.filter((x) => x.recruiting);
    const cmp: Record<Order, (a: Trial, b: Trial) => number> = {
      recruiting: (a, b) => Number(b.recruiting) - Number(a.recruiting) || (a.raw.start_date! < b.raw.start_date! ? 1 : -1),
      phase: (a, b) => (PHASE_RANK[a.phaseLabel] ?? 9) - (PHASE_RANK[b.phaseLabel] ?? 9),
      start: (a, b) => (b.raw.start_date ?? "").localeCompare(a.raw.start_date ?? ""),
    };
    return [...t].sort(cmp[order]);
  }, [surface.trials, onlyRecruiting, order]);

  // roster strip: tracked investigators named on the currently-scoped trials
  const rosterChips = useMemo(() => {
    // cohort + rank carried through so the roster strip can render the SAME
    // chip the trial rows do (identity is identical; only the context differs).
    const byHcp = new Map<string, { name: string; state: string | null; n: number; cohort: string; rank: number | null; rankScope: "US" | "GLOBAL" }>();
    for (const t of surface.trials) for (const iv of t.investigators) {
      if (!isTracked(iv.hcp_id)) continue;
      const e = byHcp.get(iv.hcp_id) ?? { name: iv.name ?? "Unknown", state: iv.state, n: 0, cohort: iv.cohort, rank: iv.rank, rankScope: iv.rankScope };
      e.n += 1; byHcp.set(iv.hcp_id, e);
    }
    return [...byHcp.entries()].map(([hcp_id, v]) => ({ hcp_id, ...v })).sort((a, b) => b.n - a.n);
  }, [surface.trials, isTracked]);

  const coverage = region
    ? `${surface.openCount} trials name an investigator whose practice state is in ${region}. Trials whose matched investigators have no resolved state are not counted here — read the count as a floor.`
    : `${surface.resolvedTrials} of the ${surface.openCount} open trials name at least one investigator whose practice state resolves to a US region. ${surface.unresolvedTrials} resolve to no state and appear in no region view — read every region count as a floor.`;

  if (isMobile) {
    return (
      <AppLayout width="wide">
        <MobileBoard surface={surface} listed={listed} rosterChips={rosterChips} isTracked={isTracked} toggleSave={toggleSave}
          region={region} setRegion={setRegion} coverage={coverage} navigate={navigate} loading={loading} />
      </AppLayout>
    );
  }

  return (
    <AppLayout width="wide">
      <div style={{ ...DEPTH.PANEL, border: `1px solid ${P.line}`, marginTop: 8 }}>
        {/* masthead */}
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px 40px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: "1 1 340px", minWidth: 0, maxWidth: 660 }}>
            <div style={{ ...mono(9, 400, ".18em"), color: P.ink6 }}>FIELDMARK / TRIALS</div>
            <div style={{ ...serif(25, 600), color: P.ink0, lineHeight: 1.05 }}>Trials</div>
            <div style={{ ...mono(9, 400, ".14em"), color: P.amberDim }}>OPEN LUNG TRIALS NAMING AT LEAST ONE RANKED {taLabelForSlug(TRIALS_TA_SLUG).toUpperCase()} INVESTIGATOR</div>
            <p style={{ ...serif(13), color: P.ink2, lineHeight: 1.65, margin: "6px 0 0" }}>
              Every open lung trial on ClinicalTrials.gov that names an investigator matched to the ranked cohort. Trials are the rows; territory, roster, sponsor and phase are lenses on the same set.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: "0 1 auto", minWidth: 250 }}>
            {[["open trials", surface.openCount], ["industry-sponsored", surface.industryCount], ["roster assets on trial", `${surface.rosterAssetsOnTrial} of ${surface.rosterAssetsTotal}`]].map(([k, v]) => (
              <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${P.line}` }}>
                <span style={{ ...mono(9), color: P.ink4 }}>{k}</span>
                <span style={{ ...mono(13, 600), color: P.ink0 }}>{loading ? "…" : v}</span>
              </div>
            ))}
            <div style={{ ...mono(9, 400, ".13em"), color: P.ink6, textAlign: "right", paddingTop: 8, lineHeight: 1.7 }}>SET AS OF CRAWL {CRAWL}<br />STATUS AS OF {REFRESH} REFRESH</div>
          </div>
        </div>

        {/* territory band */}
        <div style={{ margin: "22px 28px 0", border: `1px solid ${P.line3}`, background: P.panel }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <div style={{ padding: "13px 14px", borderRight: `1px solid ${P.line2}`, width: 104, flex: "none", ...mono(9, 400, ".18em"), color: P.amberDim }}>TERRITORY</div>
            <div style={{ flex: 1, padding: "9px 12px", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              {surface.territories.map((t) => {
                const active = t.key === "ALL US" ? region === null : t.key === region;
                return (
                  <span key={t.key} onClick={() => setRegion(t.key === "ALL US" ? null : (t.key as Region))}
                    style={{ cursor: "pointer", display: "inline-flex", gap: 8, alignItems: "baseline", padding: "4px 9px",
                      border: `1px solid ${active ? P.chipOnEdge : P.line2}`, background: active ? P.chipOn : "transparent" }}>
                    <span style={{ ...mono(9, active ? 600 : 400, ".12em"), color: active ? P.amberHi : P.ink2 }}>{t.key}</span>
                    <span style={{ ...mono(9), color: active ? P.amberDim : P.ink6 }}>{t.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ padding: "9px 14px 10px", borderTop: `1px solid ${P.line2}`, ...mono(9, 400, "0"), color: P.ink4, lineHeight: 1.75, maxWidth: 1000 }}>{coverage}</div>
        </div>

        {/* roster strip */}
        {rosterChips.length > 0 && (
          <div style={{ margin: "20px 28px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 9 }}>
              <span style={{ ...mono(9, 400, ".18em"), color: P.amberDim }}>ON YOUR ROSTER</span>
              <span style={{ flex: 1, height: 1, background: P.line }} />
              <span style={{ ...mono(9, 400, ".13em"), color: P.ink6 }}>{rosterChips.length} OF THE HCPs YOU TRACK NAMED ON {region ? "A TRIAL IN THIS REGION" : "AN OPEN TRIAL"}</span>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {/* Roster strip on the shared chip. The trial count and state are
                  CONTEXT, not identity, so they sit BESIDE the chip rather than
                  inside it — the chip reads the same here as on a trial row. */}
              {rosterChips.map((r) => (
                <span key={r.hcp_id} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
                  <HCPChip
                    hcpId={r.hcp_id}
                    name={r.name}
                    cohort={toChipCohort(r.cohort, r.rank)}
                    rank={r.rank}
                    tracked={isTracked(r.hcp_id)}
                    onToggleTracked={() => { void toggleSave(r.hcp_id, "trials_roster").catch(() => {}); }}
                  />
                  {r.rank != null && r.rankScope === "GLOBAL" ? (
                    <span style={{ ...mono(9, 400, ".04em"), color: P.ink6 }}>GLOBAL</span>
                  ) : null}
                  <span style={{ ...mono(9, 400, ".1em"), color: P.ink6 }}>{r.n} {r.n === 1 ? "TRIAL" : "TRIALS"}{r.state ? ` · ${r.state}` : ""}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* phase + status distributions */}
        <div style={{ margin: "16px 28px 0", border: `1px solid ${P.line}`, display: "flex", alignItems: "stretch" }}>
          <div style={{ padding: "11px 14px", borderRight: `1px solid ${P.line}`, width: 104, flex: "none", ...mono(9, 400, ".18em"), color: P.ink6 }}>PHASE</div>
          <div style={{ flex: 1, padding: "11px 14px", display: "flex", gap: 22, alignItems: "baseline", flexWrap: "wrap" }}>
            {surface.phaseDist.map((p) => (
              <span key={p.label} style={{ display: "inline-flex", gap: 7, alignItems: "baseline" }}>
                <span style={{ ...mono(9, 400, ".13em"), color: P.ink4 }}>{p.label}</span>
                <span style={{ ...mono(11, 600), color: P.ink0 }}>{p.n}</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ margin: "0 28px", border: `1px solid ${P.line}`, borderTop: "none", display: "flex", alignItems: "stretch" }}>
          <div style={{ padding: "11px 14px", borderRight: `1px solid ${P.line}`, width: 104, flex: "none", ...mono(9, 400, ".18em"), color: P.ink6 }}>STATUS</div>
          <div style={{ flex: 1, padding: "11px 14px", display: "flex", gap: 22, alignItems: "baseline", flexWrap: "wrap" }}>
            {surface.statusDist.map((s) => (
              <span key={s.label} style={{ display: "inline-flex", gap: 7, alignItems: "baseline" }}>
                <span style={{ color: P.amber, fontSize: 9, lineHeight: 1 }}>●</span>
                <span style={{ ...mono(11, 600), color: P.ink0 }}>{s.n}</span>
                <span style={{ ...mono(9, 400, ".13em"), color: P.ink4 }}>{s.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* controls */}
        <div style={{ margin: "20px 28px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...mono(9, 400, ".18em"), color: P.ink6 }}>SHOW</span>
          {[["ALL", false], ["RECRUITING", true]].map(([lbl, v]) => (
            <span key={String(lbl)} onClick={() => setOnlyRecruiting(v as boolean)} style={{ cursor: "pointer", ...mono(9, onlyRecruiting === v ? 600 : 400, ".13em"), color: onlyRecruiting === v ? P.ink0 : P.ink4, border: `1px solid ${onlyRecruiting === v ? P.chipOnEdge : P.line}`, padding: "4px 9px" }}>{lbl}</span>
          ))}
          <span style={{ width: 14 }} />
          <span style={{ ...mono(9, 400, ".18em"), color: P.ink6 }}>ORDER</span>
          {([["RECRUITING FIRST", "recruiting"], ["PHASE", "phase"], ["START DATE", "start"]] as [string, Order][]).map(([lbl, v]) => (
            <span key={v} onClick={() => setOrder(v)} style={{ cursor: "pointer", ...mono(9, order === v ? 600 : 400, ".13em"), color: order === v ? P.amberHi : P.ink4, border: `1px solid ${order === v ? P.chipOnEdge : P.line}`, padding: "4px 9px" }}>{lbl}</span>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ ...mono(9, 400, ".13em"), color: P.ink6 }}>{listed.length} SHOWN</span>
        </div>
        <div style={{ margin: "10px 28px 0", borderBottom: `1px solid ${P.line}` }} />

        {/* trial rows */}
        {loading ? (
          <div style={{ padding: "40px 28px", ...mono(11), color: P.ink4 }}>Loading trials…</div>
        ) : (
        // The well: margin 14 + padding 14 puts each row's EDGE at 28 — level
        // with every other block on the board — and its content at 42, exactly
        // where the old border-left rail put it. Nothing shifts but the ground.
        <div style={{ margin: "0 14px", padding: 14, display: "flex", flexDirection: "column", gap: 14, background: P.rowWell }}>
        {listed.map((t) => (
          <div key={t.raw.trial_id} style={{ background: P.rowFill, ...DEPTH.RIM, display: "grid", gridTemplateColumns: "112px 1fr 104px", gap: 16, padding: "14px 14px 15px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={{ border: `1px solid ${P.line3}`, padding: "3px 0", textAlign: "center", ...mono(9, 600, ".13em"), color: P.ink1 }}>{t.phaseLabel}</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ color: t.recruiting ? P.amber : P.line3, fontSize: 9, lineHeight: 1.4 }}>●</span>
                <span style={{ ...mono(9, 400, ".13em"), color: t.recruiting ? P.amberDim : P.ink5, lineHeight: 1.5 }}>{t.statusLabel}</span>
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
              <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...serif(15, 600), color: CANON.INK.PRIME, lineHeight: 1.3 }}>{t.title}</a>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...mono(11, 400, "0"), color: P.ink2 }}>{t.sponsor}</span>
                <span style={{ ...mono(9, 400, ".14em"), color: P.ink5, border: `1px solid ${P.line2}`, padding: "1px 5px" }}>{t.sponsorClassLabel}</span>
                <span style={{ ...mono(9, 400, "0"), color: P.ink5 }}>{t.dates}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, alignItems: "baseline", paddingTop: 2 }}>
                <span style={{ ...mono(9, 400, ".16em"), color: P.ink6 }}>INVESTIGATORS</span>
                {/* One chip per investigator (2026-08-13). The chip carries the
                    canonical trio — name · cohort · rank — and the tracked
                    bookmark; institution and practice state come OFF the row and
                    live on the profile, which is what lets a dense trial with
                    eight investigators stay scannable. The roster diamond is
                    retired: one amber glyph now means "tracked" here, on the
                    ledger, and on every HCP context. */}
                <HCPChipRow style={{ gap: 6 }}>
                  {t.investigators.map((iv) => {
                    const chip = (
                      <HCPChip
                        hcpId={iv.hcp_id}
                        name={iv.name ?? "Unknown"}
                        cohort={toChipCohort(iv.cohort, iv.rank)}
                        rank={iv.rank}
                        tracked={isTracked(iv.hcp_id)}
                        onToggleTracked={() => { void toggleSave(iv.hcp_id, "trials").catch(() => {}); }}
                      />
                    );
                    // GLOBAL rides BESIDE the chip, exactly as it does on the
                    // portfolio: chip content is closed (name · cohort · rank),
                    // and WHICH board the rank came off is context.
                    //
                    // Only the qualified chips get a wrapper. Wrapping the bare
                    // ones too would put each chip alone inside a shrink-to-fit
                    // inline-flex span, which is the container shape that trips
                    // the chip's own maxWidth:100%-vs-negative-margin clamp and
                    // ellipsises the name 8px early (the portfolio's live bug).
                    // The qualified chips are safe because the GLOBAL label is a
                    // sibling, so the wrapper is wider than the chip.
                    return iv.rank != null && iv.rankScope === "GLOBAL" ? (
                      <span key={iv.hcp_id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {chip}
                        <span style={{ ...mono(9, 400, ".04em"), color: P.ink6 }}>GLOBAL</span>
                      </span>
                    ) : (
                      <Fragment key={iv.hcp_id}>{chip}</Fragment>
                    );
                  })}
                </HCPChipRow>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, alignItems: "baseline" }}>
                <span style={{ ...mono(9, 400, ".16em"), color: P.ink6 }}>INTERVENTIONS</span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                  {t.interventions.map((iv, i) => iv.roster && iv.slug
                    ? <a key={i} onClick={() => navigate(`/assets/${iv.slug}`)} style={{ ...mono(9, 400, "0"), color: P.rosterLink, cursor: "pointer" }}>{iv.name}</a>
                    : <span key={i} style={{ ...mono(9, 400, "0"), color: P.ink5 }}>{iv.name}</span>)}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...mono(9, 400, ".06em"), color: P.ink5 }}>{t.nctId} ↗</a>
            </div>
          </div>
        ))}
        </div>
        )}

        {/* disclosures */}
        <div style={{ margin: "26px 28px 0", paddingTop: 16, borderTop: `1px solid ${P.line}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 40px" }}>
          {DISCLOSURES.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 12, alignItems: "start" }}>
              <span style={{ ...mono(9, 400, ".16em"), color: P.ink6, paddingTop: 2 }}>{k}</span>
              <span style={{ ...mono(9, 400, "0"), color: P.ink5, lineHeight: 1.8 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Mobile board — condensed single-column layout ────────────────────────────
function MobileBoard({ surface, listed, rosterChips, isTracked, toggleSave, region, setRegion, coverage, navigate, loading }: {
  surface: TrialsSurface;
  listed: Trial[];
  rosterChips: { hcp_id: string; name: string; state: string | null; n: number }[];
  isTracked: (hcpId: string) => boolean;
  toggleSave: (hcpId: string, createdFrom: string) => Promise<void>;
  region: Region | null;
  setRegion: (r: Region | null) => void;
  coverage: string;
  navigate: (to: string) => void;
  loading: boolean;
}) {
  return (
    <div style={{ ...DEPTH.PANEL, border: `1px solid ${P.line}`, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${P.line}` }}>
        <span style={{ ...mono(11, 600, ".22em"), color: P.amber }}>FIELDMARK</span>
        <span style={{ ...mono(9, 400, ".16em"), color: P.ink0, borderBottom: `1px solid ${P.amber}`, paddingBottom: 2 }}>TRIALS</span>
      </div>

      <div style={{ padding: "18px 16px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...serif(25, 600), color: P.ink0, lineHeight: 1.05 }}>Trials</div>
        <div style={{ ...mono(9, 400, ".14em"), color: P.amberDim, lineHeight: 1.6 }}>{loading ? "…" : `${surface.openCount} OPEN · ${surface.industryCount} INDUSTRY · ${surface.rosterAssetsOnTrial} OF ${surface.rosterAssetsTotal} ROSTER ASSETS`}</div>
        <div style={{ ...mono(9, 400, ".12em"), color: P.ink6, lineHeight: 1.7 }}>SET AS OF CRAWL {CRAWL} · STATUS AS OF {REFRESH}</div>
      </div>

      <div style={{ margin: "16px 16px 0", border: `1px solid ${P.line3}`, background: P.panel }}>
        <div style={{ display: "flex", gap: 6, padding: "9px 10px", overflowX: "auto", alignItems: "center" }}>
          <span style={{ ...mono(9, 400, ".18em"), color: P.amberDim, flex: "none" }}>TERR</span>
          {surface.territories.map((t) => {
            const active = t.key === "ALL US" ? region === null : t.key === region;
            return (
              <span key={t.key} onClick={() => setRegion(t.key === "ALL US" ? null : (t.key as Region))}
                style={{ flex: "none", cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "baseline", padding: "4px 8px", border: `1px solid ${active ? P.chipOnEdge : P.line2}`, background: active ? P.chipOn : "transparent", whiteSpace: "nowrap" }}>
                <span style={{ ...mono(9, active ? 600 : 400, ".1em"), color: active ? P.amberHi : P.ink2 }}>{t.key}</span>
                <span style={{ ...mono(9), color: active ? P.amberDim : P.ink6 }}>{t.count}</span>
              </span>
            );
          })}
        </div>
        <div style={{ padding: "9px 12px 10px", borderTop: `1px solid ${P.line2}`, ...mono(9, 400, "0"), color: P.ink4, lineHeight: 1.7 }}>{coverage}</div>
      </div>

      {rosterChips.length > 0 && (
        <div style={{ margin: "14px 16px 0", border: `1px solid ${P.line2}`, padding: "10px 12px" }}>
          <div style={{ ...mono(9, 400, ".16em"), color: P.amberDim, marginBottom: 8 }}>ON YOUR ROSTER · {rosterChips.length}</div>
          <div style={{ display: "flex", gap: 6, rowGap: 6, flexWrap: "wrap" }}>
            {rosterChips.map((r) => (
              <a key={r.hcp_id} onClick={() => navigate(`/hcp/${r.hcp_id}`)} style={{ ...serif(13), color: P.link, cursor: "pointer" }}>{r.name}{r.state ? ` · ${r.state}` : ""}</a>
            ))}
          </div>
        </div>
      )}

      <div style={{ margin: "14px 16px 0", ...mono(9, 400, ".1em"), color: P.ink4, lineHeight: 1.9 }}>{surface.phaseDist.map((p) => `${p.label} ${p.n}`).join("  ·  ")}</div>
      <div style={{ margin: "4px 16px 0", ...mono(9, 400, ".1em"), color: P.ink4, lineHeight: 1.9 }}>{surface.statusDist.map((s) => `${s.n} ${s.label}`).join("  ·  ")}</div>

      <div style={{ margin: "14px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...mono(9, 600, ".13em"), color: P.amberHi, border: `1px solid #4a3a1c`, padding: "4px 8px" }}>RECRUITING FIRST</span>
        <span style={{ ...mono(9, 400, ".13em"), color: P.ink6 }}>{listed.length} SHOWN</span>
      </div>

      {loading ? <div style={{ padding: "30px 16px", ...mono(11), color: P.ink4 }}>Loading…</div> : (
      // Same well, phone gutters: 6 + 10 + 12 lands content at 28 and the row
      // edge at 16, level with the rest of the mobile board.
      <div style={{ margin: "0 6px", padding: 10, display: "flex", flexDirection: "column", gap: 14, background: P.rowWell }}>
      {listed.map((t) => (
        <div key={t.raw.trial_id} style={{ background: P.rowFill, ...DEPTH.RIM, padding: "12px 12px 13px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ border: `1px solid ${P.line3}`, padding: "2px 6px", ...mono(9, 600, ".12em"), color: P.ink1 }}>{t.phaseLabel}</span>
            <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <span style={{ color: t.recruiting ? P.amber : P.line3, fontSize: 9 }}>●</span>
              <span style={{ ...mono(9, 400, ".12em"), color: t.recruiting ? P.amberDim : P.ink5 }}>{t.statusLabel}</span>
            </span>
            <span style={{ flex: 1 }} />
            <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...mono(9, 400, ".05em"), color: P.ink6 }}>{t.nctId} ↗</a>
          </div>
          <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...serif(15, 600), color: CANON.INK.PRIME, lineHeight: 1.35 }}>{t.title}</a>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <span style={{ ...mono(9, 400, "0"), color: P.ink2 }}>{t.sponsor}</span>
            <span style={{ ...mono(9, 400, ".13em"), color: P.ink5, border: `1px solid ${P.line2}`, padding: "1px 4px" }}>{t.sponsorClassLabel}</span>
          </div>
          <span style={{ ...mono(9, 400, "0"), color: P.ink5 }}>{t.dates}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 2 }}>
            <span style={{ ...mono(9, 400, ".16em"), color: P.ink6 }}>INVESTIGATORS</span>
            {/* Mobile carried a hand-rolled investigator row — a ◆ for tracked,
                a bare link, and the cohort spelled out in mono — so the one
                object a person is supposed to be looked different on a phone
                than on a desk, and the new bookmark control existed on only one
                of them. Same chip as desktop now; state and the GLOBAL
                qualifier stay BESIDE it, as context does everywhere. */}
            {t.investigators.map((iv) => (
              <span key={iv.hcp_id} style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <HCPChip
                  hcpId={iv.hcp_id}
                  name={iv.name ?? "Unknown"}
                  cohort={toChipCohort(iv.cohort, iv.rank)}
                  rank={iv.rank}
                  tracked={isTracked(iv.hcp_id)}
                  onToggleTracked={() => { void toggleSave(iv.hcp_id, "trials").catch(() => {}); }}
                />
                {iv.rank != null && iv.rankScope === "GLOBAL" ? <span style={{ ...mono(9, 400, ".04em"), color: P.ink6 }}>GLOBAL</span> : null}
                {iv.state ? <span style={{ ...mono(9, 400, "0"), color: P.ink4 }}>{iv.state}</span> : <span style={{ ...mono(9, 400, "0"), color: P.ink6, fontStyle: "italic" }}>state unresolved</span>}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            {t.interventions.map((iv, i) => iv.roster && iv.slug
              ? <a key={i} onClick={() => navigate(`/assets/${iv.slug}`)} style={{ ...mono(9, 400, "0"), color: P.rosterLink, cursor: "pointer" }}>{iv.name}</a>
              : <span key={i} style={{ ...mono(9, 400, "0"), color: P.ink5 }}>{iv.name}</span>)}
          </div>
        </div>
      ))}
      </div>
      )}

      <div style={{ margin: "18px 16px 0", paddingTop: 14, borderTop: `1px solid ${P.line}`, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 18 }}>
        {DISCLOSURES.map(([k, v]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ ...mono(9, 400, ".16em"), color: P.ink6 }}>{k}</span>
            <span style={{ ...mono(9, 400, "0"), color: P.ink5, lineHeight: 1.8 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
