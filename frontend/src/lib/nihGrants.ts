// HCP-level NIH RePORTER display facts (Phase 1, 2026-08-10). DISPLAY ONLY —
// never a scoring input, same standing as pharma ("displayed, not ranked").
//
// Source pair: nih_grant_investigators (name-cascade matches; match_method
// 'profile_id' | 'name_institution_exact' | 'name_institution_overlap' — there
// is NO NPI in this chain) x nih_grants (one row per project-YEAR, FY2012-2026,
// curated activity codes; verified anon-readable 2026-08-10).
//
// Honesty rules carried in the shapes below:
//  - "active" means project_end_date >= today — BY RECORDED PROJECT DATES, and
//    every rendered label must carry that qualifier (RePORTER end dates are
//    administratively noisy: no-cost extensions, lagging terminations). A grant
//    with no recorded end date is NOT counted active.
//  - dollars: total_cost is per project-year and double-counts P/U subprojects,
//    so the only dollar fact exposed is the LATEST-FY cost of each active
//    grant, summed — an annual figure, never a career total.
//  - K->R01 transition surfaces ONLY at high confidence: every K and
//    R01/R37/R35 PI-match on the HCP is a 'profile_id' match (RePORTER's own
//    person key — the strongest same-person guarantee available), and the
//    first K start strictly precedes the first R01/R37/R35 start. Anything
//    ambiguous -> null: a missing transition is invisible, a false one is a
//    stated error.
import { supabase } from "./supabase";

// ROLE SEMANTICS (verified against the matcher + raw payloads, 2026-08-10):
// the matcher extracts ONLY RePORTER's principal_investigators array — the
// contact PI plus MPIs under NIH's multiple-PI policy. Co-investigators and
// subaward personnel are NOT in that array and are NOT in this table, so no
// row here can overclaim a mere named investigator as a leader.
//   role 'pi'    = is_contact_pi TRUE  -> CONTACT PI
//   role 'co_pi' = is_contact_pi FALSE -> MPI (a genuine multiple-PI, not a
//                  co-investigator; display as "MPI", never as "co-PI")
export interface GrantRecord {
  coreProjectNum: string;
  mechanism: string; // activity_code (never null in corpus)
  institute: string; // administering_ic (never null in corpus)
  firstFy: number;
  latestFy: number;
  firstStart: string | null;
  lastEnd: string | null;
  latestCost: number | null; // total_cost on the grant's max-FY row
  role: "pi" | "co_pi"; // 'pi' = CONTACT PI; 'co_pi' = MPI (see note above)
  matchMethod: string;
  activeByDates: boolean;
}

export interface HcpGrantFacts {
  total: number;
  activeByDates: number;
  /** Per administering institute, NCI first then by total desc. */
  institutes: Array<{ code: string; total: number; active: number }>;
  /** Mechanism families: R01 / R-OTHER / K / U / P / OTHER, count desc. */
  mechanisms: Array<{ family: string; count: number }>;
  contactPiCount: number; // grants where this HCP is the CONTACT PI
  mpiCount: number; // grants where this HCP is a non-contact MPI
  latestFy: number | null;
  /** The lead facts (2026-08-10 recency ruling): independent = non-K
   *  mechanism; "as PI" = contact PI. Recency of independent funding is the
   *  trajectory headline; K->R01 stays a high-confidence flourish. */
  activeIndependentAsContactPi: number;
  firstIndependentFy: number | null;
  /** Sum of latest-FY total_cost across active grants (annual figure). */
  activeAnnualCost: number;
  /** High-confidence K->R01 transition, else null (omitted, never a maybe). */
  kToR01: { kFirstFy: number; rFirstFy: number } | null;
  grants: GrantRecord[];
}

function mechanismFamily(code: string): string {
  if (code === "R01") return "R01";
  if (code.startsWith("K")) return "K";
  if (code.startsWith("U")) return "U";
  if (code.startsWith("P")) return "P";
  if (code.startsWith("R")) return "R-OTHER";
  return "OTHER";
}

const R01_CLASS = new Set(["R01", "R37", "R35"]); // R37/R35 are R01-derived (MERIT / outstanding-investigator extensions)

