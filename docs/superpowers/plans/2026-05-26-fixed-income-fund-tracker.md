# Fixed Income Fund Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone `fof-tracker` into `fixed-income-fund-tracker` and convert it into a working fixed-income fund tracker.

**Architecture:** Create a new sibling project by copying the static frontend, Python snapshot builder, config, data templates, and command launchers. Rename the data contract from FOF to fixed-income fund where practical, while preserving compatibility aliases for the existing frontend modules that still expect mature tracker structures.

**Tech Stack:** Static HTML/CSS/JavaScript, Python 3, pandas, openpyxl, local `python -m http.server`.

---

## File Structure

- Create sibling directory: `../fixed-income-fund-tracker`
- Modify in new project only:
  - `README.md`: fixed-income usage docs and file names.
  - `index.html`: title, metadata, visible text, snapshot script path.
  - `app.js`: snapshot variable/path, storage key, slice logic, fixed-income type labels, user-facing copy.
  - `styles.css`: comment header only unless CSS class names require no change.
  - `config/fixed_income_fund_tracker_config.json`: project name, key companies, fixed-income type mapping.
  - `data/fixed_income_fund_stage_source_template.csv`: fixed-income sample rows.
  - `data/fixed_income_fund_soft_signal_template.csv`: fixed-income soft signal headers and sample identifiers.
  - `scripts/build_fixed_income_fund_tracker_snapshot.py`: fixed-income filtering, type inference, output names, snapshot keys, profile support.
  - `一键更新固收基金数据.command`, `一键打开固收基金跟踪.command`, `一键全流程.command`: command launchers.
- Remove in new project:
  - `.git/`, `.venv/`, `.fof_tracker_server.pid`, generated FOF snapshot files, original FOF command files.

## Task 1: Clone Project Skeleton

**Files:**
- Create: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker`
- Read: `/Users/menyao/Documents/trae_projects/fof-tracker`

- [ ] **Step 1: Confirm target does not exist**

Run:

```bash
test ! -e /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker
```

Expected: exit code `0`. If it exists, stop and inspect it with:

```bash
find /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker -maxdepth 2 -type f | sort | head -80
```

- [ ] **Step 2: Copy the project**

Run:

```bash
cp -R /Users/menyao/Documents/trae_projects/fof-tracker /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker
```

Expected: new sibling directory exists.

- [ ] **Step 3: Remove copied local-only state**

Run:

```bash
rm -rf /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/.git /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/.venv /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/.fof_tracker_server.pid
```

Expected: no `.git`, `.venv`, or `.fof_tracker_server.pid` remains in the new project.

- [ ] **Step 4: Verify clone**

Run:

```bash
find /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker -maxdepth 1 -type f | sort
```

Expected: includes `README.md`, `index.html`, `app.js`, `styles.css`, and the original command files before later renaming.

## Task 2: Rename Files and Entry Points

**Files:**
- Move: `config/fof_tracker_config.json` to `config/fixed_income_fund_tracker_config.json`
- Move: `data/fof_stage_source_template.csv` to `data/fixed_income_fund_stage_source_template.csv`
- Move: `data/fof_soft_signal_template.csv` to `data/fixed_income_fund_soft_signal_template.csv`
- Move: `scripts/build_fof_tracker_snapshot.py` to `scripts/build_fixed_income_fund_tracker_snapshot.py`
- Move: `一键更新FOF数据.command` to `一键更新固收基金数据.command`
- Move: `一键打开FOF跟踪.command` to `一键打开固收基金跟踪.command`
- Keep: `一键全流程.command`

- [ ] **Step 1: Rename canonical project files**

Run from `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker`:

```bash
mv config/fof_tracker_config.json config/fixed_income_fund_tracker_config.json
mv data/fof_stage_source_template.csv data/fixed_income_fund_stage_source_template.csv
mv data/fof_soft_signal_template.csv data/fixed_income_fund_soft_signal_template.csv
mv scripts/build_fof_tracker_snapshot.py scripts/build_fixed_income_fund_tracker_snapshot.py
mv 一键更新FOF数据.command 一键更新固收基金数据.command
mv 一键打开FOF跟踪.command 一键打开固收基金跟踪.command
```

Expected: renamed files exist.

- [ ] **Step 2: Remove generated FOF snapshot outputs**

Run:

```bash
rm -f data/fof_tracker_snapshot.json data/fof_tracker_snapshot.js data/fof_tracker_detail.csv
```

Expected: old generated files are absent.

- [ ] **Step 3: Verify file names**

Run:

```bash
find config data scripts -maxdepth 1 -type f | sort
```

Expected: fixed-income names are present; old `fof_*template` and `build_fof_tracker_snapshot.py` are absent.

## Task 3: Convert Config and Templates

**Files:**
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/config/fixed_income_fund_tracker_config.json`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_stage_source_template.csv`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_soft_signal_template.csv`

