# First runtime observation trial

Execution: COMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Subprocess/FFI allowed and mount denied on build-current; one paired getppid syscall denied by a separate explicit x86_64 seccomp profile. No full-table verification or default-profile approval.

| Vector | Verdict | Cleanup |
| --- | --- | --- |
| subprocess-control | PASS | confirmed |
| ffi-control | PASS | confirmed |
| mount-capability | PASS | confirmed |
| seccomp-inventory | PASS | confirmed |

