import { supabase } from "./supabase";
import type { InsightCategory, InsightStrength } from "./insightCategories";

export interface FieldInsight {
  id: string;
  hcp_id: string;
  hcp_first_name: string;
  hcp_last_name: string;
  body: string;
  why_it_matters: string | null;
  interaction_type: string | null;
  visibility: string | null;
  occurred_at: string;
  insight_strength: InsightStrength | null;
  insight_category: InsightCategory | null;
  author_user_id: string;
  author_initials: string;
}

type RawNoteRow = {
  id: string;
  body: string;
  why_it_matters: string | null;
  interaction_type: string | null;
  visibility: string | null;
  occurred_at: string;
  insight_strength: string | null;
  insight_category: string | null;
  user_id: string;
  msl_hcp_relationships: {
    hcp_id: string;
    hcps_v2: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  } | null;
};

function safeInitials(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const a = f.length > 0 ? f[0] : "";
  const b = l.length > 0 ? l[0] : "";
  const combined = `${a}${b}`.toUpperCase();
  return combined.length > 0 ? combined : "MSL";
}

export async function getFieldInsightsForCurrentUser(): Promise<FieldInsight[]> {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      console.warn("getFieldInsightsForCurrentUser: not authenticated");
      return [];
    }
    const currentUserId = userData.user.id;

    const { data: profileData } = await supabase
      .from("msl_profiles")
      .select("first_name, last_name")
      .eq("user_id", currentUserId)
      .maybeSingle();

    const authorInitials = safeInitials(profileData?.first_name, profileData?.last_name);

    const { data, error } = await supabase
      .from("msl_hcp_notes")
      .select(`
        id,
        body,
        why_it_matters,
        interaction_type,
        visibility,
        occurred_at,
        insight_strength,
        insight_category,
        user_id,
        msl_hcp_relationships (
          hcp_id,
          hcps_v2 (
            id,
            first_name,
            last_name
          )
        )
      `)
      .eq("user_id", currentUserId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false });

    if (error) {
      console.warn("getFieldInsightsForCurrentUser: query error", error);
      return [];
    }

    const rows = (data ?? []) as RawNoteRow[];

    return rows
      .map((row): FieldInsight | null => {
        const hcp = row.msl_hcp_relationships?.hcps_v2;
        if (!hcp || !hcp.id) return null;
        return {
          id: row.id,
          hcp_id: hcp.id,
          hcp_first_name: (hcp.first_name ?? "").trim(),
          hcp_last_name: (hcp.last_name ?? "").trim(),
          body: row.body,
          why_it_matters: row.why_it_matters,
          interaction_type: row.interaction_type,
          visibility: row.visibility,
          occurred_at: row.occurred_at,
          insight_strength: (row.insight_strength as InsightStrength | null) ?? null,
          insight_category: (row.insight_category as InsightCategory | null) ?? null,
          author_user_id: row.user_id,
          author_initials: authorInitials,
        };
      })
      .filter((row): row is FieldInsight => row !== null);
  } catch (err) {
    console.warn("getFieldInsightsForCurrentUser: unexpected error", err);
    return [];
  }
}

export function formatHcpDisplayName(insight: FieldInsight): string {
  const first = insight.hcp_first_name;
  const last = insight.hcp_last_name;
  if (first && last) return `${first} ${last}`;
  if (last) return last;
  if (first) return first;
  return "Unknown HCP";
}

export function formatInsightDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
