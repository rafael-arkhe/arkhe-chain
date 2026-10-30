# First runtime observation trial

Execution: COMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Three bounded resource vectors on rootless Podman/WSL2 only. Independent host cgroup counters; no transfer to gVisor/WASM. Full suite INCOMPLETE.

| Vector | Verdict | Cleanup |
| --- | --- | --- |
| memory-bounded | PASS | confirmed |
| cpu-bounded | PASS | confirmed |
| pids-bounded | PASS | confirmed |

