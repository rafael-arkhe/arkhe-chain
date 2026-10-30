# arkhe-gov — PoC de evidência offline

O governo emite. O Arkhe verifica a evidência. O cidadão apresenta a prova. O auditor verifica o pacote offline.

Esta implementação demonstra inclusão e integridade de evidência sintética. Não implementa leitura do formato oficial CIN/VIO, validação de identidade governamental, SD-JWT, MOSIP, revogação, prova de humanidade ou certificação de conformidade.

## Executar

Na raiz D:/arkhe:

```powershell
python scripts/gov_poc.py
```

O comando confere a reprodução determinística das fixtures, executa cargo test, gera os builds WASM Node e browser e verifica quatro payloads sem I/O de rede durante a verificação. Se o WASM já foi compilado, use --skip-build. As evidências ficam em docs/evidence/gov/2026-10-21.

O QR contém apenas um payload de teste explicitamente identificado como ARKHE-SYNTHETIC-CIN-NOT-VIO. Os SVGs são QR Codes reais desse texto, não réplicas de documento oficial. A PoC testa os bytes do payload; não inclui câmera nem teste de decodificação óptica do SVG.

## Fluxo e confiança

1. Quatro payloads sintéticos geram commitments BLAKE3 com domínio AKG:GOV:SYNTHETIC-CREDENTIAL:v1.
2. Uma folha de evidência com domínio distinto vincula cada commitment ao perfil sintético. Nenhum documento real, número de identidade, biometria ou identificador de titular é usado.
3. O perfil arkhe-mmr/v1 existente produz a raiz e as provas de duas etapas. Não há outro algoritmo MMR específico de governo.
4. Um checkpoint assinado vincula raiz e quantidade de folhas ao domínio exclusivo desta PoC. O verificador recebe a chave confiável separadamente do pacote e exige a posição da folha e o formato exato da árvore de quatro folhas.
5. verify_gov_synthetic no arkhe-verify.wasm verifica commitment, assinatura e inclusão. Os testes Node e browser usam bytes locais e proíbem APIs de rede durante a verificação.
6. Um checkpoint CBOR compatível com o harness B0 pode ser ancorado no Besu local. Esse checkpoint e a assinatura sintética são objetos distintos, ligados à mesma raiz. O recibo B0 não transforma a fixture em credencial emitida pelo governo.

A chave de teste deriva da seed pública [71;32], exposta no exemplo Rust. Ela não é um segredo e não pode autenticar credenciais reais. Quem possui a seed pode criar outra fixture válida. O trust file é um pin de teste, não uma lista de emissores governamentais. Em produção, raízes de confiança precisam de provisionamento e validação próprios.

O crate puro existente arkhe-verify-core contém gov.rs; o adapter WASM apenas expõe essa implementação. Não foram criados workspaces, bancos ou nove crates especulativos. A evidência não é admitida no WormGraph por esta PoC: inclusão, persistência, autorização e identidade são verificações distintas.

## Testes negativos

- Um byte alterado no payload não corresponde ao commitment.
- A prova da primeira credencial falha para a segunda.
- Raiz alterada, assinatura inválida e chave de confiança incorreta são rejeitadas.
- Posição de folha, quantidade de folhas e prova malformada são rejeitadas.

Replay entre credenciais diferentes é coberto. Reapresentar a mesma prova para a mesma credencial continua válido: prevenção de replay de sessão requer nonce/audience/purpose e estado separado. Verificação offline tampouco comprova revogação atual, presença física, titularidade ou frescor.

## Besu local

```powershell
podman machine start arkhe-runtime
python scripts/besu_b0.py up
python scripts/besu_b0.py anchor --checkpoint integration/arkhe-gov/fixtures/besu-checkpoint.json
```

Somente rede local de quatro validadores QBFT; usa wallet e ferramentas de teste existentes em ops/local. A PoC reutiliza o contrato AnchorRegistry e preserva chaves/volumes existentes. O harness fixa ethers/solc em ops/local/besu-tools. A resolução foi corrigida para não carregar o solc diferente instalado na raiz.

