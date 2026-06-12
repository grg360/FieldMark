import type { OpenFollowUpStats } from "../../lib/home";
import HomeTile from "./HomeTile";

interface Props {
  stats: OpenFollowUpStats | null;
}

function BucketRow({
  count,
  label,
  countColor = "#E8E6DF",
}: {
  count: number;
  label: string;
  countColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        fontSize: 14,
      }}
    >
      <span style={{ color: "#9B9892" }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 600, color: countColor }}>{count}</span>
    </div>
  );
}

export default function OpenFollowUpsTile({ stats }: Props) {
  return (
    <HomeTile>
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
        Open Follow-Ups
      </div>

      {!stats || stats.total === 0 ? (
        <div style={{ fontSize: 14, color: "#9B9892" }}>No open follow-ups.</div>
      ) : (
        <div>
          <BucketRow
            count={stats.overdue}
            label="overdue"
            countColor={stats.overdue > 0 ? "#E8A020" : "#E8E6DF"}
          />
          <BucketRow count={stats.due_this_week} label="due this week" />
          <BucketRow count={stats.future} label="future" />
          {stats.no_due_date > 0 ? (
            <BucketRow count={stats.no_due_date} label="no due date" />
          ) : null}
        </div>
      )}
    </HomeTile>
  );
}
