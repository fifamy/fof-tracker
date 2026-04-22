const state = {
  data: null,
  activeTab: "overview",
  companyPeriod: "week",
  companyScope: "all",
  topPeriod: "week",
  selectedProductId: null,
  trackerFilters: {
    period: "all",
    company: "",
    type: "",
    stage: "",
    keyword: "",
    keyOnly: false,
  },
};

function fmtDate(value) {
  return value || "—";
}

function fmtNum(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getData() {
  if (window.__FOF_TRACKER_SNAPSHOT__) {
    return Promise.resolve(window.__FOF_TRACKER_SNAPSHOT__);
  }
  return fetch("./data/fof_tracker_snapshot.json").then((resp) => resp.json());
}

function parseDate(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function inRange(value, start, end) {
  const date = parseDate(value);
  if (!date) return false;
  return (!start || date >= start) && (!end || date <= end);
}

function getPeriodRange(periodKey) {
  const summary = state.data.summary;
  if (periodKey === "week") {
    return {
      start: parseDate(summary.week_range.start),
      end: parseDate(summary.week_range.end),
    };
  }
  if (periodKey === "ytd") {
    return {
      start: parseDate(summary.ytd_range.start),
      end: parseDate(summary.ytd_range.end),
    };
  }
  return { start: null, end: null };
}

function findProduct(productId) {
  return state.data.products.find((item) => item.product_id === productId) || null;
}

function getCurrentPeriodMeta() {
  if (state.topPeriod === "week") {
    const range = state.data.summary.week_range;
    return {
      key: "week",
      title: "近一周",
      label: range.label || `${range.start}~${range.end}`,
      start: range.start,
      end: range.end,
    };
  }
  const range = state.data.summary.ytd_range;
  return {
    key: "ytd",
    title: "今年以来",
    label: `${range.start}~${range.end}`,
    start: range.start,
    end: range.end,
  };
}

function getProductsForTopPeriod(extraFilter) {
  const range = getPeriodRange(state.topPeriod);
  return state.data.products.filter((item) => {
    const inSelectedRange = inRange(item.latest_event_date, range.start, range.end);
    if (!inSelectedRange) return false;
    return extraFilter ? extraFilter(item) : true;
  });
}

function setSelectedProduct(productId, switchTab = false) {
  state.selectedProductId = productId;
  if (switchTab) {
    state.activeTab = "detail";
    activateTabs();
  }
  renderDetail();
}

function activateTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-${state.activeTab}`);
  });
}

function tableMarkup(columns, rows, clickable = false) {
  const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("");
  const body = rows
    .map((row, index) => {
      const attrs = clickable ? ` class="clickable-row" data-product-id="${escapeHtml(row.product_id)}"` : "";
      const cells = columns
        .map((col) => `<td>${col.render ? col.render(row, index) : escapeHtml(row[col.key] ?? "—")}</td>`)
        .join("");
      return `<tr${attrs}>${cells}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function bindClickableRows(container) {
  container.querySelectorAll("[data-product-id]").forEach((row) => {
    row.addEventListener("click", () => setSelectedProduct(row.dataset.productId, true));
  });
}

function renderHero() {
  const summary = state.data.summary;
  const range = state.topPeriod === "week" ? summary.week_range : summary.ytd_range;
  const prefix = state.topPeriod === "week" ? "近一周" : "今年以来";
  document.getElementById("hero-subtitle").textContent =
    `当前展示 ${prefix} FOF 新动作，统计区间为 ${range.start} 至 ${range.end}。`;
  document.getElementById("hero-pills").innerHTML = [
    `重点公司 ${state.data.config.key_companies.length} 家`,
    `跟踪产品 ${state.data.products.length} 只`,
    `近一周 ${summary.market_kpis.week.establish_count} 只成立`,
    `今年以来 ${summary.market_kpis.ytd.establish_count} 只成立`,
  ]
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join("");
}

function renderKPIs() {
  const kpi = state.data.summary.market_kpis[state.topPeriod] || {};
  const titlePrefix = state.topPeriod === "week" ? "近一周" : "今年以来";
  const items = [
    { label: `${titlePrefix}新申报`, value: kpi.declare_count ?? 0, note: "按材料接收日统计" },
    { label: `${titlePrefix}新受理`, value: kpi.accept_count ?? 0, note: "按材料受理日统计" },
    { label: `${titlePrefix}新获批`, value: kpi.approval_count ?? 0, note: "按获批日期统计" },
    { label: `${titlePrefix}新成立`, value: kpi.establish_count ?? 0, note: "按成立日统计" },
    { label: `${titlePrefix}募集规模`, value: fmtNum(kpi.raise_scale), note: "单位：亿元" },
  ];
  document.getElementById("kpi-grid").innerHTML = items
    .map(
      (item) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(item.label)}</div>
          <div class="kpi-value">${escapeHtml(item.value)}</div>
          <div class="kpi-note">${escapeHtml(item.note)}</div>
        </article>
      `
    )
    .join("");
}

function renderPipeline() {
  const html = state.data.summary.stage_counts
    .filter((item) => ["新申报", "新受理", "已获批", "已成立"].includes(item.stage))
    .map(
      (item) => `
        <article class="pipeline-step">
          <div class="step-label">${escapeHtml(item.stage)}</div>
          <div class="step-count">${escapeHtml(item.count)}</div>
        </article>
      `
    )
    .join("");
  document.getElementById("pipeline-grid").innerHTML = html;
}

function renderStageSections() {
  const periodMeta = getCurrentPeriodMeta();
  const defs = [
    {
      key: "declare",
      title: "新申报FOF产品",
      color: "red",
      columns: [
        { label: "序号", render: (_, index) => escapeHtml(index + 1) },
        { label: "基金名称", key: "fund_name" },
        { label: "基金公司", key: "fund_company" },
        { label: "材料接收日", render: (row) => fmtDate(row.declare_date) },
      ],
      describe: (rows) => {
        if (!rows.length) return `${periodMeta.title}（${periodMeta.label}）全行业暂无新增申报 FOF 产品。`;
        const companies = [...new Set(rows.map((row) => row.fund_company).filter(Boolean))];
        const head = companies.slice(0, 3).join("、");
        return `${periodMeta.title}（${periodMeta.label}）全行业共申报 ${rows.length} 只 FOF${head ? `，主要包括 ${head}` : ""}。`;
      },
    },
    {
      key: "accept",
      title: "新受理FOF产品",
      color: "orange",
      columns: [
        { label: "序号", render: (_, index) => escapeHtml(index + 1) },
        { label: "基金名称", key: "fund_name" },
        { label: "基金公司", key: "fund_company" },
        { label: "材料接收日", render: (row) => fmtDate(row.declare_date) },
        { label: "材料受理日", render: (row) => fmtDate(row.accept_date) },
        { label: "受理用时", render: (row) => escapeHtml(row.declare_to_accept_days != null ? row.declare_to_accept_days : "—") },
      ],
      describe: (rows) => {
        if (!rows.length) return `${periodMeta.title}（${periodMeta.label}）证监会暂无新受理的 FOF 产品。`;
        return `${periodMeta.title}（${periodMeta.label}）证监会新受理 ${rows.length} 只 FOF。`;
      },
    },
    {
      key: "approval",
      title: "新获批FOF产品",
      color: "blue",
      columns: [
        { label: "序号", render: (_, index) => escapeHtml(index + 1) },
        { label: "基金名称", key: "fund_name" },
        { label: "基金公司", key: "fund_company" },
        { label: "材料接收日", render: (row) => fmtDate(row.declare_date) },
        { label: "材料受理日", render: (row) => fmtDate(row.accept_date) },
        { label: "获批日", render: (row) => fmtDate(row.approval_date) },
      ],
      describe: (rows) => {
        if (!rows.length) return `${periodMeta.title}（${periodMeta.label}）证监会暂无新增获批 FOF 产品。`;
        const companies = [...new Set(rows.map((row) => row.fund_company).filter(Boolean))];
        return `${periodMeta.title}（${periodMeta.label}）全行业共有 ${rows.length} 只 FOF 获批，涉及 ${companies.length} 家基金公司。`;
      },
    },
    {
      key: "establish",
      title: "新成立FOF产品",
      color: "green",
      columns: [
        { label: "序号", render: (_, index) => escapeHtml(index + 1) },
        { label: "基金名称", key: "fund_name" },
        { label: "基金公司", key: "fund_company" },
        { label: "托管人", render: (row) => escapeHtml(row.custodian || "—") },
        { label: "成立日", render: (row) => fmtDate(row.establish_date) },
        { label: "募集规模(亿元)", render: (row) => fmtNum(row.raise_scale) },
      ],
      describe: (rows) => {
        if (!rows.length) return `${periodMeta.title}（${periodMeta.label}）暂无新成立的 FOF 产品。`;
        const scale = rows.reduce((sum, row) => sum + (Number(row.raise_scale) || 0), 0);
        const topNames = rows
          .slice()
          .sort((a, b) => (Number(b.raise_scale) || 0) - (Number(a.raise_scale) || 0))
          .slice(0, 2)
          .map((row) => `${row.fund_company}${row.raise_scale != null ? `（${fmtNum(row.raise_scale)}亿元）` : ""}`)
          .join("、");
        return `${periodMeta.title}（${periodMeta.label}）全行业共有 ${rows.length} 只 FOF 成立，合计募集 ${fmtNum(scale)} 亿元${topNames ? `，其中 ${topNames} 规模居前` : ""}。`;
      },
    },
  ];
  const sections = defs
    .map((def) => {
      const rows = ((state.data.summary.stage_sections[state.topPeriod] || {})[def.key]) || [];
      const description = def.describe(rows);
      const body = rows.length
        ? tableMarkup(def.columns, rows, true)
        : `<div class="empty-box">本期暂无新增。</div>`;
      return `
        <section class="stage-section ${def.color}">
          <div class="stage-title">
            <h3>${escapeHtml(def.title)}</h3>
            <span>${rows.length} 只</span>
          </div>
          <div class="stage-description">${escapeHtml(description)}</div>
          <div class="table-wrap">${body}</div>
        </section>
      `;
    })
    .join("");
  const container = document.getElementById("stage-sections");
  container.innerHTML = sections;
  bindClickableRows(container);
}

function renderKeyCompanyUpdates() {
  const container = document.getElementById("key-company-updates");
  if (!container) return;
  const rows = getProductsForTopPeriod((item) => item.is_key_company)
    .sort((a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || "")))
    .slice(0, 8);
  container.innerHTML = rows.length
    ? `<div class="mini-list">${rows
        .map(
          (row) => `
            <div class="mini-item clickable-row" data-product-id="${escapeHtml(row.product_id)}">
              <div class="mini-top">
                <div class="mini-name">${escapeHtml(row.fund_name)}</div>
                <span class="pill">${escapeHtml(row.current_stage)}</span>
              </div>
              <div class="mini-meta">${escapeHtml(row.fund_company)} · ${escapeHtml(row.fof_type)} · 最新日期 ${fmtDate(
                row.latest_event_date
              )}</div>
            </div>
          `
        )
        .join("")}</div>`
    : `<div class="empty-box">暂无重点公司新增动作。</div>`;
  bindClickableRows(container);
}

function renderInReviewPool() {
  const rows = getProductsForTopPeriod((item) => ["新申报", "新受理", "已获批"].includes(item.current_stage))
    .sort((a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || "")))
    .slice(0, 12);
  const container = document.getElementById("in-review-pool");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">当前没有在审产品。</div>`;
    return;
  }
  container.innerHTML = `<div class="mini-list">${rows
    .map(
      (row) => `
      <div class="mini-item clickable-row" data-product-id="${escapeHtml(row.product_id)}">
        <div class="mini-top">
          <div class="mini-name">${escapeHtml(row.fund_name)}</div>
          <span class="pill">${escapeHtml(row.current_stage)}</span>
        </div>
        <div class="mini-meta">${escapeHtml(row.fund_company)} · 已停留 ${escapeHtml(row.days_in_stage)} 天</div>
      </div>
    `
    )
    .join("")}</div>`;
  bindClickableRows(container);
}

function renderTrendChart() {
  const rows = state.data.summary.trends.weekly_establish || [];
  if (!rows.length) {
    document.getElementById("trend-chart").innerHTML = `<div class="empty-box">暂无趋势数据。</div>`;
    return;
  }
  const width = 860;
  const height = 340;
  const margin = { top: 52, right: 72, bottom: 66, left: 54 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const maxCount = Math.max(...rows.map((item) => item.establish_count), 1);
  const maxScale = Math.max(...rows.map((item) => item.raise_scale), 1);
  const countTicks = 4;
  const scaleTicks = 4;
  const band = chartW / rows.length;
  const barW = Math.min(56, band * 0.48);
  const x = (i) => margin.left + i * band + (band - barW) / 2;
  const yCount = (value) => margin.top + chartH - (value / maxCount) * chartH;
  const yScale = (value) => margin.top + chartH - (value / maxScale) * chartH;
  const wrapLabel = (label) => {
    const parts = String(label || "").split("-");
    return parts.length === 2 ? parts : [label, ""];
  };
  let path = "";
  rows.forEach((row, i) => {
    const cx = margin.left + i * band + band / 2;
    const cy = yScale(row.raise_scale);
    path += `${i === 0 ? "M" : "L"} ${cx} ${cy} `;
  });
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="近8周成立与募集趋势">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="rgba(255,255,255,0.55)" />`;
  for (let i = 0; i <= countTicks; i += 1) {
    const value = (maxCount / countTicks) * i;
    const y = margin.top + chartH - (chartH / countTicks) * i;
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + chartW}" y2="${y}" stroke="rgba(24,33,47,0.08)" stroke-dasharray="4 5" />`;
    svg += `<text x="${margin.left - 12}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${Math.round(value)}</text>`;
  }
  for (let i = 0; i <= scaleTicks; i += 1) {
    const value = (maxScale / scaleTicks) * i;
    const y = margin.top + chartH - (chartH / scaleTicks) * i;
    svg += `<text x="${margin.left + chartW + 12}" y="${y + 4}" text-anchor="start" font-size="11" fill="#c1121f">${fmtNum(value)}</text>`;
  }
  svg += `<text x="${margin.left}" y="${margin.top - 24}" font-size="12" font-weight="700" fill="#224870">成立数量（左轴）</text>`;
  svg += `<text x="${margin.left + chartW}" y="${margin.top - 24}" text-anchor="end" font-size="12" font-weight="700" fill="#c1121f">募集规模（右轴，亿元）</text>`;
  rows.forEach((row, i) => {
    const barY = yCount(row.establish_count);
    const barH = margin.top + chartH - barY;
    svg += `<rect x="${x(i)}" y="${barY}" width="${barW}" height="${barH}" rx="14" fill="#224870" opacity="0.84" />`;
    if (row.establish_count > 0) {
      svg += `<rect x="${x(i) + barW / 2 - 14}" y="${barY - 24}" width="28" height="18" rx="9" fill="#eef4fb" />`;
      svg += `<text x="${x(i) + barW / 2}" y="${barY - 11}" text-anchor="middle" font-size="11" font-weight="700" fill="#224870">${row.establish_count}</text>`;
    }
    const labelParts = wrapLabel(row.label);
    svg += `<text x="${margin.left + i * band + band / 2}" y="${height - 24}" text-anchor="middle" font-size="10.5" fill="#667085">`;
    svg += `<tspan x="${margin.left + i * band + band / 2}" dy="0">${labelParts[0] || ""}</tspan>`;
    svg += `<tspan x="${margin.left + i * band + band / 2}" dy="12">${labelParts[1] ? `-${labelParts[1]}` : ""}</tspan>`;
    svg += `</text>`;
  });
  svg += `<path d="${path}" fill="none" stroke="#c1121f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`;
  rows.forEach((row, i) => {
    const cx = margin.left + i * band + band / 2;
    const cy = yScale(row.raise_scale);
    const labelOffset = i % 2 === 0 ? -30 : -12;
    const labelY = Math.max(margin.top - 4, cy + labelOffset);
    svg += `<circle cx="${cx}" cy="${cy}" r="5.5" fill="#c1121f" stroke="#fff" stroke-width="2" />`;
    svg += `<rect x="${cx - 20}" y="${labelY - 14}" width="40" height="18" rx="9" fill="rgba(255,255,255,0.96)" stroke="rgba(193,18,31,0.18)" />`;
    svg += `<text x="${cx}" y="${labelY - 1}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#c1121f">${fmtNum(row.raise_scale)}</text>`;
  });
  svg += `<line x1="${margin.left}" y1="${margin.top + chartH}" x2="${margin.left + chartW}" y2="${margin.top + chartH}" stroke="rgba(24,33,47,0.14)" />`;
  svg += `</svg>`;
  document.getElementById("trend-chart").innerHTML = `<div class="svg-wrap">${svg}</div>`;
}

function renderKeyProducts() {
  const container = document.getElementById("key-products");
  if (!container) return;
  const rows = getProductsForTopPeriod()
    .sort((a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || "")))
    .slice(0, 10);
  container.innerHTML = rows.length
    ? `<div class="key-product-list">${rows
        .map(
          (row) => `
            <div class="key-product-item clickable-row" data-product-id="${escapeHtml(row.product_id)}">
              <div class="item-top">
                <div class="item-name">${escapeHtml(row.fund_name)}</div>
                <span class="pill">${escapeHtml(row.current_stage)}</span>
              </div>
              <div class="item-meta">${escapeHtml(row.fund_company)} · ${escapeHtml(row.fof_type)} · 最新日期 ${fmtDate(
                row.latest_event_date
              )} · 募集规模 ${fmtNum(row.raise_scale)}</div>
            </div>
          `
        )
        .join("")}</div>`
    : `<div class="empty-box">暂无重点产品。</div>`;
  bindClickableRows(container);
}