- [ ] **Step 1: Replace config contents**

Set `config/fixed_income_fund_tracker_config.json` to:

```json
{
  "project_name": "公募固收基金跟踪系统",
  "as_of_date": "2026-04-14",
  "focus_company": "华夏",
  "key_companies": [
    "华夏",
    "易方达",
    "富国",
    "博时",
    "南方",
    "招商",
    "广发"
  ],
  "strategy_density_threshold_companies": 3,
  "macro_clock": {
    "current_regime": "复苏期",
    "note": "当前按利率下行和信用利差修复场景做固收赛道联动；后续可按月度宏观判断切换。"
  },
  "stage_order": [
    "新申报",
    "新受理",
    "已获批",
    "发行中",
    "已成立"
  ],
  "fixed_income_type_mapping": {
    "short_bond_keywords": [
      "短债",
      "短期债",
      "超短债"
    ],
    "medium_long_pure_bond_keywords": [
      "中长期纯债",
      "长期纯债",
      "纯债",
      "利率债",
      "信用债",
      "政金债"
    ],
    "hybrid_bond_keywords": [
      "混合债",
      "二级债",
      "一级债",
      "可转债",
      "增强债券",
      "偏债"
    ],
    "passive_index_bond_keywords": [
      "债券指数",
      "指数债",
      "国开债指数",
      "政金债指数",
      "信用债指数"
    ],
    "certificate_deposit_keywords": [
      "同业存单"
    ],
    "bond_etf_keywords": [
      "债券ETF",
      "债券交易型开放式指数",
      "交易型开放式债券"
    ]
  }
}
```

- [ ] **Step 2: Replace stage template**

Set `data/fixed_income_fund_stage_source_template.csv` to:

```csv
产品ID,基金名称,基金公司,固收类型,申报日期,受理日期,获批日期,发行起始日,成立日,募集规模(亿元),托管人,备注
FI2026041001,华夏中短债债券型证券投资基金,华夏,短债基金,2026-04-10,,,,,,,
FI2026040801,易方达中证同业存单AAA指数7天持有期证券投资基金,易方达,同业存单指数基金,2026-04-03,2026-04-08,,,,,,受理用时5天
FI2026040802,富国中债7-10年政策性金融债指数证券投资基金,富国,被动指数债基,2026-04-03,2026-04-08,,,,,,受理用时5天
FI2026040201,博时裕享纯债债券型证券投资基金,博时,中长期纯债基金,2026-03-12,2026-03-18,2026-04-02,,,,,已获批待发行
FI2026040701,南方稳添利债券型证券投资基金,南方,混合债券型基金,2026-03-05,2026-03-12,2026-03-28,2026-04-07,,,,发行中
FI2026032301,招商中证政策性金融债ETF,招商,债券ETF,2026-02-26,2026-03-04,2026-03-18,2026-03-20,2026-03-23,13.66,建设银行,产品1日结募
FI2026032701,广发景明中短债债券型证券投资基金,广发,短债基金,2026-02-28,2026-03-05,2026-03-19,2026-03-21,2026-03-27,12.66,中信银行,
FI2026032401,华夏稳享纯债债券型证券投资基金,华夏,中长期纯债基金,2026-02-24,2026-03-03,2026-03-16,2026-03-18,2026-03-24,2.72,交通银行,
```

- [ ] **Step 3: Replace soft signal template**

Set `data/fixed_income_fund_soft_signal_template.csv` to:

```csv
产品ID,基金名称,基金公司,拟发渠道,渠道状态,持有人结构预判,资产配置偏好,组合准备建议,情报等级,最近更新日,备注
FI2026041001,华夏中短债债券型证券投资基金,华夏,,,,,,,,
FI2026040801,易方达中证同业存单AAA指数7天持有期证券投资基金,易方达,,,,,,,,
FI2026040802,富国中债7-10年政策性金融债指数证券投资基金,富国,,,,,,,,
FI2026040201,博时裕享纯债债券型证券投资基金,博时,,,,,,,,
FI2026040701,南方稳添利债券型证券投资基金,南方,,,,,,,,
```

- [ ] **Step 4: Verify config JSON**

