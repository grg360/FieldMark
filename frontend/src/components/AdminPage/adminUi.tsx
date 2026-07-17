import type { CSSProperties, ReactNode } from "react";

/**
 * Shared primitives for the admin page. The palette matches the established
 * non-feed pages (WatchlistsPage / FollowUpsPage / PublicationsListPage):
 * #0A0A0B bg, #111113 cards, #1E1E22 borders, #E8E6DF text, #E8A020 accent,
 * monospace for data. No new dependency — plain inline-styled markup.
 */

export const PALETTE = {
  card: "#111113",
  border: "#1E1E22",
  text: "#E8E6DF",
  muted: "#9B9892",
  dim: "#6B6A65",
  faint: "#3A3A3F",
  accent: "#E8A020",
  green: "#4ADE80",
  red: "#F87171",
} as const;

export const MONO = "monospace";

export function Section({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section
      style={{
        backgroundColor: PALETTE.card,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 4,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: subtitle ? 4 : 16,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 500, color: PALETTE.text, margin: 0 }}>
          {title}
        </h2>
        {right}
      </div>
      {subtitle ? (
        <p style={{ fontSize: 12, color: PALETTE.dim, margin: "0 0 16px", lineHeight: 1.5 }}>
          {subtitle}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/** The 'not authorized' banner. The mount-gate should make this unreachable, but
 *  the RPC is the real fence, so its rejection must render rather than vanish. */
export function ErrorNote({ message }: { message: string }) {
  const denied = message.toLowerCase().includes("not authorized");
  return (
    <div
      style={{
        border: `1px solid ${denied ? PALETTE.accent : PALETTE.red}`,
        backgroundColor: denied ? "rgba(232,160,32,0.08)" : "rgba(248,113,113,0.08)",
        color: denied ? PALETTE.accent : PALETTE.red,
        borderRadius: 3,
        padding: "8px 12px",
        fontSize: 12,
        fontFamily: MONO,
      }}
    >
      {denied ? `Server refused: ${message}` : message}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: PALETTE.dim, padding: "20px 0", textAlign: "center" }}>
      {children}
    </div>
  );
}

export function LoadingNote() {
  return (
    <div style={{ fontSize: 13, color: PALETTE.dim, padding: "20px 0" }}>Loading...</div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: PALETTE.dim,
  padding: "0 12px 8px 0",
  borderBottom: `1px solid ${PALETTE.border}`,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  fontSize: 12,
  color: PALETTE.text,
  padding: "10px 12px 10px 0",
  borderBottom: `1px solid ${PALETTE.border}`,
  verticalAlign: "top",
};

/** Wide tables scroll inside their own container rather than pushing the page. */
export function Table({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={thStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  mono,
  dim,
  style,
}: {
  children: ReactNode;
  mono?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  return (
    <td
      style={{
        ...tdStyle,
        ...(mono ? { fontFamily: MONO } : null),
        ...(dim ? { color: PALETTE.dim } : null),
        ...style,
      }}
    >
      {children}
    </td>
  );
}

/** Em-dash for absent values, so a null never renders as blank or "null". */
export function orDash(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  return s === "" ? String.fromCharCode(0x2014) : s;
}

export function formatTimestamp(v: string | null | undefined): string {
  if (!v) return String.fromCharCode(0x2014);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String.fromCharCode(0x2014);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** medical_affairs -> Medical Affairs */
export function humanizeJobFunction(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (s === "") return String.fromCharCode(0x2014);
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const buttonStyle = (variant: "primary" | "ghost" = "ghost"): CSSProperties => ({
  backgroundColor: variant === "primary" ? "rgba(232,160,32,0.1)" : "#0D0D10",
  border: `1px solid ${variant === "primary" ? PALETTE.accent : PALETTE.border}`,
  color: variant === "primary" ? PALETTE.accent : PALETTE.muted,
  borderRadius: 3,
  padding: "6px 14px",
  fontSize: 12,
  fontFamily: "inherit",
  cursor: "pointer",
});

export const inputStyle: CSSProperties = {
  backgroundColor: "#0D0D10",
  border: `1px solid ${PALETTE.border}`,
  color: PALETTE.text,
  borderRadius: 3,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: MONO,
  outline: "none",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: PALETTE.dim,
  marginBottom: 6,
};
