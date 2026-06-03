import { useMemo } from "react";
import { X } from "lucide-react";
import { THEME_QUESTIONS } from "../data/mockThemeQuestions";
import { FI_ACCENT, FI_ACCENT_MUTED } from "../lib/fieldIntelligenceUi";
import type { ResearchTheme, ThemeAggregateResponse } from "../types/researchTheme";
import { totalAggregateResponses } from "../data/mockThemeAggregates";

interface ThemeReactionPanelProps {
  theme: ResearchTheme;
  aggregates: ThemeAggregateResponse[];
  selections: Record<string, string | null>;
  onSelect: (questionId: string, optionValue: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  expanded: boolean;
}

function optionPercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export default function ThemeReactionPanel({
  theme,
  aggregates,
  selections,
  onSelect,
  onClose,
  onSubmit,
  expanded,
}: ThemeReactionPanelProps) {
  const mslCount = totalAggregateResponses(aggregates);

  const aggregateByQuestion = useMemo(() => {
    const map = new Map<string, ThemeAggregateResponse>();
    aggregates.forEach((a) => map.set(a.question_id, a));
    return map;
  }, [aggregates]);

  const hasSelection = THEME_QUESTIONS.some((q) => selections[q.id]);

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        maxHeight: expanded ? 2400 : 0,
        opacity: expanded ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 300ms ease-out, opacity 250ms ease-out",
        marginTop: expanded ? 8 : 0,
      }}
    >
      <div
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(120, 200, 255, 0.2)",
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#E8E6DF", lineHeight: 1.3 }}>
              {theme.theme_name}
            </div>
            <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 4, fontFamily: "monospace" }}>
              {theme.paper_count} papers in this theme
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(232, 230, 223, 0.6)",
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.55)", margin: "0 0 20px" }}>
          What {mslCount} MSLs are saying about this theme
        </p>

        {THEME_QUESTIONS.map((question, qIndex) => {
          const aggregate = aggregateByQuestion.get(question.id);
          const total = aggregate?.total_responses ?? 0;

          return (
            <div
              key={question.id}
              style={{ marginBottom: qIndex < THEME_QUESTIONS.length - 1 ? 24 : 20 }}
            >
              <div
                style={{
                  fontSize: 16,
                  color: "rgba(232, 230, 223, 0.75)",
                  marginBottom: 12,
                  lineHeight: 1.4,
                }}
              >
                {question.prompt}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {question.options.map((option) => {
                  const selected = selections[question.id] === option.value;
                  const count = aggregate?.option_counts[option.value] ?? 0;
                  const pct = optionPercent(count, total);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onSelect(question.id, option.value)}
                      style={{
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                        justifyContent: "flex-start",
                        minHeight: 72,
                        padding: "10px 8px 8px",
                        borderRadius: 8,
                        border: selected
                          ? `1px solid ${FI_ACCENT}`
                          : "1px solid rgba(255, 255, 255, 0.12)",
                        background: selected ? "rgba(120, 200, 255, 0.22)" : "transparent",
                        color: selected ? "#FFFFFF" : "rgba(232, 230, 223, 0.7)",
                        cursor: "pointer",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: 11,
                        lineHeight: 1.35,
                        textAlign: "center",
                        boxShadow: selected ? "0 4px 12px rgba(120, 200, 255, 0.15)" : "none",
                        overflow: "hidden",
                      }}
                    >
                      <span style={{ flex: 1 }}>{option.label}</span>
                      <span
                        style={{
                          fontSize: 10,
                          color: selected ? FI_ACCENT_MUTED : "rgba(232, 230, 223, 0.45)",
                          marginTop: 6,
                          fontFamily: "monospace",
                        }}
                      >
                        {pct}%
                      </span>
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          height: 2,
                          width: `${pct}%`,
                          backgroundColor: selected
                            ? FI_ACCENT
                            : "rgba(120, 200, 255, 0.25)",
                          transition: "width 0.2s ease",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onSubmit}
          disabled={!hasSelection}
          style={{
            width: "100%",
            height: 44,
            borderRadius: 4,
            border: "none",
            backgroundColor: hasSelection ? FI_ACCENT : "rgba(120, 200, 255, 0.2)",
            color: hasSelection ? "#0A0A0B" : "rgba(232, 230, 223, 0.4)",
            fontSize: 14,
            fontWeight: 600,
            cursor: hasSelection ? "pointer" : "not-allowed",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Submit reactions
        </button>
      </div>
    </div>
  );
}
