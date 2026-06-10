import { supabase } from "./supabase";
import type { Priority } from "./relationships";

// Therapeutic area UUID lookup. Keys are strings stored in msl_profiles.therapeutic_areas.
// Migrate to a UUID column on msl_profiles when team features ship.
const TA_SLUG_TO_UUID: Record<string, string> = {
  NSCLC: "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
};

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

export interface TerritoryCoverageStats {
  total_rising_stars_in_territory: number;
  tracked_count: number;
  coverage_percentage: number;
  territory_label: string | null;
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
    .select("territory_label, territory_states, therapeutic_areas")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("getUserTerritoryContext: supabase error", error);
    return null;
  }
  if (!data) return null;

  const states = Array.isArray(data.territory_states) ? data.territory_states : [];
  const taLabels: string[] = Array.isArray(data.therapeutic_areas) ? data.therapeutic_areas : [];
  const taUuids = taLabels.map((label) => TA_SLUG_TO_UUID[label]).filter((uuid): uuid is string => Boolean(uuid));

  return {
    states,
    taUuids,
    territoryLabel: data.territory_label ?? null,
  };
}

export async function getCoverageGapsForUser(
  userId: string,
  limit: number = 5,
): Promise<CoverageGapHcp[]> {
  try {
    const context = await getUserTerritoryContext(userId);
    if (!context || context.states.length === 0 || context.taUuids.length === 0) {
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
      .in("therapeutic_area_id", context.taUuids)
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

export async function getTerritoryCoverageStats(userId: string): Promise<TerritoryCoverageStats> {
  try {
    const context = await getUserTerritoryContext(userId);
    const empty: TerritoryCoverageStats = {
      total_rising_stars_in_territory: 0,
      tracked_count: 0,
      coverage_percentage: 0,
      territory_label: context?.territoryLabel ?? null,
    };

    if (!context || context.states.length === 0 || context.taUuids.length === 0) {
      return empty;
    }

    const { data: rankings, error: rankError } = await supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id")
      .in("therapeutic_area_id", context.taUuids);

    if (rankError) {
      console.warn("getTerritoryCoverageStats: rankings error", rankError);
      return empty;
    }

    const rankedHcpIds = (rankings ?? []).map((r) => (r as { hcp_id: string }).hcp_id);
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