export async function getHcpGrantFacts(hcpId: string): Promise<HcpGrantFacts | null> {
  const inv = await supabase
    .from("nih_grant_investigators")
    .select("core_project_num, role, match_method")
    .eq("hcp_id", hcpId);
  if (inv.error) {
    console.warn("getHcpGrantFacts: investigators", inv.error);
    return null; // read failed — the section renders nothing rather than a false absence
  }
  const invRows = (inv.data ?? []) as Array<{ core_project_num: string; role: string; match_method: string }>;
  if (invRows.length === 0) {
    return { total: 0, activeByDates: 0, institutes: [], mechanisms: [], contactPiCount: 0, mpiCount: 0, latestFy: null, activeIndependentAsContactPi: 0, firstIndependentFy: null, activeAnnualCost: 0, kToR01: null, grants: [] };
  }
  // pi wins when the HCP appears under both roles on one project
  const roleByProject = new Map<string, { role: "pi" | "co_pi"; matchMethod: string }>();
  for (const r of invRows) {
    const prev = roleByProject.get(r.core_project_num);
    if (!prev || (prev.role === "co_pi" && r.role === "pi")) {
      roleByProject.set(r.core_project_num, { role: r.role as "pi" | "co_pi", matchMethod: r.match_method });
    }
  }

  const nums = [...roleByProject.keys()];
  const g = await supabase
    .from("nih_grants")
    .select("core_project_num, activity_code, administering_ic, fiscal_year, project_start_date, project_end_date, total_cost")
    .in("core_project_num", nums);
  if (g.error) {
    console.warn("getHcpGrantFacts: grants", g.error);
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const byProject = new Map<string, GrantRecord>();
  for (const row of (g.data ?? []) as Array<Record<string, unknown>>) {
    const num = String(row.core_project_num);
    const link = roleByProject.get(num);
    if (!link) continue;
    const fy = Number(row.fiscal_year);
    const start = (row.project_start_date as string) || null;
    const end = (row.project_end_date as string) || null;
    const cost = row.total_cost == null ? null : Number(row.total_cost);
    const cur = byProject.get(num);
    if (!cur) {
      byProject.set(num, {
        coreProjectNum: num,
        mechanism: String(row.activity_code ?? ""),
        institute: String(row.administering_ic ?? ""),
        firstFy: fy,
        latestFy: fy,
        firstStart: start,
        lastEnd: end,
        latestCost: cost,
        role: link.role,
        matchMethod: link.matchMethod,
        activeByDates: false, // set after all rows fold in
      });
    } else {
      cur.firstFy = Math.min(cur.firstFy, fy);
      if (fy > cur.latestFy) {
        cur.latestFy = fy;
        cur.latestCost = cost;
      }
      if (start && (!cur.firstStart || start < cur.firstStart)) cur.firstStart = start;
      if (end && (!cur.lastEnd || end > cur.lastEnd)) cur.lastEnd = end;
    }
  }
  const grants = [...byProject.values()];
  for (const gr of grants) gr.activeByDates = gr.lastEnd != null && gr.lastEnd >= today;

  const institutes = new Map<string, { total: number; active: number }>();
  const mechanisms = new Map<string, number>();
  let activeAnnualCost = 0;
  for (const gr of grants) {
    const inst = institutes.get(gr.institute) ?? { total: 0, active: 0 };
    inst.total += 1;
    if (gr.activeByDates) inst.active += 1;
    institutes.set(gr.institute, inst);
    const fam = mechanismFamily(gr.mechanism);
    mechanisms.set(fam, (mechanisms.get(fam) ?? 0) + 1);
    if (gr.activeByDates && gr.latestCost != null) activeAnnualCost += gr.latestCost;
  }

  // K->R01: high-confidence bar (see header). Any weaker-tier K or R01-class
  // PI match on this HCP poisons identity certainty -> omit.
  let kToR01: HcpGrantFacts["kToR01"] = null;
  const kPi = grants.filter((x) => x.mechanism.startsWith("K") && x.role === "pi");
  const rPi = grants.filter((x) => R01_CLASS.has(x.mechanism) && x.role === "pi");
  const allProfileId = [...kPi, ...rPi].every((x) => x.matchMethod === "profile_id");
  if (kPi.length && rPi.length && allProfileId) {
    const kStarts = kPi.map((x) => x.firstStart).filter((s): s is string => s != null);
    const rStarts = rPi.map((x) => x.firstStart).filter((s): s is string => s != null);
    if (kStarts.length === kPi.length && rStarts.length === rPi.length) {
      const kMin = kStarts.sort()[0];
      const rMin = rStarts.sort()[0];
      if (kMin < rMin) {
        const kFy = Math.min(...kPi.map((x) => x.firstFy));
        const rFy = Math.min(...rPi.map((x) => x.firstFy));
        kToR01 = { kFirstFy: kFy, rFirstFy: rFy };
      }
    }
  }

  return {
    total: grants.length,
    activeByDates: grants.filter((x) => x.activeByDates).length,
    institutes: [...institutes.entries()]
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => (a.code === "NCI" ? -1 : b.code === "NCI" ? 1 : b.total - a.total)),
    mechanisms: [...mechanisms.entries()].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count),
    contactPiCount: grants.filter((x) => x.role === "pi").length,
    mpiCount: grants.filter((x) => x.role === "co_pi").length,
    latestFy: grants.length ? Math.max(...grants.map((x) => x.latestFy)) : null,
    activeIndependentAsContactPi: grants.filter((x) => x.activeByDates && x.role === "pi" && !x.mechanism.startsWith("K")).length,
    firstIndependentFy: (() => {
      const indep = grants.filter((x) => x.role === "pi" && !x.mechanism.startsWith("K"));
      return indep.length ? Math.min(...indep.map((x) => x.firstFy)) : null;
    })(),
    activeAnnualCost,
    kToR01,
    grants,
  };
}
