import { supabase } from "./supabase";

export interface HcpOverview {
  body: string;
  cached: boolean;
  generated_at: string;
}

export async function getHcpOverview(
  hcpId: string,
  therapeuticArea: string = "NSCLC",
): Promise<HcpOverview | null> {
  try {
    const { data: cached } = await supabase
      .from("hcp_ai_overviews")
      .select("body, generated_at")
      .eq("hcp_id", hcpId)
      .eq("synthesis_type", "overview")
      .eq("therapeutic_area", therapeuticArea)
      .maybeSingle();

    if (cached) {
      return {
        body: cached.body,
        cached: true,
        generated_at: cached.generated_at,
      };
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn("getHcpOverview: no session token available");
      return null;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "https://tflrfkocbdkizmkhimiw.supabase.co";
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-hcp-synthesis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hcp_id: hcpId, therapeutic_area: therapeuticArea }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Unknown error" }));
      console.warn("getHcpOverview: Edge Function error", response.status, errorBody);
      return null;
    }

    const data = await response.json() as HcpOverview;
    return data;
  } catch (err) {
    console.warn("getHcpOverview: error", err);
    return null;
  }
}
