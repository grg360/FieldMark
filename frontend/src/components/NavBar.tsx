// Platform navigation — Design frame NAV-BUILD-01. Replaces TopBar on every
// authenticated route and supersedes AssetNav (retired).
//
// Eight sections in taxonomy order — corpus (People · Institutions · SkyView),
// streams (Drugs · Congresses · Pulse · Social), forum (Intelligence). HOME has no
// label (2026-08-02): the wordmark IS home — it routes to /me on every route and
// both breakpoints, and a duplicate label was the price of fitting INSTITUTIONS
// into the 1120 bar. Desktop is a single 48px row (wordmark · rule · labels ·
// avatar pill); mobile (≤767px) is a 36px utility strip over a 4-over-4 cell
// grid — eight items fill it exactly, no empty cell. Non-sticky.
//
// WIDTH BUDGET (2026-08-02, measured): eight labels at gap 18 + search 232 +
// right-rail marginLeft:auto (no spacer child) leave ~9px true slack against the
// padded column edge inside CONTENT_WIDTH.standard with search mounted. The bar
// is FULL — a ninth label does not fit flat; that is the restructure trigger,
// not a tweak.
//
// The avatar menu is five rows — Settings, Methodology, Invite (self-hiding at 0),
// Admin (isAdmin only), Sign out — as a desktop dropdown and a full-width mobile
// sheet. HCP search (2026-08-08, global): a magnifier in the desktop right rail
// (left of the avatar, rendered only where a TA is supplied) toggles a centered
// bar under the nav — 2/3 nav width, in normal flow, so content drops while it
// is open. The old always-visible row below the bar is retired. Surface-header
// searches (feed/ledger) are unaffected. Invite lives here, not in the bar.
// Bibliography is intentionally absent pending its routing fix.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { COLOR, CONTENT_WIDTH, ELEVATION, FONT, TYPE } from "../lib/designTokens";
import { signOut, getCurrentUser, getMslProfile, type MslProfile } from "../lib/authHelpers";
import { useIsAdmin } from "../lib/useIsAdmin";
import { useMediaQuery } from "../lib/useMediaQuery";
import { getMyInvites, primaryInvite, type MyInvite } from "../lib/invites";
import { useTA } from "../lib/TAContext";
import SearchBar from "./SearchBar";
import InviteShareCard from "./HomePage/InviteShareCard";
import InviteEmailForm from "./HomePage/InviteEmailForm";

// Search wiring, forwarded from surfaces that supply a therapeutic-area id. When
// absent (no TA), search does not render — absent, not disabled.
interface NavSearch {
  currentTaId: string;
  onSearchSelect: (hcpId: string, taId: string) => void;
}

type NavKey = "home" | "people" | "drugs" | "trials" | "congresses" | "institutions" | "field-intelligence" | "social" | "pulse" | "skyview";

interface NavItem {
  key: NavKey;
  label: string;
  to: string;
}

// Bar targets — nearest working surface for each axis. HOME is the wordmark, not
// a label (both wordmarks route to /me; a canonical /home still slots there when
// it ships). PEOPLE → the cohort dashboard until /people exists. TERRITORY was
// removed 2026-07-31: it rendered the same FeedLayout surface as PEOPLE —
// territory scope is a filter in the strip, not a destination ("/" stays routed,
// just unlinked here). SOCIAL is the nav label; the page titles itself "The
// public conversation". FIELD INTELLIGENCE points at the forum (the real
// backend), not the feed track.
// Order (2026-08-03): People · Drugs · Trials · Congresses · Institutions ·
// Intelligence · Social · Pulse · SkyView. Nine items — fits the 1120 bar once
// search left it for its own row below (see DesktopBar / the search row).
const NAV_ITEMS: NavItem[] = [
  // HOME label added 2026-08-05 (chrome consolidation): the wordmark still
  // routes to /me as well; the explicit label ends the wordmark-only affordance
  // on desktop. Mobile's cell grid EXCLUDES home (see GRID_ITEMS) — the strip
  // wordmark is home there, and a tenth cell would break the exact 3×3.
  { key: "home", label: "Home", to: "/me" },
  // PEOPLE → the cohort ledger; the card feed stays routed at "/" but unlinked.
  { key: "people", label: "People", to: "/cohorts/ledger" },
  { key: "drugs", label: "Drugs", to: "/assets" },
  // TRIALS → the open-trials surface (2026-08-03).
  { key: "trials", label: "Trials", to: "/trials" },
  { key: "congresses", label: "Congresses", to: "/congress" },
  // INSTITUTIONS / SKYVIEW → NSCLC-hardcoded targets; generalize when the bar goes TA-aware.
  { key: "institutions", label: "Institutions", to: "/institutions/nsclc" },
  { key: "field-intelligence", label: "Intelligence", to: "/field-intelligence" },
  { key: "social", label: "Social", to: "/social" },
  { key: "pulse", label: "Pulse", to: "/pulse" },
  // SKYVIEW → immersive telescope; the strip chip still says "Telescope" (rename on hold).
  { key: "skyview", label: "SkyView", to: "/oncology/telescope/nsclc" },
];

