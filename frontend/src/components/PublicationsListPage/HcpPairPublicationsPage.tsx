import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  getPublicationsByInternalPair,
  type PublicationListRow,
} from "../../lib/publicationsList";
import PublicationCard from "./PublicationCard";

async function fetchHcpName(hcpId: string): Promise<string> {
  const { data } = await supabase
    .from("hcps_v2")
    .select("first_name, last_name")
    .eq("id", hcpId)
    .maybeSingle();
  if (!data) return "";
  return `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
}

export default function HcpPairPublicationsPage() {
  const { id: hcpId, partnerId } = useParams<{ id: string; partnerId: string }>();
  const navigate = useNavigate();
  const [pubs, setPubs] = useState<PublicationListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hcpName, setHcpName] = useState<string>("");
  const [partnerName, setPartnerName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!hcpId || !partnerId) return;
    setLoading(true);
    Promise.all([
      getPublicationsByInternalPair(hcpId, partnerId, 100),
      fetchHcpName(hcpId),
      fetchHcpName(partnerId),
    ])
      .then(([pubsData, name1, name2]) => {
        if (cancelled) return;
        setPubs(pubsData);
        setHcpName(name1);
        setPartnerName(name2);
      })
      .catch((err) => {
        console.warn("HcpPairPublicationsPage: load error", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hcpId, partnerId]);

  function goBack() {
    navigate(-1);
  }

  const arrow = String.fromCharCode(0x2194);
  const headerTitle = hcpName && partnerName
    ? `${hcpName} ${arrow} ${partnerName}`
    : "Shared publications";
  const headerSubtitle = pubs.length > 0
    ? `${pubs.length} shared publication${pubs.length === 1 ? "" : "s"}`
    : "";

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
        {String.fromCharCode(0x2190)} Back
      </button>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, color: "#E8E6DF", fontWeight: 600, marginBottom: 4 }}>
          {headerTitle}
        </div>
        {headerSubtitle && (
          <div style={{ fontSize: 13, color: "#9B9892" }}>
            {headerSubtitle}
          </div>
        )}
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "#6B6A65" }}>Loading publications...</div>
      ) : pubs.length === 0 ? (
        <div style={{ fontSize: 13, color: "#6B6A65" }}>No shared publications found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pubs.map((pub) => (
            <PublicationCard key={pub.publication_id} pub={pub} />
          ))}
        </div>
      )}
    </div>
  );
}
