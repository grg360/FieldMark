import { supabase } from "./supabase";
import { updateNextAction, type Priority } from "./relationships";

// Therapeutic area UUID lookup. Keys are strings stored in msl_profiles.therapeutic_areas.
// Migrate to a UUID column on msl_profiles when team features ship.
const TA_SLUG_TO_UUID: Record<string, string> = {
  NSCLC: "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
};

// Cached TA hierarchy (id, slug, parent_ta_id) — a tiny table. Used only by the
// first-run fallback below to resolve parent slugs to their indication TA ids.
let taHierarchyCache: Promise<Array<{ id: string; slug: string; parent_ta_id: string | null }>> | null = null;

async function getTaHierarchy(): Promise<Array<{ id: string; slug: string; parent_ta_id: string | null }>> {
  if (!taHierarchyCache) {
    taHierarchyCache = (async () => {
      const { data, error } = await supabase
        .from("therapeutic_areas")
        .select("id, slug, parent_ta_id");
      if (error) {
        taHierarchyCache = null;
        return [];
      }
      return (data ?? []) as Array<{ id: string; slug: string; parent_ta_id: string | null }>;
    })();
  }
  return taHierarchyCache;
}

// Resolve entitlement parent slugs (allowed_ta_slugs, e.g. ["oncology"]) to the
// TA ids the rank/cohort tables are keyed by — the parent's OWN id AND its
// children's (rising-star ranks live on indication-level TAs like NSCLC, whose
// parent is oncology). First-run fallback only.
async function taUuidsForParentSlugs(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const rows = await getTaHierarchy();
  const wanted = new Set(slugs.map((s) => s.toLowerCase()));
  const parentIds = new Set(rows.filter((r) => wanted.has(r.slug)).map((r) => r.id));
  const ids = new Set<string>();
  for (const r of rows) {
    if (wanted.has(r.slug)) ids.add(r.id); // the entitled TA itself
    if (r.parent_ta_id && parentIds.has(r.parent_ta_id)) ids.add(r.id); // its indications
  }
  return [...ids];
}

export interface HcpRef {
  hcp_id: string;
  name: string;
  institution: string | null;
}

export interface NextActionWithHcp {
  id: string;
  body: string;
  due_at: string | null;
  priority: Priority;
  overdue: boolean;
  created_at: string;
  hcp: HcpRef;
}

export interface OpenFollowUpStats {
  total: number;
  overdue: number;
  due_this_week: number;
  future: number;
  no_due_date: number;
}

export interface InsightWithHcp {
  id: string;
  body: string;
  interaction_type: string;
  insight_strength: string;
  occurred_at: string;
  hcp: HcpRef;
}

export interface BriefRef {
  id: string;
  hcp_id: string;
  generated_at: string;
  expires_at: string;
  ai_status: string;
  has_relationship: boolean;
  hcp_name: string;
}

export type ActivityEventType =
  | "insight_added"
  | "follow_up_completed"
  | "follow_up_created"
  | "brief_generated"
  | "status_changed";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  hcp: HcpRef;
  label: string;
}

export interface HomeSummaryCounts {
  overdue_followups: number;
  open_followups: number;
  watched_hcps: number;
}

export interface CoverageGapHcp {
  hcp_id: string;
  name: string;
  institution: string | null;
  state: string | null;
  us_rank: number;
  archetype: string | null;
}

export interface TrackedHcpChip {
  hcp_id: string;
  name: string;
  cohort: "rising_star" | "established" | "community" | null;
  cohort_rank: number | null;
}

export interface TerritoryCoverageStats {
  total_rising_stars_in_territory: number;
  tracked_count: number;
  coverage_percentage: number;
  territory_label: string | null;
}

