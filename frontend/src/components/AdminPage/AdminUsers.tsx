import { useState } from "react";
import { setUserActive, type AdminUserRow } from "../../lib/admin";
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  MONO,
  PALETTE,
  Section,
  Table,
  Td,
  buttonStyle,
  humanizeJobFunction,
  orDash,
} from "./adminUi";

interface Props {
  rows: AdminUserRow[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}

function fullName(r: AdminUserRow): string {
  const n = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  return n === "" ? String.fromCharCode(0x2014) : n;
}

function TaChips({ slugs }: { slugs: string[] | null }) {
  if (!slugs || slugs.length === 0) {
    return <span style={{ color: PALETTE.dim }}>{String.fromCharCode(0x2014)}</span>;
  }
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {slugs.map((s) => (
        <span
          key={s}
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: PALETTE.muted,
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 3,
            padding: "1px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {s}
        </span>
      ))}
    </span>
  );
}

/** Status + reversible deactivate/reactivate control, with its own busy/error. */
function StatusCell({ row, onChanged }: { row: AdminUserRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = !row.deactivated_at;

  async function run() {
    // Confirm only the disruptive direction.
    if (active) {
      const ok = window.confirm(
        `Deactivate ${fullName(row)}? They will be bounced from the app until reactivated.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await setUserActive(row.user_id, !active);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    onChanged();
  }

  return (
    <Td>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: active ? PALETTE.green : PALETTE.red,
          }}
        >
          {active ? "active" : "suspended"}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          style={{
            ...buttonStyle(active ? "ghost" : "primary"),
            padding: "3px 10px",
            fontSize: 11,
            opacity: busy ? 0.6 : 1,
            color: active ? PALETTE.red : PALETTE.accent,
            borderColor: active ? PALETTE.red : PALETTE.accent,
          }}
        >
          {busy ? "..." : active ? "Deactivate" : "Reactivate"}
        </button>
        {err ? (
          <span style={{ fontSize: 10, color: PALETTE.red, fontFamily: MONO, maxWidth: 160 }}>
            {err}
          </span>
        ) : null}
      </div>
    </Td>
  );
}

/**
 * All users. Email comes from auth.users via the definer RPC — it is not on
 * msl_profiles and is not client-reachable by any other path. The Status column
 * is a reversible is_admin-gated safety valve (set_user_active).
 */
export default function AdminUsers({ rows, loading, error, onChanged }: Props) {
  return (
    <Section
      title="Users"
      subtitle="Every profile, with email resolved server-side. Deactivation is reversible and bounces the user's session; an admin cannot deactivate their own account."
      right={
        rows.length > 0 ? (
          <span style={{ fontSize: 11, color: PALETTE.dim, fontFamily: MONO }}>
            {rows.length} total
          </span>
        ) : undefined
      }
    >
      {loading ? (
        <LoadingNote />
      ) : error ? (
        <ErrorNote message={error} />
      ) : rows.length === 0 ? (
        <EmptyNote>No users yet.</EmptyNote>
      ) : (
        <Table
          columns={["Name", "Email", "Company", "Job function", "Entitled TAs", "Invited by", "Admin", "Status"]}
        >
          {rows.map((r) => (
            <tr key={r.user_id}>
              <Td>{fullName(r)}</Td>
              <Td mono dim>
                {orDash(r.email)}
              </Td>
              <Td dim>{orDash(r.company)}</Td>
              <Td dim>{humanizeJobFunction(r.job_function)}</Td>
              <Td>
                <TaChips slugs={r.allowed_ta_slugs} />
              </Td>
              <Td dim>{orDash(r.invited_by_name)}</Td>
              <Td mono style={{ color: r.is_admin ? PALETTE.accent : PALETTE.dim }}>
                {r.is_admin ? "yes" : "no"}
              </Td>
              <StatusCell row={r} onChanged={onChanged} />
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}
