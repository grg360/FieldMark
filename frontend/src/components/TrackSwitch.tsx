import { useTrack, Track } from "../lib/TrackContext";

const TRACKS: { value: Track; label: string }[] = [
  { value: "community", label: "Community" },
  { value: "rising-stars", label: "Rising Stars" },
  { value: "established", label: "Established" },
];

export default function TrackSwitch() {
  const { track, setTrack } = useTrack();

  return (
    <div
      className="fm-track-switch"
      role="tablist"
      aria-label="Select cohort"
      style={{
        display: "flex",
        gap: 0,
        margin: "12px 16px 8px",
        padding: 2,
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 4,
      }}
    >
      {TRACKS.map((t) => {
        const active = t.value === track;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => setTrack(t.value)}
            style={{
              flex: 1,
              padding: "8px 4px",
              minHeight: 36,
              backgroundColor: active ? "#E8A020" : "transparent",
              border: "none",
              borderRadius: 3,
              color: active ? "#0A0A0B" : "#6B6A65",
              fontWeight: active ? 600 : 400,
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              transition: "background-color 120ms, color 120ms",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
