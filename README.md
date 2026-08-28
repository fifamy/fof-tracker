# 公募FOF基金跟踪系统

这是一个桌面优先、可本地运行的静态前端系统，用于跟踪全市场公募 FOF 的申报、受理、获批、发行、成立情况。

默认分析口径：

- 今年以来
- 近一周

## 目录结构

- `index.html`
- `all-market-funds.html`
- `styles.css`
- `app.js`
- `config/fof_tracker_config.json`
- `data/fof_stage_source_template.csv`
- `data/fof_soft_signal_template.csv`
- `data/fof_tracker_snapshot.json`
- `data/fof_tracker_snapshot.js`
- `data/fof_tracker_detail.csv`
- `scripts/build_fof_tracker_snapshot.py`

## 最简单的使用方式

如果你不想碰命令行，直接双击：

- `一键更新FOF数据.command`
- `一键打开FOF跟踪.command`
- `一键全流程.command`

这三个入口在生成 snapshot 前都支持可选输入统计截止日：

- 输入 `YYYY-MM-DD`：按你手动指定的最后截止日计算“近一周”和“今年以来”
- 直接回车：继续按脚本自动识别的日期生成

手动截止日的防呆规则：

- 如果你输入的日期比自动识别截止日早超过 1 年，脚本会直接报错，避免把 `2026-04-24` 误写成 `2024-04-24`
- 如果你确实要回看历史口径，再额外加 `--allow-historical-as-of`

推荐直接双击第二个，它会自动：

1. 生成最新 snapshot
2. 启动本地网页服务
3. 自动打开浏览器
4. 自动附加时间戳参数，避免浏览器继续读取旧缓存

## 当前页面模块

- 首页总览
- 流程跟踪
- 公司竞争格局
- 重点公司对比
- 华夏追赶测算
- 托管行统计（2026-05-07 新增独立 tab，2026-08-28 明确为纯基金托管人口径）
- 智能简报（密集布局 / 投资时钟 / 软信息看板）
- 产品详情

本轮新增的情报增强包括：

- 策略密集布局提醒：按“FOF类型 × 风险收益特征 × 持有期”做策略对标，不再只按产品名称比对
- 未来30天节点预测：基于历史平均耗时，估算未来一个月可能发生的受理、获批、发行、成立节点（已升级为类型泳道甘特，见更新记录 2026-04-24）
- 审批效能堵点诊断：横向对比华夏与重点同业在各阶段的平均耗时，识别流程慢点
- 发行软信息模板：支持把拟发渠道、持有人结构、底层选基偏好和底层池准备建议纳入 snapshot
- 本地订阅公司：可在浏览器本地订阅重点公司，把对应异动优先抬到侧栏
- 投资时钟联动：支持在 `config/fof_tracker_config.json` 中填写 `macro_clock.current_regime`，按宏观阶段高亮对应赛道
- 全局切片（2026-04-24 新增）：侧栏一键切 全部 / 普通 / ETF-FOF / 养老 / 华夏空白 / 华夏在途，联动首页所有模块
- 对标矩阵视图（2026-04-24 新增）：4 × 4 风险 × 持有期矩阵，红 / 灰气泡直观展示华夏与竞品覆盖差，定位"补 / 守 / 抢"赛道

其中“华夏追赶测算”模块用于回答：

- 华夏基金当前距离头部公司前三名还有多少只 FOF 的数量差距
- 按头部公司当前“已成立 + 在途”的保底数量口径，华夏至少还需要新增申报多少只产品
- 按头部前三已成立产品的平均“申报到成立”耗时，华夏最晚需要在什么时候开始申报

当前测算逻辑：

- 年底保底数量 = 今年已成立产品数 + 当前处于申报、受理、获批、发行中的产品数
- 前三门槛 = 当前保底数量排名第 3 名公司的数量
- 最晚申报日 = 当年 12 月 31 日倒推头部前三已成立产品平均“申报到成立”天数

