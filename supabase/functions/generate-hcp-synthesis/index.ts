import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RequestBody {
  hcp_id?: string;
  therapeutic_area?: string;
  force_refresh?: boolean;
}

interface ThemeRow {
  theme_name: string;
  centrality: string;
  paper_count: number;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const hcpId = body.hcp_id?.trim();
    const therapeuticArea = body.therapeutic_area?.trim();
    const forceRefresh = body.force_refresh === true;

    if (!hcpId || !isValidUuid(hcpId)) {
      return jsonResponse({ error: "hcp_id must be a valid UUID" }, 400);
    }

    if (!therapeuticArea) {
      return jsonResponse({ error: "therapeutic_area is required" }, 400);
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

    console.log(`Synthesis request for user ${user.id}, hcp ${hcpId}, TA ${therapeuticArea}`);

    if (!forceRefresh) {
      const { data: cachedRow, error: cacheError } = await serviceClient
        .from("hcp_ai_overviews")
        .select("body, generated_at")
        .eq("hcp_id", hcpId)
        .eq("synthesis_type", "overview")
        .eq("therapeutic_area", therapeuticArea)
        .maybeSingle();

      if (cacheError) {
        console.error("Cache lookup failed", cacheError);
        return jsonResponse({ error: "Database error" }, 500);
      }

      if (cachedRow) {
        console.log("Cache hit");
        return jsonResponse({
          body: cachedRow.body,
          cached: true,
          generated_at: cachedRow.generated_at,
        });
      }
    }

    console.log("Cache miss — generating");

    const { data: hcpRow, error: hcpError } = await serviceClient
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_canonical, cohort_classification")
      .eq("id", hcpId)
      .maybeSingle();

    if (hcpError) {
      console.error("HCP fetch failed", hcpError);
      return jsonResponse({ error: "Database error" }, 500);
    }

    if (!hcpRow) {
      return jsonResponse({ error: "HCP not found" }, 404);
    }

    const { data: themeRows, error: themesError } = await serviceClient
      .from("hcp_research_themes_v2")
      .select("theme_name, centrality, paper_count")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area", therapeuticArea)
      .gte("display_rank", 1)
      .order("display_rank", { ascending: true })
      .limit(10);

    if (themesError) {
      console.error("Themes fetch failed", themesError);
      return jsonResponse({ error: "Database error" }, 500);
    }

    const themes = (themeRows ?? []) as ThemeRow[];

    if (themes.length === 0) {
      return jsonResponse(
        { error: "Insufficient research themes to generate synthesis", needs_more_data: true },
        422,
      );
    }

    const firstName = hcpRow.first_name ?? "";
    const lastName = hcpRow.last_name ?? "";
    const institution = hcpRow.institution_canonical ?? "Unknown institution";
    const cohort = hcpRow.cohort_classification ?? "Unknown";

    const themesList = themes
      .map((t) => `- ${t.theme_name} (${t.centrality}, ${t.paper_count} papers)`)
      .join("\n");

    const userPrompt = `You are writing a 3-sentence scientific identity synthesis for an MSL (Medical Science Liaison) who has not yet engaged with this HCP. The MSL is browsing a list of potential investigators to track. Your synthesis is the hook that helps them decide whether this HCP is worth their attention.

HCP: ${firstName} ${lastName}
Institution: ${institution}
Cohort: ${cohort}
Therapeutic area: ${therapeuticArea}

Top research themes (ranked by publication count):
${themesList}

Write exactly 3 sentences:
- Sentence 1: Their scientific identity. What do they primarily work on? Be specific (mention 1-2 themes).
- Sentence 2: What's distinctive about their work. Why are they not just another oncologist? What's their angle, lens, or signature contribution?
- Sentence 3: Why an MSL should care. What would the MSL learn or gain from tracking them?

Tone: Clinical, factual, confident. No filler words. No "they are an expert in" boilerplate. Start sentence 1 with an active verb or noun phrase, not their name. Do not exceed 75 words total.

Output only the 3 sentences. No labels, no preamble, no markdown.`;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "Anthropic API key not configured" }, 500);
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 250,
      messages: [{ role: "user", content: userPrompt }],
    });

    const synthesisBody = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();

    if (!synthesisBody) {
      return jsonResponse({ error: "Claude returned empty response" }, 500);
    }

    const generatedAt = new Date().toISOString();

    const { error: upsertError } = await serviceClient
      .from("hcp_ai_overviews")
      .upsert(
        {
          hcp_id: hcpId,
          synthesis_type: "overview",
          therapeutic_area: therapeuticArea,
          body: synthesisBody,
          model_used: "claude-sonnet-4-6",
          prompt_tokens: message.usage?.input_tokens ?? null,
          completion_tokens: message.usage?.output_tokens ?? null,
          generated_at: generatedAt,
        },
        { onConflict: "hcp_id,synthesis_type,therapeutic_area" },
      );

    if (upsertError) {
      console.error("Cache write failed", upsertError);
    }

    return jsonResponse({
      body: synthesisBody,
      cached: false,
      generated_at: generatedAt,
    });
  } catch (err) {
    console.error("Unhandled generate-hcp-synthesis error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
