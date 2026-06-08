import type { CSSProperties } from "react";
import type { WebSignal } from "../lib/api";
import { RIGHT_RAIL_HEADER_STYLE } from "./rightRailStyles";

interface Props {
  hcpName: string;
  signals: WebSignal[];
  loading: boolean;
}

const SUBSECTION_HEADER_STYLE: CSSProperties = {
  fontSize: 10,
  color: "#6B6A65",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const LINK_STYLE: CSSProperties = {
  fontSize: 13,
  color: "#5C7CE8",
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

function ExternalLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={LINK_STYLE}
      onMouseEnter={(e) => {
        e.currentTarget.style.textDecoration = "underline";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.textDecoration = "none";
      }}
    >
      {"\u2197"} {label}
    </a>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ ...SKELETON_STYLE, width: "70%", height: 16 }} />
      <div style={{ ...SKELETON_STYLE, width: "55%" }} />
      <div style={{ ...SKELETON_STYLE, width: "80%" }} />
      <div style={{ ...SKELETON_STYLE, width: "45%" }} />
    </div>
  );
}

export default function ContactAccessCard({ hcpName, signals, loading }: Props) {
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

  return (
    <div>
      <div style={RIGHT_RAIL_HEADER_STYLE}>Contact & Access</div>

      {loading ? (
        <LoadingSkeleton />
      ) : displaySignals.length === 0 ? (
        <p style={{ fontSize: 12, color: "#6B6A65", margin: 0 }}>
          No public contact information available yet.
        </p>
      ) : (
        <>
          {hasIdentityContent && (
            <div style={{ marginBottom: 16 }}>
              {hcpName ? (
                <div style={{ fontSize: 14, color: "#E8E6DF", fontWeight: 600 }}>{hcpName}</div>
              ) : null}
              {academicTitle ? (
                <div style={{ fontSize: 13, color: "#9B9892" }}>{academicTitle}</div>
              ) : null}
              {department ? (
                <div style={{ fontSize: 13, color: "#9B9892" }}>{department}</div>
              ) : null}
              {institution ? (
                <div style={{ fontSize: 13, color: "#9B9892" }}>{institution}</div>
              ) : null}
              {locationLine ? (
                <div style={{ fontSize: 13, color: "#6B6A65", fontStyle: "italic" }}>{locationLine}</div>
              ) : null}
            </div>
          )}

          {hasLinks && (
            <div style={{ marginBottom: 16 }}>
              <div style={SUBSECTION_HEADER_STYLE}>Links</div>
              {facultyProfiles.map((signal, idx) => (
                <ExternalLinkRow
                  key={`faculty-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label={linkLabel(signal, "Faculty Profile")}
                />
              ))}
              {labUrls.map((signal, idx) => (
                <ExternalLinkRow
                  key={`lab-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label={linkLabel(signal, "Lab Website")}
                />
              ))}
              {scholarUrls.map((signal, idx) => (
                <ExternalLinkRow
                  key={`scholar-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label="Google Scholar"
                />
              ))}
              {linkedinUrls.map((signal, idx) => (
                <ExternalLinkRow
                  key={`linkedin-${idx}-${signal.signal_value}`}
                  href={signal.signal_value}
                  label="LinkedIn"
                />
              ))}
            </div>
          )}

          {hasContact && (
            <div style={{ marginBottom: 16 }}>
              <div style={SUBSECTION_HEADER_STYLE}>Contact</div>
              {emails.map((signal, idx) => (
                <a
                  key={`email-${idx}-${signal.signal_value}`}
                  href={`mailto:${signal.signal_value}`}
                  style={LINK_STYLE}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  {"\u2709"} {signal.signal_value}
                </a>
              ))}
              {phones.map((signal, idx) => (
                <div
                  key={`phone-${idx}-${signal.signal_value}`}
                  style={{ fontSize: 13, color: "#E8E6DF", marginBottom: 4 }}
                >
                  {"\u260E"} {signal.signal_value}
                </div>
              ))}
            </div>
          )}

          {hasIdentifiers && (
            <div>
              <div style={SUBSECTION_HEADER_STYLE}>Identifiers</div>
              {orcidSignals.map((signal, idx) => (
                <a
                  key={`orcid-${idx}-${signal.signal_value}`}
                  href={`https://orcid.org/${signal.signal_value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={LINK_STYLE}
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
