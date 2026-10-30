from pathlib import Path
root=Path(__file__).resolve().parents[1]
checks = {}

checks["workspace exists"] = (root/"Cargo.toml").exists()
checks["containment exists"] = (root/"kernel/arkhe-kernel/src/lib.rs").exists()
checks["worker record exists"] = "WorkerExecutionRecord" in (root/"kernel/arkhe-core/src/worker.rs").read_text()
checks["wormgraph boundary exists"] = "EvidenceCommitter" in (root/"evidence/arkhe-wormgraph/src/lib.rs").read_text()
checks["cognition modules complete"] = all((root/"cognition"/n/"src/lib.rs").exists() for n in [
    "arkhe-perception","arkhe-rag","arkhe-metacognition","arkhe-world-model","arkhe-learning","arkhe-agent"
])
checks["work layer exists"] = (root/"work/arkhe-work/src/lib.rs").exists()
checks["governance exists"] = (root/"governance/arkhe-governance/src/lib.rs").exists()
checks["compose exists"] = (root/"docker-compose.yml").exists()
checks["status honesty"] = "NOT DEMONSTRATED" in (root/"docs/STATUS.md").read_text()

bad=[]
for k,v in checks.items():
    print(("PASS" if v else "FAIL"), k)
    if not v: bad.append(k)
raise SystemExit(1 if bad else 0)
