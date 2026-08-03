import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  getFullPublicationsForHcp,
  getCoAuthorYearLedger,
  type PublicationListRow,
  type PublicationYearLedgerRow,
} from "../../lib/publicationsList";
import { COLOR, TYPE } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PublicationsSurface from "./PublicationsSurface";
import FullCareerView from "./FullCareerView";

// The redesigned per-HCP publications surface. Two modes off the same route:
//   • year-scoped (a year in nav-state or ?year=) → the dense/sparse band view.
//   • whole record → the full-career view (senior top-5 + co-author year ledger),
//     which is what keeps a 291-paper record from rendering as hundreds of rows.
export default function HcpPublicationsPage() {
  const { id: hcpId } = useParams<{ id: string }>();
  const location = useLocation();
  const stateYear = (location.state as { year?: number } | null)?.year;
  const queryYear = new URLSearchParams(location.search).get("year");
  const year = stateYear ?? (queryYear ? Number(queryYear) : undefined);

  const [yearRows, setYearRows] = useState<PublicationListRow[]>([]);
  const [seniorRows, setSeniorRows] = useState<PublicationListRow[]>([]);
  const [coAuthorTotal, setCoAuthorTotal] = useState(0);
  const [ledger, setLedger] = useState<PublicationYearLedgerRow[]>([]);
  const [hcpName, setHcpName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hcpId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const name = await fetchHcpName(hcpId);
        if (!cancelled) setHcpName(name);
        if (year != null) {
          const rows = await getFullPublicationsForHcp(hcpId, { year });
          if (!cancelled) setYearRows(rows);
        } else {
          // full-career: senior papers rendered individually, co-authored aggregated.
          const [all, yl] = await Promise.all([
            getFullPublicationsForHcp(hcpId),
            getCoAuthorYearLedger(hcpId),
          ]);
          if (cancelled) return;
          setSeniorRows(all.filter((r) => r.is_senior_author));
          setCoAuthorTotal(all.filter((r) => !r.is_senior_author).length);
          setLedger(yl);
        }
      } catch (err) {
        console.warn("HcpPublicationsPage: load error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hcpId, year]);

  const surname = hcpName.trim().split(/\s+/).pop() ?? "";
  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Publications" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="wide">
      <h1 style={{ ...TYPE.display, fontSize: 22, margin: 0, marginBottom: 4 }}>
        {hcpName ? `${hcpName} — Publications` : "Publications"}
      </h1>
      <div style={{ fontSize: 12, color: COLOR.ink3, marginBottom: 22, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: ".04em" }}>
        {year != null ? `PUBLICATION YEAR ${year}` : "FULL PUBLISHED RECORD · ROLE IS THE STRUCTURE"}
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>Loading publications…</div>
      ) : year != null ? (
        yearRows.length === 0
          ? <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>No publications held for {hcpName || "this investigator"} in {year}.</div>
          : <PublicationsSurface rows={yearRows} surname={surname} year={year} hcpName={hcpName} />
      ) : seniorRows.length === 0 && coAuthorTotal === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.ink4, padding: "24px 0" }}>No publications held for this investigator.</div>
      ) : (
        <FullCareerView seniorRows={seniorRows} coAuthorTotal={coAuthorTotal} ledger={ledger} hcpName={hcpName} />
      )}
    </AppLayout>
  );
}

async function fetchHcpName(hcpId: string): Promise<string> {
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data } = await supabase.from("hcps_v2").select("first_name, last_name").eq("id", hcpId).maybeSingle();
    if (!data) return "";
    const d = data as { first_name?: string; last_name?: string };
    return `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim();
  } catch {
    return "";
  }
}