export interface TerritoryProfile {
  territory_label: string | null;
  territory_states: string[];
  therapeutic_areas: string[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

function compareNextActions(
  a: { due_at: string | null; priority: Priority; created_at: string },
  b: typeof a,
): number {
  const now = Date.now();
  const aOverdue = a.due_at && new Date(a.due_at).getTime() < now ? 0 : 1;
  const bOverdue = b.due_at && new Date(b.due_at).getTime() < now ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;

  const aPrio = PRIORITY_RANK[a.priority] ?? 1;
  const bPrio = PRIORITY_RANK[b.priority] ?? 1;
  if (aPrio !== bPrio) return aPrio - bPrio;

  const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export async function getNextActionsForUser(
  userId: string,
  limit: number = 3,
): Promise<NextActionWithHcp[]> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .select(`
          id,
          body,
          due_at,
          priority,
          created_at,
          msl_hcp_relationships!inner(
            hcp_id,
            hcps_v2!inner(first_name, last_name, institution_canonical, institution_normalized)
          )
        `)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("completed_at", null);

    if (error) {
      console.warn("getNextActionsForUser: supabase error", error);
      throw error;
    }

    const now = Date.now();
    const rows = (data ?? []) as Array<{
      id: string;
      body: string;
      due_at: string | null;
      priority: Priority;
      created_at: string;
      msl_hcp_relationships:
        | {
            hcp_id: string;
            hcps_v2:
              | {
                  first_name: string | null;
                  last_name: string | null;
                  institution_canonical: string | null;
                  institution_normalized: string | null;
                }
              | Array<{
                  first_name: string | null;
                  last_name: string | null;
                  institution_canonical: string | null;
                  institution_normalized: string | null;
                }>;
          }
        | Array<{
            hcp_id: string;
            hcps_v2: unknown;
          }>;
    }>;

    const enriched = rows.map((row) => {
      const rel = Array.isArray(row.msl_hcp_relationships)
        ? row.msl_hcp_relationships[0]
        : row.msl_hcp_relationships;
      const hcpRow = Array.isArray(rel?.hcps_v2) ? rel.hcps_v2[0] : rel?.hcps_v2;
      const name = `${hcpRow?.first_name ?? ""} ${hcpRow?.last_name ?? ""}`.trim() || "Unknown";
      const institution = hcpRow?.institution_canonical ?? hcpRow?.institution_normalized ?? null;
      const dueAt = row.due_at;
      const overdue = dueAt !== null && new Date(dueAt).getTime() < now;
      return {
        id: row.id,
        body: row.body,
        due_at: dueAt,
        priority: row.priority,
        overdue,
        created_at: row.created_at,
        hcp: {
          hcp_id: rel?.hcp_id ?? "",
          name,
          institution,
        },
      };
    });

    enriched.sort((a, b) => compareNextActions(a, b));
    return enriched.slice(0, limit);
  } catch (err) {
    console.warn("getNextActionsForUser: error", err);
    throw err;
  }
}

export async function getOverdueFollowUpsForUser(
  userId: string,
  limit: number = 10,
): Promise<NextActionWithHcp[]> {
  const all = await getNextActionsForUser(userId, 1000);
  return all.filter((item) => item.overdue).slice(0, limit);
}

export async function getOpenFollowUpStats(userId: string): Promise<OpenFollowUpStats> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .select("due_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("completed_at", null);

    if (error) {
      console.warn("getOpenFollowUpStats: supabase error", error);
      throw error;
    }

    const now = Date.now();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
    let overdue = 0;
    let dueThisWeek = 0;
    let future = 0;
    let noDueDate = 0;

    for (const row of data ?? []) {
      const dueAt = (row as { due_at: string | null }).due_at;
      if (dueAt === null) {
        noDueDate += 1;
        continue;
      }
      const ts = new Date(dueAt).getTime();
      if (ts < now) overdue += 1;
      else if (ts < weekFromNow) dueThisWeek += 1;
      else future += 1;
    }

    return {
      total: overdue + dueThisWeek + future + noDueDate,
      overdue,
      due_this_week: dueThisWeek,
      future,
      no_due_date: noDueDate,
    };
  } catch (err) {
    console.warn("getOpenFollowUpStats: error", err);
    throw err;
  }
}

export async function getRecentInsightsForUser(
  userId: string,
  limit: number = 5,
): Promise<InsightWithHcp[]> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_notes")
      .select(`
          id,
          body,
          interaction_type,
          insight_strength,
          occurred_at,
          msl_hcp_relationships!inner(
            hcp_id,
            hcps_v2!inner(first_name, last_name, institution_canonical, institution_normalized)
          )
        `)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("getRecentInsightsForUser: supabase error", error);
      throw error;
    }

    return (data ?? []).map((row: {
      id: string;
      body: string;
      interaction_type: string;
      insight_strength: string;
      occurred_at: string;
      msl_hcp_relationships: unknown;
    }) => {
      const rel = Array.isArray(row.msl_hcp_relationships)
        ? row.msl_hcp_relationships[0]
        : row.msl_hcp_relationships;
      const relObj = rel as {
        hcp_id?: string;
        hcps_v2?:
          | {
              first_name: string | null;
              last_name: string | null;
              institution_canonical: string | null;
              institution_normalized: string | null;
            }
          | Array<{
              first_name: string | null;
              last_name: string | null;
              institution_canonical: string | null;
              institution_normalized: string | null;
            }>;
      };
      const hcpRow = Array.isArray(relObj?.hcps_v2) ? relObj.hcps_v2[0] : relObj?.hcps_v2;
      const name = `${hcpRow?.first_name ?? ""} ${hcpRow?.last_name ?? ""}`.trim() || "Unknown";
      const institution = hcpRow?.institution_canonical ?? hcpRow?.institution_normalized ?? null;
      return {
        id: row.id,
        body: row.body,
        interaction_type: row.interaction_type,
        insight_strength: row.insight_strength,
        occurred_at: row.occurred_at,
        hcp: { hcp_id: relObj?.hcp_id ?? "", name, institution },
      };
    });
  } catch (err) {
    console.warn("getRecentInsightsForUser: error", err);
    throw err;
  }
}

