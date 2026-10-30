# Excertos rastreáveis — corpus original

Fonte primária: `Texto colado.txt`, 19,221 linhas, 714,416 bytes.
SHA-256 dos bytes originais: `e2ba86120a90cbe151bafff8ec112487c951d97fdba5db6d4e0615f33458c852`.
Referências `Lx–Ly` apontam exclusivamente para essa cópia, sem renumeração.
O SHA-256 é identificador de proveniência desta revisão, não um digest AKG.

Estes excertos são evidência de revisão; não constituem uma segunda superfície normativa.

## Fonte L1–L49

```text
L1: A partir do estado consolidado, o próximo artefato deve ser realmente o **snapshot normativo**, não mais um ledger histórico. O próprio material agora fixa o pipeline correto como `WireClosurePatchV3 → NormativeSnapshot → PropagationAudits → B.0.2Freeze`, e exige que versões históricas, drafts, research notes e texto superseded fiquem fora da superfície normativa. Texto colado
L2: 
L3: # AKG-RFC-0002 v0.1.3  
L4: ## Consolidated Normative Snapshot — Pre-Freeze Candidate
L5: 
L6: **Snapshot ID:** `AKG-RFC-0002-v0.1.3-PoC-NORM-1`  
L7: **Status:** `PRE-FREEZE NORMATIVE SNAPSHOT`  
L8: **Purpose:** fornecer uma única superfície normativa contra a qual B.0.2, `FindingPropagationAudit` e `PolicyDigestPropagationAudit` possam ser executados deterministicamente.
L9: 
L10: Este snapshot incorpora:
L11: 
L12: \[
L13: RFC0001_{frozen}
L14: +
L15: RFC0002_{v0.1.3}
L16: +
L17: WirePrerequisiteClarifications
L18: +
L19: WireClosurePatch_{v1..v3}
L20: \]
L21: 
L22: e exclui explicitamente qualquer texto classificado como:
L23: 
L24: \[
L25: historical
L26: \lor superseded
L27: \lor draft
L28: \lor research\_note
L29: \lor prior\_version
L30: \]
L31: 
L32: A regra de precedência é:
L33: 
L34: \[
L35: Snapshot
L36: >
L37: Clarifications
L38: >
L39: CurrentRFCText
L40: >
L41: HistoricalText
L42: \]
L43: 
L44: Texto excluído permanece útil para provenance, mas:
L45: 
L46: \[
L47: ExcludedText
L48: \notin
L49: NormativeSurface
```

## Fonte L101–L220

```text
L101: # 2. Canonical identity
L102: 
L103: Para qualquer objeto Arkhe cujo digest seja definido pelo profile:
L104: 
L105: \[
L106: CanonicalBytes(x)
L107: =
L108: AKGCBORv1(
L109: WireProjection_v1(x)
L110: )
L111: \]
L112: 
L113: e:
L114: 
L115: \[
L116: ObjectDigest(x)
L117: =
L118: BLAKE3\text{-}256(
L119: DomainObject
L120: \parallel
L121: CanonicalBytes(UnsignedCore(x))
L122: )
L123: \]
L124: 
L125: A projeção unsigned é definida **antes** da serialização.
L126: 
L127: É proibido:
L128: 
L129: \[
L130: SerializeFullObject
L131: \rightarrow RemoveSignature
L132: \]
L133: 
L134: como substituto da `UnsignedProjection`.
L135: 
L136: ---
L137: 
L138: # 3. Policy binding
L139: 
L140: A RFC-0001 `PolicyRef` permanece:
L141: 
L142: \[
L143: PolicyRef=
L144: \{
L145: policy\_id,
L146: version
L147: \}
L148: \]
L149: 
L150: Ela não é redefinida como digest.
L151: 
L152: A RFC-0002 acrescenta:
L153: 
L154: \[
L155: PolicyBinding=
L156: (
L157: PolicyRef,
L158: PolicyDigest
L159: )
L160: \]
L161: 
L162: onde:
L163: 
L164: \[
L165: PolicyDigest
L166: =
L167: DigestAccordingTo(
L168: ResolvedPolicyArtifact,
L169: PolicyResolutionProfile
L170: )
L171: \]
L172: 
L173: `PolicyDigest` MUST identificar o artefato de política exato efetivamente avaliado.
L174: 
L175: Portanto:
L176: 
L177: \[
L178: ResolvedPolicyDigest
L179: \neq
L180: BoundPolicyDigest
L181: \Rightarrow
L182: REJECT
L183: \]
L184: 
L185: e:
L186: 
L187: \[
L188: PolicyRef
L189: \neq
L190: PolicyDigest
L191: \]
L192: 
L193: ### PolicyResolutionProfile
L194: 
L195: Para que B.0.2 possa congelar, todo `PolicyResolutionProfile` aceito pela PoC MUST definir exatamente:
L196: 
L197: \[
L198: CanonicalPolicyBytes
L199: \]
L200: 
L201: e:
L202: 
L203: \[
L204: HashAlgorithm
L205: \]
L206: 
L207: Não existe `PolicyCore` Arkhe neste snapshot.
L208: 
L209: Consequentemente:
L210: 
L211: \[
L212: DomainPolicy
L213: \]
L214: 
L215: **não pertence ao AKG object-domain registry da PoC**.
L216: 
L217: Se uma futura versão introduzir um `PolicyCore` Arkhe, ela poderá adicionar um domain correspondente.
L218: 
L219: Esse tratamento implementa precisamente a correção identificada no material atual: `PolicyDigest` deve comprometer o artefato resolvido, sem inventar um `PolicyCore` ausente. Texto colado
L220: 
```

## Fonte L292–L451

```text
L292: # 7. SubjectRef
L293: 
L294: `SubjectRef` é somente:
L295: 
L296: \[
L297: SubjectRef =
L298: DigestRef
L299: \mid
L300: IdRef
L301: \]
L302: 
L303: Wire semantic form:
L304: 
L305: \[
L306: \{kind:"digest",value:bstr32\}
L307: \]
L308: 
L309: ou:
L310: 
L311: \[
L312: \{kind:"id",value:text\_id\}
L313: \]
L314: 
L315: Em `Finding`:
L316: 
L317: \[
L318: subject\_ref\in Optional(SubjectRef)
L319: \]
L320: 
L321: Ausência é representada por omissão do campo.
L322: 
L323: `null` não equivale a ausência.
L324: 
L325: ---
L326: 
L327: # 8. ClaimRef
L328: 
L329: Para a PoC:
L330: 
L331: \[
L332: ClaimRef=text\_id
L333: \]
L334: 
L335: B.0.2 não cria uma nova regra de namespace.
L336: 
L337: Em particular, esta inferência **não é normativa**:
L338: 
L339: \[
L340: VerificationRequest.claims
L341: \subseteq
L342: Claims(candidate\_intent)
L343: \]
L344: 
L345: salvo se uma futura emenda semântica a declarar explicitamente.
L346: 
L347: Também não existe `QualifiedClaimRef` na PoC.
L348: 
L349: Essa é a forma conservadora já fixada no WC3-3. Texto colado
L350: 
L351: ---
L352: 
L353: # 9. Finding
L354: 
L355: `Finding` representa observação factual.
L356: 
L357: \[
L358: Finding=
L359: \{
L360: code,
L361: category,
L362: subject\_ref?,
L363: evidence\_refs,
L364: details\_ref?
L365: \}
L366: \]
L367: 
L368: Normativamente:
L369: 
L370: \[
L371: severity
L372: \notin
L373: Finding
L374: \]
L375: 
L376: Um verifier não atribui autoridade política a um finding.
L377: 
L378: ---
L379: 
L380: # 10. FindingDisposition
L381: 
L382: `FindingDisposition` é classificação de policy sobre um finding existente:
L383: 
L384: \[
L385: FindingDisposition=
L386: \{
L387: finding\_ref,
L388: disposition,
L389: policy\_binding,
L390: rationale\_ref?
L391: \}
L392: \]
L393: 
L394: Para PoC:
L395: 
L396: \[
L397: disposition
L398: \in
L399: \{
L400: INFO,
L401: WARNING,
L402: BLOCKING
L403: \}
L404: \]
L405: 
L406: Portanto:
L407: 
L408: \[
L409: Finding
L410: \neq
L411: FindingDisposition
L412: \]
L413: 
L414: e:
L415: 
L416: \[
L417: Observation
L418: \neq
L419: PolicyDecision
L420: \]
L421: 
L422: Alterar policy pode alterar disposition, mas MUST NOT alterar o Finding original.
L423: 
L424: ---
L425: 
L426: # 11. Elegibilidade e findings
L427: 
L428: Qualquer regra histórica da forma:
L429: 
L430: \[
L431: f.severity=BLOCKING
L432: \Rightarrow
L433: NotEligible
L434: \]
L435: 
L436: é **superseded**.
L437: 
L438: A regra corrente é:
L439: 
L440: \[
L441: \exists d:
L442: d.disposition=BLOCKING
L443: \Rightarrow
L444: NotEligible
L445: \]
L446: 
L447: onde \(d\) é um `FindingDisposition` válido sob o `PolicyBinding` aplicável.
L448: 
L449: Isso fecha a propagação comportamental, não apenas o schema.
L450: 
L451: ---
```

