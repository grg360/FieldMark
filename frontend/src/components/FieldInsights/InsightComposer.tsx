import { useMediaQuery } from "../../lib/useMediaQuery";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { track } from "../../lib/analytics";
import {
  createNote,
  updateNote,
  getBeliefClaims,
  type InteractionType,
  type InsightStrength,
  type Note,
  type BeliefClaimOption,
} from "../../lib/relationships";
import {
  INSIGHT_CATEGORIES,
  CATEGORY_LABELS,
  type InsightCategory,
} from "../../lib/insightCategories";
import { formatOccurredAt } from "./dateFormat";
import { FONT, GROUND, LINE, GOLD, COOL } from "../../lib/designTokens";
import { CANON, FACE } from "../../lib/canonicalTokens";

// ── Register kit (2026-08-07 conversion — Beat 8 surface) ────────────────────
// Chip treatment shared with the profile rails; the category glyph is the
// /me/insights action-weight vocabulary (filled = obligates, half = feeds
// work, outline = accumulates) — taxonomy reads by weight, never by hue.
const monoLabel: CSSProperties = { fontFamily: FONT.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: COOL.label };
const CATEGORY_WEIGHT: Record<InsightCategory, number> = {
  message_challenge: 0, evidence_gap: 1, competitor_signal: 2, safety_observation: 3,
  access_reimbursement: 4, message_reinforcement: 5, patient_selection: 6,
  clinical_practice_trend: 7, other: 8,
};
function tierOf(cat: InsightCategory): 0 | 1 | 2 {
  const w = CATEGORY_WEIGHT[cat];
  return w <= 1 ? 0 : w <= 4 ? 1 : 2;
}
function TierGlyph({ cat, dim }: { cat: InsightCategory; dim: boolean }) {
  const tier = tierOf(cat);
  const ink = dim ? COOL.faint : tier === 0 ? COOL.ui : tier === 1 ? COOL.muted : COOL.chrome;
  if (tier === 0) return <span style={{ width: 8, height: 8, background: ink, display: "inline-block", flex: "none" }} />;
  if (tier === 1) return <span style={{ width: 8, height: 8, border: `1px solid ${ink}`, boxSizing: "border-box", background: `linear-gradient(90deg, ${ink} 50%, transparent 50%)`, display: "inline-block", flex: "none" }} />;
  return <span style={{ width: 8, height: 8, border: `1px solid ${ink}`, boxSizing: "border-box", display: "inline-block", flex: "none" }} />;
}
function regChip(selected: boolean): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: FONT.mono, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "5px 9px", borderRadius: 0, cursor: "pointer", minHeight: 0,
    background: selected ? "rgba(255,255,255,0.07)" : "transparent",
    border: `1px solid ${selected ? "rgba(255,255,255,0.28)" : LINE.l2}`,
    color: selected ? COOL.ui : COOL.chrome, fontWeight: selected ? 600 : 400,
  };
}

const INTERACTION_TYPES: InteractionType[] = [
  "general",
  "meeting",
  "email",
  "phone",
  "conference",
  "publication_review",
  "internal",
  "advisory_board",
  "tumor_board",
  "other",
];

const INSIGHT_STRENGTHS: InsightStrength[] = ["routine", "notable", "strategic"];

