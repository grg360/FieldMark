// Per-HCP publications surface — redesign. Layout authority: docs/design/
// Publications List.dc.html (project 15adc915). Role becomes STRUCTURE, not a chip:
// two bands (SENIOR AUTHOR / CO-AUTHOR), a left-hand citation figure column, and no
// card — rows share one grid. Nothing paginated, nothing collapsed by default; band
// counts equal the rows beneath them and the footer states shown against held.
//
// BINDINGS (from the code brief):
//   • No invented signals — every field is a stored fact; no relevance/importance/key flag.
//   • Discussed is a FILTER, not a sort; the row affordance appears only where a thread
//     exists; a threadless row shows nothing (no "ask the first question" here).
//   • Assets / study-type / theme share the provenance line and shorten when absent —
//     no label, no reserved row. Drug-chip absence is unremarkable, never "missing".
//   • Open access earns a badge; its absence is the one stated sentence:
//     "Subscription only — no full text held."
//   • SPARSE_THRESHOLD is a CHOSEN number (not computed): a year with fewer papers
//     drops per-band counts and turns absences into sentences. Stated on the surface.

import { useMemo, useState } from "react";
import type { PublicationListRow } from "../../lib/publicationsList";
import DiscussAffordance from "../FieldIntelligenceForum/DiscussAffordance";

// Below this many papers in a year, counts read as noise (a "2" looks like an error),
// so absences become sentences and per-band totals are dropped. CHOSEN, not computed —
// the surface says so. Heymach 2020 (43) is dense; 2016 (7) is sparse.
export const SPARSE_THRESHOLD = 8;

const C = {
  bg: "#08080a", gold: "#d8a34a", goldHi: "#f0c477", goldBg: "#1a140a",
  ink: "#e6e3dd", ink2: "#c6c2bb", mid: "#6f6d68", dim: "#57554f", faint: "#46443f", faint2: "#3f3d39",
  line: "#1e1e21", line2: "#2a2a2e", tick: "#33322f", tickOn: "#6f6d68",
} as const;
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const SERIF = "'Source Serif 4',Georgia,serif";

type Order = "contribution" | "cited" | "recent";
type Density = "ledger" | "detail";

interface Band {
  label: string;
  note: string;
  count: string | null; // null in sparse years (counts dropped)
  rows: PublicationListRow[];
  senior: boolean;
}

const citeN = (r: PublicationListRow) => r.citation_count ?? 0;
const monthKey = (r: PublicationListRow) =>
  r.pub_date ? Date.parse(r.pub_date) || (r.pub_year ?? 0) * 1e10 : (r.pub_year ?? 0) * 1e10;

function journalShort(j: string | null): string {
  if (!j) return "";
  return j.replace(/\s*\([^)]*\)\s*/g, "").replace(/[.:].*$/, "").trim().slice(0, 40);
}

// The provenance line: PMID · journal, then study-type / theme / assets, each present
// only when it has a value. No labels, no reserved slots — it simply shortens.
function ProvenanceLine({ r }: { r: PublicationListRow }) {
  const bits: React.ReactNode[] = [];
  if (r.pmid) bits.push(
    <a key="pmid" href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer" style={{ color: C.mid, borderBottom: `1px solid ${C.line2}` }}>PMID {r.pmid}</a>,
  );
  const j = journalShort(r.journal);
  if (j) bits.push(<span key="j">{j}</span>);
  if (r.studyType) bits.push(<span key="st" style={{ color: C.mid }}>{r.studyType}</span>);
  if (r.themeShort) bits.push(<span key="th" style={{ color: C.mid }}>{r.themeShort}</span>);
  for (const a of r.assets ?? []) bits.push(<span key={`a-${a.slug}`} style={{ color: C.gold }}>{a.generic}</span>);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, font: `400 10px/1.5 ${MONO}`, letterSpacing: ".04em", color: C.dim }}>
      {bits.map((b, i) => (
        <span key={i} style={{ display: "inline-flex", gap: 10 }}>{i > 0 ? <span style={{ color: C.faint2 }}>·</span> : null}{b}</span>
      ))}
    </div>
  );
}

