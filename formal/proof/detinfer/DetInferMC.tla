-------------------------- MODULE DetInferMC --------------------------
EXTENDS Naturals, FiniteSets

\* Concrete finite instance (inlined -- no CONSTANT override, so SANY compiles).
Value == {0, 1}
Hash(v) == 10 + v
Infer(w, i, p, e) == (w + i + p + e) % 2   \* deterministic, maps into Value

Hashes == { Hash(v) : v \in Value }

\* Mechanically verify the abstraction premise for THIS instance.
ASSUME HashInjective == \A a, b \in Value : (Hash(a) = Hash(b)) => (a = b)

Receipt == [ wh : Hashes, ih : Hashes, ph : Hashes, eh : Hashes, oh : Hashes ]
Verdict == { "PENDING", "ADMITTED", "EXCLUDED" }

VARIABLES cas, receipts, verdict
vars == << cas, receipts, verdict >>

Resolvable(h) == \E v \in cas : Hash(v) = h
Resolve(h)    == CHOOSE v \in cas : Hash(v) = h   \* unique under HashInjective

TypeOK ==
    /\ cas \subseteq Value
    /\ receipts \subseteq Receipt
    /\ verdict \in [receipts -> Verdict]

Init ==
    /\ cas = {}
    /\ receipts = {}
    /\ verdict = [ r \in {} |-> "PENDING" ]

Store(v) ==
    /\ v \in Value
    /\ cas' = cas \cup {v}
    /\ UNCHANGED << receipts, verdict >>

Submit(r) ==
    /\ r \in Receipt
    /\ r \notin receipts
    /\ receipts' = receipts \cup {r}
    /\ verdict' = [ x \in receipts' |-> IF x = r THEN "PENDING" ELSE verdict[x] ]
    /\ UNCHANGED cas

Verify(r) ==
    /\ r \in receipts
    /\ verdict[r] = "PENDING"
    /\ verdict' = [ x \in receipts |->
         IF x # r THEN verdict[x]
         ELSE IF \/ ~Resolvable(r.wh) \/ ~Resolvable(r.ih)
                 \/ ~Resolvable(r.ph) \/ ~Resolvable(r.eh)
              THEN "EXCLUDED"
              ELSE IF r.oh = Hash(Infer(Resolve(r.wh), Resolve(r.ih),
                                        Resolve(r.ph), Resolve(r.eh)))
                   THEN "ADMITTED" ELSE "EXCLUDED" ]
    /\ UNCHANGED << cas, receipts >>

Next == \/ \E v \in Value : Store(v)
        \/ \E r \in Receipt : Submit(r)
        \/ \E r \in receipts : Verify(r)

Spec == Init /\ [][Next]_vars

\* Keep the model finite/tractable: bound the number of coexisting receipts.
StateConstraint == Cardinality(receipts) <= 3

Soundness ==
    \A r \in receipts :
        verdict[r] = "ADMITTED" =>
            /\ Resolvable(r.wh) /\ Resolvable(r.ih)
            /\ Resolvable(r.ph) /\ Resolvable(r.eh)
            /\ r.oh = Hash(Infer(Resolve(r.wh), Resolve(r.ih),
                                 Resolve(r.ph), Resolve(r.eh)))

Determinism ==
    \A r1, r2 \in receipts :
        ( /\ verdict[r1] = "ADMITTED" /\ verdict[r2] = "ADMITTED"
          /\ r1.wh = r2.wh /\ r1.ih = r2.ih /\ r1.ph = r2.ph /\ r1.eh = r2.eh )
        => r1.oh = r2.oh

FailClosed ==
    \A r \in receipts :
        ( \/ ~Resolvable(r.wh) \/ ~Resolvable(r.ih)
          \/ ~Resolvable(r.ph) \/ ~Resolvable(r.eh) )
        => verdict[r] # "ADMITTED"
=============================================================================
