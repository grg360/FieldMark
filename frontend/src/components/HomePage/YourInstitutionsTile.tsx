import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Pin } from "lucide-react";
import type { InstitutionIndexEntry } from "../../lib/api";
import { getInstitutionsByNames, getPinnedInstitutionsForUser, type PinnedInstitution } from "../../lib/institutionPins";
import { institutionToSlug } from "../../lib/institutionUtils";
import { useTA } from "../../lib/TAContext";
import HomeTile from "./HomeTile";

interface Props {
  userId: string;
}

export default function YourInstitutionsTile({ userId }: Props) {
  // Ambient current TA — pins are global (not TA-scoped), but their displayed stats
  // and the "Browse all" index link follow the user's current TA.
  const { dataSlug } = useTA();
  const [pins, setPins] = useState<PinnedInstitution[]>([]);
  const [indexMap, setIndexMap] = useState<Map<string, InstitutionIndexEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const pinsData = await getPinnedInstitutionsForUser(userId);
        if (cancelled) return;
        setPins(pinsData);
        setLoading(false);

        if (pinsData.length > 0) {
          const names = pinsData.map((p) => p.institution_name);
          const statsMap = await getInstitutionsByNames(names, dataSlug);
          if (cancelled) return;
          setIndexMap(statsMap);
        }
      } catch (err) {
        console.warn("YourInstitutionsTile: load error", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, dataSlug]);

  const MAX_VISIBLE = 5;
  const visiblePins = pins.slice(0, MAX_VISIBLE);
  const hasMore = pins.length > MAX_VISIBLE;

  const titleStyle: CSSProperties = {
    fontSize: 11,
    color: "#6B6A65",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 600,
    marginBottom: 8,
  };

  // Empty → hide (consistency with the home-tile pattern). Only after the fetch
  // resolves: while loading we still render the tile's loading state below, so a
  // slow fetch doesn't hide-then-flash-in. Pins are global (not TA-scoped), so this
  // hides only for a user with no pins at all.
  if (!loading && pins.length === 0) return null;

  return (
    <HomeTile>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={titleStyle}>Your Institutions</div>
        <button
          type="button"
          className="fm-pill-button"
          onClick={() => navigate(`/institutions/${dataSlug}`)}
          style={{
            background: "none",
            border: "none",
            color: "#9B6DFF",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          {pins.length > 0 ? `Browse all (${pins.length} pinned)` : "Browse all"}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "#6B6A65", padding: "16px 0", textAlign: "center" }}>
          Loading...
        </div>
      ) : pins.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#9B9892", marginBottom: 6 }}>
            No pinned institutions yet.
          </div>
          <button
            type="button"
            className="fm-pill-button"
            onClick={() => navigate(`/institutions/${dataSlug}`)}
            style={{
              background: "none",
              border: "1px solid #1E1E22",
              color: "#9B6DFF",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "6px 12px",
              borderRadius: 4,
            }}
          >
            Browse institutions
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visiblePins.map((pin) => {
            const stats = indexMap.get(pin.institution_name);
            return (
              <button
                key={pin.id}
                type="button"
                onClick={() => navigate(`/institution/${institutionToSlug(pin.institution_name)}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  color: "#E8E6DF",
                  fontSize: 13,
                  transition: "background-color 120ms, border-color 120ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#15131A";
                  e.currentTarget.style.borderColor = "#1E1E22";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                }}
              >
                <Pin size={12} fill="#E8A020" stroke="#E8A020" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pin.institution_name}
                </span>
                {stats ? (
                  <span style={{ display: "flex", gap: 8, alignItems: "baseline", flexShrink: 0, fontSize: 12 }}>
                    <span style={{ color: "#E8E6DF", fontWeight: 600 }}>{stats.investigator_count.toLocaleString()}</span>
                    {stats.rising_star_count > 0 ? (
                      <span style={{ color: "#9B6DFF", fontWeight: 600 }}>{stats.rising_star_count}{String.fromCharCode(0x2605)}</span>
                    ) : null}
                    {stats.established_count > 0 ? (
                      <span style={{ color: "#E8A020", fontWeight: 600 }}>{stats.established_count}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
          {hasMore ? (
            <div style={{ fontSize: 11, color: "#6B6A65", padding: "4px 10px" }}>
              +{pins.length - MAX_VISIBLE} more
            </div>
          ) : null}
        </div>
      )}
    </HomeTile>
  );
}
