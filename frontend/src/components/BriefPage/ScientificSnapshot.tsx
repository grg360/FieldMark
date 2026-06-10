import type { BriefPublication } from "../../lib/briefs";

interface Props {
  publications: BriefPublication[];
  themes: string[];
}

export default function ScientificSnapshot({ publications, themes }: Props) {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {publications.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65", marginBottom: 16 }}>
          No recent publications indexed.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {publications.map((pub, index) => (
            <div key={`${pub.year}-${index}`} style={{ fontSize: 13, color: "#E8E6DF", lineHeight: 1.4 }}>
              <span style={{ color: "#9B9892" }}>{pub.year}</span>
              <span style={{ color: "#6B6A65" }}> {String.fromCharCode(0x00B7)} </span>
              {pub.title}
            </div>
          ))}
        </div>
      )}

      {themes.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {themes.map((theme) => (
            <span
              key={theme}
              style={{
                padding: "3px 8px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 500,
                backgroundColor: "#1E1E22",
                color: "#9B9892",
              }}
            >
              {theme}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
