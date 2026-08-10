// Institutional Environment panel data (frame: Institutional Environment
// .dc.html, project 805df654, built 2026-08-10). Four DISPLAYED signals per
// institution — none feeds any ordering; bands + member counts remain the
// only institution ranking, and nothing here renders on the index.
//
// Grouping: institution_primary_links_v1 -> reference_institution_id -> linked
// HCP ids (the same primary-link grouping the Institutions surface uses).
//
// Reads verified 2026-08-10: institution_primary_links_v1 and
// trial_investigators_rendered_v1 anon-readable; nih_grants /
// nih_grant_investigators carry public_read policies;
// hcp_publication_leadership_v2 is AUTHENTICATED-read ('Authenticated read
// access', SELECT, true) — fine in-app (this route requires login), but a
// session-less client receives [] silently, so the guideline tile treats a
// query ERROR as unavailable while trusting [] from an authenticated session
// as a genuine zero.
//
// FUNDING DEFINITIONS (Phase-1 nihGrants rules, carried over):
//  - "active" = max recorded project_end_date >= today; no recorded end date
//    is never counted active; every rendered "active" carries the
//    (by recorded project dates) qualifier.
//  - leadership = CONTACT PI (role 'pi' — RePORTER's is_contact_pi; the match
//    table holds only the PI list, co-investigators cannot appear).
//  - fundedInvestigators = linked HCPs holding >=1 ACTIVE award as CONTACT PI,
//    any mechanism. Composition (investigator counts within the linked set):
//      nciSupported  — >=1 active contact-PI award administered by NCI
//      r01Equivalent — >=1 active contact-PI R01/R37/R35 (independent, non-K)
//      earlyCareer   — >=1 active contact-PI K-mechanism (career/transition)
//  - NO dollar figure anywhere, per the panel ruling — the ~10% capture
//    variance makes dollars mislead even within one institution's page.
import { supabase } from "./supabase";
import { OPEN_TRIAL_STATUSES } from "./openTrials";

const CHUNK = 150; // .in() lists ride the URL; ~150 uuids stays under length limits
const PAGE = 1000; // PostgREST caps responses at 1000 rows — page EVERY read, or
// big institutions (MD Anderson: 1000+ links, thousands of trial rows) silently
// truncate and the tile understates. Found live 2026-08-10 (139/400 vs 170/502).

type PagedFetch<T> = (slice: string[], from: number, to: number) => Promise<{ rows: T[]; error: boolean }>;

async function chunkedPaged<T>(ids: string[], fetchPage: PagedFetch<T>): Promise<T[] | null> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { rows, error } = await fetchPage(slice, from, from + PAGE - 1);
      if (error) return null; // one failed page poisons the read — no partial truths
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

export interface InstitutionEnvironment {
  trackedInvestigators: number; // all primary-linked HCPs
  trials: { openTrialInvestigators: number; openTrials: number } | null; // null = read failed
  guidelines: { authors: number; pubs: number } | null;
  funding: {
    fundedInvestigators: number;
    nciSupported: number;
    r01Equivalent: number;
    earlyCareer: number;
  } | null;
}

const R01_CLASS = new Set(["R01", "R37", "R35"]);

export async function getInstitutionEnvironment(
  referenceInstitutionId: string,
  taId: string,
): Promise<InstitutionEnvironment | null> {
  const linkRows: Array<{ hcp_id: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const links = await supabase
      .from("institution_primary_links_v1")
      .select("hcp_id")
      .eq("reference_institution_id", referenceInstitutionId)
      .range(from, from + PAGE - 1);
    if (links.error) {
      console.warn("institutionEnvironment: links", links.error);
      return null;
    }
    const page = (links.data ?? []) as Array<{ hcp_id: string }>;
    linkRows.push(...page);
    if (page.length < PAGE) break;
  }
  const hcpIds = [...new Set(linkRows.map((r) => r.hcp_id))];
  if (hcpIds.length === 0) {
    return { trackedInvestigators: 0, trials: { openTrialInvestigators: 0, openTrials: 0 }, guidelines: { authors: 0, pubs: 0 }, funding: { fundedInvestigators: 0, nciSupported: 0, r01Equivalent: 0, earlyCareer: 0 } };
  }

  const [trials, guidelines, funding] = await Promise.all([
    readTrials(hcpIds),
    readGuidelines(hcpIds, taId),
    readFunding(hcpIds),
  ]);
  return { trackedInvestigators: hcpIds.length, trials, guidelines, funding };
}

