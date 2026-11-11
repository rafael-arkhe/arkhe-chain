# Arkhe chain audit evidence

The source branch is `fix/audit-remediation`. This evidence branch records runs without changing the tested source commit.

| Source commit | Environment | Passed | Failed | Ignored | Exit |
| --- | --- | --- | --- | --- | --- |
| `607551faf86ec1f416b035572f52c60851180220` | Local Linux | 156 | 1 | 0 | 101 |
| `fa973a68e7f38b15f3b49db4e7561c3487d31397` | Local Linux | 157 | 0 | 0 | 0 |

The first run failed only because the replay-log test still expected StateMismatch instead of the earlier policy admission rejection. The second source commit corrects that test expectation.

Each manifest records the source commit and tree, exact command, toolchain, timestamps, exit status, unchanged-checkout check, and SHA-256 of the accompanying raw log. Verify the log bytes against that digest. The records do not certify production homologation. See `docs/audit-remediation.md` for the remaining BFT convergence and directory power-loss durability limitations.
