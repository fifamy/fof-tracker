const state = {
  data: null,
  activeTab: "overview",
  companyPeriod: "week",
  companyScope: "all",
  topPeriod: "week",
  battlefieldTab: "launch",
  selectedProductId: null,
  drawerOpen: false,
  monitorFilters: {
    company: "",
    stage: "新申报",
    search: "",
    sort: "threat",
  },
  trackerFilters: {
    period: "all",
    company: "",
    type: "",
    stage: "",
    keyword: "",
    keyOnly: false,
  },
};

const STAGE_FLOW = ["新申报", "新受理", "已获批", "发行中", "已成立"];
const RAIL_NAV_ITEMS = [
  { tab: "overview", label: "首页总览", note: "情报主屏" },
  { tab: "tracker", label: "流程跟踪", note: "全量检索" },
  { tab: "companies", label: "公司竞争格局", note: "同业动作" },
  { tab: "key", label: "重点公司对比", note: "重点名单" },
  { tab: "chase", label: "华夏追赶测算", note: "差距测算" },
  { tab: "detail", label: "产品详情", note: "单品诊断" },
];

const BATTLEFIELD_TABS = [
  { key: "launch", label: "发行水位对标" },
  { key: "matrix", label: "产品矩阵雷达" },
  { key: "efficiency", label: "审批效率追踪" },
];

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

function daysBetween(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return null;
  return Math.round((end - start) / 86400000);
}

function average(values) {
  const valid = values.filter((value) => value != null && !Number.isNaN(Number(value))).map(Number);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function shortStageLabel(stage) {
  return String(stage || "")
    .replace(/^新/, "")
    .replace(/^已/, "")
    .replace("中", "");
}

function stageIndex(stage) {
  return STAGE_FLOW.indexOf(stage);
}

function isInReviewStage(stage) {
  return ["新申报", "新受理", "已获批", "发行中"].includes(stage);
}

function isInReviewProduct(product) {
  return isInReviewStage(product.current_stage);
}

function extractHoldingBucket(name) {
  const text = String(name || "");
  if (/(九十天|90天|三个月|3个月)/.test(text)) return "3个月持有";
  if (/(六个月|6个月|180天|半年)/.test(text)) return "6个月持有";
  if (/(一年|1年)/.test(text)) return "1年及以上";
  if (/(两年|2年|三年|3年)/.test(text)) return "1年及以上";
  return "其他持有";
}

function extractRiskBucket(name) {
  const text = String(name || "");
  if (/养老/.test(text)) return "养老";
  if (/(积极|进取)/.test(text)) return "积极";
  if (/(平衡|均衡)/.test(text)) return "平衡";
  if (/(稳健|稳享|稳晖|稳盈|悦信稳健|安盈|安悦)/.test(text)) return "稳健";
  if (/(多资产|多元配置|多元|配置|优选)/.test(text)) return "平衡";
  return "平衡";
}

function deriveStrategyTags(product) {
  const text = String(product.fund_name || "");
  const tags = [];
  const pushTag = (label, test) => {
    if (test.test(text) && !tags.includes(label)) tags.push(label);
  };
  pushTag("ETF-FOF", /ETF-FOF|ETF FOF|ETFFOF/i);
  pushTag("养老", /养老/);
  pushTag("多资产", /多资产/);
  pushTag("多元配置", /多元配置|多元/);
  pushTag("积极配置", /积极配置|积极/);
  pushTag("稳健", /稳健|稳享|稳晖|稳盈|悦信稳健|安盈|安悦/);
  pushTag("平衡", /平衡|均衡/);
  pushTag("优选", /优选/);
  const holding = extractHoldingBucket(text);
  if (!tags.includes(holding) && holding !== "其他持有") tags.push(holding);
  if (!tags.includes(product.fof_type)) tags.push(product.fof_type);
  return tags.slice(0, 4);
}

function getProductProfile(product) {
  return {
    holdingBucket: extractHoldingBucket(product.fund_name),
    riskBucket: extractRiskBucket(product.fund_name),
    tags: deriveStrategyTags(product),
  };
}

function getSimilarityScore(source, target) {
  if (!source || !target) return -1;
  const sourceProfile = getProductProfile(source);
  const targetProfile = getProductProfile(target);
  let score = 0;
  if (source.fof_type === target.fof_type) score += 3;
  if (sourceProfile.holdingBucket === targetProfile.holdingBucket) score += 4;
  if (sourceProfile.riskBucket === targetProfile.riskBucket) score += 3;
  const sourceTags = new Set(sourceProfile.tags);
  targetProfile.tags.forEach((tag) => {
    if (sourceTags.has(tag)) score += 1;
  });
  return score;
}

function getHuaxiaBenchmarks(product, limit = 3) {
  return state.data.products
    .filter((item) => item.fund_company === "华夏" && item.product_id !== product.product_id)
    .map((item) => ({ ...item, similarity: getSimilarityScore(product, item) }))
    .filter((item) => item.similarity >= 4)
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || ""));
    })
    .slice(0, limit);
}

function getPeerProducts(product, limit = 3) {
  return state.data.products
    .filter((item) => item.product_id !== product.product_id && item.fund_company !== product.fund_company)
    .map((item) => ({ ...item, similarity: getSimilarityScore(product, item) }))
    .filter((item) => item.similarity >= 4)
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || ""));
    })
    .slice(0, limit);
}

function getHuaxiaBenchmarkInsight(product) {
  const matches = getHuaxiaBenchmarks(product, 1);
  if (product.fund_company === "华夏") {
    const peers = getPeerProducts(product, 2);
    return {
      tone: "focus",
      label: "华夏主动作",
      headline: peers.length ? `外部相似竞品 ${peers.length} 只` : "当前仍是先手卡位",
      detail: peers.length
        ? `${peers.map((item) => item.fund_company).join("、")}存在同类布局，可持续观察发行窗口。`
        : "外部相似产品不多，可关注后续同档期申报动作。",
    };
  }
  if (!matches.length) {
    return {
      tone: "alert",
      label: "空白预警",
      headline: "华夏暂无同类产品",
      detail: "该格子暂无华夏对标储备，建议纳入重点盯防。",
    };
  }
  const match = matches[0];
  const metric =
    match.raise_scale != null
      ? `已募集 ${fmtNum(match.raise_scale)} 亿元`
      : `${escapeHtml(match.current_stage)} · 最新日期 ${fmtDate(match.latest_event_date)}`;
  return {
    tone: "match",
    label: "内部对标",
    headline: `华夏已有对标产品：${match.fund_name}`,
    detail: metric,
    product: match,
  };
}

