import type { InstitutionCollaboration } from "../lib/api";

interface Props {
  collaborations: InstitutionCollaboration[];
  onHcpClick: (hcpId: string) => void;
}

export default function InstitutionCollaborationsPanel({ collaborations, onHcpClick }: Props) {
  if (collaborations.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: "1px solid #1E1E22",
        borderRadius: 6,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#E8E6DF",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        Top Internal Collaborations
      </div>
      <div style={{ fontSize: 11, color: "#6B6A65", marginBottom: 12 }}>
        Investigator pairs ranked by shared NSCLC publications
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {collaborations.map((c) => (
          <div
            key={`${c.hcp1_id}-${c.hcp2_id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              backgroundColor: "#15131A",
              borderRadius: 4,
              cursor: "default",
              transition: "background-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#1A1820";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#15131A";
            }}
          >
            <div style={{ fontSize: 13, color: "#E8E6DF" }}>
              <a
                href={`/hcp/${c.hcp1_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onHcpClick(c.hcp1_id);
                }}
                style={{ color: "#E8E6DF", textDecoration: "none" }}
              >
                {c.hcp1_name}
              </a>
              <span style={{ margin: "0 8px", color: "#6B6A65" }}>{"\u2194"}</span>
              <a
                href={`/hcp/${c.hcp2_id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onHcpClick(c.hcp2_id);
                }}
                style={{ color: "#E8E6DF", textDecoration: "none" }}
              >
                {c.hcp2_name}
              </a>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>{c.shared_publications}</span>
              <span style={{ fontSize: 12, color: "#9B9892" }}>papers</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