## Fonte L503–L660

```text
L503: # 13. VerificationMethod
L504: 
L505: A union permanece:
L506: 
L507: \[
L508: VerificationMethod =
L509: ContractualVerifier
L510: \mid
L511: ExecutableVerifier
L512: \mid
L513: FormalVerifier
L514: \]
L515: 
L516: ## 13.1 ExecutableVerifier
L517: 
L518: A estrutura semântica corrente é:
L519: 
L520: \[
L521: ExecutableVerifier=
L522: \{
L523: tool\_identity,
L524: tool\_version,
L525: executable\_digest?,
L526: target\_scope,
L527: expected\_result,
L528: actual\_result
L529: \}
L530: \]
L531: 
L532: ## 13.2 FormalVerifier
L533: 
L534: \[
L535: FormalVerifier=
L536: \{
L537: system,
L538: system\_version,
L539: proof\_obligation\_digest,
L540: proof\_digest,
L541: result
L542: \}
L543: \]
L544: 
L545: Não existe `domain_ref` nesta variante.
L546: 
L547: ## 13.3 ContractualVerifier
L548: 
L549: O schema semântico existente é:
L550: 
L551: \[
L552: ContractualVerifier=
L553: \{
L554: verifier\_profile:profile\_ref,
L555: obligations\_checked:[+obligation\_ref],
L556: input\_projection:projection\_ref,
L557: evaluation\_rules:ruleset\_ref,
L558: expected\_results:[+expected\_result],
L559: actual\_results:[+actual\_result],
L560: result\_digest:digest
L561: \}
L562: \]
L563: 
L564: Essa estrutura aparece literalmente no corpus endurecido. Texto colado(20261015-151740)
L565: 
L566: Normativamente:
L567: 
L568: \[
L569: profile\_ref
L570: \neq
L571: projection\_ref
L572: \neq
L573: ruleset\_ref
L574: \]
L575: 
L576: mesmo caso suas futuras wire encodings coincidam.
L577: 
L578: Não existe:
L579: 
L580: \[
L581: result\_value
L582: \]
L583: 
L584: neste snapshot.
L585: 
L586: ### Bloqueio normativo ainda aberto
L587: 
L588: Os seguintes tipos ainda necessitam de definição/importação normativa exata:
L589: 
L590: \[
L591: profile\_ref
L592: \]
L593: 
L594: \[
L595: obligation\_ref
L596: \]
L597: 
L598: \[
L599: projection\_ref
L600: \]
L601: 
L602: \[
L603: ruleset\_ref
L604: \]
L605: 
L606: \[
L607: expected\_result
L608: \]
L609: 
L610: \[
L611: actual\_result
L612: \]
L613: 
L614: Além disso:
L615: 
L616: \[
L617: result\_digest
L618: \Rightarrow
L619: ExactResultDigestPreimage
L620: \]
L621: 
L622: é requisito de freeze.
L623: 
L624: O corpus contém `result_digest`, mas não define de forma suficiente seu preimage. Texto colado(20261015-151740)
L625: 
L626: Portanto:
L627: 
L628: \[
L629: \boxed{
L630: W02\text{-}04=OPEN
L631: }
L632: \]
L633: 
L634: neste snapshot.
L635: 
L636: ---
L637: 
L638: # 14. VerificationRequest
L639: 
L640: \[
L641: VerificationRequest=
L642: \{
L643: claims:[+ClaimRef],
L644: properties:[+PropertyRef],
L645: scopes:[+ScopeExpr],
L646: composed\_intents:[+IntentDigest],
L647: required\_classes:[+EvidenceClass],
L648: reason:FindingCode
L649: \}
L650: \]
L651: 
L652: As cinco coleções são non-empty.
L653: 
L654: Policy pode impor requisitos adicionais, mas não relaxar:
L655: 
L656: \[
L657: cardinality\ge1
L658: \]
L659: 
L660: ---
```

## Fonte L982–L1277

