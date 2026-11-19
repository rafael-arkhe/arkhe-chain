---- MODULE admit ----
EXTENDS Naturals

\* Skeleton only. TLC has not checked this file.
\* admit returns Held(Unmediated) for every channel. There is no Released step.

VARIABLE held

Init == held = "Unmediated"

Next == held' = "Unmediated"

Spec == Init /\ [][Next]_held

\* No theorem is discharged here.
====
