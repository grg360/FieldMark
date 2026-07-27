import { useCallback, useEffect, useState } from "react";
import { HCP } from "../../data/hcpData";
import { getCurrentUser } from "../../lib/authHelpers";
import { getNotesForHcp, type Note } from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { FONT } from "../../lib/designTokens";
import EmptyInsightsState from "./EmptyInsightsState";
import InsightComposer from "./InsightComposer";
import InsightComposerModal from "./InsightComposerModal";
import InsightThread from "./InsightThread";

interface Props {
  hcp: HCP;
}

function resolveHcpId(hcp: HCP): string {
  return String(hcp.hcp_id ?? hcp.id ?? "");
}

function resolveFirstName(hcp: HCP): string {
  const name = (hcp.name ?? "").trim();
  if (!name) return "this HCP";
  return name.split(/\s+/)[0] ?? "this HCP";
}

export default function FieldInsights({ hcp }: Props) {
  const hcpId = resolveHcpId(hcp);
  const firstName = resolveFirstName(hcp);
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
    fontFamily: "system-ui, -apple-system, sans-serif",
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
    <div style={sectionStyle}>
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

      {!isMobile ? (
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
