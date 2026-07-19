import { useState, useEffect, useCallback, useRef } from "react";
import { Search, SlidersHorizontal, MapPin, Award, ChevronDown, X } from "lucide-react";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// FieldMark Community Explorer — a DIRECTORY, not a leaderboard.
// Server-side filtered/paginated over community_practitioners (base) LEFT JOIN
// community_practitioner_payments, via get_community_directory_filtered(_count).
// Chrome (topbar / TA tabs / cohort tabs) is provided by the app shell; this
// renders the directory body only. Layout/styling/filters/sort/colors preserved
// from the prototype.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 60;

// Real primary_taxonomy_label -> friendly display name.
const SUB_LABEL: Record<string, string> = {
  "Dermatology": "General Dermatology",
  "Dermatology, Procedural": "Procedural",
  "Dermatology, MOHS-Micrographic Surgery": "MOHS Surgery",
  "Dermatopathology": "Dermatopathology",
  "Pediatric Dermatology": "Pediatric Dermatology",
  "Clinical & Laboratory Dermatological Immunology": "Dermatological Immunology",
};
// Friendly -> real (for the p_taxonomy_label RPC param).
const SUB_LABEL_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(SUB_LABEL).map(([real, friendly]) => [friendly, real]),
);
const SUBSPECIALTIES = Object.values(SUB_LABEL);

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR",
];

// Manufacturer display cleanup — raw names are messy ("ABBVIE INC.", "Sanofi
// and Genzyme US Companies"). First matching pattern wins; unmapped -> Title Case.
const MFR_DISPLAY: Array<[RegExp, string]> = [
  [/abbvie/i, "AbbVie"],
  [/sanofi|genzyme/i, "Sanofi"],
  [/regeneron/i, "Regeneron"],
  [/eli lilly|\blilly\b/i, "Lilly"],
  [/pfizer/i, "Pfizer"],
  [/incyte/i, "Incyte"],
  [/\bleo\b/i, "Leo Pharma"],
  [/arcutis/i, "Arcutis"],
  [/dermavant/i, "Dermavant"],
  [/genentech|roche/i, "Genentech"],
  [/bristol|myers squibb/i, "Bristol Myers Squibb"],
  [/novartis/i, "Novartis"],
  [/amgen/i, "Amgen"],
  [/\bucb\b/i, "UCB"],
  [/galderma/i, "Galderma"],
  [/janssen|johnson/i, "Janssen"],
];

const DRUG_DISPLAY: Record<string, string> = {
  dupixent: "Dupixent", rinvoq: "Rinvoq", opzelura: "Opzelura", vtama: "Vtama",
  cibinqo: "Cibinqo", zoryve: "Zoryve", adbry: "Adbry", ebglyss: "Ebglyss",
  eucrisa: "Eucrisa", olumiant: "Olumiant", adbrylada: "Adbry",
};

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+(Inc|Llc|Ltd|Co|Corp|Us|Companies|And)\b\.?/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanManufacturer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [rx, disp] of MFR_DISPLAY) if (rx.test(raw)) return disp;
  return titleCase(raw) || null;
}

function cleanDrug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  if (DRUG_DISPLAY[key]) return DRUG_DISPLAY[key];
  return titleCase(raw) || null;
}

