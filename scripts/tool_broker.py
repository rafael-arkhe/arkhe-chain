"""Budget mediator for trusted adapters; built-in tools run in short-lived workers.

This is not a sandbox for arbitrary code or an authoritative model token meter.
"""
import json
import math
import subprocess
import sys
import time
from pathlib import Path
from threading import RLock


class BudgetExceeded(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def natural(value, name):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer")
    return value


class ToolBroker:
    """One instance per task/arm/attempt; same limits, independent counters.

    Token reservation is an upper-bound admission check for a future trusted
    provider adapter. It is not inferred from text or accepted from the agent.
    Unsettled grants retain their full reservation; no optimistic refunds.
    """
    def __init__(self, limits, data=None, clock=time.monotonic):
        self.max_tokens = natural(limits["max_tokens"], "max_tokens")
        self.max_tool_calls = natural(limits["max_tool_calls"], "max_tool_calls")
        wall = limits["max_wall_clock"]
        if isinstance(wall, bool) or not isinstance(wall, (int, float)) or not math.isfinite(wall) or wall <= 0:
            raise ValueError("max_wall_clock must be positive and finite")
        self._clock = clock
        self._started = clock()
        self._deadline = self._started + wall
        self._data = json.loads(json.dumps(data or {}, allow_nan=False))
        self._lock = RLock()
        self._grants = {}
        self._next_grant = 0
        self._tokens = 0
        self._reserved = 0
        self._calls = 0
        self._closed = False
        self._failure = None
        self.events = []

    def _check(self):
        if self._failure:
            raise BudgetExceeded(self._failure)
        if self._closed:
            raise RuntimeError("broker closed")
        if self._clock() >= self._deadline:
            self._fail("timeout")

    def _fail(self, reason):
        self._failure = reason
        self.events.append({"event": "budget_rejected", "reason": reason})
        raise BudgetExceeded(reason)

    def reserve_tokens(self, upper_bound):
        """Host-only API: provider must enforce this bound on total metered tokens."""
        with self._lock:
            self._check()
            natural(upper_bound, "upper_bound")
            if self._tokens + self._reserved + upper_bound > self.max_tokens:
                self._fail("token_limit")
            grant = self._next_grant
            self._next_grant += 1
            self._grants[grant] = upper_bound
            self._reserved += upper_bound
            self.events.append({"event": "tokens_reserved", "grant": grant, "upper_bound": upper_bound})
            return grant

    def settle_tokens(self, grant, measured):
        """Host-only, trusted provider usage; never expose settlement to a candidate."""
        with self._lock:
            natural(measured, "measured")
            if grant not in self._grants:
                raise ValueError("unknown or already settled grant")
            bound = self._grants[grant]
            if measured > bound:
                # Preserve the actual reported overrun rather than hiding its cost.
                self._tokens += measured
                self._reserved -= self._grants.pop(grant)
                self._fail("token_limit")
            self._tokens += measured
            self._reserved -= self._grants.pop(grant)
            self.events.append({"event": "tokens_settled", "grant": grant, "measured": measured})
            self._check()

    def call(self, name, arguments):
        with self._lock:
            self._check()
            if self._calls >= self.max_tool_calls:
                self._fail("tool_limit")
            if name not in ("lookup", "add"):
                raise ValueError("tool not allowed")
            payload = json.dumps({"name": name, "arguments": arguments, "data": self._data},
                                 allow_nan=False).encode()
            if len(payload) > 65536:
                raise ValueError("tool input too large")
            self._calls += 1
            self.events.append({"event": "tool_started", "name": name, "call": self._calls})
            remaining = self._deadline - self._clock()
            if remaining <= 0:
                self._fail("timeout")
            try:
                # Only this fixed worker runs: no candidate executable or shell.
                process = subprocess.run(
                    [sys.executable, "-I", str(Path(__file__).resolve()), "--worker"],
                    input=payload, capture_output=True, timeout=remaining, check=False,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
            except subprocess.TimeoutExpired:
                self._fail("timeout")
            self._check()
            if process.returncode:
                raise ValueError("tool rejected arguments")
            result = json.loads(process.stdout)
            self.events.append({"event": "tool_finished", "name": name, "call": self._calls})
            return result

    def usage(self):
        with self._lock:
            return {"tokens": self._tokens + self._reserved, "tool_calls": self._calls,
                    "wall_seconds": max(0, self._clock() - self._started),
                    "measured_tokens": self._tokens, "reserved_tokens": self._reserved}

    def remaining_seconds(self):
        with self._lock:
            self._check()
            return self._deadline - self._clock()

    def reject_budget(self, reason):
        """Trusted adapter reports a terminal provider-enforced budget stop."""
        if reason not in ("timeout", "token_limit", "tool_limit"):
            raise ValueError("unknown budget rejection")
        with self._lock:
            self._fail(reason)

    def finish(self):
        with self._lock:
            self._check()
            if self._grants:
                raise RuntimeError("unsettled token grants prevent completion")
            self._closed = True
            return self.usage()


def worker(payload):
    args = payload["arguments"]
    if payload["name"] == "lookup":
        key = args["key"]
        if not isinstance(key, str):
            raise ValueError("lookup key must be a string")
        return payload["data"][key]
    if payload["name"] == "add":
        values = args["values"]
        if not isinstance(values, list) or len(values) > 256:
            raise ValueError("bounded list required")
        if any(isinstance(v, bool) or not isinstance(v, int) or v.bit_length() > 1024 for v in values):
            raise ValueError("bounded integers required")
        return sum(values)
    raise ValueError("tool not allowed")


if __name__ == "__main__":
    if sys.argv[1:] != ["--worker"]:
        raise SystemExit("Import ToolBroker; only --worker is supported as a subprocess.")
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise SystemExit("input too large")
    print(json.dumps(worker(json.loads(raw)), allow_nan=False))