export async function getRecentBriefsForUser(
  userId: string,
  limit: number = 5,
): Promise<BriefRef[]> {
  try {
    const { data, error } = await supabase
      .from("msl_hcp_briefs")
      .select("id, hcp_id, generated_at, expires_at, ai_status, has_relationship, content")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("getRecentBriefsForUser: supabase error", error);
      throw error;
    }

    return (data ?? []).map((row: {
      id: string;
      hcp_id: string;
      generated_at: string;
      expires_at: string;
      ai_status: string;
      has_relationship: boolean;
      content?: { hcp?: { name?: string } };
    }) => ({
      id: row.id,
      hcp_id: row.hcp_id,
      generated_at: row.generated_at,
      expires_at: row.expires_at,
      ai_status: row.ai_status,
      has_relationship: row.has_relationship,
      hcp_name: row.content?.hcp?.name ?? "Unknown HCP",
    }));
  } catch (err) {
    console.warn("getRecentBriefsForUser: error", err);
    throw err;
  }
}

export async function getRecentActivityForUser(
  userId: string,
  limit: number = 10,
): Promise<ActivityEvent[]> {
  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [insightsResult, followUpsResult, briefsResult] = await Promise.all([
      supabase
        .from("msl_hcp_notes")
        .select(`
            id, body, occurred_at,
            msl_hcp_relationships!inner(hcp_id, hcps_v2!inner(first_name, last_name, institution_canonical, institution_normalized))
          `)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(limit),
      supabase
        .from("msl_hcp_next_actions")
        .select(`
            id, body, completed_at, created_at,
            msl_hcp_relationships!inner(hcp_id, hcps_v2!inner(first_name, last_name, institution_canonical, institution_normalized))
          `)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .not("completed_at", "is", null)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false })
        .limit(limit),
      supabase
        .from("msl_hcp_briefs")
        .select("id, hcp_id, generated_at, content")
        .eq("user_id", userId)
        .gte("generated_at", since)
        .order("generated_at", { ascending: false })
        .limit(limit),
    ]);

    const events: ActivityEvent[] = [];

    if (!insightsResult.error) {
      for (const row of insightsResult.data ?? []) {
        const r = row as {
          id: string;
          occurred_at: string;
          msl_hcp_relationships: unknown;
        };
        const rel = Array.isArray(r.msl_hcp_relationships)
          ? r.msl_hcp_relationships[0]
          : r.msl_hcp_relationships;
        const relObj = rel as {
          hcp_id?: string;
          hcps_v2?:
            | {
                first_name: string | null;
                last_name: string | null;
                institution_canonical: string | null;
                institution_normalized: string | null;
              }
            | Array<{
                first_name: string | null;
                last_name: string | null;
                institution_canonical: string | null;
                institution_normalized: string | null;
              }>;
        };
        const hcpRow = Array.isArray(relObj?.hcps_v2) ? relObj.hcps_v2[0] : relObj?.hcps_v2;
        const name = `${hcpRow?.first_name ?? ""} ${hcpRow?.last_name ?? ""}`.trim() || "Unknown";
        events.push({
          id: `insight-${r.id}`,
          type: "insight_added",
          timestamp: r.occurred_at,
          hcp: {
            hcp_id: relObj?.hcp_id ?? "",
            name,
            institution: hcpRow?.institution_canonical ?? hcpRow?.institution_normalized ?? null,
          },
          label: `Added insight on ${name}`,
        });
      }
    }

    if (!followUpsResult.error) {
      for (const row of followUpsResult.data ?? []) {
        const r = row as {
          id: string;
          completed_at: string;
          msl_hcp_relationships: unknown;
        };
        const rel = Array.isArray(r.msl_hcp_relationships)
          ? r.msl_hcp_relationships[0]
          : r.msl_hcp_relationships;
        const relObj = rel as {
          hcp_id?: string;
          hcps_v2?:
            | {
                first_name: string | null;
                last_name: string | null;
                institution_canonical: string | null;
                institution_normalized: string | null;
              }
            | Array<{
                first_name: string | null;
                last_name: string | null;
                institution_canonical: string | null;
                institution_normalized: string | null;
              }>;
        };
        const hcpRow = Array.isArray(relObj?.hcps_v2) ? relObj.hcps_v2[0] : relObj?.hcps_v2;
        const name = `${hcpRow?.first_name ?? ""} ${hcpRow?.last_name ?? ""}`.trim() || "Unknown";
        events.push({
          id: `followup-${r.id}`,
          type: "follow_up_completed",
          timestamp: r.completed_at,
          hcp: {
            hcp_id: relObj?.hcp_id ?? "",
            name,
            institution: hcpRow?.institution_canonical ?? hcpRow?.institution_normalized ?? null,
          },
          label: `Completed follow-up for ${name}`,
        });
      }
    }

    if (!briefsResult.error) {
      for (const row of briefsResult.data ?? []) {
        const r = row as {
          id: string;
          hcp_id: string;
          generated_at: string;
          content?: { hcp?: { name?: string; institution?: string | null } };
        };
        const hcpName = r.content?.hcp?.name ?? "Unknown HCP";
        events.push({
          id: `brief-${r.id}`,
          type: "brief_generated",
          timestamp: r.generated_at,
          hcp: {
            hcp_id: r.hcp_id,
            name: hcpName,
            institution: r.content?.hcp?.institution ?? null,
          },
          label: `Generated brief for ${hcpName}`,
        });
      }
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, limit);
  } catch (err) {
    console.warn("getRecentActivityForUser: error", err);
    throw err;
  }
}