A consulta à cadeia ocorre na fase de ancoragem, não na verificação offline. O recibo contém endereço do contrato, transação e bloco. Verificação da finalização QBFT offline e vinculação criptográfica a uma rede governamental não são implementadas. Ao terminar, os containers locais podem ser parados com python scripts/besu_b0.py stop; não remover volumes para encerrar uma sessão.

## Maturidade

| Item | Evidência / limite |
|---|---|
| Inclusão MMR e assinatura offline | Testadas em Rust e WASM; perfil sintético de quatro folhas |
| Folha adulterada e replay entre credenciais | Rejeitados por testes executados |
| QR Code | Quatro SVGs gerados com qrcode 8.2; encoding sintético, sem teste óptico |
| Besu B0 | Estado e transação desta execução em docs/evidence/gov/2026-10-21/besu-anchor.json, se presente |
| Integração CIN/VIO | Pendente: obter especificação e material de teste autorizados |
| MOSIP, EUDI e W3C VC | Pendente; nenhum verificador desses standards é anunciado |
| WormGraph, Rekor e autorização de agente | Não integrados por esta PoC |
| Conformidade regulatória | Não demonstrada por inclusão/assinatura ou ancoragem |

O resultado pode ser chamado de LEMMA apenas para a proposição estreita de que estes bytes sintéticos correspondem a uma folha da raiz fixada e assinada por chave de teste. Não se promove arkhe-gov inteiro a conformidade ou verificação de CIN real.

## Correções ao texto de origem

- Uma prova MMR demonstra inclusão em uma raiz; não valida assinatura, origem, expiração, revogação ou semântica da credencial. Evidência de uma verificação real exige resultado de verificador reconhecido e identidade verificável de quem atestou esse resultado.
- subject_digest determinístico não equivale a anonimização. Identificadores previsíveis podem ser enumerados e commitments estáveis permitem correlação. Esta PoC omite o titular; um desenho real deve considerar salt/commitment por contexto, acesso e minimização.
- Registrar kill-switch não demonstra que o processo terminou ou perdeu credenciais. Exigir confirmação independente do executor e observação dos efeitos; o ContainmentGate não é um mecanismo de terminação.
- Uma prova zero-knowledge não garante humanidade ou unicidade por si só: depende da afirmação provada, emissor e mecanismo de unicidade.
- MOSIP não deve ser descrito como sistema que nunca armazena dados sensíveis: sua documentação descreve armazenamento criptografado de biometria, dados demográficos e documentos. [MOSIP Data Protection](https://docs.mosip.io/1.2.0/readme/principles/privacy-and-security/data-protection).
- O requisito de seis meses para logs sob controle de providers de sistemas de alto risco aparece no Art. 19, com ressalvas legais, e não como regra universal de retenção no Art. 12. Há também disposições para deployers. Não inferir certificação ou data única de aplicação sem classificar caso e consultar o texto vigente. [AI Act consolidado em 27/07/2026](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02024R1689-20260727).
- Esta PoC não assume que a infraestrutura da CIN seja Besu ou Fabric. O Besu utilizado é uma rede de laboratório do Arkhe. Estatísticas de mercado e calendários EUDI do texto não foram usados como requisitos de implementação nem validados nesta entrega.

## Ciclo seguinte: contratos, validade e campanha adversarial

[Contratos dos bridges e estado de liberação](BRIDGE-CONTRACTS.md) descrevem os perfis ICP-Brasil/CIN, verificação de expiração e status assinado, promoção TEE bloqueada, proposta Rekor sem publicação e campanha diferencial com o WorkerVerifier real. O campo revocationOrFreshness=NOT_PERFORMED continua se referindo à verificação governamental nativa; syntheticLifecycleVerification registra separadamente os controles de recibo demonstrados.
