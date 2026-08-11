// Skyview — free-camera night sky over the recognized + emerging field. Layout authority:
// docs/design/Skyview v2.dc.html (project ea483f5c). Ported to real data.
//
// DATA: static enriched JSON only — telescope_nsclc_nodes.json (each node carries
// focus_collaborators: real top-5 from hcp_top_collaborators_v2, shared_publications
// weight + per-collaborator cohort) + telescope_nsclc_edges.json. NO runtime queries.
//
// GUARDRAILS honored:
//  1. MOMENTUM NEVER RENDERS — no time-series exists. The frame's momentum stat / note /
//     mobile value / pulse-timing are all dropped. Third stat = real cohort rank. Star
//     pulse timing is a deterministic hash (not momentum). Rare rising stars (low
//     connectivity, under-recognized) get the faint haloed "rare find" treatment instead.
//  2. EVERY HOP REVEALS A REAL ORBIT — buildOrbit returns THAT node's real
//     focus_collaborators; each waypoint recomputes from the target. Off-field
//     collaborators (hcp_id not in the shown field) are terminal "outside this sky" stars.
//  3. MEASUREMENT-DRIVEN — a ResizeObserver feeds the measured box into camera fit,
//     viewBox, hit-testing, label projection, chrome insets and panel width. Full-bleed
//     container escapes the content column and takes an explicit height.

import { Component, createRef, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as RPointerEvent, WheelEvent as RWheelEvent } from "react";
import { useMediaQuery } from "../lib/useMediaQuery";
import { FONT } from "../lib/designTokens";
import nsclcNodes from "../data/telescope_nsclc_nodes.json";
import nsclcEdges from "../data/telescope_nsclc_edges.json";
import adNodes from "../data/telescope_ad_nodes.json";
import adEdges from "../data/telescope_ad_edges.json";

// `cohort` + `rank` are the collaborator's OWN standing, baked by the exporter
// from the rank tables (cohort = the stronger of the cohorts they hold, by
// percentile; rank = that cohort's rank). Absent/null rank ⇒ genuinely unranked.
interface Collab { hcp_id: string; name: string; shared_publications: number; cohort: string; rank?: number | null }
interface RawNode { id: string; name: string; institution: string | null; cohort: string; rank: number | null; score: number | null; focus_collaborators?: Collab[] }
interface RawEdge { source: string; target: string; weight: number }
interface FNode { id: string; name: string; inst: string; cohort: string; rank: number | null; conn: number; deg: number; i: number; x: number; y: number; tw: number; twd: number; dr: number; drd: number; rare: boolean; focus_collaborators: Collab[] }
// `cohort` is the DRAWING role (off-field stars stay "other"/blue — the visual
// convention for "not among the fifty drawn"); `srcCohort` + `rank` carry the
// collaborator's REAL standing so the panel states it truthfully.
interface OrbNode { name: string; inst: string; cohort: string; srcCohort: string; rank: number | null; w: number; inField: boolean; fieldIndex: number; hcp_id: string; x: number; y: number }
type Focus = { t: "f"; i: number } | { t: "o"; p: number; k: number };

const AD_TA_ID = "9e4139d2-e062-4a58-8728-cdabb2d7dca1";
const GOLD = "#ffd89b", PURP = "#c3a9ff", OTHER = "#a8bdd8";
const TINT: Record<string, string> = { established: GOLD, rising: PURP, community: OTHER, other: OTHER };
const HALO: Record<string, string> = { established: "rgba(255,196,120,0.78)", rising: "rgba(160,116,255,0.72)", other: "rgba(140,178,228,0.66)" };
// ROLE.other is the honest label for a star not drawn among the fifty — it makes
// NO claim about the person's ranking (that lives in srcCohort/rank).
const ROLE: Record<string, string> = { established: "Established", rising: "Rising Star", community: "Community", other: "Outside this sky" };
const LINE = "#7e93c6";
// World enlarged 2026-08-07 for the 613-node field (was 3400x1900 for ~130).
const WW = 4800, WH = 2600;
// Dust extends SKY_PAD px beyond the node field on every side; the camera clamps
// to this padded box so the viewport can never leave the starfield (item 6).
const SKY_PAD = 200;
// Off-field stars sit on a fixed decorative orbit ring — constant radius, position
// varied by ANGLE only. (The old radius encoded shared-pubs inversely across a
// 12px span, scrambled by the ellipse — a meaningless distance that looked
// meaningful. Removed.)
const OFFFIELD_RADIUS = 200;
const RIS_BUDGET = 200; // full US rising board fits (123); est seed always all shown
const LEADERS = 24;    // "Leaders" density = the brightest this many

