import { useNavigate } from "react-router-dom";
import type { InstitutionCollaboration } from "../lib/api";
import { institutionToSlug } from "../lib/institutionUtils";
import { CANON } from "../lib/canonicalTokens";

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
          color: CANON.INK.PRIME,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        Top Internal Collaborations
      </div>
      <div style={{ fontSize: 11, color: CANON.INK.MUTE, marginBottom: 12 }}>
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
              backgroundColor: CANON.GROUND.INSET,
              borderRadius: 4,
              cursor: "default",
              transition: "background-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = CANON.GROUND.INSET;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = CANON.GROUND.INSET;
            }}
          >
            <div style={{ fontSize: 13, color: CANON.INK.PRIME }}>
              <a
                href={`/hcp/${c.hcp1_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onHcpClick(c.hcp1_id);
                }}
                style={{ color: CANON.INK.PRIME, textDecoration: "none" }}
              >
                {c.hcp1_name}
              </a>
              <span style={{ margin: "0 8px", color: CANON.INK.MUTE }}>{"\u2194"}</span>
              <a
                href={`/hcp/${c.hcp2_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onHcpClick(c.hcp2_id);
                }}
                style={{ color: CANON.INK.PRIME, textDecoration: "none" }}
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
              <span style={{ fontSize: 17, fontWeight: 700, color: CANON.GOLD.PRIME }}>{c.shared_publications}</span>
              <span style={{ fontSize: 13, color: CANON.INK.LABEL }}>papers</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
