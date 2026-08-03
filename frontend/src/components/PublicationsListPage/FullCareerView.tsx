// Full-career publications view (frame 1c). Senior-author papers ranked by citation,
// five deep with an "ALL N SENIOR-AUTHOR PAPERS →" expander; then co-authored papers
// collapse into a YEAR LEDGER — one row per year (citation total, paper count, leading
// journals, open-access count, a tick per paper), each year expandable. This is the
// view that answers the meeting question directly without rendering hundreds of rows.
//
// Query cost is modest (measured): the base join over one HCP's record (~291 rows for
// the most prolific) plus one grouped co-author aggregate — well under a second. It is
// safe to wire behind the route; no per-co-author-row enrichment is done.

import { useState } from "react";
import type { PublicationListRow, PublicationYearLedgerRow } from "../../lib/publicationsList";

const C = {
  bg: "#08080a", gold: "#d8a34a", ink: "#e6e3dd", ink2: "#c6c2bb", mid: "#6f6d68",
  dim: "#57554f", faint: "#46443f", faint2: "#3f3d39", line: "#1e1e21", line2: "#2a2a2e", tick: "#33322f", tickOn: "#6f6d68",
} as const;
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const SERIF = "'Source Serif 4',Georgia,serif";
const citeN = (r: PublicationListRow) => r.citation_count ?? 0;

function SeniorRow({ r }: { r: PublicationListRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "68px 1fr 150px", gap: 20, padding: "13px 0", borderTop: `1px solid ${C.line}`, alignItems: "baseline" }}>
      <div style={{ textAlign: "right", font: `600 17px/1 ${MONO}`, color: C.gold, fontVariantNumeric: "tabular-nums" }}>
        {citeN(r).toLocaleString()}
        <div style={{ font: `400 8px/1.4 ${MONO}`, letterSpacing: ".1em", color: C.faint2, marginTop: 4 }}>CITED</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <div style={{ font: `500 16px/1.4 ${SERIF}`, color: C.ink, textWrap: "pretty" }}>{r.title}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, font: `400 10px/1.5 ${MONO}`, letterSpacing: ".04em", color: C.dim }}>
          {r.pmid ? <a href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer" style={{ color: C.mid, borderBottom: `1px solid ${C.line2}` }}>PMID {r.pmid}</a> : null}
          {r.journal ? <><span style={{ color: C.faint2 }}>·</span><span>{r.journal.replace(/\s*\([^)]*\)\s*/g, "").slice(0, 40)}</span></> : null}
          {r.pub_year ? <><span style={{ color: C.faint2 }}>·</span><span>{r.pub_year}</span></> : null}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {r.fullTextIsOa && r.fullTextUrl
          ? <a href={r.fullTextUrl} target="_blank" rel="noreferrer" style={{ font: `600 9px/1 ${MONO}`, letterSpacing: ".14em", color: C.gold, border: `1px solid ${C.faint}`, padding: "4px 7px" }}>OPEN ACCESS ↗</a>
          : <span style={{ font: `400 10px/1 ${MONO}`, color: C.faint }}>Subscription only — no full text held.</span>}
      </div>
    </div>
  );
}

function YearLedgerRow({ y }: { y: PublicationYearLedgerRow }) {
  const [open, setOpen] = useState(false);
  const ticks = Math.min(y.paper_count, 40);
  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: "grid", gridTemplateColumns: "80px 90px 1fr 120px 90px", gap: 16, padding: "12px 0", alignItems: "center", cursor: "pointer" }}>
        <span style={{ font: `600 15px/1 ${MONO}`, color: C.ink2 }}>{y.year}</span>
        <span style={{ font: `600 14px/1 ${MONO}`, color: C.mid, fontVariantNumeric: "tabular-nums" }}>{y.citation_total.toLocaleString()}<span style={{ font: `400 8px/1 ${MONO}`, color: C.faint2 }}> CIT</span></span>
        <span style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {Array.from({ length: ticks }).map((_, i) => (
            <span key={i} style={{ width: 5, height: 12, background: i < y.open_access_count ? C.tickOn : C.tick, flex: "none" }} />
          ))}
        </span>
        <span style={{ font: `400 10px/1.4 ${MONO}`, letterSpacing: ".04em", color: C.dim, textAlign: "right" }}>{y.leading_journals.join(" · ") || "—"}</span>
        <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".08em", color: C.mid, textAlign: "right" }}>{y.paper_count} PAPER{y.paper_count === 1 ? "" : "S"}</span>
      </div>
      {open ? (
        <div style={{ padding: "0 0 12px 96px", font: `400 11px/1.6 ${MONO}`, color: C.dim }}>
          {y.paper_count} co-authored · {y.open_access_count} open access · {y.citation_total.toLocaleString()} citations{y.leading_journals.length ? ` · led by ${y.leading_journals.join(", ")}` : ""}.
        </div>
      ) : null}
    </div>
  );
}

