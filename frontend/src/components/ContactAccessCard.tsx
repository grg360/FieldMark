import type { CSSProperties } from "react";
import type { WebSignal } from "../lib/api";
import { RIGHT_RAIL_HEADER_STYLE } from "./rightRailStyles";
import { COOL } from "../lib/designTokens";
import { FACE } from "../lib/canonicalTokens";

interface Props {
  hcpName: string;
  signals: WebSignal[];
  loading: boolean;
  /** "ledger" renders the academic-brief register (teal trace links, mono eyebrows,
   * serif values) and suppresses the internal "Contact & Access" title, since the
   * brief's section head already labels the block. Omit for the original
   * DetailScreen right-rail register. Same treatment FieldInsights got. */
  variant?: "ledger";
}

// Ledger-register tokens, mirroring HcpProfileBrief's local `P` palette (that const
// is module-private, so its values are inlined here as FieldInsights does). Applied
// only when variant === "ledger"; the default register is unchanged.
const LP = {
  line: "rgba(255,255,255,.06)",
  teal: "#7FB3BB",
  ink0: COOL.ui,
  ink1: COOL.ui, // was INK_COOL.ink1 #e7e8e9 — retired into ui (Δ1.02)
  ink3: COOL.muted,
  ink4: "#8F959A",
  ink5: "#7C8288",
  ink6: "#63696E",
} as const;
const mono = (s: number, w = 400): CSSProperties => ({ font: `${w} ${s}px ${FACE.data}` });
const serif = (s: number, w = 400): CSSProperties => ({ font: `${w} ${s}px ${FACE.value}` }); // was bare Source Serif 4 — the fallback face rendering live

const SUBSECTION_HEADER_STYLE: CSSProperties = {
  fontSize: 11,
  color: "#6B6A65",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const LEDGER_SUBSECTION_HEADER_STYLE: CSSProperties = {
  ...mono(9, 500),
  color: LP.ink6,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  marginBottom: 6,
};

const LINK_STYLE: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "#5C7CE8",
  textDecoration: "none",
  marginBottom: 4,
  display: "block",
};

const LEDGER_LINK_STYLE: CSSProperties = {
  ...serif(13),
  // serif() writes the `font` shorthand, which resets line-height to `normal`
  // (~1.2 on this face). Every stacked row in this block restates it.
  lineHeight: 1.5,
  color: LP.teal,
  textDecoration: "none",
  marginBottom: 4,
  display: "block",
};

const SKELETON_STYLE: CSSProperties = {
  height: 14,
  backgroundColor: "#1A1A1A",
  borderRadius: 4,
  marginBottom: 8,
};

function groupByType(signals: WebSignal[]): Record<string, WebSignal[]> {
  const result: Record<string, WebSignal[]> = {};
  for (const s of signals) {
    if (!result[s.signal_type]) result[s.signal_type] = [];
    result[s.signal_type].push(s);
  }
  return result;
}

function linkLabel(signal: WebSignal, fallback: string): string {
  const title = (signal.source_title ?? "").trim();
  return title || fallback;
}

function ExternalLinkRow({ href, label, ledger }: { href: string; label: string; ledger: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={ledger ? LEDGER_LINK_STYLE : LINK_STYLE}
      onMouseEnter={(e) => {
        e.currentTarget.style.textDecoration = "underline";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.textDecoration = "none";
      }}
    >
      {"↗"} {label}
    </a>
  );
}

function LoadingSkeleton({ ledger }: { ledger: boolean }) {
  const style = ledger ? { ...SKELETON_STYLE, backgroundColor: LP.line, borderRadius: 2 } : SKELETON_STYLE;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...style, width: "70%", height: 16 }} />
      <div style={{ ...style, width: "55%" }} />
      <div style={{ ...style, width: "80%" }} />
      <div style={{ ...style, width: "45%" }} />
    </div>
  );
}

