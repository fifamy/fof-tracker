import argparse
import importlib.util
import unittest
from pathlib import Path
from unittest import mock

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_fof_tracker_snapshot.py"


def load_builder_module():
    spec = importlib.util.spec_from_file_location("build_fof_tracker_snapshot", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BuildFofTrackerSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builder = load_builder_module()

    def test_real_excel_loader_returns_full_fallback_tuple_when_files_are_missing(self):
        args = argparse.Namespace(
            declare_file="/private/tmp/fof-missing-declare.xlsx",
            issue_file="/private/tmp/fof-missing-issue.xlsx",
            establish_file="/private/tmp/fof-missing-establish.xlsx",
            approval_file="/private/tmp/fof-missing-approval.xlsx",
            disable_web_supplement=True,
            web_recent_days=62,
            web_page_size=200,
            csrc_progress_api="https://example.invalid",
            as_of_date=None,
            allow_historical_as_of=False,
        )

        result = self.builder.load_products_from_real_excels({}, args)

        self.assertEqual(5, len(result))
        products, as_of_date, auto_as_of_date, as_of_source, selected_files = result
        self.assertIsNone(products)
        self.assertIsNone(as_of_date)
        self.assertIsNone(auto_as_of_date)
        self.assertIsNone(as_of_source)
        self.assertEqual(
            {
                "declare": Path(args.declare_file),
                "issue": Path(args.issue_file),
                "establish": Path(args.establish_file),
                "approval": Path(args.approval_file),
            },
            selected_files,
        )

    def test_web_reference_date_defaults_to_today_when_no_manual_override(self):
        with mock.patch.object(self.builder.pd.Timestamp, "today", return_value=pd.Timestamp("2026-05-28")):
            ref_date = self.builder.resolve_web_reference_date({"as_of_date": "2026-04-14"}, None)

        self.assertEqual(pd.Timestamp("2026-05-28"), ref_date)

    def test_web_reference_date_honors_manual_override(self):
        with mock.patch.object(self.builder.pd.Timestamp, "today", return_value=pd.Timestamp("2026-05-28")):
            ref_date = self.builder.resolve_web_reference_date({"as_of_date": "2026-04-14"}, "2026-05-11")

        self.assertEqual(pd.Timestamp("2026-05-11"), ref_date)

    def test_default_profile_file_uses_2026_q2_workbook(self):
        self.assertEqual("fund_profile_20260630_v3_4 copy.xlsx", self.builder.DEFAULT_PROFILE_FILE.name)

    def test_profile_columns_keep_actual_comparison_date(self):
        columns = [
            "基金规模合计[交易日期] 2026-06-30",
            "是否缺失最新规模数据_20260630",
            "基金规模合计[交易日期] 2025-12-31",
        ]

        latest_col, latest_date, prev_col, prev_date, repaired_col = self.builder.detect_latest_profile_columns(columns)

        self.assertEqual(columns[0], latest_col)
        self.assertEqual(pd.Timestamp("2026-06-30"), latest_date)
        self.assertEqual(columns[2], prev_col)
        self.assertEqual(pd.Timestamp("2025-12-31"), prev_date)
        self.assertEqual(columns[1], repaired_col)

    def test_scale_profile_exposes_latest_scale_coverage(self):
        profile_df = pd.DataFrame(
            [
                {
                    "security_code": "A.OF",
                    "fund_name": "样本A",
                    "fund_full_name": "样本A",
                    "fund_company": "华夏",
                    "fof_type": "普通FOF",
                    "rd_type": "FOF",
                    "latest_scale": 10.0,
                    "prev_scale": 8.0,
                    "is_repaired_scale": False,
                },
                {
                    "security_code": "B.OF",
                    "fund_name": "样本B",
                    "fund_full_name": "样本B",
                    "fund_company": "同业",
                    "fof_type": "养老FOF",
                    "rd_type": "FOF-养老",
                    "latest_scale": None,
                    "prev_scale": 5.0,
                    "is_repaired_scale": False,
                },
            ]
        )

        profile = self.builder.build_fof_scale_profile(
            profile_df,
            {"key_companies": ["华夏"]},
            {"sheet_name": "基金规模画像", "scale_as_of_date": "2026-06-30", "prev_scale_as_of_date": "2025-12-31"},
            "profile.xlsx",
        )

        self.assertEqual(1, profile["latest_scale_sample_count"])
        self.assertEqual(1, profile["latest_scale_missing_count"])
        self.assertEqual(50.0, profile["latest_scale_coverage_pct"])

    def test_custodian_landscape_separates_profile_scale_and_raise_scale(self):
        active = pd.DataFrame(
            [
                {
                    "product_id": "ACTIVE_A",
                    "fund_name": "华夏测试FOF",
                    "fund_full_name": "华夏测试基金中基金(FOF)",
                    "security_code": "000001.OF",
                    "fund_company": "华夏",
                    "fof_type": "普通FOF",
                    "custodian": "",
                    "current_stage": "已获批",
                    "latest_event_date": pd.Timestamp("2026-02-01"),
                    "raise_scale": 5.0,
                }
            ]
        )
        stock = pd.DataFrame(
            [
                {
                    "security_code": "000001.OF",
                    "fund_name": "华夏测试FOF",
                    "fund_full_name": "华夏测试基金中基金(FOF)",
                    "fund_company": "华夏",
                    "fof_type": "普通FOF",
                    "custodian": "招商银行",
                    "fund_establish_date": pd.Timestamp("2026-03-01"),
                    "latest_scale": 12.0,
                }
            ]
        )

        landscape = self.builder.build_custodian_landscape(
            active,
            stock,
            {"key_companies": ["华夏"]},
            pd.Timestamp("2026-06-30"),
        )
        row = landscape["scopes"]["all"]["rows"][0]

        self.assertEqual(1, row["product_count"])
        self.assertEqual("招商银行", row["custodian"])
        self.assertEqual(0, row["pipeline_count"])
        self.assertEqual(1, row["established_count"])
        self.assertEqual(12.0, row["profile_scale_sum"])
        self.assertEqual(5.0, row["active_raise_scale_sum"])
        self.assertNotIn("raise_scale_sum", row)
        self.assertEqual("000001.OF", row["focus_products"][0]["security_code"])
        self.assertEqual("华夏测试基金中基金(FOF)", row["focus_products"][0]["fund_name"])

    def test_real_profile_custodian_huaxia_lists_match_expected_banks(self):
        profile_df, _ = self.builder.load_fund_profile_data(self.builder.DEFAULT_PROFILE_FILE)
        combined = self.builder._build_custodian_dataframe(pd.DataFrame(), profile_df)
        rows, _ = self.builder._aggregate_custodian_rows(
            combined,
            {"key_companies": ["华夏"]},
            pd.Timestamp("2026-08-28"),
            "华夏",
            30,
            "all",
        )
        by_custodian = {row["custodian"]: row for row in rows}

        self.assertEqual(8, by_custodian["招商银行"]["focus_count"])
        self.assertEqual(31.93, by_custodian["招商银行"]["focus_profile_scale_sum"])
        self.assertEqual(6, by_custodian["中国建设银行"]["focus_count"])
        self.assertEqual(88.87, by_custodian["中国建设银行"]["focus_profile_scale_sum"])
        self.assertEqual(
            "华夏行业配置股票型基金中基金(FOF-LOF)",
            next(
                item["fund_name"]
                for item in by_custodian["中国建设银行"]["focus_products"]
                if item["security_code"] == "501217.OF"
            ),
        )


if __name__ == "__main__":
    unittest.main()
