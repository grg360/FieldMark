"""
tools/ta_audit.py

Crawls the FieldMark codebase and produces a structured audit of every
TA-coupled assumption. Output: TA_AUDIT_REPORT.md — a categorized
checklist of refactor candidates.

Usage:
    python tools/ta_audit.py
    python tools/ta_audit.py --root . --output TA_AUDIT_REPORT.md
    python tools/ta_audit.py --include-tests   # also scan test files

Categories:
    A — Display strings (UI labels with TA-specific text)
    B — Routing/slugs (URL parameters, already parameterized)
    C — Hardcoded UUIDs (TA-specific UUIDs referenced inline)
    D — Indication taxonomy (TA-specific indication lists)
    E — Validation data (test HCPs, sample IDs specific to current TA)
    F — Methodology/prompts (TA-specific scoring or narrative logic)
    G — Pipeline arguments (scripts that need TA parameterization)
    H — SQL queries (TA filters in SQL inside frontend or pipelines)
"""

import argparse
import os
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

# TA-specific patterns to detect
TA_KEYWORDS = [
    "nsclc",
    "NSCLC",
    "non-small cell lung",
    "non-small-cell lung",
    "Oncology",  # broader, but flag for context
    "oncology",
]

KNOWN_INDICATIONS = [
    "CAR-T", "DLBCL", "Melanoma", "CLL", "AML",
    "Breast", "Prostate", "Colorectal", "Bladder",
]

# Known TA UUIDs from your DB (NSCLC, then others as they exist)
TA_UUIDS = {
    "c0065b03-a25e-4e9a-bde4-4b4d0db7827d": "NSCLC",
    # Add more as we identify them
}

# Validation HCP names baked into code
VALIDATION_HCP_NAMES = [
    "Singh", "Sanborn", "Heymach", "Janne", "Jänne",
    "Le", "Sands", "Manochakian", "Aggarwal", "Langer",
    "Cohen", "Marmarelis",
]

# File extensions to scan
SCAN_EXTENSIONS = [".py", ".ts", ".tsx", ".sql", ".md"]

# Directories to skip
SKIP_DIRS = [
    "node_modules", "__pycache__", ".git", ".next", "dist",
    "build", ".venv", "venv", "site-packages",
]


def should_scan(path: Path) -> bool:
    if not path.suffix in SCAN_EXTENSIONS:
        return False
    for part in path.parts:
        if part in SKIP_DIRS:
            return False
    return True


def find_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and should_scan(path):
            yield path


def categorize_hit(file_path: str, line: str, keyword: str) -> str:
    """Categorize a TA reference based on file location and line content."""
    file_lower = file_path.lower()
    line_lower = line.lower()

    # Routing — slug params already parameterized
    if "/landscape/" in line_lower or "/institution" in line_lower or "/institutions" in line_lower:
        if "${" in line or ":ta" in line:
            return "B"  # parameterized routing
    
    # SQL queries
    if file_path.endswith(".sql") or "from hcp_" in line_lower:
        return "H"
    
    # Pipeline scripts
    if "pipelines/" in file_path.replace("\\", "/"):
        return "G"
    
    # Methodology / prompts
    if "methodology" in file_lower or "prompt" in file_lower or "narrative" in file_lower:
        return "F"
    
    # Display strings — JSX/TSX with quoted strings
    if file_path.endswith((".tsx", ".ts")):
        if f'"{keyword}"' in line or f"'{keyword}'" in line or f">{keyword}<" in line:
            return "A"
    
    return "A"  # default to display string


def scan_file(path: Path) -> list:
    """Return list of (line_number, line_text, keyword, category) tuples."""
    hits = []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, 1):
                line_stripped = line.strip()
                if not line_stripped or line_stripped.startswith("//") or line_stripped.startswith("#"):
                    continue  # skip comments
                
                # Check TA keywords
                for kw in TA_KEYWORDS:
                    if kw in line:
                        cat = categorize_hit(str(path), line, kw)
                        hits.append((i, line_stripped[:120], kw, cat))
                        break  # one keyword per line is enough
                
                # Check UUIDs
                for uuid, ta_name in TA_UUIDS.items():
                    if uuid in line:
                        hits.append((i, line_stripped[:120], f"UUID:{ta_name}", "C"))
                
                # Check indications
                for ind in KNOWN_INDICATIONS:
                    if f'"{ind}"' in line or f"'{ind}'" in line:
                        hits.append((i, line_stripped[:120], f"IND:{ind}", "D"))
                
                # Check validation HCP names
                for name in VALIDATION_HCP_NAMES:
                    if f'"{name}"' in line or f"'{name}'" in line:
                        hits.append((i, line_stripped[:120], f"HCP:{name}", "E"))
    except Exception as e:
        print(f"Error scanning {path}: {e}")
    return hits


def estimate_lift(category: str, hit_count: int) -> str:
    """Rough estimate: S/M/L lift to refactor this category."""
    if category == "B":
        return "S"  # already parameterized
    if category == "A" and hit_count < 5:
        return "S"
    if category in ("A", "D"):
        return "M"
    if category in ("C", "E", "G", "H"):
        return "M"
    if category == "F":
        return "L"  # methodology/prompt refactor is real work
    return "M"


