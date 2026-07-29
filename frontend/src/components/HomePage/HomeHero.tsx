import { useNavigate } from "react-router-dom";
import type { HomeSummaryCounts, TerritoryProfile } from "../../lib/home";
import { COLOR, FONT, TYPE } from "../../lib/designTokens";

interface Props {
  firstName: string;
  summary: HomeSummaryCounts;
  territory: TerritoryProfile | null;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

const pillStyle = {
  backgroundColor: COLOR.surfaceRaised,
  color: COLOR.ink2,
  border: `1px solid ${COLOR.hair}`,
  borderRadius: 3,
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  lineHeight: 1.2,
  cursor: "pointer",
  fontFamily: FONT.sans,
};

export default function HomeHero({ firstName, summary, territory }: Props) {
  const navigate = useNavigate();
  const middot = String.fromCharCode(0x00B7);
  const label = territory?.territory_label
    ? `${territory.territory_label} Territory`
    : null;
  const states = territory?.territory_states ?? [];
  const hasTerritoryData = label || states.length > 0;
  const overdueLabel = pluralize(
    summary.overdue_followups,
    "overdue follow-up",
    "overdue follow-ups",
  );
  const openLabel = pluralize(summary.open_followups, "open action", "open actions");
  const watchedLabel = pluralize(
    summary.watched_hcps,
    "watched investigator",
    "watched investigators",
  );

  return (
    <div style={{ fontFamily: FONT.sans }}>
      <h1 style={{ ...TYPE.display, margin: "0 0 8px 0" }}>
        {getGreeting()}, {firstName}
      </h1>

      <p style={{ fontSize: 14, color: COLOR.ink3, margin: "0 0 16px 0", lineHeight: 1.5 }}>
        <span style={{ color: summary.overdue_followups > 0 ? COLOR.amber : COLOR.ink3 }}>
          {summary.overdue_followups} {overdueLabel}
        </span>
        <span style={{ color: COLOR.ink4 }}> {String.fromCharCode(0x00B7)} </span>
        <span>{summary.open_followups} {openLabel}</span>
        <span style={{ color: COLOR.ink4 }}> {String.fromCharCode(0x00B7)} </span>
        <span>{summary.watched_hcps} {watchedLabel}</span>
      </p>

      <div style={{ display: "inline-flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => navigate("/me/follow-ups")}
          style={pillStyle}
        >
          View Follow-Ups
        </button>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => navigate("/me/watchlists")}
          style={pillStyle}
        >
          Open Watchlists
        </button>
        {/* Interim entry point (NAV-BUILD-01 §07): Field Insights was reachable only
            from the avatar menu, whose WORKSPACE/DISCOVER groups are removed. This
            link keeps it reachable from Home until Home is redesigned. */}
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => navigate("/me/insights")}
          style={pillStyle}
        >
          Field Insights
        </button>
      </div>

      {hasTerritoryData ? (
        <p style={{ fontSize: 12, color: COLOR.ink4, margin: 0, lineHeight: 1.4 }}>
          {label}
          {label && states.length > 0 ? ` ${middot} ` : ""}
          {states.join(` ${middot} `)}
        </p>
      ) : null}
    </div>
  );
}
