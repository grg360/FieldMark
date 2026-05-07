import json
from pathlib import Path


LOG_PATH = Path(r"C:\Users\garre\Desktop\FieldMark\hcp_dedup_merge_log.json")


def classify_error(error_text: str) -> str:
    text = (error_text or "").lower()
    if "publications_hcp_pubmed_unique" in text:
        return "publications_unique"
    if "trial_investigator_match_proposals" in text:
        return "trial_proposals_fk"
    if "npi_match_proposals" in text and "foreign key constraint" in text:
        return "npi_proposals_fk"
    if "foreign key constraint" in text:
        return "other_fk"
    return "other"


if __name__ == "__main__":
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        log = json.load(f)

    failed_clusters = log.get("failed_clusters")
    if not isinstance(failed_clusters, list) or not failed_clusters:
        decisions = log.get("decisions", [])
        failed_clusters = [d for d in decisions if d.get("status") == "failed"]

    categories = {
        "publications_unique": {"count": 0, "example": None},
        "trial_proposals_fk": {"count": 0, "example": None},
        "npi_proposals_fk": {"count": 0, "example": None},
        "other_fk": {"count": 0, "example": None},
        "other": {"count": 0, "example": None},
    }
    other_full_errors = []

    for failure in failed_clusters:
        err = str(failure.get("error") or "")
        category = classify_error(err)
        categories[category]["count"] += 1
        if categories[category]["example"] is None:
            categories[category]["example"] = err
        if category == "other":
            other_full_errors.append(err)

    print("Category | Count | Example")
    print("-" * 120)
    for name in [
        "publications_unique",
        "trial_proposals_fk",
        "npi_proposals_fk",
        "other_fk",
        "other",
    ]:
        example = categories[name]["example"] or ""
        if len(example) > 200:
            example = example[:200]
        print(f"{name} | {categories[name]['count']} | {example}")

    print(f"Total failed count: {len(failed_clusters)}")

    if other_full_errors:
        print("Full error messages for category 'other':")
        for err in other_full_errors:
            print(err)
