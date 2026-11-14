"""Arkhe RAG v3: a local, transactional disclosure boundary.

Trusted callers supply authenticated identity; this module is NOT an HTTP auth
service. SQLite administrators, the Python process and its clock are trusted.
No LLM, network sender, production corpus, or blockchain is used by the demo.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
from typing import Callable, Iterator


ACTIONS = frozenset({"generate", "display", "export", "cache"})
RELEASE_ACTIONS = ACTIONS - {"generate"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> str:
    """Application-local encoding; not a claim of cross-language canonical JSON."""
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


class Denied(Exception):
    """Fixed reason codes only: no document text in exceptions."""


@dataclass(frozen=True)
class Scope:
    tenant: str
    principal: str
    destination: str
    purpose: str

    def values(self) -> tuple[str, ...]:
        values = (self.tenant, self.principal, self.destination, self.purpose)
        if not all(isinstance(value, str) and value.strip() for value in values):
            raise Denied("invalid_scope")
        return values


@dataclass(frozen=True)
class Release:
    body: str
    receipt: dict


SCHEMA = """
CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL,
                   last_tick INTEGER NOT NULL);
INSERT INTO meta VALUES (1, 0, 0);
CREATE TABLE sources (id TEXT PRIMARY KEY, tenant TEXT NOT NULL,
    document_version TEXT NOT NULL, content BLOB NOT NULL, digest TEXT NOT NULL);
CREATE TABLE grants (tenant TEXT NOT NULL, principal TEXT NOT NULL,
    destination TEXT NOT NULL, purpose TEXT NOT NULL, source_id TEXT NOT NULL
    REFERENCES sources(id), action TEXT NOT NULL, valid_from INTEGER NOT NULL,
    valid_until INTEGER NOT NULL, active INTEGER NOT NULL,
    PRIMARY KEY(tenant,principal,destination,purpose,source_id,action));
CREATE TABLE generations (id TEXT PRIMARY KEY, tenant TEXT NOT NULL,
    principal TEXT NOT NULL, destination TEXT NOT NULL, purpose TEXT NOT NULL,
    candidates TEXT NOT NULL, context TEXT NOT NULL, context_digest TEXT NOT NULL,
    state TEXT NOT NULL, answer TEXT, citations TEXT, answer_digest TEXT);
CREATE TABLE receipts (seq INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_id TEXT NOT NULL, stage TEXT NOT NULL, verdict TEXT NOT NULL,
    reason TEXT NOT NULL, policy_revision INTEGER NOT NULL, decision_time INTEGER NOT NULL,
    scope_digest TEXT NOT NULL, context_digest TEXT NOT NULL, answer_digest TEXT);
CREATE TABLE permission_events (seq INTEGER PRIMARY KEY AUTOINCREMENT,
    revision INTEGER NOT NULL, kind TEXT NOT NULL, scope_digest TEXT NOT NULL,
    source_id TEXT NOT NULL, action TEXT NOT NULL, recorded_at INTEGER NOT NULL);
