import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, getMslProfile } from "../../lib/authHelpers";
import { taSlugToLabel } from "../../lib/routeSlugs";

const DISMISS_KEY = "fieldmark_starthere_dismissed";

interface Props {
  /** HomePage passes whether the user looks cold (no tracked HCPs / activity). */
  isColdStart: boolean;
}

/**
 * One-time, dismissible first-run orientation card. Clones the WelcomeShareBanner
 * pattern (self-fetching, dismissible), but gated on cold-ness + a persistent
 * dismiss flag so it targets genuinely new users and never returns once dismissed
 * or once the user has activity. Personalized by the user's primary TA.
 *
 * Deliberately light: a greeting + 2 concrete first actions that both work today
 * (explore the TA feed; the now-populated Coverage Gaps tile below). NOT a tour.
 */
export default function StartHereCard({ isColdStart }: Props) {
  const navigate = useNavigate();
  const dismissedInitially =
    typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1";
  const [dismissed, setDismissed] = useState(dismissedInitially);
  const [taLabel, setTaLabel] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [feedPath, setFeedPath] = useState<string>("/oncology/rising-stars/nsclc");

  useEffect(() => {
    if (!isColdStart || dismissed) return;
    let cancelled = false;
    void (async () => {
      const user = await getCurrentUser();
      if (!user || cancelled) return;
      const profile = await getMslProfile(user.id);
      if (!profile || cancelled) return;
      const parentSlug =
        profile.default_ta_slug ?? profile.allowed_ta_slugs?.[0] ?? "oncology";
      const indicationSlug = profile.default_indication_slug ?? "nsclc";
      setTaLabel(taSlugToLabel(parentSlug));
      setFirstName(profile.first_name ?? "");
      setFeedPath(`/${parentSlug}/rising-stars/${indicationSlug}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [isColdStart, dismissed]);

  if (!isColdStart || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const ta = taLabel || "your";

  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 6,
        padding: 20,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#E8A020",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Start here
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          style={{
            background: "none",
            border: "none",
            color: "#6B6A65",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {String.fromCharCode(0xd7)}
        </button>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E6DF", marginBottom: 6 }}>
        {firstName ? `Welcome, ${firstName}. ` : "Welcome. "}Get value in 5 minutes.
      </div>
      <p style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, margin: "0 0 16px 0" }}>
        Your {ta} territory is ready. The fastest way to feel FieldMark is to look at a real KOL.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => navigate(feedPath)}
          style={primaryAction}
        >
          Explore your {ta} rising stars
          <span style={{ marginLeft: 6 }}>{String.fromCharCode(0x2192)}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            document
              .getElementById("coverage-gaps")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          style={ghostAction}
        >
          Track HCPs in your territory
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#6B6A65", lineHeight: 1.5, margin: "12px 0 0 0" }}>
        Untracked HCPs in your territory are listed below in Your HCP Portfolio &mdash; hit + Track to
        build your dashboard.
      </p>
    </div>
  );
}

const primaryAction: CSSProperties = {
  backgroundColor: "rgba(232,160,32,0.1)",
  border: "1px solid #E8A020",
  color: "#E8A020",
  borderRadius: 4,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostAction: CSSProperties = {
  backgroundColor: "#0A0A0B",
  border: "1px solid #1E1E22",
  color: "#9B9892",
  borderRadius: 4,
  padding: "8px 16px",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
