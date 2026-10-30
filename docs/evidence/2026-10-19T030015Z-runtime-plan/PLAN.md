# Runtime containment plan

Status: PLANNED; runtime_verified=false.

| Vector | Area | Profile | Status |
| --- | --- | --- | --- |
| identity | preflight | build-current | PLANNED |
| cgroup-enforcement | preflight | build-current | PLANNED |
| mount-inventory | filesystem | build-current | PLANNED |
| socket-local-control | network | build-current | PLANNED |
| tcp-egress | network | build-current | PLANNED |
| udp-egress | network | build-current | PLANNED |
| dns-egress | network | build-current | PLANNED |
| image-read-control | filesystem | build-current | PLANNED |
| writable-control | filesystem | build-current | PLANNED |
| input-read-control | filesystem | build-current | PLANNED |
| input-write | filesystem | build-current | PLANNED |
| image-write | filesystem | build-current | PLANNED |
| outside-mount-canary | filesystem | build-current | PLANNED |
| traversal-and-symlink | filesystem | build-current | PLANNED |
| subprocess-control | process | build-current | PLANNED |
| ffi-control | syscall | build-current | PLANNED |
| mount-capability | syscall | build-current | PLANNED |
| seccomp-inventory | syscall | build-current | PLANNED |
| tmp-noexec | filesystem | build-current | PLANNED |
| memory-bounded | resources | resource-reduced | PLANNED |
| cpu-bounded | resources | resource-reduced | PLANNED |
| pids-bounded | resources | resource-reduced | PLANNED |

Planning only. No engine, socket, subprocess or resource probe was executed.
