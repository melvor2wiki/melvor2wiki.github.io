# Melvor 2 Wiki

Website: https://melvor2wiki.github.io/

Unofficial Melvor Idle 2 community wiki: items, recipes, sources, uses, skills, monsters and training guides.

Suggest an edit: https://melvor2wiki.github.io/#/suggest

Save Analyzer: https://melvor2wiki.github.io/#/save

Import a Melvor Idle 2 version 31 or 32 `.sav` or `.bak` to compare training and gold routes, view account progress and inspect recorded loot. The file is decoded in the browser and cleared when you leave the page. The analysis page loads the same Brotli decoder for every user and sends no save-derived requests. Its binary layout is adapted from [melvor2sim](https://github.com/jtwilli/melvor2sim). Decoder and parser license notices are in `overrides/save-vendor/`.

Combat Planner in Save Analyzer: https://melvor2wiki.github.io/#/save?view=combat

Compare two setups, compare compatible or owned weapons, and rank targets by XP, kills, loot or sampled deaths. The browser runs seeded normal-hit trials from full health. Advanced encounters use labeled benchmarks, and dungeon and Slayer totals combine component rates. See the separate Can I Idle? tool for worst-case checks.

Game data currently matches Steam build 26886380 (v0.11.7-alpha). The verified archive in `release/game-26886380.zip` applies game-data changes, refreshed artwork and rebuilt guide and monster tables to the original static release.

Visitors submit directly without an account. Suggestions enter a private Supabase inbox through a write-only endpoint. One daily email digest is scheduled for 12:00 Europe/Rome, including daylight saving time. The digest is also sent when there are zero new suggestions, with the complete-history count and private inbox link. No email address, provider endpoint or private API key is published.

## GitHub Pages

This repository publishes through GitHub Actions. `python3 build.py` validates and reconstructs the static release into `public/`. The workflow connects the suggestion form to this repository using `GITHUB_REPOSITORY`, then publishes only the static website. No private API keys or personal save data are included. The CSP permits feedback requests only to the dedicated Supabase project; all game assets remain local.

## Inspect or preview

Run `python3 build.py`, then `python3 -m http.server --directory public 8787`. The release is split into base64 text parts for transport through the GitHub connector. `release-manifest.json` records its SHA-256 integrity. The complete client source is reconstructed in `public/`.

Training guides contain base action comparisons and selected-mechanic simulations. They are not a full account simulator or proof of globally optimal loadouts.

Game names and artwork belong to their respective owners. This is an unofficial community wiki. PT Serif is provided under its included OFL license.


Feedback UI sources: `overrides/public-suggest.js` and `overrides/suggest.css`. `feedback-config.json` contains the public submission endpoint. The form validates input, preserves text after an error, prevents accidental duplicate sends and includes a honeypot. The public endpoint enforces atomic rolling limits (5 per network identifier/10 minutes, 20 per identifier/24 hours, 100 globally/hour, 500 globally/24 hours) and deduplicates matching messages. Network identifiers are HMAC pseudonyms; no raw IP is stored in the inbox. Global limits and notification limits remain effective independently of client identifiers.

Database access is denied to anonymous and ordinary authenticated API roles. Maintainer access uses the project dashboard. Server code and SQL are in `backend/`; provider settings are stored privately in the database, never in this repository. The digest reserves one attempt per local day and advances its feedback membership only after provider acceptance. Ambiguous sends may recur in the next dayÃ¢â‚¬â„¢s summary. See `backend/daily-digest.md` for scheduling, payload limits and monitoring.

Reader-facing page sources are in `overrides/wiki-format.*`, `overrides/entity-pages.*` and `overrides/training-guides.*` and `overrides/training-reader.*`. Training tables cover levels 1Ã¢â‚¬â€œ99. Thirteen skills have calculated base XP/s, including Thieving success, stages and stuns. Other guides show actual unlocks and state when a full-cycle rate depends on additional systems. Boosters are grouped by XP, Action Time, Success and Accuracy, Action Progress, Resources and Other Bonuses on guide and skill pages. One-source upgrade comparisons use the supported formulas rather than editorial scores. See research/training-models.json for source hashes and Monte Carlo checks.