Run:

```bash
python3 -m json.tool config/fixed_income_fund_tracker_config.json >/tmp/fixed_income_config_check.json
```

Expected: exit code `0`.

## Task 4: Convert Python Snapshot Builder

**Files:**
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/scripts/build_fixed_income_fund_tracker_snapshot.py`

- [ ] **Step 1: Replace default paths and browser global**

Make these exact replacements:

```text
DEFAULT_CONFIG = ROOT / "config" / "fof_tracker_config.json"
DEFAULT_JSON = ROOT / "data" / "fof_tracker_snapshot.json"
DEFAULT_JS = ROOT / "data" / "fof_tracker_snapshot.js"
DEFAULT_CSV = ROOT / "data" / "fof_tracker_detail.csv"
DEFAULT_TEMPLATE = ROOT / "data" / "fof_stage_source_template.csv"
DEFAULT_SOFT_INTEL_FILE = ROOT / "data" / "fof_soft_signal_template.csv"
```

to:

```text
DEFAULT_CONFIG = ROOT / "config" / "fixed_income_fund_tracker_config.json"
DEFAULT_JSON = ROOT / "data" / "fixed_income_fund_tracker_snapshot.json"
DEFAULT_JS = ROOT / "data" / "fixed_income_fund_tracker_snapshot.js"
DEFAULT_CSV = ROOT / "data" / "fixed_income_fund_tracker_detail.csv"
DEFAULT_TEMPLATE = ROOT / "data" / "fixed_income_fund_stage_source_template.csv"
DEFAULT_SOFT_INTEL_FILE = ROOT / "data" / "fixed_income_fund_soft_signal_template.csv"
```

Also replace:

```python
window.__FOF_TRACKER_SNAPSHOT__
```

with:

```python
window.__FIXED_INCOME_FUND_TRACKER_SNAPSHOT__
```

- [ ] **Step 2: Add fixed-income universe detection**

Replace `is_fof_record` with:

```python
def is_fixed_income_fund_record(name, type1="", type2=""):
    text = "%s %s %s" % (safe_text(name), safe_text(type1), safe_text(type2))
    upper = text.upper()
    if "FOF" in upper or "基金中基金" in text:
        return False
    positive_keywords = [
        "债券",
        "债",
        "短债",
        "纯债",
        "利率债",
        "信用债",
        "政金债",
        "国开债",
        "同业存单",
        "存单",
        "可转债",
    ]
    negative_keywords = [
        "股票型",
        "普通股票",
        "混合型",
        "指数增强股票",
        "货币市场",
        "QDII",
        "REIT",
    ]
    if any(keyword in text for keyword in negative_keywords) and not any(keyword in text for keyword in positive_keywords):
        return False
    return any(keyword in text for keyword in positive_keywords)
```

Then replace calls to `is_fof_record(...)` with `is_fixed_income_fund_record(...)`.

- [ ] **Step 3: Add fixed-income type inference**

Replace `infer_fof_type` with:

```python
def infer_fixed_income_type(raw_type, fund_name, config):
    type_text = safe_text(raw_type)
    if type_text and type_text not in ("普通FOF", "养老FOF", "ETF-FOF"):
        return type_text

    name = safe_text(fund_name)
    mapping = config.get("fixed_income_type_mapping", {})

    def has_any(key):
        return any(keyword and keyword in name for keyword in mapping.get(key, []))

    if has_any("bond_etf_keywords") or re.search(r"(债券ETF|ETF)$", name, flags=re.IGNORECASE):
        return "债券ETF"
    if has_any("certificate_deposit_keywords"):
        return "同业存单指数基金"
    if has_any("passive_index_bond_keywords") or "指数" in name and "债" in name:
        return "被动指数债基"
    if has_any("short_bond_keywords"):
        return "短债基金"
    if has_any("hybrid_bond_keywords"):
        return "混合债券型基金"
    if has_any("medium_long_pure_bond_keywords"):
        return "中长期纯债基金"
    if "债" in name:
        return "其他固收"
    return "其他固收"
