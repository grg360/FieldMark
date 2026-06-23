import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, getCurrentUser, getMslProfile, type MslProfile } from "../lib/authHelpers";

export default function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hcpDrawerOpen, setHcpDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<MslProfile | null>(null);
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
          border: "1.5px solid #E8A020",
          color: "#E8A020",
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
            position: "absolute",
            top: 40,
            right: 0,
            backgroundColor: "#0F0F12",
            border: "1px solid #1E1E22",
            borderRadius: 6,
            minWidth: 220,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          <style>{`
            .fm-menu-item {
              transition: background-color 120ms;
            }
            .fm-menu-item:hover {
              background-color: #1E1C26 !important;
            }
            .fm-menu-signout:hover {
              background-color: rgba(232, 112, 78, 0.08) !important;
            }
          `}</style>
          {profile?.first_name ? (
            <div
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: "#9B9892",
                borderBottom: "1px solid #1E1E22",
              }}
            >
              {profile.first_name} {profile.last_name}
              {profile.company ? (
                <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 2 }}>
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
                color: "#6B6A65",
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
          <div style={sectionDividerStyle} />
          <button
            type="button"
            onClick={() => signOut()}
            className="fm-menu-item fm-menu-signout"
            style={{ ...menuItemStyle, color: "#E8704E" }}
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
  color: "#E8E6DF",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};

const subMenuItemStyle: CSSProperties = {
  width: "100%",
  padding: "5px 12px 5px 24px",
  backgroundColor: "transparent",
  border: "none",
  color: "#C8C5BE",
  fontSize: 12,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};

const sectionLabelStyle: CSSProperties = {
  padding: "8px 12px 2px",
  fontSize: 10,
  fontWeight: 600,
  color: "#6B6A65",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontFamily: "system-ui, sans-serif",
};

const subsectionLabelStyle: CSSProperties = {
  padding: "6px 12px 2px",
  fontSize: 13,
  fontWeight: 500,
  color: "#E8E6DF",
  fontFamily: "system-ui, sans-serif",
};

const sectionDividerStyle: CSSProperties = {
  height: 1,
  backgroundColor: "#1E1E22",
  margin: "4px 0",
};
