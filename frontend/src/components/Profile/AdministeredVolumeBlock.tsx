// Medicare Administered Therapy block. Rewrite (2026-08-04) of the former "Administered
// volume — NSCLC" block, which was built on an NSCLC attribution the data cannot support.
// Register per docs/design/Administered Volume Block.dc.html (Spectral + IBM Plex Mono,
// gold accent); content per the corrected brief.
//
// WHAT THIS IS: the observed infused-oncology footprint under this NPI — office-administered
// oncology agents (the NSCLC ta_hcpcs_codes drug_admin set, minus denosumab/leuprolide),
// shaped in lib/administeredVolume.ts. CMS claims carry no indication field; nothing here is
// attributed to a tumour type. GONE from the prior block: the "49-code NSCLC set" header,
// the primary-vs-cross-indication split, the "% to primary-signal NSCLC agents" seam, and
// any use of ta_hcpcs_codes.is_primary_signal (miscalibrated). The NSCLC claim on this
// profile now comes from the evidence line at the top (Part D). See
// docs/design/MEDICARE_ATTRIBUTION_SIGNAL.md.

import { useEffect, useState } from "react";
import {
  loadAdministeredTherapy,
  REPORTING_FLOOR,
  FACILITY_ONLY_HCP_COUNT,
  type AdministeredTherapy,
  type AgentRow,
  type AgentBadge,
} from "../../lib/administeredVolume";

const C = {
  bg: "#08090a",
  card: "#0e0f11",
  line: "#1c1f22",
  lineSoft: "#16181a",
  gold: "#c9a227",
  goldSoft: "rgba(201,162,39,.35)",
  goldFill: "rgba(201,162,39,.05)",
  ink: "#e8e6e1",
  blue: "#9aa7b8",
  dim: "#5d6166",
  faint: "#4e5257",
  bar: "#8fa88c",
  barTrack: "#16181a",
} as const;

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px 'IBM Plex Mono',ui-monospace,monospace` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px Spectral,Georgia,serif` } as const);
const int = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());

const BADGE_LABEL: Record<AgentBadge, string> = {
  nsclc_anchored: "NSCLC-ANCHORED",
  thoracic_enriched: "THORACIC-ENRICHED · MULTI-INDICATION",
};

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 11, borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
      <span style={{ color: C.gold, ...mono(12, 500) }}>▌</span>
      <span style={{ ...mono(10.5, 500), letterSpacing: ".14em", textTransform: "uppercase", color: C.ink }}>Medicare administered therapy</span>
      <span style={{ marginLeft: "auto", ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.dim }}>{subtitle}</span>
    </div>
  );
}

function gridCols(nYears: number): string {
  return `minmax(0,1fr) repeat(${nYears}, 108px) 176px 62px`;
}

function Bar({ days, max }: { days: number; max: number }) {
  const pct = max > 0 ? Math.max(days > 0 ? 3 : 0, Math.round((100 * days) / max)) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ flex: 1, height: 8, background: C.barTrack }}>
        <div style={{ height: 8, width: `${pct}%`, background: C.bar }} />
      </div>
      <span style={{ width: 34, textAlign: "right", ...mono(11), color: days > 0 ? C.ink : C.faint, fontVariantNumeric: "tabular-nums" }}>{days > 0 ? int(days) : "—"}</span>
    </div>
  );
}

function AgentRowView({ row, windowYears, maxDays }: { row: AgentRow; windowYears: number[]; maxDays: number }) {
  const recentYear = windowYears[windowYears.length - 1];
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridCols(windowYears.length), columnGap: 16, alignItems: "start", padding: "14px 20px", borderBottom: `1px solid ${C.lineSoft}` }}>
      {/* agent + badge + multi-product note */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span style={{ ...serif(15.5, 400), color: C.ink }}>{row.molecule}</span>
          {row.badge ? (
            <span style={{ ...mono(8.5, 500), letterSpacing: ".1em", color: row.badge === "nsclc_anchored" ? C.gold : C.blue, border: `1px solid ${row.badge === "nsclc_anchored" ? C.goldSoft : "#2a2e32"}`, padding: "2px 6px" }}>
              {BADGE_LABEL[row.badge]}
            </span>
          ) : null}
        </div>
        {row.multiProduct ? (
          <span style={{ ...mono(9), color: C.faint, letterSpacing: ".04em" }}>one molecule, {row.codes.length} products across the window</span>
        ) : null}
      </div>

      {/* per-year cells */}
      {row.cells.map((cell) => {
        const isRecent = cell.year === recentYear;
        if (cell.benes == null) {
          return (
            <div key={cell.year} style={{ textAlign: "right", ...serif(11.5, 400), fontStyle: "italic", color: C.faint, lineHeight: 1.35 }}>
              under floor<br />fewer than {REPORTING_FLOOR} benes
            </div>
          );
        }
        return (
          <div key={cell.year} style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ ...mono(13, isRecent ? 600 : 400), color: isRecent ? C.ink : C.blue, fontVariantNumeric: "tabular-nums" }}>{int(cell.benes)}</span>
            <span style={{ ...mono(9), color: C.dim }}>{int(cell.days)} days</span>
            {row.multiProduct && cell.products.length ? (
              <span style={{ ...mono(8.5), color: C.faint, letterSpacing: ".03em" }}>{cell.products.join(" · ")}</span>
            ) : null}
          </div>
        );
      })}

      {/* bar — most recent year's administration days, scaled to the rendered set's max */}
      <div style={{ paddingTop: 2 }}><Bar days={row.recentDays} max={maxDays} /></div>

      {/* years N of M */}
      <div style={{ textAlign: "right", ...mono(11), color: C.blue, fontVariantNumeric: "tabular-nums" }}>{row.yearsReported} of {windowYears.length}</div>
    </div>
  );
}