function getThreatBadge(product) {
  const insight = getHuaxiaBenchmarkInsight(product);
  if (product.fund_company === "华夏") return { label: "华夏动作", tone: "focus" };
  if (insight.tone === "alert") return { label: "空白卡位", tone: "alert" };
  if (product.is_key_company) return { label: "重点防守", tone: "danger" };
  if (product.current_stage === "新申报") return { label: "新申报", tone: "watch" };
  return { label: "跟踪中", tone: "match" };
}

function getSignalPriority(product) {
  const badge = getThreatBadge(product);
  let score = 0;
  if (badge.tone === "alert") score += 40;
  if (badge.tone === "danger") score += 28;
  if (product.current_stage === "新申报") score += 22;
  if (product.is_key_company) score += 12;
  score += Math.min(Number(product.days_in_stage) || 0, 30);
  if (product.latest_event_date) score += Number(String(product.latest_event_date).replace(/-/g, ""));
  return score;
}

function getTopComparisonCompanies(limit = 6) {
  const ytdRows = (state.data.summary.company_rankings.all.ytd || []).slice();
  const sorted = ytdRows.sort((a, b) => {
    if ((Number(b.raise_scale_sum) || 0) !== (Number(a.raise_scale_sum) || 0)) {
      return (Number(b.raise_scale_sum) || 0) - (Number(a.raise_scale_sum) || 0);
    }
    return (b.establish_count || 0) - (a.establish_count || 0);
  });
  const picked = [];
  const pushUnique = (row) => {
    if (row && !picked.some((item) => item.fund_company === row.fund_company)) picked.push(row);
  };
  sorted.slice(0, limit - 1).forEach(pushUnique);
  pushUnique(sorted.find((row) => row.fund_company === "华夏"));
  if (picked.length < limit) {
    sorted.forEach(pushUnique);
  }
  return picked.slice(0, limit);
}

function getStageEventDate(product, stage) {
  if (stage === "新申报") return product.declare_date;
  if (stage === "新受理") return product.accept_date;
  if (stage === "已获批") return product.approval_date;
  if (stage === "发行中") return product.issue_start_date;
  if (stage === "已成立") return product.establish_date;
  return null;
}

function buildStepTrackerMarkup(product, compact = false) {
  const currentIndex = stageIndex(product.current_stage);
  return `
    <div class="step-track ${compact ? "is-compact" : ""}">
      ${STAGE_FLOW.map((stage, index) => {
        const status = index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : "is-upcoming";
        const date = getStageEventDate(product, stage);
        return `
          <div class="step-node ${status}">
            <div class="step-dot">${index < currentIndex ? "✓" : index + 1}</div>
            <div class="step-copy">
              <div class="step-name">${escapeHtml(shortStageLabel(stage))}</div>
              ${compact ? "" : `<div class="step-date">${fmtDate(date)}</div>`}
            </div>
          </div>
        `;
      }).join('<div class="step-connector"></div>')}
    </div>
  `;
}

function getMatrixBuckets() {
  return {
    holding: ["3个月持有", "6个月持有", "1年及以上", "其他持有"],
    risk: ["养老", "稳健", "平衡", "积极"],
  };
}

