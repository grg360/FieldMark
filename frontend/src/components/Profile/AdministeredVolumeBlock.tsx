import { useMediaQuery } from "../../lib/useMediaQuery";
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
import { CANON, DEPTH, FACE } from "../../lib/canonicalTokens";

// Ink follows reading mode at the BLOCK level (2026-08-06): this is a data table
// scanned as a unit, so it is one temperature — the COOL ramp throughout. The
// serif agent names render in cool ink (CANON.INK.PRIME), exactly as the Trials
// reclassification did; the former warm-neutral `ink` (#e8e6e1) and the separate
// cool-blue `blue` (#9aa7b8) — which read blue where they sat adjacent — are
// retired into steps of the one cool ramp. Gold and the volume bar are accents,
// cool-safe, and unchanged.
const C = {
  // bg/card retired 2026-08-12 (composition fix): section containers take
  // DEPTH.PANEL — a flat BASE card is invisible on the shell's BASE ground.
  line: CANON.GROUND.RAISE,
  lineSoft: CANON.GROUND.RAISE,
  gold: CANON.GOLD.PRIME,
  goldSoft: "rgba(201,162,39,.35)",
  goldFill: "rgba(201,162,39,.05)",
  ink: CANON.INK.PRIME, // bright cool ink — agent names + recent figures (was warm #e8e6e1)
  blue: CANON.INK.LABEL, // dimmer cool step — older figures / yearsReported (was #9aa7b8)
  dim: CANON.INK.LABEL,
  faint: CANON.INK.MUTE,
  bar: CANON.MARK.EST,
  barTrack: CANON.GROUND.RAISE,
} as const;

