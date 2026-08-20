// ScoreTooltip — the tap-to-open definition panel on ledger column heads.
//
// TOUCH FIRST, and that is the whole reason this component exists rather than
// reusing InfoTooltip. InfoTooltip opens on mouseenter/focus and closes on
// mouseleave/blur; it has no click path at all, so on a touch display its
// content is unreachable. Every trigger here is onClick — there is no
// onMouseEnter anywhere in this file, deliberately, and adding one would
// reintroduce the hover-only failure.
//
// Shape follows AddToWatchlistPopover (anchored panel measured off the
// trigger's getBoundingClientRect, dismissed on outside pointerdown and
// Escape), with two additions it did not need: the panel is PORTALLED to
// document.body so it escapes the ledger header's overflow and stacking
// context, and it closes on the next scroll rather than trying to follow the
// trigger — a header that scrolls out from under a fixed panel is the latch
// case, and closing is the honest answer to it.
//
// Placement is MEASURED, never assumed: the panel renders hidden at the
// origin, its real box is read, and only then is it positioned. A height
// constant cannot work here because the bodies differ by more than 3:1 in
// length (rs_netvis is one line, est_sencit is four).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CANON, DEPTH, FACE, T } from "../lib/canonicalTokens";
import { METRIC_DEFS } from "../lib/scoreDefinitions";

const MAX_W = 320; // panel cap
const PAD = 14; // panel internal padding
const EDGE = 8; // viewport gutter — the panel never touches an edge
const GAP = 6; // trigger to panel

// CANON.GOLD.RANK (#E0A75E) at 35%. Written out rather than composed because
// the token is a hex literal and this is its only alpha derivation here.
const AMBER_35 = "rgba(224,167,94,0.35)";

export interface ScoreTooltipProps {
  /** Key into METRIC_DEFS. null — or any key with no entry — renders the
   *  children untouched, with no trigger and no affordance. This is what makes
   *  the Community heads a pass-through rather than a special case at the call
   *  site. */
  metricKey: string | null;
  children: ReactNode;
}

export default function ScoreTooltip({ metricKey, children }: ScoreTooltipProps) {
  const def = metricKey ? METRIC_DEFS[metricKey] : undefined;
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  // MEASURE, THEN PLACE. Runs in the layout phase so the reader never sees the
  // panel at the origin: it is painted with visibility:hidden until pos lands,
  // and the browser does not composite between this effect and the commit.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const a = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect(); // the REAL box, not a constant

    // Horizontal: centre on the trigger, then clamp both edges. The clamp order
    // matters — a panel wider than the viewport must land at EDGE, not at a
    // negative left, so the min clamp comes last.
    let left = a.left + a.width / 2 - p.width / 2;
    const maxLeft = window.innerWidth - p.width - EDGE;
    if (left > maxLeft) left = maxLeft;
    if (left < EDGE) left = EDGE;

    // Vertical: below by default; flip above when the panel would overflow the
    // bottom. If it fits in neither direction (short viewport, long body) it
    // pins to the bottom gutter rather than flipping into a worse overflow.
    let top = a.bottom + GAP;
    if (top + p.height > window.innerHeight - EDGE) {
      const above = a.top - GAP - p.height;
      top = above >= EDGE ? above : Math.max(EDGE, window.innerHeight - p.height - EDGE);
    }

    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // pointerdown, not click: it fires before the ledger's own click handlers
    // and covers mouse, touch and pen from one listener. Capture phase so a
    // child that stops propagation cannot trap the panel open.
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return; // the trigger toggles itself
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // once:true — the FIRST scroll closes it. capture:true so scrolls inside a
    // nested scroller (the drawer, the trials popup) count too, not just the
    // window's own.
    const onScroll = () => close();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { capture: true, once: true, passive: true });
    window.addEventListener("resize", onScroll, { once: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  if (!def) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${def.title} — what this column measures`}
        // stopPropagation on BOTH: pointerdown so the row beneath cannot begin
        // its own gesture, click so opening a definition never opens a row
        // drawer. The toggle itself lives on click, so that a pointerdown
        // followed by its own click does not open then immediately close.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }
        }}
        // display:block keeps the head's existing line boxes exactly as they
        // were — the parent div's textAlign still centres, and the two-line
        // heads keep their height. An inline trigger would not.
        style={{ display: "block", cursor: "pointer" }}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={def.title}
              style={{
                position: "fixed",
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                visibility: pos ? "visible" : "hidden",
                maxWidth: MAX_W,
                padding: PAD,
                background: CANON.GROUND.BASE,
                border: `1px solid ${AMBER_35}`,
                borderRadius: 4,
                // The float register's cast shadow and nothing more — no second
                // ring, no glow. Intensity II, same as every other overhang.
                boxShadow: DEPTH.OVERHANG.boxShadow,
                zIndex: 400,
                // Set explicitly: the portal renders at document.body, so it
                // inherits none of the header's centring or mono voice.
                textAlign: "left",
              }}
            >
              <div
                style={{
                  font: `500 ${T.MICRO}px ${FACE.data}`,
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: CANON.GOLD.RANK,
                }}
              >
                {def.title}
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  font: `400 ${T.META}px/1.55 ${FACE.ui}`,
                  color: CANON.INK.BODY,
                  textWrap: "pretty",
                }}
              >
                {def.body}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
