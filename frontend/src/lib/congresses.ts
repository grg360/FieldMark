// Congress calendar — metadata + pure state/countdown logic.
//
// config/congresses.json (repo root) is the hand-authored source of record; the
// frontend imports it directly so there is one copy, no drift. Everything here is
// pure: given a reference date it derives each congress's calendar state and
// countdown. No fabricated data — a congress with no captured social posts simply
// carries no signal, and the UI renders the honest empty state.

import raw from "../../../config/congresses.json";

export type Relevance = "high" | "moderate" | "low";

export interface Congress {
  slug: string;
  short_name: string;
  society_short: string;
  society_full: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  city: string;
  state: string | null;
  country: string;
  venue: string | null;
  hashtags: string[];
  ta_relevance: Record<string, Relevance>;
  society_url: string;
  abstract_source: string | null;
  social_capture_start: string | null;
}

export const CONGRESSES: Congress[] = (raw as { congresses: Congress[] }).congresses;

// ── Calendar state ──────────────────────────────────────────────────────────
// live: today falls within [start,end]. imminent: starts within 30 days.
// upcoming: future beyond 30 days. recently_past: ended within 30 days. past: older.
export type CongressState = "live" | "imminent" | "upcoming" | "recently_past" | "past";

const DAY = 24 * 60 * 60 * 1000;

function atUTC(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getTime();
}

/** Whole days from `now` to a congress's first day (negative once started). */
export function countdownDays(c: Congress, now: Date): number {
  return Math.round((atUTC(c.start_date) - now.getTime()) / DAY);
}

/** Whole days since a congress ended (0 while live or upcoming). */
export function daysSinceEnd(c: Congress, now: Date): number {
  const end = atUTC(c.end_date) + DAY; // end day is inclusive
  return Math.max(0, Math.round((now.getTime() - end) / DAY));
}

export function congressState(c: Congress, now: Date): CongressState {
  const t = now.getTime();
  const start = atUTC(c.start_date);
  const endExclusive = atUTC(c.end_date) + DAY;
  if (t >= start && t < endExclusive) return "live";
  if (t < start) return countdownDays(c, now) <= 30 ? "imminent" : "upcoming";
  return daysSinceEnd(c, now) <= 30 ? "recently_past" : "past";
}

/** Live day N of M (1-indexed), or null when not live. */
export function liveDay(c: Congress, now: Date): { day: number; of: number } | null {
  if (congressState(c, now) !== "live") return null;
  const of = Math.round((atUTC(c.end_date) - atUTC(c.start_date)) / DAY) + 1;
  const day = Math.round((now.getTime() - atUTC(c.start_date)) / DAY) + 1;
  return { day: Math.min(day, of), of };
}

export function relevanceFor(c: Congress, taSlug: string): Relevance | null {
  return c.ta_relevance[taSlug] ?? null;
}

// Sort by start date ascending (config is already sorted, but don't assume).
export function congressesByDate(list: Congress[] = CONGRESSES): Congress[] {
  return [...list].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/** Group for the calendar's state ladder. Order: live, imminent, upcoming, then
 *  recently_past, then past — matching Design's grouping. */
export interface CongressGroup {
  key: "live" | "imminent" | "upcoming" | "recently_past" | "past";
  title: string;
  congresses: Congress[];
}

const GROUP_TITLES: Record<CongressGroup["key"], string> = {
  live: "LIVE NOW",
  imminent: "IMMINENT · ≤30 DAYS",
  upcoming: "UPCOMING",
  recently_past: "RECENTLY PAST",
  past: "EARLIER",
};

export function groupCongresses(now: Date, list: Congress[] = CONGRESSES): CongressGroup[] {
  const byState: Record<CongressGroup["key"], Congress[]> = {
    live: [], imminent: [], upcoming: [], recently_past: [], past: [],
  };
  for (const c of congressesByDate(list)) byState[congressState(c, now)].push(c);
  // recently_past reads newest-first; everything else soonest-first.
  byState.recently_past.reverse();
  byState.past.reverse();
  const order: CongressGroup["key"][] = ["live", "imminent", "upcoming", "recently_past", "past"];
  return order
    .filter((k) => byState[k].length > 0)
    .map((k) => ({ key: k, title: GROUP_TITLES[k], congresses: byState[k] }));
}
