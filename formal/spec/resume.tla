---- MODULE resume ----
EXTENDS Naturals

\* Skeleton only. TLC has not checked this file.
\* resume returns Unavailable(NotImplemented) for atomic and journal stores.

VARIABLE status

Init == status = "NotImplemented"

Next == status' = "NotImplemented"

Spec == Init /\ [][Next]_status

\* No theorem is discharged here.
====
