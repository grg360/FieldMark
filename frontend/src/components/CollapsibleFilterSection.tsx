import { useEffect, useState, type ReactNode } from "react";

interface CollapsibleFilterSectionProps {
  title: string;
  activeCount?: number;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export default function CollapsibleFilterSection({
  title,
  activeCount = 0,
  defaultExpanded = false,
  children,
}: CollapsibleFilterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(
    activeCount > 0 || defaultExpanded,
  );

  useEffect(() => {
    if (activeCount > 0) {
      setIsExpanded(true);
    }
  }, [activeCount]);

  return (
    <div
      style={{
        borderBottom: "1px solid #1E1E22",
        paddingBottom: 12,
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#6B6A65",
          }}
        >
          {title}
          {activeCount > 0 && (
            <span style={{ color: "#D85A30" }}> ({activeCount})</span>
          )}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
            flexShrink: 0,
          }}
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="#6B6A65"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isExpanded && <div style={{ paddingTop: 8 }}>{children}</div>}
    </div>
  );
}
