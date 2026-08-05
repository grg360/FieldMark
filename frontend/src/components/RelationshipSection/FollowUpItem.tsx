import { useEffect, useRef, useState, type ReactNode } from "react";
import { DayPicker } from "react-day-picker";
import {
  softDeleteNextAction,
  updateNextAction,
  type NextAction,
  type Priority,
} from "../../lib/relationships";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { COOL, FONT, GOLD, GROUND, LINE } from "../../lib/designTokens";

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
  const previousItemIdRef = useRef(item.id);

  const overdue = isOverdue(item);

  useEffect(() => {
    if (previousItemIdRef.current !== item.id) {
      previousItemIdRef.current = item.id;
      setBodyDraft(item.body);
      setEditingBody(false);
      setConfirmDelete(false);
      return;
    }

    if (!editingBody) {
      setBodyDraft(item.body);
    }
  }, [item.id, item.body, editingBody]);

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
        <span style={{ color: GOLD.gold, fontSize: size, lineHeight: 1 }}>
          {String.fromCharCode(0x25B2)}
        </span>
      );
    }
    if (priority === "low") {
      return (
        <span style={{ color: COOL.label, fontSize: size, lineHeight: 1 }}>
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
    <div style={{ fontFamily: FONT.mono }}>
      <div
        style={{
          backgroundColor: GROUND.g2,
          border: `1px solid ${LINE.l1}`,
          borderLeft: overdue ? `2px solid ${GOLD.gold}` : `1px solid ${LINE.l1}`,
          borderRadius: 2,
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
                  backgroundColor: GROUND.g2,
                  border: `1px solid ${LINE.l1}`,
                  borderRadius: 2,
                  zIndex: 10,
                  minWidth: 150,
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
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: priority === item.priority ? GOLD.gold : COOL.prose,
                      cursor: "pointer",
                      fontFamily: FONT.mono,
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
                  backgroundColor: GROUND.g1,
                  border: `1px solid ${LINE.l2}`,
                  borderRadius: 2,
                  color: COOL.ui,
                  fontSize: 13.5,
                  padding: "4px 8px",
                  fontFamily: FONT.serif,
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
                  fontFamily: FONT.serif,
                  fontSize: 13.5,
                  color: COOL.ui,
                  cursor: "pointer",
                  lineHeight: 1.45,
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
                borderRadius: 2,
                fontSize: 9.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: overdue ? GOLD.gold : COOL.muted,
                backgroundColor: "transparent",
                border: `1px solid ${overdue ? GOLD.dim : LINE.l1}`,
                cursor: pending ? "default" : "pointer",
                fontFamily: FONT.mono,
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
                  selected={item.due_at ? new Date(item.due_at) : undefined}
                  onSelect={(date) => void handleDateSelect(date)}
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
            onClick={() => void handleMarkComplete()}
            disabled={pending}
            style={{
              backgroundColor: "transparent",
              color: COOL.prose,
              padding: "4px 9px",
              borderRadius: 2,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              border: `1px solid ${LINE.l2}`,
              cursor: pending ? "default" : "pointer",
              fontFamily: FONT.mono,
            }}
          >
            {String.fromCharCode(0x2713)} Complete
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            style={{
              color: COOL.label,
              fontSize: 9.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "none",
              border: "none",
              cursor: pending ? "default" : "pointer",
              padding: 0,
              fontFamily: FONT.mono,
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
            fontFamily: FONT.mono,
            fontSize: 11,
            color: COOL.muted,
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
              color: GOLD.gold,
              fontSize: 11,
              fontWeight: 600,
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
              color: COOL.label,
              fontSize: 11,
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