function groupByMatrix(products) {
  const buckets = {};
  products.forEach((product) => {
    const profile = getProductProfile(product);
    const holding = ["3个月持有", "6个月持有", "1年及以上", "其他持有"].includes(profile.holdingBucket)
      ? profile.holdingBucket
      : "其他持有";
    const risk = ["养老", "稳健", "平衡", "积极"].includes(profile.riskBucket) ? profile.riskBucket : "平衡";
    const key = `${risk}|${holding}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(product);
  });
  return buckets;
}

function getRegimeEstimates(product) {
  const profile = getProductProfile(product);
  const stableMap = {
    养老: {
      boom: { returnBand: "4%~7%", drawdown: "-3%~-5%", note: "养老 FOF 更强调长期稳健增值和回撤约束，进攻性通常最低。" },
      range: { returnBand: "3%~5%", drawdown: "-2%~-4%", note: "震荡期更看重资产配置与下行控制，体验通常比普通稳健型更平滑。" },
      stress: { returnBand: "0%~2%", drawdown: "-2%~-4%", note: "风险偏好走弱时通常以防守为主，但也意味着修复速度偏慢。" },
    },
    稳健: {
      boom: { returnBand: "5%~8%", drawdown: "-4%~-6%", note: "权益弹性较弱，偏重防守与波动控制。" },
      range: { returnBand: "4%~6%", drawdown: "-3%~-5%", note: "震荡期通常更稳，适合承接绝对收益诉求。" },
      stress: { returnBand: "1%~3%", drawdown: "-2%~-4%", note: "回撤弹性相对有限，但进攻能力也会受约束。" },
    },
    平衡: {
      boom: { returnBand: "7%~12%", drawdown: "-6%~-9%", note: "权益与固收并行，顺风期具备跟涨能力。" },
      range: { returnBand: "4%~8%", drawdown: "-4%~-7%", note: "多资产与多元配置更依赖选基和仓位切换。" },
      stress: { returnBand: "-2%~3%", drawdown: "-6%~-10%", note: "若底层风险资产占比不低，回撤仍需关注。" },
    },
    积极: {
      boom: { returnBand: "10%~16%", drawdown: "-8%~-12%", note: "更偏权益弹性，顺风期抢份额能力更强。" },
      range: { returnBand: "3%~8%", drawdown: "-7%~-11%", note: "震荡期容易回吐，考验择时与底层风格。" },
      stress: { returnBand: "-5%~1%", drawdown: "-10%~-15%", note: "风险偏好回落时承压更明显，需要更强风控。" },
    },
  };
  return stableMap[profile.riskBucket] || stableMap.平衡;
}

function getRadarScores(product) {
  const profile = getProductProfile(product);
  const hasGap = getHuaxiaBenchmarkInsight(product).tone === "alert";
  const elasticity = profile.riskBucket === "积极" ? 84 : profile.riskBucket === "养老" ? 26 : profile.riskBucket === "稳健" ? 38 : 62;
  const lowVol = profile.riskBucket === "养老" ? 92 : profile.riskBucket === "稳健" ? 86 : profile.riskBucket === "积极" ? 34 : 60;
  const holding =
    profile.holdingBucket === "3个月持有"
      ? 55
      : profile.holdingBucket === "6个月持有"
        ? 72
        : profile.holdingBucket === "其他持有"
          ? 64
          : 84;
  const etf = /ETF-FOF/i.test(product.fund_name) ? 88 : 36;
  const gap = hasGap ? 86 : product.fund_company === "华夏" ? 48 : 58;
  return [
    { label: "权益弹性", value: elasticity },
    { label: "低波控制", value: lowVol },
    { label: "持有约束", value: holding },
    { label: "ETF工具化", value: etf },
    { label: "空白卡位", value: gap },
  ];
}

function buildRadarSvg(product) {
  const scores = getRadarScores(product);
  const size = 260;
  const center = size / 2;
  const radius = 86;
  const steps = 4;
  const angleStep = (Math.PI * 2) / scores.length;
  const pointAt = (value, index, factor = 1) => {
    const angle = -Math.PI / 2 + index * angleStep;
    const r = radius * factor * (value / 100);
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r];
  };
  const polygon = scores
    .map((item, index) => pointAt(item.value, index).join(","))
    .join(" ");
  let svg = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="策略雷达图">`;
  for (let step = steps; step >= 1; step -= 1) {
    const factor = step / steps;
    const ring = scores.map((_, index) => pointAt(100, index, factor).join(",")).join(" ");
    svg += `<polygon points="${ring}" fill="none" stroke="rgba(24,33,47,0.09)" stroke-width="1" />`;
  }
  scores.forEach((item, index) => {
    const [x, y] = pointAt(100, index, 1.12);
    const [lx, ly] = pointAt(100, index, 1);
    svg += `<line x1="${center}" y1="${center}" x2="${lx}" y2="${ly}" stroke="rgba(24,33,47,0.12)" stroke-width="1" />`;
    svg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#667085">${escapeHtml(item.label)}</text>`;
  });
  svg += `<polygon points="${polygon}" fill="rgba(193,18,31,0.18)" stroke="#c1121f" stroke-width="2.4" />`;
  scores.forEach((item, index) => {
    const [x, y] = pointAt(item.value, index);
    svg += `<circle cx="${x}" cy="${y}" r="4.5" fill="#c1121f" stroke="#fffdfa" stroke-width="2" />`;
  });
  svg += `</svg>`;
  return svg;
}

function getProductsForTopPeriod(extraFilter) {
  const range = getPeriodRange(state.topPeriod);
  return state.data.products.filter((item) => {
    const inSelectedRange = inRange(item.latest_event_date, range.start, range.end);
    if (!inSelectedRange) return false;
    return extraFilter ? extraFilter(item) : true;
  });
}

function openDrawer() {
  state.drawerOpen = true;
  const drawer = document.getElementById("detail-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (drawer) {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  }
  if (backdrop) backdrop.classList.add("is-open");
  document.body.classList.add("drawer-open");
}

function closeDrawer() {
  state.drawerOpen = false;
  const drawer = document.getElementById("detail-drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  if (drawer) {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }
  if (backdrop) backdrop.classList.remove("is-open");
  document.body.classList.remove("drawer-open");
}

function setSelectedProduct(productId, switchTab = false, revealDrawer = true) {
  state.selectedProductId = productId;
  if (switchTab) {
    state.activeTab = "detail";
    activateTabs();
  }
  renderDetail();
  renderDrawer();
  if (revealDrawer) openDrawer();
}

function activateTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".rail-nav-button").forEach((button) => {
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

function bindClickableRows(container, options = {}) {
  const { switchTab = false, revealDrawer = true } = options;
  container.querySelectorAll("[data-product-id]").forEach((row) => {
    row.addEventListener("click", () => setSelectedProduct(row.dataset.productId, switchTab, revealDrawer));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelectedProduct(row.dataset.productId, switchTab, revealDrawer);
      }
    });
    row.setAttribute("tabindex", "0");
  });
}

function renderHero() {
  const summary = state.data.summary;
  const range = state.topPeriod === "week" ? summary.week_range : summary.ytd_range;
  const prefix = state.topPeriod === "week" ? "近一周" : "今年以来";
  const topSignals = ((summary.stage_sections[state.topPeriod] || {}).declare || []).length;
  const huaxiaPipeline = state.data.products.filter((item) => item.fund_company === "华夏" && isInReviewProduct(item)).length;
  document.getElementById("hero-subtitle").textContent =
    `当前展示 ${prefix} FOF 竞品情报，统计区间为 ${range.start} 至 ${range.end}，重点盯紧新申报与华夏对标差距。`;
  document.getElementById("hero-pills").innerHTML = [
    `重点公司 ${state.data.config.key_companies.length} 家`,
    `跟踪产品 ${state.data.products.length} 只`,
    `${prefix}新申报 ${topSignals} 只`,
    `华夏在途 ${huaxiaPipeline} 只`,
  ]
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join("");
}

function renderKPIs() {
  const kpi = state.data.summary.market_kpis[state.topPeriod] || {};
  const titlePrefix = state.topPeriod === "week" ? "近一周" : "今年以来";
  const inReviewCount = state.data.products.filter((item) => isInReviewProduct(item)).length;
  const gapCount = (((state.data.summary.stage_sections[state.topPeriod] || {}).declare || []) || []).filter(
    (item) => item.fund_company !== "华夏" && getHuaxiaBenchmarkInsight(item).tone === "alert"
  ).length;
  const huaxiaYtd = (state.data.summary.company_rankings.all.ytd || []).find((item) => item.fund_company === "华夏") || {};
  const items = [
    { icon: "申", label: `${titlePrefix}新申报`, value: kpi.declare_count ?? 0, note: "按材料接收日统计" },
    { icon: "受", label: `${titlePrefix}新受理`, value: kpi.accept_count ?? 0, note: "按材料受理日统计" },
    { icon: "批", label: `${titlePrefix}新获批`, value: kpi.approval_count ?? 0, note: "按获批日期统计" },
    { icon: "成", label: `${titlePrefix}新成立`, value: kpi.establish_count ?? 0, note: "按成立日统计" },
    { icon: "募", label: `${titlePrefix}募集规模`, value: fmtNum(kpi.raise_scale), note: "单位：亿元" },
    { icon: "盯", label: "华夏对标空白", value: gapCount, note: `当前在审 ${inReviewCount} 只 · 华夏已成立 ${huaxiaYtd.establish_count ?? 0} 只` },
  ];
  document.getElementById("kpi-grid").innerHTML = items
    .map(
      (item) => `
        <article class="kpi-card">
          <div class="kpi-topline">
            <div class="kpi-icon">${escapeHtml(item.icon)}</div>
            <div class="kpi-label">${escapeHtml(item.label)}</div>
          </div>
          <div class="kpi-value">${escapeHtml(item.value)}</div>
          <div class="kpi-note">${escapeHtml(item.note)}</div>
        </article>
      `
    )
    .join("");
}

function renderPipeline() {
  const html = state.data.summary.stage_counts
    .filter((item) => STAGE_FLOW.includes(item.stage))
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

function renderRailNav() {
  const container = document.getElementById("rail-nav");
  if (!container) return;
  container.innerHTML = RAIL_NAV_ITEMS.map(
    (item) => `
      <button class="rail-nav-button ${state.activeTab === item.tab ? "is-active" : ""}" data-tab="${escapeHtml(item.tab)}" type="button">
        <span class="rail-nav-label">${escapeHtml(item.label)}</span>
        <span class="rail-nav-note">${escapeHtml(item.note)}</span>
      </button>
    `
  ).join("");
  container.querySelectorAll(".rail-nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      activateTabs();
      if (state.activeTab === "detail") renderDetail();
    });
  });
}