export async function getHomeSummaryCounts(userId: string): Promise<HomeSummaryCounts> {
  try {
    const stats = await getOpenFollowUpStats(userId);

    const { count: watchedCount, error: watchedError } = await supabase
      .from("msl_watchlist_items")
      .select("relationship_id, msl_hcp_relationships!inner(user_id)", { count: "exact", head: true })
      .eq("msl_hcp_relationships.user_id", userId);

    if (watchedError) {
      console.warn("getHomeSummaryCounts: watched count error", watchedError);
    }

    return {
      overdue_followups: stats.overdue,
      open_followups: stats.total,
      watched_hcps: watchedCount ?? 0,
    };
  } catch (err) {
    console.warn("getHomeSummaryCounts: error", err);
    throw err;
  }
}

export async function recordTeamInviteSignal(
  userId: string,
  inviteeEmail: string | null,
  inviteeName: string | null,
  inviteeCompany: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from("msl_team_invites").insert({
      inviter_user_id: userId,
      invitee_email: inviteeEmail,
      invitee_name: inviteeName,
      invitee_company: inviteeCompany,
    });
    if (error) {
      console.warn("recordTeamInviteSignal: supabase error", error);
      throw error;
    }
  } catch (err) {
    console.warn("recordTeamInviteSignal: error", err);
    throw err;
  }
}

async function getUserTerritoryContext(userId: string): Promise<{
  states: string[];
  taUuids: string[];
  territoryLabel: string | null;
} | null> {
  const { data, error } = await supabase
    .from("msl_profiles")
    .select("territory_label, territory_states, therapeutic_areas, states_covered, allowed_ta_slugs")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("getUserTerritoryContext: supabase error", error);
    return null;
  }
  if (!data) return null;

  // FIRST-RUN FALLBACK. The WelcomeWizard writes states_covered + allowed_ta_slugs
  // but NOT the canonical territory_states / therapeutic_areas (only ProfileScreen
  // sets those). Without this, every fresh signup has empty territory here, so
  // getCoverageGapsForUser bails at the states/taUuids guard and the Coverage Gaps
  // onboarding tile is silently empty. Fall back ONLY when the canonical column is
  // absent — a user who has set territory_states/therapeutic_areas is unaffected.
  const canonicalStates = Array.isArray(data.territory_states) ? data.territory_states : [];
  const states =
    canonicalStates.length > 0
      ? canonicalStates
      : Array.isArray(data.states_covered)
        ? data.states_covered
        : [];

  const taLabels: string[] = Array.isArray(data.therapeutic_areas) ? data.therapeutic_areas : [];
  let taUuids = taLabels
    .map((label) => TA_SLUG_TO_UUID[label.toUpperCase()])
    .filter((uuid): uuid is string => Boolean(uuid));
  if (taUuids.length === 0) {
    const allowed = Array.isArray(data.allowed_ta_slugs) ? data.allowed_ta_slugs : [];
    taUuids = await taUuidsForParentSlugs(allowed);
  }

  return {
    states,
    taUuids,
    territoryLabel: data.territory_label ?? null,
  };
}

