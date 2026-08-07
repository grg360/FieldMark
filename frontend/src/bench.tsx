// SkyView fps bench (dev-only page, /bench.html) — mounts TelescopeField
// standalone (no app shell, no auth) and drives scripted interaction phases,
// recording frame times. Results land on window.__bench for the harness.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TelescopeField from "./components/TelescopeField";

declare global {
  interface Window { __bench?: Record<string, unknown> }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ position: "fixed", inset: 0 }}>
      <TelescopeField />
    </div>
  </StrictMode>,
);

interface Phase { name: string; ms: number; drive?: (host: Element, t: number) => void }

function summarize(deltas: number[]) {
  const d = deltas.slice().sort((a, b) => a - b);
  const avg = d.reduce((s, x) => s + x, 0) / (d.length || 1);
  const p95 = d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] ?? 0;
  return { frames: d.length, avgFps: Math.round(1000 / avg), p95FrameMs: Math.round(p95 * 10) / 10 };
}

function pointer(host: Element, type: string, x: number, y: number) {
  host.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, buttons: type === "pointerup" ? 0 : 1 }));
}

async function run() {
  await new Promise((r) => setTimeout(r, 2500)); // mount + first fit
  const host = document.querySelector("#root div[style*='grab'], #root > div > div") as Element;
  const W = window.innerWidth, H = window.innerHeight;
  const cx = W / 2, cy = H / 2;

  const phases: Phase[] = [
    { name: "idle", ms: 4000 },
    {
      name: "pan", ms: 6000,
      drive: (h, t) => {
        // continuous circular drag
        const a = t / 400;
        pointer(h, "pointermove", cx + Math.cos(a) * 260, cy + Math.sin(a) * 160);
      },
    },
    {
      name: "zoom", ms: 5000,
      drive: (h, t) => {
        const dir = Math.floor(t / 1250) % 2 === 0 ? -1 : 1;
        h.dispatchEvent(new WheelEvent("wheel", { bubbles: true, clientX: cx, clientY: cy, deltaY: dir * 60 }));
      },
    },
  ];

  const results: Record<string, unknown> = {};
  for (const ph of phases) {
    if (ph.name === "pan") pointer(host, "pointerdown", cx, cy);
    const deltas: number[] = [];
    let last = performance.now();
    const t0 = last;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        deltas.push(now - last);
        last = now;
        if (ph.drive) ph.drive(host, now - t0);
        if (now - t0 < ph.ms) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    if (ph.name === "pan") pointer(host, "pointerup", cx, cy);
    results[ph.name] = summarize(deltas.slice(5)); // drop warmup frames
    await new Promise((r) => setTimeout(r, 600));
  }
  results.nodes = document.querySelectorAll("#root svg g circle").length;
  results.done = true;
  window.__bench = results;
  console.log("BENCH", JSON.stringify(results));
  document.title = "BENCH DONE";
  // hand results to the harness receiver (dev bench only)
  try { await fetch("http://localhost:5599/bench", { method: "POST", body: JSON.stringify(results) }); } catch { /* receiver optional */ }
}

void run();
