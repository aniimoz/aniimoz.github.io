---
name: github-pages
description: Use when deploying, publishing, or verifying this site on GitHub Pages, or troubleshooting why the live aniimoz.github.io is stale, 404, or unstyled. Covers the push-to-publish model, enabling Pages, build timing, limits, custom domains, and the .nojekyll flag. Triggers include "deploy", "publish", "push the site", "go live", "it's not updating", "check the live site".
---

# GitHub Pages — publishing aniimoz.github.io

This is a **user site** (`<user>.github.io`), so Pages serves it at the apex URL:

> https://aniimoz.github.io

## The publish model (know this cold)

- Pages builds and serves from the **root of the `main` branch**. **Every push to `main` is a deploy** — treat `main` as production.
- A push triggers a Pages build; the live site updates **usually within ~1 minute**, sometimes up to a few. It is **not** instant — if the site looks unchanged right after pushing, wait and hard-refresh (Ctrl+F5) before assuming a bug.
- Commit/push as the repo owner with **no AI attribution** (see root `CLAUDE.md` and the `git-commit-push` skill). GitHub auth is already set via Git Credential Manager — just `git push`, never re-auth.

## Verifying the live site (do this after every deploy)

1. Confirm the push landed: `git log origin/main -1`.
2. Check the Pages build status: `gh api repos/aniimoz/aniimoz.github.io/pages/builds/latest --jq '.status,.error.message'` (status `built` = ok). If `gh` isn't authed, borrow the GCM token for one command (see `git-commit-push`).
3. Open the real URL in a browser and exercise it (both view modes, a few elements, mobile width). Pages caches hard — **hard-refresh**.

## First-time enablement (if the site 404s)

A brand-new repo may not have Pages turned on. Enable it to build from `main` / root:

```bash
gh api -X POST repos/aniimoz/aniimoz.github.io/pages -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null \
  || gh api -X PUT repos/aniimoz/aniimoz.github.io/pages -f 'build_type=legacy' -f 'source[branch]=main' -f 'source[path]=/'
```

Then check `gh api repos/aniimoz/aniimoz.github.io/pages --jq '.html_url,.status'`. HTTPS enforcement is on by default for `github.io`.

## Limits & gotchas

- **Soft limits:** site ≤ 1 GB, ≤ 100 GB bandwidth/month, ≤ 10 builds/hour. Keep assets lean (optimize images — see `static-site`).
- **Jekyll runs by default.** This site is plain HTML, so files/folders starting with `_` would be ignored. If you ever add one (or any build you don't want processed), add an empty **`.nojekyll`** file at root to disable Jekyll entirely.
- **Custom domain (later):** add a `CNAME` file (one line: the domain) at root, set DNS, then re-enable "Enforce HTTPS" in repo Settings → Pages once the cert issues. Not needed while on `aniimoz.github.io`.
- **Caching:** assets can be cached aggressively by the CDN and the browser; a hard-refresh (or a changed filename) is the reliable way to see updates.
