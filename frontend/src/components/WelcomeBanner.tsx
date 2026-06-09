import { useEffect, useState } from "react";
import { useFilterContext } from "../lib/filter-context";
import { getCurrentUser, getMslProfile, type MslProfile } from "../lib/authHelpers";

const REGION_DISPLAY: Record<string, string> = {
  northeast: "Northeast",
  southeast: "Southeast",
  midwest: "Midwest",
  southwest: "Southwest",
  west: "West",
  national: "National",
};

interface Props {
  risingStarCount?: number;
  institutionCount?: number;
}

export default function WelcomeBanner({ risingStarCount, institutionCount }: Props) {
  const { userTerritory } = useFilterContext();
  const [profile, setProfile] = useState<MslProfile | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) {
        const p = await getMslProfile(user.id);
        setProfile(p);
      }
    })();
  }, []);

  if (dismissed || !profile?.first_name) return null;

  const regionDisplay = userTerritory ? REGION_DISPLAY[userTerritory] : null;

  return (
    <div
      style={{
        backgroundColor: "#15131A",
        border: "1px solid #2A2730",
        borderRadius: 6,
        padding: "12px 16px",
        margin: "16px 16px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "#E8E6DF", fontWeight: 500 }}>
          Hi {profile.first_name}.
        </div>
        <div style={{ fontSize: 12, color: "#9B9892", marginTop: 2 }}>
          {regionDisplay ? (
            <>
              Your {regionDisplay} NSCLC territory
              {risingStarCount !== undefined && (
                <>
                  {" · "}
                  <span style={{ color: "#E8A020" }}>{risingStarCount}</span> Rising Stars
                </>
              )}
              {institutionCount !== undefined && (
                <>
                  {" · "}
                  <span style={{ color: "#E8A020" }}>{institutionCount}</span> institutions
                </>
              )}
            </>
          ) : (
            "Showing NSCLC across all US territories"
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          color: "#6B6A65",
          fontSize: 18,
          cursor: "pointer",
          padding: 4,
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
