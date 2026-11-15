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
      .finally(() => { if (state.primary) renderDetail(); });
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
      const roleKeys = ROLE_ORDER.concat(Object.keys(roleCount).filter((r) => !ROLE_ORDER.includes(r)));
      sec.appendChild(filterRow("Vai trò", state.roles, roleKeys, roleCount,
        (r, plain) => (plain ? "" : `${ROLE_ICON[r] || "•"} `) + (ROLE_LABEL[r] || r),
        allItems.filter(stageMatch).length));
      // Giai đoạn: lấy theo dữ liệu (hiện có 1–4), luôn hiện đủ các giai đoạn của toàn bộ dữ liệu
      const stageKeys = [...new Set(state.aniimo.map((a) => a.stage).filter((v) => v != null))].sort((a, b) => a - b);
      if (stageKeys.length) {
        sec.appendChild(filterRow("Giai đoạn", state.stages, stageKeys, stageCount,
          (st, plain) => (plain ? `giai đoạn ${st}` : `Giai đoạn ${st}`),
          allItems.filter(roleMatch).length));
      }
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

  /* ---------- ma trận 9×9 ---------- */
  function renderMatrix() {
    const table = document.getElementById("matrix-table");
    clear(table);

    const thead = h("thead");
    const hrow = h("tr");
    hrow.appendChild(h("th", { class: "corner" }, [document.createTextNode("Công ↓"), h("br"), document.createTextNode("Thủ →")]));
    ELEMENTS.forEach((d) => {
      hrow.appendChild(h("th", { "data-col": IDX[d.id] }, h("div", { class: "m-head" }, [
        h("img", { src: IMG(d.id), alt: "", loading: "lazy" }), d.name,
      ])));
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody = h("tbody");
    ELEMENTS.forEach((a, r) => {
      const tr = h("tr");
      tr.appendChild(h("th", { class: "rowhead" }, h("div", { class: "m-head" }, [
        h("img", { src: IMG(a.id), alt: "", loading: "lazy" }), a.name,
      ])));
      ELEMENTS.forEach((d, c) => {
        const v = mult(a.id, d.id);
        const lv = singleLevel(v);
        const sym = lv.key === "super" ? "▲" : lv.key === "weak" ? "▼" : "·";
        const cls = "c-" + (lv.key === "super" ? "s" : lv.key === "weak" ? "w" : "n") + (r === c ? " diag" : "");
        tr.appendChild(h("td", {
          class: cls, "data-r": r, "data-c": c,
          title: `${a.name} đánh ${d.name}: ${lv.mx}`,
        }, sym));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // tô sáng hàng + cột khi rê chuột
    const rows = Array.from(tbody.children);
    table.addEventListener("mouseover", (ev) => {
      const td = ev.target.closest("td"); if (!td) return;
      const r = +td.dataset.r, c = +td.dataset.c;
      clearHl();
      rows[r].classList.add("hl");
      Array.from(rows[r].children).forEach((cell) => cell.classList.add("hl"));
      rows.forEach((row) => { const cell = row.children[c + 1]; if (cell) cell.classList.add("hl"); });
      const colHead = hrow.children[c + 1]; if (colHead) colHead.classList.add("hl");
      td.classList.add("cell-hl");
    });
    table.addEventListener("mouseleave", clearHl);
    function clearHl() {
      table.querySelectorAll(".hl, .cell-hl").forEach((n) => n.classList.remove("hl", "cell-hl"));
    }
  }

  /* ---------- chuyển chế độ ---------- */
  function setMode(mode) {
    const lookup = mode === "lookup";
    document.getElementById("view-lookup").classList.toggle("is-hidden", !lookup);
    document.getElementById("view-matrix").classList.toggle("is-hidden", lookup);
    document.getElementById("tab-lookup").classList.toggle("is-active", lookup);
    document.getElementById("tab-matrix").classList.toggle("is-active", !lookup);
    document.getElementById("tab-lookup").setAttribute("aria-selected", lookup);
    document.getElementById("tab-matrix").setAttribute("aria-selected", !lookup);
  }

  /* ---------- khởi tạo ---------- */
  function init() {
    renderPrimaryGrid();
    renderSecondaryGrid();
    renderDetail();
    renderMatrix();
    loadAniimo();
    // Hiện phiên bản đang chạy (mã commit) để biết đã lên bản mới chưa
    const ver = document.getElementById("site-version");
    if (ver) ver.textContent = V ? `Phiên bản ${V}` : "Bản chạy trên máy (chưa deploy)";
    document.getElementById("tab-lookup").addEventListener("click", () => setMode("lookup"));
    document.getElementById("tab-matrix").addEventListener("click", () => setMode("matrix"));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