function populateTrackerFilters() {
  const products = state.data.products;
  const companySelect = document.getElementById("tracker-company");
  const typeSelect = document.getElementById("tracker-type");
  const stageSelect = document.getElementById("tracker-stage");
  const companyOptions = ["", ...new Set(products.map((item) => item.fund_company).filter(Boolean))].sort();
  const typeOptions = ["", ...new Set(products.map((item) => item.fof_type).filter(Boolean))].sort();
  const stageOptions = ["", ...state.data.config.stage_order];
  companySelect.innerHTML = companyOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "全部")}</option>`).join("");
  typeSelect.innerHTML = typeOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "全部")}</option>`).join("");
  stageSelect.innerHTML = stageOptions.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "全部")}</option>`).join("");
}

function filterTrackerProducts() {
  const { start, end } = getPeriodRange(state.trackerFilters.period);
  return state.data.products.filter((item) => {
    if (state.trackerFilters.company && item.fund_company !== state.trackerFilters.company) return false;
    if (state.trackerFilters.type && item.fof_type !== state.trackerFilters.type) return false;
    if (state.trackerFilters.stage && item.current_stage !== state.trackerFilters.stage) return false;
    if (state.trackerFilters.keyOnly && !item.is_key_company) return false;
    if (state.trackerFilters.keyword) {
      const text = `${item.fund_name} ${item.fund_company}`.toLowerCase();
      if (!text.includes(state.trackerFilters.keyword.toLowerCase())) return false;
    }
    if (state.trackerFilters.period !== "all" && !inRange(item.latest_event_date, start, end)) return false;
    return true;
  });
}

function renderTrackerTable() {
  const rows = filterTrackerProducts();
  const container = document.getElementById("tracker-table");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">当前筛选条件下暂无产品。</div>`;
    return;
  }
  container.innerHTML = tableMarkup(
    [
      { label: "基金名称", key: "fund_name" },
      { label: "基金公司", key: "fund_company" },
      { label: "FOF类型", key: "fof_type" },
      { label: "当前状态", key: "current_stage" },
      { label: "状态停留天数", render: (row) => escapeHtml(row.days_in_stage ?? "—") },
      { label: "材料接收日", render: (row) => fmtDate(row.declare_date) },
      { label: "材料受理日", render: (row) => fmtDate(row.accept_date) },
      { label: "获批日期", render: (row) => fmtDate(row.approval_date) },
      { label: "发行起始日", render: (row) => fmtDate(row.issue_start_date) },
      { label: "成立日", render: (row) => fmtDate(row.establish_date) },
      { label: "募集规模(亿元)", render: (row) => fmtNum(row.raise_scale) },
    ],
    rows,
    true
  );
  bindClickableRows(container);
}

