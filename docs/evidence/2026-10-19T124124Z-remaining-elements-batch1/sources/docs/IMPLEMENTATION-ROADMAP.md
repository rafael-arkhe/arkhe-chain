# Elementos restantes — execução por critérios de aceitação

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

## Sequência de trabalho

| Frente | Achados | Próxima entrega verificável |
| --- | --- | --- |
| Contenção | A01 | Casos dinâmicos Seccomp e revisão da cadeia herdada; depois 22/22 na mesma tupla, com limpeza válida |
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

O último ensaio de contenção tem 18 PASS, 1 UNASSESSED e três vetores não
executados. Este lote não reexecutou esse ensaio, não preencheu suas evidências
pendentes e não alterou `runtime_verified=false`.

O perfil documental local do Intra continua separado da admissão WormGraph.
Geração/canonicalização não é prova de assinatura, existência de uma citação não
é grounding e um benchmark de programação não demonstra, sozinho, AGI ou RSI geral.
