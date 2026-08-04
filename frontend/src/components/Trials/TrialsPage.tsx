// Trials surface — /trials. Frame: docs/design/Trials Surface.dc.html.
//
// Live SET 1 (open NSCLC-lung trials naming >=1 ranked investigator) from
// get_nsclc_trials_surface() over the gated view trial_investigators_rendered_v1.
// Every figure is derived live (lib/trials.ts) — the header count is whatever the
// set is on the day. Territory uses the platform's established 5-region model
// (us-regions.ts), not the frame's 11-region sample. Bulk noInvs tier dropped.
// The frame's own palette/type are used verbatim (per the ledger build precedent),
// with the real NavBar from AppLayout replacing the frame's stale nav.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../AppLayout";
import { getCurrentUser } from "../../lib/authHelpers";
import { getTrackedHcpIds } from "../../lib/watchlists";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { fetchTrials, buildSurface, type Trial, type Region, type TrialsSurface } from "../../lib/trials";

const P = {
  board: "#0b0a09", panel: "#0f0e0c", well: "#0d0c0a",
  line: "#1c1a15", line2: "#221f19", line3: "#2a251c",
  amber: "#c8892e", amberHi: "#e0a544", amberDim: "#8a6a2c", rosterLink: "#b9762c",
  ink0: "#e9e5d7", ink1: "#c3bcac", ink2: "#8d8778", ink3: "#7e786b",
  ink4: "#6a6558", ink5: "#57534a", ink6: "#4c483e", link: "#a9bfc7",
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SERIF = "'Source Serif 4', Georgia, serif";
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
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [onlyRecruiting, setOnlyRecruiting] = useState(false);
  const [order, setOrder] = useState<Order>("recruiting");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [trials, user] = await Promise.all([fetchTrials(), getCurrentUser()]);
      let ids = new Set<string>();
      if (user) { try { ids = await getTrackedHcpIds(user.id); } catch { /* no roster */ } }
      if (alive) { setAll(trials); setTracked(ids); setLoading(false); }
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
    const byHcp = new Map<string, { name: string; state: string | null; n: number }>();
    for (const t of surface.trials) for (const iv of t.investigators) {
      if (!tracked.has(iv.hcp_id)) continue;
      const e = byHcp.get(iv.hcp_id) ?? { name: iv.name ?? "Unknown", state: iv.state, n: 0 };
      e.n += 1; byHcp.set(iv.hcp_id, e);
    }
    return [...byHcp.entries()].map(([hcp_id, v]) => ({ hcp_id, ...v })).sort((a, b) => b.n - a.n);
  }, [surface.trials, tracked]);

  const cell = { fontFamily: MONO } as const;
  const coverage = region
    ? `${surface.openCount} trials name an investigator whose practice state is in ${region}. Trials whose matched investigators have no resolved state are not counted here — read the count as a floor.`
    : `${surface.resolvedTrials} of the ${surface.openCount} open trials name at least one investigator whose practice state resolves to a US region. ${surface.unresolvedTrials} resolve to no state and appear in no region view — read every region count as a floor.`;

  if (isMobile) {
    return (
      <AppLayout width="wide">
        <MobileBoard surface={surface} listed={listed} rosterChips={rosterChips} tracked={tracked}
          region={region} setRegion={setRegion} coverage={coverage} navigate={navigate} loading={loading} />
      </AppLayout>
    );
  }

  return (
    <AppLayout width="wide">
      <div style={{ background: P.board, border: `1px solid ${P.line}`, marginTop: 8 }}>
        {/* masthead */}
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px 40px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: "1 1 340px", minWidth: 0, maxWidth: 660 }}>
            <div style={{ ...mono(8.5, 400, ".18em"), color: P.ink6 }}>FIELDMARK / TRIALS</div>
            <div style={{ ...serif(27, 600), color: P.ink0, lineHeight: 1.05 }}>Trials</div>
            <div style={{ ...mono(9.5, 400, ".14em"), color: P.amberDim }}>OPEN LUNG TRIALS NAMING AT LEAST ONE RANKED NSCLC INVESTIGATOR</div>
            <p style={{ ...serif(13), color: P.ink2, lineHeight: 1.65, margin: "6px 0 0" }}>
              Every open lung trial on ClinicalTrials.gov that names an investigator matched to the ranked cohort. Trials are the rows; territory, roster, sponsor and phase are lenses on the same set.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: "0 1 auto", minWidth: 250 }}>
            {[["open trials", surface.openCount], ["industry-sponsored", surface.industryCount], ["roster assets on trial", `${surface.rosterAssetsOnTrial} of ${surface.rosterAssetsTotal}`]].map(([k, v]) => (
              <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${P.line}` }}>
                <span style={{ ...mono(9.5), color: P.ink4 }}>{k}</span>
                <span style={{ ...mono(12, 600), color: P.ink0 }}>{loading ? "…" : v}</span>
              </div>
            ))}
            <div style={{ ...mono(8.5, 400, ".13em"), color: P.ink6, textAlign: "right", paddingTop: 8, lineHeight: 1.7 }}>SET AS OF CRAWL {CRAWL}<br />STATUS AS OF {REFRESH} REFRESH</div>
          </div>
        </div>

        {/* territory band */}
        <div style={{ margin: "22px 28px 0", border: `1px solid ${P.line3}`, background: P.panel }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <div style={{ padding: "13px 14px", borderRight: `1px solid ${P.line2}`, width: 104, flex: "none", ...mono(8.5, 400, ".18em"), color: P.amberDim }}>TERRITORY</div>
            <div style={{ flex: 1, padding: "9px 12px", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              {surface.territories.map((t) => {
                const active = t.key === "ALL US" ? region === null : t.key === region;
                return (
                  <span key={t.key} onClick={() => setRegion(t.key === "ALL US" ? null : (t.key as Region))}
                    style={{ cursor: "pointer", display: "inline-flex", gap: 8, alignItems: "baseline", padding: "4px 9px",
                      border: `1px solid ${active ? "#7a5a1f" : P.line2}`, background: active ? "#191309" : "transparent" }}>
                    <span style={{ ...mono(9.5, active ? 600 : 400, ".12em"), color: active ? P.amberHi : P.ink2 }}>{t.key}</span>
                    <span style={{ ...mono(9.5), color: active ? P.amberDim : P.ink6 }}>{t.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ padding: "9px 14px 10px", borderTop: `1px solid ${P.line2}`, ...mono(9.5, 400, "0"), color: P.ink4, lineHeight: 1.75, maxWidth: 1000 }}>{coverage}</div>
        </div>

        {/* roster strip */}
        {rosterChips.length > 0 && (
          <div style={{ margin: "20px 28px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 9 }}>
              <span style={{ ...mono(8.5, 400, ".18em"), color: P.amberDim }}>ON YOUR ROSTER</span>
              <span style={{ flex: 1, height: 1, background: P.line }} />
              <span style={{ ...mono(8.5, 400, ".13em"), color: P.ink6 }}>{rosterChips.length} OF THE HCPs YOU TRACK NAMED ON {region ? "A TRIAL IN THIS REGION" : "AN OPEN TRIAL"}</span>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {rosterChips.map((r) => (
                <span key={r.hcp_id} style={{ display: "inline-flex", gap: 9, alignItems: "baseline", border: `1px solid ${P.line2}`, padding: "5px 10px" }}>
                  <a onClick={() => navigate(`/hcp/${r.hcp_id}`)} style={{ ...serif(13), color: P.link, cursor: "pointer" }}>{r.name}</a>
                  <span style={{ ...mono(8.5, 400, ".1em"), color: P.ink6 }}>{r.n} {r.n === 1 ? "TRIAL" : "TRIALS"}{r.state ? ` · ${r.state}` : ""}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* phase + status distributions */}
        <div style={{ margin: "16px 28px 0", border: `1px solid ${P.line}`, display: "flex", alignItems: "stretch" }}>
          <div style={{ padding: "11px 14px", borderRight: `1px solid ${P.line}`, width: 104, flex: "none", ...mono(8.5, 400, ".18em"), color: P.ink6 }}>PHASE</div>
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
          <div style={{ padding: "11px 14px", borderRight: `1px solid ${P.line}`, width: 104, flex: "none", ...mono(8.5, 400, ".18em"), color: P.ink6 }}>STATUS</div>
          <div style={{ flex: 1, padding: "11px 14px", display: "flex", gap: 22, alignItems: "baseline", flexWrap: "wrap" }}>
            {surface.statusDist.map((s) => (
              <span key={s.label} style={{ display: "inline-flex", gap: 7, alignItems: "baseline" }}>
                <span style={{ color: P.amber, fontSize: 8, lineHeight: 1 }}>●</span>
                <span style={{ ...mono(11, 600), color: P.ink0 }}>{s.n}</span>
                <span style={{ ...mono(9, 400, ".13em"), color: P.ink4 }}>{s.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* controls */}
        <div style={{ margin: "20px 28px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...mono(8.5, 400, ".18em"), color: P.ink6 }}>SHOW</span>
          {[["ALL", false], ["RECRUITING", true]].map(([lbl, v]) => (
            <span key={String(lbl)} onClick={() => setOnlyRecruiting(v as boolean)} style={{ cursor: "pointer", ...mono(9, onlyRecruiting === v ? 600 : 400, ".13em"), color: onlyRecruiting === v ? P.ink0 : P.ink4, border: `1px solid ${onlyRecruiting === v ? "#4a3a1c" : P.line}`, padding: "4px 9px" }}>{lbl}</span>
          ))}
          <span style={{ width: 14 }} />
          <span style={{ ...mono(8.5, 400, ".18em"), color: P.ink6 }}>ORDER</span>
          {([["RECRUITING FIRST", "recruiting"], ["PHASE", "phase"], ["START DATE", "start"]] as [string, Order][]).map(([lbl, v]) => (
            <span key={v} onClick={() => setOrder(v)} style={{ cursor: "pointer", ...mono(9, order === v ? 600 : 400, ".13em"), color: order === v ? P.amberHi : P.ink4, border: `1px solid ${order === v ? "#4a3a1c" : P.line}`, padding: "4px 9px" }}>{lbl}</span>
          ))}
          <span style={{ flex: 1 }} />
          <span style={{ ...mono(9, 400, ".13em"), color: P.ink6 }}>{listed.length} SHOWN</span>
        </div>
        <div style={{ margin: "10px 28px 0", borderBottom: `1px solid ${P.line}` }} />

        {/* trial rows */}
        {loading ? (
          <div style={{ padding: "40px 28px", ...mono(10), color: P.ink4 }}>Loading trials…</div>
        ) : listed.map((t) => (
          <div key={t.raw.trial_id} style={{ margin: "0 28px", borderBottom: `1px solid #16140f`, borderLeft: `2px solid #4e3a16`, display: "grid", gridTemplateColumns: "112px 1fr 104px", gap: 16, padding: "14px 0 15px 14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={{ border: `1px solid ${P.line3}`, padding: "3px 0", textAlign: "center", ...mono(9, 600, ".13em"), color: P.ink1 }}>{t.phaseLabel}</span>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ color: t.recruiting ? P.amber : P.line3, fontSize: 7, lineHeight: 1.4 }}>●</span>
                <span style={{ ...mono(8, 400, ".13em"), color: t.recruiting ? P.amberDim : P.ink5, lineHeight: 1.5 }}>{t.statusLabel}</span>
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
              <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...serif(14.5, 600), color: "#e2ddcd", lineHeight: 1.3 }}>{t.title}</a>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ ...mono(10, 400, "0"), color: P.ink2 }}>{t.sponsor}</span>
                <span style={{ ...mono(8, 400, ".14em"), color: P.ink5, border: `1px solid ${P.line2}`, padding: "1px 5px" }}>{t.sponsorClassLabel}</span>
                <span style={{ ...mono(9.5, 400, "0"), color: P.ink5 }}>{t.dates}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, alignItems: "baseline", paddingTop: 2 }}>
                <span style={{ ...mono(8, 400, ".16em"), color: P.ink6 }}>INVESTIGATORS</span>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {t.investigators.map((iv) => (
                    <span key={iv.hcp_id} style={{ display: "inline-flex", gap: 7, alignItems: "baseline" }}>
                      {tracked.has(iv.hcp_id) && <span style={{ color: P.amber, fontSize: 7, lineHeight: 1.6 }}>◆</span>}
                      <a onClick={() => navigate(`/hcp/${iv.hcp_id}`)} style={{ ...serif(13), color: P.link, cursor: "pointer" }}>{iv.name}</a>
                      <span style={{ ...mono(8, 400, ".08em"), color: P.ink6 }}>{iv.cohort === "established" ? "EST" : "RS"}{iv.rank != null ? ` · ${iv.rank}` : ""}</span>
                      {iv.state ? <span style={{ ...mono(9.5, 400, "0"), color: P.ink4 }}>{iv.institution ? `${iv.institution} · ${iv.state}` : iv.state}</span>
                        : <span style={{ ...mono(9.5, 400, "0"), color: P.ink6, fontStyle: "italic" }}>state unresolved</span>}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, alignItems: "baseline" }}>
                <span style={{ ...mono(8, 400, ".16em"), color: P.ink6 }}>INTERVENTIONS</span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                  {t.interventions.map((iv, i) => iv.roster && iv.slug
                    ? <a key={i} onClick={() => navigate(`/assets/${iv.slug}`)} style={{ ...mono(9.5, 400, "0"), color: P.rosterLink, cursor: "pointer" }}>{iv.name}</a>
                    : <span key={i} style={{ ...mono(9.5, 400, "0"), color: P.ink5 }}>{iv.name}</span>)}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" style={{ ...mono(9, 400, ".06em"), color: P.ink5 }}>{t.nctId} ↗</a>
            </div>
          </div>
        ))}

        {/* disclosures */}
        <div style={{ margin: "26px 28px 0", paddingTop: 16, borderTop: `1px solid ${P.line}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 40px" }}>
          {DISCLOSURES.map(([k, v]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 12, alignItems: "start" }}>
              <span style={{ ...mono(8, 400, ".16em"), color: P.ink6, paddingTop: 2 }}>{k}</span>
              <span style={{ ...mono(9, 400, "0"), color: P.ink5, lineHeight: 1.8 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ margin: "22px 0 0", padding: "12px 28px", borderTop: `1px solid ${P.line}`, display: "flex", justifyContent: "space-between", ...cell }}>
          <span style={{ ...mono(8.5, 400, ".16em"), color: P.line3 }}>FIELDMARK / TRIALS</span>
          <span style={{ ...mono(8.5, 400, ".16em"), color: P.line3 }}>SOURCE: CLINICALTRIALS.GOV</span>
        </div>
      </div>
    </AppLayout>
  );
}
