/* Aniimo — Tra cứu tương khắc. Vanilla JS, không build. */
(function () {
  "use strict";

  // Phiên bản tài nguyên (mã commit, do workflow Deploy gắn vào index.html) → chống cache cũ
  const V = typeof window.ASSET_V === "string" && !window.ASSET_V.includes("__") ? window.ASSET_V : "";
  const withV = (u) => (V ? `${u}?v=${V}` : u);
  const IMG = (id) => withV(`assets/icons/${id}.png`);
  // roles: vai trò đang lọc (rỗng = tất cả); giữ nguyên khi đổi hệ
  const state = { primary: null, secondary: null, aniimo: null, aniimoError: false, aniimoUpdated: null, sort: "power", roles: new Set(), stages: new Set() };

  /* ---------- dữ liệu aniimo (crawl từ wiki bởi workflow "Crawl") ---------- */
  const WIKI_HOST = "https://wiki.aniimo.com/";
  const CDN_HOST = "https://worldx-website-cdn.aniimo.com/";
  // Nhãn vai trò: wiki chỉ có mã (position-dps…), nhãn tiếng Việt do trang này đặt.
  const ROLE_LABEL = { dps: "Sát thương", break: "Phá thế", energy: "Năng lượng", heal: "Hồi máu", sup: "Hỗ trợ" };
  const ROLE_ORDER = ["dps", "break", "sup", "heal", "energy"];
  const ROLE_ICON = { dps: "⚔️", break: "💥", sup: "🛡️", heal: "💚", energy: "🔋" };
  const safeUrl = (u, host) => (typeof u === "string" && u.startsWith(host) ? u : null);
  // Ảnh gốc ~450KB; CDN (Alibaba OSS) thu nhỏ + đổi sang WebP ngay trên máy chủ (~9KB).
  const thumb = (u) => u + "?x-oss-process=image/resize,h_220/format,webp";

  function loadAniimo() {
    fetch(withV("assets/data/aniimo.json"), { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => {
        state.aniimo = (d.aniimo || []).filter((a) => Array.isArray(a.elements) && a.elements.every((e) => BY_ID[e]));
        state.aniimoUpdated = d.updatedAt || null;
      })
      .catch(() => { state.aniimoError = true; })
      .finally(() => { if (state.primary) { renderPairSuggest(); renderDetail(); } });
  }

  /* ---------- tiện ích tạo DOM ---------- */
  function h(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") n.className = attrs[k];
        else if (k === "html") n.innerHTML = attrs[k];
        else if (k === "style") n.setAttribute("style", attrs[k]);
        else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  /* ---------- phân loại hệ số ---------- */
  const near = (a, b) => Math.abs(a - b) < 0.001;
  function singleLevel(v) {
    if (near(v, S)) return { key: "super", mx: "×1.6", cls: "lv-super" };
    if (near(v, W)) return { key: "weak", mx: "×0.625", cls: "lv-weak" };
    return { key: "neu", mx: "×1.0", cls: "lv-neu" };
  }
  function productLevel(v) {
    if (near(v, 2.56)) return { key: "xsuper", mx: "×2.56", cls: "lv-xsuper", label: "Yếu kép (rất nguy hiểm)" };
    if (near(v, 1.6))  return { key: "super",  mx: "×1.6",  cls: "lv-weak",   label: "Yếu trước" };
    if (near(v, 1.0))  return { key: "neu",    mx: "×1.0",  cls: "lv-neu",    label: "Trung tính" };
    if (near(v, 0.625))return { key: "weak",   mx: "×0.625",cls: "lv-super",  label: "Kháng được" };
    return { key: "xweak", mx: "×0.39", cls: "lv-xsuper", label: "Kháng mạnh (rất lì)" };
  }

  /* ---------- các mảnh giao diện dùng lại ---------- */
  function typeTag(e) {
    return h("span", { class: "type-tag", style: `background:color-mix(in srgb, ${e.color} 22%, transparent); color:${e.color}` }, [
      h("img", { class: "tag-ic", src: IMG(e.id), alt: "" }),
      e.name,
    ]);
  }
  function relChip(e) {
    return h("span", { class: "rel-chip" }, [
      h("img", { class: "ic", src: IMG(e.id), alt: "", loading: "lazy" }),
      `${e.name}`,
    ]);
  }
  function relRow(labelHtml, mx, cls, elems, emptyText) {
    const label = h("div", { class: "rel-label" }, [
      h("span", { html: labelHtml }),
      mx ? h("span", { class: "mx " + cls }, mx) : null,
    ]);
    const chips = h("div", { class: "rel-chips" },
      elems.length ? elems.map(relChip) : [h("span", { class: "rel-chip none" }, emptyText || "— không có —")]
    );
    return h("div", { class: "rel-row" }, [label, chips]);
  }

  /* ---------- render lưới hệ chính ---------- */
  function renderPrimaryGrid() {
    const grid = document.getElementById("primary-grid");
    clear(grid);
    ELEMENTS.forEach((e) => {
      const selected = state.primary === e.id;
      const card = h("div", {
        class: "el-card" + (selected ? " is-selected" : ""),
        style: `--sel:${e.color}`,
        role: "option",
        "aria-selected": selected ? "true" : "false",
        tabindex: "0",
        onclick: () => selectPrimary(selected ? null : e.id),
        onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectPrimary(selected ? null : e.id); } },
      }, [
        h("span", { class: "badge-primary" }, "Hệ chính"),
        h("img", { class: "el-icon", src: IMG(e.id), alt: "", width: "64", height: "64" }),
        h("div", { class: "el-name" }, e.name),
        h("div", { class: "el-en" }, e.en),
      ]);
      grid.appendChild(card);
    });
  }

  /* ---------- render hàng chip hệ phụ ---------- */
  function renderSecondaryGrid() {
    const block = document.getElementById("secondary-block");
    const row = document.getElementById("secondary-grid");
    clear(row);
    block.style.display = state.primary ? "" : "none";
    if (!state.primary) return;

    row.appendChild(h("span", {
      class: "chip chip-none" + (state.secondary ? "" : " is-selected"),
      onclick: () => selectSecondary(null),
    }, "Không (hệ đơn)"));

    ELEMENTS.forEach((e) => {
      const isPrimary = e.id === state.primary;
      const selected = state.secondary === e.id;
      row.appendChild(h("span", {
        class: "chip" + (selected ? " is-selected" : "") + (isPrimary ? " is-disabled" : ""),
        style: `--sel:${e.color}`,
        onclick: isPrimary ? null : () => selectSecondary(selected ? null : e.id),
      }, [h("img", { class: "chip-ic", src: IMG(e.id), alt: "" }), e.name]));
    });
    renderPairSuggest();
  }

  /* ---------- gợi ý hệ phụ nên ghép ----------
   * Chấm theo hồ sơ PHÒNG THỦ khi ghép 2 hệ (giống mục 7 "Gợi ý hệ phụ nên ghép" trong tài liệu gốc):
   *   W = số lần bị khắc (yếu kép ×2.56 tính 2), R = số lần kháng (kháng mạnh ×0.39 tính 2), Điểm = R − W.
   *   Bằng điểm → ít yếu kép hơn → ít bị khắc hơn → kháng được nhiều hệ khác nhau hơn.
   * Công thức này tái tạo đúng 100% thứ hạng & nhãn đánh giá của tài liệu (đã kiểm chứng cho cả 9 hệ chính).
   */
  const RATINGS = [
    { min: 4, label: "Rất tốt", cls: "rt-5" }, { min: 3, label: "Tốt", cls: "rt-4" }, { min: 2, label: "Khá", cls: "rt-3" },
    { min: 1, label: "Trung bình", cls: "rt-2" }, { min: 0, label: "Kém", cls: "rt-1" }, { min: -99, label: "Nên tránh", cls: "rt-0" },
  ];
  const ratingOf = (score) => RATINGS.find((r) => score >= r.min);
  const steps = (v) => Math.round(Math.log(v) / Math.log(S)); // ×1.6→1, ×2.56→2, ×0.625→−1, ×0.39→−2

  // s = null → hồ sơ của HỆ ĐƠN (không thêm hệ phụ), dùng làm mốc so sánh
  function pairProfile(p, s) {
    const weak = [], resist = [];
    let Wt = 0, R = 0, W2 = 0;
    for (const a of ELEMENTS) {
      const k = steps(mult(a.id, p) * (s ? mult(a.id, s) : 1));
      if (k > 0) { Wt += k; if (k === 2) W2++; weak.push({ id: a.id, x2: k === 2 }); }
      else if (k < 0) { R -= k; resist.push({ id: a.id, x2: k === -2 }); }
    }
    return { s, W: Wt, R, W2, score: R - Wt, weak, resist };
  }
  const cmpProfile = (a, b) => b.score - a.score || a.W2 - b.W2 || a.W - b.W || b.resist.length - a.resist.length;
  // Hệ "khắc chế hoàn toàn" một cặp: đánh cặp đó ×2.56 (yếu kép) VÀ kháng cả hai đòn của cặp
  // (cả hai hệ đánh nó đều ×0.625) → gặp là không chịu nổi đòn, cũng không đánh trả được.
  function hardCounters(p, s) {
    if (!s) return [];
    return ELEMENTS.filter((x) => mult(x.id, p) * mult(x.id, s) > 2.5 && Math.max(mult(p, x.id), mult(s, x.id)) < 0.7)
      .map((x) => x.id);
  }
  function hardCounterWarn(p, s, cls) {
    const hc = hardCounters(p, s);
    if (!hc.length) return null;
    return h("span", { class: cls, role: "note" }, [
      "⛔ Bị ",
      ...hc.flatMap((id, i) => [i ? ", " : null, h("img", { src: IMG(id), alt: "" }), h("b", null, BY_ID[id].name)]).filter(Boolean),
      " khắc chế hoàn toàn: nhận ×2.56 mà cả hai đòn đều bị kháng (×0.625)",
    ]);
  }

  // So một cặp hệ với việc giữ hệ đơn — nhất quán với thứ hạng (cùng điểm → phân hạng phụ quyết định)
  function compareToMono(x, mono) {
    const d = x.score - mono.score;
    const c = cmpProfile(x, mono);
    if (c === 0) return { better: null, cls: "d-same", text: "= Ngang hệ đơn — thêm vào không lợi về phòng thủ" };
    const better = c < 0;
    // Cùng điểm → nêu đúng tiêu chí phân hạng phụ đã quyết định (yếu kép → số lần bị khắc → số hệ kháng được)
    const why = x.W2 !== mono.W2 ? (x.W2 > mono.W2 ? "có yếu kép" : "không có yếu kép")
      : x.W !== mono.W ? (x.W > mono.W ? "bị khắc nhiều hơn" : "bị khắc ít hơn")
      : (x.resist.length < mono.resist.length ? "kháng được ít hệ hơn" : "kháng được nhiều hệ hơn");
    if (better) return { better, cls: "d-up", text: d > 0 ? `▲ Tốt hơn hệ đơn (+${d})` : `▲ Nhỉnh hơn hệ đơn (cùng điểm, ${why})` };
    return { better, cls: "d-down", text: d < 0 ? `▼ Kém hơn hệ đơn (${d}) — không nên thêm`
      : `▼ Kém hơn hệ đơn (cùng điểm nhưng ${why}) — không nên thêm` };
  }
  function rankSecondaries(p) {
    return ELEMENTS.filter((e) => e.id !== p).map((e) => pairProfile(p, e.id)).sort(cmpProfile);
  }

  function renderPairSuggest() {
    const box = document.getElementById("pair-suggest");
    if (!box) return;
    clear(box);
    if (!state.primary) return;
    const p = BY_ID[state.primary];
    const ranked = rankSecondaries(p.id);
    const mono = pairProfile(p.id, null);           // "Không thêm hệ phụ" — xếp hạng CHUNG với các hệ phụ
    // mono đặt trước: nếu hoà tuyệt đối với một hệ phụ thì "không thêm" đứng trên (sort ổn định)
    const options = [mono, ...ranked].sort(cmpProfile);
    const shown = state.showAllPairs ? options : options.slice(0, 4);
    // Tốt/kém hơn hệ đơn theo đúng VỊ TRÍ xếp hạng (cùng điểm thì phân hạng phụ quyết định)
    const worseList = ranked.filter((x) => cmpProfile(x, mono) > 0);
    const nBetter = ranked.filter((x) => cmpProfile(x, mono) < 0).length;
    const nSame = ranked.length - nBetter - worseList.length;
    // số aniimo: cặp hệ (s) hoặc chỉ mang hệ chính (s = null)
    const pairCount = (s) => (state.aniimo
      ? state.aniimo.filter((a) => (s ? a.elements.length === 2 && a.elements.includes(s) : a.elements.length === 1) && a.elements.includes(p.id)).length
      : null);
    const icons = (list) => list.length
      ? list.map((x) => h("span", { class: "ps-ic" + (x.x2 ? " x2" : ""), title: `${BY_ID[x.id].name}${x.x2 ? " (kép)" : ""}` }, [
        h("img", { src: IMG(x.id), alt: BY_ID[x.id].name }), x.x2 ? h("sup", null, "²") : null,
      ]))
      : [h("span", { class: "ps-none" }, "—")];

    box.appendChild(h("div", { class: "pair-suggest", style: `--sel:${p.color}` }, [
      h("div", { class: "ps-head" }, [
        h("span", { class: "ps-title" }, `💡 Hệ phụ nên ghép với ${p.name}`),
        h("span", { class: "ps-note" }, "xếp theo khả năng phòng thủ khi ghép: kháng nhiều, yếu ít, tránh yếu kép (²)"),
      ]),
      h("p", { class: "ps-sum" }, [
        `So với không thêm hệ phụ: `,
        h("b", { class: "d-up" }, `${nBetter} hệ phụ tốt hơn`), " · ",
        nSame ? h("b", { class: "d-same" }, `${nSame} ngang`) : null, nSame ? " · " : null,
        h("b", { class: "d-down" }, `${worseList.length} kém hơn`),
        worseList.length ? ` (${worseList.map((x) => BY_ID[x.s].name).join(", ")} — thêm vào còn tệ hơn giữ ${p.name} đơn)` : "",
      ]),
      h("div", { class: "ps-grid" }, shown.map((x) => {
        const rank = options.indexOf(x) + 1;
        const rt = ratingOf(x.score);
        const n = pairCount(x.s);

        // Lựa chọn "Không thêm hệ phụ" (hệ đơn)
        if (!x.s) {
          const selected = !state.secondary;
          return h("button", {
            type: "button", class: `ps-card is-mono ${rt.cls}` + (selected ? " is-selected" : ""), style: `--el:${p.color}`,
            "aria-pressed": selected ? "true" : "false",
            title: selected ? `Đang xem ${p.name} đơn` : `Bỏ hệ phụ, quay về ${p.name} đơn`,
            onclick: () => selectSecondary(null),
          }, [
            h("span", { class: "ps-top" }, [
              h("span", { class: "ps-rank" }, `#${rank}`),
              h("span", { class: "ps-el ps-el-none", "aria-hidden": "true" }, "∅"),
              h("span", { class: "ps-name" }, "Không hệ phụ"),
              h("span", { class: "ps-rating" }, rt.label),
            ]),
            h("span", { class: "ps-row ps-weak" }, [h("span", { class: "ps-lbl" }, "Yếu"), ...icons(x.weak)]),
            h("span", { class: "ps-row ps-res" }, [h("span", { class: "ps-lbl" }, "Kháng"), ...icons(x.resist)]),
            h("span", { class: "ps-delta d-same" }, `${p.name} đơn — mốc để so sánh`),
            h("span", { class: "ps-count" }, n == null ? "" : n ? `${n} aniimo chỉ mang hệ ${p.name}` : `chưa có aniimo nào chỉ mang hệ ${p.name}`),
          ]);
        }

        const e = BY_ID[x.s];
        const selected = state.secondary === x.s;
        const delta = compareToMono(x, mono);
        return h("button", {
          type: "button", class: `ps-card ${rt.cls}` + (selected ? " is-selected" : "") + (delta.better === false ? " is-worse" : "")
            + (hardCounters(p.id, x.s).length ? " has-counter" : ""), style: `--el:${e.color}`,
          "aria-pressed": selected ? "true" : "false",
          title: selected ? "Bỏ chọn hệ phụ này" : `Chọn ${p.name} / ${e.name} để xem chi tiết`,
          onclick: () => selectSecondary(selected ? null : x.s),
        }, [
          h("span", { class: "ps-top" }, [
            h("span", { class: "ps-rank" }, `#${rank}`),
            h("img", { class: "ps-el", src: IMG(e.id), alt: "" }),
            h("span", { class: "ps-name" }, e.name),
            h("span", { class: "ps-rating" }, rt.label),
          ]),
          h("span", { class: "ps-row ps-weak" }, [h("span", { class: "ps-lbl" }, "Yếu"), ...icons(x.weak)]),
          h("span", { class: "ps-row ps-res" }, [h("span", { class: "ps-lbl" }, "Kháng"), ...icons(x.resist)]),
          h("span", { class: `ps-delta ${delta.cls}` }, delta.text),
          hardCounterWarn(p.id, x.s, "ps-warn"),
          h("span", { class: "ps-count" }, n == null ? "" : n ? `${n} aniimo mang cặp hệ này` : "chưa có aniimo nào mang cặp hệ này"),
        ]);
      })),
      h("button", {
        type: "button", class: "link-btn ps-more",
        onclick: () => { state.showAllPairs = !state.showAllPairs; renderPairSuggest(); },
      }, state.showAllPairs ? "Thu gọn" : `Xem cả ${options.length} lựa chọn`),
    ]));
  }

  /* ---------- render chi tiết ---------- */
  function renderDetail() {
    const box = document.getElementById("detail");
    clear(box);
    if (!state.primary) {
      box.appendChild(h("div", { class: "empty-state" }, "⬆️ Chọn một hệ chính để bắt đầu."));
      return;
    }
    const p = BY_ID[state.primary];
    const s = state.secondary ? BY_ID[state.secondary] : null;

    // Hero
    const imgs = h("div", { class: "hero-imgs" }, [p, s].filter(Boolean).map((e) => h("img", { src: IMG(e.id), alt: e.name, style: `--sel:${e.color}` })));
    const tags = h("div", { class: "type-tags" }, [p, s].filter(Boolean).map(typeTag));
    const hero = h("div", { class: "hero" }, [
      imgs,
      h("div", { class: "hero-text" }, [
        h("h2", null, s ? `${p.name} / ${s.name}` : p.name),
        h("p", { class: "sub" }, s ? "Hệ kép — đòn tính với cả hai hệ (nhân hệ số khi phòng thủ)." : `${p.en} · hệ đơn`),
        tags,
        s ? (() => {
          // So sánh phòng thủ với việc giữ hệ đơn
          const c = compareToMono(pairProfile(p.id, s.id), pairProfile(p.id, null));
          const base = c.text.replace("hệ đơn", `${p.name} đơn`);
          const txt = c.better === true ? `${base} về phòng thủ`
            : c.better === false ? `${base.replace(" — không nên thêm", "")} — thêm hệ phụ này còn tệ hơn không thêm`
            : base;
          return h("p", { class: `hero-compare ${c.cls}` }, txt);
        })() : null,
        s ? hardCounterWarn(p.id, s.id, "hero-warn") : null,
      ]),
    ]);

    const panels = s ? dualPanels(p, s) : singlePanels(p);
    box.appendChild(hero);
    box.appendChild(panels);
    box.appendChild(renderSuggestions(p, s));
  }

  /* ---------- gợi ý aniimo mang hệ đã chọn ---------- */
  function renderSuggestions(p, s) {
    const sec = h("section", { class: "suggest", style: `--sel:${p.color}` });
    const title = s ? `Aniimo mang hệ ${p.name} / ${s.name}` : `Aniimo mang hệ ${p.name}`;

    if (state.aniimoError) {
      sec.appendChild(h("h3", { class: "suggest-title" }, `🐾 ${title}`));
      sec.appendChild(h("div", { class: "empty-state" }, "Không tải được dữ liệu aniimo. Hãy mở trang qua http(s), không mở trực tiếp file."));
      return sec;
    }
    if (!state.aniimo) {
      sec.appendChild(h("h3", { class: "suggest-title" }, `🐾 ${title}`));
      sec.appendChild(h("div", { class: "empty-state" }, "Đang tải danh sách aniimo…"));
      return sec;
    }

    const has = (a, id) => a.elements.includes(id);
    let groups;
    if (s) {
      groups = [{ label: null, items: state.aniimo.filter((a) => a.elements.length === 2 && has(a, p.id) && has(a, s.id)) }];
    } else {
      groups = [
        { label: `Chỉ hệ ${p.name}`, items: state.aniimo.filter((a) => a.elements.length === 1 && has(a, p.id)) },
        { label: `${p.name} + hệ khác`, hint: "bấm để tính theo cặp hệ", items: state.aniimo.filter((a) => a.elements.length === 2 && has(a, p.id)) },
      ];
    }
    // ---- bộ lọc: vai trò & giai đoạn ----
    // Trong một bộ lọc: chọn nhiều = "hoặc"; giữa hai bộ lọc: "và". Rỗng = tất cả (mặc định).
    // Số trên mỗi nút tính theo bộ lọc CÒN LẠI (vd. đang lọc Hồi máu → nút giai đoạn chỉ đếm healer).
    const allItems = groups.flatMap((g) => g.items);
    const totalAll = allItems.length;
    const roleOn = state.roles.size > 0;
    const stageOn = state.stages.size > 0;
    const roleMatch = (a) => !roleOn || a.roles.some((r) => state.roles.has(r));
    const stageMatch = (a) => !stageOn || state.stages.has(String(a.stage));
    const roleCount = {}, stageCount = {};
    allItems.filter(stageMatch).forEach((a) => a.roles.forEach((r) => { roleCount[r] = (roleCount[r] || 0) + 1; }));
    allItems.filter(roleMatch).forEach((a) => { if (a.stage != null) stageCount[a.stage] = (stageCount[a.stage] || 0) + 1; });
    const anyFilter = roleOn || stageOn;
    groups = groups.map((g) => ({ ...g, items: g.items.filter((a) => roleMatch(a) && stageMatch(a)) }));
    const total = groups.reduce((n, g) => n + g.items.length, 0);

    const sortBtn = (key, label) => h("button", {
      class: "sort-btn" + (state.sort === key ? " is-active" : ""), type: "button",
      onclick: () => { state.sort = key; renderDetail(); },
    }, label);
    sec.appendChild(h("div", { class: "suggest-head" }, [
      h("h3", { class: "suggest-title" }, [`🐾 ${title}`, h("span", { class: "count" }, anyFilter ? `${total}/${totalAll}` : String(total))]),
      h("div", { class: "sort-switch", role: "group", "aria-label": "Sắp xếp" }, [sortBtn("power", "Mạnh nhất"), sortBtn("no", "Số hiệu")]),
    ]));
    sec.appendChild(h("p", { class: "suggest-note" }, "Mỗi hình thái tính là một aniimo riêng — nhiều hình thái (Cao Nguyên, Ban Đêm, Prismana…) mang thêm hệ khác bản cơ bản."));

    // Một hàng nút lọc: "Tất cả" + từng giá trị kèm số lượng
    function filterRow(label, set, keys, counts, text, allCount) {
      const on = set.size > 0;
      return h("div", { class: "role-filter", role: "group", "aria-label": `Lọc theo ${label.toLowerCase()}` }, [
        h("span", { class: "role-filter-label" }, `${label}:`),
        h("button", {
          class: "role-chip" + (on ? "" : " is-active"), type: "button", "aria-pressed": on ? "false" : "true",
          onclick: () => { set.clear(); renderDetail(); },
        }, ["Tất cả", h("span", { class: "rc-count" }, String(allCount))]),
        ...keys.map((k) => {
          const n = counts[k] || 0;
          const active = set.has(String(k));
          return h("button", {
            class: "role-chip" + (active ? " is-active" : "") + (n ? "" : " is-empty"), type: "button",
            "aria-pressed": active ? "true" : "false",
            title: n ? `Lọc: ${text(k, true)}` : `Không có aniimo ${text(k, true)} cho lựa chọn này`,
            onclick: () => { set.has(String(k)) ? set.delete(String(k)) : set.add(String(k)); renderDetail(); },
          }, [text(k), h("span", { class: "rc-count" }, String(n))]);
        }),
      ]);
    }

    if (totalAll) {
      // Gom các hàng lọc vào một khối có khoảng cách + đường kẻ ngăn với danh sách bên dưới
      const filters = h("div", { class: "suggest-filters" });
      const roleKeys = ROLE_ORDER.concat(Object.keys(roleCount).filter((r) => !ROLE_ORDER.includes(r)));
      filters.appendChild(filterRow("Vai trò", state.roles, roleKeys, roleCount,
        (r, plain) => (plain ? "" : `${ROLE_ICON[r] || "•"} `) + (ROLE_LABEL[r] || r),
        allItems.filter(stageMatch).length));
      // Giai đoạn: lấy theo dữ liệu (hiện có 1–4), luôn hiện đủ các giai đoạn của toàn bộ dữ liệu
      const stageKeys = [...new Set(state.aniimo.map((a) => a.stage).filter((v) => v != null))].sort((a, b) => a - b);
      if (stageKeys.length) {
        filters.appendChild(filterRow("Giai đoạn", state.stages, stageKeys, stageCount,
          (st, plain) => (plain ? `giai đoạn ${st}` : `Giai đoạn ${st}`),
          allItems.filter(roleMatch).length));
      }
      sec.appendChild(filters);
    }

    if (!totalAll) {
      sec.appendChild(h("div", { class: "empty-state" }, s
        ? `Chưa có aniimo nào mang đúng cặp hệ ${p.name} / ${s.name} trên wiki.`
        : `Chưa có aniimo nào mang hệ ${p.name} trên wiki.`));
    } else if (!total) {
      const parts = [];
      if (roleOn) parts.push(`vai trò ${[...state.roles].map((r) => ROLE_LABEL[r] || r).join(", ")}`);
      if (stageOn) parts.push(`giai đoạn ${[...state.stages].sort().join(", ")}`);
      sec.appendChild(h("div", { class: "empty-state" }, [
        `Không có aniimo ${s ? `${p.name} / ${s.name}` : p.name} nào có ${parts.join(" và ")}. `,
        h("button", { class: "link-btn", type: "button", onclick: () => { state.roles.clear(); state.stages.clear(); renderDetail(); } }, "Bỏ tất cả bộ lọc"),
      ]));
    }

    const byPower = (a, b) => ((b.stats && b.stats.total) || 0) - ((a.stats && a.stats.total) || 0) || a.name.localeCompare(b.name);
    // "Số hiệu": số hiệu đánh riêng theo vùng → xếp theo vùng, số, rồi bản cơ bản trước các hình thái
    const byNo = (a, b) => (a.regionId || 0) - (b.regionId || 0) || a.no.localeCompare(b.no, "en", { numeric: true })
      || ((b.baseForm ? 1 : 0) - (a.baseForm ? 1 : 0)) || (a.form || "").localeCompare(b.form || "");
    groups.forEach((g) => {
      if (!g.items.length) return;
      if (g.label) sec.appendChild(h("div", { class: "suggest-group" }, [
        g.label, h("span", { class: "count" }, String(g.items.length)), g.hint ? h("span", { class: "hint" }, `— ${g.hint}`) : null,
      ]));
      const grid = h("div", { class: "ani-grid" });
      g.items.slice().sort(state.sort === "no" ? byNo : byPower).forEach((a) => grid.appendChild(aniCard(a, p, s)));
      sec.appendChild(grid);
    });

    const upd = state.aniimoUpdated ? new Date(state.aniimoUpdated).toLocaleDateString("vi-VN") : null;
    sec.appendChild(h("p", { class: "suggest-src" }, [
      "Dữ liệu từ ", h("a", { href: "https://wiki.aniimo.com/vi", target: "_blank", rel: "noopener" }, "Aniimo Wiki"),
      upd ? ` · cập nhật ${upd}` : "", " · bản quyền hình ảnh thuộc nhà phát hành Aniimo.",
    ]));
    return sec;
  }

  function aniCard(a, p, s) {
    const others = a.elements.filter((e) => e !== p.id);
    // Bấm vào aniimo hệ kép (khi đang xem hệ đơn) → điền hệ còn lại làm hệ phụ.
    const canPair = !s && a.elements.length === 2 && others.length === 1;
    const img = safeUrl(a.image, CDN_HOST);
    const wiki = safeUrl(a.url, WIKI_HOST);
    const meta = a.roles.map((r) => ROLE_LABEL[r] || r);
    if (a.stage != null) meta.push(`Giai đoạn ${a.stage}`);
    const isBase = a.baseForm != null ? a.baseForm : a.form === "Basic Form";
    const formLabel = isBase ? null : (a.formVi || a.form || "").replace(/^Hình Thái\s*/i, "").replace(/\s*Form$/i, "");
    const pair = () => {
      selectSecondary(others[0]);
      document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return h("article", {
      class: "ani-card" + (canPair ? " is-pairable" : ""),
      title: canPair ? `Tính tương khắc cho cặp ${a.elements.map((e) => BY_ID[e].name).join(" / ")}` : null,
      tabindex: canPair ? "0" : null,
      role: canPair ? "button" : null,
      onclick: canPair ? (ev) => { if (!ev.target.closest("a")) pair(); } : null,
      onkeydown: canPair ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pair(); } } : null,
    }, [
      h("div", { class: "ani-img-wrap" }, [
        img ? h("img", {
          class: "ani-img", src: thumb(img), alt: formLabel ? `${a.name} (${formLabel})` : a.name, loading: "lazy", decoding: "async",
          onerror: (ev) => { if (!ev.target.dataset.fb) { ev.target.dataset.fb = "1"; ev.target.src = img; } },
        }) : null,
        formLabel ? h("span", { class: "ani-form", title: a.formVi || a.form }, formLabel) : null,
      ]),
      h("div", { class: "ani-body" }, [
        h("div", { class: "ani-name" }, [
          a.no && !a.no.startsWith("999") ? h("span", { class: "ani-no" }, `#${a.no}`) : null, a.name,
        ]),
        h("div", { class: "ani-types" }, a.elements.map((e) => h("img", { src: IMG(e), alt: BY_ID[e].name, title: BY_ID[e].name }))),
        meta.length ? h("div", { class: "ani-meta" }, meta.join(" · ")) : null,
        a.stats && a.stats.total ? h("div", { class: "ani-stat" }, [h("b", null, String(a.stats.total)), " tổng chỉ số"]) : null,
      ]),
      wiki ? h("a", { class: "ani-wiki", href: wiki, target: "_blank", rel: "noopener", title: "Xem trên Aniimo Wiki" }, "Wiki ↗") : null,
    ]);
  }

  function singlePanels(p) {
    // Tấn công: p đánh mọi hệ (gồm cả chính nó — "tự kháng").
    const atk = { super: [], weak: [], neu: [] };
    ELEMENTS.forEach((d) => { atk[singleLevel(mult(p.id, d.id)).key].push(d); });
    // Phòng thủ: mọi hệ đánh p (gồm cả chính nó).
    const def = { super: [], weak: [], neu: [] };
    ELEMENTS.forEach((a) => { def[singleLevel(mult(a.id, p.id)).key].push(a); });

    const attackPanel = h("div", { class: "panel" }, [
      h("h3", null, "⚔️ Khi TẤN CÔNG"),
      h("p", { class: "panel-sub" }, `Đòn của ${p.name} gây sát thương lên:`),
      relRow("✅ <b>Khắc</b> — đánh mạnh", "×1.6", "lv-super", atk.super),
      relRow("❌ <b>Bị kháng</b> — đánh yếu", "×0.625", "lv-weak", atk.weak),
      relRow("· Trung tính", "×1.0", "lv-neu", atk.neu),
    ]);
    const defensePanel = h("div", { class: "panel" }, [
      h("h3", null, "🛡️ Khi PHÒNG THỦ"),
      h("p", { class: "panel-sub" }, `${p.name} nhận sát thương từ:`),
      relRow("⚠️ <b>Yếu trước</b> — nhận nhiều", "×1.6", "lv-weak", def.super),
      relRow("🛡️ <b>Kháng được</b> — nhận ít", "×0.625", "lv-super", def.weak),
      relRow("· Trung tính", "×1.0", "lv-neu", def.neu),
    ]);
    return h("div", { class: "panels" }, [attackPanel, defensePanel]);
  }

  function dualPanels(p, s) {
    // Tấn công: aniimo 2 hệ chọn hệ lợi nhất -> lấy max hệ số với mỗi mục tiêu
    const atk = { super: [], neu: [], weak: [] };
    ELEMENTS.forEach((d) => {
      const best = Math.max(mult(p.id, d.id), mult(s.id, d.id));
      atk[singleLevel(best).key].push(d);
    });
    // Phòng thủ: mỗi hệ tấn công -> nhân hệ số 2 hệ
    const buckets = { xsuper: [], super: [], neu: [], weak: [], xweak: [] };
    ELEMENTS.forEach((a) => {
      const v = mult(a.id, p.id) * mult(a.id, s.id);
      buckets[productLevel(v).key].push(a);
    });

    const attackPanel = h("div", { class: "panel" }, [
      h("h3", null, "⚔️ Khi TẤN CÔNG"),
      h("p", { class: "panel-sub" }, "Aniimo 2 hệ ra đòn bằng hệ có lợi nhất với mục tiêu:"),
      relRow("✅ <b>Khắc</b> (ít nhất 1 hệ ×1.6)", "×1.6", "lv-super", atk.super),
      relRow("· Tốt nhất chỉ trung tính", "×1.0", "lv-neu", atk.neu),
      relRow("❌ Cả hai hệ đều bị kháng", "×0.625", "lv-weak", atk.weak),
    ]);
    const defensePanel = h("div", { class: "panel" }, [
      h("h3", null, "🛡️ Khi PHÒNG THỦ (hệ kép)"),
      h("p", { class: "panel-sub" }, "Sát thương = hệ_số(đòn→hệ 1) × hệ_số(đòn→hệ 2)."),
      relRow("☠️ <b>Yếu kép</b> — rất nguy hiểm", "×2.56", "lv-xsuper", buckets.xsuper),
      relRow("⚠️ <b>Yếu trước</b>", "×1.6", "lv-weak", buckets.super),
      relRow("🛡️ <b>Kháng được</b>", "×0.625", "lv-super", buckets.weak),
      relRow("🧱 <b>Kháng mạnh</b> — rất lì", "×0.39", "lv-xsuper", buckets.xweak),
      relRow("· Trung tính", "×1.0", "lv-neu", buckets.neu),
    ]);
    return h("div", { class: "panels" }, [attackPanel, defensePanel]);
  }

  /* ---------- hành động ---------- */
  function selectPrimary(id) {
    state.primary = id;
    if (state.secondary === id) state.secondary = null;
    renderPrimaryGrid(); renderSecondaryGrid(); renderDetail();
  }
  function selectSecondary(id) {
    state.secondary = id;
    renderSecondaryGrid(); renderDetail();
  }

  /* ---------- khởi tạo ---------- */
  function init() {
    renderPrimaryGrid();
    renderSecondaryGrid();
    renderDetail();
    loadAniimo();
    // Hiện phiên bản đang chạy (mã commit) để biết đã lên bản mới chưa
    const ver = document.getElementById("site-version");
    if (ver) ver.textContent = V ? `Phiên bản ${V}` : "Bản chạy trên máy (chưa deploy)";
  }
  document.addEventListener("DOMContentLoaded", init);
})();
