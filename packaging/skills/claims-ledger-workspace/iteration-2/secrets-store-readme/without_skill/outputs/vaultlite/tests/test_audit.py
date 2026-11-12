import json
from vaultlite import audit, server


def test_reads_and_writes_are_logged(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "LOG_PATH", str(tmp_path / "audit.log"))
    from vaultlite.crypto import new_key
    monkeypatch.setattr(server, "MASTER_KEY", new_key())
    server.put("db", "pw", "ana")
    server.get("db", "ana")
    actions = [json.loads(l)["action"] for l in open(tmp_path / "audit.log")]
    assert actions == ["write", "read"]
