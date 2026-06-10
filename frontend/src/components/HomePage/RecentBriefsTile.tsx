import { useNavigate } from "react-router-dom";
import type { BriefRef } from "../../lib/home";
import { formatRelative } from "../FieldInsights/dateFormat";

interface Props {
  briefs: BriefRef[];
}

const tileStyle = {
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 6,
  padding: 20,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export default function RecentBriefsTile({ briefs }: Props) {
  const navigate = useNavigate();

  return (
    <div style={tileStyle}>
      <div
        style={{
          fontSize: 11,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        Recent Briefs
      </div>

      {briefs.length === 0 ? (
        <div style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5 }}>
          No briefs generated yet. Generate one from any HCP.
        </div>
      ) : (
        <div>
          {briefs.map((brief, index) => (
            <div
              key={brief.id}
              style={{
                padding: "12px 0",
                borderBottom: index < briefs.length - 1 ? "1px solid #1E1E22" : "none",
              }}
            >
              <button
                type="button"
                onClick={() => navigate(`/hcp/${brief.hcp_id}/brief`)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#E8E6DF",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                {brief.hcp_name}
                <span style={{ fontSize: 12 }}>{String.fromCodePoint(0x2728)}</span>
              </button>
              <div style={{ fontSize: 11, color: "#6B6A65" }}>
                {formatRelative(brief.generated_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
