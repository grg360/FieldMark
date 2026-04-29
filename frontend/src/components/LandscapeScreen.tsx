import { useState, useEffect, useRef } from "react";

// Leaflet is loaded via CDN script tag — typed loosely to avoid module eval issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any;

interface LandscapeScreenProps {
  ta: string;
  indication: string;
  onBack: () => void;
  onCityPress: (city: string, ta: string) => void;
}

type Tab = "Map" | "Momentum" | "Summary";

// ─── Map data ───────────────────────────────────────────────────────────────

interface CityMarker {
  city: string;
  lat: number;
  lng: number;
  count: number;
  avg: number;
  top: string;
  darkHorses?: number;
}

const RARE_DISEASE_MARKERS: CityMarker[] = [
  { city: "Boston, MA",       lat: 42.36, lng: -71.06,  count: 34, avg: 82.1, top: "Boston Children's Hospital",              darkHorses: 8 },
  { city: "San Francisco, CA",lat: 37.77, lng: -122.42, count: 28, avg: 79.4, top: "UCSF",                                    darkHorses: 7 },
  { city: "New York, NY",     lat: 40.71, lng: -74.01,  count: 41, avg: 77.8, top: "Columbia Medical Center",                 darkHorses: 11 },
  { city: "Philadelphia, PA", lat: 39.95, lng: -75.17,  count: 19, avg: 76.2, top: "Children's Hospital of Philadelphia" },
  { city: "Houston, TX",      lat: 29.76, lng: -95.37,  count: 22, avg: 74.9, top: "Texas Children's Hospital" },
  { city: "Chicago, IL",      lat: 41.88, lng: -87.63,  count: 17, avg: 73.1, top: "Lurie Children's Hospital" },
  { city: "Durham, NC",       lat: 35.99, lng: -78.90,  count: 15, avg: 80.3, top: "Duke University Medical Center",          darkHorses: 4 },
  { city: "Seattle, WA",      lat: 47.61, lng: -122.33, count: 12, avg: 75.6, top: "Seattle Children's Hospital" },
  { city: "Minneapolis, MN",  lat: 44.98, lng: -93.27,  count:  9, avg: 72.4, top: "University of Minnesota" },
  { city: "Denver, CO",       lat: 39.74, lng: -104.98, count:  7, avg: 71.2, top: "Children's Hospital Colorado" },
  { city: "Rochester, MN",    lat: 44.02, lng: -92.47,  count: 11, avg: 83.7, top: "Mayo Clinic" },
  { city: "Baltimore, MD",    lat: 39.29, lng: -76.61,  count: 16, avg: 78.9, top: "Johns Hopkins Hospital",                  darkHorses: 5 },
  { city: "Nashville, TN",    lat: 36.17, lng: -86.78,  count:  8, avg: 70.8, top: "Vanderbilt University Medical Center" },
  { city: "Los Angeles, CA",  lat: 34.05, lng: -118.24, count: 13, avg: 74.3, top: "UCLA Medical Center" },
  { city: "Atlanta, GA",      lat: 33.75, lng: -84.39,  count: 10, avg: 71.6, top: "Emory University Hospital" },
];

const ONCOLOGY_MARKERS: CityMarker[] = [
  { city: "Houston, TX",      lat: 29.76, lng: -95.37,  count: 51, avg: 85.2, top: "MD Anderson Cancer Center" },
  { city: "New York, NY",     lat: 40.71, lng: -74.01,  count: 47, avg: 83.1, top: "Memorial Sloan Kettering" },
  { city: "Boston, MA",       lat: 42.36, lng: -71.06,  count: 44, avg: 82.7, top: "Dana-Farber Cancer Institute" },
  { city: "Los Angeles, CA",  lat: 34.05, lng: -118.24, count: 38, avg: 79.4, top: "UCLA Medical Center" },
  { city: "Baltimore, MD",    lat: 39.29, lng: -76.61,  count: 29, avg: 78.2, top: "Johns Hopkins Hospital" },
  { city: "Chicago, IL",      lat: 41.88, lng: -87.63,  count: 24, avg: 75.3, top: "Robert H. Lurie Cancer Center" },
  { city: "Philadelphia, PA", lat: 39.95, lng: -75.17,  count: 21, avg: 74.8, top: "Penn Medicine" },
  { city: "San Francisco, CA",lat: 37.77, lng: -122.42, count: 19, avg: 73.9, top: "UCSF Helen Diller" },
  { city: "Seattle, WA",      lat: 47.61, lng: -122.33, count: 16, avg: 72.4, top: "Fred Hutchinson" },
  { city: "Nashville, TN",    lat: 36.17, lng: -86.78,  count: 13, avg: 71.1, top: "Vanderbilt-Ingram" },
];