export async function getTerritoryProfile(userId: string): Promise<TerritoryProfile> {
  const context = await getUserTerritoryContext(userId);
  if (!context) {
    return {
      territory_label: null,
      territory_states: [],
      therapeutic_areas: [],
    };
  }

  const { data, error } = await supabase
    .from("msl_profiles")
    .select("therapeutic_areas")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("getTerritoryProfile: ta labels error", error);
  }

  const therapeuticAreas: string[] = Array.isArray(data?.therapeutic_areas) ? data.therapeutic_areas : [];

  return {
    territory_label: context.territoryLabel,
    territory_states: context.states,
    therapeutic_areas: therapeuticAreas,
  };
}

export async function getCoverageGapsForUser(
  userId: string,
  taId?: string,
  limit: number = 5,
): Promise<CoverageGapHcp[]> {
  try {
    const context = await getUserTerritoryContext(userId);
    // Ambient TA (threaded in from TAContext by the caller) scopes the fetch; fall
    // back to the profile-derived TAs when no taId is supplied. Territory (states)
    // still comes from the user's profile.
    const taUuids = taId ? [taId] : (context?.taUuids ?? []);
    if (!context || context.states.length === 0 || taUuids.length === 0) {
      return [];
    }

    const { data: relationships, error: relError } = await supabase
      .from("msl_hcp_relationships")
      .select("hcp_id")
      .eq("user_id", userId);

    if (relError) {
      console.warn("getCoverageGapsForUser: relationships error", relError);
      throw relError;
    }

    const trackedHcpIds = new Set((relationships ?? []).map((r) => (r as { hcp_id: string }).hcp_id));

    const { data: rankings, error: rankError } = await supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, archetype, therapeutic_area_id")
      .in("therapeutic_area_id", taUuids)
      .not("us_rank", "is", null)
      .order("us_rank", { ascending: true })
      .limit(500);

    if (rankError) {
      console.warn("getCoverageGapsForUser: rankings error", rankError);
      throw rankError;
    }

    const untrackedRanked = (rankings ?? [])
      .map((row) => row as { hcp_id: string; us_rank: number; archetype: string | null; therapeutic_area_id: string })
      .filter((row) => !trackedHcpIds.has(row.hcp_id));

    if (untrackedRanked.length === 0) return [];

    const candidateIds = untrackedRanked.slice(0, 100).map((r) => r.hcp_id);

    const { data: hcps, error: hcpError } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_canonical, institution_normalized, nppes_practice_state, cohort_classification")
      .in("id", candidateIds)
      .eq("cohort_classification", "rising_star")
      .in("nppes_practice_state", context.states);

    if (hcpError) {
      console.warn("getCoverageGapsForUser: hcps error", hcpError);
      throw hcpError;
    }

    const hcpMap = new Map(
      (hcps ?? []).map((h) => {
        const row = h as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          institution_canonical: string | null;
          institution_normalized: string | null;
          nppes_practice_state: string | null;
          cohort_classification: string | null;
        };
        return [row.id, row] as const;
      }),
    );

    const merged: CoverageGapHcp[] = [];
    for (const ranked of untrackedRanked) {
      const hcp = hcpMap.get(ranked.hcp_id);
      if (!hcp) continue;
      const name = `${hcp.first_name ?? ""} ${hcp.last_name ?? ""}`.trim() || "Unknown";
      merged.push({
        hcp_id: ranked.hcp_id,
        name,
        institution: hcp.institution_canonical ?? hcp.institution_normalized ?? null,
        state: hcp.nppes_practice_state ?? null,
        us_rank: ranked.us_rank,
        archetype: ranked.archetype,
      });
      if (merged.length >= limit) break;
    }

    return merged;
  } catch (err) {
    console.warn("getCoverageGapsForUser: error", err);
    throw err;
  }
}

