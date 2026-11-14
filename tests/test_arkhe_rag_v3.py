import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from scripts.arkhe_rag_v3 import ACTIONS, Denied, Gateway, Scope, run_demo


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        self.path = Path(self.root.name) / "gateway.sqlite"
        Gateway.initialize(self.path)
        self.now = 100
        self.gateway = Gateway(self.path, clock=lambda: self.now)
        self.addCleanup(self.gateway.close)
        self.scope = Scope("tenant", "alice", "local-adapter", "pilot")
        for source in ("A", "B", "C"):
            self.gateway.add_source(source, "tenant", "version-1", ("PRIVATE-" + source).encode())
            for action in ACTIONS:
                self.permission(source, action)

    def permission(self, source, action="display", *, active=True, start=0, end=1000, gateway=None):
        (gateway or self.gateway).set_permission(self.scope, source, action, active=active,
                                               valid_from=start, valid_until=end)

    def prepared(self, context=None, generation="g1", candidates=None):
        context = ["A", "B"] if context is None else context
        return self.gateway.prepare(generation, self.scope, candidates or ["A", "B", "C"], context)

    def completed(self, context=None, generation="g1", citations=None):
        self.prepared(context, generation)
        self.gateway.complete(generation, self.scope, "PRIVATE-ANSWER", citations or ["A"])

    def denied(self, operation, reason):
        with self.assertRaisesRegex(Denied, "^" + reason + "$"):
            operation()

    def test_valid_release(self):
        self.completed()
        result = self.gateway.release("g1", self.scope)
        self.assertEqual(result.body, "PRIVATE-ANSWER")
        self.assertEqual(result.receipt["verdict"], "allow")

    def test_candidate_not_provided_is_rejected(self):
        self.prepared(["A"])
        self.denied(lambda: self.gateway.complete("g1", self.scope, "answer", ["B"]),
                    "citation_outside_context")

    def test_other_generation_context_is_rejected(self):
        self.prepared(["A"], "g1")
        self.prepared(["B"], "g2")
        self.denied(lambda: self.gateway.complete("g2", self.scope, "answer", ["A"]),
                    "citation_outside_context")

    def test_context_outside_candidates(self):
        self.denied(lambda: self.prepared(["C"], candidates=["A"]),
                    "context_outside_candidates_or_invalid")

    def test_empty_context_rejected(self):
        self.denied(lambda: self.prepared([]), "context_outside_candidates_or_invalid")

    def test_generation_requires_permission(self):
        self.permission("B", "generate", active=False)
        self.denied(self.prepared, "permission_denied")
        self.assertEqual(self.gateway.audit()["receipts"], [])

    def test_revoked_after_context_before_completion(self):
        self.prepared()
        self.permission("A", active=False)
        self.gateway.complete("g1", self.scope, "PRIVATE-ANSWER", ["A"])
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")

    def test_uncited_dependency_revocation_suppresses_whole_answer(self):
        self.completed()
        self.permission("B", active=False)
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")
        audit = self.gateway.audit()
        self.assertEqual(audit["generations"][0]["state"], "used_but_suppressed")
        self.assertEqual(audit["receipts"][0]["stage"], "generate")
        self.assertEqual(audit["receipts"][-1]["verdict"], "deny")

    def test_exact_expiration_denies(self):
        self.completed()
        self.permission("A", end=101)
        self.now = 101
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_not_current")

    def test_future_permission_denies(self):
        self.completed()
        self.permission("A", start=101)
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_not_current")

    def test_missing_permission_denies(self):
        self.completed()
        self.gateway._db.execute("DELETE FROM grants WHERE source_id='B' AND action='display'")
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")

    def test_all_release_routes_recheck(self):
        self.completed()
        for action in ("display", "export", "cache"):
            with self.subTest(action=action):
                self.assertEqual(self.gateway.release("g1", self.scope, action).body, "PRIVATE-ANSWER")
                self.permission("B", action, active=False)
                self.denied(lambda: self.gateway.release("g1", self.scope, action), "permission_denied")

    def test_scope_cannot_be_replayed(self):
        self.completed()
        for scope in (Scope("other", "alice", "local-adapter", "pilot"),
                      Scope("tenant", "bob", "local-adapter", "pilot"),
                      Scope("tenant", "alice", "external", "pilot"),
                      Scope("tenant", "alice", "local-adapter", "other")):
            with self.subTest(scope=scope):
                self.denied(lambda: self.gateway.release("g1", scope), "generation_unavailable")

    def test_invalid_scope_rejected(self):
        self.denied(lambda: self.gateway.prepare("g", Scope("", "p", "d", "u"), ["A"], ["A"]),
                    "invalid_scope")

    def test_cross_tenant_source_rejected(self):
        self.gateway.add_source("foreign", "other", "v1", b"secret")
        self.denied(lambda: self.prepared(["foreign"], candidates=["foreign"]), "source_unavailable")

    def test_no_partial_release_or_sensitive_receipts(self):
        self.completed()
        self.permission("B", active=False)
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")
        serialized = json.dumps(self.gateway.audit())
        for text in ("PRIVATE-A", "PRIVATE-B", "PRIVATE-ANSWER"):
            self.assertNotIn(text, serialized)

    def test_source_corruption_denies(self):
        self.completed()
        self.gateway._db.execute("UPDATE sources SET content=? WHERE id='A'", (b"tampered",))
        self.denied(lambda: self.gateway.release("g1", self.scope), "source_integrity_failed")

    def test_manifest_corruption_denies(self):
        self.completed()
        self.gateway._db.execute("UPDATE generations SET context='[]' WHERE id='g1'")
        self.denied(lambda: self.gateway.release("g1", self.scope), "context_integrity_failed")

    def test_answer_corruption_denies(self):
        self.completed()
        self.gateway._db.execute("UPDATE generations SET answer='tampered' WHERE id='g1'")
        self.denied(lambda: self.gateway.release("g1", self.scope), "answer_integrity_failed")

    def test_citation_corruption_denies_at_release(self):
        self.completed()
        self.gateway._db.execute("UPDATE generations SET citations='[\"C\"]' WHERE id='g1'")
        self.denied(lambda: self.gateway.release("g1", self.scope), "citation_outside_context")

    def test_original_cannot_be_overwritten(self):
        self.denied(lambda: self.gateway.add_source("A", "tenant", "v2", b"replacement"),
                    "storage_unavailable")
        self.assertEqual(self.prepared(["A"]), (b"PRIVATE-A",))

    def test_generation_cannot_be_rebound(self):
        self.completed()
        self.denied(lambda: self.prepared(["B"]), "storage_unavailable")
        self.denied(lambda: self.gateway.complete("g1", self.scope, "new answer", ["A"]),
                    "generation_already_completed")

    def test_release_before_completion_denied(self):
        self.prepared()
        self.denied(lambda: self.gateway.release("g1", self.scope), "generation_not_ready")

    def test_invalid_action_denied(self):
        self.completed()
        self.denied(lambda: self.gateway.release("g1", self.scope, "email"), "invalid_release_action")

    def test_clock_regression_denied(self):
        self.completed()
        self.now = 99
        self.denied(lambda: self.gateway.release("g1", self.scope), "clock_invalid_or_regressed")

    def test_storage_failure_does_not_release(self):
        self.completed()
        self.gateway._db.execute("DROP TABLE grants")
        self.denied(lambda: self.gateway.release("g1", self.scope), "storage_unavailable")

    def test_receipt_failure_rolls_back_release(self):
        self.completed()
        self.gateway._db.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts "
                                 "BEGIN SELECT RAISE(ABORT,'fixture'); END")
        self.denied(lambda: self.gateway.release("g1", self.scope), "storage_unavailable")
        self.assertEqual(len(self.gateway.audit()["receipts"]), 1)

    def test_restore_permission_creates_new_decision_and_preserves_history(self):
        self.completed()
        first = self.gateway.release("g1", self.scope)
        self.permission("A", active=False)
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")
        self.permission("A")
        last = self.gateway.release("g1", self.scope)
        self.assertGreater(last.receipt["policy_revision"], first.receipt["policy_revision"])
        self.assertEqual([r["verdict"] for r in self.gateway.audit()["receipts"]],
                         ["allow", "allow", "deny", "allow"])

    def test_preliminary_allow_does_not_authorize_later_release(self):
        self.completed()
        with self.gateway._transaction():
            self.gateway._authorize(self.scope, ["A", "B"], "display", self.now)
        other = Gateway(self.path, clock=lambda: self.now)
        try:
            self.permission("A", active=False, gateway=other)
            self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")
        finally:
            other.close()

    def test_two_connections_revocation_cannot_commit_inside_release(self):
        self.completed()
        entered = threading.Event()
        continue_release = threading.Event()
        results = []

        def worker():
            gateway = Gateway(self.path, clock=lambda: 100)
            original = gateway._tick

            def coordinated_tick():
                entered.set()
                if not continue_release.wait(5):
                    raise RuntimeError("coordination timeout")
                return original()

            gateway._tick = coordinated_tick
            try:
                results.append(gateway.release("g1", self.scope))
            except BaseException as error:
                results.append(error)
            finally:
                gateway.close()

        thread = threading.Thread(target=worker)
        thread.start()
        other = Gateway(self.path, clock=lambda: 100, timeout=0)
        try:
            self.assertTrue(entered.wait(5), "release did not reach decision boundary")
            # No sleep: the release transaction demonstrably holds the writer lock.
            self.denied(lambda: self.permission("A", active=False, gateway=other), "storage_unavailable")
        finally:
            continue_release.set()
            thread.join(5)
            other.close()
        self.assertFalse(thread.is_alive())
        self.assertEqual(len(results), 1)
        if isinstance(results[0], BaseException):
            raise results[0]
        self.assertEqual(results[0].receipt["verdict"], "allow")
        self.permission("A", active=False)
        self.denied(lambda: self.gateway.release("g1", self.scope), "permission_denied")

    def test_locked_database_fails_closed(self):
        self.completed()
        other = Gateway(self.path, clock=lambda: 100, timeout=0)
        try:
            with self.gateway._transaction():
                self.denied(lambda: other.release("g1", self.scope), "storage_unavailable")
        finally:
            other.close()

    def test_initialization_never_overwrites_database(self):
        with self.assertRaises(FileExistsError):
            Gateway.initialize(self.path)

    def test_demo_is_synthetic_and_suppresses_uncited_source(self):
        output = Path(self.root.name) / "evidence"
        summary = run_demo(output)
        self.assertFalse(summary["llm_used"])
        self.assertEqual(summary["second_release"], "deny")
        self.assertNotIn("Synthetic reference", (output / "receipts.json").read_text())


if __name__ == "__main__":
    unittest.main()
