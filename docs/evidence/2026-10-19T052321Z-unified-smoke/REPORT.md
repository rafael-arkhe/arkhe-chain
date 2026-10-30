# First runtime observation trial

Execution: INCOMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Candidate startup smoke with explicit mounts and seccomp, 128 MiB/0.5 CPU/16 PIDs. Structural mount comparison only. No full matrix, final mount seal or kernel BPF attestation.

| Vector | Verdict | Cleanup |
| --- | --- | --- |

command failed (1):   File "/opt/arkhe-containment/mount-snapshot-11cb91820f0d853b2b09095cd4cfa1d7bc8a9e59fa9d30c6851e007748e2dec1.py", line 33
    p=argparse.ArgumentParser();p.add_argument('observer');p.add_argument('pid',type=int);p.add_argument('container');p.add_argument('spec',type=Path);a=p.parse_args();print(json.dumps(snapshot(a.observer,a.pid,a.container,json.loads(a.spec.read_text())))))
                                                                                                                                                                                                                                                                ^
SyntaxError: unmatched ')'

