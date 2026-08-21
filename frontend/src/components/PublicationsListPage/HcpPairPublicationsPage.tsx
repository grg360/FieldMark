import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  getPublicationsByInternalPair,
  type PublicationListRow,
} from "../../lib/publicationsList";
import { COLOR } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PairPublicationsSurface from "./PairPublicationsSurface";
import PageHero from "../PageHero";
import { CANON, DEPTH } from "../../lib/canonicalTokens";

// The RPC's p_limit. Held here (not inline at the call site) because the surface needs
// it to tell "everything held" apart from "the top N by citation".
const PAIR_LIMIT = 100;

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
      getPublicationsByInternalPair(hcpId, partnerId, PAIR_LIMIT),
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

  // Both surnames, in no privileged order — the surface highlights every occurrence of
  // either one identically.
  const surnames = [hcpName, partnerName]
    .map((n) => n.trim().split(/\s+/).pop() ?? "")
    .filter(Boolean);

  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Co-Authored Papers" },
  ];

  return (
    // WIDE, not reading (2026-08-20). The bibliography's three-column row grid
    // (84 | 1fr | 210) does not fit the reading measure — the title column collapses and
    // ACCESS & ACTIONS wraps under it. Same width the per-HCP publications surface uses.
    <AppLayout breadcrumbs={breadcrumbs} width="wide">
      {/* PAGE PANEL — the wrapper HcpPublicationsPage:109 documents. PageHero supplies no
          container of its own, so a surface that does not provide one renders hero and
          rows flat on the app ground at AppLayout's padding and nothing else.
          BORDER BEFORE DEPTH.PANEL: DEPTH.PANEL carries its own borderTop rim and the
          `border` shorthand silently overwrites it when it comes second. Spread order is
          load-bearing here, not style. */}
      <div style={{ margin: "8px 0 24px", padding: "24px 44px 48px", border: `1px solid ${CANON.LINE.HAIR}`, ...DEPTH.PANEL }}>
        {/* Reduced H1 (PageHero, Commit B 2026-08-05) */}
        <div style={{ marginBottom: 22 }}>
          <PageHero reduced eyebrow="Fieldmark · Co-authorship" meta={`${pubs.length} CO-AUTHORED PAPER${pubs.length === 1 ? "" : "S"}`} title={headerTitle} />
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>Loading publications…</div>
        ) : pubs.length === 0 ? (
          <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>No co-authored papers found.</div>
        ) : (
          <PairPublicationsSurface rows={pubs} surnames={surnames} limit={PAIR_LIMIT} />
        )}
      </div>
    </AppLayout>
  );
}
