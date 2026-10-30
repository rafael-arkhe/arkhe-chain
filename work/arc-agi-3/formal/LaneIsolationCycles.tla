------------------------- MODULE LaneIsolationCycles -------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS MaxCyc, MaxVer
ASSUME MaxCyc \in Nat \ {0} /\ MaxVer \in Nat \ {0}
VARIABLES cyc, ver, stage, verdict, gateVer, admittedSet, effects,
          repairReads, holdQ, qTotal
vars == <<cyc, ver, stage, verdict, gateVer, admittedSet, effects,
          repairReads, holdQ, qTotal>>
N == MaxCyc * MaxVer
Versions == 1..N
Stages == {"NONE","CANDIDATE","PROVISIONAL","ADMITTED","REJECTED","REJECTED_TERMINAL"}
Verdicts == [typ : BOOLEAN, dev : BOOLEAN, hold : BOOLEAN]
Cur == IF ver = 0 THEN 0 ELSE (cyc - 1) * MaxVer + ver
CurP == IF ver' = 0 THEN 0 ELSE (cyc' - 1) * MaxVer + ver'
TypeOK ==
  /\ cyc \in 1..MaxCyc /\ ver \in 0..MaxVer /\ stage \in Stages
  /\ verdict \in [Versions -> Verdicts]
  /\ gateVer \in 0..N /\ admittedSet \subseteq Versions /\ effects \subseteq Versions
  /\ repairReads \subseteq {"dev","holdout"}
  /\ holdQ \in 0..1 /\ qTotal \in 0..MaxCyc
Init ==
  /\ cyc = 1 /\ ver = 0 /\ stage = "NONE"
  /\ verdict \in [Versions -> Verdicts]
  /\ gateVer = 0 /\ admittedSet = {} /\ effects = {}
  /\ repairReads = {} /\ holdQ = 0 /\ qTotal = 0
NewVersion ==
  /\ ver < MaxVer /\ stage \in {"NONE","REJECTED"}
  /\ ver' = ver + 1 /\ stage' = "CANDIDATE"
  /\ UNCHANGED <<cyc, verdict, gateVer, admittedSet, effects, holdQ, qTotal>>
Propose == NewVersion /\ UNCHANGED repairReads
Repair  == ver >= 1 /\ NewVersion /\ repairReads' = repairReads \cup {"dev"}
Promote ==
  /\ stage = "CANDIDATE" /\ verdict[Cur].typ /\ verdict[Cur].dev
  /\ stage' = "PROVISIONAL"
  /\ UNCHANGED <<cyc, ver, verdict, gateVer, admittedSet, effects, repairReads, holdQ, qTotal>>
RejectDev ==
  /\ stage = "CANDIDATE" /\ ~(verdict[Cur].typ /\ verdict[Cur].dev)
  /\ stage' = "REJECTED"
  /\ UNCHANGED <<cyc, ver, verdict, gateVer, admittedSet, effects, repairReads, holdQ, qTotal>>
Admit ==
  /\ stage = "PROVISIONAL" /\ holdQ = 0 /\ verdict[Cur].hold
  /\ "holdout" \notin repairReads
  /\ stage' = "ADMITTED" /\ gateVer' = Cur /\ admittedSet' = admittedSet \cup {Cur}
  /\ holdQ' = 1 /\ qTotal' = qTotal + 1
  /\ UNCHANGED <<cyc, ver, verdict, effects, repairReads>>
RejectHold ==
  /\ stage = "PROVISIONAL" /\ holdQ = 0 /\ ~verdict[Cur].hold
  /\ stage' = "REJECTED_TERMINAL"
  /\ holdQ' = 1 /\ qTotal' = qTotal + 1
  /\ UNCHANGED <<cyc, ver, verdict, gateVer, admittedSet, effects, repairReads>>
ProdExec ==
  /\ stage = "ADMITTED" /\ gateVer = Cur /\ effects' = effects \cup {Cur}
  /\ UNCHANGED <<cyc, ver, stage, verdict, gateVer, admittedSet, repairReads, holdQ, qTotal>>
NewCycle ==
  /\ cyc < MaxCyc
  /\ stage \in {"ADMITTED","REJECTED_TERMINAL"} \/ (stage = "REJECTED" /\ ver = MaxVer)
  /\ cyc' = cyc + 1 /\ ver' = 0 /\ stage' = "NONE" /\ holdQ' = 0
  /\ UNCHANGED <<verdict, gateVer, admittedSet, effects, repairReads, qTotal>>
Next == Propose \/ Repair \/ Promote \/ RejectDev \/ RejectHold \/ Admit \/ ProdExec \/ NewCycle
Spec == Init /\ [][Next]_vars
Fairness == WF_vars(Propose) /\ WF_vars(RejectDev) /\ WF_vars(RejectHold)
          /\ WF_vars(Promote) /\ WF_vars(Admit) /\ WF_vars(ProdExec) /\ WF_vars(NewCycle)
LiveSpec == Spec /\ Fairness
Isolation == effects \subseteq admittedSet
AdmissionSound == \A v \in admittedSet : verdict[v].typ /\ verdict[v].dev /\ verdict[v].hold
HoldoutSealed == "holdout" \notin repairReads
AdmissionBinding == stage = "ADMITTED" => (gateVer = Cur /\ Cur \in admittedSet)
EffectsAreVerified == \A v \in effects : v \in admittedSet /\ verdict[v].typ /\ verdict[v].dev /\ verdict[v].hold
HoldQPerCycle == qTotal <= cyc /\ holdQ <= 1
AdmitOnlyViaGate ==
  [][ (stage' = "ADMITTED" /\ stage # "ADMITTED") => (stage = "PROVISIONAL" /\ CurP = Cur) ]_vars
AllPass(v) == verdict[v].typ /\ verdict[v].dev /\ verdict[v].hold
Live1 == (\A v \in Versions : AllPass(v)) => <>(admittedSet # {})
Live2 == (\E v \in Versions : AllPass(v)) => <>(admittedSet # {})
Live3 == (\E c \in 1..MaxCyc : AllPass((c-1)*MaxVer + 1)) => <>(admittedSet # {})
=============================================================================