const IMMUNOLOGY_MARKERS: CityMarker[] = [
  { city: "New York, NY",     lat: 40.71, lng: -74.01,  count: 43, avg: 84.1, top: "Rockefeller University" },
  { city: "Boston, MA",       lat: 42.36, lng: -71.06,  count: 40, avg: 83.6, top: "Brigham and Women's Hospital" },
  { city: "San Francisco, CA",lat: 37.77, lng: -122.42, count: 36, avg: 81.9, top: "UCSF" },
  { city: "Chicago, IL",      lat: 41.88, lng: -87.63,  count: 27, avg: 77.4, top: "Northwestern Medicine" },
  { city: "Baltimore, MD",    lat: 39.29, lng: -76.61,  count: 22, avg: 76.2, top: "Johns Hopkins Hospital" },
  { city: "Durham, NC",       lat: 35.99, lng: -78.90,  count: 18, avg: 74.8, top: "Duke University Medical Center" },
  { city: "Seattle, WA",      lat: 47.61, lng: -122.33, count: 15, avg: 73.1, top: "Benaroya Research Institute" },
];

const HEPATOLOGY_MARKERS: CityMarker[] = [
  { city: "San Francisco, CA",lat: 37.77, lng: -122.42, count: 39, avg: 83.4, top: "UCSF Liver Center" },
  { city: "Rochester, MN",    lat: 44.02, lng: -92.47,  count: 33, avg: 82.1, top: "Mayo Clinic" },
  { city: "Boston, MA",       lat: 42.36, lng: -71.06,  count: 29, avg: 80.7, top: "Massachusetts General Hospital" },
  { city: "Pittsburgh, PA",   lat: 40.44, lng: -79.99,  count: 24, avg: 78.3, top: "UPMC Liver Center" },
  { city: "New York, NY",     lat: 40.71, lng: -74.01,  count: 21, avg: 76.9, top: "Mount Sinai Liver Disease" },
  { city: "Chicago, IL",      lat: 41.88, lng: -87.63,  count: 16, avg: 73.2, top: "Northwestern Medicine" },
  { city: "Houston, TX",      lat: 29.76, lng: -95.37,  count: 13, avg: 71.8, top: "Houston Methodist" },
];

function getMarkersForTA(ta: string): CityMarker[] {
  if (ta === "Oncology") return ONCOLOGY_MARKERS;
  if (ta === "Immunology") return IMMUNOLOGY_MARKERS;
  if (ta === "Hepatology") return HEPATOLOGY_MARKERS;
  return RARE_DISEASE_MARKERS;
}

function markerRadius(count: number): number {
  if (count <= 5) return 8;
  if (count <= 15) return 12;
  if (count <= 30) return 16;
  if (count <= 50) return 20;
  return 24;
}

// ─── Momentum data ───────────────────────────────────────────────────────────

interface HCPPoint {
  name: string;
  pubvel: number;
  cittraj: number;
  score: number;
}

const RARE_DISEASE_POINTS: HCPPoint[] = [
  { name: "Dr. Priya Nair",      pubvel: 3.2, cittraj: 41, score: 87.4 },
  { name: "Dr. Marcus Webb",     pubvel: 2.1, cittraj: 29, score: 82.1 },
  { name: "Dr. Asha Delacroix",  pubvel: 1.8, cittraj: 67, score: 79.8 },
  { name: "Dr. Jin-Ho Park",     pubvel: 1.4, cittraj: 18, score: 76.3 },
  { name: "Dr. Fatima Al-Rashid",pubvel: 1.1, cittraj: 22, score: 71.9 },
  { name: "Dr. Chen Wei",        pubvel: 4.1, cittraj: 78, score: 91.2 },
  { name: "Dr. Aisha Omondi",    pubvel: 3.8, cittraj: 55, score: 88.7 },
  { name: "Dr. Lars Eriksson",   pubvel: 2.9, cittraj: 44, score: 84.3 },
  { name: "Dr. Yuna Kim",        pubvel: 0.9, cittraj: 89, score: 74.1 },
  { name: "Dr. Paulo Salave'a",  pubvel: 1.6, cittraj: 33, score: 73.8 },
  { name: "Dr. Mira Hoffman",    pubvel: 2.4, cittraj: 61, score: 83.2 },
  { name: "Dr. Tariq Hassan",    pubvel: 0.7, cittraj: 12, score: 62.4 },
  { name: "Dr. Ingrid Sorensen", pubvel: 3.3, cittraj: 49, score: 85.9 },
  { name: "Dr. David Osei",      pubvel: 1.2, cittraj: 27, score: 69.7 },
  { name: "Dr. Keiko Tanaka",    pubvel: 4.4, cittraj: 82, score: 93.1 },
];

