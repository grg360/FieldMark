import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { checkInvite, redeemInvite } from "../lib/invites";

const PENDING_INVITE_KEY = "fm_pending_invite";

type Phase = "validating" | "form" | "submitting" | "redeeming" | "check-email" | "error";

const Spinner = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
    <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
    <path d="M10 2a8 8 0 0 1 8 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="3" fill="white" fillOpacity="0.2" />
    <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">in</text>
  </svg>
);

/** Map a redeem_invite RPC error message to user-facing copy. */
function friendlyRedeemError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("paused")) return "Sign-ups are temporarily paused. Please try again later.";
  if (m.includes("cap reached")) return "We've reached capacity for now. Please check back soon.";
  if (m.includes("own invite")) return "You can't redeem your own invite link.";
  if (m.includes("invalid or exhausted")) return "This invite link is invalid or has already been fully used.";
  return "Something went wrong completing your sign-up. Please try again.";
}

export default function SignupScreen() {
  const { code: codeParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = codeParam ?? searchParams.get("invite") ?? null;

  const [phase, setPhase] = useState<Phase>("validating");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkedInLoading, setLinkedInLoading] = useState(false);

  async function completeRedemption(c: string) {
    setPhase("redeeming");
    const { data, error: redeemErr } = await redeemInvite(c);
    if (!redeemErr && data?.ok) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      navigate("/welcome");
      return;
    }
    const msg = redeemErr ?? "redemption failed";
    if (msg.toLowerCase().includes("already exists")) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      navigate("/me");
      return;
    }
    // Don't leave the user authenticated but profile-less (would loop at the gate).
    await supabase.auth.signOut();
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    setError(friendlyRedeemError(msg));
    setPhase("error");
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const effectiveCode = code ?? sessionStorage.getItem(PENDING_INVITE_KEY);
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      // Returning with a session (OAuth callback, email-confirmation link, or an
      // already-logged-in visitor).
      if (session?.user) {
        const { data: prof } = await supabase
          .from("msl_profiles").select("user_id").eq("user_id", session.user.id).maybeSingle();
        if (!active) return;
        if (prof) { navigate("/me"); return; }              // already onboarded
        if (effectiveCode) { await completeRedemption(effectiveCode); return; }
        setError("An invite is required to finish signing up."); setPhase("error"); return;
      }

      // No session: need a valid code to render the form.
      if (!effectiveCode) {
        setError("An invite is required to sign up. Ask a colleague for an invite link.");
        setPhase("error"); return;
      }
      const ok = await checkInvite(effectiveCode);
      if (!active) return;
      if (!ok) {
        setError("This invite link is invalid or has already been fully used.");
        setPhase("error"); return;
      }
      setPhase("form");
    })();

    return () => { active = false; };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleEmailSignup() {
    if (!code || phase === "submitting") return;
    setError(null);
    if (!email.trim() || !password) { setError("Email and password are required."); return; }
    setPhase("submitting");
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/join/${code}` },
    });
    if (signErr) { setError(signErr.message); setPhase("form"); return; }
    if (!data.session) {
      // Email confirmation is ON: no session yet. Persist the code so the
      // confirmation-link return can redeem, and tell the user to check email.
      sessionStorage.setItem(PENDING_INVITE_KEY, code);
      setPhase("check-email");
      return;
    }
    await completeRedemption(code);
  }

  async function handleLinkedIn() {
    if (!code) return;
    setError(null);
    setLinkedInLoading(true);
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "linkedin_oidc",
      options: { redirectTo: `${window.location.origin}/join/${code}` },
    });
    if (oauthErr) { setError(oauthErr.message); setLinkedInLoading(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleEmailSignup();
  }

  const busy = phase === "submitting" || phase === "redeeming";

  return (
    <div style={shell}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginTop: 88, textAlign: "center" }}>
        <div style={{ fontSize: 88, fontFamily: "monospace", fontWeight: 700, color: "#E8A020", lineHeight: 1 }}>FM</div>
        <div style={{ fontSize: 20, color: "#6B6A65", letterSpacing: "0.2em", textTransform: "uppercase", marginTop: 3 }}>FieldMark</div>
      </div>

      <div style={{ marginTop: 40, flex: 1 }}>
        {(phase === "validating" || phase === "redeeming") && (
          <div style={{ textAlign: "center", color: "#6B6A65", fontSize: 14, marginTop: 48, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <Spinner />
            {phase === "redeeming" ? "Setting up your account…" : "Checking your invite…"}
          </div>
        )}

        {phase === "check-email" && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#E8E6DF", marginBottom: 10 }}>Check your email</div>
            <div style={{ fontSize: 13, color: "#6B6A65", lineHeight: 1.6 }}>
              We sent a confirmation link to <span style={{ color: "#E8E6DF" }}>{email}</span>. Open it to finish
              creating your account — your invite is saved.
            </div>
          </div>
        )}

        {phase === "error" && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 10 }}>Can't continue</div>
            <div style={{ fontSize: 13, color: "#E8704E", lineHeight: 1.6, marginBottom: 24 }}>{error}</div>
            <button onClick={() => navigate("/landing")} style={secondaryBtn}>Go to sign in</button>
          </div>
        )}

        {(phase === "form" || phase === "submitting") && (
          <>
            <div style={{ textAlign: "center", fontSize: 15, color: "#E8E6DF", marginBottom: 4 }}>You've been invited to FieldMark</div>
            <div style={{ textAlign: "center", fontSize: 12, color: "#6B6A65", marginBottom: 24 }}>Create your account to continue.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="email" placeholder="Email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown} style={input} />
              <input type="password" placeholder="Create a password" value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} style={input} />

              {error ? <div style={{ fontSize: 12, color: "#E8704E", marginTop: 2 }}>{error}</div> : null}

              <button type="button" onClick={handleEmailSignup} disabled={busy} style={primaryBtn}>
                {busy ? <Spinner /> : null}
                <span style={{ fontSize: 14, fontWeight: 500, color: "#0A0A0B" }}>{busy ? "Creating account…" : "Create account"}</span>
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1E1E22" }} />
              <span style={{ fontSize: 11, color: "#3A3A3F", letterSpacing: "0.1em" }}>OR</span>
              <div style={{ flex: 1, height: 1, backgroundColor: "#1E1E22" }} />
            </div>

            <button onClick={handleLinkedIn} disabled={linkedInLoading} style={linkedInBtn}>
              {linkedInLoading ? <Spinner /> : <LinkedInIcon />}
              <span style={{ fontSize: 14, fontWeight: 500, color: "#FFFFFF" }}>
                {linkedInLoading ? "Redirecting…" : "Continue with LinkedIn"}
              </span>
            </button>

            <div style={{ fontSize: 11, color: "#3A3A3F", textAlign: "center", lineHeight: 1.5, marginTop: 16 }}>
              Already have an account?{" "}
              <span onClick={() => navigate("/landing")} style={{ color: "#6B6A65", cursor: "pointer", textDecoration: "underline" }}>Sign in</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  backgroundColor: "#0A0A0B", minHeight: "100dvh", maxWidth: 480, margin: "0 auto",
  display: "flex", flexDirection: "column", padding: "0 24px", position: "relative",
};
const input: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 4, backgroundColor: "#0F0F12", border: "1px solid #1E1E22",
  color: "#E8E6DF", fontSize: 14, padding: "0 12px", fontFamily: "system-ui, sans-serif", outline: "none",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 4, backgroundColor: "#E8A020", border: "none",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", marginTop: 4,
};
const linkedInBtn: React.CSSProperties = {
  width: "100%", height: 48, borderRadius: 4, backgroundColor: "#0A66C2", border: "none",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  height: 44, padding: "0 20px", borderRadius: 4, backgroundColor: "transparent", border: "1px solid #1E1E22",
  color: "#9B9892", fontSize: 14, cursor: "pointer",
};
