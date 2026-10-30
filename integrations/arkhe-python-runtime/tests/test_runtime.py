import asyncio
import importlib.util
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from arkhe_verify import MmrVerifier, VerificationError, LocalDevGate, AuthorizationRejected
from arkhe_agent_guard import guarded_tool

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WASM = ROOT / "target/wasm32-unknown-unknown/release/arkhe_python_bridge.wasm"
GATE = ROOT / "target/debug" / ("arkhe-python-gate.exe" if __import__("os").name == "nt" else "arkhe-python-gate")


@pytest.fixture
def proof():
    return json.loads((HERE / "mmr_fixture.json").read_text(encoding="utf-8-sig"))


def test_real_wasm_verification(proof):
    verifier = MmrVerifier(WASM)
    args = (bytes(proof["leaf"]), proof["leaf_count"], proof["proof"], bytes(proof["root"]))
    assert verifier.verify(*args)
    assert not verifier.verify(b"tampered", *args[1:])
    assert not verifier.verify(*args[:3], bytes(32))
    with pytest.raises(VerificationError):
        verifier.verify(args[0], 0, args[2], args[3])
    with pytest.raises(VerificationError):
        verifier.verify(args[0], 3, [{"kind": "bad"}], args[3])
    with pytest.raises(VerificationError):
        verifier.verify(b"x" * 65536, *args[1:])


def test_real_gate_and_guard():
    calls = []
    gate = LocalDevGate(GATE)

    @guarded_tool(gate, intent_type="Simulate")
    async def allowed(value):
        calls.append(value)
        return value * 2

    @guarded_tool(gate, intent_type="Publish")
    def denied(value):
        calls.append(value)

    async def run():
        assert await allowed(value=4) == 8
        with pytest.raises(AuthorizationRejected):
            await denied(value=9)
    asyncio.run(run())
    assert calls == [4]


def test_snapshot_and_fail_closed():
    original = {"values": [1]}

    class MutatingGate:
        async def authorize(self, **request):
            original["values"].append(2)
            assert json.loads(request["arguments_json"]) == {"data": {"values": [1]}}
            return {"decision": "Allow"}

    @guarded_tool(MutatingGate(), intent_type="Simulate")
    async def snapshot(data):
        return data
    assert asyncio.run(snapshot(data=original)) == {"values": [1]}

    class RejectingGate:
        async def authorize(self, **request):
            return {"decision": "Reject"}

    @guarded_tool(RejectingGate(), intent_type="Simulate")
    async def never():
        pytest.fail("rejected tool ran")
    with pytest.raises(AuthorizationRejected):
        asyncio.run(never())


@pytest.mark.parametrize("response,code", [(b"not-json", 0), (b'{}', 0),
    (b'{"decision":"Allow","authorization_ref":"bad"}', 0), (b"", 1)])
def test_gate_adapter_failure_blocks_tool(monkeypatch, response, code):
    class Process:
        returncode = code

        async def communicate(self, payload):
            return response, b""

    async def spawn(*args, **kwargs):
        return Process()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)

    @guarded_tool(LocalDevGate(GATE), intent_type="Simulate")
    async def never():
        pytest.fail("failed gate allowed tool execution")

    with pytest.raises(AuthorizationRejected):
        asyncio.run(never())


def test_gate_timeout_kills_process(monkeypatch):
    class Process:
        returncode = None
        killed = False
        waited = False

        async def communicate(self, payload):
            await asyncio.Event().wait()

        def kill(self):
            self.killed = True

        async def wait(self):
            self.waited = True

    process = Process()

    async def spawn(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)

    @guarded_tool(LocalDevGate(GATE, timeout=0.01), intent_type="Simulate")
    async def never():
        pytest.fail("timed out gate allowed tool execution")

    with pytest.raises(TimeoutError):
        asyncio.run(never())
    assert process.killed and process.waited


def test_fastapi_flow(monkeypatch, proof):
    monkeypatch.setenv("ARKHE_GATE_BIN", str(GATE))
    monkeypatch.setenv("ARKHE_VERIFY_WASM", str(WASM))
    monkeypatch.setenv("ARKHE_TRUSTED_ROOT", bytes(proof["root"]).hex())
    spec = importlib.util.spec_from_file_location("fastapi_agent", HERE.parent / "examples/fastapi_agent.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with TestClient(module.create_app()) as client:
        response = client.post("/agent/simulate", json={"value": 7})
        assert response.status_code == 200
        assert response.json() == {"simulated_value": 14}
        request = {"leaf_hex": bytes(proof["leaf"]).hex(), "leaf_count": 3, "proof": proof["proof"]}
        assert client.post("/verify-mmr-proof", json=request).status_code == 200
        request["leaf_hex"] = "00"
        assert client.post("/verify-mmr-proof", json=request).status_code == 403
        request["root"] = proof["root"]
        assert client.post("/verify-mmr-proof", json=request).status_code == 422