## 快速开始

1. 直接把业务 Excel 放在 `fof-tracker/` 目录下：

- `全行业新基金申报统计 (3).xlsx`
- `基金发行统计_募集.xlsx`
- `基金发行统计_成立 (1).xlsx`
- `基金获批情况统计（万得）.xlsx`

脚本会优先读取这 4 个文件，自动分析 FOF 产品的：

- 申报
- 受理
- 获批
- 发行
- 成立

2. 如果暂时没有这 4 个 Excel，再使用模板 CSV：

把你的 FOF 跟踪数据填入：

- `data/fof_stage_source_template.csv`

字段建议：

- 产品ID
- 基金名称
- 基金公司
- FOF类型
- 申报日期
- 受理日期
- 获批日期
- 发行起始日
- 成立日
- 募集规模(亿元)
- 托管人
- 备注

3. 如需维护发行软信息，可填写：

- `data/fof_soft_signal_template.csv`

字段包括：

- 产品ID
- 基金名称
- 基金公司
- 拟发渠道
- 渠道状态
- 持有人结构预判
- 底层选基偏好
- 底层池准备建议
- 情报等级
- 最近更新日
- 备注

匹配规则说明：

- 优先按 `产品ID` 匹配
- 若未填 `产品ID`，则退回按 `基金名称` 归一化匹配
- 模板可只填部分字段；未填项前端会继续显示规则预判或“待补充”

4. 生成前端 snapshot：

```bash
cd /Users/menyao/Documents/trae_projects/fof-tracker
python3 -m pip install pandas openpyxl
python3 scripts/build_fof_tracker_snapshot.py
```

如果需要手动指定统计截止日：

```bash
cd /Users/menyao/Documents/trae_projects/fof-tracker
python3 scripts/build_fof_tracker_snapshot.py --as-of-date 2026-04-18
```

5. 启动本地静态服务：

```bash
cd /Users/menyao/Documents/trae_projects/fof-tracker
python3 -m http.server 8080
```

浏览器打开：

```text
http://127.0.0.1:8080/
```

## 重点说明

- 重点公司名单在 `config/fof_tracker_config.json` 中维护
- 投资时钟阶段可在 `config/fof_tracker_config.json -> macro_clock.current_regime` 中维护；当前默认值已设为 `复苏期`
- 前端默认优先读取 `data/fof_tracker_snapshot.js`
- 默认优先读取 4 个业务 Excel；只有 Excel 不存在时，才退回 `data/fof_stage_source_template.csv`
- `data/fof_soft_signal_template.csv` 为可选补充模板，不影响主流程生成
- `data/fof_soft_signal_template.csv` 当前已预填 6 只重点在途产品的 `产品ID / 基金名称 / 基金公司`，便于直接补渠道与持有人结构
- 证监会网页补充数据在脚本中仍会优先尝试；若运行环境与 `neris.csrc.gov.cn` 的 TLS 握手不兼容，脚本会自动回退到本地 Excel 主链路继续生成
- 若你开着 `VPN / Surge / Clash / Shadowsocks / 系统代理`，证监会网页补充可能会失败；建议把 `neris.csrc.gov.cn`、`csrc.gov.cn` 设为 `DIRECT`，或临时关闭代理后再运行
- `all-market-funds.html` 是独立的全市场基金发行跟踪页，优先使用在线 XLSX 解析库；若网络不可用，会尝试浏览器内置的轻量解析兜底
- 当前页面重点展示“近一周”和“今年以来”
- 若你后续部署到 GitHub Pages，也可以继续保留这套静态结构

## 常见问题

### 1. 日志里出现“网页补充数据读取失败”

先看浏览器能否直接打开：

```text
https://neris.csrc.gov.cn/alappl/home1/shouye
```

如果浏览器也打不开，通常不是脚本问题，而是当前网络环境导致：

