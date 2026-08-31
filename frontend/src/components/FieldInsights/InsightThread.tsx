import { useState } from "react";
import type { Note } from "../../lib/relationships";
import { CANON, FACE } from "../../lib/canonicalTokens";
import InsightCard from "./InsightCard";

interface Props {
  notes: Note[];
  firstName: string;
  userId: string;
  hcpId: string;
  onMutate: () => void;
  variant?: "ledger";
}

export default function InsightThread({ notes, firstName, userId, hcpId, onMutate, variant }: Props) {
  const [expanded, setExpanded] = useState(false);
  const showToggle = notes.length > 3;
  const visibleNotes = showToggle && !expanded ? notes.slice(0, 3) : notes;

  return (
    <div style={{ fontFamily: FACE.ui }}>
      <div style={{ display: "flex", flexDirection: "column", gap: variant === "ledger" ? 0 : 8 }}>
        {visibleNotes.map((note) => (
          <InsightCard
            key={note.id}
            note={note}
            userId={userId}
            hcpId={hcpId}
            firstName={firstName}
            onMutate={onMutate}
            variant={variant}
          />
        ))}
      </div>

      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          style={{
            background: "none",
            border: "none",
            color: CANON.INK.LABEL,
            fontSize: 13,
            cursor: "pointer",
            // The ledger register strips FieldInsights' own 16px inset (the host panel
            // frames the block), which left this toggle flush against the panel edge and
            // hard on its bottom rule. It carries its own padding there instead: 24px
            // horizontal to sit on the InsightCard ledger row's text column, and real
            // vertical room off the last row's hairline.
            ...(variant === "ledger"
              ? { display: "block", textAlign: "left" as const, padding: "14px 24px 16px" }
              : { marginTop: 10, padding: 0 }),
          }}
        >
          {expanded ? "Show less" : `View all (${notes.length})`}
        </button>
      ) : null}
    </div>
  );
}
