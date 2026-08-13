import { useState } from "react";
import type { Note } from "../../lib/relationships";
import { FACE } from "../../lib/canonicalTokens";
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
            marginTop: 10,
            background: "none",
            border: "none",
            color: "#9B9892",
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {expanded ? "Show less" : `View all (${notes.length})`}
        </button>
      ) : null}
    </div>
  );
}
