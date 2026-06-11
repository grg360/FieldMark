import { useNavigate } from "react-router-dom";
import type { ExternalPartnerInstitution } from "../lib/api";

interface Props {
  partners: ExternalPartnerInstitution[];
  sourceInstitutionName: string;
}

export default function InstitutionExternalPartnersPanel({ partners, sourceInstitutionName }: Props) {
  const navigate = useNavigate();

  if (partners.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: "1px solid #1E1E22",
        borderRadius: 6,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#E8E6DF",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        Top External Partner Institutions
      </div>
      <div style={{ fontSize: 11, color: "#6B6A65", marginBottom: 12 }}>
        Ranked by total co-publications with {sourceInstitutionName}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {partners.map((p) => (
          <div
            key={p.slug}
            onClick={() => navigate(`/institution/${p.slug}`)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              backgroundColor: "#15131A",
              borderRadius: 4,
              cursor: "pointer",
              transition: "background-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1A1820";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#15131A";
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: "#E8E6DF",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.institution_name}
              </div>
              <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 2 }}>
                {p.source_investigators_count}{" "}
                {p.source_investigators_count === 1 ? "investigator" : "investigators"}
                {" \u2194 "}
                {p.partner_investigators_count}{" "}
                {p.partner_investigators_count === 1 ? "investigator" : "investigators"}
              </div>
              {p.top_connection ? (
                <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 4 }}>
                  Top pair:{" "}
                  <span style={{ color: "#9B9892" }}>{p.top_connection.source_name}</span>
                  {" \u2194 "}
                  <span style={{ color: "#9B9892" }}>{p.top_connection.partner_name}</span>
                  {" ("}
                  {p.top_connection.shared_publications} papers
                  {")"}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline", flexShrink: 0, marginLeft: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>{p.total_shared_publications}</span>
              <span style={{ fontSize: 12, color: "#9B9892" }}>co-pubs</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