function renderCompanyTable() {
  const rows = state.data.summary.company_rankings[state.companyScope][state.companyPeriod] || [];
  const container = document.getElementById("company-table");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">当前口径下暂无公司数据。</div>`;
    return;
  }
  container.innerHTML = tableMarkup(
    [
      { label: "基金公司", key: "fund_company" },
      { label: "动作总数", key: "action_count" },
      { label: "申报数", key: "declare_count" },
      { label: "受理数", key: "accept_count" },
      { label: "获批数", key: "approval_count" },
      { label: "发行数", key: "issue_count" },
      { label: "成立数", key: "establish_count" },
      { label: "募集规模(亿元)", render: (row) => fmtNum(row.raise_scale_sum) },
      { label: "平均募集规模(亿元)", render: (row) => fmtNum(row.avg_raise_scale) },
      { label: "最快成立天数", render: (row) => escapeHtml(row.fastest_establish_days ?? "—") },
      { label: "最新动作日期", render: (row) => fmtDate(row.latest_event_date) },
    ],
    rows.slice(0, 30),
    false
  );
}

function renderKeyCompanyProgress() {
  const rows = ((state.data.summary.key_company_progress || {}).ytd || [])
    .slice()
    .sort((a, b) => {
      if (a.fund_company === "华夏") return -1;
      if (b.fund_company === "华夏") return 1;
      return (Number(b.raise_scale_sum) || 0) - (Number(a.raise_scale_sum) || 0);
    });
  const container = document.getElementById("key-company-progress");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">暂无重点公司节奏数据。</div>`;
    return;
  }
  const maxDeclare = Math.max(...rows.map((row) => row.declare_count || 0), 1);
  const maxAccept = Math.max(...rows.map((row) => row.accept_count || 0), 1);
  const maxApproval = Math.max(...rows.map((row) => row.approval_count || 0), 1);
  const maxIssue = Math.max(...rows.map((row) => row.issue_count || 0), 1);
  const topScale = Math.max(...rows.map((row) => Number(row.raise_scale_sum) || 0), 0);
  container.innerHTML = `
    <div class="progress-panel-head">
      <div class="progress-panel-kicker">YTD Dashboard</div>
      <div class="progress-panel-note">右侧为已成立产品募集规模合计，单位：亿元</div>
    </div>
    <div class="progress-compare">
      <div class="progress-head">
        <div>基金公司</div>
        <div>申报</div>
        <div>受理</div>
        <div>获批</div>
        <div>发行</div>
        <div>募集规模(亿元)</div>
      </div>
      ${rows
        .map((row) => {
          const declareWidth = Math.max(8, (100 * (row.declare_count || 0)) / maxDeclare);
          const acceptWidth = Math.max(8, (100 * (row.accept_count || 0)) / maxAccept);
          const approvalWidth = Math.max(8, (100 * (row.approval_count || 0)) / maxApproval);
          const issueWidth = Math.max(8, (100 * (row.issue_count || 0)) / maxIssue);
          const scale = Number(row.raise_scale_sum) || 0;
          const scaleWidth = topScale > 0 ? Math.max(10, (100 * scale) / topScale) : 0;
          return `
            <div class="progress-row ${row.is_huaxia ? "is-huaxia" : ""}">
              <div class="progress-company-wrap">
                <div class="progress-company">${escapeHtml(row.fund_company)}</div>
                ${row.is_huaxia ? `<div class="progress-badge">重点观察</div>` : ``}
              </div>
              <div class="progress-cell">
                <div class="progress-value">${escapeHtml(row.declare_count)}</div>
                <div class="progress-bar-track"><div class="progress-bar-fill red" style="width:${declareWidth}%"></div></div>
              </div>
              <div class="progress-cell">
                <div class="progress-value">${escapeHtml(row.accept_count)}</div>
                <div class="progress-bar-track"><div class="progress-bar-fill orange" style="width:${acceptWidth}%"></div></div>
              </div>
              <div class="progress-cell">
                <div class="progress-value">${escapeHtml(row.approval_count)}</div>
                <div class="progress-bar-track"><div class="progress-bar-fill blue" style="width:${approvalWidth}%"></div></div>
              </div>
              <div class="progress-cell">
                <div class="progress-value">${escapeHtml(row.issue_count)}</div>
                <div class="progress-bar-track"><div class="progress-bar-fill gold" style="width:${issueWidth}%"></div></div>
              </div>
              <div class="progress-total-wrap">
                <div class="progress-total">${fmtNum(scale)}</div>
                <div class="progress-total-unit">亿元</div>
                <div class="progress-total-track"><div class="progress-total-fill" style="width:${scaleWidth}%"></div></div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderKeyCompanyCards() {
  const rows = state.data.summary.key_company_cards || [];
  const container = document.getElementById("key-company-cards");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">暂无重点公司配置或数据。</div>`;
    return;
  }
  container.innerHTML = rows
    .map(
      (row) => `
        <article class="company-mini-card">
          <h3>${escapeHtml(row.fund_company)}</h3>
            <div class="metric-row">
            <div class="metric-pill"><div class="label">近一周动作</div><div class="value">${escapeHtml(row.recent_action_count)}</div></div>
            <div class="metric-pill"><div class="label">今年以来动作</div><div class="value">${escapeHtml(row.ytd_action_count)}</div></div>
            <div class="metric-pill"><div class="label">在审产品</div><div class="value">${escapeHtml(row.in_review_count)}</div></div>
            <div class="metric-pill"><div class="label">已成立产品</div><div class="value">${escapeHtml(row.established_count)}</div></div>
          </div>
          <div class="metric-row">
            <div class="metric-pill"><div class="label">总募集规模</div><div class="value">${fmtNum(row.raise_scale_sum)}</div></div>
          </div>
          <div class="section-head compact" style="margin-top: 16px;">
            <div><h2 style="font-size:16px;">最新产品清单</h2></div>
          </div>
          <div class="mini-list">
            ${(row.latest_products || [])
              .map(
                (item) => `
                  <div class="mini-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                    <div class="mini-top">
                      <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                      <span class="pill">${escapeHtml(item.current_stage)}</span>
                    </div>
                    <div class="mini-meta">${fmtDate(item.latest_event_date)} · ${escapeHtml(item.fof_type)}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
  bindClickableRows(container);
}

