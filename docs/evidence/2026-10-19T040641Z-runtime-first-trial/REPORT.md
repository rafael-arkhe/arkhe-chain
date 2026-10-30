# First runtime observation trial

Execution: COMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Six observations on rootless Podman/WSL2; no stress, egress or escape verification. WSL2 shares its utility-VM kernel across distributions.

| Vector | Verdict | Cleanup |
| --- | --- | --- |
| identity | PASS | confirmed |
| cgroup-enforcement | PASS | confirmed |
| mount-inventory | UNASSESSED | confirmed |
| seccomp-inventory | UNASSESSED | confirmed |
| subprocess-control | PASS | confirmed |
| input-read-control | PASS | confirmed |

