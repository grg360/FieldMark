// Floating back-to-top (2026-08-10) — mobile-only, mounted ONCE in AppLayout
// so every long surface gets it; reusable standalone for any surface outside
// that wrapper. Register: a bare thin up-caret in dim chrome ink (the
// breadcrumbs' "«" tone), on a subtle charcoal backing with a hairline border
// — a 44px tap target that reads as a minimal control, not a web pill. No
// label, no fill, no gold (dim chrome held against the content fine; reach
// for gold only if it ever disappears — per the ruling).
//
// Behavior: hidden until the user is genuinely far down (~1.5 viewport
// heights), fades in/out on a 300ms opacity transition (pointer-events off
// while hidden), smooth-scrolls to top on tap. bottom inset respects
// env(safe-area-inset-bottom) so it clears the home indicator.
import { useEffect, useState } from "react";
import { useMediaQuery } from "../lib/useMediaQuery";

const SHOW_AFTER_VIEWPORTS = 1.5;
const CHROME_INK = "#7C8288"; // the breadcrumb back-affordance ink

export default function FloatingBackToTop() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * SHOW_AFTER_VIEWPORTS);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  if (!isMobile) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed",
        right: 14,
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        zIndex: 55, // under the nav drawer/search (60+), over page content
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,11,0.82)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 3,
        cursor: "pointer",
        padding: 0,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity .3s ease",
      }}
    >
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden>
        <polyline points="2,8 8,2 14,8" stroke={CHROME_INK} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
