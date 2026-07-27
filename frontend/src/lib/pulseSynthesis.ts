import { supabase } from "./supabase";

// Pulse TA-level synthesis reader. Mirrors aiOverviews.getHcpOverview: read the
// cache table first (open to authenticated), and only on a miss call the Edge
// Function to generate + cache. The page never calls the model on every view.

export interface PulseSynthesis {
  body: string;
  cached: boolean;
  generated_at: string;
}

export async function getPulseSynthesis(
  taSlug: string,
  windowStart: string,
  windowEnd: string,
): Promise<PulseSynthesis | null> {
  try {
    const { data: cached } = await supabase
      .from("pulse_ai_synthesis")
      .select("body, generated_at")
      .eq("ta_slug", taSlug)
      .eq("window_start", windowStart)
      .eq("window_end", windowEnd)
      .maybeSingle();

    if (cached) {
      return { body: cached.body, cached: true, generated_at: cached.generated_at };
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn("getPulseSynthesis: no session token available");
      return null;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://tflrfkocbdkizmkhimiw.supabase.co";
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-pulse-synthesis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ta_slug: taSlug }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Unknown error" }));
      console.warn("getPulseSynthesis: Edge Function error", response.status, errorBody);
      return null;
    }

    return (await response.json()) as PulseSynthesis;
  } catch (err) {
    console.warn("getPulseSynthesis: error", err);
    return null;
  }
}