- 开了 VPN / 代理，证监会域名被错误走代理
- 当前代理链路对该站点做了证书接管，导致 SSL/TLS 握手失败
- 当前出口 IP 被目标站点直接断开

建议顺序：

1. 关闭代理或把 `neris.csrc.gov.cn`、`csrc.gov.cn` 设为直连
2. 浏览器确认页面能打开
3. 再执行 `一键打开FOF跟踪.command` 或 `python3 scripts/build_fof_tracker_snapshot.py`

### 2. 页面突然“像没数据了”

优先检查本次生成日志里的两行：

- `自动识别截止日`
- `实际采用截止日`

如果你把年份输错了，例如把 `2026-04-24` 写成 `2024-04-24`，生成结果会切到历史口径，前端就会看起来像“数据没了”。当前脚本已默认拦住这种超过 1 年的明显误填。

## 存量规模口径补充

### 数据与对比口径（基于 `fund_profile_20260630_v3_4 copy.xlsx`）

- 对比样本按`基金规模画像`工作表的最新公募基金规模口径更新，比较时同时纳入全量存续FOF样本
- 按`2026-06-30`口径，当前纳入617只存量FOF产品，覆盖82家基金管理人
- 最新规模字段为`基金规模合计[交易日期] 2026-06-30`；普通FOF规模合计2682.01亿元、养老FOF规模合计675.49亿元，全市场合计3357.50亿元
- 工作簿提供的比较基准列为`2025-12-31`，因此系统统一展示实际比较日期，不再把该变化误写成“较上期”或“本季度”
- 617只FOF均具备2026-06-30最新规模，可用规模覆盖率为100%

## 更新记录

### 2026-08-28

- “托管行渠道”统一更名为“托管行统计”，只按基金托管人汇总，不再将托管关系解释为主销、代销或渠道触达
- 托管统计拆分两套规模口径：画像存量规模与成立募集规模分别展示，禁止相加形成混合规模
- 托管机构卡片新增华夏托管 FOF 明细，可直接核对证券代码、基金全称、产品类型、状态及规模
- “合作公司 / 合作 TOP / 华夏已合作”分别改为“管理人数量 / 管理人 TOP / 华夏托管产品”，减少业务歧义
- 未录入拟发渠道时不再根据托管人生成销售渠道预测；前端缓存指纹更新为`v=20260828-custodian`

### 2026-08-27

- 存量规模数据源切换为`fund_profile_20260630_v3_4 copy.xlsx`，默认读取`基金规模画像`工作表
- 全站存量规模、公司排名、华夏追赶、产品TOP、策略矩阵和托管行画像已按2026-06-30口径重算
- 规模比较统一展示真实基准日`2025-12-31`；“本季度新发”和“较上期”改为“基准日后新增规模”和动态日期标签
- 前端资源缓存指纹更新为`v=20260827-scale0630`

### 2026-05-07

本轮重点：修正一批数据口径漏洞 + 新增托管行独立模块 + UX 一致性打磨。前端缓存指纹推进到 `v=20260507-ui14`。

#### 一、数据口径与 KPI 修复（snapshot 已重生）

- **存量规模"较上期变化"拆口径**：原来用 `latest_total - prev_total` 计算，会把"上期不存在、本期新发"的产品当成 0→X 全额变化，实测被误高估近 700 亿元。`build_fof_scale_profile` 引入 `_scale_breakdown`，统一输出：
  - `existing_scale_change`：两期都披露过规模的样本差额（"真存量增长"，本期 +122.09 亿元）
  - `new_fund_scale` / `new_fund_count`：本期新增产品规模（53 只 / 689.12 亿元，单列）
  - `removed_fund_scale` / `removed_fund_count`：上期有规模、本期已无样本（清盘下架等）
  - `comparable_count`：用于做差值的样本数
  - 公司榜、类型榜、总量层都同步拆解；前端 KPI 拆成"存量增长（同口径）"+"本季度新发产品规模"两张卡，公司表与重点公司卡同步显示同口径增长 + 新发明细
