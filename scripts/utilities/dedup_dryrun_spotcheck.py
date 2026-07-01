import json
from pathlib import Path


LOG_PATH = Path(r"C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json")


def val(x):
    return "" if x is None else str(x)


def format_member_line(member):
    member_id = val(member.get("id"))
    first = val(member.get("first_name"))
    middle = val(member.get("middle_name"))
    last = val(member.get("last_name"))
    npi = val(member.get("npi_number"))
    pubs = val(member.get("total_career_pubs"))
    first_pub_year = val(member.get("first_pub_year"))
    name = " ".join(part for part in [first, middle, last] if part).strip()
    return (
        f"  - id={member_id[:8]}  name={name}  npi={npi}  "
        f"pubs={pubs}  first_pub_year={first_pub_year}"
    )


if __name__ == "__main__":
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        log = json.load(f)

    decisions = log.get("decisions", [])
    non_empty = [d for d in decisions if d.get("non_canonical_ids")]

    print(
        f"Total decisions: {len(decisions)} | "
        f"Decisions with non-canonical IDs: {len(non_empty)}"
    )

    for decision in non_empty[:10]:
        print("----------------------------------------")
        print(f"Cluster index: {decision.get('cluster_index')}")
        print(f"NPI: {decision.get('npi')}")
        print(f"Canonical id: {decision.get('canonical_id')}")
        non_canonical_ids = decision.get("non_canonical_ids") or []
        print(f"Non-canonical count: {len(non_canonical_ids)}")
        print("Members:")
        members = decision.get("members") or []
        for member in members:
            print(format_member_line(member))

        counters = decision.get("counters", {})
        print(
            "Counters: "
            f"pubs_migrated={counters.get('publications_migrated', 0)}, "
            f"trials_migrated={counters.get('trial_investigators_migrated', 0)}, "
            f"ta_migrated={counters.get('hcp_therapeutic_areas_migrated', 0)}, "
            f"scores_deleted={counters.get('hcp_scores_deleted', 0)}, "
            f"proposals_repointed={counters.get('npi_match_proposals_repointed', 0)}, "
            f"hcps_deleted={counters.get('hcps_deleted', 0)}"
        )

    dist = {"1": 0, "2": 0, "3": 0, "4": 0, "5+": 0}
    total_members = 0
    for decision in non_empty:
        n = len(decision.get("non_canonical_ids") or [])
        total_members += len(decision.get("members") or [])
        if n == 1:
            dist["1"] += 1
        elif n == 2:
            dist["2"] += 1
        elif n == 3:
            dist["3"] += 1
        elif n == 4:
            dist["4"] += 1
        elif n >= 5:
            dist["5+"] += 1

    print("----------------------------------------")
    print("Distribution of non-canonical count:")
    print(f"1: {dist['1']}")
    print(f"2: {dist['2']}")
    print(f"3: {dist['3']}")
    print(f"4: {dist['4']}")
    print(f"5+: {dist['5+']}")
    print(f"Total members across all non-empty clusters: {total_members}")
