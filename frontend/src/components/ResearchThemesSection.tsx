import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import ResearchThemeChip from "./ResearchThemeChip";
import ThemeReactionPanel from "./ThemeReactionPanel";
import { FiToast } from "./FieldIntelligenceShared";
import { getMockAggregateForTheme } from "../data/mockThemeAggregates";
import { FI_ACCENT_MUTED } from "../lib/fieldIntelligenceUi";
import type { ResearchTheme, ThemeAggregateResponse } from "../types/researchTheme";

const SECTION_HEADER_STYLE: CSSProperties = {
  fontSize: 15,
  color: "#E8E6DF",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 12,
};

function useGridCols(): number {
  const [cols, setCols] = useState(3);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 360) setCols(1);
      else if (w < 600) setCols(2);
      else setCols(3);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return cols;
}

function bumpAggregatesAfterSubmit(
  aggregates: ThemeAggregateResponse[],
  selections: Record<string, string | null>,
): ThemeAggregateResponse[] {
  return aggregates.map((agg) => {
    const selected = selections[agg.question_id];
    if (!selected) return agg;
    const nextCounts = { ...agg.option_counts };
    nextCounts[selected] = (nextCounts[selected] ?? 0) + 1;
    return {
      ...agg,
      total_responses: agg.total_responses + 1,
      option_counts: nextCounts,
    };
  });
}

interface ResearchThemesSectionProps {
  themes: ResearchTheme[];
  loading?: boolean;
}

export default function ResearchThemesSection({
  themes,
  loading = false,
}: ResearchThemesSectionProps) {
  const cols = useGridCols();
  const [expandedThemeId, setExpandedThemeId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [aggregateMap, setAggregateMap] = useState<Record<string, ThemeAggregateResponse[]>>({});
  const [toast, setToast] = useState<string | null>(null);

  const displayThemes = useMemo(
    () =>
      [...themes]
        .filter((t) => t.display_rank != null)
        .sort((a, b) => (a.display_rank ?? 0) - (b.display_rank ?? 0)),
    [themes],
  );

  const maxPaperCount = useMemo(
    () => Math.max(0, ...displayThemes.map((t) => t.paper_count)),
    [displayThemes],
  );

  const activeTheme = displayThemes.find((t) => t.id === expandedThemeId) ?? null;

  const activeAggregates = expandedThemeId
    ? aggregateMap[expandedThemeId] ?? getMockAggregateForTheme(expandedThemeId)
    : [];

  useEffect(() => {
    setExpandedThemeId(null);
    setSelections({});
  }, [themes]);

  const handleChipClick = useCallback(
    (themeId: string) => {
      if (expandedThemeId === themeId) {
        setExpandedThemeId(null);
        setSelections({});
        return;
      }
      setExpandedThemeId(themeId);
      setSelections({});
      setAggregateMap((prev) => {
        if (prev[themeId]) return prev;
        return { ...prev, [themeId]: getMockAggregateForTheme(themeId) };
      });
    },
    [expandedThemeId],
  );

  const handleSelect = useCallback((questionId: string, optionValue: string) => {
    setSelections((prev) => ({ ...prev, [questionId]: optionValue }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!expandedThemeId) return;
    setAggregateMap((prev) => {
      const current = prev[expandedThemeId] ?? getMockAggregateForTheme(expandedThemeId);
      return {
        ...prev,
        [expandedThemeId]: bumpAggregatesAfterSubmit(current, selections),
      };
    });
    setToast("Thanks for your reaction — aggregate updated");
    window.setTimeout(() => setToast(null), 3000);
    setExpandedThemeId(null);
    setSelections({});
  }, [expandedThemeId, selections]);

  const activeIndex = activeTheme
    ? displayThemes.findIndex((t) => t.id === activeTheme.id)
    : -1;
  const panelRowEndIndex =
    activeIndex >= 0
      ? Math.min(
          Math.floor(activeIndex / cols) * cols + cols - 1,
          displayThemes.length - 1,
        )
      : -1;

  const hasThemes = displayThemes.length > 0;

  return (
    <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1E1E22" }}>
      <div style={SECTION_HEADER_STYLE}>Research Themes</div>

      {loading ? (
        <p style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.45)", margin: 0 }}>
          Loading themes...
        </p>
      ) : !hasThemes ? (
        <p
          style={{
            fontSize: 13,
            color: "rgba(232, 230, 223, 0.5)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Publication-derived themes are surfaced for actively-publishing researchers. This
          HCP&apos;s profile emphasizes field-derived signals (see Field Intelligence below).
        </p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 12,
            }}
          >
            {displayThemes.flatMap((theme, index) => {
              const cells: React.ReactNode[] = [
                <ResearchThemeChip
                  key={theme.id}
                  theme={theme}
                  maxPaperCount={maxPaperCount}
                  isActive={expandedThemeId === theme.id}
                  onClick={() => handleChipClick(theme.id)}
                />,
              ];

              if (index === panelRowEndIndex && activeTheme) {
                cells.push(
                  <ThemeReactionPanel
                    key={`panel-${activeTheme.id}`}
                    theme={activeTheme}
                    aggregates={activeAggregates}
                    selections={selections}
                    onSelect={handleSelect}
                    onClose={() => {
                      setExpandedThemeId(null);
                      setSelections({});
                    }}
                    onSubmit={handleSubmit}
                    expanded
                  />,
                );
              }

              return cells;
            })}
          </div>
          <p
            style={{
              fontSize: 11,
              color: FI_ACCENT_MUTED,
              margin: "14px 0 0",
              lineHeight: 1.45,
            }}
          >
            Reactions shape the community read on this work — your contribution stays private to
            you.
          </p>
        </>
      )}

      <FiToast message={toast} />
    </div>
  );
}
