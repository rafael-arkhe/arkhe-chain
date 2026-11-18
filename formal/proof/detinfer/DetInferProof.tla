---------------------------- MODULE DetInferProof ----------------------------
(***************************************************************************)
(* Non-bounded (all-instances) inductive proof of Safety for the           *)
(* deterministic-inference-verifiable-by-hash invariant.                   *)
(*                                                                         *)
(* CORRECTIONS over earlier skeletons:                                     *)
(*  (1) Determinism and FailClosed are STATE consequences of               *)
(*      Inv == TypeOK /\ Soundness, not separately inductive. They must    *)
(*      NOT be discharged "BY DEF ... Next".                               *)
(*  (2) Resolve is parametrized by the STORE (ResolveIn(S,h)) so the       *)
(*      uniqueness/monotonicity lemmas are CONSTANT-level and can be       *)
(*      instantiated at both cas and cas' (fixes the "lemma-at-primed-     *)
(*      state" instantiation trap in the Store case).                      *)
(*  (3) The Verify / x = r leaf expands the nested IF explicitly instead   *)
(*      of asking a backend to unfold it from DEF Verify alone.            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLAPS

CONSTANTS Value, Hash(_), Infer(_,_,_,_)

Hashes == { Hash(v) : v \in Value }

ASSUME HashInjective == \A a, b \in Value : (Hash(a) = Hash(b)) => (a = b)

Receipt == [ wh : Hashes, ih : Hashes, ph : Hashes, eh : Hashes, oh : Hashes ]
Verdict == { "PENDING", "ADMITTED", "EXCLUDED" }

VARIABLES cas, receipts, verdict
vars == << cas, receipts, verdict >>

\* Store-parametrized resolution: constant-level, instance-independent.
ResolvableIn(S, h) == \E v \in S : Hash(v) = h
ResolveIn(S, h)    == CHOOSE v \in S : Hash(v) = h

Resolvable(h) == ResolvableIn(cas, h)
Resolve(h)    == ResolveIn(cas, h)

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
    /\ r \in Receipt /\ r \notin receipts
    /\ receipts' = receipts \cup {r}
    /\ verdict' = [ x \in receipts' |-> IF x = r THEN "PENDING" ELSE verdict[x] ]
    /\ UNCHANGED cas

Verify(r) ==
    /\ r \in receipts /\ verdict[r] = "PENDING"
    /\ verdict' = [ x \in receipts |->
         IF x # r THEN verdict[x]
         ELSE IF \/ ~Resolvable(r.wh) \/ ~Resolvable(r.ih)
                 \/ ~Resolvable(r.ph) \/ ~Resolvable(r.eh)
              THEN "EXCLUDED"
              ELSE IF r.oh = Hash(Infer(Resolve(r.wh), Resolve(r.ih),
                                        Resolve(r.ph), Resolve(r.eh)))
                   THEN "ADMITTED" ELSE "EXCLUDED" ]
    /\ UNCHANGED << cas, receipts >>

Next == \/ \E v \in Value   : Store(v)
        \/ \E r \in Receipt  : Submit(r)
        \/ \E r \in receipts : Verify(r)

Spec == Init /\ [][Next]_vars

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

Safety == TypeOK /\ Soundness /\ Determinism /\ FailClosed
Inv    == TypeOK /\ Soundness

(***************************************************************************)
(* CONSTANT-level CHOOSE lemmas (store as explicit argument).              *)
(***************************************************************************)
LEMMA ResolveInSpec ==
  ASSUME NEW S, NEW h, ResolvableIn(S, h)
  PROVE  ResolveIn(S, h) \in S /\ Hash(ResolveIn(S, h)) = h
PROOF
  <1>1. \E v \in S : Hash(v) = h   BY DEF ResolvableIn
  <1> QED                          BY <1>1 DEF ResolveIn   (* CHOOSE rule *)

LEMMA ResolveInUnique ==
  ASSUME NEW S, NEW h, NEW w, S \subseteq Value, w \in S, Hash(w) = h
  PROVE  ResolveIn(S, h) = w
PROOF
  <1>1. ResolvableIn(S, h)                                   BY DEF ResolvableIn
  <1>2. ResolveIn(S, h) \in S /\ Hash(ResolveIn(S, h)) = h   BY <1>1, ResolveInSpec
  <1>3. ResolveIn(S, h) \in Value /\ w \in Value             BY <1>2
  <1> QED                                                    BY <1>2, <1>3, HashInjective

LEMMA ResolveMonotone ==
  ASSUME NEW S, NEW T, NEW h, S \subseteq T, T \subseteq Value, ResolvableIn(S, h)
  PROVE  ResolveIn(T, h) = ResolveIn(S, h)
PROOF
  <1>1. ResolveIn(S, h) \in S /\ Hash(ResolveIn(S, h)) = h   BY ResolveInSpec
  <1>2. ResolveIn(S, h) \in T                                BY <1>1
  <1> QED                                                    BY <1>1, <1>2, ResolveInUnique

(***************************************************************************)
(* Determinism and FailClosed are consequences of Inv.                     *)
(***************************************************************************)
LEMMA FailClosedFromInv == Inv => FailClosed
PROOF BY DEF Inv, Soundness, FailClosed

LEMMA DeterminismFromInv == Inv => Determinism
PROOF
  <1> SUFFICES ASSUME Inv,
                      NEW r1 \in receipts, NEW r2 \in receipts,
                      verdict[r1] = "ADMITTED", verdict[r2] = "ADMITTED",
                      r1.wh = r2.wh, r1.ih = r2.ih, r1.ph = r2.ph, r1.eh = r2.eh
               PROVE  r1.oh = r2.oh
    BY DEF Determinism
  <1>1. r1.oh = Hash(Infer(Resolve(r1.wh), Resolve(r1.ih),
                           Resolve(r1.ph), Resolve(r1.eh)))   BY DEF Inv, Soundness
  <1>2. r2.oh = Hash(Infer(Resolve(r2.wh), Resolve(r2.ih),
                           Resolve(r2.ph), Resolve(r2.eh)))   BY DEF Inv, Soundness
  <1> QED BY <1>1, <1>2   (* equal input hashes => equal Resolve args => equal Infer *)

(***************************************************************************)
(* Inductiveness of Inv.                                                   *)
(***************************************************************************)
LEMMA InitInv == Init => Inv
PROOF BY DEF Init, Inv, TypeOK, Soundness

LEMMA InvNext == Inv /\ [Next]_vars => Inv'
PROOF
  <1> SUFFICES ASSUME Inv, [Next]_vars PROVE Inv'  OBVIOUS
  <1>S. ASSUME NEW v \in Value, Store(v) PROVE Inv'
        <2>1. TypeOK'    BY <1>S DEF Inv, TypeOK, Store
        <2>2. Soundness'
          <3> SUFFICES ASSUME NEW r \in receipts', (verdict'[r] = "ADMITTED")
                       PROVE  /\ Resolvable(r.wh)' /\ Resolvable(r.ih)'
                              /\ Resolvable(r.ph)' /\ Resolvable(r.eh)'
                              /\ r.oh = Hash(Infer(Resolve(r.wh)', Resolve(r.ih)',
                                                   Resolve(r.ph)', Resolve(r.eh)'))
                BY DEF Soundness
          <3>1. r \in receipts /\ verdict[r] = "ADMITTED"   BY <1>S DEF Store
          <3>2. /\ Resolvable(r.wh) /\ Resolvable(r.ih)
                /\ Resolvable(r.ph) /\ Resolvable(r.eh)
                /\ r.oh = Hash(Infer(Resolve(r.wh), Resolve(r.ih),
                                     Resolve(r.ph), Resolve(r.eh)))
                BY <3>1 DEF Inv, Soundness
          <3>3. cas \subseteq cas' /\ cas' \subseteq Value   BY <1>S, <2>1 DEF Store, TypeOK
          <3>4. ResolveIn(cas', r.wh) = ResolveIn(cas, r.wh)
                BY <3>2, <3>3, ResolveMonotone DEF Resolvable
          <3>5. ResolveIn(cas', r.ih) = ResolveIn(cas, r.ih)
                BY <3>2, <3>3, ResolveMonotone DEF Resolvable
          <3>6. ResolveIn(cas', r.ph) = ResolveIn(cas, r.ph)
                BY <3>2, <3>3, ResolveMonotone DEF Resolvable
          <3>7. ResolveIn(cas', r.eh) = ResolveIn(cas, r.eh)
                BY <3>2, <3>3, ResolveMonotone DEF Resolvable
          <3> QED BY <3>2, <3>3, <3>4, <3>5, <3>6, <3>7
                  DEF Resolvable, Resolve, ResolvableIn
        <2> QED BY <2>1, <2>2 DEF Inv
  <1>U. ASSUME NEW r \in Receipt, Submit(r) PROVE Inv'
        <2>1. TypeOK'   BY <1>U DEF Inv, TypeOK, Submit, Receipt, Verdict
        <2>2. Soundness'
          <3> SUFFICES ASSUME NEW x \in receipts', verdict'[x] = "ADMITTED"
                       PROVE  /\ Resolvable(x.wh)' /\ Resolvable(x.ih)'
                              /\ Resolvable(x.ph)' /\ Resolvable(x.eh)'
                              /\ x.oh = Hash(Infer(Resolve(x.wh)', Resolve(x.ih)',
                                                   Resolve(x.ph)', Resolve(x.eh)'))
                BY DEF Soundness
          <3>1. cas' = cas            BY <1>U DEF Submit
          <3>2. x # r                 BY <1>U DEF Submit   (* r is PENDING in verdict-prime *)
          <3>3. x \in receipts /\ verdict[x] = "ADMITTED"
                BY <3>2, <1>U DEF Submit
          <3> QED BY <3>1, <3>3 DEF Inv, Soundness, Resolvable, Resolve, ResolvableIn
        <2> QED BY <2>1, <2>2 DEF Inv
  <1>V. ASSUME NEW r \in receipts, Verify(r) PROVE Inv'
        <2>1. TypeOK'   BY <1>V DEF Inv, TypeOK, Verify, Verdict
        <2>2. Soundness'
          <3> SUFFICES ASSUME NEW x \in receipts', verdict'[x] = "ADMITTED"
                       PROVE  /\ Resolvable(x.wh)' /\ Resolvable(x.ih)'
                              /\ Resolvable(x.ph)' /\ Resolvable(x.eh)'
                              /\ x.oh = Hash(Infer(Resolve(x.wh)', Resolve(x.ih)',
                                                   Resolve(x.ph)', Resolve(x.eh)'))
                BY DEF Soundness
          <3>1. cas' = cas            BY <1>V DEF Verify
          <3>2. CASE x # r
                <4>1. verdict'[x] = verdict[x] /\ x \in receipts
                      BY <3>2, <1>V DEF Verify
                <4> QED BY <4>1, <3>1, <1>V
                        DEF Inv, Soundness, Resolvable, Resolve, ResolvableIn
          <3>3. CASE x = r
                (* verdict-prime[r] = "ADMITTED" forces the innermost IF branch.
                   The nested IF is expanded by hand: asking a backend to unfold
                   it from DEF Verify alone is the known sticking point.        *)
                <4>1. verdict'[r] =
                        ( IF \/ ~Resolvable(r.wh) \/ ~Resolvable(r.ih)
                             \/ ~Resolvable(r.ph) \/ ~Resolvable(r.eh)
                          THEN "EXCLUDED"
                          ELSE IF r.oh = Hash(Infer(Resolve(r.wh), Resolve(r.ih),
                                                    Resolve(r.ph), Resolve(r.eh)))
                               THEN "ADMITTED" ELSE "EXCLUDED" )
                      BY <1>V DEF Verify
                <4>2. verdict'[r] = "ADMITTED"   BY <3>3
                <4>3. /\ Resolvable(r.wh) /\ Resolvable(r.ih)
                      /\ Resolvable(r.ph) /\ Resolvable(r.eh)
                      /\ r.oh = Hash(Infer(Resolve(r.wh), Resolve(r.ih),
                                           Resolve(r.ph), Resolve(r.eh)))
                      BY <4>1, <4>2
                <4> QED BY <4>3, <3>1, <3>3 DEF Resolvable, Resolve, ResolvableIn
          <3> QED BY <3>2, <3>3
        <2> QED BY <2>1, <2>2 DEF Inv
  <1>N. ASSUME UNCHANGED vars PROVE Inv'
        BY <1>N DEF Inv, TypeOK, Soundness, Resolvable, Resolve, ResolvableIn, vars
  <1> QED BY <1>S, <1>U, <1>V, <1>N DEF Next

(***************************************************************************)
(* Main theorem: Spec => []Safety for ALL Value/Hash/Infer (HashInjective).*)
(***************************************************************************)
THEOREM SpecSafety == Spec => []Safety
PROOF
  <1>1. Init => Inv                     BY InitInv
  <1>2. Inv /\ [Next]_vars => Inv'       BY InvNext
  <1>3. Inv => Safety                    BY DeterminismFromInv, FailClosedFromInv
                                            DEF Safety, Inv
  <1>4. Spec => []Inv                    BY <1>1, <1>2, PTL DEF Spec
  <1> QED                                BY <1>4, <1>3, PTL
=============================================================================
