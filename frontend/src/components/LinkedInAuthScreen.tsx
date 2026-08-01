// Sign-in — "the threshold". Layout authority: docs/design/Sign-in.dc.html
// (project 22e80255, 1a). PRESENTATION ONLY: the auth handlers below are the
// pre-redesign ones, byte-for-byte in behaviour — email/password via
// supabase.auth.signInWithPassword (+ msl_profiles check → /welcome), the mock
// LinkedIn flow, and the beforeinstallprompt install affordance.
//
// PUBLIC, UNAUTHENTICATED SURFACE. The sky is abstract decoration: CSS
// gradient starfields + a fixed inline-SVG constellation with invented
// coordinates. No names, no institutions, no corpus structure, no counts, no
// DB reads. Do not wire data into this screen.
//
// PERFORMANCE: the form renders on the first paint; the atmosphere mounts on a
// post-mount effect so nothing about the sky can block input. No image assets
// — the whole sky is CSS gradients and one inline SVG. prefers-reduced-motion
// disables twinkle, drift and shooting stars entirely (static constellation).
//
// HONESTY DEVIATIONS from the frame (verified 2026-07-31):
//   • The "Two attempts left before a five-minute cooldown" banner line is NOT
//     built — nothing in the auth layer tracks attempts or enforces a lockout
//     the client can see. The banner renders the real failure, nothing more.
//   • The "Forgot password?" link is NOT built — no reset flow exists; a dead
//     link states an affordance the system doesn't have.

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface LinkedInAuthScreenProps {
  onAuth: () => void;
}

const INK = "#EDEAE3";
const AMBER = "#E9A63B";
const SERIF = "Newsreader, Georgia, serif";
const SANS = "'Helvetica Neue', Helvetica, sans-serif";

// ── Sky (abstract; coordinates invented in the frame) ────────────────────────
const STARFIELD_DESKTOP =
  "radial-gradient(1.4px 1.4px at 6% 14%, rgba(237,234,227,.45), transparent 60%),radial-gradient(1px 1px at 13% 34%, rgba(237,234,227,.32), transparent 60%),radial-gradient(1.6px 1.6px at 21% 9%, rgba(237,234,227,.5), transparent 60%),radial-gradient(1px 1px at 27% 46%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1.2px 1.2px at 33% 21%, rgba(237,234,227,.4), transparent 60%),radial-gradient(1px 1px at 39% 63%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1.5px 1.5px at 45% 31%, rgba(237,234,227,.42), transparent 60%),radial-gradient(1px 1px at 51% 12%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1.3px 1.3px at 57% 52%, rgba(237,234,227,.36), transparent 60%),radial-gradient(1px 1px at 63% 24%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1.6px 1.6px at 69% 68%, rgba(237,234,227,.44), transparent 60%),radial-gradient(1px 1px at 74% 37%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1.2px 1.2px at 81% 16%, rgba(237,234,227,.34), transparent 60%),radial-gradient(1px 1px at 86% 57%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1.4px 1.4px at 92% 29%, rgba(237,234,227,.4), transparent 60%),radial-gradient(1px 1px at 96% 74%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1px 1px at 17% 78%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1.2px 1.2px at 30% 88%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 48% 82%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1.3px 1.3px at 66% 91%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1px 1px at 78% 84%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.1px 1.1px at 9% 60%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 3% 28%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1.2px 1.2px at 11% 45%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1px 1px at 19% 63%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.3px 1.3px at 24% 55%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 36% 41%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.1px 1.1px at 42% 8%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1px 1px at 47% 70%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.4px 1.4px at 54% 42%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1px 1px at 59% 78%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.2px 1.2px at 66% 33%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 72% 58%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.3px 1.3px at 77% 22%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1px 1px at 83% 44%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.1px 1.1px at 89% 12%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 94% 52%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.2px 1.2px at 99% 38%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1px 1px at 22% 94%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.1px 1.1px at 56% 96%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1px 1px at 88% 92%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.2px 1.2px at 4% 72%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1px 1px at 41% 51%, rgba(237,234,227,.18), transparent 60%)";
