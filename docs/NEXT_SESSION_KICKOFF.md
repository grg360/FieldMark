# FieldMark — NEXT SESSION KICKOFF (start here)

_Written at the end of the July 8 two-day marathon. Day-three-you: read this first, then go._

## Where things stand (one paragraph)
AD is the 2nd TA. The **scientific backend is 100% done + validated**: Established (Silverberg #1), Emergence/Rising (Chovatiya #1) — tables `hcp_established_ranks_v3`, `hcp_scientific_emergence_v1`, `hcp_rising_composite_v1`. The **operational spine is built + validated**: `community_practitioners` (19,351 US dermatologists, 19,009 net-new) + `community_practitioner_payments` (14,165 with Open Payments, AD-drug $ mirrors real market — Dupixent>Rinvoq>topicals). The **Community Workspace design is LOCKED** (loved, 3 iterations, 2 advisor rounds — prototype: `CommunityWorkspaceV3.jsx`). Full detail: **`TA_BUILD_DEBT.md` through §30bw** — read at least §30bm (backend status) through §30bw (the map/heartbeat insight).

## Tomorrow's goal
**Get the frontend supporting AD** — start with a FRONTEND AUDIT (via Claude Code), then scope + do the repoint of the 2 scientific cohorts to AD's tables. Foundation first, build on it.

## The exact first move
Open **Claude Code** in the FieldMark repo. Paste the audit prompt (below / in `claude_code_frontend_audit_prompt.md`). It produces a structured summary. Bring that summary back to chat to scope the repoint.

## Key facts the frontend work needs
- Frontend currently renders **NSCLC/Hep on OLD tables** — none of AD's work is visible yet.
- **The Rising page still shows the OLD 2×2 momentum model** (Sci Momentum / Net Momentum / Sci Visibility / Net Visibility). AD's new model is **2-axis: Emergence + Network** (`hcp_rising_composite_v1`). This is the one piece needing real rework, not just a table repoint.
- Repoint targets for AD (ta_id `9e4139d2-e062-4a58-8728-cdabb2d7dca1`):
  - Established → `hcp_established_ranks_v3`
  - Rising → `hcp_rising_composite_v1` (+ `hcp_scientific_emergence_v1` for the emergence detail)
- "The frontend does what the backend tells it" — update the display to match the 2-axis backend, don't contort the backend.

## After the repoint (queued, not tomorrow)
- Community Workspace → real data (compute Commercial/Scientific/Practice dims + strategy queries; design locked in `CommunityWorkspaceV3.jsx`).
- **Playbook capstone** — fold §30bd sequencing doctrine + two-spine + §30bj "check the keying" into `TA_NEW_PLAYBOOK.md`. Highest leverage for TA #3; prerequisite for any agent-team automation.
- Field Intelligence — the daily heartbeat / change-layer / institutional-memory moat (§30bw). The north star, a big new surface, not a tomorrow task.

## Don't lose these insights (§30bw)
- **Community = the MAP** (static, planning product). **Field Intelligence = the HEARTBEAT** (daily, "what changed"). Don't force Community to be daily.
- **Surface DELTAS not LEVELS** everywhere ("↑ +$42K AD · new AbbVie payment", "entered Rising Top 250"). Cross-cutting design principle.
- FieldMark is an **intelligence system** ("what changed that I should care about?"), not a database or dashboard.