export default function ContactAccessCard({ hcpName, signals, loading, variant }: Props) {
  const ledger = variant === "ledger";
  const displaySignals = signals.filter((s) => s.signal_type !== "no_signals_found");
  const grouped = groupByType(displaySignals);
  const single = (key: string) => grouped[key]?.[0]?.signal_value ?? null;
  const multi = (key: string) => grouped[key] ?? [];

  const academicTitle = single("academic_title");
  const department = single("department");
  const institution = single("institution");
  const city = single("city");
  const state = single("state");
  const country = single("country");
  const locationLine = [city, state, country].filter(Boolean).join(", ");

  const facultyProfiles = multi("faculty_profile_url");
  const labUrls = multi("lab_url");
  const scholarUrls = multi("google_scholar_url");
  const linkedinUrls = multi("linkedin_url");
  const emails = multi("institutional_email");
  const phones = multi("office_phone");
  const orcidSignals = multi("orcid_id");

  const hasLinks =
    facultyProfiles.length > 0 ||
    labUrls.length > 0 ||
    scholarUrls.length > 0 ||
    linkedinUrls.length > 0;
  const hasContact = emails.length > 0 || phones.length > 0;
  const hasIdentifiers = orcidSignals.length > 0;

  const hasIdentityContent =
    Boolean(hcpName) ||
    Boolean(academicTitle) ||
    Boolean(department) ||
    Boolean(institution) ||
    Boolean(locationLine);

  const subHeaderStyle = ledger ? LEDGER_SUBSECTION_HEADER_STYLE : SUBSECTION_HEADER_STYLE;
  const linkStyle = ledger ? LEDGER_LINK_STYLE : LINK_STYLE;

  return (
    <div>
      {!ledger && <div style={RIGHT_RAIL_HEADER_STYLE}>Contact & Access</div>}

      {loading ? (
        <LoadingSkeleton ledger={ledger} />
      ) : displaySignals.length === 0 ? (
        <p style={ledger ? { ...serif(13), color: LP.ink4, margin: 0 } : { fontSize: 12, color: "#6B6A65", margin: 0 }}>
          No public contact information available yet.
        </p>
      ) : (
        <>
          {hasIdentityContent && (
            <div style={{ marginBottom: 18 }}>
              {hcpName ? (
                <div style={ledger ? { ...serif(15, 600), lineHeight: 1.35, color: LP.ink0 } : { fontSize: 14, lineHeight: 1.35, color: "#E8E6DF", fontWeight: 600 }}>{hcpName}</div>
              ) : null}
              {academicTitle ? (
                <div style={ledger ? { ...serif(13), lineHeight: 1.55, color: LP.ink3 } : { fontSize: 13, lineHeight: 1.55, color: "#9B9892" }}>{academicTitle}</div>
              ) : null}
              {department ? (
                <div style={ledger ? { ...serif(13), lineHeight: 1.55, color: LP.ink3 } : { fontSize: 13, lineHeight: 1.55, color: "#9B9892" }}>{department}</div>
              ) : null}
              {institution ? (
                <div style={ledger ? { ...serif(13), lineHeight: 1.55, color: LP.ink3 } : { fontSize: 13, lineHeight: 1.55, color: "#9B9892" }}>{institution}</div>
              ) : null}
              {locationLine ? (
                <div style={ledger ? { ...serif(13), lineHeight: 1.55, color: LP.ink5, fontStyle: "italic" } : { fontSize: 13, lineHeight: 1.55, color: "#6B6A65", fontStyle: "italic" }}>{locationLine}</div>
              ) : null}
            </div>
          )}

          {hasLinks && (
            <div style={{ marginBottom: 16 }}>
              <div style={subHeaderStyle}>Links</div>
              {facultyProfiles.map((signal, idx) => (
                <ExternalLinkRow
                  key={`faculty-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label={linkLabel(signal, "Faculty Profile")}
                  ledger={ledger}
                />
              ))}
              {labUrls.map((signal, idx) => (
                <ExternalLinkRow
                  key={`lab-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label={linkLabel(signal, "Lab Website")}
                  ledger={ledger}
                />
              ))}
              {scholarUrls.map((signal, idx) => (
                <ExternalLinkRow
                  key={`scholar-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label="Google Scholar"
                  ledger={ledger}
                />
              ))}
              {linkedinUrls.map((signal, idx) => (
                <ExternalLinkRow
                  key={`linkedin-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label="LinkedIn"
                  ledger={ledger}
                />
              ))}
            </div>
          )}

          {hasContact && (
            <div style={{ marginBottom: 16 }}>
              <div style={subHeaderStyle}>Contact</div>
              {emails.map((signal, idx) => (
                <a
                  key={`email-${idx}-${signal.signal_value}`}
                  href={`mailto:${signal.signal_value}`}
                  style={linkStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  {"✉"} {signal.signal_value}
                </a>
              ))}
              {phones.map((signal, idx) => (
                <div
                  key={`phone-${idx}-${signal.signal_value}`}
                  style={ledger ? { ...serif(13), lineHeight: 1.5, color: LP.ink1, marginBottom: 4 } : { fontSize: 13, lineHeight: 1.5, color: "#E8E6DF", marginBottom: 4 }}
                >
                  {"☎"} {signal.signal_value}
                </div>
              ))}
            </div>
          )}

          {hasIdentifiers && (
            <div>
              <div style={subHeaderStyle}>Identifiers</div>
              {orcidSignals.map((signal, idx) => (
                <a
                  key={`orcid-${idx}-${signal.signal_value}`}
                  href={`https://orcid.org/${signal.signal_value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  ORCID: {signal.signal_value}
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
