import http.client
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from live_http_conformance import wait_healthy


class ReadinessTests(unittest.TestCase):
    def test_restart_transport_failures_recover_only_after_health_200(self):
        check = Mock(side_effect=[ConnectionResetError(), http.client.RemoteDisconnected(), 503, 200])
        wait_healthy(check, attempts=4, delay=0)
        self.assertEqual(check.call_count, 4)

    def test_persistent_transport_failure_is_bounded_and_fails(self):
        check = Mock(side_effect=ConnectionResetError())
        with self.assertRaises(RuntimeError):
            wait_healthy(check, attempts=3, delay=0)
        self.assertEqual(check.call_count, 3)

    def test_unhealthy_status_never_counts_as_ready(self):
        check = Mock(return_value=503)
        with self.assertRaises(RuntimeError):
            wait_healthy(check, attempts=2, delay=0)
        self.assertEqual(check.call_count, 2)

    def test_programming_errors_are_not_swallowed(self):
        with self.assertRaises(ValueError):
            wait_healthy(Mock(side_effect=ValueError()), attempts=2, delay=0)


if __name__ == '__main__':
    unittest.main()
