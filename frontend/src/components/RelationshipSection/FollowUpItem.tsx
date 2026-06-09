import { useEffect, useRef, useState, type ReactNode } from "react";
import { DayPicker } from "react-day-picker";
import {
  softDeleteNextAction,
  updateNextAction,
  type NextAction,
  type Priority,
} from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PRIORITY_OPTIONS: Priority[] = ["high", "normal", "low"];

function dateToIso(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
}

function isOverdue(item: NextAction): boolean {
  if (!item.due_at || item.completed_at) return false;
  return new Date(item.due_at).getTime() < Date.now();
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

function priorityLabel(priority: Priority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

interface Props {
  userId: string;
  item: NextAction;
  onMutate: () => void;
}

export default function FollowUpItem({ userId, item, onMutate }: Props) {
  const { refreshFollowUpInfo } = useRelationships();
  const [editingBody, setEditingBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(item.body);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);

  const datePickerRef = useRef<HTMLDivElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);

  const overdue = isOverdue(item);

  useEffect(() => {
    setBodyDraft(item.body);
    setEditingBody(false);
    setConfirmDelete(false);
  }, [item.id, item.body]);

  useEffect(() => {
    if (editingBody) bodyInputRef.current?.focus();
  }, [editingBody]);

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
    if (!showPriorityMenu) return;
    function onMouseDown(e: MouseEvent) {
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(e.target as Node)) {
        setShowPriorityMenu(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showPriorityMenu]);

  async function saveBody() {
    const trimmed = bodyDraft.trim();
    if (!trimmed || pending) return;
    if (trimmed === item.body) {
      setEditingBody(false);
      return;
    }

    setPending(true);
    try {
      await updateNextAction(userId, item.id, { body: trimmed });
      setEditingBody(false);
      onMutate();
      void refreshFollowUpInfo();
    } catch (err) {
      console.error("FollowUpItem save body failed", err);
    } finally {
      setPending(false);
    }
  }

  function cancelBodyEdit() {
    setBodyDraft(item.body);
    setEditingBody(false);
  }

  async function handleDateSelect(date: Date | undefined) {
    setShowDatePicker(false);
    const iso = date ? dateToIso(date) : null;
    if (iso === item.due_at) return;

    setPending(true);
    try {
      await updateNextAction(userId, item.id, { dueAt: iso });
      onMutate();
      void refreshFollowUpInfo();
    } catch (err) {
      console.error("FollowUpItem update due date failed", err);
    } finally {
      setPending(false);
    }
  }

  async function handlePriorityChange(priority: Priority) {
    setShowPriorityMenu(false);
    if (priority === item.priority) return;

    setPending(true);
    try {
      await updateNextAction(userId, item.id, { priority });
      onMutate();
      void refreshFollowUpInfo();
    } catch (err) {
      console.error("FollowUpItem update priority failed", err);
    } finally {
      setPending(false);
    }
  }

  async function handleMarkComplete() {
    if (pending) return;
    setPending(true);
    try {
      await updateNextAction(userId, item.id, {
        completedAt: new Date().toISOString(),
      });
      onMutate();
      void refreshFollowUpInfo();
    } catch (err) {
      console.error("FollowUpItem mark complete failed", err);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    try {
      await softDeleteNextAction(userId, item.id);
      onMutate();
      void refreshFollowUpInfo();
    } catch (err) {
      console.error("FollowUpItem delete failed", err);
    } finally {
      setPending(false);
      setConfirmDelete(false);
    }
  }

  function renderPriorityGlyph(priority: Priority, size = 12): ReactNode {
    if (priority === "high") {
      return (
        <span style={{ color: "#E8A020", fontSize: size, lineHeight: 1 }}>
          {String.fromCharCode(0x25B2)}
        </span>
      );
    }
    if (priority === "low") {
      return (
        <span style={{ color: "#6B6A65", fontSize: size, lineHeight: 1 }}>
          {String.fromCharCode(0x2193)}
        </span>
      );
    }
    return null;
  }

  function dueChipLabel(): string {
    if (!item.due_at) return "Set due date";
    const label = formatDueDate(item.due_at);
    if (overdue) {
      return `${String.fromCharCode(0x26A0)} ${label}`;
    }
    return label;
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div
        style={{
          backgroundColor: "#0D0D10",
          border: "1px solid #1E1E22",
          borderLeft: overdue ? "3px solid #E8A020" : "1px solid #1E1E22",
          borderRadius: 4,
          padding: "10px 12px",
          opacity: pending ? 0.6 : 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div ref={priorityMenuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowPriorityMenu((open) => !open)}
              aria-label={`Priority: ${priorityLabel(item.priority)}`}
              aria-expanded={showPriorityMenu}
              style={{
                background: "none",
                border: "none",
                padding: "2px 4px",
                cursor: "pointer",
                minWidth: 18,
                minHeight: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {renderPriorityGlyph(item.priority, 12) ?? (
                <span style={{ width: 12, height: 12, display: "inline-block" }} />
              )}
            </button>

            {showPriorityMenu ? (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  backgroundColor: "#0D0D10",
                  border: "1px solid #1E1E22",
                  borderRadius: 4,
                  zIndex: 10,
                  minWidth: 140,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                }}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => void handlePriorityChange(priority)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      background: "none",
                      border: "none",
                      fontSize: 13,
                      color: priority === item.priority ? "#E8A020" : "#E8E6DF",
                      cursor: "pointer",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      listStyle: "none",
                      appearance: "none",
                      WebkitAppearance: "none",
                    }}
                  >
                    <span style={{ width: 16, marginRight: 8, display: "inline-flex", justifyContent: "center" }}>
                      {renderPriorityGlyph(priority, 11)}
                    </span>
                    {priorityLabel(priority)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ flex: 1, minWidth: 80 }}>
            {editingBody ? (
              <input
                ref={bodyInputRef}
                type="text"
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                onBlur={() => void saveBody()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveBody();
                  }
                  if (e.key === "Escape") cancelBodyEdit();
                }}
                disabled={pending}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  backgroundColor: "#0D0D10",
                  border: "1px solid #1E1E22",
                  borderRadius: 4,
                  color: "#E8E6DF",
                  fontSize: 13,
                  padding: "4px 8px",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  outline: "none",
                }}
              />
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setEditingBody(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setEditingBody(true);
                }}
                style={{
                  fontSize: 13,
                  color: "#E8E6DF",
                  cursor: "pointer",
                  lineHeight: 1.4,
                  overflowWrap: "anywhere",
                }}
              >
                {item.body}
              </div>
            )}
          </div>

          <div ref={datePickerRef} style={{ position: "relative", display: "inline-block" }}>
            <button
              type="button"
              onClick={() => setShowDatePicker((open) => !open)}
              disabled={pending}
              aria-label="Set follow-up due date"
              aria-expanded={showDatePicker}
              style={{
                padding: "3px 8px",
                borderRadius: 3,
                fontSize: 11,
                color: overdue ? "#E8A020" : "#9B9892",
                backgroundColor: "transparent",
                border: "1px solid #1E1E22",
                cursor: pending ? "default" : "pointer",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {dueChipLabel()}
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
                  selected={item.due_at ? new Date(item.due_at) : undefined}
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

          <button
            type="button"
            onClick={() => void handleMarkComplete()}
            disabled={pending}
            style={{
              backgroundColor: "#3FB8AF",
              color: "#0A0A0B",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              border: "none",
              cursor: pending ? "default" : "pointer",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            Mark Complete
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            style={{
              color: "#6B6A65",
              fontSize: 11,
              background: "none",
              border: "none",
              cursor: pending ? "default" : "pointer",
              padding: 0,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {confirmDelete ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "#9B9892",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>Delete this follow-up?</span>
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
    </div>
  );
}
