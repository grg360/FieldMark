// The Week — data layer. Layout authority: docs/design/The Week.dc.html
// (project 132e095e). Its own surface; reached from Home's entry line (route
// /me/week). Reports what happened to the user's tracked set, ordered by facts
// we already hold — never by a score.
//
// LAUNCH WINDOW (decided 2026-08-03): NOT "the seven days just closed". The
// surface is honestly a FORTNIGHT of publication activity plus a dated rank
// comparison, and the header says so rather than implying a week. This is the
// launch shape while the weekly incremental cycle accrues; it converts to a
// true weekly window once several Monday batches exist.
//
// HONEST-DATA BINDINGS (enforced here so the component cannot fabricate):
//   • PUBLICATIONS are keyed on publication_authors_v2.linked_at within the last
//     14 days — the honest claim is "a link to someone you track is new", not
//     "the paper is new". The paper may be older; the connection is what changed.
//     A RECENCY FLOOR of pub_year >= 2025 drops catalogue-completion backfill
//     (pre-2025 papers a disambiguation pass happened to attach) — surfacing a
//     2013 paper as this fortnight's news would teach the reader to distrust the
//     feed. The date SHOWN is pub_date; the window is linked_at.
//   • PROMOTION is leading authorship (first OR senior). In a single-TA portfolio
//     "in your therapeutic area" is true of nearly everything, so it does not
//     promote — it is a secondary SORT key and a caption fact. A co-author on a
//     consortium paper demotes to ALSO ON THE RECORD (present, not hidden), per
//     the frame's card 02.
//   • TRIALS detect only a tracked HCP appearing on a NEWLY-CAPTURED trial
//     (clinical_trials_v2.ingested_at in window). A status CHANGE is NOT built —
//     upsert_trials overwrites status with no history (see STATUS_HISTORY_NOTE).
//   • RANK MOVEMENT is the 2026-06-08 snapshot compared against current ranks,
//     rendered explicitly as "since 8 Jun 2026" — the SAME framing Home ships
//     (homeWhatMoved). Movement is the rising_star_percentile (index) delta,
//     risers only; us_rank is shown as current POSITION only because cohort
//     attrition mechanically inflates rank climbs. It is an 8-week comparison,
//     not weekly, and is labelled as such. Converts to weekly once a 2nd snapshot
//     lands.
//   • CONGRESS uses real presentation_start timestamps + confirmed presenters.
//   • SOCIAL never fabricates: it states how many tracked HCPs have a verified
//     account and whether any posted; silence is our coverage, not theirs.
//   • AUTHOR POSITION prefers the stored flags/ordinal (exact OpenAlex-author-id
//     backed; 100% of current links, stored position == byline index 100%). Pure
//     name-matching is the last-resort fallback: it fails to place 2.5% of links
//     but never MISPLACES one, so it can never missort — an unplaceable author
//     renders as a plain "co-author", never a wrong ordinal.
//
// FIRST-APPEARANCE / no-double-surfacing: linked_at is written once when the
// disambiguator attaches a (publication, hcp) pair; the Monday --days 10 overlap
// re-pulls papers at the source but ingest_publications.py skips already-present
// PMIDs (fetch_existing_pubmed_ids), so a pair is linked once and its linked_at
// does not move. A pair therefore surfaces in exactly one fortnight boundary.

import { supabase } from "./supabase";

export const STATUS_HISTORY_NOTE =
  "Trial status change is not detectable: status is overwritten in place with no history.";

export const WINDOW_DAYS = 14;
export const PUB_YEAR_FLOOR = 2025;
export const RANK_SNAPSHOT_DATE = "2026-06-08";

// ── Absence vocabulary — verbatim from the frame (parameterised where it counts
// a real quantity). Rendered rather than omitted when a class has no events. ──
export const ABSENCE = {
  publications: "No publication this fortnight.",
  trials: "No trial changed status.",
  congress: "Between meetings.",
  rank: "One snapshot. History begins at the second.",
  social: (verified: number, total: number) =>
    verified === 0
      ? `None of your ${total} have a verified account.`
      : `${verified} of your ${total} have a verified account. None posted.`,
};

