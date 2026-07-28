import type { PublicationListRow } from "../../lib/publicationsList";
import { formatByline } from "../../lib/authorByline";
import { COLOR, ELEVATION, FONT } from "../../lib/designTokens";
import DiscussAffordance from "../FieldIntelligenceForum/DiscussAffordance";
import type { DiscussAffordance as Affordance } from "../../lib/fieldIntelligence";

interface Props {
  pub: PublicationListRow;
  // When the list has batch-loaded discussion data (for the DISCUSSED sort), it
  // passes the affordance down so the card doesn't re-fetch. undefined = fetch.
  affordance?: Affordance | null;
  isMobile?: boolean;
}

// Single-column full-width row (Design frame 01): meta · title · characterisation
// line · byline, with the discussion affordance on the right. Density per screen
// goes down, content per row goes up — the intended trade for a literature audience.
const BYLINE_CAP = 10;

export default function PublicationCard({ pub, affordance, isMobile }: Props) {
  const pubmedUrl = pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/` : null;
  const byline = formatByline(pub.pubmed_authorships, BYLINE_CAP);

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
          {/* author-position chip — preserved as-is */}
          <span
            style={{
              backgroundColor: pub.is_first_author ? "rgba(63,184,175,0.15)" : "rgba(107,106,101,0.15)",
              border: `1px solid ${pub.is_first_author ? "#3FB8AF" : COLOR.ink5}`,
              color: pub.is_first_author ? "#3FB8AF" : COLOR.ink3,
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 3,
              lineHeight: 1.4,
            }}
          >
            {pub.is_first_author ? "First author" : "Co-author"}
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

        {/* byline (kept — collaboration intelligence) */}
        <div style={{ fontSize: 12, color: COLOR.ink4, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {byline || "Authors not available"}
        </div>

        {pubmedUrl && (
          <a href={pubmedUrl} target="_blank" rel="noopener noreferrer" style={{ ...mono(10.5, COLOR.indigoLink), textDecoration: "none", width: "fit-content" }}>
            View Abstract ↗
          </a>
        )}
      </div>

      {/* right: discussion affordance (compact) + reserved slots */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: isMobile ? "flex-start" : "flex-end" }}>
        <DiscussAffordance pmid={pub.pmid} journalAbbrev={pub.journal} title={pub.title} compact affordance={affordance} />
        {/* Reserved, empty by design (out of scope this pass): territory relevance
            and "flagged by N MSLs" — rendered as nothing until there is something true. */}
      </div>
    </div>
  );
}

function mono(size: number, color: string) {
  return { fontFamily: FONT.mono, fontSize: size, color, letterSpacing: "0.04em" as const };
}
