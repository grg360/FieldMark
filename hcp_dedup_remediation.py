import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client


INPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json"
OUTPUT_LOG_PATH = r"C:\Users\garre\Desktop\FieldMark\hcp_dedup_remediation_log_may6.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", default=False)
    return parser.parse_args()


def get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise EnvironmentError(f"Missing required environment variable: {name}")
    return value


def init_supabase() -> Client:
    return create_client(get_required_env("SUPABASE_URL"), get_required_env("SUPABASE_KEY"))


def load_failed_clusters() -> List[Dict[str, Any]]:
    with open(INPUT_LOG_PATH, "r", encoding="utf-8") as f:
        payload = json.load(f)

    failed_clusters = payload.get("failed_clusters")
    if isinstance(failed_clusters, list) and failed_clusters:
        return failed_clusters

    decisions = payload.get("decisions", [])
    return [d for d in decisions if d.get("status") == "failed"]


def existing_non_canonical_ids(client: Client, ids: Sequence[str]) -> List[str]:
    if not ids:
        return []
    rows = client.table("hcps").select("id").in_("id", list(ids)).execute().data or []
    return [str(r["id"]) for r in rows if r.get("id")]


def action_name(base: str, execute: bool) -> str:
    return base if execute else f"would_{base}"


def remediate_publications(
    client: Client,
    cluster_npi: str,
    canonical_id: str,
    source_hcp_id: str,
    execute: bool,
) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    pubs = (
        client.table("publications")
        .select("id,pubmed_id")
        .eq("hcp_id", source_hcp_id)
        .execute()
        .data
        or []
    )
    for pub in pubs:
        pub_id = pub.get("id")
        pubmed_id = pub.get("pubmed_id")
        entry: Dict[str, Any] = {
            "cluster_npi": cluster_npi,
            "source_hcp_id": source_hcp_id,
            "canonical_id": canonical_id,
            "publication_id": pub_id,
            "pubmed_id": pubmed_id,
            "action": None,
            "error": None,
        }
        try:
            existing = (
                client.table("publications")
                .select("id")
                .eq("hcp_id", canonical_id)
                .eq("pubmed_id", pubmed_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if existing:
                entry["action"] = action_name("deleted_duplicate_publication", execute)
                if execute:
                    client.table("publications").delete().eq("id", pub_id).execute()
            else:
                entry["action"] = action_name("migrated_publication", execute)
                if execute:
                    client.table("publications").update({"hcp_id": canonical_id}).eq("id", pub_id).execute()
        except Exception as exc:
            entry["error"] = repr(exc)
            if entry.get("action"):
                entry["action"] = "failed_" + str(entry["action"])
            else:
                entry["action"] = "failed_publication_lookup"
        actions.append(entry)
    return actions


def remediate_trial_proposals(
    client: Client,
    cluster_npi: str,
    canonical_id: str,
    source_hcp_id: str,
    execute: bool,
) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    proposals = (
        client.table("trial_investigator_match_proposals")
        .select("id,trial_investigator_id")
        .eq("proposed_hcp_id", source_hcp_id)
        .execute()
        .data
        or []
    )
    for prop in proposals:
        prop_id = prop.get("id")
        trial_investigator_id = prop.get("trial_investigator_id")
        entry: Dict[str, Any] = {
            "cluster_npi": cluster_npi,
            "source_hcp_id": source_hcp_id,
            "canonical_id": canonical_id,
            "trial_proposal_id": prop_id,
            "trial_investigator_id": trial_investigator_id,
            "action": None,
            "error": None,
        }
        try:
            existing = (
                client.table("trial_investigator_match_proposals")
                .select("id")
                .eq("proposed_hcp_id", canonical_id)
                .eq("trial_investigator_id", trial_investigator_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if existing:
                entry["action"] = action_name("deleted_duplicate_trial_proposal", execute)
                if execute:
                    client.table("trial_investigator_match_proposals").delete().eq("id", prop_id).execute()
            else:
                entry["action"] = action_name("migrated_trial_proposal", execute)
                if execute:
                    client.table("trial_investigator_match_proposals").update(
                        {"proposed_hcp_id": canonical_id}
                    ).eq("id", prop_id).execute()
        except Exception as exc:
            entry["error"] = repr(exc)
            if entry.get("action"):
                entry["action"] = "failed_" + str(entry["action"])
            else:
                entry["action"] = "failed_trial_proposal_lookup"
        actions.append(entry)
    return actions


def count_rows_for_hcp(client: Client, table: str, hcp_id: str) -> int:
    rows = client.table(table).select("id").eq("hcp_id", hcp_id).execute().data or []
    return len(rows)


def print_summary(mode: str, summary: Counter[str]) -> None:
    print("\n" + "=" * 72)
    print("Remediation Summary")
    print("=" * 72)
    print(f"Mode: {mode}")
    print(f"Total clusters processed: {summary['clusters_processed']}")
    print(f"Total publications migrated: {summary['publications_migrated']}")
    print(f"Total publications deleted as duplicates: {summary['publications_deleted_duplicate']}")
    print(f"Total publications failed during remediation: {summary['publications_failed']}")
    print(f"Total trial proposals migrated: {summary['trial_proposals_migrated']}")
    print(f"Total trial proposals deleted as duplicates: {summary['trial_proposals_deleted_duplicate']}")
    print(f"Total trial proposals failed during remediation: {summary['trial_proposals_failed']}")
    print(f"Total trial_investigators updated: {summary['trial_investigators_updated']}")
    print(f"Total hcp_scores deleted: {summary['hcp_scores_deleted']}")
    print(f"Total hcps deleted: {summary['hcps_deleted']}")
    print(
        "Cluster count: "
        f"ok={summary['cluster_ok']} / "
        f"already_remediated={summary['cluster_already_remediated']} / "
        f"failed={summary['cluster_failed']}"
    )


if __name__ == "__main__":
    args = parse_args()
    execute = args.execute
    mode = "EXECUTE" if execute else "DRY-RUN"

    load_dotenv()
    client = init_supabase()

    failed_clusters = load_failed_clusters()
    total_failed_clusters = len(failed_clusters)

    if execute:
        answer = input(
            "About to remediate 52 failed clusters. This will write to publications, \n"
            " trial_investigator_match_proposals, hcp_scores, trial_investigators, and \n"
            " delete from hcps. Continue? (yes/no): "
        )
        if answer != "yes":
            print("Execution cancelled.")
            sys.exit(0)

    decisions: List[Dict[str, Any]] = []
    summary: Counter[str] = Counter()

    for idx, cluster in enumerate(failed_clusters, start=1):
        cluster_npi = str(cluster.get("npi") or "")
        canonical_id = str(cluster.get("canonical_id") or "")
        non_canonical_ids = [str(x) for x in (cluster.get("non_canonical_ids") or []) if x]

        print(f"\n[{mode}] Cluster {idx}/{total_failed_clusters} NPI={cluster_npi}")
        cluster_log: Dict[str, Any] = {
            "cluster_npi": cluster_npi,
            "canonical_id": canonical_id,
            "non_canonical_ids": non_canonical_ids,
            "publication_actions": [],
            "trial_proposal_actions": [],
            "trial_investigators_updated": 0,
            "hcp_scores_deleted": 0,
            "hcps_deleted": 0,
            "final_status": None,
            "error": None,
        }

        try:
            existing_ids = existing_non_canonical_ids(client, non_canonical_ids)
            if not existing_ids:
                cluster_log["final_status"] = "already_remediated"
                decisions.append(cluster_log)
                summary["cluster_already_remediated"] += 1
                summary["clusters_processed"] += 1
                if idx % 10 == 0 or idx == total_failed_clusters:
                    print(f"Progress: processed {idx}/{total_failed_clusters} clusters")
                continue

            for source_hcp_id in existing_ids:
                pub_actions = remediate_publications(
                    client, cluster_npi, canonical_id, source_hcp_id, execute
                )
                cluster_log["publication_actions"].extend(pub_actions)

                trial_actions = remediate_trial_proposals(
                    client, cluster_npi, canonical_id, source_hcp_id, execute
                )
                cluster_log["trial_proposal_actions"].extend(trial_actions)

                try:
                    ti_count = count_rows_for_hcp(client, "trial_investigators", source_hcp_id)
                    if execute and ti_count > 0:
                        client.table("trial_investigators").update({"hcp_id": canonical_id}).eq(
                            "hcp_id", source_hcp_id
                        ).execute()
                    cluster_log["trial_investigators_updated"] += ti_count
                except Exception as exc:
                    cluster_log["error"] = repr(exc)
                    raise

                try:
                    scores_count = count_rows_for_hcp(client, "hcp_scores", source_hcp_id)
                    if execute and scores_count > 0:
                        client.table("hcp_scores").delete().eq("hcp_id", source_hcp_id).execute()
                    cluster_log["hcp_scores_deleted"] += scores_count
                except Exception as exc:
                    cluster_log["error"] = repr(exc)
                    raise

            try:
                if execute:
                    client.table("hcps").delete().in_("id", existing_ids).execute()
                    cluster_log["hcps_deleted"] = len(existing_ids)
                else:
                    cluster_log["hcps_deleted"] = len(existing_ids)
                    cluster_log["would_delete_hcps"] = True
            except Exception as exc:
                cluster_log["error"] = repr(exc)
                raise

            cluster_log["final_status"] = "ok"

            for action in cluster_log["publication_actions"]:
                action_name_str = str(action.get("action") or "")
                if action_name_str.startswith("failed_"):
                    summary["publications_failed"] += 1
                    continue
                if "migrated_publication" in action_name_str:
                    summary["publications_migrated"] += 1
                if "deleted_duplicate_publication" in action_name_str:
                    summary["publications_deleted_duplicate"] += 1

            for action in cluster_log["trial_proposal_actions"]:
                action_name_str = str(action.get("action") or "")
                if action_name_str.startswith("failed_"):
                    summary["trial_proposals_failed"] += 1
                    continue
                if "migrated_trial_proposal" in action_name_str:
                    summary["trial_proposals_migrated"] += 1
                if "deleted_duplicate_trial_proposal" in action_name_str:
                    summary["trial_proposals_deleted_duplicate"] += 1

            summary["trial_investigators_updated"] += cluster_log["trial_investigators_updated"]
            summary["hcp_scores_deleted"] += cluster_log["hcp_scores_deleted"]
            summary["hcps_deleted"] += cluster_log["hcps_deleted"]
            summary["cluster_ok"] += 1

        except Exception as exc:
            cluster_log["final_status"] = "failed"
            if cluster_log["error"] is None:
                cluster_log["error"] = repr(exc)
            summary["cluster_failed"] += 1

        decisions.append(cluster_log)
        summary["clusters_processed"] += 1

        if idx % 10 == 0 or idx == total_failed_clusters:
            print(f"Progress: processed {idx}/{total_failed_clusters} clusters")

    print_summary(mode, summary)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "execute" if execute else "dry_run",
        "total_failed_clusters": total_failed_clusters,
        "summary": dict(summary),
        "decisions": decisions,
    }
    with open(OUTPUT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"Saved remediation log: {OUTPUT_LOG_PATH}")
