import type { AdminUserRow } from "../../lib/admin";
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  MONO,
  PALETTE,
  Section,
  Table,
  Td,
  humanizeJobFunction,
  orDash,
} from "./adminUi";

interface Props {
  rows: AdminUserRow[];
  loading: boolean;
  error: string | null;
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

/**
 * All users. Email comes from auth.users via the definer RPC — it is not on
 * msl_profiles and is not client-reachable by any other path.
 */
export default function AdminUsers({ rows, loading, error }: Props) {
  return (
    <Section
      title="Users"
      subtitle="Every profile, with email resolved server-side. Entitlement (allowed_ta_slugs) is server-controlled — users cannot edit their own."
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
          columns={["Name", "Email", "Company", "Job function", "Entitled TAs", "Invited by", "Admin"]}
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
              <Td
                mono
                style={{ color: r.is_admin ? PALETTE.accent : PALETTE.dim }}
              >
                {r.is_admin ? "yes" : "no"}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}
