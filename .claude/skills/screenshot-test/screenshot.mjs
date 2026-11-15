#!/usr/bin/env node
/*
 * Chụp màn hình site ở kích thước chuẩn desktop + mobile, KHÔNG phụ thuộc màn hình/cửa sổ.
 * Dùng Chrome headless + DevTools Protocol (Emulation.setDeviceMetricsOverride) — giống
 * "device mode" của DevTools — nên viewport mobile là 390px thật (headless thường bị kẹp ≥500px).
 * Không cần cài gì: chỉ Node ≥ 22 (có sẵn fetch + WebSocket) và Chrome/Edge.
 *
 * Cách dùng:
 *   node screenshot.mjs [url] [--out DIR] [--only desktop|mobile] [--full]
 *                       [--eval "JS chạy trước khi chụp"] [--wait MS] [--chrome PATH]
 * Ví dụ:
 *   node screenshot.mjs https://aniimoz.github.io/ --out shots
 *   node screenshot.mjs http://localhost:8000 --full --eval "document.querySelectorAll('.el-card')[3].click()"
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SIZES = [
  { name: "desktop-1366x768", width: 1366, height: 768, dpr: 1, mobile: false },
  { name: "mobile-390x844", width: 390, height: 844, dpr: 2, mobile: true },
];

// ---------- tham số ----------
const args = process.argv.slice(2);
const opt = { url: "https://aniimoz.github.io/", out: ".", only: null, full: false, eval: null, wait: 800, chrome: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opt.out = args[++i];
  else if (a === "--only") opt.only = args[++i];
  else if (a === "--full") opt.full = true;
  else if (a === "--eval") opt.eval = args[++i];
  else if (a === "--wait") opt.wait = +args[++i];
  else if (a === "--chrome") opt.chrome = args[++i];
  else if (!a.startsWith("--")) opt.url = a;
}
const CANDIDATES = [
  opt.chrome, process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) { console.error("Không tìm thấy Chrome/Edge. Dùng --chrome PATH."); process.exit(1); }
fs.mkdirSync(opt.out, { recursive: true });

// ---------- khởi động Chrome headless ----------
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "shot-"));
const proc = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pageWsUrl() {
  for (let i = 0; i < 75; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("Không kết nối được DevTools của Chrome.");
}

// ---------- client CDP tối giản ----------
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); }
      }
    }
  };
  return {
    ready: new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }),
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id; pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    }),
    once: (method, timeout = 15000) => new Promise((resolve) => {
      const w = { method, resolve }; waiters.push(w);
      setTimeout(() => resolve(null), timeout);
    }),
    close: () => ws.close(),
  };
}

// ---------- chụp ----------
try {
  const c = cdp(await pageWsUrl());
  await c.ready;
  await c.send("Page.enable");
  for (const s of SIZES) {
    if (opt.only && !s.name.startsWith(opt.only)) continue;
    await c.send("Emulation.setDeviceMetricsOverride", { width: s.width, height: s.height, deviceScaleFactor: s.dpr, mobile: s.mobile });
    await c.send("Emulation.setTouchEmulationEnabled", { enabled: s.mobile });
    const loaded = c.once("Page.loadEventFired");
    await c.send("Page.navigate", { url: opt.url });
    await loaded;
    await sleep(opt.wait); // chờ ảnh/lazy-load
    if (opt.eval) { await c.send("Runtime.evaluate", { expression: opt.eval, awaitPromise: true }); await sleep(300); }

    const vw = (await c.send("Runtime.evaluate", { expression: "innerWidth+'x'+innerHeight", returnByValue: true })).result.value;
    let height = s.height;
    if (opt.full) {
      height = (await c.send("Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true })).result.value;
      await c.send("Emulation.setDeviceMetricsOverride", { width: s.width, height, deviceScaleFactor: s.dpr, mobile: s.mobile });
      await sleep(300);
    }
    // Ảnh loading="lazy" ngoài màn hình chưa tải → ép tải ngay và đợi xong (tối đa 8s)
    await c.send("Runtime.evaluate", {
      awaitPromise: true,
      expression: `(async () => {
        const imgs = [...document.images];
        imgs.forEach((i) => { i.loading = "eager"; });
        await Promise.race([
          Promise.all(imgs.map((i) => (i.complete && i.naturalWidth) ? 0 : new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }))),
          new Promise((r) => setTimeout(r, 8000)),
        ]);
      })()`,
    });
    await sleep(200);
    const shot = await c.send("Page.captureScreenshot", { format: "png" });
    const file = path.join(opt.out, `${s.name}${opt.full ? "-full" : ""}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(`✓ ${s.name}: viewport ${vw}${opt.full ? `, full height ${height}` : ""} → ${file}`);
  }
  c.close();
} catch (e) {
  console.error("Lỗi:", e.message);
  process.exitCode = 1;
} finally {
  proc.kill();
  await sleep(300);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
}
