// Shared relationship-controls block for BOTH profile spines (academic + community).
// This is a PORT of DetailScreen's existing controls to the new host — the exact same
// components and write paths, so state set on the profile syncs with the ledger,
// DetailScreen, and everywhere else:
//   • Track bookmark   → useRelationships().toggleSave / isTracked (watchlist union)
//   • Add to watchlist → AddToWatchlistPopover (needs the relationship id)
//   • Status + follow-ups → RelationshipSection (StatusEditor + FollowUpsList)
//   • Field note capture  → FieldInsights (InsightComposer → createNote → msl_hcp_notes)
// Behaviour is identical to DetailScreen because these are the same components.

import { useEffect, useRef, useState } from "react";
import type { HCP } from "../../data/hcpData";
import { getCurrentUser } from "../../lib/authHelpers";
import { getOrCreateRelationship } from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import AddToWatchlistPopover from "../AddToWatchlistPopover";
import RelationshipSection from "../RelationshipSection/RelationshipSection";

/** Minimal HCP shape the reused DetailScreen components read (hcp_id / id / name /
 *  specialty). Shared so the profile spines pass identical objects to RelationshipSection
 *  and FieldInsights. */
export function profileHcp(hcpId: string, name: string, specialty?: string | null): HCP {
  return { hcp_id: hcpId, id: hcpId, name, specialty: specialty ?? "" } as unknown as HCP;
}

function Bookmark({ on }: { on: boolean }) {
  return (
    <svg width="13" height="16" viewBox="0 0 12 15" aria-hidden>
      <path d="M1 1.5h10v12l-5-3.2-5 3.2z" fill={on ? "#EDEEEF" : "none"} stroke={on ? "#EDEEEF" : "#7C8288"} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

const btn = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px",
  background: "none", border: "1px solid rgba(255,255,255,.14)", cursor: "pointer",
  font: "500 10px 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: "#C6CACD",
  borderRadius: 2, minHeight: 0,
} as const;

export default function ProfileRelationshipControls({ hcpId, hcpName, specialty }: {
  hcpId: string;
  hcpName: string;
  specialty?: string | null;
}) {
  const { isTracked, toggleSave, refreshTracked } = useRelationships();
  const [userId, setUserId] = useState<string | null>(null);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [wlAnchor, setWlAnchor] = useState<DOMRect | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    getCurrentUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => { alive = false; };
  }, []);

  const tracked = isTracked(hcpId);
  const hcp = profileHcp(hcpId, hcpName, specialty);

  async function openWatchlist() {
    if (!userId) return;
    // the popover targets a relationship id — create the row if this is the first touch
    if (!relationshipId) {
      const rel = await getOrCreateRelationship(userId, hcpId, "hcp_profile");
      setRelationshipId(rel.id);
    }
    setWlAnchor(addRef.current?.getBoundingClientRect() ?? null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* control bar — track + add-to-watchlist */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => void toggleSave(hcpId, "hcp_profile")}
          style={{ ...btn, color: tracked ? "#EDEEEF" : "#C6CACD", borderColor: tracked ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.14)" }}
          title={tracked ? "Tracked — click to untrack" : "Track this HCP"}
        >
          <Bookmark on={tracked} /> {tracked ? "TRACKED" : "TRACK"}
        </button>
        <button ref={addRef} onClick={() => void openWatchlist()} style={btn} title="Add to a watchlist">
          + ADD TO LIST
        </button>
      </div>

      {/* status + follow-ups (renders once a relationship exists — same as DetailScreen) */}
      <RelationshipSection hcp={hcp} />

      {wlAnchor && userId && relationshipId ? (
        <AddToWatchlistPopover
          userId={userId}
          relationshipId={relationshipId}
          anchorRect={wlAnchor}
          onClose={() => { setWlAnchor(null); void refreshTracked(); }}
        />
      ) : null}
    </div>
  );
}
