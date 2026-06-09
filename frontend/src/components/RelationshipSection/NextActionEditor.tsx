import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import {
  createNextAction,
  softDeleteNextAction,
  updateNextAction,
  type NextAction,
} from "../../lib/relationships";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateToIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
}

function isOverdue(dueAtIso: string | null, completedAt: string | null): boolean {
  if (!dueAtIso || completedAt) return false;
  return new Date(dueAtIso).getTime() < Date.now();
}

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameCalendarDay(date, now)) return "Today";
  if (isSameCalendarDay(date, tomorrow)) return "Tomorrow";
  if (isSameCalendarDay(date, yesterday)) return "Yesterday";

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

interface Props {
  userId: string;
  hcpId: string;
  relationshipId: string;
  openAction: NextAction | null;
  lastCompletedAction: NextAction | null;
  onMutate: () => void;
}

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 4,
  color: "#E8E6DF",
  fontSize: 13,
  padding: "6px 10px",
  fontFamily: "system-ui, -apple-system, sans-serif",
  outline: "none",
};

export default function NextActionEditor({
  userId,
  hcpId,
  relationshipId: _relationshipId,
  openAction,
  lastCompletedAction,
  onMutate,
}: Props) {
  const [body, setBody] = useState(openAction?.body ?? "");
  const [dueAtIso, setDueAtIso] = useState<string | null>(openAction?.due_at ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const lastSeenActionIdRef = useRef<string | null | undefined>(undefined);

  const overdue = openAction ? isOverdue(openAction.due_at, openAction.completed_at) : false;
  const effectiveDueAt = openAction ? openAction.due_at : dueAtIso;

  useEffect(() => {
    const currentId = openAction?.id ?? null;
    if (currentId === lastSeenActionIdRef.current) return;
    lastSeenActionIdRef.current = currentId;
    setBody(openAction?.body ?? "");
    setDueAtIso(openAction?.due_at ?? null);
    setConfirmDelete(false);
  }, [openAction]);

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

  async function handleBlurCreateOrUpdate() {
    const trimmed = body.trim();
    if (!trimmed || pending) return;

    if (!openAction) {
      setPending(true);
      try {
        await createNextAction(userId, {
          hcpId,
          body: trimmed,
          dueAt: dueAtIso,
          createdFrom: "relationship_section",
        });
        onMutate();
      } catch (err) {
        console.error("NextActionEditor create failed", err);
      } finally {
        setPending(false);
      }
      return;
    }

    if (trimmed === openAction.body) return;

    setPending(true);
    try {
      await updateNextAction(userId, openAction.id, { body: trimmed });
      onMutate();
    } catch (err) {
      console.error("NextActionEditor update body failed", err);
    } finally {
      setPending(false);
    }
  }

  async function handleDateSelect(date: Date | undefined) {
    setShowDatePicker(false);
    const iso = date ? dateToIso(date) : null;

    if (!openAction) {
      setDueAtIso(iso);
      return;
    }

    if (iso === openAction.due_at) return;

    setPending(true);
    try {
      await updateNextAction(userId, openAction.id, { dueAt: iso });
      onMutate();
    } catch (err) {
      console.error("NextActionEditor update due date failed", err);
    } finally {
      setPending(false);
    }
  }

  async function handleMarkComplete() {
    if (!openAction || pending) return;
    setPending(true);
    try {
      await updateNextAction(userId, openAction.id, {
        completedAt: new Date().toISOString(),
      });
      onMutate();
    } catch (err) {
      console.error("NextActionEditor mark complete failed", err);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!openAction || pending) return;
    setPending(true);
    try {
      await softDeleteNextAction(userId, openAction.id);
      onMutate();
    } catch (err) {
      console.error("NextActionEditor delete failed", err);
    } finally {
      setPending(false);
      setConfirmDelete(false);
    }
  }

  function dateButtonLabel(): string {
    if (!effectiveDueAt) return "Set due date";
    const label = formatDueDate(effectiveDueAt);
    if (overdue) return `${label} ${String.fromCharCode(0x00B7)} Overdue`;
    return label;
  }

  const showCompletedLine =
    !openAction &&
    lastCompletedAction?.completed_at &&
    completedWithin7Days(lastCompletedAction.completed_at);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {overdue ? (
          <span style={{ color: "#E8A020", fontSize: 14, marginRight: 4 }} aria-hidden>
            {String.fromCharCode(0x26A0)}
          </span>
        ) : null}

        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => void handleBlurCreateOrUpdate()}
          placeholder="What's the next move?"
          disabled={pending}
          aria-label="Next action"
          style={inputStyle}
        />

        <div ref={datePickerRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onClick={() => setShowDatePicker((open) => !open)}
            disabled={pending}
            aria-label="Set next action due date"
            aria-expanded={showDatePicker}
            style={{
              padding: "6px 10px",
              borderRadius: 4,
              fontSize: 12,
              color: overdue ? "#E8A020" : "#9B9892",
              backgroundColor: "transparent",
              border: "1px solid #1E1E22",
              cursor: pending ? "default" : "pointer",
              fontFamily: "system-ui, -apple-system, sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {dateButtonLabel()}
          </button>

          {showDatePicker ? (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
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
                selected={effectiveDueAt ? new Date(effectiveDueAt) : undefined}
                onSelect={(date) => void handleDateSelect(date)}
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

        {openAction ? (
          <>
            <button
              type="button"
              onClick={() => void handleMarkComplete()}
              disabled={pending}
              style={{
                backgroundColor: "#3FB8AF",
                color: "#0A0A0B",
                padding: "6px 12px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                cursor: pending ? "default" : "pointer",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              Mark complete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              style={{
                color: "#6B6A65",
                fontSize: 12,
                background: "none",
                border: "none",
                cursor: pending ? "default" : "pointer",
                padding: 0,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              Delete
            </button>
          </>
        ) : null}
      </div>

      {confirmDelete && openAction ? (
        <div
          style={{
            fontSize: 13,
            color: "#9B9892",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>Delete next action?</span>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={pending}
            style={{
              background: "none",
              border: "none",
              color: "#E8A020",
              fontSize: 13,
              fontWeight: 500,
              cursor: pending ? "default" : "pointer",
              padding: 0,
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            style={{
              background: "none",
              border: "none",
              color: "#6B6A65",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {showCompletedLine && lastCompletedAction?.completed_at ? (
        <div style={{ fontSize: 12, color: "#6B6A65" }}>
          {String.fromCharCode(0x2713)} Done {formatRelativeShort(lastCompletedAction.completed_at)}{" "}
          {String.fromCharCode(0x2014)} {lastCompletedAction.body}
        </div>
      ) : null}
    </div>
  );
}
