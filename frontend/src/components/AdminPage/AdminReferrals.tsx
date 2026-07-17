import type { ReferralEdge } from "../../lib/admin";
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PALETTE,
  Section,
  Table,
  Td,
  formatTimestamp,
  humanizeJobFunction,
  orDash,
} from "./adminUi";

interface Props {
  rows: ReferralEdge[];
  loading: boolean;
  error: string | null;
}

/**
 * The referral edges. A null inviter is a root node — an admin-seeded invite with
 * no parent — so it renders as "(root)" rather than an em-dash, which would read
 * as missing data instead of the structural fact it is.
 */
export default function AdminReferrals({ rows, loading, error }: Props) {
  return (
    <Section
      title="Referrals"
      subtitle="Who invited whom. Sourced from invite_redemptions, which no client can read directly."
    >
      {loading ? (
        <LoadingNote />
      ) : error ? (
        <ErrorNote message={error} />
      ) : rows.length === 0 ? (
        <EmptyNote>No redemptions yet.</EmptyNote>
      ) : (
        <Table columns={["Inviter", "Invitee", "Company", "Job function", "Code", "Redeemed"]}>
          {rows.map((r) => (
            <tr key={`${r.invite_code}-${r.redeemed_by}`}>
              <Td>
                {r.inviter_id == null ? (
                  <span style={{ color: PALETTE.dim, fontStyle: "italic" }}>(root)</span>
                ) : (
                  orDash(r.inviter_name)
                )}
                {r.inviter_company ? (
                  <div style={{ fontSize: 11, color: PALETTE.dim }}>{r.inviter_company}</div>
                ) : null}
              </Td>
              <Td>{orDash(r.invitee_name)}</Td>
              <Td dim>{orDash(r.invitee_company)}</Td>
              <Td dim>{humanizeJobFunction(r.job_function)}</Td>
              <Td dim mono style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                {orDash(r.invite_code)}
              </Td>
              <Td dim mono>
                {formatTimestamp(r.redeemed_at)}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}