const STARFIELD_MOBILE =
  "radial-gradient(1.4px 1.4px at 8% 8%, rgba(237,234,227,.45), transparent 60%),radial-gradient(1px 1px at 22% 15%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1.6px 1.6px at 40% 6%, rgba(237,234,227,.5), transparent 60%),radial-gradient(1px 1px at 57% 13%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1.2px 1.2px at 72% 9%, rgba(237,234,227,.4), transparent 60%),radial-gradient(1px 1px at 88% 17%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1.5px 1.5px at 14% 24%, rgba(237,234,227,.36), transparent 60%),radial-gradient(1px 1px at 33% 29%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1.3px 1.3px at 52% 26%, rgba(237,234,227,.34), transparent 60%),radial-gradient(1px 1px at 68% 32%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.6px 1.6px at 84% 27%, rgba(237,234,227,.42), transparent 60%),radial-gradient(1px 1px at 6% 34%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1.2px 1.2px at 26% 38%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1px 1px at 46% 36%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.3px 1.3px at 63% 41%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1px 1px at 79% 38%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.1px 1.1px at 94% 44%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 4% 12%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1.2px 1.2px at 16% 5%, rgba(237,234,227,.3), transparent 60%),radial-gradient(1px 1px at 31% 11%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.3px 1.3px at 49% 18%, rgba(237,234,227,.28), transparent 60%),radial-gradient(1px 1px at 64% 22%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.1px 1.1px at 81% 12%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 92% 30%, rgba(237,234,227,.22), transparent 60%),radial-gradient(1.2px 1.2px at 9% 28%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1px 1px at 24% 34%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.3px 1.3px at 42% 31%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 58% 37%, rgba(237,234,227,.2), transparent 60%),radial-gradient(1.1px 1.1px at 74% 43%, rgba(237,234,227,.24), transparent 60%),radial-gradient(1px 1px at 36% 46%, rgba(237,234,227,.18), transparent 60%),radial-gradient(1.2px 1.2px at 66% 8%, rgba(237,234,227,.26), transparent 60%),radial-gradient(1px 1px at 12% 40%, rgba(237,234,227,.2), transparent 60%)";
const GLINT_DESKTOP =
  "radial-gradient(2px 2px at 24% 27%, rgba(240,184,78,.7), transparent 65%),radial-gradient(1.6px 1.6px at 43% 58%, rgba(240,184,78,.55), transparent 65%),radial-gradient(2.2px 2.2px at 60% 18%, rgba(233,166,59,.6), transparent 65%),radial-gradient(1.6px 1.6px at 71% 47%, rgba(240,184,78,.5), transparent 65%),radial-gradient(2px 2px at 88% 66%, rgba(233,166,59,.45), transparent 65%),radial-gradient(1.4px 1.4px at 35% 74%, rgba(240,184,78,.4), transparent 65%)";
const GLINT_MOBILE =
  "radial-gradient(2px 2px at 20% 19%, rgba(240,184,78,.7), transparent 65%),radial-gradient(1.6px 1.6px at 48% 33%, rgba(240,184,78,.55), transparent 65%),radial-gradient(2.2px 2.2px at 74% 14%, rgba(233,166,59,.6), transparent 65%),radial-gradient(1.6px 1.6px at 33% 41%, rgba(240,184,78,.45), transparent 65%)";

// The frame's 1–1.6px dots were tuned for a 1440×900 canvas at 100% zoom. On
// large viewports (or zoomed-out browsers) they land below one device pixel
// and antialias into the background, and %-positioning stretches the field to
// a third of the intended density. Fix both scale-robustly: (a) scale every
// dot size ×1.6 so the smallest star is ≥1 device px down to ~60% zoom,
// (b) tile the field at the frame's native canvas size so density is constant
// at any viewport. Repetition is imperceptible in an abstract field.
const scaleStars = (field: string, f: number) =>
  field.replace(/(\d+(?:\.\d+)?)px (\d+(?:\.\d+)?)px at/g, (_, a, b) => `${(parseFloat(a) * f).toFixed(1)}px ${(parseFloat(b) * f).toFixed(1)}px at`);
