---
name: screenshot-test
description: Use when taking screenshots to visually test this site at standard desktop AND mobile sizes — regardless of how big the user's monitor is (their screen is a 3440px ultrawide, so normal browser captures come out huge with empty margins). Runs headless Chrome with DevTools device emulation via the bundled screenshot.mjs. Triggers include "screenshot the site", "test on mobile", "check responsive", "chụp màn hình test", "chụp mobile và desktop".
---

# Screenshot testing (desktop + mobile)

Capture the site at **fixed standard viewports**, independent of the user's monitor or window state. Use the bundled script — it is the primary method.

## Primary method: `screenshot.mjs` (headless Chrome + device emulation)

```bash
# both sizes, viewport only
node .claude/skills/screenshot-test/screenshot.mjs https://aniimoz.github.io/ --out <scratchpad>/shots

# full-page, after interacting (e.g. select the 4th element = Lửa)
node .claude/skills/screenshot-test/screenshot.mjs https://aniimoz.github.io/ --out <scratchpad>/shots --full \
  --eval "document.querySelectorAll('.el-card')[3].click()"

# local dev server instead of the live site
node .claude/skills/screenshot-test/screenshot.mjs http://localhost:8000 --only mobile
```

| Size | Viewport | DPR | Output file |
|---|---|---|---|
| Desktop | **1366 × 768** | 1 | `desktop-1366x768.png` |
| Mobile | **390 × 844** | 2 (crisp, 780px-wide image) | `mobile-390x844.png` |

Options: `--out DIR` · `--only desktop|mobile` · `--full` (whole page height) · `--eval "JS"` (run before capture: click, open the matrix tab, pick a secondary type…) · `--wait MS` (default 800, for images) · `--chrome PATH`.

Before capturing, the script forces every `loading="lazy"` image to load and waits for them (max 8 s) — otherwise full-page shots show empty boxes below the first screen. If the page fetches data after load (e.g. `aniimo.json`), give `--eval` a promise that waits, e.g. `"…click(); new Promise(r => setTimeout(r, 1500))"`.

Needs only **Node ≥ 22** (built-in `fetch`/`WebSocket`) and Chrome or Edge — no npm install. Each line it prints reports the **actual** viewport, e.g. `viewport 390x844`; if that number isn't the target, the shot isn't valid.

Then: `Read` the PNGs to inspect them yourself, and `SendUserFile` them (desktop + mobile together) so the user can review. Write outputs to the scratchpad, never into the repo (a push publishes everything).

### Useful `--eval` snippets for this site
- Select an element: `document.querySelectorAll('.el-card')[i].click()` (order: Băng, Nước, Điện, Lửa, Cỏ, Thổ, Phong, Ám, Ánh sáng)
- Add a secondary type: `…[3].click(); document.querySelectorAll('#secondary-grid .chip')[6].click()` (index 0 = "Không")
- Matrix view: `document.getElementById('tab-matrix').click()`

## Why not the other ways (verified in this repo)

- **`chrome --headless --window-size=390,844 --screenshot`** — Chrome clamps the headless window to a **minimum 500 px** width (measured: 390 → 500×749), so the "mobile" shot overflows and gets cut on the right. Fine for desktop only.
- **claude-in-chrome `resize_window`** — returns "Successfully resized" but is a **no-op on a maximized window** (`window.innerWidth` stayed 3440). New windows from `tabs_context_mcp` open maximized too, and these tools can't un-maximize. Also its screenshots are a downscaled picture of the whole 3440px screen.
- Use the real browser (claude-in-chrome) for **interactive** checks — clicking, console errors — not for size-accurate screenshots.

## Breakpoint reference

This site's mobile breakpoint is `max-width: 680px` (`assets/css/styles.css`). At 390px expect: 3-column element grid, panels stacked in one column, smaller hero images. At 1366px expect: 6-column grid, attack/defense panels side by side. Check for horizontal overflow (anything cut off on the right) on mobile.
