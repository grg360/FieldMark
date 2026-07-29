// Platform navigation — Design frame NAV-BUILD-01. Replaces TopBar on every
// authenticated route and supersedes AssetNav (retired).
//
// Six sections: Home · Territory · People · Drugs · Congresses · Pulse. Desktop is
// a single 48px row (wordmark · rule · labels · avatar pill); mobile (≤767px) is a
// 36px utility strip over a 3×2 cell grid — six items fill it exactly, no empty
// cell. Non-sticky. Wordmark → /me on every route and both breakpoints.
//
// The avatar menu is five rows — Settings, Methodology, Invite (self-hiding at 0),
// Admin (isAdmin only), Sign out — as a desktop dropdown and a full-width mobile
// sheet. Search is NOT in the bar; it lives in surface headers (see the feed/home
// headers). Invite lives here, not in the bar. Bibliography is intentionally absent
// pending its routing fix.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { COLOR, ELEVATION, FONT, TYPE } from "../lib/designTokens";
import { signOut, getCurrentUser, getMslProfile, type MslProfile } from "../lib/authHelpers";
import { useIsAdmin } from "../lib/useIsAdmin";
import { useMediaQuery } from "../lib/useMediaQuery";
import { getMyInvites, primaryInvite, type MyInvite } from "../lib/invites";
import InviteShareCard from "./HomePage/InviteShareCard";
import InviteEmailForm from "./HomePage/InviteEmailForm";

type NavKey = "home" | "territory" | "people" | "drugs" | "congresses" | "pulse";

interface NavItem {
  key: NavKey;
  label: string;
  to: string;
}

// Bar targets — nearest working surface for each axis. HOME → /me (no /home route;
// People's consolidated /people and a canonical /home come with the cohort-ledger
// build). PEOPLE → the existing cohort dashboard until /people exists. TERRITORY →
// the feed root.
const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", to: "/me" },
  { key: "territory", label: "Territory", to: "/" },
  { key: "people", label: "People", to: "/oncology/established/nsclc" },
  { key: "drugs", label: "Drugs", to: "/assets" },
  { key: "congresses", label: "Congresses", to: "/congress" },
  { key: "pulse", label: "Pulse", to: "/pulse" },
];

const SEAM = COLOR.hairStrong;

// Prefix-based active resolution — must hold on nested routes (/hcp/:id,
// /congress/:slug, /pulse/:ta). Order matters: most specific first.
function activeKey(pathname: string): NavKey | null {
  const p = pathname;
  if (p.startsWith("/assets")) return "drugs";
  if (p.startsWith("/congress")) return "congresses";
  if (p.startsWith("/pulse")) return "pulse";
  if (p.startsWith("/me")) return "home";
  if (p.startsWith("/institution")) return "territory";
  if (p.startsWith("/hcp") || p.startsWith("/landscape")) return "people";
  if (/\/(established|rising-stars|community)(\/|$)/.test(p)) return "people";
  if (p === "/") return "territory";
  return null; // feed sub-surfaces (social/telescope/field-intelligence) → no bar mark
}

function initialsOf(profile: MslProfile | null): string {
  if (profile?.first_name && profile?.last_name) {
    return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
  }
  return "··";
}