function money(n: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const SUB_ABBR: Record<string, string> = {
  "General Dermatology": "GEN",
  "Pediatric Dermatology": "PEDS",
  "MOHS Surgery": "MOHS",
  "Dermatopathology": "PATH",
  "Procedural": "PROC",
  "Dermatological Immunology": "IMMUN",
};

// Local app-palette constant. FieldMark has no shared design-token module yet
// (only data-specific palettes like themeHeatPalette / insightCategories), so the
// app's convention is inline hex repeated per component (HCPCard, AppLayout,
// ScoreKpiTile, StatPillWithTooltip…). This mirrors those exact values so the
// Community directory matches the Rising/Established surfaces and is themed from
// one place. Extracting a shared lib/uiTokens.ts is deliberate future work — see
// the design-token debt note — not smuggled in via this one screen.
const C = {
  bg: "#0A0A0B", // app root background
  card: "#111113", // card surface (HCPCard container)
  tile: "#0F0F0F", // inner stat-tile surface (ScoreKpiTile)
  tileBorder: "#2A2A2A", // inner stat-tile border (ScoreKpiTile)
  border: "#1E1E22", // standard divider/border
  text: "#E8E6DF", // primary text
  muted: "#9B9892", // secondary text
  dim: "#6B6A65", // labels / tertiary text
  faint: "#3A3A3F", // faintest
  accent: "#E8A020", // brand amber — values + active states
  accentBg: "rgba(232,160,32,0.10)",
  accentBorder: "rgba(232,160,32,0.40)",
  teal: "#4ECDC4", // secondary signal (KOL badge), from the app cohort palette
  tealBg: "rgba(78,205,196,0.08)",
  tealBorder: "rgba(78,205,196,0.30)",
  mono: "monospace",
  sans: "system-ui, -apple-system, sans-serif",
} as const;

interface PaymentEntry {
  name?: string;
  amount?: number;
}

interface DirRow {
  npi_number: string;
  first_name: string;
  last_name: string;
  credentials: string | null;
  practice_city: string | null;
  practice_state: string | null;
  primary_taxonomy_label: string | null;
  is_sole_proprietor: boolean | null;
  career_stage_years: number | null;
  matched_hcp_id: string | null;
  is_published_kol: boolean | null;
  total_payments_3yr: number | string | null;
  ad_drug_payments_3yr: number | string | null;
  top_manufacturers: PaymentEntry[] | null;
  top_drugs: PaymentEntry[] | null;
}

interface DermRecord {
  key: string;
  first: string;
  last: string;
  cred: string;
  city: string;
  state: string;
  sub: string;
  setting: string;
  soleProprietor: boolean;
  tenure: number | null;
  total: number;
  adTotal: number;
  topMfr: string | null;
  adDrugs: string[];
  isKOL: boolean;
}

// NPPES stores names in ALL CAPS; render in natural case. Capitalizes the first
// letter after start / space / apostrophe / hyphen (O'Brien, Smith-Jones).
function nameCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

function mapRow(r: DirRow): DermRecord {
  const drugs = (r.top_drugs ?? [])
    .slice(0, 3)
    .map((d) => cleanDrug(d?.name))
    .filter((d): d is string => !!d);
  return {
    key: r.npi_number,
    first: nameCase(r.first_name ?? ""),
    last: nameCase(r.last_name ?? ""),
    cred: r.credentials ?? "MD",
    city: nameCase(r.practice_city ?? "—"),
    state: r.practice_state ?? "—",
    sub: SUB_LABEL[r.primary_taxonomy_label ?? ""] ?? "General Dermatology",
    setting: r.is_sole_proprietor ? "Solo Practice" : "Group Practice",
    soleProprietor: !!r.is_sole_proprietor,
    tenure: r.career_stage_years,
    total: Number(r.total_payments_3yr ?? 0),
    adTotal: Number(r.ad_drug_payments_3yr ?? 0),
    topMfr: cleanManufacturer(r.top_manufacturers?.[0]?.name ?? null),
    adDrugs: drugs,
    isKOL: r.is_published_kol ?? r.matched_hcp_id != null,
  };
}

type SortKey = "ad" | "total" | "tenure" | "name";

export default function CommunityExplorer({ taLabel = "Atopic Dermatitis" }: { taLabel?: string }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [state, setState] = useState("All");
  const [sub, setSub] = useState("All");
  const [adOnly, setAdOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("ad");
  const [showFilters, setShowFilters] = useState(true);

  const [rows, setRows] = useState<DermRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [adCount, setAdCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);
  const reqIdRef = useRef(0);

  // Debounce the search input (~300ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const rpcParams = useCallback(
    (offset: number) => ({
      p_state: state === "All" ? null : state,
      p_taxonomy_label: sub === "All" ? null : SUB_LABEL_REVERSE[sub] ?? null,
      p_ad_only: adOnly,
      p_search: debouncedQuery === "" ? null : debouncedQuery,
      p_sort: sortBy,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    }),
    [state, sub, adOnly, debouncedQuery, sortBy],
  );

  // Refetch page 0 + counts whenever a filter/sort/search changes.
  useEffect(() => {
    const reqId = ++reqIdRef.current;
    offsetRef.current = 0;
    setLoading(true);
    const countFilters = {
      p_state: state === "All" ? null : state,
      p_taxonomy_label: sub === "All" ? null : SUB_LABEL_REVERSE[sub] ?? null,
      p_search: debouncedQuery === "" ? null : debouncedQuery,
    };
    void Promise.all([
      supabase.rpc("get_community_directory_filtered", rpcParams(0)),
      supabase.rpc("get_community_directory_filtered_count", { ...countFilters, p_ad_only: adOnly }),
      supabase.rpc("get_community_directory_filtered_count", { ...countFilters, p_ad_only: true }),
    ]).then(([rowsRes, totalRes, adRes]) => {
      if (reqId !== reqIdRef.current) return; // stale response guard
      if (rowsRes.error) console.error("community directory rows:", rowsRes.error.message);
      if (totalRes.error) console.error("community directory count:", totalRes.error.message);
      setRows(((rowsRes.data ?? []) as DirRow[]).map(mapRow));
      setTotal((totalRes.data as number) ?? 0);
      setAdCount((adRes.data as number) ?? 0);
      setLoading(false);
    });
  }, [state, sub, adOnly, debouncedQuery, sortBy, rpcParams]);

  const loadMore = useCallback(() => {
    const reqId = reqIdRef.current;
    const nextOffset = offsetRef.current + PAGE_SIZE;
    setLoadingMore(true);
    void supabase
      .rpc("get_community_directory_filtered", rpcParams(nextOffset))
      .then((res) => {
        if (reqId !== reqIdRef.current) return;
        if (res.error) console.error("community directory load-more:", res.error.message);
        offsetRef.current = nextOffset;
        setRows((prev) => [...prev, ...((res.data ?? []) as DirRow[]).map(mapRow)]);
        setLoadingMore(false);
      });
  }, [rpcParams]);

  const states = ["All", ...US_STATES];

  return (
    <div style={S.root}>
      {/* search row */}
      <div style={S.searchRow}>
        <div style={S.searchWrap}>
          <Search size={15} color={C.dim} style={{ position: "absolute", left: 12, top: 11 }} />
          <input
            style={S.search}
            placeholder="Search dermatologists by name or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <X size={15} color={C.dim} style={{ position: "absolute", right: 12, top: 11, cursor: "pointer" }} onClick={() => setQuery("")} />
          )}
        </div>
      </div>

      {/* header line — deliberately says DIRECTORY, not ranking */}
      <div style={S.headerLine}>
        <div>
          <div style={S.h1}>{taLabel} — Community</div>
          <div style={S.subtitle}>
            Directory of {total.toLocaleString()} U.S. dermatologists · search and filter · not a ranking
          </div>
        </div>
        <button style={S.filterBtn} onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal size={14} /> Filters
        </button>
      </div>

      {/* filter bar */}
      {showFilters && (
        <div style={S.filterBar}>
          <Dropdown label="State" value={state} setValue={setState} options={states} />
          <Dropdown label="Subspecialty" value={sub} setValue={setSub} options={["All", ...SUBSPECIALTIES]} />
          <button
            style={{ ...S.toggle, ...(adOnly ? S.toggleOn : {}) }}
            onClick={() => setAdOnly((v) => !v)}
          >
            <span style={{ ...S.dot, background: adOnly ? C.accent : C.faint }} />
            AD-drug engagement
          </button>
          <div style={{ flex: 1 }} />
          <div style={S.sortWrap}>
            <span style={S.sortLabel}>Sort</span>
            {([["ad", "AD $"], ["total", "Total $"], ["tenure", "Tenure"], ["name", "Name"]] as Array<[SortKey, string]>).map(([k, l]) => (
              <span key={k} style={sortBy === k ? S.sortActive : S.sortDim} onClick={() => setSortBy(k)}>{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* result count */}
      <div style={S.countLine}>
        <span style={S.countStrong}>{total.toLocaleString()}</span> dermatologists
        {state !== "All" && <> in <span style={S.countStrong}>{state}</span></>}
        {sub !== "All" && <> · {sub}</>}
        <span style={S.countDim}> · {adCount.toLocaleString()} with AD-drug engagement</span>
      </div>

      {/* directory grid */}
      {loading ? (
        <div style={S.empty}>Loading directory…</div>
      ) : (
        <>
          <div style={S.grid}>
            {rows.map((r) => (
              <DermCard key={r.key} r={r} />
            ))}
          </div>
          {rows.length === 0 && (
            <div style={S.empty}>No dermatologists match these filters. Clear one to widen the search.</div>
          )}
          {rows.length > 0 && rows.length < total && (
            <div style={S.moreLine}>
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
              <button style={S.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DermCard({ r }: { r: DermRecord }) {
  return (
    <div style={S.card}>
      <div style={S.cardTop}>
        <div>
          <div style={S.name}>
            {r.first} {r.last}, <span style={S.cred}>{r.cred}</span>
          </div>
          <div style={S.loc}>
            <MapPin size={11} color={C.dim} style={{ flexShrink: 0 }} />
            <span>{r.city}, {r.state}</span>
          </div>
        </div>
        <div style={S.subBadge}>{SUB_ABBR[r.sub]}</div>
      </div>

      {/* engagement strip */}
      <div style={S.engRow}>
        <div style={S.engCell}>
          <div style={S.engLabel}>OPEN PAYMENTS (3YR)</div>
          <div style={S.engVal}>{money(r.total)}</div>
        </div>
        <div style={S.engCell}>
          <div style={S.engLabel}>AD-DRUG $</div>
          <div style={{ ...S.engVal, color: r.adTotal > 0 ? C.accent : C.dim }}>{money(r.adTotal)}</div>
        </div>
        <div style={S.engCell}>
          <div style={S.engLabel}>TOP MFR</div>
          <div style={S.engValSm}>{r.topMfr || "—"}</div>
        </div>
      </div>

      <div style={S.cardBottom}>
        <span style={S.tenure}>{r.tenure != null ? `${r.tenure} yrs practicing` : "Tenure n/a"}</span>
        {r.isKOL && (
          <span style={S.kolBadge}>
            <Award size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} />
            Published KOL
          </span>
        )}
        {r.soleProprietor && <span style={S.tag}>Sole proprietor</span>}
        {r.adDrugs.length > 0 && (
          <span style={S.drugTags}>
            {r.adDrugs.map((d) => (
              <span key={d} style={S.drugTag}>{d}</span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function Dropdown({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button style={{ ...S.dd, ...(value !== "All" ? S.ddActive : {}) }} onClick={() => setOpen((v) => !v)}>
        <span style={S.ddLabel}>{label}:</span> {value}
        <ChevronDown size={13} style={{ marginLeft: 4, verticalAlign: "-2px" }} />
      </button>
      {open && (
        <div style={S.ddMenu}>
          {options.map((o) => (
            <div
              key={o}
              style={{ ...S.ddItem, ...(o === value ? S.ddItemActive : {}) }}
              onClick={() => { setValue(o); setOpen(false); }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { background: C.bg, color: C.text, fontFamily: C.sans, padding: "0 0 40px" },

  searchRow: { display: "flex", justifyContent: "center", padding: "14px 22px 0" },
  searchWrap: { position: "relative", flex: 1, maxWidth: 520 },
  search: { width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "9px 34px", color: C.text, fontSize: 13.5, outline: "none", boxSizing: "border-box", fontFamily: C.sans },

  headerLine: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "22px 24px 12px", maxWidth: 1180, margin: "0 auto" },
  h1: { fontSize: 20, fontWeight: 600, color: C.text },
  subtitle: { color: C.dim, fontSize: 12.5, marginTop: 4 },
  filterBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border}`, color: C.dim, borderRadius: 3, padding: "7px 12px", fontSize: 11.5, cursor: "pointer", fontFamily: C.sans },

  filterBar: { display: "flex", alignItems: "center", gap: 10, padding: "6px 24px 14px", maxWidth: 1180, margin: "0 auto", flexWrap: "wrap" },
  dd: { background: C.card, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 3, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: C.sans },
  ddActive: { borderColor: C.accent, color: C.text },
  ddLabel: { color: C.dim, marginRight: 3 },
  ddMenu: { position: "absolute", top: "110%", left: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: 5, zIndex: 20, minWidth: 170, maxHeight: 280, overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,.5)" },
  ddItem: { padding: "7px 10px", fontSize: 12, color: C.muted, borderRadius: 3, cursor: "pointer" },
  ddItemActive: { background: C.accentBg, color: C.accent },

  toggle: { display: "flex", alignItems: "center", gap: 7, background: C.card, border: `1px solid ${C.border}`, color: C.muted, borderRadius: 3, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: C.sans },
  toggleOn: { borderColor: C.accent, color: C.text },
  dot: { width: 8, height: 8, borderRadius: "50%" },

  sortWrap: { display: "flex", alignItems: "center", gap: 10 },
  sortLabel: { color: C.dim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" },
  sortActive: { color: C.accent, fontSize: 12, cursor: "pointer", fontWeight: 600 },
  sortDim: { color: C.muted, fontSize: 12, cursor: "pointer" },

  countLine: { padding: "2px 24px 14px", maxWidth: 1180, margin: "0 auto", fontSize: 13, color: C.muted },
  countStrong: { color: C.text, fontWeight: 600 },
  countDim: { color: C.dim },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, padding: "0 24px", maxWidth: 1180, margin: "0 auto" },

  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "14px 15px" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  name: { fontSize: 15, fontWeight: 600, color: C.text },
  cred: { fontSize: 12, fontWeight: 500, color: C.muted },
  loc: { fontSize: 12, color: C.muted, marginTop: 3, display: "flex", alignItems: "center", gap: 4 },
  subBadge: { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 7px", borderRadius: 3, border: `1px solid ${C.border}`, background: C.tile, color: C.muted, whiteSpace: "nowrap" },

  kolBadge: { display: "inline-flex", alignItems: "center", fontSize: 10.5, color: C.teal, background: C.tealBg, border: `1px solid ${C.tealBorder}`, borderRadius: 3, padding: "2px 7px" },

  engRow: { display: "flex", gap: 7, marginTop: 12 },
  engCell: { flex: 1, background: C.tile, border: `1px solid ${C.tileBorder}`, borderRadius: 4, padding: "8px 9px" },
  engLabel: { fontSize: 10, color: C.dim, letterSpacing: "0.06em", fontWeight: 500, textTransform: "uppercase" },
  engVal: { fontSize: 15, fontWeight: 600, marginTop: 3, color: C.text, fontFamily: C.mono },
  engValSm: { fontSize: 12, fontWeight: 500, marginTop: 4, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  cardBottom: { display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" },
  tenure: { fontSize: 11, color: C.dim },
  tag: { fontSize: 10.5, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 7px" },
  drugTags: { display: "flex", gap: 5, marginLeft: "auto", flexWrap: "wrap" },
  drugTag: { fontSize: 10, color: C.accent, background: C.accentBg, border: `1px solid ${C.accentBorder}`, borderRadius: 3, padding: "2px 6px", fontFamily: C.mono },

  moreLine: { textAlign: "center", color: C.dim, fontSize: 12.5, padding: "20px 0", maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 },
  loadMoreBtn: { background: C.card, border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 3, padding: "8px 18px", fontSize: 12.5, cursor: "pointer", fontFamily: C.sans },
  empty: { textAlign: "center", color: C.dim, fontSize: 13.5, padding: "50px 0" },
};
