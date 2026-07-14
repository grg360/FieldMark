import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import nsclcNodesData from "../data/telescope_nsclc_nodes.json";
import nsclcEdgesData from "../data/telescope_nsclc_edges.json";
import adNodesData from "../data/telescope_ad_nodes.json";
import adEdgesData from "../data/telescope_ad_edges.json";

// Atopic Dermatitis TA. When the active TA is AD we swap the node/edge source to
// the AD network files; every other TA (NSCLC and default) keeps the NSCLC files
// so that path stays byte-identical. The rendering apparatus is TA-agnostic.
const AD_TELESCOPE_TA_ID = "9e4139d2-e062-4a58-8728-cdabb2d7dca1";

type TelescopeEdge = { source: string; target: string; weight: number };

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

// ---------------------------------------------------------------------------
// Ambient motion + interaction tickle (tunable). The graph would otherwise
// freeze solid once the layout settles. A small custom d3 force injects a
// low-energy velocity nudge each tick so nodes keep breathing, and a gentle
// spring back to a slow-following "home" keeps that motion BOUNDED — it never
// reheats the full layout or lets nodes drift away. Clicking (or hovering) a
// node briefly raises the energy for a small, fast-settling shiver.
//
// PRIMARY TUNING KNOBS — change these two numbers to dial the feel:
//   AMBIENT_ALPHA  continuous breathing energy (higher = more constant motion)
//   TICKLE_ALPHA   extra energy injected on click; decays away within ~1s
const AMBIENT_ALPHA = 0;
const TICKLE_ALPHA = 0.1;
// Secondary shaping (rarely need changing):
const MOTION_PX = 10; // px-per-alpha scale converting energy -> velocity nudge
const BREATHING_SPRING = 0.03; // restoring pull to home; keeps motion bounded
const HOME_TRACK = 0.01; // how fast "home" follows the settling/zooming layout
const TICKLE_DECAY = 0.9; // per-tick falloff of a tickle (~1s to settle at 60fps)
const HOVER_TICKLE_FRACTION = 0.35; // hover tickle strength relative to a click

// Click-to-center: smoothly pan the clicked node to the center of the VISIBLE
// graph area (the left region not covered by the drawer). CLICK_CENTER_MS is the
// pan duration; DRAWER_WIDTH_PX matches TelescopeDrawer's fixed width so we can
// shift the target left of the drawer. Pan only — no zoom.
const CLICK_CENTER_MS = 600;
const DRAWER_WIDTH_PX = 400;

// Zoom-on-select: on selecting a node the view pans (above) AND zooms in to
// SELECT_ZOOM to feature the node + its immediate cluster while keeping network
// context. On deselect the view returns to OVERVIEW_ZOOM — matched to the
// centroid-zoom-on-load level (1.3) so clearing selection returns to load state.
const SELECT_ZOOM = 1.8;
const OVERVIEW_ZOOM = 1.3;

// Selected-node emphasis (persistent while selected). Additive over the cohort
// color so gold/purple still read — a bright ring + soft halo + a slightly
// larger node, plus a brief arrival pulse. Tunable.
const SELECTED_RADIUS_MULT = 1.5; // selected node grows for prominence
const SELECTED_RING_COLOR = "#FFFFFF"; // bright, theme-safe ring/halo tint
const SELECTED_PULSE_MS = 700; // arrival flash duration before settling

type SimNode = { x: number; y: number; vx: number; vy: number };

