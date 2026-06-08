import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getInstitutionsIndex, type InstitutionIndexEntry } from "../lib/api";
import GlobalFooter from "./GlobalFooter";

export default function InstitutionsIndexRoute() {
  const { ta } = useParams<{ ta: string }>();
  const navigate = useNavigate();
  const taSlug = ta ?? "nsclc";

  const [entries, setEntries] = useState<InstitutionIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("rising_star_count");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getInstitutionsIndex(taSlug)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taSlug]);

  function handleSort(column: string) {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection(
        column === "institution_name" || column === "top_rising_star_rank" ? "asc" : "desc",
      );
    }
  }

  function sortedEntries(): InstitutionIndexEntry[] {
    const filtered = searchQuery.trim()
      ? entries.filter((e) =>
          e.institution_name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : entries;

    return [...filtered].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortColumn) {
        case "institution_name":
          aVal = a.institution_name;
          bVal = b.institution_name;
          break;
        case "investigator_count":
          aVal = a.investigator_count;
          bVal = b.investigator_count;
          break;
        case "rising_star_count":
          aVal = a.rising_star_count;
          bVal = b.rising_star_count;
          break;
        case "established_count":
          aVal = a.established_count;
          bVal = b.established_count;
          break;
        case "talent_density_pct":
          aVal = a.talent_density_pct ?? -1;
          bVal = b.talent_density_pct ?? -1;
          break;
        case "yield_ratio":
          aVal = a.yield_ratio ?? -1;
          bVal = b.yield_ratio ?? -1;
          break;
        case "external_partner_count":
          aVal = a.external_partner_count;
          bVal = b.external_partner_count;
          break;
        case "top_rising_star_rank":
          aVal = a.top_rising_star_rank ?? 99999;
          bVal = b.top_rising_star_rank ?? 99999;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc"
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
  }

  function SortableHeader({
    column,
    label,
    align,
  }: {
    column: string;
    label: string;
    align: "left" | "right";
  }) {
    const isActive = sortColumn === column;
    const arrow = isActive ? (sortDirection === "asc" ? " \u2191" : " \u2193") : "";

    return (
      <th
        onClick={() => handleSort(column)}
        style={{
          padding: "10px 12px",
          textAlign: align,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: isActive ? "#E8E6DF" : "#6B6A65",
          fontWeight: 500,
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {arrow}
      </th>
    );
  }

  const displayEntries = sortedEntries();

  return (
    <div
      className="fm-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflowX: "hidden",
      }}
    >
      <div style={{ padding: "16px 16px 16px", borderBottom: "1px solid #1E1E22" }}>
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "none",
            color: "#6B6A65",
            cursor: "pointer",
            padding: 0,
            fontSize: 13,
          }}
        >
          {"\u2190"} Home
        </button>
        <h1 style={{ fontSize: 22, color: "#E8E6DF", margin: "8px 0 4px", fontWeight: 600 }}>
          {taSlug.toUpperCase()} Institutions
        </h1>
        <div style={{ fontSize: 13, color: "#6B6A65", marginBottom: 12 }}>
          {entries.length} institutions with NSCLC investigators
        </div>

        <input
          type="text"
          placeholder="Search institutions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            backgroundColor: "#0D0D10",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            color: "#E8E6DF",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      <div style={{ padding: "16px", overflowX: "auto" }}>
        {loading ? (
          <div style={{ color: "#6B6A65", fontSize: 13 }}>Loading institutions...</div>
        ) : displayEntries.length === 0 ? (
          <div style={{ color: "#6B6A65", fontSize: 13 }}>
            No institutions match your search.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              color: "#E8E6DF",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E22" }}>
                <SortableHeader column="institution_name" label="Institution" align="left" />
                <SortableHeader column="investigator_count" label="Published NSCLC Investigators" align="right" />
                <SortableHeader column="rising_star_count" label="Rising Stars" align="right" />
                <SortableHeader column="established_count" label="Established" align="right" />
                <SortableHeader column="talent_density_pct" label="Talent Density" align="right" />
                <SortableHeader column="yield_ratio" label="Yield" align="right" />
                <SortableHeader column="external_partner_count" label="External Partners" align="right" />
                <SortableHeader column="top_rising_star_rank" label="Top Investigator" align="left" />
              </tr>
            </thead>
            <tbody>
              {displayEntries.map((entry) => (
                <tr
                  key={entry.slug}
                  onClick={() => navigate(`/institution/${entry.slug}`)}
                  style={{
                    cursor: "pointer",
                    borderBottom: "1px solid #15131A",
                    transition: "background-color 120ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#0F0F12";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <td style={{ padding: "10px 12px", color: "#E8E6DF" }}>
                    {entry.institution_name}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "#9B9892",
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.investigator_count.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "#9B6DFF",
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.rising_star_count}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "#E8A020",
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.established_count}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "#3FB8AF",
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.talent_density_pct != null
                      ? `${entry.talent_density_pct.toFixed(1)}%`
                      : "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "#E8A04E",
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.yield_ratio != null ? entry.yield_ratio.toFixed(2) : "\u2014"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "#9B9892",
                      fontFamily: "monospace",
                    }}
                  >
                    {entry.external_partner_count}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#9B9892", fontSize: 12 }}>
                    {entry.top_rising_star_name
                      ? `${entry.top_rising_star_name} (#${entry.top_rising_star_rank} US)`
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <GlobalFooter />
    </div>
  );
}