- **风险 / 持有期默认值改"未识别"**：`extract_risk_bucket` 原来把无关键词的产品默认归到"平衡"，叠加宏观时钟 `watch_risk_buckets=["积极","平衡"]` 会让大部分产品"宏观命中"，失去信号意义。本轮：
  - 风险桶：未识别返回 `"未识别"`，新增 `"多元配置"` 桶承接"多资产 / 多元 / 配置 / 优选"等关键词
  - 持有期：未识别返回 `"未标注持有期"`
  - `MACRO_CLOCK_LIBRARY` 同步去掉对宽口径"平衡"的通配，复苏期改为 `["积极","多元配置"]`，滞胀期改为 `["稳健","平衡","多元配置"]`
  - 前端 `extractRiskBucket / extractHoldingBucket / getMatrixBuckets / groupByMatrix / getRadarScores` 全部跟进
  - 实测分布：多元配置 60、稳健 57、未识别 30、积极 6、养老 4、平衡 3，"未识别"独立成桶
- **`raise_scale` 不再 `fillna(0)`**：所有 KPI / 公司榜 / 重点公司卡 / chase / 趋势 改为 `dropna()`，并暴露 `raise_scale_sample_count` / `raise_scale_missing_count`。前端"募集规模"KPI 备注会显示覆盖度（如 "近一周 0 只成立 · 募集口径覆盖 N/N"），避免"未填规模"被误展示成"募集为 0"
- **`current_stage` 默认值改 `None`**：`finalize_products` 中默认值从 `"新申报"` 改为 `None`，避免日期全空的"幽灵记录"被错归到新申报
- **趋势改自然周对齐**：`build_trend` 改为按周一对齐，新增 `week_start / week_end / observed_end / is_partial_week` 字段。包含 as_of_date 当天的那一周打 `is_partial_week=true`，前端 WoW / Sparkline 自动跳过；趋势图柱子改虚线半透明 + "当前周·未完整"角标，避免周内 0 拖累趋势判断
- **拆 `remarks` 字段**：合并产品时不再让后到的字符串覆盖前面的语义，新增 `task_name / approval_remark / issue_status / issue_stage` 四个独立字段；combined `remarks` 用 ` · ` 拼接，便于前端引用单段
- **chase benchmark fallback 透明化**：`huaxia_chase.target.benchmark_scope` 暴露 fallback 层级（`top_n / head_limit / all / none`），便于前端区分"基于头部三公司"还是"全市场样本"的测算

#### 二、未来 30 天预测轴：以 as_of_date 为基准

- `buildForecastAxisMarkup` 不再用浏览器 `today`，改用 `state.data.as_of_date` 作为时间轴起点；`getApprovalWindowInsight` 同步加边界判断
- 越界节点新增视觉处理：`pct < 0` 标 `is-overdue`（红虚线、聚到最左），`pct > 100` 标 `is-beyond`（半透明虚线、聚到最右），不再被强行 clamp 成同一团
- 主轴左起 0% tick 标"截至 MM/DD"

#### 三、审批效率追踪：前后端口径统一

- `renderEfficiencyBattlefield` 删除前端自算，统一消费后端 `summary.efficiency_diagnosis`，benchmark 公司从配置 `key_companies`（除华夏）一致取数
- 按"差值天数"分色：> 5 天慢于同业 → 红、< -5 → 绿、其他 → 灰；最大堵点高亮 `is-bottleneck`
- 卡片内补样本数标注（华夏样本 N 条 / 重点同业样本 M 条）

#### 四、新增托管行统计独立模块（左栏第 5 项）

