import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", borderTop: "1px solid #1E1E22", paddingBottom: 6 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        aria-expanded={open}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 0",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#6B6A65",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 10, color: "#6B6A65" }}>
          {open ? String.fromCharCode(0x25BC) : String.fromCharCode(0x25B6)}
        </span>
      </div>
      {open ? <div style={{ padding: "12px 0 10px 0" }}>{children}</div> : null}
    </div>
  );
}