// ─── Map Tab ─────────────────────────────────────────────────────────────────

interface MapTabProps {
  ta: string;
  mapInstanceRef: React.MutableRefObject<LeafletMap>;
  onCityPress: (city: string) => void;
}

function MapTab({ ta, mapInstanceRef, onCityPress }: MapTabProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const onCityPressRef = useRef(onCityPress);
  onCityPressRef.current = onCityPress;

  useEffect(() => {
    if (!mapRef.current) return;

    // Destroy any previous instance
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch (_) { /* ignore */ }
      mapInstanceRef.current = null;
    }

    const container = mapRef.current;

    // Delay init so the container has a painted, measured height
    const timer = setTimeout(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        if (!L || !container) return;

        const usBounds: [[number, number], [number, number]] = [[24.0, -125.0], [49.5, -66.0]];
        const map = L.map(container, {
          center: [38.5, -95.5],
          zoom: 5,
          zoomControl: false,
          attributionControl: false,
          maxBounds: usBounds,
          maxBoundsViscosity: 1.0,
        });
        mapInstanceRef.current = map;

        // Force Leaflet to recalculate container dimensions after mount
        map.invalidateSize();

        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 19,
        }).addTo(map);

        const markers = getMarkersForTA(ta);

        const latLngs = markers.map((m: CityMarker) => L.latLng(m.lat, m.lng));
        if (latLngs.length > 0) {
          map.fitBounds(L.latLngBounds(latLngs), { padding: [32, 32] });
        }

        // Delegate click on popup "Tap to explore" links
        container.addEventListener("click", (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          const cityEl = target.closest("[data-city]") as HTMLElement | null;
          if (cityEl) {
            const city = cityEl.getAttribute("data-city") ?? "";
            onCityPressRef.current(city);
          }
        });

        const isTablet = window.innerWidth >= 600;
        markers.forEach((m: CityMarker) => {
          const opacity = (m.avg / 100) * 0.85 + 0.15;
          const radius = markerRadius(m.count) * (isTablet ? 1.5 : 1);

          const circle = L.circleMarker([m.lat, m.lng], {
            radius,
            fillColor: "#E8A020",
            fillOpacity: opacity,
            color: "#FFFFFF",
            opacity: 0.2,
            weight: 0.5,
          }).addTo(map);

          // Purple outer ring for Dark Horse cities
          if (m.darkHorses) {
            L.circleMarker([m.lat, m.lng], {
              radius: radius + 4,
              fillColor: "transparent",
              fillOpacity: 0,
              color: "#9B6DFF",
              opacity: 0.6,
              weight: 2,
              interactive: false,
            }).addTo(map);
          }

          const darkHorseLine = m.darkHorses
            ? `<div style="font-size:11px;color:#9B6DFF;margin-top:4px;">♞ ${m.darkHorses} dark horses</div>`
            : "";

          const popupContent = `
            <div style="font-family:system-ui,-apple-system,sans-serif;min-width:180px;">
              <div style="font-size:13px;font-weight:500;color:#E8E6DF;">${m.city}</div>
              <div style="font-size:12px;font-family:monospace;color:#E8A020;margin-top:4px;">${m.count} rising stars</div>
              ${darkHorseLine}
              <div style="font-size:11px;color:#6B6A65;margin-top:4px;">Avg score ${m.avg.toFixed(1)}</div>
              <div style="font-size:11px;color:#9B9892;margin-top:4px;">Leading: ${m.top}</div>
              <div data-city="${m.city}" style="font-size:11px;color:#E8A020;margin-top:8px;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">Tap to explore →</div>
            </div>
          `;

          circle.bindPopup(popupContent, {
            closeButton: false,
            className: "fm-popup",
            maxWidth: window.innerWidth >= 600 ? 280 : 220,
          });
        });
      } catch (e) {
        console.error("Map init failed:", e);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) { /* ignore */ }
        mapInstanceRef.current = null;
      }
    };
  }, [ta]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        .fm-popup .leaflet-popup-content-wrapper {
          background: #111113 !important;
          border: 1px solid #E8A020 !important;
          border-radius: 4px !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .fm-popup .leaflet-popup-content {
          margin: 10px 12px !important;
        }
        .fm-popup .leaflet-popup-tip-container { display: none !important; }
        .leaflet-container { background: #0A0A0B; }
      `}</style>
      <div
        ref={mapRef}
        className="fm-map-container"
        style={{ height: "calc(100dvh - 140px)", width: "100%" }}
      />
    </>
  );
}

// ─── Momentum Tab ─────────────────────────────────────────────────────────────

function MomentumTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ name: string; score: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isTabletMomentum = W >= 600;

    const PAD = { left: 56, right: 24, top: 32, bottom: 56 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    ctx.fillStyle = "#0A0A0B";
    ctx.fillRect(0, 0, W, H);

    // Axes
    ctx.strokeStyle = "#6B6A65";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + plotH);
    ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
    ctx.stroke();

    // Axis tick marks
    ctx.strokeStyle = "#6B6A65";
    ctx.lineWidth = 1;
    // X ticks
    for (let v = 0; v <= 5; v++) {
      const x = PAD.left + (v / 5) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, PAD.top + plotH);
      ctx.lineTo(x, PAD.top + plotH + 4);
      ctx.stroke();
    }
    // Y ticks
    for (let v = 0; v <= 100; v += 25) {
      const y = PAD.top + plotH - (v / 100) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left - 4, y);
      ctx.lineTo(PAD.left, y);
      ctx.stroke();
    }

    // Quadrant dividers
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "#2A2A2E";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left + plotW / 2, PAD.top);
    ctx.lineTo(PAD.left + plotW / 2, PAD.top + plotH);
    ctx.moveTo(PAD.left, PAD.top + plotH / 2);
    ctx.lineTo(PAD.left + plotW, PAD.top + plotH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "#9B9892";
    ctx.font = `500 ${isTabletMomentum ? 14 : 12}px monospace`;
    ctx.textAlign = "center";
    // X tick labels
    for (let v = 0; v <= 5; v++) {
      const x = PAD.left + (v / 5) * plotW;
      ctx.fillText(`${v}x`, x, PAD.top + plotH + 18);
    }
    // Y tick labels
    ctx.textAlign = "right";
    for (let v = 0; v <= 100; v += 25) {
      const y = PAD.top + plotH - (v / 100) * plotH;
      ctx.fillText(`+${v}%`, PAD.left - 8, y + 4);
    }

    // X axis title
    ctx.fillStyle = "#E8E6DF";
    ctx.font = "500 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Publication velocity", PAD.left + plotW / 2, PAD.top + plotH + 38);

    // Y axis title (rotated)
    ctx.save();
    ctx.translate(14, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#E8E6DF";
    ctx.font = "500 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Citation trajectory", 0, 0);
    ctx.restore();

    // Quadrant labels
    const ql = [
      { text: "Platinum tier",  x: PAD.left + plotW * 0.75, y: PAD.top + plotH * 0.22, color: "#E8A020" },
      { text: "High visibility",x: PAD.left + plotW * 0.25, y: PAD.top + plotH * 0.22, color: "#6B6A65" },
      { text: "High output",    x: PAD.left + plotW * 0.75, y: PAD.top + plotH * 0.78, color: "#6B6A65" },
      { text: "Emerging",       x: PAD.left + plotW * 0.25, y: PAD.top + plotH * 0.78, color: "#6B6A65" },
    ];
    ctx.font = "13px system-ui";
    ctx.globalAlpha = 0.6;
    ql.forEach(({ text, x, y, color }) => {
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    });
    ctx.globalAlpha = 1;

    // Dots + last name labels
    const sorted = [...RARE_DISEASE_POINTS].sort((a, b) => b.score - a.score);
    const top20pct = sorted[Math.floor(sorted.length * 0.2)].score;
    const top50pct = sorted[Math.floor(sorted.length * 0.5)].score;

    RARE_DISEASE_POINTS.forEach((p) => {
      const x = PAD.left + (p.pubvel / 5) * plotW;
      const y = PAD.top + plotH - (p.cittraj / 100) * plotH;
      const color = p.score >= top20pct ? "#E8A020" : p.score >= top50pct ? "#5DCAA5" : "#444441";

      ctx.globalAlpha = 0.8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, isTabletMomentum ? 12 : 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Last name label — left-anchored unless in right 20% of canvas
      const lastName = p.name.split(" ").pop() ?? "";
      ctx.font = `500 ${isTabletMomentum ? 13 : 11}px monospace`;
      ctx.fillStyle = "#B8B4AC";
      ctx.globalAlpha = 1;
      const dotR = isTabletMomentum ? 12 : 10;
      const inRightZone = x > PAD.left + plotW * 0.8;
      if (inRightZone) {
        ctx.textAlign = "right";
        ctx.fillText(lastName, x - dotR - 4, y + 4);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(lastName, x + dotR + 4, y + 4);
      }
    });

    // Store computed dot positions for tap detection
    (canvas as HTMLCanvasElement & { _points?: typeof RARE_DISEASE_POINTS & { cx: number; cy: number }[] })._points =
      RARE_DISEASE_POINTS.map((p) => ({
        ...p,
        cx: PAD.left + (p.pubvel / 5) * plotW,
        cy: PAD.top + plotH - (p.cittraj / 100) * plotH,
      })) as typeof RARE_DISEASE_POINTS & { cx: number; cy: number }[];
  }, []);

  function handleCanvasTap(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const points = (canvas as HTMLCanvasElement & { _points?: Array<HCPPoint & { cx: number; cy: number }> })._points;
    if (!points) return;

    const hitRadius = canvasRef.current && canvasRef.current.clientWidth >= 600 ? 16 : 14;
    const hit = points.find((p) => Math.hypot(p.cx - x, p.cy - y) <= hitRadius);
    if (hit) {
      setTooltip({ name: hit.name, score: hit.score, x: hit.cx, y: hit.cy });
    } else {
      setTooltip(null);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", height: "calc(100dvh - 200px)", width: "100%", backgroundColor: "#0A0A0B" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
        onClick={handleCanvasTap}
        onTouchStart={handleCanvasTap}
      />
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y - 52,
            transform: "translateX(-50%)",
            backgroundColor: "#1A1A1E",
            border: "1px solid #E8A020",
            borderRadius: 3,
            padding: "6px 10px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: "#E8E6DF" }}>{tooltip.name}</span>
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "#E8A020", marginLeft: 6 }}>
            · {tooltip.score.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Summary Tab ─────────────────────────────────────────────────────────────

function SummaryTab({ ta, indication }: { ta: string; indication: string }) {
  const insightText = indication !== "All"
    ? `${indication} rising star velocity increased 23% in the last 6 months. Specialists are rapidly advancing research in this sub-indication.`
    : `${ta} rising star velocity increased 23% in the last 6 months. Lysosomal storage disorders and gene therapy are driving the acceleration.`;

  const STATS = [
    { label: "Total researchers", value: "847" },
    { label: "Avg rising star score", value: "74.2" },
    { label: "Avg career age", value: "6.4 yrs" },
    { label: "Active trials", value: "312" },
  ];

  const INSTITUTIONS = [
    { name: "Boston Children's Hospital", count: 34 },
    { name: "Johns Hopkins Hospital", count: 28 },
    { name: "Mayo Clinic", count: 24 },
    { name: "UCSF", count: 21 },
    { name: "Columbia Medical Center", count: 19 },
  ];

  const JOURNALS = [
    { name: "NEJM", count: 127 },
    { name: "Nature Medicine", count: 94 },
    { name: "Lancet", count: 88 },
    { name: "Blood", count: 76 },
    { name: "JIMD", count: 61 },
  ];

  const DIST = [
    { range: "90–100", pct: 15, count: 127 },
    { range: "80–89",  pct: 28, count: 238 },
    { range: "70–79",  pct: 35, count: 297 },
    { range: "60–69",  pct: 16, count: 136 },
    { range: "Below 60", pct: 6, count: 49 },
  ];

  return (
    <div style={{ overflowY: "auto", height: "calc(100dvh - 140px)", padding: "16px 16px 0" }}>
      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {STATS.map(({ label, value }) => (
          <div
            key={label}
            style={{
              backgroundColor: "#111113",
              border: "1px solid #1E1E22",
              borderRadius: 4,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65" }}>
              {label}
            </div>
            <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 500, color: "#E8E6DF", marginTop: 4 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Dark Horse stat card — full width below grid */}
      <div
        style={{
          backgroundColor: "#0D0A1A",
          border: "1px solid #9B6DFF",
          borderRadius: 4,
          padding: 12,
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9B6DFF" }}>
            DARK HORSES
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ fontSize: 16, color: "#9B6DFF" }}>♞</span>
            <span style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 500, color: "#9B6DFF" }}>47</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#6B6A65", textAlign: "right", maxWidth: 120 }}>
          top 8% of<br />rising stars
        </div>
      </div>

      <div className="fm-summary-lists" style={{ marginTop: 16 }}>
      {/* Top institutions */}
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 12 }}>
          Top institutions
        </div>
        {INSTITUTIONS.map(({ name, count }, i) => (
          <div
            key={name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 10,
              marginBottom: 10,
              borderBottom: i < INSTITUTIONS.length - 1 ? "1px solid #1E1E22" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#3A3A3F", minWidth: 20 }}>{i + 1}</span>
              <span style={{ fontSize: 13, color: "#E8E6DF", marginLeft: 8 }}>{name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#E8A020" }}>{count}</span>
              <span style={{ fontSize: 10, color: "#6B6A65" }}>researchers</span>
            </div>
          </div>
        ))}
      </div>

      {/* Top journals */}
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 12 }}>
          Top journals by HCP output
        </div>
        {JOURNALS.map(({ name, count }, i) => (
          <div
            key={name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 10,
              marginBottom: 10,
              borderBottom: i < JOURNALS.length - 1 ? "1px solid #1E1E22" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#3A3A3F", minWidth: 20 }}>{i + 1}</span>
              <span style={{ fontSize: 13, color: "#E8E6DF", marginLeft: 8 }}>{name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 12, fontFamily: "monospace", color: "#E8A020" }}>{count}</span>
              <span style={{ fontSize: 10, color: "#6B6A65" }}>papers</span>
            </div>
          </div>
        ))}
      </div>
      </div>{/* end fm-summary-lists */}

      {/* Score distribution */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 12 }}>
          Score distribution
        </div>
        {DIST.map(({ range, pct, count }) => (
          <div key={range} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#6B6A65", minWidth: 64 }}>{range}</span>
            <div className="fm-summary-dist-bar" style={{ flex: 1, height: 6, backgroundColor: "#1E1E22" }}>
              <div style={{ height: "100%", backgroundColor: "#E8A020", width: `${pct}%` }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#E8A020", minWidth: 32, textAlign: "right" }}>
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Rising trend */}
      <div style={{ marginTop: 16, marginBottom: 32 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 8 }}>
          Field momentum
        </div>
        <div
          style={{
            backgroundColor: "#0A1F16",
            border: "1px solid #1D9E75",
            borderRadius: 4,
            padding: 12,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#1D9E75", flexShrink: 0, marginTop: 5 }}
          />
          <span style={{ fontSize: 12, color: "#1D9E75", lineHeight: 1.5 }}>{insightText}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandscapeScreen({ ta, indication, onBack, onCityPress }: LandscapeScreenProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Map");
  const mapInstanceRef = useRef<LeafletMap>(null);

  const contextLabel = indication !== "All" ? `${ta} · ${indication}` : ta;
  const TABS: Tab[] = ["Map", "Momentum", "Summary"];

  function handleTabSelect(tab: Tab) {
    setActiveTab(tab);
    if (tab === "Map") {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 50);
    }
  }

  return (
    <div
      className="fm-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: 4,
          }}
        >
          <BackArrow />
          <span style={{ fontSize: 13, color: "#6B6A65" }}>{contextLabel}</span>
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #1E1E22",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabSelect(tab)}
            style={{
              flex: 1,
              height: 44,
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #E8A020" : "2px solid transparent",
              fontSize: 13,
              color: activeTab === tab ? "#E8A020" : "#6B6A65",
              cursor: "pointer",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Map" && <MapTab ta={ta} mapInstanceRef={mapInstanceRef} onCityPress={(city) => onCityPress(city, ta)} />}
      {activeTab === "Momentum" && <MomentumTab />}
      {activeTab === "Summary" && <SummaryTab ta={ta} indication={indication} />}
    </div>
  );
}
