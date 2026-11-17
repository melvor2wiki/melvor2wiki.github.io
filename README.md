# Melvor 2 Wiki

Unofficial Melvor Idle 2 community wiki: items, creation recipes, sources, uses, skills, monsters and training guides.

Public suggestions: https://github.com/seriafrancesco/melvor2wiki/issues

## Deployment

Static release, hosted on Vercel Hobby. Run `python3 build.py` to reconstruct `public/`. The build validates the SHA-256 digest before extracting. It has no dependencies, downloads, API keys or application backend.

The release is split into base64 text parts for transport through the connected GitHub API. To inspect the source, run the build: `public/app.js`, `public/style.css`, `public/data.js` and `public/index.html` contain the complete site. `release-manifest.json` records size and integrity.

All website resources load locally from the deployment. The CSP blocks network APIs and third-party scripts. Player Activity opens a separate external page. Suggest an edit opens a public GitHub issue draft that the visitor reviews and submits on GitHub. No save files, account tokens or private credentials are included. Do not post these in issues.

Game build: 26724394. Training guides include base action comparisons and selected-mechanic simulations; they are not a full account simulator or proof of globally optimal loadouts.

Game names and artwork belong to their respective owners. This project is unaffiliated with the official Melvor wiki. PT Serif is provided under its included OFL license.
