import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { softDeleteNote, type InteractionType, type InsightStrength, type Note } from "../../lib/relationships";
import { formatOccurredAt, formatRelative } from "./dateFormat";
import { COLOR, COOL } from "../../lib/designTokens";
import { CANON, FACE } from "../../lib/canonicalTokens";
import InsightComposer from "./InsightComposer";

function interactionTypeLabel(type: InteractionType): string {
  if (type === "publication_review") return "PUBLICATION REVIEW";
  return type.toUpperCase();
}

// Interaction-type chips, on canonical marks (2026-08-20). These carried six bespoke
// hues -- #4A90E2, #5A9B7F, #7B7B9C, #9B6DFF, #3FB8AF, #E8A020 -- none of them tokens.
//
// email / other / conference NOW SHARE MARK.RS, and that is the accepted trade. All
// three were in the blue/indigo family, which MARK.RS absorbs by construction ("no
// separate blue"); keeping them apart means keeping three raw hexes on a profile
// surface, which is the thing the token system exists to remove. The chip carries its
// type as TEXT, so nothing becomes unreadable -- only less colour-separable. If the
// interaction axis ever needs to be visually separable, that is a VIZ-palette question
// (canonicalTokens VIZ), not six one-off values re-entered here.
function interactionChipStyle(type: InteractionType): CSSProperties | null {
  switch (type) {
    case "general":
      return null;
    case "meeting":
      return { backgroundColor: CANON.GOLD.PRIME, color: CANON.GROUND.BASE };
    case "email":
      return { backgroundColor: CANON.MARK.RS, color: CANON.INK.PRIME };
    case "phone":
      return { backgroundColor: CANON.MARK.EST, color: CANON.INK.PRIME };
    case "other":
      return { backgroundColor: CANON.MARK.RS, color: CANON.INK.PRIME };
    case "conference":
      return { backgroundColor: CANON.MARK.RS, color: CANON.INK.PRIME };
    case "publication_review":
      // #3FB8AF was already ACTION.LINK's exact value -- a token by coincidence.
      return { backgroundColor: CANON.ACTION.LINK, color: CANON.GROUND.BASE };
    case "internal":
      return { border: `1px solid ${CANON.INK.MUTE}`, color: CANON.INK.MUTE, backgroundColor: "transparent" };
    default:
      return { backgroundColor: CANON.GROUND.INSET, color: CANON.INK.LABEL };
  }
}

function strengthChipStyle(strength: InsightStrength): CSSProperties {
  if (strength === "notable") {
    return { border: `1px solid ${CANON.GOLD.PRIME}`, color: CANON.GOLD.PRIME, backgroundColor: "transparent" };
  }
  return { backgroundColor: CANON.GOLD.PRIME, color: CANON.GROUND.BASE, fontWeight: 600 };
}

const chipBase: CSSProperties = {
  fontSize: 11,
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
  variant?: "ledger";
}

