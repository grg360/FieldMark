import { useState } from "react";
import { inviteUrl } from "../../lib/invites";

interface Props {
  code: string;
  /** null when unknown (e.g. the code was captured at signup before a fresh read). */
  usesRemaining: number | null;
  accent?: string;
}

/**
 * The shareable-link primitive: shows the full /join/<code> URL, a Copy-link
 * button that puts the WHOLE URL (not just the code) on the clipboard — that's
 * what a user pastes into Slack/text/email — and remaining uses. Shared by the
 * one-time post-signup welcome banner and the persistent /me invite tile.
 */
export default function InviteShareCard({ code, usesRemaining, accent = "#E8A020" }: Props) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(code);

  function copy() {
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "monospace",
            fontSize: 12,
            color: "#E8E6DF",
            backgroundColor: "#0A0A0B",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            padding: "8px 10px",
            wordBreak: "break-all",
          }}
        >
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          style={{
            backgroundColor: copied ? "rgba(74,222,128,0.12)" : "rgba(232,160,32,0.1)",
            border: `1px solid ${copied ? "#4ADE80" : accent}`,
            color: copied ? "#4ADE80" : accent,
            borderRadius: 4,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
      {usesRemaining !== null ? (
        <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 8, fontFamily: "monospace" }}>
          {usesRemaining} {usesRemaining === 1 ? "invite" : "invites"} remaining
        </div>
      ) : null}
    </div>
  );
}