const SEAM = COLOR.hairStrong;

// Prefix-based active resolution — must hold on nested routes (/hcp/:id,
// /congress/:slug, /pulse/:ta). Order matters: most specific first.
function activeKey(pathname: string): NavKey | null {
  const p = pathname;
  if (p.startsWith("/assets")) return "drugs";
  if (p.startsWith("/trials")) return "trials";
  if (p.startsWith("/congress")) return "congresses";
  if (p.startsWith("/pulse")) return "pulse";
  if (p.startsWith("/social")) return "social";
  if (p.startsWith("/field-intelligence")) return "field-intelligence";
  // Covers BOTH the index (/institutions/:ta) and detail (/institution/:slug).
  if (p.startsWith("/institution")) return "institutions";
  if (p.startsWith("/cohorts")) return "people";
  if (/\/telescope(\/|$)/.test(p)) return "skyview";
  if (p.startsWith("/hcp") || p.startsWith("/landscape")) return "people";
  if (/\/(established|rising-stars|community)(\/|$)/.test(p)) return "people";
  if (p === "/") return "people"; // feed root resolves the default cohort feed
  // HOME lights for /me and the personal surfaces under it (week, settings,
  // watchlists, follow-ups, insights).
  if (p === "/me" || p.startsWith("/me/")) return "home";
  // Unmarked: the telescope track and the retained-but-unlinked FI feed track.
  return null;
}

function initialsOf(profile: MslProfile | null): string {
  if (profile?.first_name && profile?.last_name) {
    return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
  }
  return "··";
}

