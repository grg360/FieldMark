import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, getCurrentUser, getMslProfile, type MslProfile } from "../lib/authHelpers";
import { useIsAdmin } from "../lib/useIsAdmin";
import { COLOR, ELEVATION, FONT, TYPE } from "../lib/designTokens";

export default function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hcpDrawerOpen, setHcpDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<MslProfile | null>(null);
  const { isAdmin } = useIsAdmin();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (user) {
        const p = await getMslProfile(user.id);
        setProfile(p);
      }
    })();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHcpDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials =
    profile?.first_name && profile?.last_name
      ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
      : "??";

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="fm-pill-button"
        onClick={() => setOpen(!open)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: "transparent",
          border: `1.5px solid ${COLOR.amber}`,
          color: COLOR.amber,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="User menu"
      >
        {initials}
      </button>

      {open ? (
        <div
          style={{
            ...ELEVATION.card,
            position: "absolute",
            top: 40,
            right: 0,
            minWidth: 220,
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          <style>{`
            .fm-menu-item {
              transition: background-color 120ms;
            }
            .fm-menu-item:hover {
              background-color: ${COLOR.surfaceRaised} !important;
            }
            .fm-menu-signout:hover {
              /* COLOR.danger (#E8704E) at 8% */
              background-color: rgba(232, 112, 78, 0.08) !important;
            }
          `}</style>
          {profile?.first_name ? (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: COLOR.ink3,
                borderBottom: `1px solid ${COLOR.hair}`,
                fontFamily: FONT.sans,
              }}
            >
              {profile.first_name} {profile.last_name}
              {profile.company ? (
                <div style={{ fontSize: 11, color: COLOR.ink4, marginTop: 2 }}>
                  {profile.company}
                </div>
              ) : null}
            </div>
          ) : null}
          <div style={sectionLabelStyle}>WORKSPACE</div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/me");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/me/watchlists");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Watchlists
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/me/follow-ups");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Follow-Ups
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/me/insights");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Field Insights
          </button>
          <div style={sectionDividerStyle} />
          <div style={sectionLabelStyle}>DISCOVER</div>
          <button
            type="button"
            onClick={() => setHcpDrawerOpen((v) => !v)}
            className="fm-menu-item"
            style={{
              ...menuItemStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
            aria-expanded={hcpDrawerOpen}
          >
            <span>HCP Dashboards</span>
            <span
              style={{
                fontSize: 10,
                color: COLOR.ink4,
                display: "inline-block",
                transform: hcpDrawerOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
                marginLeft: 8,
              }}
              aria-hidden="true"
            >
              {String.fromCharCode(0x25B8)}
            </span>
          </button>
          {hcpDrawerOpen ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setHcpDrawerOpen(false);
                  navigate("/oncology/established/nsclc");
                }}
                className="fm-menu-item"
                style={subMenuItemStyle}
              >
                Established
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setHcpDrawerOpen(false);
                  navigate("/oncology/rising-stars/nsclc");
                }}
                className="fm-menu-item"
                style={subMenuItemStyle}
              >
                Rising Stars
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setHcpDrawerOpen(false);
                  navigate("/oncology/community/nsclc");
                }}
                className="fm-menu-item"
                style={subMenuItemStyle}
              >
                Community
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/institutions/nsclc");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Institutions
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/oncology/telescope/all");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Telescope
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/oncology/social/all");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Social
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/oncology/field-intelligence");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Field Intelligence
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/methodology");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Methodology
          </button>
          <div style={sectionDividerStyle} />
          <div style={sectionLabelStyle}>ACCOUNT</div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/me/settings");
            }}
            className="fm-menu-item"
            style={menuItemStyle}
          >
            Settings
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/admin");
              }}
              className="fm-menu-item"
              style={menuItemStyle}
            >
              Admin
            </button>
          ) : null}
          <div style={sectionDividerStyle} />
          <button
            type="button"
            onClick={() => signOut()}
            className="fm-menu-item fm-menu-signout"
            style={{ ...menuItemStyle, color: COLOR.danger }}
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}

const menuItemStyle: CSSProperties = {
  width: "100%",
  padding: "6px 12px",
  backgroundColor: "transparent",
  border: "none",
  color: COLOR.ink1,
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: FONT.sans,
};

const subMenuItemStyle: CSSProperties = {
  width: "100%",
  padding: "5px 12px 5px 24px",
  backgroundColor: "transparent",
  border: "none",
  color: COLOR.ink2,
  fontSize: 12,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: FONT.sans,
};

const sectionLabelStyle: CSSProperties = {
  ...TYPE.microLabel,
  padding: "8px 12px 2px",
};

const sectionDividerStyle: CSSProperties = {
  height: 1,
  backgroundColor: COLOR.hair,
  margin: "4px 0",
};
