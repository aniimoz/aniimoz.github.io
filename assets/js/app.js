/* Aniimo — Tra cứu tương khắc. Vanilla JS, không build. */
(function () {
  "use strict";

  const IMG = (id) => `assets/elements/${id}.png`;
  const state = { primary: null, secondary: null };

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
    return h("span", { class: "type-tag", style: `background:color-mix(in srgb, ${e.color} 24%, transparent); color:${e.color}` }, [
      h("span", { class: "dot", style: `background:${e.color}` }),
      `${e.emoji} ${e.name}`,
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
        h("img", { class: "thumb", src: IMG(e.id), alt: e.name, loading: "lazy" }),
        h("div", { class: "cap" }, [
          h("span", null, `${e.emoji} ${e.name}`),
          h("span", { class: "en" }, e.en),
        ]),
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
      }, [h("span", { class: "dot" }), `${e.emoji} ${e.name}`]));
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
    const imgs = h("div", { class: "hero-imgs" }, [p, s].filter(Boolean).map((e) => h("img", { src: IMG(e.id), alt: e.name })));
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
    document.getElementById("tab-lookup").addEventListener("click", () => setMode("lookup"));
    document.getElementById("tab-matrix").addEventListener("click", () => setMode("matrix"));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
