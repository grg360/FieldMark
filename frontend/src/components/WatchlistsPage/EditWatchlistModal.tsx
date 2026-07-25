import { useState } from "react";
import { archiveWatchlist, renameWatchlist, type Watchlist } from "../../lib/watchlists";

interface Props {
  userId: string;
  watchlist: Watchlist;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onArchived: () => Promise<void>;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  backgroundColor: "#0d0c0b",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: "#E8E6DF",
  fontFamily: "inherit",
};

export default function EditWatchlistModal({
  userId,
  watchlist,
  onClose,
  onUpdated,
  onArchived,
}: Props) {
  const [name, setName] = useState(watchlist.name);
  const [description, setDescription] = useState(watchlist.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      await renameWatchlist(userId, watchlist.id, trimmedName, description.trim() || null);
      await onUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  async function handleArchive() {
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }

    setPending(true);
    setError(null);

    try {
      await archiveWatchlist(userId, watchlist.id);
      await onArchived();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setConfirmArchive(false);
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
          backgroundColor: "#171512",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 48px -18px rgba(0,0,0,0.9)",
          borderRadius: 11,
          padding: 24,
          maxWidth: 480,
          width: "100%",
          fontFamily: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
        }}
      >
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#77736B",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            margin: "0 0 16px 0",
          }}
        >
          Edit Watchlist
        </h2>

        {confirmArchive ? (
          <p style={{ fontSize: 14, color: "#E8E6DF", margin: "0 0 20px 0", lineHeight: 1.5 }}>
            Are you sure? This watchlist will be archived.
          </p>
        ) : (
          <>
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
          </>
        )}

        {error ? (
          <p style={{ fontSize: 12, color: "#E84545", margin: "0 0 12px 0" }}>{error}</p>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <button
            type="button"
            onClick={() => (confirmArchive ? setConfirmArchive(false) : void handleArchive())}
            disabled={pending}
            style={{
              background: "none",
              border: "none",
              color: confirmArchive ? "#E84545" : "#9B9892",
              fontSize: 13,
              cursor: pending ? "default" : "pointer",
              fontFamily: "inherit",
              padding: "8px 12px",
            }}
          >
            {confirmArchive ? "Confirm Archive" : "Archive"}
          </button>

          <div style={{ display: "flex", gap: 12 }}>
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
            {!confirmArchive ? (
              <button
                type="button"
                onClick={() => void handleSave()}
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
                {pending ? "Saving..." : "Save"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
