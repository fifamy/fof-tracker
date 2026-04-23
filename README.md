# 公募FOF基金跟踪系统

这是一个桌面优先、可本地运行的静态前端系统，用于跟踪全市场公募 FOF 的申报、受理、获批、发行、成立情况。

默认分析口径：

- 今年以来
- 近一周

## 目录结构

- `index.html`
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
- 产品详情

本轮新增的情报增强包括：

- 策略密集布局提醒：按“FOF类型 × 风险收益特征 × 持有期”做策略对标，不再只按产品名称比对
- 未来30天节点预测：基于历史平均耗时，估算未来一个月可能发生的受理、获批、发行、成立节点
- 审批效能堵点诊断：横向对比华夏与重点同业在各阶段的平均耗时，识别流程慢点
- 发行软信息模板：支持把拟发渠道、持有人结构、底层选基偏好和底层池准备建议纳入 snapshot
- 本地订阅公司：可在浏览器本地订阅重点公司，把对应异动优先抬到侧栏
- 投资时钟联动：支持在 `config/fof_tracker_config.json` 中填写 `macro_clock.current_regime`，按宏观阶段高亮对应赛道

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
- 当前页面重点展示“近一周”和“今年以来”
- 若你后续部署到 GitHub Pages，也可以继续保留这套静态结构

## 存量规模口径补充

### 数据与对比口径（基于 `fund_profile_20260331.xlsx`）

- 对比样本按 `基金画像2025` 工作表的最新公募基金规模口径更新，比较时不再只看“今年新发”基金，而是同时纳入存量基金样本
- FOF 对比范围扩展到全量存续 FOF / 养老 FOF；按 `2026-03-31` 口径，当前纳入 591 只存量 FOF 产品，可同时做数量和规模比较
- 规模字段以 `基金规模合计[交易日期] 2026-03-31` 为准；`规模汇总_总计` 显示普通 FOF 最新规模合计为 2600.71 亿元、养老 FOF 为 647.92 亿元
- 对 `是否缺失最新规模数据_20260331 = 1` 的基金，当前主表口径下已补齐到可用规模值；现有 FOF 样本中共有 39 只保留该标记，便于后续复核来源

## 更新记录

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
