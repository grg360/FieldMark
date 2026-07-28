"""Ingest ASCO 2026 abstract METADATA (never the body) + confirmed-presenter matches.

AbstractBody is dropped at parse time via usecols so it cannot enter memory, the
DB, the API, or the client. Only presented abstracts (SessionType != 'Publication
Only') are ingested. Confirmed presenters = distinct speakers in the two Lung
Cancer tracks matched to EXACTLY ONE NSCLC board HCP (established US or rising us_rank).
"""
import os
from collections import defaultdict
import pandas as pd
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

REPO = r"C:\Users\garre\Desktop\Fieldmark"
load_dotenv(os.path.join(REPO, ".env"))
NSCLC = "c0065b03-a25e-4e9a-bde4-4b4d0db7827d"
SLUG = "asco-2026"
CSV = os.path.join(REPO, "congress", "asco_2026_abstracts.csv")

KEEP = ["AbstractNumber", "PresentationStartDate", "PresentationEndDate",
        "PresentationTimeZone", "SpeakerDisplayName", "SessionTitle",
        "SessionType", "PresentationTitle", "Tracks"]  # AbstractBody deliberately excluded


def strip_cred(name):
    return (name or "").split(",")[0].strip()


def speaker_key(display):
    n = strip_cred(display)
    if not n or n.lower() in ("to be determined", "tbd"):
        return None
    toks = n.split()
    return f"{toks[0].lower()}|{toks[-1].lower()}" if len(toks) >= 2 else None


def hcp_key(first_name, last_name):
    fn, ln = (first_name or "").strip(), (last_name or "").strip()
    return f"{fn.split(' ')[0].lower()}|{ln.lower()}" if fn and ln else None


# --- parse metadata only ---
df = pd.read_csv(CSV, usecols=KEEP, dtype=str).fillna("")
total = len(df)
presented = df[df["SessionType"] != "Publication Only"].copy()
presented["speaker_key"] = presented["SpeakerDisplayName"].map(speaker_key)
presented["is_lung"] = presented["Tracks"].str.contains("lung", case=False, na=False)
presented["is_breast"] = presented["Tracks"].str.contains("breast", case=False, na=False)


def ts(v):
    v = (v or "").strip()
    return v if v else None


# --- board key map (exactly-one-board-HCP rule) ---
conn = psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)
cur = conn.cursor()
board = defaultdict(dict)  # key -> {hcp_id: {"established": rank, "rising": rank}}
cur.execute("""SELECT r.hcp_id, r.rank, h.first_name, h.last_name FROM hcp_established_ranks_v3 r
  JOIN hcps_v2 h ON h.id=r.hcp_id WHERE r.therapeutic_area_id=%s AND r.scope_type='region' AND r.scope_value='US'""", (NSCLC,))
for r in cur.fetchall():
    k = hcp_key(r["first_name"], r["last_name"])
    if k:
        board[k].setdefault(str(r["hcp_id"]), {})["established"] = r["rank"]
cur.execute("""SELECT r.hcp_id, r.us_rank, h.first_name, h.last_name FROM hcp_rising_star_ranks_v3 r
  JOIN hcps_v2 h ON h.id=r.hcp_id WHERE r.therapeutic_area_id=%s AND r.us_rank IS NOT NULL""", (NSCLC,))
for r in cur.fetchall():
    k = hcp_key(r["first_name"], r["last_name"])
    if k:
        board[k].setdefault(str(r["hcp_id"]), {})["rising"] = r["us_rank"]

# confirmed = lung-track distinct speaker whose key matches EXACTLY ONE board hcp
lung = presented[presented["is_lung"]]
lung_speakers = {}  # key -> representative display
for _, ab in lung.iterrows():
    k = ab["speaker_key"]
    if k:
        lung_speakers.setdefault(k, strip_cred(ab["SpeakerDisplayName"]))
confirmed, ambiguous, zero = {}, [], 0
for k, disp in lung_speakers.items():
    hits = board.get(k)
    if not hits:
        zero += 1
    elif len(hits) == 1:
        hcp_id, ranks = next(iter(hits.items()))
        confirmed[k] = (disp, hcp_id, ranks.get("established"), ranks.get("rising"))
    else:
        ambiguous.append(disp)

# --- write DDL + rows ---
schema = open(os.path.join(REPO, "sql", "congress_schema.sql"), encoding="utf-8").read()
cur.execute("DROP TABLE IF EXISTS public.congress_confirmed_presenters")
cur.execute("DROP TABLE IF EXISTS public.congress_abstracts")
# apply schema (no dollar-quotes here): strip comment lines, then split on ';'.
sql_no_comments = "\n".join(l.split("--")[0] for l in schema.splitlines())  # strip full + inline comments
for stmt in sql_no_comments.split(";"):
    if stmt.strip():
        cur.execute(stmt)
conn.commit()

ab_rows = [(
    r["AbstractNumber"], SLUG, strip_cred(r["SpeakerDisplayName"]), r["speaker_key"],
    r["SessionTitle"], r["SessionType"], r["PresentationTitle"], r["Tracks"],
    ts(r["PresentationStartDate"]), ts(r["PresentationEndDate"]), r["PresentationTimeZone"],
    bool(r["is_lung"]), bool(r["is_breast"]),
) for _, r in presented.iterrows()]
cur.executemany("""INSERT INTO public.congress_abstracts
  (abstract_number,congress_slug,speaker_display_name,speaker_key,session_title,session_type,
   presentation_title,tracks,presentation_start,presentation_end,presentation_timezone,is_lung,is_breast)
  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (abstract_number) DO NOTHING""", ab_rows)

pres_rows = [(SLUG, k, disp, hcp_id, NSCLC, est, ris) for k, (disp, hcp_id, est, ris) in confirmed.items()]
cur.executemany("""INSERT INTO public.congress_confirmed_presenters
  (congress_slug,speaker_key,speaker_display_name,hcp_id,therapeutic_area_id,established_rank,rising_rank)
  VALUES (%s,%s,%s,%s,%s,%s,%s)""", pres_rows)
conn.commit()

# --- report ---
print(f"total abstracts in CSV:        {total}")
print(f"presented (ingested):          {len(presented)}")
print(f"  lung-track abstracts:        {len(lung)}  distinct lung speakers: {len(lung_speakers)}")
print(f"  breast-track abstracts:      {int(presented['is_breast'].sum())}")
print(f"congress_abstracts rows:       {len(ab_rows)}")
print(f"confirmed NSCLC presenters:    {len(confirmed)}")
print(f"  ambiguous (excluded):        {len(ambiguous)}  -> {ambiguous}")
print(f"  zero match:                  {zero}")
cur.execute("SELECT count(*) n FROM congress_abstracts")
print("verify congress_abstracts:", cur.fetchone()["n"])
cur.execute("SELECT count(*) n FROM congress_confirmed_presenters")
print("verify confirmed_presenters:", cur.fetchone()["n"])
conn.close()
