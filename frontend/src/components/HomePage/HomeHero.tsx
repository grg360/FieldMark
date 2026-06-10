import { useNavigate } from "react-router-dom";
import type { HomeSummaryCounts } from "../../lib/home";

interface Props {
  firstName: string;
  summary: HomeSummaryCounts;
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
  backgroundColor: "#1E1E22",
  color: "#E8E6DF",
  border: "none",
  borderRadius: 3,
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  lineHeight: 1.2,
  cursor: "pointer",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export default function HomeHero({ firstName, summary }: Props) {
  const navigate = useNavigate();
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
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: "#E8E6DF", margin: "0 0 8px 0" }}>
        {getGreeting()}, {firstName}.
      </h1>

      <p style={{ fontSize: 14, color: "#9B9892", margin: "0 0 16px 0", lineHeight: 1.5 }}>
        <span style={{ color: summary.overdue_followups > 0 ? "#E8A020" : "#9B9892" }}>
          {summary.overdue_followups} {overdueLabel}
        </span>
        <span style={{ color: "#6B6A65" }}> {String.fromCharCode(0x00B7)} </span>
        <span>{summary.open_followups} {openLabel}</span>
        <span style={{ color: "#6B6A65" }}> {String.fromCharCode(0x00B7)} </span>
        <span>{summary.watched_hcps} {watchedLabel}</span>
      </p>

      <div style={{ display: "inline-flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => navigate("/follow-ups")}
          style={pillStyle}
        >
          View Follow-Ups
        </button>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => navigate("/watchlists")}
          style={pillStyle}
        >
          Open Watchlist
        </button>
      </div>

      <p style={{ fontSize: 12, color: "#6B6A65", margin: 0, lineHeight: 1.4 }}>
        Northeast NSCLC Territory {String.fromCharCode(0x00B7)} CT {String.fromCharCode(0x00B7)} MA{" "}
        {String.fromCharCode(0x00B7)} ME {String.fromCharCode(0x00B7)} NH {String.fromCharCode(0x00B7)} NJ{" "}
        {String.fromCharCode(0x00B7)} NY {String.fromCharCode(0x00B7)} PA {String.fromCharCode(0x00B7)} RI{" "}
        {String.fromCharCode(0x00B7)} VT
      </p>
    </div>
  );
}
