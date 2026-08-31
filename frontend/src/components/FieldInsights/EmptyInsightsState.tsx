// Field-insights empty state — the profile surface's absence vocabulary, matching
// Withheld (HcpProfileBrief) slot for slot: LINE.HAIR border, GROUND.RAISE fill,
// 16x18 padding, INK.LABEL head, INK.BODY prose. Replaces the old dashed box +
// yellow filled button: nothing else on the page uses a filled button, and the
// absence is stated, not decorated.
//
// REPOINTED 2026-08-19. Six raw hexes, no colour token among them -- this file was
// missed by dfa4ca5, which repointed FieldInsights.tsx only. Two of the six broke
// the ramp's temperature rule outright: prose #c6c2bb is (198,194,187), warm, where
// INK.BODY is (192,198,205), cool; and the #0a0b0b fill sat BELOW GROUND.BASE, so an
// empty state punched a hole darker than the page canvas into a raised panel.
//
// NO ACCENT. The capture control takes INK.LABEL over LINE.EDGE -- the same treatment
// as the "ALL FIELD INSIGHTS ON ..." link directly above it in the section. Gold here
// would make the quietest thing on the section the loudest. GOLD.RANK in particular is
// reserved for rank numerals and ledger ordinals; it was never eligible.
//
// FULL MEASURE. The prose carried maxWidth: 64ch, which on a wide profile panel
// stopped the paragraph short and left the block visibly left-justified against
// empty space. Withheld sets no measure cap, so neither does this -- the block
// fills its container like every other absence state on the surface.

import { CANON, FACE } from "../../lib/canonicalTokens";

interface Props {
  firstName: string;
  onAddClick: () => void;
}

const MONO = FACE.data;
const SERIF = FACE.value; // was Source Serif 4 — the fallback face rendering live (side-by-side-serifs bug)

export default function EmptyInsightsState({ firstName, onAddClick }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 18px", border: `1px solid ${CANON.LINE.HAIR}`, background: CANON.GROUND.RAISE }}>
      <div style={{ font: `600 9px/1 ${MONO}`, letterSpacing: ".16em", color: CANON.INK.LABEL }}>
        NO FIELD INSIGHTS CAPTURED
      </div>
      <div style={{ font: `400 15px/1.6 ${SERIF}`, color: CANON.INK.BODY, textWrap: "pretty" }}>
        Nothing has been logged from a field interaction with Dr.&nbsp;{firstName}. This
        section fills as your team captures what it learns in the room — the observation,
        and why it matters — each private to you until you choose to share it.
      </div>
      <button
        type="button"
        onClick={onAddClick}
        aria-label={`Capture a field insight about Dr. ${firstName}`}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          padding: "0 0 2px",
          cursor: "pointer",
          font: `600 10px/1 ${MONO}`,
          letterSpacing: ".16em",
          color: CANON.INK.LABEL,
          borderBottom: `1px solid ${CANON.LINE.EDGE}`,
        }}
      >
        + CAPTURE AN INSIGHT
      </button>
    </div>
  );
}