```

Then replace calls to `infer_fof_type(...)` with `infer_fixed_income_type(...)`.

- [ ] **Step 4: Rename dataframe field with compatibility alias**

Replace internal column references from `fof_type` to `fixed_income_type` in the builder. In `serialize_record` and `serialize_profile_record`, output both keys:

```python
"fixed_income_type": safe_text(row.get("fixed_income_type")) or None,
"fof_type": safe_text(row.get("fixed_income_type")) or None,
```

This keeps older frontend helper functions alive while exposing the new field.

- [ ] **Step 5: Convert template column mapping**

In `load_template_data`, replace:

```python
"FOF类型": "fof_type",
```

with:

```python
"固收类型": "fixed_income_type",
```

and infer with:

```python
df["fixed_income_type"] = df.apply(lambda x: infer_fixed_income_type(x.get("fixed_income_type"), x.get("fund_name"), config), axis=1)
```

- [ ] **Step 6: Convert product id prefix**

In `merge_records`, replace:

```python
merged[key]["product_id"] = "FOF_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]
```

with:

```python
merged[key]["product_id"] = "FI_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]
```

- [ ] **Step 7: Convert profile loader to fixed-income rd_type filter**

In `load_fund_profile_data`, replace the FOF-only filter:

```python
df = df[df["rd_type"].isin(["FOF", "FOF-养老"])].copy()
```

with:

```python
fixed_income_mask = df.apply(
    lambda row: is_fixed_income_fund_record(
        row.get("fund_full_name") or row.get("fund_name"),
        row.get("type1"),
        row.get("type2"),
    ),
    axis=1,
)
df = df[fixed_income_mask].copy()
```

Set:

```python
df["fixed_income_type"] = df.apply(
    lambda row: infer_fixed_income_type(row.get("type2") or row.get("rd_type"), row.get("fund_full_name") or row.get("fund_name"), config),
    axis=1,
)
df["fof_type"] = df["fixed_income_type"]
```

- [ ] **Step 8: Rename scale snapshot key while preserving alias**

Rename `build_fof_scale_profile` to `build_fixed_income_scale_profile` and `load_fof_scale_profile_snapshot` to `load_fixed_income_scale_profile_snapshot`.

In `build_snapshot`, include both:

```python
"fixed_income_scale_profile": fixed_income_scale_profile,
"fof_scale_profile": fixed_income_scale_profile,
```

This preserves frontend compatibility during the conversion.

- [ ] **Step 9: Update user-facing Python messages**

Replace script strings:

```text
FOF
fof-tracker
构建 FOF 跟踪系统 snapshot 数据
存量 FOF
```

with fixed-income equivalents where they are printed, documented, or emitted in snapshot notes:

```text
固收基金
fixed-income-fund-tracker
构建固收基金跟踪系统 snapshot 数据
存量固收基金
```

- [ ] **Step 10: Run syntax check**

Run:

```bash
python3 -m py_compile scripts/build_fixed_income_fund_tracker_snapshot.py
```

Expected: exit code `0`.

## Task 5: Convert Frontend Snapshot Loading and Labels

**Files:**
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/index.html`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/app.js`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/styles.css`

- [ ] **Step 1: Update `index.html` metadata and script path**

Replace:

```html
<title>公募FOF基金跟踪系统</title>
```

with:

```html
<title>公募固收基金跟踪系统</title>
```

Replace the description with:

```html
content="跟踪全市场公募固收基金的申报、受理、获批、发行、成立情况，并支持重点基金公司竞争格局观察。"
```

Replace:

```html
<script src="./data/fof_tracker_snapshot.js?v=20260507-ui14"></script>
```

with:

```html
<script src="./data/fixed_income_fund_tracker_snapshot.js?v=20260526-fi1"></script>
```

- [ ] **Step 2: Replace visible FOF labels in `index.html`**

Use direct text replacements:

```text
Public FOF Tracker -> Fixed Income Fund Tracker
公募FOF跟踪系统 -> 公募固收基金跟踪系统
全市场 FOF 竞品情报监控台 -> 全市场固收基金竞品情报监控台
FOF类型 -> 固收类型
存量FOF最新规模画像 -> 存量固收基金最新规模画像
华夏追赶头部前三测算 -> 华夏固收追赶头部前三测算
```

Also replace longer visible phrases containing `FOF` with `固收基金` when they are descriptive text.

- [ ] **Step 3: Update `app.js` snapshot loader**

Replace:

```javascript
const WATCH_STORAGE_KEY = "fof-tracker-watch-companies";
```

with:

```javascript
const WATCH_STORAGE_KEY = "fixed-income-fund-tracker-watch-companies";
```

Replace:

```javascript
if (window.__FOF_TRACKER_SNAPSHOT__) {
  return Promise.resolve(window.__FOF_TRACKER_SNAPSHOT__);
}
return fetch("./data/fof_tracker_snapshot.json").then((resp) => resp.json());
```

with:

