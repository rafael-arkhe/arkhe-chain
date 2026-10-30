# First runtime observation trial

Execution: INCOMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Candidate startup smoke with explicit mounts and seccomp, 128 MiB/0.5 CPU/16 PIDs. Structural mount comparison only. No full matrix, final mount seal or kernel BPF attestation.

| Vector | Verdict | Cleanup |
| --- | --- | --- |

command failed (125): time="2026-10-19T02:39:29-03:00" level=error msg="Removing container c994418ed5abed0767d92f8df1eb81f7a6b262f85c7c955fc953cad5bb0768bd from runtime after creation failed"
Error: unable to start container "c994418ed5abed0767d92f8df1eb81f7a6b262f85c7c955fc953cad5bb0768bd": container create failed: internal libpod error

