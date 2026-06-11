import { useState } from "react";
import { DayPicker } from "react-day-picker";

interface Props {
  onSnooze: (newDueAt: string) => void;
  onCancel: () => void;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function nextWeekIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function thirtyDaysIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function dateToIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
}

const chipStyle = {
  backgroundColor: "#1E1E22",
  color: "#E8E6DF",
  border: "1px solid #2A2A30",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

export default function SnoozePicker({ onSnooze, onCancel }: Props) {
  const [showCustom, setShowCustom] = useState(false);

  function handleChip(iso: string) {
    onSnooze(iso);
  }

  function handleCustomSelect(date: Date | undefined) {
    if (!date) return;
    onSnooze(dateToIso(date));
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => handleChip(tomorrowIso())}
          style={chipStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3A3A3F"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2A2A30"; }}
        >
          Tomorrow
        </button>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => handleChip(nextWeekIso())}
          style={chipStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3A3A3F"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2A2A30"; }}
        >
          Next Week
        </button>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => handleChip(thirtyDaysIso())}
          style={chipStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3A3A3F"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2A2A30"; }}
        >
          30 Days
        </button>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => setShowCustom((v) => !v)}
          style={chipStyle}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3A3A3F"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2A2A30"; }}
        >
          Custom
        </button>
        <button
          type="button"
          className="fm-pill-button"
          onClick={onCancel}
          style={{
            ...chipStyle,
            backgroundColor: "transparent",
            color: "#9B9892",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3A3A3F"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2A2A30"; }}
        >
          Cancel
        </button>
      </div>

      {showCustom ? (
        <div
          style={{
            backgroundColor: "#0D0D10",
            border: "1px solid #1E1E22",
            borderRadius: 6,
            padding: 8,
            display: "inline-block",
            // @ts-expect-error CSS custom properties for react-day-picker
            "--rdp-accent-color": "#E8A020",
            "--rdp-background-color": "#0D0D10",
            "--rdp-day-color": "#E8E6DF",
            "--rdp-day-hover-background": "#1E1E22",
          }}
        >
          <DayPicker
            mode="single"
            onSelect={(date) => handleCustomSelect(date)}
            styles={{
              caption: { color: "#E8E6DF", fontSize: 13 },
              day: { color: "#E8E6DF", fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif" },
              head_cell: { color: "#9B9892" },
              nav_button: { color: "#9B9892" },
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
