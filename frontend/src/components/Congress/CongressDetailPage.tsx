import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { COLOR, FONT } from "../../lib/designTokens";
import { supabase } from "../../lib/supabase";
import {
  CONGRESSES,
  congressState,
  liveDay,
  relevanceFor,
  type Congress,
} from "../../lib/congresses";
import { getCongressSocial, meetsThreshold, SOCIAL_THRESHOLD, type CongressSocial } from "../../lib/congressSocial";

const TA_SLUG = "nsclc";
const TA_LABEL = "Oncology";
// NSCLC TA UUID (mirrors lib/api.ts TA_ID_MAP.nsclc, which is module-private).
const TA_ID = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d";
const INT = new Intl.NumberFormat("en-US");
const mono = (size: number, color = COLOR.ink3): React.CSSProperties => ({
  fontFamily: FONT.mono, fontSize: size, color, letterSpacing: "0.04em",
});
const eyebrow = (color = COLOR.ink3): React.CSSProperties => ({
  ...mono(10, color), letterSpacing: "0.16em", fontWeight: 600,
});

interface PresenterAbstract { title: string; session_type: string; date: string | null; }
interface ConfirmedPresenter {
  speaker_key: string; name: string; hcp_id: string;
  established_rank: number | null; rising_rank: number | null;
  // hcp_cohort_classification_v2.cohort — the authoritative per-TA career-structure
  // taxonomy (established / rising_eligible / too_young / community). NOT
  // hcps_v2.cohort_classification, which is stale-denormalized (73.6% null).
  cohort: string | null;
  institution: string | null; abstracts: PresenterAbstract[];
}

function fmtDates(c: Congress): string {
  const s = new Date(`${c.start_date}T00:00:00Z`), e = new Date(`${c.end_date}T00:00:00Z`);
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const yr = e.getUTCFullYear();
  return mon(s) === mon(e)
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${mon(e)} ${yr}`
    : `${s.getUTCDate()} ${mon(s)} – ${e.getUTCDate()} ${mon(e)} ${yr}`;
}
function fmtSessionDate(iso: string | null): string {
  if (!iso) return "session time not yet published";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
// The classification picks which board rank an HCP may claim. Career structure
// (hcp_cohort_classification_v2) and board membership (the two ranks tables) are
// different constructs — the rising board is ~61% career-established HCPs, and
// rising_eligible means eligible for rising evaluation, not on the board. So:
// established -> the Established board rank; rising_eligible -> the Rising board
// rank; anything else (community, too_young, no row) claims no rank and shows no
// chip — these tables carry no community rank, and we never guess.
function cohortRank(p: ConfirmedPresenter): number | null {
  if (p.cohort === "established") return p.established_rank;
  if (p.cohort === "rising_eligible") return p.rising_rank;
  return null;
}

// Short "31 MAY"-style date for axis ticks, captions, and the peak annotation.
function fmtShortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}`;
}

// Signal build — the page's main visual. Full-width bars over observed days,
// phase-colored (baseline chatter / run-up / in-session / post-session), with a
// labelled x-axis and a peak annotation. The legend renders only phases that
// exist in the data: ASCO's capture began 9 days before the meeting, so it has
// no baseline segment and we don't draw an empty legend entry for one.
// Square-root y-scale: the series spans ~45x (55 -> 2,492), so a linear scale
// crushes the pre-meeting run-up into invisible stubs. sqrt keeps the run-up
// build legible against the in-session peak while staying monotonic and zero-at-zero.
const PHASES = [
  { key: "baseline", label: "BASELINE CHATTER", color: "#3A352F" },
  { key: "runup", label: "RUN-UP", color: COLOR.ink4 },
  { key: "session", label: "IN-SESSION", color: COLOR.amber },
  { key: "post", label: "POST-SESSION", color: COLOR.ink5 },
] as const;
type PhaseKey = (typeof PHASES)[number]["key"];

