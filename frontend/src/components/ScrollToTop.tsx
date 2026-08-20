import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Reset the scroll position on forward navigation.
 *
 * React Router does not touch scroll on a client-side navigation — the document keeps
 * its offset while the route swaps underneath it. Measured 2026-08-19 on the publication
 * timeline: clicking a year bar from scrollY 1900 landed on the bibliography at
 * scrollY 1853.75, part-way down a 4,313px page. The link carried no hash and the
 * destination scrolled nothing; nothing anywhere in the app reset it.
 *
 * GATED ON PUSH/REPLACE, NEVER POP — this is the whole reason the component is safe.
 * `history.scrollRestoration` is "auto", so on a back/forward the browser restores the
 * previous offset itself, which is what a user expects: back from a profile should return
 * to your place in the ledger, not to the top of it. Resetting unconditionally would
 * break that everywhere, and the breakage would only surface somewhere unrelated.
 *
 * A HASH STILL WINS. Deep links like /hcp/:id/publications#senior-author are handled by
 * the destination's own scrollIntoView; scrolling to top first would fight it.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);

  return null;
}