const STARFIELD_DESKTOP_SCALED = scaleStars(STARFIELD_DESKTOP, 1.6);
const STARFIELD_MOBILE_SCALED = scaleStars(STARFIELD_MOBILE, 1.6);
const GLINT_DESKTOP_SCALED = scaleStars(GLINT_DESKTOP, 1.4);
const GLINT_MOBILE_SCALED = scaleStars(GLINT_MOBILE, 1.4);

// The frame's individually-placed twinkle stars (px on the 1440×900 / 390×844
// canvases → % so they hold position at any size). Abstract coordinates only.
const NAMED_STARS_DESKTOP = [
  { x: 8.9, y: 9.6, s: 3, c: "rgba(237,234,227,.9)", d: 0 },
  { x: 26.8, y: 16.2, s: 2, c: "rgba(237,234,227,.8)", d: 1.4 },
  { x: 42.5, y: 9.8, s: 2.5, c: "rgba(240,184,78,.85)", d: 3 },
  { x: 60.0, y: 43.6, s: 2, c: "rgba(237,234,227,.75)", d: 2.2 },
  { x: 53.2, y: 82.4, s: 3, c: "rgba(237,234,227,.7)", d: 5 },
  { x: 14.2, y: 85.3, s: 2, c: "rgba(240,184,78,.6)", d: 6.5 },
  { x: 33.8, y: 77.8, s: 2, c: "rgba(237,234,227,.65)", d: 4 },
];
const NAMED_STARS_MOBILE = [
  { x: 11.8, y: 7.6, s: 2.5, c: "rgba(237,234,227,.9)", d: 0 },
  { x: 48.2, y: 4.7, s: 2, c: "rgba(237,234,227,.75)", d: 2.5 },
  { x: 90.3, y: 17.5, s: 2, c: "rgba(240,184,78,.8)", d: 4 },
  { x: 24.6, y: 24.4, s: 3, c: "rgba(237,234,227,.7)", d: 5.5 },
  { x: 70.3, y: 23.2, s: 2, c: "rgba(237,234,227,.6)", d: 1.2 },
];

function ConstellationDesktop() {
  return (
    <svg viewBox="0 0 400 228" style={{ position: "absolute", left: "36%", bottom: "6%", width: 400, height: 228, overflow: "visible" }} aria-hidden="true">
      <g stroke="rgba(233,166,59,.22)" strokeWidth="1" fill="none">
        <line x1="24" y1="152" x2="96" y2="96" /><line x1="96" y1="96" x2="172" y2="132" />
        <line x1="172" y1="132" x2="238" y2="56" /><line x1="238" y1="56" x2="314" y2="104" />
        <line x1="314" y1="104" x2="370" y2="172" /><line x1="172" y1="132" x2="138" y2="200" />
      </g>
      <g fill="#F0B84E">
        <circle cx="24" cy="152" r="1.8" /><circle cx="96" cy="96" r="2.4" /><circle cx="172" cy="132" r="3" />
        <circle cx="238" cy="56" r="2.2" /><circle cx="314" cy="104" r="1.8" /><circle cx="370" cy="172" r="1.6" />
        <circle cx="138" cy="200" r="1.8" />
      </g>
      <g fill="rgba(240,184,78,.16)"><circle cx="172" cy="132" r="10" /><circle cx="238" cy="56" r="7" /></g>
    </svg>
  );
}

function ConstellationMobile() {
  return (
    <svg viewBox="0 0 350 96" style={{ position: "absolute", left: 20, bottom: 14, width: 350, height: 96, overflow: "visible" }} aria-hidden="true">
      <g stroke="rgba(233,166,59,.2)" strokeWidth="1" fill="none">
        <line x1="14" y1="64" x2="76" y2="28" /><line x1="76" y1="28" x2="140" y2="58" />
        <line x1="140" y1="58" x2="206" y2="18" /><line x1="206" y1="18" x2="268" y2="52" />
        <line x1="268" y1="52" x2="332" y2="82" />
      </g>
      <g fill="#F0B84E">
        <circle cx="14" cy="64" r="1.6" /><circle cx="76" cy="28" r="2.2" /><circle cx="140" cy="58" r="2.6" />
        <circle cx="206" cy="18" r="2" /><circle cx="268" cy="52" r="1.8" /><circle cx="332" cy="82" r="1.6" />
      </g>
      <circle cx="140" cy="58" r="9" fill="rgba(240,184,78,.16)" />
    </svg>
  );
}

