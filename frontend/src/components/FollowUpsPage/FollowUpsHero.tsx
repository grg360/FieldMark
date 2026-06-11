import type { FollowUpStats } from "../../lib/home";

interface Props {
  stats: FollowUpStats | null;
}

export default function FollowUpsHero({ stats }: Props) {
  return (
    <div style={{ paddingBottom: 24, borderBottom: "1px solid #1E1E22", marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontSize: 52, fontWeight: 700, color: "#E8E6DF", lineHeight: 1 }}>
            {stats?.open_total ?? 0}
          </span>
          <span style={{ fontSize: 14, color: "#9B9892", fontWeight: 500 }}>
            Open Follow-Up{stats?.open_total === 1 ? "" : "s"}
          </span>
        </div>

        {stats && stats.open_total > 0 ? (
          <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#9B9892", flexWrap: "wrap" }}>
            {stats.overdue > 0 ? (
              <span>
                <span style={{ color: "#E8A020", fontWeight: 600 }}>{stats.overdue}</span> overdue
              </span>
            ) : null}
            {stats.due_this_week > 0 ? (
              <span>
                <span style={{ color: "#E8E6DF", fontWeight: 600 }}>{stats.due_this_week}</span> due this week
              </span>
            ) : null}
            {stats.future > 0 ? (
              <span>
                <span style={{ color: "#E8E6DF", fontWeight: 600 }}>{stats.future}</span> future
              </span>
            ) : null}
            {stats.no_due_date > 0 ? (
              <span>
                <span style={{ color: "#E8E6DF", fontWeight: 600 }}>{stats.no_due_date}</span> no due date
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {stats && (stats.completed_this_month > 0 || stats.completion_rate_30d > 0) ? (
        <div style={{ marginTop: 14, fontSize: 11, color: "#6B6A65", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Completed: {stats.completed_this_month} this month</span>
          <span>{String.fromCharCode(0x00b7)}</span>
          <span>{stats.completion_rate_30d}% completion rate (30d)</span>
          {stats.median_close_days_30d !== null ? (
            <>
              <span>{String.fromCharCode(0x00b7)}</span>
              <span>{stats.median_close_days_30d}-day median close</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
