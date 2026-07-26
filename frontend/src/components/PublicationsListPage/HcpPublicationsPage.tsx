import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  getPublicationsForHcp,
  type PublicationListRow,
} from "../../lib/publicationsList";
import { resolvePrimaryTaId, taDisplayNameForId } from "../../lib/api";
import { COLOR, TYPE } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PublicationCard from "./PublicationCard";

export default function HcpPublicationsPage() {
  const { id: hcpId } = useParams<{ id: string }>();
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

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Publications" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} maxWidth={1000}>
      <h1 style={{ ...TYPE.display, fontSize: 22, margin: 0, marginBottom: 6 }}>
        Source Publications
      </h1>
      <div style={{ fontSize: 13, color: COLOR.ink3, marginBottom: 24 }}>
        {hcpName ? `Senior/first-authored ${taId ? `${taDisplayNameForId(taId)} ` : ""}publications backing ${hcpName}'s scientific positions` : `Senior/first-authored ${taId ? `${taDisplayNameForId(taId)} ` : ""}publications backing this investigator's scientific positions`}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>Loading publications...</div>
      ) : pubs.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>No source publications found.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {pubs.map((pub) => (
            <PublicationCard key={pub.id} pub={pub} />
          ))}
        </div>
      )}
    </AppLayout>
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