def category_description(cat: str) -> str:
    descriptions = {
        "A": "Display strings (UI labels with TA-specific text)",
        "B": "Routing/slugs (URL parameters, already parameterized)",
        "C": "Hardcoded UUIDs (TA-specific UUIDs referenced inline)",
        "D": "Indication taxonomy (TA-specific indication lists)",
        "E": "Validation data (test HCPs, sample IDs)",
        "F": "Methodology/prompts (TA-specific scoring or narrative logic)",
        "G": "Pipeline arguments (scripts needing TA parameterization)",
        "H": "SQL queries (TA filters in SQL)",
    }
    return descriptions.get(cat, "Unknown")


def generate_report(all_hits: dict, output_path: Path):
    """Generate the markdown audit report."""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("# TA Expansion Audit Report\n\n")
        f.write(f"_Generated: {date.today().isoformat()}_\n\n")
        
        # Summary
        total_files = len(all_hits)
        total_hits = sum(len(hits) for hits in all_hits.values())
        
        f.write("## Summary\n\n")
        f.write(f"- Files with TA-coupled references: **{total_files}**\n")
        f.write(f"- Total references found: **{total_hits}**\n\n")
        
        # Category breakdown
        cat_counts = defaultdict(int)
        for hits in all_hits.values():
            for hit in hits:
                cat_counts[hit[3]] += 1
        
        f.write("### By Category\n\n")
        f.write("| Category | Description | Count | Lift |\n")
        f.write("|---|---|---|---|\n")
        for cat in sorted(cat_counts.keys()):
            lift = estimate_lift(cat, cat_counts[cat])
            f.write(f"| {cat} | {category_description(cat)} | {cat_counts[cat]} | {lift} |\n")
        f.write("\n")
        
        # File-by-file detail, sorted by hit count descending
        f.write("## Detailed Findings\n\n")
        files_sorted = sorted(all_hits.items(), key=lambda x: -len(x[1]))
        
        for file_path, hits in files_sorted:
            f.write(f"### `{file_path}` ({len(hits)} references)\n\n")
            
            # Group by category within file
            by_cat = defaultdict(list)
            for hit in hits:
                by_cat[hit[3]].append(hit)
            
            for cat in sorted(by_cat.keys()):
                f.write(f"**Category {cat} — {category_description(cat)}**\n\n")
                for line_no, line_text, kw, _ in by_cat[cat][:10]:  # cap at 10 per category per file
                    f.write(f"- Line {line_no}: `{line_text}` (matched: `{kw}`)\n")
                if len(by_cat[cat]) > 10:
                    f.write(f"- _...and {len(by_cat[cat]) - 10} more_\n")
                f.write("\n")
        
        # Recommendations
        f.write("## Recommendations\n\n")
        f.write("### Phase 1: Quick wins (Small lift)\n")
        f.write("- Category B references are already parameterized; no action needed.\n")
        f.write("- Category A display strings: parameterize via a single TA name lookup.\n\n")
        
        f.write("### Phase 2: Medium lift\n")
        f.write("- Create a `TA Definition` config file that holds:\n")
        f.write("  - TA slug + display name\n")
        f.write("  - TA UUID (replaces Category C hardcoded UUIDs)\n")
        f.write("  - Indication taxonomy (replaces Category D inline lists)\n")
        f.write("  - Validation HCPs (replaces Category E hardcoded names)\n")
        f.write("  - SQL parameter overrides (Category H)\n\n")
        
        f.write("### Phase 3: Large lift\n")
        f.write("- Category F (methodology/prompts) requires TA-specific config and \n")
        f.write("  may need separate prompt templates for narrative generation.\n")
        f.write("- Pipeline scripts (Category G) need consistent --ta argument support.\n\n")
        
        f.write("## Next Steps\n\n")
        f.write("1. Create `tas/_template.yaml` defining the TA Definition schema.\n")
        f.write("2. Create `tas/nsclc.yaml` populating values from current code.\n")
        f.write("3. Refactor Category C and D references first — biggest leverage.\n")
        f.write("4. Pipeline parameterization (Category G) before adding a second TA.\n")
        f.write("5. Re-run this audit after each refactor to measure progress.\n")
    
    print(f"\nReport written to: {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Root directory to scan")
    parser.add_argument("--output", default="TA_AUDIT_REPORT.md", help="Output path")
    parser.add_argument("--include-tests", action="store_true", help="Scan test files too")
    args = parser.parse_args()
    
    root = Path(args.root).resolve()
    output_path = Path(args.output).resolve()
    
    print(f"Scanning {root}...")
    
    all_hits = {}
    file_count = 0
    
    for path in find_files(root):
        rel_path = str(path.relative_to(root))
        if not args.include_tests and ("test" in rel_path.lower() or "__tests__" in rel_path):
            continue
        
        hits = scan_file(path)
        if hits:
            all_hits[rel_path] = hits
            file_count += 1
    
    print(f"Scanned {file_count} files with TA references.")
    generate_report(all_hits, output_path)


if __name__ == "__main__":
    main()