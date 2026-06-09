import { useState } from "react";
import type { Note } from "../../lib/relationships";
import InsightCard from "./InsightCard";

interface Props {
  notes: Note[];
  firstName: string;
  userId: string;
  hcpId: string;
  onMutate: () => void;
}

export default function InsightThread({ notes, firstName, userId, hcpId, onMutate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const showToggle = notes.length > 3;
  const visibleNotes = showToggle && !expanded ? notes.slice(0, 3) : notes;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleNotes.map((note) => (
          <InsightCard
            key={note.id}
            note={note}
            userId={userId}
            hcpId={hcpId}
            firstName={firstName}
            onMutate={onMutate}
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
