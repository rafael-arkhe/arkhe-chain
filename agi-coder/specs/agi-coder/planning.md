# Planning contract

A plan contains a nonempty goal, unique task IDs, existing dependencies, acyclic edges, and a positive maximum attempt count. `Planner::software` constructs the deterministic design -> implement -> test -> audit -> deploy dependency chain. It does not reason about arbitrary repository changes.

Tasks move Pending -> Running -> Verified. Failed verification returns to Pending only while retries remain; otherwise it becomes Failed. A task starts only after every dependency is Verified. Completion requires every task to be Verified. The bounded loop consumes one step per action attempt, stores observations, and leaves inspectable state on budget exhaustion.

`WorkingState` is serializable for caller-managed checkpointing. The caller supplies perception, action, and independent verification. Action/verification errors record a failed attempt and propagate. Observation errors stop before dispatch. Automatic recovery of a Running task after a process crash requires an external journal and is not implemented.
