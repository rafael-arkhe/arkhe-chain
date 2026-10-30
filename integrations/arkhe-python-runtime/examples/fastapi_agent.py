"""Run from this directory with uvicorn fastapi_agent:create_app --factory."""
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict
from arkhe_verify import LocalDevGate, AuthorizationRejected, MmrVerifier, VerificationError
from arkhe_agent_guard import guarded_tool


class Simulation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: int


class Proof(BaseModel):
    model_config = ConfigDict(extra="forbid")
    leaf_hex: str
    leaf_count: int
    proof: list[dict]


def create_app():
    gate = LocalDevGate(Path(os.environ["ARKHE_GATE_BIN"]))
    verifier = MmrVerifier(os.environ["ARKHE_VERIFY_WASM"])
    # Root comes from server configuration, never from the proof submitter.
    root = bytes.fromhex(os.environ["ARKHE_TRUSTED_ROOT"])
    if len(root) != 32:
        raise ValueError("ARKHE_TRUSTED_ROOT must contain 32 bytes")
    app = FastAPI(title="Arkhe Python local development example")

    @guarded_tool(gate, intent_type="Simulate")
    async def simulate(value: int):
        return {"simulated_value": value * 2}

    @app.post("/agent/simulate")
    async def run(request: Simulation):
        try:
            return await simulate(value=request.value)
        except AuthorizationRejected as error:
            raise HTTPException(403, str(error)) from error
        except (OSError, TimeoutError) as error:
            raise HTTPException(503, "gate unavailable") from error

    @app.post("/verify-mmr-proof")
    def verify(request: Proof):
        try:
            valid = verifier.verify(bytes.fromhex(request.leaf_hex), request.leaf_count, request.proof, root)
        except (ValueError, VerificationError) as error:
            raise HTTPException(422, str(error)) from error
        if not valid:
            raise HTTPException(403, "proof does not match trusted root")
        return {"verified": True}

    return app