export default function NavBar({
  currentTaId,
  onSearchSelect,
  translucent = false,
}: {
  currentTaId?: string;
  onSearchSelect?: (hcpId: string, taId: string) => void;
  // Immersive surfaces (Skyview) float the bar over a full-bleed canvas — swap the
  // opaque ground for a translucent, blurred backdrop so the sky shows through.
  translucent?: boolean;
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const active = activeKey(location.pathname);
  const { indicationTaId } = useTA();

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

  // Platform-wide search (2026-08-08): surfaces that pass explicit wiring keep
  // it; everywhere else the bar falls back to the ambient TA (TAContext defaults
  // to Oncology/NSCLC) and plain profile navigation — so the magnifier renders
  // on EVERY NavBar mount, not just Home/The Week.
  const search: NavSearch | null =
    currentTaId && onSearchSelect
      ? { currentTaId, onSearchSelect }
      : indicationTaId
        ? { currentTaId: indicationTaId, onSearchSelect: (hcpId) => navigate(`/hcp/${hcpId}`) }
        : null;

  return isMobile ? (
    <MobileBar active={active} menu={menu} search={search} translucent={translucent} />
  ) : (
    <DesktopBar active={active} menu={menu} search={search} translucent={translucent} />
  );
}

interface MenuData {
  profile: MslProfile | null;
  email: string;
  isAdmin: boolean;
  invite: MyInvite | null;
  initials: string;
}

// ── Desktop ──────────────────────────────────────────────────────────────────
// Self-centering (2026-07-31): the bar centers its own content at
// CONTENT_WIDTH.standard inside a full-bleed seam, so it renders identically on
// every mount. Mount sites must NOT wrap it in a narrower width container —
// AppLayout and the NavBar-direct pages mount it above their content wrappers.
function DesktopBar({ active, menu, search, translucent }: { active: NavKey | null; menu: MenuData; search: NavSearch | null; translucent?: boolean }) {
  // Click-to-reveal search (2026-08-08, global): the always-visible row below
  // the bar retired. A magnifier in the right rail (left of the avatar) toggles
  // a bar in normal flow — 2/3 nav width, centered, pushing content down while
  // open (same-day revision from the overlay treatment: dropping reads better
  // than floating). Esc / click-away / re-click close; select closes then fires.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (searchPanelRef.current?.contains(t) || searchBtnRef.current?.contains(t)) return;
      setSearchOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  return (
    <nav
      style={{
        position: "relative",
        borderBottom: `1px solid ${translucent ? "rgba(255,255,255,0.08)" : COLOR.hairStrong}`,
        background: translucent ? "rgba(3,5,12,0.42)" : COLOR.ground,
        ...(translucent ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } : {}),
      }}
      aria-label="Primary"
    >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        height: 48,
        padding: "0 18px",
        maxWidth: CONTENT_WIDTH.standard,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <Link
        to="/me"
        style={{ fontFamily: FONT.mono, fontSize: 12.5, letterSpacing: "0.2em", color: COLOR.amber, textDecoration: "none" }}
      >
        FIELDMARK
      </Link>
      <span style={{ width: 1, height: 20, background: SEAM, flex: "none" }} />
      {/* gap 18 (was 22): measured trade — 28px recovered toward fitting
          INSTITUTIONS while keeping the search input at a typeable width. */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
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
                textAlign: "center", // 2026-08-10: labels centered within their blocks
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
      {/* Right rail replaces the flex-1 spacer (2026-08-02): a zero-width spacer
          still cost one 20px container gap; marginLeft:auto reclaims it. With
          labels at gap 18 and search at 232 the rail lands exactly on the padded
          column edge with ~9px true slack — verified against the padded edge,
          not scrollWidth (the old bar overflowed its padding by 21.8px). */}
      {/* Search left the bar (2026-08-03): nine labels need the width. Right rail
          (2026-08-08): magnifier toggle (where a TA is supplied) + avatar. */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginLeft: "auto" }}>
        {search ? (
          <button
            ref={searchBtnRef}
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search HCPs"
            aria-expanded={searchOpen}
            className="fm-pill-button"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", minHeight: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = searchOpen ? "1" : "0.85"; }}
          >
            {/* same magnifier as the mobile utility strip — nav chrome, not an afterthought */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <circle cx="7.5" cy="7.5" r="5.5" stroke={searchOpen ? COLOR.ink1 : COLOR.ink3} strokeWidth="1.5" />
              <line x1="11.5" y1="11.5" x2="16" y2="16" stroke={searchOpen ? COLOR.ink1 : COLOR.ink3} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        <AvatarMenu menu={menu} mobile={false} />
      </div>
    </div>
    {search && searchOpen ? (
      // Revealed search — in normal flow (2026-08-08 revision: pushes content
      // down rather than overlaying it). A full-bleed band under the bar with
      // the input at 2/3 nav width, centered. Same SearchBar, same placeholder,
      // same results.
      <div
        ref={searchPanelRef}
        style={{
          width: "66.666%",
          margin: "0 auto",
          boxSizing: "border-box",
          padding: "10px 18px",
          borderTop: `1px solid ${translucent ? "rgba(255,255,255,0.08)" : SEAM}`,
        }}
      >
        <SearchBar
          variant="inline"
          fluid
          currentTaId={search.currentTaId}
          onSelect={(hcpId, taId) => {
            setSearchOpen(false);
            search.onSearchSelect(hcpId, taId);
          }}
        />
      </div>
    ) : null}
    </nav>
  );
}

// ── Mobile ───────────────────────────────────────────────────────────────────
// MobileBar (2026-08-10 rebuild): the 4-over-3-over-3 cell grid consumed
// ~198px of stacked nav blocks above the content on EVERY surface and its
// cells clipped at true device widths — replaced with a compact 44px bar +
// hamburger DRAWER. All ten destinations live in the drawer (mono, charcoal,
// hairline seams, gold inset for the active route); the drawer closes on
// select, Esc, and click-away. HOME stays a listed destination — the
// wordmark's tappability is not discoverable (2026-08-05 note carried over).
function MobileBar({ active, menu, search, translucent }: { active: NavKey | null; menu: MenuData; search: NavSearch | null; translucent?: boolean }) {
  const [open, setOpen] = useState(false);
  // Search state lives on the bar (2026-08-10): the revealed field renders IN
  // FLOW below the strip and pushes content down — the same "dropping reads
  // better than floating" ruling the desktop reveal band carries. Opening one
  // of menu/search closes the other.
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!open && !searchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, searchOpen]);

  const activeLabel = NAV_ITEMS.find((i) => i.key === active)?.label ?? null;

  return (
    <nav aria-label="Primary" style={{ position: "relative" }}>
      {/* 44px utility bar — the whole permanent nav footprint on mobile */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          borderBottom: `1px solid ${translucent ? "rgba(255,255,255,0.08)" : COLOR.hairStrong}`,
          background: translucent ? "rgba(3,5,12,0.42)" : COLOR.ground,
          ...(translucent ? { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } : {}),
        }}
      >
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); setSearchOpen(false); }}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 8, margin: -8, marginRight: -2, display: "flex", flexDirection: "column", gap: 4, minHeight: 0 }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ display: "block", width: 16, height: 1.5, background: open ? COLOR.amber : COLOR.ink2 }} />
          ))}
        </button>
        <Link to="/me" style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.2em", color: COLOR.amber, textDecoration: "none" }}>
          FIELDMARK
        </Link>
        {/* current surface, so the bar orients without the grid */}
        {activeLabel ? (
          <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.12em", color: COLOR.ink3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            / {activeLabel}
          </span>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          {search ? (
            <button
              type="button"
              onClick={() => { setSearchOpen((o) => !o); setOpen(false); }}
              aria-label={searchOpen ? "Close search" : "Search"}
              aria-expanded={searchOpen}
              className="fm-pill-button"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", minHeight: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="7.5" cy="7.5" r="5.5" stroke={searchOpen ? COLOR.amber : COLOR.ink3} strokeWidth="1.5" />
                <line x1="11.5" y1="11.5" x2="16" y2="16" stroke={searchOpen ? COLOR.amber : COLOR.ink3} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <AvatarMenu menu={menu} mobile />
        </div>
      </div>

      {/* revealed search — NORMAL FLOW below the strip, pushing content down
          (not an overlay; parity with the desktop reveal band's ruling) */}
      {searchOpen && search ? (
        <SearchBar
          isOpen
          currentTaId={search.currentTaId}
          onClose={() => setSearchOpen(false)}
          onSelect={(hcpId, taId) => {
            setSearchOpen(false);
            search.onSearchSelect(hcpId, taId);
          }}
        />
      ) : null}

      {/* drawer — overlays content, consumes no layout height when closed */}
      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, top: 44, background: "rgba(0,0,0,0.55)", zIndex: 60 }} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 61,
              background: COLOR.ground,
              borderBottom: `1px solid ${COLOR.hairStrong}`,
              boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
              maxHeight: "calc(100vh - 44px)",
              overflowY: "auto",
            }}
          >
            {NAV_ITEMS.map((item) => {
              const on = item.key === active;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "page" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 46,
                    padding: "0 16px",
                    borderBottom: `1px solid ${SEAM}`,
                    background: on ? COLOR.surfaceRaised : "transparent",
                    boxShadow: on ? `inset 2px 0 0 ${COLOR.amber}` : "none",
                    textDecoration: "none",
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: on ? COLOR.ink1 : COLOR.ink3,
                    fontWeight: on ? 500 : 400,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      ) : null}
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

  // Established treatment (exact old TopBar UserMenu): a 32×32 circle, transparent
  // fill, 1.5px amber ring, amber initials — the amber reads correctly as a ring; a
  // solid fill of the same token (#E8A020) reads yellow at this size. No caret.
  // fm-pill-button opts out of the global `button { min-height: 44px }`; flexShrink
  // 0 + minWidth keep it square in the flex row.
  const pill = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Account menu"
      aria-haspopup="menu"
      aria-expanded={open}
      className="fm-pill-button"
      style={{
        width: 32,
        height: 32,
        minWidth: 32,
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: "50%",
        backgroundColor: "transparent",
        border: `1.5px solid ${COLOR.amber}`,
        color: COLOR.amber,
        padding: 0,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT.mono,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {menu.initials}
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
      className="fm-pill-button"
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