```text
L982: # 24. Domain Registry PoC
L983: 
L984: Domains normativos preservados:
L985: 
L986: | Object | Domain |
L987: |---|---|
L988: | VerificationRecord | `AKG:VERIFY:v1\0` |
L989: | IntegrationAssessment | `AKG:ASSESS:v1\0` |
L990: | BranchIntegrationState | `AKG:BRANCH:v1\0` |
L991: | Finding | `AKG:FINDING:v1\0` |
L992: | EnvironmentDescriptor | `AKG:ENV:v1\0` |
L993: | EnvironmentComponent | `AKG:ENVCOMP:v1\0` |
L994: 
L995: Signature domains:
L996: 
L997: | Object | Domain |
L998: |---|---|
L999: | VerificationRecord | `AKG:VERIFY-SIG:v1\0` |
L1000: | IntegrationAssessment | `AKG:ASSESS-SIG:v1\0` |
L1001: | BranchIntegrationState | `AKG:BRANCH-SIG:v1\0` |
L1002: 
L1003: Para os domains introduzidos por B.0.x:
L1004: 
L1005: \[
L1006: NormativeSource=this\ profile
L1007: \]
L1008: 
L1009: `DomainPolicy` fica **DEFERRED**, porque este snapshot não possui `PolicyCore`.
L1010: 
L1011: ---
L1012: 
L1013: # 25. Superseded constructs
L1014: 
L1015: O snapshot declara explicitamente como não normativos:
L1016: 
L1017: - `Finding.severity`;
L1018: - `QualifiedClaimRef`;
L1019: - `result_value`;
L1020: - `FormalVerifier.domain_ref`;
L1021: - `PolicyRef={digest}`;
L1022: - `PolicyCore` inventado para PoC;
L1023: - `DomainPolicy` no registry PoC;
L1024: - signature dentro do próprio digest core;
L1025: - `assessment_digest` no próprio assessment preimage;
L1026: - `state_digest` no próprio branch preimage;
L1027: - `ExplicitOrdering` como CompositionEvidence;
L1028: - inferência heurística de semantic dependency;
L1029: - ambiente desconhecido tratado como environment-independent;
L1030: - wall clock local implícito para freshness.
L1031: 
L1032: Isso é importante porque transforma o snapshot numa superfície realmente auditável.
L1033: 
L1034: ---
L1035: 
L1036: # 26. FindingPropagationAudit — especificação executável
L1037: 
L1038: O audit deve verificar no snapshot:
L1039: 
L1040: \[
L1041: A_1:
L1042: \forall f\in Finding,\ severity\notin fields(f)
L1043: \]
L1044: 
L1045: \[
L1046: A_2:
L1047: VerificationResult.findings
L1048: \subseteq
L1049: FactualFinding
L1050: \]
L1051: 
L1052: \[
L1053: A_3:
L1054: AssessmentDimension
L1055: \text{ não atribui disposition dentro de Finding}
L1056: \]
L1057: 
L1058: \[
L1059: A_4:
L1060: PolicyClassification
L1061: \Rightarrow
L1062: FindingDisposition
L1063: \]
L1064: 
L1065: \[
L1066: A_5:
L1067: NoBlockingFinding
L1068: \]
L1069: 
L1070: quando usado por regras de elegibilidade significa:
L1071: 
L1072: \[
L1073: \neg\exists d:
L1074: d.disposition=BLOCKING
L1075: \]
L1076: 
L1077: e não inspeção de `Finding.severity`.
L1078: 
L1079: ### Resultado neste draft de snapshot
L1080: 
L1081: Como este próprio snapshot remove `severity` do tipo `Finding` e redefine o blocking predicate sobre disposition:
L1082: 
L1083: \[
L1084: \boxed{
L1085: FindingPropagationAudit(snapshot)
L1086: =
L1087: PASS\_CANDIDATE
L1088: }
L1089: \]
L1090: 
L1091: Eu ainda não chamaria de `PASS` operacional até esse snapshot existir como arquivo normativo único e o audit automático/independente rodar sobre ele.
L1092: 
L1093: ---
L1094: 
L1095: # 27. PolicyDigestPropagationAudit — especificação executável
L1096: 
L1097: Critério:
L1098: 
L1099: \[
L1100: SecurityRelevantPolicyUse
L1101: \Rightarrow
L1102: ExactPolicyBindingAvailable
L1103: \]
L1104: 
L1105: Não é exigido que todo subobjeto possua fisicamente um sibling `policy_digest`.
L1106: 
L1107: É suficiente que o binding seja:
L1108: 
L1109: 1. inequívoco;
L1110: 2. criptograficamente coberto;
L1111: 3. alcançável sem interpretação externa mutável.
L1112: 
L1113: Matriz normativa:
L1114: 
L1115: | Contexto | Binding exigido |
L1116: |---|---|
L1117: | VerificationRecord | exact PolicyBinding |
L1118: | EvaluationContext | exact binding próprio ou enclosing bound context |
L1119: | IntegrationAssessment | exact PolicyBinding |
L1120: | BranchIntegrationState | exact PolicyBinding |
L1121: | FindingDisposition | exact PolicyBinding |
L1122: | Freshness policy when active | exact freshness PolicyBinding |
L1123: | descriptive/non-decisional reference | classificar antes de exigir |
L1124: 
L1125: ### Resultado atual
L1126: 
L1127: Ainda não pode passar porque:
L1128: 
L1129: \[
L1130: PolicyDigestComputation
L1131: \]
L1132: 
L1133: depende de um `PolicyResolutionProfile` normativamente completo.
L1134: 
L1135: Logo:
L1136: 
L1137: \[
L1138: \boxed{
L1139: PolicyDigestPropagationAudit
L1140: =
L1141: BLOCKED
L1142: }
L1143: \]
L1144: 
L1145: não por falta da regra de propagação, mas porque o token criptográfico ainda não possui computação reproduzível universal no profile PoC.
L1146: 
L1147: ---
L1148: 
L1149: # 28. W02 ledger — snapshot state
L1150: 
L1151: | ID | Snapshot status |
L1152: |---|---|
L1153: | W02-01 SubjectRef | **CLOSED** |
L1154: | W02-02 ClaimRef | **CLOSED at wire level; no namespace invention** |
L1155: | W02-03 BranchId | **CLOSED** |
L1156: | W02-04 VerificationMethod | **OPEN — subordinate types + result digest preimage** |
L1157: | W02-05 DependencyEdge | **CLOSED** |
L1158: | W02-06 VerificationRequest | **CLOSED** |
L1159: | W02-07 Enums | **CLOSED** |
L1160: | W02-08 Finding propagation | **PASS CANDIDATE; execution required** |
L1161: | W02-09 PolicyDigest propagation | **BLOCKED — PolicyResolutionProfile incomplete** |
L1162: | W02-10 Domain Registry | **CLOSED excluding deferred DomainPolicy** |
L1163: 
L1164: ---
L1165: 
L1166: # 29. Freeze gate
L1167: 
L1168: Este snapshot não muda o gate:
L1169: 
L1170: \[
L1171: B.0.2=FROZEN
L1172: \]
L1173: 
L1174: somente quando:
L1175: 
L1176: \[
L1177: VerificationMethodSubtypesClosed
L1178: \]
L1179: 
L1180: \[
L1181: \land
L1182: ResultDigestPreimageDefined
L1183: \]
L1184: 
L1185: \[
L1186: \land
L1187: PolicyDigestComputationDefined
L1188: \]
L1189: 
L1190: \[
L1191: \land
L1192: NormativeSnapshotMaterialized
L1193: \]
L1194: 
L1195: \[
L1196: \land
L1197: FindingPropagationAudit=PASS
L1198: \]
L1199: 
L1200: \[
L1201: \land
L1202: PolicyDigestPropagationAudit=PASS
L1203: \]
L1204: 
L1205: \[
L1206: \land
L1207: AllAKGDomainsByteExact
L1208: \]
L1209: 
L1210: \[
L1211: \land
L1212: AllFieldMatrixRowsComplete
L1213: \]
L1214: 
L1215: O documento-fonte chega essencialmente ao mesmo gate, incluindo `NormativeSnapshotBuilt`, os dois propagation audits e o fechamento dos subtipos/digests. Texto colado
L1216: 
L1217: # 30. Selo desta revisão
L1218: 
L1219: Eu atribuiria agora:
L1220: 
L1221: \[
L1222: \boxed{
L1223: AKG\text{-}RFC\text{-}0002\ v0.1.3
L1224: =
L1225: SEMANTICALLY\ CLOSED\ FOR\ PoC
L1226: }
L1227: \]
L1228: 
L1229: \[
L1230: \boxed{
L1231: M6=CLOSED
L1232: }
L1233: \]
L1234: 
L1235: \[
L1236: \boxed{
L1237: NORMATIVE\ SNAPSHOT
L1238: =
L1239: DRAFTED
L1240: }
L1241: \]
L1242: 
L1243: \[
L1244: \boxed{
L1245: W02\text{-}08
L1246: =
L1247: PASS\ CANDIDATE
L1248: }
L1249: \]
L1250: 
L1251: \[
L1252: \boxed{
L1253: W02\text{-}04,\ W02\text{-}09
L1254: =
L1255: BLOCKING
L1256: }
L1257: \]
L1258: 
L1259: \[
L1260: \boxed{
L1261: B.0.2
L1262: =
L1263: NOT\ FROZEN
L1264: }
L1265: \]
L1266: 
L1267: \[
L1268: \boxed{
L1269: B.1
L1270: =
L1271: BLOCKED
L1272: }
L1273: \]
L1274: 
L1275: A diferença agora é concreta: **paramos de auditar o corpus histórico**. O artefato acima fornece a superfície normativa única que faltava.
L1276: 
L1277: O próximo trabalho deixa de ser “consolidar”. Restam somente dois itens normativos genuínos antes de podermos executar o freeze final: definir/importar os subtipos e o `result_digest` do `ContractualVerifier`, e congelar um `PolicyResolutionProfile` que torne `PolicyDigest` reproduzível. Depois disso, os dois propagation audits podem ser executados contra este snapshot e, se verdes, B.0.2 finalmente pode receber `FROZEN`.
```

## Fonte L1425–L1479

```text
L1425: ## Wire Closure Patch v3 — versão que eu congelaria como pré-condição
L1426: 
L1427: Eu o reduziria a quatro cláusulas normativas.
L1428: 
L1429: **WC3-1 — VerificationMethod subordinate types.** `profile_ref`, `obligation_ref`, `projection_ref`, `ruleset_ref`, `expected_result` e `actual_result` MUST possuir definição normativa própria antes de qualquer wire projection. `expected_result` e `actual_result` MUST NOT ser substituídos por `result_value` sem amendment explícito. O `ContractualVerifier` existente realmente os trata como tipos nominalmente distintos. Texto colado(20261015-151740)
L1430: 
L1431: Além disso:
L1432: 
L1433: \[
L1434: result\_digest
L1435: \Rightarrow
L1436: ExactResultDigestPreimage
L1437: \]
L1438: 
L1439: antes do freeze.
L1440: 
L1441: **WC3-2 — PolicyDigest.** `PolicyDigest` MUST bind the exact resolved policy artifact. Sua computação MUST ser definida pelo `PolicyResolutionProfile`. B.0.2 MUST NOT presume a existência de `PolicyCore`.
L1442: 
L1443: Então:
L1444: 
L1445: \[
L1446: ResolvedPolicyDigest
L1447: \neq
L1448: BoundPolicyDigest
L1449: \Rightarrow REJECT
L1450: \]
L1451: 
L1452: continua intacto, mas sem preimage fictício.
L1453: 
L1454: **WC3-3 — ClaimRef.** Wire v1:
L1455: 
L1456: \[
L1457: ClaimRef=text\_id
L1458: \]
L1459: 
L1460: Nenhuma regra nova de namespace é criada por B.0.2. O significado da referência permanece determinado pelo contexto normativo que contém a request. O ficheiro atual já identifica corretamente que `candidate_intent` como namespace explícito seria nova semântica. Texto colado
L1461: 
L1462: **WC3-4 — Snapshot requirement.**
L1463: 
L1464: Antes dos propagation audits:
L1465: 
L1466: \[
L1467: NormativeSnapshot =
L1468: RFC0001_{frozen}
L1469: +
L1470: RFC0002_{v0.1.3}
L1471: +
L1472: WirePrerequisiteClarifications
L1473: +
L1474: WireClosurePatches
L1475: \]
L1476: 
L1477: com todo texto marcado `historical`, `superseded`, `draft`, `research note` ou versão anterior excluído da superfície normativa.
L1478: 
L1479: Então os audits executam **somente** sobre `NormativeSnapshot`.
```