export default function FullCareerView({
  seniorRows,
  coAuthorTotal,
  ledger,
  hcpName,
}: {
  seniorRows: PublicationListRow[];
  coAuthorTotal: number;
  ledger: PublicationYearLedgerRow[];
  hcpName?: string;
}) {
  const [showAllSenior, setShowAllSenior] = useState(false);
  const senior = seniorRows.slice().sort((a, b) => citeN(b) - citeN(a));
  const shownSenior = showAllSenior ? senior : senior.slice(0, 5);
  const ledgerYears = ledger.length;
  const grandTotal = senior.length + coAuthorTotal;

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 26 }}>
      {/* SENIOR AUTHOR — five most cited, expandable to all */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 6 }}>
          <span style={{ font: `600 10.5px/1 ${MONO}`, letterSpacing: ".2em", color: C.ink }}>SENIOR AUTHOR</span>
          <span style={{ marginLeft: "auto", font: `400 9.5px/1 ${MONO}`, letterSpacing: ".11em", color: C.dim }}>
            {senior.length} PAPERS · SHOWING {shownSenior.length} MOST CITED
          </span>
        </div>
        <div style={{ height: 2, background: C.gold }} />
        {shownSenior.map((r) => <SeniorRow key={r.id} r={r} />)}
        {senior.length > 5 ? (
          <div onClick={() => setShowAllSenior((v) => !v)} style={{ font: `500 10px/1 ${MONO}`, letterSpacing: ".13em", color: C.gold, cursor: "pointer", paddingTop: 12 }}>
            {showAllSenior ? "SHOW FIVE MOST CITED ↑" : `ALL ${senior.length} SENIOR-AUTHOR PAPERS →`}
          </div>
        ) : null}
      </section>

      {/* CO-AUTHOR · BY YEAR — the year ledger */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 6 }}>
          <span style={{ font: `600 10.5px/1 ${MONO}`, letterSpacing: ".2em", color: C.ink2 }}>CO-AUTHOR · BY YEAR</span>
          <span style={{ marginLeft: "auto", font: `400 9.5px/1 ${MONO}`, letterSpacing: ".11em", color: C.dim }}>{coAuthorTotal} PAPERS · {ledgerYears} YEARS · CLICK A YEAR</span>
        </div>
        <div style={{ height: 2, background: C.line2 }} />
        <div style={{ display: "grid", gridTemplateColumns: "80px 90px 1fr 120px 90px", gap: 16, padding: "9px 0", font: `400 8px/1 ${MONO}`, letterSpacing: ".14em", color: C.faint2 }}>
          <span>YEAR</span><span>CITED</span><span>OPEN ACCESS · TICK PER PAPER</span><span style={{ textAlign: "right" }}>LEADING JOURNALS</span><span style={{ textAlign: "right" }}>PAPERS HELD</span>
        </div>
        {ledger.map((y) => <YearLedgerRow key={y.year} y={y} />)}
      </section>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".12em", color: C.dim }}>{ledgerYears} YEARS · {grandTotal} OF {grandTotal} PAPERS HELD</span>
        {hcpName ? <span style={{ marginLeft: "auto", font: `400 9px/1 ${MONO}`, letterSpacing: ".1em", color: C.faint2 }}>{hcpName.toUpperCase()} · {senior.length} SENIOR-AUTHOR · {coAuthorTotal} CO-AUTHORED</span> : null}
      </div>
    </div>
  );
}
