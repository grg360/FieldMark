import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { TerritoryNode } from "../../lib/cohortLedger";

/**
 * Territory control — two geographic parents, each SELECTABLE and EXPANDABLE.
 *
 * WHY THIS IS NOT A <select>: a native <optgroup> label cannot be selected or focused —
 * it is a caption, not an option. The requirement is that "United States" and "Europe"
 * are themselves choices AND disclose their children, which no native select can express.
 * So this is a custom listbox that deliberately keeps the previous control's visual
 * language (same mono face, card ground, hairline border, tracked caps) — the behaviour
 * changed, the look did not.
 *
 * VIEWPORT FIT: the menu is tall (2 parents + 5 US regions + 33 European countries when
 * both branches are open), and it is anchored to a trigger that can sit anywhere down the
 * page. No ancestor clips it — the ledger's containers carry no overflow — so the failure
 * was purely that it opened DOWNWARD with a fixed max-height and ran past the bottom of
 * the viewport. It now measures the real space above and below the trigger on open (and on
 * scroll/resize while open), flips upward when that side has more room, and takes its
 * max-height from the space actually available, so the list is always fully reachable by
 * scrolling inside it. visualViewport is preferred where present so mobile browser chrome
 * and on-screen keyboards are accounted for.
 *
 * TAP DISAMBIGUATION (the failure mode this design exists to avoid): a parent row has TWO
 * distinct actions, so it has TWO distinct hit targets that never overlap —
 *   • the LABEL selects the parent scope (United States = the national board)
 *   • a separate chevron button, divided by a hairline and given a >=44px touch target,
 *     toggles disclosure and calls stopPropagation so it can never fall through to select
 * The chevron is the only element that expands; the label is the only element that
 * selects. On a parent that is expand-only (Established + Europe) the label is inert and
 * rendered muted, so the chevron is the sole affordance.
 */

export interface TerritorySelectProps {
  nodes: TerritoryNode[];
  value: string;
  onChange: (key: string) => void;
  /** Optional "my territory" shortcut, rendered above the geographic parents. */
  mine?: { key: string; label: string } | null;
  mono: (size: number, weight?: number) => CSSProperties;
  palette: { card: string; ink4: string; ink5: string; lineStrong: string; lineMed: string; amber: string };
}

export default function TerritorySelect({ nodes, value, onChange, mine, mono, palette: P }: TerritorySelectProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Open the branch the current selection lives in, so the menu explains itself.
    const seed: Record<string, boolean> = {};
    for (const n of nodes) if (value === n.key || value.startsWith(`${n.key.split(":")[0]}:`)) seed[n.key] = true;
    return seed;
  });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Placement is measured, never assumed: `dir` flips the menu above the trigger when
  // that side has more room, and `maxH` is the space actually available rather than a
  // fixed guess. MIN keeps a usable list even in a cramped viewport (it scrolls inside).
  const [placement, setPlacement] = useState<{ dir: "down" | "up"; maxH: number }>({
    dir: "down",
    maxH: 380,
  });

  useLayoutEffect(() => {
    if (!open) return;
    const GAP = 4, GUTTER = 12, MIN = 160, CAP = 420;
    const measure = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const below = vh - r.bottom - GAP - GUTTER;
      const above = r.top - GAP - GUTTER;
      const dir: "down" | "up" = below >= MIN || below >= above ? "down" : "up";
      const avail = dir === "down" ? below : above;
      setPlacement({ dir, maxH: Math.max(MIN, Math.min(CAP, Math.floor(avail))) });
    };
    measure();
    // Capture phase: the page may scroll in an ancestor, not just the window.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel = (() => {
    if (mine && value === mine.key) return mine.label;
    for (const n of nodes) {
      if (n.key === value) return n.label;
      const c = n.children.find((k) => k.key === value);
      if (c) return c.label;
    }
    return nodes[0]?.label ?? "";
  })();

  const pick = (key: string) => { onChange(key); setOpen(false); };

  const rowBase: CSSProperties = {
    display: "flex", alignItems: "stretch", width: "100%",
    borderBottom: `1px solid ${P.lineMed}`,
  };
  const labelBtn = (selected: boolean, inert: boolean, indent: number): CSSProperties => ({
    ...mono(10), flex: 1, textAlign: "left",
    padding: `9px 10px 9px ${10 + indent}px`, minHeight: 38,
    background: selected ? "rgba(216,169,75,.09)" : "transparent",
    color: inert ? P.ink4 : selected ? P.amber : P.ink5,
    border: "none", cursor: inert ? "default" : "pointer",
    letterSpacing: ".1em", textTransform: "uppercase",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...mono(11), background: P.card, color: P.ink5,
          border: `1px solid ${P.lineStrong}`, padding: "4px 6px",
          letterSpacing: ".08em", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase",
        }}
      >
        {currentLabel}
        <span aria-hidden style={{ ...mono(9), color: P.ink4 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", left: 0, zIndex: 40,
            ...(placement.dir === "down"
              ? { top: "calc(100% + 4px)" }
              : { bottom: "calc(100% + 4px)" }),
            minWidth: 232, maxHeight: placement.maxH, overflowY: "auto",
            overscrollBehavior: "contain",
            background: P.card, border: `1px solid ${P.lineStrong}`,
            boxShadow: "0 10px 28px rgba(0,0,0,.42)",
          }}
        >
          {mine && (
            <div style={rowBase}>
              <button
                type="button" role="option" aria-selected={value === mine.key}
                onClick={() => pick(mine.key)}
                style={labelBtn(value === mine.key, false, 0)}
              >
                {mine.label}
              </button>
            </div>
          )}

          {nodes.map((n) => {
            const isOpen = !!expanded[n.key];
            const selected = value === n.key;
            return (
              <div key={n.key}>
                <div style={rowBase}>
                  {/* HIT TARGET 1 — selects the parent scope. */}
                  <button
                    type="button" role="option" aria-selected={selected}
                    disabled={!n.selectable}
                    onClick={() => n.selectable && pick(n.key)}
                    title={n.selectable ? undefined : "Not available for this cohort — select a country"}
                    style={{ ...labelBtn(selected, !n.selectable, 0), fontWeight: 600 }}
                  >
                    {n.label}
                  </button>
                  {/* HIT TARGET 2 — expands only. stopPropagation keeps a mis-aimed tap
                      from ever selecting; the hairline + width make it a distinct target. */}
                  <button
                    type="button"
                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${n.label}`}
                    aria-expanded={isOpen}
                    onClick={(e) => { e.stopPropagation(); setExpanded((m) => ({ ...m, [n.key]: !m[n.key] })); }}
                    style={{
                      ...mono(10), width: 44, minHeight: 38, flexShrink: 0,
                      background: "transparent", color: P.ink4,
                      border: "none", borderLeft: `1px solid ${P.lineMed}`,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                </div>

                {isOpen && n.children.map((c) => (
                  <div key={c.key} style={rowBase}>
                    <button
                      type="button" role="option" aria-selected={value === c.key}
                      onClick={() => pick(c.key)}
                      style={labelBtn(value === c.key, false, 16)}
                    >
                      {c.label}
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