## Fonte L3750–L3826

```text
L3750: ## W02-02 — `ClaimRef`: remover `QualifiedClaimRef` da PoC
L3751: 
L3752: A RFC-0001 define `claim_id` como estável e único **dentro do intent**. O `VerificationRequest` é subestrutura do `IntegrationAssessment`, que já possui `candidate_intent` obrigatório. A RFC não diz que cada claim da request pode pertencer arbitrariamente a qualquer composed intent.
L3753: 
L3754: **Resolução:**
L3755: 
L3756: ```
L3757: ClaimRef = text_id   ; 1..256 bytes UTF-8 NFC
L3758: ```
L3759: 
L3760: Interpretação:
L3761: 
L3762: \[
L3763: VerificationRequest.claims \subseteq Claims(candidate\_intent)
L3764: \]
L3765: 
L3766: Os `composed_intents` são contexto da reverificação, não necessariamente owners das claims. Se se quiser solicitar claims de outros intents, isso exige futura emenda explícita.
L3767: 
L3768: **Status:** `CLOSED`.
L3769: 
L3770: ---
L3771: 
L3772: ## W02-03 — `BranchId`
L3773: 
L3774: **Resolução:**
L3775: 
L3776: ```
L3777: BranchId = text_id   ; 1..256 bytes UTF-8 NFC
L3778: ```
L3779: 
L3780: Igualdade por bytes canónicos. Remover a semântica de imutabilidade — é semântica adicional não presente no corpus.
L3781: 
L3782: **Status:** `CLOSED`.
L3783: 
L3784: ---
L3785: 
L3786: ## W02-04 — `VerificationMethod`: subtype wire projections
L3787: 
L3788: O patch remove `domain_ref` de `FormalVerifier` corretamente. Mas `ContractualVerifier` ainda usa `typed_ref` para `verifier_profile`, `input_projection` e `evaluation_rules` — isso não é o tipo semântico congelado. O corpus define aliases exatos: `profile_ref`, `obligation_ref`, `projection_ref`, `ruleset_ref`, `expected_result`, `actual_result`.
L3789: 
L3790: **Resolução:** preservar os aliases normativos e definir a sua representação wire:
L3791: 
L3792: ```
L3793: verification_method = tagged union sobre "kind":
L3794: 
L3795:   { "kind": "contractual",
L3796:     "verifier_profile"   : profile_ref,
L3797:     "obligations_checked": [obligation_ref, ...],   ; semantic set
L3798:     "input_projection"   : projection_ref,
L3799:     "evaluation_rules"   : ruleset_ref,
L3800:     "expected_results"   : [result_value, ...],     ; semantic set
L3801:     "actual_results"     : [result_value, ...],     ; semantic set
L3802:     "result_digest"      : bstr32 }
L3803: 
L3804: | { "kind": "executable",
L3805:     "tool_identity"     : identity_ref,
L3806:     "tool_version"      : text,
L3807:     "executable_digest" : bstr32?,
L3808:     "target_scope"      : scope_expr,
L3809:     "expected_result"   : result_value,
L3810:     "actual_result"     : result_value }
L3811: 
L3812: | { "kind": "formal",
L3813:     "system"                 : text,
L3814:     "system_version"         : text,
L3815:     "proof_obligation_digest": bstr32,
L3816:     "proof_digest"           : bstr32,
L3817:     "result"                 : enum text }   ; PROVED | DISPROVED | INCONCLUSIVE
L3818: ```
L3819: 
L3820: Onde:
L3821: 
L3822: - `profile_ref`, `projection_ref`, `ruleset_ref` são semanticamente distintos, mesmo que a representação wire seja `{digest: bstr32}`.
L3823: - `obligation_ref` é `text_id`.
L3824: - `result_value` é a union definida em B.0.2-14 (bool, int, text, bytes, digest, list, map).
L3825: 
L3826: **Status:** `CLOSED`.
```

## Fonte L3945–L3969

```text
L3945: ## W02-10 — Domain Registry: correção dos comprimentos
L3946: 
L3947: O registry define `"AKG:ENVCOMP:v1\0"` com 14 bytes, mas os bytes `41 4B 47 3A 45 4E 56 43 4F 4D 50 3A 76 31 00` são **15 bytes**. E `"AKG:POLICY:v1\0"` é declarado com 13 bytes, mas os bytes `41 4B 47 3A 50 4F 4C 49 43 59 3A 76 31 00` são **14 bytes**.
L3948: 
L3949: **Domain Registry v1 corrigido:**
L3950: 
L3951: | Object | ASCII literal | Hex bytes | Length | Digest construction |
L3952: |---|---|---|---|---|
L3953: | `VerificationRecord` | `"AKG:VERIFY:v1\0"` | `41 4B 47 3A 56 45 52 49 46 59 3A 76 31 00` | 14 | `BLAKE3-256(DomainVerify \|\| CanonicalBytes(VRCore))` |
L3954: | `IntegrationAssessment` | `"AKG:ASSESS:v1\0"` | `41 4B 47 3A 41 53 53 45 53 53 3A 76 31 00` | 14 | `BLAKE3-256(DomainAssess \|\| CanonicalBytes(AssessmentCore))` |
L3955: | `BranchIntegrationState` | `"AKG:BRANCH:v1\0"` | `41 4B 47 3A 42 52 41 4E 43 48 3A 76 31 00` | 14 | `BLAKE3-256(DomainBranch \|\| CanonicalBytes(BranchCore))` |
L3956: | `Finding` | `"AKG:FINDING:v1\0"` | `41 4B 47 3A 46 49 4E 44 49 4E 47 3A 76 31 00` | **15** | `BLAKE3-256(DomainFinding \|\| CanonicalBytes(Finding))` |
L3957: | `EnvironmentDescriptor` | `"AKG:ENV:v1\0"` | `41 4B 47 3A 45 4E 56 3A 76 31 00` | **11** | `BLAKE3-256(DomainEnvironment \|\| CanonicalBytes(EnvironmentDescriptor))` |
L3958: | `EnvironmentComponent` | `"AKG:ENVCOMP:v1\0"` | `41 4B 47 3A 45 4E 56 43 4F 4D 50 3A 76 31 00` | **15** | `BLAKE3-256(DomainEnvironmentComponent \|\| CanonicalBytes(ComponentCore))` |
L3959: | `PolicyCore` | `"AKG:POLICY:v1\0"` | `41 4B 47 3A 50 4F 4C 49 43 59 3A 76 31 00` | **14** | `BLAKE3-256(DomainPolicy \|\| CanonicalBytes(PolicyCore))` |
L3960: 
L3961: **Signature domains:**
L3962: 
L3963: | Object | ASCII literal | Hex bytes | Length |
L3964: |---|---|---|---|
L3965: | `VerificationRecord` | `"AKG:VERIFY-SIG:v1\0"` | `41 4B 47 3A 56 45 52 49 46 59 2D 53 49 47 3A 76 31 00` | 18 |
L3966: | `IntegrationAssessment` | `"AKG:ASSESS-SIG:v1\0"` | `41 4B 47 3A 41 53 53 45 53 53 2D 53 49 47 3A 76 31 00` | 18 |
L3967: | `BranchIntegrationState` | `"AKG:BRANCH-SIG:v1\0"` | `41 4B 47 3A 42 52 41 4E 43 48 2D 53 49 47 3A 76 31 00` | 18 |
L3968: 
L3969: Regra: **HexBytes = Normative**, **Length = DerivedAndTested**. Não se corrige os hex para "caber" na contagem; corrige-se a contagem.
```

