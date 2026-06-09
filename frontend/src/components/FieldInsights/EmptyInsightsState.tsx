interface Props {
  firstName: string;
  onAddClick: () => void;
}

export default function EmptyInsightsState({ firstName, onAddClick }: Props) {
  return (
    <div
      style={{
        backgroundColor: "#0D0D10",
        border: "1px dashed #1E1E22",
        borderRadius: 6,
        padding: "24px 16px",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ fontSize: 15, color: "#E8E6DF", marginBottom: 6 }}>
        What do you know about {firstName} that FieldMark doesn&apos;t?
      </div>
      <div style={{ fontSize: 13, color: "#9B9892", marginBottom: 16 }}>
        Capture your field insight. Private to you.
      </div>
      <button
        type="button"
        onClick={onAddClick}
        style={{
          backgroundColor: "#E8A020",
          color: "#0A0A0B",
          padding: "8px 16px",
          borderRadius: 4,
          fontWeight: 500,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
        }}
      >
        Add Insight
      </button>
    </div>
  );
}