const OPEN_TRIAL_STATUSES = new Set([
  "RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "ENROLLING_BY_INVITATION",
  "NOT_YET_RECRUITING",
]);

export type PositionLabel = "first" | "senior" | "middle" | "co-author";

export interface TrackedPerson {
  hcp_id: string;
  relationship_id: string | null;
  name: string;
  institution: string | null;
  state: string | null;
  us_rank: number | null;
}

export interface PublicationEvent {
  kind: "publication";
  hcp_id: string;
  hcp_name: string;
  date: string | null; // pub_date — when it was published (may be older than the link)
  linked_at: string; // when the connection to a tracked HCP was made (the news)
  publication_id: string;
  title: string;
  journal: string | null;
  pubmed_id: string | null;
  pub_year: number | null;
  total_authors: number | null;
  position: PositionLabel;
  position_ordinal: number | null;
  in_therapeutic_area: boolean;
  promoted: boolean; // leading author → hero; else → ALSO ON THE RECORD
}

export interface TrialEvent {
  kind: "trial";
  hcp_id: string;
  hcp_name: string;
  date: string | null;
  trial_id: string;
  nct_id: string | null;
  title: string;
  status: string | null; // CURRENT status — an appearance, never a change
  role: string | null;
  promoted: boolean;
}

export interface CongressPresenter {
  hcp_id: string;
  hcp_name: string;
  session_type: string | null;
  presentation_title: string | null;
  presentation_start: string | null;
}

export interface CongressEvent {
  kind: "congress";
  congress_slug: string;
  congress_label: string;
  window_start: string | null;
  window_end: string | null;
  presenter_count: number;
  abstract_count: number;
  presenters: CongressPresenter[];
}

// Rank movement, dated against the 8-Jun snapshot (Home-consistent, index-based).
export interface RankMover {
  hcp_id: string;
  name: string;
  now_rank: number; // current us_rank — POSITION only, never a rank delta
  idx_now: number; // current rising_star_percentile
  idx_was: number; // 8-Jun rising_star_percentile
  idx_delta: number; // idx_now - idx_was (> 0, risers only)
}

export interface OpenFollowUpRef {
  body: string;
  due_at: string | null;
}

export type WeekState = "quiet" | "normal" | "busy";

export interface TheWeek {
  state: WeekState;
  window_start: string; // ISO date — 14 days before the anchor
  window_end: string; // ISO date — the anchor (today)
  window_label: string; // e.g. "20 JUL – 3 AUG 2026"
  tracked_total: number;

  publications: PublicationEvent[]; // promoted (leading author), ordered by the frame rule
  trials: TrialEvent[];
  congress: CongressEvent[];
  demoted: (PublicationEvent | TrialEvent)[]; // ALSO ON THE RECORD

  rank_movement: {
    snapshot_date: string; // "2026-06-08"
    movers: RankMover[];
  };

  social: { verified_accounts: number; posts_in_window: number };

  coverage: {
    publications_thru: string | null;
    trials_refreshed: string | null;
    congress_abstracts_in_window: number;
    verified_accounts: number;
    rank_snapshots: number;
  };

  portfolio: {
    tracked: number;
    on_open_trial: number;
    verified_account: number;
    open_follow_ups: number;
  };

  open_follow_ups: Record<string, OpenFollowUpRef>;
  last_event: PublicationEvent | TrialEvent | null; // most recent BEFORE the window (quiet fallback)
}

