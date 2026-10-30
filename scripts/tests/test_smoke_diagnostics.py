import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).parents[1]))
from analyze_protocol_usage import analyze
from probe_smoke_isolation import probe


class DiagnosticTests(unittest.TestCase):
    def test_partial_failure_counts_and_no_cost_per_success(self):
        rows=[{"arm":"B","usage":{"measured_tokens":12,"wall_seconds":2},
            "partial_provider_observation":{"provider_response":{"prompt_eval_count":5,"eval_count":7}},
            "timings":{"generation_seconds":1.5,"preflight_seconds":.1}}]
        report=analyze(rows)
        self.assertEqual(report["by_arm"]["B"]["prompt_tokens"],5)
        self.assertEqual(report["by_arm"]["B"]["output_tokens"],7)
        self.assertIsNone(report["by_arm"]["B"]["cost_per_success"])

    def test_mismatching_provider_count_rejected(self):
        rows=[{"arm":"A","usage":{"measured_tokens":3,"wall_seconds":1},
               "provider_response":{"prompt_eval_count":5,"eval_count":7}}]
        with self.assertRaises(ValueError): analyze(rows)

    def test_host_cwd_is_not_filesystem_isolation(self):
        report=probe()
        self.assertEqual(report["host_filesystem_boundary"],"NOT_ISOLATED")
        self.assertEqual(len(report["observations"]),3)
        self.assertFalse(report["real_records_accessed"])
        self.assertEqual(report["sandbox"],"NOT_QUALIFIED")


if __name__ == "__main__": unittest.main()
