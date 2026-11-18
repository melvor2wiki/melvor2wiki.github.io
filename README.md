# Melvor 2 Wiki

Website: https://melvor2wiki.github.io/

Unofficial Melvor Idle 2 community wiki: items, recipes, sources, uses, skills, monsters and training guides.

Suggest an edit: https://github.com/melvor2wiki/melvor2wiki.github.io/issues

## GitHub Pages

This repository publishes through GitHub Actions. `python3 build.py` validates and reconstructs the static release into `public/`. The workflow connects the suggestion form to this repository using `GITHUB_REPOSITORY`, then publishes only the static website. No application backend, API keys or personal save data are included.

## Inspect or preview

Run `python3 build.py`, then `python3 -m http.server --directory public 8787`. The release is split into base64 text parts for transport through the GitHub connector. `release-manifest.json` records its SHA-256 integrity. The complete client source is reconstructed in `public/`.

Training guides contain base action comparisons and selected-mechanic simulations. They are not a full account simulator or proof of globally optimal loadouts.

Game names and artwork belong to their respective owners. This is an unofficial community wiki. PT Serif is provided under its included OFL license.