// Custom d3 force: alpha-independent so it keeps working after the sim cools.
// tickleRef carries the transient click/hover energy and is decayed here.
function createBreathingForce(tickleRef: { current: number }) {
  let nodes: SimNode[] = [];
  const homes = new WeakMap<SimNode, { x: number; y: number }>();
  const force = () => {
    const energy = (AMBIENT_ALPHA + tickleRef.current) * MOTION_PX;
    for (const n of nodes) {
      if (typeof n.x !== "number" || typeof n.y !== "number") continue;
      let home = homes.get(n);
      if (!home) {
        home = { x: n.x, y: n.y };
        homes.set(n, home);
      } else {
        // Slow-follow the true equilibrium so we never fight the initial
        // layout / centroid zoom and never accumulate net drift.
        home.x += (n.x - home.x) * HOME_TRACK;
        home.y += (n.y - home.y) * HOME_TRACK;
      }
      n.vx += (home.x - n.x) * BREATHING_SPRING;
      n.vy += (home.y - n.y) * BREATHING_SPRING;
      n.vx += (Math.random() - 0.5) * energy;
      n.vy += (Math.random() - 0.5) * energy;
    }
    // Decay the transient tickle once per tick (not per node).
    tickleRef.current = tickleRef.current > 0.001 ? tickleRef.current * TICKLE_DECAY : 0;
  };
  force.initialize = (n: SimNode[]) => {
    nodes = n;
  };
  return force;
}

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
  /** Active TA id. Selects the AD network when it matches AD; NSCLC otherwise. */
  taId?: string;
  /** Currently selected node id (drives pan+zoom focus); null = deselected. */
  selectedNodeId?: string | null;
}

