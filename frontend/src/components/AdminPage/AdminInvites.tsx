import { useState } from "react";
import { mintInvite, setInviteActive, type InviteRow } from "../../lib/admin";
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
  formatTimestamp,
  inputStyle,
  labelStyle,
  orDash,
} from "./adminUi";

interface Props {
  rows: InviteRow[];
  loading: boolean;
  error: string | null;
  onMinted: () => void;
  onChanged: () => void;
}

/** is_active status + reversible revoke/reactivate control, own busy/error. */
function InviteStatusCell({ row, onChanged }: { row: InviteRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (row.is_active) {
      const ok = window.confirm(
        `Revoke this invite? The link stops working immediately (reversible).`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await setInviteActive(row.code, !row.is_active);
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
        <span style={{ fontFamily: MONO, fontSize: 11, color: row.is_active ? PALETTE.green : PALETTE.dim }}>
          {row.is_active ? "active" : "revoked"}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          style={{
            ...buttonStyle(row.is_active ? "ghost" : "primary"),
            padding: "3px 10px",
            fontSize: 11,
            opacity: busy ? 0.6 : 1,
            color: row.is_active ? PALETTE.red : PALETTE.accent,
            borderColor: row.is_active ? PALETTE.red : PALETTE.accent,
          }}
        >
          {busy ? "..." : row.is_active ? "Revoke" : "Reactivate"}
        </button>
        {err ? (
          <span style={{ fontSize: 10, color: PALETTE.red, fontFamily: MONO, maxWidth: 160 }}>{err}</span>
        ) : null}
      </div>
    </Td>
  );
}

function CodeCell({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy code"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        fontFamily: MONO,
        fontSize: 12,
        color: copied ? PALETTE.green : PALETTE.muted,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {copied ? "copied" : code}
    </button>
  );
}

export default function AdminInvites({ rows, loading, error, onMinted, onChanged }: Props) {
  const [quota, setQuota] = useState("10");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [minted, setMinted] = useState<string | null>(null);
  const [copiedNew, setCopiedNew] = useState(false);

  async function runMint() {
    const parsed = Number(quota.trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      setMintError("Quota must be a whole number of at least 1.");
      return;
    }
    setBusy(true);
    setMintError(null);
    setMinted(null);
    const { data, error: err } = await mintInvite(parsed, note.trim() === "" ? null : note.trim());
    if (err) {
      setMintError(err);
    } else if (data) {
      setMinted(data);
      setNote("");
      onMinted();
    }
    setBusy(false);
  }

  const joinUrl = minted ? `${window.location.origin}/join/${minted}` : "";

  return (
    <Section
      title="Invites"
      subtitle="Minted in your name — the server attributes every invite to the calling admin, so there is no inviter field to set."
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <label htmlFor="admin-quota" style={labelStyle}>
            Quota
          </label>
          <input
            id="admin-quota"
            type="text"
            inputMode="numeric"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="admin-note" style={labelStyle}>
            Note (optional)
          </label>
          <input
            id="admin-note"
            type="text"
            value={note}
            placeholder="who is this for?"
            onChange={(e) => setNote(e.target.value)}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runMint()}
          style={{ ...buttonStyle("primary"), opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Minting..." : "Mint invite"}
        </button>
      </div>

      {mintError ? (
        <div style={{ marginTop: 12 }}>
          <ErrorNote message={mintError} />
        </div>
      ) : null}

      {minted ? (
        <div
          style={{
            marginTop: 16,
            border: `1px solid ${PALETTE.accent}`,
            backgroundColor: "rgba(232,160,32,0.06)",
            borderRadius: 3,
            padding: 12,
          }}
        >
          <div style={{ ...labelStyle, color: PALETTE.accent }}>New invite link</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <code
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: PALETTE.text,
                wordBreak: "break-all",
              }}
            >
              {joinUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(joinUrl).then(
                  () => {
                    setCopiedNew(true);
                    window.setTimeout(() => setCopiedNew(false), 1500);
                  },
                  () => setCopiedNew(false),
                );
              }}
              style={buttonStyle()}
            >
              {copiedNew ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <LoadingNote />
        ) : error ? (
          <ErrorNote message={error} />
        ) : rows.length === 0 ? (
          <EmptyNote>No invites yet.</EmptyNote>
        ) : (
          <Table columns={["Code", "Inviter", "Uses left", "Redeemed", "Status", "Note", "Created"]}>
            {rows.map((r) => (
              <tr key={r.code}>
                <Td>
                  <CodeCell code={r.code} />
                </Td>
                <Td>{orDash(r.inviter_name)}</Td>
                <Td mono>{r.uses_remaining}</Td>
                <Td mono style={{ color: r.redemption_count > 0 ? PALETTE.accent : undefined }}>
                  {r.redemption_count}
                </Td>
                <InviteStatusCell row={r} onChanged={onChanged} />
                <Td dim>{orDash(r.note)}</Td>
                <Td dim mono>
                  {formatTimestamp(r.created_at)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Section>
  );
}
