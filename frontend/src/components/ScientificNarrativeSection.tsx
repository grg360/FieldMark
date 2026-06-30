import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import EvidenceDrawer from "./EvidenceDrawer";
import BeliefClaimReactionPanel, { type ClaimSection } from "./BeliefClaimReactionPanel";
import {
  getScientificNarrativeForHcp,
  type AdvocacyTheme,
  type CorpusDepth,
  type ResearchFocusItem,
  type ScientificNarrative,
} from "../lib/scientificPositions";
import {
  buildAdvocacyClaimKey,
  buildResearchFocusClaimKey,
} from "../lib/beliefClaimKey";

interface ScientificNarrativeSectionProps {
  hcpId: string;
  therapeuticArea?: string;
}

interface DrawerTheme {
  name: string;
  summary: string;
  positionIds: string[];
}

function corpusDepthBadge(depth: CorpusDepth): { label: string; background: string; color: string } {
  switch (depth) {
    case "deep":
      return {
        label: "Deep Corpus",
        background: "rgba(63, 184, 175, 0.15)",
        color: "#3FB8AF",
      };
    case "focused":
      return {
        label: "Focused Corpus",
        background: "rgba(123, 158, 189, 0.15)",
        color: "#7B9EBD",
      };
    case "signal_moment":
      return {
        label: "Emerging Signal",
        background: "rgba(155, 109, 255, 0.15)",
        color: "#9B6DFF",
      };
    default:
      return {
        label: "Corpus",
        background: "rgba(107, 106, 101, 0.15)",
        color: "#6B6A65",
      };
  }
}

function filledBarCount(confidence: number): number {
  if (confidence >= 0.95) return 5;
  if (confidence >= 0.90) return 4;
  if (confidence >= 0.80) return 3;
  if (confidence >= 0.70) return 2;
  return 1;
}

