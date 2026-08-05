import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import {
  createNextAction,
  type NextAction,
  type Priority,
} from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import FollowUpItem from "./FollowUpItem";
import { COOL, FONT, GOLD, GROUND, LINE } from "../../lib/designTokens";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PRIORITY_OPTIONS: Priority[] = ["low", "normal", "high"];

function dateToIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
}

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return "Today";
  }
  if (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  ) {
    return "Tomorrow";
  }
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return "Yesterday";
  }

  const monthDay = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) return monthDay;
  return `${monthDay}, ${date.getFullYear()}`;
}

function formatRelativeShort(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} days ago`;

  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}

function completedWithin7Days(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function priorityPillStyle(priority: Priority, selected: boolean): CSSProperties {
  if (!selected) {
    return { backgroundColor: GROUND.g2, color: COOL.label, border: `1px solid ${LINE.l1}` };
  }
  switch (priority) {
    case "high":
      return { backgroundColor: GOLD.gold, color: GROUND.g0, fontWeight: 600, border: `1px solid ${GOLD.gold}` };
    case "normal":
      return { backgroundColor: LINE.l2, color: COOL.ui, border: `1px solid ${LINE.l2}` };
    case "low":
      return { backgroundColor: GROUND.g2, color: COOL.muted, border: `1px solid ${LINE.l1}` };
    default:
      return { backgroundColor: GROUND.g2, color: COOL.label, border: `1px solid ${LINE.l1}` };
  }
}

interface Props {
  userId: string;
  hcpId: string;
  relationshipId: string;
  openActions: NextAction[];
  lastCompletedAction: NextAction | null;
  onMutate: () => void;
}

export default function FollowUpsList({
  userId,
  hcpId,
  relationshipId: _relationshipId,
  openActions,
  lastCompletedAction,
  onMutate,
}: Props) {
  const { refreshFollowUpInfo } = useRelationships();
  const [composerBody, setComposerBody] = useState("");
  const [composerDueAt, setComposerDueAt] = useState<string | null>(null);
  const [composerPriority, setComposerPriority] = useState<Priority>("normal");
  const [showComposerDatePicker, setShowComposerDatePicker] = useState(false);
  const [composerPending, setComposerPending] = useState(false);

  const composerDatePickerRef = useRef<HTMLDivElement>(null);
  const composerBodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer textarea so long text wraps onto new lines
  // instead of scrolling horizontally (and collapses back after save).
  useEffect(() => {
    const el = composerBodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [composerBody]);

  useEffect(() => {
    if (!showComposerDatePicker) return;
    function onMouseDown(e: MouseEvent) {
      if (composerDatePickerRef.current && !composerDatePickerRef.current.contains(e.target as Node)) {
        setShowComposerDatePicker(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showComposerDatePicker]);

  async function handleComposerSave() {
    const trimmed = composerBody.trim();
    if (!trimmed || composerPending) return;

    setComposerPending(true);
    try {
      await createNextAction(userId, {
        hcpId,
        body: trimmed,
        dueAt: composerDueAt,
        priority: composerPriority,
        createdFrom: "relationship_section",
      });
      setComposerBody("");
      setComposerDueAt(null);
      setComposerPriority("normal");
      setShowComposerDatePicker(false);
      onMutate();
      void refreshFollowUpInfo();
    } catch (err) {
      console.error("FollowUpsList create failed", err);
    } finally {
      setComposerPending(false);
    }
  }

  function handleComposerDateSelect(date: Date | undefined) {
    setShowComposerDatePicker(false);
    setComposerDueAt(date ? dateToIso(date) : null);
  }

  const showCompletedLine =
    lastCompletedAction?.completed_at &&
    completedWithin7Days(lastCompletedAction.completed_at);

  const pillBase: CSSProperties = {
    padding: "4px 9px",
    borderRadius: 2,
    fontSize: 9.5,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    cursor: "pointer",
    fontFamily: FONT.mono,
  };

  return (
    <div style={{ fontFamily: FONT.mono }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: composerPending ? 0.6 : 1,
        }}
      >
        <style>{`
          .fm-followup-composer-input::placeholder {
            color: ${COOL.label};
            opacity: 1;
          }
        `}</style>
        <textarea
          ref={composerBodyRef}
          rows={1}
          className="fm-followup-composer-input"
          value={composerBody}
          onChange={(e) => setComposerBody(e.target.value)}
          placeholder="Add a follow-up..."
          disabled={composerPending}
          aria-label="New follow-up"
          style={{
            width: "100%",
            boxSizing: "border-box",
            display: "block",
            backgroundColor: GROUND.g2,
            border: `1px solid ${LINE.l1}`,
            borderRadius: 2,
            color: COOL.ui,
            fontSize: 13.5,
            lineHeight: 1.5,
            padding: "7px 10px",
            fontFamily: FONT.serif,
            outline: "none",
            resize: "none",
            overflow: "hidden",
          }}
        />

        {/* Relative anchor spans the full component width so the calendar can
            center within it instead of overflowing the viewport on mobile. */}
        <div
          ref={composerDatePickerRef}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {PRIORITY_OPTIONS.map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => setComposerPriority(priority)}
                style={{
                  ...pillBase,
                  ...priorityPillStyle(priority, composerPriority === priority),
                }}
              >
                {priority}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowComposerDatePicker((open) => !open)}
            disabled={composerPending}
            aria-label="Set follow-up due date"
            aria-expanded={showComposerDatePicker}
            style={{
              padding: "6px 10px",
              borderRadius: 2,
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: COOL.muted,
              backgroundColor: "transparent",
              border: `1px solid ${LINE.l1}`,
              cursor: composerPending ? "default" : "pointer",
              fontFamily: FONT.mono,
              whiteSpace: "nowrap",
            }}
          >
            {composerDueAt ? formatDueDate(composerDueAt) : "Due Date"}
          </button>

          {showComposerDatePicker ? (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translateX(-50%)",
                maxWidth: "calc(100vw - 32px)",
                backgroundColor: GROUND.g2,
                border: `1px solid ${LINE.l1}`,
                borderRadius: 2,
                padding: 8,
                zIndex: 50,
                marginTop: 6,
                // @ts-expect-error CSS custom properties for react-day-picker
                "--rdp-accent-color": GOLD.gold,
                "--rdp-background-color": GROUND.g2,
                "--rdp-day-color": COOL.ui,
                "--rdp-day-hover-background": LINE.l0,
              }}
            >
              <DayPicker
                mode="single"
                selected={composerDueAt ? new Date(composerDueAt) : undefined}
                onSelect={handleComposerDateSelect}
                styles={{
                  caption: { color: COOL.ui, fontSize: 12, fontFamily: FONT.mono },
                  day: { color: COOL.ui, fontSize: 12, fontFamily: FONT.mono },
                  head_cell: { color: COOL.muted },
                  nav_button: { color: COOL.muted },
                }}
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="fm-pill-button"
          onClick={() => void handleComposerSave()}
          disabled={composerPending || composerBody.trim().length === 0}
          style={{
            width: "100%",
            backgroundColor: GOLD.gold,
            color: GROUND.g0,
            padding: "8px 0",
            borderRadius: 2,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            lineHeight: 1.2,
            border: "none",
            cursor: composerPending || composerBody.trim().length === 0 ? "default" : "pointer",
            fontFamily: FONT.mono,
            opacity: composerBody.trim().length === 0 ? 0.5 : 1,
          }}
        >
          Save
        </button>
      </div>

      {openActions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {openActions.map((item) => (
            <FollowUpItem key={item.id} userId={userId} item={item} onMutate={onMutate} />
          ))}
        </div>
      ) : null}

      {showCompletedLine && lastCompletedAction?.completed_at ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.04em", color: COOL.label, marginTop: 8 }}>
          {String.fromCharCode(0x2713)} Done {formatRelativeShort(lastCompletedAction.completed_at)}{" "}
          {String.fromCharCode(0x2014)} {lastCompletedAction.body}
        </div>
      ) : null}
    </div>
  );
}