// The atmosphere is mounted AFTER first paint (see the atmos flag) so the form
// is interactive before any of this exists. All animation lives behind
// prefers-reduced-motion: no-preference; with reduce set, this renders a
// static field and the constellation only.
function Sky({ mobile }: { mobile: boolean }) {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: mobile
        ? "radial-gradient(70% 34% at 32% 22%, rgba(58,48,112,.30), transparent 72%), radial-gradient(60% 26% at 78% 48%, rgba(92,54,90,.16), transparent 74%)"
        : "radial-gradient(58% 48% at 26% 38%, rgba(58,48,112,.26), transparent 70%), radial-gradient(40% 36% at 62% 74%, rgba(92,54,90,.15), transparent 72%), radial-gradient(30% 26% at 14% 84%, rgba(233,166,59,.06), transparent 70%)" }} />
      <div aria-hidden className="fmsi-drift" style={{ position: "absolute", inset: mobile ? -20 : -30, pointerEvents: "none", backgroundImage: mobile ? STARFIELD_MOBILE_SCALED : STARFIELD_DESKTOP_SCALED, backgroundSize: mobile ? "390px 460px" : "1440px 900px", backgroundRepeat: "repeat" }} />
      <div aria-hidden className="fmsi-twinkle" style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: mobile ? GLINT_MOBILE_SCALED : GLINT_DESKTOP_SCALED, backgroundSize: mobile ? "390px 460px" : "1440px 900px", backgroundRepeat: "repeat" }} />
      {(mobile ? NAMED_STARS_MOBILE : NAMED_STARS_DESKTOP).map((s, i) => (
        <div key={i} aria-hidden className="fmsi-twinkle" style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, borderRadius: "50%", background: s.c, pointerEvents: "none", animationDelay: `${s.d}s` }} />
      ))}
      <div aria-hidden className="fmsi-shoot-wrap" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div className="fmsi-shoot" style={{ position: "absolute", left: "14%", top: "14%", width: mobile ? 86 : 128, height: 1, borderRadius: 1, background: "linear-gradient(90deg, rgba(237,234,227,0), rgba(237,234,227,.85))" }} />
        <div className="fmsi-shoot2" style={{ position: "absolute", left: "45%", top: "24%", width: mobile ? 64 : 96, height: 1, borderRadius: 1, background: "linear-gradient(90deg, rgba(240,184,78,0), rgba(240,184,78,.8))" }} />
      </div>
      {mobile ? <ConstellationMobile /> : <ConstellationDesktop />}
    </>
  );
}

