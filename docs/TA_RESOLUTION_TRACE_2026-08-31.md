# TA resolution trace — 2026-08-31

Read-only inventory of every place a therapeutic area is determined, produced ahead of a global
TA switcher. **Nothing in this document was changed; it records what is, not what should be.**

Working tree: `3fa9b5f` plus two uncommitted files (`lib/api.ts`, `lib/profileTa.ts` — the
layer-2 validation). Live TAs: `nsclc` (Lung Cancer, `c0065b03-…`) and `colorectal-cancer`
(`a2b28e54-…`). Every SQL claim below comes from `pg_get_functiondef` / `pg_get_viewdef` read on
2026-08-31, not from migration files — filenames do not sort in apply order.

---

## 1. RESOLUTION POINTS

### Context / hooks

| # | Site | Mechanism | With nothing supplied |
|---|---|---|---|
| 1 | `lib/TAContext.tsx:65` `deriveTAValue(parentSlug, indicationSlug)` | pure fn over the two canonical slugs | caller-supplied; returns a value with **no data identity** if the parent is unregistered (`:77`) |
| 2 | `lib/TAContext.tsx:43` `STORAGE_KEY = "fieldmark.ta"` | `sessionStorage`, read at `:114` | `:111`/`:129` → `DEFAULT_PARENT_SLUG = "oncology"` (`:47`), `DEFAULT_INDICATION_SLUG = "nsclc"` (`:48`) |
| 3 | `lib/ledgerTa.ts:101` `useLedgerTa(sessionDataSlug)` | `?ta=` (`:104`) → session (`:110`) → `msl_profiles` (`:128-149`) → picker | `{ status: "unresolved" }` (`:39`) — **no hardcoded default** |
| 4 | `lib/profileTa.ts:52` `useProfileTa(hcpId)` | `?ta=` (`:54`) → session *validated against membership* (`:84`) → HCP primary (`:89`) | `{ status: "none" }` (`:50`) — **no hardcoded default** |
| 5 | `lib/routeSlugs.ts:293` `resolveFeedRoute` | route params, validated against `TA_SLUG_TO_LABEL` | falls back to `taLabelToSlug(HOME_TA)` → `"oncology"` |

### Module-scope constants (hardcoded, no override path)

| Site | Value |
|---|---|
| `components/Cohorts/RisingQuadrant.tsx:24` | `TA_SLUG = "nsclc"` |
| `components/Congress/CongressCalendarPage.tsx:52-53` | `TA_SLUG = "nsclc"`, `TA_LABEL = "Oncology"` |
| `components/Congress/CongressDetailPage.tsx:24-25` | same pair |
| `components/HCPCard.tsx:19` | `CARD_TA_SLUG = "nsclc"` |
| `components/Profile/AdministeredVolumeBlock.tsx:31` | `BLOCK_TA_SLUG = "nsclc"` |
| `components/Profile/PracticeFirstProfile.tsx:107` | `PROFILE_TA_SLUG = "nsclc"` |
| `components/Trials/TrialsPage.tsx:20` | `TRIALS_TA_SLUG = "nsclc"` |
| `components/TelescopeField.tsx:43` | `AD_TA_ID = "9e4139d2-…"` (hardcoded UUID) |
| `lib/api.ts:3887` | `AD_INSTITUTIONS_TA_ID = "9e4139d2-…"` (hardcoded UUID) |
| `lib/home.ts:7-9` | `TA_SLUG_TO_UUID = { NSCLC: "c0065b03-…" }` — **a one-entry map** |

### Route params / search params

| Site | Mechanism | With nothing supplied |
|---|---|---|
| `components/InstitutionRoute.tsx:96` | `searchParams.get("ta") ?? "nsclc"` | **silently defaults to lung** |
| `components/InstitutionsIndexRoute.tsx:91` | `useParams<{ta}>` | `?? "nsclc"` at `:93` |
| `components/LandscapeRoute.tsx:19` | `useParams<{ta}>` | `?? "nsclc"` at `:21` |
| `components/Pulse/PulsePage.tsx:784` | `(params.ta ?? "nsclc").toLowerCase()` | lung |
| `components/SocialPage.tsx:30` | `(params.ta ?? "oncology").toLowerCase()` | oncology (parent) |
| `App.tsx:243`, `IndicationFilter.tsx:107` | `params.ta` into `resolveFeedRoute` | `HOME_TA` |

### Props / derived

