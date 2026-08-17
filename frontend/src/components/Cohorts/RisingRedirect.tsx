import { Navigate, useSearchParams } from "react-router-dom";

/**
 * /rising — retired surface, preserved as a redirect.
 *
 * The Rising REGISTER was a second rank table competing with the main cohort ledger's
 * Rising view, and the weaker of the two: no relationship tracking, no drawers, no
 * trials popup, no virtualization. Everything it displayed (SENIOR SINCE, OPEN TRIAL,
 * rank bands) already existed on /cohorts/ledger/rising-stars from the same RPCs, and
 * the region/country slicing that was briefly unique to it now lives on that ledger's
 * territory axis. So the register is gone and this route forwards to the real ledger.
 *
 * The QUADRANT survives at /rising/quadrant — it plots momentum × visibility from real
 * components and the ledger has no equivalent view.
 *
 * A Route path cannot match a query string, so the old `/rising?mode=quadrant` deep link
 * (still emitted by the rising profile until its link is updated, and possibly bookmarked)
 * is honoured here rather than being silently swallowed by the ledger redirect.
 */
export default function RisingRedirect() {
  const [params] = useSearchParams();
  const to = params.get("mode") === "quadrant" ? "/rising/quadrant" : "/cohorts/ledger/rising-stars";
  return <Navigate to={to} replace />;
}
