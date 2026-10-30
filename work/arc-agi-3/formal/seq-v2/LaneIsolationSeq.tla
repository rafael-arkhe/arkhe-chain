---------------------------- MODULE LaneIsolationSeq ----------------------------
(***************************************************************************)
(* Isolamento entre a lane de producao (fail-closed) e a lane de           *)
(* desenvolvimento (CANDIDATE/PROVISIONAL) do pipeline de sintese do       *)
(* Arkhe, com holdout selado para a admissao.                              *)
(*                                                                         *)
(* Escopo: modelo abstrato. Verifica a LOGICA DE PROTOCOLO, nao a          *)
(* implementacao Rust. Os veredictos dos gates sao um oraculo de verdade   *)
(* (verdict), fixado em Init e desconhecido do pipeline.                   *)
(*                                                                         *)
(* Bugs = {} : apenas as acoes do desenho.                                *)
(* Bugs = {b}: liga UMA acao de violacao (controlo negativo). Cada acao    *)
(*             existe para falsificar um invariante especifico; a matriz   *)
(*             bug x propriedade e verificada por script (run_matrix.sh). *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    MaxVer,   \* numero maximo de versoes do candidato (limite do modelo)
    Bugs      \* subconjunto de BugNames: violacoes ativadas

ASSUME MaxVer \in Nat \ {0}
BugNames == {"leakExec", "leakHoldout", "unsoundAdmit", "unbind", "shortcut"}
ASSUME Bugs \subseteq BugNames

VARIABLES
    ver,          \* versao corrente do incumbent (0 = nenhuma)
    stage,        \* estagio da versao corrente
    verdict,      \* oraculo: veredicto verdadeiro de cada gate por versao
    gateVer,      \* ultima versao admitida pelo gate de producao (0 = nenhuma)
    admittedSet,  \* versoes alguma vez admitidas pelo gate
    effects,      \* versoes que produziram efeito em producao
    repairReads   \* particoes de dados lidas pelo loop de reparacao

vars == <<ver, stage, verdict, gateVer, admittedSet, effects, repairReads>>

Versions == 1..MaxVer
Stages   == {"NONE", "CANDIDATE", "PROVISIONAL", "ADMITTED", "REJECTED"}
Verdicts == [typ : BOOLEAN, dev : BOOLEAN, hold : BOOLEAN]
Parts    == {"dev", "holdout"}

TypeOK ==
    /\ ver \in 0..MaxVer
    /\ stage \in Stages
    /\ verdict \in [Versions -> Verdicts]
    /\ gateVer \in 0..MaxVer
    /\ admittedSet \subseteq Versions
    /\ effects \subseteq Versions
    /\ repairReads \subseteq Parts

Init ==
    /\ ver = 0
    /\ stage = "NONE"
    /\ verdict \in [Versions -> Verdicts]
    /\ gateVer = 0
    /\ admittedSet = {}
    /\ effects = {}
    /\ repairReads = {}

\* Toda nova versao (proposta ou reparacao) reinicia o estagio em CANDIDATE.
NewVersion ==
    /\ ver < MaxVer
    /\ stage \in {"NONE", "REJECTED", "ADMITTED"}
    /\ ver' = ver + 1
    /\ stage' = "CANDIDATE"
    /\ UNCHANGED <<verdict, gateVer, admittedSet, effects>>

\* Lane de desenvolvimento -------------------------------------------------
Propose ==
    /\ NewVersion
    /\ UNCHANGED repairReads

Repair ==                      \* CEGIS: le apenas o historico de DEV
    /\ ver >= 1
    /\ NewVersion
    /\ repairReads' = repairReads \cup {"dev"}

Promote ==                     \* CANDIDATE -> PROVISIONAL (tipos + replay dev)
    /\ stage = "CANDIDATE"
    /\ verdict[ver].typ
    /\ verdict[ver].dev
    /\ stage' = "PROVISIONAL"
    /\ UNCHANGED <<ver, verdict, gateVer, admittedSet, effects, repairReads>>

RejectDev ==                   \* o gate de dev julga e rejeita
    /\ stage = "CANDIDATE"
    /\ ~(verdict[ver].typ /\ verdict[ver].dev)
    /\ stage' = "REJECTED"
    /\ UNCHANGED <<ver, verdict, gateVer, admittedSet, effects, repairReads>>

RejectHold ==                  \* o gate de holdout julga e rejeita
    /\ stage = "PROVISIONAL"
    /\ ~verdict[ver].hold
    /\ stage' = "REJECTED"
    /\ UNCHANGED <<ver, verdict, gateVer, admittedSet, effects, repairReads>>

\* Gate de admissao (unica fronteira entre as lanes) -----------------------
Admit ==                       \* PROVISIONAL -> ADMITTED (holdout selado)
    /\ stage = "PROVISIONAL"
    /\ verdict[ver].hold
    /\ "holdout" \notin repairReads
    /\ stage' = "ADMITTED"
    /\ gateVer' = ver
    /\ admittedSet' = admittedSet \cup {ver}
    /\ UNCHANGED <<ver, verdict, effects, repairReads>>

\* Lane de producao --------------------------------------------------------
ProdExec ==                    \* efeito so para a versao admitida E corrente
    /\ stage = "ADMITTED"
    /\ gateVer = ver
    /\ effects' = effects \cup {ver}
    /\ UNCHANGED <<ver, stage, verdict, gateVer, admittedSet, repairReads>>

\* Controlos negativos (cada um ligado por um nome em Bugs) ---------------
LeakExec ==                    \* efeito em producao sem admissao
    /\ "leakExec" \in Bugs
    /\ ver >= 1
    /\ stage \in {"CANDIDATE", "PROVISIONAL"}
    /\ effects' = effects \cup {ver}
    /\ UNCHANGED <<ver, stage, verdict, gateVer, admittedSet, repairReads>>

LeakHoldout ==                 \* o loop de reparacao le o holdout
    /\ "leakHoldout" \in Bugs
    /\ repairReads' = repairReads \cup {"holdout"}
    /\ UNCHANGED <<ver, stage, verdict, gateVer, admittedSet, effects>>

UnsoundAdmit ==                \* admite versao que falha o gate de holdout
    /\ "unsoundAdmit" \in Bugs
    /\ stage = "PROVISIONAL"
    /\ ~verdict[ver].hold
    /\ stage' = "ADMITTED"
    /\ gateVer' = ver
    /\ admittedSet' = admittedSet \cup {ver}
    /\ UNCHANGED <<ver, verdict, effects, repairReads>>

Unbind ==                      \* desfaz o vinculo versao-admissao
    /\ "unbind" \in Bugs
    /\ stage = "ADMITTED"
    /\ gateVer' = 0
    /\ UNCHANGED <<ver, stage, verdict, admittedSet, effects, repairReads>>

Shortcut ==                    \* CANDIDATE -> ADMITTED sem passar por PROVISIONAL
    /\ "shortcut" \in Bugs
    /\ stage = "CANDIDATE"
    /\ verdict[ver].hold
    /\ stage' = "ADMITTED"
    /\ gateVer' = ver
    /\ admittedSet' = admittedSet \cup {ver}
    /\ UNCHANGED <<ver, verdict, effects, repairReads>>

Next ==
    \/ Propose \/ Repair \/ Promote \/ Admit \/ ProdExec \/ RejectDev \/ RejectHold
    \/ LeakExec \/ LeakHoldout \/ UnsoundAdmit \/ Unbind \/ Shortcut

Spec == Init /\ [][Next]_vars

\* Equidade fraca nas acoes do desenho (so para as propriedades de liveness).
Fairness ==
    /\ WF_vars(Propose) /\ WF_vars(RejectDev) /\ WF_vars(RejectHold) /\ WF_vars(Promote) /\ WF_vars(Admit) /\ WF_vars(ProdExec)
LiveSpec == Spec /\ Fairness

(***************************************************************************)
(* Invariantes                                                             *)
(***************************************************************************)

\* INV-LANE-01 (isolamento): nenhum efeito em producao sem admissao.
Isolation == effects \subseteq admittedSet

\* INV-LANE-02 (solidez da admissao): admitido => os tres gates passam.
AdmissionSound ==
    \A v \in admittedSet :
        /\ verdict[v].typ
        /\ verdict[v].dev
        /\ verdict[v].hold

\* INV-LANE-03 (selagem do holdout): o loop de reparacao nunca le o holdout.
HoldoutSealed == "holdout" \notin repairReads

\* INV-LANE-04 (vinculo versao-admissao): estar ADMITTED implica que a versao
\* corrente e exatamente a admitida (sem TOCTOU entre admissao e execucao).
AdmissionBinding ==
    stage = "ADMITTED" => (gateVer = ver /\ ver \in admittedSet)

\* INV-LANE-05 (efeito so da versao admitida): todo efeito tem versao admitida
\* que passou os tres gates (composicao de 01 e 02, checada explicitamente).
EffectsAreVerified ==
    \A v \in effects :
        /\ v \in admittedSet
        /\ verdict[v].typ /\ verdict[v].dev /\ verdict[v].hold

(***************************************************************************)
(* Propriedade de acao: ADMITTED so e alcancavel a partir de PROVISIONAL   *)
(* na mesma versao (sem atalho CANDIDATE -> ADMITTED).                     *)
(***************************************************************************)
AdmitOnlyViaGate ==
    [][ (stage' = "ADMITTED" /\ stage # "ADMITTED")
          => (stage = "PROVISIONAL" /\ ver' = ver) ]_vars

(***************************************************************************)
(* Liveness (so com LiveSpec), neste modulo SEQUENCIAL.                    *)
(* Live1: se TODA versao passa os gates, alguma versao e admitida: PASSA.  *)
(* Live2: se EXISTE uma versao boa, alguma versao e admitida:     PASSA.   *)
(*                                                                         *)
(* Live2 passa aqui porque NewVersion so dispara depois de a versao        *)
(* corrente ser julgada (ADMITTED ou REJECTED; ver RejectDev/RejectHold).  *)
(* No modulo original (LaneIsolation.tla, sem julgamento sequencial)       *)
(* Live2 FALHA: Propose/Repair abandonam a versao boa antes de Promote, e  *)
(* acrescentar WF_vars(Repair) nao muda isso.                              *)
(* A liveness e propriedade da disciplina do proposer, nao das lanes.      *)
(***************************************************************************)
AllPass(v) == verdict[v].typ /\ verdict[v].dev /\ verdict[v].hold
Live1 == (\A v \in Versions : AllPass(v)) => <>(admittedSet # {})
Live2 == (\E v \in Versions : AllPass(v)) => <>(admittedSet # {})

=============================================================================