export async function getTerritoryCoverageStats(
  userId: string,
  taId?: string,
): Promise<TerritoryCoverageStats> {
  try {
    const context = await getUserTerritoryContext(userId);
    const empty: TerritoryCoverageStats = {
      total_rising_stars_in_territory: 0,
      tracked_count: 0,
      coverage_percentage: 0,
      territory_label: context?.territoryLabel ?? null,
    };

    // Ambient TA scopes the fetch; fall back to the profile TAs when absent.
    const taUuids = taId ? [taId] : (context?.taUuids ?? []);
    if (!context || context.states.length === 0 || taUuids.length === 0) {
      return empty;
    }

    const PAGE_SIZE = 1000;
    let allRankings: { hcp_id: string }[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData, error: pageError } = await supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id")
        .in("therapeutic_area_id", taUuids)
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageError) {
        console.warn("getTerritoryCoverageStats: rankings page error", pageError);
        return empty;
      }

      const page = (pageData ?? []) as { hcp_id: string }[];
      allRankings = allRankings.concat(page);

      if (page.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }

      if (offset > 50000) {
        console.warn("getTerritoryCoverageStats: rankings exceeded 50000 rows, stopping pagination");
        hasMore = false;
      }
    }

    const rankings = allRankings;

    const rankedHcpIds = rankings.map((r) => r.hcp_id);
    if (rankedHcpIds.length === 0) return empty;

    const CHUNK_SIZE = 100;
    const territoryHcpIds = new Set<string>();

    for (let i = 0; i < rankedHcpIds.length; i += CHUNK_SIZE) {
      const chunk = rankedHcpIds.slice(i, i + CHUNK_SIZE);
      const { data: hcps, error: hcpError } = await supabase
        .from("hcps_v2")
        .select("id")
        .in("id", chunk)
        .eq("cohort_classification", "rising_star")
        .in("nppes_practice_state", context.states);
      if (hcpError) {
        console.warn("getTerritoryCoverageStats: hcps chunk error", hcpError);
        continue;
      }
      for (const h of hcps ?? []) {
        territoryHcpIds.add((h as { id: string }).id);
      }
    }

    const totalInTerritory = territoryHcpIds.size;

    const { data: relationships, error: relError } = await supabase
      .from("msl_hcp_relationships")
      .select("hcp_id")
      .eq("user_id", userId);

    if (relError) {
      console.warn("getTerritoryCoverageStats: relationships error", relError);
      return { ...empty, total_rising_stars_in_territory: totalInTerritory };
    }

    let trackedCount = 0;
    for (const r of relationships ?? []) {
      if (territoryHcpIds.has((r as { hcp_id: string }).hcp_id)) {
        trackedCount += 1;
      }
    }

    const coveragePercentage = totalInTerritory > 0 ? Math.round((trackedCount / totalInTerritory) * 100) : 0;

    return {
      total_rising_stars_in_territory: totalInTerritory,
      tracked_count: trackedCount,
      coverage_percentage: coveragePercentage,
      territory_label: context.territoryLabel,
    };
  } catch (err) {
    console.warn("getTerritoryCoverageStats: error", err);
    return {
      total_rising_stars_in_territory: 0,
      tracked_count: 0,
      coverage_percentage: 0,
      territory_label: null,
    };
  }
}

export type FollowUpSource = "brief" | "manual" | "all";

export type FollowUpFilterStatus = "open" | "completed";

export type FollowUpFilterPriority = "all" | "high" | "normal" | "low";

export interface FollowUpRow {
  id: string;
  relationship_id: string;
  body: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  priority: Priority;
  created_from: string | null;
  hcp: HcpRef;
  overdue: boolean;
  days_overdue: number | null;
}

export interface FollowUpStats {
  open_total: number;
  overdue: number;
  due_this_week: number;
  future: number;
  no_due_date: number;
  completed_this_month: number;
  completion_rate_30d: number;
  median_close_days_30d: number | null;
}

export interface FollowUpQueryParams {
  status?: FollowUpFilterStatus;
  priority?: FollowUpFilterPriority;
  source?: FollowUpSource;
}

