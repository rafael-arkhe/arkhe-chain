# First runtime observation trial

Execution: COMPLETE
Suite: INCOMPLETE; runtime_verified=false.

One vector with mount/umount2/pivot_root subchecks on reduced 128 MiB candidate. EPERM observations with independent mount snapshots, no exclusive seccomp attribution. No full-suite or production verification.

| Vector | Verdict | Cleanup |
| --- | --- | --- |
| mount-capability | PASS | confirmed |

