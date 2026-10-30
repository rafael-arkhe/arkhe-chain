# First runtime observation trial

Execution: INCOMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Candidate startup smoke with explicit mounts and seccomp, 128 MiB/0.5 CPU/16 PIDs. Structural mount comparison only. No full matrix, final mount seal or kernel BPF attestation.

| Vector | Verdict | Cleanup |
| --- | --- | --- |

command failed (125): time="2026-10-19T02:41:19-03:00" level=error msg="Removing container 54ea925513bb38eca77d177b16afee1109fa41aeea878953810c6d231e188067 from runtime after creation failed"
Error: unable to start container "54ea925513bb38eca77d177b16afee1109fa41aeea878953810c6d231e188067": container create failed: internal libpod error