function renderHuaxiaChase() {
  const dashboard = state.data.summary.huaxia_chase;
  const kpiContainer = document.getElementById("chase-kpi-grid");
  const briefContainer = document.getElementById("chase-brief");
  const raceContainer = document.getElementById("chase-raceboard");
  const contextContainer = document.getElementById("chase-context");
  const tableContainer = document.getElementById("chase-table");

  if (!dashboard) {
    kpiContainer.innerHTML = `<div class="empty-box">暂无华夏追赶测算数据。</div>`;
    briefContainer.innerHTML = `<div class="empty-box">暂无华夏追赶测算数据。</div>`;
    raceContainer.innerHTML = `<div class="empty-box">暂无头部公司对比数据。</div>`;
    contextContainer.innerHTML = `<div class="empty-box">暂无华夏储备数据。</div>`;
    tableContainer.innerHTML = `<div class="empty-box">暂无头部公司明细。</div>`;
    return;
  }

  const focus = dashboard.focus_company_snapshot || {};
  const target = dashboard.target || {};
  const cutoffCompanies = target.cutoff_companies || [];
  const benchmarkCompanies = target.benchmark_companies || [];
  const latestDeclareDate = fmtDate(target.latest_declare_date);
  const deadlineNote =
    target.days_left_to_latest_declare == null
      ? "当前样本不足，暂未反推出申报时点"
      : target.days_left_to_latest_declare >= 0
        ? `距离最晚申报日还有 ${target.days_left_to_latest_declare} 天`
        : `已比最晚申报日晚 ${Math.abs(target.days_left_to_latest_declare)} 天`;

  const kpis = [
    {
      label: "华夏年底保底数",
      value: focus.projected_floor_count ?? 0,
      note: `已成立 ${focus.establish_count ?? 0} · 在途 ${focus.pipeline_count ?? 0}`,
    },
    {
      label: "当前前三门槛",
      value: target.cutoff_floor_count ?? 0,
      note: cutoffCompanies.length ? `门槛公司：${cutoffCompanies.join("、")}` : "按第3名门槛测算",
    },
    {
      label: "并列前三还差",
      value: target.required_new_declares_for_tie ?? 0,
      note: "按并列进入前三口径测算",
    },
    {
      label: "稳居前三还差",
      value: target.required_new_declares_for_clear ?? 0,
      note: "按单独站稳前三口径测算",
    },
    {
      label: "头部平均申报到成立",
      value: target.benchmark_avg_declare_to_establish_days != null ? `${fmtNum(target.benchmark_avg_declare_to_establish_days)} 天` : "—",
      note: benchmarkCompanies.length ? `样本来自 ${benchmarkCompanies.join("、")}` : "暂无可用样本",
    },
    {
      label: "最晚申报日",
      value: latestDeclareDate,
      note: deadlineNote,
    },
  ];
  kpiContainer.innerHTML = kpis
    .map(
      (item) => `
        <article class="kpi-card chase-kpi-card">
          <div class="kpi-label">${escapeHtml(item.label)}</div>
          <div class="kpi-value">${escapeHtml(item.value)}</div>
          <div class="kpi-note">${escapeHtml(item.note)}</div>
        </article>
      `
    )
    .join("");

  const targetLabel = cutoffCompanies.length ? cutoffCompanies.join("、") : `第 ${target.cutoff_rank || 3} 名公司`;
  const latestDeclareSentence = target.latest_declare_date
    ? `若希望新增产品在 ${fmtDate(target.year_end)} 前尽可能完成成立，最晚应在 ${fmtDate(target.latest_declare_date)} 前完成申报。`
    : "当前可用于估算的“申报到成立”样本不足，暂无法反推最晚申报日。";

  briefContainer.innerHTML = `
    <div class="chase-brief-grid">
      <div class="chase-brief-main">
        <div class="progress-panel-kicker">Top 3 Catch-up</div>
        <h3>华夏若要在 ${escapeHtml(String(target.year_end || state.data.as_of_date).slice(0, 4))} 年追上头部前三，核心矛盾是数量缺口。</h3>
        <p>
          当前前三门槛由 ${escapeHtml(targetLabel)} 拉到 <strong>${escapeHtml(target.cutoff_floor_count ?? 0)} 只</strong>。
          华夏当前年底保底数量为 <strong>${escapeHtml(focus.projected_floor_count ?? 0)} 只</strong>，
          若按并列进入前三口径，仍需新增申报 <strong>${escapeHtml(target.required_new_declares_for_tie ?? 0)} 只</strong>；
          若希望单独站稳前三，则需新增申报 <strong>${escapeHtml(target.required_new_declares_for_clear ?? 0)} 只</strong>。
        </p>
        <p>
          头部前三已成立产品平均“申报到成立”耗时约 <strong>${escapeHtml(
            target.benchmark_avg_declare_to_establish_days != null ? `${fmtNum(target.benchmark_avg_declare_to_establish_days)} 天` : "—"
          )}</strong>。${escapeHtml(latestDeclareSentence)}
        </p>
      </div>
      <div class="chase-brief-side">
        <div class="chase-stat-card">
          <span>华夏当前排名</span>
          <strong>#${escapeHtml(focus.rank ?? dashboard.focus_company_rank ?? "—")}</strong>
        </div>
        <div class="chase-stat-card">
          <span>并列前三缺口</span>
          <strong>${escapeHtml(target.required_new_declares_for_tie ?? 0)} 只</strong>
        </div>
        <div class="chase-stat-card">
          <span>申报窗口</span>
          <strong>${escapeHtml(
            target.days_left_to_latest_declare == null
              ? "—"
              : target.days_left_to_latest_declare >= 0
                ? `${target.days_left_to_latest_declare} 天`
                : `逾期 ${Math.abs(target.days_left_to_latest_declare)} 天`
          )}</strong>
        </div>
      </div>
    </div>
  `;

  const raceRows = dashboard.head_companies || [];
  if (!raceRows.length) {
    raceContainer.innerHTML = `<div class="empty-box">暂无头部公司追赶数据。</div>`;
  } else {
    const maxFloor = Math.max(...raceRows.map((row) => row.projected_floor_count || 0), 1);
    raceContainer.innerHTML = `<div class="chase-raceboard">${raceRows
      .map((row) => {
        const width = Math.max(10, (100 * (row.projected_floor_count || 0)) / maxFloor);
        const isCutoff = cutoffCompanies.includes(row.fund_company);
        const gapText = row.is_focus_company ? `当前基线` : `领先华夏 ${row.count_gap_vs_focus > 0 ? row.count_gap_vs_focus : 0} 只`;
        return `
          <article class="chase-race-row ${row.is_focus_company ? "is-focus" : ""} ${isCutoff ? "is-cutoff" : ""}">
            <div class="chase-race-top">
              <div>
                <div class="chase-race-company">#${escapeHtml(row.rank)} ${escapeHtml(row.fund_company)}</div>
                <div class="chase-race-sub">
                  已成立 ${escapeHtml(row.establish_count)} · 在途 ${escapeHtml(row.pipeline_count)} · 募集规模 ${fmtNum(row.raise_scale_sum)} 亿元
                </div>
              </div>
              <div class="chase-race-badges">
                ${row.is_focus_company ? `<span class="chase-pill focus">华夏基线</span>` : ""}
                ${isCutoff ? `<span class="chase-pill cutoff">前三门槛</span>` : ""}
                <span class="chase-gap">${escapeHtml(gapText)}</span>
              </div>
            </div>
            <div class="chase-race-track">
              <div class="chase-race-fill" style="width:${width}%"></div>
            </div>
            <div class="chase-race-bottom">
              <div>年底保底数 <strong>${escapeHtml(row.projected_floor_count)} 只</strong></div>
              <div>平均申报到成立 <strong>${escapeHtml(
                row.avg_declare_to_establish_days != null ? `${fmtNum(row.avg_declare_to_establish_days)} 天` : "—"
              )}</strong></div>
            </div>
          </article>
        `;
      })
      .join("")}</div>`;
  }

  const focusProducts = focus.latest_pipeline_products || [];
  contextContainer.innerHTML = `
    <div class="chase-context-block">
      <div class="chase-context-title">华夏当前在途产品</div>
      ${
        focusProducts.length
          ? `<div class="mini-list">${focusProducts
              .map(
                (item) => `
                  <div class="mini-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                    <div class="mini-top">
                      <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                      <span class="pill">${escapeHtml(item.current_stage)}</span>
                    </div>
                    <div class="mini-meta">${fmtDate(item.latest_event_date)} · 申报日 ${fmtDate(item.declare_date)} · ${escapeHtml(item.fof_type)}</div>
                  </div>
                `
              )
              .join("")}</div>`
          : `<div class="empty-box">华夏当前暂无在途 FOF 产品。</div>`
      }
    </div>
    <div class="chase-context-block">
      <div class="chase-context-title">测算假设</div>
      <div class="chase-note-list">
        ${(dashboard.assumptions || [])
          .map((item) => `<div class="chase-note-item">${escapeHtml(item)}</div>`)
          .join("")}
      </div>
      <div class="brand-pills chase-inline-pills">
        <span>头部前三样本 ${escapeHtml(target.benchmark_sample_count ?? 0)} 个</span>
        <span>门槛保底数 ${escapeHtml(target.cutoff_floor_count ?? 0)} 只</span>
        <span>华夏在途 ${escapeHtml(focus.pipeline_count ?? 0)} 只</span>
      </div>
    </div>
  `;
  bindClickableRows(contextContainer);

  const tableRows = (dashboard.head_companies || []).slice().sort((a, b) => a.rank - b.rank);
  tableContainer.innerHTML = tableRows.length
    ? tableMarkup(
        [
          { label: "排名", render: (row) => escapeHtml(`#${row.rank}`) },
          {
            label: "基金公司",
            render: (row) =>
              `${escapeHtml(row.fund_company)} ${
                row.is_focus_company ? `<span class="table-tag focus">华夏</span>` : ""
              } ${cutoffCompanies.includes(row.fund_company) ? `<span class="table-tag cutoff">前三门槛</span>` : ""}`,
          },
          { label: "已成立数", render: (row) => escapeHtml(row.establish_count) },
          { label: "在途数", render: (row) => escapeHtml(row.pipeline_count) },
          { label: "年底保底数", render: (row) => escapeHtml(row.projected_floor_count) },
          { label: "领先华夏(只)", render: (row) => escapeHtml(row.count_gap_vs_focus > 0 ? row.count_gap_vs_focus : 0) },
          { label: "募集规模(亿元)", render: (row) => fmtNum(row.raise_scale_sum) },
          {
            label: "平均申报到成立(天)",
            render: (row) => escapeHtml(row.avg_declare_to_establish_days != null ? fmtNum(row.avg_declare_to_establish_days) : "—"),
          },
          { label: "样本数", render: (row) => escapeHtml(row.duration_sample_count ?? 0) },
        ],
        tableRows,
        false
      )
    : `<div class="empty-box">暂无头部公司明细数据。</div>`;
}

