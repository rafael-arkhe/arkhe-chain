"""Local subprocess adapter to the real Rust development ContainmentGate.

The returned authorization_ref is a reference, not a signed portable proof.
No durable idempotency or evidence admission is implied by this adapter.
"""
import asyncio
import json
import re
from pathlib import Path


class AuthorizationRejected(RuntimeError):
    pass


class LocalDevGate:
    def __init__(self, executable: str | Path, timeout: float = 5):
        self.executable = str(Path(executable).resolve(strict=True))
        self.timeout = timeout

    async def authorize(self, *, tool: str, intent_type: str, arguments_json: str, request_id: str) -> dict:
        payload = json.dumps(dict(tool=tool, intent_type=intent_type,
                                  arguments_json=arguments_json, request_id=request_id)).encode()
        if len(payload) > 65536:
            raise AuthorizationRejected("authorization request too large")
        process = await asyncio.create_subprocess_exec(
            self.executable, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(payload), self.timeout)
        except BaseException:
            if process.returncode is None:
                process.kill()
            await process.wait()
            raise
        if process.returncode:
            raise AuthorizationRejected("gate process failed")
        try:
            result = json.loads(stdout)
            if result.get("decision") != "Allow":
                raise AuthorizationRejected(result.get("reason", "gate rejected action"))
            for field in ("authorization_ref", "operation_id"):
                if not isinstance(result.get(field), str) or not re.fullmatch(r"[0-9a-f]{64}", result[field]):
                    raise ValueError("invalid authorization reference")
        except (ValueError, AttributeError, TypeError) as error:
            raise AuthorizationRejected("malformed gate response") from error
        return result
