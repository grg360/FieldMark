import { useEffect, useState } from "react";
import EvidenceDrawer from "./EvidenceDrawer";
import {
  getScientificNarrativeForHcp,
  type AdvocacyTheme,
  type CorpusDepth,
  type ScientificNarrative,
} from "../lib/scientificPositions";

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
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 12,
            borderRadius: 1,
            backgroundColor: i < filled ? "#E8E6DF" : "#3A3A3E",
          }}
        />
      ))}
    </div>
  );
}

function ThemeCard({
  theme,
  onClick,
}: {
  theme: AdvocacyTheme;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background-color 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#15131A";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#0D0D10";
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
      <div style={{ fontSize: 13, color: "#9B9892", lineHeight: 1.5 }}>
        {theme.summary}
      </div>
    </button>
  );
}

function AdvocacySubsection({
  label,
  themes,
  onThemeClick,
}: {
  label: string;
  themes: AdvocacyTheme[];
  onThemeClick: (theme: AdvocacyTheme) => void;
}) {
  if (themes.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {themes.map((theme) => (
          <ThemeCard
            key={`${label}-${theme.theme}`}
            theme={theme}
            onClick={() => onThemeClick(theme)}
          />
        ))}
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
  const [narrative, setNarrative] = useState<ScientificNarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTheme, setDrawerTheme] = useState<DrawerTheme | null>(null);

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
      <section style={{ marginBottom: 32 }}>
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
    <section style={{ marginBottom: 32, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#E8E6DF", margin: 0 }}>
          Scientific Narrative
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
          marginTop: 8,
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        {narrative.headline}
      </p>

      <AdvocacySubsection
        label="Strongly Advocates"
        themes={narrative.strongly_advocates}
        onThemeClick={openDrawer}
      />

      <AdvocacySubsection
        label="Frequently Raises"
        themes={narrative.frequently_raises}
        onThemeClick={openDrawer}
      />

      {narrative.research_focus.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 12 }}>
            Research Focus
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {narrative.research_focus.map((item) => {
              const widthPct = maxWeight > 0 ? (item.weight / maxWeight) * 100 : 0;
              return (
                <div
                  key={item.theme}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#15131A",
                    border: "1px solid #1E1E22",
                    borderRadius: 999,
                    minWidth: 120,
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
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 24 }}>
        {narrative.paper_count} papers {bullet} {narrative.position_count} positions
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