```javascript
if (window.__FIXED_INCOME_FUND_TRACKER_SNAPSHOT__) {
  return Promise.resolve(window.__FIXED_INCOME_FUND_TRACKER_SNAPSHOT__);
}
return fetch("./data/fixed_income_fund_tracker_snapshot.json").then((resp) => resp.json());
```

- [ ] **Step 4: Add fixed-income type helper in `app.js`**

Add near `getSlicedProducts()`:

```javascript
function getProductType(product) {
  return product.fixed_income_type || product.fof_type || "其他固收";
}
```

Replace direct user-facing uses of `product.fof_type` with `getProductType(product)` in render logic. Keep backend compatibility by not removing all `fof_type` references if they are part of fallback logic.

- [ ] **Step 5: Replace global slices**

Replace `GLOBAL_SLICES` with:

```javascript
const GLOBAL_SLICES = [
  { key: "all", label: "全部", hint: "全市场视角" },
  { key: "short_bond", label: "短债", hint: "短债与中短债" },
  { key: "pure_bond", label: "中长期纯债", hint: "纯债 / 利率债 / 信用债" },
  { key: "hybrid_bond", label: "混合债", hint: "一级债 / 二级债 / 可转债" },
  { key: "index_bond", label: "指数债基", hint: "被动指数债基 / 债券 ETF" },
  { key: "certificate_deposit", label: "同业存单", hint: "同业存单指数基金" },
  { key: "huaxia_pipeline", label: "华夏在途", hint: "华夏当前推进中" },
];
```

Update `passesGlobalSlice(product)` to:

```javascript
const type = getProductType(product);
if (slice === "short_bond") return type === "短债基金";
if (slice === "pure_bond") return type === "中长期纯债基金";
if (slice === "hybrid_bond") return type === "混合债券型基金";
if (slice === "index_bond") return ["被动指数债基", "债券ETF"].includes(type);
if (slice === "certificate_deposit") return type === "同业存单指数基金";
if (slice === "huaxia_pipeline") return product.fund_company === "华夏" && isInReviewProduct(product);
```

Remove the `ordinary`, `etf`, `pension`, and `huaxia_gap` branches.

- [ ] **Step 6: Update common copy in `app.js`**

Replace visible strings:

```text
FOF -> 固收基金
ETF-FOF -> 债券ETF
养老 FOF -> 同业存单
普通 FOF -> 普通固收
华夏 FOF -> 华夏固收
存量FOF -> 存量固收基金
```

Do not rename function names in this task unless they are trivial constants; keep risk low.

- [ ] **Step 7: Update CSS header comment**

Replace:

```css
FOF Tracker
```

with:

```css
Fixed Income Fund Tracker
```

- [ ] **Step 8: Check remaining visible FOF references**

Run:

```bash
rg -n "FOF|fof_tracker|__FOF|养老FOF|普通FOF|ETF-FOF" index.html app.js styles.css
```

Expected: no `index.html` references. `app.js` may still contain compatibility keys such as `fof_type` only when paired with `fixed_income_type` fallback.

## Task 6: Convert Command Launchers and README

**Files:**
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/一键更新固收基金数据.command`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/一键打开固收基金跟踪.command`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/一键全流程.command`
- Modify: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/README.md`

- [ ] **Step 1: Update update command**

In `一键更新固收基金数据.command`, replace:

```bash
"$ROOT_DIR/scripts/build_fof_tracker_snapshot.py"
```

with:

```bash
"$ROOT_DIR/scripts/build_fixed_income_fund_tracker_snapshot.py"
```

Replace the final message with:

```bash
echo "你现在可以双击“\"一键打开固收基金跟踪.command\"”查看页面。"
```

- [ ] **Step 2: Update open command**

In `一键打开固收基金跟踪.command`, replace:

```bash
PORT="${FOF_TRACKER_PORT:-8766}"
PID_FILE="$ROOT_DIR/.fof_tracker_server.pid"
HTTP_LOG="${FOF_TRACKER_HTTP_LOG:-/tmp/fof_tracker_http.log}"
"$ROOT_DIR/scripts/build_fof_tracker_snapshot.py"
```

with:

```bash
PORT="${FIXED_INCOME_FUND_TRACKER_PORT:-8767}"
PID_FILE="$ROOT_DIR/.fixed_income_fund_tracker_server.pid"
HTTP_LOG="${FIXED_INCOME_FUND_TRACKER_HTTP_LOG:-/tmp/fixed_income_fund_tracker_http.log}"
"$ROOT_DIR/scripts/build_fixed_income_fund_tracker_snapshot.py"
```

