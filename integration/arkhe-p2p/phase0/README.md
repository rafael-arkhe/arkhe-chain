# Fase 0 — distribuição gratuita e observações de retrieval

Estado: protótipo local executado. Sem token, pagamento, stake, slashing,
governança por score ou promessa de SLA. Não é dashboard publicado nem rede
P2P independente: há um servidor HTTP simples, e o cliente usa o transporte
Rust `arkhe-p2p`. Descoberta Nostr não faz parte deste fluxo inicial com origem
configurada. Nenhuma dependência nova foi acrescentada.

## Executar

Requer o workspace original: Node 24, Rust e o WASM Node E02 existente.
Na raiz `D:/arkhe`, construir o cliente uma vez:

```powershell
cargo build --manifest-path integration/arkhe-p2p/Cargo.toml --locked --bin fetch-proof
node integration/arkhe-p2p/phase0/service.mjs
```

O servidor inicia em `127.0.0.1:8787`. Em outro terminal:

```powershell
node integration/arkhe-p2p/phase0/probe.mjs http://127.0.0.1:8787 integration/arkhe-p2p/target/debug/fetch-proof.exe observations.jsonl
node integration/arkhe-p2p/phase0/probe.mjs summary observations.jsonl
```

Linux/macOS: remover `.exe` do caminho do binário. Para testar:

```powershell
node --test integration/arkhe-p2p/phase0/phase0.test.mjs
```

`ARKHE_PROOF_HOST` e `ARKHE_PROOF_PORT` configuram o bind. Para publicar, usar
operador e endpoint HTTPS próprios, com limites de tráfego no proxy. O servidor
não instala TLS nem publica DNS, relays, transações ou chaves. O cliente aceita
HTTPS e permite HTTP somente em IP loopback literal com opção explícita na CLI
Rust; o probe aplica essa opção somente ao loopback.

## Contrato de dados e medição

- `catalog.json` é o conjunto local de pins independentes da resposta HTTP.
  SHA-256/BLAKE3 fixam os bytes do dataset, ANCHOR e REF do smoke histórico
  devnet de 2026-10-23. O servidor valida os pins ao iniciar e só serve esses
  três blobs em `GET /<sha256>`; não expõe diretórios nem aceita uploads.
  O catálogo não é aprendido do fornecedor durante o retrieval, não é assinado
  e a confiança na distribuição do software/catálogo continua explícita.
- `GET /healthz` informa funcionamento do processo. `GET /metrics` mostra
  respostas HTTP terminadas e bytes escritos pelo processo, desde o seu início.
  Não prova receção pelo cliente, hash verificado ou uptime. Reiniciar zera os
  contadores. Não são guardados IPs, identidades ou headers de clientes.
- Cada probe obtém três blobs com o transporte Rust: sem redirects, com prazo
  de 10 s por objeto e teto de 16 MiB. Só há ficheiro de saída após dupla hash.
  Depois executa o `verifyReference` E02 existente sobre os ficheiros temporários.
  O resultado positivo é sempre qualificado por `arkhe-e02@1` e `synthetic-poc`.
  Não é validação de factura real nem prova de autenticidade dos recibos RPC.
- Um **retrieval verificado reportado** representa um probe do conjunto completo
  de três blobs, com dupla hash e E02 concluídos. Falha HTTP, de processo, hash,
  parsing ou E02 não incrementa o total positivo. O JSONL é local, não assinado,
  limitado a 10 MiB e não recebe declarações por endpoint público. Rotação e
  preservação dos logs ficam a cargo do operador; não executar probes
  concorrentes sobre o mesmo ficheiro de ledger.
- O resumo deduplica run IDs e recusa observações incompatíveis/incompletas.
  Isso não impede um operador de fabricar um ledger coerente. Repetições com
  novos run IDs são novas execuções, não novos utilizadores ou procura orgânica.
  `origins_observed` não mede independência: dez URLs podem ter o mesmo operador.
  Por isso `independent_peers = null` e `demand_gate = NOT_ESTABLISHED`.
- `elapsed_ms` é tempo local de parede do probe, incluindo subprocessos,
  downloads e E02. Não é latência de rede isolada, TTFB, p99, nem garantia <2s.
  Relógios e datas de um ledger não autenticado não demonstram 30 dias de uptime.

Os recibos são os capturados historicamente. Esta fase não consulta RPC novo,
não demonstra disponibilidade contínua e não faz ancoragem on-chain das métricas.

## Experimento de demanda

As metas propostas (10 operadores independentes, 100 retrievals em 30 dias)
são hipóteses de aceitação de um piloto, não teoremas de utilidade ou critérios
regulatórios. Os quatro testes automatizados e os probes do próprio autor são
evidência técnica local, não adesão externa.

Antes de avaliar o gate, é necessário acordar o que constitui operador
independente, recrutar participantes reais, registar adesão/consentimento,
identificar tráfego de teste e estabelecer observações por terceiros em vários
pontos de rede. Custos e resultados, incluindo falhas, devem ser preservados.
100 execuções bem-sucedidas não demonstram SLA 99,9%, nem disposição para pagar.
O piloto pago continua a exigir contratos e serviço próprios, fora do label E02.

## Limites do framework recebido

Não foram adotados os preços, protocolos económicos, estruturas societárias ou
afirmações legais do texto como factos verificados. Exigem fontes primárias e
revisão própria se entrarem numa decisão. Não foi escolhida arquitetura SPL ou
Token-2022. Um challenge-response pontual não demonstra disponibilidade futura;
uma falha de rede não justifica por si só slashing. Esse mecanismo não foi criado.

O próximo gate técnico é um smoke público por um operador real, antes de uma
medição de campo de 30 dias. Deploy público e clientes independentes continuam
pendentes; nenhum resultado local os substitui.
