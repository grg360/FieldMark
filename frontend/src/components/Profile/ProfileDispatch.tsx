// /hcp/:id dispatches across THREE profile surfaces, resolved in this order:
//
//   1. RISING — membership in hcp_rising_star_ranks_v3 for the TA. Rising WINS:
//      it beats the positions test (84 rising HCPs have extracted positions and
//      would otherwise route academic) and it beats an established rank (122 of
//      the 208 US rising stars are dual-board; their established rank renders
//      as a SECTION on the rising profile, never as a competing route).
//   2. ACADEMIC — >=1 sourced position or ranked research theme (hcp_profile_spine).
//   3. COMMUNITY — everyone else; the spine that renders without publications.
//
// Layout authority for the rising branch: docs/design/Rising Surface.dc.html.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadProfileSpine } from "../../lib/communityProfile";
import { isOnRisingBoard } from "../../lib/risingProfile";
import HcpProfileBrief from "./HcpProfileBrief";
import CommunityHcpProfile from "./CommunityHcpProfile";
import RisingHcpProfile from "./RisingHcpProfile";

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
      <div style={{ background: "#08090A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#7C8288", font: "400 11px 'IBM Plex Mono',monospace" }}>
        Loading profile…
      </div>
    );
  }
  if (route === "rising") return <RisingHcpProfile hcpId={id as string} />;
  return route === "academic" ? <HcpProfileBrief /> : <CommunityHcpProfile />;
}
