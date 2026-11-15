#!/usr/bin/env node
/*
 * Crawl dữ liệu aniimo từ wiki chính thức → assets/data/aniimo.json
 *
 * Wiki (Nuxt) nhúng sẵn dữ liệu JSON trong HTML (<script id="__NUXT_DATA__">),
 * nên chỉ cần tải HTML và giải mã, không cần trình duyệt.
 *   - Trang danh sách  /vi                     → toàn bộ aniimo (tên, hệ, vai trò, ảnh, mô tả)
 *   - Trang chi tiết   /vi/item/<số>/<hình thái>[/<vùng>] → chỉ số, cân nặng, giới tính…
 *
 * Chạy:  node .github/scripts/crawl-aniimo.mjs
 * Biến môi trường:
 *   CRAWL_DETAILS=false   chỉ lấy danh sách, bỏ qua trang chi tiết (nhanh)
 *   CRAWL_DELAY_MS=700    nghỉ giữa các request (lịch sự với server)
 *   CRAWL_LANG=vi         ngôn ngữ wiki
 *   CRAWL_OUT=path        file đầu ra (mặc định assets/data/aniimo.json)
 * Yêu cầu Node ≥ 22 (fetch có sẵn). Không phụ thuộc thư viện ngoài.
 *
 * An toàn dữ liệu: nếu kết quả bất thường (quá ít aniimo, quá nhiều trang lỗi,
 * hệ lạ…) script thoát với mã lỗi và KHÔNG ghi đè file cũ.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = "https://wiki.aniimo.com";
const LANG = process.env.CRAWL_LANG || "vi";
const DETAILS = (process.env.CRAWL_DETAILS ?? "true") !== "false";
const DELAY = +(process.env.CRAWL_DELAY_MS || 700);
const OUT = process.env.CRAWL_OUT || "assets/data/aniimo.json";
const UA = "Mozilla/5.0 (compatible; aniimoz-crawler/1.0; +https://github.com/aniimoz/aniimoz.github.io)";

// Hệ trên wiki → id hệ dùng trong assets/js/data.js
const ELEMENT_MAP = {
  "attributes-ice": "bang", "attributes-water": "nuoc", "attributes-electric": "dien",
  "attributes-fire": "lua", "attributes-grass": "co", "attributes-rock": "tho",
  "attributes-wind": "phong", "attributes-dark": "am", "attributes-holy": "anh-sang",
};
// Vai trò trên wiki → khoá ngắn + nhãn tiếng Việt
const ROLE_MAP = {
  "position-dps": "dps", "position-break": "break", "position-energy": "energy",
  "position-heal": "heal", "position-sup": "sup",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function fetchText(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": LANG } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < tries) await sleep(1500 * i);
    }
  }
  throw new Error(`${url}: ${lastErr.message}`);
}

/* Giải mã payload Nuxt 3 (định dạng "devalue": mảng phẳng, phần tử tham chiếu bằng chỉ số). */
function decodeNuxt(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Không thấy __NUXT_DATA__ — cấu trúc wiki có thể đã đổi");
  const arr = JSON.parse(m[1]);
  const seen = new Array(arr.length);
  const WRAP = new Set(["Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError", "Island", "Date"]);
  const SPECIAL = { "-1": undefined, "-2": null, "-3": NaN, "-4": Infinity, "-5": -Infinity, "-6": -0 };
  function u(i) {
    if (i < 0) return SPECIAL[i];
    if (seen[i] !== undefined) return seen[i];
    const v = arr[i];
    if (v === null || typeof v !== "object") return (seen[i] = v);
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && WRAP.has(v[0])) return (seen[i] = u(v[1]));
      if (v[0] === "Set" || v[0] === "Map") return (seen[i] = v.slice(1).map(u));
      const out = []; seen[i] = out; v.forEach((x, k) => (out[k] = u(x))); return out;
    }
    const out = {}; seen[i] = out; for (const k in v) out[k] = u(v[k]); return out;
  }
  return u(0);
}

const pickKey = (data, prefix) => Object.keys(data || {}).find((k) => k.startsWith(prefix));

function findObject(node, pred, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return null;
  if (!Array.isArray(node) && pred(node)) return node;
  for (const k in node) {
    const hit = findObject(node[k], pred, depth + 1);
    if (hit) return hit;
  }
  return null;
}

const slugForm = (m) => String(m || "Basic Form").toLowerCase().trim().replace(/\s+/g, "-");
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