- 数据源：跟踪流水（4 个 Excel + CSRC 网页补充）+ `fund_profile_20260331.xlsx` 的「基金托管人」字段（591 只历史存量 FOF）
- `normalize_custodian_name` 别名归并：把"中国工商银行 / 工商银行 / 工行"等合并到统一规范名，并按银行 / 券商 / 其他分类
- `build_custodian_landscape` 输出两套口径：
  - **全部基金（含存量画像）**：今年活跃 + 仅画像存量（按基金名称去重）。当前实测 671 只 / 38 家，招行 125 只居首；华夏在招行 8 / 建行 6 / 工行 3 / 中行 3 都有合作
  - **今年新发**：仅看今年成立或在审的活跃产品。当前 80 只 / 26 家，招行 16 只居首；华夏当前在所有大行都为 0（强信号）
- 前端结构：
  - 顶部"数据口径"toggle（全部 / 今年新发）+ 右侧 hint 说明数据来源
  - 6 张 KPI（已披露 FOF / 覆盖机构数 / 在途 vs 已成立 / 画像存量规模 / 成立募集规模 / 华夏托管机构）
  - 5 个筛选 tab：全部 / 银行 / 券商·其他 / 有华夏托管 / 暂无华夏托管
  - 托管行卡片：含华夏托管产品数、横向条形对比、规模分口径数据、重点管理人、管理人 TOP、华夏产品明细与近期产品列表
  - 托管机构总表便于人工核对或截图
- 切换数据口径或筛选 tab 时局部刷新，KPI 与 hint 同步更新

#### 五、UX 一致性

- **顶栏数据时效戳**：`#topbar-stamp` 显眼展示「截止 YYYY-MM-DD / 生成时间 / 存量口径季报披露日」，进入任意 tab 都能看到当前数据基准
- **Tab 可访问性**：`#main-tabs` 加 `role="tablist"` + 每个 tab 的 `role="tab"` / `aria-selected` 联动
- **切 tab 自动回顶端**：新增 `scrollToTop()` + `switchTab()`，对 `window` / `documentElement` / `body` / `.main` 容器都置 `scrollTop=0`，左栏 rail-nav 与（隐藏的）顶栏 main-tabs 共用入口
- **首页"华夏全量 FOF"折叠**：改成 `<details>` 速览（默认展示前 5 只 + 在审计数，剩余收纳），减少首页纵向堆叠
- **小逻辑漏洞**：`alert_count = 0` / `future.events.length = 0` 时 hero pill 不再显示空提醒；`count_gap_vs_focus` 负值正确表达为"落后华夏 N 只"；矩阵在 ≤960px 改为横向滚动（不再被强压成单列堆叠）
- **gantt-node**：新增 `is-overdue / is-beyond` 样式
- **efficiency-row**：新增 `tone-slow / tone-fast / tone-even / tone-muted` 分色

#### 六、性能与可维护性

- `getHuaxiaBenchmarkInsight` 引入 `_benchmarkCache`：对 169 只产品反复 O(N²) 比对的开销显著降低；切片或重新加载时自动 `clearInsightCache()`
- 资源 `?v=` 缓存指纹推进到 `20260507-ui14`，规避旧浏览器缓存
- `data/fof_tracker_snapshot.json` 体量略增（新增 `custodian_landscape.scopes` 等字段），仍在合理范围

#### 七、注意事项 / 已知现象

- "全部基金"口径下的"在审"列绝大多数显示 0：因为画像表只有"成立后"的产品；今年正在申报 / 受理的产品来自跟踪流水。要看在审动作请切到"今年新发"或"流程跟踪"tab
- 托管统计中的画像存量规模与成立募集规模来源不同，页面分别展示，不应相加或直接比较
- 风险桶把"未识别"独立后，宏观命中数明显下降，是预期行为（之前的"全市场命中"是默认值导致的假信号）

### 2026-04-24

首页作战大屏整体改造，围绕「看华夏 FOF 总体布局 / 市场都在布什么 / 华夏差什么 / 华夏强在哪」五问重构。