// Full-text: OA badge (readable) / a subscription DOI link / the one stated absence.
function FullText({ r }: { r: PublicationListRow }) {
  if (r.fullTextIsOa && r.fullTextUrl)
    return <a href={r.fullTextUrl} target="_blank" rel="noreferrer" style={{ font: `600 9px/1 ${MONO}`, letterSpacing: ".14em", color: C.gold, border: `1px solid ${C.faint}`, padding: "4px 7px" }}>OPEN ACCESS ↗</a>;
  if (r.fullTextUrl)
    return <a href={r.fullTextUrl} target="_blank" rel="noreferrer" style={{ font: `500 9px/1 ${MONO}`, letterSpacing: ".1em", color: C.mid }}>View on publisher ↗</a>;
  return <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".04em", color: C.faint }}>Subscription only — no full text held.</span>;
}

// Byline with the HCP's own surname picked out in gold — position shown as a fact,
// never computed into a number the truncated author string cannot support.
function Byline({ r, surname }: { r: PublicationListRow; surname: string }) {
  const text = bylineOf(r);
  if (!text) return null;
  const cut = surname ? text.indexOf(surname) : -1;
  const node = cut < 0
    ? <span>{text}</span>
    : <>
        <span>{text.slice(0, cut)}</span>
        <span style={{ color: C.gold }}>{text.slice(cut, cut + surname.length)}</span>
        <span>{text.slice(cut + surname.length)}</span>
      </>;
  return (
    <div style={{ font: `400 12px/1.5 ${SERIF}`, color: C.mid }}>
      {node}
      {r.total_authors && r.total_authors > 0 ? <span style={{ color: C.faint }}> · {r.total_authors} authors</span> : null}
    </div>
  );
}

function bylineOf(r: PublicationListRow): string {
  if (r.bylineText) return r.bylineText;
  const a = r.pubmed_authorships;
  if (!Array.isArray(a)) return "";
  const names = a
    .map((x) => {
      const o = x as { last_name?: string; initials?: string; fore_name?: string };
      const last = o.last_name ?? "";
      const init = o.initials ?? (o.fore_name ? o.fore_name[0] : "");
      return last ? `${last}${init ? " " + init : ""}` : "";
    })
    .filter(Boolean);
  if (names.length <= 8) return names.join(", ");
  return `${names.slice(0, 6).join(", ")}, … ${names[names.length - 1]}`;
}

function Row({ r, surname, density }: { r: PublicationListRow; surname: string; density: Density }) {
  const senior = !!r.is_senior_author;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "68px 1fr 150px", gap: 20, padding: "13px 0", borderTop: `1px solid ${C.line}`, alignItems: "baseline" }}>
      {/* citation figure column — gold for senior, quiet for co-author */}
      <div style={{ textAlign: "right", font: `600 ${senior ? 17 : 14}px/1 ${MONO}`, color: senior ? C.gold : C.mid, fontVariantNumeric: "tabular-nums" }}>
        {citeN(r).toLocaleString()}
        <div style={{ font: `400 8px/1.4 ${MONO}`, letterSpacing: ".1em", color: C.faint2, marginTop: 4 }}>CITED</div>
      </div>
      {/* title + provenance (+ byline in DETAIL) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
        <div style={{ font: `${senior ? 500 : 400} ${senior ? 16 : 14}px/1.4 ${SERIF}`, color: senior ? C.ink : C.ink2, textWrap: "pretty" }}>{r.title}</div>
        {density === "detail" ? <Byline r={r} surname={surname} /> : null}
        <ProvenanceLine r={r} />
        {/* Create-capable discuss affordance (2026-08-06): the redesign had gated
            this to existing-threads-only as a sort/clutter decision (Publications
            List.dc.html) — not compliance — which silently removed the documented
            demo path (bibliography → paper → create thread). Restored via the shared
            component, which deep-links to primary_thread_id where a thread exists and
            opens the anchor-prefilled composer where none does. Founder-gated inside. */}
        {r.pmid ? (
          <DiscussAffordance pmid={r.pmid} journalAbbrev={r.journal} title={r.title} compact />
        ) : null}
      </div>
      {/* full-text access */}
      <div style={{ textAlign: "right" }}><FullText r={r} /></div>
    </div>
  );
}