| Site | Mechanism |
|---|---|
| `App.tsx:251` `indicationTaId` | `getIndicationTaId(selectedTA, selectedIndicationSlug)` — reads `INDICATIONS_BY_TA[].taId` |
| `App.tsx:268` `feedDataSlug` | `deriveTAValue(route.taSlug, route.indicationSlug).dataSlug` |
| `App.tsx:280` `taApiSlug` | `taLabelToApiSlug(selectedTA)` — **`"nsclc"` for any Oncology indication** |
| `App.tsx:257` | writes TAContext from the URL |
| `CohortLedger.tsx:1952-1955` | `useTA()` + `useLedgerTa()` → `taId` / `taSlug` |
| `CohortLedger.tsx:797`, `:1102` | **`taIdForApiSlug("nsclc")` hardcoded inside the ledger** — drawer layer data |
| `lib/cohortLedger.ts:1018` | `rowTaSlug` stamped per row from the resolved `taId` |
| `PeopleNavStrip.tsx` | `dataTaSlug` prop (ledger) / `route` prop (feed) |
| `ProfileDispatch.tsx` | `useProfileTa` → `taId`/`taSlug` props into the two shells |
| `HomePage.tsx:136,139` | `homeTaId`, `taSlug` from `msl_profiles`, `:187` |
| `NavBar.tsx:79,84` | literal hrefs `/institutions/nsclc`, `/oncology/telescope/nsclc` |

**Searched and not found:** no global TA provider other than `TAContext`; no `<TASwitcher>`
component; no `useSearchParams` TA read in `NavBar.tsx`; no TA in `AppLayout` beyond the
`currentTaId` prop passed for search scoping.

---

## 2. THE THREE HELPERS

### `lib/ledgerTa.ts` — `useLedgerTa(sessionDataSlug: string | undefined): LedgerTa`

Returns `{ state, choose }` where state is `resolving | resolved{slug,taId,source} | unresolved`
(`:36-39`). Precedence: **URL → session → profile → picker.**

- `:108-109` URL, validated by `taIdForApiSlug`
- `:110-112` session, **unvalidated**
- `:128-149` `msl_profiles.default_ta_slug/default_indication_slug` via `deriveTAValue`
- `:149` otherwise `unresolved` → the surface renders a picker

Two side effects the others do not have: it **rewrites the URL** (`:163-171`) and it **writes
TAContext** (`:189-193`).

### `lib/profileTa.ts` — `useProfileTa(hcpId: string | undefined): ProfileTaState`

Returns `resolving | resolved{taId,slug,source} | none` (`:48-50`). Precedence: **URL → session
(validated) → HCP primary → none.**

- `:59-61` URL, validated by `taIdForApiSlug`
- `:84-85` session, **validated against this HCP's memberships**
- `:89-92` `taIds[0]`, i.e. most publications
- `:79`/`:93` otherwise `none`

### `lib/home.ts` — not a TA resolver in the same sense

`getUserTerritoryContext(userId)` (`:641`) returns `{states, taUuids, territoryLabel}`. It
resolves a **set** of TA UUIDs for the user, not one TA for a surface:

- `:672-675` `msl_profiles.therapeutic_areas` labels → `TA_SLUG_TO_UUID` (`:7-9`)
- `:676-679` if that yields nothing, `allowed_ta_slugs` → `taUuidsForParentSlugs` (`:35`)

Consumers take an optional override: `getCoverageGapsForUser(userId, taId?)` at `:717-727`, same
shape at `:815-829`.

### Which pairs are the same logic

**`ledgerTa` and `profileTa` are the same three-layer shape with three differences.** Both are
URL → session → derived, both refuse a hardcoded final default.

**Difference 1 — the session layer is validated in one and not the other.**

`ledgerTa.ts:110-112`:
```ts
const fromSession = sessionDataSlug ? taIdForApiSlug(sessionDataSlug) : undefined;
if (sessionDataSlug && fromSession) {
  return { status: "resolved", slug: sessionDataSlug, taId: fromSession, source: "session" };
}
```
`profileTa.ts:83-86`:
```ts
const sessionTaId = sessionSlug ? taIdForApiSlug(sessionSlug) : undefined;
if (sessionTaId && taIds.includes(sessionTaId)) {
  setResolved({ status: "resolved", taId: sessionTaId, slug: sessionSlug as string, source: "session" });
  return;
}
```
The ledger's check is "is this a real TA"; the profile's is "is this a real TA **that this HCP is
in**". The asymmetry is correct — a ledger is about a board, a profile is about a person — but it
means the word "session" denotes different things in the two files.