- [ ] **Step 3: Update full workflow command**

In `一键全流程.command`, replace:

```bash
PAGES_DIR="${FOF_TRACKER_PAGES_DIR:-$PROJECT_ROOT/fof-tracker-pages}"
"$ROOT_DIR/scripts/build_fof_tracker_snapshot.py"
fof_tracker_snapshot.js
fof_tracker_snapshot.json
更新 FOF 跟踪展示页数据
```

with:

```bash
PAGES_DIR="${FIXED_INCOME_FUND_TRACKER_PAGES_DIR:-$PROJECT_ROOT/fixed-income-fund-tracker-pages}"
"$ROOT_DIR/scripts/build_fixed_income_fund_tracker_snapshot.py"
fixed_income_fund_tracker_snapshot.js
fixed_income_fund_tracker_snapshot.json
更新固收基金跟踪展示页数据
```

- [ ] **Step 4: Replace README with concise fixed-income docs**

Set `README.md` to a concise guide covering:

```markdown
# 公募固收基金跟踪系统

这是一个桌面优先、可本地运行的静态前端系统，用于跟踪全市场公募固收基金的申报、受理、获批、发行、成立情况。

默认固收类型包括短债基金、中长期纯债基金、混合债券型基金、被动指数债基、同业存单指数基金、债券ETF和其他固收。

## 快速使用

- 双击 `一键更新固收基金数据.command`：只生成最新数据。
- 双击 `一键打开固收基金跟踪.command`：生成数据、启动本地服务并打开浏览器。
- 双击 `一键全流程.command`：生成数据并同步展示目录。

## 关键文件

- `config/fixed_income_fund_tracker_config.json`
- `data/fixed_income_fund_stage_source_template.csv`
- `data/fixed_income_fund_soft_signal_template.csv`
- `data/fixed_income_fund_tracker_snapshot.json`
- `data/fixed_income_fund_tracker_snapshot.js`
- `data/fixed_income_fund_tracker_detail.csv`
- `scripts/build_fixed_income_fund_tracker_snapshot.py`

## 命令行

```bash
cd /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker
python3 scripts/build_fixed_income_fund_tracker_snapshot.py
python3 -m http.server 8767
```

打开 `http://127.0.0.1:8767/`。
```

- [ ] **Step 5: Check command executability**

Run:

```bash
ls -l *.command
```

Expected: the three command files are executable. If not, run:

```bash
chmod +x *.command
```

## Task 7: Build and Verification

**Files:**
- Generated: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_tracker_snapshot.json`
- Generated: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_tracker_snapshot.js`
- Generated: `/Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_tracker_detail.csv`

- [ ] **Step 1: Run Python syntax check**

Run:

```bash
python3 -m py_compile scripts/build_fixed_income_fund_tracker_snapshot.py
```

Expected: exit code `0`.

- [ ] **Step 2: Build from template without web supplement**

Run:

```bash
python3 scripts/build_fixed_income_fund_tracker_snapshot.py --disable-web-supplement
```

Expected output includes:

```text
generated json: /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_tracker_snapshot.json
generated js: /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_tracker_snapshot.js
generated csv: /Users/menyao/Documents/trae_projects/fixed-income-fund-tracker/data/fixed_income_fund_tracker_detail.csv
```

- [ ] **Step 3: Inspect generated snapshot contract**

Run:

```bash
python3 -B -c "import json; p='data/fixed_income_fund_tracker_snapshot.json'; d=json.load(open(p, encoding='utf-8')); assert d['products']; assert 'fixed_income_type' in d['products'][0]; assert 'fixed_income_scale_profile' in d['summary']; print(len(d['products']), d['products'][0]['fixed_income_type'])"
```

Expected: prints a product count and one fixed-income type.

- [ ] **Step 4: Start local server**

Run:

```bash
python3 -m http.server 8767
```

Expected: server starts with `Serving HTTP on`.

- [ ] **Step 5: Smoke-test HTTP response in another shell**

Run:

```bash
curl -I http://127.0.0.1:8767/
```

Expected: `HTTP/1.0 200 OK` or `HTTP/1.1 200 OK`.

- [ ] **Step 6: Stop local server**

Stop the `python3 -m http.server 8767` process with `Ctrl-C` in the server shell.

- [ ] **Step 7: Check original project status**

Run in `/Users/menyao/Documents/trae_projects/fof-tracker`:

```bash
git status --short
```

Expected: no new changes from implementation except the already committed design and plan work. Existing unrelated dirty files may remain.
