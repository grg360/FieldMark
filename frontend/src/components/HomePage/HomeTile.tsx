import type { CSSProperties, ReactNode } from "react";
import { ELEVATION, FONT, SPACE } from "../../lib/designTokens";

interface Props {
  children: ReactNode;
  style?: CSSProperties;
}

const baseStyle: CSSProperties = {
  ...ELEVATION.card,
  padding: SPACE.xl,
  fontFamily: FONT.sans,
};

export default function HomeTile({ children, style }: Props) {
  return <div style={{ ...baseStyle, ...style }}>{children}</div>;
}