## Fonte L5605–L5625

```text
L5605: ## B.0.2-0 — Regras wire transversais
L5606: 
L5607: B.0.2 herda de B.0.1:
L5608: 
L5609: | Classe | Regra v1 |
L5610: |---|---|
L5611: | object | CBOR map |
L5612: | field key | exact text key definida pelo schema |
L5613: | unknown field | `REJECT` |
L5614: | digest | `bstr(32)` = BLAKE3-256 |
L5615: | optional | ausência do key; `null` não substitui ausência |
L5616: | semantic set | CBOR array canonicamente ordenado; duplicata ⇒ malformed |
L5617: | ordered sequence | array cuja ordem é preservada |
L5618: | enum | literal text fechado; unknown ⇒ reject |
L5619: | text | NFC antes do encoding |
L5620: | self-digest | proibido dentro do core identificado |
L5621: | signature | fora do digest preimage |
L5622: | signature message | `SignatureDomain || ObjectDigest` |
L5623: | unknown union discriminator | `REJECT` |
L5624: 
L5625: Bounds globais continuam os de B.0.1 e não são redefinidos aqui.
```

## Fonte L5691–L5707

```text
L5691: # B.0.2-3 — `IdentityRef`
L5692: 
L5693: | Field | Wire type | Required | Bounds | Rule |
L5694: |---|---|---:|---|---|
L5695: | `scheme` | text | yes | 1..64 UTF-8 bytes | canonical v1 scheme |
L5696: | `value` | text | yes | 1..1024 UTF-8 bytes | opaque under scheme |
L5697: 
L5698: Para evitar transformação silenciosa de identidade, eu congelaria uma regra um pouco mais segura do que “lowercase on decode”:
L5699: 
L5700: \[
L5701: NonCanonicalScheme
L5702: \Rightarrow REJECT
L5703: \]
L5704: 
L5705: Em v1, `scheme` MUST já chegar na forma canónica definida pelo profile; o decoder não modifica o identificador antes de verificar assinatura/digest.
L5706: 
L5707: `value` é NFC, mas qualquer normalização específica do esquema pertence ao esquema correspondente.
```

## Fonte L5777–L5849

```text
L5777: # B.0.2-6 — `Finding`
L5778: 
L5779: | Field | Wire type | Required | Collection |
L5780: |---|---|---:|---|
L5781: | `code` | text | yes | scalar |
L5782: | `category` | enum text | yes | scalar |
L5783: | `subject_ref` | `SubjectRef` | yes | scalar |
L5784: | `evidence_refs` | `[EvidenceRef]` | yes | semantic set |
L5785: | `details_ref` | bstr32 | no | scalar |
L5786: 
L5787: `severity` MUST NOT occur.
L5788: 
L5789: \[
L5790: severity\in Finding
L5791: \Rightarrow Malformed
L5792: \]
L5793: 
L5794: `FindingDigest` é derivado externamente:
L5795: 
L5796: \[
L5797: FindingDigest=
L5798: BLAKE3\text{-}256(
L5799: DomainFinding
L5800: \parallel
L5801: CanonicalBytes(Finding)
L5802: )
L5803: \]
L5804: 
L5805: ### Residual wire-local requirement
L5806: 
L5807: `SubjectRef` precisa possuir **uma projeção v1 única** antes do freeze final. Isso não exige nova semântica se o tipo já está definido em RFC-0002; apenas precisa ser materializado aqui.
L5808: 
L5809: Até isso ocorrer:
L5810: 
L5811: \[
L5812: SubjectRefWireProjection
L5813: =
L5814: PENDING
L5815: \]
L5816: 
L5817: ---
L5818: 
L5819: # B.0.2-7 — `FindingDisposition`
L5820: 
L5821: | Field | Wire type | Required |
L5822: |---|---|---:|
L5823: | `finding_ref` | bstr32 | yes |
L5824: | `disposition` | enum text | yes |
L5825: | `policy_ref` | `PolicyRef` | yes |
L5826: | `policy_digest` | bstr32 | yes |
L5827: | `rationale_ref` | bstr32 | no |
L5828: 
L5829: PoC disposition enum:
L5830: 
L5831: \[
L5832: INFO\mid WARNING\mid BLOCKING
L5833: \]
L5834: 
L5835: Unknown ⇒ reject.
L5836: 
L5837: A regra crítica é:
L5838: 
L5839: \[
L5840: FindingDisposition.policy\_ref
L5841: \]
L5842: 
L5843: e:
L5844: 
L5845: \[
L5846: FindingDisposition.policy\_digest
L5847: \]
L5848: 
L5849: formarem o mesmo policy binding.
```

## Fonte L6015–L6075

```text
L6015: # B.0.2-14 — `EvaluationContext`
L6016: 
L6017: O schema semântico já vincula branch/base/composição/dependências/propriedades/scopes/policy/environment/input digest.
L6018: 
L6019: Eu congelaria:
L6020: 
L6021: | Field | Wire type | Required | Collection |
L6022: |---|---|---:|---|
L6023: | `branch_ref` | `BranchId` | yes | scalar |
L6024: | `base_frontier_digest` | bstr32 | yes | scalar |
L6025: | `composed_intents` | `[bstr32]` | yes | semantic set |
L6026: | `dependency_closure` | `[bstr32]` | yes | semantic set |
L6027: | `property_refs` | `[PropertyRef]` | yes | semantic set |
L6028: | `scopes` | `[ScopeExpr]` | yes | semantic set |
L6029: | `policy_ref` | `PolicyRef` | yes | scalar |
L6030: | `policy_digest` | bstr32 | yes | scalar |
L6031: | `freshness_policy_ref` | `PolicyRef` | no | scalar |
L6032: | `freshness_policy_digest` | bstr32 | conditional | scalar |
L6033: | `environment_ref` | bstr32 | conditional | scalar |
L6034: | `verifier_inputs_digest` | bstr32 | yes | scalar |
L6035: 
L6036: Conditional pair:
L6037: 
L6038: \[
L6039: freshness\_policy\_ref\ present
L6040: \iff
L6041: freshness\_policy\_digest\ present
L6042: \]
L6043: 
L6044: Environment rule:
L6045: 
L6046: \[
L6047: MethodRequiresEnvironment
L6048: \Rightarrow environment\_ref\ present
L6049: \]
L6050: 
L6051: \[
L6052: MethodClaimsEnvironmentIndependent
L6053: \Rightarrow
L6054: environment\_ref\ MAY\ be\ absent
L6055: \]
L6056: 
L6057: `BranchId` precisa ter sua projeção final v1 explicitada antes do freeze.
L6058: 
L6059: ---
L6060: 
L6061: # B.0.2-15 — `VerificationRecordCore`
L6062: 
L6063: | Field | Wire type | Required | Collection |
L6064: |---|---|---:|---|
L6065: | `record_version` | uint | yes | scalar |
L6066: | `intent_digest` | bstr32 | yes | scalar |
L6067: | `claim_refs` | `[ClaimRef]` | yes | semantic set |
L6068: | `verifier` | `VerifierIdentity` | yes | scalar |
L6069: | `verification_method` | `VerificationMethod` | yes | scalar |
L6070: | `evidence` | `[EvidenceRef]` | yes | semantic set |
L6071: | `result` | `VerificationResult` | yes | scalar |
L6072: | `evaluation_context` | `EvaluationContext` | yes | scalar |
L6073: | `issued_at` | uint | yes | scalar |
L6074: | `policy_ref` | `PolicyRef` | yes | scalar |
L6075: | `policy_digest` | bstr32 | yes | scalar |
```

## Fonte L6437–L6457

