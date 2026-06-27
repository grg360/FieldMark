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

      updateLastActive(session.user.id);

      if (!hydratedRef.current) {
        hydrateFromProfile(profile.region, profile.states_covered ?? []);
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

  return <>{children}</>;
}
