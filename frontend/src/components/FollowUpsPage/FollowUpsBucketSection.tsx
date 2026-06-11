import type { FollowUpRow as FollowUpRowType } from "../../lib/home";
import FollowUpRow from "./FollowUpRow";

interface Props {
  label: string;
  tint: "red" | "amber" | "none";
  rows: FollowUpRowType[];
  onComplete: (id: string) => void;
  onSnooze: (id: string, newDueAt: string) => void;
  onViewHcp: (hcpId: string) => void;
  onGenerateBrief: (hcpId: string) => void;
  isCompletedView?: boolean;
}

function bucketFromLabel(label: string, isCompletedView?: boolean): "overdue" | "thisWeek" | "future" | "noDueDate" | "completed" {
  if (isCompletedView) return "completed";
  if (label === "Overdue") return "overdue";
  if (label === "This Week") return "thisWeek";
  if (label === "No Due Date") return "noDueDate";
  return "future";
}

function tintStyle(tint: Props["tint"]) {
  if (tint === "red") {
    return {
      backgroundColor: "rgba(232,69,69,0.04)",
      padding: 16,
      borderRadius: 8,
    };
  }
  if (tint === "amber") {
    return {
      backgroundColor: "rgba(232,160,32,0.04)",
      padding: 16,
      borderRadius: 8,
    };
  }
  return undefined;
}

export default function FollowUpsBucketSection({
  label,
  tint,
  rows,
  onComplete,
  onSnooze,
  onViewHcp,
  onGenerateBrief,
  isCompletedView = false,
}: Props) {
  const bucket = bucketFromLabel(label, isCompletedView);
  const backdrop = tintStyle(tint);

  const rowList = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((row) => (
        <FollowUpRow
          key={row.id}
          row={row}
          bucket={bucket}
          onComplete={onComplete}
          onSnooze={onSnooze}
          onViewHcp={onViewHcp}
          onGenerateBrief={onGenerateBrief}
          isCompletedView={isCompletedView}
        />
      ))}
    </div>
  );

  return (
    <section>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "#E8E6DF", lineHeight: 1.2 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 4 }}>
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      {backdrop ? <div style={backdrop}>{rowList}</div> : rowList}
    </section>
  );
}
