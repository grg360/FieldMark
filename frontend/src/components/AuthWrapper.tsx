import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getMslProfile, updateLastActive } from "../lib/authHelpers";
import { useFilterContext } from "../lib/filter-context";
import { identifyUser } from "../lib/analytics";
interface Props {
  children: ReactNode;
}

export default function AuthWrapper({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [suspended, setSuspended] = useState(false);
  const { hydrateFromProfile } = useFilterContext();
  const hydratedRef = useRef(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!active) return;

      if (location.pathname === "/landing" || location.pathname === "/demo") {
        setChecking(false);
        return;
      }

      if (!session?.user) {
        navigate("/landing");
        return;
      }

      if (location.pathname === "/welcome") {
        setChecking(false);
        return;
      }

      const profile = await getMslProfile(session.user.id);
      if (!profile) {
        navigate("/welcome");
        return;
      }

      // Admin suspension gate — checked on EVERY AuthWrapper pass (the effect
      // re-runs on each navigation), with a LIVE uncached read so a mid-session
      // deactivation bounces on the next navigation, not only on full reload
      // (getMslProfile is memoized and would serve a stale active profile).
      const { data: statusRow } = await supabase
        .from("msl_profiles")
        .select("deactivated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (statusRow?.deactivated_at) {
        setSuspended(true);
        setChecking(false);
        return;
      }
      setSuspended(false);

      updateLastActive(session.user.id);

      if (!hydratedRef.current) {
        // National is the default on load; the saved territory sets context only
        // (for the Territory toggle), it does NOT auto-apply as a feed state filter.
        hydrateFromProfile(profile.region, []);
        hydratedRef.current = true;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        identifyUser(user.id, {
          email: user.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          company: profile.company,
          region: profile.region,
        });
      }

      setChecking(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && location.pathname !== "/landing") {
        navigate("/landing");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [location.pathname, navigate, hydrateFromProfile]);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0A0A0B",
          color: "#6B6A65",
          fontSize: 13,
        }}
      >
        Loading...
      </div>
    );
  }

  if (suspended) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0A0A0B",
          color: "#E8E6DF",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Your access has been suspended
          </div>
          <p style={{ fontSize: 14, color: "#9B9892", lineHeight: 1.6, margin: "0 0 24px" }}>
            This account is no longer active. If you think this is a mistake, contact your FieldMark
            administrator.
          </p>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            style={{
              backgroundColor: "#0D0D10",
              border: "1px solid #1E1E22",
              color: "#9B9892",
              borderRadius: 4,
              padding: "8px 20px",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
