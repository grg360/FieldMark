import { useEffect, useRef, useState, type CSSProperties } from "react";
import { softDeleteNote, type InteractionType, type InsightStrength, type Note } from "../../lib/relationships";
import { formatOccurredAt, formatRelative } from "./dateFormat";
import InsightComposer from "./InsightComposer";

function interactionTypeLabel(type: InteractionType): string {
  if (type === "publication_review") return "PUBLICATION REVIEW";
  return type.toUpperCase();
}

function interactionChipStyle(type: InteractionType): CSSProperties | null {
  switch (type) {
    case "general":
      return null;
    case "meeting":
      return { backgroundColor: "#E8A020", color: "#0A0A0B" };
    case "email":
      return { backgroundColor: "#4A90E2", color: "#FFFFFF" };
    case "phone":
      return { backgroundColor: "#5A9B7F", color: "#FFFFFF" };
    case "other":
      return { backgroundColor: "#6B6A65", color: "#FFFFFF" };
    case "conference":
      return { backgroundColor: "#9B6DFF", color: "#FFFFFF" };
    case "publication_review":
      return { backgroundColor: "#3FB8AF", color: "#0A0A0B" };
    case "internal":
      return { border: "1px solid #6B6A65", color: "#6B6A65", backgroundColor: "transparent" };
    default:
      return { backgroundColor: "#2A2A30", color: "#9B9892" };
  }
}

function strengthChipStyle(strength: InsightStrength): CSSProperties {
  if (strength === "notable") {
    return { border: "1px solid #E8A020", color: "#E8A020", backgroundColor: "transparent" };
  }
  return { backgroundColor: "#E8A020", color: "#0A0A0B", fontWeight: 600 };
}

const chipBase: CSSProperties = {
  fontSize: 10,
  padding: "4px 8px",
  borderRadius: 3,
  textTransform: "uppercase",
  display: "inline-block",
};

interface Props {
  note: Note;
  userId: string;
  hcpId: string;
  firstName: string;
  onMutate: () => void;
}

export default function InsightCard({ note, userId, hcpId, firstName, onMutate }: Props) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  const typeStyle = interactionChipStyle(note.interaction_type);
  const showFooter =
    Math.abs(new Date(note.occurred_at).getTime() - new Date(note.created_at).getTime()) >
    24 * 60 * 60 * 1000;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await softDeleteNote(userId, note.id);
      onMutate();
    } catch (err) {
      console.error("InsightCard delete failed", err);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (editing) {
    return (
      <div
        style={{
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          borderRadius: 4,
          padding: 12,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <InsightComposer
          userId={userId}
          hcpId={hcpId}
          firstName={firstName}
          editingNote={note}
          onSave={() => {
            setEditing(false);
            onMutate();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          borderRadius: 4,
          padding: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
            {typeStyle ? (
              <span style={{ ...chipBase, ...typeStyle }}>{interactionTypeLabel(note.interaction_type)}</span>
            ) : null}
            {note.insight_strength !== "routine" ? (
              <span
                style={{
                  ...chipBase,
                  fontSize: 9,
                  ...strengthChipStyle(note.insight_strength),
                  marginLeft: typeStyle ? 6 : 0,
                }}
              >
                {note.insight_strength === "notable" ? "NOTABLE" : "STRATEGIC"}
              </span>
            ) : null}
            {(typeStyle || note.insight_strength !== "routine") && (
              <span style={{ color: "#6B6A65", margin: "0 6px" }}>·</span>
            )}
            <span style={{ fontSize: 12, color: "#9B9892" }}>{formatOccurredAt(note.occurred_at)}</span>
          </div>

          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Insight options"
              aria-expanded={menuOpen}
              style={{
                background: "none",
                border: "none",
                color: "#6B6A65",
                fontSize: 16,
                cursor: "pointer",
                padding: "0 4px",
                lineHeight: 1,
              }}
            >
              · · ·
            </button>
            {menuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  backgroundColor: "#0D0D10",
                  border: "1px solid #1E1E22",
                  borderRadius: 4,
                  zIndex: 10,
                  minWidth: 100,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    color: "#E8E6DF",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    color: "#E8E6DF",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ fontSize: 14, color: "#E8E6DF", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {note.body}
        </div>

        {showFooter ? (
          <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 8 }}>
            Added {formatRelative(note.created_at)}
          </div>
        ) : null}
      </div>

      {confirmDelete ? (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            backgroundColor: "#0D0D10",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            fontSize: 13,
            color: "#9B9892",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>Delete this insight?</span>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            style={{
              background: "none",
              border: "none",
              color: "#E8A020",
              fontSize: 13,
              fontWeight: 500,
              cursor: deleting ? "default" : "pointer",
              padding: 0,
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            style={{
              background: "none",
              border: "none",
              color: "#6B6A65",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
