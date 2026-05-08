interface SuggestHashtagModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SuggestHashtagModal({ open, onClose }: SuggestHashtagModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#111113",
          border: "1px solid #2A3848",
          borderRadius: 6,
          padding: 20,
          maxWidth: 420,
          width: "100%",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#6BA3D8",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 10,
          }}
        >
          Coming in v1.1
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 10 }}>
          Suggest a hashtag
        </div>
        <p style={{ fontSize: 13, color: "#B8B4AC", lineHeight: 1.6, margin: "0 0 12px" }}>
          When LinkedIn-verified MSL identity launches in v1.1, you&apos;ll be able to suggest hashtags
          for FieldMark to monitor in your therapeutic area. Submissions are reviewed before being
          added to the active capture rotation.
        </p>
        <p style={{ fontSize: 13, color: "#B8B4AC", lineHeight: 1.6, margin: "0 0 16px" }}>
          This is part of the v1.1 crowdsourcing release - MSL community verification, hashtag
          submission, and a personal contribution view will all land together.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "#1A2530",
              border: "1px solid #2A3848",
              color: "#6BA3D8",
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
