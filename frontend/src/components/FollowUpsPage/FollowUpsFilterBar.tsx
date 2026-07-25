import type {
  FollowUpFilterPriority,
  FollowUpFilterStatus,
  FollowUpSource,
} from "../../lib/home";

interface Props {
  statusFilter: FollowUpFilterStatus;
  priorityFilter: FollowUpFilterPriority;
  sourceFilter: FollowUpSource;
  onStatusChange: (s: FollowUpFilterStatus) => void;
  onPriorityChange: (p: FollowUpFilterPriority) => void;
  onSourceChange: (s: FollowUpSource) => void;
}

const selectStyle = {
  backgroundColor: "#0d0c0b",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#E8E6DF",
  fontFamily: "inherit",
  cursor: "pointer",
} as const;

const toggleButtonStyle = (active: boolean) => ({
  backgroundColor: active ? "rgba(232,160,32,0.12)" : "transparent",
  border: `1px solid ${active ? "#E8A020" : "#1E1E22"}`,
  borderRadius: 4,
  padding: "8px 14px",
  fontSize: 13,
  color: active ? "#E8A020" : "#9B9892",
  fontFamily: "inherit",
  cursor: "pointer",
  fontWeight: active ? 600 : 400,
} as const);

export default function FollowUpsFilterBar({
  statusFilter,
  priorityFilter,
  sourceFilter,
  onStatusChange,
  onPriorityChange,
  onSourceChange,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 20,
        marginTop: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#9B9892" }}>Status</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="fm-pill-button"
            onClick={() => onStatusChange("open")}
            style={toggleButtonStyle(statusFilter === "open")}
          >
            Open
          </button>
          <button
            type="button"
            className="fm-pill-button"
            onClick={() => onStatusChange("completed")}
            style={toggleButtonStyle(statusFilter === "completed")}
          >
            Completed
          </button>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9B9892" }}>
        Priority
        <select
          value={priorityFilter}
          onChange={(e) => onPriorityChange(e.target.value as FollowUpFilterPriority)}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9B9892" }}>
        Source
        <select
          value={sourceFilter}
          onChange={(e) => onSourceChange(e.target.value as FollowUpSource)}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="brief">From Brief</option>
          <option value="manual">Manual</option>
        </select>
      </label>
    </div>
  );
}
