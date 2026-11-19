"""Vendor client for arkhe-receipt/v1.

A verdict is not an effect and not a payment. Gate 1 is a record outside this module.
"""

import json
import subprocess
import urllib.request


def verify_http(base_url, receipt, trust, expect_purpose, **bindings):
    body = {
        "receipt": receipt,
        "trust": trust,
        "expect_purpose": expect_purpose,
    }
    for key in ("subject_sha256", "policy_sha256", "admission_id", "commit_id"):
        if bindings.get(key) is not None:
            body[key] = bindings[key]
    request = urllib.request.Request(
        base_url.rstrip("/") + "/v1/verify",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode())


def verify_mcp(binary, receipt, trust, expect_purpose, **bindings):
    arguments = {
        "receipt": receipt,
        "trust": trust,
        "expect_purpose": expect_purpose,
    }
    for key in ("subject_sha256", "policy_sha256", "admission_id", "commit_id"):
        if bindings.get(key) is not None:
            arguments[key] = bindings[key]
    process = subprocess.Popen(
        [binary, "mcp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
    )
    try:
        _request(process, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        _notify(process, {"jsonrpc": "2.0", "method": "notifications/initialized"})
        response = _request(
            process,
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "verify_receipt", "arguments": arguments},
            },
        )
    finally:
        process.kill()
    if response.get("result", {}).get("isError"):
        raise RuntimeError(response["result"]["content"][0]["text"])
    return json.loads(response["result"]["content"][0]["text"])


def _request(process, message):
    _notify(process, message)
    return _read(process.stdout)


def _notify(process, message):
    payload = json.dumps(message).encode()
    process.stdin.write(f"Content-Length: {len(payload)}\r\n\r\n".encode() + payload)
    process.stdin.flush()


def _read(stdout):
    length = None
    while True:
        line = stdout.readline()
        if line == b"":
            raise RuntimeError("mcp server closed stdout")
        if line in (b"\r\n", b"\n"):
            break
        if line.lower().startswith(b"content-length:"):
            length = int(line.split(b":", 1)[1].strip())
    if length is None:
        raise RuntimeError("mcp frame is missing Content-Length")
    return json.loads(stdout.read(length).decode())
