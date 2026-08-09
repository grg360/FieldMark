// Social — top-level NavBar destination (label SOCIAL; the surface titles itself
// "The public conversation"). TA-scoped and addressable, mirroring Pulse's shape:
// /social defaults to oncology, /social/:ta addresses a therapeutic area.
//
// v4 BUILD (2026-07-31): renders PublicConversation (layout authority
// docs/design/Public Conversation v4.dc.html; data via the public_conversation
// RPC). The NSCLC conversation is captured under the "oncology" TA tag; the
// surface titles it NSCLC, matching the frame. Capture exists only for
// oncology and hepatology (social_posts_v2.therapeutic_areas, audited
// 2026-07-31) — other TAs get the honest empty state, matching the Pulse
// no-cycle pattern. SocialTrackEmpty is superseded here (retained in-tree).

import { useState } from "react";
import { useParams } from "react-router-dom";
import AppLayout from "./AppLayout";
import PublicConversation from "./PublicConversation";
import SocialSearch from "./SocialSearch";
import { COLOR, FONT } from "../lib/designTokens";
import { taSlugToLabel } from "../lib/routeSlugs";
import { useMediaQuery } from "../lib/useMediaQuery";

const SOCIAL_CAPTURE_TAS = new Set(["oncology", "hepatology"]);
// The oncology capture is the NSCLC conversation (its queries were NSCLC/ASCO
// hashtags); the frame titles the surface "/ NSCLC".
const SURFACE_LABEL: Record<string, string> = { oncology: "NSCLC", hepatology: "Hepatology" };

export default function SocialPage() {
  const params = useParams();
  const narrow = useMediaQuery("(max-width: 767px)");
  const taSlug = (params.ta ?? "oncology").toLowerCase();
  const taLabel = taSlugToLabel(taSlug);
  const [searchActive, setSearchActive] = useState(false);

  if (!SOCIAL_CAPTURE_TAS.has(taSlug)) {
    return (
      <AppLayout width="reading">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
            paddingTop: 64,
            textAlign: "center",
            fontFamily: FONT.sans,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, color: COLOR.ink1 }}>
            No social capture for this therapeutic area yet.
          </div>
          <p style={{ fontSize: 13, color: COLOR.ink3, lineHeight: 1.6, margin: 0, maxWidth: 440 }}>
            The public conversation is built per therapeutic area from captured
            posts. Capture has not started for {taLabel} &mdash; this surface will
            populate when the first capture run lands.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout width="wide">
      {/* Search in the surface header (platform pattern) — owned here so the
          frozen v4 PublicConversation stays untouched. An active query swaps
          the conversation out for the results panel; CLEAR restores it. */}
      <SocialSearch
        taSlug={taSlug}
        taLabel={SURFACE_LABEL[taSlug] ?? taLabel}
        narrow={narrow}
        onActiveChange={setSearchActive}
      />
      {searchActive ? null : (
        <PublicConversation taSlug={taSlug} taLabel={SURFACE_LABEL[taSlug] ?? taLabel} narrow={narrow} />
      )}
    </AppLayout>
  );
}
