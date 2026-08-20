// /hcp/:id dispatches across THREE profile surfaces, resolved in this order:
//
//   1. RISING — membership in hcp_rising_star_ranks_v3 for the TA, read directly
//      by isOnRisingBoard() before the spine is consulted. Rising WINS over an
//      established rank: 422 of the 619 board members are dual-board (78 of the
//      123 US), and their established rank renders as a SECTION on the rising
//      profile, never as a competing route.
//   2. ACADEMIC — membership of the ESTABLISHED board, via hcp_profile_spine().
//   3. COMMUNITY — everyone else.
//
// WHAT DECIDES A ROUTE IS BOARD MEMBERSHIP, NOT EXTRACTOR COVERAGE. This comment
// used to describe rule 2 as ">=1 sourced position or ranked research theme",
// which was the rule until 2026-08-14 and is no longer what the function does.
// migrations/2026_08_14_profile_spine_board_membership.sql replaced it, because
// both extractors are hardcoded to US scope: of the 3,905 European HCPs reachable
// through the ledger territory axis, 0 had positions and 0 had themes, so all
// 3,905 routed to the community spine — Martin Reck, #1 on the German Established
// board with 280 publications, among them. Extractor coverage decides which
// BLOCKS populate a profile; board membership decides which profile you get.
// The pre-08-14 definition is kept at sql/profile_spine/hcp_profile_spine.PREVIOUS.sql.
// Do not widen rule 2 back toward positions/themes without re-reading that migration.
//
// KNOWN GAP, NOT A ROUTING BUG: an HCP on NO board falls to COMMUNITY by
// exhaustion, and for a publishing academic without an NPI that surface has
// nothing to show — it is built on Medicare, payments and practice shape. The
// answer is a surface that describes publishing academics who hold no board
// position, not a wider spine; widening the spine would only re-admit the
// US-scoped test above. Sized 2026-08-17 against the rising floor change.
//
// Layout authority for the rising branch: docs/design/Rising Surface.dc.html.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadProfileSpine } from "../../lib/communityProfile";
import { isOnRisingBoard } from "../../lib/risingProfile";
import HcpProfileBrief from "./HcpProfileBrief";
import CommunityHcpProfile from "./CommunityHcpProfile";
import RisingHcpProfile from "./RisingHcpProfile";
import { CANON, FACE } from "../../lib/canonicalTokens";

export default function ProfileDispatch() {
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<"rising" | "academic" | "community" | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const rising = await isOnRisingBoard(id);
      if (!alive) return;
      if (rising) {
        setRoute("rising");
        return;
      }
      const spine = await loadProfileSpine(id);
      if (alive) setRoute(spine);
    })();
    return () => { alive = false; };
  }, [id]);

  if (route === null) {
    return (
      <div style={{ background: CANON.GROUND.BASE, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: CANON.INK.LABEL, font: `400 11px ${FACE.data}` }}>
        Loading profile…
      </div>
    );
  }
  if (route === "rising") return <RisingHcpProfile hcpId={id as string} />;
  return route === "academic" ? <HcpProfileBrief /> : <CommunityHcpProfile />;
}
