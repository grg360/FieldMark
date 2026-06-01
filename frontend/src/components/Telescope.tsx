import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import nodesData from "../data/telescope_nsclc_nodes.json";
import edgesData from "../data/telescope_nsclc_edges.json";

type TelescopeNode = {
  id: string;
  name: string;
  institution: string;
  cohort: string;
  rank: number;
  score: number;
  x?: number;
  y?: number;
};

function getNodeColor(cohort: string, rank: number): string {
  if (cohort === "established" && rank <= 10) {
    return "#FFFCF0";
  }
  if (cohort === "established") {
    return "#FFD700";
  }
  if (cohort === "rising") {
    return "#9B6DFF";
  }
  return "#4ECDC4";
}

function getNodeRadius(cohort: string, rank: number): number {
  if (cohort === "established" && rank <= 10) {
    return 8 - (rank - 1) * 0.3;
  }
  if (cohort === "established" && rank <= 50) {
    return 5 - ((rank - 11) / 40) * 1.5;
  }
  if (cohort === "established") {
    return 3;
  }
  if (cohort === "rising") {
    return 2.5 - Math.min(rank / 500, 1.0) * 1.0;
  }
  return 1.5;
}

interface TelescopeProps {
  onNodeClick: (node: {
    id: string;
    name: string;
    institution: string;
    cohort: string;
    rank: number;
    score: number;
  }) => void;
}

