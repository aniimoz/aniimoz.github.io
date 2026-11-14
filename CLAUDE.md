# CLAUDE.md

Guidance for Claude Code (and other AI assistants) when working in this repository.

## What this repo is

This is **`aniimoz.github.io`** — a **GitHub Pages user site**. Because the repo
name matches `<username>.github.io`, GitHub Pages serves it automatically at:

> https://aniimoz.github.io

It is a static website repo. There is no backend, no server, and no secrets.

## Deployment model (important)

- GitHub Pages builds and serves this site **from the root of the `main` branch**.
- **Every push to `main` goes live** — usually within a minute, with no separate
  build or deploy step. Treat `main` as production.
- `index.html` at the repo root is the site's entry point.
- The site is static files only (HTML / CSS / JS / images). Use **relative paths**
  for all assets so links work both locally and on the live domain.

### Optional config files (add only when needed)
- `CNAME` — a single line with a custom domain, if one is ever configured.
- `.nojekyll` — add an empty file by this name to **disable Jekyll processing**
  (needed if any file/folder starts with `_` and you are not using Jekyll).

## Current state

Minimal — the repo currently contains only `README.md` and this `CLAUDE.md`.
Site content (starting with `index.html`) is yet to be added.

## Conventions

- Keep the site **static and dependency-light**; prefer plain HTML/CSS/JS unless
  the user explicitly asks for a framework or static-site generator.
- Test changes by opening the HTML files locally in a browser before pushing,
  since a push to `main` publishes immediately.
- Keep assets in sensible folders (e.g. `assets/`, `css/`, `js/`, `img/`).

## Git & commits (must follow)

- **Commit as the repo owner, never as an AI.** Do **not** add any AI attribution:
  no "Claude", no "Anthropic", no "Generated with Claude Code", and no
  `Co-Authored-By: Claude` trailer in commit messages, author/committer fields,
  tags, or PR descriptions.
- Author identity for this repo: `siben <dangtiensi.vn@gmail.com>` (matches the
  existing history). If git identity is unset, set it locally to the above.
- `main` is the live branch — push intentionally.