"""


class Gateway:
    """One connection per instance/thread, all policy mutations share this database.

    BEGIN IMMEDIATE serializes grant/revoke and release decisions. The boundary
    is return to a trusted local caller after commit, not delivery over a socket.
    Receipts are transactional records, not independently signed attestations.
    """

    def __init__(self, path: Path, clock: Callable[[], int] = time.time_ns,
                 timeout: float = 5.0):
        self._clock = clock
        self._db = sqlite3.connect(str(path), timeout=timeout, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA foreign_keys=ON")

    @classmethod
    def initialize(cls, path: Path) -> None:
        # Exclusive file creation prevents silently reinitializing an existing DB.
        with path.open("xb"):
            pass
        with sqlite3.connect(str(path)) as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)

    def close(self) -> None:
        self._db.close()

    @contextmanager
    def _transaction(self) -> Iterator[None]:
        try:
            self._db.execute("BEGIN IMMEDIATE")
            yield
            self._db.execute("COMMIT")
        except sqlite3.Error:
            if self._db.in_transaction:
                self._db.execute("ROLLBACK")
            raise Denied("storage_unavailable") from None
        except BaseException:
            if self._db.in_transaction:
                self._db.execute("ROLLBACK")
            raise

    def _tick(self) -> int:
        now = self._clock()
        previous = self._db.execute("SELECT last_tick FROM meta WHERE id=1").fetchone()[0]
        if type(now) is not int or now < previous:
            raise Denied("clock_invalid_or_regressed")
        self._db.execute("UPDATE meta SET last_tick=? WHERE id=1", (now,))
        return now

    def add_source(self, source_id: str, tenant: str, document_version: str,
                   content: bytes) -> None:
        if not source_id or not tenant or not document_version or not content:
            raise Denied("invalid_source")
        with self._transaction():
            self._db.execute("INSERT INTO sources VALUES (?,?,?,?,?)",
                             (source_id, tenant, document_version, content, digest(content)))

    def _source(self, source_id: str, tenant: str) -> sqlite3.Row:
        row = self._db.execute("SELECT * FROM sources WHERE id=? AND tenant=?",
                               (source_id, tenant)).fetchone()
        if row is None:
            raise Denied("source_unavailable")
        if digest(row["content"]) != row["digest"]:
            raise Denied("source_integrity_failed")
        return row

    def set_permission(self, scope: Scope, source_id: str, action: str, *,
                       active: bool, valid_from: int, valid_until: int) -> None:
        """Trusted administrative API; no caller-supplied historical event time."""
        values = scope.values()
        if (action not in ACTIONS or type(active) is not bool
                or type(valid_from) is not int or type(valid_until) is not int
                or valid_from < 0 or valid_until <= valid_from):
            raise Denied("invalid_permission")
        with self._transaction():
            self._source(source_id, scope.tenant)
            now = self._tick()
            self._db.execute("UPDATE meta SET revision=revision+1 WHERE id=1")
            revision = self._db.execute("SELECT revision FROM meta WHERE id=1").fetchone()[0]
            self._db.execute("INSERT INTO grants VALUES (?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(tenant,principal,destination,purpose,source_id,action) "
                "DO UPDATE SET active=excluded.active,valid_from=excluded.valid_from,"
                "valid_until=excluded.valid_until",
                (*values, source_id, action, valid_from, valid_until, int(active)))
            self._db.execute("INSERT INTO permission_events "
                "(revision,kind,scope_digest,source_id,action,recorded_at) VALUES (?,?,?,?,?,?)",
                (revision, "grant" if active else "revoke", digest(encoded(values).encode()),
                 source_id, action, now))

    def _authorize(self, scope: Scope, source_ids: list[str], action: str, now: int) -> None:
        for source_id in source_ids:
            self._source(source_id, scope.tenant)
            row = self._db.execute("SELECT * FROM grants WHERE tenant=? AND principal=? "
                "AND destination=? AND purpose=? AND source_id=? AND action=?",
                (*scope.values(), source_id, action)).fetchone()
            if row is None or not row["active"]:
                raise Denied("permission_denied")
            # Half-open interval: expiration at exactly valid_until is denied.
            if not row["valid_from"] <= now < row["valid_until"]:
                raise Denied("permission_not_current")

    def _receipt(self, generation: sqlite3.Row, stage: str, verdict: str,
                 reason: str, now: int, scope: Scope) -> dict:
        revision = self._db.execute("SELECT revision FROM meta WHERE id=1").fetchone()[0]
        receipt = dict(generation_id=generation["id"], stage=stage, verdict=verdict,
                       reason=reason, policy_revision=revision, decision_time=now,
                       scope_digest=digest(encoded(scope.values()).encode()),
                       context_digest=generation["context_digest"],
                       answer_digest=generation["answer_digest"])
        self._db.execute("INSERT INTO receipts (generation_id,stage,verdict,reason,"
            "policy_revision,decision_time,scope_digest,context_digest,answer_digest) "
            "VALUES (:generation_id,:stage,:verdict,:reason,:policy_revision,:decision_time,"
            ":scope_digest,:context_digest,:answer_digest)", receipt)
        receipt["seq"] = self._db.execute("SELECT last_insert_rowid()").fetchone()[0]
        return receipt

    def prepare(self, generation_id: str, scope: Scope, candidates: list[str],
                context: list[str]) -> tuple[bytes, ...]:
        """Commit a manifest before returning context to a trusted local generator.

        The caller must pass these exact returned bytes to its local generator.
        There is no proof here that an arbitrary external runtime did so.
        """
        values = scope.values()
        if (not generation_id or not context or len(set(context)) != len(context)
                or len(set(candidates)) != len(candidates)
                or not set(context).issubset(candidates)):
            raise Denied("context_outside_candidates_or_invalid")
        with self._transaction():
            now = self._tick()
            self._authorize(scope, context, "generate", now)
            sources = [self._source(source, scope.tenant) for source in context]
            manifest = [dict(id=s["id"], document_version=s["document_version"],
                             digest=s["digest"]) for s in sources]
            context_digest = digest(encoded(manifest).encode())
            self._db.execute("INSERT INTO generations "
                "(id,tenant,principal,destination,purpose,candidates,context,context_digest,state) "
                "VALUES (?,?,?,?,?,?,?,?,?)", (generation_id, *values, encoded(candidates),
                    encoded(manifest), context_digest, "context_released"))
            generation = self._generation(generation_id, scope)
            self._receipt(generation, "generate", "allow", "context_released_to_local_adapter", now, scope)
            bodies = tuple(s["content"] for s in sources)
        return bodies

    def _generation(self, generation_id: str, scope: Scope) -> sqlite3.Row:
        row = self._db.execute("SELECT * FROM generations WHERE id=? AND tenant=? "
            "AND principal=? AND destination=? AND purpose=?",
            (generation_id, *scope.values())).fetchone()
        if row is None:
            raise Denied("generation_unavailable")
        manifest = json.loads(row["context"])
        if digest(encoded(manifest).encode()) != row["context_digest"]:
            raise Denied("context_integrity_failed")
        for item in manifest:
            source = self._source(item["id"], scope.tenant)
            if item["digest"] != source["digest"] or item["document_version"] != source["document_version"]:
                raise Denied("context_integrity_failed")
        return row

    def complete(self, generation_id: str, scope: Scope, answer: str,
                 citations: list[str]) -> None:
        """Trusted adapter submits a draft. Draft storage is not disclosure."""
        if not isinstance(answer, str) or not answer.strip() or not citations:
            raise Denied("invalid_answer")
        with self._transaction():
            row = self._generation(generation_id, scope)
            if row["state"] != "context_released":
                raise Denied("generation_already_completed")
            context = {s["id"] for s in json.loads(row["context"])}
            if not set(citations).issubset(context):
                raise Denied("citation_outside_context")
            self._db.execute("UPDATE generations SET answer=?,citations=?,answer_digest=?,"
                "state='ready' WHERE id=?", (answer, encoded(citations),
                    digest(answer.encode()), generation_id))

    def release(self, generation_id: str, scope: Scope, action: str = "display") -> Release:
        """No reusable allow token: every attempt checks the current policy.

        A release ordered before a revocation may return after that revocation;
        the guarantee is serialization order, not physical delivery time.
        """
        if action not in RELEASE_ACTIONS:
            raise Denied("invalid_release_action")
        denied = None
        with self._transaction():
            row = self._generation(generation_id, scope)
            if row["state"] not in {"ready", "used_but_suppressed"}:
                raise Denied("generation_not_ready")
            if digest(row["answer"].encode()) != row["answer_digest"]:
                raise Denied("answer_integrity_failed")
            context = json.loads(row["context"])
            if not set(json.loads(row["citations"])).issubset({s["id"] for s in context}):
                raise Denied("citation_outside_context")
            now = self._tick()
            try:
                self._authorize(scope, [s["id"] for s in context], action, now)
            except Denied as error:
                denied = str(error)
                self._db.execute("UPDATE generations SET state='used_but_suppressed' WHERE id=?",
                                 (generation_id,))
            receipt = self._receipt(row, action, "deny" if denied else "allow",
                                    denied or "authorized", now, scope)
            body = row["answer"] if denied is None else None
        if denied:
            raise Denied(denied)
        return Release(body=body, receipt=receipt)

    def audit(self) -> dict:
        """Trusted operator metadata export. This is not a public user endpoint."""
        return {
            "receipts": [dict(row) for row in self._db.execute("SELECT * FROM receipts ORDER BY seq")],
            "permission_events": [dict(row) for row in self._db.execute("SELECT * FROM permission_events ORDER BY seq")],
            "generations": [dict(row) for row in self._db.execute("SELECT id,state,context_digest,answer_digest FROM generations ORDER BY id")],
        }


def run_demo(output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=False)
    scope = Scope("synthetic-tenant", "synthetic-operator", "local-adapter", "pilot")
    with tempfile.TemporaryDirectory() as root:
        path = Path(root) / "gateway.sqlite"
        Gateway.initialize(path)
        gateway = Gateway(path, clock=lambda: 100)
        try:
            gateway.add_source("A", scope.tenant, "document-v1", b"Synthetic reference A.")
            gateway.add_source("B", scope.tenant, "document-v1", b"Synthetic reference B.")
            for source in ("A", "B"):
                for action in ACTIONS:
                    gateway.set_permission(scope, source, action, active=True, valid_from=0, valid_until=1000)
            provided = gateway.prepare("demo-generation", scope, ["A", "B"], ["A", "B"])
            # A deterministic LOCAL adapter, explicitly not an LLM inference.
            answer = provided[0].decode()
            gateway.complete("demo-generation", scope, answer, ["A"])
            first = gateway.release("demo-generation", scope)
            gateway.set_permission(scope, "B", "display", active=False, valid_from=0, valid_until=1000)
            try:
                gateway.release("demo-generation", scope)
            except Denied as error:
                suppressed = str(error)
            else:
                raise RuntimeError("demo failed: revoked uncited dependency was released")
            evidence = gateway.audit()
            try:
                commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True,
                                                 stderr=subprocess.DEVNULL).strip()
            except (OSError, subprocess.CalledProcessError):
                commit = "unavailable"
            summary = dict(scope="local-v3-core", fixture="synthetic", llm_used=False,
                first_release=first.receipt["verdict"], second_release="deny",
                denial_reason=suppressed, commit=commit,
                limitation="Local return boundary; no network delivery or semantic verification.")
            (output / "receipts.json").write_text(encoded(evidence) + "\n", encoding="utf-8")
            (output / "summary.json").write_text(encoded(summary) + "\n", encoding="utf-8")
            return summary
        finally:
            gateway.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True,
                        help="New directory for synthetic metadata evidence only")
    arguments = parser.parse_args()
    print(encoded(run_demo(arguments.output)))
