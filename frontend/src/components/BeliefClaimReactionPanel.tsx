import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { BELIEF_CLAIM_QUESTIONS } from "../data/beliefClaimQuestions";

export type ClaimSection = "strongly_advocates" | "frequently_raises" | "research_focus";

interface BeliefClaimReactionPanelProps {
  hcpId: string;
  claimKey: string;
  claimSection: ClaimSection;
  claimTitle: string;
  therapeuticAreaSlug?: string | null;
  expanded: boolean;
  onClose: () => void;
}

interface ReactionRow {
  contributor_id: string;
  field_read: string | null;
  resonance: string | null;
  behavior_change: string | null;
}

type SelectionMap = Record<"field_read" | "resonance" | "behavior_change", string | null>;

const EMPTY_SELECTIONS: SelectionMap = {
  field_read: null,
  resonance: null,
  behavior_change: null,
};

const BP_ACCENT = "#9B6DFF";
const BP_ACCENT_BG = "rgba(155, 109, 255, 0.22)";
const BP_ACCENT_BORDER = "rgba(155, 109, 255, 0.25)";
const BP_ACCENT_SHADOW = "rgba(155, 109, 255, 0.15)";

function optionPercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export default function BeliefClaimReactionPanel({
  hcpId,
  claimKey,
  claimSection,
  claimTitle,
  therapeuticAreaSlug,
  expanded,
  onClose,
}: BeliefClaimReactionPanelProps) {
  const [selections, setSelections] = useState<SelectionMap>(EMPTY_SELECTIONS);
  const [aggregateRows, setAggregateRows] = useState<ReactionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from("msl_belief_claim_reactions")
      .select("contributor_id, field_read, resonance, behavior_change")
      .eq("hcp_id", hcpId)
      .eq("claim_key", claimKey)
      .is("deleted_at", null)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("BeliefClaimReactionPanel: load error", error);
          setAggregateRows([]);
        } else {
          setAggregateRows((data ?? []) as ReactionRow[]);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, hcpId, claimKey]);

  useEffect(() => {
    if (!currentUserId) return;
    const ownRow = aggregateRows.find((r) => r.contributor_id === currentUserId);
    if (ownRow) {
      setSelections({
        field_read: ownRow.field_read,
        resonance: ownRow.resonance,
        behavior_change: ownRow.behavior_change,
      });
    } else {
      setSelections(EMPTY_SELECTIONS);
    }
  }, [aggregateRows, currentUserId]);

  const mslCount = aggregateRows.length;

  const aggregatesByQuestion = useMemo(() => {
    const map: Record<string, Record<string, number>> = {
      field_read: {},
      resonance: {},
      behavior_change: {},
    };
    for (const row of aggregateRows) {
      if (row.field_read) {
        map.field_read[row.field_read] = (map.field_read[row.field_read] ?? 0) + 1;
      }
      if (row.resonance) {
        map.resonance[row.resonance] = (map.resonance[row.resonance] ?? 0) + 1;
      }
      if (row.behavior_change) {
        map.behavior_change[row.behavior_change] = (map.behavior_change[row.behavior_change] ?? 0) + 1;
      }
    }
    return map;
  }, [aggregateRows]);

  const hasSelection = BELIEF_CLAIM_QUESTIONS.some((q) => selections[q.id] !== null);
  const showAggregates = mslCount >= 1;

  function handleSelect(questionId: "field_read" | "resonance" | "behavior_change", value: string) {
    setSelections((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!currentUserId) {
      setSubmitError("You must be signed in to submit reactions.");
      return;
    }
    if (!hasSelection) return;

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      contributor_id: currentUserId,
      hcp_id: hcpId,
      claim_key: claimKey,
      claim_section: claimSection,
      claim_title: claimTitle,
      field_read: selections.field_read,
      resonance: selections.resonance,
      behavior_change: selections.behavior_change,
      therapeutic_area_slug: therapeuticAreaSlug ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("msl_belief_claim_reactions")
      .upsert(payload, { onConflict: "contributor_id,hcp_id,claim_key" });

    setSubmitting(false);

    if (error) {
      console.warn("BeliefClaimReactionPanel: submit error", error);
      setSubmitError(error.message);
      return;
    }

    const { data: refreshed } = await supabase
      .from("msl_belief_claim_reactions")
      .select("contributor_id, field_read, resonance, behavior_change")
      .eq("hcp_id", hcpId)
      .eq("claim_key", claimKey)
      .is("deleted_at", null);

    setAggregateRows((refreshed ?? []) as ReactionRow[]);
  }

  return (
    <div
      style={{
        maxHeight: expanded ? 2400 : 0,
        opacity: expanded ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 300ms ease-out, opacity 250ms ease-out",
        marginTop: expanded ? 12 : 0,
      }}
    >
      <div
        style={{
          background: "rgba(155, 109, 255, 0.05)",
          border: `1px solid ${BP_ACCENT_BORDER}`,
          borderRadius: 10,
          padding: 20,
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
          <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.55)" }}>
            {showAggregates
              ? `What ${mslCount} ${mslCount === 1 ? "MSL is" : "MSLs are"} saying about this position`
              : "No reactions yet on this position. Your read would be the first."}
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
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.4)", padding: "12px 0" }}>
            Loading...
          </div>
        ) : null}

        {!loading &&
          BELIEF_CLAIM_QUESTIONS.map((question, qIndex) => {
            const counts = aggregatesByQuestion[question.id] ?? {};
            const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

            return (
              <div
                key={question.id}
                style={{ marginBottom: qIndex < BELIEF_CLAIM_QUESTIONS.length - 1 ? 20 : 16 }}
              >
                <div
                  style={{
                    fontSize: 14,
                    color: "rgba(232, 230, 223, 0.75)",
                    marginBottom: 10,
                    lineHeight: 1.4,
                  }}
                >
                  {question.prompt}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 8,
                  }}
                >
                  {question.options.map((option) => {
                    const selected = selections[question.id] === option.value;
                    const count = counts[option.value] ?? 0;
                    const pct = optionPercent(count, total);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(question.id, option.value)}
                        style={{
                          // Compact centered chip — matches the Field Intelligence
                          // ValidationField answer chips directly below this section.
                          position: "relative",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: selected
                            ? `1px solid ${BP_ACCENT}`
                            : "1px solid rgba(255, 255, 255, 0.12)",
                          background: selected ? BP_ACCENT_BG : "transparent",
                          color: selected ? "#FFFFFF" : "rgba(232, 230, 223, 0.7)",
                          cursor: "pointer",
                          fontFamily: "system-ui, sans-serif",
                          fontSize: 12,
                          lineHeight: 1.35,
                          textAlign: "center",
                          boxShadow: selected ? `0 4px 12px ${BP_ACCENT_SHADOW}` : "none",
                          overflow: "hidden",
                        }}
                      >
                        <span>{option.label}</span>
                        {showAggregates ? (
                          <span
                            style={{
                              fontSize: 10,
                              color: selected ? "rgba(255, 255, 255, 0.7)" : "rgba(232, 230, 223, 0.45)",
                              marginTop: 4,
                              fontFamily: "monospace",
                            }}
                          >
                            {pct}%
                          </span>
                        ) : null}
                        {showAggregates ? (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              height: 2,
                              width: `${pct}%`,
                              backgroundColor: selected ? BP_ACCENT : "rgba(155, 109, 255, 0.25)",
                              transition: "width 0.2s ease",
                            }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {submitError ? (
          <div style={{ fontSize: 12, color: "#FF6B6B", marginBottom: 12 }}>{submitError}</div>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasSelection || submitting}
          style={{
            width: "100%",
            height: 44,
            borderRadius: 4,
            border: "none",
            backgroundColor: hasSelection && !submitting ? BP_ACCENT : "rgba(155, 109, 255, 0.2)",
            color: hasSelection && !submitting ? "#0A0A0B" : "rgba(232, 230, 223, 0.4)",
            fontSize: 14,
            fontWeight: 600,
            cursor: hasSelection && !submitting ? "pointer" : "not-allowed",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {submitting ? "Submitting..." : "Submit reactions"}
        </button>
      </div>
    </div>
  );
}
