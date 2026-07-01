# Post-Restructure Smoke Test

**Purpose:** Concrete checks to verify the restructure didn't break the scripts that actually matter this week and next. If any of these fail, the fix is usually 2 minutes. If it feels bigger, `git revert HEAD` puts everything back exactly where it was.

**Time to complete:** ~10 minutes for the full checklist.

---

## Rollback (if anything feels bad)

```powershell
git revert HEAD
git push
```

That's it. One commit restructured everything; one revert puts it all back. Imports, paths, muscle memory — all as they were before.

---

## The Real Checks

Run these in order. Each is a 30-second smoke test that catches the most likely failure mode (broken imports) without actually executing anything expensive.

### 1. Python can find the scripts and their imports resolve

For each of the following, run from repo root:

```powershell
# Narrative generator (heavy Claude API use, recently touched)
python scripts/narrative/generate_narratives_v2.py --help

# Community narrative generator (worked in today's session)
python scripts/narrative/generate_community_narratives.py --help

# Established scoring
python scripts/score/established_scoring.py --help

# Community scoring
python scripts/score/community_scoring.py --help

# Rising Star scoring (newer methodology)
python scripts/score/rising_star_scoring.py --help

# Seed insight generator (worked in today's session)
python scripts/seed/generate_seed_insights.py --help
```

**What you're checking:** each script prints its argparse help text and exits cleanly. If a script errors on an `import` line at the top, that's a broken import — fix by adding this near the top of the offending file:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
```

Then re-run the `--help`. If it works, commit that fix.

### 2. scholar_overnight imports scholar_enrichment (cross-file same-dir)

```powershell
python -c "import sys; sys.path.insert(0, 'scripts/enrich'); import scholar_overnight"
```

**What you're checking:** scholar_overnight.py does `from scholar_enrichment import ...`. Both files moved to `scripts/enrich/` together, so this should just work. If it errors, the import needs relative-syntax adjustment.

### 3. Anything using `Path(__file__).parent` for a sibling config file

`social_update.py` looks for `social_capture_config.json` in its own directory. If that config exists at repo root, moving social_update.py breaks it. Check:

```powershell
Test-Path scripts/social/social_capture_config.json
Test-Path social_capture_config.json
```

If it exists at repo root but not in `scripts/social/`, either:
- Move the config: `git mv social_capture_config.json scripts/social/`
- Or edit `social_update.py` to look at the parent directory

Same check for any other JSON config files at repo root (e.g., checkpoint files that individual scripts read).

### 4. Weekly refresh scripts (if any are scheduled)

```powershell
python scripts/utilities/take_weekly_snapshot.py --help
```

**What you're checking:** if this runs on any schedule (Windows Task Scheduler, GitHub Actions, cron), the schedule points at the old path. Fix by either:
- Updating the scheduled task's path
- Adding a shim at repo root that re-points

If you don't have any scheduled refresh, skip this.

### 5. Frontend build (sanity check, expected to be identical)

```powershell
cd frontend
npm run build
```

**What you're checking:** the frontend build has nothing to do with scripts/ — this is purely a paranoia check. It should complete with identical output to before the restructure. If it fails, the failure is unrelated to the restructure.

### 6. Cloudflare Pages auto-deploy

After `git push` of the restructure commit, watch the Cloudflare Pages dashboard for `foundation-rebuild` branch. The build should succeed. It only reads from `frontend/`, so it will.

Real check: hit `app.besselanalytics.com/demo` after the deploy completes. If the page loads and the video plays, the mentors' experience is unchanged.

---

## What NOT to Worry About

- **Scripts you don't run:** if `institution_geo_backfill_ror.py` is broken, you find out the next time you want to run it. The fix is 2 minutes. Not worth pre-testing.
- **Archived scripts:** they aren't imported, aren't run, aren't in any critical path. If placement is wrong on any of them, nothing breaks.
- **SQL files:** they aren't imported by anything. They're read-and-execute-once artifacts.
- **Supabase:** the database is untouched. Zero schema change, zero data change.
- **Demo page:** served entirely from Cloudflare Pages + Supabase reads. No Python execution in the request path.

---

## After All Checks Pass

Nothing to do. The restructure is done. Repo root shows scripts/, sql/, frontend/, plus the 4 workflow .ps1 tools you kept there. Future TA expansion (AD substrate work) inherits a clean directory tree.

## After Any Check Fails

- Small import fix (add `sys.path` line): commit as a follow-up. Move on.
- Config file path fix: move the config or edit the reference. Commit.
- Anything that feels like it's expanding scope beyond "small fix": `git revert HEAD` and we redo the restructure differently next session.

The bet the restructure makes: 10 minutes of smoke testing + occasional 2-minute import fixes over the next couple weeks < the cognitive tax of 168 files at repo root for every future session.