// ── date helpers ──
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function labelRange(start: Date, end: Date): string {
  const y = end.getUTCFullYear();
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === y)
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${MON[end.getUTCMonth()]} ${y}`;
  return `${start.getUTCDate()} ${MON[start.getUTCMonth()]} – ${end.getUTCDate()} ${MON[end.getUTCMonth()]} ${y}`;
}

function positionOf(row: {
  is_first_author: boolean | null;
  is_senior_author: boolean | null;
  author_position: number | null;
  total_authors: number | null;
}): PositionLabel {
  if (row.is_first_author) return "first";
  if (row.is_senior_author) return "senior";
  if (row.author_position != null) {
    if (row.total_authors != null && row.author_position === row.total_authors) return "senior";
    if (row.author_position === 1) return "first";
    return "middle";
  }
  return "co-author";
}

const POS_RANK: Record<PositionLabel, number> = { first: 0, senior: 1, middle: 2, "co-author": 3 };
const congressLabel = (slug: string) => slug.replace(/-/g, " ").toUpperCase();

/**
 * Load The Week for a user. `anchor` defaults to now. The window is the trailing
 * WINDOW_DAYS (a fortnight) keyed on linked_at for publications; the rank block is
 * an explicitly-dated comparison against RANK_SNAPSHOT_DATE.
 */
export async function loadTheWeek(
  userId: string,
  trackedPeople: TrackedPerson[],
  anchor: Date = new Date(),
  userTaId?: string,
): Promise<TheWeek> {
  const windowEnd = anchor;
  const windowStart = addDays(anchor, -WINDOW_DAYS);
  const startISO = windowStart.toISOString();
  const endISO = windowEnd.toISOString();
  const label = labelRange(windowStart, windowEnd);

  const hcpIds = trackedPeople.map((p) => p.hcp_id);
  const byId = new Map(trackedPeople.map((p) => [p.hcp_id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown";

  if (hcpIds.length === 0) return emptyWeek(windowStart, windowEnd, label, 0);

  const [
    pubRes,
    trialRes,
    congRes,
    dolRes,
    followRes,
    lastPubRes,
    covPubRes,
    covTrialRes,
    covCongRes,
    rankSnapRes,
    rankCurRes,
    openTrialRes,
  ] = await Promise.all([
    // publications: NEW LINKS in the fortnight (linked_at), recency-floored on pub_year
    supabase
      .from("publication_authors_v2")
      .select(
        "hcp_id, publication_id, author_position, is_first_author, is_senior_author, total_authors, linked_at, " +
          "publications_v2!inner(id, title, journal, pub_date, pub_year, pubmed_id)",
      )
      .in("hcp_id", hcpIds)
      .gte("linked_at", startISO)
      .lt("linked_at", endISO)
      .gte("publications_v2.pub_year", PUB_YEAR_FLOOR),
    // newly-captured trials with a tracked investigator (NO status-change detection)
    supabase
      .from("trial_investigators_v2")
      .select("hcp_id, trial_id, role, clinical_trials_v2!inner(id, nct_id, title, status, start_date, ingested_at)")
      .in("hcp_id", hcpIds)
      .gte("clinical_trials_v2.ingested_at", startISO)
      .lt("clinical_trials_v2.ingested_at", endISO),
    // confirmed presenters with a presentation in-window
    supabase
      .from("congress_confirmed_presenters")
      .select("hcp_id, congress_slug, speaker_key, congress_abstracts!inner(session_type, presentation_title, presentation_start)")
      .in("hcp_id", hcpIds)
      .gte("congress_abstracts.presentation_start", startISO)
      .lt("congress_abstracts.presentation_start", endISO),
    // social — verified accounts among tracked
    supabase.from("dol_matches_v2").select("hcp_id").eq("verified_by_human", true).in("hcp_id", hcpIds),
    // open follow-ups for the tracked relationships
    supabase
      .from("msl_hcp_next_actions")
      .select("body, due_at, msl_hcp_relationships!inner(hcp_id, user_id)")
      .eq("user_id", userId)
      .is("completed_at", null)
      .is("deleted_at", null),
    // last publication link before the window (quiet fallback)
    supabase
      .from("publication_authors_v2")
      .select(
        "hcp_id, publication_id, author_position, is_first_author, is_senior_author, total_authors, linked_at, " +
          "publications_v2!inner(id, title, journal, pub_date, pub_year, pubmed_id)",
      )
      .in("hcp_id", hcpIds)
      .lt("linked_at", startISO)
      .gte("publications_v2.pub_year", PUB_YEAR_FLOOR)
      .order("linked_at", { ascending: false })
      .limit(1),
    // coverage: newest publication ingest overall
    supabase.from("publications_v2").select("ingested_at").order("ingested_at", { ascending: false }).limit(1),
    // coverage: newest trial refresh overall
    supabase.from("clinical_trials_v2").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    // coverage: abstracts within the window (whole corpus)
    supabase
      .from("congress_abstracts")
      .select("abstract_number", { count: "exact", head: true })
      .gte("presentation_start", startISO)
      .lt("presentation_start", endISO),
    // rank: 8-Jun snapshot for tracked
    supabase
      .from("hcp_rising_star_snapshots")
      .select("hcp_id, us_rank, rising_star_percentile")
      .eq("snapshot_date", RANK_SNAPSHOT_DATE)
      .in("hcp_id", hcpIds)
      .not("us_rank", "is", null),
    // rank: current ranks for tracked
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, rising_star_percentile")
      .in("hcp_id", hcpIds)
      .not("us_rank", "is", null),
    // portfolio: tracked HCPs currently on an open trial
    supabase.from("trial_investigators_v2").select("hcp_id, clinical_trials_v2!inner(status)").in("hcp_id", hcpIds),
  ]);

  // ── publications: dedupe (pub,hcp), classify ──
  type PubJoin = {
    hcp_id: string;
    publication_id: string;
    author_position: number | null;
    is_first_author: boolean | null;
    is_senior_author: boolean | null;
    total_authors: number | null;
    linked_at: string;
    publications_v2: {
      id: string;
      title: string | null;
      journal: string | null;
      pub_date: string | null;
      pub_year: number | null;
      pubmed_id: string | null;
    };
  };
  const pubRowsRaw = (pubRes.data ?? []) as unknown as PubJoin[];
  const seenPair = new Set<string>();
  const pubRows = pubRowsRaw.filter((r) => {
    const k = `${r.publication_id} ${r.hcp_id}`;
    if (seenPair.has(k)) return false;
    seenPair.add(k);
    return true;
  });
  const pubIds = Array.from(new Set(pubRows.map((r) => r.publication_id)));

  const inTa = new Set<string>();
  if (userTaId && pubIds.length) {
    const { data: taData } = await supabase
      .from("publication_therapeutic_areas_v2")
      .select("publication_id")
      .eq("therapeutic_area_id", userTaId)
      .in("publication_id", pubIds);
    for (const r of taData ?? []) inTa.add((r as { publication_id: string }).publication_id);
  }

  const pubEvents: PublicationEvent[] = pubRows.map((r) => {
    const pos = positionOf(r);
    const inArea = inTa.has(r.publication_id);
    return {
      kind: "publication",
      hcp_id: r.hcp_id,
      hcp_name: nameOf(r.hcp_id),
      date: r.publications_v2.pub_date,
      linked_at: r.linked_at,
      publication_id: r.publication_id,
      title: r.publications_v2.title ?? "Untitled",
      journal: r.publications_v2.journal,
      pubmed_id: r.publications_v2.pubmed_id,
      pub_year: r.publications_v2.pub_year,
      total_authors: r.total_authors,
      position: pos,
      position_ordinal: r.author_position,
      in_therapeutic_area: inArea,
      // Leading authorship promotes to a hero card; in-TA is a sort key, not a
      // promoter (it is true of nearly every paper in a single-TA portfolio).
      promoted: pos === "first" || pos === "senior",
    };
  });

  // ── trials ──
  type TrialJoin = {
    hcp_id: string;
    trial_id: string;
    role: string | null;
    clinical_trials_v2: {
      id: string;
      nct_id: string | null;
      title: string | null;
      status: string | null;
      start_date: string | null;
      ingested_at: string;
    };
  };
  const trialRows = (trialRes.data ?? []) as unknown as TrialJoin[];
  const trialEvents: TrialEvent[] = trialRows.map((r) => ({
    kind: "trial",
    hcp_id: r.hcp_id,
    hcp_name: nameOf(r.hcp_id),
    date: r.clinical_trials_v2.start_date,
    trial_id: r.trial_id,
    nct_id: r.clinical_trials_v2.nct_id,
    title: r.clinical_trials_v2.title ?? "Untitled trial",
    status: r.clinical_trials_v2.status,
    role: r.role,
    promoted: /principal|lead|sponsor|chair/i.test(r.role ?? ""),
  }));

  // ── congress ──
  type CongJoin = {
    hcp_id: string;
    congress_slug: string;
    congress_abstracts: { session_type: string | null; presentation_title: string | null; presentation_start: string | null };
  };
  const congRows = (congRes.data ?? []) as unknown as CongJoin[];
  const congMap = new Map<string, CongressEvent>();
  for (const r of congRows) {
    let ev = congMap.get(r.congress_slug);
    if (!ev) {
      ev = {
        kind: "congress",
        congress_slug: r.congress_slug,
        congress_label: congressLabel(r.congress_slug),
        window_start: r.congress_abstracts.presentation_start,
        window_end: r.congress_abstracts.presentation_start,
        presenter_count: 0,
        abstract_count: 0,
        presenters: [],
      };
      congMap.set(r.congress_slug, ev);
    }
    ev.abstract_count += 1;
    ev.presenters.push({
      hcp_id: r.hcp_id,
      hcp_name: nameOf(r.hcp_id),
      session_type: r.congress_abstracts.session_type,
      presentation_title: r.congress_abstracts.presentation_title,
      presentation_start: r.congress_abstracts.presentation_start,
    });
    const t = r.congress_abstracts.presentation_start;
    if (t) {
      if (!ev.window_start || t < ev.window_start) ev.window_start = t;
      if (!ev.window_end || t > ev.window_end) ev.window_end = t;
    }
  }
  for (const ev of congMap.values()) ev.presenter_count = new Set(ev.presenters.map((p) => p.hcp_id)).size;
  const congress = Array.from(congMap.values());

  // ── promoted / demoted + frame ordering ──
  const promotedPubs = pubEvents.filter((e) => e.promoted);
  const promotedTrials = trialEvents.filter((e) => e.promoted);
  const demoted: (PublicationEvent | TrialEvent)[] = [
    ...pubEvents.filter((e) => !e.promoted),
    ...trialEvents.filter((e) => !e.promoted),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // ORDERING (frame): author position, then therapeutic area, then date.
  promotedPubs.sort(
    (a, b) =>
      POS_RANK[a.position] - POS_RANK[b.position] ||
      Number(b.in_therapeutic_area) - Number(a.in_therapeutic_area) ||
      (b.date ?? "").localeCompare(a.date ?? ""),
  );
  promotedTrials.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // ── rank movement (index risers, dated 8-Jun) ──
  type RankRow = { hcp_id: string; us_rank: number; rising_star_percentile: number | null };
  const snapById = new Map(
    ((rankSnapRes.data ?? []) as RankRow[]).map((r) => [r.hcp_id, r]),
  );
  const curBest = new Map<string, RankRow>();
  for (const r of (rankCurRes.data ?? []) as RankRow[]) {
    const cur = curBest.get(r.hcp_id);
    if (!cur || r.us_rank < cur.us_rank) curBest.set(r.hcp_id, r);
  }
  const movers: RankMover[] = [];
  for (const [hcpId, cur] of curBest) {
    const snap = snapById.get(hcpId);
    if (!snap || cur.rising_star_percentile == null || snap.rising_star_percentile == null) continue;
    const delta = cur.rising_star_percentile - snap.rising_star_percentile;
    if (delta > 0) {
      movers.push({
        hcp_id: hcpId,
        name: nameOf(hcpId),
        now_rank: cur.us_rank,
        idx_now: cur.rising_star_percentile,
        idx_was: snap.rising_star_percentile,
        idx_delta: delta,
      });
    }
  }
  movers.sort((a, b) => b.idx_delta - a.idx_delta || a.now_rank - b.now_rank);

  // ── social ──
  const verifiedAccounts = new Set((dolRes.data ?? []).map((r) => (r as { hcp_id: string }).hcp_id)).size;
  const postsInWindow = 0;

  // ── open follow-ups ──
  type FollowJoin = { body: string; due_at: string | null; msl_hcp_relationships: { hcp_id: string } };
  const openFollowUps: Record<string, OpenFollowUpRef> = {};
  for (const r of (followRes.data ?? []) as unknown as FollowJoin[]) {
    const hid = r.msl_hcp_relationships?.hcp_id;
    if (!hid) continue;
    const existing = openFollowUps[hid];
    if (!existing || (r.due_at ?? "9999") < (existing.due_at ?? "9999")) {
      openFollowUps[hid] = { body: r.body, due_at: r.due_at };
    }
  }

  // ── last event before the window (quiet fallback) ──
  const lastRows = (lastPubRes.data ?? []) as unknown as PubJoin[];
  let lastEvent: PublicationEvent | TrialEvent | null = null;
  if (lastRows.length) {
    const r = lastRows[0];
    lastEvent = {
      kind: "publication",
      hcp_id: r.hcp_id,
      hcp_name: nameOf(r.hcp_id),
      date: r.publications_v2.pub_date,
      linked_at: r.linked_at,
      publication_id: r.publication_id,
      title: r.publications_v2.title ?? "Untitled",
      journal: r.publications_v2.journal,
      pubmed_id: r.publications_v2.pubmed_id,
      pub_year: r.publications_v2.pub_year,
      total_authors: r.total_authors,
      position: positionOf(r),
      position_ordinal: r.author_position,
      in_therapeutic_area: false,
      promoted: true,
    };
  }

  // ── coverage + portfolio ──
  const covPubThru = (covPubRes.data?.[0] as { ingested_at: string } | undefined)?.ingested_at ?? null;
  const covTrialThru = (covTrialRes.data?.[0] as { updated_at: string } | undefined)?.updated_at ?? null;
  const abstractsInWindow = covCongRes.count ?? 0;
  const rankSnapshots = 1; // one snapshot exists (8-Jun); the block dates against it

  const onOpenTrial = new Set(
    ((openTrialRes.data ?? []) as unknown as { hcp_id: string; clinical_trials_v2: { status: string | null } }[])
      .filter((r) => OPEN_TRIAL_STATUSES.has(r.clinical_trials_v2?.status ?? ""))
      .map((r) => r.hcp_id),
  ).size;
  const openFollowUpCount = Object.keys(openFollowUps).length;

  // ── state — rank movement is real content, so a fortnight with movers is never "quiet" ──
  const hasEvents = promotedPubs.length + promotedTrials.length + demoted.length + movers.length > 0;
  const state: WeekState = congress.length > 0 ? "busy" : hasEvents ? "normal" : "quiet";

  return {
    state,
    window_start: isoDate(windowStart),
    window_end: isoDate(windowEnd),
    window_label: label,
    tracked_total: hcpIds.length,
    publications: promotedPubs,
    trials: promotedTrials,
    congress,
    demoted,
    rank_movement: { snapshot_date: RANK_SNAPSHOT_DATE, movers },
    social: { verified_accounts: verifiedAccounts, posts_in_window: postsInWindow },
    coverage: {
      publications_thru: covPubThru,
      trials_refreshed: covTrialThru,
      congress_abstracts_in_window: abstractsInWindow,
      verified_accounts: verifiedAccounts,
      rank_snapshots: rankSnapshots,
    },
    portfolio: {
      tracked: hcpIds.length,
      on_open_trial: onOpenTrial,
      verified_account: verifiedAccounts,
      open_follow_ups: openFollowUpCount,
    },
    open_follow_ups: openFollowUps,
    last_event: lastEvent,
  };
}

function emptyWeek(windowStart: Date, windowEnd: Date, label: string, tracked: number): TheWeek {
  return {
    state: "quiet",
    window_start: isoDate(windowStart),
    window_end: isoDate(windowEnd),
    window_label: label,
    tracked_total: tracked,
    publications: [],
    trials: [],
    congress: [],
    demoted: [],
    rank_movement: { snapshot_date: RANK_SNAPSHOT_DATE, movers: [] },
    social: { verified_accounts: 0, posts_in_window: 0 },
    coverage: {
      publications_thru: null,
      trials_refreshed: null,
      congress_abstracts_in_window: 0,
      verified_accounts: 0,
      rank_snapshots: 1,
    },
    portfolio: { tracked, on_open_trial: 0, verified_account: 0, open_follow_ups: 0 },
    open_follow_ups: {},
    last_event: null,
  };
}

export interface WeekTeaser {
  count: number; // leading-author publication events + rank movers
  pub_count: number;
  mover_count: number;
  window_label: string;
  first_line: string | null;
}

/**
 * Compact summary for Home's single entry line: the fortnight's leading-author
 * publication events + dated rank movers, and the first event. Same window and
 * recency floor as loadTheWeek — Home stays light.
 */
export async function loadTheWeekTeaser(hcpIds: string[]): Promise<WeekTeaser> {
  const end = new Date();
  const start = addDays(end, -WINDOW_DAYS);
  const label = labelRange(start, end);
  const base: WeekTeaser = { count: 0, pub_count: 0, mover_count: 0, window_label: label, first_line: null };
  if (hcpIds.length === 0) return base;

  const [pubRes, snapRes, curRes] = await Promise.all([
    supabase
      .from("publication_authors_v2")
      .select("hcp_id, publication_id, is_first_author, is_senior_author, hcps_v2!inner(first_name, last_name), publications_v2!inner(pub_year)")
      .in("hcp_id", hcpIds)
      .gte("linked_at", start.toISOString())
      .lt("linked_at", end.toISOString())
      .gte("publications_v2.pub_year", PUB_YEAR_FLOOR)
      .or("is_first_author.eq.true,is_senior_author.eq.true"),
    supabase
      .from("hcp_rising_star_snapshots")
      .select("hcp_id, rising_star_percentile")
      .eq("snapshot_date", RANK_SNAPSHOT_DATE)
      .in("hcp_id", hcpIds)
      .not("us_rank", "is", null),
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, rising_star_percentile")
      .in("hcp_id", hcpIds)
      .not("us_rank", "is", null),
  ]);

  type Row = {
    hcp_id: string;
    publication_id: string;
    is_first_author: boolean | null;
    is_senior_author: boolean | null;
    hcps_v2: { first_name: string | null; last_name: string | null };
  };
  const rows = (pubRes.data ?? []) as unknown as Row[];
  const pairs = new Set(rows.map((r) => `${r.publication_id} ${r.hcp_id}`));
  base.pub_count = pairs.size;

  // rank risers (index up since 8-Jun)
  const snapBy = new Map(((snapRes.data ?? []) as { hcp_id: string; rising_star_percentile: number | null }[]).map((r) => [r.hcp_id, r.rising_star_percentile]));
  const bestCur = new Map<string, number>();
  for (const r of (curRes.data ?? []) as { hcp_id: string; rising_star_percentile: number | null }[]) {
    if (r.rising_star_percentile == null) continue;
    const c = bestCur.get(r.hcp_id);
    if (c == null || r.rising_star_percentile > c) bestCur.set(r.hcp_id, r.rising_star_percentile);
  }
  let movers = 0;
  for (const [hid, now] of bestCur) {
    const was = snapBy.get(hid);
    if (was != null && now - was > 0) movers++;
  }
  base.mover_count = movers;
  base.count = base.pub_count + movers;

  const lead = rows.find((r) => r.is_first_author) ?? rows.find((r) => r.is_senior_author) ?? rows[0];
  if (lead) {
    const last = lead.hcps_v2.last_name ?? "";
    const fi = (lead.hcps_v2.first_name ?? "").charAt(0);
    const pos = lead.is_first_author ? "first author" : lead.is_senior_author ? "senior author" : "co-author";
    base.first_line = `${last}, ${fi}. — ${pos}`;
  }
  return base;
}

// ── small formatting helpers shared with the component ──
export function positionPhrase(e: PublicationEvent): string {
  switch (e.position) {
    case "first":
      return "first author";
    case "senior":
      return "senior author";
    case "middle":
      return e.position_ordinal != null && e.total_authors != null
        ? `author ${e.position_ordinal} of ${e.total_authors}`
        : "co-author";
    default:
      return "co-author";
  }
}
