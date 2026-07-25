import { useState } from "react";
import type {
  TrackedSortField,
  TrackedSortDirection,
  TrackedStatusFilter,
  TrackedCohortFilter,
} from "../../lib/watchlists";
import { useIsDesktop } from "../../lib/useIsDesktop";

interface Props {
  sortField: TrackedSortField;
  sortDirection: TrackedSortDirection;
  statusFilter: TrackedStatusFilter;
  cohortFilter: TrackedCohortFilter;
  onSortFieldChange: (field: TrackedSortField) => void;
  onSortDirectionChange: (dir: TrackedSortDirection) => void;
  onStatusFilterChange: (filter: TrackedStatusFilter) => void;
  onCohortFilterChange: (filter: TrackedCohortFilter) => void;
}

const selectStyle = {
  backgroundColor: "#0d0c0b",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  color: "#E8E6DF",
  fontFamily: "inherit",
  cursor: "pointer",
} as const;

export default function TrackedHcpsFilterBar({
  sortField,
  sortDirection,
  statusFilter,
  cohortFilter,
  onSortFieldChange,
  onSortDirectionChange,
  onStatusFilterChange,
  onCohortFilterChange,
}: Props) {
  const isDesktop = useIsDesktop();
  const [expanded, setExpanded] = useState(false);

  const controls = (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9B9892" }}>
        Sort by
        <select
          value={sortField}
          onChange={(e) => onSortFieldChange(e.target.value as TrackedSortField)}
          style={selectStyle}
        >
          <option value="name">Name</option>
          <option value="status">Status</option>
          <option value="last_activity">Last activity</option>
          <option value="cohort">Cohort</option>
          <option value="insight_count">Insight count</option>
        </select>
      </label>

      <button
        type="button"
        onClick={() => onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")}
        aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
        style={{
          ...selectStyle,
          minWidth: 32,
          padding: "6px 8px",
        }}
      >
        {sortDirection === "asc" ? "▲" : "▼"}
      </button>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9B9892" }}>
        Status
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as TrackedStatusFilter)}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9B9892" }}>
        Cohort
        <select
          value={cohortFilter}
          onChange={(e) => onCohortFilterChange(e.target.value as TrackedCohortFilter)}
          style={selectStyle}
        >
          <option value="all">All</option>
          <option value="rising_star">Rising Star</option>
          <option value="established">Established</option>
          <option value="community">Community</option>
        </select>
      </label>
    </>
  );

  if (!isDesktop) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            ...selectStyle,
            width: "100%",
            textAlign: "left",
          }}
        >
          Filters {expanded ? "▲" : "▼"}
        </button>
        {expanded ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 8,
              padding: 12,
              backgroundColor: "#171512",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8,
            }}
          >
            {controls}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      {controls}
    </div>
  );
}