function ConfidenceBars({ confidence }: { confidence: number }) {
  const filled = filledBarCount(confidence);
  return (
    <div
      style={{ display: "flex", gap: 3, alignItems: "center" }}
      title={`Confidence: ${filled} of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: 14,
            borderRadius: 1.5,
            backgroundColor: i < filled ? "#9B6DFF" : "#2A2A2E",
          }}
        />
      ))}
    </div>
  );
}

function ThemeCard({
  theme,
  expanded,
  onCardClick,
  onViewSources,
}: {
  theme: AdvocacyTheme;
  expanded: boolean;
  onCardClick: () => void;
  onViewSources: () => void;
}) {
  const borderColor = expanded ? "#9B6DFF" : "#1E1E22";
  const bgColor = expanded ? "#15131A" : "#0D0D10";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick();
        }
      }}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "18px 20px",
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background-color 120ms, border-color 120ms",
      }}
      onMouseEnter={(e) => {
        if (!expanded) {
          e.currentTarget.style.backgroundColor = "#15131A";
          e.currentTarget.style.borderColor = "#2A2A2E";
        }
      }}
      onMouseLeave={(e) => {
        if (!expanded) {
          e.currentTarget.style.backgroundColor = "#0D0D10";
          e.currentTarget.style.borderColor = "#1E1E22";
        }
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 500, color: "#E8E6DF", lineHeight: 1.3 }}>
          {theme.theme}
        </div>
        <ConfidenceBars confidence={theme.confidence} />
      </div>
      <div style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5, marginBottom: 10 }}>
        {theme.summary}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {theme.supporting_paper_count != null && theme.supporting_paper_count > 0 ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 500,
              color: "#9B6DFF",
              backgroundColor: "rgba(155, 109, 255, 0.10)",
              border: "1px solid rgba(155, 109, 255, 0.25)",
              borderRadius: 999,
              padding: "3px 10px",
              letterSpacing: 0.2,
            }}
          >
            Supported by {theme.supporting_paper_count} {theme.supporting_paper_count === 1 ? "publication" : "publications"}
          </div>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewSources();
          }}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(232, 230, 223, 0.6)",
            background: "transparent",
            border: "1px solid rgba(232, 230, 223, 0.15)",
            borderRadius: 999,
            padding: "3px 10px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#E8E6DF";
            e.currentTarget.style.borderColor = "rgba(232, 230, 223, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(232, 230, 223, 0.6)";
            e.currentTarget.style.borderColor = "rgba(232, 230, 223, 0.15)";
          }}
        >
          View sources
        </button>
      </div>
    </div>
  );
}

function AdvocacySubsection({
  label,
  section,
  themes,
  expandedKey,
  claimKeys,
  hcpId,
  therapeuticAreaSlug,
  onCardToggle,
  onViewSources,
}: {
  label: string;
  section: ClaimSection;
  themes: AdvocacyTheme[];
  expandedKey: string | null;
  claimKeys: Map<string, string>;
  hcpId: string;
  therapeuticAreaSlug: string;
  onCardToggle: (claimKey: string) => void;
  onViewSources: (theme: AdvocacyTheme) => void;
}) {
  if (themes.length === 0) return null;

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 14, letterSpacing: 0.2 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {themes.map((theme) => {
          const cacheKey = `${section}-${theme.theme}`;
          const claimKey = claimKeys.get(cacheKey);
          const expanded = claimKey != null && claimKey === expandedKey;
          return (
            <div
              key={cacheKey}
              id={claimKey ? `claim-${claimKey}` : undefined}
              style={{ scrollMarginTop: 80 }}
            >
              <ThemeCard
                theme={theme}
                expanded={expanded}
                onCardClick={() => {
                  if (claimKey) onCardToggle(claimKey);
                }}
                onViewSources={() => onViewSources(theme)}
              />
              {claimKey ? (
                <BeliefClaimReactionPanel
                  hcpId={hcpId}
                  claimKey={claimKey}
                  claimSection={section}
                  claimTitle={theme.theme}
                  therapeuticAreaSlug={therapeuticAreaSlug}
                  expanded={expanded}
                  onClose={() => onCardToggle(claimKey)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: "20px 0" }}>
      <div
        style={{
          width: 180,
          height: 22,
          backgroundColor: "#1E1E22",
          borderRadius: 4,
          marginBottom: 16,
        }}
      />
      <div
        style={{
          width: "85%",
          height: 14,
          backgroundColor: "#1E1E22",
          borderRadius: 4,
          marginBottom: 24,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 72,
              backgroundColor: "#15131A",
              border: "1px solid #1E1E22",
              borderRadius: 8,
            }}
          />
        ))}
      </div>
      <div
        style={{
          width: 140,
          height: 12,
          backgroundColor: "#1E1E22",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

export default function ScientificNarrativeSection({
  hcpId,
  therapeuticArea = "NSCLC",
}: ScientificNarrativeSectionProps) {
  const navigate = useNavigate();
  const [narrative, setNarrative] = useState<ScientificNarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTheme, setDrawerTheme] = useState<DrawerTheme | null>(null);
  const [expandedClaimKey, setExpandedClaimKey] = useState<string | null>(null);
  const [claimKeys, setClaimKeys] = useState<Map<string, string>>(new Map());

  const therapeuticAreaSlug = useMemo(() => therapeuticArea.toLowerCase(), [therapeuticArea]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getScientificNarrativeForHcp(hcpId, therapeuticArea)
      .then((data) => {
        if (!cancelled) setNarrative(data);
      })
      .catch((err) => {
        if (!cancelled) {
          const wrapped = err instanceof Error ? err : new Error(String(err));
          setError(wrapped);
          console.error("ScientificNarrativeSection: load error", wrapped);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hcpId, therapeuticArea]);

  useEffect(() => {
    if (!narrative) {
      setClaimKeys(new Map());
      return;
    }
    let cancelled = false;
    const next = new Map<string, string>();

    async function buildKeys() {
      if (!narrative) return;
      const advocacyEntries: Array<{ cacheKey: string; theme: AdvocacyTheme }> = [
        ...narrative.strongly_advocates.map((t) => ({ cacheKey: `strongly_advocates-${t.theme}`, theme: t })),
        ...narrative.frequently_raises.map((t) => ({ cacheKey: `frequently_raises-${t.theme}`, theme: t })),
      ];
      for (const entry of advocacyEntries) {
        const key = await buildAdvocacyClaimKey(hcpId, entry.theme);
        next.set(entry.cacheKey, key);
      }
      for (const item of narrative.research_focus) {
        const key = await buildResearchFocusClaimKey(hcpId, item);
        next.set(`research_focus-${item.theme}`, key);
      }
      if (!cancelled) setClaimKeys(next);
    }

    buildKeys();
    return () => {
      cancelled = true;
    };
  }, [narrative, hcpId]);

  function handleCardToggle(claimKey: string) {
    setExpandedClaimKey((prev) => (prev === claimKey ? null : claimKey));
  }

  function openDrawer(theme: AdvocacyTheme) {
    setDrawerTheme({
      name: theme.theme,
      summary: theme.summary,
      positionIds: theme.representative_position_ids,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerTheme(null);
  }

  if (loading) {
    return (
      <section style={{ marginBottom: 32, padding: "20px 24px 0" }}>
        <LoadingSkeleton />
      </section>
    );
  }

  if (error || !narrative) {
    return null;
  }

  const badge = corpusDepthBadge(narrative.corpus_depth);
  const maxWeight = Math.max(0, ...narrative.research_focus.map((item) => item.weight));
  const bullet = String.fromCharCode(8226);

  return (
    <section style={{ marginBottom: 0, padding: "20px 24px 0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#E8E6DF", margin: 0 }}>
          Belief Profile
        </h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: "4px 10px",
            borderRadius: 999,
            backgroundColor: badge.background,
            color: badge.color,
            whiteSpace: "nowrap",
          }}
        >
          {badge.label}
        </span>
      </div>

      <p
        style={{
          fontSize: 14,
          color: "#9B9892",
          fontStyle: "italic",
          marginTop: 12,
          marginBottom: 20,
          lineHeight: 1.6,
        }}
      >
        {narrative.headline}
      </p>

      <AdvocacySubsection
        label="Strongly Advocates"
        section="strongly_advocates"
        themes={narrative.strongly_advocates}
        expandedKey={expandedClaimKey}
        claimKeys={claimKeys}
        hcpId={hcpId}
        therapeuticAreaSlug={therapeuticAreaSlug}
        onCardToggle={handleCardToggle}
        onViewSources={openDrawer}
      />

      <AdvocacySubsection
        label="Frequently Raises"
        section="frequently_raises"
        themes={narrative.frequently_raises}
        expandedKey={expandedClaimKey}
        claimKeys={claimKeys}
        hcpId={hcpId}
        therapeuticAreaSlug={therapeuticAreaSlug}
        onCardToggle={handleCardToggle}
        onViewSources={openDrawer}
      />

      {narrative.research_focus.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 12 }}>
            Research Focus
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {narrative.research_focus.map((item) => {
                const widthPct = maxWeight > 0 ? (item.weight / maxWeight) * 100 : 0;
                const cacheKey = `research_focus-${item.theme}`;
                const claimKey = claimKeys.get(cacheKey);
                const expanded = claimKey != null && claimKey === expandedClaimKey;
                return (
                  <button
                    key={item.theme}
                    type="button"
                    onClick={() => {
                      if (claimKey) handleCardToggle(claimKey);
                    }}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: expanded ? "#1F1A2E" : "#15131A",
                      border: expanded ? "1px solid #9B6DFF" : "1px solid #1E1E22",
                      borderRadius: 999,
                      minWidth: 120,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#E8E6DF", marginBottom: 6 }}>
                      {item.theme}
                    </div>
                    <div
                      style={{
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: "#1E1E22",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: "100%",
                          backgroundColor: "#9B6DFF",
                          borderRadius: 2,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            {narrative.research_focus.map((item) => {
              const cacheKey = `research_focus-${item.theme}`;
              const claimKey = claimKeys.get(cacheKey);
              if (!claimKey) return null;
              const expanded = claimKey === expandedClaimKey;
              if (!expanded) return null;
              return (
                <BeliefClaimReactionPanel
                  key={`panel-${cacheKey}`}
                  hcpId={hcpId}
                  claimKey={claimKey}
                  claimSection="research_focus"
                  claimTitle={item.theme}
                  therapeuticAreaSlug={therapeuticAreaSlug}
                  expanded={expanded}
                  onClose={() => handleCardToggle(claimKey)}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => navigate(`/hcp/${hcpId}/publications`)}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = "underline";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = "none";
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#9B6DFF",
            textDecoration: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {narrative.paper_count} papers
        </button>
        <span>{bullet}</span>
        <button
          type="button"
          onClick={() => navigate(`/hcp/${hcpId}/positions`)}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = "underline";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = "none";
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#9B6DFF",
            textDecoration: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {narrative.position_count} positions
        </button>
      </div>

      <EvidenceDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        themeName={drawerTheme?.name ?? ""}
        themeSummary={drawerTheme?.summary ?? ""}
        positionIds={drawerTheme?.positionIds ?? []}
      />
    </section>
  );
}
