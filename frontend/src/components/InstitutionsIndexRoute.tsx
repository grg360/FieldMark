import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pin, PinOff } from "lucide-react";
import { getInstitutionsIndex, type InstitutionIndexEntry } from "../lib/api";
import { getCurrentUser } from "../lib/authHelpers";
import { getPinnedInstitutionsForUser, pinInstitution, unpinInstitution } from "../lib/institutionPins";
import { useIsDesktop } from "../lib/useIsDesktop";
import { institutionToSlug } from "../lib/institutionUtils";
import AppLayout from "./AppLayout";

export default function InstitutionsIndexRoute() {
  const { ta } = useParams<{ ta: string }>();
  const navigate = useNavigate();
  const taSlug = ta ?? "nsclc";

  const [entries, setEntries] = useState<InstitutionIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rising_star_count" | "investigator_count" | "established_count" | "talent_density_pct" | "yield_ratio" | "institution_name">("rising_star_count");
  const [userId, setUserId] = useState<string | null>(null);
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(new Set());
  const [pinPending, setPinPending] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentUser();
      if (!user || cancelled) return;
      setUserId(user.id);
      const pins = await getPinnedInstitutionsForUser(user.id);
      if (cancelled) return;
      setPinnedSet(new Set(pins.map((p) => p.institution_name)));
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleTogglePin(institutionName: string) {
    if (!userId) return;
    if (pinPending.has(institutionName)) return;

    setPinPending((prev) => new Set(prev).add(institutionName));
    const wasPinned = pinnedSet.has(institutionName);

    setPinnedSet((prev) => {
      const next = new Set(prev);
      if (wasPinned) next.delete(institutionName);
      else next.add(institutionName);
      return next;
    });

    try {
      if (wasPinned) {
        await unpinInstitution(userId, institutionName);
      } else {
        await pinInstitution(userId, institutionName);
      }
    } catch (err) {
      console.warn("handleTogglePin error", err);
      setPinnedSet((prev) => {
        const next = new Set(prev);
        if (wasPinned) next.add(institutionName);
        else next.delete(institutionName);
        return next;
      });
    } finally {
      setPinPending((prev) => {
        const next = new Set(prev);
        next.delete(institutionName);
        return next;
      });
    }
  }

  function filteredSorted(): InstitutionIndexEntry[] {
    const filtered = searchQuery.trim()
      ? entries.filter((e) => e.institution_name.toLowerCase().includes(searchQuery.toLowerCase()))
      : entries;

    return [...filtered].sort((a, b) => {
      if (sortBy === "institution_name") {
        return a.institution_name.localeCompare(b.institution_name);
      }
      const aVal = (a[sortBy] as number | null) ?? -Infinity;
      const bVal = (b[sortBy] as number | null) ?? -Infinity;
      return (bVal as number) - (aVal as number);
    });
  }

  const isDesktop = useIsDesktop();
  const sorted = filteredSorted();
  const breadcrumbs = [
    { label: "Home", path: "/me" },
    { label: "Institutions" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} maxWidth={1100}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#E8E6DF", margin: 0 }}>
          {taSlug.toUpperCase()} Institutions
        </h1>
        <div style={{ fontSize: 13, color: "#9B9892", marginTop: 6 }}>
          {entries.length} institutions with {taSlug.toUpperCase()} investigators
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search institutions..."
          style={{
            flex: 1,
            minWidth: 200,
            padding: "10px 14px",
            backgroundColor: "#0D0D10",
            border: "1px solid #1E1E22",
            borderRadius: 6,
            color: "#E8E6DF",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9B9892" }}>Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              padding: "8px 10px",
              backgroundColor: "#0D0D10",
              border: "1px solid #1E1E22",
              borderRadius: 6,
              color: "#E8E6DF",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <option value="rising_star_count">Rising Stars</option>
            <option value="established_count">Established</option>
            <option value="investigator_count">Total Investigators</option>
            <option value="talent_density_pct">Talent Density</option>
            <option value="yield_ratio">Yield Ratio</option>
            <option value="institution_name">Name (A-Z)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: "#6B6A65", padding: "48px 0", textAlign: "center" }}>
          Loading...
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ fontSize: 14, color: "#9B9892", padding: "48px 0", textAlign: "center" }}>
          No institutions match your search.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
          gap: 12,
        }}>
          {sorted.map((entry) => {
            const isPinned = pinnedSet.has(entry.institution_name);
            const isToggling = pinPending.has(entry.institution_name);
            const states = entry.states_present.slice(0, 3).join(", ");
            const moreStates = entry.states_present.length > 3 ? `, +${entry.states_present.length - 3}` : "";

            return (
              <div
                key={entry.slug}
                onClick={() => navigate(`/institution/${entry.slug}`)}
                style={{
                  backgroundColor: "#15131A",
                  borderTop: "1px solid #1E1E22",
                  borderRight: "1px solid #1E1E22",
                  borderBottom: "1px solid #1E1E22",
                  borderLeft: isPinned ? "3px solid #E8A020" : "1px solid #1E1E22",
                  borderRadius: 8,
                  padding: "14px 16px",
                  paddingLeft: isPinned ? 14 : 16,
                  cursor: "pointer",
                  transition: "background-color 120ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#1A1820";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#15131A";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#E8E6DF", marginBottom: 2 }}>
                      {entry.institution_name}
                    </div>
                    <div style={{ fontSize: 11, color: "#6B6A65" }}>
                      {states}{moreStates}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="fm-pill-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleTogglePin(entry.institution_name);
                    }}
                    disabled={isToggling}
                    aria-label={isPinned ? "Unpin institution" : "Pin institution"}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 4,
                      cursor: isToggling ? "default" : "pointer",
                      color: isPinned ? "#E8A020" : "#6B6A65",
                      flexShrink: 0,
                      opacity: isToggling ? 0.5 : 1,
                    }}
                  >
                    {isPinned ? <Pin size={16} fill="currentColor" /> : <Pin size={16} />}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#E8E6DF" }}>{entry.investigator_count.toLocaleString()}</span>
                    <span style={{ fontSize: 11, color: "#9B9892", marginLeft: 4 }}>investigators</span>
                  </div>
                  {entry.rising_star_count > 0 ? (
                    <div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#9B6DFF" }}>{entry.rising_star_count}</span>
                      <span style={{ fontSize: 11, color: "#9B9892", marginLeft: 4 }}>rising</span>
                    </div>
                  ) : null}
                  {entry.established_count > 0 ? (
                    <div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#E8A020" }}>{entry.established_count}</span>
                      <span style={{ fontSize: 11, color: "#9B9892", marginLeft: 4 }}>established</span>
                    </div>
                  ) : null}
                </div>

                {entry.top_rising_star_name && entry.top_rising_star_rank !== null ? (
                  <div style={{ fontSize: 12, color: "#9B9892", marginTop: 8 }}>
                    Top: <span style={{ color: "#E8E6DF" }}>{entry.top_rising_star_name}</span>
                    <span style={{ color: "#9B6DFF", fontWeight: 600, marginLeft: 6 }}>#{entry.top_rising_star_rank}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
