import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import type { TrackedHcpRow } from "../../lib/watchlists";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { formatRelative } from "../FieldInsights/dateFormat";
import WatchlistsEmptyState from "./WatchlistsEmptyState";

interface Props {
  rows: TrackedHcpRow[];
  loading: boolean;
  viewMode: "all_tracked" | "watchlist" | "not_found";
}

function statusPillStyle(status: string): CSSProperties {
  switch (status) {
    case "active_relationship":
      return { backgroundColor: "#E8A020", color: "#0A0A0B" };
    case "paused":
      return { backgroundColor: "#2A2A30", color: "#9B9892" };
    case "not_engaged":
      return { backgroundColor: "transparent", color: "#6B6A65", border: "1px solid #1E1E22" };
    default:
      return { backgroundColor: "#1E1E22", color: "#9B9892" };
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "active_relationship":
      return "Active";
    case "paused":
      return "Paused";
    case "not_engaged":
      return "Not Engaged";
    default:
      return status
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

function cohortChipStyle(cohort: string | null): CSSProperties {
  switch (cohort) {
    case "rising_star":
      return { backgroundColor: "#9B6DFF", color: "#FFFFFF" };
    case "established":
      return { backgroundColor: "#E8A020", color: "#0A0A0B" };
    case "community":
      return { backgroundColor: "#4A90E2", color: "#FFFFFF" };
    default:
      return { backgroundColor: "#1E1E22", color: "#9B9892" };
  }
}

function cohortLabel(cohort: string | null): string {
  switch (cohort) {
    case "rising_star":
      return "Rising Star";
    case "established":
      return "Established";
    case "community":
      return "Community";
    default:
      return cohort ?? String.fromCharCode(0x2014);
  }
}

function FollowUpIndicator({ row }: { row: TrackedHcpRow }) {
  if (row.overdue_follow_up_count > 0) {
    return (
      <span style={{ fontSize: 12, color: "#E8A020" }}>
        {String.fromCharCode(0x26A0)} {row.overdue_follow_up_count}
      </span>
    );
  }
  if (row.open_follow_up_count > 0) {
    return <span style={{ fontSize: 12, color: "#9B9892" }}>{row.open_follow_up_count}</span>;
  }
  return <span style={{ fontSize: 12, color: "#3A3A3F" }}>{String.fromCharCode(0x2014)}</span>;
}

const headerCell: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#77736B",
  textTransform: "uppercase",
  letterSpacing: "0.11em",
};

export default function TrackedHcpsList({ rows, loading, viewMode }: Props) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  if (loading && rows.length === 0) {
    return (
      <div style={{ fontSize: 14, color: "#6B6A65", padding: "48px 0", textAlign: "center" }}>
        Loading...
      </div>
    );
  }

  if (rows.length === 0 && !loading) {
    return <WatchlistsEmptyState viewMode={viewMode} />;
  }

  if (!isDesktop) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => {
          const institutionLine = [row.institution, row.state].filter(Boolean).join(", ");
          return (
            <div
              key={row.relationship_id}
              className="elevation-card"
              style={{
                padding: 12,
              }}
            >
              <button
                type="button"
                onClick={() => navigate(`/hcp/${row.hcp_id}`)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#E8E6DF",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                {row.name}
              </button>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 6,
                  alignItems: "center",
                }}
              >
                {institutionLine ? (
                  <span style={{ fontSize: 12, color: "#9B9892" }}>{institutionLine}</span>
                ) : null}
                {row.cohort ? (
                  <span
                    style={{
                      ...cohortChipStyle(row.cohort),
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 3,
                      padding: "2px 6px",
                    }}
                  >
                    {cohortLabel(row.cohort)}
                    {row.cohort === "rising_star" && row.cohort_rank != null
                      ? ` #${row.cohort_rank}`
                      : ""}
                  </span>
                ) : null}
                <span
                  style={{
                    ...statusPillStyle(row.status),
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 3,
                    padding: "2px 6px",
                  }}
                >
                  {statusLabel(row.status)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 8,
                  fontSize: 12,
                  color: "#6B6A65",
                }}
              >
                <span>{row.insight_count} insights</span>
                <span>
                  Follow-ups: <FollowUpIndicator row={row} />
                </span>
                {row.last_activity_at ? (
                  <span>{formatRelative(row.last_activity_at)}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 2fr 1.2fr 1fr 0.7fr 0.8fr 1fr",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span style={headerCell}>Name</span>
        <span style={headerCell}>Institution</span>
        <span style={headerCell}>Cohort</span>
        <span style={headerCell}>Status</span>
        <span style={headerCell}>Insights</span>
        <span style={headerCell}>Follow-ups</span>
        <span style={headerCell}>Last activity</span>
      </div>

      {rows.map((row) => {
        const institutionLine = [row.institution, row.state].filter(Boolean).join(", ");
        return (
          <div
            key={row.relationship_id}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 2fr 1.2fr 1fr 0.7fr 0.8fr 1fr",
              gap: 12,
              padding: "12px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => navigate(`/hcp/${row.hcp_id}`)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "#E8E6DF",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {row.name}
            </button>

            <span
              style={{
                fontSize: 12,
                color: "#9B9892",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {institutionLine || String.fromCharCode(0x2014)}
            </span>

            {row.cohort ? (
              <span
                style={{
                  ...cohortChipStyle(row.cohort),
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 3,
                  padding: "3px 8px",
                  justifySelf: "start",
                }}
              >
                {cohortLabel(row.cohort)}
                {row.cohort === "rising_star" && row.cohort_rank != null
                  ? ` #${row.cohort_rank}`
                  : ""}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "#3A3A3F" }}>{String.fromCharCode(0x2014)}</span>
            )}

            <span
              style={{
                ...statusPillStyle(row.status),
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 3,
                padding: "3px 8px",
                justifySelf: "start",
              }}
            >
              {statusLabel(row.status)}
            </span>

            <span style={{ fontSize: 12, color: "#9B9892" }}>{row.insight_count}</span>

            <FollowUpIndicator row={row} />

            <span style={{ fontSize: 12, color: "#9B9892" }}>
              {row.last_activity_at ? formatRelative(row.last_activity_at) : String.fromCharCode(0x2014)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
