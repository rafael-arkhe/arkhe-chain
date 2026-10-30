-------------------------- MODULE LaneIncumbent ------------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS MaxVer, Fault
ASSUME MaxVer \in Nat \ {0}
ASSUME Fault \in 0..4
VARIABLES ver, evaluated, typ, scores, hold, best, bestScore, parent,
          stage, frozen, gateVer, admitted, effects
vars == <<ver,evaluated,typ,scores,hold,best,bestScore,parent,stage,frozen,
          gateVer,admitted,effects>>
Versions == 1..MaxVer
Eligible == {v \in evaluated : typ[v]}
Good(v) == typ[v] /\ scores[v] = 2 /\ hold[v]
Init ==
 /\ ver = 0 /\ evaluated = {}
 /\ typ \in [Versions -> BOOLEAN]
 /\ scores \in [Versions -> 0..2]
 /\ hold \in [Versions -> BOOLEAN]
 /\ best = 0 /\ bestScore = 0
 /\ parent = [v \in Versions |-> 0]
 /\ stage = "CANDIDATE" /\ frozen = 0 /\ gateVer = 0
 /\ admitted = {} /\ effects = {}
NewVersion ==
 /\ ver < MaxVer
 /\ (ver = 0 \/ ver \in evaluated)
 /\ ver' = ver+1
 /\ parent' = [parent EXCEPT ![ver+1] = best]
 /\ stage' = "CANDIDATE" /\ frozen' = 0
 /\ UNCHANGED <<evaluated,typ,scores,hold,best,bestScore,gateVer,admitted,effects>>
Evaluate ==
 /\ ver >= 1 /\ ver \notin evaluated
 /\ evaluated' = evaluated \cup {ver}
 /\ IF typ[ver] /\ (best = 0 \/ scores[ver] > bestScore)
       THEN /\ best' = ver /\ bestScore' = scores[ver]
       ELSE UNCHANGED <<best,bestScore>>
 /\ UNCHANGED <<ver,typ,scores,hold,parent,stage,frozen,gateVer,admitted,effects>>
Promote ==
 /\ stage = "CANDIDATE" /\ best > 0 /\ bestScore = 2
 /\ stage' = "PROVISIONAL" /\ frozen' = best
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,best,bestScore,parent,gateVer,admitted,effects>>
Admit ==
 /\ stage = "PROVISIONAL" /\ frozen > 0 /\ Good(frozen)
 /\ stage' = "ADMITTED" /\ gateVer' = frozen
 /\ admitted' = admitted \cup {frozen}
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,best,bestScore,parent,frozen,effects>>
ProdExec ==
 /\ gateVer > 0 /\ gateVer \in admitted
 /\ effects' = effects \cup {gateVer}
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,best,bestScore,parent,stage,frozen,gateVer,admitted>>
BadAdmission ==
 /\ Fault = 1 /\ ver > 0 /\ ~Good(ver)
 /\ admitted' = admitted \cup {ver}
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,best,bestScore,parent,stage,frozen,gateVer,effects>>
BadBinding ==
 /\ Fault = 2 /\ stage = "PROVISIONAL" /\ frozen > 0
 /\ stage' = "ADMITTED" /\ gateVer' = 0
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,best,bestScore,parent,frozen,admitted,effects>>
Shortcut ==
 /\ Fault = 3 /\ stage = "CANDIDATE"
 /\ stage' = "ADMITTED"
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,best,bestScore,parent,frozen,gateVer,admitted,effects>>
ForgetBest ==
 /\ Fault = 4 /\ best > 0
 /\ \E v \in Eligible :
       /\ scores[v] < bestScore
       /\ best' = v /\ bestScore' = scores[v]
 /\ UNCHANGED <<ver,evaluated,typ,scores,hold,parent,stage,frozen,gateVer,admitted,effects>>
Next == NewVersion \/ Evaluate \/ Promote \/ Admit \/ ProdExec
        \/ BadAdmission \/ BadBinding \/ Shortcut \/ ForgetBest
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(Promote) /\ WF_vars(Admit)
TypeOK ==
 /\ ver \in 0..MaxVer /\ evaluated \subseteq 1..ver
 /\ typ \in [Versions -> BOOLEAN] /\ hold \in [Versions -> BOOLEAN]
 /\ scores \in [Versions -> 0..2]
 /\ best \in 0..MaxVer /\ bestScore \in 0..2
 /\ parent \in [Versions -> 0..MaxVer]
 /\ stage \in {"CANDIDATE","PROVISIONAL","ADMITTED"}
 /\ frozen \in 0..MaxVer /\ gateVer \in 0..MaxVer
 /\ admitted \subseteq Versions /\ effects \subseteq Versions
IncumbentIsBest ==
 /\ (Eligible = {} <=> best = 0)
 /\ best > 0 =>
       /\ best \in Eligible /\ bestScore = scores[best]
       /\ \A v \in Eligible : scores[v] <= bestScore
AdmissionSound == \A v \in admitted : Good(v)
Isolation == effects \subseteq admitted
AdmissionBinding == stage = "ADMITTED" =>
                       (frozen > 0 /\ gateVer = frozen /\ frozen \in admitted)
EffectsAreVerified == \A v \in effects : v \in admitted /\ Good(v)
AdmitOnlyViaGate == [][(stage' = "ADMITTED" /\ stage # "ADMITTED")
                       => stage = "PROVISIONAL"]_vars
RepairUsesBest == [][ver' = ver+1 => parent'[ver'] = best]_vars
FinalGoodBest == ver = MaxVer /\ evaluated = Versions /\ best > 0 /\ Good(best)
FinalBestEventuallyAdmitted == FinalGoodBest ~> (gateVer = best)
=============================================================================