async function main() {
  log(`→ Tải danh sách: ${BASE}/${LANG}`);
  const listHtml = await fetchText(`${BASE}/${LANG}`);
  const listRoot = decodeNuxt(listHtml);
  const listKey = pickKey(listRoot.data, "aniimo-wiki-list");
  const list = listKey && listRoot.data[listKey];
  if (!Array.isArray(list)) throw new Error("Không thấy danh sách aniimo trong payload");

  // Tên vùng (countryId → tên) để hiển thị
  const regionKey = pickKey(listRoot.data, "aniimo-country-tags");
  const regions = Object.fromEntries((listRoot.data[regionKey] || []).map((t) => [String(t.tagKey), t.name]));
  // Link thật trên trang, để chọn đúng URL có/không kèm mã vùng
  const pageLinks = new Set((listHtml.match(new RegExp(`"/${LANG}/item/[^"]+"`, "g")) || []).map((s) => s.slice(1, -1)));

  const entries = list.filter((x) => x && x.visible !== false && x.searchKey && x.searchKey.type === "ANIIMO");
  log(`  ${entries.length} aniimo trong danh sách`);

  let formNames = {}; // "Basic Form" → "Hình Thái Cơ Bản" (lấy từ trang chi tiết đầu tiên)
  const warnings = [];
  let detailFail = 0;
  const out = [];

  for (let i = 0; i < entries.length; i++) {
    const k = entries[i].searchKey;
    const unknown = (k.attributes || []).filter((a) => !ELEMENT_MAP[a]);
    if (unknown.length) warnings.push(`${k.name}: hệ lạ ${unknown.join(",")}`);

    const base = `/${LANG}/item/${k.entryId}/${slugForm(k.currentMorphology)}`;
    const withRegion = `${base}/${k.countryId}`;
    const relUrl = pageLinks.has(withRegion) ? withRegion : pageLinks.has(base) ? base : (k.countryId ? withRegion : base);

    const item = {
      no: String(k.entryId),
      name: k.name,
      form: k.currentMorphology || "Basic Form",
      formVi: null,
      stage: num(+k.currentStage),
      regionId: k.countryId || null,
      region: regions[String(k.countryId)] || null,
      elements: (k.attributes || []).map((a) => ELEMENT_MAP[a] || a),
      roles: (k.position || []).map((p) => ROLE_MAP[p] || p),
      description: k.description || "",
      image: k.imageUrl || null,
      url: BASE + relUrl,
      stats: null,
      weightKg: null,
      heightM: null,
    };

    if (DETAILS) {
      try {
        await sleep(DELAY);
        const root = decodeNuxt(await fetchText(BASE + relUrl));
        if (!Object.keys(formNames).length) {
          const tags = root.data[pickKey(root.data, "morphology-tags")] || [];
          formNames = Object.fromEntries(tags.map((t) => [t.tagKey, t.name]));
        }
        const f = findObject(root.data, (o) => "serialNumber" in o && "hp" in o);
        if (!f) throw new Error("không thấy formData");
        item.stats = {
          hp: num(f.hp), physicalAttack: num(f.physicalAttack), magicAttack: num(f.magicAttack),
          physicalDefense: num(f.physicalDefense), magicDefense: num(f.magicDefense), haste: num(f.haste),
          total: num(f.attributeValue),
        };
        if (f.weightMax) item.weightKg = { min: num(f.weightMin), max: num(f.weightMax) };
        if (f.heightMax) item.heightM = { min: num(f.heightMin), max: num(f.heightMax) };
        if (f.desc && !item.description) item.description = f.desc;
        process.stdout.write(`  [${i + 1}/${entries.length}] ${item.no} ${item.name} ✓\n`);
      } catch (e) {
        detailFail++;
        warnings.push(`${item.no} ${item.name}: chi tiết lỗi (${e.message})`);
        process.stdout.write(`  [${i + 1}/${entries.length}] ${item.no} ${item.name} ✗ ${e.message}\n`);
      }
    }
    out.push(item);
  }

  for (const it of out) it.formVi = formNames[it.form] || null;
  out.sort((a, b) => a.no.localeCompare(b.no, "en", { numeric: true }) || a.form.localeCompare(b.form));

  // ---------- kiểm tra an toàn trước khi ghi ----------
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
  const problems = [];
  if (out.length < 50) problems.push(`chỉ có ${out.length} aniimo (nghi wiki đổi cấu trúc)`);
  if (old?.aniimo?.length && out.length < old.aniimo.length * 0.8) problems.push(`số aniimo giảm mạnh: ${old.aniimo.length} → ${out.length}`);
  if (DETAILS && detailFail > out.length * 0.2) problems.push(`${detailFail}/${out.length} trang chi tiết lỗi`);
  if (warnings.length) { log(`\n⚠ ${warnings.length} cảnh báo:`); warnings.slice(0, 30).forEach((w) => log("  - " + w)); }
  if (problems.length) {
    console.error("\n✗ Dừng, KHÔNG ghi file:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }

  // Không lấy chi tiết lần này → giữ lại chỉ số cũ cho những con đã có
  if (!DETAILS && old?.aniimo) {
    const prev = new Map(old.aniimo.map((x) => [`${x.no}|${x.form}|${x.regionId}`, x]));
    for (const it of out) {
      const p = prev.get(`${it.no}|${it.form}|${it.regionId}`);
      if (p) { it.stats = p.stats; it.weightKg = p.weightKg; it.heightM = p.heightM; it.formVi = it.formVi || p.formVi; }
    }
  }

  // Chỉ ghi khi dữ liệu thật sự đổi → workflow không tạo commit thừa
  if (old && JSON.stringify(old.aniimo) === JSON.stringify(out)) {
    log(`\n= Không có thay đổi (${out.length} aniimo). Giữ nguyên ${OUT}.`);
    return;
  }
  const doc = {
    source: `${BASE}/${LANG}`,
    note: "Dữ liệu tổng hợp tự động từ Aniimo Wiki chính thức. Bản quyền nội dung và hình ảnh thuộc nhà phát hành Aniimo.",
    updatedAt: new Date().toISOString(),
    count: out.length,
    elements: Object.values(ELEMENT_MAP),
    aniimo: out,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  log(`\n✓ Đã ghi ${OUT}: ${out.length} aniimo${DETAILS ? `, ${out.length - detailFail} có chỉ số` : ""}.`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
