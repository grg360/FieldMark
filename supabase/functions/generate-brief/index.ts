import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRIEF_TTL_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface BriefOpportunity {
  priority: "high" | "medium" | "low";
  category: string;
  recommendation: string;
  supporting_evidence: Array<{
    type: "insight" | "follow_up" | "publication" | "theme" | "collaborator";
    label: string;
  }>;
}

interface BriefContent {
  version: 1;
  hcp: {
    id: string;
    name: string;
    institution: string;
    specialty: string;
    archetype: string | null;
    score: number | null;
    rank: number | null;
    rank_total: number | null;
  };
  relationship: {
    exists: boolean;
    status: string | null;
    first_added_at: string | null;
  };
  insights: Array<{
    body: string;
    interaction_type: string;
    insight_strength: string;
    occurred_at: string;
  }>;
  follow_ups: Array<{
    body: string;
    due_at: string | null;
    priority: string;
    overdue: boolean;
  }>;
  publications: Array<{ title: string; year: number }>;
  themes: string[];
  collaborators: Array<{ name: string; institution: string | null }>;
  opportunities: BriefOpportunity[] | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function fullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

function lastNameFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1] : name;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function formatInsightsBlock(
  insights: Array<{
    body: string;
    interaction_type: string;
    insight_strength: string;
    occurred_at: string;
  }>,
): string {
  if (insights.length === 0) return "None recorded yet.";
  return insights
    .map((insight, index) => {
      const date = insight.occurred_at ? new Date(insight.occurred_at).toISOString().slice(0, 10) : "unknown date";
      return `${index + 1}. [${date}] (${insight.interaction_type}, ${insight.insight_strength}) ${insight.body}`;
    })
    .join("\n");
}

function formatFollowUpsBlock(
  followUps: Array<{
    body: string;
    due_at: string | null;
    priority: string;
    overdue: boolean;
  }>,
): string {
  if (followUps.length === 0) return "None open.";
  return followUps
    .map((followUp, index) => {
      const due = followUp.due_at ? new Date(followUp.due_at).toISOString().slice(0, 10) : "no due date";
      const overdue = followUp.overdue ? " (OVERDUE)" : "";
      return `${index + 1}. [${followUp.priority}] Due ${due}${overdue}: ${followUp.body}`;
    })
    .join("\n");
}

function formatPublicationsBlock(publications: Array<{ title: string; year: number }>): string {
  if (publications.length === 0) return "None found.";
  return publications.map((pub) => `- (${pub.year}) ${pub.title}`).join("\n");
}

function formatThemesBlock(themes: string[]): string {
  if (themes.length === 0) return "None identified.";
  return themes.map((theme) => `- ${theme}`).join("\n");
}

function formatCollaboratorsBlock(
  collaborators: Array<{ name: string; institution: string | null }>,
): string {
  if (collaborators.length === 0) return "None found.";
  return collaborators
    .map((collaborator) => {
      const institution = collaborator.institution ? ` (${collaborator.institution})` : "";
      return `- ${collaborator.name}${institution}`;
    })
    .join("\n");
}

