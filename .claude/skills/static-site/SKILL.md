---
name: static-site
description: Use when building, editing, or adding pages/assets to this static HTML/CSS/JS site (no build step, no framework) served by GitHub Pages. Covers file layout, relative paths, asset naming, image handling, embedding data, and local testing. Triggers include editing index.html, assets/, adding a page, adding images, or "add a feature to the site".
---

# Static site (no build) — aniimoz.github.io

This repo is a **plain static site**: hand-written HTML/CSS/JS, **no build step, no framework, no bundler**. GitHub Pages serves the files as-is from the `main` branch root. See the `github-pages` skill for deploy/verify.

## Layout (keep it this way)

```
index.html                 ← homepage, entry point, lives at repo ROOT
assets/
  css/styles.css           ← all styles
  js/data.js               ← data as plain JS objects/arrays
  js/app.js                ← behaviour (IIFE, vanilla DOM, no deps)
  elements/<slug>.png      ← images
```

New pages go at root (`about.html`) or in a folder with its own `index.html` (`/guide/` → `guide/index.html`). Reuse `assets/` rather than duplicating.

## Hard rules

1. **Relative paths only — never a leading `/`.** Use `assets/css/styles.css`, `assets/elements/lua.png`. (This is a user root site so `/assets/...` happens to work, but relative keeps pages portable into subfolders and local file opening working.)
2. **Asset filenames: lowercase ASCII slugs, no spaces, no Vietnamese diacritics.** `anh-sang.png`, not `ánh sáng.png`. URLs with spaces/accents break or need escaping. When importing assets with Vietnamese names, rename to slugs first (see below).
3. **No external CDN/build tooling unless the user asks.** Vanilla JS keeps it zero-dependency and instantly previewable by opening `index.html`.
4. **Data lives in `assets/js/data.js`** as JS literals, not fetched JSON (avoids `fetch` + CORS issues on `file://` and keeps it one push). Derive views from the data; don't hardcode what can be computed.

## Importing images with Vietnamese filenames (gotcha we hit)

Source art often has names like `ánh sáng.png`, `nước.png`. Rename to ASCII slugs. On this Windows machine:

- **Rename/copy reliably** with Python matching on NFC-normalized names (filenames are unicode). Run `python` **without** `-I` if you need `PYTHONUTF8`/`PYTHONIOENCODING` — isolated mode ignores env vars; instead call `sys.stdout.reconfigure(encoding="utf-8")` inside the script and print only ASCII.
- **Shrink oversized art** (these were 1920×1080, ~850 KB each). Keep the page light (aim < ~200 KB/image). PIL isn't installed here; use PowerShell `System.Drawing` to resize (max ~512px) and re-save PNG. Add `loading="lazy"` on `<img>`.

## Local testing before you push

Opening `index.html` directly (`file://`) works because there's no `fetch`. For a server-like check: `python -m http.server 8000` in the repo root, then open `http://localhost:8000`. Verify in the browser (clicks, both view modes, mobile width) **before** pushing — a push is a publish (see `github-pages`).

## This site's app (aniimo type chart)

- 9 elements + a verified 9×9 effectiveness matrix in `assets/js/data.js` (`ELEMENTS`, `MATRIX`, `mult(att, def)`). Order: bang, nuoc, dien, lua, co, tho, phong, am, anh-sang.
- Multipliers: ×1.6 (super) / ×1.0 (neutral) / ×0.625 (resisted). Dual-type **defense** = product of both; **attack** = best (max) of the two types.
- If you change `MATRIX`, re-verify against `D:\Projects\aniimo\Aniimo-He-Tuong-Khac.md` section 4 before pushing. The matrix there is the source of truth (cross-checked attack/defence, 100% match).
