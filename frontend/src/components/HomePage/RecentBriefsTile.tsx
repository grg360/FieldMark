import { useNavigate } from "react-router-dom";
import type { BriefRef } from "../../lib/home";
import { formatRelative } from "../FieldInsights/dateFormat";
import { COLOR, TYPE } from "../../lib/designTokens";
import HomeTile from "./HomeTile";

interface Props {
  briefs: BriefRef[];
}

export default function RecentBriefsTile({ briefs }: Props) {
  const navigate = useNavigate();

  return (
    <HomeTile>
      <div style={{ ...TYPE.eyebrow, marginBottom: 12 }}>
        Recent Briefs
      </div>

      {briefs.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.5 }}>
          No briefs generated yet. Generate one from any HCP.
        </div>
      ) : (
        <div>
          {briefs.map((brief, index) => (
            <div
              key={brief.id}
              style={{
                padding: "12px 0",
                borderBottom: index < briefs.length - 1 ? `1px solid ${COLOR.hair}` : "none",
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
                  color: COLOR.ink1,
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
              <div style={{ fontSize: 11, color: COLOR.ink4 }}>
                {formatRelative(brief.generated_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </HomeTile>
  );
}
