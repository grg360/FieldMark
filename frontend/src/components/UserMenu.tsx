import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { signOut, getCurrentUser, getMslProfile, type MslProfile } from "../lib/authHelpers";

export default function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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
            minWidth: 180,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
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
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/me");
            }}
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
            style={menuItemStyle}
          >
            Follow-Ups
          </button>
          <div style={{ height: 1, backgroundColor: "#1E1E22", margin: "4px 0" }} />
          <button
            type="button"
            onClick={() => signOut()}
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
  padding: "10px 12px",
  backgroundColor: "transparent",
  border: "none",
  color: "#E8E6DF",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};