- 一键脚本的 Python 选择顺序调整为优先较新的 `python3`，尽量避免老版本 Python 触发 TLS/SSL 兼容问题
- 网页补充抓取窗口现在会正确使用你手动输入的 `--as-of-date`，不再错误沿用配置里的旧截止日
- 手动截止日新增“错年份防呆”：如果比自动识别日期早超过 1 年，会直接报错提醒；如确需回看历史，可显式加 `--allow-historical-as-of`
- README 补充了代理/VPN 与截止日误填的排查说明，便于后续快速自查

#### 一、核心 KPI 区升级

- 6 张 KPI 卡片全部可点击下钻（申报 / 受理 / 获批 / 成立 / 募集规模 / 华夏对标空白），点击后 KPI 网格下方原地展开明细面板（24 条产品卡，支持再次点击跳转详情抽屉），再点一次或"收起"按钮关闭
- "华夏对标空白" > 0 时卡片自动进入 `is-alert` 警报态：红色渐变底 + 呼吸脉冲点 + 红色顶部 accent 条
- "新成立 / 募集规模"补 WoW 同环比箭头徽章（▲ 红 / ▼ 绿，展示百分比）
- "募集规模"卡内嵌 8 周 sparkline（SVG 折线 + 填充面积 + 终点圆点）
- 数字字号上调到 28px / 700，启用 tnum 表格数字，整体加轻量 hover 上浮

#### 二、未来 30 天预测轴 → 类型泳道甘特

- Y 轴 4 条泳道：**华夏 FOF（置顶，红色品牌高亮）** / 养老 FOF / ETF-FOF / 普通 FOF
- X 轴 30 天，每 5 天一刻度，每 10 天主刻度带日期
- 每个预测事件按日期落点到对应泳道，华夏节点放大并带红色 halo，直观暴露"竞品预计早于华夏 N 天获批"
- 置信度色阶：高=实心、中=红描边白底、低=虚线灰描边
- 每条泳道带计数徽章，华夏泳道为红底白字，一眼看出自己有几张牌即将落地

#### 三、重点异动与华夏对标重构

- 结构改为两段：**竞品异动**（当期非华夏，最多 12 条）+ **华夏全量 FOF**（不过滤日期，列出所有华夏 FOF，最新动作置顶）
- 顶部工具栏加红黄绿灯小计：红灯 X / 黄灯 Y / 总竞品 Z
- 竞品卡片引入 severity 分级并自动置顶：
  - **红灯 critical**：华夏无对标 或 竞品领先 ≥ 2 步 → 红底 + 呼吸点
  - **黄灯 warning**：竞品领先 1 步 → 金色底
  - **弱化 muted**：同步推进 → 透明度 72%
- 每张卡片加"竞品 vs 华夏对标"双轨进度条（红轨 / 蓝轨，5 段圆点），自动算身位差并给 verdict（"竞品领先 N 步 · 需要加速" / "华夏领先 N 步" / "赛道裸奔"）
- 新增 **对标矩阵视图** 开关：
  - 4 × 4 矩阵：Y = 风险偏好（养老/稳健/平衡/积极）× X = 持有期（3个月/6个月/1年+/其他）
  - 每格两枚气泡：红=华夏数量、灰=竞品数量，气泡大小随产品数膨胀
  - 四态底色：红底=空白（华夏需补）、绿底=独占（华夏护城河）、灰蓝=并存（贴身竞争）、灰=空置
  - 顶部汇总空白/并存/独占各多少格，一眼给出"哪方面需补 / 哪方面占优"

#### 四、左侧侧栏：全局切片 + 盯盘焦点压缩

