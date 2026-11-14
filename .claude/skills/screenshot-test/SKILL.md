---
name: screenshot-test
description: Use when taking screenshots to visually test this site at realistic desktop AND mobile sizes — especially on a large/ultrawide monitor where full-window captures come out huge with big empty margins. Covers standard viewport sizes, resizing the browser before capturing, the maximized-window gotcha, verifying the real viewport, and a crop fallback. Triggers include "screenshot the site", "test on mobile", "check responsive", "chụp màn hình test", "chụp mobile và desktop".
---

# Screenshot testing (desktop + mobile)

Goal: capture the site at **standard viewport sizes** so screenshots are legible and actually exercise the responsive breakpoints — not a full-screen shot of a huge monitor where the ~1040px content floats in empty margins.

Browser tools: `claude-in-chrome` (load with ToolSearch first). Key tools: `resize_window`, `computer` (screenshot), `javascript_tool`, `navigate`, `tabs_context_mcp`, `tabs_close_mcp`.

## Standard sizes to capture

| Target | width × height | Why |
|---|---|---|
| **Desktop** | **1366 × 768** | Most common laptop; shows the 2-column panel layout |
| Desktop (alt) | 1280 × 800 | Smaller baseline |
| **Mobile** | **390 × 844** | iPhone 12–15; triggers this site's mobile layout |
| Mobile (alt) | 360 × 800 | Common Android width |

This site's **mobile breakpoint is `max-width: 680px`** (`assets/css/styles.css`). Any width ≤ 680 shows the mobile layout: panels stack, the element grid gets smaller cells, hero images shrink. So a capture at 390 px proves the mobile design; a capture ≥ ~700 px proves desktop.

## The core procedure

```
1. resize_window({ width, height, tabId })
2. VERIFY it actually applied (see gotcha) — javascript_tool: window.innerWidth
3. navigate / reload so layout settles at the new width
4. computer screenshot  (save_to_disk: true if sending to the user)
5. repeat for the next size
6. tabs_close_mcp any tab you created
```

Capture desktop first, then mobile, from the same tab.

## ⚠️ Gotcha: a MAXIMIZED window ignores resize (big/ultrawide monitors)

`resize_window` returns "Successfully resized…" **even when nothing changed.** On a maximized Chrome window (the default on large/ultrawide screens), Chrome ignores the width/height, so the viewport stays at full monitor width and the screenshot is just a downscaled picture of the whole screen. Opening a **new** window via `tabs_context_mcp` does **not** help — new windows inherit the maximized state.

**Always verify** after resizing, before trusting the shot:

```js
// javascript_tool on the tab
JSON.stringify({ w: window.innerWidth, h: window.innerHeight })
```

- If `w` ≈ your target (e.g. ~1366 or ~390) → good, screenshot.
- If `w` still equals the monitor width (e.g. 3440, 2560, 1920) → **the window is maximized; resize was a no-op.**

### Un-maximize so resize can work (do this once per session)

Chrome can only be resized to arbitrary sizes while **restored** (not maximized). These tools cannot un-maximize a window — a page-targeted key event can't drive OS window management — so it takes one manual/OS action:

- **Windows:** double-click the Chrome title bar, or press **Win + ↓** (restore).
- **macOS:** click the green button with **Option held** → un-zoom, or drag the window smaller.

After the window is restored once, `resize_window` works for the rest of the session and re-verifying `innerWidth` will show the real target width.

## Fallback when you cannot un-maximize (desktop only)

For a clean **desktop** shot without resizing, crop to the content column with the `computer` **`zoom`** action (`region: [x0,y0,x1,y1]` in the screenshot's coordinate frame) around the centered ~1040px content. This removes the empty margins. It does **not** help mobile — the mobile layout needs a genuinely narrow viewport, so mobile testing requires the window to be restored and resized.

## Example (one desktop + one mobile capture)

```
resize_window(1366, 768, tab) → js: innerWidth (expect ~1366) → navigate(site) → screenshot(save_to_disk)
resize_window(390, 844, tab)  → js: innerWidth (expect ~390)  → navigate(site) → screenshot(save_to_disk)
tabs_close_mcp(tab)
```

Send both with SendUserFile (desktop + mobile side by side) so the responsive design can be reviewed at a glance.