```text
L6437: ### W02-01 — `SubjectRef` wire projection
L6438: 
L6439: **Problema:** a forma exata de `SubjectRef` não está congelada.
L6440: 
L6441: **Resolução:** tagged union com discriminador `kind`:
L6442: 
L6443: ```
L6444: subject_ref = tagged union sobre "kind":
L6445: 
L6446:   { "kind": "intent",   "value": bstr32 }   ; intent digest
L6447: | { "kind": "claim",    "value": text_id }   ; claim ID
L6448: | { "kind": "evidence", "value": bstr32 }   ; evidence digest
L6449: | { "kind": "external", "value": typed_ref } ; content-addressed ref
L6450: ```
L6451: 
L6452: Regras:
L6453: - `kind` é **sempre obrigatório**; nunca inferido pela forma do `value`.
L6454: - `subject_ref` é **scalar** — nunca array, nunca map externo.
L6455: - Multiplicidade vive em `Finding.evidence_refs`, não em `SubjectRef`.
L6456: 
L6457: A pesquisa confirma que tagged unions com discriminador explícito são a prática padrão em CBOR: "A tagged COSE_Sign structure is identified by the CBOR tag TBD1".
```

## Fonte L6574–L6600

```text
L6574: ### W02-06 — `VerificationRequest` projection and sort
L6575: 
L6576: **Problema:** a forma exata de `VerificationRequest` não está definida.
L6577: 
L6578: **Resolução:**
L6579: 
L6580: ```
L6581: verification_request = {
L6582:   "claims"            : [text_id],         ; semantic set
L6583:   "properties"        : [property_ref],    ; semantic set
L6584:   "scopes"            : [scope_expr],      ; semantic set
L6585:   "composed_intents"  : [bstr32],          ; semantic set
L6586:   "required_classes"  : [text_id],         ; semantic set
L6587:   "reason"            : finding_code       ; text
L6588: }
L6589: ```
L6590: 
L6591: Sort key:
L6592: 
L6593: \[
L6594: SortKey(VR) = CanonicalCBOR(VerificationRequest)
L6595: \]
L6596: 
L6597: Regras:
L6598: - Todos os conjuntos podem ser vazios exceto se a policy exigir o contrário.
L6599: - `reason` é um `finding_code` (text_id).
L6600: 
```

## Fonte L14159–L14362

```text
L14159: ## 1. `CompositionClosure` — base e fronteira explícitas
L14160: 
L14161: A pesquisa confirma que a construção determinística de um closure requer não apenas um universo finito, mas também uma **base de avaliação explícita**. O teorema de Knaster-Tarski garante que "every monotone function on a complete lattice has the least fixed point", mas a existência do ponto fixo depende de o operador ser monótono e o universo ser finito e determinístico.
L14162: 
L14163: A definição correta é:
L14164: 
L14165: \[
L14166: \boxed{
L14167: CompositionClosure(I,B,F,R,P)
L14168: }
L14169: \]
L14170: 
L14171: onde:
L14172: 
L14173: - \(I\) = candidate intent;
L14174: - \(B\) = deterministic evaluation base / `CommonAncestorFrontier`;
L14175: - \(F\) = target `BranchFrontier`;
L14176: - \(R\) = applicable verification records;
L14177: - \(P\) = immutable policy reference.
L14178: 
L14179: E o universo finito:
L14180: 
L14181: \[
L14182: U(I,B,F) = \{I\} \cup DependencyClosure(I) \cup BranchInterval(B,F) \cup DependencyClosure(BranchInterval(B,F))
L14183: \]
L14184: 
L14185: **Regra de ambiguidade:**
L14186: 
L14187: \[
L14188: AmbiguousBase \Rightarrow NoCompositionClosure
L14189: \]
L14190: 
L14191: Isto encaixa diretamente com a regra já existente para common ancestor ambíguo. Duas avaliações do mesmo intent contra o mesmo frontier, mas partindo de bases diferentes, **não são a mesma avaliação**.
L14192: 
L14193: ---
L14194: 
L14195: ## 2. `SemanticDependency` — dependência normativa explícita
L14196: 
L14197: A pesquisa confirma que, sem uma definição normativa, `SemanticDependency` permite que implementações Rust e Python construam closures diferentes. A solução é restringir a dependências já assinadas:
L14198: 
L14199: \[
L14200: SemanticDependency(Y,C) \iff \exists X \in C: ExplicitSemanticDependency(Y,X)
L14201: \]
L14202: 
L14203: onde `ExplicitSemanticDependency` deriva **somente de**:
L14204: 
L14205: - `IntentCore.dependencies`;
L14206: - dependencies expressas pelas claims conforme RFC-0001;
L14207: - edges normativas já presentes no `BranchIntegrationState`.
L14208: 
L14209: \[
L14210: \boxed{
L14211: NoImplicitSemanticDependencyInference
L14212: }
L14213: \]
L14214: 
L14215: Qualquer dependência não capturada explicitamente continua protegida pela outra metade do operador:
L14216: 
L14217: \[
L14218: \neg ProvablyCompositionIndependent \Rightarrow Include
L14219: \]
L14220: 
L14221: ---
L14222: 
L14223: ## 3. Definição final do fixpoint
L14224: 
L14225: \[
L14226: C_0 = \{I\} \cup DependencyClosure(I)
L14227: \]
L14228: 
L14229: \[
L14230: U = U(I,B,F)
L14231: \]
L14232: 
L14233: \[
L14234: C_{n+1} = C_n \cup \{Y \in U \setminus C_n \mid ExplicitSemanticDependency(Y,C_n) \lor \neg ProvablyCompositionIndependent(Y,C_n,R,P)\}
L14235: \]
L14236: 
L14237: até:
L14238: 
L14239: \[
L14240: C_{n+1} = C_n
L14241: \]
L14242: 
L14243: A pesquisa confirma que, em reticulados finitos, "the least fixed point can be obtained by applying the operators in any order until convergence". Como \(U\) é finito e a iteração só adiciona elementos, termina deterministicamente em no máximo \(|U|\) expansões.
L14244: 
L14245: ---
L14246: 
L14247: ## 4. Independência set-wise
L14248: 
L14249: \[
L14250: ProvablyCompositionIndependent(Y,C,R,P) \iff \forall X \in C: CertifiedIndependent(Y,X,R,P)
L14251: \]
L14252: 
L14253: Para a PoC, restringir `CertifiedIndependent` principalmente ao caso estrutural com footprints sound:
L14254: 
L14255: \[
L14256: W(Y) \cap (R(X) \cup W(X)) = \varnothing
L14257: \]
L14258: 
L14259: \[
L14260: W(X) \cap (R(Y) \cup W(Y)) = \varnothing
L14261: \]
L14262: 
L14263: com:
L14264: 
L14265: \[
L14266: Coverage \in \{Complete, SoundConservative\}
L14267: \]
L14268: 
L14269: A pesquisa confirma que a condição de disjunção de read/write sets é a condição clássica de não-interferência entre transições. `Partial` nunca prova independência, porque a ausência de um conjunto não significa ausência de acesso.
L14270: 
L14271: ---
L14272: 
L14273: ## 5. `StrongStateCommutation` — quantificação universal
L14274: 
L14275: A definição:
L14276: 
L14277: \[
L14278: StrongStateCommutes(A,B,D) \iff \forall s \in D: B(A(s)) = A(B(s))
L14279: \]
L14280: 
L14281: com \(D\) sendo todos os prefix-states admissíveis em que A e B podem aparecer adjacentes, resolve o problema original de testar apenas `S_base`.
L14282: 
L14283: A pesquisa confirma que a teoria de congruência contextual (Morris) exige quantificação sobre **todos os contextos**, não apenas o contexto corrente. "Two programs are observationally equivalent if for every program context \(C\)". Aplicando ao Arkhe:
L14284: 
L14285: \[
L14286: Obs_p(A(B(s))) = Obs_p(B(A(s)))
L14287: \]
L14288: 
L14289: é equivalência observacional imediata — não é congruência. A definição correta quantifica sobre todos os prefix-states admissíveis.
L14290: 
L14291: E a regra:
L14292: 
L14293: \[
L14294: NoCanonicalStateProfile \Rightarrow StrongStateCommutationUnavailable
L14295: \]
L14296: 
L14297: fecha o risco de cada implementação inventar o que significa "full state".
L14298: 
L14299: ---
L14300: 
L14301: ## 6. Teorema de composição — forma normativa
L14302: 
L14303: Se:
L14304: 
L14305: 1. `CompositionClosure` é construído pelo algoritmo determinístico acima;
L14306: 2. todo par incomparável no poset resultante possui EvidenceResolution ou é tornado comparável por ExplicitOrdering;
L14307: 3. todo `StrongStateCommutationCertificate` vale para **todos os admissible prefix-states**;
L14308: 4. structural certificates têm cobertura sound;
L14309: 5. o ordering graph é acíclico;
L14310: 
L14311: então:
L14312: 
L14313: \[
L14314: \boxed{
L14315: CompositionValid(C,P) \Rightarrow \forall L_1,L_2 \in AllowedLinearizations(C,P): CanonicalState(L_1) = CanonicalState(L_2)
L14316: }
L14317: \]
L14318: 
L14319: para o profile PoC.
L14320: 
L14321: A pesquisa confirma que "any two linear extensions of a poset are related by a sequence of adjacent transpositions". Como cada swap preserva o estado canónico (por certificado), a igualdade segue por indução.
L14322: 
L14323: ---
L14324: 
L14325: ## 7. Separação `Proof ≠ Constraint`
L14326: 
L14327: A pesquisa confirma que `ExplicitOrdering` não prova composição — **reduz o conjunto de linearizações admissíveis**. A distinção correta é:
L14328: 
L14329: | Tipo | Classe | Efeito |
L14330: |---|---|---|
L14331: | `StructuralIndependenceCertificate` | evidence | Prova independência |
L14332: | `StrongStateCommutationCertificate` | evidence | Prova comutação |
L14333: | `ExplicitOrderingEdge` | constraint | Reduz linearizações admissíveis |
L14334: 
L14335: A edge deve ainda ser autenticada, incluída no `BranchIntegrationState`, acíclica, vinculada aos exact intent digests, e considerada na recomputação de linear extensions.
L14336: 
L14337: Uma edge que cria ciclo:
L14338: 
L14339: \[
L14340: Cycle(OrderingGraph) \Rightarrow REJECT
L14341: \]
L14342: 
L14343: ---
L14344: 
L14345: ## 8. Patch normativo final — M6 fechado
L14346: 
L14347: | Regra | Norma PoC |
L14348: |---|---|
L14349: | `INT-COMM-0` | `CompositionValid MUST evaluate CompositionClosure(I,B,F,R,P)` |
L14350: | `INT-COMM-0A` | RFC-0001 `SAFE MUST NOT alone prune CompositionClosure` |
L14351: | `INT-COMM-0B` | `UnknownCompositionDependency ⇒ Include` |
L14352: | `INT-COMM-0C` | `CompositionClosure` MUST be computed over deterministic finite universe `U(I,B,F)` to fixed point |
L14353: | `INT-COMM-1` | Every incomparable pair in closure MUST have evidence resolution or valid explicit ordering |
L14354: | `INT-COMM-2` | `ObservedAgreement ≠ ProductionProof` |
L14355: | `INT-COMM-3` | Strong commutation requires exact canonical state equality for **all admissible prefix-states** |
L14356: | `INT-COMM-4` | Weaker equivalence requires certified congruence under all permitted continuations; deferred v0.2 |
L14357: | `INT-COMM-5` | Structural footprint coverage MUST be `Complete` or sound `Conservative` |
L14358: | `INT-COMM-6` | Relevant context/premise change invalidates inherited composition eligibility |
L14359: | `INT-COMM-7` | Bootstrap observed evidence is `NonProduction ∧ NonPromotable` |
L14360: | `INT-COMM-8` | Explicit ordering is a constraint, MUST be acyclic and digest-bound; it is not CompositionEvidence |
L14361: | `INT-COMM-0D` | `AmbiguousBase ⇒ NoCompositionClosure` |
L14362: | `INT-COMM-0E` | `NoImplicitSemanticDependencyInference` |
```

