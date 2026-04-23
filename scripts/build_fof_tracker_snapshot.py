#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
公募FOF基金跟踪系统数据构建脚本

默认模式：
1. 优先读取 fof-tracker 目录下的 4 个业务 Excel
2. 自动提取 FOF 的申报、受理、获批、发行、成立数据
3. 输出前端可直接使用的 snapshot JSON / JS / CSV

兜底模式：
如果找不到 4 个 Excel，则退回读取 data/fof_stage_source_template.csv
"""

import argparse
import hashlib
import json
import re
import warnings
from collections import OrderedDict
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    import pandas as pd
except ModuleNotFoundError as exc:
    raise SystemExit("缺少依赖 pandas。请先安装后再运行构建脚本，例如：python3 -m pip install pandas openpyxl") from exc

warnings.filterwarnings(
    "ignore",
    message="Workbook contains no default style, apply openpyxl's default",
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "fof_tracker_config.json"
DEFAULT_JSON = ROOT / "data" / "fof_tracker_snapshot.json"
DEFAULT_JS = ROOT / "data" / "fof_tracker_snapshot.js"
DEFAULT_CSV = ROOT / "data" / "fof_tracker_detail.csv"
DEFAULT_TEMPLATE = ROOT / "data" / "fof_stage_source_template.csv"
DEFAULT_SOFT_INTEL_FILE = ROOT / "data" / "fof_soft_signal_template.csv"
DEFAULT_PROFILE_FILE = ROOT / "fund_profile_20260331.xlsx"

DEFAULT_DECLARE_FILE = ROOT / "全行业新基金申报统计 (3).xlsx"
DEFAULT_ISSUE_FILE = ROOT / "基金发行统计_募集.xlsx"
DEFAULT_ESTABLISH_FILE = ROOT / "基金发行统计_成立 (1).xlsx"
DEFAULT_APPROVAL_FILE = ROOT / "基金获批情况统计（万得）.xlsx"
DEFAULT_CSRC_PROGRESS_API = "https://neris.csrc.gov.cn/alappr-delare/home/approval-progress/v1/list"

FILE_MATCH_RULES = {
    "declare": [["全行业新基金申报统计"]],
    "issue": [["基金发行统计", "募集"]],
    "establish": [["基金发行统计", "成立"]],
    "approval": [["基金获批情况统计", "万得"], ["基金获批情况统计"]],
    "profile": [["fundprofile"], ["fund", "profile"]],
}

STAGE_ORDER = [
    ("declare_date", "新申报"),
    ("accept_date", "新受理"),
    ("approval_date", "已获批"),
    ("issue_start_date", "发行中"),
    ("establish_date", "已成立"),
]

DISPLAY_STAGE_KEYS = OrderedDict([
    ("declare", ("新申报FOF产品", "declare_date")),
    ("accept", ("新受理FOF产品", "accept_date")),
    ("approval", ("新获批FOF产品", "approval_date")),
    ("establish", ("新成立FOF产品", "establish_date")),
])

STAGE_FIELD_BY_NAME = {
    "新申报": "declare_date",
    "新受理": "accept_date",
    "已获批": "approval_date",
    "发行中": "issue_start_date",
    "已成立": "establish_date",
}

IN_REVIEW_STAGES = ("新申报", "新受理", "已获批")
PREDICTABLE_STAGES = ("新申报", "新受理", "已获批", "发行中")
NEXT_STAGE_RULES = OrderedDict([
    ("新申报", ("新受理", "declare_to_accept_days", "declare_date")),
    ("新受理", ("已获批", "accept_to_approval_days", "accept_date")),
    ("已获批", ("发行中", "approval_to_issue_days", "approval_date")),
    ("发行中", ("已成立", "issue_to_establish_days", "issue_start_date")),
])
MACRO_CLOCK_LIBRARY = {
    "复苏期": {
        "description": "风险偏好通常抬升，积极型、权益型与 ETF-FOF 更容易成为竞品加速布局的方向。",
        "watch_risk_buckets": ["积极", "平衡"],
        "watch_tags": ["ETF-FOF", "积极配置", "多资产", "平衡"],
        "action_hint": "优先关注积极型 / ETF-FOF / 多资产赛道的在途与申报节奏，避免错过行情窗口。",
        "tone": "warm",
    },
    "过热期": {
        "description": "高弹性产品容易继续吸引注意，但也需要同步关注风险承接与回撤控制。",
        "watch_risk_buckets": ["积极"],
        "watch_tags": ["ETF-FOF", "积极配置"],
        "action_hint": "一边跟踪进攻型产品，一边留意稳健承接类产品是否被头部公司提前补位。",
        "tone": "hot",
    },
    "滞胀期": {
        "description": "震荡与分化环境下，多资产、平衡与稳健型 FOF 更容易承接资金。",
        "watch_risk_buckets": ["稳健", "平衡"],
        "watch_tags": ["稳健", "多元配置", "多资产", "平衡"],
        "action_hint": "把注意力放在稳健、多资产和平衡型产品的审批与发行节奏上。",
        "tone": "cool",
    },
    "衰退期": {
        "description": "防守需求上升时，养老与稳健型 FOF 的配置意义通常更突出。",
        "watch_risk_buckets": ["养老", "稳健"],
        "watch_tags": ["养老", "稳健"],
        "action_hint": "优先高亮养老 / 稳健型 FOF 的在途与新申报动作，关注头部公司的防守型补位。",
        "tone": "defensive",
    },
    "待配置": {
        "description": "当前尚未指定投资时钟阶段，系统仅展示可配置的赛道映射规则。",
        "watch_risk_buckets": [],
        "watch_tags": [],
        "action_hint": "可在 config/fof_tracker_config.json 中填写 macro_clock.current_regime 来启用联动高亮。",
        "tone": "neutral",
    },
}


def parse_args():
    parser = argparse.ArgumentParser(description="构建 FOF 跟踪系统 snapshot 数据")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="配置文件 JSON")
    parser.add_argument("--output-json", default=str(DEFAULT_JSON), help="输出 JSON")
    parser.add_argument("--output-js", default=str(DEFAULT_JS), help="输出 JS")
    parser.add_argument("--output-csv", default=str(DEFAULT_CSV), help="输出明细 CSV")
    parser.add_argument("--as-of-date", help="手动指定统计截止日，格式 YYYY-MM-DD")
    parser.add_argument("--template", default=str(DEFAULT_TEMPLATE), help="模板 CSV 路径")
    parser.add_argument("--soft-intel-file", default=str(DEFAULT_SOFT_INTEL_FILE), help="软信息 CSV 路径")
    parser.add_argument("--declare-file", default=str(DEFAULT_DECLARE_FILE), help="申报统计 Excel")
    parser.add_argument("--issue-file", default=str(DEFAULT_ISSUE_FILE), help="发行募集 Excel")
    parser.add_argument("--establish-file", default=str(DEFAULT_ESTABLISH_FILE), help="成立统计 Excel")
    parser.add_argument("--approval-file", default=str(DEFAULT_APPROVAL_FILE), help="获批统计 Excel")
    parser.add_argument("--profile-file", default=str(DEFAULT_PROFILE_FILE), help="基金画像 / 最新规模 Excel")
    parser.add_argument("--csrc-progress-api", default=str(DEFAULT_CSRC_PROGRESS_API), help="证监会公开审批进度接口")
    parser.add_argument("--web-recent-days", type=int, default=62, help="网页补充数据抓取近多少天，默认62天")
    parser.add_argument("--web-page-size", type=int, default=200, help="网页补充数据单页大小，默认200")
    parser.add_argument("--disable-web-supplement", action="store_true", help="关闭网页补充数据")
    parser.add_argument("--cleanup-old-excels", action="store_true", help="成功生成数据后，自动删除同类旧版本 Excel")
    return parser.parse_args()


def load_config(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def safe_text(value):
    if value is None or pd.isnull(value):
        return ""
    return str(value).strip()


def normalize_filename_text(value):
    text = safe_text(value)
    replacements = [" ", "　", "（", "）", "(", ")", "[", "]", "-", "_"]
    for repl in replacements:
        text = text.replace(repl, "")
    return text.lower()


def parse_date(value):
    if value is None or pd.isnull(value):
        return pd.NaT
    return pd.to_datetime(value, errors="coerce")


def resolve_business_file(path_str, file_type):
    path = Path(path_str)
    if path.exists():
        return path

    parent = path.parent if str(path.parent) not in ("", ".") else ROOT
    if not parent.exists():
        return path

    rules = FILE_MATCH_RULES.get(file_type, [])
    candidates = []
    for candidate in parent.glob("*.xlsx"):
        normalized = normalize_filename_text(candidate.stem)
        for keywords in rules:
            if all(normalize_filename_text(keyword) in normalized for keyword in keywords):
                candidates.append(candidate)
                break

    if not candidates:
        return path

    candidates = sorted(candidates, key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
    return candidates[0]


def find_matching_business_files(path_str, file_type):
    path = Path(path_str)
    parent = path.parent if str(path.parent) not in ("", ".") else ROOT
    if not parent.exists():
        return []

    rules = FILE_MATCH_RULES.get(file_type, [])
    candidates = []
    for candidate in parent.glob("*.xlsx"):
        normalized = normalize_filename_text(candidate.stem)
        for keywords in rules:
            if all(normalize_filename_text(keyword) in normalized for keyword in keywords):
                candidates.append(candidate)
                break
    return sorted(candidates, key=lambda p: (p.stat().st_mtime, p.name), reverse=True)


def cleanup_old_business_files(file_map):
    deleted = []
    for file_type, selected in file_map.items():
        if selected is None:
            continue
        source_arg = {
            "declare": str(DEFAULT_DECLARE_FILE),
            "issue": str(DEFAULT_ISSUE_FILE),
            "establish": str(DEFAULT_ESTABLISH_FILE),
            "approval": str(DEFAULT_APPROVAL_FILE),
        }[file_type]
        for candidate in find_matching_business_files(source_arg, file_type):
            if candidate.resolve() == selected.resolve():
                continue
            try:
                candidate.unlink()
                deleted.append(candidate.name)
            except Exception:
                pass
    return deleted


def format_date(value):
    if value is None or pd.isnull(value):
        return None
    return pd.Timestamp(value).strftime("%Y-%m-%d")


def parse_date_from_text(value):
    text = safe_text(value)
    match = re.search(r"(\d{4})[-/]?(\d{2})[-/]?(\d{2})", text)
    if not match:
        return pd.NaT
    return pd.Timestamp("%s-%s-%s" % (match.group(1), match.group(2), match.group(3)))


def normalize_company_name(name):
    text = safe_text(name)
    text = text.replace("（", "(").replace("）", ")")
    text = text.replace(" ", "")
    replacements = [
        "基金管理有限公司",
        "基金管理股份有限公司",
        "基金管理有限责任公司",
        "基金管理",
        "基金",
    ]
    for repl in replacements:
        if text.endswith(repl):
            text = text[: -len(repl)]
            break
    return text.strip()


def normalize_fund_name(name):
    text = safe_text(name)
    text = text.replace("（", "(").replace("）", ")")
    text = text.replace("－", "-").replace("—", "-").replace("–", "-")
    text = text.replace(" ", "")
    text = text.replace("（FOF）", "(FOF)")
    text = text.replace("基金中基金(FOF)", "基金中基金(FOF)")
    return text.upper()


def is_fof_record(name, type1="", type2=""):
    name_text = safe_text(name).upper()
    t1 = safe_text(type1).upper()
    t2 = safe_text(type2).upper()
    keys = ["FOF", "基金中基金", "养老目标", "养老"]
    if any(k.upper() in name_text for k in keys):
        return True
    if "FOF" in t1 or "FOF" in t2:
        return True
    return False


def pick_as_of_date(config, datasets):
    cfg_date = parse_date(config.get("as_of_date"))
    dates = [cfg_date] if pd.notnull(cfg_date) else []
    for df in datasets:
        if df is None or df.empty:
            continue
        for col in ["declare_date", "accept_date", "approval_date", "issue_start_date", "establish_date"]:
            if col in df.columns:
                valid = pd.to_datetime(df[col], errors="coerce").dropna()
                if len(valid) > 0:
                    dates.append(valid.max())
    today = pd.Timestamp.today().normalize()
    if dates:
        return min(max(dates).normalize(), today)
    return today


def resolve_as_of_date(config, datasets, as_of_date_override=None):
    auto_date = pick_as_of_date(config, datasets)
    raw_override = safe_text(as_of_date_override)
    if raw_override == "":
        return auto_date, auto_date, "auto"

    override_date = parse_date(raw_override)
    if pd.isnull(override_date):
        raise ValueError("无法解析 --as-of-date，请使用 YYYY-MM-DD 格式，例如 2026-04-18")

    override_date = override_date.normalize()
    today = pd.Timestamp.today().normalize()
    if override_date > today:
        raise ValueError("--as-of-date 不能晚于今天（%s）" % format_date(today))

    return override_date, auto_date, "manual"


def read_business_excel(path, header_row, sheet_name=None):
    return pd.read_excel(str(path), sheet_name=sheet_name or 0, header=header_row)


def load_declare_accept_data(path):
    df = read_business_excel(path, header_row=5)
    rename_map = {
        "基金管理人": "fund_company_raw",
        "基金名称": "fund_name",
        "类型一": "type1",
        "类型二": "type2",
        "材料接收日": "declare_date",
        "材料受理日": "accept_date",
        "申请事项": "apply_item",
        "任务名称": "task_name",
        "完成日期": "task_finish_date",
    }
    df = df.rename(columns=rename_map)
    need_cols = ["fund_company_raw", "fund_name", "type1", "type2", "declare_date", "accept_date", "apply_item", "task_name"]
    for col in need_cols:
        if col not in df.columns:
            df[col] = None
    df = df[need_cols].copy()
    df["fund_name"] = df["fund_name"].apply(safe_text)
    df["fund_company_raw"] = df["fund_company_raw"].apply(safe_text)
    df["type1"] = df["type1"].apply(safe_text)
    df["type2"] = df["type2"].apply(safe_text)
    df = df[df["fund_name"] != ""].copy()
    df = df[df.apply(lambda x: is_fof_record(x["fund_name"], x["type1"], x["type2"]), axis=1)].copy()
    df["declare_date"] = df["declare_date"].apply(parse_date)
    df["accept_date"] = df["accept_date"].apply(parse_date)
    df["fund_company"] = df["fund_company_raw"].apply(normalize_company_name)
    return df


def load_approval_data(path):
    df = read_business_excel(path, header_row=2)
    rename_map = {
        "产品名称": "fund_name",
        "管理人": "fund_company_raw",
        "材料接收日": "declare_date",
        "决定日": "approval_date",
        "备注": "remarks",
    }
    df = df.rename(columns=rename_map)
    for col in ["fund_name", "fund_company_raw", "declare_date", "approval_date", "remarks"]:
        if col not in df.columns:
            df[col] = None
    df = df[["fund_name", "fund_company_raw", "declare_date", "approval_date", "remarks"]].copy()
    df["fund_name"] = df["fund_name"].apply(safe_text)
    df["fund_company_raw"] = df["fund_company_raw"].apply(safe_text)
    df = df[df["fund_name"] != ""].copy()
    df = df[df["fund_name"].apply(lambda x: is_fof_record(x))].copy()
    df["declare_date"] = df["declare_date"].apply(parse_date)
    df["approval_date"] = df["approval_date"].apply(parse_date)
    df["fund_company"] = df["fund_company_raw"].apply(normalize_company_name)
    return df


def fetch_json(url, timeout=25):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        payload = response.read()
    return json.loads(payload.decode("utf-8"))


def extract_fund_name_from_title(title):
    text = safe_text(title).replace("（", "(").replace("）", ")").strip()
    if text == "":
        return ""
    for separator in ["——", "—", "-"]:
        if separator in text:
            left, right = text.split(separator, 1)
            if "申请" in left or "注册" in left or "变更" in left or "募集" in left:
                return right.strip()
    return text


def parse_csrc_show_content(show_cntnt):
    text = safe_text(show_cntnt).replace("（", "(").replace("）", ")")
    fund_company_raw = ""
    fund_name = ""
    if text.startswith("关于") and "的《" in text and "《" in text and "》" in text:
        fund_company_raw = text[2:text.index("的《")]
        inner = text[text.index("《") + 1:text.rindex("》")]
        fund_name = extract_fund_name_from_title(inner)
    return fund_company_raw, fund_name


def load_csrc_web_supplement(config, args):
    if args.disable_web_supplement:
        return pd.DataFrame(), pd.DataFrame()

    ref_date = parse_date(config.get("as_of_date"))
    if pd.isnull(ref_date):
        ref_date = pd.Timestamp.today().normalize()
    cutoff = ref_date.normalize() - timedelta(days=max(int(args.web_recent_days), 1) - 1)

    keywords = ["FOF", "基金中基金"]
    seen_codes = set()
    declare_rows = []
    approval_rows = []

    for keyword in keywords:
        page_num = 1
        while True:
            params = {
                "queryCondition": keyword,
                "pageNum": page_num,
                "pageSize": int(args.web_page_size),
            }
            url = "%s?%s" % (args.csrc_progress_api, urlencode(params))
            payload = fetch_json(url)
            data = payload.get("data") or {}
            records = data.get("records") or []
            if not records:
                break

            oldest_app_date = None
            for item in records:
                app_date = parse_date(item.get("appDate"))
                if pd.notnull(app_date):
                    oldest_app_date = app_date if pd.isnull(oldest_app_date) else min(oldest_app_date, app_date)

                record_code = safe_text(item.get("alAppLtCde"))
                if record_code and record_code in seen_codes:
                    continue

                fund_company_raw, fund_name = parse_csrc_show_content(item.get("showCntnt"))
                if not is_fof_record(fund_name):
                    continue

                if pd.notnull(app_date) and app_date < cutoff:
                    continue

                if record_code:
                    seen_codes.add(record_code)

                declare_date = pd.NaT
                accept_date = pd.NaT
                approval_date = pd.NaT
                task_names = []
                for task in item.get("aprvSchdPubFlowViewResultList") or []:
                    task_name = safe_text(task.get("taskName"))
                    finish_date = parse_date(task.get("fnshDate"))
                    if task_name:
                        task_names.append(task_name)
                    if "接收材料" in task_name:
                        declare_date = choose_date(declare_date, finish_date, "min")
                    elif "受理" in task_name:
                        accept_date = choose_date(accept_date, finish_date, "min")
                    elif any(key in task_name for key in ["行政许可决定书", "注册批复", "予以注册", "核准", "决定书"]):
                        approval_date = choose_date(approval_date, finish_date, "min")

                if pd.isnull(declare_date) and pd.notnull(app_date):
                    declare_date = app_date

                declare_rows.append({
                    "fund_company_raw": fund_company_raw,
                    "fund_name": fund_name,
                    "type1": "FOF",
                    "type2": "",
                    "declare_date": declare_date,
                    "accept_date": accept_date,
                    "apply_item": safe_text(item.get("showCntnt")),
                    "task_name": "、".join(task_names),
                    "fund_company": normalize_company_name(fund_company_raw),
                })

                if pd.notnull(approval_date):
                    approval_rows.append({
                        "fund_name": fund_name,
                        "fund_company_raw": fund_company_raw,
                        "declare_date": declare_date,
                        "approval_date": approval_date,
                        "remarks": "、".join(task_names),
                        "fund_company": normalize_company_name(fund_company_raw),
                    })

            if len(records) < int(args.web_page_size):
                break
            if pd.notnull(oldest_app_date) and oldest_app_date < cutoff:
                break
            page_num += 1

    declare_df = pd.DataFrame(declare_rows)
    approval_df = pd.DataFrame(approval_rows)
    return declare_df, approval_df


def load_issue_data(path):
    df = read_business_excel(path, header_row=6)
    rename_map = {
        "基金名称": "fund_name",
        "管理人": "fund_company_raw",
        "托管行": "custodian",
        "发行状态": "issue_status",
        "基金经理": "manager",
        "募集起始日期": "issue_start_date",
        "募集结束日期": "issue_end_date",
        "类型一": "type1",
        "类型二": "type2",
        "总募集份额": "raise_scale",
    }
    df = df.rename(columns=rename_map)
    for col in ["fund_name", "fund_company_raw", "custodian", "issue_status", "manager", "issue_start_date", "issue_end_date", "type1", "type2", "raise_scale"]:
        if col not in df.columns:
            df[col] = None
    df = df[["fund_name", "fund_company_raw", "custodian", "issue_status", "manager", "issue_start_date", "issue_end_date", "type1", "type2", "raise_scale"]].copy()
    df["fund_name"] = df["fund_name"].apply(safe_text)
    df["fund_company_raw"] = df["fund_company_raw"].apply(safe_text)
    df["type1"] = df["type1"].apply(safe_text)
    df["type2"] = df["type2"].apply(safe_text)
    df = df[df["fund_name"] != ""].copy()
    df = df[df.apply(lambda x: is_fof_record(x["fund_name"], x["type1"], x["type2"]), axis=1)].copy()
    df["issue_start_date"] = df["issue_start_date"].apply(parse_date)
    df["issue_end_date"] = df["issue_end_date"].apply(parse_date)
    df["raise_scale"] = pd.to_numeric(df["raise_scale"], errors="coerce")
    df["fund_company"] = df["fund_company_raw"].apply(normalize_company_name)
    return df


def load_establish_data(path):
    df = read_business_excel(path, header_row=6)
    rename_map = {
        "基金名称": "fund_name",
        "管理人": "fund_company_raw",
        "托管行": "custodian",
        "发行阶段": "issue_stage",
        "基金经理": "manager",
        "成立日期": "establish_date",
        "募集开始日期": "issue_start_date",
        "募集截止日/计划募集截止日": "issue_end_date",
        "募集份额（AC合并）": "raise_scale",
        "类型I": "type1",
        "类型II": "type2",
    }
    df = df.rename(columns=rename_map)
    for col in ["fund_name", "fund_company_raw", "custodian", "issue_stage", "manager", "establish_date", "issue_start_date", "issue_end_date", "raise_scale", "type1", "type2"]:
        if col not in df.columns:
            df[col] = None
    df = df[["fund_name", "fund_company_raw", "custodian", "issue_stage", "manager", "establish_date", "issue_start_date", "issue_end_date", "raise_scale", "type1", "type2"]].copy()
    df["fund_name"] = df["fund_name"].apply(safe_text)
    df["fund_company_raw"] = df["fund_company_raw"].apply(safe_text)
    df["type1"] = df["type1"].apply(safe_text)
    df["type2"] = df["type2"].apply(safe_text)
    df = df[df["fund_name"] != ""].copy()
    df = df[df.apply(lambda x: is_fof_record(x["fund_name"], x["type1"], x["type2"]), axis=1)].copy()
    df["establish_date"] = df["establish_date"].apply(parse_date)
    df["issue_start_date"] = df["issue_start_date"].apply(parse_date)
    df["issue_end_date"] = df["issue_end_date"].apply(parse_date)
    df["raise_scale"] = pd.to_numeric(df["raise_scale"], errors="coerce")
    df["fund_company"] = df["fund_company_raw"].apply(normalize_company_name)
    return df


def load_template_data(path, config):
    df = pd.read_csv(str(path))
    mapping = {
        "产品ID": "product_id",
        "基金名称": "fund_name",
        "基金公司": "fund_company",
        "FOF类型": "fof_type",
        "申报日期": "declare_date",
        "受理日期": "accept_date",
        "获批日期": "approval_date",
        "发行起始日": "issue_start_date",
        "成立日": "establish_date",
        "募集规模(亿元)": "raise_scale",
        "托管人": "custodian",
        "备注": "remarks",
    }
    df = df.rename(columns=mapping)
    for col in mapping.values():
        if col not in df.columns:
            df[col] = None
    for col in ["declare_date", "accept_date", "approval_date", "issue_start_date", "establish_date"]:
        df[col] = df[col].apply(parse_date)
    df["raise_scale"] = pd.to_numeric(df["raise_scale"], errors="coerce")
    df["fund_company"] = df["fund_company"].apply(normalize_company_name)
    df["fof_type"] = df["fof_type"].apply(lambda x: infer_fof_type(x, "", config))
    return df


def load_soft_intel_data(path):
    path = Path(path)
    if not path.exists():
        return pd.DataFrame()

    df = pd.read_csv(str(path))
    mapping = {
        "产品ID": "product_id",
        "基金名称": "fund_name",
        "基金公司": "fund_company",
        "拟发渠道": "launch_channels",
        "渠道状态": "channel_status",
        "持有人结构预判": "holder_structure_view",
        "底层选基偏好": "underlying_preference",
        "底层池准备建议": "underlying_pool_action",
        "情报等级": "intelligence_level",
        "最近更新日": "intel_last_update",
        "备注": "intel_note",
    }
    df = df.rename(columns=mapping)
    for col in mapping.values():
        if col not in df.columns:
            df[col] = None
    df = df[list(mapping.values())].copy()
    for col in [
        "product_id",
        "fund_name",
        "fund_company",
        "launch_channels",
        "channel_status",
        "holder_structure_view",
        "underlying_preference",
        "underlying_pool_action",
        "intelligence_level",
        "intel_note",
    ]:
        df[col] = df[col].apply(safe_text)
    df["fund_company"] = df["fund_company"].apply(normalize_company_name)
    df["fund_name_key"] = df["fund_name"].apply(normalize_fund_name)
    df["intel_last_update"] = df["intel_last_update"].apply(parse_date)
    has_content = (
        df["product_id"].ne("")
        | df["fund_name"].ne("")
        | df["launch_channels"].ne("")
        | df["holder_structure_view"].ne("")
        | df["underlying_preference"].ne("")
        | df["underlying_pool_action"].ne("")
    )
    return df[has_content].reset_index(drop=True)


def detect_fund_profile_sheet(path):
    workbook = pd.ExcelFile(str(path))
    for sheet_name in workbook.sheet_names:
        if "基金画像" in safe_text(sheet_name):
            return workbook, sheet_name
    return workbook, workbook.sheet_names[0]


def detect_latest_profile_columns(columns):
    scale_candidates = []
    repaired_candidates = []
    for col in columns:
        col_text = safe_text(col)
        parsed_date = parse_date_from_text(col_text)
        if "基金规模合计" in col_text and "交易日期" in col_text and pd.notnull(parsed_date):
            scale_candidates.append((parsed_date, col))
        if "是否缺失最新规模数据" in col_text:
            repaired_candidates.append((parsed_date, col))

    if not scale_candidates:
        raise ValueError("基金画像表中未识别到“基金规模合计[交易日期]”列")

    scale_candidates = sorted(scale_candidates, key=lambda x: x[0], reverse=True)
    latest_scale_date, latest_scale_col = scale_candidates[0]
    prev_scale_col = scale_candidates[1][1] if len(scale_candidates) > 1 else None
    prev_scale_date = scale_candidates[1][0] if len(scale_candidates) > 1 else pd.NaT

    repaired_col = None
    repaired_candidates = [item for item in repaired_candidates if pd.notnull(item[0])]
    if repaired_candidates:
        repaired_candidates = sorted(repaired_candidates, key=lambda x: x[0], reverse=True)
        repaired_col = repaired_candidates[0][1]

    return latest_scale_col, latest_scale_date, prev_scale_col, prev_scale_date, repaired_col


def load_fund_profile_data(path):
    workbook, sheet_name = detect_fund_profile_sheet(path)
    df = pd.read_excel(workbook, sheet_name=sheet_name)
    latest_scale_col, latest_scale_date, prev_scale_col, prev_scale_date, repaired_col = detect_latest_profile_columns(df.columns)

    rename_map = {
        "证券代码": "security_code",
        "证券简称": "fund_name",
        "基金全称": "fund_full_name",
        "基金成立日": "fund_establish_date",
        "基金管理人": "fund_company_raw",
        "投资类型(一级分类)": "type1",
        "投资类型(二级分类)": "type2",
        "研发类型": "rd_type",
    }
    df = df.rename(columns=rename_map)
    for col in rename_map.values():
        if col not in df.columns:
            df[col] = None

    df["rd_type"] = df["rd_type"].apply(safe_text)
    df = df[df["rd_type"].isin(["FOF", "FOF-养老"])].copy()
    df["security_code"] = df["security_code"].apply(safe_text)
    df["fund_name"] = df["fund_name"].apply(safe_text)
    df["fund_full_name"] = df["fund_full_name"].apply(safe_text)
    df["fund_company_raw"] = df["fund_company_raw"].apply(safe_text)
    df["fund_company"] = df["fund_company_raw"].apply(normalize_company_name)
    df["fof_type"] = df["rd_type"].apply(lambda x: "养老FOF" if "养老" in safe_text(x) else "普通FOF")
    df["latest_scale"] = pd.to_numeric(df[latest_scale_col], errors="coerce")
    if prev_scale_col is None:
        df["prev_scale"] = None
    else:
        df["prev_scale"] = pd.to_numeric(df[prev_scale_col], errors="coerce")
    if repaired_col is None:
        df["is_repaired_scale"] = False
    else:
        df["is_repaired_scale"] = df[repaired_col].fillna(0).apply(lambda x: str(x).strip() in ("1", "1.0", "True", "true"))

    df = df[
        [
            "security_code",
            "fund_name",
            "fund_full_name",
            "fund_company",
            "fof_type",
            "rd_type",
            "latest_scale",
            "prev_scale",
            "is_repaired_scale",
        ]
    ].copy()
    return df, {
        "sheet_name": sheet_name,
        "scale_as_of_date": format_date(latest_scale_date),
        "prev_scale_as_of_date": format_date(prev_scale_date),
    }


def infer_fof_type(raw_type, fund_name, config):
    type_text = safe_text(raw_type)
    if type_text:
        return type_text
    name = safe_text(fund_name)
    upper = name.upper()
    for keyword in config.get("fof_type_mapping", {}).get("etf_fof_keywords", []):
        if keyword.upper() in upper:
            return "ETF-FOF"
    for keyword in config.get("fof_type_mapping", {}).get("retirement_keywords", []):
        if keyword in name:
            return "养老FOF"
    return "普通FOF"


def extract_holding_bucket(name):
    text = safe_text(name)
    if re.search(r"(九十天|90天|三个月|3个月)", text):
        return "3个月持有"
    if re.search(r"(六个月|6个月|180天|半年)", text):
        return "6个月持有"
    if re.search(r"(一年|1年|两年|2年|三年|3年)", text):
        return "1年及以上"
    return "其他持有"


def extract_risk_bucket(name):
    text = safe_text(name)
    if "养老" in text:
        return "养老"
    if re.search(r"(积极|进取)", text):
        return "积极"
    if re.search(r"(平衡|均衡)", text):
        return "平衡"
    if re.search(r"(稳健|稳享|稳晖|稳盈|悦信稳健|安盈|安悦)", text):
        return "稳健"
    if re.search(r"(多资产|多元配置|多元|配置|优选)", text):
        return "平衡"
    return "平衡"


def build_strategy_signature(fund_name, fof_type=""):
    name = safe_text(fund_name)
    fof_type_text = safe_text(fof_type) or "普通FOF"
    holding_bucket = extract_holding_bucket(name)
    risk_bucket = extract_risk_bucket(name)
    is_etf = bool(re.search(r"ETF-FOF|ETF FOF|ETFFOF", name, flags=re.IGNORECASE)) or fof_type_text == "ETF-FOF"
    base_type = "ETF-FOF" if is_etf else fof_type_text
    tags = []
    for tag in [base_type, risk_bucket, holding_bucket]:
        if tag and tag not in tags and tag != "其他持有":
            tags.append(tag)
    if is_etf and "ETF-FOF" not in tags:
        tags.append("ETF-FOF")
    return {
        "fof_type": fof_type_text,
        "display_type": base_type,
        "risk_bucket": risk_bucket,
        "holding_bucket": holding_bucket,
        "is_etf": is_etf,
        "segment_key": "%s|%s|%s|%s" % (base_type, risk_bucket, holding_bucket, "ETF" if is_etf else "STD"),
        "segment_label": "%s · %s · %s" % (base_type, risk_bucket, holding_bucket),
        "tags": tags,
    }


def append_ranked_item(target_list, item, rank_key="latest_event_date", limit=3):
    if item is None:
        return
    target_list.append(item)
    target_list.sort(key=lambda x: safe_text(x.get(rank_key)), reverse=True)
    del target_list[limit:]


def duration_value(row, metric_key):
    if metric_key in ("declare_to_accept_days", "accept_to_approval_days", "issue_to_establish_days", "approval_to_issue_days"):
        value = row.get(metric_key)
        if value is None or pd.isnull(value):
            return None
        return int(value)

    if metric_key == "declare_to_establish_days":
        declare_date = parse_date(row.get("declare_date"))
        establish_date = parse_date(row.get("establish_date"))
        if pd.isnull(declare_date) or pd.isnull(establish_date):
            return None
        return int((establish_date - declare_date).days)
    return None


def average_int(values):
    clean = [int(v) for v in values if v is not None and not pd.isnull(v)]
    if not clean:
        return None
    return round(sum(clean) / len(clean), 1)


def blank_record():
    return {
        "product_id": None,
        "fund_name": None,
        "fund_company": None,
        "fof_type": None,
        "is_key_company": False,
        "declare_date": pd.NaT,
        "accept_date": pd.NaT,
        "approval_date": pd.NaT,
        "issue_start_date": pd.NaT,
        "establish_date": pd.NaT,
        "raise_scale": None,
        "custodian": None,
        "current_stage": None,
        "days_in_stage": None,
        "latest_event_date": pd.NaT,
        "remarks": None,
        "declare_to_accept_days": None,
        "accept_to_approval_days": None,
        "approval_to_issue_days": None,
        "issue_to_establish_days": None,
        "launch_channels": None,
        "channel_status": None,
        "holder_structure_view": None,
        "underlying_preference": None,
        "underlying_pool_action": None,
        "intelligence_level": None,
        "intel_last_update": pd.NaT,
        "intel_note": None,
    }


def serialize_profile_record(row):
    latest_scale = row.get("latest_scale")
    prev_scale = row.get("prev_scale")
    if prev_scale is None or pd.isnull(prev_scale):
        scale_change = None
    elif latest_scale is None or pd.isnull(latest_scale):
        scale_change = None
    else:
        scale_change = round(float(latest_scale) - float(prev_scale), 2)
    profile = build_strategy_signature(row.get("fund_name") or row.get("fund_full_name"), row.get("fof_type"))
    return {
        "security_code": safe_text(row.get("security_code")) or None,
        "fund_name": safe_text(row.get("fund_name")) or safe_text(row.get("fund_full_name")) or None,
        "fund_full_name": safe_text(row.get("fund_full_name")) or None,
        "fund_company": safe_text(row.get("fund_company")) or None,
        "fof_type": safe_text(row.get("fof_type")) or None,
        "latest_scale": None if latest_scale is None or pd.isnull(latest_scale) else round(float(latest_scale), 2),
        "prev_scale": None if prev_scale is None or pd.isnull(prev_scale) else round(float(prev_scale), 2),
        "scale_change": scale_change,
        "is_repaired_scale": bool(row.get("is_repaired_scale")),
        "holding_bucket": profile["holding_bucket"],
        "risk_bucket": profile["risk_bucket"],
        "strategy_segment_key": profile["segment_key"],
        "strategy_segment_label": profile["segment_label"],
        "strategy_tags": profile["tags"],
    }


def choose_text(current, candidate):
    current_text = safe_text(current)
    candidate_text = safe_text(candidate)
    if candidate_text == "":
        return current
    if current_text == "":
        return candidate_text
    return candidate_text if len(candidate_text) > len(current_text) else current


def choose_date(current, candidate, pick="min"):
    current_dt = parse_date(current)
    candidate_dt = parse_date(candidate)
    if pd.isnull(candidate_dt):
        return current_dt
    if pd.isnull(current_dt):
        return candidate_dt
    return min(current_dt, candidate_dt) if pick == "min" else max(current_dt, candidate_dt)


def merge_records(config, declare_df, approval_df, issue_df, establish_df):
    merged = OrderedDict()

    def touch_record(name):
        key = normalize_fund_name(name)
        if key not in merged:
            merged[key] = blank_record()
            merged[key]["product_id"] = "FOF_" + hashlib.md5(key.encode("utf-8")).hexdigest()[:10]
        return key, merged[key]

    for _, row in declare_df.iterrows():
        key, rec = touch_record(row["fund_name"])
        rec["fund_name"] = choose_text(rec["fund_name"], row["fund_name"])
        rec["fund_company"] = choose_text(rec["fund_company"], row["fund_company"])
        rec["declare_date"] = choose_date(rec["declare_date"], row["declare_date"], "min")
        rec["accept_date"] = choose_date(rec["accept_date"], row["accept_date"], "min")
        rec["fof_type"] = choose_text(rec["fof_type"], infer_fof_type("", row["fund_name"], config))
        rec["remarks"] = choose_text(rec["remarks"], safe_text(row.get("task_name")))

    for _, row in approval_df.iterrows():
        key, rec = touch_record(row["fund_name"])
        rec["fund_name"] = choose_text(rec["fund_name"], row["fund_name"])
        rec["fund_company"] = choose_text(rec["fund_company"], row["fund_company"])
        rec["declare_date"] = choose_date(rec["declare_date"], row["declare_date"], "min")
        rec["approval_date"] = choose_date(rec["approval_date"], row["approval_date"], "min")
        rec["fof_type"] = choose_text(rec["fof_type"], infer_fof_type("", row["fund_name"], config))
        rec["remarks"] = choose_text(rec["remarks"], safe_text(row.get("remarks")))

    for _, row in issue_df.iterrows():
        key, rec = touch_record(row["fund_name"])
        rec["fund_name"] = choose_text(rec["fund_name"], row["fund_name"])
        rec["fund_company"] = choose_text(rec["fund_company"], row["fund_company"])
        rec["custodian"] = choose_text(rec["custodian"], row["custodian"])
        rec["issue_start_date"] = choose_date(rec["issue_start_date"], row["issue_start_date"], "min")
        rec["fof_type"] = choose_text(rec["fof_type"], infer_fof_type("", row["fund_name"], config))
        rec["remarks"] = choose_text(rec["remarks"], safe_text(row.get("issue_status")))

    for _, row in establish_df.iterrows():
        key, rec = touch_record(row["fund_name"])
        rec["fund_name"] = choose_text(rec["fund_name"], row["fund_name"])
        rec["fund_company"] = choose_text(rec["fund_company"], row["fund_company"])
        rec["custodian"] = choose_text(rec["custodian"], row["custodian"])
        rec["issue_start_date"] = choose_date(rec["issue_start_date"], row["issue_start_date"], "min")
        rec["establish_date"] = choose_date(rec["establish_date"], row["establish_date"], "min")
        rec["fof_type"] = choose_text(rec["fof_type"], infer_fof_type("", row["fund_name"], config))
        if row.get("raise_scale") is not None and not pd.isnull(row.get("raise_scale")):
            rec["raise_scale"] = float(row["raise_scale"])
        rec["remarks"] = choose_text(rec["remarks"], safe_text(row.get("issue_stage")))

    rows = []
    for _, rec in merged.items():
        rows.append(rec)
    return pd.DataFrame(rows)


def finalize_products(df, config, as_of_date):
    df = df.copy()
    df["fund_name"] = df["fund_name"].apply(safe_text)
    df["fund_company"] = df["fund_company"].apply(normalize_company_name)
    df["fof_type"] = df.apply(lambda x: infer_fof_type(x.get("fof_type"), x.get("fund_name"), config), axis=1)
    df["is_key_company"] = df["fund_company"].isin(config.get("key_companies", []))
    current_stage_list = []
    latest_event_list = []
    for _, row in df.iterrows():
        latest_stage = "新申报"
        latest_dt = pd.NaT
        for field, stage in STAGE_ORDER:
            dt = parse_date(row.get(field))
            if pd.notnull(dt) and dt <= as_of_date:
                if pd.isnull(latest_dt) or dt >= latest_dt:
                    latest_dt = dt
                    latest_stage = stage
        current_stage_list.append(latest_stage)
        latest_event_list.append(latest_dt)
    df["current_stage"] = current_stage_list
    df["latest_event_date"] = pd.to_datetime(latest_event_list, errors="coerce")
    df["days_in_stage"] = (as_of_date - df["latest_event_date"]).dt.days

    df["declare_to_accept_days"] = (df["accept_date"] - df["declare_date"]).dt.days
    df["accept_to_approval_days"] = (df["approval_date"] - df["accept_date"]).dt.days
    df["approval_to_issue_days"] = (df["issue_start_date"] - df["approval_date"]).dt.days
    df["issue_to_establish_days"] = (df["establish_date"] - df["issue_start_date"]).dt.days
    df = df.sort_values(["latest_event_date", "fund_company", "fund_name"], ascending=[False, True, True]).reset_index(drop=True)
    return df


def apply_soft_intel(products, soft_intel_df):
    df = products.copy()
    for col in [
        "launch_channels",
        "channel_status",
        "holder_structure_view",
        "underlying_preference",
        "underlying_pool_action",
        "intelligence_level",
        "intel_last_update",
        "intel_note",
    ]:
        if col not in df.columns:
            df[col] = None

    if soft_intel_df is None or soft_intel_df.empty:
        return df

    by_product_id = {}
    by_name_key = {}
    for _, row in soft_intel_df.iterrows():
        record = row.to_dict()
        product_id = safe_text(record.get("product_id"))
        name_key = safe_text(record.get("fund_name_key"))
        if product_id:
            by_product_id[product_id] = record
        if name_key:
            by_name_key[name_key] = record

    applied_rows = []
    for _, row in df.iterrows():
        record = row.to_dict()
        match = None
        product_id = safe_text(record.get("product_id"))
        if product_id and product_id in by_product_id:
            match = by_product_id[product_id]
        else:
            name_key = normalize_fund_name(record.get("fund_name"))
            match = by_name_key.get(name_key)
        if match:
            for col in [
                "launch_channels",
                "channel_status",
                "holder_structure_view",
                "underlying_preference",
                "underlying_pool_action",
                "intelligence_level",
                "intel_last_update",
                "intel_note",
            ]:
                record[col] = match.get(col)
        applied_rows.append(record)
    return pd.DataFrame(applied_rows)


def limit_to_tracking_universe(products, as_of_date):
    ytd_start = pd.Timestamp(year=as_of_date.year, month=1, day=1)
    keep = products[
        products["latest_event_date"].notnull()
        & (products["latest_event_date"] >= ytd_start)
        & (products["latest_event_date"] <= as_of_date)
    ].copy()
    return keep.reset_index(drop=True)


def stage_slice(products, stage_name, start_dt, end_dt):
    field = STAGE_FIELD_BY_NAME[stage_name]
    return products[
        products[field].notnull()
        & (products[field] >= start_dt)
        & (products[field] <= end_dt)
    ].copy()


def build_period_metrics(products, start_dt, end_dt):
    declare_sub = stage_slice(products, "新申报", start_dt, end_dt)
    accept_sub = stage_slice(products, "新受理", start_dt, end_dt)
    approval_sub = stage_slice(products, "已获批", start_dt, end_dt)
    establish_sub = stage_slice(products, "已成立", start_dt, end_dt)

    kpis = {
        "declare_count": int(len(declare_sub)),
        "accept_count": int(len(accept_sub)),
        "approval_count": int(len(approval_sub)),
        "establish_count": int(len(establish_sub)),
        "raise_scale": round(establish_sub["raise_scale"].fillna(0).sum(), 2),
    }
    section_source = {
        "declare": declare_sub,
        "accept": accept_sub,
        "approval": approval_sub,
        "establish": establish_sub,
    }
    stage_sections = {}
    for key, (_, field) in DISPLAY_STAGE_KEYS.items():
        sub = section_source[key]
        sub = sub.sort_values([field, "latest_event_date", "raise_scale"], ascending=[False, False, False])
        stage_sections[key] = [serialize_record(r) for _, r in sub.iterrows()]
    return {"market_kpis": kpis, "stage_sections": stage_sections}


def build_company_stats(products, start_dt, end_dt):
    rows = []
    for company, sub in products.groupby("fund_company"):
        declare_sub = stage_slice(sub, "新申报", start_dt, end_dt)
        accept_sub = stage_slice(sub, "新受理", start_dt, end_dt)
        approval_sub = stage_slice(sub, "已获批", start_dt, end_dt)
        issue_sub = stage_slice(sub, "发行中", start_dt, end_dt)
        establish_sub = stage_slice(sub, "已成立", start_dt, end_dt)
        declare_count = int(len(declare_sub))
        accept_count = int(len(accept_sub))
        approval_count = int(len(approval_sub))
        issue_count = int(len(issue_sub))
        establish_count = int(len(establish_sub))
        scale_sum = round(establish_sub["raise_scale"].fillna(0).sum(), 2)
        avg_scale = round(establish_sub["raise_scale"].dropna().mean(), 2) if establish_count else None
        durations = []
        for _, row in establish_sub.iterrows():
            vals = [row.get("declare_to_accept_days"), row.get("accept_to_approval_days"), row.get("issue_to_establish_days")]
            vals = [int(v) for v in vals if v is not None and not pd.isnull(v)]
            if vals:
                durations.append(sum(vals))
        latest_dates = sub[(sub["latest_event_date"] >= start_dt) & (sub["latest_event_date"] <= end_dt)]["latest_event_date"]
        action_count = declare_count + accept_count + approval_count + issue_count + establish_count
        rows.append({
            "fund_company": safe_text(company),
            "action_count": action_count,
            "declare_count": declare_count,
            "accept_count": accept_count,
            "approval_count": approval_count,
            "issue_count": issue_count,
            "establish_count": establish_count,
            "raise_scale_sum": scale_sum,
            "avg_raise_scale": avg_scale,
            "fastest_establish_days": min(durations) if durations else None,
            "latest_event_date": format_date(latest_dates.max()) if len(latest_dates) > 0 else None,
        })
    return sorted(rows, key=lambda x: (x["raise_scale_sum"], x["action_count"]), reverse=True)


def build_key_company_progress(products, key_companies, start_dt, end_dt):
    result = []
    for company in key_companies:
        sub = products[products["fund_company"] == company].copy()
        establish_sub = stage_slice(sub, "已成立", start_dt, end_dt)
        declare_count = int(len(stage_slice(sub, "新申报", start_dt, end_dt)))
        accept_count = int(len(stage_slice(sub, "新受理", start_dt, end_dt)))
        approval_count = int(len(stage_slice(sub, "已获批", start_dt, end_dt)))
        issue_count = int(len(stage_slice(sub, "发行中", start_dt, end_dt)))
        establish_count = int(len(stage_slice(sub, "已成立", start_dt, end_dt)))
        action_count = declare_count + accept_count + approval_count + issue_count + establish_count
        result.append({
            "fund_company": company,
            "declare_count": declare_count,
            "accept_count": accept_count,
            "approval_count": approval_count,
            "issue_count": issue_count,
            "establish_count": establish_count,
            "action_count": action_count,
            "raise_scale_sum": round(establish_sub["raise_scale"].fillna(0).sum(), 2),
            "is_huaxia": company == "华夏",
        })
    return result


def build_key_company_cards(products, key_companies, two_week_start, as_of_date, ytd_start):
    cards = []
    for company in key_companies:
        sub = products[products["fund_company"] == company].copy()
        if sub.empty:
            cards.append({
                "fund_company": company,
                "recent_action_count": 0,
                "ytd_action_count": 0,
                "in_review_count": 0,
                "established_count": 0,
                "avg_raise_scale": None,
                "latest_products": [],
            })
            continue
        recent_action_count = int(((sub["latest_event_date"] >= two_week_start) & (sub["latest_event_date"] <= as_of_date)).sum())
        ytd_action_count = int(((sub["latest_event_date"] >= ytd_start) & (sub["latest_event_date"] <= as_of_date)).sum())
        established = sub[sub["establish_date"].notnull()].copy()
        cards.append({
            "fund_company": company,
            "recent_action_count": recent_action_count,
            "ytd_action_count": ytd_action_count,
            "in_review_count": int(sub["current_stage"].isin(IN_REVIEW_STAGES).sum()),
            "established_count": int(sub["current_stage"].eq("已成立").sum()),
            "raise_scale_sum": round(established["raise_scale"].fillna(0).sum(), 2) if not established.empty else 0,
            "avg_raise_scale": round(established["raise_scale"].dropna().mean(), 2) if not established.empty else None,
            "latest_products": [serialize_record(r) for _, r in sub.sort_values(["latest_event_date", "raise_scale"], ascending=[False, False]).head(3).iterrows()],
        })
    return cards


def build_huaxia_chase_dashboard(products, as_of_date, focus_company="华夏", top_n=3, head_limit=8):
    ytd_start = pd.Timestamp(year=as_of_date.year, month=1, day=1)
    year_end = pd.Timestamp(year=as_of_date.year, month=12, day=31)
    in_flight_stages = ("新申报", "新受理", "已获批", "发行中")
    company_rows = []

    for company, sub in products.groupby("fund_company"):
        company_name = safe_text(company)
        if company_name == "":
            continue

        sub = sub.copy()
        established_sub = sub[
            sub["establish_date"].notnull()
            & (sub["establish_date"] >= ytd_start)
            & (sub["establish_date"] <= as_of_date)
        ].copy()
        pipeline_sub = sub[sub["current_stage"].isin(in_flight_stages)].copy()

        duration_values = []
        for _, row in established_sub.iterrows():
            declare_date = parse_date(row.get("declare_date"))
            establish_date = parse_date(row.get("establish_date"))
            if pd.notnull(declare_date) and pd.notnull(establish_date):
                duration_values.append(int((establish_date - declare_date).days))

        total_days = int(sum(duration_values))
        sample_count = len(duration_values)
        company_rows.append({
            "fund_company": company_name,
            "establish_count": int(len(established_sub)),
            "pipeline_count": int(len(pipeline_sub)),
            "projected_floor_count": int(len(established_sub) + len(pipeline_sub)),
            "raise_scale_sum": round(established_sub["raise_scale"].fillna(0).sum(), 2),
            "avg_declare_to_establish_days": round(total_days / sample_count, 1) if sample_count else None,
            "duration_sample_count": sample_count,
            "latest_pipeline_products": [
                serialize_record(r)
                for _, r in pipeline_sub.sort_values(["latest_event_date", "declare_date"], ascending=[False, False]).head(4).iterrows()
            ],
            "_duration_days_total": total_days,
        })

    company_rows = sorted(
        company_rows,
        key=lambda x: (x["projected_floor_count"], x["establish_count"], x["raise_scale_sum"]),
        reverse=True,
    )
    for idx, row in enumerate(company_rows, start=1):
        row["rank"] = idx

    focus_row = next((row for row in company_rows if row["fund_company"] == focus_company), None)
    if focus_row is None:
        focus_row = {
            "fund_company": focus_company,
            "rank": len(company_rows) + 1,
            "establish_count": 0,
            "pipeline_count": 0,
            "projected_floor_count": 0,
            "raise_scale_sum": 0.0,
            "avg_declare_to_establish_days": None,
            "duration_sample_count": 0,
            "latest_pipeline_products": [],
            "_duration_days_total": 0,
        }

    target_rows = company_rows[:top_n] if len(company_rows) >= top_n else company_rows[:]
    threshold_row = target_rows[-1] if target_rows else focus_row
    cutoff_companies = [row["fund_company"] for row in company_rows if row["projected_floor_count"] == threshold_row["projected_floor_count"]]

    benchmark_rows = [row for row in target_rows if row["duration_sample_count"] > 0]
    if not benchmark_rows:
        benchmark_rows = [row for row in company_rows[:head_limit] if row["duration_sample_count"] > 0]
    if not benchmark_rows:
        benchmark_rows = [row for row in company_rows if row["duration_sample_count"] > 0]

    benchmark_sample_count = sum(row["duration_sample_count"] for row in benchmark_rows)
    benchmark_total_days = sum(row["_duration_days_total"] for row in benchmark_rows)
    benchmark_avg_days = round(benchmark_total_days / benchmark_sample_count, 1) if benchmark_sample_count else None
    benchmark_days_rounded = int(round(benchmark_avg_days)) if benchmark_avg_days is not None else None
    latest_declare_date = year_end - timedelta(days=benchmark_days_rounded) if benchmark_days_rounded is not None else None
    days_left = int((latest_declare_date.normalize() - as_of_date.normalize()).days) if latest_declare_date is not None else None

    focus_floor = int(focus_row["projected_floor_count"])
    focus_scale = float(focus_row["raise_scale_sum"])
    additional_for_tie = max(0, int(threshold_row["projected_floor_count"]) - focus_floor)
    additional_for_clear = max(0, int(threshold_row["projected_floor_count"]) + 1 - focus_floor)

    def serialize_company_row(row):
        return {
            "rank": int(row["rank"]),
            "fund_company": row["fund_company"],
            "is_focus_company": row["fund_company"] == focus_company,
            "establish_count": int(row["establish_count"]),
            "pipeline_count": int(row["pipeline_count"]),
            "projected_floor_count": int(row["projected_floor_count"]),
            "raise_scale_sum": round(float(row["raise_scale_sum"]), 2),
            "avg_declare_to_establish_days": row["avg_declare_to_establish_days"],
            "duration_sample_count": int(row["duration_sample_count"]),
            "count_gap_vs_focus": int(row["projected_floor_count"] - focus_floor),
            "scale_gap_vs_focus": round(float(row["raise_scale_sum"]) - focus_scale, 2),
            "latest_pipeline_products": row["latest_pipeline_products"],
        }

    head_companies = company_rows[:head_limit]
    if not any(row["fund_company"] == focus_company for row in head_companies):
        head_companies = head_companies + [focus_row]
    head_companies = sorted(
        head_companies,
        key=lambda x: (x["fund_company"] != focus_company, x["rank"]),
    )

    return {
        "focus_company": focus_company,
        "focus_company_rank": int(focus_row["rank"]),
        "top_n_target": int(top_n),
        "top_companies": [serialize_company_row(row) for row in target_rows],
        "head_companies": [serialize_company_row(row) for row in head_companies],
        "focus_company_snapshot": serialize_company_row(focus_row),
        "target": {
            "cutoff_rank": int(min(top_n, len(company_rows))) if company_rows else int(top_n),
            "cutoff_companies": cutoff_companies,
            "cutoff_floor_count": int(threshold_row["projected_floor_count"]),
            "cutoff_establish_count": int(threshold_row["establish_count"]),
            "cutoff_raise_scale_sum": round(float(threshold_row["raise_scale_sum"]), 2),
            "required_new_declares_for_tie": int(additional_for_tie),
            "required_new_declares_for_clear": int(additional_for_clear),
            "benchmark_avg_declare_to_establish_days": benchmark_avg_days,
            "benchmark_sample_count": int(benchmark_sample_count),
            "benchmark_companies": [row["fund_company"] for row in benchmark_rows],
            "latest_declare_date": format_date(latest_declare_date) if latest_declare_date is not None else None,
            "days_left_to_latest_declare": days_left,
            "year_end": format_date(year_end),
        },
        "assumptions": [
            "年底保底数量 = 今年已成立产品数 + 当前仍在申报、受理、获批、发行中的产品数。",
            "前三门槛按当前保底数量排名的第 3 名测算，默认按并列进入前三口径计算缺口。",
            "最晚申报日按头部前三已成立产品的平均“申报到成立”耗时反推，未额外假设未来新增储备。",
        ],
    }


def build_strategy_density_dashboard(products, fof_scale_profile, config, focus_company="华夏"):
    threshold = int(config.get("strategy_density_threshold_companies", 3) or 3)
    key_companies = [safe_text(item) for item in config.get("key_companies", []) if safe_text(item) not in ("", focus_company)]
    segments = {}

    def touch_segment(profile):
        key = profile["segment_key"]
        if key not in segments:
            segments[key] = {
                "segment_key": key,
                "segment_label": profile["segment_label"],
                "fof_type": profile["display_type"],
                "risk_bucket": profile["risk_bucket"],
                "holding_bucket": profile["holding_bucket"],
                "is_etf": profile["is_etf"],
                "peer_key_companies": set(),
                "peer_companies": set(),
                "peer_stock_key_companies": set(),
                "peer_stock_companies": set(),
                "peer_product_count": 0,
                "peer_in_review_count": 0,
                "peer_established_count": 0,
                "focus_ytd_count": 0,
                "focus_pipeline_count": 0,
                "focus_stock_count": 0,
                "focus_stock_scale_sum": 0.0,
                "peer_stock_scale_sum": 0.0,
                "peer_products": [],
                "focus_products": [],
            }
        return segments[key]

    for _, row in products.iterrows():
        profile = build_strategy_signature(row.get("fund_name"), row.get("fof_type"))
        entry = touch_segment(profile)
        company = safe_text(row.get("fund_company"))
        record = serialize_record(row)
        if company == focus_company:
            entry["focus_ytd_count"] += 1
            if row.get("current_stage") in PREDICTABLE_STAGES:
                entry["focus_pipeline_count"] += 1
            append_ranked_item(entry["focus_products"], record)
        else:
            entry["peer_companies"].add(company)
            if company in key_companies:
                entry["peer_key_companies"].add(company)
            entry["peer_product_count"] += 1
            if row.get("current_stage") in PREDICTABLE_STAGES:
                entry["peer_in_review_count"] += 1
            if row.get("current_stage") == "已成立":
                entry["peer_established_count"] += 1
            append_ranked_item(entry["peer_products"], record)

    for item in (fof_scale_profile or {}).get("products", []):
        profile = build_strategy_signature(item.get("fund_name"), item.get("fof_type"))
        entry = touch_segment(profile)
        company = safe_text(item.get("fund_company"))
        scale = float(item.get("latest_scale") or 0.0)
        if company == focus_company:
            entry["focus_stock_count"] += 1
            entry["focus_stock_scale_sum"] += scale
        else:
            entry["peer_stock_companies"].add(company)
            if company in key_companies:
                entry["peer_stock_key_companies"].add(company)
            entry["peer_stock_scale_sum"] += scale

    alerts = []
    for entry in segments.values():
        peer_key_company_count = len(entry["peer_key_companies"])
        peer_stock_key_company_count = len(entry["peer_stock_key_companies"])
        density_count = max(peer_key_company_count, peer_stock_key_company_count)
        if density_count < threshold:
            continue
        if entry["focus_pipeline_count"] > 0 and entry["focus_stock_count"] > 0:
            continue

        if entry["focus_pipeline_count"] == 0 and entry["focus_stock_count"] == 0:
            gap_type = "double_gap"
            gap_label = "华夏存量与在途均为空"
            severity = "critical"
            severity_rank = 3
        elif entry["focus_pipeline_count"] == 0:
            gap_type = "pipeline_gap"
            gap_label = "华夏有存量但当前无在途"
            severity = "warning"
            severity_rank = 2
        else:
            gap_type = "stock_gap"
            gap_label = "华夏有在途但当前无存量"
            severity = "watch"
            severity_rank = 1

        peer_names = sorted(entry["peer_key_companies"])
        peer_stock_names = sorted(entry["peer_stock_key_companies"])
        leader_names = peer_names if peer_names else peer_stock_names
        suggestion_title = "%s 赛道出现头部公司密集布局" % entry["segment_label"]
        if gap_type == "double_gap":
            suggestion_brief = "%s 等 %s 家重点公司已在该赛道形成布局，华夏当前既无存量覆盖，也没有在途产品，建议尽快补齐产品论证与底层池准备。" % (
                "、".join(leader_names[:4]) or "头部公司",
                density_count,
            )
        elif gap_type == "pipeline_gap":
            suggestion_brief = "华夏在 %s 赛道已有存量经验，但当前申报 / 在途储备为空；而 %s 等重点公司仍在持续推进，建议评估是否补充新产品储备。" % (
                entry["segment_label"],
                "、".join(leader_names[:4]) or "头部公司",
            )
        else:
            suggestion_brief = "华夏已在 %s 赛道启动在途产品，但存量承接仍弱；同业已有较强存量底盘，建议同步准备发行与投研承接方案。" % entry["segment_label"]

        alerts.append({
            "segment_key": entry["segment_key"],
            "segment_label": entry["segment_label"],
            "fof_type": entry["fof_type"],
            "risk_bucket": entry["risk_bucket"],
            "holding_bucket": entry["holding_bucket"],
            "severity": severity,
            "severity_label": {"critical": "红色预警", "warning": "布局缺口", "watch": "承接偏弱"}[severity],
            "density_count": density_count,
            "peer_key_company_count": peer_key_company_count,
            "peer_stock_key_company_count": peer_stock_key_company_count,
            "peer_in_review_count": int(entry["peer_in_review_count"]),
            "peer_established_count": int(entry["peer_established_count"]),
            "peer_key_companies": peer_names,
            "peer_stock_key_companies": peer_stock_names,
            "focus_pipeline_count": int(entry["focus_pipeline_count"]),
            "focus_stock_count": int(entry["focus_stock_count"]),
            "focus_ytd_count": int(entry["focus_ytd_count"]),
            "focus_stock_scale_sum": round(float(entry["focus_stock_scale_sum"]), 2),
            "peer_stock_scale_sum": round(float(entry["peer_stock_scale_sum"]), 2),
            "gap_type": gap_type,
            "gap_label": gap_label,
            "top_products": entry["peer_products"][:3],
            "focus_products": entry["focus_products"][:2],
            "suggestion_title": suggestion_title,
            "suggestion_brief": suggestion_brief,
            "_severity_rank": severity_rank,
        })

    alerts = sorted(
        alerts,
        key=lambda x: (
            x["_severity_rank"],
            x["density_count"],
            x["peer_in_review_count"],
            x["peer_established_count"],
        ),
        reverse=True,
    )
    for item in alerts:
        item.pop("_severity_rank", None)

    if alerts:
        headline = "当前识别到 %s 个细分赛道已被 %s 家以上重点公司同步布局，且华夏至少存在在途或存量缺口。" % (len(alerts), threshold)
        note = "该模块按策略标签做“变相对标”，不依赖产品名称完全一致。"
    else:
        headline = "当前未识别到满足阈值的头部公司密集布局缺口。"
        note = "如需更敏感的提醒，可在配置中下调 strategy_density_threshold_companies。"

    return {
        "focus_company": focus_company,
        "threshold_companies": threshold,
        "alert_count": len(alerts),
        "headline": headline,
        "note": note,
        "alerts": alerts[:6],
    }


def build_efficiency_diagnosis(products, config, focus_company="华夏"):
    metric_defs = [
        ("declare_to_accept_days", "材料接收 -> 受理", "新申报"),
        ("accept_to_approval_days", "受理 -> 获批", "新受理"),
        ("approval_to_issue_days", "获批 -> 发行", "已获批"),
        ("issue_to_establish_days", "发行 -> 成立", "发行中"),
        ("declare_to_establish_days", "申报 -> 成立", None),
    ]
    benchmark_companies = [safe_text(item) for item in config.get("key_companies", []) if safe_text(item) not in ("", focus_company)]
    focus_sub = products[products["fund_company"] == focus_company].copy()
    benchmark_sub = products[products["fund_company"].isin(benchmark_companies)].copy()
    if benchmark_sub.empty:
        benchmark_sub = products[products["fund_company"] != focus_company].copy()

    stage_rows = []
    for metric_key, label, stage_name in metric_defs:
        focus_values = [duration_value(row, metric_key) for _, row in focus_sub.iterrows()]
        benchmark_values = [duration_value(row, metric_key) for _, row in benchmark_sub.iterrows()]
        focus_clean = [v for v in focus_values if v is not None]
        benchmark_clean = [v for v in benchmark_values if v is not None]
        focus_avg = average_int(focus_clean)
        benchmark_avg = average_int(benchmark_clean)
        gap_days = None
        if focus_avg is not None and benchmark_avg is not None:
            gap_days = round(float(focus_avg) - float(benchmark_avg), 1)
        if gap_days is None:
            assessment = "样本不足"
        elif gap_days > 5:
            assessment = "慢于同业"
        elif gap_days < -5:
            assessment = "快于同业"
        else:
            assessment = "基本持平"
        stage_rows.append({
            "metric_key": metric_key,
            "stage_label": label,
            "watch_stage": stage_name,
            "focus_avg_days": focus_avg,
            "focus_sample_count": len(focus_clean),
            "benchmark_avg_days": benchmark_avg,
            "benchmark_sample_count": len(benchmark_clean),
            "gap_days": gap_days,
            "assessment": assessment,
        })

    comparable_rows = [row for row in stage_rows if row["gap_days"] is not None]
    stage_comparable_rows = [row for row in comparable_rows if row.get("watch_stage")]
    positive_rows = [row for row in stage_comparable_rows if row["gap_days"] > 0]
    bottleneck = max(positive_rows, key=lambda x: x["gap_days"]) if positive_rows else None
    lagging_products = []
    if bottleneck and bottleneck.get("watch_stage"):
        focus_watch = focus_sub[focus_sub["current_stage"] == bottleneck["watch_stage"]].copy()
        lagging_products = [
            serialize_record(r)
            for _, r in focus_watch.sort_values(["days_in_stage", "latest_event_date"], ascending=[False, False]).head(4).iterrows()
        ]

    if bottleneck and bottleneck["gap_days"] is not None:
        focus_summary = "华夏当前最明显的流程堵点在“%s”，平均耗时 %s 天，较重点同业慢 %s 天。" % (
            bottleneck["stage_label"],
            bottleneck["focus_avg_days"],
            abs(bottleneck["gap_days"]),
        )
    elif stage_comparable_rows:
        fastest_row = min(stage_comparable_rows, key=lambda x: x["gap_days"])
        focus_summary = "华夏当前可比样本中未出现明显慢于同业的环节；相对最有优势的是“%s”，较重点同业快 %s 天。" % (
            fastest_row["stage_label"],
            abs(fastest_row["gap_days"]),
        )
    else:
        focus_summary = "华夏当前可用于审批效率对比的样本不足，暂无法稳定识别堵点。"

    return {
        "focus_company": focus_company,
        "benchmark_companies": benchmark_companies,
        "focus_summary": focus_summary,
        "focus_bottleneck": bottleneck,
        "stage_rows": stage_rows,
        "lagging_products": lagging_products,
        "notes": [
            "审批效能对比基于现有样本的阶段平均耗时，不代表监管结果本身。",
            "当样本不足时，系统会保留空值，避免误导性结论。",
        ],
    }


def build_future_event_forecast(products, as_of_date):
    horizon_end = as_of_date.normalize() + timedelta(days=30)

    def metric_values(sub, metric_key):
        values = []
        for _, row in sub.iterrows():
            value = duration_value(row, metric_key)
            if value is not None and value >= 0:
                values.append(value)
        return values

    def pick_benchmark(product_row, metric_key):
        company = safe_text(product_row.get("fund_company"))
        strategy = build_strategy_signature(product_row.get("fund_name"), product_row.get("fof_type"))
        company_sub = products[products["fund_company"] == company].copy()
        company_values = metric_values(company_sub, metric_key)
        if len(company_values) >= 2:
            return average_int(company_values), len(company_values), "%s 历史样本" % company, "high"

        segment_values = []
        for _, row in products.iterrows():
            other_strategy = build_strategy_signature(row.get("fund_name"), row.get("fof_type"))
            if other_strategy["segment_key"] != strategy["segment_key"]:
                continue
            value = duration_value(row, metric_key)
            if value is not None and value >= 0:
                segment_values.append(value)
        if len(segment_values) >= 3:
            return average_int(segment_values), len(segment_values), "同赛道样本", "medium"

        type_sub = products[products["fof_type"] == product_row.get("fof_type")].copy()
        type_values = metric_values(type_sub, metric_key)
        if len(type_values) >= 4:
            return average_int(type_values), len(type_values), "%s 样本" % safe_text(product_row.get("fof_type")), "medium"

        market_values = metric_values(products, metric_key)
        if len(market_values) >= 1:
            return average_int(market_values), len(market_values), "全市场样本", "low"
        return None, 0, None, "low"

    def predict_label(stage_name):
        if stage_name == "新受理":
            return "预计受理"
        if stage_name == "已获批":
            return "预计获批"
        if stage_name == "发行中":
            return "预计进入发行"
        if stage_name == "已成立":
            return "预计成立"
        return "预计推进"

    events = []
    overdue = []
    for _, row in products.iterrows():
        current_stage = safe_text(row.get("current_stage"))
        if current_stage not in NEXT_STAGE_RULES:
            continue
        next_stage, metric_key, base_field = NEXT_STAGE_RULES[current_stage]
        base_date = parse_date(row.get(base_field))
        if pd.isnull(base_date):
            continue
        benchmark_days, sample_count, benchmark_source, confidence = pick_benchmark(row, metric_key)
        if benchmark_days is None:
            continue
        predicted_date = base_date + timedelta(days=int(round(float(benchmark_days))))
        item = {
            "product_id": safe_text(row.get("product_id")) or None,
            "fund_name": safe_text(row.get("fund_name")) or None,
            "fund_company": safe_text(row.get("fund_company")) or None,
            "fof_type": safe_text(row.get("fof_type")) or None,
            "current_stage": current_stage,
            "predicted_stage": next_stage,
            "predicted_stage_label": predict_label(next_stage),
            "predicted_date": format_date(predicted_date),
            "days_until_event": int((predicted_date.normalize() - as_of_date.normalize()).days),
            "benchmark_days": round(float(benchmark_days), 1),
            "benchmark_source": benchmark_source,
            "benchmark_sample_count": int(sample_count),
            "confidence": confidence,
            "strategy_segment_label": build_strategy_signature(row.get("fund_name"), row.get("fof_type"))["segment_label"],
            "is_key_company": bool(row.get("is_key_company")),
        }
        if predicted_date <= as_of_date:
            overdue.append(item)
        elif predicted_date <= horizon_end:
            events.append(item)

    events = sorted(events, key=lambda x: (x["predicted_date"], x["fund_company"], x["fund_name"]))
    overdue = sorted(overdue, key=lambda x: (x["days_until_event"], x["fund_company"], x["fund_name"]))
    stage_counts = {}
    for item in events:
        stage_counts[item["predicted_stage"]] = stage_counts.get(item["predicted_stage"], 0) + 1

    return {
        "horizon_days": 30,
        "start_date": format_date(as_of_date),
        "end_date": format_date(horizon_end),
        "events": events[:16],
        "overdue": overdue[:8],
        "stage_counts": stage_counts,
        "headline": "基于历史平均耗时，滚动估算未来 30 天可能发生的审批 / 发行节点。",
    }


def build_macro_clock_snapshot(products, config, strategy_density_dashboard):
    macro_cfg = config.get("macro_clock", {}) or {}
    raw_regime = safe_text(macro_cfg.get("current_regime"))
    configured = raw_regime in MACRO_CLOCK_LIBRARY and raw_regime != "待配置"
    regime_key = raw_regime if configured else "待配置"
    regime = MACRO_CLOCK_LIBRARY[regime_key]

    matched_products = []
    matched_alerts = []
    if configured:
        watch_risk_buckets = set(regime.get("watch_risk_buckets", []))
        watch_tags = set(regime.get("watch_tags", []))
        for _, row in products.iterrows():
            if row.get("current_stage") not in PREDICTABLE_STAGES:
                continue
            profile = build_strategy_signature(row.get("fund_name"), row.get("fof_type"))
            if profile["risk_bucket"] in watch_risk_buckets or any(tag in watch_tags for tag in profile["tags"]):
                matched_products.append(serialize_record(row))
        matched_products = sorted(matched_products, key=lambda x: safe_text(x.get("latest_event_date")), reverse=True)[:6]

        for alert in strategy_density_dashboard.get("alerts", []):
            alert_tags = {alert.get("risk_bucket"), alert.get("fof_type"), alert.get("holding_bucket")}
            if alert.get("risk_bucket") in watch_risk_buckets or any(tag in watch_tags for tag in alert_tags):
                matched_alerts.append({
                    "segment_label": alert.get("segment_label"),
                    "severity_label": alert.get("severity_label"),
                    "gap_label": alert.get("gap_label"),
                    "peer_key_companies": alert.get("peer_key_companies"),
                })

    return {
        "configured": configured,
        "current_regime": regime_key,
        "description": regime.get("description"),
        "action_hint": regime.get("action_hint"),
        "tone": regime.get("tone"),
        "matched_product_count": len(matched_products),
        "matched_alert_count": len(matched_alerts),
        "matched_products": matched_products,
        "matched_alerts": matched_alerts[:3],
        "watch_risk_buckets": regime.get("watch_risk_buckets", []),
        "watch_tags": regime.get("watch_tags", []),
        "note": safe_text(macro_cfg.get("note")) or "可在配置中设置 macro_clock.current_regime，以便系统按投资时钟自动高亮赛道。",
        "available_regimes": [item for item in MACRO_CLOCK_LIBRARY.keys() if item != "待配置"],
    }


def build_soft_intel_dashboard(products, soft_intel_path, focus_company="华夏"):
    rows = []
    missing_rows = []
    for _, row in products.iterrows():
        has_soft_intel = any(
            safe_text(row.get(field))
            for field in ["launch_channels", "holder_structure_view", "underlying_preference", "underlying_pool_action", "channel_status"]
        )
        serialized = serialize_record(row)
        if has_soft_intel:
            rows.append(serialized)
        elif row.get("current_stage") in PREDICTABLE_STAGES:
            missing_rows.append(serialized)

    channel_stats = {}
    holder_stats = {}
    preference_stats = {}
    for item in rows:
        channels = safe_text(item.get("launch_channels"))
        holder = safe_text(item.get("holder_structure_view"))
        preference = safe_text(item.get("underlying_preference"))
        if channels:
            for channel in re.split(r"[、,，/ ]+", channels):
                channel_text = safe_text(channel)
                if channel_text == "":
                    continue
                channel_stats[channel_text] = channel_stats.get(channel_text, 0) + 1
        if holder:
            holder_stats[holder] = holder_stats.get(holder, 0) + 1
        if preference:
            preference_stats[preference] = preference_stats.get(preference, 0) + 1

    ordered_rows = sorted(
        rows,
        key=lambda x: (
            x.get("intel_last_update") or "",
            x.get("latest_event_date") or "",
        ),
        reverse=True,
    )
    missing_rows = sorted(
        missing_rows,
        key=lambda x: (
            bool(x.get("is_key_company")),
            x.get("latest_event_date") or "",
        ),
        reverse=True,
    )[:6]

    def top_buckets(source_dict):
        return [
            {"label": key, "count": int(value)}
            for key, value in sorted(source_dict.items(), key=lambda x: (x[1], x[0]), reverse=True)[:6]
        ]

    return {
        "source_file": Path(soft_intel_path).name,
        "coverage_count": int(len(rows)),
        "channel_cover_count": int(sum(1 for item in rows if safe_text(item.get("launch_channels")) != "")),
        "holder_cover_count": int(sum(1 for item in rows if safe_text(item.get("holder_structure_view")) != "")),
        "preference_cover_count": int(sum(1 for item in rows if safe_text(item.get("underlying_preference")) != "")),
        "focus_company_cover_count": int(sum(1 for item in rows if item.get("fund_company") == focus_company)),
        "channel_buckets": top_buckets(channel_stats),
        "holder_buckets": top_buckets(holder_stats),
        "preference_buckets": top_buckets(preference_stats),
        "key_updates": ordered_rows[:6],
        "missing_priority": missing_rows,
        "headline": (
            "当前已有 %s 只产品录入发行软信息，其中渠道覆盖 %s 只、持有人结构覆盖 %s 只。"
            % (
                len(rows),
                sum(1 for item in rows if safe_text(item.get("launch_channels")) != ""),
                sum(1 for item in rows if safe_text(item.get("holder_structure_view")) != ""),
            )
            if rows
            else "当前尚未录入发行软信息，可在模板里补充渠道、持有人结构和底层偏好。"
        ),
    }


def build_trend(products, as_of_date, weeks=8):
    rows = []
    end_dt = as_of_date.normalize()
    start_base = end_dt - timedelta(days=7 * weeks - 1)
    cursor = start_base
    while cursor <= end_dt:
        week_end = min(cursor + timedelta(days=6), end_dt)
        sub = products[(products["establish_date"] >= cursor) & (products["establish_date"] <= week_end)].copy()
        rows.append({
            "label": "%s-%s" % (cursor.strftime("%m/%d"), week_end.strftime("%m/%d")),
            "establish_count": int(len(sub)),
            "raise_scale": round(sub["raise_scale"].fillna(0).sum(), 2),
        })
        cursor += timedelta(days=7)
    return rows


def serialize_record(row):
    data = row.to_dict()
    for field in ["declare_date", "accept_date", "approval_date", "issue_start_date", "establish_date", "intel_last_update"]:
        data[field] = format_date(data.get(field))
    data["latest_event_date"] = format_date(data.get("latest_event_date"))
    data["raise_scale"] = None if pd.isnull(data.get("raise_scale")) else round(float(data.get("raise_scale")), 2)
    for key in ["days_in_stage", "declare_to_accept_days", "accept_to_approval_days", "approval_to_issue_days", "issue_to_establish_days"]:
        data[key] = None if pd.isnull(data.get(key)) else int(data.get(key))
    data["remarks"] = safe_text(data.get("remarks")) or None
    data["custodian"] = safe_text(data.get("custodian")) or None
    for field in [
        "launch_channels",
        "channel_status",
        "holder_structure_view",
        "underlying_preference",
        "underlying_pool_action",
        "intelligence_level",
        "intel_note",
    ]:
        data[field] = safe_text(data.get(field)) or None
    profile = build_strategy_signature(data.get("fund_name"), data.get("fof_type"))
    data["holding_bucket"] = profile["holding_bucket"]
    data["risk_bucket"] = profile["risk_bucket"]
    data["strategy_segment_key"] = profile["segment_key"]
    data["strategy_segment_label"] = profile["segment_label"]
    data["strategy_tags"] = profile["tags"]
    return data


def build_fof_scale_profile(profile_df, config, meta, source_file, focus_company="华夏", top_n=3, head_limit=8):
    if profile_df is None or profile_df.empty:
        return None

    df = profile_df.copy()
    total_latest_scale = float(df["latest_scale"].fillna(0).sum())
    total_prev_scale = float(df["prev_scale"].fillna(0).sum())
    total_scale_change = total_latest_scale - total_prev_scale

    company_rows = []
    for company, sub in df.groupby("fund_company"):
        company_name = safe_text(company)
        if company_name == "":
            continue
        latest_scale_sum = float(sub["latest_scale"].fillna(0).sum())
        prev_scale_sum = float(sub["prev_scale"].fillna(0).sum())
        latest_valid = sub["latest_scale"].dropna()
        ordered_products = sub.sort_values(["latest_scale", "fund_name"], ascending=[False, True]).head(3)
        company_rows.append({
            "fund_company": company_name,
            "product_count": int(len(sub)),
            "ordinary_count": int((sub["fof_type"] == "普通FOF").sum()),
            "pension_count": int((sub["fof_type"] == "养老FOF").sum()),
            "latest_scale_sum": round(latest_scale_sum, 2),
            "prev_scale_sum": round(prev_scale_sum, 2),
            "scale_change": round(latest_scale_sum - prev_scale_sum, 2),
            "avg_latest_scale": round(float(latest_valid.mean()), 2) if len(latest_valid) > 0 else None,
            "max_product_scale": round(float(latest_valid.max()), 2) if len(latest_valid) > 0 else None,
            "scale_share_pct": round((latest_scale_sum / total_latest_scale) * 100, 2) if total_latest_scale > 0 else None,
            "repaired_scale_count": int(sub["is_repaired_scale"].fillna(False).sum()),
            "is_focus_company": company_name == focus_company,
            "is_key_company": company_name in config.get("key_companies", []),
            "top_products": [serialize_profile_record(r) for _, r in ordered_products.iterrows()],
        })

    company_rows = sorted(company_rows, key=lambda x: (x["latest_scale_sum"], x["product_count"]), reverse=True)
    for idx, row in enumerate(company_rows, start=1):
        row["rank"] = idx

    company_map = {row["fund_company"]: row for row in company_rows}
    focus_row = company_map.get(focus_company)
    if focus_row is None:
        focus_row = {
            "rank": len(company_rows) + 1,
            "fund_company": focus_company,
            "product_count": 0,
            "ordinary_count": 0,
            "pension_count": 0,
            "latest_scale_sum": 0.0,
            "prev_scale_sum": 0.0,
            "scale_change": 0.0,
            "avg_latest_scale": None,
            "max_product_scale": None,
            "scale_share_pct": 0.0,
            "repaired_scale_count": 0,
            "is_focus_company": True,
            "is_key_company": True,
            "top_products": [],
        }

    target_rows = company_rows[:top_n] if len(company_rows) >= top_n else company_rows[:]
    threshold_row = target_rows[-1] if target_rows else focus_row
    head_rows = company_rows[:head_limit]
    if not any(row["fund_company"] == focus_company for row in head_rows):
        head_rows = head_rows + [focus_row]
    head_rows = sorted(head_rows, key=lambda x: (x["fund_company"] != focus_company, x["rank"]))

    key_company_rows = []
    for company in config.get("key_companies", []):
        row = company_map.get(company)
        if row is None:
            row = {
                "rank": len(company_rows) + 1,
                "fund_company": company,
                "product_count": 0,
                "ordinary_count": 0,
                "pension_count": 0,
                "latest_scale_sum": 0.0,
                "prev_scale_sum": 0.0,
                "scale_change": 0.0,
                "avg_latest_scale": None,
                "max_product_scale": None,
                "scale_share_pct": 0.0,
                "repaired_scale_count": 0,
                "is_focus_company": company == focus_company,
                "is_key_company": True,
                "top_products": [],
            }
        key_company_rows.append(row)

    ordered_products = df.sort_values(["latest_scale", "fund_company", "fund_name"], ascending=[False, True, True]).copy()
    repaired_rows = df[df["is_repaired_scale"].fillna(False)].copy().sort_values(["latest_scale", "fund_company", "fund_name"], ascending=[False, True, True])
    top_products = ordered_products.head(12)

    type_rows = []
    for fof_type in ["普通FOF", "养老FOF"]:
        sub = df[df["fof_type"] == fof_type].copy()
        latest_scale_sum = float(sub["latest_scale"].fillna(0).sum())
        prev_scale_sum = float(sub["prev_scale"].fillna(0).sum())
        type_rows.append({
            "fof_type": fof_type,
            "product_count": int(len(sub)),
            "latest_scale_sum": round(latest_scale_sum, 2),
            "prev_scale_sum": round(prev_scale_sum, 2),
            "scale_change": round(latest_scale_sum - prev_scale_sum, 2),
            "repaired_scale_count": int(sub["is_repaired_scale"].fillna(False).sum()),
        })

    return {
        "source_file": source_file,
        "source_sheet": meta.get("sheet_name"),
        "scale_as_of_date": meta.get("scale_as_of_date"),
        "prev_scale_as_of_date": meta.get("prev_scale_as_of_date"),
        "focus_company": focus_company,
        "product_count": int(len(df)),
        "company_count": int(df["fund_company"].nunique()),
        "repaired_scale_count": int(df["is_repaired_scale"].fillna(False).sum()),
        "total_latest_scale": round(total_latest_scale, 2),
        "total_prev_scale": round(total_prev_scale, 2),
        "total_scale_change": round(total_scale_change, 2),
        "type_breakdown": type_rows,
        "focus_company_rank": int(focus_row["rank"]),
        "focus_company_snapshot": focus_row,
        "top_companies": target_rows,
        "head_companies": head_rows,
        "target": {
            "cutoff_rank": int(min(top_n, len(company_rows))) if company_rows else int(top_n),
            "cutoff_company": threshold_row.get("fund_company"),
            "cutoff_scale_sum": round(float(threshold_row.get("latest_scale_sum", 0.0)), 2),
            "scale_gap_vs_focus": max(0.0, round(float(threshold_row.get("latest_scale_sum", 0.0)) - float(focus_row.get("latest_scale_sum", 0.0)), 2)),
            "product_gap_vs_focus": max(0, int(threshold_row.get("product_count", 0)) - int(focus_row.get("product_count", 0))),
        },
        "company_rankings": company_rows,
        "key_company_rankings": key_company_rows,
        "products": [serialize_profile_record(r) for _, r in ordered_products.iterrows()],
        "top_products": [serialize_profile_record(r) for _, r in top_products.iterrows()],
        "repaired_scale_products": [serialize_profile_record(r) for _, r in repaired_rows.head(20).iterrows()],
        "notes": [
            "存量规模口径来自基金画像工作表，仅纳入研发类型为 FOF / FOF-养老 的产品。",
            "latest_scale 为基金规模合计口径，和跟踪主表中的 raise_scale（募集规模）不是同一指标。",
            "is_repaired_scale = true 表示该基金曾被标记为最新规模缺失，但当前主表中已经补齐到可用规模值。",
        ],
    }


def load_fof_scale_profile_snapshot(args, config):
    profile_path = resolve_business_file(args.profile_file, "profile")
    if not profile_path.exists():
        print("未识别到规模画像表：%s" % profile_path.name)
        return None

    print("识别到规模画像表：%s" % profile_path.name)
    try:
        profile_df, meta = load_fund_profile_data(profile_path)
        snapshot = build_fof_scale_profile(profile_df, config, meta, profile_path.name)
        print(
            "规模画像读取完成：存量 FOF %s 只，基金公司 %s 家，最新规模口径日期 %s"
            % (snapshot["product_count"], snapshot["company_count"], snapshot["scale_as_of_date"])
        )
        return snapshot
    except Exception as exc:
        print("规模画像表读取失败，跳过存量规模画像。原因：%s" % exc)
        return None


def build_snapshot(products, config, as_of_date, fof_scale_profile=None, soft_intel_path=str(DEFAULT_SOFT_INTEL_FILE)):
    week_start = as_of_date - timedelta(days=6)
    ytd_start = pd.Timestamp(year=as_of_date.year, month=1, day=1)

    week_metrics = build_period_metrics(products, week_start, as_of_date)
    ytd_metrics = build_period_metrics(products, ytd_start, as_of_date)
    strategy_density = build_strategy_density_dashboard(products, fof_scale_profile, config)
    efficiency_diagnosis = build_efficiency_diagnosis(products, config)
    future_timeline = build_future_event_forecast(products, as_of_date)
    macro_clock = build_macro_clock_snapshot(products, config, strategy_density)
    soft_intel_dashboard = build_soft_intel_dashboard(products, soft_intel_path)

    stage_counts = [{"stage": stage, "count": int(products["current_stage"].eq(stage).sum())} for _, stage in STAGE_ORDER]

    company_rankings = {
        "all": {
            "week": build_company_stats(products, week_start, as_of_date),
            "ytd": build_company_stats(products, ytd_start, as_of_date),
        },
        "key": {
            "week": build_company_stats(products[products["is_key_company"]], week_start, as_of_date),
            "ytd": build_company_stats(products[products["is_key_company"]], ytd_start, as_of_date),
        },
    }

    snapshot = {
        "generated_at": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "as_of_date": format_date(as_of_date),
        "config": config,
        "summary": {
            "week_range": {
                "start": format_date(week_start),
                "end": format_date(as_of_date),
                "label": "%s-%s" % (week_start.strftime("%m.%d"), as_of_date.strftime("%m.%d")),
            },
            "ytd_range": {
                "start": format_date(ytd_start),
                "end": format_date(as_of_date),
            },
            "market_kpis": {
                "week": week_metrics["market_kpis"],
                "ytd": ytd_metrics["market_kpis"],
            },
            "stage_counts": stage_counts,
            "stage_sections": {
                "week": week_metrics["stage_sections"],
                "ytd": ytd_metrics["stage_sections"],
            },
            "company_rankings": company_rankings,
            "key_company_progress": {
                "ytd": build_key_company_progress(products, config.get("key_companies", []), ytd_start, as_of_date),
                "week": build_key_company_progress(products, config.get("key_companies", []), week_start, as_of_date),
            },
            "strategy_density": strategy_density,
            "efficiency_diagnosis": efficiency_diagnosis,
            "future_timeline": future_timeline,
            "macro_clock": macro_clock,
            "soft_intel_dashboard": soft_intel_dashboard,
            "fof_scale_profile": fof_scale_profile,
            "huaxia_chase": build_huaxia_chase_dashboard(products, as_of_date),
            "key_company_cards": build_key_company_cards(products, config.get("key_companies", []), week_start, as_of_date, ytd_start),
            "key_company_updates": [serialize_record(r) for _, r in products[products["is_key_company"]].sort_values(["latest_event_date", "raise_scale"], ascending=[False, False]).head(8).iterrows()],
            "key_products": [serialize_record(r) for _, r in products.sort_values(["latest_event_date", "raise_scale"], ascending=[False, False]).head(10).iterrows()],
            "in_review_pool": [serialize_record(r) for _, r in products[products["current_stage"].isin(IN_REVIEW_STAGES)].sort_values(["latest_event_date"], ascending=[False]).head(12).iterrows()],
            "trends": {
                "weekly_establish": build_trend(products, as_of_date, weeks=8),
            },
        },
        "products": [serialize_record(r) for _, r in products.iterrows()],
    }
    return snapshot


def load_products_from_real_excels(config, args):
    declare_path = resolve_business_file(args.declare_file, "declare")
    issue_path = resolve_business_file(args.issue_file, "issue")
    establish_path = resolve_business_file(args.establish_file, "establish")
    approval_path = resolve_business_file(args.approval_file, "approval")
    selected_files = {
        "declare": declare_path,
        "issue": issue_path,
        "establish": establish_path,
        "approval": approval_path,
    }

    print("识别到申报表：%s" % declare_path.name)
    print("识别到发行表：%s" % issue_path.name)
    print("识别到成立表：%s" % establish_path.name)
    print("识别到获批表：%s" % approval_path.name)

    if not (declare_path.exists() and issue_path.exists() and establish_path.exists() and approval_path.exists()):
        return None, None

    declare_df = load_declare_accept_data(declare_path)
    issue_df = load_issue_data(issue_path)
    establish_df = load_establish_data(establish_path)
    approval_df = load_approval_data(approval_path)

    web_declare_df = pd.DataFrame()
    web_approval_df = pd.DataFrame()
    if not args.disable_web_supplement:
        try:
            print("读取证监会网页补充数据（近%s天）..." % args.web_recent_days)
            web_declare_df, web_approval_df = load_csrc_web_supplement(config, args)
            print(
                "网页补充完成：申报/受理 %s 条，获批 %s 条"
                % (len(web_declare_df), len(web_approval_df))
            )
        except Exception as exc:
            print("网页补充数据读取失败，继续使用本地 Excel。原因：%s" % exc)

    if web_declare_df is not None and not web_declare_df.empty:
        declare_df = pd.concat([declare_df, web_declare_df], ignore_index=True)
    if web_approval_df is not None and not web_approval_df.empty:
        approval_df = pd.concat([approval_df, web_approval_df], ignore_index=True)

    as_of_date, auto_as_of_date, as_of_source = resolve_as_of_date(
        config,
        [declare_df, issue_df, establish_df, approval_df, web_declare_df, web_approval_df],
        args.as_of_date,
    )
    merged = merge_records(config, declare_df, approval_df, issue_df, establish_df)
    products = finalize_products(merged, config, as_of_date)
    products = limit_to_tracking_universe(products, as_of_date)
    return products, as_of_date, auto_as_of_date, as_of_source, selected_files


def load_products_from_template(config, args):
    template_path = Path(args.template)
    if not template_path.exists():
        raise FileNotFoundError("未找到真实 Excel，也未找到模板 CSV: %s" % template_path)
    products = load_template_data(template_path, config)
    as_of_date, auto_as_of_date, as_of_source = resolve_as_of_date(config, [products], args.as_of_date)
    products = finalize_products(products, config, as_of_date)
    products = limit_to_tracking_universe(products, as_of_date)
    return products, as_of_date, auto_as_of_date, as_of_source, {}


def main():
    args = parse_args()
    config = load_config(args.config)

    products, as_of_date, auto_as_of_date, as_of_source, selected_files = load_products_from_real_excels(config, args)
    if products is None:
        products, as_of_date, auto_as_of_date, as_of_source, selected_files = load_products_from_template(config, args)
    soft_intel_df = load_soft_intel_data(args.soft_intel_file)
    products = apply_soft_intel(products, soft_intel_df)
    if soft_intel_df is not None and not soft_intel_df.empty:
        print("识别到软信息模板：%s（%s 条）" % (Path(args.soft_intel_file).name, len(soft_intel_df)))
    else:
        print("未识别到可用软信息模板，继续按主流程生成。")
    fof_scale_profile = load_fof_scale_profile_snapshot(args, config)

    print("自动识别截止日：%s" % format_date(auto_as_of_date))
    if as_of_source == "manual":
        print("实际采用截止日：%s（手动指定）" % format_date(as_of_date))
    else:
        print("实际采用截止日：%s（自动识别）" % format_date(as_of_date))

    snapshot = build_snapshot(products, config, as_of_date, fof_scale_profile=fof_scale_profile, soft_intel_path=args.soft_intel_file)

    output_json = Path(args.output_json)
    output_js = Path(args.output_js)
    output_csv = Path(args.output_csv)

    output_json.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    output_js.write_text("window.__FOF_TRACKER_SNAPSHOT__ = " + json.dumps(snapshot, ensure_ascii=False, indent=2) + ";", encoding="utf-8")
    pd.DataFrame(snapshot["products"]).to_csv(str(output_csv), index=False, encoding="utf-8-sig")

    if args.cleanup_old_excels and selected_files:
        deleted = cleanup_old_business_files(selected_files)
        if deleted:
            print("已删除旧版本 Excel：%s" % "、".join(deleted))
        else:
            print("未发现需要删除的旧版本 Excel。")

    print("generated json:", output_json)
    print("generated js:", output_js)
    print("generated csv:", output_csv)


if __name__ == "__main__":
    main()
