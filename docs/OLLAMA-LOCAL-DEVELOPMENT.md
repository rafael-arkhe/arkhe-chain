# Desenvolvimento com Ollama local

Configuração conferida em 2026-10-19. Usar o adaptador existente
`integration/arkhe-ollama`, não criar transporte HTTP dentro das crates cognitivas.
O SDK cognitivo continua sem chaves ou autoridade de execução.

## Configuração vigente

`config/ollama.json` define a origem `http://127.0.0.1:11434`, modelo
`north-mini-code-1.0:latest` e digest
`d8b269ad5c7c7144ce104b83ce93bc3efb85e0f74e01be6be5f5d6f7ca90b60f`.
O cliente usa a API nativa `/api/chat`; não acrescentar `/v1` à origem desse
arquivo. Variáveis genéricas LLM_PROVIDER, OPENAI_API_BASE e LLM_MODEL_CODE não
substituem a configuração explicitamente consumida pelo adaptador atual.

```powershell
python scripts/ollama.py status
python scripts/ollama.py chat "Explique a fronteira de autoridade do Arkhe."
```

Intra chama o executável Rust por `apps/arkhe-intra/lib/ollama.mjs`. A triagem
usa `OllamaAnalyzer`, com validação independente da saída e vínculo do modelo
ao registro candidato. Não foi demonstrado que todos os módulos cognitivos
fazem inferência HTTP nem que todas as ferramentas externas de desenvolvimento
obedecem a essa configuração. Este arquivo não muda o provedor do aplicativo
Codex nem suas condições de cobrança.

## Contratos de segurança

- O cliente rejeita origens externas, redirects, proxies, modelos cloud conhecidos,
  metadados remotos e mudança observável de digest antes/depois da inferência.
  Loopback sozinho não impede encaminhamento externo pelo daemon.
- A API nativa recebe um objeto JSON Schema em `format`; a API compatível usa
  `response_format`. Solicitar `format: "json"` apenas não valida o contrato.
  O consumidor precisa analisar e validar a resposta, inclusive semanticamente.
- Separadores com nonce são formatação, não defesa criptográfica contra injeção.
- O digest de catálogo não é atestação atômica dos pesos GGUF executados.
- Não habilitar fallback remoto, baixar modelos ou trocar versões silenciosamente.
  Outro modelo requer avaliação e revisão dos bindings de worker/governança.
- Registro candidato e saída estruturada não concedem autorização nem escrita
  direta no WormGraph. Atestação, admissão, política e journal permanecem etapas
  separadas. Um teste determinístico isolado não substitui esses requisitos.

## Separação de C01

O kit E01/C01 verifica provas MMR, sem LLM. Não instalar Ollama ou incorporar
pesos no snapshot S0 dessa coorte: isso mudaria o ambiente de ensaio. Avaliação
offline de inferência deve ter ambiente, inventário, critérios e evidências
próprios. ONB02/ONB03 não transitam ao preencher parâmetros de modelo.

Inferência local pode evitar tarifas de API nos caminhos que a usam; hardware,
energia e manutenção continuam tendo custo. Não afirmar custo total zero.
Nenhuma alteração do Cargo.lock, perfil MMR, fixtures ou kit decorre desta nota.

## Verificação

```powershell
cargo test -p arkhe-ollama -p arkhe-bugbounty --test client --test ollama --locked
```

São testes com servidor HTTP de fixture. Status do provedor real e inferência
real são verificações distintas; status saudável não demonstra qualidade,
execução de uma geração ou aprovação de governança.

Referências: https://docs.ollama.com/capabilities/structured-outputs e
https://docs.ollama.com/api/openai-compatibility .
