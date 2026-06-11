import type { PublicationListRow } from "../../lib/publicationsList";

interface Props {
  pub: PublicationListRow;
}

export default function PublicationCard({ pub }: Props) {
  const pubmedUrl = pub.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/` : null;

  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderLeft: "3px solid #E8A020",
        borderRadius: 6,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            backgroundColor: pub.is_first_author ? "rgba(63,184,175,0.15)" : "rgba(107,106,101,0.15)",
            border: `1px solid ${pub.is_first_author ? "#3FB8AF" : "#3A3A3F"}`,
            color: pub.is_first_author ? "#3FB8AF" : "#9B9892",
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
          <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>
            {pub.citation_count != null ? pub.citation_count.toLocaleString() : "—"}
          </span>
          <span style={{ fontSize: 12, color: "#9B9892" }}>citations</span>
        </div>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#E8E6DF",
          marginTop: 8,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        {pub.title}
      </div>

      <div style={{ fontSize: 12, color: "#9B9892", marginBottom: 8, lineHeight: 1.4 }}>
        {pub.journal ? <span style={{ color: "#E8A020" }}>{pub.journal}</span> : null}
        {pub.journal ? <span> · </span> : null}
        <span>Authors not available</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#6B6A65" }}>
        <span>{pub.pmid ? `PMID ${pub.pmid}` : ""}</span>
        {pubmedUrl ? (
          <a
            href={pubmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#9B6DFF", textDecoration: "none" }}
          >
            View abstract →
          </a>
        ) : null}
      </div>
    </div>
  );
}