**Difference 2 — layer 3 asks different questions.** `ledgerTa` asks the *user's* stored default
(`:112-131`); `profileTa` asks the *HCP's* primary TA (`:89`). Neither can substitute for the other.

**Difference 3 — terminal state and side effects.** `ledgerTa` ends at `unresolved` → a picker,
rewrites the URL (`:163-171`), and writes TAContext (`:189-193`). `profileTa` ends at `none` → an
absence, and does neither. Comment at `profileTa.ts:41-43`: *"The URL is NOT rewritten. A profile
is reached from many places and is often a leaf… The ledger rewrites because its TA is a
persistent view-state the user chose — a profile's is derived."*

**`home.ts` is not the same logic as either.** It produces a *set* for filtering, never a single
TA for display, and its `TA_SLUG_TO_UUID` (`:7-9`) contains exactly one entry — `NSCLC`. A user
whose `msl_profiles.therapeutic_areas` says `["Colorectal Cancer"]` gets `taUuids = []` from that
branch and falls through to `allowed_ta_slugs`.

---

## 3. LABEL vs DATA, PER SURFACE

| Surface | TA governing **labels** | TA governing **data** | Can they disagree? |
|---|---|---|---|
| **Cohort ledger** (`/cohorts/ledger/:cohort`) | `taSlug` from `useLedgerTa` → eyebrow `CohortLedger.tsx:2280`, area from `:2050` | same `taId` → `board_established`/`board_rising` (`lib/cohortLedger.ts:1018`) | **No.** One resolution, one variable, both fed from `taState` at `:1954-1955` |
| **Ledger row drawer** | inherits the row's TA | **`taIdForApiSlug("nsclc")` hardcoded** at `CohortLedger.tsx:797` and `:1102` | **YES.** Board is CRC, drawer layers are lung. Filters on `therapeutic_area_id` at `lib/ledgerDrawer.ts:84,89` |
| **Ledger, COM tab** | `taSlug` | `community_ledger` — no TA arg, reads `community_board_nsclc_v1` | Blocked before it can: `cohortOffTa` at `:1958` renders an absence |
| **Feed** (`/:ta/:dashboard/:indication`) | `route.taLabel`/`indicationLabel` from `resolveFeedRoute` | `filters.therapeuticArea = taApiSlug` (`App.tsx:280`) **+** `taId = indicationTaId` (`:251`) | **YES.** `taLabelToApiSlug` returns `"nsclc"` for *any* Oncology indication; only `taId` carries CRC |
| **Profile — rising** | `taSlug` prop | `taId` prop → `hcp_rising_profile_ta` | **No.** Both from `useProfileTa` in `ProfileDispatch` |
| **Profile — academic** | `taSlug` prop | `taId` prop → `hcp_profile_brief_ta` | **No.** Same source |
| **Profile — community** | `PROFILE_TA_SLUG = "nsclc"` (`PracticeFirstProfile.tsx:107`) | `community_hcp_profile` — no TA arg | **No, but only because both are pinned to lung.** ⚠ see §7 |
| **AdministeredVolumeBlock** | `BLOCK_TA_SLUG = "nsclc"` (`:31`) | `taSlug` **prop** (now `{taSlug}` from the profile) | **YES.** Label const, data prop — they are different variables |
| **Trials** | `taLabelForSlug(TRIALS_TA_SLUG)` (`:110-111`) | `get_nsclc_trials_surface()`, no args | No — both pinned lung |
| **Congress** | `TA_SLUG`/`TA_LABEL` (`:52-53`) | congress tables, not TA-filtered | n/a |
| **Institutions index** | `taLabelForSlug(taSlug)` (`InstitutionsIndexRoute.tsx:170`) | `fetchTaRoster(taId)` from the same slug | No |
| **Institution detail** | `taUpper` from `taSlug` (`:232`) | `taIdForApiSlug(taSlug)` (`:123`) | No — one source, `?ta=` |
| **Home** | none rendered | `homeTaId` (`:136`) into territory/coverage calls | n/a — no TA heading |
| **SkyView** | `taLabelForSlug(… AD_TA_ID ? "atopic-dermatitis" : "nsclc")` (`TelescopeField.tsx:694`) | static JSON chosen by the same ternary (`:227`) | No — one ternary drives both |
| **Assets** | `taLabelForSlug(ASSETS_TA_SLUG)` | `asset_*` RPCs, slug literal in body | No — both pinned lung |
| **HCPCard** (feed) | `CARD_TA_SLUG` (`:19`) | row data from the feed's `taId` | **YES.** Card badge says lung over a CRC row |

