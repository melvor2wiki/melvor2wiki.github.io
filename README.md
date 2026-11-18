# Melvor 2 Wiki

Unofficial Melvor Idle 2 community wiki: items, recipes, sources, uses, skills, monsters and training guides.

Target website: https://seriafrancesco.github.io/melvor2wiki/

Suggest an edit: https://github.com/seriafrancesco/melvor2wiki/issues

## GitHub Pages

This site publishes through GitHub Actions. Pages must use **GitHub Actions** as its publishing source in the repository settings. The workflow runs `python3 build.py`, verifies the archived release digest, then uploads only `public/` to Pages. No API keys, personal saves, third-party scripts or application backend are required.

## Inspect or run locally

Run `python3 build.py`, then `python3 -m http.server --directory public 8787`. The complete client source is in `public/app.js`, `public/style.css`, `public/data.js` and `public/index.html`.

The release is split into base64 text parts for transfer through the GitHub connector. `release-manifest.json` records size and SHA-256 integrity. Training guides contain base action comparisons and selected-mechanic simulations; they are not a full account simulator or proof of globally optimal loadouts.

Game names and artwork belong to their respective owners. This project is unaffiliated with the official Melvor wiki. PT Serif is provided under its included OFL license.