function populateMonitorFilters() {
  const companySelect = document.getElementById("monitor-company");
  const stageSelect = document.getElementById("monitor-stage");
  const sortSelect = document.getElementById("monitor-sort");
  if (!companySelect || !stageSelect || !sortSelect) return;
  const companies = ["", ...new Set(state.data.products.filter(isInReviewProduct).map((item) => item.fund_company).filter(Boolean))].sort();
  companySelect.innerHTML = companies
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "全部公司")}</option>`)
    .join("");
  stageSelect.innerHTML = [
    { value: "新申报", label: "只看新申报" },
    { value: "新受理", label: "只看新受理" },
    { value: "已获批", label: "只看已获批" },
    { value: "发行中", label: "只看发行中" },
    { value: "all", label: "全部在审" },
  ]
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  sortSelect.innerHTML = [
    { value: "threat", label: "按预警优先级" },
    { value: "days_desc", label: "按停留天数" },
    { value: "latest_desc", label: "按最新日期" },
    { value: "company", label: "按基金公司" },
  ]
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("");
  companySelect.value = state.monitorFilters.company;
  stageSelect.value = state.monitorFilters.stage;
  sortSelect.value = state.monitorFilters.sort;
  document.getElementById("monitor-search").value = state.monitorFilters.search;
}

function filterMonitorProducts() {
  const rows = state.data.products.filter(isInReviewProduct).filter((item) => {
    if (state.monitorFilters.company && item.fund_company !== state.monitorFilters.company) return false;
    if (state.monitorFilters.stage !== "all" && item.current_stage !== state.monitorFilters.stage) return false;
    if (state.monitorFilters.search) {
      const text = `${item.fund_name} ${item.fund_company} ${deriveStrategyTags(item).join(" ")}`.toLowerCase();
      if (!text.includes(state.monitorFilters.search.toLowerCase())) return false;
    }
    return true;
  });

  const sorters = {
    threat: (a, b) => getSignalPriority(b) - getSignalPriority(a),
    days_desc: (a, b) => (Number(b.days_in_stage) || 0) - (Number(a.days_in_stage) || 0),
    latest_desc: (a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || "")),
    company: (a, b) => String(a.fund_company || "").localeCompare(String(b.fund_company || ""), "zh-CN"),
  };
  return rows.sort(sorters[state.monitorFilters.sort] || sorters.threat);
}

function renderSignalSummary() {
  const container = document.getElementById("signal-summary");
  if (!container) return;
  const rows = filterMonitorProducts();
  const declareRows = ((state.data.summary.stage_sections[state.topPeriod] || {}).declare || []) || [];
  const gapCount = rows.filter((item) => item.fund_company !== "华夏" && getHuaxiaBenchmarkInsight(item).tone === "alert").length;
  const defendCount = rows.filter((item) => getThreatBadge(item).label === "重点防守").length;
  const huaxiaRows = rows.filter((item) => item.fund_company === "华夏").length;
  container.innerHTML = [
    { label: "当前命中", value: rows.length, note: "符合筛选条件的在审产品" },
    { label: "本期新申报", value: declareRows.length, note: `${state.topPeriod === "week" ? "近一周" : "今年以来"}新进入池子的产品` },
    { label: "华夏空白", value: gapCount, note: "竞品已卡位但华夏暂无同类" },
    { label: "重点防守", value: defendCount, note: "重点公司或直接对标华夏的产品" },
    { label: "华夏在途", value: huaxiaRows, note: "当前华夏自己在途储备" },
  ]
    .map(
      (item) => `
        <div class="monitor-stat">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <em>${escapeHtml(item.note)}</em>
        </div>
      `
    )
    .join("");
}

function renderSignalRadar() {
  const container = document.getElementById("signal-radar");
  if (!container) return;
  const rows = filterMonitorProducts();
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">当前筛选条件下没有命中的在审产品。</div>`;
    return;
  }
  container.innerHTML = `
    <div class="signal-radar-grid">
      ${rows.slice(0, 12).map((product) => {
        const profile = getProductProfile(product);
        const insight = getHuaxiaBenchmarkInsight(product);
        const badge = getThreatBadge(product);
        const dateLabel = product.current_stage === "新申报" ? "接收日" : product.current_stage === "新受理" ? "受理日" : "最新日";
        const keyDate =
          product.current_stage === "新申报"
            ? product.declare_date
            : product.current_stage === "新受理"
              ? product.accept_date
              : product.latest_event_date;
        return `
          <article class="signal-card clickable-row" data-product-id="${escapeHtml(product.product_id)}">
            <div class="signal-topline">
              <div class="signal-badges">
                <span class="signal-badge ${badge.tone}">${escapeHtml(badge.label)}</span>
                ${product.is_key_company ? `<span class="signal-badge subtle">重点公司</span>` : ""}
              </div>
              <div class="signal-chevron">&gt;</div>
            </div>
            <h3>${escapeHtml(product.fund_name)}</h3>
            <div class="signal-meta">${escapeHtml(product.fund_company)} · ${escapeHtml(product.fof_type)} · 风格 ${escapeHtml(profile.riskBucket)}</div>
            <div class="signal-tags">
              ${profile.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
            ${buildStepTrackerMarkup(product, true)}
            <div class="signal-stats">
              <div><span>${escapeHtml(dateLabel)}</span><strong>${fmtDate(keyDate)}</strong></div>
              <div><span>停留天数</span><strong>${escapeHtml(product.days_in_stage ?? "—")} 天</strong></div>
              <div><span>托管人</span><strong>${escapeHtml(product.custodian || "待披露")}</strong></div>
            </div>
            <div class="signal-insight ${insight.tone}">
              <div class="signal-insight-label">${escapeHtml(insight.label)}</div>
              <div class="signal-insight-title">${escapeHtml(insight.headline)}</div>
              <div class="signal-insight-detail">${escapeHtml(insight.detail)}</div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
    ${
      rows.length > 12
        ? `<div class="monitor-footnote">当前共命中 ${escapeHtml(rows.length)} 只在审产品，卡片区仅展示优先级最高的 12 只；完整列表仍可在“流程跟踪”中查看。</div>`
        : ""
    }
  `;
  bindClickableRows(container);
}

function renderBattlefield() {
  const tabContainer = document.getElementById("battlefield-tabs");
  const contentContainer = document.getElementById("battlefield-content");
  if (!tabContainer || !contentContainer) return;
  tabContainer.innerHTML = BATTLEFIELD_TABS.map(
    (tab) => `<button class="subtab ${state.battlefieldTab === tab.key ? "is-active" : ""}" data-battlefield="${escapeHtml(tab.key)}">${escapeHtml(
      tab.label
    )}</button>`
  ).join("");
  tabContainer.querySelectorAll("[data-battlefield]").forEach((button) => {
    button.addEventListener("click", () => {
      state.battlefieldTab = button.dataset.battlefield;
      renderBattlefield();
    });
  });

  if (state.battlefieldTab === "matrix") {
    contentContainer.innerHTML = renderMatrixBattlefield();
    return;
  }
  if (state.battlefieldTab === "efficiency") {
    contentContainer.innerHTML = renderEfficiencyBattlefield();
    return;
  }
  contentContainer.innerHTML = renderLaunchBattlefield();
}

function renderLaunchBattlefield() {
  const rows = getTopComparisonCompanies(6)
    .map((row) => {
      const current = (state.data.summary.company_rankings.all[state.topPeriod] || []).find((item) => item.fund_company === row.fund_company) || row;
      return current;
    })
    .filter(Boolean);
  if (!rows.length) return `<div class="empty-box">当前没有可展示的公司对比数据。</div>`;
  const leader = rows[0];
  const huaxia = rows.find((item) => item.fund_company === "华夏");
  const maxCount = Math.max(...rows.map((row) => row.establish_count || 0), 1);
  const maxScale = Math.max(...rows.map((row) => Number(row.raise_scale_sum) || 0), 1);
  const gapCount = huaxia ? Math.max((leader.establish_count || 0) - (huaxia.establish_count || 0), 0) : null;
  const gapScale = huaxia ? Math.max((Number(leader.raise_scale_sum) || 0) - (Number(huaxia.raise_scale_sum) || 0), 0) : null;
  return `
    <div class="battlefield-summary">
      <div class="battlefield-headline">
        <strong>${escapeHtml(state.topPeriod === "week" ? "近一周" : "今年以来")}</strong>
        发行节奏看板聚焦“谁在成立、谁在吸金、华夏差多少”。
      </div>
      ${
        huaxia
          ? `<div class="battlefield-caption">当前领跑公司为 ${escapeHtml(leader.fund_company)}，华夏在成立数量上还差 ${escapeHtml(
              gapCount
            )} 只，在募集规模上还差 ${fmtNum(gapScale)} 亿元。</div>`
          : `<div class="battlefield-caption">当前样本里未识别到华夏口径，暂展示头部公司发行节奏。</div>`
      }
    </div>
    <div class="battle-launch-list">
      ${rows
        .map((row) => {
          const countWidth = Math.max(8, ((row.establish_count || 0) / maxCount) * 100);
          const scaleWidth = Math.max(8, ((Number(row.raise_scale_sum) || 0) / maxScale) * 100);
          return `
            <article class="battle-launch-row ${row.fund_company === "华夏" ? "is-huaxia" : ""}">
              <div class="battle-launch-top">
                <div>
                  <div class="battle-company">${escapeHtml(row.fund_company)}</div>
                  <div class="battle-meta">成立 ${escapeHtml(row.establish_count || 0)} 只 · 募集 ${fmtNum(row.raise_scale_sum)} 亿元</div>
                </div>
                ${row.fund_company === "华夏" ? `<span class="battle-chip">华夏视角</span>` : ""}
              </div>
              <div class="battle-metric">
                <span>成立数量</span>
                <div class="battle-bar"><div class="battle-bar-fill blue" style="width:${countWidth}%"></div></div>
                <strong>${escapeHtml(row.establish_count || 0)}</strong>
              </div>
              <div class="battle-metric">
                <span>募集规模</span>
                <div class="battle-bar"><div class="battle-bar-fill warm" style="width:${scaleWidth}%"></div></div>
                <strong>${fmtNum(row.raise_scale_sum)}</strong>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderMatrixBattlefield() {
  const buckets = getMatrixBuckets();
  const huaxiaRows = state.data.products.filter((item) => item.fund_company === "华夏");
  const declareRows = ((state.data.summary.stage_sections[state.topPeriod] || {}).declare || []).filter((item) => item.fund_company !== "华夏");
  const establishRows = ((state.data.summary.stage_sections[state.topPeriod] || {}).establish || []).filter((item) => item.fund_company !== "华夏");
  const huaxiaMap = groupByMatrix(huaxiaRows);
  const declareMap = groupByMatrix(declareRows);
  const establishMap = groupByMatrix(establishRows);

  return `
    <div class="battlefield-summary">
      <div class="battlefield-headline"><strong>产品矩阵雷达</strong> 把“持有期 × 风险收益特征”压成一张空白网格，直接看竞品卡位和华夏缺口。</div>
      <div class="battlefield-caption">红色闪点代表 ${state.topPeriod === "week" ? "近一周" : "今年以来"}新申报，蓝色代表新成立，米色代表华夏现有储备。</div>
    </div>
    <div class="matrix-grid">
      <div class="matrix-corner">风险 / 持有期</div>
      ${buckets.holding.map((holding) => `<div class="matrix-axis">${escapeHtml(holding)}</div>`).join("")}
      ${buckets.risk
        .map(
          (risk) => `
            <div class="matrix-axis matrix-axis-row">${escapeHtml(risk)}</div>
            ${buckets.holding
              .map((holding) => {
                const key = `${risk}|${holding}`;
                const huaxiaCount = (huaxiaMap[key] || []).length;
                const declareCount = (declareMap[key] || []).length;
                const establishCount = (establishMap[key] || []).length;
                const hotCompanies = (declareMap[key] || []).slice(0, 2).map((item) => item.fund_company).join("、");
                const classes = [
                  "matrix-cell",
                  huaxiaCount === 0 && declareCount > 0 ? "is-gap" : "",
                  declareCount > 0 ? "is-hot" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return `
                  <div class="${classes}">
                    <div class="matrix-badges">
                      <span class="matrix-dot huaxia">华夏 ${huaxiaCount}</span>
                      <span class="matrix-dot declare">新申报 ${declareCount}</span>
                      <span class="matrix-dot establish">新成立 ${establishCount}</span>
                    </div>
                    <div class="matrix-note">${
                      huaxiaCount === 0 && declareCount > 0
                        ? `华夏缺位，${escapeHtml(hotCompanies || "竞品")}正在补空白`
                        : declareCount > 0
                          ? `竞品继续加密 ${escapeHtml(hotCompanies || "该格子")}`
                          : huaxiaCount > 0
                            ? "华夏已有储备"
                            : "当前较安静"
                    }</div>
                  </div>
                `;
              })
              .join("")}
          `
        )
        .join("")}
    </div>
  `;
}

function renderEfficiencyBattlefield() {
  const companies = getTopComparisonCompanies(6).map((item) => item.fund_company);
  const rows = companies
    .map((company) => {
      const products = state.data.products.filter((item) => item.fund_company === company);
      const avgDeclareToAccept = average(products.map((item) => item.declare_to_accept_days));
      const avgAcceptToApproval = average(products.map((item) => item.accept_to_approval_days));
      const avgDeclareToEstablish = average(products.map((item) => daysBetween(item.declare_date, item.establish_date)));
      const longestAccepting = products
        .filter((item) => item.current_stage === "新受理" && item.days_in_stage != null)
        .sort((a, b) => (Number(b.days_in_stage) || 0) - (Number(a.days_in_stage) || 0))[0];
      return {
        fund_company: company,
        avgDeclareToAccept,
        avgAcceptToApproval,
        avgDeclareToEstablish,
        warning:
          longestAccepting && avgAcceptToApproval != null && Number(longestAccepting.days_in_stage) > avgAcceptToApproval
            ? `${longestAccepting.fund_name} 在“受理”阶段已停留 ${longestAccepting.days_in_stage} 天，超过同公司平均获批等待。`
            : "",
      };
    })
    .sort((a, b) => {
      const aValue = a.avgDeclareToEstablish == null ? Infinity : a.avgDeclareToEstablish;
      const bValue = b.avgDeclareToEstablish == null ? Infinity : b.avgDeclareToEstablish;
      return aValue - bValue;
    });
  const benchmark = average(rows.filter((item) => item.fund_company !== "华夏").map((item) => item.avgDeclareToEstablish));
  const huaxia = rows.find((item) => item.fund_company === "华夏");
  return `
    <div class="battlefield-summary">
      <div class="battlefield-headline"><strong>审批效率追踪</strong> 把申报到受理、受理到获批、申报到成立三个耗时拆开，看华夏是否慢于头部同业。</div>
      <div class="battlefield-caption">${
        huaxia && benchmark != null
          ? `头部同业平均“申报到成立”约 ${fmtNum(benchmark)} 天，华夏当前可比口径为 ${
              huaxia.avgDeclareToEstablish != null ? `${fmtNum(huaxia.avgDeclareToEstablish)} 天` : "样本不足"
            }。`
          : "当前仅展示已有样本的公司，空值代表样本不足。"
      }</div>
    </div>
    <div class="efficiency-list">
      ${rows
        .map(
          (row) => `
            <article class="efficiency-row ${row.fund_company === "华夏" ? "is-huaxia" : ""} ${row.warning ? "is-warning" : ""}">
              <div class="efficiency-company">
                <strong>${escapeHtml(row.fund_company)}</strong>
                ${row.fund_company === "华夏" ? `<span class="battle-chip">华夏视角</span>` : ""}
              </div>
              <div class="efficiency-metric">
                <span>申报 -> 受理</span>
                <strong>${row.avgDeclareToAccept != null ? `${fmtNum(row.avgDeclareToAccept)} 天` : "—"}</strong>
              </div>
              <div class="efficiency-metric">
                <span>受理 -> 获批</span>
                <strong>${row.avgAcceptToApproval != null ? `${fmtNum(row.avgAcceptToApproval)} 天` : "—"}</strong>
              </div>
              <div class="efficiency-metric">
                <span>申报 -> 成立</span>
                <strong>${row.avgDeclareToEstablish != null ? `${fmtNum(row.avgDeclareToEstablish)} 天` : "—"}</strong>
              </div>
              <div class="efficiency-note">${escapeHtml(row.warning || "当前没有触发明显的受理停留预警。")}</div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
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
  const rows = state.data.products.filter(isInReviewProduct).sort((a, b) => getSignalPriority(b) - getSignalPriority(a)).slice(0, 6);
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
          <span class="pill">${escapeHtml(getThreatBadge(row).label)}</span>
        </div>
        <div class="mini-meta">${escapeHtml(row.fund_company)} · ${escapeHtml(row.current_stage)} · 已停留 ${escapeHtml(row.days_in_stage)} 天</div>
        <div class="mini-step-wrap">${buildStepTrackerMarkup(row, true)}</div>
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
    .sort((a, b) => getSignalPriority(b) - getSignalPriority(a))
    .slice(0, 10);
  container.innerHTML = rows.length
    ? `<div class="key-product-list">${rows
        .map(
          (row) => `
            <div class="key-product-item clickable-row" data-product-id="${escapeHtml(row.product_id)}">
              <div class="item-top">
                <div class="item-name">${escapeHtml(row.fund_name)}</div>
                <span class="pill">${escapeHtml(getThreatBadge(row).label)}</span>
              </div>
              <div class="item-meta">${escapeHtml(row.fund_company)} · ${escapeHtml(row.current_stage)} · 最新日期 ${fmtDate(
                row.latest_event_date
              )}</div>
              <div class="item-insight">${escapeHtml(getHuaxiaBenchmarkInsight(row).headline)}</div>
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

function buildDiagnosisMarkup(product, mode = "page") {
  const profile = getProductProfile(product);
  const insight = getHuaxiaBenchmarkInsight(product);
  const peers = getPeerProducts(product, 3);
  const threat = getThreatBadge(product);
  const regimes = getRegimeEstimates(product);
  const timelineRows = [
    { stage: "新申报", date: product.declare_date, note: "材料接收" },
    { stage: "新受理", date: product.accept_date, note: product.declare_to_accept_days != null ? `申报到受理 ${product.declare_to_accept_days} 天` : "进入监管受理流程" },
    { stage: "已获批", date: product.approval_date, note: product.accept_to_approval_days != null ? `受理到获批 ${product.accept_to_approval_days} 天` : "尚未形成获批样本" },
    { stage: "发行中", date: product.issue_start_date, note: "进入募集阶段" },
    { stage: "已成立", date: product.establish_date, note: product.issue_to_establish_days != null ? `发行到成立 ${product.issue_to_establish_days} 天` : "尚未成立或暂无耗时数据" },
  ];
  return `
    <div class="diagnosis-shell ${mode === "drawer" ? "is-drawer" : ""}">
      <div class="detail-hero">
        <div class="detail-card detail-card-hero">
          <div class="detail-kicker">Single Product Diagnosis</div>
          <div class="detail-title">${escapeHtml(product.fund_name)}</div>
          <div class="detail-badge-row">
            <span class="signal-badge ${threat.tone}">${escapeHtml(threat.label)}</span>
            <span class="signal-badge subtle">${escapeHtml(product.current_stage)}</span>
            ${product.is_key_company ? `<span class="signal-badge subtle">重点公司</span>` : ""}
          </div>
          <div class="detail-tags">
            ${profile.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <div class="detail-data-grid">
            <div><span>基金公司</span><strong>${escapeHtml(product.fund_company)}</strong></div>
            <div><span>FOF类型</span><strong>${escapeHtml(product.fof_type)}</strong></div>
            <div><span>最新进展</span><strong>${fmtDate(product.latest_event_date)}</strong></div>
            <div><span>停留天数</span><strong>${escapeHtml(product.days_in_stage ?? "—")} 天</strong></div>
            <div><span>托管人</span><strong>${escapeHtml(product.custodian || "待披露")}</strong></div>
            <div><span>募集规模</span><strong>${fmtNum(product.raise_scale)} 亿元</strong></div>
          </div>
        </div>
        <div class="detail-card detail-card-side">
          <div class="detail-side-title">华夏内部对标</div>
          <div class="signal-insight ${insight.tone}">
            <div class="signal-insight-label">${escapeHtml(insight.label)}</div>
            <div class="signal-insight-title">${escapeHtml(insight.headline)}</div>
            <div class="signal-insight-detail">${escapeHtml(insight.detail)}</div>
          </div>
          <div class="detail-side-stack">
            <div class="detail-side-item">
              <span>风格刻画</span>
              <strong>${escapeHtml(profile.riskBucket)} · ${escapeHtml(profile.holdingBucket)}</strong>
            </div>
            <div class="detail-side-item">
              <span>备注</span>
              <strong>${escapeHtml(product.remarks || "—")}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="section-head compact">
          <div>
            <h2 style="font-size:18px;">推进步骤与节点</h2>
            <p>用步骤条替代纯文本状态，直接看距离成立还有多远。</p>
          </div>
        </div>
        ${buildStepTrackerMarkup(product)}
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

      <div class="detail-split">
        <div class="detail-card">
          <div class="section-head compact">
            <div>
              <h2 style="font-size:18px;">策略与量化特征拆解</h2>
              <p>以下为基于基金名称标签与流程信息的规则映射，用于快速预判，不替代招募说明书。</p>
            </div>
          </div>
          <div class="strategy-layout">
            <div class="strategy-radar">${buildRadarSvg(product)}</div>
            <div class="strategy-copy">
              <div class="strategy-point">
                <span>资产配置画像</span>
                <strong>${escapeHtml(profile.riskBucket)} 型，${escapeHtml(profile.holdingBucket)} 约束，${/ETF-FOF/i.test(product.fund_name) ? "工具化程度较高" : "更依赖底层多资产配置"}</strong>
              </div>
              <div class="strategy-point">
                <span>竞品含义</span>
                <strong>${escapeHtml(insight.tone === "alert" ? "当前属于华夏空白卡位，应重点盯防。" : "华夏已有对标，可重点比效率和发行窗口。")}</strong>
              </div>
              <div class="strategy-point">
                <span>同类样本</span>
                <strong>${peers.length ? peers.map((item) => item.fund_company).join("、") : "暂未识别到明显同类竞品"}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-card">
          <div class="section-head compact">
            <div>
              <h2 style="font-size:18px;">同类历史情景测算</h2>
              <p>规则测算按风格 bucket 输出收益/回撤区间，用于做首轮强弱判断。</p>
            </div>
          </div>
          <div class="regime-grid">
            <div class="regime-card">
              <span>风险偏好抬升</span>
              <strong>${escapeHtml(regimes.boom.returnBand)}</strong>
              <em>预估最大回撤 ${escapeHtml(regimes.boom.drawdown)}</em>
              <p>${escapeHtml(regimes.boom.note)}</p>
            </div>
            <div class="regime-card">
              <span>震荡换手</span>
              <strong>${escapeHtml(regimes.range.returnBand)}</strong>
              <em>预估最大回撤 ${escapeHtml(regimes.range.drawdown)}</em>
              <p>${escapeHtml(regimes.range.note)}</p>
            </div>
            <div class="regime-card">
              <span>风险偏好回落</span>
              <strong>${escapeHtml(regimes.stress.returnBand)}</strong>
              <em>预估最大回撤 ${escapeHtml(regimes.stress.drawdown)}</em>
              <p>${escapeHtml(regimes.stress.note)}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="section-head compact">
          <div>
            <h2 style="font-size:18px;">同类竞品与流程邻近样本</h2>
            <p>用于快速看外部同类在什么公司、什么阶段、推进到哪里。</p>
          </div>
        </div>
        ${
          peers.length
            ? `<div class="peer-list">${peers
                .map(
                  (peer) => `
                    <div class="peer-item clickable-row" data-product-id="${escapeHtml(peer.product_id)}">
                      <div class="peer-top">
                        <div class="peer-name">${escapeHtml(peer.fund_name)}</div>
                        <span class="pill">${escapeHtml(peer.current_stage)}</span>
                      </div>
                      <div class="peer-meta">${escapeHtml(peer.fund_company)} · 相似度 ${escapeHtml(peer.similarity)} · 最新日期 ${fmtDate(
                        peer.latest_event_date
                      )}</div>
                    </div>
                  `
                )
                .join("")}</div>`
            : `<div class="empty-box">当前暂无明显同类竞品样本。</div>`
        }
      </div>
    </div>
  `;
}

function renderDetail() {
  const container = document.getElementById("detail-content");
  const product = state.selectedProductId ? findProduct(state.selectedProductId) : state.data.products[0];
  if (!product) {
    container.innerHTML = `<div class="empty-box">当前没有可展示的产品详情。</div>`;
    return;
  }
  state.selectedProductId = product.product_id;
  container.innerHTML = buildDiagnosisMarkup(product, "page");
  bindClickableRows(container);
}

function renderDrawer() {
  const container = document.getElementById("drawer-content");
  if (!container) return;
  const product = state.selectedProductId ? findProduct(state.selectedProductId) : state.data.products[0];
  if (!product) {
    container.innerHTML = `<div class="empty-box">当前没有可展示的产品详情。</div>`;
    return;
  }
  container.innerHTML = buildDiagnosisMarkup(product, "drawer");
  bindClickableRows(container, { revealDrawer: false });
  if (state.drawerOpen) {
    openDrawer();
  } else {
    closeDrawer();
  }
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
      renderBattlefield();
      renderSignalSummary();
      renderSignalRadar();
      renderStageSections();
      renderKeyCompanyUpdates();
      renderInReviewPool();
      renderPipeline();
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

  document.getElementById("monitor-company").addEventListener("change", (e) => {
    state.monitorFilters.company = e.target.value;
    renderSignalSummary();
    renderSignalRadar();
  });
  document.getElementById("monitor-stage").addEventListener("change", (e) => {
    state.monitorFilters.stage = e.target.value;
    renderSignalSummary();
    renderSignalRadar();
  });
  document.getElementById("monitor-sort").addEventListener("change", (e) => {
    state.monitorFilters.sort = e.target.value;
    renderSignalRadar();
  });
  document.getElementById("monitor-search").addEventListener("input", (e) => {
    state.monitorFilters.search = e.target.value;
    renderSignalSummary();
    renderSignalRadar();
  });

  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.drawerOpen) closeDrawer();
  });
}

function renderAll() {
  activateTabs();
  renderRailNav();
  renderHero();
  renderKPIs();
  renderPipeline();
  renderBattlefield();
  populateMonitorFilters();
  renderSignalSummary();
  renderSignalRadar();
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
  renderDrawer();
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
