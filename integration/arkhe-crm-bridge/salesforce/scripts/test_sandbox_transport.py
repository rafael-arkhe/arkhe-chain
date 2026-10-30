"""Offline transport tests: correlation is evidence, never an inferred guarantee."""
from email.message import Message
import io
import unittest
from unittest.mock import patch
import urllib.error
from sandbox_tools import Sandbox


class Response:
    status = 204
    headers = {"X-SFDC-Request-ID": "server-fixture", "Set-Cookie": "private-cookie"}
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self):
        return b""


class TransportTest(unittest.TestCase):
    def sandbox(self):
        sandbox = Sandbox.__new__(Sandbox)
        sandbox.url = "https://fixture.invalid"
        sandbox.token = "private-token"
        return sandbox

    def test_success_captures_timing_and_only_request_headers(self):
        evidence = {}
        with patch("urllib.request.urlopen", return_value=Response()):
            status, body = self.sandbox().request("PATCH", "sobjects/Lead/fixture", {}, evidence=evidence)
        self.assertEqual((status, body), (204, None))
        self.assertEqual(evidence["response_request_id_headers"], {"X-SFDC-Request-ID": "server-fixture"})
        self.assertGreaterEqual(evidence["client_elapsed_ms"], 0)
        self.assertIn("client_finished_at", evidence)
        self.assertNotIn("private-", str(evidence))

    def test_denial_captures_error_request_id_and_body(self):
        headers = Message()
        headers["X-Request-ID"] = "error-fixture"
        headers["Set-Cookie"] = "private-cookie"
        error = urllib.error.HTTPError("https://fixture.invalid", 400, "denied", headers,
            io.BytesIO(b'[{"errorCode":"FIELD_CUSTOM_VALIDATION_EXCEPTION"}]'))
        evidence = {}
        with patch("urllib.request.urlopen", side_effect=error):
            status, body = self.sandbox().request("PATCH", "sobjects/Lead/fixture", {}, evidence=evidence)
        self.assertEqual(status, 400)
        self.assertEqual(body[0]["errorCode"], "FIELD_CUSTOM_VALIDATION_EXCEPTION")
        self.assertEqual(evidence["response_request_id_headers"], {"X-Request-ID": "error-fixture"})
        self.assertIn("client_finished_at", evidence)
        self.assertNotIn("private-", str(evidence))

    def test_missing_server_id_is_left_empty(self):
        response = Response()
        response.headers = {}
        evidence = {}
        with patch("urllib.request.urlopen", return_value=response):
            self.sandbox().request("PATCH", "sobjects/Lead/fixture", {}, evidence=evidence)
        self.assertEqual(evidence["response_request_id_headers"], {})


if __name__ == "__main__":
    unittest.main()
