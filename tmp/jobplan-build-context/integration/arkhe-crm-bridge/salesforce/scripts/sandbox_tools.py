"""Sandbox-only authenticated tooling. Tokens remain in memory, never evidence."""
import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request


class Sandbox:
    def __init__(self, alias, expected_sandbox=True):
        self.sf = shutil.which("sf")
        if not self.sf:
            raise RuntimeError("Salesforce CLI (sf) is required; no command was executed")
        process = subprocess.run([self.sf, "org", "display", "--target-org", alias,
                                  "--verbose", "--json"], capture_output=True, text=True)
        if process.returncode:
            raise RuntimeError("Cannot access the selected authenticated org")
        result = json.loads(process.stdout)["result"]
        self.url = result["instanceUrl"].rstrip("/")
        self.token = result["accessToken"]
        if urllib.parse.urlparse(self.url).scheme != "https":
            raise RuntimeError("HTTPS org endpoint required")
        rows = self.query("SELECT Id, IsSandbox FROM Organization")
        if len(rows) != 1 or rows[0].get("IsSandbox") is not expected_sandbox:
            raise RuntimeError("Refusing to operate: Organization.IsSandbox differs from the explicit target type")
        self.org_id = rows[0]["Id"]

    def request(self, method, resource, payload=None, evidence=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(self.url + "/services/data/v65.0/" + resource,
            data=data, method=method, headers={"Authorization": "Bearer " + self.token,
                                            "Content-Type": "application/json"})
        started = time.perf_counter()
        if evidence is not None:
            evidence["client_started_at"] = datetime.now(timezone.utc).isoformat()
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                if evidence is not None:
                    evidence["response_request_id_headers"] = {k: v for k, v in response.headers.items()
                        if k.lower() in {"x-sfdc-request-id", "x-request-id", "sforce-request-id"}}
                body = response.read()
                return response.status, json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            if evidence is not None:
                evidence["response_request_id_headers"] = {k: v for k, v in error.headers.items()
                    if k.lower() in {"x-sfdc-request-id", "x-request-id", "sforce-request-id"}}
            body = error.read()
            return error.code, json.loads(body) if body else None
        finally:
            if evidence is not None:
                evidence["client_finished_at"] = datetime.now(timezone.utc).isoformat()
                evidence["client_elapsed_ms"] = round((time.perf_counter() - started) * 1000, 3)

    def query(self, soql):
        status, body = self.request("GET", "query?" + urllib.parse.urlencode({"q": soql}))
        if status != 200:
            raise RuntimeError("Sandbox query failed; verify API and object access")
        if body.get("done") is not True:
            raise RuntimeError("Unexpected paginated query")
        return body["records"]
