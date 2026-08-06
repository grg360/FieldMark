// Field-insights empty state — register vocabulary (mono label, serif prose, gold
// as the only accent), matching the /me/insights surface and the rest of the
// profile. Replaces the old dashed box + yellow filled button (the last
// old-generation affordance on the profile spine): nothing else on the page
// uses a filled button, and the absence is stated, not decorated.

interface Props {
  firstName: string;
  onAddClick: () => void;
}

const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const SERIF = "'Source Serif 4',Georgia,serif";

export default function EmptyInsightsState({ firstName, onAddClick }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 24px", border: "1px solid #1a1d1c", background: "#0a0b0b" }}>
      <div style={{ font: `600 9px/1 ${MONO}`, letterSpacing: ".16em", color: "#5f6762" }}>
        NO FIELD INSIGHTS CAPTURED
      </div>
      <div style={{ font: `400 15px/1.6 ${SERIF}`, color: "#c6c2bb", textWrap: "pretty", maxWidth: "64ch" }}>
        Nothing has been logged from a field interaction with Dr.&nbsp;{firstName}. This
        section fills as your team captures what it learns in the room — the observation,
        and why it matters — each private to you until you choose to share it.
      </div>
      <button
        type="button"
        onClick={onAddClick}
        aria-label={`Capture a field insight about Dr. ${firstName}`}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          padding: "0 0 2px",
          cursor: "pointer",
          font: `600 10px/1 ${MONO}`,
          letterSpacing: ".16em",
          color: "#d99a3c",
          borderBottom: "1px solid #5c4419",
        }}
      >
        + CAPTURE AN INSIGHT
      </button>
    </div>
  );
}
