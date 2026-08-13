import { useCallback, useEffect, useState } from "react";
import { HCP } from "../../data/hcpData";
import { getCurrentUser } from "../../lib/authHelpers";
import { getNotesForHcp, type Note } from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { FONT } from "../../lib/designTokens";
import { FACE } from "../../lib/canonicalTokens";
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
    borderBottom: "1px solid #1E1E22",
    fontFamily: FACE.ui,
  } as const;

  if (isLoading) {
    return (
      <div style={sectionStyle}>
        <div
          aria-hidden
          style={{
            height: 60,
            backgroundColor: "#1E1E22",
            borderRadius: 4,
            opacity: 0.35,
          }}
        />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div style={sectionStyle}>
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
            color: "#8f8b83",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          FIELD INSIGHTS{" "}
          <span style={{ color: "#6B6A65", textTransform: "none", letterSpacing: "normal" }}>
            ({notes.length})
          </span>
        </div>
      )}

      {variant === "ledger" ? (
        // ledger capture affordance — the frame's "+ CAPTURE" bar (composer renders the
        // gold marker + serif prompt + SOURCE·TAG·LINK affordance in the ledger register).
        <div style={{ borderBottom: "1px solid #1a1d1c", background: "#0a0b0b" }}>
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
            backgroundColor: "#E8A020",
            color: "#0A0A0B",
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