- 新增 **全局切片** 卡片（6 个按钮）：全部 / 普通 / ETF-FOF / 养老 / **华夏空白** / **华夏在途**，每个按钮带命中数
- 切换切片会同时联动：KPI 总量、预测泳道甘特、盯盘焦点、重点异动、对标矩阵
- 盯盘焦点流程条默认压缩成 5 个圆点 + 带进度渐变的横线（已完成段=绿、未完成=灰、当前=红带 halo）
- Hover 或聚焦卡片时展开完整阶段日期与停留天数面板
- 产品条目上限从 6 提到 8，提升首屏信息密度

#### 五、单品诊断抽屉 · 排版修复

- 右侧抽屉（780 px 宽）新增 `.diagnosis-shell.is-drawer` 专属覆盖
- Hero 从 2fr+1fr 压成单列、卡片内边距 14 px、标题 18 px
- 基础字段网格两列、时间线列宽 72/96/1fr、策略布局垂直堆叠、三情景卡片 1 列堆叠
- 推进步骤条保持 5 列但圆点 / 字号缩小，不再撑破抽屉

#### 六、整体视觉升级

- 色彩 token 收紧：红更深（`#b4111d`）、加 `--ink` / `--red-strong` / `--ring-alert` / `--red-wash` 等
- 分隔线降到更浅（`#e2e6ec`），新增 `--line-hair`
- 数字全部 tnum + ss01、圆角统一到 14 px、shadow 多层柔和组合
- 新增 `.tag-chip` 系列（公司/阶段/日期/重点/类型），替代挤在一起的 meta 文本
- 新增 `.confidence-chip.is-high/medium/low`，用饱和度梯度替代单色 chip

### 2026-04-23

- 首页新增“未来30天预测轴”“密集布局建议简报”“投资时钟联动”三块情报区
- snapshot 新增 `summary.strategy_density`、`summary.future_timeline`、`summary.efficiency_diagnosis`、`summary.macro_clock`
- 新增 `data/fof_soft_signal_template.csv`，snapshot 补充 `summary.soft_intel_dashboard`，用于承载渠道排期、持有人结构和底层偏好等软信息
- `data/fof_soft_signal_template.csv` 预填当前最值得优先维护的 6 只在途产品，方便业务直接补录渠道排期与持有人结构
- `config/fof_tracker_config.json` 当前默认把 `macro_clock.current_regime` 设为 `复苏期`，首页会按复苏期逻辑高亮积极型 / 多资产赛道
- 构建脚本补充 `pandas` 缺失时的明确报错提示；若证监会网页补充接口 TLS 握手失败，会自动回退到本地 Excel 生成
- 单品诊断补充赛道密度、华夏覆盖、持有人结构预判和下一节点预测；“同类历史情景测算”补充规则胜率
- 侧栏新增“订阅异动”，可本地订阅重点公司并优先查看其最新动作
- `config/fof_tracker_config.json` 新增 `strategy_density_threshold_companies` 和 `macro_clock` 配置入口
- snapshot 新增 `summary.fof_scale_profile` 数据结构，用于承载存量 FOF 最新规模画像
- 新增“存量FOF规模”页签，并把首页摘要、公司竞争格局、重点公司卡片同步补上存量 FOF 最新规模口径
- “产品矩阵雷达”改为用存量 FOF 做底图，再叠加近一周 / 今年以来的新申报、新成立信号，不再只看新发产品
- `fund_profile_20260331.xlsx` 已接入构建流程，当前按 `基金画像2025` 工作表筛出 591 只 FOF / 养老 FOF 产品

### 2026-04-17

- 新增“华夏追赶测算”页签，展示华夏基金距离头部前三名的 FOF 数量差距、并列前三/稳居前三所需新增申报数、最晚申报日期
- snapshot 新增 `summary.huaxia_chase` 数据结构，前端直接读取该模块进行展示
- “一键打开FOF跟踪.command”改为以当前目录作为网页根目录启动，并在打开链接时自动附加时间戳参数，减少浏览器缓存导致的旧页面问题
- GitHub Pages 入口页增加静态资源版本参数，避免出现“页面结构已更新但 JS / 数据仍是旧缓存”的情况