export default function PublicationsSurface({
  rows,
  surname,
  year,
  hcpName,
}: {
  rows: PublicationListRow[];
  surname: string;
  year?: number; // year-scoped view; absent → whole record
  hcpName?: string;
}) {
  const [order, setOrder] = useState<Order>("contribution");
  const [density, setDensity] = useState<Density>("ledger");
  const [oaOnly, setOaOnly] = useState(false);
  const [threadOnly, setThreadOnly] = useState(false);

  const nTotal = rows.length;
  const nSenior = rows.filter((r) => r.is_senior_author).length;
  const nOa = rows.filter((r) => r.fullTextIsOa).length;
  const nThread = rows.filter((r) => r.hasThread).length;
  const sparse = nTotal > 0 && nTotal < SPARSE_THRESHOLD;

  const filtered = useMemo(() => {
    let rs = rows;
    if (oaOnly) rs = rs.filter((r) => r.fullTextIsOa);
    if (threadOnly) rs = rs.filter((r) => r.hasThread);
    return rs;
  }, [rows, oaOnly, threadOnly]);

  const bands: Band[] = useMemo(() => {
    if (order === "contribution") {
      const s = filtered.filter((r) => r.is_senior_author).sort((a, b) => citeN(b) - citeN(a));
      const c = filtered.filter((r) => !r.is_senior_author).sort((a, b) => citeN(b) - citeN(a));
      const out: Band[] = [];
      // Per-band counts are dropped in sparse years (a "3" reads as an error at n=4).
      if (s.length) out.push({ label: "SENIOR AUTHOR", note: "THE PAPERS THAT ARE HIS", count: sparse ? null : `${s.length} ${s.length === 1 ? "PAPER" : "PAPERS"}`, rows: s, senior: true });
      if (c.length) out.push({ label: "CO-AUTHOR", note: "LISTED AMONG THE AUTHORS", count: sparse ? null : `${c.length} PAPERS`, rows: c, senior: false });
      return out;
    }
    if (order === "cited")
      return [{ label: "MOST CITED FIRST", note: "ROLE SHOWN ON EVERY ROW", count: sparse ? null : `${filtered.length} PAPERS`, rows: filtered.slice().sort((a, b) => citeN(b) - citeN(a)), senior: false }];
    return [{ label: "MOST RECENT FIRST", note: "BY PUBLICATION DATE", count: sparse ? null : `${filtered.length} PAPERS`, rows: filtered.slice().sort((a, b) => monthKey(b) - monthKey(a)), senior: false }];
  }, [filtered, order, sparse]);

  const shownCount = filtered.length;
  const scopeLabel = year != null ? String(year) : "THE RECORD";

  const tab = (active: boolean): React.CSSProperties => ({
    font: `500 10px/1 ${MONO}`, letterSpacing: ".13em", padding: "6px 11px", cursor: "pointer",
    color: active ? C.bg : C.mid, background: active ? C.gold : "transparent",
  });
  const filt = (active: boolean): React.CSSProperties => ({
    font: `500 10px/1 ${MONO}`, letterSpacing: ".13em", padding: "6px 11px", cursor: "pointer",
    border: `1px solid ${active ? C.gold : C.line2}`, color: active ? C.gold : C.mid, background: active ? C.goldBg : "transparent",
  });

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 22 }}>
      {/* controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", borderBottom: `1px solid ${C.line}`, paddingBottom: 14 }}>
        <div style={{ display: "flex", gap: 2 }}>
          <div onClick={() => setOrder("contribution")} style={tab(order === "contribution")}>CONTRIBUTION</div>
          <div onClick={() => setOrder("cited")} style={tab(order === "cited")}>MOST CITED</div>
          <div onClick={() => setOrder("recent")} style={tab(order === "recent")}>RECENT</div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <div onClick={() => setDensity("ledger")} style={tab(density === "ledger")}>LEDGER</div>
          <div onClick={() => setDensity("detail")} style={tab(density === "detail")}>DETAIL</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <div onClick={() => setOaOnly((v) => !v)} style={filt(oaOnly)}>OPEN ACCESS · {nOa}</div>
          <div onClick={() => setThreadOnly((v) => !v)} style={filt(threadOnly)}>HAS A DISCUSSION THREAD · {nThread}</div>
        </div>
      </div>

      {/* bands */}
      {bands.map((band) => (
        <section key={band.label} style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 6 }}>
            <span style={{ font: `600 10.5px/1 ${MONO}`, letterSpacing: ".2em", color: band.senior ? C.ink : C.ink2 }}>{band.label}</span>
            <span style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".14em", color: C.dim }}>{band.note}</span>
            {band.count ? <span style={{ marginLeft: "auto", font: `400 9.5px/1 ${MONO}`, letterSpacing: ".11em", color: C.dim }}>{band.count}</span> : null}
          </div>
          {/* senior band carries the gold rule */}
          <div style={{ height: 2, background: band.senior ? C.gold : C.line2 }} />
          {band.rows.map((r) => (
            <Row key={r.id} r={r} surname={surname} density={density} />
          ))}
        </section>
      ))}

      {/* sparse-year sentences — absences stated, not counted */}
      {sparse ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          <span style={{ font: `400 13px/1.6 ${SERIF}`, color: C.mid }}>{oaSentence(nOa, nTotal)}</span>
          <span style={{ font: `400 13px/1.6 ${SERIF}`, color: C.mid }}>{threadSentence(nThread)}</span>
          <span style={{ font: `400 8.5px/1.4 ${MONO}`, letterSpacing: ".1em", color: C.faint2, paddingTop: 4 }}>
            SHORT YEAR · SENTENCES NOT COUNTS BELOW {SPARSE_THRESHOLD} PAPERS (A CHOSEN THRESHOLD)
          </span>
        </div>
      ) : null}

      {/* footer — shown against held */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14, flexWrap: "wrap" }}>
        <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".12em", color: C.dim }}>
          {shownCount === nTotal
            ? `END OF ${scopeLabel} · ${nTotal} OF ${nTotal} PAPER${nTotal === 1 ? "" : "S"} HELD`
            : `SHOWING ${shownCount} OF ${nTotal} PAPERS HELD · CLEAR NARROWING TO SEE THE REST`}
        </span>
        {!sparse && nThread === 0 ? (
          <span style={{ marginLeft: "auto", font: `400 9.5px/1 ${MONO}`, letterSpacing: ".08em", color: C.faint2 }}>No discussion threads on any paper{year != null ? " from this year" : ""}.</span>
        ) : null}
      </div>
      {hcpName ? <span style={{ font: `400 9px/1 ${MONO}`, letterSpacing: ".1em", color: C.faint2 }}>{hcpName.toUpperCase()} · {nSenior} SENIOR-AUTHOR · {nTotal - nSenior} CO-AUTHORED</span> : null}
    </div>
  );
}

function oaSentence(nOa: number, nTotal: number): string {
  if (nOa === 0) return "No paper from this year is open access.";
  const w = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
  const oa = nOa < w.length ? w[nOa] : String(nOa);
  const tot = nTotal < w.length ? w[nTotal] : String(nTotal);
  return `${oa.charAt(0).toUpperCase()}${oa.slice(1)} of ${tot} are open access.`;
}
function threadSentence(nThread: number): string {
  if (nThread === 0) return "No discussion threads on any paper from this year.";
  return `${nThread} paper${nThread === 1 ? " has" : "s have"} a discussion thread.`;
}
