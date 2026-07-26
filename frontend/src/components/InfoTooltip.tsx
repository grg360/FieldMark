import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface InfoTooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
  style?: React.CSSProperties;
}

export default function InfoTooltip({
  content,
  children,
  position = "top",
  style,
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 240;
    const tooltipHeightEstimate = 80;
    const margin = 8;

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    const viewportWidth = window.innerWidth;
    if (left < 8) left = 8;
    if (left + tooltipWidth > viewportWidth - 8) {
      left = viewportWidth - tooltipWidth - 8;
    }

    let top: number;
    if (position === "top") {
      top = rect.top - tooltipHeightEstimate - margin;
      if (top < 8) {
        top = rect.bottom + margin;
      }
    } else {
      top = rect.bottom + margin;
      if (top + tooltipHeightEstimate > window.innerHeight - 8) {
        top = rect.top - tooltipHeightEstimate - margin;
      }
    }

    setCoords({ left, top });
  }, [visible, position]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          display: "inline-block",
          cursor: "default",
          ...style,
        }}
      >
        {children}
      </span>

      {visible && coords &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              width: 240,
              backgroundColor: "#111113",
              border: "1px solid #E8A020",
              borderRadius: 4,
              padding: "10px 12px",
              fontSize: 11,
              lineHeight: 1.5,
              color: "#9B9892",
              zIndex: 10000,
              boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
              pointerEvents: "none",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