export async function getFollowUpsForUser(
  userId: string,
  params: FollowUpQueryParams = {},
): Promise<FollowUpRow[]> {
  const { status = "open", priority = "all", source = "all" } = params;

  try {
    let query = supabase
      .from("msl_hcp_next_actions")
      .select(`
          id,
          relationship_id,
          body,
          due_at,
          completed_at,
          created_at,
          priority,
          created_from,
          msl_hcp_relationships!inner(
            hcp_id,
            user_id,
            hcps_v2!inner(first_name, last_name, institution_canonical, institution_normalized)
          )
        `)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (status === "open") {
      query = query.is("completed_at", null);
    } else {
      query = query.not("completed_at", "is", null);
    }

    if (priority !== "all") {
      query = query.eq("priority", priority);
    }

    if (source === "brief") {
      query = query.eq("created_from", "brief");
    } else if (source === "manual") {
      query = query.or("created_from.is.null,created_from.neq.brief");
    }

    const { data, error } = await query;

    if (error) {
      console.warn("getFollowUpsForUser: supabase error", error);
      throw error;
    }

    const now = Date.now();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const rows: FollowUpRow[] = (data ?? []).map((raw) => {
      const r = raw as {
        id: string;
        relationship_id: string;
        body: string;
        due_at: string | null;
        completed_at: string | null;
        created_at: string;
        priority: Priority;
        created_from: string | null;
        msl_hcp_relationships: unknown;
      };

      const rel = Array.isArray(r.msl_hcp_relationships) ? r.msl_hcp_relationships[0] : r.msl_hcp_relationships;
      const relObj = rel as {
        hcp_id?: string;
        hcps_v2?: unknown;
      };
      const hcpRow = Array.isArray(relObj?.hcps_v2) ? relObj.hcps_v2[0] : relObj?.hcps_v2;
      const hcpData = hcpRow as {
        first_name: string | null;
        last_name: string | null;
        institution_canonical: string | null;
        institution_normalized: string | null;
      } | undefined;

      const name = hcpData
        ? `${hcpData.first_name ?? ""} ${hcpData.last_name ?? ""}`.trim() || "Unknown"
        : "Unknown";
      const institution = hcpData?.institution_canonical ?? hcpData?.institution_normalized ?? null;

      const dueTs = r.due_at ? new Date(r.due_at).getTime() : null;
      const overdue = dueTs !== null && r.completed_at === null && dueTs < now;
      const days_overdue = overdue && dueTs !== null ? Math.floor((now - dueTs) / MS_PER_DAY) : null;

      return {
        id: r.id,
        relationship_id: r.relationship_id,
        body: r.body,
        due_at: r.due_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
        priority: r.priority,
        created_from: r.created_from,
        hcp: {
          hcp_id: relObj?.hcp_id ?? "",
          name,
          institution,
        },
        overdue,
        days_overdue,
      };
    });

    const PRIORITY_RANK_LOCAL: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
    rows.sort((a, b) => {
      if (a.overdue && !b.overdue) return -1;
      if (!a.overdue && b.overdue) return 1;

      const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;

      const aPrio = PRIORITY_RANK_LOCAL[a.priority] ?? 1;
      const bPrio = PRIORITY_RANK_LOCAL[b.priority] ?? 1;
      return aPrio - bPrio;
    });

    return rows;
  } catch (err) {
    console.warn("getFollowUpsForUser: error", err);
    throw err;
  }
}

export async function getFollowUpStats(userId: string): Promise<FollowUpStats> {
  try {
    const empty: FollowUpStats = {
      open_total: 0,
      overdue: 0,
      due_this_week: 0,
      future: 0,
      no_due_date: 0,
      completed_this_month: 0,
      completion_rate_30d: 0,
      median_close_days_30d: null,
    };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const startOfMonth = (() => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
    })();

    const { data, error } = await supabase
      .from("msl_hcp_next_actions")
      .select("id, due_at, completed_at, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .or(`completed_at.is.null,completed_at.gte.${thirtyDaysAgo}`);

    if (error) {
      console.warn("getFollowUpStats: supabase error", error);
      return empty;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      due_at: string | null;
      completed_at: string | null;
      created_at: string;
    }>;

    const now = Date.now();
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
    const startOfMonthTs = new Date(startOfMonth).getTime();
    const thirtyDaysAgoTs = new Date(thirtyDaysAgo).getTime();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    let openTotal = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    let future = 0;
    let noDueDate = 0;
    let completedThisMonth = 0;
    let completedLast30Days = 0;
    let createdLast30Days = 0;
    const closeDaysSamples: number[] = [];

    for (const r of rows) {
      const createdTs = new Date(r.created_at).getTime();
      const completedTs = r.completed_at ? new Date(r.completed_at).getTime() : null;
      const dueTs = r.due_at ? new Date(r.due_at).getTime() : null;

      if (completedTs === null) {
        openTotal += 1;
        if (dueTs === null) noDueDate += 1;
        else if (dueTs < now) overdue += 1;
        else if (dueTs < weekFromNow) dueThisWeek += 1;
        else future += 1;
      }

      if (completedTs !== null && completedTs >= startOfMonthTs) {
        completedThisMonth += 1;
      }

      if (createdTs >= thirtyDaysAgoTs) {
        createdLast30Days += 1;
        if (completedTs !== null) completedLast30Days += 1;
      }

      if (completedTs !== null && completedTs >= thirtyDaysAgoTs) {
        const closeDays = (completedTs - createdTs) / MS_PER_DAY;
        if (closeDays >= 0) closeDaysSamples.push(closeDays);
      }
    }

    const completionRate30d = createdLast30Days > 0
      ? Math.round((completedLast30Days / createdLast30Days) * 100)
      : 0;

    let medianCloseDays: number | null = null;
    if (closeDaysSamples.length > 0) {
      closeDaysSamples.sort((a, b) => a - b);
      const mid = Math.floor(closeDaysSamples.length / 2);
      medianCloseDays = closeDaysSamples.length % 2 === 0
        ? Math.round((closeDaysSamples[mid - 1] + closeDaysSamples[mid]) / 2 * 10) / 10
        : Math.round(closeDaysSamples[mid] * 10) / 10;
    }

    return {
      open_total: openTotal,
      overdue,
      due_this_week: dueThisWeek,
      future,
      no_due_date: noDueDate,
      completed_this_month: completedThisMonth,
      completion_rate_30d: completionRate30d,
      median_close_days_30d: medianCloseDays,
    };
  } catch (err) {
    console.warn("getFollowUpStats: error", err);
    return {
      open_total: 0,
      overdue: 0,
      due_this_week: 0,
      future: 0,
      no_due_date: 0,
      completed_this_month: 0,
      completion_rate_30d: 0,
      median_close_days_30d: null,
    };
  }
}

