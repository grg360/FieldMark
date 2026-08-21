// Co-authorship pair surface — the bibliography chrome (PublicationsSurface) on a
// TWO-SUBJECT record. Adopted 2026-08-20, replacing the PublicationCard list the pair
// route shared with the institution list.
//
// WHAT IS DELIBERATELY NOT HERE, and why (all four are single-subject constructs the
// pair RPC cannot back and the page could not mean):
//   • Contribution bands / SENIOR AUTHOR / CO-AUTHOR. get_shared_publications returns
//     publications_v2 columns only — no is_senior_author, no total_authors. Even with
//     the flags, "THE PAPERS THAT ARE HIS" has no referent when there are two subjects.
//   • The senior gold left-rule and the gold/large citation numeral. Gold IS the senior
//     signal on the bibliography; carrying it here would import a claim we cannot make,
//     so every row takes ONE neutral numeral treatment.
//   • The CONTRIBUTION ordering tab — same missing flags.
//   • scopeLabel / CITATIONS · THIS YEAR — the pair route has no year scope.
// The role flags are one join away in the RPC (a.is_senior_author, b.is_senior_author,
// both sides already joined). That is a post-demo change, not this one.

import { useMemo, useState, type ReactNode } from "react";
import { useMediaQuery } from "../../lib/useMediaQuery";
import type { PublicationListRow } from "../../lib/publicationsList";
import DiscussAffordance from "../FieldIntelligenceForum/DiscussAffordance";
// Palette, faces and the three row primitives come FROM the bibliography rather than
// being re-declared here — the surfaces must not drift. journalShort() rides inside
// ProvenanceLine (it is what shortens "Clinical cancer research : an official journal
// of the American Association for Cancer Research" to one line).
import { C as SURF, MONO, SERIF, ProvenanceLine, FullText, bylineOf } from "./PublicationsSurface";

type Order = "cited" | "recent";
type Density = "ledger" | "detail";

const citeN = (r: PublicationListRow) => r.citation_count ?? 0;
const monthKey = (r: PublicationListRow) =>
  r.pub_date ? Date.parse(r.pub_date) || (r.pub_year ?? 0) * 1e10 : (r.pub_year ?? 0) * 1e10;

// Shared row grid — the column header and every row use it (bibliography frame).
const GRID = "84px 1fr 210px";

const EN_DASH = String.fromCharCode(0x2013);

// BOTH surnames, ONE treatment. The bibliography's Byline takes a single `surname` and
// indexOf's it; a pair page cannot use that without privileging whichever name it was
// handed. Every occurrence of either surname takes the same gold — no second colour, no
// weighting, no ordering. Longest-first alternation so one surname that contains another
// ("Sun" inside "Sundaram") cannot half-match.
function highlightSurnames(text: string, surnames: string[]): ReactNode[] {
  const names = surnames.map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return [text];
  const escaped = [...names]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    names.some((n) => n.toLowerCase() === part.toLowerCase())
      ? <span key={i} style={{ color: SURF.gold }}>{part}</span>
      : <span key={i}>{part}</span>,
  );
}

// The byline is truncated by the source data on long author lists, so a surname is not
// guaranteed to appear in it. An absent highlight is an absent string — never a claim
// that the HCP was not on the paper.
function PairByline({ r, surnames }: { r: PublicationListRow; surnames: string[] }) {
  const text = bylineOf(r);
  if (!text) return null;
  return (
    <div style={{ font: `400 12px/1.5 ${SERIF}`, color: SURF.mid }}>
      {highlightSurnames(text, surnames)}
    </div>
  );
}

