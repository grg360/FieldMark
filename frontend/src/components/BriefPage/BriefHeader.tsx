import type { BriefHcp } from "../../lib/briefs";

interface Props {
  hcp: BriefHcp;
  generatedAt: string;
  hasRelationship: boolean;
}

function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;

  return then.toLocaleDateString();
}

export default function BriefHeader({ hcp, generatedAt, hasRelationship }: Props) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          fontSize: 11,
          color: "#6B6A65",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {hasRelationship ? "PRE-MEETING BRIEF" : "FIELDMARK PROFILE"}
      </div>

      <div style={{ fontSize: 24, fontWeight: 600, color: "#E8E6DF", lineHeight: 1.2 }}>
        {hcp.name}
      </div>

      <div style={{ fontSize: 14, color: "#9B9892", marginTop: 4 }}>
        {hcp.institution}
        {hcp.specialty && hcp.specialty !== "Unknown specialty" ? (
          <>
            {" "}{String.fromCharCode(0x00B7)} {hcp.specialty}
          </>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {hcp.archetype ? (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 500,
              backgroundColor: "#9B6DFF",
              color: "#FFFFFF",
              textTransform: "uppercase",
            }}
          >
            {hcp.archetype}
          </span>
        ) : null}

        {hcp.score != null ? (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 500,
              backgroundColor: "#E8A020",
              color: "#0A0A0B",
            }}
          >
            Score {Math.round(hcp.score)}
          </span>
        ) : null}

        {hcp.rank != null ? (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 500,
              backgroundColor: "#1E1E22",
              color: "#9B9892",
            }}
          >
            #{hcp.rank} US
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 12 }}>
        Generated {formatRelative(generatedAt)}
      </div>
    </div>
  );
}