export async function markFollowUpComplete(userId: string, followUpId: string): Promise<void> {
  await updateNextAction(userId, followUpId, {
    completedAt: new Date().toISOString(),
  });
}

export async function snoozeFollowUp(
  userId: string,
  followUpId: string,
  newDueAt: string,
): Promise<void> {
  await updateNextAction(userId, followUpId, {
    dueAt: newDueAt,
  });
}

export async function getTrackedHcpsInTerritory(userId: string): Promise<TrackedHcpChip[]> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("msl_profiles")
      .select("territory_states")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile?.territory_states || profile.territory_states.length === 0) {
      return [];
    }

    const territoryStates = profile.territory_states as string[];

    const { data: rels, error: relsError } = await supabase
      .from("msl_hcp_relationships")
      .select("hcp_id")
      .eq("user_id", userId);

    if (relsError || !rels || rels.length === 0) {
      return [];
    }

    const hcpIds = rels.map((r) => (r as { hcp_id: string }).hcp_id);

    const CHUNK_SIZE = 100;
    type HcpRow = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      nppes_practice_state: string | null;
      cohort_classification: string | null;
    };
    const allHcps: HcpRow[] = [];
    for (let i = 0; i < hcpIds.length; i += CHUNK_SIZE) {
      const chunk = hcpIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("hcps_v2")
        .select("id, first_name, last_name, nppes_practice_state, cohort_classification")
        .in("id", chunk);
      if (error) {
        console.warn("getTrackedHcpsInTerritory: hcp chunk error", error);
        continue;
      }
      for (const row of (data ?? []) as HcpRow[]) {
        allHcps.push(row);
      }
    }

    if (allHcps.length === 0) return [];

    const hcpIdsInTerritory = allHcps.map((h) => h.id);
    type RankRow = { hcp_id: string; us_rank: number | null };
    const ranksByHcpId = new Map<string, number | null>();

    for (let i = 0; i < hcpIdsInTerritory.length; i += CHUNK_SIZE) {
      const chunk = hcpIdsInTerritory.slice(i, i + CHUNK_SIZE);
      const { data } = await supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id, us_rank")
        .in("hcp_id", chunk);
      for (const row of (data ?? []) as RankRow[]) {
        ranksByHcpId.set(row.hcp_id, row.us_rank);
      }
    }

    const chips: TrackedHcpChip[] = allHcps.map((h) => {
      const cohortLower = (h.cohort_classification ?? "").toLowerCase();
      let cohort: TrackedHcpChip["cohort"] = null;
      if (cohortLower === "rising_star" || cohortLower === "dark_horse") cohort = "rising_star";
      else if (cohortLower === "established") cohort = "established";
      else if (cohortLower === "community" || cohortLower === "workhorse") cohort = "community";

      return {
        hcp_id: h.id,
        name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
        cohort,
        cohort_rank: cohort === "rising_star" ? (ranksByHcpId.get(h.id) ?? null) : null,
      };
    });

    const cohortPriority: Record<string, number> = { rising_star: 0, established: 1, community: 2 };
    chips.sort((a, b) => {
      const aPriority = a.cohort ? cohortPriority[a.cohort] ?? 3 : 3;
      const bPriority = b.cohort ? cohortPriority[b.cohort] ?? 3 : 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.cohort === "rising_star" && b.cohort === "rising_star") {
        if (a.cohort_rank !== null && b.cohort_rank !== null) return a.cohort_rank - b.cohort_rank;
        if (a.cohort_rank !== null) return -1;
        if (b.cohort_rank !== null) return 1;
      }
      return a.name.localeCompare(b.name);
    });

    return chips;
  } catch (err) {
    console.warn("getTrackedHcpsInTerritory: error", err);
    return [];
  }
}
