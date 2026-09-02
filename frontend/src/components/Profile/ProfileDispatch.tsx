// /hcp/:id dispatches across THREE profile surfaces, resolved in this order:
//
//   1. RISING — membership in hcp_rising_star_ranks_v3 for the TA, read directly
//      by isOnRisingBoard() before the spine is consulted. Rising WINS over an
//      established rank.
//
//      THAT PRECEDENCE NO LONGER DECIDES ANYTHING (2026-08-26). It existed because
//      the rising gate carried an OR-15 clause admitting established HCPs onto the
//      rising board — 203 of NSCLC's 336 members were dual-board at the last
//      measurement (this comment previously said 422 of 619, itself stale). The
//      clause is gone and the boards are disjoint by construction, so rules 1 and
//      2 can no longer both match. The ordering is kept because it costs nothing
//      and is the correct tie-break if the two ever overlap again.
//
//      CONSEQUENCE, LOGGED NOT FIXED: RisingHcpProfile still renders an established
//      rank as a SECTION for dual-board members. That path is now unreachable. Read
//      docs/canonical/RISING_EXCLUSIVE_GATE_DEBT.md before deleting it — the section is also the
//      layout slot the design authority reserves for it.
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
import { useProfileTa } from "../../lib/profileTa";
import { taLabelForSlug } from "../../lib/taLabels";
import { COM_CONFIG } from "../../lib/cohortLedger";

export default function ProfileDispatch() {
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<"rising" | "academic" | "community" | null>(null);
  // ?ta= -> session -> the HCP's own primary TA. Optional by design; see lib/profileTa.ts for
  // the measurement that makes a fallback safe here where the ledger needed a picker.
  const ta = useProfileTa(id);
  const taId = ta.status === "resolved" ? ta.taId : null;

  useEffect(() => {
    if (!id || !taId) return;
    let alive = true;
    setRoute(null);
    (async () => {
      const rising = await isOnRisingBoard(id, taId);
      if (!alive) return;
      if (rising) {
        setRoute("rising");
        return;
      }
      const spine = await loadProfileSpine(id, taId);
      if (alive) setRoute(spine);
    })();
    return () => { alive = false; };
  }, [id, taId]);

  // The HCP belongs to no therapeutic area at all -- profileTa never substitutes one, so
  // there is nothing to render a profile ABOUT. Named, not blank.
  if (ta.status === "none") {
    return (
      <Absence
        eyebrow="NO THERAPEUTIC AREA"
        head="This person is not in any therapeutic area we hold."
        body="A profile is always scoped to one area — the ranks, themes and narratives on it are per-area. With no area membership there is nothing to scope it to, so nothing is shown rather than an empty frame under a borrowed heading."
      />
    );
  }

  // COMMUNITY IS STILL NSCLC-ONLY (Phase 3). community_hcp_profile reads
  // community_board_nsclc_v1 and hcp_nsclc_evidence_tier_v1, neither of which takes a TA, so
  // rendering the community shell for another area would show LUNG evidence tiers under that
  // area's name. An explicit absence is the honest alternative, and it is the same boundary
  // the ledger draws for its Community cohort.
  if (route === "community" && ta.status === "resolved"
      && COM_CONFIG.pinnedTaSlug && ta.slug !== COM_CONFIG.pinnedTaSlug) {
    return (
      <Absence
        eyebrow={`COMMUNITY PROFILE UNAVAILABLE · ${taLabelForSlug(ta.slug).toUpperCase()}`}
        head={`The community profile is only built for ${taLabelForSlug(COM_CONFIG.pinnedTaSlug)} so far.`}
        body={`This person is not on the ${taLabelForSlug(ta.slug)} established or rising board, so the community view is the one that applies — and it rests on an evidence ladder that is curated per area. ${taLabelForSlug(ta.slug)} has not been curated yet, so there is nothing to show. Their lung-cancer profile, if they have one, is at ?ta=${COM_CONFIG.pinnedTaSlug}.`}
      />
    );
  }

  if (route === null) {
    return (
      <div style={{ background: CANON.GROUND.BASE, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: CANON.INK.LABEL, font: `400 11px ${FACE.data}` }}>
        Loading profile…
      </div>
    );
  }
  if (route === "rising") return <RisingHcpProfile hcpId={id as string} taId={taId as string} taSlug={ta.status === "resolved" ? ta.slug : ""} />;
  return route === "academic"
    ? <HcpProfileBrief taId={taId as string} taSlug={ta.status === "resolved" ? ta.slug : ""} themesTag={ta.status === "resolved" ? ta.themesTag : null} />
    : <CommunityHcpProfile />;
}

/** Shared frame for the two states where no profile can honestly be drawn. */
function Absence({ eyebrow, head, body }: { eyebrow: string; head: string; body: string }) {
  return (
    <div style={{ background: CANON.GROUND.BASE, minHeight: "100vh", padding: "72px 28px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ font: `500 9px ${FACE.data}`, letterSpacing: ".16em", color: CANON.INK.LABEL, marginBottom: 14 }}>{eyebrow}</div>
        <div style={{ font: `400 21px ${FACE.value}`, color: CANON.INK.PRIME, marginBottom: 12, textWrap: "pretty" } as React.CSSProperties}>{head}</div>
        <div style={{ font: `300 14px/1.65 ${FACE.value}`, color: CANON.INK.MUTE, textWrap: "pretty" } as React.CSSProperties}>{body}</div>
      </div>
    </div>
  );
}
