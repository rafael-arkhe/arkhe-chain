# First runtime observation trial

Execution: INCOMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Unified native 128 MiB candidate adapter; finite IPv4 controls; no automatic verification.

| Vector | Verdict | Cleanup |
| --- | --- | --- |
| identity | PASS | confirmed |
| cgroup-enforcement | PASS | confirmed |
| mount-inventory | PASS | confirmed |
| image-read-control | PASS | confirmed |
| writable-control | PASS | confirmed |
| input-read-control | PASS | confirmed |
| input-write | PASS | confirmed |
| image-write | PASS | confirmed |
| outside-mount-canary | PASS | confirmed |
| traversal-and-symlink | PASS | confirmed |
| tmp-noexec | PASS | confirmed |
| socket-local-control | PASS | confirmed |
| tcp-egress | PASS | confirmed |
| udp-egress | PASS | confirmed |
| dns-egress | PASS | confirmed |
| subprocess-control | PASS | confirmed |
| ffi-control | PASS | confirmed |
| mount-capability | PASS | confirmed |
| seccomp-inventory | UNASSESSED | confirmed |

auxiliary cleanup: command deadline exceeded