---

## 4. TA WRITTEN INTO NAVIGATION

**Carries a resolved TA:**

| Site | Expression |
|---|---|
| `CohortLedger.tsx:831,1193,1538,1782` | ``to={`/hcp/${row.hcpId}${row.taSlug ? `?ta=${row.taSlug}` : ""}`}`` |
| `CohortLedger.tsx:2230` | ``navigate(`/cohorts/ledger/${key}${taSlug ? `?ta=${taSlug}` : ""}`)`` |
| `CohortLedger.tsx:2340` | ``navigate(`/cohorts/ledger/established?ta=${taSlug ?? ""}`)`` |
| `InstitutionRoute.tsx:393,614` | ``navigate(`/hcp/${…}?ta=${taSlug}`)`` |
| `InstitutionRoute.tsx:252,492` | ``to={`/institutions/${taSlug}`}`` |
| `InstitutionsIndexRoute.tsx:185` | ``navigate(`/institution/${a.slug}?ta=${taSlug}`)`` |
| `InstitutionsInTerritoryPanel.tsx:66,100` | ``/institutions/${institutionsSlug}``, ``?ta=${institutionsSlug}`` |
| `LandscapeRoute.tsx:55` | ``navigate(`/hcp/${String(hcpId)}?ta=${taSlug}`)`` |
| `HcpProfileBrief.tsx:321` | ``to={`/cohorts/ledger/established?ta=${taSlug}`}`` |
| `RisingHcpProfile.tsx` (back-link, collaborators) | ``?ta=${taSlug}`` |
| `HomePage.tsx:268` | ``if (taSlug) navigate(`/institutions/${taSlug}`)`` |
| `RisingRedirect.tsx:29` | forwards `?ta=`, supplies none |

**Carries a hardcoded TA:**

| Site | Expression |
|---|---|
| `NavBar.tsx:79` | `to: "/institutions/nsclc"` |
| `NavBar.tsx:84` | `to: "/oncology/telescope/nsclc"` |
| `PeopleNavStrip.tsx:203` | ``navigate(`/landscape/${indicationSlug === "all" ? "nsclc" : indicationSlug}`)`` |
| `RisingQuadrant.tsx:314` | ``navigate(`/hcp/${pt.row.hcp_id}?ta=${TA_SLUG}`)`` |
| `CongressDetailPage.tsx:219` | ``to={`/hcp/${p.hcp_id}?ta=${TA_SLUG}`}`` |
| `TrialsPage.tsx:440` | ``navigate(`/hcp/${r.hcp_id}?ta=${TRIALS_TA_SLUG}`)`` |
| `Assets/RightRail.tsx:44,95` | ``?ta=${ASSETS_TA_SLUG}`` |
| `CommunityHcpProfile.tsx:260` | ``?ta=${COM_CONFIG.pinnedTaSlug}`` |

**Deliberately bare** (cross-TA surfaces, layer 3 answers): `HCPChip.tsx:393`,
`FieldInsightsScreen.tsx:228,278`, `FollowUpRow.tsx:151`, `FollowUpsPage.tsx:133`,
`TrackedHcpsList.tsx:122,239`, `HomePage.tsx` ×7, `NavBar.tsx:208` (search),
`MiniCollaboratorNetwork.tsx:35`, `TheWeekPage.tsx:158,170`.

**`App.tsx:509,524,528`** pass TA via router *state* (`{ state: { taLabel, taId } }`). Searched
for readers: only `HcpPositionsPage.tsx:92` reads `location.state.taId`, on a different route.
**For the profile route this state is inert.**

---

## 5. SQL-SIDE PINS

Live, 2026-08-31. "Pinned transitively" = takes a TA argument but reads a TA-named object anyway.

