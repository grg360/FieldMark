import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  getAppConfig,
  listInvites,
  listUsers,
  referralGraph,
  type AdminUserRow,
  type AppConfig,
  type InviteRow,
  type ReferralEdge,
} from "../../lib/admin";
import { useIsAdmin } from "../../lib/useIsAdmin";
import AppLayout from "../AppLayout";
import AdminInvites from "./AdminInvites";
import AdminKillSwitch from "./AdminKillSwitch";
import AdminReferrals from "./AdminReferrals";
import AdminUsers from "./AdminUsers";
import { PALETTE, buttonStyle } from "./adminUi";

/**
 * The Garrett-only admin page. Replaces hand-SQL invite management.
 *
 * The is_admin() call below is a VISIBILITY gate — it decides whether to render
 * or redirect, nothing more. It is not the security boundary and must not be
 * mistaken for one: every RPC this page calls re-checks is_admin() server-side
 * and raises 'not authorized' for a non-admin (verified over the real
 * authenticated path in Stage 3a). A non-admin who bypasses this redirect, or
 * calls the RPCs straight from devtools, still gets nothing.
 *
 * All data flows through those RPCs. No .from() call belongs here — the
 * underlying tables are client-locked by design.
 */

type Loadable<T> = { data: T; loading: boolean; error: string | null };

const initial = <T,>(data: T): Loadable<T> => ({ data, loading: true, error: null });

export default function AdminPage() {
  const { state: gate } = useIsAdmin();

  const [config, setConfig] = useState<Loadable<AppConfig | null>>(initial(null));
  const [invites, setInvites] = useState<Loadable<InviteRow[]>>(initial([]));
  const [referrals, setReferrals] = useState<Loadable<ReferralEdge[]>>(initial([]));
  const [users, setUsers] = useState<Loadable<AdminUserRow[]>>(initial([]));
  const [refreshing, setRefreshing] = useState(false);

  const loadInvites = useCallback(async () => {
    const { data, error } = await listInvites();
    setInvites({ data: data ?? [], loading: false, error });
  }, []);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    const [c, i, r, u] = await Promise.all([
      getAppConfig(),
      listInvites(),
      referralGraph(),
      listUsers(),
    ]);
    setConfig({ data: c.data, loading: false, error: c.error });
    setInvites({ data: i.data ?? [], loading: false, error: i.error });
    setReferrals({ data: r.data ?? [], loading: false, error: r.error });
    setUsers({ data: u.data ?? [], loading: false, error: u.error });
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (gate !== "admin") return;
    void loadAll();
  }, [gate, loadAll]);

  if (gate === "checking") {
    return (
      <AppLayout maxWidth={1120}>
        <div style={{ color: PALETTE.dim, fontSize: 13, padding: "48px 0" }}>Loading...</div>
      </AppLayout>
    );
  }

  // Visibility only. The server-side gate is what actually protects the data.
  if (gate === "denied") return <Navigate to="/me" replace />;

  return (
    <AppLayout breadcrumbs={[{ label: "Home", path: "/me" }, { label: "Admin" }]} maxWidth={1120}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: PALETTE.text, margin: 0 }}>Admin</h1>
          <p style={{ fontSize: 12, color: PALETTE.dim, margin: "6px 0 0" }}>
            Invite system control. Every action here runs through an is_admin-gated server RPC.
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void loadAll()}
          style={{ ...buttonStyle(), opacity: refreshing ? 0.6 : 1 }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <AdminKillSwitch
        config={config.data}
        loading={config.loading}
        error={config.error}
        onConfig={(c) => setConfig({ data: c, loading: false, error: null })}
      />

      <AdminInvites
        rows={invites.data}
        loading={invites.loading}
        error={invites.error}
        onMinted={() => void loadInvites()}
      />

      <AdminReferrals rows={referrals.data} loading={referrals.loading} error={referrals.error} />

      <AdminUsers rows={users.data} loading={users.loading} error={users.error} />
    </AppLayout>
  );
}
