from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

PAGE_SIZE = 1000
LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json"
PROGRESS_EVERY = 10

MATCH_STATUSES = ["matched_high", "matched_medium"]


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def ns(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def parse_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def hcp_sort_key(row: Dict[str, Any]) -> Tuple[int, int, int, str]:
    total_career_pubs = parse_int(row.get("total_career_pubs"), 0)
    first_name_len = len(ns(row.get("first_name")))
    first_pub_year = parse_int(row.get("first_pub_year"), 9999)
    hcp_id = str(row.get("id") or "")
    return (total_career_pubs, first_name_len, -first_pub_year, hcp_id)


def first_non_empty(values: Sequence[Optional[str]]) -> Optional[str]:
    for v in values:
        s = ns(v)
        if s:
            return s
    return None


def fetch_matched_proposals(client: Client) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        batch = (
            client.table("npi_match_proposals")
            .select(
                "hcp_id,npi,match_status,npi_practice_city,npi_practice_state,npi_credentials,"
                "match_calculated_at,candidates_found"
            )
            .in_("match_status", MATCH_STATUSES)
            .not_.is_("npi", "null")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def fetch_hcps_by_ids(client: Client, hcp_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    if not hcp_ids:
        return out
    cols = (
        "id,first_name,last_name,middle_name,npi_number,total_career_pubs,first_pub_year,"
        "city,state,credentials"
    )
    ids = list({str(h) for h in hcp_ids if h})
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        batch = client.table("hcps").select(cols).in_("id", chunk).execute().data or []
        for row in batch:
            out[str(row["id"])] = row
    return out


def fetch_hcps_by_npis(client: Client, npis: Sequence[str]) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    if not npis:
        return out
    cols = (
        "id,first_name,last_name,middle_name,npi_number,total_career_pubs,first_pub_year,"
        "city,state,credentials"
    )
    uniq_npis = list({ns(n) for n in npis if ns(n)})
    for i in range(0, len(uniq_npis), 200):
        chunk = uniq_npis[i : i + 200]
        batch = client.table("hcps").select(cols).in_("npi_number", chunk).execute().data or []
        for row in batch:
            npi = ns(row.get("npi_number"))
            if npi:
                out[npi].append(row)
    return out


def build_clusters(client: Client) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    proposals = fetch_matched_proposals(client)
    by_npi: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for p in proposals:
        npi = ns(p.get("npi"))
        if npi:
            by_npi[npi].append(p)

    npis = list(by_npi.keys())
    hcps_by_npi = fetch_hcps_by_npis(client, npis)
    proposal_hcp_ids = [str(p.get("hcp_id")) for p in proposals if p.get("hcp_id")]
    hcps_by_id = fetch_hcps_by_ids(client, proposal_hcp_ids)

    clusters: List[Dict[str, Any]] = []
    for npi, props in by_npi.items():
        member_map: Dict[str, Dict[str, Any]] = {}
        for row in hcps_by_npi.get(npi, []):
            member_map[str(row["id"])] = row
        for p in props:
            hid = str(p.get("hcp_id") or "")
            if hid and hid in hcps_by_id:
                member_map[hid] = hcps_by_id[hid]
        members = list(member_map.values())
        if not members:
            continue
        canonical = sorted(members, key=hcp_sort_key, reverse=True)[0]
        canonical_id = str(canonical["id"])
        non_canonical_ids = sorted([str(m["id"]) for m in members if str(m["id"]) != canonical_id])
        practice_city = first_non_empty([p.get("npi_practice_city") for p in props])
        practice_state = first_non_empty([p.get("npi_practice_state") for p in props])
        npi_credentials = first_non_empty([p.get("npi_credentials") for p in props])
        clusters.append(
            {
                "npi": npi,
                "canonical_id": canonical_id,
                "canonical": canonical,
                "members": sorted(members, key=lambda x: str(x.get("id"))),
                "non_canonical_ids": non_canonical_ids,
                "proposal_count": len(props),
                "proposal_context": {
                    "npi_practice_city": practice_city,
                    "npi_practice_state": practice_state,
                    "npi_credentials": npi_credentials,
                },
            }
        )
    clusters.sort(key=lambda c: c["npi"])
    return clusters, proposals


def count_rows_for_hcps(client: Client, table: str, hcp_ids: Sequence[str]) -> int:
    if not hcp_ids:
        return 0
    total = 0
    ids = list({str(h) for h in hcp_ids if h})
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        resp = (
            client.table(table)
            .select("id", count="estimated")
            .in_("hcp_id", chunk)
            .limit(1)
            .execute()
        )
        total += int(resp.count or 0)
    return total


def count_hcp_ta_migrations(client: Client, canonical_id: str, non_canonical_ids: Sequence[str]) -> int:
    if not non_canonical_ids:
        return 0
    canonical_rows = (
        client.table("hcp_therapeutic_areas")
        .select("therapeutic_area_id")
        .eq("hcp_id", canonical_id)
        .execute()
        .data
        or []
    )
    canonical_tas = {str(r["therapeutic_area_id"]) for r in canonical_rows if r.get("therapeutic_area_id")}
    move_rows = (
        client.table("hcp_therapeutic_areas")
        .select("therapeutic_area_id")
        .in_("hcp_id", list(non_canonical_ids))
        .execute()
        .data
        or []
    )
    unique_noncanonical_tas = {str(r["therapeutic_area_id"]) for r in move_rows if r.get("therapeutic_area_id")}
    return len(unique_noncanonical_tas - canonical_tas)


def migrate_hcp_therapeutic_areas(client: Client, canonical_id: str, non_canonical_ids: Sequence[str]) -> int:
    if not non_canonical_ids:
        return 0
    canonical_rows = (
        client.table("hcp_therapeutic_areas")
        .select("therapeutic_area_id")
        .eq("hcp_id", canonical_id)
        .execute()
        .data
        or []
    )
    canonical_tas = {str(r["therapeutic_area_id"]) for r in canonical_rows if r.get("therapeutic_area_id")}

    source_rows = (
        client.table("hcp_therapeutic_areas")
        .select("therapeutic_area_id,strength_score,last_calculated")
        .in_("hcp_id", list(non_canonical_ids))
        .execute()
        .data
        or []
    )
    to_insert: List[Dict[str, Any]] = []
    for r in source_rows:
        tid = str(r.get("therapeutic_area_id") or "")
        if not tid or tid in canonical_tas:
            continue
        canonical_tas.add(tid)
        to_insert.append(
            {
                "hcp_id": canonical_id,
                "therapeutic_area_id": tid,
                "strength_score": r.get("strength_score"),
                "last_calculated": r.get("last_calculated"),
            }
        )
    if to_insert:
        client.table("hcp_therapeutic_areas").upsert(
            to_insert,
            on_conflict="hcp_id,therapeutic_area_id",
            ignore_duplicates=True,
        ).execute()
    client.table("hcp_therapeutic_areas").delete().in_("hcp_id", list(non_canonical_ids)).execute()
    return len(to_insert)


def migrate_npi_match_proposals(
    client: Client,
    canonical_id: str,
    non_canonical_ids: Sequence[str],
    cluster_id: str,
    dry_run: bool,
) -> Tuple[int, List[Dict[str, Any]]]:
    if not non_canonical_ids:
        return 0, []
    moved = 0
    proposal_actions: List[Dict[str, Any]] = []
    for nid in non_canonical_ids:
        rows = (
            client.table("npi_match_proposals")
            .select("*")
            .eq("hcp_id", nid)
            .execute()
            .data
            or []
        )
        if not rows:
            continue
        for row in rows:
            proposal_id = row.get("id")
            proposal_npi = ns(row.get("npi"))
            action_obj: Dict[str, Any] = {
                "cluster_id": cluster_id,
                "source_hcp_id": nid,
                "canonical_hcp_id": canonical_id,
                "npi": proposal_npi,
                "action": None,
                "error": None,
            }
            try:
                canonical_for_npi = (
                    client.table("npi_match_proposals")
                    .select("id")
                    .eq("hcp_id", canonical_id)
                    .eq("npi", proposal_npi)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if canonical_for_npi:
                    action_obj["action"] = "deleted_duplicate"
                    if not dry_run:
                        client.table("npi_match_proposals").delete().eq("id", proposal_id).execute()
                else:
                    action_obj["action"] = "migrated"
                    if not dry_run:
                        client.table("npi_match_proposals").update({"hcp_id": canonical_id}).eq(
                            "id", proposal_id
                        ).execute()
                    moved += 1
            except Exception as exc:
                action_obj["error"] = repr(exc)
                # Continue processing remaining proposals in this cluster.
                # Errors are logged in the action_obj and surface in the final summary.
            proposal_actions.append(action_obj)
    return moved, proposal_actions


def merge_cluster_execute(client: Client, cluster: Dict[str, Any]) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    canonical_id = cluster["canonical_id"]
    non_canonical_ids: List[str] = cluster["non_canonical_ids"]
    npi = cluster["npi"]
    ctx = cluster["proposal_context"]
    if not non_canonical_ids:
        # Still apply canonical update from proposal context.
        canonical = (
            client.table("hcps")
            .select("id,npi_number,city,state,credentials")
            .eq("id", canonical_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if canonical:
            c = canonical[0]
            update_payload = {"npi_number": npi}
            if not ns(c.get("city")) and ns(ctx.get("npi_practice_city")):
                update_payload["city"] = ns(ctx.get("npi_practice_city"))
            if not ns(c.get("state")) and ns(ctx.get("npi_practice_state")):
                update_payload["state"] = ns(ctx.get("npi_practice_state"))
            if not ns(c.get("credentials")) and ns(ctx.get("npi_credentials")):
                update_payload["credentials"] = ns(ctx.get("npi_credentials"))
            client.table("hcps").update(update_payload).eq("id", canonical_id).execute()
        return {
            "publications_migrated": 0,
            "trial_investigators_migrated": 0,
            "hcp_therapeutic_areas_migrated": 0,
            "hcp_scores_deleted": 0,
            "npi_match_proposals_repointed": 0,
            "hcps_deleted": 0,
        }, []

    pubs = count_rows_for_hcps(client, "publications", non_canonical_ids)
    trials = count_rows_for_hcps(client, "trial_investigators", non_canonical_ids)
    scores = count_rows_for_hcps(client, "hcp_scores", non_canonical_ids)
    moved_tas = migrate_hcp_therapeutic_areas(client, canonical_id, non_canonical_ids)
    moved_props, proposal_actions = migrate_npi_match_proposals(
        client,
        canonical_id,
        non_canonical_ids,
        cluster_id=npi,
        dry_run=False,
    )

    client.table("publications").update({"hcp_id": canonical_id}).in_("hcp_id", non_canonical_ids).execute()
    client.table("trial_investigators").update({"hcp_id": canonical_id}).in_("hcp_id", non_canonical_ids).execute()
    client.table("hcp_scores").delete().in_("hcp_id", non_canonical_ids).execute()
    client.table("hcps").delete().in_("id", non_canonical_ids).execute()

    canonical_rows = (
        client.table("hcps")
        .select("id,npi_number,city,state,credentials")
        .eq("id", canonical_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if canonical_rows:
        c = canonical_rows[0]
        update_payload = {"npi_number": npi}
        if not ns(c.get("city")) and ns(ctx.get("npi_practice_city")):
            update_payload["city"] = ns(ctx.get("npi_practice_city"))
        if not ns(c.get("state")) and ns(ctx.get("npi_practice_state")):
            update_payload["state"] = ns(ctx.get("npi_practice_state"))
        if not ns(c.get("credentials")) and ns(ctx.get("npi_credentials")):
            update_payload["credentials"] = ns(ctx.get("npi_credentials"))
        client.table("hcps").update(update_payload).eq("id", canonical_id).execute()

    return {
        "publications_migrated": pubs,
        "trial_investigators_migrated": trials,
        "hcp_therapeutic_areas_migrated": moved_tas,
        "hcp_scores_deleted": scores,
        "npi_match_proposals_repointed": moved_props,
        "hcps_deleted": len(non_canonical_ids),
    }, proposal_actions


def merge_cluster_dry_run(client: Client, cluster: Dict[str, Any]) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    canonical_id = cluster["canonical_id"]
    non_canonical_ids: List[str] = cluster["non_canonical_ids"]
    pubs = count_rows_for_hcps(client, "publications", non_canonical_ids)
    trials = count_rows_for_hcps(client, "trial_investigators", non_canonical_ids)
    scores = count_rows_for_hcps(client, "hcp_scores", non_canonical_ids)
    moved_tas = count_hcp_ta_migrations(client, canonical_id, non_canonical_ids)
    moved_props, proposal_actions = migrate_npi_match_proposals(
        client,
        canonical_id,
        non_canonical_ids,
        cluster_id=cluster["npi"],
        dry_run=True,
    )
    return {
        "publications_migrated": pubs,
        "trial_investigators_migrated": trials,
        "hcp_therapeutic_areas_migrated": moved_tas,
        "hcp_scores_deleted": scores,
        "npi_match_proposals_repointed": moved_props,
        "hcps_deleted": len(non_canonical_ids),
    }, proposal_actions


def print_cluster(cluster: Dict[str, Any], counters: Dict[str, int], dry_run: bool) -> None:
    mode = "DRY-RUN" if dry_run else "EXECUTE"
    print(f"\n[{mode}] NPI {cluster['npi']}")
    print(f"  Canonical: {cluster['canonical_id']}")
    for m in cluster["members"]:
        print(
            "  - "
            f"id={m.get('id')} name={ns(m.get('first_name'))} {ns(m.get('last_name'))} "
            f"npi={ns(m.get('npi_number'))} pubs={parse_int(m.get('total_career_pubs'), 0)} "
            f"first_pub_year={parse_int(m.get('first_pub_year'), 9999)}"
        )
    print(f"  Non-canonical ids: {cluster['non_canonical_ids']}")
    print(
        "  Would migrate -> "
        f"publications={counters['publications_migrated']}, "
        f"trial_investigators={counters['trial_investigators_migrated']}, "
        f"hcp_therapeutic_areas={counters['hcp_therapeutic_areas_migrated']}, "
        f"hcp_scores_deleted={counters['hcp_scores_deleted']}, "
        f"npi_match_proposals={counters['npi_match_proposals_repointed']}, "
        f"hcps_deleted={counters['hcps_deleted']}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge duplicate HCP clusters surfaced by NPI conflicts in npi_match_proposals."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually perform merge writes/deletes. Default is dry-run.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dry_run = not args.execute
    load_dotenv()
    client = init_supabase()

    clusters, _proposals = build_clusters(client)
    total_noncanonical = sum(len(c["non_canonical_ids"]) for c in clusters)
    print(f"Loaded {len(clusters)} clusters from npi_match_proposals matched tiers.")
    print(f"Total non-canonical records identified: {total_noncanonical}")

    if not dry_run:
        answer = input(
            f"About to merge {len(clusters)} clusters. This will DELETE {total_noncanonical} records from hcps. Continue? (yes/no): "
        ).strip().lower()
        if answer != "yes":
            print("Execution cancelled.")
            return

    summary: Counter[str] = Counter()
    failed: List[Dict[str, Any]] = []
    decisions: List[Dict[str, Any]] = []

    for i, cluster in enumerate(clusters, start=1):
        try:
            if dry_run:
                counters, proposal_actions = merge_cluster_dry_run(client, cluster)
            else:
                counters, proposal_actions = merge_cluster_execute(client, cluster)
            print_cluster(cluster, counters, dry_run)
            summary.update(counters)
            decisions.append(
                {
                    "cluster_index": i,
                    "npi": cluster["npi"],
                    "canonical_id": cluster["canonical_id"],
                    "non_canonical_ids": cluster["non_canonical_ids"],
                    "proposal_context": cluster["proposal_context"],
                    "members": cluster["members"],
                    "counters": counters,
                    "proposal_actions": proposal_actions,
                    "status": "ok",
                    "mode": "dry_run" if dry_run else "execute",
                }
            )
        except Exception as exc:
            error_obj = {
                "cluster_index": i,
                "npi": cluster.get("npi"),
                "canonical_id": cluster.get("canonical_id"),
                "non_canonical_ids": cluster.get("non_canonical_ids"),
                "error": repr(exc),
            }
            failed.append(error_obj)
            decisions.append({**error_obj, "status": "failed", "mode": "dry_run" if dry_run else "execute"})
            print(f"\n[ERROR] Cluster NPI {cluster.get('npi')} failed: {exc}")

        if i % PROGRESS_EVERY == 0 or i == len(clusters):
            print(f"Progress: processed {i}/{len(clusters)} clusters")

    print("\n=== Dedup Merge Summary ===")
    print(f"Mode: {'DRY-RUN' if dry_run else 'EXECUTE'}")
    print(f"Total clusters processed: {len(clusters)}")
    print(f"Total records merged into canonical (non-canonical deletes): {summary['hcps_deleted']}")
    print(f"Total records remaining as canonical (one per cluster): {len(clusters)}")
    print(f"Total publications migrated: {summary['publications_migrated']}")
    print(f"Total trial_investigators migrated: {summary['trial_investigators_migrated']}")
    print(f"Total hcp_therapeutic_areas migrated: {summary['hcp_therapeutic_areas_migrated']}")
    print(f"Total hcp_scores deleted: {summary['hcp_scores_deleted']}")
    print(f"Failed clusters: {len(failed)}")
    if failed:
        for f in failed:
            print(
                "  "
                f"npi={f.get('npi')} canonical_id={f.get('canonical_id')} "
                f"non_canonical_ids={f.get('non_canonical_ids')} error={f.get('error')}"
            )

    log_obj = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "dry_run" if dry_run else "execute",
        "clusters_total": len(clusters),
        "summary": dict(summary),
        "failed_clusters": failed,
        "decisions": decisions,
    }
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log_obj, f, indent=2)
    print(f"\nSaved log: {LOG_PATH}")


if __name__ == "__main__":
    main()