function renderDetail() {
  const container = document.getElementById("detail-content");
  const product = state.selectedProductId ? findProduct(state.selectedProductId) : state.data.products[0];
  if (!product) {
    container.innerHTML = `<div class="empty-box">当前没有可展示的产品详情。</div>`;
    return;
  }
  state.selectedProductId = product.product_id;
  const timelineRows = [
    { stage: "新申报", date: product.declare_date, note: "材料接收" },
    { stage: "新受理", date: product.accept_date, note: product.declare_to_accept_days != null ? `申报到受理 ${product.declare_to_accept_days} 天` : "进入监管受理流程" },
    { stage: "已获批", date: product.approval_date, note: product.accept_to_approval_days != null ? `受理到获批 ${product.accept_to_approval_days} 天` : "暂无耗时数据" },
    { stage: "发行中", date: product.issue_start_date, note: "进入募集阶段" },
    { stage: "已成立", date: product.establish_date, note: product.issue_to_establish_days != null ? `发行到成立 ${product.issue_to_establish_days} 天` : "尚未成立或暂无耗时数据" },
  ];
  container.innerHTML = `
    <div class="detail-hero">
      <div class="detail-card">
        <div class="detail-title">${escapeHtml(product.fund_name)}</div>
        <div class="detail-meta">
          基金公司：${escapeHtml(product.fund_company)}<br />
          FOF类型：${escapeHtml(product.fof_type)}<br />
          当前状态：${escapeHtml(product.current_stage)}<br />
          最新进展日期：${fmtDate(product.latest_event_date)}<br />
          状态停留天数：${escapeHtml(product.days_in_stage ?? "—")} 天
        </div>
      </div>
      <div class="detail-card">
        <div class="detail-meta">
          托管人：${escapeHtml(product.custodian || "—")}<br />
          募集规模：${fmtNum(product.raise_scale)} 亿元<br />
          重点公司：${product.is_key_company ? "是" : "否"}<br />
          备注：${escapeHtml(product.remarks || "—")}
        </div>
      </div>
    </div>
    <div class="detail-card">
      <div class="section-head compact">
        <div>
          <h2 style="font-size:18px;">推进时间线</h2>
          <p>空白节点表示该阶段尚未发生。</p>
        </div>
      </div>
      <div class="timeline">
        ${timelineRows
          .map(
            (row) => `
              <div class="timeline-item">
                <div class="timeline-stage">${escapeHtml(row.stage)}</div>
                <div class="timeline-date">${fmtDate(row.date)}</div>
                <div>${escapeHtml(row.note)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function wireEvents() {
  document.querySelectorAll("#main-tabs .tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      activateTabs();
      if (state.activeTab === "detail") renderDetail();
    });
  });

  document.querySelectorAll("#top-period-toggle .chip").forEach((button) => {
    button.addEventListener("click", () => {
      state.topPeriod = button.dataset.period;
      document.querySelectorAll("#top-period-toggle .chip").forEach((el) => el.classList.toggle("is-active", el === button));
      renderHero();
      renderKPIs();
      renderStageSections();
      renderKeyCompanyUpdates();
      renderInReviewPool();
      renderKeyProducts();
    });
  });

  document.querySelectorAll("#company-period-toggle .subtab").forEach((button) => {
    button.addEventListener("click", () => {
      state.companyPeriod = button.dataset.period;
      document.querySelectorAll("#company-period-toggle .subtab").forEach((el) => el.classList.toggle("is-active", el === button));
      renderCompanyTable();
    });
  });

  document.querySelectorAll("#company-scope-toggle .subtab").forEach((button) => {
    button.addEventListener("click", () => {
      state.companyScope = button.dataset.scope;
      document.querySelectorAll("#company-scope-toggle .subtab").forEach((el) => el.classList.toggle("is-active", el === button));
      renderCompanyTable();
    });
  });

  document.getElementById("tracker-period").addEventListener("change", (e) => {
    state.trackerFilters.period = e.target.value;
    renderTrackerTable();
  });
  document.getElementById("tracker-company").addEventListener("change", (e) => {
    state.trackerFilters.company = e.target.value;
    renderTrackerTable();
  });
  document.getElementById("tracker-type").addEventListener("change", (e) => {
    state.trackerFilters.type = e.target.value;
    renderTrackerTable();
  });
  document.getElementById("tracker-stage").addEventListener("change", (e) => {
    state.trackerFilters.stage = e.target.value;
    renderTrackerTable();
  });
  document.getElementById("tracker-keyword").addEventListener("input", (e) => {
    state.trackerFilters.keyword = e.target.value;
    renderTrackerTable();
  });
  document.getElementById("tracker-key-only").addEventListener("change", (e) => {
    state.trackerFilters.keyOnly = e.target.checked;
    renderTrackerTable();
  });
}

function renderAll() {
  activateTabs();
  renderHero();
  renderKPIs();
  renderPipeline();
  renderStageSections();
  renderKeyCompanyUpdates();
  renderInReviewPool();
  renderTrendChart();
  renderKeyProducts();
  populateTrackerFilters();
  renderTrackerTable();
  renderCompanyTable();
  renderKeyCompanyProgress();
  renderKeyCompanyCards();
  renderHuaxiaChase();
  renderDetail();
}

getData()
  .then((data) => {
    state.data = data;
    wireEvents();
    renderAll();
  })
  .catch((error) => {
    document.body.innerHTML = `<div style="padding:32px;font-family:PingFang SC,Microsoft YaHei,sans-serif;">
      <h1>公募FOF基金跟踪系统</h1>
      <p>数据加载失败，请先运行 snapshot 构建脚本或检查 data 文件。</p>
      <pre>${escapeHtml(error.message || String(error))}</pre>
    </div>`;
  });
