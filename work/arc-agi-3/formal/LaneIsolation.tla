---------------------------- MODULE LaneIsolation ----------------------------
(***************************************************************************)
(* Isolamento entre a lane de producao (fail-closed) e a lane de           *)
(* desenvolvimento (CANDIDATE/PROVISIONAL) do pipeline de sintese do       *)
(* Arkhe, com holdout selado para a admissao.                              *)
(*                                                                         *)
(* Escopo: modelo abstrato. Verifica a LOGICA DE PROTOCOLO, nao a          *)
(* implementacao Rust. Os veredictos dos gates sao um oraculo de verdade   *)
(* (verdict), fixado em Init e desconhecido do pipeline.                   *)
(*                                                                         *)
(* Buggy = FALSE: apenas as acoes do desenho.                             *)
(* Buggy = TRUE : adiciona duas acoes de violacao (controlo negativo) para *)
(*                provar que os invariantes nao sao vacuos.               *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
    MaxVer,   \* numero maximo de versoes do candidato (limite do modelo)
    Buggy     \* BOOLEAN: liga as acoes de violacao

ASSUME MaxVer \in Nat \ {0}
ASSUME Buggy \in BOOLEAN

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
Stages   == {"NONE", "CANDIDATE", "PROVISIONAL", "ADMITTED"}
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

\* Controlos negativos (so com Buggy = TRUE) -------------------------------
LeakExec ==                    \* efeito em producao sem admissao
    /\ Buggy
    /\ ver >= 1
    /\ stage \in {"CANDIDATE", "PROVISIONAL"}
    /\ effects' = effects \cup {ver}
    /\ UNCHANGED <<ver, stage, verdict, gateVer, admittedSet, repairReads>>

LeakHoldout ==                 \* o loop de reparacao le o holdout
    /\ Buggy
    /\ repairReads' = repairReads \cup {"holdout"}
    /\ UNCHANGED <<ver, stage, verdict, gateVer, admittedSet, effects>>

Next ==
    \/ Propose \/ Repair \/ Promote \/ Admit \/ ProdExec
    \/ LeakExec \/ LeakHoldout

Spec == Init /\ [][Next]_vars

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

=============================================================================
