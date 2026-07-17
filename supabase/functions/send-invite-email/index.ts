import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// send-invite-email — JWT-gated invite email via Resend.
//
// Security model (mirrors the admin RPCs' no-actor principle):
//   * The caller's JWT is validated; the SENDER is always auth.uid().
//   * The invite CODE is server-picked from the caller's own active invites — the
//     client never says which code to send, so nobody can email someone else's.
//   * RESEND_API_KEY lives only in Edge Function secrets, never the frontend.
// Rate limit: caller must hold an active invite (uses_remaining > 0), and is
// capped at DAILY_SEND_CAP emails per rolling 24h (logged in invite_email_sends).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAILY_SEND_CAP = 20;
const NOTE_MAX = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inviter's TA → display label for the value line. Falls back to "your
// therapeutic area" when the inviter has no resolvable TA.
const TA_LABEL: Record<string, string> = {
  nsclc: "NSCLC",
  "atopic-dermatitis": "Atopic Dermatitis",
  oncology: "Oncology",
  immunology: "Immunology",
  hepatology: "Hepatology",
  "rare-disease": "Rare Disease",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fullName(first: string | null, last: string | null): string {
  const n = `${first ?? ""} ${last ?? ""}`.trim();
  return n === "" ? "A colleague" : n;
}

function taLabelFor(indicationSlug: string | null, taSlug: string | null): string {
  const key = (indicationSlug ?? taSlug ?? "").toLowerCase().trim();
  return TA_LABEL[key] ?? "your therapeutic area";
}

// Email-safe HTML: table layout + inline styles (no fl+ex/grid/CSS vars). Renders
// the locked spec — amber wordmark, peer line, hero, TA value line, amber CTA,
// invitation-only line, Bessel Analytics footer.
function renderEmailHtml(opts: {
  inviterName: string;
  inviterFirst: string;
  taLabel: string;
  joinUrl: string;
  note: string | null;
}): string {
  const { inviterName, inviterFirst, taLabel, joinUrl, note } = opts;
  const noteBlock = note
    ? `
        <tr><td style="padding:20px 40px 0 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F3EC;border-radius:4px;">
            <tr><td style="padding:14px 16px;border-left:3px solid #BA7517;">
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#8A8378;margin-bottom:6px;">A note from ${escapeHtml(inviterFirst)}</div>
              <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#4A453D;">${escapeHtml(note)}</div>
            </td></tr>
          </table>
        </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#F5F1EA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F1EA;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#FFFFFF;border-radius:8px;border:1px solid #EAE3D8;">
        <tr><td style="padding:40px 40px 0 40px;">
          <div style="font-family:'Courier New',Courier,monospace;font-size:18px;font-weight:700;letter-spacing:0.18em;color:#BA7517;">FIELDMARK</div>
        </td></tr>
        <tr><td style="padding:22px 40px 0 40px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#8A8378;">${escapeHtml(inviterName)} invited you to join FieldMark.</div>
        </td></tr>
        <tr><td style="padding:14px 40px 0 40px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:500;line-height:1.35;color:#1A1814;">We see the nebula before the star.</div>
        </td></tr>
        <tr><td style="padding:16px 40px 0 40px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#4A453D;">FieldMark is a private intelligence network for medical affairs. It surfaces the rising KOLs in ${escapeHtml(taLabel)} &mdash; the researchers gaining influence now, before they&rsquo;re on everyone&rsquo;s radar &mdash; mapped across publications, trials, and collaborations.</div>
        </td></tr>${noteBlock}
        <tr><td align="center" style="padding:30px 40px 0 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" bgcolor="#BA7517" style="border-radius:6px;">
              <a href="${joinUrl}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#FAEEDA;text-decoration:none;border-radius:6px;">Claim your access</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="padding:14px 40px 0 40px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8A8378;">Membership is invitation-only.</div>
        </td></tr>
        <tr><td style="padding:30px 40px 0 40px;">
          <div style="border-top:1px solid #E6E0D6;font-size:0;line-height:0;">&nbsp;</div>
        </td></tr>
        <tr><td style="padding:20px 40px 40px 40px;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9A9488;">You received this because ${escapeHtml(inviterName)} believed FieldMark would be valuable to your work.</div>
          <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:0.14em;color:#B8B2A6;margin-top:14px;">BESSEL ANALYTICS</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderEmailText(opts: {
  inviterName: string;
  taLabel: string;
  joinUrl: string;
  note: string | null;
}): string {
  const { inviterName, taLabel, joinUrl, note } = opts;
  return [
    "FIELDMARK",
    "",
    `${inviterName} invited you to join FieldMark.`,
    "",
    "We see the nebula before the star.",
    "",
    `FieldMark is a private intelligence network for medical affairs. It surfaces the rising KOLs in ${taLabel} — the researchers gaining influence now, before they're on everyone's radar — mapped across publications, trials, and collaborations.`,
    ...(note ? ["", `A note from ${inviterName}: ${note}`] : []),
    "",
    `Claim your access: ${joinUrl}`,
    "",
    "Membership is invitation-only.",
    "",
    `You received this because ${inviterName} believed FieldMark would be valuable to your work.`,
    "BESSEL ANALYTICS",
  ].join("\n");
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const appOrigin = (Deno.env.get("APP_ORIGIN") ?? "https://app.besselanalytics.com").replace(/\/$/, "");
    const fromEmail = Deno.env.get("INVITE_FROM_EMAIL") ?? "FieldMark <invites@besselanalytics.com>";

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
      console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    let body: { recipientEmail?: string; note?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const recipientEmail = (body.recipientEmail ?? "").trim().toLowerCase();
    if (!recipientEmail || !EMAIL_RE.test(recipientEmail) || recipientEmail.length > 254) {
      return jsonResponse({ error: "A valid recipient email is required" }, 400);
    }
    const note = (body.note ?? "").trim().slice(0, NOTE_MAX) || null;

    // Validate the JWT — the SENDER is always this authenticated user.
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Per-user-per-day rate limit (spam guard).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: sentCount, error: countErr } = await serviceClient
      .from("invite_email_sends")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", user.id)
      .gt("sent_at", since);
    if (countErr) {
      console.error("rate-limit count failed", countErr);
      return jsonResponse({ error: "Database error" }, 500);
    }
    if ((sentCount ?? 0) >= DAILY_SEND_CAP) {
      return jsonResponse(
        { error: `Daily invite-email limit reached (${DAILY_SEND_CAP}). Try again tomorrow.` },
        429,
      );
    }

    // Server-pick the CALLER'S OWN active invite — client never supplies the code.
    const { data: invite, error: inviteErr } = await serviceClient
      .from("invites")
      .select("code, uses_remaining, is_active")
      .eq("inviter_id", user.id)
      .eq("is_active", true)
      .gt("uses_remaining", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inviteErr) {
      console.error("invite lookup failed", inviteErr);
      return jsonResponse({ error: "Database error" }, 500);
    }
    if (!invite) {
      return jsonResponse({ error: "You have no invites remaining to send." }, 400);
    }

    // Inviter identity + TA for personalization.
    const { data: profile } = await serviceClient
      .from("msl_profiles")
      .select("first_name, last_name, default_ta_slug, default_indication_slug")
      .eq("user_id", user.id)
      .maybeSingle();

    const inviterName = fullName(profile?.first_name ?? null, profile?.last_name ?? null);
    const inviterFirst = (profile?.first_name ?? "").trim() || inviterName;
    const taLabel = taLabelFor(profile?.default_indication_slug ?? null, profile?.default_ta_slug ?? null);
    const joinUrl = `${appOrigin}/join/${invite.code}`;

    const html = renderEmailHtml({ inviterName, inviterFirst, taLabel, joinUrl, note });
    const text = renderEmailText({ inviterName, taLabel, joinUrl, note });
    const subject = `${inviterName} invited you to join FieldMark`;

    // Send via Resend.
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        reply_to: user.email ?? undefined,
        subject,
        html,
        text,
      }),
    });

    if (!resendResp.ok) {
      const detail = await resendResp.text();
      console.error("Resend send failed", resendResp.status, detail);
      return jsonResponse({ error: "Failed to send the invite email. Please try again." }, 502);
    }

    // Log the send (rate-limit + audit). Non-fatal if it fails.
    const { error: logErr } = await serviceClient.from("invite_email_sends").insert({
      sender_id: user.id,
      recipient_email: recipientEmail,
      invite_code: invite.code,
    });
    if (logErr) console.error("send log insert failed (non-fatal)", logErr);

    return jsonResponse({ ok: true, sentTo: recipientEmail }, 200);
  } catch (err) {
    console.error("send-invite-email error", err);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});
