import { Link } from "react-router-dom";
import type { PublicationListRow } from "../../lib/publicationsList";
import { formatByline } from "../../lib/authorByline";
import { COLOR, ELEVATION, FONT } from "../../lib/designTokens";
import DiscussAffordance from "../FieldIntelligenceForum/DiscussAffordance";
import type { DiscussAffordance as Affordance } from "../../lib/fieldIntelligence";
// Palette (2026-08-19): the OPEN ACCESS chip and its link were #7fb094, a second green on
// a page that already carried another (#7ba36f on the stat). Teal is the canonical colour
// for "this is clickable" (ACTION.LINK) and the chip IS a link to the full text, so it keeps
// a distinguishing colour without borrowing green's meaning. Its border takes LINE.EDGE
// rather than a green-tinted rgba.
import { CANON } from "../../lib/canonicalTokens";

interface Props {
  pub: PublicationListRow;
  // When the list has batch-loaded discussion data (for the DISCUSSED sort), it
  // passes the affordance down so the card doesn't re-fetch. undefined = fetch.
  affordance?: Affordance | null;
  isMobile?: boolean;
  // Gate the discussion affordance: show OPEN DISCUSSION only where a thread exists,
  // no "ask the first question" on threadless rows. Set by list surfaces that display
  // discussion but don't create it (the institution list); left false where thread
  // creation belongs (the bibliography).
  existingOnly?: boolean;
}

// Single-column full-width row (Design frame 01): meta · title · characterisation
// line · byline, with the discussion affordance on the right. Density per screen
// goes down, content per row goes up — the intended trade for a literature audience.
const BYLINE_CAP = 10;

// Author-position chip — three-way (First / Senior / Co), preserving the year
// bibliography's richer treatment across every surface. Senior = last-named /
// trailing-collective author, from is_senior_author.
function authorChip(pub: PublicationListRow) {
  if (pub.is_first_author) return { label: "First author", fg: "#3FB8AF", bg: "rgba(63,184,175,0.15)", border: "#3FB8AF" };
  if (pub.is_senior_author) return { label: "Senior author", fg: COLOR.info, bg: "rgba(79,163,199,0.14)", border: COLOR.info };
  return { label: "Co-author", fg: COLOR.ink3, bg: "rgba(107,106,101,0.15)", border: COLOR.ink5 };
}

export default function PublicationCard({ pub, affordance, isMobile, existingOnly }: Props) {
  const pubmedUrl = pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/` : null;
  const byline = pub.bylineText ?? formatByline(pub.pubmed_authorships, BYLINE_CAP);
  const chip = authorChip(pub);

  // Characterisation line: study type · theme, whatever exists. Nothing when empty.
  const characterisation = [pub.studyType, pub.themeShort].filter(Boolean).join(" · ");

  const meta = mono(10.5, COLOR.ink3);

  return (
    <div
      style={{
        ...ELEVATION.card,
        borderLeft: `3px solid ${COLOR.amber}`,
        padding: "16px 18px",
        fontFamily: FONT.sans,
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 216px",
        gap: isMobile ? 12 : 20,
        alignItems: "start",
      }}
    >
      {/* left: the paper */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {/* meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {pub.journal && <span style={{ ...meta, color: COLOR.indigoLink }}>{pub.journal}{pub.pub_year ? ` · ${pub.pub_year}` : ""}</span>}
          {pub.pmid && <span style={meta}>PMID {pub.pmid}</span>}
          <span style={{ ...mono(10.5, COLOR.ink5) }}>
            {pub.citation_count != null ? `${pub.citation_count.toLocaleString()} citations` : "—"}
          </span>
          {/* author-position chip — three-way (First / Senior / Co) */}
          <span
            style={{
              backgroundColor: chip.bg,
              border: `1px solid ${chip.border}`,
              color: chip.fg,
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 3,
              lineHeight: 1.4,
            }}
          >
            {chip.label}
          </span>
        </div>

        {/* title */}
        <div style={{ fontFamily: FONT.serif, fontSize: 17, fontWeight: 500, color: COLOR.ink1, lineHeight: 1.35 }}>
          {pub.title}
        </div>

        {/* characterisation line — beneath the title, only when it has content */}
        {characterisation && (
          <div style={{ ...mono(11, COLOR.ink3), letterSpacing: "0.02em" }}>{characterisation}</div>
        )}

        {/* assets mentioned — the lateral entry point into the asset pages
            (frame 1e). Each name links to /assets/:slug; nothing renders when the
            publication matched no tracked asset. Capped so a chemo-heavy paper's
            long backbone list doesn't overrun the row. */}
        {pub.assets && pub.assets.length > 0 && (
          <div style={{ ...mono(10.5, COLOR.ink4), letterSpacing: "0.04em", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ color: COLOR.ink5 }}>DRUGS</span>
            {pub.assets.slice(0, 4).map((a) => (
              <Link
                key={a.slug}
                to={`/assets/${a.slug}`}
                style={{ color: COLOR.indigoLink, textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                {a.generic.toLowerCase()}
              </Link>
            ))}
            {pub.assets.length > 4 && <span style={{ color: COLOR.ink5 }}>+{pub.assets.length - 4}</span>}
          </div>
        )}

        {/* byline (kept — collaboration intelligence) */}
        <div style={{ fontSize: 12, color: COLOR.ink4, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {byline || "Authors not available"}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 2 }}>
          {pubmedUrl && (
            <a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ ...mono(10.5, COLOR.indigoLink), textDecoration: "none" }}>
              View Abstract ↗
            </a>
          )}
          {/* Full-text access — open-access reads as such; else a publisher link
              that doesn't imply readability; no DOI → nothing. */}
          {pub.fullTextUrl && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <a href={pub.fullTextUrl} target="_blank" rel="noopener noreferrer" style={{ ...mono(10.5, pub.fullTextIsOa ? CANON.ACTION.LINK : COLOR.indigoLink), textDecoration: "none" }}>
                {pub.fullTextIsOa ? "Read full text ↗" : "View on publisher ↗"}
              </a>
              {pub.fullTextIsOa && (
                <span style={{ ...mono(8.5, CANON.ACTION.LINK), letterSpacing: "0.1em", border: `1px solid ${CANON.LINE.EDGE}`, borderRadius: 2, padding: "1px 5px" }}>
                  OPEN ACCESS
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* right: discussion affordance (compact) + reserved slots */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: isMobile ? "flex-start" : "flex-end" }}>
        {/* existingOnly (set by the caller): OPEN DISCUSSION only where a thread
            exists — no "ask the first question" on a threadless row. */}
        <DiscussAffordance pmid={pub.pmid} journalAbbrev={pub.journal} title={pub.title} compact affordance={affordance} existingOnly={existingOnly} />
        {/* Reserved, empty by design (out of scope this pass): territory relevance
            and "flagged by N MSLs" — rendered as nothing until there is something true. */}
      </div>
    </div>
  );
}

function mono(size: number, color: string) {
  return { fontFamily: FONT.mono, fontSize: size, color, letterSpacing: "0.04em" as const };
}
