import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  getPublicationsByInternalPair,
  type PublicationListRow,
} from "../../lib/publicationsList";
import { COLOR } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PublicationList from "./PublicationList";
import PageHero from "../PageHero";

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

  const arrow = String.fromCharCode(0x2194);
  const headerTitle = hcpName && partnerName
    ? `${hcpName} ${arrow} ${partnerName}`
    : "Co-Authored Papers";
  const headerSubtitle = pubs.length > 0
    ? `${pubs.length} Co-Authored Paper${pubs.length === 1 ? "" : "s"}`
    : "";

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Co-Authored Papers" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="reading">
      {/* Reduced H1 (PageHero, Commit B 2026-08-05) */}
      <div style={{ marginBottom: 24 }}>
        <PageHero reduced eyebrow="Fieldmark · Co-authorship" title={headerTitle} dek={headerSubtitle || undefined} />
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.ink4 }}>Loading publications...</div>
      ) : pubs.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink4 }}>No co-authored papers found.</div>
      ) : (
        <PublicationList pubs={pubs} />
      )}
    </AppLayout>
  );
}
