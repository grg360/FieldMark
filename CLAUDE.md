\## Current focus

Laptop setup complete (5/29). XPS 13 now a functional FieldMark dev machine.



\## Last session

\- Cloned repo to laptop

\- Installed Git 2.54, Python 3.12.10, Node 24.16, npm 11.13

\- Transferred .env from NAS

\- Smoke test passed: 4 views refreshed in 2.9s



\## Next up

\- Verify push-pull cycle works between laptop and desktop

\- Set up dev branch as preview safety net before next weekend session



\## Vocabulary

\- The Drug Intelligence section displays as **"Drugs"** in the UI (nav item, page titles, section labels), but the internal vocabulary stays **"asset"** everywhere: route `/assets`, `config/assets.json`, tables `asset_publication_v1` / `asset_mention_v1`, components `AssetNav` / `AssetPage` / `AssetsIndexPage`, RPCs `asset_*`, config key `is_backbone`. Do not reconcile them — "Drugs" (display) and "asset" (code/data) are intentionally different. "Assets" is pharma-internal vocabulary for a company's own pipeline; this surface covers everyone's drugs.



\## Machine notes

\- Desktop: primary dev, basement, where long pipelines run

\- Laptop (XPS 13): weekend frontend work, upstairs

\- Both work on `foundation-rebuild` directly

\- Cloudflare auto-deploys foundation-rebuild → app.besselanalytics.com

\- Pull before start, push before stop — no exceptions