export default function Telescope({ onNodeClick, taId, selectedNodeId }: TelescopeProps) {
  const isAtopicDermatitis = taId === AD_TELESCOPE_TA_ID;
  const nodesData = (isAtopicDermatitis ? adNodesData : nsclcNodesData) as TelescopeNode[];
  const edgesData = (isAtopicDermatitis ? adEdgesData : nsclcEdgesData) as TelescopeEdge[];

  const reticleRef = useRef<SVGSVGElement>(null);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const closestNodeIdRef = useRef<string | null>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  // Transient energy for the interaction tickle; read + decayed by the breathing force.
  const tickleRef = useRef(0);
  // Previous selection, so the focus effect can tell select from deselect and
  // skip the deselect zoom-out on initial mount (no prior selection).
  const prevSelectedRef = useRef<string | null>(null);
  // Timestamp of the current selection, for the brief arrival pulse in paintNode.
  const selectAnimRef = useRef<{ id: string; start: number } | null>(null);
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
  }, [nodesData]);

  // Zoom-on-select. Driven by the selection state so it covers every path that
  // changes it — clicking a graph node, clicking a drawer collaborator, and
  // clearing the drawer — uniformly. Pure viewport control (centerAt + zoom); it
  // never touches node positions or the sim, so it composes cleanly with the
  // tickle/breathing force. TA-agnostic (works for NSCLC and AD).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedNodeId ?? null;

    if (selectedNodeId) {
      // Focus: pan the node to the center of the VISIBLE (left-of-drawer) area
      // and zoom in. The drawer offset is in graph units at the TARGET zoom, so
      // the node lands centered-in-open-space once the zoom settles. Moving from
      // one focused node to another keeps SELECT_ZOOM (no zoom-out-then-in).
      const node = nodesData.find((n) => n.id === selectedNodeId);
      if (node && typeof node.x === "number" && typeof node.y === "number") {
        const targetX = node.x + DRAWER_WIDTH_PX / 2 / SELECT_ZOOM;
        fg.centerAt(targetX, node.y, CLICK_CENTER_MS);
        fg.zoom(SELECT_ZOOM, CLICK_CENTER_MS);
      }
    } else if (prev) {
      // Deselect: only when we were focused (prev set) — return to the overview
      // (established centroid + load zoom level), matching the on-load view.
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const n of nodesData) {
        if (n.cohort === "established" && typeof n.x === "number" && typeof n.y === "number") {
          sumX += n.x;
          sumY += n.y;
          count++;
        }
      }
      if (count > 0) {
        fg.centerAt(sumX / count, sumY / count, CLICK_CENTER_MS);
      }
      fg.zoom(OVERVIEW_ZOOM, CLICK_CENTER_MS);
    }
  }, [selectedNodeId, nodesData]);

  // Stamp the moment a node becomes selected so paintNode can play a one-shot
  // arrival pulse (then settle to the persistent ring). Cleared on deselect.
  useEffect(() => {
    selectAnimRef.current = selectedNodeId
      ? { id: selectedNodeId, start: performance.now() }
      : null;
  }, [selectedNodeId]);

  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Memoized so the reference is stable across selection re-renders. Rebuilding
  // graphData (and a fresh links array) every render made ForceGraph2D re-ingest
  // the graph and reheat the force sim, drifting nodes on every click. Deps are
  // the data source only, so the centroid-zoom-on-load effect is unaffected.
  const graphData = useMemo(
    () => ({
      nodes: nodesData,
      links: edgesData
        .filter((e) => e.weight >= 3)
        .map((e) => ({ source: e.source, target: e.target, value: e.weight })),
    }),
    [nodesData, edgesData]
  );

  // Install the ambient breathing/tickle force on the simulation. Re-runs when
  // the data source swaps (TA change) since ForceGraph2D rebuilds its sim then.
  // This adds motion via alpha control only — graphData stays memoized (the
  // anti-drift fix), and cooldownTicks={Infinity} keeps the loop ticking so the
  // force is applied continuously. TA-agnostic: identical for NSCLC and AD.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const setForce = fg.d3Force as unknown as (name: string, force: unknown) => unknown;
    setForce("telescopeBreathing", createBreathingForce(tickleRef));
    return () => {
      setForce("telescopeBreathing", null);
    };
  }, [graphData]);

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
  }, [nodesData]);

  const paintNode = (node: TelescopeNode, ctx: CanvasRenderingContext2D) => {
    if (node.x === undefined || node.y === undefined) {
      return;
    }

    const radius = getNodeRadius(node.cohort, node.rank);
    let finalRadius = radius;
    if (node.cohort === "rising" && topHundredRisingIds.has(node.id)) {
      finalRadius = 4.0;
    }

    const isSelected = selectedNodeId != null && node.id === selectedNodeId;
    const magnification = closestNodeIdRef.current === node.id ? 2.0 : 1.0;

    const effectiveRadius =
      finalRadius * magnification * (isSelected ? SELECTED_RADIUS_MULT : 1);
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

    if (isSelected) {
      // Persistent selection emphasis: a soft halo + crisp bright ring framing
      // the node. Additive (transparent at center) so the cohort color still
      // reads. A brief arrival pulse expands and fades on first selection.
      const ringRadius = effectiveRadius * 2.2;

      const halo = ctx.createRadialGradient(
        node.x,
        node.y,
        ringRadius * 0.4,
        node.x,
        node.y,
        ringRadius * 2.0
      );
      halo.addColorStop(0, hexToRgba(SELECTED_RING_COLOR, 0));
      halo.addColorStop(0.5, hexToRgba(SELECTED_RING_COLOR, 0.12));
      halo.addColorStop(1, hexToRgba(SELECTED_RING_COLOR, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ringRadius * 2.0, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(SELECTED_RING_COLOR, 0.9);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ringRadius, 0, 2 * Math.PI);
      ctx.stroke();

      const anim = selectAnimRef.current;
      if (anim && anim.id === node.id) {
        const elapsed = performance.now() - anim.start;
        if (elapsed < SELECTED_PULSE_MS) {
          const t = elapsed / SELECTED_PULSE_MS; // 0 -> 1
          const pulseRadius = ringRadius + t * effectiveRadius * 5;
          ctx.strokeStyle = hexToRgba(SELECTED_RING_COLOR, (1 - t) * 0.8);
          ctx.lineWidth = 1.5 * (1 - t) + 0.4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseRadius, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
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
        // Small, fast-settling shiver on click (does not recenter/zoom/reheat).
        tickleRef.current = TICKLE_ALPHA;
        const node = (nodesData as TelescopeNode[]).find((n) => n.id === closestId);
        if (node) {
          // Selecting drives the pan+zoom focus via the selectedNodeId effect
          // above (so graph clicks and drawer-collaborator clicks behave the
          // same); here we just report the selection up.
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

            // Gentle tickle when the cursor first reaches a new node (a lighter
            // shiver than a click). Only on entering a new target, not every move.
            if (closestId && closestId !== closestNodeIdRef.current) {
              tickleRef.current = Math.max(
                tickleRef.current,
                TICKLE_ALPHA * HOVER_TICKLE_FRACTION
              );
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