function Row({ r, surnames, density }: { r: PublicationListRow; surnames: string[]; density: Density }) {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : GRID, gap: isMobile ? 10 : 24, padding: "15px 0", borderTop: `1px solid ${SURF.line}`, alignItems: "flex-start" }}>
      {/* citation figure column — ONE treatment for every row (see the header note) */}
      <div style={{ textAlign: "right", font: `400 17px/1 ${MONO}`, color: SURF.ink2, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", paddingTop: 3 }}>
        {citeN(r).toLocaleString()}
      </div>
      {/* title → byline (DETAIL) → provenance → discuss. No role eyebrow: the pair
          query returns no author position, and the card this replaced was printing a
          hardcoded "Co-author" chip on every row as a fallback, not as a fact. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
        <div style={{ font: `400 17px/1.32 ${SERIF}`, color: SURF.ink, textWrap: "pretty" }}>{r.title}</div>
        {density === "detail" ? <PairByline r={r} surnames={surnames} /> : null}
        <ProvenanceLine r={r} />
        {/* Same create-capable affordance the pair page already carried through
            PublicationCard — same component, same founder gate, unchanged exposure. */}
        {r.pmid ? (
          <DiscussAffordance pmid={r.pmid} journalAbbrev={r.journal} title={r.title} compact />
        ) : null}
      </div>
      {/* access & actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <FullText r={r} />
        {r.pmid ? (
          <a href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer" style={{ font: `500 10px/1 ${MONO}`, letterSpacing: ".12em", color: SURF.ink2 }}>ABSTRACT ↗</a>
        ) : null}
      </div>
    </div>
  );
}

export default function PairPublicationsSurface({
  rows,
  surnames,
  limit,
}: {
  rows: PublicationListRow[];
  /** Both HCPs' surnames. Order carries no meaning — both take identical treatment. */
  surnames: string[];
  /** The p_limit the RPC was called with, so the footer can say "top N" rather than
   *  claiming a capped set is everything held. */
  limit?: number;
}) {
  const isMobileHead = useMediaQuery("(max-width: 767px)");
  const [order, setOrder] = useState<Order>("cited");
  const [density, setDensity] = useState<Density>("ledger");
  const [oaOnly, setOaOnly] = useState(false);

  const nTotal = rows.length;
  const nOa = rows.filter((r) => r.fullTextIsOa).length;
  const totalCites = rows.reduce((s, r) => s + citeN(r), 0);

  // Year span — the third stat. Derived from the RPC's own pub_year; nothing renders a
  // number when no row carries a year.
  const years = rows.map((r) => r.pub_year).filter((y): y is number => y != null);
  const span = years.length
    ? (() => {
        const lo = Math.min(...years);
        const hi = Math.max(...years);
        return lo === hi ? String(lo) : `${lo}${EN_DASH}${hi}`;
      })()
    : null;

  const filtered = useMemo(() => (oaOnly ? rows.filter((r) => r.fullTextIsOa) : rows), [rows, oaOnly]);

  const ordered = useMemo(() => {
    const rs = filtered.slice();
    return order === "cited"
      ? rs.sort((a, b) => citeN(b) - citeN(a) || (b.pub_year ?? 0) - (a.pub_year ?? 0))
      : rs.sort((a, b) => monthKey(b) - monthKey(a));
  }, [filtered, order]);

  const shownCount = ordered.length;
  const capped = limit != null && nTotal >= limit;

  const tab = (active: boolean): React.CSSProperties => ({
    font: `500 10px/1 ${MONO}`, letterSpacing: ".13em", padding: "6px 11px", cursor: "pointer",
    color: active ? SURF.bg : SURF.mid, background: active ? SURF.gold : "transparent",
  });
  const filt = (active: boolean): React.CSSProperties => ({
    font: `500 10px/1 ${MONO}`, letterSpacing: ".13em", padding: "6px 11px", cursor: "pointer",
    border: `1px solid ${active ? SURF.gold : SURF.line2}`, color: active ? SURF.gold : SURF.mid,
    background: active ? SURF.goldBg : "transparent",
  });

  const Stat = ({ n, label }: { n: string; label: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ font: `400 22px/1 ${MONO}`, letterSpacing: "-.02em", color: SURF.ink2, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ font: `500 9px/1 ${MONO}`, letterSpacing: ".14em", color: SURF.dim }}>{label}</div>
    </div>
  );

  return (
    // Inner band, inset on all four sides — same structure and reasoning as the
    // bibliography's root (a visible ground is an edge, and an edge needs clearance).
    <div style={{ background: SURF.bg, color: SURF.ink, fontFamily: MONO, display: "flex", flexDirection: "column", gap: 22, padding: 20 }}>
      {/* Header stats — THREE, all derivable from the rows already fetched. No senior /
          co-author split (no role flags), no thread count (no hasThread fetch). */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 34, flexWrap: "wrap", paddingBottom: 4 }}>
        <Stat n={String(nTotal)} label="SHARED PAPERS" />
        <Stat n={totalCites.toLocaleString()} label="CITATIONS" />
        <Stat n={span ?? "—"} label="PUBLICATION SPAN" />
      </div>

      {/* controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", borderBottom: `1px solid ${SURF.line}`, paddingBottom: 14 }}>
        <div style={{ display: "flex", gap: 2 }}>
          <div onClick={() => setOrder("cited")} style={tab(order === "cited")}>MOST CITED</div>
          <div onClick={() => setOrder("recent")} style={tab(order === "recent")}>RECENT</div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <div onClick={() => setDensity("ledger")} style={tab(density === "ledger")}>LEDGER</div>
          <div onClick={() => setDensity("detail")} style={tab(density === "detail")}>DETAIL</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <div onClick={() => setOaOnly((v) => !v)} style={filt(oaOnly)}>OPEN ACCESS · {nOa}</div>
        </div>
      </div>

      {/* column header — the row grid, labelled once. No CONTRIBUTION segment: there is
          no contribution column on this surface. */}
      <div style={{ display: isMobileHead ? "none" : "grid", gridTemplateColumns: GRID, gap: 24, paddingBottom: 9, borderBottom: `1px solid ${SURF.line}`, font: `500 9px/1 ${MONO}`, letterSpacing: ".15em", color: SURF.faint }}>
        <div style={{ textAlign: "right" }}>CITATIONS</div>
        <div>TITLE · SOURCE</div>
        <div>ACCESS &amp; ACTIONS</div>
      </div>

      {/* ONE section, labelled by the active ordering — the bibliography's own shape for
          a non-contribution order (its `cited`/`recent` branches are single bands too).
          The rule is neutral line2, never the senior gold. */}
      <section style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingBottom: 6 }}>
          <span style={{ font: `600 10.5px/1 ${MONO}`, letterSpacing: ".2em", color: SURF.ink2 }}>
            {order === "cited" ? "MOST CITED FIRST" : "MOST RECENT FIRST"}
          </span>
          <span style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".14em", color: SURF.dim }}>
            {order === "cited" ? "PAPERS BOTH ARE ON" : "BY PUBLICATION DATE"}
          </span>
          <span style={{ marginLeft: "auto", font: `400 9.5px/1 ${MONO}`, letterSpacing: ".11em", color: SURF.dim }}>
            {shownCount} {shownCount === 1 ? "PAPER" : "PAPERS"}
          </span>
        </div>
        <div style={{ height: 2, background: SURF.line2 }} />
        {ordered.map((r) => (
          <Row key={r.id} r={r} surnames={surnames} density={density} />
        ))}
      </section>

      {/* footer — shown against held */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, borderTop: `1px solid ${SURF.line}`, paddingTop: 14, flexWrap: "wrap" }}>
        <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".12em", color: SURF.dim }}>
          {capped
            ? `SHOWING THE ${nTotal} MOST CITED · THE PAIR MAY HOLD MORE`
            : shownCount === nTotal
              ? `END OF THE SHARED RECORD · ${nTotal} OF ${nTotal} PAPER${nTotal === 1 ? "" : "S"} HELD`
              : `SHOWING ${shownCount} OF ${nTotal} PAPERS HELD · CLEAR NARROWING TO SEE THE REST`}
        </span>
      </div>
    </div>
  );
}
