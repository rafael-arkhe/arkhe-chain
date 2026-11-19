---- MODULE decide ----
EXTENDS Naturals

\* Skeleton only. TLC has not checked this file.
\* Allow is permitted only when the reason is RuleAllowed.
\* This file does not check the Rust function.

VARIABLE reason

Init == reason = "Reject"

Next == reason' = "Reject"

Spec == Init /\ [][Next]_reason

\* No theorem is discharged here.
====
