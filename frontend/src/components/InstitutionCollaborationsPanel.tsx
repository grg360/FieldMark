import { useNavigate } from "react-router-dom";
import type { InstitutionCollaboration } from "../lib/api";
import { institutionToSlug } from "../lib/institutionUtils";
import { COLOR } from "../lib/designTokens";

interface Props {
  collaborations: InstitutionCollaboration[];
  onHcpClick: (hcpId: string) => void;
  institutionName: string;
}

export default function InstitutionCollaborationsPanel({ collaborations, onHcpClick, institutionName }: Props) {
  const navigate = useNavigate();
  if (collaborations.length === 0) {
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
        Top Internal Collaborations
      </div>
      <div style={{ fontSize: 11, color: COLOR.ink4, marginBottom: 12 }}>
        Investigator pairs ranked by shared publications
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {collaborations.map((c) => (
          <div
            key={`${c.hcp1_id}-${c.hcp2_id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              backgroundColor: COLOR.surfaceRaised,
              borderRadius: 4,
              cursor: "default",
              transition: "background-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = COLOR.surfaceRaised;
            }}
          >
            <div style={{ fontSize: 13, color: COLOR.ink1 }}>
              <a
                href={`/hcp/${c.hcp1_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onHcpClick(c.hcp1_id);
                }}
                style={{ color: COLOR.ink1, textDecoration: "none" }}
              >
                {c.hcp1_name}
              </a>
              <span style={{ margin: "0 8px", color: COLOR.ink4 }}>{"\u2194"}</span>
              <a
                href={`/hcp/${c.hcp2_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onHcpClick(c.hcp2_id);
                }}
                style={{ color: COLOR.ink1, textDecoration: "none" }}
              >
                {c.hcp2_name}
              </a>
            </div>
            <button
              type="button"
              className="fm-pill-button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/institution/${institutionToSlug(institutionName)}/publications?internal_pair=${c.hcp1_id},${c.hcp2_id}&institution=${encodeURIComponent(institutionName)}&partner_name1=${encodeURIComponent(c.hcp1_name)}&partner_name2=${encodeURIComponent(c.hcp2_name)}`);
              }}
              style={{
                display: "flex",
                gap: 4,
                alignItems: "baseline",
                flexShrink: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>{c.shared_publications}</span>
              <span style={{ fontSize: 12, color: COLOR.ink3 }}>papers</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