// Faces via tokens (2026-08-12): the frame's Spectral was a stray — Newsreader
// is the one value face (RFC-03); the local mono string folds into FACE.data.
const mono = (s: number, w = 400) => ({ font: `${w} ${s}px ${FACE.data}` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px ${FACE.value}` } as const);
const int = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());

// THE BADGE DESCRIBES THE DRUG, NOT THE DOCTOR (2026-09-01). badgeFor() keys on
// molecules — J9305/J9304 pemetrexed, J9173 durvalumab — so what it knows is the
// AGENT's labelled indication. It knows nothing about this physician's case mix and
// nothing about the therapeutic area of the profile it is rendering on.
//
// The old string read "ANCHORED · LUNG CANCER", built from a BLOCK_TA_SLUG = "nsclc"
// constant. Unqualified, next to a physician's name, that reads as a claim about the
// physician. It was also the wrong thing to make TA-aware: feeding the profile's TA into
// it would have relabelled pemetrexed as a colorectal agent on a colorectal profile —
// a false clinical statement, manufactured by the fix. The indication is a property of
// the HCPCS code, so this needs no TA at all and BLOCK_TA_SLUG is gone.
//
// "DRUG LABEL ·" is the attribution: it says whose property the indication is, and it
// reads correctly on a profile of any therapeutic area.
const BADGE_LABEL: Record<AgentBadge, string> = {
  // The KEY stays nsclc_anchored — it is the value administeredVolume.ts emits.
  nsclc_anchored: "DRUG LABEL · LUNG CANCER",
  thoracic_enriched: "DRUG LABEL · THORACIC, MULTI-INDICATION",
};

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 11, borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
      <span style={{ color: C.gold, ...mono(13, 500) }}>▌</span>
      <span style={{ ...mono(11, 500), letterSpacing: ".14em", textTransform: "uppercase", color: C.ink }}>Medicare administered therapy</span>
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
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint
  const recentYear = windowYears[windowYears.length - 1];
  // MOBILE (2026-08-10): table-to-CARD. The desktop table's column headers
  // (year, bar, coverage) don't travel when columns collapse, leaving naked
  // number pairs — so each drug becomes a card whose every figure carries its
  // own label: year rows ("2021 · 37 BENES · 154 DAYS"), a labeled admin-days
  // bar, a labeled coverage line. The per-year under-floor absence keeps its
  // year label too. Desktop table unchanged.
  if (isMobile) {
    return (
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          <span style={{ ...mono(13, 500), letterSpacing: ".02em", color: C.ink }}>{row.molecule}</span>
          {row.badge ? (
            <span style={{ ...mono(9, 500), letterSpacing: ".1em", color: row.badge === "nsclc_anchored" ? C.gold : C.blue, border: `1px solid ${row.badge === "nsclc_anchored" ? C.goldSoft : CANON.GROUND.INSET}`, padding: "2px 6px" }}>
              {BADGE_LABEL[row.badge]}
            </span>
          ) : null}
        </div>
        {row.multiProduct ? (
          <span style={{ ...mono(9), color: C.faint, letterSpacing: ".04em" }}>one molecule, {row.codes.length} products across the window</span>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {row.cells.map((cell) => {
            const isRecent = cell.year === recentYear;
            return (
              <div key={cell.year} style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                <span style={{ ...mono(9, isRecent ? 600 : 400), color: isRecent ? C.ink : C.dim, fontVariantNumeric: "tabular-nums" }}>{cell.year}</span>
                {cell.benes == null ? (
                  <span style={{ ...serif(11, 400), fontStyle: "italic", color: C.faint }}>under floor — fewer than {REPORTING_FLOOR} benes</span>
                ) : (
                  <>
                    <span style={{ ...mono(13, isRecent ? 600 : 400), color: isRecent ? C.ink : C.blue, fontVariantNumeric: "tabular-nums" }}>{int(cell.benes)} benes</span>
                    <span style={{ ...mono(9), color: C.dim, fontVariantNumeric: "tabular-nums" }}>· {int(cell.days)} days</span>
                    {row.multiProduct && cell.products.length ? (
                      <span style={{ ...mono(9), color: C.faint, letterSpacing: ".03em" }}>{cell.products.join(" · ")}</span>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...mono(9, 500), letterSpacing: ".12em", color: C.dim, textTransform: "uppercase" }}>Admin days · most recent year</span>
          <Bar days={row.recentDays} max={maxDays} />
        </div>
        <span style={{ ...mono(9), color: C.blue, fontVariantNumeric: "tabular-nums" }}>REPORTED {row.yearsReported} OF {windowYears.length} YEARS</span>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridCols(windowYears.length), columnGap: 16, alignItems: "start", padding: "14px 20px", borderBottom: `1px solid ${C.lineSoft}` }}>
      {/* agent + badge + multi-product note */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
          {/* one treatment (2026-08-07): drug names render mono everywhere — this was
              the one serif drug face; companies get the serif instead */}
          <span style={{ ...mono(13, 500), letterSpacing: ".02em", color: C.ink }}>{row.molecule}</span>
          {row.badge ? (
            <span style={{ ...mono(9, 500), letterSpacing: ".1em", color: row.badge === "nsclc_anchored" ? C.gold : C.blue, border: `1px solid ${row.badge === "nsclc_anchored" ? C.goldSoft : CANON.GROUND.INSET}`, padding: "2px 6px" }}>
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
            <div key={cell.year} style={{ textAlign: "right", ...serif(11, 400), fontStyle: "italic", color: C.faint, lineHeight: 1.35 }}>
              under floor<br />fewer than {REPORTING_FLOOR} benes
            </div>
          );
        }
        return (
          <div key={cell.year} style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ ...mono(13, isRecent ? 600 : 400), color: isRecent ? C.ink : C.blue, fontVariantNumeric: "tabular-nums" }}>{int(cell.benes)}</span>
            <span style={{ ...mono(9), color: C.dim }}>{int(cell.days)} days</span>
            {row.multiProduct && cell.products.length ? (
              <span style={{ ...mono(9), color: C.faint, letterSpacing: ".03em" }}>{cell.products.join(" · ")}</span>
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
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint — 2026-08-10 mobile stack pass
  const recentYear = windowYears[windowYears.length - 1];
  return (
    <div style={{ display: isMobile ? "none" : "grid", gridTemplateColumns: gridCols(windowYears.length), columnGap: 16, padding: "10px 20px", borderBottom: `1px solid ${C.line}`, ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>
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
      <div style={{ ...mono(9), lineHeight: 1.6, color: C.dim, letterSpacing: ".02em", padding: "12px 20px 16px", borderTop: `1px solid ${C.line}` }}>{SOURCE_LINE}</div>
    </>
  );
}

export default function AdministeredVolumeBlock(
  { hcpId, taId }: { hcpId: string; taId: string; withholdSeam?: boolean },
) {
  const [t, setT] = useState<AdministeredTherapy | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadAdministeredTherapy(hcpId, taId).then((d) => { if (alive) { setT(d); setLoading(false); } });
    return () => { alive = false; };
  }, [hcpId, taId]);

  if (loading || !t) return null;

  // ── Read-failure state (2026-08-10, Option A) — the read failed, so nothing
  // is known: no table, no absence copy, no implied answer. One dim line,
  // the Federal Funding "GRANT RECORD UNAVAILABLE" treatment. ──
  if (t.state === "unavailable") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header subtitle="office-administered oncology agents" />
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL, padding: "18px 22px" }}>
          <span style={{ ...mono(9), letterSpacing: ".1em", color: C.dim }}>PART B RECORD UNAVAILABLE</span>
        </div>
      </div>
    );
  }

  // ── No-NPI absence state (2026-08-10) — record-linkage absence, not a claims
  // fact. Mechanism claim only, never a prevalence claim (Garrett's ruling):
  // institution billing exists and doesn't reach individual records; how many
  // physicians it affects is not asserted. ──
  if (t.state === "no_npi") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header subtitle="office-administered oncology agents" />
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 9 }}>
          <p style={{ margin: 0, ...serif(15), color: C.ink, lineHeight: 1.5 }}>
            Medicare Part B cannot be read for this record — no NPI is matched to it.
          </p>
          <p style={{ margin: 0, ...serif(13), color: C.blue, lineHeight: 1.6, textWrap: "pretty" }}>
            Part B claims are keyed by NPI, so an unmatched NPI makes the claims record unreadable from here — a fact
            about record linkage, not about practice. Administered therapy in academic and hospital-based settings is
            frequently billed by the institution rather than the individual, so it may not reach a personal Medicare
            record even when it occurs.
          </p>
          <p style={{ margin: 0, ...mono(9), color: C.dim, lineHeight: 1.6, letterSpacing: ".02em" }}>
            Absence here means no NPI match — never that no therapy is administered. When an NPI is matched, this section fills from the same code set.
          </p>
        </div>
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL }}>
          <ReservedAndSource />
        </div>
      </div>
    );
  }

  // ── No-code-set absence state (2026-09-01) — a property of the THERAPEUTIC AREA, not of
  // this HCP. ta_hcpcs_codes has no rows for this area, so there is nothing to match claims
  // against and administered volume is not assessed. Before this state existed the empty
  // INNER JOIN fell through to the no-claims copy below, which says the bill was filed
  // elsewhere — a statement about this physician, made on every HCP in the area, and false.
  // The two absences are different facts and the block must not collapse them. ──
  if (t.state === "no_code_set") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header subtitle="office-administered oncology agents" />
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 9 }}>
          <p style={{ margin: 0, ...serif(15), color: C.ink, lineHeight: 1.5 }}>
            No HCPCS code set is defined for this therapeutic area, so administered volume is not assessed here.
          </p>
          <p style={{ margin: 0, ...serif(13), color: C.blue, lineHeight: 1.6, textWrap: "pretty" }}>
            The claims record has not been read and found empty — there is no code set to read it against. Which
            HCPCS codes belong to a therapeutic area is curated, not derived, and that curation has not been done
            for this one. Nothing here is a fact about this physician.
          </p>
          <p style={{ margin: 0, ...mono(9), color: C.dim, lineHeight: 1.6, letterSpacing: ".02em" }}>
            Absence here means the area has no code set — never that no therapy is administered. This section fills for every HCP in the area once the set exists.
          </p>
        </div>
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL }}>
          <ReservedAndSource />
        </div>
      </div>
    );
  }

  // ── No-claims absence state (~90% of the roster, including every academic HCP) ──
  if (t.state === "no_claims") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Header subtitle="office-administered oncology agents" />
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 9 }}>
          <p style={{ margin: 0, ...serif(15), color: C.ink, lineHeight: 1.5 }}>
            No office-administered oncology agents billed under this NPI, 2021–2023.
          </p>
          <p style={{ margin: 0, ...serif(13), color: C.blue, lineHeight: 1.6, textWrap: "pretty" }}>
            This is a fact about where the bill was filed, not about activity. Drugs given in a hospital outpatient
            department or a facility-owned infusion suite are billed by the institution and never reach an individual
            physician record. {FACILITY_ONLY_HCP_COUNT.toLocaleString()} HCPs have facility billing and no drug rows.
          </p>
          <p style={{ margin: 0, ...mono(9), color: C.dim, lineHeight: 1.6, letterSpacing: ".02em" }}>
            Absence of a drug means fewer than {REPORTING_FLOOR} Medicare beneficiaries under this NPI that year — never zero.
          </p>
        </div>
        <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL }}>
          <ReservedAndSource />
        </div>
      </div>
    );
  }

  // ── Reported state ──
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Header subtitle="office-administered oncology agents" />
      <div style={{ border: `1px solid ${C.line}`, ...DEPTH.PANEL }}>
        <MetricsBar t={t} />
        <ColumnHeads windowYears={t.windowYears} />
        {t.rows.map((row) => (
          <AgentRowView key={row.molecule} row={row} windowYears={t.windowYears} maxDays={t.maxRecentDays} />
        ))}

        {/* captions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "14px 20px 4px" }}>
          <span style={{ ...mono(9), color: C.dim, letterSpacing: ".04em" }}>Ordered by most recent year's reported beneficiaries, descending.</span>
          <span style={{ ...mono(9), color: C.dim, letterSpacing: ".04em" }}>
            A blank year is fewer than {REPORTING_FLOOR} reported beneficiaries — never zero. The bar is the most recent year's administration days, scaled to the largest in this set.
          </span>
          <span style={{ ...mono(9), color: C.dim, letterSpacing: ".04em", textWrap: "pretty" }}>
            Badges describe the agent's labelled use, not this physician's case mix. A provider is not a tumour type.
          </span>
        </div>

        <ReservedAndSource />
      </div>
    </div>
  );
}
