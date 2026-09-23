import { Navigate, useParams } from "react-router-dom";
import { useTA } from "../lib/TAContext";
import { offerableTas } from "../lib/taManifest";

/**
 * THE CARD FEED IS RETIRED. The cohort ledger is the only People surface.
 *
 * These routes -- /:ta/:dashboard/:indication and its two shorter forms -- were the feed's.
 * They now redirect to the equivalent ledger view. The routes themselves stay because the
 * URLs are in bookmarks, in shared links and in browser history, and a 404 teaches nothing;
 * a redirect lands the reader on the surface that answers the question they asked.
 *
 * WHY THE FEED IS RETIRED AND NOT MERELY UNLINKED. It disagreed with the ledger about
 * membership. Rising read hcp_rising_composite_v1 for Atopic Dermatitis and
 * hcp_rising_star_ranks_v3 for every other TA -- two tables that share ZERO hcp_ids in every
 * TA -- so "who is a rising star" had two answers depending on which surface you stood on.
 * composite_v1 is a SUPERSEDED definition; the manifest's rs_available=false for AD is the
 * current one, and AD Rising correctly shows the ledger's absence state.
 *
 * TELESCOPE IS NOT REDIRECTED, and it is not handled here. NavBar links SkyView to
 * /oncology/telescope/nsclc, which matches this same URL shape -- so App.tsx routes
 * /:ta/telescope[/:indication] to FeedLayout explicitly, ABOVE these routes. Retiring the
 * CARD FEED means the three cohort dashboards, not every route shaped like one. If that
 * explicit route is ever removed, SkyView starts redirecting to an Established board.
 */

/** The three cohort dashboards the feed served, mapped to the ledger's own cohort slugs. */
const FEED_DASHBOARD_TO_LEDGER_COHORT: Record<string, string> = {
  established: "established",
  // IDENTITY, NOT "rising". CohortLedger reads COHORT_SLUG_TO_TAG and falls back to EST for
  // anything it does not recognise, so /cohorts/ledger/rising would land a Rising URL on the
  // ESTABLISHED board -- silently, and under a heading that looks right. The ledger's slug
  // is "rising-stars"; this map exists to say so rather than to transform anything.
  "rising-stars": "rising-stars",
  community: "community",
};

export default function FeedRedirect() {
  const { ta, dashboard, indication } = useParams<{
    ta?: string;
    dashboard?: string;
    indication?: string;
  }>();
  const { manifest } = useTA();

  // An unrecognised dashboard slug (an old /:ta/social, a typo, or a bare /:ta) used to fall
  // through to the default cohort feed -- HOME_DASHBOARD, "established". It now falls through
  // to the default ledger cohort: same default, same reasoning, one surface later.
  const cohort = FEED_DASHBOARD_TO_LEDGER_COHORT[(dashboard ?? "").toLowerCase()] ?? "established";

  /**
   * NULL MANIFEST = NOT YET KNOWN, so wait one beat rather than guess. Redirecting now would
   * have to decide between "this domain has exactly one area" and "this domain is ambiguous"
   * without the information that distinguishes them. There is nothing on screen to hold --
   * this is a redirect, not a render -- and a wrong ?ta= is NOT recoverable downstream,
   * because an explicit ?ta= is an instruction the ledger obeys rather than a hint it checks.
   */
  if (manifest === null) return null;

  /**
   * THREE CASES, AND THE THIRD IS THE POINT:
   *   1. The indication IS a leaf TA the manifest knows -- carry it. The URL named the area.
   *   2. The indication is "all"/absent and the domain has EXACTLY ONE offerable leaf --
   *      carry that leaf. /immunology/established/all named an area unambiguously without
   *      naming it directly: Atopic Dermatitis is the only thing Immunology has.
   *   3. Anything else -- NO ?ta= AT ALL, and the ledger's own
   *      ?ta -> session -> profile -> picker chain answers. /oncology/established/all is
   *      genuinely ambiguous (lung and colorectal are both offerable), and so is an unmapped
   *      or unknown domain.
   *
   * NEVER INVENT NSCLC. Picking an area for the reader and labelling the board as though
   * they had chosen it is the defect the ledger's four-layer resolution exists to prevent;
   * inheriting it here through a redirect would reintroduce it one layer further up, where
   * the ledger cannot see it. Case 3 hands the question back rather than answering it.
   */
  const offerable = offerableTas(manifest);
  const ind = (indication ?? "").toLowerCase();
  const domain = (ta ?? "").toLowerCase();

  let taParam: string | null = null;
  const named = offerable.find((c) => c.slug === ind);
  if (named) {
    taParam = named.slug;
  } else {
    const inDomain = offerable.filter((c) => (c.parentSlug ?? c.slug).toLowerCase() === domain);
    if (inDomain.length === 1) taParam = inDomain[0].slug;
  }

  const to = `/cohorts/ledger/${cohort}${taParam ? `?ta=${encodeURIComponent(taParam)}` : ""}`;
  // replace, not push: these URLs are retired, so Back should leave the app where the reader
  // came from rather than bouncing them through a route that only redirects.
  return <Navigate to={to} replace />;
}