export default function InsightCard({ note, userId, hcpId, firstName, onMutate, variant }: Props) {
  const ledger = variant === "ledger";
  const navigate = useNavigate();
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
          fontFamily: FACE.ui,
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
    <div style={{ fontFamily: FACE.ui }}>
      <div
        style={
          ledger
            ? { padding: "18px 24px", borderBottom: `1px solid ${CANON.LINE.HAIR}` } // ledger register: tight row, no card chrome
            : {
                backgroundColor: "#0D0D10",
                border: "1px solid #1E1E22",
                borderRadius: 4,
                padding: 12,
              }
        }
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          {ledger ? (
            // Ledger register (academic profile): the two taxonomies are distinguished
            // STRUCTURALLY, not by hue. SOURCE-TYPE (where the observation came from) is
            // sage bold mono text with no border; SIGNIFICANCE (how much it matters) is a
            // bordered mono chip. Platform charcoal/gold/ink only — no purple/orange/blue.
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
              {note.interaction_type !== "general" ? (
                <span style={{ font: `600 9px/1 ${FACE.data}`, letterSpacing: ".14em", color: CANON.MARK.EST, textTransform: "uppercase" }}>
                  {interactionTypeLabel(note.interaction_type)}
                </span>
              ) : null}
              {note.insight_strength !== "routine" ? (
                <span style={{
                  font: `600 9px/1 ${FACE.data}`, letterSpacing: ".14em", padding: "3px 6px",
                  color: note.insight_strength === "notable" ? CANON.INK.LABEL : CANON.GOLD.PRIME,
                  border: `1px solid ${note.insight_strength === "notable" ? CANON.LINE.HAIR : CANON.GOLD.EDGE}`,
                }}>
                  {note.insight_strength === "notable" ? "NOTABLE" : "STRATEGIC"}
                </span>
              ) : null}
              <span style={{ font: `400 9px/1 ${FACE.data}`, letterSpacing: ".14em", color: CANON.INK.MUTE }}>
                {formatOccurredAt(note.occurred_at).toUpperCase()}
              </span>
            </div>
          ) : (
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
                <span style={{ color: CANON.INK.MUTE, margin: "0 6px" }}>·</span>
              )}
              <span style={{ fontSize: 13, color: CANON.INK.LABEL }}>{formatOccurredAt(note.occurred_at)}</span>
            </div>
          )}

          <div ref={menuRef} style={{ position: "relative" }}>
            {/* Ledger register: the last old-system glyph on this block, restyled into
                the platform's mono/ink control language (was a 16px sans "· · ·"). */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Insight options"
              aria-expanded={menuOpen}
              onMouseEnter={ledger ? (e) => { e.currentTarget.style.color = "#8b918b"; } : undefined}
              onMouseLeave={ledger ? (e) => { e.currentTarget.style.color = "#4b514d"; } : undefined}
              style={
                ledger
                  ? { background: "none", border: "none", color: CANON.INK.GHOST, cursor: "pointer", padding: "0 2px", lineHeight: 1,
                      font: `700 13px/1 ${FACE.data}`, letterSpacing: ".08em" }
                  : { background: "none", border: "none", color: "#6B6A65", fontSize: 17, cursor: "pointer", padding: "0 4px", lineHeight: 1 }
              }
            >
              {ledger ? "···" : "· · ·"}
            </button>
            {menuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  backgroundColor: ledger ? "#0E1013" : "#0D0D10",
                  border: `1px solid ${ledger ? "rgba(255,255,255,.09)" : "#1E1E22"}`,
                  borderRadius: ledger ? 2 : 4,
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
                  style={
                    ledger
                      ? { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none",
                          color: COOL.prose, cursor: "pointer", font: `500 11px/1 ${FACE.data}`, letterSpacing: ".12em", textTransform: "uppercase" }
                      : { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: "#E8E6DF", fontSize: 13, cursor: "pointer" }
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  style={
                    ledger
                      ? { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none",
                          color: COOL.prose, cursor: "pointer", font: `500 11px/1 ${FACE.data}`, letterSpacing: ".12em", textTransform: "uppercase" }
                      : { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: "#E8E6DF", fontSize: 13, cursor: "pointer" }
                  }
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Body prose is serif on this platform (both variants); ledger uses the frame's
            note ink + measure. */}
        <div style={ledger
          ? { fontFamily: FACE.value, fontSize: 13, color: CANON.INK.BODY, lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 11, textWrap: "pretty" as const }
          : { fontFamily: FACE.value, fontSize: 15, color: COLOR.ink1, lineHeight: 1.72, whiteSpace: "pre-wrap" }}>
          {note.body}
        </div>

        {note.belief_claim_title ? (
          (() => {
            // The field-note → sourced-position connection is the most valuable thing on
            // the block: content, structure and this affordance are preserved. Only the
            // register changes — the ledger link is teal (gold/teal ledger treatment),
            // not the old purple pill.
            const goToClaim = () => {
              const claimEl = note.belief_claim_key
                ? document.getElementById(`claim-${note.belief_claim_key}`)
                : null;
              if (claimEl) { claimEl.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
              const sectionEl = document.getElementById("belief-profile");
              if (sectionEl) { sectionEl.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
              // No local belief profile (e.g. the rising spine) — the brief route
              // carries it for every cohort; /hcp/:id would dispatch straight back
              // to the spine we're on and drop the hash.
              navigate(`/hcp/${hcpId}/brief#belief-profile`);
            };
            if (ledger) {
              return (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, marginTop: 11 }}>
                  <span style={{ font: `400 9px/1 ${FACE.data}`, letterSpacing: ".16em", color: CANON.INK.GHOST }}>LINKED POSITION</span>
                  <button
                    type="button"
                    onClick={goToClaim}
                    aria-label={`View linked Belief Profile: ${note.belief_claim_title}`}
                    style={{ background: "none", border: "none", padding: "0 0 2px", cursor: "pointer",
                      font: `600 9px/1 ${FACE.data}`, letterSpacing: ".1em", color: CANON.ACTION.LINK, borderBottom: `1px solid ${CANON.LINE.HAIR}` }}
                  >
                    {note.belief_claim_title.toUpperCase()} ↗
                  </button>
                </div>
              );
            }
            return (
              <button
                type="button"
                onClick={goToClaim}
                aria-label={`View linked Belief Profile: ${note.belief_claim_title}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(155, 109, 255, 0.08)", border: "1px solid rgba(155, 109, 255, 0.30)",
                  color: CANON.MARK.RS, padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500,
                  cursor: "pointer", fontFamily: "inherit", marginTop: 10, transition: "background-color 120ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(155, 109, 255, 0.14)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(155, 109, 255, 0.08)"; }}
              >
                <span style={{ color: CANON.INK.LABEL, fontWeight: 400 }}>Linked Belief Profile:</span>
                <span>{note.belief_claim_title}</span>
                <span aria-hidden style={{ color: CANON.INK.LABEL, marginLeft: 2 }}>{String.fromCharCode(0x2192)}</span>
              </button>
            );
          })()
        ) : null}

        {showFooter ? (
          <div style={{ fontSize: 11, color: CANON.INK.MUTE, marginTop: 8 }}>
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