function interactionTypeLabel(type: InteractionType): string {
  if (type === "publication_review") return "PUBLICATION REVIEW";
  if (type === "advisory_board") return "ADVISORY BOARD";
  if (type === "tumor_board") return "TUMOR BOARD";
  return type.toUpperCase();
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

// Grow a textarea to fit its content so typing adds new lines below
// instead of scrolling inside a fixed-height box.
function autoGrowTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

interface Props {
  userId: string;
  hcpId: string;
  firstName: string;
  editingNote?: Note;
  isInline?: boolean;
  forceExpanded?: boolean;
  /** "ledger" renders the collapsed capture line in the academic profile's register
   *  (serif prompt, no boxed input) instead of the default sans control. */
  variant?: "ledger";
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
  variant,
  onSave,
  onCancel,
}: Props) {
  const isMobileCapture = useMediaQuery("(max-width: 767px)"); // 2026-08-10 capture-bar reflow
  const [expanded, setExpanded] = useState(Boolean(editingNote) || forceExpanded || !isInline);
  const [body, setBody] = useState(editingNote?.body ?? "");
  const [whyItMatters, setWhyItMatters] = useState(editingNote?.why_it_matters ?? "");
  const [insightCategory, setInsightCategory] = useState<InsightCategory | null>(
    (editingNote?.insight_category as InsightCategory | null) ?? null,
  );
  const [insightCategoryOtherLabel, setInsightCategoryOtherLabel] = useState(
    editingNote?.insight_category_other_label ?? "",
  );
  const [interactionType, setInteractionType] = useState<InteractionType>(
    editingNote?.interaction_type ?? "general",
  );
  const [interactionTypeOtherLabel, setInteractionTypeOtherLabel] = useState(
    editingNote?.interaction_type_other_label ?? "",
  );
  const [insightStrength, setInsightStrength] = useState<InsightStrength>(
    editingNote?.insight_strength ?? "routine",
  );
  const [dateValue, setDateValue] = useState(
    editingNote ? toDateInputValue(editingNote.occurred_at) : toDateInputValue(new Date().toISOString()),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  // Belief-claim link: the HCP's sourced positions to anchor this insight to.
  // Empty for most HCPs (community/practice have none) — the picker states that.
  const [beliefClaims, setBeliefClaims] = useState<BeliefClaimOption[] | null>(null);
  const [selectedClaimKey, setSelectedClaimKey] = useState<string | null>(
    editingNote?.belief_claim_key ?? null,
  );
  const handlersRef = useRef<{ save: () => Promise<void>; cancel: () => void }>({
    save: async () => {},
    cancel: () => {},
  });
  const datePickerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const whyItMattersRef = useRef<HTMLTextAreaElement>(null);

  const isToday = isSameCalendarDay(new Date(dateValue + "T12:00:00"), new Date());
  const showForm = expanded || Boolean(editingNote) || !isInline || forceExpanded;
  const showFormRef = useRef(showForm);

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  // Load the HCP's belief claims once the form is open (deferred so the collapsed
  // capture line stays cheap). Fetched per HCP; [] when there are no positions.
  useEffect(() => {
    if (!showForm || beliefClaims !== null) return;
    let cancelled = false;
    getBeliefClaims(hcpId).then((c) => { if (!cancelled) setBeliefClaims(c); });
    return () => { cancelled = true; };
  }, [showForm, hcpId, beliefClaims]);

  useEffect(() => {
    autoGrowTextarea(bodyRef.current);
  }, [body, showForm]);

  useEffect(() => {
    autoGrowTextarea(whyItMattersRef.current);
  }, [whyItMatters, showForm]);

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
    setWhyItMatters("");
    setInsightCategory(null);
    setInsightCategoryOtherLabel("");
    setInteractionType("general");
    setInteractionTypeOtherLabel("");
    setInsightStrength("routine");
    setDateValue(toDateInputValue(new Date().toISOString()));
    setShowDatePicker(false);
    setExpanded(false);
    onCancel?.();
  }

  function getValidationState(): { saveEnabled: boolean; buttonLabel: string } {
    const trimmedBody = body.trim();
    if (trimmedBody.length === 0) {
      return { saveEnabled: false, buttonLabel: "Add an insight..." };
    }
    if (insightCategory === null) {
      return { saveEnabled: false, buttonLabel: "Select a category" };
    }
    if (insightCategory === "other" && insightCategoryOtherLabel.trim().length === 0) {
      return { saveEnabled: false, buttonLabel: "Specify category..." };
    }
    return { saveEnabled: true, buttonLabel: saving ? "Saving..." : "Save" };
  }

  async function handleSave() {
    const validation = getValidationState();
    if (!validation.saveEnabled || saving) return;

    const trimmed = body.trim();
    const trimmedWhy = whyItMatters.trim();
    const trimmedCategoryOther = insightCategoryOtherLabel.trim();
    const trimmedInteractionOther = interactionTypeOtherLabel.trim();

    setSaving(true);
    const occurredAt = dateInputToOccurredAt(dateValue, isToday);

    try {
      if (editingNote) {
        await updateNote(userId, editingNote.id, {
          body: trimmed,
          interactionType,
          insightStrength,
          occurredAt,
          insightCategory: insightCategory,
          insightCategoryOtherLabel: insightCategory === "other" ? trimmedCategoryOther : null,
          whyItMatters: trimmedWhy.length > 0 ? trimmedWhy : null,
          interactionTypeOtherLabel: interactionType === "other" && trimmedInteractionOther.length > 0 ? trimmedInteractionOther : null,
        });
      } else {
        const linkedClaim = beliefClaims?.find((c) => c.claimKey === selectedClaimKey) ?? null;
        await createNote(userId, {
          hcpId,
          body: trimmed,
          interactionType,
          insightStrength,
          occurredAt,
          createdFrom: "hcp_detail_insight",
          insightCategory: insightCategory,
          insightCategoryOtherLabel: insightCategory === "other" ? trimmedCategoryOther : null,
          whyItMatters: trimmedWhy.length > 0 ? trimmedWhy : null,
          interactionTypeOtherLabel: interactionType === "other" && trimmedInteractionOther.length > 0 ? trimmedInteractionOther : null,
          beliefClaimKey: linkedClaim?.claimKey ?? null,
          beliefClaimTitle: linkedClaim?.theme ?? null,
        });
        // Fires only on a successful NEW insight (createNote resolved). Enums only —
        // never the note body or the free-text "other" labels.
        track("insight_captured", {
          insight_strength: insightStrength,
          interaction_type: interactionType,
          insight_category: insightCategory,
        });
      }

      setBody("");
      setWhyItMatters("");
      setInsightCategory(null);
      setInsightCategoryOtherLabel("");
      setInteractionType("general");
      setInteractionTypeOtherLabel("");
      setInsightStrength("routine");
      setSelectedClaimKey(null);
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

  if (isInline && !showForm) {
    // Ledger register (academic profile): the frame's "+ CAPTURE" bar — a gold
    // marker, a serif prompt and the SOURCE · TAG · LINK affordance — rather than a
    // boxed sans input. The wrapping row (in FieldInsights) supplies the bar chrome.
    if (variant === "ledger") {
      // Mobile reflow (2026-08-10, Garrett's shape): the serif prompt on top,
      // + CAPTURE with the affordance line below — the single row crammed at 393px.
      if (isMobileCapture) {
        return (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(true); }}
            aria-label={`Add an insight about Dr. ${firstName}`}
            style={{ display: "flex", flexDirection: "column", gap: 8, padding: "13px 16px", cursor: "text" }}
          >
            <span style={{ fontFamily: FACE.value, fontSize: 13, color: CANON.INK.MUTE }}>Add an insight about Dr. {firstName}…</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ font: `600 9px/1 ${FACE.data}`, letterSpacing: ".16em", color: CANON.GOLD.PRIME }}>+ CAPTURE</span>
              <span style={{ font: `400 9px/1.5 ${FACE.data}`, letterSpacing: ".14em", color: CANON.INK.GHOST }}>SOURCE · TAG · LINK A POSITION</span>
            </span>
          </div>
        );
      }
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(true); }}
          aria-label={`Add an insight about Dr. ${firstName}`}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 24px", cursor: "text" }}
        >
          <span style={{ font: `600 9px/1 ${FACE.data}`, letterSpacing: ".16em", color: CANON.GOLD.PRIME }}>+ CAPTURE</span>
          <span style={{ flex: 1, fontFamily: FACE.value, fontSize: 13, color: CANON.INK.MUTE }}>Add an insight about Dr. {firstName}…</span>
          <span style={{ font: `400 9px/1 ${FACE.data}`, letterSpacing: ".14em", color: CANON.INK.GHOST }}>SOURCE · TAG · LINK A POSITION</span>
        </div>
      );
    }
    return (
      <>
        <style>{`
          input.fm-insight-composer-input::placeholder,
          textarea.fm-insight-composer-textarea::placeholder {
            color: #9B9892 !important;
            opacity: 1 !important;
            -webkit-text-fill-color: #9B9892 !important;
          }
        `}</style>
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
            fontSize: 15,
            padding: "0 12px",
            fontFamily: FACE.ui,
            outline: "none",
            cursor: "text",
            marginBottom: 12,
          }}
        />
      </>
    );
  }

  return (
    <div style={{ opacity: saving ? 0.6 : 1, padding: "16px 18px 18px", fontFamily: FONT.mono }}>
      <style>{`
        .fm-insight-composer-textarea::placeholder {
          color: #9B9892;
          opacity: 1;
        }
        .fm-insight-composer-input::placeholder {
          color: #9B9892;
          opacity: 1;
        }
      `}</style>
      <textarea
        ref={bodyRef}
        className="fm-insight-composer-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Add an insight about Dr. ${firstName}...`}
        aria-label="Insight body"
        style={{
          width: "100%",
          minHeight: 80,
          borderRadius: 0,
          backgroundColor: GROUND.g2,
          border: `1px solid ${LINE.l1}`,
          color: COOL.ui,
          fontSize: 14.5,
          padding: 12,
          lineHeight: 1.55,
          resize: "none",
          overflow: "hidden",
          outline: "none",
          fontFamily: FACE.value,
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 14 }}>
        <div style={{ ...monoLabel, marginBottom: 4 }}>
          Why it matters
        </div>
        <div style={{ fontFamily: FACE.value, fontSize: 13, color: COOL.muted, marginBottom: 8, lineHeight: 1.45 }}>
          What's the strategic implication of this insight? This is what your manager will see in their weekly brief.
        </div>
        <textarea
          ref={whyItMattersRef}
          className="fm-insight-composer-textarea"
          value={whyItMatters}
          onChange={(e) => setWhyItMatters(e.target.value)}
          placeholder="Optional but recommended..."
          aria-label="Why it matters"
          style={{
            width: "100%",
            minHeight: 60,
            borderRadius: 0,
            backgroundColor: GROUND.g2,
            border: `1px solid ${LINE.l1}`,
            color: COOL.ui,
            fontSize: 13,
            padding: 12,
            lineHeight: 1.55,
            resize: "none",
            overflow: "hidden",
            outline: "none",
            fontFamily: FACE.value,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Link a sourced position — anchors this insight to a belief claim on the
          profile. Writes belief_claim_key (matching the rendered claim-<key>
          target). Empty for HCPs with no positions, stated honestly. */}
      <div style={{ ...monoLabel, marginBottom: 6, marginTop: 14 }}>
        Link a position <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
      </div>
      {beliefClaims === null ? (
        <div style={{ fontSize: 13, color: "#6B6A65" }}>Loading positions…</div>
      ) : beliefClaims.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65", lineHeight: 1.45 }}>
          No sourced positions on file — this insight won't link to a belief.
        </div>
      ) : (
        <>
          <div style={{ fontFamily: FACE.value, fontSize: 13, color: COOL.muted, marginBottom: 8, lineHeight: 1.45 }}>
            If the conversation related to one of this HCP's published positions, link it — the insight will point at that position on the belief profile.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {beliefClaims.map((claim) => {
              const selected = selectedClaimKey === claim.claimKey;
              return (
                <button
                  key={claim.claimKey}
                  type="button"
                  onClick={() => setSelectedClaimKey(selected ? null : claim.claimKey)}
                  title={claim.summary ?? undefined}
                  style={{
                    ...regChip(selected),
                    textTransform: "none",
                    ...(selected ? { color: GOLD.gold, border: `1px solid ${GOLD.dim}`, background: "transparent" } : null),
                  }}
                >
                  {claim.theme}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={{ ...monoLabel, marginBottom: 6, marginTop: 14 }}>
        Category <span style={{ color: "#E8704E" }}>*</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {INSIGHT_CATEGORIES.map((category) => {
          const selected = insightCategory === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setInsightCategory(category)}
              style={regChip(selected)}
            >
              <TierGlyph cat={category} dim={!selected} />
              {CATEGORY_LABELS[category].toUpperCase()}
            </button>
          );
        })}
      </div>
      {insightCategory === "other" ? (
        <input
          type="text"
          value={insightCategoryOtherLabel}
          onChange={(e) => setInsightCategoryOtherLabel(e.target.value)}
          placeholder="Specify category..."
          aria-label="Specify other category"
          maxLength={40}
          style={{
            width: "100%",
            height: 36,
            marginTop: 8,
            borderRadius: 0,
            backgroundColor: GROUND.g2,
            border: `1px solid ${LINE.l1}`,
            color: COOL.ui,
            fontSize: 13,
            padding: "0 12px",
            fontFamily: FONT.mono,
            outline: "none",
          }}
        />
      ) : null}

      <div style={{ ...monoLabel, marginBottom: 6, marginTop: 14 }}>
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
              style={regChip(selected)}
            >
              {interactionTypeLabel(type)}
            </button>
          );
        })}
      </div>
      {interactionType === "other" ? (
        <input
          type="text"
          value={interactionTypeOtherLabel}
          onChange={(e) => setInteractionTypeOtherLabel(e.target.value)}
          placeholder="Specify interaction type..."
          aria-label="Specify other interaction type"
          maxLength={40}
          style={{
            width: "100%",
            height: 36,
            marginTop: 8,
            borderRadius: 0,
            backgroundColor: GROUND.g2,
            border: `1px solid ${LINE.l1}`,
            color: COOL.ui,
            fontSize: 13,
            padding: "0 12px",
            fontFamily: FONT.mono,
            outline: "none",
          }}
        />
      ) : null}

      <div style={{ ...monoLabel, marginBottom: 6, marginTop: 14 }}>
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
                ...regChip(selected),
                ...(selected && strength === "strategic" ? { color: GOLD.gold, border: `1px solid ${GOLD.dim}`, background: "transparent" } : null),
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
              color: COOL.chrome,
              fontFamily: FONT.mono,
              fontSize: 11,
              letterSpacing: "0.06em",
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
                  day: { color: "#E8E6DF", fontSize: 13, fontFamily: FACE.ui },
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
            color: COOL.label,
            fontFamily: FONT.mono,
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Cancel
        </button>
        {(() => {
          const validation = getValidationState();
          return (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!validation.saveEnabled || saving}
              style={{
                backgroundColor: "transparent",
                color: validation.saveEnabled ? GOLD.gold : COOL.label,
                padding: "7px 15px",
                fontWeight: 600,
                fontFamily: FONT.mono,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                borderRadius: 0,
                border: `1px solid ${validation.saveEnabled ? GOLD.dim : LINE.l2}`,
                cursor: validation.saveEnabled && !saving ? "pointer" : "default",
                opacity: validation.saveEnabled ? 1 : 0.6,
              }}
            >
              {validation.buttonLabel}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