function VolumeChart({ c, s }: { c: Congress; s: CongressSocial }) {
  const H = 220;
  // Truncate the series at meeting end + 7 days: an honest post-session tail
  // stays visible without weeks of near-zero silence compressing the run-up and
  // spike — the part anyone reads — into a sliver. The truncation is stated in
  // the caveat line below, with the hidden remainder quantified.
  const cutoff = (() => {
    const d = new Date(`${c.end_date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const daily = s.daily.filter((p) => p.d <= cutoff);
  const hiddenDays = s.daily.length - daily.length;
  const hiddenPosts = s.daily.slice(daily.length).reduce((sum, p) => sum + p.n, 0);
  if (daily.length === 0) return null;
  const rootMax = Math.sqrt(Math.max(1, ...daily.map((p) => p.n)));
  const barH = (n: number) => (n <= 0 ? 0 : Math.max(2, (Math.sqrt(n) / rootMax) * H));

  const runupStart = (() => {
    const d = new Date(`${c.start_date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 14);
    return d.toISOString().slice(0, 10);
  })();
  const phaseOf = (d: string): PhaseKey =>
    d > c.end_date ? "post" : d >= c.start_date ? "session" : d >= runupStart ? "runup" : "baseline";
  const phaseColor = (k: PhaseKey) => PHASES.find((p) => p.key === k)!.color;
  const present = PHASES.filter((p) => daily.some((pt) => phaseOf(pt.d) === p.key));

  const peakIdx = daily.reduce((best, p, i) => (p.n > daily[best].n ? i : best), 0);
  const peak = daily[peakIdx];
  // Center-of-bar position; clamp the transform so edge peaks don't clip.
  const pctOf = (i: number) => ((i + 0.5) / daily.length) * 100;
  const clampX = (pct: number) => (pct < 5 ? "0" : pct > 95 ? "-100%" : "-50%");
  const ticks = daily.map((p, i) => ({ ...p, i })).filter((p) => p.i % 7 === 0 || p.i === daily.length - 1);

  return (
    <div>
      {/* legend — only phases present in the observed window */}
      <div style={{ display: "flex", gap: 18, marginBottom: 12, flexWrap: "wrap" }}>
        {present.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
            <span style={{ ...mono(9, COLOR.ink4), letterSpacing: "0.1em" }}>{p.label}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "relative", paddingTop: 28 }}>
        {/* peak annotation */}
        <div style={{ position: "absolute", top: 0, left: `${pctOf(peakIdx)}%`, transform: `translateX(${clampX(pctOf(peakIdx))})`, whiteSpace: "nowrap", ...mono(9.5, COLOR.amber), letterSpacing: "0.1em", fontWeight: 600 }}>
          PEAK {INT.format(peak.n)} · {fmtShortDay(peak.d)}
        </div>
        <div style={{ position: "absolute", top: 15, left: `${pctOf(peakIdx)}%`, width: 1, height: 10, background: COLOR.amber }} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: H }}>
          {daily.map((p) => (
            <div key={p.d} title={`${p.d}: ${INT.format(p.n)}`}
              style={{ flex: 1, background: phaseColor(phaseOf(p.d)), height: barH(p.n), borderRadius: "1px 1px 0 0" }} />
          ))}
        </div>
      </div>
      <div style={{ height: 1, background: COLOR.hairStrong, margin: "2px 0 6px" }} />
      {/* labelled x-axis — a tick roughly every observed week */}
      <div style={{ position: "relative", height: 14 }}>
        {ticks.map((t) => (
          <span key={t.d} style={{ position: "absolute", left: `${pctOf(t.i)}%`, transform: `translateX(${clampX(pctOf(t.i))})`, whiteSpace: "nowrap", ...mono(9, COLOR.ink5) }}>
            {fmtShortDay(t.d)}
          </span>
        ))}
      </div>
      <div style={{ ...mono(9, COLOR.ink5), marginTop: 8, lineHeight: 1.6 }}>
        Bars use a square-root scale so the pre-meeting build stays legible against the in-session peak; exact counts on hover. Days before capture began are unobserved, not zero — we don&rsquo;t draw them.
        {hiddenDays > 0 && (
          <> Shown through {fmtShortDay(cutoff)} (meeting end + 7 days); capture continues to {fmtShortDay(s.last_day)} — {INT.format(hiddenPosts)} further posts across {hiddenDays} days beyond the shown window.</>
        )}
      </div>
    </div>
  );
}

