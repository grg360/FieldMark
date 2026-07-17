import { useState, type CSSProperties } from "react";
import { sendInviteEmail } from "../../lib/invites";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email a colleague their FieldMark invite. The server picks the caller's own
 * code — this form supplies only the recipient + an optional note. Sits beside
 * the copy-link affordance so both share modes are available.
 */
export default function InviteEmailForm() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send() {
    const recipient = email.trim().toLowerCase();
    if (!EMAIL_RE.test(recipient)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, error: err } = await sendInviteEmail(recipient, note);
    setBusy(false);
    if (!ok) {
      setError(err ?? "Could not send the invite.");
      return;
    }
    setSentTo(recipient);
    setEmail("");
    setNote("");
  }

  if (sentTo) {
    return (
      <div
        style={{
          border: "1px solid #4ADE80",
          backgroundColor: "rgba(74,222,128,0.08)",
          borderRadius: 4,
          padding: "10px 12px",
          fontSize: 12,
          color: "#4ADE80",
          fontFamily: "monospace",
        }}
      >
        Invite emailed to {sentTo}.{" "}
        <button
          type="button"
          onClick={() => setSentTo(null)}
          style={{
            background: "none",
            border: "none",
            color: "#9B9892",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            textDecoration: "underline",
            padding: 0,
          }}
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="email"
        value={email}
        placeholder="colleague@company.com"
        autoComplete="off"
        onChange={(e) => setEmail(e.target.value)}
        style={inputStyle}
      />
      <textarea
        value={note}
        placeholder="Add a personal note (optional)"
        rows={2}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "system-ui, sans-serif" }}
      />
      {error ? (
        <div style={{ fontSize: 11, color: "#F87171", fontFamily: "monospace" }}>{error}</div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void send()}
        style={{
          alignSelf: "flex-start",
          backgroundColor: "rgba(232,160,32,0.1)",
          border: "1px solid #E8A020",
          color: "#E8A020",
          borderRadius: 4,
          padding: "7px 16px",
          fontSize: 12,
          fontWeight: 500,
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy ? "Sending..." : "Email invite"}
      </button>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  backgroundColor: "#0A0A0B",
  border: "1px solid #1E1E22",
  color: "#E8E6DF",
  borderRadius: 4,
  padding: "8px 10px",
  fontSize: 12,
  fontFamily: "monospace",
  outline: "none",
};
