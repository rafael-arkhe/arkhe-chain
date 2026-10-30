# First runtime observation trial

Execution: INCOMPLETE
Suite: INCOMPLETE; runtime_verified=false.

Six observations on rootless Podman/WSL2; no stress, egress or escape verification. WSL2 shares its utility-VM kernel across distributions.

| Vector | Verdict | Cleanup |
| --- | --- | --- |

command failed (1): Traceback (most recent call last):
  File "/opt/arkhe-containment/observer-0f02297beac0f13b45d0dc20028ef544dea12511055eba8d496b508b54063e8e.py", line 56, in <module>
    main()
    ~~~~^^
  File "/opt/arkhe-containment/observer-0f02297beac0f13b45d0dc20028ef544dea12511055eba8d496b508b54063e8e.py", line 52, in main
    print(json.dumps(observe(args.pid, args.container_id)))
                     ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/opt/arkhe-containment/observer-0f02297beac0f13b45d0dc20028ef544dea12511055eba8d496b508b54063e8e.py", line 15, in observe
    membership = (process / 'cgroup').read_text()
  File "/usr/lib64/python3.14/pathlib/__init__.py", line 787, in read_text
    with self.open(mode='r', encoding=encoding, errors=errors, newline=newline) as f:
         ~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib64/python3.14/pathlib/__init__.py", line 771, in open
    return io.open(self, mode, buffering, encoding, errors, newline)
           ~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
FileNotFoundError: [Errno 2] No such file or directory: '/proc/735/cgroup'

cleanup: command deadline exceeded