## Fonte L17356–L17409

```text
L17356: # ARKHE MULTI-FORMAT ARCHITECTURE v1.0 — FROZEN (corrigido)
L17357: 
L17358: ## 1. Identidade: dois invariantes, não um
L17359: 
L17360: O invariante anterior confundia bytes canónicos com identidade criptográfica. Correção:
L17361: 
L17362: \[
L17363: \boxed{
L17364: CanonicalBytes(x) = AKGCBORv1(WireProjection_{v1}(x))
L17365: }
L17366: \]
L17367: 
L17368: \[
L17369: \boxed{
L17370: ObjectDigest(x) = H(DomainObject \parallel CanonicalBytes(UnsignedProjection(x)))
L17371: }
L17372: \]
L17373: 
L17374: Isto alinha a arquitetura multi-formato com B.0/M12. `SameCanonicalBytes` é propriedade diferente de `SameObjectDigest`, e objetos semanticamente distintos não partilham domínio criptográfico por semelhança estrutural.
L17375: 
L17376: ---
L17377: 
L17378: ## 2. Autoridade: separar decisão local de custódia de chave
L17379: 
L17380: \[
L17381: \boxed{
L17382: StateTransitionEnforcementAuthority \subseteq NativeCore
L17383: }
L17384: \]
L17385: 
L17386: mas:
L17387: 
L17388: \[
L17389: \boxed{
L17390: SigningAuthority, RootAuthority \not\subseteq NativeCore
L17391: }
L17392: \]
L17393: 
L17394: Elas residem em HSM/KMS/threshold authorities. A prática de separar key management roles de cryptographic operation roles é consolidada. Isto evita que root keys sejam implementadas no daemon por inferência de "NativeCore = authority".
L17395: 
L17396: ---
L17397: 
L17398: ## 3. TCB final
L17399: 
L17400: | Componente | TCB | Autoridade |
L17401: |---|---:|---|
L17402: | `arkhe-core` nativo | Sim | StateTransitionEnforcement |
L17403: | signer/HSM/root authority | Sim (externo) | Attestation / authorization |
L17404: | `arkhe-verify.wasm` | Não necessariamente | Read-only verification |
L17405: | AKG-CBOR-v1 | protocolo, não processo | Define identidade |
L17406: | Evidence producers | Não | Produzem claims/evidence |
L17407: | GGUF/safetensors/C2PA | Não | Payload |
L17408: | Tauri/web/CLI | Não | Interface |
L17409: 
```

## Fonte L18379–L18461

```text
L18379: ## 1. Correções incorporadas
L18380: 
L18381: ### 1.1 WASM e autoridade de contenção
L18382: 
L18383: A formulação correta é:
L18384: 
L18385: \[
L18386: WASMModule \not\Rightarrow EnforcementAuthority
L18387: \]
L18388: 
L18389: WASM pode executar dentro de um TEE ou receber capabilities de hardware via host. O que **não possui por si só** é autoridade sobre a proveniência dos inputs, recursos ou estado externo.
L18390: 
L18391: \[
L18392: WASMIsolation \neq TrustedInputProvenance
L18393: \]
L18394: 
L18395: \[
L18396: VerifierIntegrity \neq HostIntegrity
L18397: \]
L18398: 
L18399: ### 1.2 Remoção do argumento de benchmark
L18400: 
L18401: O kernel é nativo por **authority boundary, host integration, key custody e containment**, não porque uma faixa de benchmark específica provaria impossibilidade de WASM. O desempenho depende de runtime, workload, JIT/AOT, SIMD, host calls e crypto implementation.
L18402: 
L18403: ### 1.3 Remoção da claim sobre side-channels
L18404: 
L18405: Código nativo dentro de TEE também pode sofrer side channels. Não existe garantia universal. A decisão por Native Core mantém-se; a justificativa excessiva é removida.
L18406: 
L18407: ### 1.4 Paridade cross-implementation
L18408: 
L18409: A formulação correta é:
L18410: 
L18411: \[
L18412: WASM \Rightarrow PortableExecution
L18413: \]
L18414: 
L18415: \[
L18416: Spec + GoldenVectors \Rightarrow ParityTestable
L18417: \]
L18418: 
L18419: Duas implementações independentes podem nem sequer produzir o mesmo WASM; o que precisam reproduzir são os **outputs normativos**.
L18420: 
L18421: \[
L18422: ImplementationParity \text{ is demonstrated, not inherited from WASM}
L18423: \]
L18424: 
L18425: ### 1.5 EvidenceBundle em GGUF
L18426: 
L18427: Até haver uma projection normativa que exclua a evidence section do subject digest, o correto é:
L18428: 
L18429: \[
L18430: ModelArtifact \leftrightarrow ArtifactEnvelope \leftrightarrow EvidenceBundle
L18431: \]
L18432: 
L18433: por referências content-addressed.
L18434: 
L18435: \[
L18436: Portable \neq Embedded
L18437: \]
L18438: 
L18439: ### 1.6 B.1/B.2 e novidade histórica
L18440: 
L18441: \[
L18442: B.1/B.2 \Rightarrow ProtocolConformanceEvidence
L18443: \]
L18444: 
L18445: mas não:
L18446: 
L18447: \[
L18448: B.1/B.2 \Rightarrow HistoricalNovelty
L18449: \]
L18450: 
L18451: O termo **CFC** pode ser usado como **classe arquitetural proposta por Arkhe** imediatamente. “Primeiro”, “inaugura”, “nenhum sistema existente” exige pesquisa de anterioridade muito mais ampla.
L18452: 
L18453: ### 1.7 Melhoria semântica
L18454: 
L18455: > “The WASM verifier **independently recomputes verification**.”
L18456: 
L18457: \[
L18458: Verify_{WASM}(NormativeInputs) = Verify_{Reference}(NormativeInputs)
L18459: \]
L18460: 
L18461: sem possuir enforcement authority.
```

