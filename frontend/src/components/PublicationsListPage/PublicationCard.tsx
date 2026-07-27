import type { PublicationListRow } from "../../lib/publicationsList";
import { formatByline } from "../../lib/authorByline";
import { COLOR, ELEVATION, FONT } from "../../lib/designTokens";

interface Props {
  pub: PublicationListRow;
}

// Collaborator/standalone cards have room; cap the byline at 10 names then
// "+ N more" so long consortium lists don't bury the title.
const BYLINE_CAP = 10;

export default function PublicationCard({ pub }: Props) {
  const pubmedUrl = pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/` : null;
  const byline = formatByline(pub.pubmed_authorships, BYLINE_CAP);

  return (
    <div
      style={{
        ...ELEVATION.card,
        borderLeft: `3px solid ${COLOR.amber}`,
        padding: "14px 16px",
        fontFamily: FONT.sans,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
        <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: COLOR.amber, fontFamily: FONT.mono, fontVariantNumeric: "tabular-nums" }}>
            {pub.citation_count != null ? pub.citation_count.toLocaleString() : "—"}
          </span>
          <span style={{ fontSize: 12, color: COLOR.ink3 }}>citations</span>
        </div>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: COLOR.ink1,
          marginTop: 8,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        {pub.title}
      </div>

      <div
        style={{
          fontSize: 12,
          color: COLOR.ink3,
          marginBottom: 8,
          lineHeight: 1.4,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {pub.journal ? <span style={{ color: COLOR.amber }}>{pub.journal}</span> : null}
        {pub.journal && byline ? <span> · </span> : null}
        <span>{byline || "Authors not available"}</span>
      </div>

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: COLOR.ink4 }}>
        <span style={{ fontFamily: FONT.mono }}>{pub.pmid ? `PMID ${pub.pmid}` : ""}</span>
        {pubmedUrl ? (
          <a
            href={pubmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: COLOR.indigoLink, textDecoration: "none" }}
          >
            View Abstract
          </a>
        ) : null}
      </div>
    </div>
  );
}