const Spinner = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ animation: "fmsiSpin .8s linear infinite" }} aria-hidden>
    <circle cx="10" cy="10" r="8" stroke="rgba(0,0,0,0.25)" strokeWidth="2" />
    <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default function LinkedInAuthScreen({ onAuth }: LinkedInAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [atmos, setAtmos] = useState(false); // atmosphere never blocks the form
  const deferredPrompt = useRef<Event & { prompt: () => void } | null>(null);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => { setAtmos(true); }, []); // second paint: sky mounts

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as Event & { prompt: () => void };
      setShowInstall(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  function handleLinkedIn() {
    if (loading) return;
    setLoading(true);
    setTimeout(() => {
      onAuth();
    }, 1500);
  }

  async function handleEmailSignIn() {
    if (emailLoading) return;
    if (!email.trim() || !password.trim()) {
      setAuthError("Email and password required.");
      return;
    }

    setEmailLoading(true);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setAuthError(error.message);
        setEmailLoading(false);
        return;
      }

      if (!data.user) {
        setAuthError("Sign-in succeeded but no user returned.");
        setEmailLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("msl_profiles")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!profileData) {
        navigate("/welcome");
      } else {
        onAuth();
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Unknown error");
      setEmailLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleEmailSignIn();
  }

  function handleInstall() {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    setShowInstall(false);
  }

  // Honest error rendering: the real failure, no invented attempt counters or
  // lockout rules (none exist in the auth layer — verified 2026-07-31).
  const isCredentialError = authError != null && /invalid login credentials/i.test(authError);
  const errorHeadline = authError == null ? null : isCredentialError ? "That email and password don't match." : authError;
  const errorSub = isCredentialError ? "Check the address and password, then try again." : null;

  const banner = errorHeadline ? (
    <div role="alert" style={{ display: "flex", gap: isMobile ? 10 : 12, padding: isMobile ? "12px 13px" : "14px 16px", border: "1px solid rgba(203,92,68,.45)", borderRadius: 4, background: "rgba(203,92,68,.12)" }}>
      <span style={{ color: "#E79880", fontSize: isMobile ? 12 : 13, lineHeight: 1.5 }} aria-hidden>◦</span>
      <div>
        <div style={{ color: "#F0B39D", fontSize: isMobile ? 12.5 : 13, lineHeight: 1.5, fontWeight: 500 }}>{errorHeadline}</div>
        {errorSub ? <div style={{ color: "rgba(240,179,157,.7)", fontSize: isMobile ? 11.5 : 12, lineHeight: 1.5, marginTop: 3 }}>{errorSub}</div> : null}
      </div>
    </div>
  ) : null;

  const fieldH = isMobile ? 48 : 52;
  const btnH = isMobile ? 50 : 54;

  const form = (
    <>
      <div style={{ fontSize: isMobile ? 9 : 10, letterSpacing: isMobile ? ".28em" : ".3em", color: "rgba(237,234,227,.45)" }}>MEMBER SIGN-IN</div>
      {banner}
      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 8 }}>
        <label htmlFor="fmsi-email" style={{ fontSize: isMobile ? 10 : 11, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(237,234,227,.55)" }}>Email</label>
        <input id="fmsi-email" className="fmsi-input" type="email" placeholder="you@company.com" value={email}
          onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown} autoComplete="email"
          style={{ height: fieldH, boxSizing: "border-box", padding: "0 15px", border: "1px solid rgba(237,234,227,.16)", borderRadius: 4, background: "rgba(237,234,227,.045)", color: INK, fontSize: 15, fontFamily: SANS, outline: "none", width: "100%" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 8 }}>
        <label htmlFor="fmsi-password" style={{ fontSize: isMobile ? 10 : 11, letterSpacing: ".14em", textTransform: "uppercase", color: isCredentialError ? "rgba(240,179,157,.9)" : "rgba(237,234,227,.55)" }}>Password</label>
        <input id="fmsi-password" className="fmsi-input" type="password" placeholder="••••••••••" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} autoComplete="current-password"
          style={{ height: fieldH, boxSizing: "border-box", padding: "0 15px", border: `1px solid ${isCredentialError ? "#CB5C44" : "rgba(237,234,227,.16)"}`, borderRadius: 4, background: isCredentialError ? "rgba(203,92,68,.07)" : "rgba(237,234,227,.045)", color: INK, fontSize: 15, fontFamily: SANS, outline: "none", width: "100%" }} />
        {isCredentialError ? <span style={{ fontSize: 11.5, color: "#E79880" }}>Check your password, then try again.</span> : null}
      </div>
      <button type="button" className="fmsi-btn" onClick={handleEmailSignIn} disabled={emailLoading}
        style={{ height: btnH, border: "none", borderRadius: 4, background: AMBER, color: "#100D08", fontSize: 14, fontWeight: 600, letterSpacing: ".06em", fontFamily: SANS, cursor: emailLoading ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%" }}>
        {emailLoading ? <Spinner /> : null}{emailLoading ? "Signing in…" : "Sign in"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 14, margin: "2px 0" }}>
        <span style={{ flex: 1, height: 1, background: "rgba(237,234,227,.1)" }} />
        <span style={{ fontSize: 9, letterSpacing: ".28em", color: "rgba(237,234,227,.32)" }}>OR</span>
        <span style={{ flex: 1, height: 1, background: "rgba(237,234,227,.1)" }} />
      </div>
      <button type="button" className="fmsi-btn" onClick={handleLinkedIn}
        style={{ height: btnH, display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 10 : 12, border: "1px solid rgba(237,234,227,.18)", borderRadius: 4, background: "rgba(237,234,227,.04)", color: INK, fontSize: 14, letterSpacing: ".02em", fontFamily: SANS, cursor: loading ? "default" : "pointer", width: "100%" }}>
        {loading ? <span style={{ color: INK }}><Spinner /></span> : (
          <span style={{ width: isMobile ? 19 : 20, height: isMobile ? 19 : 20, borderRadius: 3, background: "#2A4E70", color: INK, fontSize: isMobile ? 10 : 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden>in</span>
        )}
        <span>{loading ? "Verifying role…" : "Continue with LinkedIn"}</span>
      </button>
      <p style={{ margin: "2px 0 0", fontSize: isMobile ? 11.5 : 12, lineHeight: 1.6, color: "rgba(237,234,227,.42)", textWrap: "pretty" as const }}>
        We verify your MSL role. Your identity is never shared with HCPs or other users.
      </p>
    </>
  );

  const installRow = showInstall ? (
    <button type="button" className="fmsi-btn" onClick={handleInstall}
      style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : "flex-start", gap: 8, minHeight: 44, marginTop: isMobile ? 0 : 12, paddingTop: isMobile ? 0 : 20, borderTop: "1px solid rgba(237,234,227,.08)", background: "none", border: "none", borderRadius: 0, cursor: "pointer", width: "100%" }}>
      <span style={{ color: "rgba(237,234,227,.45)", fontSize: 13 }} aria-hidden>↓</span>
      <span style={{ fontSize: isMobile ? 11 : 12, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(237,234,227,.55)" }}>Install app</span>
      {!isMobile ? <span style={{ fontSize: 11, color: "rgba(237,234,227,.28)", letterSpacing: ".02em", textTransform: "none" }}>— works offline in the field</span> : null}
    </button>
  ) : null;

  const shared = (
    <style>{`
      @keyframes fmsiSpin { to { transform: rotate(360deg); } }
      .fmsi-input:focus { border-color: ${AMBER} !important; background: rgba(233,166,59,.06) !important; box-shadow: 0 0 0 3px rgba(233,166,59,.16); }
      .fmsi-input::placeholder { color: rgba(237,234,227,.3); }
      .fmsi-btn:focus-visible { outline: 2px solid ${AMBER}; outline-offset: 2px; }
      .fmsi-shoot, .fmsi-shoot2 { opacity: 0; }
      @media (prefers-reduced-motion: no-preference) {
        .fmsi-drift { animation: fmsiDrift 90s ease-in-out infinite alternate; }
        .fmsi-twinkle { animation: fmsiTwinkle 11s ease-in-out infinite; }
        .fmsi-shoot { animation: fmsiShoot 16s linear infinite; }
        .fmsi-shoot2 { animation: fmsiShoot 23s linear 7s infinite; }
      }
      @keyframes fmsiTwinkle { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
      @keyframes fmsiDrift { 0% { transform: translate3d(0,0,0) } 100% { transform: translate3d(-18px,10px,0) } }
      @keyframes fmsiShoot {
        0%, 100% { opacity: 0; transform: translate3d(0,0,0) rotate(20deg) }
        3% { opacity: .85 }
        13% { opacity: 0; transform: translate3d(240px,88px,0) rotate(20deg) }
        99% { opacity: 0; transform: translate3d(240px,88px,0) rotate(20deg) }
      }
    `}</style>
  );

  // ── MOBILE: sky on top (it shrinks), sign-in as a content-sized bottom
  //    sheet. The sheet never scrolls at design heights; overflow-y:auto is a
  //    last-resort safety for keyboard-open viewports (~350-400px), where the
  //    fields sit at the sheet TOP so the browser's scroll-into-view keeps
  //    email/password/Sign-in reachable.
  if (isMobile) {
    return (
      <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "linear-gradient(168deg,#090C18 0%,#0D0C1E 38%,#130D1B 62%,#08080A 100%)", overflow: "hidden" }}>
        {shared}
        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {atmos ? <Sky mobile /> : null}
          <div style={{ position: "relative", padding: "26px 24px 0", display: "flex", flexDirection: "column", gap: 30 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ fontFamily: SERIF, fontSize: 19, color: AMBER }}>FM</span>
              <span style={{ width: 1, height: 13, background: "rgba(237,234,227,.18)" }} />
              <span style={{ fontSize: 9, letterSpacing: ".32em", color: "rgba(237,234,227,.6)" }}>FIELDMARK</span>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: ".28em", color: "rgba(233,166,59,.75)", marginBottom: 16 }}>BEFORE YOU GO OUT</div>
              <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 200, fontSize: 42, lineHeight: 1.08, letterSpacing: "-.01em", color: INK }}>
                We see the nebula.<br /><span style={{ color: "rgba(237,234,227,.62)" }}>Not just the star.</span>
              </h1>
            </div>
          </div>
        </div>
        <div style={{ flex: "none", maxHeight: "100%", overflowY: "auto", boxSizing: "border-box", padding: "24px 24px 18px", borderRadius: "22px 22px 0 0", borderTop: "1px solid rgba(237,234,227,.1)", background: "linear-gradient(180deg, rgba(8,9,14,.86), rgba(8,9,14,.95))", backdropFilter: "blur(18px)", display: "flex", flexDirection: "column", gap: 13 }}>
          {form}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {installRow}
            <div style={{ textAlign: "center", fontSize: 8, letterSpacing: ".24em", color: "rgba(237,234,227,.26)", textTransform: "uppercase", paddingBottom: 2 }}>
              HIPAA-aware · Compliance-first architecture
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── DESKTOP: full-bleed sky, 500px sign-in column pinned right ──────────────
  return (
    <div style={{ position: "relative", minHeight: "100dvh", overflow: "hidden", background: "linear-gradient(155deg,#090C18 0%,#0D0C1E 42%,#130D1B 68%,#08080A 100%)" }}>
      {shared}
      {atmos ? <Sky mobile={false} /> : null}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, right: 500, padding: "56px 64px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: ".02em", color: AMBER }}>FM</span>
          <span style={{ width: 1, height: 16, background: "rgba(237,234,227,.18)" }} />
          <span style={{ fontSize: 10, letterSpacing: ".34em", color: "rgba(237,234,227,.6)", fontFamily: SANS }}>FIELDMARK</span>
        </div>
        <div style={{ maxWidth: 660, marginBottom: 120 }}>
          <div style={{ fontSize: 10, letterSpacing: ".3em", color: "rgba(233,166,59,.75)", marginBottom: 26, fontFamily: SANS }}>BEFORE YOU GO OUT</div>
          <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 200, fontSize: "clamp(48px, 6vw, 78px)", lineHeight: 1.04, letterSpacing: "-.015em", color: INK, textWrap: "pretty" as const }}>
            We see the nebula.<br /><span style={{ color: "rgba(237,234,227,.62)" }}>Not just the star.</span>
          </h1>
          <p style={{ margin: "28px 0 0", maxWidth: 430, fontFamily: SERIF, fontStyle: "italic", fontWeight: 200, fontSize: 20, lineHeight: 1.55, letterSpacing: ".005em", color: "rgba(237,234,227,.55)", textWrap: "pretty" as const }}>
            Discover the experts shaping your therapeutic area tomorrow — before the field does.
          </p>
        </div>
        <div style={{ fontSize: 9, letterSpacing: ".28em", color: "rgba(237,234,227,.28)", textTransform: "uppercase", fontFamily: SANS }}>
          HIPAA-aware · Compliance-first architecture
        </div>
      </div>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 500, maxWidth: "100%", boxSizing: "border-box", padding: 56, display: "flex", flexDirection: "column", justifyContent: "center", gap: 22, background: "linear-gradient(180deg, rgba(8,9,14,.72), rgba(8,9,14,.84))", backdropFilter: "blur(20px)", borderLeft: "1px solid rgba(237,234,227,.09)", overflowY: "auto", fontFamily: SANS }}>
        {form}
        {installRow}
      </div>
    </div>
  );
}