## Fonte L18924–L18943

```text
L18924: **Porque o núcleo fiduciário tem de ser nativo:** A pesquisa confirma que o WASM introduz um overhead significativo — entre 2.32× e 4× de slowdown em relação a código nativo. Num sistema que executa verificação criptográfica em cada operação trust-critical (digests, assinaturas Ed25519/ML-DSA, provas de inclusão MMR), este overhead é inaceitável para o enforcement boundary. Além disso, o WASM executado dentro de um TEE "leaks most IR instructions with high accuracy, revealing the confidential code", enquanto a execução nativa "resists even the most powerful side-channel attacks". O núcleo fiduciário precisa de acesso direto a chaves, TEE, filesystem e hardware — o WASM não oferece isto.
L18925: 
L18926: **Porque o WASM é o verificador portátil:** O WASM oferece isolamento forte e é a única forma de permitir que terceiros verifiquem evidência sem instalar o kernel. O projeto AVAR demonstra paridade bit-for-bit entre o verificador WASM e a implementação de referência em JS, com "same canonical JSON, same hash chain, same Ed25519 verification". Isto é o que torna a verificação independente possível.
L18927: 
L18928: **Porque AKG-CBOR-v1 é o formato mais importante:** O runtime pode mudar (Rust → WASM → futuro), mas a identidade dos objetos tem de permanecer estável. É o CBOR canónico que permite content-addressing, assinaturas, WormGraph, MMR, portable evidence e golden vectors. Sem ele, não há paridade cross-implementation.
L18929: 
L18930: ---
L18931: 
L18932: ## A Lacuna: Confirmada pela Pesquisa
L18933: 
L18934: A pesquisa confirma que **nenhuma classe existente combina** as propriedades do Arkhe:
L18935: 
L18936: | Projeto | O que faz | O que falta |
L18937: |:---|:---|:---|
L18938: | **Anoma** | Intent machine com coalgebra, Anoma Resource Machine, rede de solvers | Não verifica criptograficamente a execução do solver. A intenção é declarada, mas não há garantia fail-closed de que o resultado é conforme. |
L18939: | **Tetcore** | Execução determinística com integer-only arithmetic, sem clock, bounded memory | Não verifica identidade do agente, proveniência do modelo, ou autorização da ação. É um runtime, não um fiduciário. |
L18940: | **Sovereign Execution Fabric** | Governance soberana sobre execução, capability attenuation, auditable replay | É um documento conceptual de 4 linhas. Não tem implementação, especificação ou golden vectors. |
L18941: | **Arkhe OS** | Pipeline de verificação GGUF de quatro gates, fail-closed, com CVEs documentados | É um componente de verificação de modelos, não uma camada de execução universal. |
L18942: 
L18943: A lacuna é real: **não existe uma camada de fideicomisso computacional que una orquestração, verificação e soberania num único tecido verificável.**
```

## Fonte L19092–L19142

```text
L19092: ## 1. WASM no browser: viável, com nuances
L19093: 
L19094: O documento afirma que Ed25519 em WASM é maduro e ML-DSA é pesado. A pesquisa confirma ambos, com dados concretos:
L19095: 
L19096: | Algoritmo | Implementação | Sign 128B | Verify 128B | Fonte |
L19097: |---|---|---|---|---|
L19098: | **Ed25519** | `rust-ed25519-wasm` (lib25519) | **15.1 µs** | **49.1 µs** |  |
L19099: | Ed25519 | libsodium wasm | 21.4 µs | 53.1 µs |  |
L19100: | ECDSA-P256 | RustCrypto `p256` | 245 µs | 277 µs |  |
L19101: | **ML-DSA-44** | Zig std wasm | **135.5 µs** | **23.3 µs** |  |
L19102: | ML-DSA-44 | RustCrypto `ml-dsa` | 706 µs | 91.7 µs |  |
L19103: | RSA-2048 | RustCrypto `rsa` | 3.21 ms | 171 µs |  |
L19104: 
L19105: **Leitura:** Ed25519 em WASM é **rápido o suficiente para verificação em tempo real** (49 µs por verificação). ML-DSA é **viável mas mais lento** — a implementação Zig std é 8.9× mais lenta na assinatura, mas **2.1× mais rápida na verificação** que Ed25519. Isto significa que, para verificação (o caso de uso principal do Arkhe), ML-DSA em WASM é **aceitável**. Para assinatura, é mais pesado, mas ainda dentro de limites utilizáveis.
L19106: 
L19107: **Conclusão:** a verificação WASM no browser é tecnicamente sólida. O `@tokamak-zk-evm/verify-wasm-bundler` demonstra que funciona em Chrome 57+, Firefox 52+, Safari 11+, sem servidor, com verificação em 3-5 segundos. O padrão existe e é replicável.
L19108: 
L19109: ---
L19110: 
L19111: ## 2. Tauri: sandbox de plugins WASM ainda é roadmap
L19112: 
L19113: O documento afirma que Tauri permite "plugins WASM sandboxed com permissões configuráveis". A pesquisa mostra que **isto ainda não está implementado em produção**:
L19114: 
L19115: > "O `@tauron/dual-world` tem um sandbox in-process que é uma **simulação fail-closed** (`SANDBOX_UNAVAILABLE`); o runtime WASM in-process ainda é um item de roadmap."
L19116: 
L19117: O Tauri 2 tem um modelo de segurança maduro — deny-by-default, ACLs, capabilities scoped — mas **não executa plugins WASM em sandbox por omissão**. Código executado por plugins ou pelo core da aplicação tem **acesso completo a todos os recursos do sistema, sem restrições**.
L19118: 
L19119: **Conclusão:** o Tauri é adequado para o **kernel completo** (onde o próprio binário é o fiduciário), mas não para **carregar código não confiável em sandbox**. Para isso, o WASM tem de ser o veículo, não o Tauri.
L19120: 
L19121: ---
L19122: 
L19123: ## 3. GGUF: pipeline de verificação de quatro gates já especificado
L19124: 
L19125: O documento descreve um pipeline de quatro gates para GGUF. A pesquisa confirma que **este pipeline existe e está publicado**:
L19126: 
L19127: O paper "Specify, Don't Simulate: A Fail-Closed Four-Gate Verification Pipeline for Verifiable GGUF Model Artifacts in the Arkhe OS Trust Layer" (Zenodo, Setembro 2026) especifica:
L19128: 
L19129: | Gate | Função |
L19130: |---|---|
L19131: | **Gate 0** | Sanitização de metadata contra CVE-2026-65315 (Ollama) e CVE-2025-53630 (llama.cpp) |
L19132: | **Gate 1** | Verificação de digests duplos SHA-256/BLAKE3 |
L19133: | **Gate 2** | Verificação de assinaturas Sigstore keyless sobre manifesto in-toto Statement v1 |
L19134: | **Gate 3** | Verificação de provas de inclusão RFC 6962 + quórum de witness (≥2 cosignatários de checkpoint) |
L19135: 
L19136: O paper inclui ainda: schema v1.3 com source block para hashes pré-extensão, localização de manifesto externo, campos de atestação CVE, e revogação Safenet-enforced.
L19137: 
L19138: **Conclusão:** o GGUF é o formato de modelo **já especificado** para o Arkhe. Não é uma proposta; é um pipeline definido com CVEs reais, testes negativos, e requisitos de quórum.
L19139: 
L19140: ---
L19141: 
L19142: ## 4. Safetensors: alternativa para treino e intercâmbio
```
