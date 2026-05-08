import type { SocialCandidate } from "../data/socialMockData";

interface SocialCardProps {
  candidate: SocialCandidate;
}

function formatFollowerCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function getConfidenceTierLabel(tier: string): string {
  if (tier === "likely_hcp") return "Likely HCP";
  if (tier === "possibly_hcp") return "Possibly HCP";
  return "Unverified";
}

function getConfidenceTierColors(tier: string): { bg: string; fg: string } {
  if (tier === "likely_hcp") return { bg: "#0F1A24", fg: "#6BA3D8" };
  if (tier === "possibly_hcp") return { bg: "#1F1A0A", fg: "#C49A4A" };
  return { bg: "#1A1A1C", fg: "#6B6A65" };
}

function getCohortBadge(cohort: string): { bg: string; border: string; fg: string; label: string } {
  if (cohort === "established") return { bg: "#1A1200", border: "#E8A020", fg: "#E8A020", label: "Established" };
  if (cohort === "rising_stars") return { bg: "#1A1200", border: "#E8A020", fg: "#E8A020", label: "Rising Stars" };
  return { bg: "#1A1A1C", border: "#6B6A65", fg: "#6B6A65", label: "Community" };
}

export default function SocialCard({ candidate }: SocialCardProps) {
  const confidenceColors = getConfidenceTierColors(candidate.confidenceTier);
  const cohortBadge = candidate.matchedHcpCohort
    ? getCohortBadge(candidate.matchedHcpCohort)
    : null;
  const isMatched = Boolean(candidate.matchedHcpName);

  return (
    <div
      style={{
        backgroundColor: "#111113",
        border: "1px solid #1E1E22",
        borderLeft: "3px solid #6BA3D8",
        borderRadius: 4,
        margin: "0 16px 8px",
        padding: 10,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Row 1: Display name (or matched HCP name) + cohort badge if matched + handle/followers */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "#E8E6DF",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {isMatched ? candidate.matchedHcpName : candidate.displayName}
          </span>
          {cohortBadge && candidate.matchedHcpScore !== undefined && (
            <span
              style={{
                fontSize: 10,
                color: cohortBadge.fg,
                backgroundColor: cohortBadge.bg,
                border: `1px solid ${cohortBadge.border}`,
                borderRadius: 3,
                padding: "2px 6px",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {cohortBadge.label} · {candidate.matchedHcpScore.toFixed(1)}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: "#6B6A65",
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          @{candidate.handle} · {formatFollowerCount(candidate.followerCount)}
        </span>
      </div>

      {/* Row 2: Affiliation · specialty */}
      <div style={{ fontSize: 14, color: "#6B6A65", marginTop: 4 }}>
        {candidate.affiliation} · {candidate.specialty}
      </div>

      {/* Row 3: Bio */}
      <div
        style={{
          fontSize: 13,
          color: "#B8B4AC",
          lineHeight: 1.5,
          marginTop: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {candidate.bio}
      </div>

      {/* Row 4: Confidence tier pill (or credentialed match pill) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 10,
          padding: "6px 8px",
          backgroundColor: isMatched ? "#0F2018" : confidenceColors.bg,
          borderRadius: 3,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: isMatched ? "#6FB87F" : confidenceColors.fg,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {isMatched ? "Credentialed match" : getConfidenceTierLabel(candidate.confidenceTier)}
        </span>
        <span style={{ fontSize: 11, color: "#6B6A65", marginLeft: "auto" }}>
          {isMatched ? `also in ${cohortBadge?.label} cohort` : "bio analysis"}
        </span>
      </div>

      {/* Row 5: MSL verification placeholder (v1.1 coming soon) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 8,
          opacity: 0.5,
        }}
      >
        <span style={{ fontSize: 11, color: "#6B6A65" }}>
          MSL verification — coming in v1.1
        </span>
      </div>

      {/* Row 6: Stat pills */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <div style={{ flex: 1, backgroundColor: "#0D0D10", border: "1px solid #1E1E22", borderRadius: 3, padding: "6px 8px" }}>
          <div style={{ fontSize: 10, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Followers
          </div>
          <div style={{ fontSize: 14, color: "#E8E6DF", fontFamily: "monospace" }}>
            {formatFollowerCount(candidate.followerCount)}
          </div>
        </div>
        <div style={{ flex: 1, backgroundColor: "#0D0D10", border: "1px solid #1E1E22", borderRadius: 3, padding: "6px 8px" }}>
          <div style={{ fontSize: 10, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Posts/90d
          </div>
          <div style={{ fontSize: 14, color: "#E8E6DF", fontFamily: "monospace" }}>
            {candidate.postsLast90Days}
          </div>
        </div>
        <div style={{ flex: 1, backgroundColor: "#0D0D10", border: "1px solid #1E1E22", borderRadius: 3, padding: "6px 8px" }}>
          <div style={{ fontSize: 10, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Source
          </div>
          <div style={{ fontSize: 12, color: "#E8E6DF", fontFamily: "monospace" }}>
            {candidate.sourceHashtag}
          </div>
        </div>
      </div>
    </div>
  );
}
