"""Offline consistency checks for the exported portfolio evidence (not signature verification)."""
import json
import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/arkhe-ask/verification-portfolio.json")
evidence = json.loads(path.read_text(encoding="utf-8-sig"))
dashboard = evidence["dashboard"]
measurements = evidence["panel_query_validation"]
assert len(dashboard["panels"]) == len(measurements) == 8
assert dashboard["uid"] == evidence["dashboard_metadata"]["uid"]
for panel in dashboard["panels"]:
    matches = [m for m in measurements if m["title"] == panel["title"]]
    assert len(matches) == 1, "panel missing from query validation"
    assert panel["targets"][0]["expr"] == matches[0]["expression"], "panel query mismatch"
    assert matches[0]["series_count"] > 0, "no observed panel series"

def one(tree, name):
    nodes = [n for n in tree if n["name"] == name]
    assert len(nodes) == 1, f"expected one span named {name}"
    return nodes[0]

tree = evidence["collector_trace_validation"]["collector_span_tree"]
assert len({n["span_id"] for n in tree}) == len(tree), "duplicate span ids"
root = one(tree, "POST /v1/ask")
for name in ["rag.retrieve", "rag.generate", "rag.verify", "proof.enqueue"]:
    assert one(tree, "arkhe.ask." + name)["parent_span_id"] == root["span_id"], "HTTP sibling mismatch"
enqueue = one(tree, "arkhe.ask.proof.enqueue")
publish = one(tree, "arkhe.ask.proof.publish")
consume = one(tree, "arkhe.ask.proof.consume")
anchor = one(tree, "arkhe.ask.proof.anchor")
assert publish["parent_span_id"] == enqueue["span_id"]
assert consume["parent_span_id"] == publish["span_id"]
assert anchor["parent_span_id"] == consume["span_id"]

crash = evidence["enqueue_process_crash_validation"]
assert crash["child_exit_code"] == 73
assert crash["pending_after_child_exit"] == 1
assert crash["kafka_records_before_recovery"] == 0
assert crash["kafka_records_after_recovery"] == crash["durable_anchors_after_recovery"] == 1
recovery = crash["recovered_span_tree"]
publish = one(recovery, "arkhe.ask.proof.publish")
consume = one(recovery, "arkhe.ask.proof.consume")
anchor = one(recovery, "arkhe.ask.proof.anchor")
assert publish["parent_span_id"] == crash["persisted_enqueue_span_id"]
assert consume["parent_span_id"] == publish["span_id"]
assert anchor["parent_span_id"] == consume["span_id"]
parts = crash["kafka_traceparent"].split("-")
assert parts[1] == crash["trace_id"] and parts[2] == publish["span_id"]
workload = evidence["bounded_workload_validation"]
assert workload["unexpected_statuses"] == 0
assert 1 <= workload["authenticated_200"] <= 200
assert 0 <= workload["unauthorized_401"] <= 40
assert workload["measured_requests"] == workload["authenticated_200"] + workload["unauthorized_401"]
assert workload["server_success_counter_delta"] >= workload["authenticated_200"]
assert workload["server_unauthorized_counter_delta"] >= workload["unauthorized_401"]
assert workload["citation_gate_accepted_delta"] >= workload["authenticated_200"]
import math
assert math.isfinite(workload["prometheus_http_histogram_p95_seconds"])
assert workload["prometheus_http_histogram_p95_seconds"] > 0
assert workload["prometheus_request_rate_per_second"] > 0
expected = str(workload["authenticated_200"])
assert workload["workload_outbox_published_anchored"] == "|".join([expected] * 3)
latency = next(p for p in dashboard["panels"] if "Latency p95" in p["title"])
assert latency["fieldConfig"]["defaults"]["noValue"] == "Sem tráfego"
assert any(m["type"] == "special" and m["options"]["match"] == "nan"
           and m["options"]["result"]["text"] == "Sem tráfego"
           for m in latency["fieldConfig"]["defaults"]["mappings"])
assert not evidence["p95_display_validation"]["zero_latency_imputed"]
assert len(evidence["promql_nan_demonstration"]) == 2
assert all(case["observed_value"] == "NaN" for case in evidence["promql_nan_demonstration"])
print("OK: dashboard, span tree, process-crash context, bounded workload and honest p95 presentation")
