// /hcp/:id/brief dispatches to the academic (belief) profile or the community (disclosure)
// profile — keyed on the PUBLICATION RECORD, not the cohort enum. An HCP with ≥1 sourced
// position renders the academic spine; otherwise the community spine. This keys the route
// on the thing that actually determines which spine can render (a belief profile cannot
// render for someone with no publications), so the route never disagrees with the page.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadProfileSpine } from "../../lib/communityProfile";
import HcpProfileBrief from "./HcpProfileBrief";
import CommunityHcpProfile from "./CommunityHcpProfile";

export default function ProfileDispatch() {
  const { id } = useParams<{ id: string }>();
  const [spine, setSpine] = useState<"academic" | "community" | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadProfileSpine(id).then((s) => alive && setSpine(s));
    return () => { alive = false; };
  }, [id]);

  if (spine === null) {
    return (
      <div style={{ background: "#08090A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#7C8288", font: "400 11px 'IBM Plex Mono',monospace" }}>
        Loading profile…
      </div>
    );
  }
  return spine === "academic" ? <HcpProfileBrief /> : <CommunityHcpProfile />;
}
