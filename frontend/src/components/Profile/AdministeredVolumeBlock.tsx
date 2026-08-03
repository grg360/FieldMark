// Administered Volume block — design frame "Administered Volume Block.dc.html"
// (turn 2). Sits beneath the practice-scale Medicare block. Self-contained in the
// frame register (Spectral serif + IBM Plex Mono + gold). Renders the RPC payload
// only; enforcement of the five seam rules + four corrections is server-side.
//
// withholdSeam: true on the established/academic mount. Practice-scale is not on
// that page, so the seam % has no visible denominator — it renders as a DELIBERATE
// absence (its own sentence), never a missing figure, so a reader moving between
// profiles does not wonder why one carries a percentage and the other does not.

import { useEffect, useState } from "react";
import { loadAdministeredVolume, type AdministeredVolume, type AVRow } from "../../lib/administeredVolume";

const C = {
  bg: "#0e0f11",
  bgAlt: "#0b0c0e",
  line: "#1c1f22",
  lineSoft: "#16181a",
  gold: "#c9a227",
  goldSoft: "rgba(201,162,39,.28)",
  goldFill: "rgba(201,162,39,.04)",
  ink: "#e8e6e1",
  blue: "#9aa7b8",
  gray: "#7b8189",
  subtle: "#5d6166",
  faint: "#4e5257",
  bar: "#8fa88c",
  barDim: "#5d7159",
  warn: "#8a7124",
};
const mono = (s: number, w = 400) => ({ font: `${w} ${s}px 'IBM Plex Mono',ui-monospace,monospace` } as const);
const serif = (s: number, w = 300) => ({ font: `${w} ${s}px Spectral,Georgia,serif` } as const);
const usd = (v: number | null | undefined) =>
  v == null ? "—" : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`;
const usdFull = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);
const int = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());

function Header({ dot, note }: { dot: "matched" | "thin"; note: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 11, borderBottom: `1px solid ${C.line}`, paddingBottom: 7 }}>
      <span style={{ color: C.gold, ...mono(12, 500) }}>▌</span>
      <span style={{ ...mono(10, 500), letterSpacing: ".14em", textTransform: "uppercase", color: C.ink }}>Administered volume</span>
      <span style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.subtle }}>nsclc code set · 2021–2023 · 49 codes</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: dot === "matched" ? C.gold : "transparent", border: dot === "thin" ? `1px solid ${C.gold}` : "none", display: "block" }} />
        <span style={{ ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.blue }}>{note}</span>
      </span>
    </div>
  );
}

// Absolute-constraint footer cards — static, never data.
function ConstraintCards() {
  const cards: [string, string][] = [
    ["A floor, never a total", "Part B fee-for-service only. No commercial, Advantage, Medicaid or self-pay. A younger panel reads small here and may not be."],
    ["Instances, not patients", "Counts are summed per code; a patient appears once per agent received. The unique estimate exists only at practice scale."],
    ["No regimen inference", "Billing two agents is a fact; giving them together is not. Claims carry no patient linkage, so no combination is asserted."],
  ];
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, background: C.bgAlt, padding: "16px 26px", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 22 }}>
      {cards.map(([h, b]) => (
        <div key={h} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ ...mono(9, 500), letterSpacing: ".12em", textTransform: "uppercase", color: C.warn }}>{h}</div>
          <div style={{ ...mono(11), lineHeight: 1.55, color: C.subtle }}>{b}</div>
        </div>
      ))}
    </div>
  );
}

function DrugRow({ r, maxPaid }: { r: AVRow; maxPaid: number }) {
  const share = maxPaid > 0 ? Math.max(2, Math.round(100 * (r.paid_latest ?? 0) / maxPaid)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 110px 140px 112px", gap: "0 16px", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ ...mono(11), color: C.gray }}>{r.code}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...serif(15, 400), color: C.ink }}>{r.agent ?? r.code}</div>
        <div style={{ height: 2, background: "#121416", maxWidth: 280 }}><div style={{ height: 2, width: `${share}%`, background: C.bar }} /></div>
      </div>
      <div style={{ ...mono(13, 500), color: C.ink, textAlign: "right" }}>{int(r.instances_latest)}</div>
      <div style={{ textAlign: "right" }}>
        <div style={{ ...mono(12), color: C.blue }}>{int(r.units_latest)}</div>
        <div style={{ ...mono(9), color: C.faint }}>dose units</div>
      </div>
      <div style={{ ...mono(12), color: C.ink, textAlign: "right" }}>{usdFull(r.paid_latest)}</div>
    </div>
  );
}

function PerYearBars({ per, label }: { per: { year: number; instances: number | null; paid: number | null }[]; label: string }) {
  const max = Math.max(...per.map((y) => y.instances ?? 0), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {per.map((y, i) => {
        const w = Math.round(100 * (y.instances ?? 0) / max);
        const last = i === per.length - 1;
        return (
          <div key={y.year} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ ...mono(11, last ? 500 : 400), color: last ? C.ink : C.gray }}>{y.year}</span>
              <span style={{ ...mono(11, last ? 500 : 400), color: last ? C.ink : C.blue }}>{int(y.instances)} <span style={{ color: C.subtle, fontWeight: 400 }}>· {usdFull(y.paid)}</span></span>
            </div>
            <div style={{ height: 9, background: "#121416" }}><div style={{ height: 9, width: `${w}%`, background: last ? C.bar : C.barDim }} /></div>
          </div>
        );
      })}
      <div style={{ ...mono(10), lineHeight: 1.5, color: C.faint, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// Trajectory sentence — written out, never an arrow. No trend when <2 years.
function trajectory(per: { year: number; instances: number | null }[]): string {
  const pts = per.filter((y) => y.instances != null);
  if (pts.length < 2) return "One year of activity — no trajectory stated, because a single interval cannot make one.";
  const first = pts[0].instances ?? 0, last = pts[pts.length - 1].instances ?? 0;
  const pct = first > 0 ? Math.round(100 * (last - first) / first) : 0;
  if (Math.abs(pct) < 8) return `Steady. ${pts.map((p) => p.instances).join(" · ")} instances across ${pts[0].year}→${pts[pts.length - 1].year}; latest year leads and the level holds.`;
  const dir = pct > 0 ? "Rising" : "Declining";
  return `${dir}. ${pct > 0 ? "+" : ""}${pct}% in instances since ${pts[0].year}; the trajectory is written out rather than left to an arrow.`;
}

export default function AdministeredVolumeBlock({
  hcpId,
  taSlug = "nsclc",
  withholdSeam = false,
}: {
  hcpId: string;
  taSlug?: string;
  withholdSeam?: boolean;
}) {
  const [av, setAv] = useState<AdministeredVolume | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadAdministeredVolume(hcpId, taSlug).then((d) => { if (alive) { setAv(d); setLoading(false); } });
    return () => { alive = false; };
  }, [hcpId, taSlug]);

  if (loading || !av) return null;

  const wrap = (children: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
  );

  // ── Absence states (correction 3: two distinct) ──
  if (av.state === "no_medicare") {
    return wrap(
      <>
        <Header dot="thin" note="No Medicare visibility" />
        <div style={{ background: C.bg, border: `1px solid ${C.line}`, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, ...serif(14), color: C.ink, lineHeight: 1.5 }}>This physician does not appear in Part B professional claims for 2021, 2022 or 2023. We cannot see the practice.</p>
          <div style={{ ...mono(10), lineHeight: 1.5, color: C.faint }}>1,692 community NSCLC physicians · 26%. No practice scale either, so nothing about size is claimed in either direction — distinct from an active practice with no lung activity, where the practice is visible and the set is absent from it.</div>
        </div>
      </>,
    );
  }
  if (av.state === "no_set_activity") {
    return wrap(
      <>
        <Header dot="thin" note="Active practice · no NSCLC-set activity" />
        <div style={{ background: C.bg, border: `1px solid ${C.line}`, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, ...serif(14), color: C.ink, lineHeight: 1.5 }}>A practice of {int(av.benes_2023)} beneficiaries in 2023, none of it on the NSCLC code set.</p>
          <div style={{ ...mono(10), lineHeight: 1.5, color: C.faint }}>1,056 community NSCLC physicians · 16.3%. Statable only because practice scale is populated — intelligence, not a gap: an active practice that does not appear to treat lung on fee-for-service Medicare.</div>
        </div>
      </>,
    );
  }

  const proc = av.procedures;
  const pd = av.primary_drug;
  const sec = av.secondary;
  const procedureLed = av.ledger_lead === "procedure";

  // ── Sparse (matched but too thin to characterise) ──
  if (av.state === "sparse") {
    const row = pd?.rows?.[0] ?? null;
    const yr = pd?.per_year?.[0]?.year ?? av.max_year;
    return wrap(
      <>
        <Header dot="thin" note="Matched — thin coverage" />
        <div style={{ background: C.bg, border: `1px solid ${C.line}`, padding: "20px 26px", display: "flex", flexDirection: "column", gap: 13 }}>
          <p style={{ margin: 0, ...serif(18, 300), color: C.ink, lineHeight: 1.5, maxWidth: 620 }}>
            {row ? <>One NSCLC agent, <span style={{ ...mono(18, 500), color: C.gold }}>{int(row.instances_latest)}</span> beneficiary instances, in {yr} only.</> : <>Activity on {av.distinct_codes_in_set} code of the NSCLC set, in {yr} only.</>} Too little to characterise a practice.
          </p>
          <p style={{ margin: 0, ...serif(13), color: C.blue, lineHeight: 1.6, maxWidth: 620 }}>
            Consistent with an occasional referral, a covering shift, or a practice whose NSCLC patients are mostly not on fee-for-service Medicare. Not evidence of a treating relationship — so no headline figure is set and no bar is drawn: a share bar over one code would imply a distribution that does not exist.
          </p>
          {row ? (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 110px 140px 112px", gap: "0 16px", paddingBottom: 7, borderBottom: `1px solid ${C.line}`, ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>
                <div>HCPCS</div><div>Agent</div><div style={{ textAlign: "right" }}>Instances</div><div style={{ textAlign: "right" }}>Units · dose</div><div style={{ textAlign: "right" }}>Paid</div>
              </div>
              <DrugRow r={row} maxPaid={row.paid_latest ?? 1} />
            </div>
          ) : null}
        </div>
      </>,
    );
  }

  // ── Matched, but no administration to chart (E&M / imaging only) ──
  // The physician IS on the NSCLC set (their codes sit in corrected paid), but the
  // activity is evaluation-and-management or imaging — category 'em'/'imaging' —
  // which satisfies none of the three renderable ledgers (primary is_primary_signal,
  // procedures code_category='procedure', secondary rows code_category='drug_admin').
  // The matched layout is built around an administration ledger; with none, it would
  // render a "—" headline and no rows. Every state owes a sentence, so this renders
  // one rather than an empty husk. (Sparse already handles the <=2-code / 1-year tail.)
  const noAdministration =
    (pd?.rows?.length ?? 0) === 0 && (proc?.rows?.length ?? 0) === 0 && (sec?.rows?.length ?? 0) === 0;
  if (noAdministration) {
    const n = av.distinct_codes_in_set ?? 0;
    return wrap(
      <>
        <Header dot="thin" note="Active on set · no administration" />
        <div style={{ background: C.bg, border: `1px solid ${C.line}`, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, ...serif(14), color: C.ink, lineHeight: 1.5 }}>
            This physician appears on {int(n)} NSCLC-set code{n === 1 ? "" : "s"} — {usd(av.corrected_paid_3yr)} of corrected Part B paid across 2021–2023 — but entirely in evaluation-and-management or imaging, not administration. No primary-signal agents, no cross-indication agents and no thoracic procedures are billed under this NPI, so there is no administered volume to chart.
          </p>
          <div style={{ ...mono(10), lineHeight: 1.5, color: C.faint }}>
            Distinct from an absent practice: the set is present and paid, but this block measures administration — drugs given and procedures done — and clinical evaluation is not that. It is charted where it belongs, not forced into an administration ledger it does not fit.
          </div>
        </div>
      </>,
    );
  }

  // ── Matched — full block ──
  const headlineInstances = procedureLed ? proc?.instances_latest : pd?.per_year?.find((y) => y.year === av.max_year)?.instances;
  const headlinePaid = procedureLed ? proc?.paid_latest : pd?.per_year?.find((y) => y.year === av.max_year)?.paid;
  const maxPaid = Math.max(...(pd?.rows ?? []).map((r) => r.paid_latest ?? 0), 1);

  return wrap(
    <>
      <Header dot="matched" note="Matched — data available" />
      <div style={{ background: C.bg, border: `1px solid ${C.line}` }}>
        {/* top: headline + seam (left), per-year bars (right) */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px" }}>
          <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16, borderRight: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 15 }}>
              <div style={{ ...mono(52, 500), color: C.gold, letterSpacing: "-.02em", lineHeight: .88 }}>{int(headlineInstances)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 5 }}>
                <div style={{ ...mono(11, 500), letterSpacing: ".1em", textTransform: "uppercase", color: C.ink }}>Beneficiary instances</div>
                <div style={{ ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.subtle }}>{procedureLed ? "Thoracic procedures" : "Primary-signal NSCLC agents"} · {av.max_year}{procedureLed ? ` · ${usdFull(headlinePaid)} paid` : ""}</div>
              </div>
            </div>
            <p style={{ margin: 0, ...serif(14), color: C.blue, lineHeight: 1.55, maxWidth: 520 }}>
              {procedureLed
                ? "Procedure codes bill one unit per service, so units, services and instances nearly coincide — unlike drug codes, where the billed quantity is dose increments."
                : "Counted per beneficiary per code — a patient given three of these agents counts three times. It measures administration, not headcount. The practice-level unique-beneficiary estimate is above and is not recomputed here."}
            </p>

            {/* stat row */}
            {!procedureLed ? (
              <div style={{ display: "flex", gap: 38, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
                <Stat v={usdFull(pd?.paid_3yr)} l="Medicare paid · primary signal, 3-yr" />
                <Stat v={`${pd?.codes_admin} of ${pd?.codes_total}`} l="Primary agents administered" />
                <Stat v={`${av.distinct_codes_in_set} of ${av.set_codes_total}`} l="Distinct codes in the set" />
              </div>
            ) : null}

            {/* SEAM — rule 04, or the deliberate-absence line on the academic mount */}
            {withholdSeam ? (
              <div style={{ padding: "14px 16px", border: `1px solid ${C.line}`, background: C.bgAlt, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.subtle }}>Across the seam · withheld here, not missing</div>
                <div style={{ ...serif(13), color: C.blue, lineHeight: 1.5 }}>No practice-scale block on this profile, so the share of corrected Part B paid is withheld rather than estimated. It renders where practice scale does — on the community profile — and its absence here is a property of the page, not of this physician.</div>
              </div>
            ) : av.seam ? (
              <div style={{ padding: "14px 16px", border: `1px solid ${C.goldSoft}`, background: C.goldFill, display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.gold }}>Across the seam · rule 04</div>
                <div style={{ ...mono(13), color: C.ink, lineHeight: 1.5 }}><span style={{ fontWeight: 500, color: C.gold }}>{av.seam.pct}%</span> of this physician's corrected Part B paid goes to primary-signal NSCLC agents.</div>
                <div style={{ ...serif(13), color: C.gray, lineHeight: 1.5 }}>{usd(av.seam.primary_paid_3yr)} of {usd(av.seam.corrected_paid_3yr)}.{sec?.pct_of_corrected != null ? ` Cross-indication agents account for a further ${sec.pct_of_corrected}% — stated separately, because that share is not NSCLC-specific and the two must not be added into one claim.` : ""}</div>
              </div>
            ) : av.primary_drug_paid_3yr == null ? (
              <div style={{ padding: "14px 16px", border: `1px solid ${C.line}`, background: C.bgAlt, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.subtle }}>Across the seam · rule 04</div>
                <div style={{ ...serif(13), color: C.blue, lineHeight: 1.5 }}>This physician administers no primary-signal NSCLC agents, so there is no NSCLC-set share of Part B paid to state. Cross-indication and procedure activity, where present, are shown below as their own ledgers.</div>
              </div>
            ) : null}
          </div>

          {/* per-year bars */}
          <div style={{ padding: "24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.subtle }}>Per year · {procedureLed ? "procedures" : "primary signal"}</div>
            <PerYearBars per={procedureLed ? (proc?.per_year ?? []) : (pd?.per_year ?? [])} label="Bars scaled to this physician's own maximum. No peer comparison — no validated benchmark exists for administered volume." />
            <p style={{ margin: 0, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}`, ...serif(14), color: C.blue, lineHeight: 1.55 }}>{trajectory(procedureLed ? (proc?.per_year ?? []) : (pd?.per_year ?? []))}</p>
          </div>
        </div>

        {/* PRIMARY drug tier (drug-led only) */}
        {!procedureLed && pd && pd.rows.length > 0 ? (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "20px 26px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ ...mono(9, 500), letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, border: `1px solid ${C.goldSoft}`, padding: "4px 6px" }}>Primary signal</span>
              <span style={{ ...mono(10), lineHeight: 1.4, color: C.gray }}>NSCLC-specific codes · administering these is direct evidence of NSCLC practice</span>
              <span style={{ marginLeft: "auto", ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>ranked by paid · {av.max_year}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 110px 140px 112px", gap: "0 16px", paddingBottom: 7, borderBottom: `1px solid ${C.line}`, ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>
              <div>HCPCS</div><div>Agent</div><div style={{ textAlign: "right" }}>Instances</div><div style={{ textAlign: "right" }}>Units · dose basis</div><div style={{ textAlign: "right" }}>Paid</div>
            </div>
            {pd.rows.map((r) => <DrugRow key={r.code} r={r} maxPaid={maxPaid} />)}
            <div style={{ ...mono(10), lineHeight: 1.5, color: C.faint, padding: "12px 0 16px" }}>Bars show share of this physician's own primary-signal paid. Units are dose increments — not a count of anything a person receives. {av.drug_services_note}</div>
          </div>
        ) : null}

        {/* SECONDARY (cross-indication) tier */}
        {sec && sec.rows.length > 0 ? (
          <div style={{ borderTop: `1px solid ${C.line}`, background: C.bgAlt, padding: "18px 26px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ ...mono(9, 500), letterSpacing: ".12em", textTransform: "uppercase", color: C.gray, border: `1px solid #2a2e32`, padding: "4px 6px" }}>Secondary · cross-indication</span>
              <span style={{ ...mono(10), lineHeight: 1.4, color: C.subtle }}>given across many cancers · never added to the figures above</span>
              <span style={{ marginLeft: "auto", ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>{sec.codes_admin} of {sec.codes_total} codes{sec.pct_of_corrected != null ? ` · ${sec.pct_of_corrected}% of paid` : ""}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 110px 112px", gap: "10px 16px", alignItems: "center" }}>
              {sec.rows.slice(0, 6).map((r) => (
                <div key={r.code} style={{ display: "contents" }}>
                  <div style={{ ...mono(11), color: C.subtle }}>{r.code}</div>
                  <div style={{ ...serif(14, 400), color: C.blue }}>{r.agent ?? r.code}</div>
                  <div style={{ ...mono(12), color: C.blue, textAlign: "right" }}>{int(r.instances_latest)}</div>
                  <div style={{ ...mono(11), color: C.blue, textAlign: "right" }}>{usdFull(r.paid_latest)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* PROCEDURES ledger — or its honest absence (correction 1) */}
        {procedureLed && proc && proc.rows.length > 0 ? (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "18px 26px 8px" }}>
            <div style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.gold, marginBottom: 12 }}>Thoracic procedures · separate ledger</div>
            <div style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 90px 90px 112px", gap: "0 14px", paddingBottom: 7, borderBottom: `1px solid ${C.line}`, ...mono(9), letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>
              <div>CPT</div><div>Procedure</div><div style={{ textAlign: "right" }}>Instances</div><div style={{ textAlign: "right" }}>Services</div><div style={{ textAlign: "right" }}>Paid</div>
            </div>
            {proc.rows.map((r) => (
              <div key={r.code} style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) 90px 90px 112px", gap: "0 14px", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ ...mono(11), color: C.gray }}>{r.code}</div>
                <div style={{ ...serif(14, 400), color: C.ink }}>{r.name ?? r.code}</div>
                <div style={{ ...mono(12, 500), color: C.ink, textAlign: "right" }}>{int(r.instances_latest)}</div>
                <div style={{ ...mono(11), color: C.blue, textAlign: "right" }}>{int(r.services_latest)}</div>
                <div style={{ ...mono(11), color: C.ink, textAlign: "right" }}>{usdFull(r.paid_latest)}</div>
              </div>
            ))}
            <p style={{ margin: 0, padding: "14px 0", ...serif(14), color: C.blue, lineHeight: 1.55 }}><span style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.subtle }}>Systemic therapy · </span>No Part B professional claims for primary-signal drug administration 2021–2023. Surgical and infusion volume are separate ledgers: neither is summed into the other, and a surgeon's instances are not comparable to an oncologist's.</p>
          </div>
        ) : !procedureLed ? (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "16px 26px", display: "flex", alignItems: "flex-start", gap: 18 }}>
            <div style={{ ...mono(9), letterSpacing: ".12em", textTransform: "uppercase", color: C.subtle, minWidth: 150, paddingTop: 2 }}>Thoracic procedures</div>
            <p style={{ margin: 0, ...serif(14), color: C.blue, lineHeight: 1.55, maxWidth: 760 }}>No Part B professional claims for thoracic procedures under this NPI 2021–2023. Facility-billed procedures are not visible to this dataset — an absence in what we hold, not a claim about where the volume sits. Procedures are a separate ledger and are never summed with drug volume.</p>
          </div>
        ) : null}

        <ConstraintCards />
      </div>
    </>,
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ ...mono(19, 500), color: C.ink }}>{v}</div>
      <div style={{ ...mono(9), lineHeight: 1.3, letterSpacing: ".1em", textTransform: "uppercase", color: C.subtle }}>{l}</div>
    </div>
  );
}
