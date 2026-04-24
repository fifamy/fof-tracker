const state = {
  data: null,
  activeTab: "dashboard",
  companyPeriod: "week",
  companyScope: "all",
  topPeriod: "week",
  battlefieldTab: "launch",
  selectedProductId: null,
  drawerOpen: false,
  globalSlice: "all",
  kpiDrill: null,
  keyProductsView: "list",
  forecastView: "gantt",
  watchCompanies: [],
  monitorFilters: {
    company: "",
    stage: "auto",
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
const WATCH_STORAGE_KEY = "fof-tracker-watch-companies";
const RAIL_NAV_ITEMS = [
  { tab: "dashboard", label: "首页总览", note: "核心 KPI 与异动" },
  { tab: "pipeline", label: "流程跟踪", note: "在审雷达 / 跟踪总表" },
  { tab: "market", label: "公司格局", note: "对标与竞争分析" },
  { tab: "scale", label: "存量与追赶", note: "存量规模 / 追赶测算" },
  { tab: "intel", label: "智能简报", note: "密集布局 / 软信息" },
  { tab: "detail", label: "产品详情", note: "单品穿透" },
];

const TAB_HEADINGS = {
  dashboard: { title: "首页总览", sub: "核心 KPI / 未来30天预测 / 近期趋势 / 重点异动" },
  pipeline: { title: "流程跟踪", sub: "在审情报雷达 / 阶段动态 / 全量跟踪总表" },
  market: { title: "公司格局", sub: "全景大盘 / 重点公司对比 / 竞争格局" },
  scale: { title: "存量与追赶", sub: "最新规模画像 / 华夏追赶头部前三测算" },
  intel: { title: "智能简报", sub: "密集布局 / 投资时钟 / 发行软信息" },
  detail: { title: "产品详情", sub: "单品推进链路与耗时诊断" },
};

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

function fmtSignedNum(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  return `${num > 0 ? "+" : ""}${fmtNum(num, digits)}`;
}

function getStockScaleProfile() {
  return state.data?.summary?.fof_scale_profile || null;
}

function getStockCompanyStats(company) {
  const profile = getStockScaleProfile();
  if (!profile || !company) return null;
  return (profile.company_rankings || []).find((item) => item.fund_company === company) || null;
}

function getStockMatrixProducts(extraFilter) {
  const profile = getStockScaleProfile();
  const rows = profile?.products || [];
  return extraFilter ? rows.filter(extraFilter) : rows.slice();
}

function loadWatchCompanies() {
  try {
    const stored = window.localStorage.getItem(WATCH_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function persistWatchCompanies() {
  try {
    window.localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(state.watchCompanies));
  } catch (error) {
    // ignore localStorage failures
  }
}

function isWatchedCompany(company) {
  return state.watchCompanies.includes(company);
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

const GLOBAL_SLICES = [
  { key: "all", label: "全部", hint: "全市场视角" },
  { key: "ordinary", label: "普通", hint: "普通 FOF" },
  { key: "etf", label: "ETF-FOF", hint: "ETF 型 FOF" },
  { key: "pension", label: "养老", hint: "养老 FOF" },
  { key: "huaxia_gap", label: "华夏空白", hint: "竞品有布局 · 华夏尚无对标" },
  { key: "huaxia_pipeline", label: "华夏在途", hint: "华夏当前推进中" },
];

function passesGlobalSlice(product) {
  const slice = state.globalSlice || "all";
  if (slice === "all") return true;
  const type = String(product.fof_type || "");
  if (slice === "ordinary") return type === "普通FOF";
  if (slice === "etf") return type === "ETF-FOF";
  if (slice === "pension") return type === "养老FOF";
  if (slice === "huaxia_gap") {
    if (product.fund_company === "华夏") return false;
    try {
      return getHuaxiaBenchmarkInsight(product).tone === "alert";
    } catch (e) {
      return false;
    }
  }
  if (slice === "huaxia_pipeline") return product.fund_company === "华夏" && isInReviewProduct(product);
  return true;
}

function sliceIsActive() {
  return state.globalSlice && state.globalSlice !== "all";
}

function getSlicedProducts() {
  return state.data.products.filter(passesGlobalSlice);
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
  pushTag("海外资产", /海外|全球|QDII|港股|跨境|环球|纳斯达克|标普|日经|恒生科技/i);
  pushTag("黄金商品", /黄金|商品|原油|大宗商品|贵金属/i);
  pushTag("REITs", /REIT|REITS|不动产投资信托/i);
  const holding = extractHoldingBucket(text);
  if (!tags.includes(holding) && holding !== "其他持有") tags.push(holding);
  if (!tags.includes(product.fof_type)) tags.push(product.fof_type);
  return tags.slice(0, 4);
}

function getProductProfile(product) {
  if (product?.holding_bucket || product?.risk_bucket || product?.strategy_tags) {
    return {
      holdingBucket: product.holding_bucket || extractHoldingBucket(product.fund_name),
      riskBucket: product.risk_bucket || extractRiskBucket(product.fund_name),
      tags: Array.isArray(product.strategy_tags) && product.strategy_tags.length ? product.strategy_tags.slice(0, 4) : deriveStrategyTags(product),
    };
  }
  return {
    holdingBucket: extractHoldingBucket(product.fund_name),
    riskBucket: extractRiskBucket(product.fund_name),
    tags: deriveStrategyTags(product),
  };
}

function getProductSegmentKey(product) {
  if (product?.strategy_segment_key) return product.strategy_segment_key;
  const profile = getProductProfile(product);
  const theme = (product?.asset_theme_tags || profile.tags.filter((tag) => ["海外资产", "黄金商品", "REITs"].includes(tag)))[0] || "BASE";
  return `${product.fof_type}|${profile.riskBucket}|${profile.holdingBucket}|${theme}|${/ETF-FOF/i.test(product.fund_name) ? "ETF" : "STD"}`;
}

function getMarketSegmentSnapshot(product) {
  const segmentKey = getProductSegmentKey(product);
  const peerProducts = state.data.products.filter((item) => getProductSegmentKey(item) === segmentKey && item.fund_company !== "华夏");
  const huaxiaProducts = state.data.products.filter((item) => getProductSegmentKey(item) === segmentKey && item.fund_company === "华夏");
  const peerKeyCompanies = [...new Set(peerProducts.filter((item) => item.is_key_company).map((item) => item.fund_company))];
  const peerInReview = peerProducts.filter(isInReviewProduct);
  const huaxiaInReview = huaxiaProducts.filter(isInReviewProduct);
  const stockRows = getStockMatrixProducts((item) => item.strategy_segment_key === segmentKey);
  const huaxiaStock = stockRows.filter((item) => item.fund_company === "华夏");
  const peerStockCompanies = [...new Set(stockRows.filter((item) => item.fund_company !== "华夏").map((item) => item.fund_company))];
  const alert =
    (state.data.summary.strategy_density?.alerts || []).find((item) => item.segment_key === segmentKey) || null;
  return {
    segmentKey,
    segmentLabel: product.strategy_segment_label || `${product.fof_type} · ${getProductProfile(product).riskBucket} · ${getProductProfile(product).holdingBucket}`,
    peerKeyCompanies,
    peerInReviewCount: peerInReview.length,
    huaxiaInReviewCount: huaxiaInReview.length,
    huaxiaStockCount: huaxiaStock.length,
    peerStockCompanyCount: peerStockCompanies.length,
    alert,
  };
}

function getFuturePrediction(product) {
  const future = state.data.summary.future_timeline || {};
  const events = future.events || [];
  const overdue = future.overdue || [];
  return events.find((item) => item.product_id === product.product_id) || overdue.find((item) => item.product_id === product.product_id) || null;
}

function getHolderStructureGuess(product) {
  const text = String(product.fund_name || "");
  const profile = getProductProfile(product);
  if (/发起式/.test(text)) {
    return {
      label: "机构 / 自有资金导向",
      note: "名称含“发起式”，更可能由机构或管理人资金先行支持。",
    };
  }
  if (profile.riskBucket === "养老") {
    return {
      label: "养老长期资金导向",
      note: "养老标签通常对应长期配置与养老客群，不以短期交易型申购为主。",
    };
  }
  if (profile.holdingBucket === "3个月持有" || profile.holdingBucket === "6个月持有") {
    return {
      label: "零售渠道概率更高",
      note: "持有期约束 + 平衡/稳健标签更常见于面向零售渠道的产品设计。",
    };
  }
  return {
    label: "综合配置客群",
    note: "当前更像面向中长期配置客群，仍需结合招募说明书和发行安排确认。",
  };
}

function getPredictedChannel(product) {
  const custodian = String(product.custodian || "");
  const fundCompany = String(product.fund_company || "");
  const manager = String(product.manager || "");
  if (/工商银行|工行/.test(custodian)) return "工行主代销概率较高";
  if (/建设银行|建行/.test(custodian)) return "建行主代销概率较高";
  if (/农业银行|农行/.test(custodian)) return "农行主代销概率较高";
  if (/中国银行|中行/.test(custodian)) return "中行主代销概率较高";
  if (/招商银行|招行/.test(custodian)) return "招行零售渠道概率较高";
  if (/交通银行|交行/.test(custodian)) return "交行渠道可重点跟踪";
  if (/证券|中信建投|华泰|国泰君安|东方证券/.test(custodian)) return "券商自有渠道概率较高";
  if (manager && /养老/.test(product.fund_name || "")) return `${manager} 相关养老客群渠道可重点跟踪`;
  if (/华夏|易方达|汇添富|富国/.test(fundCompany)) return "大行 + 第三方平台双线推进概率较高";
  return "待结合托管行与历史合作渠道补录";
}

function getDynamicHolderProbability(product) {
  const segmentRows = state.data.products.filter(
    (item) => item.current_stage === "已成立" && item.product_id !== product.product_id && getProductSegmentKey(item) === getProductSegmentKey(product)
  );
  const avgScale = average(segmentRows.map((item) => item.raise_scale));
  if (/发起式/.test(product.fund_name || "")) {
    return { label: "机构 / 自有资金概率高", note: "名称含“发起式”，通常更偏机构或管理人资金先行支持。", avgScale };
  }
  if (avgScale != null && avgScale >= 20) {
    return { label: "机构定制概率偏高", note: `同赛道已成立样本平均募集约 ${fmtNum(avgScale)} 亿元，通常更偏机构承接。`, avgScale };
  }
  if (avgScale != null && avgScale <= 8) {
    return { label: "零售渠道概率偏高", note: `同赛道已成立样本平均募集约 ${fmtNum(avgScale)} 亿元，更像零售主导型产品。`, avgScale };
  }
  return { label: getHolderStructureGuess(product).label, note: getHolderStructureGuess(product).note, avgScale };
}

function getSoftIntelSnapshot(product) {
  const holderGuess = getDynamicHolderProbability(product);
  const segment = getMarketSegmentSnapshot(product);
  return {
    launchChannels: product.launch_channels || "待补充",
    predictedChannel: product.launch_channels ? null : getPredictedChannel(product),
    channelStatus: product.channel_status || "待补充",
    holderView: product.holder_structure_view || holderGuess.label,
    holderNote: product.holder_structure_view ? product.intel_note || "该结论来自手工维护的软信息模板。" : holderGuess.note,
    underlyingPreference:
      product.underlying_preference || (segment.alert ? "建议优先补齐该赛道底层池与竞品基池映射" : "待补充"),
    poolAction:
      product.underlying_pool_action ||
      (segment.alert ? segment.alert.suggestion_brief : "可在软信息模板中补充底层池准备建议。"),
    intelligenceLevel: product.intelligence_level || (product.launch_channels || product.underlying_preference ? "已维护" : "规则预判"),
    lastUpdate: product.intel_last_update || null,
  };
}

function getMacroMatch(product) {
  const macro = state.data.summary.macro_clock || {};
  if (!macro.configured) return false;
  const profile = getProductProfile(product);
  const tagSet = new Set(profile.tags);
  return (
    (macro.watch_risk_buckets || []).includes(profile.riskBucket) ||
    (macro.watch_tags || []).some((tag) => tagSet.has(tag))
  );
}

function resolveMonitorStageSelection(baseRows) {
  if (state.monitorFilters.stage !== "auto") {
    return {
      stage: state.monitorFilters.stage,
      label: state.monitorFilters.stage === "all" ? "全部在审" : state.monitorFilters.stage,
      rows: state.monitorFilters.stage === "all" ? baseRows : baseRows.filter((item) => item.current_stage === state.monitorFilters.stage),
    };
  }
  const staged = ["新申报", "新受理", "已获批", "发行中"].map((stage) => ({
    stage,
    rows: baseRows.filter((item) => item.current_stage === stage),
  }));
  const firstWithRows = staged.find((item) => item.rows.length);
  if (firstWithRows?.stage === "新申报") {
    return { stage: "新申报", label: "新申报", rows: firstWithRows.rows };
  }
  if (firstWithRows) {
    return { stage: "all", label: `智能切换：${firstWithRows.stage}`, rows: baseRows };
  }
  return { stage: "all", label: "全部在审", rows: baseRows };
}

function getApprovalWindowInsight() {
  const approvalRows = state.data.products
    .filter((item) => item.approval_date)
    .slice()
    .sort((a, b) => String(a.approval_date || "").localeCompare(String(b.approval_date || "")));
  const dates = [...new Set(approvalRows.map((item) => item.approval_date))];
  if (dates.length < 2) return null;
  const intervals = [];
  for (let i = 1; i < dates.length; i += 1) {
    const gap = daysBetween(dates[i - 1], dates[i]);
    if (gap != null && gap > 0) intervals.push(gap);
  }
  const avgGap = average(intervals);
  const lastDate = dates[dates.length - 1];
  const nextDate = parseDate(lastDate);
  if (!nextDate || avgGap == null) return null;
  nextDate.setDate(nextDate.getDate() + Math.round(avgGap));
  const predictedDate = nextDate.toISOString().slice(0, 10);
  const dueProducts = (state.data.summary.future_timeline?.events || []).filter(
    (item) => item.predicted_stage === "已获批" && Math.abs(daysBetween(item.predicted_date, predictedDate) || 999) <= 7
  );
  return {
    avgGap,
    lastDate,
    predictedDate,
    dueProducts,
  };
}

function getDelayReasonHints(product) {
  const hints = [];
  const sameStageSegmentRows = state.data.products.filter(
    (item) =>
      item.product_id !== product.product_id &&
      item.current_stage === product.current_stage &&
      getProductSegmentKey(item) === getProductSegmentKey(product)
  );
  if (sameStageSegmentRows.length >= 3) {
    hints.push(`同赛道同阶段还有 ${sameStageSegmentRows.length} 只产品排队，存在同质化反馈压力`);
  }
  if (product.custodian) {
    const sameCustodianRows = state.data.products.filter(
      (item) => item.product_id !== product.product_id && item.current_stage === product.current_stage && item.custodian === product.custodian
    );
    if (sameCustodianRows.length >= 2) {
      hints.push(`${product.custodian} 同阶段仍有 ${sameCustodianRows.length} 只产品，可能存在托管/发行排期拥挤`);
    }
  }
  if (product.current_stage === "已获批" && !product.launch_channels) {
    hints.push("当前未录入拟发渠道，可能存在发行准备节奏偏慢");
  }
  if (product.current_stage === "新受理" && !product.theme_bucket && sameStageSegmentRows.length >= 2) {
    hints.push("产品标签较集中，若缺少差异化资产特色，反馈节奏可能偏慢");
  }
  return hints;
}

function getManagerPeerInsight(product) {
  if (!product.manager) return null;
  const sourceManagers = String(product.manager || "")
    .split(/[、,，\/ ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const sameManagerRows = state.data.products.filter((item) => {
    if (item.product_id === product.product_id || !item.manager) return false;
    const targetManagers = String(item.manager)
      .split(/[、,，\/ ]+/)
      .map((name) => name.trim())
      .filter(Boolean);
    return sourceManagers.some((name) => targetManagers.includes(name));
  });
  const peerManagers = state.data.products.filter(
    (item) =>
      item.product_id !== product.product_id &&
      item.manager &&
      item.fund_company !== product.fund_company &&
      getProductSegmentKey(item) === getProductSegmentKey(product)
  );
  return {
    sameManagerCount: sameManagerRows.length,
    peerManagerCount: peerManagers.length,
    peerManagers: [...new Set(peerManagers.map((item) => item.manager))].slice(0, 3),
  };
}

function getMacroToneClass(tone) {
  return tone ? `is-${tone}` : "";
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
  const sourceThemes = new Set(source.asset_theme_tags || sourceProfile.tags.filter((tag) => ["海外资产", "黄金商品", "REITs"].includes(tag)));
  const targetThemes = target.asset_theme_tags || targetProfile.tags.filter((tag) => ["海外资产", "黄金商品", "REITs"].includes(tag));
  targetThemes.forEach((tag) => {
    if (sourceThemes.has(tag)) score += 3;
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
  if (getMacroMatch(product)) score += 10;
  if (product.batch_role === "第一梯队") score += 8;
  if (product.theme_bucket) score += 6;
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

function buildStepTrackerMarkup(product, mode = false) {
  const currentIndex = stageIndex(product.current_stage);
  const isMicro = mode === "micro" || mode === "micro-line";
  const isCompact = mode === true || mode === "compact";
  let variantClass = "";
  if (mode === "micro-line") variantClass = "is-micro-line";
  else if (isMicro) variantClass = "is-micro-line";
  else if (isCompact) variantClass = "is-compact";
  const donePct = currentIndex <= 0 ? 0 : (Math.min(currentIndex, STAGE_FLOW.length - 1) / (STAGE_FLOW.length - 1)) * 100;
  const style = variantClass === "is-micro-line" ? ` style="--done-pct:${donePct.toFixed(1)}%"` : "";
  return `
    <div class="step-track ${variantClass}"${style}>
      ${STAGE_FLOW.map((stage, index) => {
        const status = index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : "is-upcoming";
        const date = getStageEventDate(product, stage);
        return `
          <div class="step-node ${status}">
            <div class="step-dot">${index < currentIndex ? "✓" : index + 1}</div>
            <div class="step-copy">
              <div class="step-name">${escapeHtml(shortStageLabel(stage))}</div>
              ${isCompact || isMicro ? "" : `<div class="step-date">${fmtDate(date)}</div>`}
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
      boom: { returnBand: "4%~7%", drawdown: "-3%~-5%", winRate: "46%", note: "养老 FOF 更强调长期稳健增值和回撤约束，进攻性通常最低。" },
      range: { returnBand: "3%~5%", drawdown: "-2%~-4%", winRate: "61%", note: "震荡期更看重资产配置与下行控制，体验通常比普通稳健型更平滑。" },
      stress: { returnBand: "0%~2%", drawdown: "-2%~-4%", winRate: "74%", note: "风险偏好走弱时通常以防守为主，但也意味着修复速度偏慢。" },
    },
    稳健: {
      boom: { returnBand: "5%~8%", drawdown: "-4%~-6%", winRate: "42%", note: "权益弹性较弱，偏重防守与波动控制。" },
      range: { returnBand: "4%~6%", drawdown: "-3%~-5%", winRate: "59%", note: "震荡期通常更稳，适合承接绝对收益诉求。" },
      stress: { returnBand: "1%~3%", drawdown: "-2%~-4%", winRate: "69%", note: "回撤弹性相对有限，但进攻能力也会受约束。" },
    },
    平衡: {
      boom: { returnBand: "7%~12%", drawdown: "-6%~-9%", winRate: "58%", note: "权益与固收并行，顺风期具备跟涨能力。" },
      range: { returnBand: "4%~8%", drawdown: "-4%~-7%", winRate: "53%", note: "多资产与多元配置更依赖选基和仓位切换。" },
      stress: { returnBand: "-2%~3%", drawdown: "-6%~-10%", winRate: "38%", note: "若底层风险资产占比不低，回撤仍需关注。" },
    },
    积极: {
      boom: { returnBand: "10%~16%", drawdown: "-8%~-12%", winRate: "68%", note: "更偏权益弹性，顺风期抢份额能力更强。" },
      range: { returnBand: "3%~8%", drawdown: "-7%~-11%", winRate: "41%", note: "震荡期容易回吐，考验择时与底层风格。" },
      stress: { returnBand: "-5%~1%", drawdown: "-10%~-15%", winRate: "24%", note: "风险偏好回落时承压更明显，需要更强风控。" },
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
  const benchmarkProduct =
    product.fund_company === "华夏" ? (getPeerProducts(product, 1)[0] || null) : (getHuaxiaBenchmarks(product, 1)[0] || null);
  const benchmarkScores = benchmarkProduct ? getRadarScores(benchmarkProduct) : null;
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
  const benchmarkPolygon = benchmarkScores
    ? benchmarkScores.map((item, index) => pointAt(item.value, index).join(",")).join(" ")
    : "";
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
  if (benchmarkPolygon) {
    svg += `<polygon points="${benchmarkPolygon}" fill="rgba(34,72,112,0.08)" stroke="#224870" stroke-width="2" stroke-dasharray="6 5" />`;
  }
  svg += `<polygon points="${polygon}" fill="rgba(193,18,31,0.18)" stroke="#c1121f" stroke-width="2.4" />`;
  if (benchmarkScores) {
    benchmarkScores.forEach((item, index) => {
      const [x, y] = pointAt(item.value, index);
      svg += `<circle cx="${x}" cy="${y}" r="3.6" fill="#224870" stroke="#fffdfa" stroke-width="1.5" />`;
    });
  }
  scores.forEach((item, index) => {
    const [x, y] = pointAt(item.value, index);
    svg += `<circle cx="${x}" cy="${y}" r="4.5" fill="#c1121f" stroke="#fffdfa" stroke-width="2" />`;
  });
  if (benchmarkProduct) {
    svg += `<rect x="24" y="${size - 34}" width="12" height="12" rx="3" fill="rgba(193,18,31,0.18)" stroke="#c1121f" stroke-width="1.6" />`;
    svg += `<text x="42" y="${size - 24}" font-size="11" fill="#4b5563">当前产品</text>`;
    svg += `<rect x="118" y="${size - 34}" width="12" height="12" rx="3" fill="rgba(34,72,112,0.08)" stroke="#224870" stroke-width="1.6" />`;
    svg += `<text x="136" y="${size - 24}" font-size="11" fill="#4b5563">${escapeHtml(product.fund_company === "华夏" ? "外部竞品" : "华夏对标")}</text>`;
  }
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
  const heading = TAB_HEADINGS[state.activeTab];
  const h = document.getElementById("topbar-heading");
  const s = document.getElementById("topbar-subheading");
  if (heading && h) h.textContent = heading.title;
  if (heading && s) s.textContent = heading.sub || "";
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
  const stockProfile = getStockScaleProfile();
  const huaxiaStock = getStockCompanyStats("华夏");
  const density = summary.strategy_density || {};
  const future = summary.future_timeline || {};
  document.getElementById("hero-subtitle").textContent =
    `当前展示 ${prefix} FOF 竞品情报，统计区间为 ${range.start} 至 ${range.end}，重点盯紧新申报与华夏对标差距。`;
  document.getElementById("hero-pills").innerHTML = [
    `重点公司 ${state.data.config.key_companies.length} 家`,
    `跟踪产品 ${state.data.products.length} 只`,
    `${prefix}新申报 ${topSignals} 只`,
    `华夏在途 ${huaxiaPipeline} 只`,
    density.alert_count != null ? `密集赛道提醒 ${density.alert_count} 个` : null,
    future.events ? `未来30天预测 ${future.events.length} 个` : null,
    stockProfile ? `存量FOF ${stockProfile.product_count} 只` : null,
    stockProfile ? `存量规模 ${fmtNum(stockProfile.total_latest_scale)} 亿元` : null,
    huaxiaStock ? `华夏存量 #${huaxiaStock.rank} · ${fmtNum(huaxiaStock.latest_scale_sum)} 亿元` : null,
  ]
    .filter(Boolean)
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join("");
}

function renderKPIs() {
  const titlePrefix = state.topPeriod === "week" ? "近一周" : "今年以来";
  const range = getPeriodRange(state.topPeriod);
  const sliced = getSlicedProducts();
  const inDateRange = (product, dateField) => inRange(product[dateField], range.start, range.end);
  const kpi = sliceIsActive()
    ? {
        declare_count: sliced.filter((p) => inDateRange(p, "declare_date")).length,
        accept_count: sliced.filter((p) => inDateRange(p, "accept_date")).length,
        approval_count: sliced.filter((p) => inDateRange(p, "approval_date")).length,
        establish_count: sliced.filter((p) => inDateRange(p, "establish_date")).length,
        raise_scale: sliced
          .filter((p) => inDateRange(p, "establish_date"))
          .reduce((sum, p) => sum + (Number(p.raise_scale) || 0), 0),
      }
    : state.data.summary.market_kpis[state.topPeriod] || {};
  const inReviewCount = sliced.filter((item) => isInReviewProduct(item)).length;
  const gapProducts = sliced.filter(
    (item) => item.fund_company !== "华夏" && getHuaxiaBenchmarkInsight(item).tone === "alert"
  );
  const gapCount = gapProducts.length;
  const huaxiaYtd = (state.data.summary.company_rankings.all.ytd || []).find((item) => item.fund_company === "华夏") || {};
  const weekly = (state.data.summary.trends && state.data.summary.trends.weekly_establish) || [];
  const scaleDelta = computeWoWDelta(weekly.map((r) => Number(r.raise_scale) || 0));
  const countDelta = computeWoWDelta(weekly.map((r) => Number(r.establish_count) || 0));
  const sparkline = buildSparklineSvg(weekly.map((r) => Number(r.raise_scale) || 0));
  const slicePrefix = sliceIsActive() ? "切片 · " : "";
  const items = [
    { key: "declare", icon: "申", label: `${slicePrefix}${titlePrefix}新申报`, value: kpi.declare_count ?? 0, note: "按材料接收日 · 点击下钻" },
    { key: "accept", icon: "受", label: `${slicePrefix}${titlePrefix}新受理`, value: kpi.accept_count ?? 0, note: "按材料受理日 · 点击下钻" },
    { key: "approval", icon: "批", label: `${slicePrefix}${titlePrefix}新获批`, value: kpi.approval_count ?? 0, note: "按获批日期 · 点击下钻" },
    { key: "establish", icon: "成", label: `${slicePrefix}${titlePrefix}新成立`, value: kpi.establish_count ?? 0, note: "按成立日 · 点击下钻", delta: sliceIsActive() ? null : countDelta },
    {
      key: "raise",
      icon: "募",
      label: `${slicePrefix}${titlePrefix}募集规模`,
      value: fmtNum(kpi.raise_scale),
      note: sliceIsActive() ? "单位：亿元 · 点击查看明细" : "亿元 · 近8周走势 · 点击下钻",
      delta: sliceIsActive() ? null : scaleDelta,
      spark: sliceIsActive() ? "" : sparkline,
    },
    {
      key: "gap",
      icon: "盯",
      label: `${slicePrefix}华夏对标空白`,
      value: gapCount,
      note: `在审 ${inReviewCount} 只 · 华夏已成立 ${huaxiaYtd.establish_count ?? 0} 只 · 点击下钻`,
      alert: gapCount > 0,
    },
  ];
  document.getElementById("kpi-grid").innerHTML = items
    .map((item) => {
      const deltaMarkup = item.delta
        ? `<span class="kpi-delta ${item.delta.dir === "up" ? "is-up" : item.delta.dir === "down" ? "is-down" : ""}">
              <span class="arrow">${item.delta.dir === "up" ? "▲" : item.delta.dir === "down" ? "▼" : "·"}</span>
              <span>${escapeHtml(item.delta.label)}</span>
            </span>`
        : "";
      const isActive = state.kpiDrill === item.key;
      return `
        <article class="kpi-card${item.alert ? " is-alert" : ""}${isActive ? " is-active" : ""}" data-kpi="${escapeHtml(item.key)}" tabindex="0" role="button" aria-pressed="${isActive ? "true" : "false"}">
          ${item.alert ? `<span class="kpi-pulse" aria-hidden="true"></span>` : ""}
          <div class="kpi-topline">
            <div class="kpi-icon">${escapeHtml(item.icon)}</div>
            <div class="kpi-label">${escapeHtml(item.label)}</div>
          </div>
          <div class="kpi-value-wrap">
            <div class="kpi-value">${escapeHtml(item.value)}</div>
            ${deltaMarkup}
          </div>
          ${item.spark ? `<div class="kpi-sparkline-wrap">${item.spark}</div>` : ""}
          <div class="kpi-note">${escapeHtml(item.note)}</div>
        </article>
      `;
    })
    .join("");
  document.querySelectorAll("#kpi-grid .kpi-card").forEach((card) => {
    const handle = () => {
      const key = card.dataset.kpi;
      state.kpiDrill = state.kpiDrill === key ? null : key;
      renderKPIs();
      renderKpiDrill();
    };
    card.addEventListener("click", handle);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handle();
      }
    });
  });
}

function renderKpiDrill() {
  const container = document.getElementById("kpi-drill");
  if (!container) return;
  const key = state.kpiDrill;
  if (!key) {
    container.innerHTML = "";
    return;
  }
  const range = getPeriodRange(state.topPeriod);
  const sliced = getSlicedProducts();
  const periodLabel = state.topPeriod === "week" ? "近一周" : "今年以来";
  const slicePrefix = sliceIsActive() ? `${GLOBAL_SLICES.find((s) => s.key === state.globalSlice)?.label || ""} 切片 · ` : "";
  let title = "";
  let rows = [];
  let sortFn = null;
  let extraRender = null;
  if (key === "declare") {
    title = `${slicePrefix}${periodLabel}新申报`;
    rows = sliced.filter((p) => inRange(p.declare_date, range.start, range.end));
    sortFn = (a, b) => String(b.declare_date || "").localeCompare(String(a.declare_date || ""));
  } else if (key === "accept") {
    title = `${slicePrefix}${periodLabel}新受理`;
    rows = sliced.filter((p) => inRange(p.accept_date, range.start, range.end));
    sortFn = (a, b) => String(b.accept_date || "").localeCompare(String(a.accept_date || ""));
  } else if (key === "approval") {
    title = `${slicePrefix}${periodLabel}新获批`;
    rows = sliced.filter((p) => inRange(p.approval_date, range.start, range.end));
    sortFn = (a, b) => String(b.approval_date || "").localeCompare(String(a.approval_date || ""));
  } else if (key === "establish") {
    title = `${slicePrefix}${periodLabel}新成立`;
    rows = sliced.filter((p) => inRange(p.establish_date, range.start, range.end));
    sortFn = (a, b) => String(b.establish_date || "").localeCompare(String(a.establish_date || ""));
  } else if (key === "raise") {
    title = `${slicePrefix}${periodLabel}募集规模 · 按规模降序`;
    rows = sliced.filter((p) => inRange(p.establish_date, range.start, range.end));
    sortFn = (a, b) => (Number(b.raise_scale) || 0) - (Number(a.raise_scale) || 0);
    extraRender = (r) => `<span class="tag-chip">募 ${fmtNum(r.raise_scale)} 亿</span>`;
  } else if (key === "gap") {
    title = `${slicePrefix}华夏对标空白 · 竞品无华夏同类储备`;
    rows = sliced.filter((p) => p.fund_company !== "华夏" && getHuaxiaBenchmarkInsight(p).tone === "alert");
    sortFn = (a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || ""));
  }
  if (sortFn) rows = rows.slice().sort(sortFn);
  const display = rows.slice(0, 24);
  container.innerHTML = `
    <section class="kpi-drill-panel">
      <div class="kpi-drill-head">
        <div>
          <div class="kpi-drill-kicker">KPI 下钻</div>
          <div class="kpi-drill-title">${escapeHtml(title)}</div>
          <div class="kpi-drill-sub">${rows.length} 只${rows.length > display.length ? ` · 展示前 ${display.length} 只` : ""}</div>
        </div>
        <button type="button" class="kpi-drill-close" aria-label="关闭下钻">收起 ×</button>
      </div>
      ${
        display.length
          ? `<div class="kpi-drill-list">${display
              .map(
                (r) => `
                  <div class="kpi-drill-item clickable-row" data-product-id="${escapeHtml(r.product_id)}">
                    <div class="kpi-drill-name">${escapeHtml(r.fund_name)}</div>
                    <div class="kpi-drill-tags">
                      <span class="tag-chip is-company">${escapeHtml(r.fund_company)}</span>
                      <span class="tag-chip is-stage">${escapeHtml(r.current_stage)}</span>
                      <span class="tag-chip">${escapeHtml(r.fof_type || "—")}</span>
                      <span class="tag-chip is-date">${fmtDate(r.latest_event_date)}</span>
                      ${extraRender ? extraRender(r) : ""}
                    </div>
                  </div>
                `
              )
              .join("")}</div>`
          : `<div class="empty-box">当前条件下暂无命中产品。</div>`
      }
    </section>
  `;
  container.querySelector(".kpi-drill-close")?.addEventListener("click", () => {
    state.kpiDrill = null;
    renderKPIs();
    renderKpiDrill();
  });
  bindClickableRows(container);
}

function computeWoWDelta(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const curr = values[values.length - 1];
  const prev = values[values.length - 2];
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  const diff = curr - prev;
  if (prev === 0 && curr === 0) return { dir: "flat", label: "持平" };
  if (prev === 0) return { dir: curr > 0 ? "up" : "down", label: "新起步" };
  const pct = (diff / prev) * 100;
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const magnitude = Math.abs(pct);
  const label = magnitude >= 100 ? `${magnitude.toFixed(0)}%` : `${magnitude.toFixed(1)}%`;
  return { dir, label };
}

function buildSparklineSvg(values) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length < 2) return "";
  const w = 140;
  const h = 26;
  const pad = 2;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = (w - pad * 2) / (nums.length - 1);
  const toY = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const points = nums.map((v, i) => [pad + i * step, toY(v)]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const fill = `M ${points[0][0].toFixed(1)} ${h - pad} L ${points.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ")} L ${points[points.length - 1][0].toFixed(1)} ${h - pad} Z`;
  const last = points[points.length - 1];
  return `<svg class="kpi-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="近8周走势">
    <line class="spark-base" x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" />
    <path class="spark-fill" d="${fill}" />
    <path class="spark-line" d="${path}" />
    <circle class="spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.4" />
  </svg>`;
}

function renderWatchControls() {
  const container = document.getElementById("watch-company-list");
  if (!container) return;
  const companies = state.data.config.key_companies || [];
  container.innerHTML = `
    <div class="watch-chip-list">
      ${companies
        .map(
          (company) => `
            <button class="watch-chip ${isWatchedCompany(company) ? "is-active" : ""}" data-watch-company="${escapeHtml(company)}" type="button">
              ${escapeHtml(company)}
            </button>
          `
        )
        .join("")}
    </div>
    <div class="watch-summary">${
      state.watchCompanies.length
        ? `当前已订阅 ${state.watchCompanies.join("、")}。后续 snapshot 更新后，这里会优先抬出这些公司的新节点。`
        : "点击公司即可加入订阅名单；订阅状态保存在浏览器本地。"
    }</div>
  `;
  container.querySelectorAll("[data-watch-company]").forEach((button) => {
    button.addEventListener("click", () => {
      const company = button.dataset.watchCompany;
      state.watchCompanies = isWatchedCompany(company)
        ? state.watchCompanies.filter((item) => item !== company)
        : [...state.watchCompanies, company];
      persistWatchCompanies();
      renderWatchControls();
      renderWatchFeed();
      renderSignalRadar();
      renderKeyProducts();
    });
  });
}

function renderWatchFeed() {
  const container = document.getElementById("watch-feed");
  if (!container) return;
  if (!state.watchCompanies.length) {
    container.innerHTML = `<div class="empty-box">尚未订阅公司，先在上方点选关注对象。</div>`;
    return;
  }
  const rows = state.data.products
    .filter((item) => state.watchCompanies.includes(item.fund_company))
    .sort((a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || "")))
    .slice(0, 6);
  container.innerHTML = rows.length
    ? `<div class="watch-feed-list">${rows
        .map((row) => {
          const critical = ["已获批", "发行中"].includes(row.current_stage) || getThreatBadge(row).tone === "alert";
          return `
            <div class="watch-feed-item clickable-row ${critical ? "is-critical" : ""}" data-product-id="${escapeHtml(row.product_id)}">
              <div class="watch-feed-top">
                <div class="watch-feed-name">${escapeHtml(row.fund_name)}</div>
                <span class="pill">${escapeHtml(row.current_stage)}</span>
              </div>
              <div class="watch-feed-meta">${escapeHtml(row.fund_company)} · 最新日期 ${fmtDate(row.latest_event_date)} · ${escapeHtml(
                getHuaxiaBenchmarkInsight(row).headline
              )}</div>
            </div>
          `;
        })
        .join("")}</div>`
    : `<div class="empty-box">当前订阅公司尚无可展示动作。</div>`;
  bindClickableRows(container);
}

function buildForecastAxisMarkup(events) {
  const valid = (events || []).filter((e) => e && e.predicted_date);
  if (!valid.length) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const end = start + 30 * 86400000;
  const dayMs = 86400000;
  const toPct = (d) => {
    const t = parseDate(d)?.getTime();
    if (!t) return null;
    const clamped = Math.max(start, Math.min(end, t));
    return ((clamped - start) / (end - start)) * 100;
  };
  const ticks = [];
  for (let i = 0; i <= 30; i += 5) {
    const dt = new Date(start + i * dayMs);
    const isMajor = i % 10 === 0;
    const pct = (i / 30) * 100;
    ticks.push({
      pct,
      major: isMajor,
      label: isMajor ? `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}` : "",
    });
  }
  const tickMarkup = ticks
    .map(
      (t) => `
        <span class="forecast-axis-tick${t.major ? " is-major" : ""}" style="left:${t.pct.toFixed(2)}%"></span>
        ${t.label ? `<span class="forecast-axis-tick-label" style="left:${t.pct.toFixed(2)}%">${escapeHtml(t.label)}</span>` : ""}
      `
    )
    .join("");
  const lanes = [
    { key: "华夏", label: "华夏 FOF", filter: (e) => e.fund_company === "华夏", huaxia: true },
    { key: "养老FOF", label: "养老 FOF", filter: (e) => (findProduct(e.product_id)?.fof_type || e.fof_type) === "养老FOF" && e.fund_company !== "华夏" },
    { key: "ETF-FOF", label: "ETF-FOF", filter: (e) => (findProduct(e.product_id)?.fof_type || e.fof_type) === "ETF-FOF" && e.fund_company !== "华夏" },
    { key: "普通FOF", label: "普通 FOF", filter: (e) => (findProduct(e.product_id)?.fof_type || e.fof_type) === "普通FOF" && e.fund_company !== "华夏" },
  ];
  const laneMarkup = lanes
    .map((lane) => {
      const laneEvents = valid.filter(lane.filter);
      const nodes = laneEvents
        .map((e) => {
          const pct = toPct(e.predicted_date);
          if (pct == null) return "";
          const conf = e.confidence === "high" ? "conf-high" : e.confidence === "medium" ? "conf-medium" : "conf-low";
          const watched = isWatchedCompany(e.fund_company) ? " is-watched" : "";
          const huaxiaClass = lane.huaxia ? " is-huaxia" : "";
          const tooltip = `${e.fund_company} · ${e.fund_name}\n预计 ${fmtDate(e.predicted_date)} · ${e.predicted_stage_label}`;
          return `<button type="button" class="gantt-node ${conf}${watched}${huaxiaClass} clickable-row" data-product-id="${escapeHtml(
            e.product_id
          )}" style="left:${pct.toFixed(2)}%" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></button>`;
        })
        .join("");
      return `
        <div class="gantt-lane ${lane.huaxia ? "is-huaxia" : ""}">
          <div class="gantt-lane-label">
            <span class="lane-name">${escapeHtml(lane.label)}</span>
            <span class="lane-count">${laneEvents.length}</span>
          </div>
          <div class="gantt-lane-track">
            <div class="gantt-lane-rail"></div>
            ${nodes || '<span class="gantt-empty">—</span>'}
          </div>
        </div>
      `;
    })
    .join("");
  return `
    <div class="forecast-gantt">
      <div class="forecast-gantt-head">
        <div class="forecast-gantt-title">
          <span class="kicker">Future 30d</span>
          <strong>按类型泳道 · 华夏置顶</strong>
        </div>
        <div class="forecast-gantt-legend">
          <span><span class="dot conf-high"></span>高置信</span>
          <span><span class="dot conf-medium"></span>中置信</span>
          <span><span class="dot conf-low"></span>低置信</span>
          <span><span class="dot is-huaxia-dot"></span>华夏</span>
        </div>
      </div>
      <div class="gantt-axis-row">
        <div class="gantt-axis-spacer"></div>
        <div class="gantt-axis-ticks">${tickMarkup}</div>
      </div>
      ${laneMarkup}
      <div class="forecast-gantt-footer">共 ${valid.length} 个预测节点 · 仅展示未来 30 天</div>
    </div>
  `;
}

function renderForecastTimeline() {
  const container = document.getElementById("forecast-timeline");
  if (!container) return;
  const future = state.data.summary.future_timeline || {};
  const allowedIds = sliceIsActive() ? new Set(getSlicedProducts().map((p) => p.product_id)) : null;
  const events = (future.events || []).filter((e) => (allowedIds ? allowedIds.has(e.product_id) : true));
  const overdue = (future.overdue || []).filter((e) => (allowedIds ? allowedIds.has(e.product_id) : true));
  const approvalWindow = getApprovalWindowInsight();
  if (!events.length && !overdue.length) {
    container.innerHTML = `<div class="empty-box">当前样本不足，暂未形成未来 30 天的节点预测。</div>`;
    return;
  }
  const axis = buildForecastAxisMarkup(events);
  container.innerHTML = `
    <div class="forecast-list">
      ${axis}
      ${
        approvalWindow
          ? `<div class="watch-summary">最近获批节奏平均约 ${fmtNum(approvalWindow.avgGap)} 天一批，最近一次为 ${fmtDate(
              approvalWindow.lastDate
            )}，下一批窗口可重点关注 ${fmtDate(approvalWindow.predictedDate)} 前后。${
              approvalWindow.dueProducts.length ? `当前有 ${approvalWindow.dueProducts.length} 只产品的预计获批时间落在该窗口附近。` : ""
            }</div>`
          : ""
      }
      ${events
        .map((item) => {
          const label = String(item.predicted_date || "—").slice(5);
          const watched = isWatchedCompany(item.fund_company);
          const confLabel = item.confidence === "high" ? "高置信" : item.confidence === "medium" ? "中置信" : "低置信";
          const confClass = item.confidence === "high" ? "is-high" : item.confidence === "medium" ? "is-medium" : "is-low";
          return `
            <div class="forecast-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
              <div class="forecast-date">
                <strong>${escapeHtml(label || "—")}</strong>
                <span>${escapeHtml(item.predicted_stage_label)}</span>
              </div>
              <div class="forecast-copy">
                <strong>${escapeHtml(item.fund_name)}</strong>
                <div class="forecast-meta">${escapeHtml(item.fund_company)} · 当前 ${escapeHtml(item.current_stage)} · ${escapeHtml(
                  item.strategy_segment_label
                )}</div>
                <div class="forecast-badges">
                  <span class="confidence-chip ${confClass}">${confLabel}</span>
                  <span class="info-chip">${escapeHtml(item.benchmark_source || "样本不足")}</span>
                  <span class="info-chip">估算 ${escapeHtml(item.benchmark_days)} 天</span>
                  ${watched ? `<span class="severity-chip watch">已订阅</span>` : ""}
                </div>
              </div>
            </div>
          `;
        })
        .join("")}
      ${
        overdue.length
          ? `<div class="watch-summary">另有 ${escapeHtml(
              overdue.length
            )} 只产品已超过常规节奏但尚未进入下一阶段，优先在“审批效能堵点诊断”中查看。</div>`
          : ""
      }
    </div>
  `;
  bindClickableRows(container);
}

function renderDensityAlerts() {
  const container = document.getElementById("density-alerts");
  if (!container) return;
  const dashboard = state.data.summary.strategy_density || {};
  const alerts = dashboard.alerts || [];
  if (!alerts.length) {
    container.innerHTML = `<div class="empty-box">${escapeHtml(dashboard.headline || "当前没有触发密集赛道提醒。")}</div>`;
    return;
  }
  container.innerHTML = `
    <div class="density-list">
      <div class="watch-summary">${escapeHtml(dashboard.headline || "")}</div>
      ${alerts
        .map(
          (alert) => `
            <div class="density-item">
              <div class="density-copy">
                <strong>${escapeHtml(alert.suggestion_title)}</strong>
                <div class="density-badges">
                  <span class="severity-chip ${escapeHtml(alert.severity)}">${escapeHtml(alert.severity_label)}</span>
                  <span class="info-chip">头部公司 ${escapeHtml(alert.density_count)} 家</span>
                  <span class="info-chip">同业在途 ${escapeHtml(alert.peer_in_review_count)} 只</span>
                  <span class="info-chip">${escapeHtml(alert.gap_label)}</span>
                </div>
                <div class="density-meta">${escapeHtml(alert.suggestion_brief)}</div>
                ${
                  (alert.top_products || []).length
                    ? `<div class="mini-list" style="margin-top:10px;">${alert.top_products
                        .map(
                          (item) => `
                            <div class="mini-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                              <div class="mini-top">
                                <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                                <span class="pill">${escapeHtml(item.current_stage)}</span>
                              </div>
                              <div class="mini-meta">${escapeHtml(item.fund_company)} · ${fmtDate(item.latest_event_date)}</div>
                            </div>
                          `
                        )
                        .join("")}</div>`
                    : ""
                }
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
  bindClickableRows(container);
}

function renderMacroClock() {
  const container = document.getElementById("macro-clock");
  if (!container) return;
  const macro = state.data.summary.macro_clock || {};
  if (!macro.configured) {
    container.innerHTML = `
      <div class="macro-stack">
        <div class="macro-card">
          <div class="macro-regime">
            <span>当前状态</span>
            <strong>投资时钟阶段待配置</strong>
          </div>
          <p>${escapeHtml(macro.note || "可在配置中指定当前宏观阶段。")}</p>
          <div class="macro-badges">
            ${(macro.available_regimes || []).map((item) => `<span class="info-chip">${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
      </div>
    `;
    return;
  }
  container.innerHTML = `
    <div class="macro-stack">
      <div class="macro-card ${getMacroToneClass(macro.tone)}">
        <div class="macro-regime">
          <span>当前宏观阶段</span>
          <strong>${escapeHtml(macro.current_regime)}</strong>
        </div>
        <p>${escapeHtml(macro.description || "")}</p>
        <div class="macro-badges">
          <span class="info-chip">命中产品 ${escapeHtml(macro.matched_product_count || 0)} 只</span>
          <span class="info-chip">命中赛道提醒 ${escapeHtml(macro.matched_alert_count || 0)} 个</span>
        </div>
        <p>${escapeHtml(macro.action_hint || "")}</p>
      </div>
      ${
        (macro.matched_products || []).length
          ? `<div class="mini-list">${macro.matched_products
              .map(
                (item) => `
                  <div class="mini-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                    <div class="mini-top">
                      <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                      <span class="pill">${escapeHtml(item.current_stage)}</span>
                    </div>
                    <div class="mini-meta">${escapeHtml(item.fund_company)} · ${escapeHtml(item.strategy_segment_label || "")}</div>
                  </div>
                `
              )
              .join("")}</div>`
          : `<div class="empty-box">当前阶段下暂无需要额外高亮的在途产品。</div>`
      }
    </div>
  `;
  bindClickableRows(container);
}

function renderSoftIntelBoard() {
  const container = document.getElementById("soft-intel-board");
  if (!container) return;
  const dashboard = state.data.summary.soft_intel_dashboard || {};
  const updates = dashboard.key_updates || [];
  const missingPriority = dashboard.missing_priority || [];
  const channelBuckets = dashboard.channel_buckets || [];
  const holderBuckets = dashboard.holder_buckets || [];
  if (!dashboard.coverage_count) {
    container.innerHTML = `
      <div class="macro-stack">
        <div class="macro-card">
          <div class="macro-regime">
            <span>当前状态</span>
            <strong>尚未录入发行软信息</strong>
          </div>
          <p>${escapeHtml(dashboard.headline || "当前没有可展示的软信息覆盖。")}</p>
          <div class="macro-badges">
            <span class="info-chip">${escapeHtml(dashboard.source_file || "fof_soft_signal_template.csv")}</span>
            <span class="info-chip">可补渠道 / 持有人 / 底层偏好</span>
          </div>
        </div>
        ${
          missingPriority.length
            ? `<div class="mini-list">${missingPriority
                .map(
                  (item) => `
                    <div class="mini-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                      <div class="mini-top">
                        <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                        <span class="pill">待补软信息</span>
                      </div>
                      <div class="mini-meta">${escapeHtml(item.fund_company)} · ${escapeHtml(item.current_stage)} · 最新日期 ${fmtDate(
                        item.latest_event_date
                      )}</div>
                    </div>
                  `
                )
                .join("")}</div>`
            : ""
        }
      </div>
    `;
    bindClickableRows(container);
    return;
  }
  container.innerHTML = `
    <div class="macro-stack">
      <div class="macro-card">
        <div class="macro-regime">
          <span>覆盖概览</span>
          <strong>${escapeHtml(dashboard.coverage_count)} 只产品已录入软信息</strong>
        </div>
        <p>${escapeHtml(dashboard.headline || "")}</p>
        <div class="macro-badges">
          <span class="info-chip">渠道覆盖 ${escapeHtml(dashboard.channel_cover_count || 0)} 只</span>
          <span class="info-chip">持有人结构 ${escapeHtml(dashboard.holder_cover_count || 0)} 只</span>
          <span class="info-chip">底层偏好 ${escapeHtml(dashboard.preference_cover_count || 0)} 只</span>
          <span class="info-chip">华夏覆盖 ${escapeHtml(dashboard.focus_company_cover_count || 0)} 只</span>
        </div>
      </div>
      ${
        channelBuckets.length || holderBuckets.length
          ? `<div class="density-list">
              ${
                channelBuckets.length
                  ? `<div class="density-item"><div class="density-copy"><strong>渠道热点</strong><div class="density-badges">${channelBuckets
                      .map((item) => `<span class="info-chip">${escapeHtml(item.label)} ${escapeHtml(item.count)}</span>`)
                      .join("")}</div></div></div>`
                  : ""
              }
              ${
                holderBuckets.length
                  ? `<div class="density-item"><div class="density-copy"><strong>持有人结构</strong><div class="density-badges">${holderBuckets
                      .map((item) => `<span class="info-chip">${escapeHtml(item.label)} ${escapeHtml(item.count)}</span>`)
                      .join("")}</div></div></div>`
                  : ""
              }
            </div>`
          : ""
      }
      ${
        updates.length
          ? `<div class="mini-list">${updates
              .map((item) => {
                const soft = getSoftIntelSnapshot(item);
                return `
                  <div class="mini-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                    <div class="mini-top">
                      <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                      <span class="pill">${escapeHtml(soft.intelligenceLevel)}</span>
                    </div>
                    <div class="mini-meta">${escapeHtml(item.fund_company)} · 渠道 ${escapeHtml(soft.launchChannels)} · 持有人 ${escapeHtml(
                      soft.holderView
                    )}${soft.lastUpdate ? ` · 更新 ${fmtDate(soft.lastUpdate)}` : ""}</div>
                  </div>
                `;
              })
              .join("")}</div>`
          : ""
      }
    </div>
  `;
  bindClickableRows(container);
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

function renderGlobalSlice() {
  const container = document.getElementById("global-slice");
  if (!container) return;
  const totalAll = state.data.products.length;
  const items = GLOBAL_SLICES.map((slice) => {
    const originalSlice = state.globalSlice;
    state.globalSlice = slice.key;
    const count = state.data.products.filter(passesGlobalSlice).length;
    state.globalSlice = originalSlice;
    return { ...slice, count };
  });
  container.innerHTML = `
    <div class="slice-list">
      ${items
        .map(
          (item) => `
            <button class="slice-btn ${state.globalSlice === item.key ? "is-active" : ""}" data-slice="${escapeHtml(item.key)}" type="button">
              <span class="slice-label">${escapeHtml(item.label)}</span>
              <span class="slice-count">${item.count}</span>
            </button>
          `
        )
        .join("")}
    </div>
    <div class="slice-hint">${escapeHtml(
      sliceIsActive()
        ? `${items.find((i) => i.key === state.globalSlice).hint} · 当前切片 ${items.find((i) => i.key === state.globalSlice).count}/${totalAll} 只`
        : "所有切片作用于 KPI · 预测轴 · 盯盘焦点 · 重点异动"
    )}</div>
  `;
  container.querySelectorAll(".slice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.slice;
      state.globalSlice = next === state.globalSlice ? "all" : next;
      state.kpiDrill = null;
      renderGlobalSlice();
      renderKPIs();
      renderKpiDrill();
      renderForecastTimeline();
      renderInReviewPool();
      renderKeyProducts();
      renderHero();
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
    { value: "auto", label: "智能优先（推荐）" },
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
  const baseRows = state.data.products.filter(isInReviewProduct).filter((item) => {
    if (state.monitorFilters.company && item.fund_company !== state.monitorFilters.company) return false;
    if (state.monitorFilters.search) {
      const text = `${item.fund_name} ${item.fund_company} ${deriveStrategyTags(item).join(" ")}`.toLowerCase();
      if (!text.includes(state.monitorFilters.search.toLowerCase())) return false;
    }
    return true;
  });
  const resolved = resolveMonitorStageSelection(baseRows);
  const rows = resolved.rows.slice();

  const sorters = {
    threat: (a, b) => {
      const macroDelta = Number(getMacroMatch(b)) - Number(getMacroMatch(a));
      if (macroDelta !== 0) return macroDelta;
      return getSignalPriority(b) - getSignalPriority(a);
    },
    days_desc: (a, b) => (Number(b.days_in_stage) || 0) - (Number(a.days_in_stage) || 0),
    latest_desc: (a, b) => String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || "")),
    company: (a, b) => String(a.fund_company || "").localeCompare(String(b.fund_company || ""), "zh-CN"),
  };
  return {
    rows: rows.sort(sorters[state.monitorFilters.sort] || sorters.threat),
    resolvedStage: resolved,
    baseCount: baseRows.length,
  };
}

function renderSignalSummary() {
  const container = document.getElementById("signal-summary");
  if (!container) return;
  const monitor = filterMonitorProducts();
  const rows = monitor.rows;
  const declareRows = ((state.data.summary.stage_sections[state.topPeriod] || {}).declare || []) || [];
  const gapCount = rows.filter((item) => item.fund_company !== "华夏" && getHuaxiaBenchmarkInsight(item).tone === "alert").length;
  const defendCount = rows.filter((item) => getThreatBadge(item).label === "重点防守").length;
  const huaxiaRows = rows.filter((item) => item.fund_company === "华夏").length;
  const macroRows = rows.filter((item) => getMacroMatch(item)).length;
  container.innerHTML = [
    { label: "当前命中", value: rows.length, note: `当前展示口径：${monitor.resolvedStage.label}` },
    { label: "本期新申报", value: declareRows.length, note: `${state.topPeriod === "week" ? "近一周" : "今年以来"}新进入池子的产品` },
    { label: "华夏空白", value: gapCount, note: "竞品已卡位但华夏暂无同类" },
    { label: "重点防守", value: defendCount, note: "重点公司或直接对标华夏的产品" },
    { label: "宏观命中", value: macroRows, note: "符合当前投资时钟阶段的产品" },
    { label: "华夏在途", value: huaxiaRows, note: `筛选前在审总量 ${monitor.baseCount} 只` },
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
  const monitor = filterMonitorProducts();
  const rows = monitor.rows;
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
        const macroMatch = getMacroMatch(product);
        const dateLabel = product.current_stage === "新申报" ? "接收日" : product.current_stage === "新受理" ? "受理日" : "最新日";
        const keyDate =
          product.current_stage === "新申报"
            ? product.declare_date
            : product.current_stage === "新受理"
              ? product.accept_date
              : product.latest_event_date;
        return `
          <article class="signal-card clickable-row ${macroMatch ? "is-macro" : ""}" data-product-id="${escapeHtml(product.product_id)}">
            <div class="signal-topline">
              <div class="signal-badges">
                <span class="signal-badge ${badge.tone}">${escapeHtml(badge.label)}</span>
                ${macroMatch ? `<span class="signal-badge watch">时钟高亮</span>` : ""}
                ${isWatchedCompany(product.fund_company) ? `<span class="signal-badge focus">已订阅</span>` : ""}
                ${product.is_key_company ? `<span class="signal-badge subtle">重点公司</span>` : ""}
                ${product.batch_role ? `<span class="signal-badge subtle">${escapeHtml(product.batch_role)}</span>` : ""}
              </div>
              <div class="signal-chevron">&gt;</div>
            </div>
            <h3>${escapeHtml(product.fund_name)}</h3>
            <div class="signal-meta">${escapeHtml(product.fund_company)} · ${escapeHtml(product.fof_type)} · 风格 ${escapeHtml(profile.riskBucket)}${
              product.theme_bucket ? ` · ${escapeHtml(product.theme_bucket)}` : ""
            }</div>
            <div class="signal-tags">
              ${profile.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
            ${buildStepTrackerMarkup(product, true)}
            <div class="signal-stats">
              <div><span>${escapeHtml(dateLabel)}</span><strong>${fmtDate(keyDate)}</strong></div>
              <div><span>停留天数</span><strong>${escapeHtml(product.days_in_stage ?? "—")} 天</strong></div>
              <div><span>托管人</span><strong>${escapeHtml(product.custodian || "待披露")}</strong></div>
              <div><span>同批次</span><strong>${escapeHtml(product.batch_peer_count != null ? `${product.batch_peer_count} 只` : "—")}</strong></div>
            </div>
            <div class="signal-insight ${insight.tone}">
              <div class="signal-insight-label">${escapeHtml(insight.label)}</div>
              <div class="signal-insight-title">${escapeHtml(insight.headline)}</div>
              <div class="signal-insight-detail">${escapeHtml(
                product.batch_role && product.batch_peer_count
                  ? `${insight.detail} · ${product.batch_week_label || "本周"} ${product.batch_peer_count} 只同类处于同批次，当前为${product.batch_role}`
                  : insight.detail
              )}</div>
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
  const huaxiaStockRows = getStockMatrixProducts((item) => item.fund_company === "华夏");
  const peerStockRows = getStockMatrixProducts((item) => item.fund_company !== "华夏");
  const declareRows = ((state.data.summary.stage_sections[state.topPeriod] || {}).declare || []).filter((item) => item.fund_company !== "华夏");
  const establishRows = ((state.data.summary.stage_sections[state.topPeriod] || {}).establish || []).filter((item) => item.fund_company !== "华夏");
  const huaxiaMap = groupByMatrix(huaxiaStockRows);
  const peerStockMap = groupByMatrix(peerStockRows);
  const declareMap = groupByMatrix(declareRows);
  const establishMap = groupByMatrix(establishRows);
  const totalStockCount = huaxiaStockRows.length + peerStockRows.length;
  const profileDate = getStockScaleProfile()?.scale_as_of_date;

  return `
    <div class="battlefield-summary">
      <div class="battlefield-headline"><strong>产品矩阵雷达</strong> 把“持有期 × 风险收益特征”压成一张空白网格，直接看竞品卡位和华夏缺口。</div>
      <div class="battlefield-caption">底图纳入 ${fmtDate(profileDate)} 存量 FOF ${escapeHtml(totalStockCount)} 只；米色代表华夏存量，灰绿色代表同业存量，红色代表${
        state.topPeriod === "week" ? "近一周" : "今年以来"
      }新申报，蓝色代表新成立。</div>
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
                const peerStockCount = (peerStockMap[key] || []).length;
                const declareCount = (declareMap[key] || []).length;
                const establishCount = (establishMap[key] || []).length;
                const hotCompanies = (declareMap[key] || []).slice(0, 2).map((item) => item.fund_company).join("、");
                const stockCompanies = [...new Set((peerStockMap[key] || []).slice(0, 3).map((item) => item.fund_company).filter(Boolean))].join("、");
                const classes = [
                  "matrix-cell",
                  huaxiaCount === 0 && (peerStockCount > 0 || declareCount > 0 || establishCount > 0) ? "is-gap" : "",
                  peerStockCount > 0 || declareCount > 0 || establishCount > 0 ? "is-hot" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return `
                  <div class="${classes}">
                    <div class="matrix-badges">
                      <span class="matrix-dot huaxia">华夏存量 ${huaxiaCount}</span>
                      <span class="matrix-dot stock">同业存量 ${peerStockCount}</span>
                      <span class="matrix-dot declare">新申报 ${declareCount}</span>
                      <span class="matrix-dot establish">新成立 ${establishCount}</span>
                    </div>
                    <div class="matrix-note">${
                      huaxiaCount === 0 && (peerStockCount > 0 || declareCount > 0 || establishCount > 0)
                        ? `华夏缺位，${escapeHtml(stockCompanies || hotCompanies || "同业")}已在该格子形成存量或新增布局`
                        : huaxiaCount > 0 && (declareCount > 0 || establishCount > 0)
                          ? `华夏已有 ${escapeHtml(huaxiaCount)} 只存量，同业近期仍在继续加密 ${escapeHtml(hotCompanies || "该格子")}`
                          : huaxiaCount > 0 && peerStockCount > 0
                            ? `华夏已有存量布局，同业也已有 ${escapeHtml(peerStockCount)} 只存量产品卡位`
                            : peerStockCount > 0
                              ? `该格子以存量竞争为主，${escapeHtml(stockCompanies || "同业")}已有布局`
                              : declareCount > 0 || establishCount > 0
                                ? `近期新增动作集中在 ${escapeHtml(hotCompanies || "该格子")}`
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
  const rows = state.data.products
    .filter(isInReviewProduct)
    .filter(passesGlobalSlice)
    .sort((a, b) => getSignalPriority(b) - getSignalPriority(a))
    .slice(0, 8);
  const container = document.getElementById("in-review-pool");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-box">当前没有在审产品。</div>`;
    return;
  }
  container.innerHTML = `<div class="mini-list">${rows
    .map(
      (row) => `
      <div class="mini-item clickable-row" data-product-id="${escapeHtml(row.product_id)}" tabindex="0">
        <div class="mini-top">
          <div class="mini-name">${escapeHtml(row.fund_name)}</div>
          <span class="pill">${escapeHtml(isWatchedCompany(row.fund_company) ? `${getThreatBadge(row).label} · 已订阅` : getThreatBadge(row).label)}</span>
        </div>
        <div class="mini-meta">${escapeHtml(row.fund_company)} · ${escapeHtml(row.current_stage)} · 停留 ${escapeHtml(row.days_in_stage)}d</div>
        <div class="mini-step-wrap">${buildStepTrackerMarkup(row, "micro")}</div>
        <div class="mini-step-detail">${buildStepDetailRows(row)}</div>
      </div>
    `
    )
    .join("")}</div>`;
  bindClickableRows(container);
}

function buildStepDetailRows(product) {
  const currentIndex = stageIndex(product.current_stage);
  return STAGE_FLOW.map((stage, index) => {
    const status = index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : "";
    const dateLabel = fmtDate(getStageEventDate(product, stage));
    const hint =
      index < currentIndex ? "已完成" : index === currentIndex ? `停留 ${product.days_in_stage ?? "—"}d` : "待推进";
    return `
      <div class="mini-step-row ${status}">
        <strong>${escapeHtml(shortStageLabel(stage))}</strong>
        <span>${escapeHtml(dateLabel === "—" ? hint : `${dateLabel} · ${hint}`)}</span>
      </div>
    `;
  }).join("");
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

function getCompetitorSeverity(row) {
  if (row.fund_company === "华夏") return { tier: 0, rank: "normal", label: "华夏动作" };
  const insight = getHuaxiaBenchmarkInsight(row);
  if (insight.tone === "alert") return { tier: 3, rank: "critical", label: "华夏空白" };
  if (insight.product) {
    const gap = stageIndex(row.current_stage) - stageIndex(insight.product.current_stage);
    if (gap >= 2) return { tier: 3, rank: "critical", label: `竞品领先 ${gap} 步` };
    if (gap === 1) return { tier: 2, rank: "warning", label: "竞品领先 1 步" };
    if (gap === 0) return { tier: 1, rank: "muted", label: "同步推进" };
    if (gap < 0) return { tier: 0, rank: "normal", label: `华夏领先 ${-gap} 步` };
  }
  return { tier: 1, rank: "normal", label: insight.label || "跟踪中" };
}

function renderKeyProducts() {
  const container = document.getElementById("key-products");
  if (!container) return;
  const sliceActive = sliceIsActive();
  const competitorPool = (sliceActive ? getSlicedProducts() : getProductsForTopPeriod())
    .filter((item) => item.fund_company !== "华夏");
  const competitors = competitorPool
    .sort((a, b) => {
      const sa = getCompetitorSeverity(a).tier;
      const sb = getCompetitorSeverity(b).tier;
      if (sa !== sb) return sb - sa;
      return getSignalPriority(b) - getSignalPriority(a);
    })
    .slice(0, 12);
  const huaxiaAll = state.data.products
    .filter((item) => item.fund_company === "华夏")
    .filter((item) => (sliceActive ? passesGlobalSlice(item) : true))
    .sort((a, b) => {
      const aIn = isInReviewProduct(a) ? 1 : 0;
      const bIn = isInReviewProduct(b) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
      return String(b.latest_event_date || "").localeCompare(String(a.latest_event_date || ""));
    });
  const criticalCount = competitorPool.filter((p) => getCompetitorSeverity(p).rank === "critical").length;
  const warnCount = competitorPool.filter((p) => getCompetitorSeverity(p).rank === "warning").length;
  const parts = [];
  parts.push(`
    <div class="key-products-toolbar">
      <div class="severity-summary">
        <span class="sev-dot crit"></span>
        <span>红灯 <strong>${criticalCount}</strong></span>
        <span class="sev-sep">·</span>
        <span class="sev-dot warn"></span>
        <span>黄灯 <strong>${warnCount}</strong></span>
        <span class="sev-sep">·</span>
        <span>总竞品 <strong>${competitorPool.length}</strong></span>
      </div>
      <div class="subtabs view-toggle" id="key-products-view">
        <button class="subtab ${state.keyProductsView === "list" ? "is-active" : ""}" data-view="list" type="button">列表</button>
        <button class="subtab ${state.keyProductsView === "matrix" ? "is-active" : ""}" data-view="matrix" type="button">对标矩阵</button>
      </div>
    </div>
  `);
  if (state.keyProductsView === "matrix") {
    parts.push(buildCoverageMatrixMarkup());
    container.innerHTML = parts.join("");
    bindClickableRows(container);
    container.querySelectorAll("#key-products-view [data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.keyProductsView = btn.dataset.view;
        renderKeyProducts();
      });
    });
    return;
  }
  parts.push(`
    <div class="key-product-group">
      <div class="key-product-group-head">
        <span class="key-product-group-title">竞品异动</span>
        <span class="key-product-group-count">${competitors.length} 只</span>
      </div>
      ${
        competitors.length
          ? `<div class="key-product-list">${competitors.map((row) => buildKeyProductCardMarkup(row)).join("")}</div>`
          : `<div class="empty-box">当期暂无竞品异动。</div>`
      }
    </div>
  `);
  parts.push(`
    <div class="key-product-group is-huaxia">
      <div class="key-product-group-head">
        <span class="key-product-group-title">华夏全量 FOF</span>
        <span class="key-product-group-count">${huaxiaAll.length} 只</span>
      </div>
      ${
        huaxiaAll.length
          ? `<div class="huaxia-compact-list">${huaxiaAll
              .map(
                (row) => `
                  <div class="huaxia-compact-item clickable-row" data-product-id="${escapeHtml(row.product_id)}">
                    <div class="hc-top">
                      <div class="hc-name">${escapeHtml(row.fund_name)}</div>
                      <span class="tag-chip is-stage">${escapeHtml(row.current_stage)}</span>
                    </div>
                    <div class="hc-meta">${escapeHtml(row.fof_type || "—")} · 最新 ${fmtDate(row.latest_event_date)}${
                      row.raise_scale != null ? ` · 募集 ${fmtNum(row.raise_scale)} 亿元` : ""
                    }</div>
                  </div>
                `
              )
              .join("")}</div>`
          : `<div class="empty-box">暂无华夏 FOF 数据。</div>`
      }
    </div>
  `);
  container.innerHTML = parts.join("");
  bindClickableRows(container);
  container.querySelectorAll("#key-products-view [data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.keyProductsView = btn.dataset.view;
      renderKeyProducts();
    });
  });
}

function buildCoverageMatrixMarkup() {
  const pool = state.data.products.filter(passesGlobalSlice);
  const { risk: riskBuckets, holding: holdingBuckets } = getMatrixBuckets();
  const cellData = {};
  riskBuckets.forEach((r) => {
    holdingBuckets.forEach((h) => {
      cellData[`${r}|${h}`] = { huaxia: [], peer: [], key: [] };
    });
  });
  pool.forEach((p) => {
    const profile = getProductProfile(p);
    const r = riskBuckets.includes(profile.riskBucket) ? profile.riskBucket : "平衡";
    const h = holdingBuckets.includes(profile.holdingBucket) ? profile.holdingBucket : "其他持有";
    const entry = cellData[`${r}|${h}`];
    if (p.fund_company === "华夏") entry.huaxia.push(p);
    else {
      entry.peer.push(p);
      if (p.is_key_company) entry.key.push(p);
    }
  });
  let maxPeer = 1;
  Object.values(cellData).forEach((v) => {
    if (v.peer.length > maxPeer) maxPeer = v.peer.length;
  });
  const rowsMarkup = riskBuckets
    .map((r) => {
      const cells = holdingBuckets
        .map((h) => {
          const entry = cellData[`${r}|${h}`];
          const hx = entry.huaxia.length;
          const peer = entry.peer.length;
          const intensity = peer / maxPeer;
          const isBlank = peer > 0 && hx === 0;
          const isDominated = hx > 0 && peer === 0;
          const isBalanced = hx > 0 && peer > 0;
          const stateClass = isBlank ? "is-blank" : isDominated ? "is-lead" : isBalanced ? "is-balanced" : "is-void";
          const hxBubble = hx > 0 ? `<span class="matrix-bubble hx" style="--size:${12 + Math.min(hx, 4) * 4}px">${hx}</span>` : "";
          const peerBubble = peer > 0 ? `<span class="matrix-bubble peer" style="--size:${12 + Math.min(peer, 8) * 3}px">${peer}</span>` : "";
          const sample = entry.peer
            .slice(0, 3)
            .map((p) => `${p.fund_company}·${p.fund_name}`)
            .join("\n");
          const tip = `${r} × ${h}\n华夏 ${hx} 只 · 竞品 ${peer} 只${entry.key.length ? ` · 重点公司 ${entry.key.length} 只` : ""}${sample ? `\n样例：\n${sample}` : ""}`;
          return `
            <div class="matrix-cell ${stateClass}" style="--peer-intensity:${intensity.toFixed(2)}" title="${escapeHtml(tip)}">
              <div class="matrix-cell-bubbles">${hxBubble}${peerBubble}</div>
              <div class="matrix-cell-tag">${isBlank ? "空白" : isDominated ? "独占" : isBalanced ? `H${hx}/P${peer}` : ""}</div>
            </div>
          `;
        })
        .join("");
      return `
        <div class="matrix-row">
          <div class="matrix-row-label">${escapeHtml(r)}</div>
          ${cells}
        </div>
      `;
    })
    .join("");
  const headerMarkup = `
    <div class="matrix-row matrix-header">
      <div class="matrix-row-label"></div>
      ${holdingBuckets.map((h) => `<div class="matrix-col-label">${escapeHtml(h)}</div>`).join("")}
    </div>
  `;
  const blankCells = Object.values(cellData).filter((v) => v.peer.length > 0 && v.huaxia.length === 0).length;
  const leadCells = Object.values(cellData).filter((v) => v.huaxia.length > 0 && v.peer.length === 0).length;
  const balancedCells = Object.values(cellData).filter((v) => v.huaxia.length > 0 && v.peer.length > 0).length;
  return `
    <div class="coverage-matrix">
      <div class="matrix-hint">
        <span><span class="dot hx"></span>红=华夏</span>
        <span><span class="dot peer"></span>灰=竞品</span>
        <span style="margin-left:auto">
          <span class="pill sev-pill-critical">空白 ${blankCells}</span>
          <span class="pill sev-pill-muted">并存 ${balancedCells}</span>
          <span class="pill" style="background:var(--green-soft);color:var(--green);border-color:rgba(4,115,77,0.18)">独占 ${leadCells}</span>
        </span>
      </div>
      <div class="matrix-body">
        ${headerMarkup}
        ${rowsMarkup}
      </div>
      <div class="matrix-axis-hint">
        <span class="axis-y">风险偏好 ↑</span>
        <span class="axis-x">持有期 →</span>
      </div>
    </div>
  `;
}

function buildKeyProductCardMarkup(row) {
  const insight = getHuaxiaBenchmarkInsight(row);
  const watched = isWatchedCompany(row.fund_company);
  const severity = getCompetitorSeverity(row);
  const pillLabel = watched ? `${severity.label} · 已订阅` : severity.label;
  const tags = [
    { cls: "is-company", text: row.fund_company },
    { cls: "is-stage", text: row.current_stage },
    row.batch_role ? { cls: "", text: row.batch_role } : null,
    row.fof_type ? { cls: "", text: row.fof_type } : null,
    row.is_key_company ? { cls: "is-key", text: "重点公司" } : null,
    { cls: "is-date", text: `最新 ${fmtDate(row.latest_event_date)}` },
  ].filter(Boolean);
  const tagMarkup = tags
    .map((t) => `<span class="tag-chip ${t.cls}">${escapeHtml(t.text)}</span>`)
    .join("");
  const dualTrack = row.fund_company === "华夏" ? "" : buildDualTrackMarkup(row, insight);
  return `
    <div class="key-product-item clickable-row sev-${severity.rank}" data-product-id="${escapeHtml(row.product_id)}">
      ${severity.rank === "critical" ? `<span class="sev-flag" aria-hidden="true">●</span>` : ""}
      <div class="item-top">
        <div class="item-name">${escapeHtml(row.fund_name)}</div>
        <span class="pill sev-pill-${severity.rank}">${escapeHtml(pillLabel)}</span>
      </div>
      <div class="item-tags">${tagMarkup}</div>
      ${dualTrack}
    </div>
  `;
}

function buildDualTrackMarkup(competitor, insight) {
  const huaxiaMatch = insight && insight.product ? insight.product : null;
  const compIdx = stageIndex(competitor.current_stage);
  const hxIdx = huaxiaMatch ? stageIndex(huaxiaMatch.current_stage) : -1;
  const compRow = buildDualTrackRow({
    klass: "is-competitor",
    label: "竞品",
    product: competitor,
    currentIdx: compIdx,
    color: "var(--red)",
    halo: "rgba(180, 17, 29, 0.18)",
    metaRight: competitor.current_stage,
  });
  let hxRow;
  if (huaxiaMatch) {
    hxRow = buildDualTrackRow({
      klass: "is-huaxia",
      label: "华夏对标",
      product: huaxiaMatch,
      currentIdx: hxIdx,
      color: "var(--blue)",
      halo: "rgba(30, 64, 175, 0.18)",
      metaRight: huaxiaMatch.current_stage,
    });
  } else {
    hxRow = `
      <div class="dual-track-row is-huaxia">
        <div class="dual-track-label">华夏</div>
        <div class="dual-track-bar" style="--bar-pct:0%;--bar-color:var(--gold);--bar-halo:rgba(163,83,8,0.18)">
          <div class="dual-track-dots">
            ${STAGE_FLOW.map(() => `<span class="dual-track-dot"></span>`).join("")}
          </div>
        </div>
        <div class="dual-track-meta" style="color:var(--gold)">尚无对标</div>
      </div>
    `;
  }
  let verdict;
  if (!huaxiaMatch) {
    verdict = `<strong>身位：</strong><span class="verdict-blank">华夏空白 · 赛道裸奔</span>`;
  } else if (compIdx === hxIdx) {
    verdict = `<strong>身位：</strong>同步推进至 ${escapeHtml(shortStageLabel(competitor.current_stage))}`;
  } else if (compIdx > hxIdx) {
    verdict = `<strong>身位：</strong><span class="verdict-behind">竞品领先 ${compIdx - hxIdx} 步</span> · 需要加速`;
  } else {
    verdict = `<strong>身位：</strong><span class="verdict-lead">华夏领先 ${hxIdx - compIdx} 步</span>`;
  }
  const hxMatchLabel = huaxiaMatch
    ? `对标 ${escapeHtml(huaxiaMatch.fund_name)}`
    : "未在华夏产品线找到对标";
  return `
    <div class="dual-track">
      ${compRow}
      ${hxRow}
      <div class="dual-track-verdict">
        <span>${verdict}</span>
        <span>${escapeHtml(hxMatchLabel)}</span>
      </div>
    </div>
  `;
}

function buildDualTrackRow({ klass, label, product, currentIdx, color, halo, metaRight }) {
  const dots = STAGE_FLOW.map((_, i) => {
    const status = i < currentIdx ? "is-done" : i === currentIdx ? "is-current" : "";
    return `<span class="dual-track-dot ${status}"></span>`;
  }).join("");
  const pct = currentIdx <= 0 ? 0 : (Math.min(currentIdx, STAGE_FLOW.length - 1) / (STAGE_FLOW.length - 1)) * 100;
  return `
    <div class="dual-track-row ${klass}">
      <div class="dual-track-label">${escapeHtml(label)}</div>
      <div class="dual-track-bar" style="--bar-pct:${pct.toFixed(1)}%;--bar-color:${color};--bar-halo:${halo}">
        <div class="dual-track-dots">${dots}</div>
      </div>
      <div class="dual-track-meta">${escapeHtml(metaRight || "—")}</div>
    </div>
  `;
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
      { label: "基金经理", render: (row) => escapeHtml(row.manager || "—") },
      { label: "FOF类型", key: "fof_type" },
      { label: "当前状态", key: "current_stage" },
      { label: "批次位置", render: (row) => escapeHtml(row.batch_role || "—") },
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
  const rows = (state.data.summary.company_rankings[state.companyScope][state.companyPeriod] || []).map((row) => ({
    ...row,
    stockProfile: getStockCompanyStats(row.fund_company),
  }));
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
      { label: "存量FOF数", render: (row) => escapeHtml(row.stockProfile?.product_count ?? "—") },
      { label: "存量最新规模(亿元)", render: (row) => fmtNum(row.stockProfile?.latest_scale_sum) },
      { label: "存量排名", render: (row) => (row.stockProfile?.rank != null ? `#${escapeHtml(row.stockProfile.rank)}` : "—") },
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
      <div class="progress-panel-note">右侧为已成立产品募集规模；公司名下补充显示存量 FOF 最新规模与排名</div>
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
          const stockProfile = getStockCompanyStats(row.fund_company);
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
                <div class="progress-company-meta">${
                  stockProfile
                    ? `存量 #${escapeHtml(stockProfile.rank)} · ${fmtNum(stockProfile.latest_scale_sum)} 亿元 · ${escapeHtml(stockProfile.product_count)} 只`
                    : "暂无存量规模画像"
                }</div>
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
  const rows = (state.data.summary.key_company_cards || []).map((row) => ({
    ...row,
    stockProfile: getStockCompanyStats(row.fund_company),
  }));
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
            <div class="metric-pill"><div class="label">存量最新规模</div><div class="value">${fmtNum(row.stockProfile?.latest_scale_sum)}</div></div>
            <div class="metric-pill"><div class="label">存量排名</div><div class="value">${
              row.stockProfile?.rank != null ? `#${escapeHtml(row.stockProfile.rank)}` : "—"
            }</div></div>
          </div>
          <div class="metric-row">
            <div class="metric-pill"><div class="label">存量FOF数</div><div class="value">${escapeHtml(row.stockProfile?.product_count ?? "—")}</div></div>
            <div class="metric-pill"><div class="label">养老FOF数</div><div class="value">${escapeHtml(row.stockProfile?.pension_count ?? "—")}</div></div>
            <div class="metric-pill"><div class="label">较上期变化</div><div class="value">${fmtSignedNum(row.stockProfile?.scale_change)}</div></div>
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

function renderStockScaleProfile() {
  const profile = state.data.summary.fof_scale_profile;
  const kpiContainer = document.getElementById("stock-kpi-grid");
  const briefContainer = document.getElementById("stock-brief");
  const raceContainer = document.getElementById("stock-raceboard");
  const keyCardContainer = document.getElementById("stock-key-company-cards");
  const companyTableContainer = document.getElementById("stock-company-table");
  const topProductContainer = document.getElementById("stock-top-product-table");
  const repairedTableContainer = document.getElementById("stock-repaired-table");

  if (!profile) {
    const empty = `<div class="empty-box">当前没有可用的存量 FOF 最新规模数据。</div>`;
    kpiContainer.innerHTML = empty;
    briefContainer.innerHTML = empty;
    raceContainer.innerHTML = empty;
    keyCardContainer.innerHTML = empty;
    companyTableContainer.innerHTML = empty;
    topProductContainer.innerHTML = empty;
    repairedTableContainer.innerHTML = empty;
    return;
  }

  const focus = profile.focus_company_snapshot || {};
  const target = profile.target || {};
  const ordinary = (profile.type_breakdown || []).find((item) => item.fof_type === "普通FOF") || {};
  const pension = (profile.type_breakdown || []).find((item) => item.fof_type === "养老FOF") || {};
  const scaleGap = Number(target.scale_gap_vs_focus) || 0;
  const topCompanyNames = (profile.top_companies || []).map((item) => item.fund_company).join("、");

  const kpis = [
    {
      label: "存量FOF产品数",
      value: profile.product_count ?? 0,
      note: `覆盖 ${profile.company_count ?? 0} 家基金公司`,
    },
    {
      label: "最新FOF总规模",
      value: `${fmtNum(profile.total_latest_scale)} 亿元`,
      note: `口径日期 ${fmtDate(profile.scale_as_of_date)}`,
    },
    {
      label: "普通 / 养老FOF",
      value: `${ordinary.product_count ?? 0} / ${pension.product_count ?? 0}`,
      note: `规模 ${fmtNum(ordinary.latest_scale_sum)} / ${fmtNum(pension.latest_scale_sum)} 亿元`,
    },
    {
      label: "华夏当前排名",
      value: focus.rank != null ? `#${focus.rank}` : "—",
      note: `最新规模 ${fmtNum(focus.latest_scale_sum)} 亿元`,
    },
    {
      label: "较上期规模变化",
      value: `${fmtSignedNum(profile.total_scale_change)} 亿元`,
      note: `对比 ${fmtDate(profile.prev_scale_as_of_date)}`,
    },
    {
      label: "补齐规模样本",
      value: profile.repaired_scale_count ?? 0,
      note: "曾标记缺失，但当前主表已补齐规模值",
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

  const latestScaleSentence =
    scaleGap > 0
      ? `若按当前最新规模排名，华夏距离前 ${target.cutoff_rank || 3} 门槛 ${escapeHtml(target.cutoff_company || "头部公司")} 还差 <strong>${fmtNum(
          scaleGap
        )} 亿元</strong>。`
      : "按当前最新规模口径，华夏已经站在头部门槛之内。";
  briefContainer.innerHTML = `
    <div class="chase-brief-grid">
      <div class="chase-brief-main">
        <div class="progress-panel-kicker">Stock FOF Scale</div>
        <h3>这块看的是存量 FOF 最新规模，不是今年新成立产品的募集规模。</h3>
        <p>
          当前口径来自 <strong>${escapeHtml(profile.source_file || "基金画像表")}</strong> 的
          <strong>${escapeHtml(profile.source_sheet || "基金画像")}</strong> 工作表，统计日期为
          <strong>${fmtDate(profile.scale_as_of_date)}</strong>。
          全市场存量 FOF 共 <strong>${escapeHtml(profile.product_count ?? 0)} 只</strong>，
          合计最新规模 <strong>${fmtNum(profile.total_latest_scale)} 亿元</strong>，
          头部公司主要是 ${escapeHtml(topCompanyNames || "—")}。
        </p>
        <p>
          华夏当前最新规模为 <strong>${fmtNum(focus.latest_scale_sum)} 亿元</strong>，排名
          <strong>#${escapeHtml(focus.rank ?? profile.focus_company_rank ?? "—")}</strong>，${latestScaleSentence}
        </p>
      </div>
      <div class="chase-brief-side">
        <div class="chase-stat-card">
          <span>华夏产品数</span>
          <strong>${escapeHtml(focus.product_count ?? 0)} 只</strong>
        </div>
        <div class="chase-stat-card">
          <span>华夏市占率</span>
          <strong>${focus.scale_share_pct != null ? `${fmtNum(focus.scale_share_pct, 2)}%` : "—"}</strong>
        </div>
        <div class="chase-stat-card">
          <span>前三门槛</span>
          <strong>${fmtNum(target.cutoff_scale_sum)} 亿元</strong>
        </div>
      </div>
    </div>
  `;

  const raceRows = profile.head_companies || [];
  if (!raceRows.length) {
    raceContainer.innerHTML = `<div class="empty-box">暂无头部公司最新规模数据。</div>`;
  } else {
    const maxScale = Math.max(...raceRows.map((row) => Number(row.latest_scale_sum) || 0), 1);
    raceContainer.innerHTML = `<div class="chase-raceboard">${raceRows
      .map((row) => {
        const width = Math.max(10, (100 * (Number(row.latest_scale_sum) || 0)) / maxScale);
        const isCutoff = (row.rank || 999) <= (target.cutoff_rank || 3);
        const gapText = row.is_focus_company
          ? "华夏基线"
          : `领先华夏 ${Math.max((Number(row.latest_scale_sum) || 0) - (Number(focus.latest_scale_sum) || 0), 0).toFixed(1)} 亿元`;
        return `
          <article class="chase-race-row ${row.is_focus_company ? "is-focus" : ""} ${isCutoff ? "is-cutoff" : ""}">
            <div class="chase-race-top">
              <div>
                <div class="chase-race-company">#${escapeHtml(row.rank)} ${escapeHtml(row.fund_company)}</div>
                <div class="chase-race-sub">
                  产品 ${escapeHtml(row.product_count)} 只 · 普通 ${escapeHtml(row.ordinary_count)} · 养老 ${escapeHtml(row.pension_count)}
                </div>
              </div>
              <div class="chase-race-badges">
                ${row.is_focus_company ? `<span class="chase-pill focus">华夏</span>` : ""}
                ${isCutoff ? `<span class="chase-pill cutoff">头部门槛</span>` : ""}
                <span class="chase-gap">${escapeHtml(gapText)}</span>
              </div>
            </div>
            <div class="chase-race-track">
              <div class="chase-race-fill" style="width:${width}%"></div>
            </div>
            <div class="chase-race-bottom">
              <div>最新规模 <strong>${fmtNum(row.latest_scale_sum)} 亿元</strong></div>
              <div>市占率 <strong>${row.scale_share_pct != null ? `${fmtNum(row.scale_share_pct, 2)}%` : "—"}</strong></div>
            </div>
          </article>
        `;
      })
      .join("")}</div>`;
  }

  const keyRows = profile.key_company_rankings || [];
  keyCardContainer.innerHTML = keyRows.length
    ? keyRows
        .map(
          (row) => `
            <article class="company-mini-card">
              <h3>${escapeHtml(row.fund_company)}</h3>
              <div class="metric-row">
                <div class="metric-pill"><div class="label">最新排名</div><div class="value">${row.rank != null ? `#${escapeHtml(row.rank)}` : "—"}</div></div>
                <div class="metric-pill"><div class="label">产品数</div><div class="value">${escapeHtml(row.product_count ?? 0)}</div></div>
                <div class="metric-pill"><div class="label">最新规模</div><div class="value">${fmtNum(row.latest_scale_sum)}</div></div>
              </div>
              <div class="metric-row">
                <div class="metric-pill"><div class="label">普通FOF</div><div class="value">${escapeHtml(row.ordinary_count ?? 0)}</div></div>
                <div class="metric-pill"><div class="label">养老FOF</div><div class="value">${escapeHtml(row.pension_count ?? 0)}</div></div>
                <div class="metric-pill"><div class="label">补齐样本</div><div class="value">${escapeHtml(row.repaired_scale_count ?? 0)}</div></div>
              </div>
              <div class="metric-row">
                <div class="metric-pill"><div class="label">市占率</div><div class="value">${
                  row.scale_share_pct != null ? `${fmtNum(row.scale_share_pct, 2)}%` : "—"
                }</div></div>
                <div class="metric-pill"><div class="label">较上期变化</div><div class="value">${fmtSignedNum(row.scale_change)}</div></div>
              </div>
              <div class="section-head compact" style="margin-top: 16px;">
                <div><h2 style="font-size:16px;">规模前三产品</h2></div>
              </div>
              <div class="mini-list">
                ${(row.top_products || [])
                  .map(
                    (item) => `
                      <div class="mini-item">
                        <div class="mini-top">
                          <div class="mini-name">${escapeHtml(item.fund_name)}</div>
                          <span class="pill">${escapeHtml(item.fof_type)}</span>
                        </div>
                        <div class="mini-meta">最新规模 ${fmtNum(item.latest_scale)} 亿元${
                          item.is_repaired_scale ? " · 已补齐规模" : ""
                        }</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </article>
          `
        )
        .join("")
    : `<div class="empty-box">暂无重点公司存量规模数据。</div>`;

  const companyRows = (profile.company_rankings || []).slice(0, 30);
  companyTableContainer.innerHTML = companyRows.length
    ? tableMarkup(
        [
          { label: "排名", render: (row) => escapeHtml(`#${row.rank}`) },
          {
            label: "基金公司",
            render: (row) =>
              `${escapeHtml(row.fund_company)} ${
                row.is_focus_company ? `<span class="table-tag focus">华夏</span>` : ""
              } ${(row.rank || 999) <= (target.cutoff_rank || 3) ? `<span class="table-tag cutoff">头部</span>` : ""}`,
          },
          { label: "产品数", render: (row) => escapeHtml(row.product_count) },
          { label: "普通FOF", render: (row) => escapeHtml(row.ordinary_count) },
          { label: "养老FOF", render: (row) => escapeHtml(row.pension_count) },
          { label: "最新规模(亿元)", render: (row) => fmtNum(row.latest_scale_sum) },
          { label: "市占率", render: (row) => (row.scale_share_pct != null ? `${fmtNum(row.scale_share_pct, 2)}%` : "—") },
          { label: "较上期变化(亿元)", render: (row) => fmtSignedNum(row.scale_change) },
          { label: "平均单只规模(亿元)", render: (row) => fmtNum(row.avg_latest_scale) },
          { label: "补齐样本", render: (row) => escapeHtml(row.repaired_scale_count ?? 0) },
        ],
        companyRows,
        false
      )
    : `<div class="empty-box">暂无公司规模总表。</div>`;

  const topProducts = profile.top_products || [];
  topProductContainer.innerHTML = topProducts.length
    ? tableMarkup(
        [
          { label: "基金名称", key: "fund_name" },
          { label: "基金公司", key: "fund_company" },
          { label: "FOF类型", key: "fof_type" },
          { label: "最新规模(亿元)", render: (row) => fmtNum(row.latest_scale) },
          { label: "较上期变化(亿元)", render: (row) => fmtSignedNum(row.scale_change) },
        ],
        topProducts,
        false
      )
    : `<div class="empty-box">暂无头部产品规模数据。</div>`;

  const repairedRows = profile.repaired_scale_products || [];
  repairedTableContainer.innerHTML = repairedRows.length
    ? tableMarkup(
        [
          { label: "基金名称", key: "fund_name" },
          { label: "基金公司", key: "fund_company" },
          { label: "FOF类型", key: "fof_type" },
          { label: "最新规模(亿元)", render: (row) => fmtNum(row.latest_scale) },
          { label: "补齐状态", render: () => "已补齐" },
        ],
        repairedRows,
        false
      )
    : `<div class="empty-box">当前没有已补齐规模样本。</div>`;
}

function renderHuaxiaChase() {
  const dashboard = state.data.summary.huaxia_chase;
  const efficiency = state.data.summary.efficiency_diagnosis || {};
  const kpiContainer = document.getElementById("chase-kpi-grid");
  const briefContainer = document.getElementById("chase-brief");
  const diagnosisContainer = document.getElementById("chase-efficiency-diagnosis");
  const raceContainer = document.getElementById("chase-raceboard");
  const contextContainer = document.getElementById("chase-context");
  const tableContainer = document.getElementById("chase-table");

  if (!dashboard) {
    kpiContainer.innerHTML = `<div class="empty-box">暂无华夏追赶测算数据。</div>`;
    briefContainer.innerHTML = `<div class="empty-box">暂无华夏追赶测算数据。</div>`;
    if (diagnosisContainer) diagnosisContainer.innerHTML = `<div class="empty-box">暂无审批效能诊断数据。</div>`;
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

  if (diagnosisContainer) {
    const stageRows = efficiency.stage_rows || [];
    const laggingProducts = efficiency.lagging_products || [];
    diagnosisContainer.innerHTML = stageRows.length
      ? `
        <div class="diagnosis-stage-grid">
          <div class="watch-summary">${escapeHtml(efficiency.focus_summary || "")}</div>
          ${stageRows
            .map(
              (row) => `
                <div class="diagnosis-stage-card">
                  <span>${escapeHtml(row.stage_label)}</span>
                  <strong>${
                    row.focus_avg_days != null ? `华夏 ${fmtNum(row.focus_avg_days)} 天` : "华夏样本不足"
                  }</strong>
                  <p>重点同业 ${
                    row.benchmark_avg_days != null ? `${fmtNum(row.benchmark_avg_days)} 天` : "样本不足"
                  } · ${escapeHtml(row.assessment)}${row.gap_days != null ? ` · 差值 ${fmtSignedNum(row.gap_days)} 天` : ""}</p>
                </div>
              `
            )
            .join("")}
          ${
            laggingProducts.length
              ? `<div class="diagnosis-product-list">${laggingProducts
                  .map(
                    (item) => `
                      <div class="diagnosis-product-item clickable-row" data-product-id="${escapeHtml(item.product_id)}">
                        <span>华夏待跟进产品</span>
                        <strong>${escapeHtml(item.fund_name)}</strong>
                        <p>${escapeHtml(item.current_stage)} · 已停留 ${escapeHtml(item.days_in_stage ?? "—")} 天 · 最新日期 ${fmtDate(
                          item.latest_event_date
                        )}</p>
                        <p>${escapeHtml(getDelayReasonHints(item).join("；") || "当前未识别到明确归因，建议优先补渠道和批次反馈信息。")}</p>
                      </div>
                    `
                  )
                  .join("")}</div>`
              : ""
          }
        </div>
      `
      : `<div class="empty-box">当前样本不足，暂未形成审批效能对比。</div>`;
    bindClickableRows(diagnosisContainer);
  }

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
  const segment = getMarketSegmentSnapshot(product);
  const forecast = getFuturePrediction(product);
  const softIntel = getSoftIntelSnapshot(product);
  const managerInsight = getManagerPeerInsight(product);
  const delayHints = getDelayReasonHints(product);
  const timelineRows = [
    { stage: "新申报", date: product.declare_date, note: "材料接收" },
    { stage: "新受理", date: product.accept_date, note: product.declare_to_accept_days != null ? `申报到受理 ${product.declare_to_accept_days} 天` : "进入监管受理流程" },
    { stage: "已获批", date: product.approval_date, note: product.accept_to_approval_days != null ? `受理到获批 ${product.accept_to_approval_days} 天` : "尚未形成获批样本" },
    { stage: "发行中", date: product.issue_start_date, note: product.approval_to_issue_days != null ? `获批到发行 ${product.approval_to_issue_days} 天` : "进入募集阶段" },
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
            <div><span>基金经理</span><strong>${escapeHtml(product.manager || "待披露")}</strong></div>
            <div><span>募集规模</span><strong>${fmtNum(product.raise_scale)} 亿元</strong></div>
            <div><span>同批次位置</span><strong>${escapeHtml(
              product.batch_role && product.batch_peer_count ? `${product.batch_role} · ${product.batch_peer_count} 只` : "—"
            )}</strong></div>
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
              <span>下一节点预测</span>
              <strong>${
                forecast
                  ? `${escapeHtml(forecast.predicted_stage_label)} · ${fmtDate(forecast.predicted_date)}`
                  : "当前暂无可用预测"
              }</strong>
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
                <span>赛道密度与华夏覆盖</span>
                <strong>${escapeHtml(
                  segment.alert
                    ? `${segment.segmentLabel} 已触发${segment.alert.severity_label}，重点公司 ${segment.peerKeyCompanies.length} 家、同业在途 ${segment.peerInReviewCount} 只；华夏在途 ${segment.huaxiaInReviewCount} 只、存量 ${segment.huaxiaStockCount} 只。`
                    : `${segment.segmentLabel} 当前重点公司 ${segment.peerKeyCompanies.length} 家、同业在途 ${segment.peerInReviewCount} 只；华夏在途 ${segment.huaxiaInReviewCount} 只、存量 ${segment.huaxiaStockCount} 只。`
                )}</strong>
              </div>
              <div class="strategy-point">
                <span>持有人结构预判</span>
                <strong>${escapeHtml(softIntel.holderView)}。${escapeHtml(softIntel.holderNote)}</strong>
              </div>
              <div class="strategy-point">
                <span>经理 vs 经理</span>
                <strong>${escapeHtml(
                  managerInsight
                    ? `${product.manager} 名下已有 ${managerInsight.sameManagerCount} 只历史样本；外部同赛道可比经理 ${managerInsight.peerManagerCount} 位${managerInsight.peerManagers.length ? `，包括 ${managerInsight.peerManagers.join("、")}` : ""}。`
                    : product.manager
                      ? "当前没有识别到更多同经理或跨公司可比经理样本。"
                      : "当前未披露基金经理，后续补齐后可做经理对标。"
                )}</strong>
              </div>
              <div class="strategy-point">
                <span>变相对标样本</span>
                <strong>${escapeHtml(
                  peers.length ? `${peers.map((item) => item.fund_company).join("、")} 等公司已有可比样本，可直接做策略对标。` : "暂未识别到明显同类竞品。"
                )}</strong>
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
              <em>预估胜率 ${escapeHtml(regimes.boom.winRate)} · 最大回撤 ${escapeHtml(regimes.boom.drawdown)}</em>
              <p>${escapeHtml(regimes.boom.note)}</p>
            </div>
            <div class="regime-card">
              <span>震荡换手</span>
              <strong>${escapeHtml(regimes.range.returnBand)}</strong>
              <em>预估胜率 ${escapeHtml(regimes.range.winRate)} · 最大回撤 ${escapeHtml(regimes.range.drawdown)}</em>
              <p>${escapeHtml(regimes.range.note)}</p>
            </div>
            <div class="regime-card">
              <span>风险偏好回落</span>
              <strong>${escapeHtml(regimes.stress.returnBand)}</strong>
              <em>预估胜率 ${escapeHtml(regimes.stress.winRate)} · 最大回撤 ${escapeHtml(regimes.stress.drawdown)}</em>
              <p>${escapeHtml(regimes.stress.note)}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="section-head compact">
          <div>
            <h2 style="font-size:18px;">发行软信息与同类样本</h2>
            <p>先看拟发渠道、持有人结构和底层偏好，再看外部同类推进到哪里。</p>
          </div>
        </div>
          <div class="strategy-copy" style="margin-bottom:14px;">
          <div class="strategy-point">
            <span>拟发渠道</span>
            <strong>${escapeHtml(softIntel.launchChannels)}${softIntel.channelStatus !== "待补充" ? ` · ${escapeHtml(softIntel.channelStatus)}` : ""}</strong>
            <div class="peer-meta">${escapeHtml(softIntel.predictedChannel || "当前未启用渠道预测")}</div>
          </div>
          <div class="strategy-point">
            <span>持有人结构预判</span>
            <strong>${escapeHtml(softIntel.holderView)}</strong>
            <div class="peer-meta">${escapeHtml(softIntel.holderNote)}</div>
          </div>
          <div class="strategy-point">
            <span>底层选基偏好 / 底层池建议</span>
            <strong>${escapeHtml(softIntel.underlyingPreference)}</strong>
            <div class="peer-meta">${escapeHtml(softIntel.poolAction)}</div>
          </div>
          <div class="strategy-point">
            <span>审核堵点归因</span>
            <strong>${escapeHtml(delayHints.length ? delayHints.join("；") : "当前未识别到明显堵点归因。")}</strong>
            <div class="peer-meta">${escapeHtml(
              product.batch_role && product.batch_peer_count
                ? `${product.batch_week_label || "本周"}有 ${product.batch_peer_count} 只同类产品处于同批次，当前为${product.batch_role}。`
                : "当前未识别到显著同批次信号。"
            )}</div>
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
  renderGlobalSlice();
  renderHero();
  renderKPIs();
  renderKpiDrill();
  renderWatchControls();
  renderWatchFeed();
  renderForecastTimeline();
  renderDensityAlerts();
  renderMacroClock();
  renderSoftIntelBoard();
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
  renderStockScaleProfile();
  renderKeyCompanyProgress();
  renderKeyCompanyCards();
  renderHuaxiaChase();
  renderDetail();
  renderDrawer();
}

getData()
  .then((data) => {
    state.data = data;
    state.watchCompanies = loadWatchCompanies();
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
