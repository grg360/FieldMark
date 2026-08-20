import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  getFullPublicationsForHcp,
  getCoAuthorYearLedger,
  type PublicationListRow,
  type PublicationYearLedgerRow,
} from "../../lib/publicationsList";
import { COLOR } from "../../lib/designTokens";
import AppLayout from "../AppLayout";
import PublicationsSurface from "./PublicationsSurface";
import FullCareerView from "./FullCareerView";
import PageHero from "../PageHero";
import { CANON, DEPTH } from "../../lib/canonicalTokens";

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

  // Deep-link landing (#senior-author from the ledger badge): scroll once the
  // record has rendered — same pattern as HcpProfileBrief's section hashes.
  useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  const surname = hcpName.trim().split(/\s+/).pop() ?? "";
  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Publications" },
  ];

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="wide">
      {/* PAGE PANEL (2026-08-19). This surface rendered its hero and every row
          directly on the app ground — measured at a 918px viewport, breadcrumb,
          title, stat row, column header and first card ALL sat at left: 16, which
          is AppLayout's padding and nothing else. PageHero has no container of its
          own by design (see its comment: the padding "belongs on the surface's own
          content blocks"), so a surface that does not supply one gets no container
          at all. This is the same wrapper the Cohort Ledger (:2007), Institutions
          (:571) and Congress calendar (:277) use.

          BORDER BEFORE DEPTH.PANEL, NOT AFTER. DEPTH.PANEL carries its own borderTop
          rim, and the `border` shorthand silently overwrites it when it comes second
          — the exact bug CongressCalendarPage:274-276 documents. Spread order here
          is load-bearing, not style.

          44px HORIZONTAL (2026-08-19, raised from 32). Every row in PublicationsSurface carries
          `padding: "15px 0"` — no horizontal inset at all — so its borderTop/Bottom rules
          span the full content width and terminate flush against the panel padding. At
          20px they read as touching the border even though nothing escapes it: measured,
          hero and rows both start at the content edge and zero elements cross it. 32px is
          Congress calendar's 32 was the right reference for A PANEL but the wrong one for
          A NUMERAL AGAINST A BORDER: measured, the ledger insets its 44px rank numeral
          46px from the panel edge (20px panel padding + 23px row padding, because it
          nests a board inside its panel), while 32 here put this page's 22px numeral at
          34px. 44 puts it at 45 -- within a pixel of the ledger -- and moves the hero and
          the rules together, which keeps them aligned. The alternative — insetting the rows instead, the way
          the ledger nests a board inside its panel — belongs with the six-surface batch,
          where Trials and HCP positions raise the same question. */}
      <div style={{ margin: "8px 0 24px", padding: "24px 44px 48px", border: `1px solid ${CANON.LINE.HAIR}`, ...DEPTH.PANEL }}>
      {/* Reduced H1 (PageHero, Commit B 2026-08-05); the mono record label
          rides the meta slot. */}
      <div style={{ marginBottom: 22 }}>
        <PageHero
          reduced
          eyebrow="Fieldmark · Publications"
          meta={year != null ? `PUBLICATION YEAR ${year}` : "FULL PUBLISHED RECORD · ROLE IS THE STRUCTURE"}
          title={hcpName ? `${hcpName} — Publications` : "Publications"}
        />
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
        <FullCareerView hcpId={hcpId ?? ""} seniorRows={seniorRows} coAuthorTotal={coAuthorTotal} ledger={ledger} hcpName={hcpName} />
      )}
      </div>
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