| Function | TA argument | Slug literal in body | Reads a TA-named view | Verdict |
|---|---|---|---|---|
| `board_established` | `p_ta_id` | no | no | **Neutral** |
| `board_rising` | `p_ta_id` | no | no | **Neutral** |
| `board_meta` | `p_ta_id` | **yes** | **yes** | Neutral for EST/RS; COM arm reads `community_board_nsclc_v1` and raises for other TAs |
| `hcp_profile_spine_ta` | `p_ta_id` | no | no | **Neutral** |
| `hcp_rising_profile_ta` | `p_ta_id` | no | no | **Neutral** |
| `hcp_profile_brief_ta` | `p_ta_id` | no | no | **Neutral** |
| `get_established_filtered` (×2) | `p_ta_id` | no | no | **Neutral** |
| `get_rising_star_filtered` | `p_ta_id` | no | no | **Neutral** |
| `get_community_filtered` (×2) | `p_ta_id` | no | **yes (1 of 2)** | **Pinned transitively** — accepts a TA and ignores it |
| `community_ledger` | none | yes | yes | **Pinned** |
| `community_hcp_profile` | none | yes | yes | **Pinned** |
| `community_practice_profile` | none | yes | yes | **Pinned** |
| `ledger_meta` | none | yes | no | **Pinned** (wrapper) |
| `hcp_profile_spine` / `hcp_rising_profile` / `hcp_profile_brief` | none | yes | no | **Pinned wrappers**, by design |
| `get_nsclc_trials_surface` | none | no | no | **Pinned by name** |
| `rising_board` | none | yes | no | **Pinned** |
| `asset_index_meta` | none | yes | no | **Pinned** |
| `hcp_administered_therapy` | none | yes | no | **Pinned** |
| `hcp_belief_claims` | none | yes | no | **Pinned** |
| `rising_board_flags`, `established_board_flags`, `board_open_trials`, `ledger_regions` | none | no | no | **Genuinely TA-agnostic** — keyed on `p_hcp_ids` |

Views: `community_board_nsclc_v1` and `hcp_nsclc_evidence_tier_v1` carry the TA in the name; the
first reads the second.

---

## 6. THE SWITCH TEST

> *If `TAContext` changed to `colorectal-cancer` right now, with no other change, what would this
> surface render?*

| Surface | Answer | Deciding line |
|---|---|---|
| **Cohort ledger — Established** | **Correct CRC data and labels.** `?ta=` is absent on a fresh mount, so layer 2 takes the new session TA and both board and eyebrow follow. | `lib/ledgerTa.ts:110-112` |
| **Cohort ledger — Rising** | **Correct CRC data and labels.** | same |
| **Cohort ledger — Community** | **Error/empty by design** — the named absence panel, not a lung roster. | `CohortLedger.tsx:1958` |
| **Ledger row drawer** | **NSCLC data with CRC labels.** Board rows are CRC; the drawer's topic-share and positions layers are fetched with a hardcoded lung id. | `CohortLedger.tsx:797` |
| **Ledger, if `?ta=nsclc` is already in the URL** | **NSCLC data and labels, switch ignored.** The URL outranks the session. | `lib/ledgerTa.ts:108-109` |
| **Feed** (`/:ta/:dashboard/:indication`) | **NSCLC data and labels, switch ignored.** The feed reads the URL through `resolveFeedRoute`, then *overwrites* TAContext from it. | `App.tsx:243`, `:257` |
| **HCPCard on the feed** | **CRC data with NSCLC labels** (if the feed were on CRC) — the evidence badge is a module const. | `HCPCard.tsx:19` |
| **Profile — rising** | **Correct CRC data and labels**, provided the HCP is in CRC; otherwise layer 2 rejects and it renders their primary TA. | `lib/profileTa.ts:84` |
| **Profile — academic** | **Correct CRC data and labels**, same condition. | same |
| **Profile — community** | **Error/empty by design** — the community absence state. | `ProfileDispatch.tsx` community-off-TA branch |
| **Profile — practice-first** (`/hcp/:id/practice`) | **NSCLC data and labels, switch ignored.** Routed directly, never through `ProfileDispatch`; `PROFILE_TA_SLUG` and `community_practice_profile` are both pinned. | `PracticeFirstProfile.tsx:107`; `App.tsx:908` |
| **AdministeredVolumeBlock** | **CRC data with NSCLC labels.** `taSlug` prop now flows from the profile, but the badge strings read the module const. | `AdministeredVolumeBlock.tsx:31,67` |
| **Trials** | **NSCLC data and labels, switch ignored.** | `TrialsPage.tsx:20`; `get_nsclc_trials_surface()` takes no argument |
| **Congress (calendar + detail)** | **NSCLC data and labels, switch ignored.** | `CongressCalendarPage.tsx:52-53` |
| **Institutions index** | **NSCLC data and labels, switch ignored.** TA comes from the route segment; NavBar links to `/institutions/nsclc`. | `InstitutionsIndexRoute.tsx:93`; `NavBar.tsx:79` |
| **Institution detail** | **NSCLC data and labels, switch ignored** unless `?ta=` says otherwise — and its default is a silent lung. | `InstitutionRoute.tsx:96` |
| **Landscape** | **NSCLC data and labels, switch ignored.** Route param, `?? "nsclc"`. | `LandscapeRoute.tsx:21` |
| **SkyView / Telescope** | **NSCLC data and labels, switch ignored.** Static JSON selected by a two-way ternary that has no CRC branch. | `TelescopeField.tsx:227` |
| **Assets / Drugs** | **NSCLC data and labels, switch ignored.** | `lib/assetConfig.ts:90` |
| **Pulse** | **NSCLC data and labels, switch ignored.** | `PulsePage.tsx:784` |
| **Social** | **Switch ignored** — defaults to the `oncology` parent, and `SURFACE_LABEL` maps `oncology → "Lung Cancer"`. | `SocialPage.tsx:30`, `:25` |
| **Home** | **Switch ignored.** Home reads `msl_profiles`, never TAContext, for its TA. | `HomePage.tsx:136`, `:187` |
| **The Week** | **Switch ignored.** Same profile-derived path. | `TheWeekPage.tsx:133-135` |
| **Field Insights / Follow-ups / Watchlists** | **Correct — no TA is rendered or filtered.** Cross-TA by design. | no TA read; searched `FieldInsightsScreen.tsx`, `FollowUpsPage.tsx`, `TrackedHcpsList.tsx` |

