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

const SUB_COLOR: Record<string, string> = {
  "General Dermatology": "#8b93a7",
  "Pediatric Dermatology": "#e0a52e", // gold — the AD-critical one
  "MOHS Surgery": "#6f9dc4",
  "Dermatopathology": "#9d7fc4",
  "Procedural": "#6fb0a0",
  "Dermatological Immunology": "#c47f9d",
};

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
          <Search size={15} color="#6b7280" style={{ position: "absolute", left: 12, top: 11 }} />
          <input
            style={S.search}
            placeholder="Search dermatologists by name or city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <X size={15} color="#6b7280" style={{ position: "absolute", right: 12, top: 11, cursor: "pointer" }} onClick={() => setQuery("")} />
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
            <span style={{ ...S.dot, background: adOnly ? "#e0a52e" : "#3a4152" }} />
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
  const subColor = SUB_COLOR[r.sub] || "#8b93a7";
  return (
    <div style={S.card}>
      <div style={S.cardTop}>
        <div>
          <div style={S.name}>
            {r.first} {r.last}, <span style={S.cred}>{r.cred}</span>
          </div>
          <div style={S.loc}>
            <MapPin size={11} color="#6b7280" style={{ flexShrink: 0 }} />
            <span>{r.city}, {r.state}</span>
          </div>
        </div>
        <div style={{ ...S.subBadge, color: subColor, borderColor: subColor + "55", background: subColor + "14" }}>
          {SUB_ABBR[r.sub]}
        </div>
      </div>

      {/* engagement strip */}
      <div style={S.engRow}>
        <div style={S.engCell}>
          <div style={S.engLabel}>OPEN PAYMENTS (3YR)</div>
          <div style={S.engVal}>{money(r.total)}</div>
        </div>
        <div style={{ ...S.engCell, ...S.engAd }}>
          <div style={S.engLabel}>AD-DRUG $</div>
          <div style={{ ...S.engVal, color: r.adTotal > 0 ? "#e0a52e" : "#4b5262" }}>{money(r.adTotal)}</div>
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
  root: { background: "#0a0d14", color: "#e6e9ef", fontFamily: "'Inter', system-ui, sans-serif", padding: "0 0 40px" },

  searchRow: { display: "flex", justifyContent: "center", padding: "14px 22px 0" },
  searchWrap: { position: "relative", flex: 1, maxWidth: 520 },
  search: { width: "100%", background: "#11151e", border: "1px solid #222835", borderRadius: 8, padding: "9px 34px", color: "#e6e9ef", fontSize: 13.5, outline: "none", boxSizing: "border-box" },

  headerLine: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "22px 24px 12px", maxWidth: 1180, margin: "0 auto" },
  h1: { fontSize: 20, fontWeight: 700 },
  subtitle: { color: "#6b7280", fontSize: 12.5, marginTop: 4 },
  filterBtn: { display: "flex", alignItems: "center", gap: 6, background: "#11151e", border: "1px solid #222835", color: "#c4cad6", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" },

  filterBar: { display: "flex", alignItems: "center", gap: 10, padding: "6px 24px 14px", maxWidth: 1180, margin: "0 auto", flexWrap: "wrap" },
  dd: { background: "#11151e", border: "1px solid #222835", color: "#c4cad6", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer" },
  ddActive: { borderColor: "#e0a52e77", color: "#e6e9ef" },
  ddLabel: { color: "#6b7280", marginRight: 3 },
  ddMenu: { position: "absolute", top: "110%", left: 0, background: "#11151e", border: "1px solid #2a3140", borderRadius: 8, padding: 5, zIndex: 20, minWidth: 170, maxHeight: 280, overflowY: "auto", boxShadow: "0 10px 30px rgba(0,0,0,.5)" },
  ddItem: { padding: "7px 10px", fontSize: 12.5, color: "#c4cad6", borderRadius: 6, cursor: "pointer" },
  ddItemActive: { background: "#1c2230", color: "#e0a52e" },

  toggle: { display: "flex", alignItems: "center", gap: 7, background: "#11151e", border: "1px solid #222835", color: "#8b93a7", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer" },
  toggleOn: { borderColor: "#e0a52e77", color: "#e6e9ef" },
  dot: { width: 8, height: 8, borderRadius: "50%" },

  sortWrap: { display: "flex", alignItems: "center", gap: 10 },
  sortLabel: { color: "#4b5262", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".5px" },
  sortActive: { color: "#e0a52e", fontSize: 12.5, cursor: "pointer", fontWeight: 600 },
  sortDim: { color: "#6b7280", fontSize: 12.5, cursor: "pointer" },

  countLine: { padding: "2px 24px 14px", maxWidth: 1180, margin: "0 auto", fontSize: 13, color: "#8b93a7" },
  countStrong: { color: "#e6e9ef", fontWeight: 700 },
  countDim: { color: "#6b7280" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, padding: "0 24px", maxWidth: 1180, margin: "0 auto" },

  card: { background: "#0e121b", border: "1px solid #1a202c", borderRadius: 10, padding: "14px 15px" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  name: { fontSize: 15, fontWeight: 700, color: "#f0f2f6" },
  cred: { fontSize: 12, fontWeight: 500, color: "#8b93a7" },
  loc: { fontSize: 12, color: "#8b93a7", marginTop: 3, display: "flex", alignItems: "center", gap: 4 },
  subBadge: { fontSize: 10, fontWeight: 700, letterSpacing: ".5px", padding: "3px 7px", borderRadius: 5, border: "1px solid", whiteSpace: "nowrap" },

  kolBadge: { display: "inline-flex", alignItems: "center", fontSize: 10.5, color: "#5aa9bd", background: "#4b9db014", border: "1px solid #4b9db044", borderRadius: 5, padding: "2px 7px", cursor: "pointer" },

  engRow: { display: "flex", gap: 7, marginTop: 12 },
  engCell: { flex: 1, background: "#0a0d14", border: "1px solid #171c26", borderRadius: 7, padding: "8px 9px" },
  engAd: { borderColor: "#e0a52e22" },
  engLabel: { fontSize: 9, color: "#5b6373", letterSpacing: ".6px", fontWeight: 600 },
  engVal: { fontSize: 15, fontWeight: 700, marginTop: 2, color: "#e6e9ef" },
  engValSm: { fontSize: 12, fontWeight: 600, marginTop: 3, color: "#c4cad6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  cardBottom: { display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" },
  tenure: { fontSize: 11, color: "#6b7280" },
  tag: { fontSize: 10.5, color: "#8b93a7", border: "1px solid #222835", borderRadius: 5, padding: "2px 7px" },
  drugTags: { display: "flex", gap: 5, marginLeft: "auto", flexWrap: "wrap" },
  drugTag: { fontSize: 10, color: "#c9b06a", background: "#e0a52e0f", border: "1px solid #e0a52e2a", borderRadius: 4, padding: "2px 6px" },

  moreLine: { textAlign: "center", color: "#6b7280", fontSize: 12.5, padding: "20px 0", maxWidth: 1180, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 14 },
  loadMoreBtn: { background: "#11151e", border: "1px solid #e0a52e55", color: "#e0a52e", borderRadius: 8, padding: "8px 18px", fontSize: 12.5, cursor: "pointer" },
  empty: { textAlign: "center", color: "#6b7280", fontSize: 13.5, padding: "50px 0" },
};
