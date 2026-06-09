import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import {
  createNote,
  updateNote,
  type InteractionType,
  type InsightStrength,
  type Note,
} from "../../lib/relationships";
import { formatOccurredAt } from "./dateFormat";

const INTERACTION_TYPES: InteractionType[] = [
  "general",
  "meeting",
  "email",
  "phone",
  "conference",
  "publication_review",
  "internal",
  "other",
];

const INSIGHT_STRENGTHS: InsightStrength[] = ["routine", "notable", "strategic"];

function interactionTypeLabel(type: InteractionType): string {
  if (type === "publication_review") return "PUBLICATION REVIEW";
  return type.toUpperCase();
}

function interactionChipStyle(type: InteractionType): CSSProperties {
  switch (type) {
    case "meeting":
      return { backgroundColor: "#E8A020", color: "#0A0A0B" };
    case "email":
      return { backgroundColor: "#4A90E2", color: "#FFFFFF" };
    case "phone":
      return { backgroundColor: "#5A9B7F", color: "#FFFFFF" };
    case "other":
      return { backgroundColor: "#7B7B9C", color: "#FFFFFF" };
    case "conference":
      return { backgroundColor: "#9B6DFF", color: "#FFFFFF" };
    case "publication_review":
      return { backgroundColor: "#3FB8AF", color: "#0A0A0B" };
    case "internal":
      return { border: "1px solid #6B6A65", color: "#6B6A65", backgroundColor: "transparent" };
    default:
      return { backgroundColor: "#2A2A30", color: "#9B9892" };
  }
}

function strengthPillStyle(strength: InsightStrength, selected: boolean): CSSProperties {
  if (!selected) {
    return { backgroundColor: "#1E1E22", color: "#6B6A65" };
  }
  switch (strength) {
    case "routine":
      return { backgroundColor: "#2A2A30", color: "#9B9892" };
    case "notable":
      return { border: "1px solid #E8A020", color: "#E8A020", backgroundColor: "transparent" };
    case "strategic":
      return { backgroundColor: "#E8A020", color: "#0A0A0B", fontWeight: 600 };
    default:
      return { backgroundColor: "#1E1E22", color: "#6B6A65" };
  }
}

