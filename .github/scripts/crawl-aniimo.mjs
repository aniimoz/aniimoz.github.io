#!/usr/bin/env node
/*
 * Crawl dữ liệu aniimo từ wiki chính thức → assets/data/aniimo.json
 *
 * Wiki (Nuxt) nhúng sẵn dữ liệu JSON trong HTML (<script id="__NUXT_DATA__">),
 * nên chỉ cần tải HTML và giải mã, không cần trình duyệt.
 *   - Trang danh sách  /vi                     → toàn bộ aniimo (tên, hệ, vai trò, ảnh, mô tả)
 *   - Trang chi tiết   /vi/item/<số>/<hình thái>[/<vùng>] → hệ/ảnh/chỉ số của ĐÚNG hình thái đó,
 *                      và morphologyList = các hình thái khác → được crawl thêm.
 * Mỗi hình thái là một mục riêng trong JSON (hình thái có thể mang hệ khác bản cơ bản).
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
  log(`  ${entries.length} mục trong danh sách`);

  // MỖI HÌNH THÁI LÀ MỘT ANIIMO RIÊNG (hình thái có thể mang hệ khác, vd. Emberpup Cao Nguyên = Lửa + Thổ).
  // Trang danh sách chỉ có hình thái mặc định (+ vài Prismana); các hình thái còn lại được phát hiện qua
  // `morphologyList` trên trang chi tiết rồi đưa vào hàng đợi.
  // Lưu ý: số hiệu đánh RIÊNG THEO VÙNG (#001 vùng này ≠ #001 vùng khác) → khoá luôn kèm mã vùng.
  const keyOf = (no, form, region) => `${region || 0}|${no}|${form}`;
  const queue = [];
  const queued = new Set();
  function enqueue(no, form, region, listKey) {
    const key = keyOf(no, form, region);
    if (queued.has(key)) return;
    queued.add(key);
    queue.push({ no: String(no), form: form || "Basic Form", region: region || 0, listKey });
  }
  for (const e of entries) enqueue(e.searchKey.entryId, e.searchKey.currentMorphology, e.searchKey.countryId, e.searchKey);

  const urlFor = (q) => {
    const base = `/${LANG}/item/${q.no}/${slugForm(q.form)}`;
    const withRegion = `${base}/${q.region}`;
    if (pageLinks.has(withRegion)) return withRegion;
    if (pageLinks.has(base)) return base;
    return q.region ? withRegion : base;
  };

  // Gộp các hình thái của cùng một aniimo theo TÊN (Prismana nằm ở vùng riêng "Kỷ Vật Mùa Giải"
  // nên không gộp được bằng vùng + số hiệu).
  const familyOf = (name) => String(name || "").trim().toLowerCase();
  function itemFrom(k, relUrl) {
    const unknown = (k.attributes || []).filter((a) => !ELEMENT_MAP[a]);
    if (unknown.length) warnings.push(`${k.name} (${k.currentMorphology}): hệ lạ ${unknown.join(",")}`);
    const form = k.currentMorphology || "Basic Form";
    return {
      no: String(k.entryId),
      name: k.name,
      form,
      formVi: null,
      baseForm: form === "Basic Form",
      family: familyOf(k.name), // các hình thái của cùng một aniimo có cùng family
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
  }

  let formNames = {}; // "Basic Form" → "Hình Thái Cơ Bản" (lấy từ trang chi tiết đầu tiên)
  const warnings = [];
  let detailFail = 0;
  let discovered = 0;
  const out = [];

  for (let i = 0; i < queue.length; i++) {   // hàng đợi dài thêm khi phát hiện hình thái mới
    const q = queue[i];
    const relUrl = urlFor(q);
    const tag = `[${i + 1}/${queue.length}] ${q.no} ${q.listKey?.name || ""} (${q.form})`;

    if (!DETAILS) {
      if (q.listKey) out.push(itemFrom(q.listKey, relUrl));
      continue;
    }
    try {
      await sleep(DELAY);
      const root = decodeNuxt(await fetchText(BASE + relUrl));
      if (!Object.keys(formNames).length) {
        const tags = root.data[pickKey(root.data, "morphology-tags")] || [];
        formNames = Object.fromEntries(tags.map((t) => [t.tagKey, t.name]));
      }
      const det = root.data[pickKey(root.data, "aniimo-detail")] || {};
      const sk = det.searchKey || q.listKey;           // dữ liệu của CHÍNH hình thái này
      if (!sk) throw new Error("không thấy searchKey");
      const item = itemFrom(sk, relUrl);

      const f = findObject(root.data, (o) => "serialNumber" in o && "hp" in o);
      if (f) {
        item.stats = {
          hp: num(f.hp), physicalAttack: num(f.physicalAttack), magicAttack: num(f.magicAttack),
          physicalDefense: num(f.physicalDefense), magicDefense: num(f.magicDefense), haste: num(f.haste),
          total: num(f.attributeValue),
        };
        if (f.weightMax) item.weightKg = { min: num(f.weightMin), max: num(f.weightMax) };
        if (f.heightMax) item.heightM = { min: num(f.heightMin), max: num(f.heightMax) };
        if (f.desc && !item.description) item.description = f.desc;
      } else {
        warnings.push(`${tag}: không thấy chỉ số`);
      }
      out.push(item);

      for (const m of det.morphologyList || []) {
        if (!m || m.visible === false || !m.entryId) continue;
        const before = queue.length;
        enqueue(m.entryId, m.currentMorphology, m.countryId, null);
        if (queue.length > before) discovered++;
      }
      process.stdout.write(`  ${tag.replace(q.listKey?.name || "", item.name)} ✓ ${item.elements.join("+")}\n`);
    } catch (e) {
      detailFail++;
      warnings.push(`${tag}: lỗi (${e.message})`);
      process.stdout.write(`  ${tag} ✗ ${e.message}\n`);
      if (q.listKey) out.push(itemFrom(q.listKey, relUrl)); // vẫn giữ dữ liệu từ trang danh sách
    }
  }
  if (DETAILS) log(`  + phát hiện thêm ${discovered} hình thái từ trang chi tiết`);

  for (const it of out) it.formVi = formNames[it.form] || null;
  out.sort((a, b) => (a.regionId || 0) - (b.regionId || 0) || a.no.localeCompare(b.no, "en", { numeric: true })
    || (b.baseForm - a.baseForm) || a.form.localeCompare(b.form));

  // ---------- kiểm tra an toàn trước khi ghi ----------
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}

  // Chế độ chỉ-danh-sách không phát hiện được hình thái phụ → giữ lại các hình thái & chỉ số từ lần crawl trước
  if (!DETAILS && old?.aniimo) {
    const k = (x) => keyOf(x.no, x.form, x.regionId);
    const prev = new Map(old.aniimo.map((x) => [k(x), x]));
    const have = new Set(out.map(k));
    for (const it of out) {
      const p = prev.get(k(it));
      if (p) { it.stats = p.stats; it.weightKg = p.weightKg; it.heightM = p.heightM; it.formVi = it.formVi || p.formVi; }
    }
    for (const p of old.aniimo) if (!have.has(k(p))) out.push(p);
    out.sort((a, b) => (a.regionId || 0) - (b.regionId || 0) || a.no.localeCompare(b.no, "en", { numeric: true })
      || (b.baseForm - a.baseForm) || a.form.localeCompare(b.form));
  }

  const problems = [];
  if (out.length < 50) problems.push(`chỉ có ${out.length} aniimo (nghi wiki đổi cấu trúc)`);
  if (old?.aniimo?.length && out.length < old.aniimo.length * 0.8) problems.push(`số aniimo giảm mạnh: ${old.aniimo.length} → ${out.length}`);
  if (DETAILS && detailFail > queue.length * 0.2) problems.push(`${detailFail}/${queue.length} trang chi tiết lỗi`);
  const dupKeys = out.length - new Set(out.map((x) => keyOf(x.no, x.form, x.regionId))).size;
  if (dupKeys) problems.push(`${dupKeys} mục trùng khoá vùng|số|hình thái`);
  if (warnings.length) { log(`\n⚠ ${warnings.length} cảnh báo:`); warnings.slice(0, 30).forEach((w) => log("  - " + w)); }
  if (problems.length) {
    console.error("\n✗ Dừng, KHÔNG ghi file:\n  - " + problems.join("\n  - "));
    process.exit(1);
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
    count: out.length,               // số mục = số hình thái (mỗi hình thái tính là một aniimo)
    families: new Set(out.map((x) => x.family)).size, // số aniimo khác nhau (gộp hình thái)
    elements: Object.values(ELEMENT_MAP),
    aniimo: out,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
  log(`\n✓ Đã ghi ${OUT}: ${out.length} mục (mỗi hình thái một mục) thuộc ${doc.families} aniimo, ${out.filter((x) => x.stats).length} có chỉ số.`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