function ColumnHeads({ windowYears }: { windowYears: number[] }) {
  const recentYear = windowYears[windowYears.length - 1];
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridCols(windowYears.length), columnGap: 16, padding: "10px 20px", borderBottom: `1px solid ${C.line}`, ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>
      <div>Agent</div>
      {windowYears.map((y) => (
        <div key={y} style={{ textAlign: "right", color: y === recentYear ? C.dim : C.faint }}>
          {y}<br /><span style={{ color: C.faint }}>benes · days</span>
        </div>
      ))}
      <div style={{ textAlign: "right" }}>Admin days · {recentYear}</div>
      <div style={{ textAlign: "right" }}>Years</div>
    </div>
  );
}

function MetricsBar({ t }: { t: AdministeredTherapy }) {
  const cell = (label: string, value: string, sub?: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...mono(9, 500), letterSpacing: ".1em", textTransform: "uppercase", color: C.dim }}>{label}</span>
      <span style={{ ...mono(15, 500), color: C.ink }}>{value}{sub ? <span style={{ ...mono(9), color: C.dim }}> {sub}</span> : null}</span>
    </div>
  );
  const win = t.windowYears.length ? `${t.windowYears[0]}–${t.windowYears[t.windowYears.length - 1]}` : "—";
  return (
    <div style={{ display: "flex", gap: 40, flexWrap: "wrap", padding: "16px 20px", borderBottom: `1px solid ${C.line}` }}>
      {cell("Products reported", String(t.productCount), `in ${t.agentRowCount} agent rows`)}
      {cell("Reported cells", String(t.cellCount))}
      {cell("Window", win)}
      {cell("Reporting floor", `${REPORTING_FLOOR}`, "benes / cell")}
    </div>
  );
}

const SOURCE_LINE =
  "CMS Medicare fee-for-service claims, office-administered agents only, billed under this NPI, calendar years 2021–2023, minimum 11 reported beneficiaries per provider-drug-year cell.";

function ReservedAndSource() {
  return (
    <>
      {/* reserved band — a future cohort-density line lands here, one per profile. Empty. */}
      <div style={{ height: 34, borderTop: `1px solid ${C.lineSoft}` }} aria-hidden />
      <div style={{ ...mono(9.5), lineHeight: 1.6, color: C.dim, letterSpacing: ".02em", padding: "12px 20px 16px", borderTop: `1px solid ${C.line}` }}>{SOURCE_LINE}</div>
    </>
  );
}

export default function AdministeredVolumeBlock({ hcpId }: { hcpId: string; taSlug?: string; withholdSeam?: boolean }) {
  const [t, setT] = useState<AdministeredTherapy | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadAdministeredTherapy(hcpId).then((d) => { if (alive) { setT(d); setLoading(false); } });
    return () => { alive = false; };
  }, [hcpId]);

  if (loading || !t) return null;

  // ── No-claims absence state (~90% of the roster, including every academic HCP) ──
  if (t.state === "no_claims") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header subtitle="office-administered oncology agents" />
        <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 9 }}>
          <p style={{ margin: 0, ...serif(14), color: C.ink, lineHeight: 1.5 }}>
            No office-administered oncology agents billed under this NPI, 2021–2023.
          </p>
          <p style={{ margin: 0, ...serif(13), color: C.blue, lineHeight: 1.6, textWrap: "pretty" }}>
            This is a fact about where the bill was filed, not about activity. Drugs given in a hospital outpatient
            department or a facility-owned infusion suite are billed by the institution and never reach an individual
            physician record. {FACILITY_ONLY_HCP_COUNT.toLocaleString()} HCPs have facility billing and no drug rows.
          </p>
          <p style={{ margin: 0, ...mono(9.5), color: C.dim, lineHeight: 1.6, letterSpacing: ".02em" }}>
            Absence of a drug means fewer than {REPORTING_FLOOR} Medicare beneficiaries under this NPI that year — never zero.
          </p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <ReservedAndSource />
        </div>
      </div>
    );
  }

  // ── Reported state ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Header subtitle="office-administered oncology agents" />
      <div style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <MetricsBar t={t} />
        <ColumnHeads windowYears={t.windowYears} />
        {t.rows.map((row) => (
          <AgentRowView key={row.molecule} row={row} windowYears={t.windowYears} maxDays={t.maxRecentDays} />
        ))}

        {/* captions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "14px 20px 4px" }}>
          <span style={{ ...mono(9.5), color: C.dim, letterSpacing: ".04em" }}>Ordered by most recent year's reported beneficiaries, descending.</span>
          <span style={{ ...mono(9.5), color: C.dim, letterSpacing: ".04em" }}>
            A blank year is fewer than {REPORTING_FLOOR} reported beneficiaries — never zero. The bar is the most recent year's administration days, scaled to the largest in this set.
          </span>
          <span style={{ ...mono(9.5), color: C.dim, letterSpacing: ".04em", textWrap: "pretty" }}>
            Badges describe the agent's labelled use, not this physician's case mix. A provider is not a tumour type.
          </span>
        </div>

        <ReservedAndSource />
      </div>
    </div>
  );
}
