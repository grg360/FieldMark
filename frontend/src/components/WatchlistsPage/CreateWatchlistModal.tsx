import { useState } from "react";
import { createWatchlist, type Watchlist } from "../../lib/watchlists";

interface Props {
  userId: string;
  onClose: () => void;
  onCreated: (watchlist: Watchlist) => Promise<void>;
}

const COLOR_PRESETS: Array<{ label: string; value: string | null }> = [
  { label: "Amber", value: "#E8A020" },
  { label: "Teal", value: "#3FB8AF" },
  { label: "Purple", value: "#9B6DFF" },
  { label: "Blue", value: "#4A90E2" },
  { label: "Green", value: "#5A9B7F" },
  { label: "Red", value: "#E84545" },
  { label: "Gray", value: "#6B6A65" },
  { label: "None", value: null },
];

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  backgroundColor: "#0A0A0B",
  border: "1px solid #1E1E22",
  borderRadius: 4,
  padding: "8px 10px",
  fontSize: 13,
  color: "#E8E6DF",
  fontFamily: "inherit",
};

export default function CreateWatchlistModal({ userId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const watchlist = await createWatchlist(
        userId,
        trimmedName,
        description.trim() || null,
        color,
      );
      await onCreated(watchlist);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          borderRadius: 8,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#E8E6DF",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "0 0 16px 0",
          }}
        >
          New Watchlist
        </h2>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "#6B6A65", display: "block", marginBottom: 4 }}>
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "#6B6A65", display: "block", marginBottom: 4 }}>
            Description (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </label>

        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "#6B6A65", display: "block", marginBottom: 8 }}>
            Color (optional)
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setColor(preset.value)}
                title={preset.label}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border:
                    color === preset.value
                      ? "2px solid #E8E6DF"
                      : "2px solid #1E1E22",
                  boxShadow: color === preset.value ? "0 0 0 2px #0D0D10, 0 0 0 4px #E8E6DF" : undefined,
                  backgroundColor: preset.value ?? "#0A0A0B",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        {error ? (
          <p style={{ fontSize: 12, color: "#E84545", margin: "0 0 12px 0" }}>{error}</p>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              background: "none",
              border: "none",
              color: "#9B9892",
              fontSize: 13,
              cursor: pending ? "default" : "pointer",
              fontFamily: "inherit",
              padding: "8px 12px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending}
            style={{
              backgroundColor: "#E8A020",
              color: "#0A0A0B",
              border: "none",
              borderRadius: 4,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: pending ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