function buildPrompt(params: {
  userFirstName: string;
  userCompany: string;
  hcpName: string;
  hcpLastName: string;
  hcpInstitution: string;
  hcpArchetype: string;
  hcpSpecialty: string;
  insightsBlock: string;
  followUpsBlock: string;
  publicationsBlock: string;
  themesBlock: string;
  collaboratorsBlock: string;
}): string {
  return `You are FieldMark, an MSL field intelligence platform. You are generating Strategic Engagement Opportunities for ${params.userFirstName}, an MSL at ${params.userCompany}, who is preparing to engage with Dr. ${params.hcpName} (${params.hcpInstitution}, ${params.hcpArchetype} in ${params.hcpSpecialty}).

You have access to the following data:

INSIGHTS RECORDED BY ${params.userFirstName} (most recent first):
${params.insightsBlock}

OPEN FOLLOW-UPS (commitments ${params.userFirstName} has made):
${params.followUpsBlock}

RECENT PUBLICATIONS BY DR. ${params.hcpLastName}:
${params.publicationsBlock}

RESEARCH THEMES:
${params.themesBlock}

TOP COLLABORATORS:
${params.collaboratorsBlock}

YOUR TASK:
Generate 3-5 Strategic Engagement Opportunities for ${params.userFirstName}'s upcoming engagement with Dr. ${params.hcpLastName}.

Each opportunity must:
1. Have a clear PRIORITY (high, medium, or low) based on urgency and impact
2. Have a short CATEGORY label that classifies the type of opportunity. Use one of:
   - "Relationship Hygiene" (overdue follow-ups, broken commitments, stale relationships)
   - "Scientific Dialogue" (research-driven conversation hooks based on publications or themes)
   - "Collaborator Opportunity" (network-driven, stakeholder mapping)
   - "Continuity Check" (baseline reference probing, status checks)
   - "Strategic Positioning" (longer-arc relationship building moves)
3. Be 1-2 sentences MAXIMUM. No filler. No consulting-speak. Briefing-notes style.
4. Be grounded in specific evidence from the data above
5. Cite specific evidence used

PRIORITY GUIDELINES:
- high: Overdue commitments, time-sensitive opportunities, broken promises
- medium: Active research alignment, scientific dialogue opportunities, immediate-engagement value
- low: Background context, network mapping, exploratory questions

DO NOT:
- Invent observations ${params.userFirstName} did not record
- Recommend specific products, dosages, or clinical actions
- Reference any data not present in the inputs above
- Write paragraph-length recommendations

RESPONSE FORMAT -- return ONLY valid JSON, no markdown, no preamble:

{
  "opportunities": [
    {
      "priority": "high" | "medium" | "low",
      "category": "string -- one of the five category labels above",
      "recommendation": "string -- the actionable recommendation, 1-2 sentences MAXIMUM",
      "supporting_evidence": [
        { "type": "insight" | "follow_up" | "publication" | "theme" | "collaborator", "label": "string -- short identifier" }
      ]
    }
  ]
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    let body: { hcpId?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const hcpId = body.hcpId?.trim();
    if (!hcpId || !isValidUuid(hcpId)) {
      return jsonResponse({ error: "hcpId must be a valid UUID" }, 400);
    }

    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth validation failed", authError);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    console.log(`Brief request for user ${user.id}, hcp ${hcpId}`);

    const { data: cachedBrief, error: cacheError } = await serviceClient
      .from("msl_hcp_briefs")
      .select("*")
      .eq("user_id", user.id)
      .eq("hcp_id", hcpId)
      .eq("ai_status", "generated")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (cacheError) {
      console.error("Cache lookup failed", cacheError);
      return jsonResponse({ error: "Database error", details: cacheError.message }, 500);
    }

    if (cachedBrief) {
      console.log("Cache hit");
      return jsonResponse(cachedBrief, 200);
    }

    console.log("Cache miss -- generating");

    const [
      hcpResult,
      risingStarResult,
      establishedResult,
      relationshipResult,
      themesResult,
      publicationsResult,
      collaboratorsResult,
      profileResult,
    ] = await Promise.all([
      serviceClient
        .from("hcps_v2")
        .select("id, first_name, last_name, institution_normalized, institution_canonical, npi_specialty, cohort_classification, cohort_score")
        .eq("id", hcpId)
        .maybeSingle(),
      serviceClient
        .from("hcp_rising_star_ranks_v3")
        .select("rank, us_rank, rising_star_percentile, archetype")
        .eq("hcp_id", hcpId)
        .order("rising_star_percentile", { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("hcp_established_ranks_v3")
        .select("rank, cohort_score")
        .eq("hcp_id", hcpId)
        .eq("scope_type", "region")
        .eq("scope_value", "US")
        .order("cohort_score", { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("msl_hcp_relationships")
        .select("id, status, first_added_at")
        .eq("user_id", user.id)
        .eq("hcp_id", hcpId)
        .maybeSingle(),
      serviceClient
        .from("hcp_research_themes_v2")
        .select("theme_name")
        .eq("hcp_id", hcpId)
        .order("display_rank", { ascending: true })
        .limit(5),
      serviceClient
        .from("publication_therapeutic_areas_v2")
        .select("publications_v2!inner(title, pub_year)")
        .eq("hcp_id", hcpId)
        .order("publications_v2(pub_year)", { ascending: false })
        .limit(5),
      serviceClient
        .from("hcp_top_collaborators_v2")
        .select("rank, collaborator_hcp_id")
        .eq("hcp_id", hcpId)
        .order("rank", { ascending: true })
        .limit(3),
      serviceClient
        .from("msl_profiles")
        .select("first_name, company")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    if (hcpResult.error) {
      console.error("HCP fetch failed", hcpResult.error);
      return jsonResponse({ error: "Database error", details: hcpResult.error.message }, 500);
    }

    const hcpRow = hcpResult.data;
    if (!hcpRow) {
      return jsonResponse({ error: "HCP not found" }, 404);
    }

    const hcpName = fullName(hcpRow.first_name, hcpRow.last_name) || "Unknown HCP";
    const hcpInstitution = hcpRow.institution_canonical ?? hcpRow.institution_normalized ?? "Unknown institution";
    const hcpSpecialty = hcpRow.npi_specialty ?? "Unknown specialty";
    const cohort = hcpRow.cohort_classification ?? "";

    const risingStar = risingStarResult.data;
    const established = establishedResult.data;

    let archetype: string | null = risingStar?.archetype ?? null;
    let score: number | null = hcpRow.cohort_score != null ? Number(hcpRow.cohort_score) : null;
    let rank: number | null = null;

    if (cohort === "rising_star" && risingStar) {
      archetype = risingStar.archetype ?? archetype;
      score = risingStar.rising_star_percentile != null ? Number(risingStar.rising_star_percentile) : score;
      rank = risingStar.us_rank != null ? Number(risingStar.us_rank) : risingStar.rank != null ? Number(risingStar.rank) : null;
    } else if (cohort === "established" && established) {
      score = established.cohort_score != null ? Number(established.cohort_score) : score;
      rank = established.rank != null ? Number(established.rank) : null;
    } else if (risingStar) {
      archetype = risingStar.archetype ?? archetype;
      score = risingStar.rising_star_percentile != null ? Number(risingStar.rising_star_percentile) : score;
      rank = risingStar.us_rank != null ? Number(risingStar.us_rank) : risingStar.rank != null ? Number(risingStar.rank) : null;
    } else if (established) {
      score = established.cohort_score != null ? Number(established.cohort_score) : score;
      rank = established.rank != null ? Number(established.rank) : null;
    }

    const hcpArchetype = (archetype ?? cohort) || "HCP";

    let insights: BriefContent["insights"] = [];
    let followUps: BriefContent["follow_ups"] = [];

    const relationship = relationshipResult.data;
    if (relationship) {
      const now = Date.now();
      const [insightsResult, followUpsResult] = await Promise.all([
        serviceClient
          .from("msl_hcp_notes")
          .select("body, interaction_type, insight_strength, occurred_at")
          .eq("relationship_id", relationship.id)
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("occurred_at", { ascending: false })
          .limit(5),
        serviceClient
          .from("msl_hcp_next_actions")
          .select("body, due_at, priority")
          .eq("relationship_id", relationship.id)
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .is("completed_at", null)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(10),
      ]);

      if (insightsResult.error) {
        console.error("Insights fetch failed", insightsResult.error);
      } else {
        insights = (insightsResult.data ?? []).map((row) => ({
          body: String(row.body ?? ""),
          interaction_type: String(row.interaction_type ?? "other"),
          insight_strength: String(row.insight_strength ?? "medium"),
          occurred_at: String(row.occurred_at ?? ""),
        }));
      }

      if (followUpsResult.error) {
        console.error("Follow-ups fetch failed", followUpsResult.error);
      } else {
        followUps = (followUpsResult.data ?? []).map((row) => {
          const dueAt = row.due_at ? String(row.due_at) : null;
          const overdue = dueAt !== null && new Date(dueAt).getTime() < now;
          return {
            body: String(row.body ?? ""),
            due_at: dueAt,
            priority: String(row.priority ?? "normal"),
            overdue,
          };
        });
      }
    }

    const themes = (themesResult.data ?? [])
      .map((row) => String(row.theme_name ?? "").trim())
      .filter(Boolean);

    const publicationRows = publicationsResult.data ?? [];
    const publications = publicationRows
      .map((row) => {
        const pub = (row as { publications_v2?: { title?: string; pub_year?: number | null } | Array<{ title?: string; pub_year?: number | null }> }).publications_v2;
        const resolved = Array.isArray(pub) ? pub[0] : pub;
        if (!resolved?.title) return null;
        return {
          title: String(resolved.title),
          year: resolved.pub_year != null ? Number(resolved.pub_year) : 0,
        };
      })
      .filter((pub): pub is { title: string; year: number } => pub !== null);

    const collaboratorRows = collaboratorsResult.data ?? [];
    const collaboratorIds = collaboratorRows
      .map((row) => String(row.collaborator_hcp_id ?? ""))
      .filter(Boolean);

    let collaborators: BriefContent["collaborators"] = [];
    if (collaboratorIds.length > 0) {
      const { data: collaboratorHcps, error: collaboratorHcpsError } = await serviceClient
        .from("hcps_v2")
        .select("id, first_name, last_name, institution_canonical, institution_normalized")
        .in("id", collaboratorIds);

      if (collaboratorHcpsError) {
        console.error("Collaborator HCP fetch failed", collaboratorHcpsError);
      } else {
        const nameMap = new Map<string, { name: string; institution: string | null }>();
        for (const collabHcp of collaboratorHcps ?? []) {
          nameMap.set(String(collabHcp.id), {
            name: fullName(collabHcp.first_name, collabHcp.last_name) || "Unknown",
            institution: collabHcp.institution_canonical ?? collabHcp.institution_normalized ?? null,
          });
        }
        collaborators = collaboratorRows
          .map((row) => nameMap.get(String(row.collaborator_hcp_id)))
          .filter((entry): entry is { name: string; institution: string | null } => Boolean(entry));
      }
    }

    const userFirstName = profileResult.data?.first_name?.trim() || "the MSL";
    const userCompany = profileResult.data?.company?.trim() || "their company";
    const hcpLastName = lastNameFromFullName(hcpName);

    const prompt = buildPrompt({
      userFirstName,
      userCompany,
      hcpName,
      hcpLastName,
      hcpInstitution,
      hcpArchetype,
      hcpSpecialty,
      insightsBlock: formatInsightsBlock(insights),
      followUpsBlock: formatFollowUpsBlock(followUps),
      publicationsBlock: formatPublicationsBlock(publications),
      themesBlock: formatThemesBlock(themes),
      collaboratorsBlock: formatCollaboratorsBlock(collaborators),
    });

    let opportunities: BriefOpportunity[] | null = null;
    let aiStatus: "generated" | "failed" = "generated";
    let aiError: string | null = null;

    if (!anthropicApiKey) {
      aiStatus = "failed";
      aiError = "ANTHROPIC_API_KEY is not configured";
      console.error(aiError);
    } else {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const startedAt = Date.now();

      try {
        const message = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        });

        console.log(`Claude responded in ${Date.now() - startedAt} ms`);

        const textBlock = message.content.find((block) => block.type === "text");
        const responseText = textBlock && textBlock.type === "text" ? textBlock.text : "";

        try {
          const parsed = extractJson(responseText) as { opportunities?: Partial<BriefOpportunity>[] };
          opportunities = (parsed.opportunities ?? []).map((opp: Partial<BriefOpportunity>) => ({
            priority: (opp.priority as "high" | "medium" | "low") ?? "medium",
            category: typeof opp.category === "string" ? opp.category : "Strategic Positioning",
            recommendation: typeof opp.recommendation === "string" ? opp.recommendation : "",
            supporting_evidence: Array.isArray(opp.supporting_evidence) ? opp.supporting_evidence : [],
          }));
        } catch (parseErr) {
          aiStatus = "failed";
          aiError = parseErr instanceof Error ? parseErr.message : String(parseErr);
          console.error("Failed to parse Claude JSON response", parseErr);
        }
      } catch (claudeErr) {
        aiStatus = "failed";
        aiError = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
        console.error("Claude API error", claudeErr);
      }
    }

    const briefContent: BriefContent = {
      version: 1,
      hcp: {
        id: hcpId,
        name: hcpName,
        institution: hcpInstitution,
        specialty: hcpSpecialty,
        archetype,
        score,
        rank,
        rank_total: null,
      },
      relationship: {
        exists: Boolean(relationship),
        status: relationship?.status ?? null,
        first_added_at: relationship?.first_added_at ?? null,
      },
      insights,
      follow_ups: followUps,
      publications,
      themes,
      collaborators,
      opportunities,
    };

    const expiresAt = new Date(Date.now() + BRIEF_TTL_MS).toISOString();
    const nowIso = new Date().toISOString();

    const { data: storedBrief, error: upsertError } = await serviceClient
      .from("msl_hcp_briefs")
      .upsert(
        {
          user_id: user.id,
          hcp_id: hcpId,
          has_relationship: Boolean(relationship),
          content: briefContent,
          expires_at: expiresAt,
          ai_status: aiStatus,
          ai_error: aiError,
          generated_at: nowIso,
        },
        { onConflict: "user_id,hcp_id" },
      )
      .select("*")
      .single();

    if (upsertError) {
      console.error("Brief upsert failed", upsertError);
      return jsonResponse({ error: "Database error", details: upsertError.message }, 500);
    }

    console.log("Brief stored");
    return jsonResponse(storedBrief, 200);
  } catch (err) {
    console.error("Unhandled generate-brief error", err);
    const details = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: "Internal server error", details }, 500);
  }
});