export default function NavBar() {
  const location = useLocation();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const active = activeKey(location.pathname);

  const [profile, setProfile] = useState<MslProfile | null>(null);
  const [email, setEmail] = useState<string>("");
  const [invite, setInvite] = useState<MyInvite | null>(null);
  const { isAdmin } = useIsAdmin();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const user = await getCurrentUser();
      if (!alive || !user) return;
      setEmail((user as { email?: string }).email ?? "");
      const p = await getMslProfile(user.id);
      if (alive) setProfile(p);
    })();
    void (async () => {
      const invites = await getMyInvites();
      if (alive) setInvite(primaryInvite(invites));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const menu = {
    profile,
    email,
    isAdmin,
    invite,
    initials: initialsOf(profile),
  };

  return isMobile ? <MobileBar active={active} menu={menu} /> : <DesktopBar active={active} menu={menu} />;
}

interface MenuData {
  profile: MslProfile | null;
  email: string;
  isAdmin: boolean;
  invite: MyInvite | null;
  initials: string;
}

// ── Desktop ──────────────────────────────────────────────────────────────────
function DesktopBar({ active, menu }: { active: NavKey | null; menu: MenuData }) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        height: 48,
        padding: "0 18px",
        borderBottom: `1px solid ${COLOR.hairStrong}`,
        background: COLOR.ground,
      }}
      aria-label="Primary"
    >
      <Link
        to="/me"
        style={{ fontFamily: FONT.mono, fontSize: 12.5, letterSpacing: "0.2em", color: COLOR.ink1, textDecoration: "none" }}
      >
        FIELDMARK
      </Link>
      <span style={{ width: 1, height: 20, background: SEAM, flex: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        {NAV_ITEMS.map((item) => {
          const on = item.key === active;
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={on ? "page" : undefined}
              style={{
                fontFamily: FONT.mono,
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: on ? COLOR.ink1 : COLOR.ink3,
                fontWeight: on ? 500 : 400,
                textDecoration: "none",
                paddingBottom: 3,
                boxShadow: on ? `inset 0 -2px 0 ${COLOR.amber}` : "none",
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                if (!on) e.currentTarget.style.color = COLOR.ink2;
              }}
              onMouseLeave={(e) => {
                if (!on) e.currentTarget.style.color = COLOR.ink3;
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <span style={{ flex: 1 }} />
      <AvatarMenu menu={menu} mobile={false} />
    </nav>
  );
}

// ── Mobile ───────────────────────────────────────────────────────────────────
function MobileBar({ active, menu }: { active: NavKey | null; menu: MenuData }) {
  return (
    <nav aria-label="Primary">
      {/* 36px utility strip */}
      <div
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          borderBottom: `1px solid ${COLOR.hairStrong}`,
          background: COLOR.ground,
        }}
      >
        <Link to="/me" style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.2em", color: COLOR.ink1, textDecoration: "none" }}>
          FIELDMARK
        </Link>
        <AvatarMenu menu={menu} mobile />
      </div>
      {/* 3×2 cell grid — six items, no empty cell */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: SEAM, borderBottom: `1px solid ${SEAM}` }}>
        {NAV_ITEMS.map((item) => {
          const on = item.key === active;
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={on ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: 53,
                padding: "0 11px",
                background: on ? COLOR.surfaceRaised : COLOR.ground,
                boxShadow: on ? `inset 0 2px 0 ${COLOR.amber}` : "none",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 11.5,
                  lineHeight: 1.2,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: on ? COLOR.ink1 : COLOR.ink3,
                  fontWeight: on ? 500 : 400,
                  overflowWrap: "anywhere",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Avatar menu (dropdown / sheet) ───────────────────────────────────────────
function AvatarMenu({ menu, mobile }: { menu: MenuData; mobile: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  const showInvites = !!menu.invite && menu.invite.uses_remaining > 0;

  const pill = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Account menu"
      aria-haspopup="menu"
      aria-expanded={open}
      style={{
        display: "flex",
        alignItems: "center",
        gap: mobile ? 7 : 8,
        border: `1px solid ${COLOR.hairStrong}`,
        background: "transparent",
        padding: mobile ? 0 : "4px 8px 4px 4px",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          background: COLOR.surfaceRaised,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT.mono,
          fontSize: 9.5,
          letterSpacing: "0.04em",
          color: open ? COLOR.amber : COLOR.ink2,
        }}
      >
        {menu.initials}
      </span>
      <span style={{ fontSize: 10, color: open ? COLOR.amber : COLOR.ink4 }}>{open ? "▴" : "▾"}</span>
    </button>
  );

  const rows = (
    <>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${COLOR.hair}`, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: FONT.sans, fontSize: 12, color: COLOR.ink1 }}>{menu.email || menu.profile?.first_name || "Signed in"}</span>
        <span style={{ ...TYPE.microLabel, color: COLOR.ink4 }}>
          {[menu.profile?.company, menu.isAdmin ? "ADMIN" : null].filter(Boolean).join(" · ") || "FIELDMARK"}
        </span>
      </div>
      <MenuRow label="Settings" onClick={() => go("/me/settings")} />
      <MenuRow label="Methodology" hint="HOW SCORES ARE BUILT" onClick={() => go("/methodology")} />
      {showInvites ? (
        <MenuRow label="Invite colleagues" hint={`${menu.invite!.uses_remaining} LEFT`} hintAmber onClick={() => { setOpen(false); setInviteOpen(true); }} />
      ) : null}
      {menu.isAdmin ? <MenuRow label="Admin" onClick={() => go("/admin")} /> : null}
      <div style={{ borderTop: `1px solid ${COLOR.hairStrong}` }}>
        <MenuRow label="Sign out" hint="→" hintAmber tall onClick={() => void signOut()} />
      </div>
    </>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {pill}
      {open && !mobile ? (
        <div style={{ ...ELEVATION.card, position: "absolute", top: 40, right: 0, width: 296, overflow: "hidden", zIndex: 100 }}>
          {rows}
        </div>
      ) : null}
      {open && mobile ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,12,12,0.72)", zIndex: 90 }} />
          <div style={{ position: "fixed", top: 36, left: 0, right: 0, background: COLOR.surfaceCard, borderBottom: `1px solid ${COLOR.hairStrong}`, zIndex: 100 }}>
            {rows}
          </div>
        </>
      ) : null}
      {inviteOpen && menu.invite ? <InviteModal invite={menu.invite} onClose={() => setInviteOpen(false)} /> : null}
    </div>
  );
}

function MenuRow({ label, hint, hintAmber, tall, onClick }: { label: string; hint?: string; hintAmber?: boolean; tall?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: hint ? "space-between" : "flex-start",
        height: tall ? 44 : 40,
        padding: "0 14px",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${COLOR.hair}`,
        cursor: "pointer",
        fontFamily: FONT.sans,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLOR.surfaceRaised)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 12, color: COLOR.ink1 }}>{label}</span>
      {hint ? (
        <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.08em", color: hintAmber ? COLOR.amber : COLOR.ink5 }}>{hint}</span>
      ) : null}
    </button>
  );
}

// Invite modal — the same personal-link + email-invite UI TopBar carried, mounted
// from the avatar menu now. Self-hiding row upstream (0 remaining → no row).
function InviteModal({ invite, onClose }: { invite: MyInvite; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Invite colleagues" onClick={(e) => e.stopPropagation()} style={{ ...ELEVATION.card, padding: 24, maxWidth: 480, width: "100%", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", fontFamily: FONT.sans }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div style={TYPE.microLabel}>Invite Colleagues</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: COLOR.ink4, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 0 }}>
            {String.fromCharCode(0xd7)}
          </button>
        </div>
        <p style={{ ...TYPE.bodyUI, margin: "0 0 12px 0" }}>
          Share your personal link. Anyone you invite gets FieldMark access — and their own invites to pass on.
        </p>
        <InviteShareCard code={invite.code} usesRemaining={invite.uses_remaining} />
        <div style={{ ...TYPE.microLabel, borderTop: `1px solid ${COLOR.hair}`, margin: "16px 0 12px", paddingTop: 12 }}>Or email an invite</div>
        <InviteEmailForm />
      </div>
    </div>
  );
}