async function readTrials(hcpIds: string[]): Promise<InstitutionEnvironment["trials"]> {
  const inv = await chunkedPaged<{ hcp_id: string; trial_id: string }>(hcpIds, async (slice, from, to) => {
    const r = await supabase.from("trial_investigators_rendered_v1").select("hcp_id, trial_id").in("hcp_id", slice).range(from, to);
    if (r.error) console.warn("institutionEnvironment: trial investigators", r.error);
    return { rows: (r.data ?? []) as Array<{ hcp_id: string; trial_id: string }>, error: !!r.error };
  });
  if (inv == null) return null;
  const trialIds = [...new Set(inv.map((r) => r.trial_id))];
  if (trialIds.length === 0) return { openTrialInvestigators: 0, openTrials: 0 };
  const open = await chunkedPaged<{ id: string }>(trialIds, async (slice, from, to) => {
    const r = await supabase.from("clinical_trials_v2").select("id").in("id", slice).in("status", [...OPEN_TRIAL_STATUSES]).range(from, to);
    if (r.error) console.warn("institutionEnvironment: trials", r.error);
    return { rows: (r.data ?? []) as Array<{ id: string }>, error: !!r.error };
  });
  if (open == null) return null;
  const openSet = new Set(open.map((r) => r.id));
  const investigators = new Set(inv.filter((r) => openSet.has(r.trial_id)).map((r) => r.hcp_id));
  return { openTrialInvestigators: investigators.size, openTrials: openSet.size };
}

async function readGuidelines(hcpIds: string[], taId: string): Promise<InstitutionEnvironment["guidelines"]> {
  const rows = await chunkedPaged<{ hcp_id: string; guideline_pub_count: number }>(hcpIds, async (slice, from, to) => {
    const r = await supabase
      .from("hcp_publication_leadership_v2")
      .select("hcp_id, guideline_pub_count")
      .eq("therapeutic_area_id", taId)
      .gt("guideline_pub_count", 0)
      .in("hcp_id", slice)
      .range(from, to);
    if (r.error) console.warn("institutionEnvironment: guidelines", r.error);
    return { rows: (r.data ?? []) as Array<{ hcp_id: string; guideline_pub_count: number }>, error: !!r.error };
  });
  if (rows == null) return null;
  return { authors: new Set(rows.map((r) => r.hcp_id)).size, pubs: rows.reduce((s, r) => s + Number(r.guideline_pub_count), 0) };
}

async function readFunding(hcpIds: string[]): Promise<InstitutionEnvironment["funding"]> {
  const inv = await chunkedPaged<{ hcp_id: string; core_project_num: string; role: string }>(hcpIds, async (slice, from, to) => {
    const r = await supabase
      .from("nih_grant_investigators")
      .select("hcp_id, core_project_num, role")
      .eq("role", "pi") // contact PI only — the leadership rule
      .in("hcp_id", slice)
      .range(from, to);
    if (r.error) console.warn("institutionEnvironment: grant investigators", r.error);
    return { rows: (r.data ?? []) as Array<{ hcp_id: string; core_project_num: string; role: string }>, error: !!r.error };
  });
  if (inv == null) return null;
  if (inv.length === 0) return { fundedInvestigators: 0, nciSupported: 0, r01Equivalent: 0, earlyCareer: 0 };

  const nums = [...new Set(inv.map((r) => r.core_project_num))];
  const rows = await chunkedPaged<{ core_project_num: string; activity_code: string; administering_ic: string; project_end_date: string | null }>(nums, async (slice, from, to) => {
    const r = await supabase
      .from("nih_grants")
      .select("core_project_num, activity_code, administering_ic, project_end_date")
      .in("core_project_num", slice)
      .range(from, to);
    if (r.error) console.warn("institutionEnvironment: grants", r.error);
    return { rows: (r.data ?? []) as Array<{ core_project_num: string; activity_code: string; administering_ic: string; project_end_date: string | null }>, error: !!r.error };
  });
  if (rows == null) return null;

  const today = new Date().toISOString().slice(0, 10);
  const byProject = new Map<string, { mech: string; ic: string; lastEnd: string | null }>();
  for (const r of rows) {
    const cur = byProject.get(r.core_project_num);
    if (!cur) byProject.set(r.core_project_num, { mech: r.activity_code, ic: r.administering_ic, lastEnd: r.project_end_date });
    else if (r.project_end_date && (!cur.lastEnd || r.project_end_date > cur.lastEnd)) cur.lastEnd = r.project_end_date;
  }

  const funded = new Set<string>();
  const nci = new Set<string>();
  const r01 = new Set<string>();
  const early = new Set<string>();
  for (const link of inv) {
    const p = byProject.get(link.core_project_num);
    if (!p || p.lastEnd == null || p.lastEnd < today) continue; // not active by recorded dates
    funded.add(link.hcp_id);
    if (p.ic === "NCI") nci.add(link.hcp_id);
    if (R01_CLASS.has(p.mech)) r01.add(link.hcp_id);
    if (p.mech.startsWith("K")) early.add(link.hcp_id);
  }
  return { fundedInvestigators: funded.size, nciSupported: nci.size, r01Equivalent: r01.size, earlyCareer: early.size };
}