// "What we don't have" — abstract-aware. Rendered as a bordered panel in the
// right column of the voices/topics row when social clears threshold, and as a
// standalone trailing panel otherwise (the honesty block must never disappear).
function DontHavePanel({ hasAbstracts, standalone = false }: { hasAbstracts: boolean; standalone?: boolean }) {
  return (
    <div style={{ background: COLOR.surfaceCard, border: `1px solid ${COLOR.hairStrong}`, borderRadius: 6, padding: "18px 20px", ...(standalone ? { maxWidth: 900 } : {}) }}>
      <div style={{ ...eyebrow(COLOR.ink3), marginBottom: 14 }}>WHAT WE DON&rsquo;T HAVE</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(hasAbstracts
          ? [
              ["Abstract bodies", "not licensed for display — titles and metadata only"],
              ["Attendance", "unobtainable, and we will not estimate it"],
              ["Presence in Chicago", "presenting is not attending; hashtag activity is not attendance either"],
              ["Identity classification", "we don't compute a likely-HCP share of the conversation"],
            ]
          : [
              ["Session schedule", "no published abstract list for this congress"],
              ["Attendance", "unobtainable, and we will not estimate it"],
              ["Confirmed presenters", "expert connection here is inference from hashtag activity, labelled as such"],
            ]
        ).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 11, alignItems: "baseline" }}>
            <span style={mono(11, "#3A352F")}>—</span>
            <span style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.5, color: COLOR.ink3 }}><span style={{ color: COLOR.ink2 }}>{k}</span> · {v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact follower formatting for the Top Voices panel (49,684 -> "49.7K").
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

// Rank bands so a top-of-board KOL isn't shown equal to a rank-2000+ presenter.
// All are legitimately tracked; the band header sets the expectation.
const BANDS: { label: string; max: number }[] = [
  { label: "TOP 50", max: 50 },
  { label: "RANK 51–250", max: 250 },
  { label: "RANK 251–1000", max: 1000 },
  { label: "RANK 1000+", max: Infinity },
];
function bandIndex(r: number): number {
  return BANDS.findIndex((b) => r <= b.max);
}

function PresenterCard({ p }: { p: ConfirmedPresenter }) {
  return (
    <div style={{ border: `1px solid ${COLOR.hair}`, borderRadius: 6, background: COLOR.surfaceCard, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <Link to={`/hcp/${p.hcp_id}`} style={{ fontSize: 15, fontWeight: 600, color: COLOR.ink1 }}>{p.name}</Link>
          <div style={{ ...mono(10.5, COLOR.ink5), marginTop: 4 }}>{p.institution ?? "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {/* One chip only — the classification-matched board rank. Dual chips were the bug. */}
          {p.cohort === "established" && p.established_rank != null && (
            <span style={{ ...mono(9, COLOR.estGreen), border: `1px solid ${COLOR.estGreen}`, borderRadius: 3, padding: "3px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>EST #{p.established_rank}</span>
          )}
          {p.cohort === "rising_eligible" && p.rising_rank != null && (
            <span style={{ ...mono(9, COLOR.indigoLink), border: `1px solid ${COLOR.indigo}`, borderRadius: 3, padding: "3px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>RISING #{p.rising_rank}</span>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {p.abstracts.map((a, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${COLOR.hairStrong}`, paddingLeft: 11 }}>
            <div style={{ fontFamily: FONT.serif, fontSize: 13.5, lineHeight: 1.5, color: COLOR.ink2 }} dangerouslySetInnerHTML={{ __html: a.title }} />
            <div style={{ ...mono(9.5, COLOR.ink5), marginTop: 5 }}>
              {a.session_type} · <span style={{ color: a.date ? COLOR.ink4 : COLOR.ink5 }}>{fmtSessionDate(a.date)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CongressDetailPage() {
  const { slug } = useParams();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [params] = useSearchParams();
  const now = useMemo(() => {
    const o = import.meta.env.DEV ? params.get("now") : null;
    return o && /^\d{4}-\d{2}-\d{2}$/.test(o) ? new Date(`${o}T12:00:00Z`) : new Date();
  }, [params]);

  const congress = useMemo(() => CONGRESSES.find((c) => c.slug === slug) ?? null, [slug]);
  const [presenters, setPresenters] = useState<ConfirmedPresenter[]>([]);
  const [social, setSocial] = useState<CongressSocial | null>(null);
  const [followersByHandle, setFollowersByHandle] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!congress) return;
    let cancelled = false;
    (async () => {
      // Confirmed presenters + their abstracts + institution.
      const { data: pres } = await supabase
        .from("congress_confirmed_presenters")
        .select("speaker_key, speaker_display_name, hcp_id, established_rank, rising_rank")
        .eq("congress_slug", congress.slug);
      const rows = (pres ?? []) as Array<{ speaker_key: string; speaker_display_name: string; hcp_id: string; established_rank: number | null; rising_rank: number | null }>;
      const keys = rows.map((r) => r.speaker_key);
      const ids = rows.map((r) => r.hcp_id);
      const [{ data: abs }, { data: hcps }, { data: cls }] = await Promise.all([
        keys.length
          ? supabase.from("congress_abstracts").select("speaker_key, presentation_title, session_type, presentation_start").eq("congress_slug", congress.slug).in("speaker_key", keys)
          : Promise.resolve({ data: [] as never[] }),
        ids.length
          ? supabase.from("hcps_v2").select("id, institution_canonical").in("id", ids)
          : Promise.resolve({ data: [] as never[] }),
        // Authoritative cohort: hcp_cohort_classification_v2 (per-TA career
        // structure, complete coverage) — NOT hcps_v2.cohort_classification,
        // which is stale-denormalized and 73.6% null on the US Established board.
        ids.length
          ? supabase.from("hcp_cohort_classification_v2").select("hcp_id, cohort").eq("therapeutic_area_id", TA_ID).in("hcp_id", ids)
          : Promise.resolve({ data: [] as never[] }),
      ]);
      const absByKey = new Map<string, PresenterAbstract[]>();
      for (const a of (abs ?? []) as Array<{ speaker_key: string; presentation_title: string; session_type: string; presentation_start: string | null }>) {
        (absByKey.get(a.speaker_key) ?? absByKey.set(a.speaker_key, []).get(a.speaker_key)!)
          .push({ title: a.presentation_title, session_type: a.session_type, date: a.presentation_start });
      }
      const instById = new Map((((hcps ?? []) as Array<{ id: string; institution_canonical: string | null }>)).map((h) => [String(h.id), h.institution_canonical]));
      const cohortById = new Map((((cls ?? []) as Array<{ hcp_id: string; cohort: string }>)).map((r) => [String(r.hcp_id), r.cohort]));
      const built: ConfirmedPresenter[] = rows.map((r) => ({
        speaker_key: r.speaker_key, name: r.speaker_display_name, hcp_id: String(r.hcp_id),
        established_rank: r.established_rank, rising_rank: r.rising_rank,
        cohort: cohortById.get(String(r.hcp_id)) ?? null,
        institution: instById.get(String(r.hcp_id)) ?? null,
        abstracts: absByKey.get(r.speaker_key) ?? [],
      })).sort((a, b) => (cohortRank(a) ?? 99999) - (cohortRank(b) ?? 99999));

      const s = await getCongressSocial(congress);
      // Follower counts for the top voices (social_users_v2 is public-read).
      let followers: Record<string, number> = {};
      if (s?.top_voices?.length) {
        const { data: users } = await supabase
          .from("social_users_v2")
          .select("handle, follower_count")
          .eq("platform", "twitter")
          .in("handle", s.top_voices.map((v) => v.handle));
        followers = Object.fromEntries(
          ((users ?? []) as Array<{ handle: string; follower_count: number | null }>)
            .filter((u) => u.follower_count != null)
            .map((u) => [u.handle.toLowerCase(), u.follower_count as number]),
        );
      }
      if (cancelled) return;
      setPresenters(built);
      setSocial(s);
      setFollowersByHandle(followers);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [congress]);

  if (!congress) {
    return (
      <AppLayout maxWidth={1100}>
        <div style={{ paddingTop: 40, fontFamily: FONT.sans, color: COLOR.ink2 }}>
          <div style={{ ...eyebrow(COLOR.ink4), marginBottom: 8 }}>CONGRESS NOT FOUND</div>
          <Link to="/congress" style={{ color: COLOR.indigoLink }}>← Congress Calendar</Link>
        </div>
      </AppLayout>
    );
  }

  const hasAbstracts = !!congress.abstract_source;
  const st = congressState(congress, now);
  const d = liveDay(congress, now);
  const rel = relevanceFor(congress, TA_SLUG);
  const aboveThreshold = social != null && meetsThreshold(social);

  return (
    <AppLayout maxWidth={1100}>
      <div style={{ fontFamily: FONT.sans, color: COLOR.ink1, paddingTop: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* breadcrumb */}
        <div style={{ ...mono(11, COLOR.ink5), display: "flex", gap: 8 }}>
          <Link to="/congress" style={{ color: COLOR.ink3 }}>Congress Calendar</Link><span>/</span>
          <span style={{ color: COLOR.ink1 }}>{congress.short_name}</span>
        </div>

        {/* header */}
        <div>
          {st === "live" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLOR.amber }} />
              <div style={eyebrow(COLOR.amber)}>LIVE{d ? ` · DAY ${d.day} OF ${d.of}` : ""}</div>
            </div>
          )}
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>{congress.short_name}</div>
          <div style={{ fontFamily: FONT.serif, fontSize: 16, color: COLOR.ink3, marginTop: 8 }}>{congress.society_full}</div>
          <div style={{ display: "flex", gap: 26, ...mono(11, COLOR.ink3), marginTop: 14, flexWrap: "wrap" }}>
            <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.12em", marginBottom: 5 }}>DATES</div>{fmtDates(congress)}</div>
            <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.12em", marginBottom: 5 }}>LOCATION</div>{congress.venue ? `${congress.venue} · ` : ""}{congress.city}{congress.state ? `, ${congress.state}` : `, ${congress.country}`}</div>
            <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.12em", marginBottom: 5 }}>HASHTAG</div><span style={{ color: COLOR.amber }}>{congress.hashtags[0]}</span></div>
            <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.12em", marginBottom: 5 }}>TA RELEVANCE</div><span style={{ color: COLOR.ink1 }}>{rel ? rel.toUpperCase() : "—"}</span> · {TA_LABEL}</div>
          </div>
        </div>

        {/* provenance — abstract-aware */}
        <div style={{ border: `1px solid ${COLOR.indigoSoft}`, background: COLOR.indigoSoft, borderRadius: 6, padding: "16px 18px" }}>
          <div style={{ ...eyebrow(COLOR.indigoLink), marginBottom: 12 }}>WHAT THIS PAGE IS</div>
          <div style={{ fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.68, color: COLOR.ink3, maxWidth: 900, display: "flex", flexDirection: "column", gap: 9 }}>
            {hasAbstracts ? (
              <>
                <div>This page draws on two sources. The meeting&rsquo;s published abstract list gives us <span style={{ color: COLOR.ink1 }}>confirmed presenters</span>, session types, and — where the schedule is set — presentation times. Public posts captured under <span style={{ color: COLOR.amber }}>{congress.hashtags[0]}</span> give us the surrounding conversation.</div>
                <div>What we do not have: abstract bodies (not licensed for display), and any record of attendance. Presenting is not the same as attending, and hashtag activity is not attendance either.</div>
                <div style={{ color: COLOR.ink1, fontWeight: 600 }}>We&rsquo;re showing you our work, including the parts that aren&rsquo;t finished. That&rsquo;s the deal.</div>
              </>
            ) : (
              <>
                <div>Everything below is derived from public posts captured under <span style={{ color: COLOR.amber }}>{congress.hashtags[0]}</span>. It is a picture of the conversation, not a picture of the meeting. We have no session schedule, no abstracts, and no registration data.</div>
                <div>Where we say an expert is <span style={{ color: COLOR.ink1 }}>likely connected</span>, that is an inference from their own posts and their published themes, and it is labelled as one everywhere it appears.</div>
                <div style={{ color: COLOR.ink1, fontWeight: 600 }}>We&rsquo;re showing you our work, including the parts that aren&rsquo;t finished. That&rsquo;s the deal.</div>
              </>
            )}
          </div>
        </div>

        {/* STAT TILES — the page's numbers, up front. Real figures only: RPC
            aggregates + counted presenters. No LIKELY HCP SHARE tile — we don't
            compute identity classification (it's named in "What we don't have"). */}
        {(() => {
          const tiles: { k: string; v: string; caption: string; color?: string }[] = [];
          if (aboveThreshold && social) {
            const peak = social.daily.reduce((best, p) => (p.n > best.n ? p : best), social.daily[0]);
            tiles.push(
              { k: "POSTS CAPTURED", v: INT.format(social.total_posts), caption: `${fmtShortDay(social.capture_start)} – ${fmtShortDay(social.last_day)} under ${congress.hashtags[0]}` },
              { k: "DISTINCT VOICES", v: INT.format(social.voices), caption: "unique accounts posting" },
            );
            if (social.wow_pct != null) {
              const last = new Date(`${social.last_day}T00:00:00Z`);
              const md = (off: number) => { const d = new Date(last); d.setUTCDate(d.getUTCDate() - off); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
              // Partial window: this is the last observed week vs the one before
              // it, not a steady-state rate — both windows named so it can't be misread.
              tiles.push({ k: "WoW VOLUME", v: `${social.wow_pct > 0 ? "+" : ""}${social.wow_pct}%`, caption: `${md(6)}–${md(0)} vs ${md(13)}–${md(7)}`, color: COLOR.amber });
            }
            tiles.push({ k: "PEAK DAY", v: INT.format(peak.n), caption: `posts on ${fmtShortDay(peak.d)}` });
          }
          if (hasAbstracts && presenters.length > 0) {
            tiles.push({ k: "CONFIRMED PRESENTERS", v: String(presenters.length), caption: "from the abstract list" });
          }
          if (tiles.length === 0) return null;
          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${tiles.length},1fr)`, gap: 1, background: COLOR.hairStrong, border: `1px solid ${COLOR.hairStrong}`, borderRadius: 6, overflow: "hidden" }}>
              {tiles.map((t) => (
                <div key={t.k} style={{ background: COLOR.surfaceWell, padding: "14px 16px" }}>
                  <div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.12em", marginBottom: 8 }}>{t.k}</div>
                  <div style={{ ...mono(24, t.color ?? COLOR.ink1), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{t.v}</div>
                  <div style={{ ...mono(9, COLOR.ink5), marginTop: 7, lineHeight: 1.5 }}>{t.caption}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* SOCIAL SIGNAL — directly under the tiles so the intelligence isn't
            buried beneath the presenter list */}
        <div>
          <div style={{ ...eyebrow(COLOR.ink3), marginBottom: 12 }}>SOCIAL SIGNAL · THE CONVERSATION, NOT THE MEETING</div>
          {aboveThreshold && social ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* signal build — full-width, the page's main visual */}
              <div style={{ background: COLOR.surfaceCard, border: `1px solid ${COLOR.hair}`, borderRadius: 6, padding: "18px 20px" }}>
                <div style={{ ...mono(9.5, COLOR.ink5), letterSpacing: "0.1em", marginBottom: 8 }}>SIGNAL BUILD · POSTS PER DAY UNDER {congress.hashtags[0]}</div>
                <div style={{ fontFamily: FONT.serif, fontSize: 13, lineHeight: 1.55, color: COLOR.ink4, marginBottom: 14, maxWidth: 820 }}>
                  This is social volume, not attendance.
                </div>
                <VolumeChart c={congress} s={social} />
              </div>
              {/* voices | topics + what-we-don't-have */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
                <div style={{ background: COLOR.surfaceCard, border: `1px solid ${COLOR.hair}`, borderRadius: 6, padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={eyebrow(COLOR.ink3)}>TOP VOICES · BY POST VOLUME</div>
                    <div style={mono(10, COLOR.ink5)}>{INT.format(social.voices)} voices</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(() => {
                      // Share bar scaled to the leading voice, not 100% — the top
                      // account holds ~2% of an 11k-post conversation.
                      const maxShare = Math.max(1, ...social.top_voices.map((v) => v.share));
                      return social.top_voices.map((v, i) => {
                        const followers = followersByHandle[v.handle.toLowerCase()];
                        return (
                          <div key={v.handle} style={{ display: "grid", gridTemplateColumns: "22px 1fr 120px", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLOR.hair}` }}>
                            <div style={{ ...mono(11, COLOR.ink5), fontVariantNumeric: "tabular-nums" }}>{i + 1}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: COLOR.ink1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                              <div style={{ ...mono(10, COLOR.ink5), marginTop: 3 }}>
                                @{v.handle}{followers != null ? ` · ${COMPACT.format(followers)} followers` : ""}
                              </div>
                            </div>
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={mono(10, COLOR.ink3)}>{INT.format(v.posts)}</span>
                                <span style={mono(10, COLOR.ink4)}>{v.share}%</span>
                              </div>
                              <div style={{ height: 4, background: COLOR.hairStrong, borderRadius: 1, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${(v.share / maxShare) * 100}%`, background: COLOR.indigo, borderRadius: 1 }} />
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: COLOR.surfaceCard, border: `1px solid ${COLOR.hair}`, borderRadius: 6, padding: "18px 20px" }}>
                    <div style={{ ...eyebrow(COLOR.ink3), marginBottom: 6 }}>HOT TOPICS · CO-OCCURRING HASHTAGS</div>
                    <div style={{ fontFamily: FONT.serif, fontSize: 12.5, lineHeight: 1.5, color: COLOR.ink5, marginBottom: 14 }}>
                      Percent of the {INT.format(social.total_posts)} {congress.hashtags[0]} posts that also carry each tag. A post can carry several or none, so these don&rsquo;t sum to 100%.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                      {(() => {
                        // Bar scaled to the LEADING tag (top ~4%), not to 100% — otherwise every
                        // bar reads as empty. The % beside the bar keeps the absolute value.
                        const maxShare = Math.max(1, ...social.hot_hashtags.map((h) => h.share));
                        return social.hot_hashtags.map((h) => (
                          <div key={h.tag}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                              <span style={mono(12, COLOR.ink2)}>{h.tag}</span>
                              <span style={mono(11, COLOR.ink3)}>{h.share}%</span>
                            </div>
                            <div style={{ height: 5, background: COLOR.hairStrong, borderRadius: 1, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${(h.share / maxShare) * 100}%`, background: COLOR.indigo, borderRadius: 1 }} />
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                  <DontHavePanel hasAbstracts={hasAbstracts} />
                </div>
              </div>
            </div>
          ) : (
            // Honest empty state — below the 250/40 threshold (or no posts yet).
            <div style={{ background: COLOR.surfaceWell, border: `1px solid ${COLOR.hair}`, borderRadius: 6, padding: "18px 20px", maxWidth: 720 }}>
              <div style={{ fontFamily: FONT.serif, fontSize: 14.5, lineHeight: 1.6, color: COLOR.ink3 }}>
                {social
                  ? <>Captured so far: <span style={{ color: COLOR.ink1 }}>{INT.format(social.total_posts)} posts</span> from {INT.format(social.voices)} accounts under {congress.hashtags[0]}. Below our reporting threshold of {SOCIAL_THRESHOLD.posts} posts from {SOCIAL_THRESHOLD.accounts} accounts, we don&rsquo;t report share of voice or topic trend — the sample is too small to characterise. We&rsquo;d rather show you this than a number we can&rsquo;t stand behind.</>
                  : <>No posts captured under {congress.hashtags[0]} yet. We show nothing rather than an estimate.</>}
              </div>
              {social && (
                <div style={{ marginTop: 12, ...mono(10, COLOR.ink5) }}>{INT.format(social.total_posts)} / {SOCIAL_THRESHOLD.posts} posts toward the threshold</div>
              )}
            </div>
          )}
        </div>

        {/* CONFIRMED PRESENTERS — the deepest content, deliberately last:
            scrolling 47 cards is a choice, not an obstacle before the signal */}
        {hasAbstracts && (
          <div>
            {(() => {
              const ranks = presenters.map(cohortRank).filter((r): r is number => r != null);
              const lo = ranks.length ? Math.min(...ranks) : null;
              const hi = ranks.length ? Math.max(...ranks) : null;
              return (
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={eyebrow(COLOR.ink3)}>CONFIRMED PRESENTERS · FROM THE ABSTRACT LIST</div>
                  <div style={mono(10, COLOR.ink5)}>{presenters.length} tracked experts{lo != null && hi != null ? ` · board ranks #${lo}–#${hi}` : ""}</div>
                </div>
              );
            })()}
            {/* Bands key on the assigned-cohort rank — the same number the chip
                shows. Unclassified presenters get their own group rather than a
                fake placement in a numeric band. */}
            {BANDS.map((band, bi) => {
              const inBand = presenters.filter((p) => { const r = cohortRank(p); return r != null && bandIndex(r) === bi; });
              if (inBand.length === 0) return null;
              return (
                <div key={band.label} style={{ marginBottom: 18 }}>
                  <div style={{ ...mono(9.5, bi === 0 ? COLOR.amber : COLOR.ink4), letterSpacing: "0.14em", fontWeight: 600, marginBottom: 9, paddingBottom: 6, borderBottom: `1px solid ${COLOR.hair}` }}>
                    {band.label} <span style={{ color: COLOR.ink5 }}>· {inBand.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                    {inBand.map((p) => <PresenterCard key={p.speaker_key} p={p} />)}
                  </div>
                </div>
              );
            })}
            {(() => {
              const unclassified = presenters.filter((p) => cohortRank(p) == null);
              if (unclassified.length === 0) return null;
              return (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ ...mono(9.5, COLOR.ink5), letterSpacing: "0.14em", fontWeight: 600, marginBottom: 9, paddingBottom: 6, borderBottom: `1px solid ${COLOR.hair}` }}>
                    TRACKED · NO BOARD RANK IN THEIR COHORT <span style={{ color: COLOR.ink5 }}>· {unclassified.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                    {unclassified.map((p) => <PresenterCard key={p.speaker_key} p={p} />)}
                  </div>
                </div>
              );
            })()}
            {/* the two-population statement — stated plainly, not buried */}
            <div style={{ marginTop: 14, padding: "13px 15px", border: `1px solid ${COLOR.hair}`, borderRadius: 6, background: COLOR.surfaceWell, fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.6, color: COLOR.ink3, maxWidth: 900 }}>
              These {presenters.length} are confirmed from the abstract list — a fact, not an inference. Almost none of them appear in the {congress.hashtags[0]} conversation: a check of Heymach, Herbst, Govindan, Skoulidis, J&auml;nne, Sabari, and Rotow returned zero posts each. <span style={{ color: COLOR.ink1 }}>The conversation and the podium are different populations — social absence is not evidence of absence from the meeting.</span>
            </div>
          </div>
        )}

        {/* WHAT WE DON'T HAVE — lives in the voices/topics row above when social
            clears threshold; falls back to a trailing panel here otherwise. */}
        {!aboveThreshold && <DontHavePanel hasAbstracts={hasAbstracts} standalone />}

        {!loaded && <div style={mono(10, COLOR.ink5)}>Loading…</div>}
      </div>
    </AppLayout>
  );
}