**Count: 3 surfaces follow the switch, 2 refuse it honestly, 3 render mixed TA, 14 ignore it.**

---

## 7. ⚠ AGREE ONLY BECAUSE BOTH SIDES ARE PINNED

These are correct today and become wrong the moment one side is unpinned. They are the dangerous
ones, because nothing on screen distinguishes them from genuinely-correct surfaces.

1. **Community profile.** `PracticeFirstProfile.tsx:107` `PROFILE_TA_SLUG = "nsclc"` labels data
   from `community_hcp_profile` / `community_practice_profile`, both pinned in SQL. Unpin the RPC
   in Phase 3 without touching the const and every CRC community profile reads "Lung Cancer".
2. **Trials.** `TRIALS_TA_SLUG` (`:20`) labels `get_nsclc_trials_surface()`. Rename the RPC and
   the label is orphaned.
3. **Assets.** `ASSETS_TA_SLUG` labels the `asset_*` RPCs, which carry their own slug literal.
4. **Congress.** `TA_SLUG`/`TA_LABEL` label tables that are not TA-filtered at all — the pairing
   is asserted by the page, not by the data.
5. **SkyView.** `TelescopeField.tsx:227` and `:694` both branch on `taId === AD_TA_ID`, so label
   and data agree — but the ternary has no third branch. A CRC id falls to the lung JSON *and*
   the lung label, agreeing while being wrong.

## 8. BUGS FOUND, NOT FIXED

- **`CohortLedger.tsx:797`, `:1102`** — `taIdForApiSlug("nsclc")` hardcoded inside a ledger whose
  board is TA-parameterised. The drawer shows lung topic-share and lung scientific positions
  beneath CRC rows. Filters at `lib/ledgerDrawer.ts:84,89`.
- **`App.tsx:280`** — `taLabelToApiSlug(selectedTA)` returns `"nsclc"` for *every* Oncology
  indication, so `filters.therapeuticArea` says lung while `filters.taId` says CRC. Survives only
  because `lib/api.ts:1238` prefers `filters.taId ?? TA_ID_MAP[taSlug]`.
- **`lib/home.ts:7-9`** — `TA_SLUG_TO_UUID` has one entry, `NSCLC`. A user whose profile TA is
  Colorectal Cancer resolves to `[]` and silently falls through to `allowed_ta_slugs`.
- **`InstitutionRoute.tsx:96`** — `searchParams.get("ta") ?? "nsclc"`, the silent default
  `lib/ledgerTa.ts:12-15` was written to avoid inheriting; still live on this surface.
- **`get_community_filtered`** — takes `p_ta_id` and reads `community_board_nsclc_v1`. It accepts
  a TA and ignores it, which is worse than not accepting one.
- **`SocialPage.tsx:25`** — `SURFACE_LABEL = { oncology: "Lung Cancer", … }` labels the whole
  oncology capture as lung; CRC social would be mislabelled rather than absent.
