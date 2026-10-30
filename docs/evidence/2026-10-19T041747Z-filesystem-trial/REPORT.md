# First runtime observation trial

Execution: COMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Filesystem controls and denials on rootless Podman/WSL2 only; no egress, syscall-filter or resource stress certification.

| Vector | Verdict | Cleanup |
| --- | --- | --- |
| identity | PASS | confirmed |
| cgroup-enforcement | PASS | confirmed |
| image-read-control | PASS | confirmed |
| writable-control | PASS | confirmed |
| input-read-control | PASS | confirmed |
| input-write | PASS | confirmed |
| image-write | PASS | confirmed |
| outside-mount-canary | PASS | confirmed |
| traversal-and-symlink | PASS | confirmed |
| tmp-noexec | PASS | confirmed |

