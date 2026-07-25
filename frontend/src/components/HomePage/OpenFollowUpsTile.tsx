import type { OpenFollowUpStats } from "../../lib/home";
import { COLOR, TYPE } from "../../lib/designTokens";
import HomeTile from "./HomeTile";

interface Props {
  stats: OpenFollowUpStats | null;
}

function BucketRow({
  count,
  label,
  countColor = COLOR.ink1,
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
      <span style={{ color: COLOR.ink3 }}>{label}</span>
      <span style={{ ...TYPE.dataValue, fontSize: 20, textAlign: "right", color: countColor }}>{count}</span>
    </div>
  );
}

export default function OpenFollowUpsTile({ stats }: Props) {
  return (
    <HomeTile>
      <div style={{ ...TYPE.eyebrow, marginBottom: 12 }}>
        Open Follow-Ups
      </div>

      {!stats || stats.total === 0 ? (
        <div style={{ fontSize: 14, color: COLOR.ink3 }}>No open follow-ups.</div>
      ) : (
        <div>
          <BucketRow
            count={stats.overdue}
            label="overdue"
            countColor={stats.overdue > 0 ? COLOR.amber : COLOR.ink1}
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
