import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  getPublicationsForHcp,
  type PublicationListRow,
} from "../../lib/publicationsList";
import { resolvePrimaryTaId, taDisplayNameForId } from "../../lib/api";
import PublicationCard from "./PublicationCard";

export default function HcpPublicationsPage() {
  const { id: hcpId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navTaId = (location.state as { taId?: string } | null)?.taId;
  const [taId, setTaId] = useState<string | undefined>(navTaId);
  const [pubs, setPubs] = useState<PublicationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hcpName, setHcpName] = useState<string>("");

  // Resolve the TA from nav-state, else re-derive from the HCP (refresh/deep-link).
  useEffect(() => {
    if (navTaId) {
      setTaId(navTaId);
      return;
    }
    if (!hcpId) return;
    let cancelled = false;
    void (async () => {
      const primary = await resolvePrimaryTaId(hcpId);
      if (!cancelled) setTaId(primary ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [hcpId, navTaId]);

  useEffect(() => {
    let cancelled = false;
    if (!hcpId || !taId) return;
    setLoading(true);

    Promise.all([
      getPublicationsForHcp(hcpId, taId, 100),
      fetchHcpName(hcpId),
    ])
      .then(([pubsData, name]) => {
        if (cancelled) return;
        setPubs(pubsData);
        setHcpName(name);
      })
      .catch((err) => {
        console.warn("HcpPublicationsPage: load error", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hcpId, taId]);

  function goBack() {
    if (hcpId) navigate(`/hcp/${hcpId}`);
    else navigate(-1);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <button
        type="button"
        onClick={goBack}
        style={{
          background: "none",
          border: "none",
          color: "#9B6DFF",
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          marginBottom: 16,
        }}
      >
        {String.fromCharCode(0x2190)} Back to profile
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 600, color: "#E8E6DF", margin: 0, marginBottom: 6 }}>
        Source Publications
      </h1>
      <div style={{ fontSize: 13, color: "#9B9892", marginBottom: 24 }}>
        {hcpName ? `Senior/first-authored ${taId ? `${taDisplayNameForId(taId)} ` : ""}publications backing ${hcpName}'s scientific positions` : `Senior/first-authored ${taId ? `${taDisplayNameForId(taId)} ` : ""}publications backing this investigator's scientific positions`}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "#6B6A65", padding: "24px 0" }}>Loading publications...</div>
      ) : pubs.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65", padding: "24px 0" }}>No source publications found.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {pubs.map((pub) => (
            <PublicationCard key={pub.id} pub={pub} />
          ))}
        </div>
      )}
    </div>
  );
}

async function fetchHcpName(hcpId: string): Promise<string> {
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase
      .from("hcps_v2")
      .select("first_name, last_name")
      .eq("id", hcpId)
      .maybeSingle();
    if (error || !data) return "";
    const first = (data as { first_name?: string }).first_name ?? "";
    const last = (data as { last_name?: string }).last_name ?? "";
    return `${first} ${last}`.trim();
  } catch {
    return "";
  }
}
