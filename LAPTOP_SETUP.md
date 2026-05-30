# FieldMark — Laptop Setup

One-time guide for cloning FieldMark to a second machine. The desktop is the source of truth; the laptop is a working clone.

## Prerequisites

Install on the laptop:

- Git — https://git-scm.com/download/win
- Python 3.11+ — https://www.python.org/downloads/ (check "Add Python to PATH")
- Node.js 20+ LTS — https://nodejs.org/
- VS Code or Cursor

Verify in PowerShell:

```powershell
git --version
python --version
node --version
npm --version
```

All four should return version numbers.

## Setup

Clone the repo and check out the production branch:

```powershell
cd C:\Users\garre\Desktop
git clone https://github.com/grg360/FieldMark.git
cd FieldMark
git checkout foundation-rebuild
```

Recreate `.env`. It's gitignored intentionally — copy the values from the desktop's `.env` via encrypted USB, password manager, or manual paste. In the FieldMark root:

```powershell
notepad .env
```

Required keys: `SUPABASE_URL`, `SUPABASE_KEY`, Twitter/X credentials, `ANTHROPIC_API_KEY`, `SCRAPER_API_KEY`, and any OpenAlex credentials. Match the desktop exactly.

Install dependencies:

```powershell
pip install -r requirements.txt
cd frontend
npm install
cd ..
```

Verify everything works with the safe smoke test (no API cost, just hits Supabase):

```powershell
python social_update.py --refresh-only
```

If you see `Views refreshed: YES` in the summary, the laptop is ready.

## Daily workflow

Pull before starting, push before stopping. That's the whole discipline.

```powershell
git pull
# ... work ...
.\quick_commit.ps1 "what changed"
```

Capture a conference:

```powershell
python social_update.py --profile ASCO
```

Run the frontend locally if you need it:

```powershell
cd frontend
npm run dev
```

## If something breaks

**Module not found** — install missing packages individually: `pip install supabase python-dotenv requests`.

**Auth errors on Supabase** — `.env` key is wrong. Compare to desktop carefully. Service role vs anon key matters.

**Git pull conflicts** — both machines edited the same file. Run `git status`, resolve manually, then commit and push.

**`.env` missing errors** — either the file doesn't exist or a key is misspelled. Check with `Get-Content .env`.

## Reference

- Production: `app.besselanalytics.com` (Cloudflare Pages auto-deploys from `foundation-rebuild`)
- Repo: `github.com/grg360/FieldMark`
- Methodology: `fieldmark_methodology.md` in repo root
