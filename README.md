# Melvor 2 Wiki

Website: https://melvor2wiki.github.io/

Unofficial Melvor Idle 2 community wiki: items, recipes, sources, uses, skills, monsters and training guides.

Suggest an edit: https://melvor2wiki.github.io/#/suggest

Visitors submit directly without an account. Suggestions are delivered privately to the maintainer through FormSubmit; the public configuration contains a receiver alias, not the email address or a private API key.

## GitHub Pages

This repository publishes through GitHub Actions. `python3 build.py` validates and reconstructs the static release into `public/`. The workflow connects the suggestion form to this repository using `GITHUB_REPOSITORY`, then publishes only the static website. No private API keys or personal save data are included. The CSP permits feedback requests only to FormSubmit; all game assets remain local.

## Inspect or preview

Run `python3 build.py`, then `python3 -m http.server --directory public 8787`. The release is split into base64 text parts for transport through the GitHub connector. `release-manifest.json` records its SHA-256 integrity. The complete client source is reconstructed in `public/`.

Training guides contain base action comparisons and selected-mechanic simulations. They are not a full account simulator or proof of globally optimal loadouts.

Game names and artwork belong to their respective owners. This is an unofficial community wiki. PT Serif is provided under its included OFL license.


Feedback UI sources: `overrides/public-suggest.js` and `overrides/suggest.css`. `feedback-config.json` contains the public submission endpoint. The form validates input, preserves text after an error, prevents accidental duplicate sends and includes a honeypot. FormSubmit provides the external email delivery service.
