# Elementos restantes — execução por critérios de aceitação

28/10/2026: primeiro [vínculo opcional de rascunho Intra → kernel](INTRA-NATIVE-DRAFTS.md)
implementado com outbox local, adaptador Rust, conferência de bytes e reconciliação
idempotente. A [campanha de qualidade](PRODUCT-QUALITY-2026-10-28.md) validou a
ponte no navegador com PostgreSQL real, reinício e replay concorrente. É um
registro `DraftDocument`; a jornada protegida completa permanece pendente.

Atualização de 26/10/2026: [pesquisa verificada e roadmap revisado](RESEARCH-ROADMAP-2026-10-26.md).
O novo [envelope local para WER](EVIDENCE-ENVELOPE.md) acrescenta assinatura e MMR
ao retrieval opt-in; o backend GGUF estrito ainda exige aceite com modelo real.
Os lotes e evidências anteriores abaixo preservam suas datas e escopos.

Origem: auditoria de 19/10/2026, com 15 achados. O registro detalhado, prioridades,
dependências e próximos passos estão em `config/implementation-backlog.json`.
Esse registro acompanha trabalho; não concede autoridade e não sela um runtime.

## Primeiro lote implementado

- A02: `verify_artifact` v0.2 não retorna `valid: true` para hashing ou
  canonicalização. Retorna operação, status e os limites de verificação explícitos.
  O campo `valid` foi removido: consumidores antigos precisam migrar.
- Nova ferramenta MCP `verify_mmr`: usa o WASM real, confere a estrutura do caminho
  contra a contagem de folhas e verifica inclusão relativa à raiz fornecida.
  Não autentica o checkpoint nem concede autorização.
- A04: removida a declaração contraditória de congelamento global do design.
  Inventário atual gerado em `docs/ARCHITECTURE-CURRENT.md` e registro de escopo
  em `config/capability-status.json`.
- Backlog rastreável dos 15 achados, sem criar crates vazias ou declarar capacidade
  apenas pela presença de arquivos. A02 permanece mitigado no contrato; assinatura
  C2PA e proveniência completa continuam fora do escopo implementado.

Validação do adaptador: 9 testes PASS, incluindo 20 provas MMR versionadas,
transporte MCP real, entradas malformadas, assinatura fictícia sem alegação de
verificação e adulteração de folha/raiz/prova. Build TypeScript e auditoria
arquitetural passaram. O build local foi feito com o compilador já instalado:

```powershell
node integrations/verify-mcp/node_modules/typescript/bin/tsc -p integrations/verify-mcp/tsconfig.json
node --test integrations/verify-mcp/tests/*.test.mjs
python scripts/check_architecture.py
```

## Segundo lote implementado

A05 avançou para PARTIAL: `self_model.rs` calcula Brier/ECE históricos com
vínculos entre previsão, resultado e evidência. `assess` deixou de emitir
confiança/cobertura fixas; os campos agora são opcionais. Dez testes sintéticos
validam métricas, determinismo e rejeição de adulterações. O contrato está em
`docs/METACOGNITION-CALIBRATION.md`.

Ainda faltam ingestão autenticada no host, avaliação com dados reais e controle
da seleção das amostras. Simulação causal e RSI geral continuam não demonstrados.
O achado original A05 permanece como registro histórico da auditoria; seu estado
e os campos de implementação descrevem o avanço posterior.

Os três materiais institucionais fornecidos foram tratados como referências de
visão. Não conferem prova de implementação, aprovação de implantação, parceria,
licença ou preço. Este lote não altera esses compromissos.

## Sequência de trabalho

| Frente | Achados | Próxima entrega verificável |
| --- | --- | --- |
| Contenção | A01 | Cobertura dinâmica Seccomp e revisão da cadeia herdada concluídas; 22/22 observações na mesma tupla com limpeza. Próximo: revisão semântica independente, admissão explícita e matriz por runtime/perfil/imagem |
| Jornada fiduciária | A03, A09, A10 | Uma jornada do Intra vinculada à admissão nativa, journal e evidência persistida; testes de tenant, parâmetros, replay e reinício |
| Verificação | A02, A04 | Evoluir perfis de assinatura/checkpoint com trust roots e testes próprios; nenhum congelamento global por inferência |
| Cognição | A05, A06 | Calibração histórica, recuperação e comprovação de fontes; avaliações independentes com baseline e regressão |
| Orquestração | A07 | Fila exigida pela jornada escolhida, enqueue atômico, leases, retries, DLQ e recuperação de falha |
| Identidade e custódia | A08 | Perfil concreto de chaves, rotação e revogação; HSM/TEE/ML-DSA só após implementação e prova |
| CI e implantação | A11, A12 | Pins e receipts remotos; autoridades de imagem e rejeições demonstradas no ambiente selecionado |
| Distribuição | A13 | Máquina limpa, instalação, restauração, atualização/rollback e identidade de editor |
| Escala | A14 | Infraestrutura escolhida por carga medida e ensaios de falha, sem transformar a visão inteira em pré-requisito local |
| Comercial | A15 | Decisão de licença, textos aplicáveis e custos medidos; nenhuma alteração automática de direitos ou cobrança |

## Limites mantidos

O ensaio nativo de contenção de 2026-10-20 completou 22/22 vetores, com
limpeza confirmada e cobertura Seccomp de 360/360 regras. A evidência está em
`docs/evidence/2026-10-20T134143Z-unified-dynamic-trial5/unified-results.json`.
Isso não altera `runtime_verified=false`: revisão semântica independente,
admissão explícita e matriz por runtime/perfil/imagem continuam pendentes.

O perfil documental local do Intra continua separado da admissão WormGraph.
Geração/canonicalização não é prova de assinatura, existência de uma citação não
é grounding e um benchmark de programação não demonstra, sozinho, AGI ou RSI geral.
