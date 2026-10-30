# Arkhe-Intra — implementação fullstack local

## Entrega

Aplicação `apps/arkhe-intra`, API `/api`, SQLite local separado do kernel,
autenticação e três papéis, fluxo Ed25519, BLAKE3 WASM, auditoria, adaptador
Rekor com reconciliação, laudo imprimível e integração ao provider Rust Ollama.
Registrada na arquitetura e no inventário de portas em loopback:3003.

## Correspondência com o design

| Referência Stitch | Implementação |
|---|---|
| Portal principal home | `/` com métricas e tarefas do banco, hubs e conteúdo real |
| Hub jurídico compliance | `/juridico`, filtro por departamento, busca e biblioteca |
| Visualização e assinatura de minuta | `/documentos/:id`, PKCS#8 importado no navegador |
| Confirmação de assinatura | Mesma rota, resultado da verificação e nova etapa persistida |
| Sucesso pós-ancoragem / recibo | `/recibos/:id`, recibo e detalhes; sem recibo, sem sucesso fictício |
| Verificação forense offline WASM | `/verificar` → `/offline/index.html` |
| Certificado de perícia / laudo A4 (duas referências) | `/certificados/:id`, conferência atual e impressão A4 |
| Extensão da integração Ollama | `/assistente`, execução do provider Rust, sem ferramentas |

As referências demonstravam um tenant com números e verificações fictícios.
A implementação inicia sem conteúdo e exibe somente contagens, assinaturas e
verificações existentes. Não há preenchimento demonstrativo no banco do usuário.
Os testes usam diretórios e contas separados em `%TEMP%`.

## Evidência observada

- Build de produção Next 15.5.28 e TypeScript compilados.
- Fluxo HTTP real do Next: login de três contas, criação, envio, revisão,
  aprovação, SQLite, exportação e conferência. Sem configuração Rekor, a
  publicação foi bloqueada e a aprovação preservada.
- No navegador, formulário criou uma minuta sintética; Web Crypto assinou com
  chave da conta de teste. A API aceitou a assinatura e o documento passou para
  `review`, com dois eventos na trilha (criação e envio).
- O pacote exportado foi carregado no verificador com arquivo de confiança
  independente da evidência. BLAKE3, transição e assinatura retornaram PASS;
  ancoragem e veredito completo retornaram INCONCLUSIVE.
- O cache offline foi preparado, o servidor Next foi desligado e a página foi
  recarregada. A mesma verificação terminou com os mesmos resultados usando o
  WASM e os arquivos em cache. Não houve chamada ao backend.
- Inspeção móvel revelou largura mínima indevida na navegação; corrigida com
  trilha de grid `minmax(0, 1fr)` e sidebar com `min-width: 0`.
  A nova inspeção em viewport de 390×844 reportou largura útil de 375 px e
  `scrollWidth` de 375 px, sem transbordamento da página.
- A interface `/assistente` enviou uma pergunta sintética à API, que executou
  `arkhe-ollama.exe` com o provider Rust e o modelo local fixado. A resposta
  exibida foi exatamente `OLLAMA_INTRA_OK`; o console não registrou erros ou
  avisos. O modelo não recebeu ferramentas nem autoridade de escrita.

Resultados automatizados e códigos reais de saída em [RESULTS.md](RESULTS.md).
Capturas ficam neste diretório; os documentos nelas são sintéticos.

## Limites verificados

Este é um perfil fullstack **local**, com repositório compartilhado entre as
contas cadastradas e persistência SQLite da aplicação. Não implementa SSO,
multitenancy institucional, RLS por tenant ou publicação/deploy remoto.

A cadeia de auditoria local não equivale a WormGraph, raiz externa confiável ou
recibo de admissão. A evidência de documento usa envelope JSON versionado próprio,
sem reivindicar identidade normativa AKG/CBOR.

O adaptador Rekor confere corpo esperado, chave fixada/logID, SET e inclusão
RFC6962. Seus testes usam chave e recibo sintéticos; nenhum log público recebeu
escritas. Não verifica checkpoint testemunhado ou quorum de witnesses. A chave
real do log e a configuração HTTPS são responsabilidade da implantação.

O verificador offline confere somente BLAKE3, sequência e Ed25519; não promove
um recibo anexado a atestação. O laudo A4 explicita seu escopo técnico e não tem
assinatura institucional própria. A interface não autoriza operações do kernel.

As 12 migrações PostgreSQL publicadas permanecem intactas. PostgreSQL/Besu não
foram iniciados por esta entrega. Nenhum CI remoto, HackenProof real, freeze de
protocolo ou atestação de produção foi realizado.
