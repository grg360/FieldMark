import { useCallback, useEffect, useState } from "react";
import { HCP } from "../../data/hcpData";
import { getCurrentUser } from "../../lib/authHelpers";
import { getNotesForHcp, type Note } from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { FONT } from "../../lib/designTokens";
// Palette repointed to canonical tokens 2026-08-19 (the block was on hardcoded hex that
// predated the token migration): #1E1E22 -> GROUND.INSET, #0a0b0b -> GROUND.BASE,
// #1a1d1c -> LINE.HAIR, #8f8b83 -> INK.LABEL, #6B6A65 -> INK.MUTE (the token's own
// comment records it absorbing this exact hex, "census #6b6a65 x130"), #E8A020 ->
// GOLD.PRIME (same hex, now named rather than repeated).
//
// TWO BORDERS TAKE LINE.HAIR RATHER THAN THEIR VALUE-EQUIVALENT: `1px solid #1E1E22`
// and `1px solid #1a1d1c` were rules drawn in fill colours, and LINE.HAIR is the token
// for a 1px rule. That lightens both hairlines slightly (#1E1E22/#1a1d1c -> #272D34) --
// the one place this repoint changes a pixel rather than just naming it.
import { FACE, CANON } from "../../lib/canonicalTokens";
import EmptyInsightsState from "./EmptyInsightsState";
import InsightComposer from "./InsightComposer";
import InsightComposerModal from "./InsightComposerModal";
import InsightThread from "./InsightThread";

interface Props {
  hcp: HCP;
  /** "ledger" renders tight ledger-register rows (academic brief) instead of the default
   *  heavy cards. Community passes nothing → default, unchanged. */
  variant?: "ledger";
  /** Skip the internal "FIELD INSIGHTS (n)" header when the host provides its own
   *  section header (kills the doubled header on the academic brief). */
  hideHeader?: boolean;
}

function resolveHcpId(hcp: HCP): string {
  return String(hcp.hcp_id ?? hcp.id ?? "");
}

// The capture prompts address the physician formally — Dr. <surname>, never
// Dr. <first name> (the "Dr. Suresh" bug, fixed 2026-08-07). The prop keeps its
// historical name downstream; the VALUE is the surname.
function resolveSurname(hcp: HCP): string {
  const name = (hcp.name ?? "").trim();
  if (!name) return "this HCP";
  const parts = name.split(/\s+/);
  return (parts[parts.length - 1] ?? "this HCP").replace(/[.,]+$/, "") || "this HCP";
}

export default function FieldInsights({ hcp, variant, hideHeader }: Props) {
  const hcpId = resolveHcpId(hcp);
  const firstName = resolveSurname(hcp);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { refreshInsightCounts } = useRelationships();

  const [userId, setUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const bumpNonce = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((user) => {
      if (!cancelled) setUserId(user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId || !hcpId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    getNotesForHcp(userId, hcpId)
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .catch((err) => {
        console.error("FieldInsights fetch failed", err);
        if (!cancelled) setNotes([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, hcpId, refreshNonce]);

  if (!hcpId || !userId) return null;

  function handleMutate() {
    bumpNonce();
    void refreshInsightCounts();
  }

  function handleSave() {
    setComposerOpen(false);
    handleMutate();
  }

  function handleAddClick() {
    setComposerOpen(true);
  }

  const sectionStyle = {
    padding: "16px",
    borderBottom: `1px solid ${CANON.LINE.HAIR}`,
    fontFamily: FACE.ui,
  } as const;

  if (isLoading) {
    return (
      <div style={sectionStyle}>
        <div
          aria-hidden
          style={{
            height: 60,
            backgroundColor: CANON.GROUND.INSET,
            borderRadius: 4,
            opacity: 0.35,
          }}
        />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      // Same ledger de-chroming as the populated branch below. This branch used bare
      // sectionStyle, so on every ledger host the EMPTY state alone carried a 16px
      // inset and a bottom rule the populated state does not -- nested inside the
      // host's own bordered DEPTH.PANEL. Three frames where the design has one.
      <div style={variant === "ledger" ? { ...sectionStyle, padding: 0, borderBottom: "none" } : sectionStyle}>
        <EmptyInsightsState firstName={firstName} onAddClick={handleAddClick} />
        {!isMobile && composerOpen ? (
          <div style={{ marginTop: 12 }}>
            <InsightComposer
              userId={userId}
              hcpId={hcpId}
              firstName={firstName}
              isInline
              forceExpanded
              onSave={handleSave}
              onCancel={() => setComposerOpen(false)}
            />
          </div>
        ) : null}
        {isMobile && composerOpen ? (
          <InsightComposerModal
            userId={userId}
            hcpId={hcpId}
            firstName={firstName}
            onSave={handleSave}
            onCancel={() => setComposerOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div style={variant === "ledger" ? { ...sectionStyle, padding: 0, borderBottom: "none" } : sectionStyle}>
      {hideHeader ? null : (
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            fontWeight: 600,
            color: CANON.INK.LABEL,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          FIELD INSIGHTS{" "}
          <span style={{ color: CANON.INK.MUTE, textTransform: "none", letterSpacing: "normal" }}>
            ({notes.length})
          </span>
        </div>
      )}

      {variant === "ledger" ? (
        // ledger capture affordance — the frame's "+ CAPTURE" bar (composer renders the
        // gold marker + serif prompt + SOURCE·TAG·LINK affordance in the ledger register).
        // GROUND.INSET, not GROUND.BASE (2026-08-20). BASE is the APP CANVAS at L* 7;
        // this bar sits inside the profile's DEPTH.PANEL (a gradient over RAISE, L* 11),
        // so a canvas fill read as a hole punched two steps THROUGH the panel -- the
        // near-black. INSET (L* 15) is the token for "inputs, wells, hover fill", which
        // is what a capture bar is, and it sits one step ABOVE the panel: the direction
        // a thing you click into should go.
        <div style={{ borderBottom: `1px solid ${CANON.LINE.HAIR}`, background: CANON.GROUND.INSET }}>
          <InsightComposer userId={userId} hcpId={hcpId} firstName={firstName} isInline variant="ledger" onSave={handleSave} />
        </div>
      ) : !isMobile ? (
        <InsightComposer
          userId={userId}
          hcpId={hcpId}
          firstName={firstName}
          isInline
          onSave={handleSave}
        />
      ) : (
        <button
          type="button"
          onClick={handleAddClick}
          aria-label="Add insight"
          style={{
            width: "75%",
            marginBottom: 12,
            padding: "8px 16px",
            backgroundColor: CANON.GOLD.PRIME,
            color: CANON.GROUND.BASE,
            border: "none",
            borderRadius: 4,
            fontWeight: 500,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          + Add Insight
        </button>
      )}

      <InsightThread
        notes={notes}
        firstName={firstName}
        userId={userId}
        hcpId={hcpId}
        onMutate={handleMutate}
        variant={variant}
      />

      {isMobile && composerOpen ? (
        <InsightComposerModal
          userId={userId}
          hcpId={hcpId}
          firstName={firstName}
          onSave={handleSave}
          onCancel={() => setComposerOpen(false)}
        />
      ) : null}
    </div>
  );
}
