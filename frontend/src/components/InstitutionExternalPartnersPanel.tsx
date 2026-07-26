import { useNavigate } from "react-router-dom";
import type { ExternalPartnerInstitution } from "../lib/api";
import { institutionToSlug } from "../lib/institutionUtils";
import { COLOR } from "../lib/designTokens";

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
          color: COLOR.ink1,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        Top External Partner Institutions
      </div>
      <div style={{ fontSize: 11, color: COLOR.ink4, marginBottom: 12 }}>
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
              backgroundColor: COLOR.surfaceRaised,
              borderRadius: 4,
              cursor: "pointer",
              transition: "background-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  color: COLOR.ink1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.institution_name}
              </div>
              <div style={{ fontSize: 11, color: COLOR.ink4, marginTop: 2 }}>
                {p.source_investigators_count}{" "}
                {p.source_investigators_count === 1 ? "investigator" : "investigators"}
                {" \u2194 "}
                {p.partner_investigators_count}{" "}
                {p.partner_investigators_count === 1 ? "investigator" : "investigators"}
              </div>
              {p.top_connection ? (
                <div style={{ fontSize: 11, color: COLOR.ink4, marginTop: 4 }}>
                  Top pair:{" "}
                  <span style={{ color: COLOR.ink3 }}>{p.top_connection.source_name}</span>
                  {" \u2194 "}
                  <span style={{ color: COLOR.ink3 }}>{p.top_connection.partner_name}</span>
                  {" ("}
                  {p.top_connection.shared_publications} papers
                  {")"}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="fm-pill-button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/institution/${institutionToSlug(sourceInstitutionName)}/publications?partner=${encodeURIComponent(p.institution_name)}&institution=${encodeURIComponent(sourceInstitutionName)}`);
              }}
              style={{
                display: "flex",
                gap: 4,
                alignItems: "baseline",
                flexShrink: 0,
                marginLeft: 12,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>{p.total_shared_publications}</span>
              <span style={{ fontSize: 12, color: COLOR.ink3 }}>co-pubs</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