function strengthLabel(strength: InsightStrength): string {
  return strength.charAt(0).toUpperCase() + strength.slice(1);
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateInputToOccurredAt(dateValue: string, useNow: boolean): string {
  if (useNow) return new Date().toISOString();
  const [y, m, d] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
}

interface Props {
  userId: string;
  hcpId: string;
  firstName: string;
  editingNote?: Note;
  isInline?: boolean;
  forceExpanded?: boolean;
  onSave: () => void;
  onCancel?: () => void;
}

export default function InsightComposer({
  userId,
  hcpId,
  firstName,
  editingNote,
  isInline = false,
  forceExpanded = false,
  onSave,
  onCancel,
}: Props) {
  const [expanded, setExpanded] = useState(Boolean(editingNote) || forceExpanded || !isInline);
  const [body, setBody] = useState(editingNote?.body ?? "");
  const [interactionType, setInteractionType] = useState<InteractionType>(
    editingNote?.interaction_type ?? "general",
  );
  const [insightStrength, setInsightStrength] = useState<InsightStrength>(
    editingNote?.insight_strength ?? "routine",
  );
  const [dateValue, setDateValue] = useState(
    editingNote ? toDateInputValue(editingNote.occurred_at) : toDateInputValue(new Date().toISOString()),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const handlersRef = useRef<{ save: () => Promise<void>; cancel: () => void }>({
    save: async () => {},
    cancel: () => {},
  });
  const datePickerRef = useRef<HTMLDivElement>(null);

  const isToday = isSameCalendarDay(new Date(dateValue + "T12:00:00"), new Date());
  const showForm = expanded || Boolean(editingNote) || !isInline || forceExpanded;
  const showFormRef = useRef(showForm);

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  useEffect(() => {
    if (!showDatePicker) return;
    function onMouseDown(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showDatePicker]);

  useEffect(() => {
    handlersRef.current.save = handleSave;
    handlersRef.current.cancel = handleCancel;
  });

  useEffect(() => {
    showFormRef.current = showForm;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!showFormRef.current) return;
      if (e.key === "Escape") {
        handlersRef.current.cancel();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handlersRef.current.save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleCancel() {
    if (editingNote) {
      onCancel?.();
      return;
    }
    setBody("");
    setInteractionType("general");
    setInsightStrength("routine");
    setDateValue(toDateInputValue(new Date().toISOString()));
    setShowDatePicker(false);
    setExpanded(false);
    onCancel?.();
  }

  async function handleSave() {
    const trimmed = body.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    const occurredAt = dateInputToOccurredAt(dateValue, isToday);

    try {
      if (editingNote) {
        await updateNote(userId, editingNote.id, {
          body: trimmed,
          interactionType,
          insightStrength,
          occurredAt,
        });
      } else {
        await createNote(userId, {
          hcpId,
          body: trimmed,
          interactionType,
          insightStrength,
          occurredAt,
          createdFrom: "hcp_detail_insight",
        });
      }

      setBody("");
      setInteractionType("general");
      setInsightStrength("routine");
      setDateValue(toDateInputValue(new Date().toISOString()));
      setShowDatePicker(false);
      setExpanded(false);
      onSave();
    } catch (err) {
      console.error("InsightComposer save failed", err);
    } finally {
      setSaving(false);
    }
  }

  const pillBase: CSSProperties = {
    padding: "4px 8px",
    borderRadius: 3,
    fontSize: 11,
    textTransform: "uppercase",
    border: "none",
    cursor: "pointer",
    fontFamily: "system-ui, -apple-system, sans-serif",
  };

  if (isInline && !showForm) {
    return (
      <input
        type="text"
        className="fm-insight-composer-input"
        placeholder={`Add an insight about Dr. ${firstName}...`}
        onFocus={() => setExpanded(true)}
        readOnly
        onClick={() => setExpanded(true)}
        aria-label={`Add an insight about Dr. ${firstName}`}
        style={{
          width: "100%",
          height: 40,
          borderRadius: 4,
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          color: "#E8E6DF",
          fontSize: 14,
          padding: "0 12px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          outline: "none",
          cursor: "text",
          marginBottom: 12,
        }}
      />
    );
  }

  return (
    <div style={{ opacity: saving ? 0.6 : 1, marginBottom: 12, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .fm-insight-composer-textarea::placeholder {
          color: #6B6A65;
          opacity: 1;
        }
        .fm-insight-composer-input::placeholder {
          color: #6B6A65;
          opacity: 1;
        }
      `}</style>
      <textarea
        className="fm-insight-composer-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Add an insight about Dr. ${firstName}...`}
        aria-label="Insight body"
        style={{
          width: "100%",
          minHeight: 80,
          borderRadius: 4,
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          color: "#E8E6DF",
          fontSize: 14,
          padding: 12,
          lineHeight: 1.5,
          resize: "vertical",
          outline: "none",
          fontFamily: "system-ui, -apple-system, sans-serif",
          boxSizing: "border-box",
        }}
      />

      <div style={{ fontSize: 10, color: "#6B6A65", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6, marginTop: 12 }}>
        Type
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {INTERACTION_TYPES.map((type) => {
          const selected = interactionType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setInteractionType(type)}
              style={{
                ...pillBase,
                ...(selected ? interactionChipStyle(type) : { backgroundColor: "#1E1E22", color: "#6B6A65" }),
                border: selected ? "1px solid #E8E6DF" : "none",
              }}
            >
              {interactionTypeLabel(type)}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "#6B6A65", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6, marginTop: 12 }}>
        Strength
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {INSIGHT_STRENGTHS.map((strength) => {
          const selected = insightStrength === strength;
          return (
            <button
              key={strength}
              type="button"
              onClick={() => setInsightStrength(strength)}
              style={{
                ...pillBase,
                ...strengthPillStyle(strength, selected),
                border: selected ? "1px solid #E8E6DF" : "none",
              }}
            >
              {strengthLabel(strength)}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        <div ref={datePickerRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onClick={() => setShowDatePicker((open) => !open)}
            aria-label="Select insight date"
            aria-expanded={showDatePicker}
            style={{
              background: "none",
              border: "none",
              color: "#9B9892",
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {formatOccurredAt(dateInputToOccurredAt(dateValue, false))}
          </button>
          {showDatePicker ? (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                backgroundColor: "#0D0D10",
                border: "1px solid #1E1E22",
                borderRadius: 6,
                padding: 8,
                zIndex: 50,
                marginTop: 6,
                // @ts-expect-error CSS custom properties for react-day-picker
                "--rdp-accent-color": "#E8A020",
                "--rdp-background-color": "#0D0D10",
                "--rdp-day-color": "#E8E6DF",
                "--rdp-day-hover-background": "#1E1E22",
              }}
            >
              <DayPicker
                mode="single"
                selected={new Date(dateValue + "T12:00:00")}
                onSelect={(date) => {
                  if (date) {
                    setDateValue(toDateInputValue(date.toISOString()));
                    setShowDatePicker(false);
                  }
                }}
                styles={{
                  caption: { color: "#E8E6DF", fontSize: 13 },
                  day: { color: "#E8E6DF", fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif" },
                  head_cell: { color: "#9B9892" },
                  nav_button: { color: "#9B9892" },
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button
          type="button"
          onClick={handleCancel}
          style={{
            background: "none",
            border: "none",
            color: "#6B6A65",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={body.trim().length === 0 || saving}
          style={{
            backgroundColor: "#E8A020",
            color: "#0A0A0B",
            padding: "6px 14px",
            fontWeight: 500,
            fontSize: 13,
            borderRadius: 4,
            border: "none",
            cursor: body.trim().length === 0 || saving ? "default" : "pointer",
            opacity: body.trim().length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
