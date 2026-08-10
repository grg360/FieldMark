// Open-trials pop-up data (frame: Open Trials Popup.dc.html, project e672bf7a).
// board_open_trials → trial_ids; details from clinical_trials_v2 (anon-read,
// verified 2026-08-08) + the HCP's rendered role per trial. OPEN-GATED with the
// platform's canonical OPEN_TRIAL_STATUSES — same gate as the badge, so the
// pop-up can never list a trial the badge didn't count.
// Enrollment is NEVER surfaced: the column does not exist in the corpus.
import { supabase } from "./supabase";

export const OPEN_TRIAL_STATUSES = [
  "RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "NOT_YET_RECRUITING",
  "ENROLLING_BY_INVITATION",
] as const;

export interface OpenTrialDetail {
  trialId: string;
  nctId: string;
  title: string;
  status: string; // underscores replaced for display by the component
  phase: string | null; // null → "Phase not recorded", never blank
  role: string | null; // registry role; site-lead disclosure lives ONCE in the footer
  sponsor: string | null;
  sponsorClass: string | null;
  conditions: string[];
  startDate: string | null;
  completionDate: string | null;
  studyType: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  PRINCIPAL_INVESTIGATOR: "Principal investigator",
  SUB_INVESTIGATOR: "Sub-investigator",
  STUDY_CHAIR: "Study chair",
  STUDY_DIRECTOR: "Study director",
};

export function roleLabel(role: string | null): string | null {
  if (!role) return null;
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ").toLowerCase();
}

// Request cache (2026-08-09 — same medicine as the ledger drawer's layer
// fetch): the detail chain is an RPC round-trip FOLLOWED by two parallel
// reads — two sequential network legs — so the pop-up mounted showing
// LOADING… and filled in a beat later, the same two-step the drawer had.
// The badge PREFETCHES through this cache on hover, so a click usually opens
// with the list already in hand, and re-opens are instant. Failed runs are
// evicted rather than cached as [] — the pop-up's empty state is a truth
// claim ("the trials closed since the badge was computed") and must never be
// manufactured by a network error.
const detailCache = new Map<string, Promise<OpenTrialDetail[]>>();

export function getOpenTrialsDetail(hcpId: string): Promise<OpenTrialDetail[]> {
  const hit = detailCache.get(hcpId);
  if (hit) return hit;
  if (detailCache.size > 300) detailCache.clear(); // bound a long scanning session
  const p = fetchOpenTrialsDetail(hcpId, () => detailCache.delete(hcpId));
  detailCache.set(hcpId, p);
  return p;
}

/** Fire-and-forget badge-hover prefetch — same cache, same promise as the pop-up's fetch. */
export function prefetchOpenTrialsDetail(hcpId: string): void {
  void getOpenTrialsDetail(hcpId);
}

async function fetchOpenTrialsDetail(hcpId: string, onError: () => void): Promise<OpenTrialDetail[]> {
  const { data: flagRows, error: flagErr } = await supabase.rpc("board_open_trials", { p_hcp_ids: [hcpId] });
  if (flagErr || !flagRows?.length) {
    if (flagErr) {
      console.warn("getOpenTrialsDetail: board_open_trials", flagErr);
      onError();
    }
    return [];
  }
  const trialIds: string[] = flagRows[0].trial_ids ?? [];
  if (trialIds.length === 0) return [];

  const [trialsRes, rolesRes] = await Promise.all([
    supabase
      .from("clinical_trials_v2")
      .select("id, nct_id, title, phase, status, sponsor, lead_sponsor_class, study_type, start_date, completion_date, conditions")
      .in("id", trialIds)
      .in("status", [...OPEN_TRIAL_STATUSES]),
    supabase
      .from("trial_investigators_rendered_v1")
      .select("trial_id, role")
      .eq("hcp_id", hcpId)
      .in("trial_id", trialIds),
  ]);
  if (trialsRes.error) console.warn("getOpenTrialsDetail: trials", trialsRes.error);
  if (rolesRes.error) console.warn("getOpenTrialsDetail: roles", rolesRes.error);
  if (trialsRes.error || rolesRes.error) onError(); // degraded result — don't cache it
  const roleByTrial = new Map(((rolesRes.data ?? []) as Array<{ trial_id: string; role: string | null }>).map((r) => [r.trial_id, r.role]));

  return ((trialsRes.data ?? []) as Array<Record<string, unknown>>)
    .map((t) => ({
      trialId: String(t.id),
      nctId: (t.nct_id as string) ?? "",
      title: (t.title as string) ?? "",
      status: (t.status as string) ?? "",
      phase: (t.phase as string) || null,
      role: roleByTrial.get(String(t.id)) ?? null,
      sponsor: (t.sponsor as string) || null,
      sponsorClass: (t.lead_sponsor_class as string) || null,
      conditions: Array.isArray(t.conditions) ? (t.conditions as string[]) : [],
      startDate: (t.start_date as string) || null,
      completionDate: (t.completion_date as string) || null,
      studyType: (t.study_type as string) || null,
    }))
    // Most recent first (by start_date, undated last) — the pop-up's collapsed
    // state shows exactly the first row, so the sort IS the "most recent" claim.
    .sort((a, b) => {
      if (a.startDate && b.startDate) return b.startDate.localeCompare(a.startDate);
      if (a.startDate) return -1;
      if (b.startDate) return 1;
      return a.nctId.localeCompare(b.nctId);
    });
}
