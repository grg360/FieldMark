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
import { useNavigate } from "react-router-dom";
import type { PublicationListRow, PublicationYearLedgerRow } from "../../lib/publicationsList";
import DiscussAffordance from "../FieldIntelligenceForum/DiscussAffordance";

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
        {/* Create-capable discuss affordance on senior rows (2026-08-06) — same
            component/composer/route as the year view; founder-gated inside. */}
        {r.pmid ? (
          <DiscussAffordance pmid={r.pmid} journalAbbrev={r.journal} title={r.title} compact />
        ) : null}
      </div>
      <div style={{ textAlign: "right" }}>
        {r.fullTextIsOa && r.fullTextUrl
          ? <a href={r.fullTextUrl} target="_blank" rel="noreferrer" style={{ font: `600 9px/1 ${MONO}`, letterSpacing: ".14em", color: C.gold, border: `1px solid ${C.faint}`, padding: "4px 7px" }}>OPEN ACCESS ↗</a>
          : <span style={{ font: `400 10px/1 ${MONO}`, color: C.faint }}>Subscription only — no full text held.</span>}
      </div>
    </div>
  );
}

// Abbreviate a journal for the narrow column: drop parentheticals, take the
// first clause, cap length — full names wrapped to 5–6 lines and blew out row
// height (the whitespace in the page's bottom half).
function abbrevJournal(j: string): string {
  const clean = j.replace(/\s*\([^)]*\)\s*/g, "").replace(/[.:].*$/, "").trim();
  return clean.length > 26 ? clean.slice(0, 25).trimEnd() + "…" : clean;
}

function YearLedgerRow({ y, hcpId, maxCite }: { y: PublicationYearLedgerRow; hcpId: string; maxCite: number }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Bar is a MEASURE: width ∝ the year's citation weight against the heaviest
  // year, so 1,533 and 150 no longer render the same length. OA rides as a
  // brighter leading segment (its share of the year's papers).
  const weight = maxCite > 0 ? y.citation_total / maxCite : 0;
  const oaShare = y.paper_count > 0 ? y.open_access_count / y.paper_count : 0;
  const journals = y.leading_journals.slice(0, 2).map(abbrevJournal).join(" · ");
  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "72px 84px 1fr 150px 118px", gap: 16, padding: "11px 0", alignItems: "center" }}>
        {/* year → that year's full publication view (senior + co-author), where an
            individual paper — e.g. a mid-cited senior paper past the top five — is
            reachable and carries the Discuss affordance. */}
        <button
          type="button"
          onClick={() => navigate(`/hcp/${hcpId}/publications?year=${y.year}`)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", font: `600 15px/1 ${MONO}`, color: C.ink2, borderBottom: `1px solid ${C.line2}`, justifySelf: "start" }}
        >
          {y.year}
        </button>
        <span style={{ font: `600 14px/1 ${MONO}`, color: C.mid, fontVariantNumeric: "tabular-nums" }}>{y.citation_total.toLocaleString()}<span style={{ font: `400 8px/1 ${MONO}`, color: C.faint2 }}> CIT</span></span>
        {/* citation-weight bar */}
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ position: "relative", height: 10, flex: 1, background: C.tick, minWidth: 40 }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(weight * 100, 1.5)}%`, background: C.tickOn }} />
            {oaShare > 0 ? <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(weight * oaShare * 100, 1)}%`, background: C.gold }} /> : null}
          </span>
          <span style={{ font: `400 9px/1 ${MONO}`, letterSpacing: ".06em", color: C.faint, flex: "none" }}>{y.open_access_count} OA</span>
        </span>
        <span style={{ font: `400 10px/1.4 ${MONO}`, letterSpacing: ".04em", color: C.dim, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{journals || "—"}</span>
        <span onClick={() => setOpen((v) => !v)} style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".08em", color: C.mid, textAlign: "right", cursor: "pointer" }}>{y.paper_count} PAPER{y.paper_count === 1 ? "" : "S"} {open ? "▾" : "▸"}</span>
      </div>
      {open ? (
        <div style={{ padding: "0 0 12px 88px", font: `400 11px/1.6 ${MONO}`, color: C.dim }}>
          {y.paper_count} co-authored · {y.open_access_count} open access · {y.citation_total.toLocaleString()} citations{y.leading_journals.length ? ` · led by ${y.leading_journals.slice(0, 3).map(abbrevJournal).join(", ")}` : ""}. <button type="button" onClick={() => navigate(`/hcp/${hcpId}/publications?year=${y.year}`)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: C.gold }}>Open {y.year} →</button>
        </div>
      ) : null}
    </div>
  );
}

export default function FullCareerView({
  hcpId,
  seniorRows,
  coAuthorTotal,
  ledger,
  hcpName,
}: {
  hcpId: string;
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
  const maxCite = Math.max(1, ...ledger.map((y) => y.citation_total));
  // Header stat row (frame 1c): the four figures the frame leads with, over the
  // whole record. Citations = senior rows + co-author year totals; OA likewise.
  const totalCites = senior.reduce((s, r) => s + citeN(r), 0) + ledger.reduce((s, y) => s + y.citation_total, 0);
  const totalOa = senior.filter((r) => r.fullTextIsOa).length + ledger.reduce((s, y) => s + y.open_access_count, 0);

  const Stat = ({ n, label, color }: { n: string; label: string; color: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ font: `400 22px/1 ${MONO}`, letterSpacing: "-.02em", color, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ font: `500 9px/1 ${MONO}`, letterSpacing: ".14em", color: C.dim }}>{label}</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 26 }}>
      {/* header stat row (frame 1c) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 34, flexWrap: "wrap", paddingBottom: 2 }}>
        <Stat n={senior.length.toLocaleString()} label="SENIOR AUTHOR" color={C.gold} />
        <Stat n={coAuthorTotal.toLocaleString()} label="CO-AUTHOR" color={C.ink2} />
        <div style={{ width: 1, alignSelf: "stretch", background: C.line2 }} />
        <Stat n={totalCites.toLocaleString()} label="CITATIONS · ALL YEARS" color={C.ink2} />
        <Stat n={totalOa.toLocaleString()} label="OPEN ACCESS · FULL TEXT" color="#7ba36f" />
      </div>

      {/* SENIOR AUTHOR — five most cited, expandable to all. The id is the landing
          target for #senior-author deep links (ledger SENIOR AUTHORSHIP badge). */}
      <section id="senior-author">
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
        <div style={{ display: "grid", gridTemplateColumns: "72px 84px 1fr 150px 118px", gap: 16, padding: "9px 0", font: `400 8px/1 ${MONO}`, letterSpacing: ".14em", color: C.faint2 }}>
          <span>YEAR</span><span>CITED</span><span>CITATION WEIGHT · OA</span><span style={{ textAlign: "right" }}>LEADING JOURNALS</span><span style={{ textAlign: "right" }}>PAPERS HELD</span>
        </div>
        {ledger.map((y) => <YearLedgerRow key={y.year} y={y} hcpId={hcpId} maxCite={maxCite} />)}
      </section>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".12em", color: C.dim }}>{ledgerYears} YEARS · {grandTotal} OF {grandTotal} PAPERS HELD</span>
        {hcpName ? <span style={{ marginLeft: "auto", font: `400 9px/1 ${MONO}`, letterSpacing: ".1em", color: C.faint2 }}>{hcpName.toUpperCase()} · {senior.length} SENIOR-AUTHOR · {coAuthorTotal} CO-AUTHORED</span> : null}
      </div>
    </div>
  );
}
