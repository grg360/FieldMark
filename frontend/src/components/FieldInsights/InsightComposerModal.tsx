import { useEffect } from "react";
import type { Note } from "../../lib/relationships";
import InsightComposer from "./InsightComposer";

interface Props {
  userId: string;
  hcpId: string;
  firstName: string;
  editingNote?: Note;
  onSave: () => void;
  onCancel?: () => void;
}

export default function InsightComposerModal({
  userId,
  hcpId,
  firstName,
  editingNote,
  onSave,
  onCancel,
}: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="insight-composer-modal-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
      onClick={() => onCancel?.()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          backgroundColor: "#0D0D10",
          padding: 16,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onCancel?.()}
          aria-label="Close insight composer"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            color: "#6B6A65",
            fontSize: 20,
            cursor: "pointer",
            lineHeight: 1,
            padding: 4,
          }}
        >
          {String.fromCharCode(0x00D7)}
        </button>
        <div
          id="insight-composer-modal-title"
          style={{
            fontSize: 15,
            color: "#E8E6DF",
            fontWeight: 500,
            marginBottom: 12,
            paddingRight: 28,
          }}
        >
          Add Insight
        </div>
        <InsightComposer
          userId={userId}
          hcpId={hcpId}
          firstName={firstName}
          editingNote={editingNote}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
