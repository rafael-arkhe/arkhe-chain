from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from live_runtime import wait_ready


class PostgresReadinessTests(unittest.TestCase):
    def test_unix_only_initialization_server_cannot_satisfy_readiness(self):
        probes = []

        def probe(command, **kwargs):
            probes.append(command)
            tcp = '-h' in command and command[command.index('-h') + 1] == '127.0.0.1'
            # The temporary server would accept Unix sockets immediately.
            code = 1 if tcp and len(probes) == 1 else 0
            return subprocess.CompletedProcess(command, code)

        with patch('live_runtime.subprocess.run', side_effect=probe), patch('live_runtime.time.sleep'):
            wait_ready(['docker'])
        self.assertEqual(len(probes), 2)
        self.assertTrue(all('-h' in command for command in probes))

    def test_unavailable_database_remains_a_bounded_failure(self):
        with patch('live_runtime.subprocess.run', return_value=subprocess.CompletedProcess([], 1)) as probe, patch('live_runtime.time.sleep'):
            with self.assertRaises(RuntimeError):
                wait_ready(['docker'])
        self.assertEqual(probe.call_count, 60)


if __name__ == '__main__':
    unittest.main()
