---
name: github-pages
description: Use when deploying, publishing, or verifying this site on GitHub Pages, or troubleshooting why the live aniimoz.github.io is stale, 404, or unstyled. Covers the Actions-based Deploy workflow, cache-busting (?v=__V__), checking deploy status, limits and custom domains. Triggers include "deploy", "publish", "push the site", "go live", "it's not updating", "F5 vẫn cũ", "check the live site".
---

# GitHub Pages — publishing aniimoz.github.io

User site → served at **https://aniimoz.github.io**.

## The publish model (know this cold)

- Pages source is **GitHub Actions** (not "deploy from branch"). The workflow **`.github/workflows/deploy.yml` ("Deploy")** publishes the site:
  - on every **push to `main`** → treat `main` as production;
  - **after the "Crawl" workflow completes** (`workflow_run`) — the bot's data commit uses `GITHUB_TOKEN`, which does not trigger push workflows;
  - manually via Actions → Deploy → Run workflow.
- Deploy copies the repo into `_site/` **excluding `.git`, `.github`, `.claude`, `CLAUDE.md`**, then replaces `__V__` in `index.html` with the short commit SHA.
- Live update takes **~30–60 s** after the push (watch the Deploy run).
- Commit/push as the repo owner with **no AI attribution** (root `CLAUDE.md`, `git-commit-push` skill). Auth is via Git Credential Manager — just `git push`.

## Cache-busting — why F5 shows the new version

GitHub Pages sends `Cache-Control: max-age=600` on every file and **custom headers are impossible**. On F5 the browser re-fetches `index.html` but keeps cached CSS/JS for 10 min → new page + old code.
Fix in place: `index.html` references assets as `styles.css?v=__V__`, `data.js?v=__V__`, `app.js?v=__V__` and sets `window.ASSET_V = "__V__"`; `app.js` appends `?v=<ASSET_V>` to icons and `aniimo.json`. Deploy swaps `__V__` for the SHA, so every deploy = new URLs = fresh files.

Rules:
- **Any new CSS/JS/asset referenced from `index.html` must get `?v=__V__`.** Assets loaded from JS go through `withV()` in `app.js`.
- Locally `__V__` stays literal — harmless (`http.server` ignores the query; `app.js` ignores an unreplaced value).
- Don't hand-edit `__V__` into a real value in the repo.

## Verifying a deploy

```bash
TOK="$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')"
GH_TOKEN="$TOK" gh run list -R aniimoz/aniimoz.github.io --workflow deploy.yml -L 3
GH_TOKEN="$TOK" gh run watch <run-id> -R aniimoz/aniimoz.github.io --exit-status
curl -s https://aniimoz.github.io/ | grep -o 'app.js?v=[0-9a-f]*'   # should equal: git rev-parse --short origin/main
```

Then check the page visually with the `screenshot-test` skill (desktop + mobile).

## If Pages source ever gets reset

```bash
GH_TOKEN="$TOK" gh api -X PUT repos/aniimoz/aniimoz.github.io/pages -f build_type=workflow
```
(Reverting to branch deploy: `-f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'` — but then `__V__` is served literally and caching problems return.)

## Limits & gotchas

- **Soft limits:** site ≤ 1 GB, ≤ 100 GB bandwidth/month. Keep assets lean (see `static-site`).
- `.nojekyll` is added to `_site` by Deploy; no Jekyll processing happens.
- The `github-pages` environment only allows deployments from `main`.
- **Custom domain (later):** add a `CNAME` file at root (it is copied into `_site`), set DNS, enable "Enforce HTTPS" in Settings → Pages.
