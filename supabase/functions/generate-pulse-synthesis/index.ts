import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";

// Pulse TA-level synthesis. One short paragraph per (ta_slug, window), generated
// from ONLY current-window facts and cached. Mirrors generate-hcp-synthesis.
//
// The critical constraint lives in the data layer, not the prompt: the facts are
// fetched via get_pulse_synthesis_facts(), which returns ONLY the allowed fields
// (per-theme name/cur_pubs/cur_share/reviews/trials/commentary/guidance, plus
// totals.current_pubs, the window dates, and events). prior_pubs, prior_share,
// any movement figure, the monthly series, and lifetime_pubs never leave the DB —
// so the model cannot narrate change, which our movement caveat flags unreliable.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODEL = "claude-sonnet-4-6";

interface RequestBody {
  ta_slug?: string;
  force_refresh?: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPrompt(facts: Record<string, unknown>): string {
  const ta = facts.therapeutic_area ?? "this therapeutic area";
  return `You are writing a brief scientific-attention synthesis that opens a research-intelligence page for the ${ta} therapeutic area. The reader is a scientifically sophisticated professional (medical affairs, medical science liaison). It summarises where published scientific attention sits across research themes in one recent publication window.

You are given ONLY current-window facts as JSON. Per theme: cur_pubs (publications in the window), cur_share (that theme's percent of the window's primary-theme publications), and a composition of those publications — reviews, trials (clinical trials), commentary (editorials/comments/letters), and guidance (practice guidelines/consensus statements). Also given: totals.current_pubs (the window's primary-theme total), the window dates, and events (guidelines, consensus statements, or retractions published in the window).

FACTS:
${JSON.stringify(facts, null, 2)}

Write exactly three sentences, roughly 120 words total, describing where scientific attention concentrates in this window, what the composition of that attention suggests (a theme weighted toward reviews reads differently from one weighted toward trials), and any events in the window.

Constraints:
- Lead with the finding, not the methodology. Do not open with the total publication count or the window dates — both are already displayed directly above this paragraph. A number should support an observation, never precede it as the opening.
- Ground every claim in a number present in FACTS. Invent nothing — no counts, drug names, trial names, institutions, or claims about individuals not present in the data.
- This is a SINGLE-WINDOW snapshot. You have no prior-period or time-series data. Do not describe anything as growing, rising, declining, accelerating, emerging, surging, or trending, and do not imply any change over time.
- No hype and no importance adjectives ("groundbreaking", "critical", "notable"). Plain, precise, factual.
- Do not open with a fixed template or a stock phrase; let the data shape the first sentence. No preamble, no labels, no markdown.

Output only the paragraph.`;
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

    const taSlug = body.ta_slug?.trim().toLowerCase();
    const forceRefresh = body.force_refresh === true;
    if (!taSlug || !SLUG_RE.test(taSlug)) {
      return jsonResponse({ error: "ta_slug must be a lowercase slug" }, 400);
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

    // Fetch the allowed fact set. This also gives us the window dates, which key
    // the cache — so we read facts first, then decide hit/miss.
    const { data: facts, error: factsError } = await serviceClient
      .rpc("get_pulse_synthesis_facts", { p_ta_slug: taSlug });

    if (factsError) {
      console.error("Facts RPC failed", factsError);
      return jsonResponse({ error: "Database error" }, 500);
    }
    if (!facts || !facts.window || !Array.isArray(facts.themes)) {
      return jsonResponse({ error: "No Pulse facts for this therapeutic area", ta_slug: taSlug }, 404);
    }

    const windowStart: string = facts.window.current_start;
    const windowEnd: string = facts.window.current_end;

    if (!forceRefresh) {
      const { data: cachedRow, error: cacheError } = await serviceClient
        .from("pulse_ai_synthesis")
        .select("body, generated_at")
        .eq("ta_slug", taSlug)
        .eq("window_start", windowStart)
        .eq("window_end", windowEnd)
        .maybeSingle();

      if (cacheError) {
        console.error("Cache lookup failed", cacheError);
        return jsonResponse({ error: "Database error" }, 500);
      }
      if (cachedRow) {
        return jsonResponse({
          body: cachedRow.body,
          cached: true,
          generated_at: cachedRow.generated_at,
          window_start: windowStart,
          window_end: windowEnd,
        });
      }
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "Anthropic API key not configured" }, 500);
    }
    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: buildPrompt(facts) }],
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
      .from("pulse_ai_synthesis")
      .upsert(
        {
          ta_slug: taSlug,
          window_start: windowStart,
          window_end: windowEnd,
          body: synthesisBody,
          model_used: MODEL,
          prompt_tokens: message.usage?.input_tokens ?? null,
          completion_tokens: message.usage?.output_tokens ?? null,
          generated_at: generatedAt,
        },
        { onConflict: "ta_slug,window_start,window_end" },
      );

    if (upsertError) {
      console.error("Cache write failed", upsertError);
    }

    return jsonResponse({
      body: synthesisBody,
      cached: false,
      generated_at: generatedAt,
      window_start: windowStart,
      window_end: windowEnd,
    });
  } catch (err) {
    console.error("Unhandled generate-pulse-synthesis error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
