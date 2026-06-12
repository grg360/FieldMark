import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  style?: CSSProperties;
}

const baseStyle: CSSProperties = {
  backgroundColor: "#0D0D10",
  border: "1px solid #1E1E22",
  borderRadius: 6,
  padding: 20,
  fontFamily: "system-ui, -apple-system, sans-serif",
};

export default function HomeTile({ children, style }: Props) {
  return <div style={{ ...baseStyle, ...style }}>{children}</div>;
}
