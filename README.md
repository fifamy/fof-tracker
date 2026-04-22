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

3. 生成前端 snapshot：

```bash
cd /Users/menyao/Documents/trae_projects/fof-tracker
python3 scripts/build_fof_tracker_snapshot.py
```

如果需要手动指定统计截止日：

```bash
cd /Users/menyao/Documents/trae_projects/fof-tracker
python3 scripts/build_fof_tracker_snapshot.py --as-of-date 2026-04-18
```

4. 启动本地静态服务：

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
- 前端默认优先读取 `data/fof_tracker_snapshot.js`
- 默认优先读取 4 个业务 Excel；只有 Excel 不存在时，才退回 `data/fof_stage_source_template.csv`
- 当前页面重点展示“近一周”和“今年以来”
- 若你后续部署到 GitHub Pages，也可以继续保留这套静态结构

## 更新记录

### 2026-04-17

- 新增“华夏追赶测算”页签，展示华夏基金距离头部前三名的 FOF 数量差距、并列前三/稳居前三所需新增申报数、最晚申报日期
- snapshot 新增 `summary.huaxia_chase` 数据结构，前端直接读取该模块进行展示
- “一键打开FOF跟踪.command”改为以当前目录作为网页根目录启动，并在打开链接时自动附加时间戳参数，减少浏览器缓存导致的旧页面问题
- GitHub Pages 入口页增加静态资源版本参数，避免出现“页面结构已更新但 JS / 数据仍是旧缓存”的情况