export default function Telescope({ onNodeClick }: TelescopeProps) {
  const reticleRef = useRef<SVGSVGElement>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const closestNodeIdRef = useRef<string | null>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (fgRef.current && nodesData.length > 0) {
        const established = nodesData.filter(
          (n: { cohort: string }) => n.cohort === "established"
        ) as Array<{ x?: number; y?: number }>;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (const node of established) {
          if (typeof node.x === "number" && typeof node.y === "number") {
            sumX += node.x;
            sumY += node.y;
            count++;
          }
        }
        if (count > 0) {
          const centroidX = sumX / count;
          const centroidY = sumY / count;
          fgRef.current.centerAt(centroidX, centroidY, 0);
          fgRef.current.zoom(1.3, 400);
        } else {
          fgRef.current.zoom(1.3, 400);
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const graphData = {
    nodes: nodesData,
    links: edgesData
      .filter((e) => e.weight >= 3)
      .map((e) => ({ source: e.source, target: e.target, value: e.weight })),
  };

  const { topTenEstablishedIds, midRangeEstablishedIds, topHundredRisingIds } = useMemo(() => {
    const established = nodesData
      .filter((n: { cohort: string }) => n.cohort === "established")
      .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
    const topTen = new Set(established.slice(0, 10).map((n: { id: string }) => n.id));
    const midRange = new Set(established.slice(10, 50).map((n: { id: string }) => n.id));

    const rising = nodesData
      .filter((n: { cohort: string }) => n.cohort === "rising")
      .sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
    const topHundredRising = new Set(rising.slice(0, 100).map((n: { id: string }) => n.id));

    return {
      topTenEstablishedIds: topTen,
      midRangeEstablishedIds: midRange,
      topHundredRisingIds: topHundredRising,
    };
  }, []);

  const paintNode = (node: TelescopeNode, ctx: CanvasRenderingContext2D) => {
    if (node.x === undefined || node.y === undefined) {
      return;
    }

    const radius = getNodeRadius(node.cohort, node.rank);
    let finalRadius = radius;
    if (node.cohort === "rising" && topHundredRisingIds.has(node.id)) {
      finalRadius = 4.0;
    }

    const magnification = closestNodeIdRef.current === node.id ? 2.0 : 1.0;

    const effectiveRadius = finalRadius * magnification;
    const color = getNodeColor(node.cohort, node.rank);
    let finalColor = color;
    if (node.cohort === "rising" && topHundredRisingIds.has(node.id)) {
      finalColor = "#C599FF";
    }

    const gradient = ctx.createRadialGradient(
      node.x,
      node.y,
      0,
      node.x,
      node.y,
      effectiveRadius * 3
    );
    gradient.addColorStop(0, hexToRgba(finalColor, 1));
    gradient.addColorStop(0.4, hexToRgba(finalColor, 0.5));
    gradient.addColorStop(1, hexToRgba(finalColor, 0));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(node.x, node.y, effectiveRadius * 3, 0, 2 * Math.PI);
    ctx.fill();

    if (node.cohort === "established" && node.rank <= 50) {
      let spikeLength: number;
      let horizontalSpikeWidth: number;
      let verticalSpikeWidth: number;
      let diagonalSpikeOpacity: number;
      let spikeOpacity: number;

      if (node.rank <= 10) {
        spikeLength = effectiveRadius * 5;
        horizontalSpikeWidth = 1.0;
        verticalSpikeWidth = 1.0;
        diagonalSpikeOpacity = 0.55;
        spikeOpacity = 0.85;
      } else {
        spikeLength = effectiveRadius * 3.5;
        horizontalSpikeWidth = 0.6;
        verticalSpikeWidth = 0.6;
        diagonalSpikeOpacity = 0;
        spikeOpacity = 0.75;
      }

      ctx.strokeStyle = hexToRgba(finalColor, spikeOpacity);
      ctx.lineWidth = horizontalSpikeWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(node.x, node.y - spikeLength);
      ctx.lineTo(node.x, node.y + spikeLength);
      ctx.moveTo(node.x - spikeLength, node.y);
      ctx.lineTo(node.x + spikeLength, node.y);
      ctx.stroke();

      if (node.rank <= 10) {
        ctx.strokeStyle = hexToRgba(finalColor, diagonalSpikeOpacity);
        ctx.lineWidth = 0.5;
        const diagLength = spikeLength * 0.6;
        const diagOffset = diagLength / Math.sqrt(2);
        ctx.beginPath();
        ctx.moveTo(node.x - diagOffset, node.y - diagOffset);
        ctx.lineTo(node.x + diagOffset, node.y + diagOffset);
        ctx.moveTo(node.x - diagOffset, node.y + diagOffset);
        ctx.lineTo(node.x + diagOffset, node.y - diagOffset);
        ctx.stroke();
      }
    }

    ctx.fillStyle = finalColor;
    ctx.beginPath();
    ctx.arc(node.x, node.y, effectiveRadius * 0.4, 0, 2 * Math.PI);
    ctx.fill();

    if (node.cohort === "rising" && topHundredRisingIds.has(node.id)) {
      ctx.strokeStyle = hexToRgba("#C599FF", 0.4);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(node.x, node.y, effectiveRadius * 1.8, 0, 2 * Math.PI);
      ctx.stroke();
    }

    const isTopTen = topTenEstablishedIds.has(node.id);
    const isMidRange = midRangeEstablishedIds.has(node.id);

    if ((isTopTen || isMidRange) && node.cohort === "established") {
      const nameParts = node.name.trim().split(/\s+/);
      const lastName = nameParts[nameParts.length - 1];

      const fontSize = isTopTen ? 10 : 8;
      const textOpacity = isTopTen ? 1.0 : 0.7;
      const borderOpacity = isTopTen ? 0.3 : 0.15;
      const bgOpacity = isTopTen ? 0.85 : 0.6;
      const paddingX = isTopTen ? 6 : 4;
      const paddingY = isTopTen ? 3 : 2;

      ctx.font = `400 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const text = lastName;
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;

      const cardWidth = textWidth + paddingX * 2;
      const cardHeight = fontSize + paddingY * 2;

      const cardX = node.x - cardWidth / 2;
      const cardY = node.y - effectiveRadius - 10 - cardHeight;

      const cornerRadius = 4;
      ctx.fillStyle = `rgba(13, 13, 16, ${bgOpacity})`;
      ctx.beginPath();
      ctx.moveTo(cardX + cornerRadius, cardY);
      ctx.lineTo(cardX + cardWidth - cornerRadius, cardY);
      ctx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + cornerRadius);
      ctx.lineTo(cardX + cardWidth, cardY + cardHeight - cornerRadius);
      ctx.quadraticCurveTo(
        cardX + cardWidth,
        cardY + cardHeight,
        cardX + cardWidth - cornerRadius,
        cardY + cardHeight
      );
      ctx.lineTo(cardX + cornerRadius, cardY + cardHeight);
      ctx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - cornerRadius);
      ctx.lineTo(cardX, cardY + cornerRadius);
      ctx.quadraticCurveTo(cardX, cardY, cardX + cornerRadius, cardY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 215, 0, ${borderOpacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = `rgba(232, 230, 223, ${textOpacity})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, node.x, cardY + cardHeight / 2);
    }

    if (node.cohort === "rising" && magnification > 1.1) {
      const nameParts = node.name.trim().split(/\s+/);
      const lastName = nameParts[nameParts.length - 1];

      const fontSize = 9;
      const textOpacity = Math.min((magnification - 1.0) / 1.0, 1.0);
      const borderOpacity = 0.35 * textOpacity;
      const bgOpacity = 0.85 * textOpacity;
      const paddingX = 5;
      const paddingY = 2;

      ctx.font = `400 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const text = lastName;
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;

      const cardWidth = textWidth + paddingX * 2;
      const cardHeight = fontSize + paddingY * 2;

      const cardX = node.x - cardWidth / 2;
      const cardY = node.y - effectiveRadius - 8 - cardHeight;

      const cornerRadius = 3;
      ctx.fillStyle = `rgba(13, 13, 16, ${bgOpacity})`;
      ctx.beginPath();
      ctx.moveTo(cardX + cornerRadius, cardY);
      ctx.lineTo(cardX + cardWidth - cornerRadius, cardY);
      ctx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + cornerRadius);
      ctx.lineTo(cardX + cardWidth, cardY + cardHeight - cornerRadius);
      ctx.quadraticCurveTo(
        cardX + cardWidth,
        cardY + cardHeight,
        cardX + cardWidth - cornerRadius,
        cardY + cardHeight
      );
      ctx.lineTo(cardX + cornerRadius, cardY + cardHeight);
      ctx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - cornerRadius);
      ctx.lineTo(cardX, cardY + cornerRadius);
      ctx.quadraticCurveTo(cardX, cardY, cardX + cornerRadius, cardY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `rgba(155, 109, 255, ${borderOpacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = `rgba(232, 230, 223, ${textOpacity})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, node.x, cardY + cardHeight / 2);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#0A0A0F",
        position: "relative",
        overflow: "hidden",
        cursor: "crosshair",
      }}
      onClick={() => {
        const closestId = closestNodeIdRef.current;
        if (!closestId) return;
        const node = (nodesData as TelescopeNode[]).find((n) => n.id === closestId);
        if (node) {
          onNodeClick({
            id: node.id,
            name: node.name,
            institution: node.institution,
            cohort: node.cohort,
            rank: node.rank,
            score: node.score,
          });
        }
      }}
      onMouseMove={(e) => {
        if (reticleRef.current) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          reticleRef.current.style.transform = `translate(${x - 100}px, ${y - 100}px)`;
          reticleRef.current.style.opacity = "1";

          if (fgRef.current) {
            const graphCoords = fgRef.current.screen2GraphCoords(x, y);
            mousePosRef.current = { x: graphCoords.x, y: graphCoords.y };

            let closestId: string | null = null;
            let closestDistSq = Infinity;
            const MAX_TARGET_DISTANCE_SQ = 30 * 30;

            for (const n of nodesData as TelescopeNode[]) {
              if (typeof n.x === "number" && typeof n.y === "number") {
                const dx = n.x - graphCoords.x;
                const dy = n.y - graphCoords.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < closestDistSq && distSq < MAX_TARGET_DISTANCE_SQ) {
                  closestDistSq = distSq;
                  closestId = n.id;
                }
              }
            }

            closestNodeIdRef.current = closestId;
          }
        }
      }}
      onMouseLeave={() => {
        if (reticleRef.current) {
          reticleRef.current.style.opacity = "0";
        }
        mousePosRef.current = null;
        closestNodeIdRef.current = null;
      }}
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        cooldownTicks={Infinity}
        cooldownTime={Infinity}
        nodeLabel={() => ""}
        width={dimensions.width}
        height={dimensions.height}
        linkColor={() => "#5A7090"}
        linkWidth={(link) => Math.min(Math.sqrt(link.value || 1) * 0.25, 1.0)}
        linkOpacity={(link) => {
          const w = link.value || 1;
          const clamped = Math.min(Math.max(w, 3), 50);
          return 0.1 + ((clamped - 3) / 47) * 0.35;
        }}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(node, ctx) => {
          paintNode(node as TelescopeNode, ctx);
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as TelescopeNode;
          if (n.x === undefined || n.y === undefined) {
            return;
          }
          const radius = getNodeRadius(n.cohort, n.rank);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius * 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.55) 100%)",
        }}
      />
      <svg
        ref={reticleRef}
        width="200"
        height="200"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 0.15s ease-out",
          willChange: "transform",
        }}
      >
        <defs>
          <radialGradient id="telescope-lens-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.10" />
            <stop offset="55%" stopColor="#AACBE8" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#AACBE8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="85" fill="url(#telescope-lens-glow)" />
        <circle
          cx="100"
          cy="100"
          r="60"
          fill="none"
          stroke="#C8D8E8"
          strokeWidth="0.7"
          opacity="0.5"
        />
        <circle
          cx="100"
          cy="100"
          r="52"
          fill="none"
          stroke="#C8D8E8"
          strokeWidth="0.5"
          opacity="0.4"
        />
        <circle cx="100" cy="100" r="2" fill="#FFFFFF" opacity="0.9" />
      </svg>
    </div>
  );
}
