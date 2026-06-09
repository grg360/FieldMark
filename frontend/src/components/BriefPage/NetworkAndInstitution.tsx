import type { BriefCollaborator } from "../../lib/briefs";

interface Props {
  collaborators: BriefCollaborator[];
  hcpInstitution: string;
}

const sectionHeaderStyle = {
  fontSize: 11,
  color: "#6B6A65",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  fontWeight: 500,
  marginBottom: 12,
};

const subHeaderStyle = {
  fontSize: 10,
  color: "#6B6A65",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  fontWeight: 500,
  marginBottom: 8,
};

export default function NetworkAndInstitution({ collaborators, hcpInstitution }: Props) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={sectionHeaderStyle}>NETWORK & INSTITUTION</div>

      <div style={subHeaderStyle}>TOP COLLABORATORS</div>
      {collaborators.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65", marginBottom: 16 }}>
          No frequent collaborators identified.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {collaborators.map((collaborator, index) => (
            <div key={`${collaborator.name}-${index}`} style={{ fontSize: 13, color: "#E8E6DF", lineHeight: 1.4 }}>
              {collaborator.name}
              {collaborator.institution ? (
                <>
                  <span style={{ color: "#6B6A65" }}> {String.fromCharCode(0x00B7)} </span>
                  <span style={{ color: "#9B9892" }}>{collaborator.institution}</span>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 13, color: "#6B6A65" }}>
        Affiliated with {hcpInstitution}
      </div>
    </div>
  );
}