const hash = (a: number, b: number) => { let s = (((a + 1) * 73856093) ^ ((b + 1) * 19349663)) >>> 0; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const rngFrom = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Field { nodes: FNode[]; edges: { a: number; b: number; w: number }[]; adj: Map<number, number>[]; idx: Map<string, number>; leaders: Set<number>; minW: number }

function buildField(rawNodes: RawNode[], rawEdges: RawEdge[]): Field {
  const degAll = new Map<string, number>();
  for (const e of rawEdges) { degAll.set(e.source, (degAll.get(e.source) ?? 0) + 1); degAll.set(e.target, (degAll.get(e.target) ?? 0) + 1); }
  const est = rawNodes.filter((n) => n.cohort === "established");
  const ris = rawNodes.filter((n) => n.cohort === "rising" && (degAll.get(n.id) ?? 0) > 0)
    .sort((a, b) => (degAll.get(b.id) ?? 0) - (degAll.get(a.id) ?? 0)).slice(0, RIS_BUDGET);
  const working = est.concat(ris);

  const raw: FNode[] = working.map((n) => ({
    id: n.id, name: n.name, inst: n.institution ?? "—", cohort: n.cohort, rank: n.rank,
    conn: degAll.get(n.id) ?? 0, deg: 0, i: 0, x: 0, y: 0,
    tw: 0, twd: 0, dr: 0, drd: 0, rare: false, focus_collaborators: n.focus_collaborators ?? [],
  }));

  // institution clustering + poisson-ish placement (ported from the frame)
  const byInst = new Map<string, FNode[]>();
  raw.forEach((n) => { if (!byInst.has(n.inst)) byInst.set(n.inst, []); byInst.get(n.inst)!.push(n); });
  const groups = [...byInst.entries()].sort((a, b) => b[1].length - a[1].length);
  const rand = rngFrom(20260730);
  const placed: { x: number; y: number }[] = [];
  groups.forEach(([, members], gi) => {
    const spread = 56 + members.length * 22;
    const need = spread + 210 + members.length * 16;
    let best: { x: number; y: number } | null = null, bestScore = -1;
    for (let t = 0; t < 400; t++) {
      const x = 120 + rand() * (WW - 240), y = 120 + rand() * (WH - 240);
      let nearest = placed.length ? 1e9 : 9999;
      placed.forEach((p) => { nearest = Math.min(nearest, Math.hypot(x - p.x, (y - p.y) * 1.4)); });
      if (nearest > need) { best = { x, y }; break; }
      if (nearest > bestScore) { bestScore = nearest; best = { x, y }; }
    }
    const b = best!;
    placed.push(b);
    members.sort((a, c) => c.conn - a.conn);
    members.forEach((n, k) => {
      if (members.length === 1) { n.x = b.x; n.y = b.y; return; }
      const a = k * 2.39996 + gi * 0.9;
      const rr = spread * (0.34 + 0.66 * Math.sqrt((k + 0.4) / members.length));
      n.x = b.x + Math.cos(a) * rr * 1.22 + (hash(gi, k) - 0.5) * 26;
      n.y = b.y + Math.sin(a) * rr * 0.9 + (hash(k, gi) - 0.5) * 22;
    });
  });

  raw.forEach((n, i) => { n.i = i; n.tw = 3.4 + hash(i, 3) * 4.6; n.twd = -hash(i, 9) * 7; n.dr = 22 + hash(i, 17) * 26; n.drd = -hash(i, 23) * 30; });

  const idx = new Map(raw.map((n) => [n.id, n.i]));
  const adj: Map<number, number>[] = raw.map(() => new Map());
  const edges: { a: number; b: number; w: number }[] = [];
  for (const e of rawEdges) {
    const a = idx.get(e.source), b = idx.get(e.target);
    if (a == null || b == null) continue;
    edges.push({ a, b, w: e.weight }); adj[a].set(b, e.weight); adj[b].set(a, e.weight);
  }
  raw.forEach((n) => { n.deg = adj[n.i].size; });
  // rare-find: the least-connected rising (bottom third) — under-recognized, get the halo
  const risingDegs = raw.filter((n) => n.cohort === "rising").map((n) => n.deg).sort((a, b) => a - b);
  const rareCut = risingDegs.length ? risingDegs[Math.floor(risingDegs.length * 0.34)] : 0;
  raw.forEach((n) => { n.rare = n.cohort === "rising" && n.deg <= rareCut; });
  const leaders = new Set(raw.slice().sort((a, b) => b.deg - a.deg).slice(0, LEADERS).map((n) => n.i));
  // Adaptive ambient-edge floor (2026-08-07): render at most ~EDGE_BUDGET ambient
  // lines so the graph reads as structure at any export size. The floor is the
  // weight of the EDGE_BUDGET-th heaviest edge, never below 12 shared pubs.
  const EDGE_BUDGET = 1400;
  const ws = edges.map((e) => e.w).sort((a, b) => b - a);
  const minW = Math.max(12, ws.length > EDGE_BUDGET ? ws[EDGE_BUDGET] : 12);
  return { nodes: raw, edges, adj, idx, leaders, minW };
}

// Real orbit for node i: its baked top-5 focus_collaborators. inField ⇢ collaborator is a
// star in this sky (real hop to its own orbit); else an "outside this sky" terminal star.
function buildOrbit(g: Field, i: number): OrbNode[] {
  const host = g.nodes[i];
  const out: OrbNode[] = (host.focus_collaborators ?? []).slice(0, 5).map((c) => {
    const fieldIndex = g.idx.has(c.hcp_id) ? g.idx.get(c.hcp_id)! : -1;
    return { name: c.name, inst: fieldIndex >= 0 ? g.nodes[fieldIndex].inst : "", cohort: fieldIndex >= 0 ? g.nodes[fieldIndex].cohort : "other", srcCohort: c.cohort, rank: c.rank ?? null, w: c.shared_publications, inField: fieldIndex >= 0, fieldIndex, hcp_id: c.hcp_id, x: 0, y: 0 };
  });
  let off = 0;
  out.forEach((c, k) => {
    if (c.fieldIndex >= 0) { c.x = g.nodes[c.fieldIndex].x; c.y = g.nodes[c.fieldIndex].y; return; }
    // Constant radius; angle only (item 5) — a plainly decorative orbit ring.
    const a = -Math.PI / 2 + off * (Math.PI * 2 / 3) + hash(i, k) * 0.9 + 0.5;
    c.x = host.x + Math.cos(a) * OFFFIELD_RADIUS * 1.15;
    c.y = host.y + Math.sin(a) * OFFFIELD_RADIUS * 0.92;
    off++;
  });
  return out;
}

interface DustDot { key: string; cx: string; cy: string; r: string; style: string }
function dust(seed: number, count: number, w: number, h: number, rMin: number, rMax: number, oMin: number, oMax: number, soft: boolean, pad = 0): DustDot[] {
  const rand = rngFrom(seed); const out: DustDot[] = [];
  for (let i = 0; i < count; i++) {
    const r = rMin + Math.pow(rand(), 1.9) * (rMax - rMin);
    const o = oMin + Math.pow(rand(), 1.4) * (oMax - oMin);
    const t = rand();
    const col = t > 0.93 ? "#ffe6c2" : t > 0.86 ? "#d5c8ff" : t > 0.6 ? "#dce6ff" : "#ffffff";
    out.push({ key: "d" + seed + "-" + i, cx: (rand() * (w + 2 * pad) - pad).toFixed(1), cy: (rand() * (h + 2 * pad) - pad).toFixed(1), r: r.toFixed(2),
      style: "fill:" + col + ";opacity:" + o.toFixed(3) + ";animation:" + (soft ? "sv-tws " : "sv-tw ") + (3 + rand() * 6).toFixed(2) + "s ease-in-out " + (-rand() * 8).toFixed(2) + "s infinite" });
  }
  return out;
}

// parse a "prop:val;prop:val" style string into a React style object
function sx(s: string): CSSProperties {
  const o: Record<string, string> = {};
  for (const part of s.split(";")) {
    const c = part.indexOf(":"); if (c < 0) continue;
    const k = part.slice(0, c).trim().replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    o[k] = part.slice(c + 1).trim();
  }
  return o as CSSProperties;
}

// safeTop = px height of the floating app chrome (nav + TA/cohort controls) at the top of
// the viewport. The sky PIXELS run full-bleed behind it (dust/meteors/haze), but the
// interactive layer — camera framing + the Skyview title/search chrome — insets below it so
// no clickable star renders under the nav.
interface Props { taId?: string; onOpenProfile?: (id: string) => void; safeTop?: number; forceMobile?: boolean }
interface State { box: { w: number; h: number }; focus: Focus | null; near: Focus | null; cohort: "all" | "established" | "rising"; density: "leaders" | "full"; query: string; qOpen: boolean; trail: { name: string; focus: Focus }[]; mTab: "established" | "rising"; mOpen: number | null }
type Cam = { x: number; y: number; z: number };

class Sky extends Component<Props, State> {
  hostRef = createRef<HTMLDivElement>();
  farRef = createRef<SVGGElement>();
  midRef = createRef<SVGGElement>();
  worldRef = createRef<SVGGElement>();
  labelRef = createRef<HTMLDivElement>();
  _f: Field | null = null;
  _oc: Record<number, OrbNode[]> = {};
  _df: DustDot[] | null = null; _dm: DustDot[] | null = null;
  _cam: Cam; _camT: Cam; _anim: { from: Cam; to: Cam; t0: number; dur: number } | null = null;
  _drag: { sx: number; sy: number; wx: number; wy: number; moved: number } | null = null;
  _vel = { x: 0, y: 0 };
  _targets: { key: string; t: "f" | "o"; i?: number; p?: number; k?: number; x: number; y: number }[] = [];
  _raf: number | null = null; _st: ReturnType<typeof setTimeout> | null = null; _zt: ReturnType<typeof setTimeout> | null = null;
  _ro: ResizeObserver | null = null;
  _wheelNative: ((ev: WheelEvent) => void) | null = null;

  constructor(props: Props) {
    super(props);
    const w0 = 1440, h0 = 760;
    this.state = { box: { w: w0, h: h0 }, focus: null, near: null, cohort: "all", density: "leaders", query: "", qOpen: false, trail: [], mTab: "established", mOpen: null };
    const fit = this.fitCam();
    this._cam = { ...fit }; this._camT = { ...fit };
  }

  vw() { return this.state.box.w; }
  vh() { return this.state.box.h; }
  // forceMobile comes from the wrapper's viewport media query. The measured-box
  // fallback alone is a dead end on phones: the desktop sky's host is height:100%
  // of an unheighted in-flow parent, so it measures W×0, the ResizeObserver bails
  // on zero height, and `box` never leaves its 1440×760 default — the mobile list
  // was unreachable and SkyView rendered a 0-height desktop sky (2026-08-10).
  isMobile() { return this.props.forceMobile === true || this.state.box.w < 760; }
  field(): Field { if (!this._f) this._f = buildField(this.props.taId === AD_TA_ID ? (adNodes as unknown as RawNode[]) : (nsclcNodes as unknown as RawNode[]), this.props.taId === AD_TA_ID ? (adEdges as unknown as RawEdge[]) : (nsclcEdges as unknown as RawEdge[])); return this._f; }
  orbit(i: number): OrbNode[] { if (!this._oc[i]) this._oc[i] = buildOrbit(this.field(), i); return this._oc[i]; }
  // Dust decision (2026-08-07): with 613 real stars filling the canvas, the
  // MID layer is gone — its particles rendered brighter (<=0.5) than the faint
  // real tier and were indistinguishable from data. One FAR layer stays for
  // depth, capped at 0.16 opacity: strictly dimmer than the faintest ranked
  // star (0.34), and the legend now states it is decorative.
  dustFar() { if (!this._df) this._df = dust(5501, 320, WW, WH, 0.4, 1.4, 0.04, 0.16, false, SKY_PAD); return this._df; }
  dustMid() { if (!this._dm) this._dm = [] as DustDot[]; return this._dm; }

  componentDidMount() {
    const el = this.hostRef.current;
    // Native NON-PASSIVE wheel listener (2026-08-07): React root wheel handlers
    // are passive, so the onWheel prop could never preventDefault - every zoom
    // tick ALSO scrolled the page, walking the (in-flow) nav bar off the top of
    // the viewport. "The nav is invisible" was the page scrolled under the
    // fixed sky. Zoom now consumes the wheel entirely over the sky.
    if (el) {
      this._wheelNative = (ev: WheelEvent) => { ev.preventDefault(); };
      el.addEventListener("wheel", this._wheelNative, { passive: false });
    }
    if (el && typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const b = this.state.box;
        if (Math.abs(b.w - r.width) < 1 && Math.abs(b.h - r.height) < 1) return;
        const wasFit = !this.state.focus;
        this.setState({ box: { w: r.width, h: r.height } }, () => { if (wasFit) { this._cam = this.fitCam(); this._camT = { ...this._cam }; } this.paint(); });
      });
      this._ro.observe(el);
      const r = el.getBoundingClientRect();
      if (r.width && r.height) this.setState({ box: { w: r.width, h: r.height } }, () => { this._cam = this.fitCam(); this._camT = { ...this._cam }; this.paint(); });
    }
    this.paint();
  }
  componentDidUpdate() { this.paint(); }
  componentWillUnmount() { if (this._raf) cancelAnimationFrame(this._raf); if (this._ro) this._ro.disconnect(); if (this._st) clearTimeout(this._st); if (this._zt) clearTimeout(this._zt); if (this.hostRef.current && this._wheelNative) this.hostRef.current.removeEventListener("wheel", this._wheelNative); }

  // Top safe-area inset: floating app chrome height + a gap. The Skyview title/search sit
  // just under it, and camera framing keeps interactive stars out of this band.
  safeTop() { return Math.max(0, Number(this.props.safeTop) || 0) + this.edge() - 4; }

  // Camera that centers world box [x0..x1]×[y0..y1] inside the viewport rect left inset by
  // insL/insR and top/bottom by insT/insB — the mechanism behind safe-area framing.
  camForBox(x0: number, y0: number, x1: number, y1: number, insL: number, insR: number, insT: number, insB: number, zMin: number, zMax: number): Cam {
    const VW = this.vw(), VH = this.vh();
    const availW = Math.max(120, VW - insL - insR), availH = Math.max(120, VH - insT - insB);
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const z = Math.max(zMin, Math.min(zMax, Math.min(availW / bw, availH / bh)));
    const scx = insL + availW / 2, scy = insT + availH / 2;
    return { x: (x0 + x1) / 2 - (scx - VW / 2) / z, y: (y0 + y1) / 2 - (scy - VH / 2) / z, z };
  }

  fitCam(): Cam {
    const g = this.field();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    g.nodes.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
    const E = this.edge();
    // insets: chrome band on top, legend + cam-controls band on bottom, edges on the sides.
    // Viewport-aware landing zoom (2026-08-07, second pass): a FIXED floor
    // still saturated the pan clamp on large monitors — at the whole-field fit
    // the world barely overflows the viewport, so horizontal travel was ~one
    // drag and vertical rounded to zero on tall windows ("left-right only, far
    // side goes dead"). The landing now guarantees the world overflows the
    // viewport by >=60% on BOTH axes: travel of at least 0.6x the viewport in
    // every direction, on any monitor. The wheel's own zoom-out floor still
    // reaches the true everything-in-frame view — where pan saturating is the
    // comprehensible consequence of having pulled all the way back.
    const zTravel = Math.min(0.95, Math.max(
      1.6 * this.vw() / (WW + 2 * SKY_PAD),
      1.6 * this.vh() / (WH + 2 * SKY_PAD),
    ));
    return this.camForBox(x0, y0, x1, y1, E + 40, E + 40, this.safeTop() + 44, E + 64, zTravel, 0.95);
  }

  paint = () => {
    if (this.isMobile()) return;
    const c = this._cam, VW = this.vw(), VH = this.vh();
    const lay = (ref: React.RefObject<SVGGElement>, f: number, zf: number) => {
      if (!ref.current) return;
      const z = 1 + (c.z - 1) * zf;
      ref.current.style.transform = "translate(" + (VW / 2) + "px," + (VH / 2) + "px) scale(" + z.toFixed(4) + ") translate(" + (-c.x * f).toFixed(2) + "px," + (-c.y * f).toFixed(2) + "px)";
    };
    // Meteors now live inside the world layer (see render) — no separate overlay
    // transform; they share worldRef's parallax.
    lay(this.farRef, 0.26, 0.32); lay(this.midRef, 0.56, 0.62); lay(this.worldRef, 1, 1);
    const layer = this.labelRef.current;
    if (layer) {
      const chips = layer.querySelectorAll<HTMLElement>("[data-wx]");
      for (let i = 0; i < chips.length; i++) {
        const el = chips[i];
        const wx = +el.getAttribute("data-wx")!, wy = +el.getAttribute("data-wy")!;
        el.style.left = (VW / 2 + (wx - c.x) * c.z).toFixed(1) + "px";
        el.style.top = (VH / 2 + (wy - c.y) * c.z).toFixed(1) + "px";
      }
    }
  };

  tick = () => {
    this._raf = null; let more = false;
    if (this._anim) {
      const a = this._anim, t = Math.min(1, (performance.now() - a.t0) / a.dur), e = easeInOut(t);
      const dip = Math.min(0.3, Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) / 3600);
      this._cam = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e, z: (a.from.z + (a.to.z - a.from.z) * e) * (1 - dip * Math.sin(Math.PI * t)) };
      if (t >= 1) { this._cam = { ...a.to }; this._anim = null; } else more = true;
    } else if (!this._drag && (Math.abs(this._vel.x) > 0.04 || Math.abs(this._vel.y) > 0.04)) {
      this._cam = { x: this.clampX(this._cam.x + this._vel.x), y: this.clampY(this._cam.y + this._vel.y), z: this._cam.z };
      this._camT = { ...this._cam }; this._vel.x *= 0.82; this._vel.y *= 0.82; more = true;
    }
    this.paint();
    if (more) this._raf = requestAnimationFrame(this.tick);
    else { if (this._st) clearTimeout(this._st); this._st = setTimeout(() => this.forceUpdate(), 40); }
  };
  kick() { if (!this._raf) this._raf = requestAnimationFrame(this.tick); }
  // Keep the VIEWPORT within the padded dust box; centre when the field is
  // smaller than the viewport. Bounds only, not feel (item 6).
  clampX(x: number) {
    const half = this.vw() / (2 * this._cam.z);
    const lo = -SKY_PAD + half, hi = WW + SKY_PAD - half;
    return lo > hi ? WW / 2 : Math.max(lo, Math.min(hi, x));
  }
  clampY(y: number) {
    const half = this.vh() / (2 * this._cam.z);
    const lo = -SKY_PAD + half, hi = WH + SKY_PAD - half;
    return lo > hi ? WH / 2 : Math.max(lo, Math.min(hi, y));
  }
  flyTo(to: Cam, dur?: number) { this._vel = { x: 0, y: 0 }; this._camT = { ...to }; this._anim = { from: { ...this._cam }, to, t0: performance.now(), dur: dur || 1150 }; this.kick(); }

  frameFor(focus: Focus): Cam {
    const g = this.field(); const pts: { x: number; y: number }[] = [];
    if (focus.t === "f") { const n = g.nodes[focus.i]; pts.push({ x: n.x, y: n.y }); this.orbit(focus.i).forEach((c) => pts.push({ x: c.x, y: c.y })); }
    else { const c = this.orbit(focus.p)[focus.k], h = g.nodes[focus.p]; pts.push({ x: c.x, y: c.y }, { x: h.x, y: h.y }); }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach((p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    // pad the box so a lone focus (single point) still frames at a sensible zoom.
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = Math.max(140, (x1 - x0) / 2), hh = Math.max(110, (y1 - y0) / 2);
    const E = this.edge(), panelW = this.panelW();
    // right inset reserves the focus panel; top inset clears the floating chrome.
    return this.camForBox(cx - hw, cy - hh, cx + hw, cy + hh, E + 40, panelW + E + 40, this.safeTop() + 30, E + 40, 0.7, 1.75);
  }
  focusOn(focus: Focus, pushTrail?: boolean) {
    const g = this.field();
    const name = focus.t === "f" ? g.nodes[focus.i].name : this.orbit(focus.p)[focus.k].name;
    this.setState((s) => ({ focus, near: null, qOpen: false, query: "", trail: pushTrail === false ? s.trail : s.trail.filter((t) => t.name !== name).concat([{ name, focus }]).slice(-4) }));
    this.flyTo(this.frameFor(focus));
  }
  pullBack = (ev?: { stopPropagation: () => void }) => { if (ev) ev.stopPropagation(); this.setState({ focus: null, near: null, trail: [], qOpen: false, query: "" }); this.flyTo(this.fitCam(), 1250); };

  panelW() { const w = this.vw(); return w < 1180 ? 300 : w < 1440 ? 330 : w < 1920 ? 360 : 392; }
  edge() { const w = this.vw(); return w < 1180 ? 28 : w < 1440 ? 36 : w < 1920 ? 48 : 64; }

  toWorld(ev: RPointerEvent | RWheelEvent) {
    const el = this.hostRef.current; if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    const VW = this.vw(), VH = this.vh();
    const sx0 = (ev.clientX - r.left) / r.width * VW, sy0 = (ev.clientY - r.top) / r.height * VH;
    return { sx: sx0, sy: sy0, x: this._cam.x + (sx0 - VW / 2) / this._cam.z, y: this._cam.y + (sy0 - VH / 2) / this._cam.z };
  }
  hit(p: { x: number; y: number }) {
    let best: typeof this._targets[number] | null = null, bd = 1e9; const rad = 58 / this._cam.z;
    this._targets.forEach((t) => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; } });
    return bd < rad ? best : null;
  }
  stop = (ev: RPointerEvent) => { ev.stopPropagation(); };
  onDown = (ev: RPointerEvent) => {
    const p = this.toWorld(ev); if (!p) return;
    this._anim = null; this._drag = { sx: p.sx, sy: p.sy, wx: p.x, wy: p.y, moved: 0 }; this._vel = { x: 0, y: 0 };
    if (this.hostRef.current) this.hostRef.current.style.cursor = "grabbing";
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  };
  onMove = (ev: RPointerEvent) => {
    const p = this.toWorld(ev); if (!p) return;
    if (this._drag) {
      const d = this._drag; d.moved += Math.abs(p.sx - d.sx) + Math.abs(p.sy - d.sy);
      const nx = this.clampX(d.wx - (p.sx - d.sx) / this._cam.z), ny = this.clampY(d.wy - (p.sy - d.sy) / this._cam.z);
      this._vel = { x: (nx - this._cam.x) * 0.9, y: (ny - this._cam.y) * 0.9 };
      this._cam = { x: nx, y: ny, z: this._cam.z }; this._camT = { ...this._cam }; this.paint(); return;
    }
    const h = this.hit(p); const cur = this.state.near;
    const hk = h ? h.key : null, ck = cur ? (cur.t === "f" ? "f" + cur.i : "o" + cur.p + "-" + cur.k) : null;
    if (this.hostRef.current) this.hostRef.current.style.cursor = h ? "pointer" : "grab";
    if (hk !== ck) this.setState({ near: h ? (h.t === "f" ? { t: "f", i: h.i! } : { t: "o", p: h.p!, k: h.k! }) : null });
  };
  onUp = (ev: RPointerEvent) => {
    const d = this._drag; this._drag = null;
    if (this.hostRef.current) this.hostRef.current.style.cursor = "grab";
    if (!d) return;
    if (d.moved > 7) { this.kick(); return; }
    const p = this.toWorld(ev); if (!p) return;
    const h = this.hit(p);
    if (h) this.focusOn(h.t === "f" ? { t: "f", i: h.i! } : { t: "o", p: h.p!, k: h.k! });
    else if (this.state.qOpen) this.setState({ qOpen: false });
    else if (this.state.focus) this.setState({ focus: null, near: null });
  };
  onLeave = () => { this._drag = null; if (this.hostRef.current) this.hostRef.current.style.cursor = "grab"; if (this.state.near) this.setState({ near: null }); };
  onWheel = (ev: RWheelEvent) => {
    const p = this.toWorld(ev); if (!p) return;
    this._anim = null; const z0 = this._cam.z;
    // Zoom-out floor = the zoom at which the whole padded starfield fits the
    // viewport, so a pull-back reaches a genuine full-field view (with the dust
    // margin) and stops there — never into the void (item 8).
    const zFloor = Math.min(this.vw() / (WW + 2 * SKY_PAD), this.vh() / (WH + 2 * SKY_PAD));
    const z = Math.max(zFloor, Math.min(2.3, z0 * Math.exp(-ev.deltaY * 0.0016)));
    this._cam = { x: p.x - (p.sx - this.vw() / 2) / z, y: p.y - (p.sy - this.vh() / 2) / z, z };
    this._camT = { ...this._cam }; this.paint();
    if (this._zt) clearTimeout(this._zt); this._zt = setTimeout(() => this.forceUpdate(), 120);
  };
  open(id: string) { if (this.props.onOpenProfile) this.props.onOpenProfile(id); }

  render() {
    if (this.isMobile()) return this.renderMobile();
    return this.renderSky();
  }

  renderSky() {
    const g = this.field();
    const { focus, near, cohort, density, query, qOpen } = this.state;
    const cam = this._camT;
    const minW = g.minW;
    const focusIdx = focus && focus.t === "f" ? focus.i : null;
    const orbHost = focus ? (focus.t === "f" ? focus.i : focus.p) : null;
    const orb = orbHost != null ? this.orbit(orbHost) : null;
    const orbFieldIdx = orb ? new Set(orb.filter((c) => c.fieldIndex >= 0).map((c) => c.fieldIndex)) : new Set<number>();
    const nearIdx = near && near.t === "f" ? near.i : null;
    const hoverAdj = nearIdx != null ? g.adj[nearIdx] : null;
    const inCohort = (n: FNode) => cohort === "all" || n.cohort === cohort;
    const isLeader = (n: FNode) => density === "full" || g.leaders.has(n.i);
    const VW = this.vw(), VH = this.vh(), EDGE = this.edge(), PANELW = this.panelW();
    const TOP = this.safeTop() + EDGE; // title/search sit below the floating app chrome
    const narrow = VW < 1440;

    const targets: typeof this._targets = [];
    const stars: JSX.Element[] = [], rings: JSX.Element[] = [];
    const rad = new Array(g.nodes.length).fill(3);
    const offRad: Record<number, number> = {};
    const seg = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number) => {
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      const a = Math.min(ra, L * 0.42), b = Math.min(rb, L * 0.42);
      return { x1: (ax + dx / L * a).toFixed(1), y1: (ay + dy / L * a).toFixed(1), x2: (bx - dx / L * b).toFixed(1), y2: (by - dy / L * b).toFixed(1) };
    };

    g.nodes.forEach((n, i) => {
      const isSel = focusIdx === i, inOrb = orbFieldIdx.has(i), isNear = nearIdx === i, adjHover = !!hoverAdj && hoverAdj.has(i);
      let op: number;
      if (focus) op = isSel ? 1 : inOrb ? 1 : g.leaders.has(i) ? 0.22 : 0.14;
      else op = inCohort(n) ? (isLeader(n) ? (n.cohort === "established" ? 1 : 0.88) : 0.34) : 0.07;
      if (adjHover) op = Math.max(op, 0.7);
      const base = (n.cohort === "established" ? 2.6 + n.deg * 0.12 : 1.9 + n.deg * 0.09) * (isLeader(n) || focus ? 1 : 0.8);
      let r = base, blur = (n.cohort === "established" ? 11 : 7) + n.deg * 0.28;
      if (isSel) { r = base * 2.3; blur *= 2.1; } else if (isNear) { r = base * 1.95; blur *= 1.7; } else if (inOrb) { r = base * 1.5; blur *= 1.4; }
      r = Math.min(r, 24); const c = TINT[n.cohort]; rad[i] = r;
      if (op > 0.12) targets.push({ key: "f" + i, t: "f", i, x: n.x, y: n.y });
      // At 613 stars, infinite animations are budgeted to the tier the eye reads:
      // leaders + anything focused/hovered/orbiting. The faint field is static.
      const live = op > 0.3 && (g.leaders.has(i) || isSel || isNear || inOrb || adjHover);
      const halo = n.cohort === "established" ? "url(#svHaloEst)" : n.cohort === "rising" ? "url(#svHaloRis)" : "url(#svHaloOth)";
      // pulse timing — deterministic hash (NOT momentum, which we don't have)
      const period = (4.4 + hash(i, 61) * 4.2) * (isNear || isSel ? 0.5 : 1);
      const risePulse = n.cohort === "rising" && live && op > 0.3;
      stars.push(
        <g key={"n" + i} style={{ opacity: op, transform: `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px)`, transition: "opacity 520ms ease" }}>
          <g style={live ? { animation: `sv-drift ${n.dr.toFixed(1)}s ease-in-out ${n.drd.toFixed(1)}s infinite` } : undefined}>
            {risePulse && <circle cx={0} cy={0} r={(r * 2.05).toFixed(2)} style={{ fill: "none", stroke: c, strokeWidth: 0.85, transformBox: "fill-box", transformOrigin: "center", animation: `sv-rise ${period.toFixed(2)}s cubic-bezier(.15,.7,.35,1) ${(-hash(i, 61) * period).toFixed(2)}s infinite` }} />}
            {n.rare && live && <circle cx={0} cy={0} r={(r * 2.9).toFixed(2)} style={{ fill: "none", stroke: PURP, strokeOpacity: 0.4, strokeWidth: 0.6, strokeDasharray: "1.5 4", animation: `sv-breathe 6s ease-in-out infinite` }} />}
            <circle cx={0} cy={0} r={(r + blur * 0.85).toFixed(1)} style={{ fill: halo }} />
            <circle cx={0} cy={0} r={r.toFixed(2)} style={{
              fill: isSel ? "#fffaf0" : c,
              transition: "r 260ms cubic-bezier(.2,.9,.3,1)",
              ...(live && !isSel ? { animation: n.cohort === "rising" ? `sv-swell ${(period * 0.5).toFixed(2)}s ease-in-out ${n.twd.toFixed(2)}s infinite` : `sv-tw ${n.tw.toFixed(2)}s ease-in-out ${n.twd.toFixed(2)}s infinite` } : {}),
            }} />
          </g>
        </g>
      );
      if (isNear && !isSel) rings.push(<circle key={"hr" + i} cx={0} cy={0} r={(base * 4.4).toFixed(1)} style={{ fill: "none", stroke: c, strokeOpacity: 0.3, strokeWidth: 0.9 / cam.z, transform: `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px)` }} />);
    });

    if (orb) orb.forEach((c, k) => {
      if (c.fieldIndex >= 0) return;
      const isSel = focus!.t === "o" && focus!.k === k;
      const isNear = !!near && near.t === "o" && near.p === orbHost && near.k === k;
      targets.push({ key: "o" + orbHost + "-" + k, t: "o", p: orbHost!, k, x: c.x, y: c.y });
      offRad[k] = isSel ? 21 : 16;
      stars.push(
        <g key={"ox" + orbHost + "-" + k} style={{ opacity: 1, transform: `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)` }}>
          <g style={{ animation: "sv-bloom 640ms cubic-bezier(.2,.9,.3,1) both" }}>
            <circle cx={0} cy={0} r={isSel ? 8.6 : isNear ? 7.2 : 5.4} style={{ fill: isSel ? "#f2f7ff" : OTHER, filter: `drop-shadow(0 0 5px ${OTHER}) drop-shadow(0 0 18px rgba(140,178,228,0.72))`, transition: "r 260ms cubic-bezier(.2,.9,.3,1)" }} />
          </g>
        </g>
      );
      rings.push(<circle key={"og" + orbHost + "-" + k} cx={0} cy={0} r={isSel ? 21 : 16} style={{ fill: "none", stroke: OTHER, strokeOpacity: 0.42, strokeWidth: 1 / cam.z, strokeDasharray: "2.5 5", transform: `translate(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px)`, animation: "sv-breathe 5.5s ease-in-out infinite" }} />);
    });
    this._targets = targets;

    const edges: { key: string; op: number; el: JSX.Element }[] = [];
    g.edges.forEach((e, i) => {
      const A = g.nodes[e.a], B = g.nodes[e.b];
      let op = 0, col = LINE; const hov = !!hoverAdj && (e.a === nearIdx || e.b === nearIdx);
      if (focus) { if (e.w >= 22 && !orbFieldIdx.has(e.a) && !orbFieldIdx.has(e.b) && e.a !== focusIdx && e.b !== focusIdx) op = 0.032; }
      else if (e.w >= minW && inCohort(A) && inCohort(B)) op = (isLeader(A) && isLeader(B)) ? 0.03 + Math.min(0.12, e.w * 0.003) : 0.02;
      if (hov) { op = Math.max(op, 0.16 + Math.min(0.34, e.w * 0.007)); col = "#e8c79a"; }
      if (op <= 0) return;
      const s = seg(A.x, A.y, B.x, B.y, rad[e.a] + 3, rad[e.b] + 3);
      edges.push({ key: "e" + i, op, el: <line key={"e" + i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} style={{ stroke: col, strokeOpacity: op, strokeWidth: Math.min(0.32, 0.06 + e.w * 0.0016), strokeLinecap: "round", transition: "stroke-opacity 420ms ease" }} /> });
    });
    edges.sort((a, b) => a.op - b.op);
    if (orb) { const host = g.nodes[orbHost!]; const hostR = rad[orbHost!] + 5;
      orb.forEach((c, k) => {
        const endR = c.fieldIndex >= 0 ? rad[c.fieldIndex] + 5 : (offRad[k] || 16) + 5;
        const s = seg(host.x, host.y, c.x, c.y, hostR, endR);
        // Shared-publication weight stays legible as THICKNESS, with the whole
        // ramp compressed (2026-08-07): the 0.8→8px orbit lines read as cables
        // over the starfield; 0.5→3px keeps the ordering readable as threads.
        const owWidth = Math.min(3, 0.5 + Math.min(c.w, 50) * 0.05);
        const owOpacity = Math.min(0.95, 0.35 + Math.min(c.w, 50) * 0.014);
        edges.push({ key: "oe" + k, op: 1, el: <line key={"oe" + k} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} style={{ stroke: c.inField ? "#ffd89b" : OTHER, strokeOpacity: owOpacity, strokeWidth: owWidth, strokeLinecap: "round", ...(c.inField ? {} : { strokeDasharray: "3.5 6" }), transition: "stroke-opacity 520ms ease" }} /> });
      });
    }

    // labels (HTML, projected each paint via data-wx/wy)
    const labels: JSX.Element[] = []; const rects: { x: number; y: number; w: number; h: number }[] = [];
    const PANEL = { x0: VW - EDGE - PANELW - 12, y0: VH * 0.3, x1: VW, y1: VH - 84 };
    const chip = (wx: number, wy: number, text: string, fs: number, color: string, suffix: string | null, track: string, clearance: number, prefer: "l" | "r" | 0, avoidPanel: boolean) => {
      const sxp = VW / 2 + (wx - cam.x) * cam.z, syp = VH / 2 + (wy - cam.y) * cam.z;
      if (sxp < 40 || sxp > VW - 40 || syp < this.safeTop() + 16 || syp > VH - 30) return;
      const off = Math.max(16, clearance || 0);
      const label = suffix ? text + "   " + suffix : text;
      const wpx = label.length * fs * 0.5 + 26, hpx = fs + 18;
      let right = prefer ? prefer === "r" : sxp < VW * 0.66;
      if (right && sxp + off + wpx > VW - 30) right = false; else if (!right && sxp - off - wpx < 30) right = true;
      const box = { x: right ? sxp + off : sxp - off - wpx, y: syp - hpx / 2, w: wpx, h: hpx };
      if (box.x < 6 || box.x + box.w > VW - 6 || box.y < 4 || box.y + box.h > VH - 4) return;
      if (avoidPanel && box.x < PANEL.x1 && PANEL.x0 < box.x + box.w && box.y < PANEL.y1 && PANEL.y0 < box.y + box.h) return;
      if (rects.some((r) => box.x < r.x + r.w + 10 && r.x < box.x + box.w + 10 && box.y < r.y + r.h + 6 && r.y < box.y + box.h + 6)) return;
      rects.push(box);
      // Researcher names render in the register serif (token, not hardcoded);
      // chrome (header/legend/filters) keeps its letter-spaced Jost. The dark
      // multi-layer text halo keeps names legible over glow sprites and dust.
      labels.push(<div key={"l" + labels.length} data-wx={wx.toFixed(1)} data-wy={wy.toFixed(1)} data-side={right ? "r" : "l"} style={{ position: "absolute", left: sxp.toFixed(1) + "px", top: syp.toFixed(1) + "px", transform: `translate(${right ? off + "px" : "calc(-100% - " + off + "px)"},-50%)`, whiteSpace: "nowrap", font: `400 ${fs}px/1.15 ${FONT.serif}`, letterSpacing: "0.015em", color, textShadow: "0 0 4px rgba(4,6,13,0.95), 0 0 9px rgba(4,6,13,0.8), 0 1px 14px rgba(4,6,13,0.6)", transition: "opacity 400ms ease" }}>{label}</div>);
    };
    if (focus) {
      const hostN = g.nodes[orbHost!];
      const hostBlur = ((hostN.cohort === "established" ? 11 : 7) + hostN.deg * 0.28) * 2.1;
      const hostR = ((hostN.cohort === "established" ? 2.6 + hostN.deg * 0.12 : 1.9 + hostN.deg * 0.09) * 2.3 + hostBlur * 0.85) * cam.z + 10;
      if (focus.t === "f") chip(hostN.x, hostN.y, hostN.name, 19, "#f6f2e8", null, "0.03em", hostR, 0, false);
      else chip(hostN.x, hostN.y, hostN.name, 14, "rgba(226,223,214,0.62)", null, "0.05em", 0, 0, false);
      orb!.forEach((c, k) => {
        const sel = focus.t === "o" && focus.k === k;
        const clear = (c.inField ? (c.fieldIndex >= 0 ? rad[c.fieldIndex] : 4) : (sel ? 21 : 16)) * cam.z + 13;
        const side: "l" | "r" = c.x < hostN.x ? "l" : "r";
        chip(c.x, c.y, c.name, sel ? 19 : 13, sel ? "#f2f7ff" : c.inField ? "#cdcac1" : "#a8bdd8", sel ? null : String(c.w), sel ? "0.03em" : "0.06em", clear, side, false);
      });
    }
    // Consistent glow clearance (2026-08-07): every label offsets past its own
    // node's halo-sprite radius (core r + blur*0.85, projected to screen px) —
    // the fixed 16px floor let big-degree glows (Heymach) run under the name.
    const glowClear = (i: number) => {
      const n = g.nodes[i];
      const blur = (n.cohort === "established" ? 11 : 7) + n.deg * 0.28;
      return (rad[i] + blur * 0.85) * cam.z + 8;
    };
    const zoomedIn = cam.z > 1.05;
    // Hover chip places FIRST and the hovered star's own ambient label is
    // suppressed (2026-08-07): leaders carry an always-on label, and the
    // hover chip — placed last — lost the collision check to it and was
    // culled. Exactly the biggest stars (Heymach, Wistuba, Ramalingam) never
    // visibly responded to hover while unlabelled mid-tier stars lit up.
    if (nearIdx != null) chip(g.nodes[nearIdx].x, g.nodes[nearIdx].y, g.nodes[nearIdx].name, 15, "#f6f2e8", null, "0.03em", glowClear(nearIdx), 0, false);
    const pool = g.nodes.filter((n) => inCohort(n) && (zoomedIn || isLeader(n))).slice().sort((a, b) => b.deg - a.deg);
    pool.slice(0, zoomedIn ? 40 : density === "full" ? 22 : 14).forEach((n) => {
      if (n.i === nearIdx) return;
      if (focus && (n.i === focusIdx || orbFieldIdx.has(n.i))) return;
      chip(n.x, n.y, n.name, 12.5, focus ? "rgba(226,223,214,0.3)" : "rgba(226,223,214,0.5)", null, "0.05em", glowClear(n.i), 0, !!focus);
    });

    // panel content
    let selName = "", selInst = "", selRole = "", selRoleColor = GOLD, selConn = "", selShared = "", selRank = "", banner = "", collabs: JSX.Element[] = [], hasStats = false;
    if (focus) {
      if (focus.t === "f") {
        const n = g.nodes[focus.i]; const off = orb!.filter((c) => !c.inField).length; hasStats = true;
        selName = n.name; selInst = n.inst; selRole = ROLE[n.cohort]; selRoleColor = TINT[n.cohort];
        selConn = String(n.deg); selShared = String(orb!.reduce((s, c) => s + c.w, 0)); selRank = n.rank != null ? "#" + n.rank : "—";
        banner = off > 0
          ? "Top five co-authors, weighted by shared publications. " + off + " of them sit outside this sky — the overview could never have shown them."
          : "Top five co-authors, weighted by shared publications. All five are already in this sky.";
        collabs = orb!.map((c, k) => (
          <div key={"c" + k} onClick={(ev) => { ev.stopPropagation(); this.focusOn(c.fieldIndex >= 0 ? { t: "f", i: c.fieldIndex } : { t: "o", p: orbHost!, k }); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: TINT[c.cohort], boxShadow: `0 0 9px ${TINT[c.cohort]}`, ...(c.inField ? {} : { outline: "1px dashed rgba(168,189,216,0.6)", outlineOffset: 3 }) }} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ font: "300 15px/1.2 Jost,sans-serif", color: "#dcd9d0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
              <div style={{ font: "300 11px/1.3 Jost,sans-serif", letterSpacing: "0.03em", color: c.inField ? "#565d72" : "#7d90ad", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.inField ? c.inst : (c.srcCohort === "community" ? ROLE.community : c.rank != null && c.srcCohort !== "other" ? ROLE[c.srcCohort] + " #" + c.rank : "Outside this sky")}</div>
            </div>
            <div style={{ font: "300 16px/1 Jost,sans-serif", color: "#c9c6bd", flex: "none" }}>{c.w}</div>
            <div style={{ font: "300 15px/1 Jost,sans-serif", color: c.inField ? "#3f4658" : "transparent", flex: "none" }}>→</div>
          </div>
        ));
      } else {
        const c = orb![focus.k], h = g.nodes[focus.p];
        const ta = this.props.taId === AD_TA_ID ? "AD" : "NSCLC";
        // The star is "outside the sky" (not drawn among the fifty) — but that is a
        // fact about the DRAWING, not the person. Where the platform ranks them,
        // SHOW the rank; deny a ranking ONLY when there genuinely is none.
        // Community (Phase 3): a valid cohort with NO rank — board membership is
        // the fact; no numeral ever renders for it.
        const ranked = c.rank != null && (c.srcCohort === "established" || c.srcCohort === "rising");
        selName = c.name; selInst = "";
        if (ranked) {
          selRole = ROLE[c.srcCohort] + " · #" + c.rank; selRoleColor = TINT[c.srcCohort] ?? OTHER;
          banner = ROLE[c.srcCohort] + " #" + c.rank + " in " + ta + ". This star sits outside the fifty drawn in this sky — it is on " + h.name + "'s orbit because they share " + c.w + " publications.";
        } else if (c.srcCohort === "community") {
          selRole = ROLE.community; selRoleColor = TINT.community ?? OTHER;
          banner = "A " + ta + " community board clinician — community is not ranked. It is here because " + h.name + " has " + c.w + " shared publications with them.";
        } else {
          selRole = ROLE.other; selRoleColor = OTHER;
          banner = "Not ranked in " + ta + ". It is here because " + h.name + " has " + c.w + " shared publications with them.";
        }
        collabs = [(
          <div key="back" onClick={(ev) => { ev.stopPropagation(); this.focusOn({ t: "f", i: h.i }); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: TINT[h.cohort], boxShadow: `0 0 9px ${TINT[h.cohort]}` }} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ font: "300 15px/1.2 Jost,sans-serif", color: "#dcd9d0" }}>{h.name}</div>
              <div style={{ font: "300 11px/1.3 Jost,sans-serif", letterSpacing: "0.03em", color: "#565d72" }}>{h.inst}</div>
            </div>
            <div style={{ font: "300 16px/1 Jost,sans-serif", color: "#c9c6bd", flex: "none" }}>{c.w}</div>
            <div style={{ font: "300 15px/1 Jost,sans-serif", color: "#3f4658", flex: "none" }}>→</div>
          </div>
        )];
      }
    }

    const quiet = (active: boolean): CSSProperties => ({ font: `${active ? 400 : 300} 11px/1 Jost,sans-serif`, letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", paddingBottom: 6, transition: "color 240ms ease,border-color 240ms ease", borderBottom: `1px solid ${active ? "rgba(255,216,155,0.6)" : "transparent"}`, color: active ? "#ffd89b" : "#4d5468" });
    const cohortTabs: [State["cohort"], string][] = [["all", "All"], ["established", "Established"], ["rising", "Rising Star"]];
    const densityTabs: [State["density"], string][] = [["leaders", "Leaders"], ["full", "Full field"]];
    const densityNote = density === "leaders" ? `The brightest ${LEADERS} of ${g.nodes.length}. Fainter researchers are still out there — let your eyes adjust, or close in on them.` : `The full working sky is risen — ${g.nodes.length} ranked researchers. Co-authorship lines thicken with shared publications.`;

    const q = query.trim().toLowerCase();
    const matches = g.nodes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.inst.toLowerCase().includes(q)).sort((a, b) => b.deg - a.deg).slice(0, 8);

    const legend: [string, string][] = [
      ["Established", `width:6px;height:6px;border-radius:50%;background:${GOLD};box-shadow:0 0 11px rgba(255,216,155,0.85)`],
      ["Rising Star — subtle pulse", `width:5px;height:5px;border-radius:50%;background:${PURP};box-shadow:0 0 11px rgba(160,116,255,0.8);outline:1px solid rgba(195,169,255,0.34);outline-offset:4px`],
      ["Outside this sky", `width:5px;height:5px;border-radius:50%;background:${OTHER};box-shadow:0 0 11px rgba(140,178,228,0.7);outline:1px dashed rgba(168,189,216,0.55);outline-offset:3px`],
      ["Shared publications", "width:28px;height:1px;background:linear-gradient(90deg,rgba(126,147,198,0.12),rgba(126,147,198,0.8))"],
      ["Background dust — decorative, no data", "width:3px;height:3px;border-radius:50%;background:#dce6ff;opacity:0.35"],
    ];
    // Reset control: appears whenever the view has left its initial framing —
    // focus, zoom, OR a pure pan (the old check missed pan, stranding the camera).
    const fit0 = this.fitCam();
    const movedFromInitial =
      Math.abs(cam.z - fit0.z) > 0.06 || Math.abs(cam.x - fit0.x) > 2 || Math.abs(cam.y - fit0.y) > 2;
    const canReset = !!focus || movedFromInitial;
    const resetLabel = focus ? "Return to the full sky" : "Reset view";

    return (
      <div ref={this.hostRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#04060d", cursor: "grab", touchAction: "none", userSelect: "none" }}
        onPointerDown={this.onDown} onPointerMove={this.onMove} onPointerUp={this.onUp} onPointerLeave={this.onLeave} onWheel={this.onWheel}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 22% 8%, rgba(28,42,86,0.55) 0%, rgba(8,11,24,0) 58%), radial-gradient(90% 80% at 88% 92%, rgba(52,28,76,0.42) 0%, rgba(8,11,24,0) 55%), radial-gradient(70% 60% at 50% 50%, rgba(10,16,34,0.9) 0%, #04060d 78%)" }} />
        <div style={{ position: "absolute", left: "-12%", top: "14%", width: "130%", height: "44%", transform: "rotate(-13deg)", background: "radial-gradient(closest-side, rgba(126,150,214,0.085) 0%, rgba(126,150,214,0.03) 42%, rgba(126,150,214,0) 76%)", filter: "blur(46px)" }} />
        <div style={{ position: "absolute", left: "8%", top: "52%", width: "52%", height: "38%", transform: "rotate(-9deg)", background: "radial-gradient(closest-side, rgba(176,138,224,0.055) 0%, rgba(176,138,224,0) 72%)", filter: "blur(58px)" }} />

        <svg viewBox={`0 0 ${Math.round(VW)} ${Math.round(VH)}`} preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
          <defs>
            <linearGradient id="svTrail" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" /><stop offset="60%" stopColor="#cfe0ff" stopOpacity="0.18" /><stop offset="100%" stopColor="#cfe0ff" stopOpacity="0" /></linearGradient>
            <linearGradient id="svTrail2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" /><stop offset="70%" stopColor="#e6d4ff" stopOpacity="0.12" /><stop offset="100%" stopColor="#e6d4ff" stopOpacity="0" /></linearGradient>
            <linearGradient id="svTrail3" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff4e0" stopOpacity="0.95" /><stop offset="55%" stopColor="#ffd89b" stopOpacity="0.2" /><stop offset="100%" stopColor="#ffd89b" stopOpacity="0" /></linearGradient>
            {/* Shared halo sprites (2026-08-07): one radial gradient per cohort
                replaces the two per-star drop-shadow FILTERS — the filters were
                the frame-rate budget past ~300 nodes; gradients rasterize once. */}
            <radialGradient id="svHaloEst"><stop offset="0%" stopColor="rgba(255,196,120,0.5)" /><stop offset="42%" stopColor="rgba(255,196,120,0.16)" /><stop offset="100%" stopColor="rgba(255,196,120,0)" /></radialGradient>
            <radialGradient id="svHaloRis"><stop offset="0%" stopColor="rgba(160,116,255,0.46)" /><stop offset="42%" stopColor="rgba(160,116,255,0.15)" /><stop offset="100%" stopColor="rgba(160,116,255,0)" /></radialGradient>
            <radialGradient id="svHaloOth"><stop offset="0%" stopColor="rgba(140,178,228,0.42)" /><stop offset="42%" stopColor="rgba(140,178,228,0.13)" /><stop offset="100%" stopColor="rgba(140,178,228,0)" /></radialGradient>
          </defs>
          <g ref={this.farRef}>{this.dustFar().map((d) => <circle key={d.key} cx={d.cx} cy={d.cy} r={d.r} style={sx(d.style)} />)}</g>
          <g ref={this.midRef}>{this.dustMid().map((d) => <circle key={d.key} cx={d.cx} cy={d.cy} r={d.r} style={sx(d.style)} />)}</g>
          <g ref={this.worldRef}>
            {/* Meteors sit in the WORLD layer, FIRST — behind edges and stars — so
                they share the field's parallax (travel with it on pan) and a star
                can pass in front of a meteor rather than the meteor always over it. */}
            <g>
              {/* Meteors rebuilt 2026-08-07: the seven old ones sat at OLD-world
                  top-left coordinates with short hops — the enlarged world's
                  landing camera never framed one. Three long streaks now cross
                  the THICK of the field (start points from WW/WH, travel ~2000
                  world px through the central band), each on a 75s cycle
                  staggered by 25s: one shooting star every ~25 seconds. */}
              {/* Tail lines are ANTIPARALLEL to each travel vector (the streak
                  trails behind the head, as the originals did) — a tail off-axis
                  reads as a bar sliding sideways, not a shooting star. All three
                  travel on shallow DOWNWARD diagonals like the old set, dimmer
                  and thinner for subtlety. */}
              <g style={{ transform: `translate(${Math.round(WW * 0.18)}px,${Math.round(WH * 0.14)}px)`, animation: "sv-shoot 75s linear infinite" }}><line x1="0" y1="0" x2="-265" y2="-120" stroke="url(#svTrail)" strokeWidth="1.1" strokeLinecap="round" /></g>
              <g style={{ transform: `translate(${Math.round(WW * 0.85)}px,${Math.round(WH * 0.20)}px)`, animation: "sv-shoot2 75s linear -25s infinite" }}><line x1="0" y1="0" x2="250" y2="-114" stroke="url(#svTrail2)" strokeWidth="1.0" strokeLinecap="round" /></g>
              <g style={{ transform: `translate(${Math.round(WW * 0.45)}px,${Math.round(WH * 0.10)}px)`, animation: "sv-shoot3 75s linear -50s infinite" }}><line x1="0" y1="0" x2="-230" y2="-146" stroke="url(#svTrail3)" strokeWidth="1.1" strokeLinecap="round" /></g>
            </g>
            <g>{edges.map((e) => e.el)}</g>
            <g>{rings}</g>
            <g>{stars}</g>
          </g>
        </svg>

        <div ref={this.labelRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{labels}</div>

        {/* title / trail */}
        <div style={{ position: "absolute", left: EDGE, top: TOP, maxWidth: Math.round(Math.min(460, VW * 0.36)), display: "flex", flexDirection: "column", gap: narrow ? 14 : 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, pointerEvents: "none" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffd89b", boxShadow: "0 0 12px rgba(255,216,155,0.9)" }} />
            <div style={{ font: "400 11px/1 Jost,sans-serif", letterSpacing: "0.42em", textTransform: "uppercase", color: "#e6e3da" }}>SkyView</div>
          </div>
          {!focus && !this.state.trail.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, pointerEvents: "none" }}>
              <div style={{ font: `400 34px/1.22 ${FONT.serif}`, letterSpacing: "-0.005em", color: "#e6e3da", textWrap: "pretty" } as CSSProperties}>The constellation of the recognized and emerging field</div>
              <div style={{ font: `400 15px/1.7 ${FONT.serif}`, color: "#7c839a", maxWidth: 400, textWrap: "pretty" } as CSSProperties}>A curated subgraph — the researchers already recognized as established or rising stars in {this.props.taId === AD_TA_ID ? "AD" : "NSCLC"}, and the co-authorship among them. Not every researcher, and not anyone's complete network.</div>
              <div style={{ font: "300 13px/1.7 Jost,sans-serif", letterSpacing: "0.02em", color: "#4d5468", maxWidth: 390, textWrap: "pretty" } as CSSProperties}>Drag to look around. Scroll to move closer. Settle on a star to see its real orbit — then travel from there.</div>
            </div>
          ) : null}
          {this.state.trail.length > 0 ? (
            <div onPointerDown={this.stop} onPointerUp={this.stop} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ font: "400 9px/1 Jost,sans-serif", letterSpacing: "0.28em", textTransform: "uppercase", color: "#3f4658" }}>Your route</div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", maxWidth: 430 }}>
                <div style={{ font: "300 11px/1 Jost,sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: "#4d5468", cursor: "pointer" }} onClick={this.pullBack}>Full sky</div>
                {this.state.trail.map((t, k) => (
                  <div key={"tr" + k} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.13)" }} />
                    <div style={{ font: `${k === this.state.trail.length - 1 ? 400 : 300} 11px/1 Jost,sans-serif`, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", color: k === this.state.trail.length - 1 ? "#ffd89b" : "#4d5468" }} onClick={(ev) => { ev.stopPropagation(); this.focusOn(t.focus, false); }}>{t.name}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* search + controls */}
        <div style={{ position: "absolute", right: EDGE, top: TOP, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: narrow ? 16 : 20, width: Math.round(Math.max(238, Math.min(330, VW * 0.21))) }}>
          <div style={{ width: "100%", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${qOpen ? "rgba(255,216,155,0.5)" : "rgba(255,255,255,0.1)"}`, padding: "0 2px 11px", transition: "border-color 260ms ease" }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", border: "1px solid #4d5468", flex: "none" }} />
              <input type="text" value={query} placeholder="Fly to a researcher" onChange={(e) => this.setState({ query: e.target.value, qOpen: true })} onFocus={() => this.setState({ qOpen: true })} onPointerDown={this.stop} onPointerUp={this.stop} style={{ all: "unset", boxSizing: "border-box", flex: 1, font: "300 14px/1.2 Jost,sans-serif", letterSpacing: "0.04em", color: "#e6e3da", caretColor: "#ffd89b" }} />
              {query.length > 0 ? <div style={{ font: "300 11px/1 Jost,sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "#4d5468", cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); this.setState({ query: "", qOpen: false }); }}>Clear</div> : null}
            </div>
            {qOpen ? (
              <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 10, background: "rgba(6,9,19,0.82)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, padding: "8px 0", maxHeight: 394, overflowY: "auto", boxShadow: "0 30px 70px rgba(0,0,0,0.5)" } as CSSProperties} onPointerDown={this.stop} onPointerUp={this.stop}>
                {matches.map((n) => (
                  <div key={n.id} onClick={(ev) => { ev.stopPropagation(); this.focusOn({ t: "f", i: n.i }); }} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 18px", cursor: "pointer" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: TINT[n.cohort], boxShadow: `0 0 9px ${TINT[n.cohort]}` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "300 14px/1.2 Jost,sans-serif", color: "#dcd9d0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.name}</div>
                      <div style={{ font: "300 10px/1.2 Jost,sans-serif", letterSpacing: "0.04em", color: "#4d5468", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.inst}</div>
                    </div>
                    <div style={{ font: "300 12px/1 Jost,sans-serif", color: "#565d72", flex: "none" }}>{n.deg}</div>
                  </div>
                ))}
                {matches.length === 0 ? <div style={{ padding: "14px 18px", font: "300 12px/1.5 Jost,sans-serif", color: "#4d5468" }}>No one by that name in this sky.</div> : null}
              </div>
            ) : null}
          </div>
          <div onPointerDown={this.stop} onPointerUp={this.stop} style={{ display: "flex", gap: 24 }}>{cohortTabs.map(([k, label]) => <div key={k} style={quiet(cohort === k)} onClick={(ev) => { ev.stopPropagation(); this.setState({ cohort: k }); }}>{label}</div>)}</div>
          <div onPointerDown={this.stop} onPointerUp={this.stop} style={{ display: "flex", gap: 24 }}>{densityTabs.map(([k, label]) => <div key={k} style={quiet(density === k)} onClick={(ev) => { ev.stopPropagation(); this.setState({ density: k }); }}>{label}</div>)}</div>
          <div style={{ font: "300 11px/1.6 Jost,sans-serif", letterSpacing: "0.03em", color: "#3f4658", textAlign: "right", maxWidth: 250, textWrap: "pretty" } as CSSProperties}>{densityNote}</div>
        </div>

        {/* focus panel */}
        {focus ? (
          <div onPointerDown={this.stop} onPointerUp={this.stop} style={{ position: "absolute", right: EDGE, bottom: EDGE + 44, width: PANELW, boxSizing: "border-box", background: "rgba(6,9,19,0.62)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 3, padding: narrow ? "24px 24px 22px" : "30px 30px 26px", display: "flex", flexDirection: "column", gap: narrow ? 18 : 22, boxShadow: "0 40px 90px rgba(0,0,0,0.5)", maxHeight: Math.round(VH - EDGE * 2 - 150), overflowY: "auto" } as CSSProperties}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ font: "400 10px/1 Jost,sans-serif", letterSpacing: "0.32em", textTransform: "uppercase", color: selRoleColor }}>{selRole}</div>
              <div style={{ font: "200 28px/1.16 Jost,sans-serif", letterSpacing: "0.006em", color: "#f0ede4" }}>{selName}</div>
              <div style={{ font: "300 13px/1.5 Jost,sans-serif", color: "#7c839a" }}>{selInst}</div>
            </div>
            {hasStats ? (
              // Third stat is COHORT RANK — momentum has no data and never renders.
              <div style={{ display: "flex", gap: 32, padding: "18px 0", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {[[selConn, "Connectivity"], [selShared, "Shared works"], [selRank, "Field rank"]].map(([v, l]) => (
                  <div key={l} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ font: "300 22px/1 Jost,sans-serif", color: "#e6e3da" }}>{v}</div>
                    <div style={{ font: "400 9px/1 Jost,sans-serif", letterSpacing: "0.2em", textTransform: "uppercase", color: "#4d5468" }}>{l}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ font: "300 12px/1.65 Jost,sans-serif", color: "#8f96ab", textWrap: "pretty" } as CSSProperties}>{banner}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>{collabs}</div>
              {focus.t === "f" ? <div style={{ font: "300 10px/1.5 Jost,sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "#3f4658" }}>Travel to any of them — the sky follows</div> : null}
            </div>
            {focus.t === "f" ? (
              <div style={{ flex: 1, textAlign: "center", border: "1px solid rgba(255,216,155,0.42)", color: "#ffd89b", borderRadius: 2, padding: 14, font: "400 11px/1 Jost,sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" }} onClick={(ev) => { ev.stopPropagation(); this.open(g.nodes[(focus as { t: "f"; i: number }).i].id); }}>Open HCP profile</div>
            ) : null}
          </div>
        ) : null}

        {/* legend */}
        <div style={{ position: "absolute", left: EDGE, bottom: EDGE, display: "flex", alignItems: "center", gap: narrow ? 16 : 32, pointerEvents: "none", flexWrap: "wrap", maxWidth: Math.round(Math.max(320, VW - PANELW - EDGE * 2 - 250)) }}>
          {legend.map(([label, dot]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={sx(dot)} />
              <div style={{ font: "300 11px/1 Jost,sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "#5a6178" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* cam controls — shielded like the other overlays (fix 1 + 2) so a moved
            click on Reset / Return-to-full-sky isn't captured by the host as a pan. */}
        <div onPointerDown={this.stop} onPointerUp={this.stop} style={{ position: "absolute", right: EDGE, bottom: EDGE, display: "flex", alignItems: "center", gap: narrow ? 16 : 26 }}>
          <div style={{ font: "300 10px/1 Jost,sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: "#343b4c", pointerEvents: "none" }}>Drag · Scroll · Click</div>
          {canReset ? <div style={{ font: "300 11px/1 Jost,sans-serif", letterSpacing: "0.18em", textTransform: "uppercase", color: "#5a6178", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.12)", paddingBottom: 5 }} onClick={this.pullBack}>{resetLabel}</div> : null}
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, bottom: 22, textAlign: "center", pointerEvents: "none" }}>
          <div style={{ font: "300 10px/1 Jost,sans-serif", letterSpacing: "0.14em", color: "#343b4c" }}>For verified MSL use only. Content not affiliated with mentioned researchers.</div>
        </div>
      </div>
    );
  }

  renderMobile() {
    const g = this.field();
    const mTab = this.state.mTab, mOpen = this.state.mOpen;
    const estCount = g.nodes.filter((n) => n.cohort === "established").length;
    const risCount = g.nodes.filter((n) => n.cohort === "rising").length;
    const list = g.nodes.filter((n) => n.cohort === mTab).slice().sort((a, b) => b.deg - a.deg);
    return (
      <div ref={this.hostRef} style={{ width: "100%", minHeight: 560, background: "#04060d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", flex: "none", padding: "26px 22px 16px", background: "radial-gradient(110% 150% at 30% 0%, rgba(30,44,88,0.6) 0%, rgba(6,9,20,0) 62%), #05070f" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#ffd89b", boxShadow: "0 0 10px rgba(255,216,155,0.9)" }} />
              <div style={{ font: "400 10px/1 Jost,sans-serif", letterSpacing: "0.36em", textTransform: "uppercase", color: "#e6e3da" }}>SkyView</div>
            </div>
            <div style={{ font: "300 10px/1 Jost,sans-serif", letterSpacing: "0.16em", textTransform: "uppercase", color: "#4d5468" }}>{this.props.taId === AD_TA_ID ? "AD" : "NSCLC"}</div>
          </div>
          <div style={{ font: "200 22px/1.24 Jost,sans-serif", color: "#e6e3da", textWrap: "pretty" } as CSSProperties}>Recognized names</div>
          <div style={{ font: "300 12px/1.55 Jost,sans-serif", color: "#6b7288", marginTop: 6, textWrap: "pretty" } as CSSProperties}>Established and rising stars, and the co-authorship among them. Tap one, then travel collaborator to collaborator.</div>
        </div>
        <div style={{ flex: "none", display: "flex", padding: "0 22px", gap: 28, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {([["established", `Established ${estCount}`], ["rising", `Rising Star ${risCount}`]] as [State["mTab"], string][]).map(([k, label]) => (
            <div key={k} onClick={() => this.setState({ mTab: k, mOpen: null })} style={{ padding: "15px 0", font: `${mTab === k ? 400 : 300} 11px/1 Jost,sans-serif`, letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", borderBottom: `1px solid ${mTab === k ? "rgba(255,216,155,0.6)" : "transparent"}`, color: mTab === k ? "#ffd89b" : "#4d5468", marginBottom: -1 }}>{label}</div>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {list.map((n, k) => {
            const open = mOpen === n.i;
            const o = open ? this.orbit(n.i) : [];
            const off = o.filter((c) => !c.inField).length;
            return (
              <div key={n.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.045)" }}>
                <div onClick={() => this.setState({ mOpen: open ? null : n.i })} style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 66, padding: "13px 22px", cursor: "pointer" }}>
                  <div style={{ width: 16, font: "300 11px/1 Jost,sans-serif", letterSpacing: "0.06em", color: "#3f4658", flex: "none" }}>{String(k + 1).padStart(2, "0")}</div>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: TINT[n.cohort], boxShadow: `0 0 10px ${TINT[n.cohort]}`, ...(n.rare ? { outline: "1px dashed rgba(195,169,255,0.5)", outlineOffset: 3 } : {}) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "300 16px/1.2 Jost,sans-serif", color: open ? "#ffd89b" : "#e2dfd6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color 240ms ease" }}>{n.name}</div>
                    <div style={{ font: "300 11px/1.2 Jost,sans-serif", letterSpacing: "0.02em", color: "#565d72", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.inst}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
                    <div style={{ width: 52, height: 1, background: "rgba(255,255,255,0.08)" }}><div style={{ height: 1, width: `${Math.min(100, n.deg * 4)}%`, background: TINT[n.cohort], opacity: 0.7 }} /></div>
                    {/* momentum removed — real cohort rank */}
                    <div style={{ font: "300 12px/1 Jost,sans-serif", color: "#8f96ab", width: 34, textAlign: "right" }}>{n.rank != null ? "#" + n.rank : "—"}</div>
                  </div>
                </div>
                {open ? (
                  <div style={{ padding: "0 0 20px", display: "flex", flexDirection: "column", gap: 14, background: "radial-gradient(90% 60% at 50% 22%, rgba(24,36,72,0.5) 0%, rgba(5,7,15,0) 70%), #05070f" }}>
                    <MobileOrbit host={n} orbit={o} />
                    <div style={{ font: "300 12px/1.6 Jost,sans-serif", color: "#6b7288", padding: "0 22px", textWrap: "pretty" } as CSSProperties}>{off > 0 ? `Top five co-authors by shared publications. ${off} of them are outside this sky. Tap anyone in the field to travel to them.` : "Top five co-authors by shared publications. Tap anyone to travel to them."}</div>
                    <div style={{ display: "flex", flexDirection: "column", padding: "0 22px" }}>
                      {o.map((c, k2) => (
                        <div key={"mc" + k2} onClick={() => { if (c.fieldIndex >= 0) this.setState({ mTab: g.nodes[c.fieldIndex].cohort as State["mTab"], mOpen: c.fieldIndex }); }} style={{ display: "flex", alignItems: "center", gap: 13, minHeight: 48, borderTop: "1px solid rgba(255,255,255,0.045)", cursor: c.inField ? "pointer" : "default" }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: TINT[c.cohort], boxShadow: `0 0 9px ${TINT[c.cohort]}`, ...(c.inField ? {} : { outline: "1px dashed rgba(168,189,216,0.6)", outlineOffset: 3 }) }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ font: "300 14px/1.2 Jost,sans-serif", color: "#dcd9d0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                            <div style={{ font: "300 10px/1.3 Jost,sans-serif", letterSpacing: "0.03em", color: c.inField ? "#4d5468" : "#7d90ad" }}>{c.inField ? c.inst : (c.srcCohort === "community" ? ROLE.community : c.rank != null && c.srcCohort !== "other" ? ROLE[c.srcCohort] + " #" + c.rank : "Outside this sky")}</div>
                          </div>
                          <div style={{ font: "300 15px/1 Jost,sans-serif", color: "#c9c6bd", flex: "none" }}>{c.w}</div>
                          <div style={{ font: "300 15px/1 Jost,sans-serif", color: c.inField ? "#5a6178" : "transparent", flex: "none", width: 12, textAlign: "right" }}>{c.inField ? "→" : ""}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10, padding: "6px 22px 0" }}>
                      <div onClick={() => this.open(n.id)} style={{ flex: 1, textAlign: "center", border: "1px solid rgba(255,216,155,0.4)", color: "#ffd89b", borderRadius: 2, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", font: "400 11px/1 Jost,sans-serif", letterSpacing: "0.16em", textTransform: "uppercase" }}>Open profile</div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ flex: "none", padding: "13px 22px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ font: "300 9px/1.5 Jost,sans-serif", letterSpacing: "0.1em", color: "#343b4c", textAlign: "center", textWrap: "pretty" } as CSSProperties}>For verified MSL use only. Content not affiliated with mentioned researchers.</div>
        </div>
      </div>
    );
  }
}

// mobile inline ego-orbit SVG (host center + real top-5)
function MobileOrbit({ host, orbit }: { host: FNode; orbit: OrbNode[] }) {
  const ocx = 195, ocy = 116;
  const pts = orbit.map((c, k) => { const a = -Math.PI / 2 + k * (Math.PI * 2 / Math.max(orbit.length, 1)) + 0.32; const f = 0.46 + k * 0.135; return { x: ocx + Math.cos(a) * 138 * f, y: ocy + Math.sin(a) * 90 * f, right: Math.cos(a) >= -0.12 }; });
  return (
    <div style={{ position: "relative", width: "100%", height: 238 }}>
      <svg viewBox="0 0 390 238" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}>
        {orbit.map((c, k) => { const md = Math.hypot(pts[k].x - ocx, pts[k].y - ocy) || 1; const ea = 9.5 / md, eb = (c.inField ? 8 : 13) / md;
          return <line key={"e" + k} x1={(ocx + (pts[k].x - ocx) * ea).toFixed(1)} y1={(ocy + (pts[k].y - ocy) * ea).toFixed(1)} x2={(pts[k].x - (pts[k].x - ocx) * eb).toFixed(1)} y2={(pts[k].y - (pts[k].y - ocy) * eb).toFixed(1)} style={{ stroke: c.inField ? "#ffd89b" : OTHER, strokeOpacity: 0.24 + c.w * 0.0032, strokeWidth: 0.3 + c.w * 0.0078, strokeLinecap: "round", ...(c.inField ? {} : { strokeDasharray: "2.5 4.5" }) }} />; })}
        {orbit.map((c, k) => !c.inField ? <circle key={"g" + k} cx={pts[k].x.toFixed(1)} cy={pts[k].y.toFixed(1)} r={9} style={{ fill: "none", stroke: OTHER, strokeOpacity: 0.4, strokeWidth: 0.8, strokeDasharray: "2 4" }} /> : null)}
        {orbit.map((c, k) => <circle key={"d" + k} cx={pts[k].x.toFixed(1)} cy={pts[k].y.toFixed(1)} r={3.6} style={{ fill: TINT[c.cohort], filter: `drop-shadow(0 0 4px ${TINT[c.cohort]}) drop-shadow(0 0 12px ${HALO[c.cohort]})` }} />)}
        <circle cx={ocx} cy={ocy} r={6} style={{ fill: "#fffaf0", filter: `drop-shadow(0 0 6px ${TINT[host.cohort]}) drop-shadow(0 0 20px ${HALO[host.cohort]})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: `${(ocx / 390 * 100).toFixed(2)}%`, top: `${((ocy - 15) / 238 * 100).toFixed(2)}%`, transform: "translate(-50%,-100%)", whiteSpace: "nowrap", font: "300 12.5px/1 Jost,sans-serif", letterSpacing: "0.03em", color: "#f6f2e8" }}>{host.name}</div>
        {orbit.map((c, k) => (
          <div key={"t" + k} style={{ position: "absolute", left: `${(pts[k].x / 390 * 100).toFixed(2)}%`, top: `${(pts[k].y / 238 * 100).toFixed(2)}%`, transform: `translate(${pts[k].right ? (c.inField ? 11 : 15) + "px" : "calc(-100% - " + (c.inField ? 11 : 15) + "px)"},-50%)`, whiteSpace: "nowrap", font: "300 10.5px/1 Jost,sans-serif", letterSpacing: "0.04em", color: c.inField ? "#cdcac1" : "#a8bdd8" }}>{c.name}  {c.w}</div>
        ))}
      </div>
    </div>
  );
}

export default function TelescopeField({ taId, onOpenProfile }: Props) {
  // FULL-BLEED, FULL-VIEWPORT slot. The sky pins to the whole viewport (position:fixed,
  // inset:0) — NOT below the nav — so dust/meteors/haze run edge-to-edge behind the floating
  // chrome (Option 2). A position:fixed slot is not clipped by the app's overflow-hidden
  // 880px column (no transform in the chain). The chrome (App.tsx) floats OVER it at a higher
  // z-index. `chromeH` is MEASURED from an in-flow placeholder = the floating chrome's height,
  // and passed to Sky as `safeTop`: the SAFE-AREA inset. The sky's interactive layer (camera
  // framing + Skyview title/search) insets below it so no clickable star renders under the nav.
  const narrow = useMediaQuery("(max-width: 767px)");
  const slotRef = useRef<HTMLDivElement>(null);
  const [chromeH, setChromeH] = useState(132);
  useLayoutEffect(() => {
    const measure = () => { const el = slotRef.current; if (el) { const t = Math.max(0, Math.round(el.getBoundingClientRect().top)); setChromeH((p) => (Math.abs(p - t) > 1 ? t : p)); } };
    measure();
    window.addEventListener("resize", measure);
    const id = window.setInterval(measure, 500); // catch async chrome layout (filters/tabs)
    const stop = window.setTimeout(() => window.clearInterval(id), 3000);
    return () => { window.removeEventListener("resize", measure); window.clearInterval(id); window.clearTimeout(stop); };
  }, []);
  // Mobile: the list-first view lives in normal flow BELOW the stacked app chrome — no
  // full-viewport takeover, no exit X. The immersive treatment is desktop-only.
  if (narrow) {
    return (
      <>
        <style>{SKY_KEYFRAMES}</style>
        <Sky key={taId} taId={taId} onOpenProfile={onOpenProfile} safeTop={0} forceMobile />
      </>
    );
  }
  return (
    <>
      <style>{SKY_KEYFRAMES}</style>
      {/* spacer keeps `.fm-screen` ~100vh tall (so the page doesn't over-scroll) and is what
          we measure for the chrome height; the sky itself is fixed/full-viewport below it. */}
      <div ref={slotRef} style={{ height: `calc(100vh - ${chromeH}px)`, minHeight: 500 }} aria-hidden />
      <div style={{ position: "fixed", inset: 0, background: "#02030a", zIndex: 3, fontFamily: "Jost, 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Sky key={taId} taId={taId} onOpenProfile={onOpenProfile} safeTop={chromeH} />
      </div>
    </>
  );
}

const SKY_KEYFRAMES = `
@keyframes sv-tw { 0%,100% { opacity:1 } 50% { opacity:0.38 } }
@keyframes sv-tws { 0%,100% { opacity:1 } 50% { opacity:0.62 } }
@keyframes sv-drift { 0% { transform:translate(0px,0px) } 25% { transform:translate(2.5px,-1.8px) } 50% { transform:translate(0.6px,2.4px) } 75% { transform:translate(-2.2px,0.8px) } 100% { transform:translate(0px,0px) } }
@keyframes sv-bloom { from { opacity:0; transform:scale(0.2) } to { opacity:1; transform:scale(1) } }
@keyframes sv-breathe { 0%,100% { opacity:0.42 } 50% { opacity:0.8 } }
@keyframes sv-rise { 0% { transform:scale(0.3); opacity:0 } 14% { opacity:0.32 } 100% { transform:scale(3.1); opacity:0 } }
@keyframes sv-swell { 0%,100% { opacity:0.82 } 46% { opacity:1 } }
@keyframes sv-shoot { 0%{opacity:0;transform:translate(0,0)} 0.5%{opacity:.55} 2.7%{opacity:.55;transform:translate(1500px,680px)} 3.4%{opacity:0;transform:translate(1800px,816px)} 100%{opacity:0;transform:translate(1800px,816px)} }
@keyframes sv-shoot2 { 0%{opacity:0;transform:translate(0,0)} 0.5%{opacity:.5} 2.7%{opacity:.5;transform:translate(-1400px,640px)} 3.4%{opacity:0;transform:translate(-1680px,768px)} 100%{opacity:0;transform:translate(-1680px,768px)} }
@keyframes sv-shoot3 { 0%{opacity:0;transform:translate(0,0)} 0.5%{opacity:.6} 2.7%{opacity:.6;transform:translate(1200px,760px)} 3.4%{opacity:0;transform:translate(1440px,912px)} 100%{opacity:0;transform:translate(1440px,912px)} }
`;
