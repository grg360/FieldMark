import { useEffect, useState } from "react";
import { isAdmin } from "./admin";

/**
 * Shared admin-status hook. Both the UserMenu (show/hide the Admin link) and the
 * AdminPage mount-gate read admin status through this one hook, so the is_admin()
 * RPC is not called twice and cannot disagree between the two.
 *
 * The result is cached at module scope for the life of the page: the first caller
 * fires the RPC, every later caller (and later mount) reuses the same promise.
 * A full reload re-checks — fine, since admin status effectively never changes
 * within a session. Fail-closed: any error resolves to false.
 *
 * This is UX only. Hiding the link is not the security boundary — the AdminPage
 * mount-gate redirects non-admins, and every admin RPC re-checks is_admin()
 * server-side. Bypassing this hook reveals nothing.
 */

type AdminState = "checking" | "admin" | "denied";

let cached: Promise<boolean> | null = null;

function resolveIsAdmin(): Promise<boolean> {
  if (!cached) {
    cached = isAdmin().catch(() => false);
  }
  return cached;
}

/** Test/edge escape hatch: drop the cached result so the next hook re-checks. */
export function clearIsAdminCache(): void {
  cached = null;
}

export function useIsAdmin(): { isAdmin: boolean; state: AdminState } {
  const [state, setState] = useState<AdminState>("checking");

  useEffect(() => {
    let cancelled = false;
    void resolveIsAdmin().then((ok) => {
      if (!cancelled) setState(ok ? "admin" : "denied");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin: state === "admin", state };
}
