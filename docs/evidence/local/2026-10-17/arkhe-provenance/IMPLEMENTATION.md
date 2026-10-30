# Proveniência assinada, MCP e reconciliação — 2026-10-17

Status: IMPLEMENTATION CANDIDATE — NOT FROZEN.

## Correções ao balanço recebido

- O EvidenceReader PostgreSQL já foi exercitado na rodada anterior; não era apenas
  um stub. Esta rodada acrescenta assinatura real e cadeia pai/filho ao teste.
- expires_at de 30 dias é configuração de retenção; limpeza TTL continua pendente.
- Os negativos do contrato B0 foram simulações EVM via eth_call/staticCall. Não
  foram três transações revertidas mineradas. Deploy e ancoragem foram minerados.
- Um teste que passa é evidência do cenário executado, não um teorema formal nem
  prova contra todas as classes de adversários.

## Implementação

- Recibos Ed25519 destacados do WER, com domínio e binding de tenant, hash,
  resultado e chave; allowlist da chave por módulo/versão/operação e flag de revogação.
- verify_strict e verificação de pais declarados via EvidenceReader. Chaves de
  execução podem exigir input admitido. A chave privada não entra no verificador.
- Recibos persistidos como material não confiável separado. Somente verificação
  bem-sucedida permite commit atômico do WER/envelope.
- Fila durável de reconciliação manual e gauge por tenant. Falhas ficam marcadas;
  operações abandonadas também entram após grace period. O reconciler é read-only:
  não fabrica sucesso nem repete writes. Histórico permanece depois de conclusão.
- Transporte HTTP autenticado por X-Api-Key; MCP 2025-11-25 explicitamente fixado,
  JSON/SSE, limites, sem redirects/retries. Pins das definições completas, verificados
  antes de cada chamada. Catálogo candidato é exportável para revisão sem tools/call.
- Codec do wire real permanece obrigatório e sem implementação especulativa padrão.
- build.rs adicionado aos crates que embutem migrações: novas migrações agora
  invalidam o cache do compilador. Foi detectado e corrigido um binário local que
  ainda embutia apenas as dez migrações anteriores.

## Limites e decisões

HACKENPROOF_API_KEY não está disponível neste processo; o usuário escolheu API key,
mas não forneceu uma referência de secret manager com credencial acessível. Nenhuma
consulta autenticada ao HackenProof real nem escrita externa foi executada.

O usuário escolheu manter apenas o workflow local. O checkout de CI existente de
rafael-arkhe/arkhe-os foi identificado por leitura; não foi alterado ou publicado.
A execução GitHub Actions continua pendente por decisão explícita nesta rodada.

O provider LLM real, codec autenticado upstream, KMS/custódia e distribuição das
raízes de confiança, política de freshness e reconciliação efetiva do estado externo
permanecem responsabilidades de implantação. B1–B4 e C2PA não foram executados ou
promovidos. A assinatura prova origem/integridade do recibo, não a verdade do relatório.

Os testes de assinatura usam chaves efêmeras geradas por RNG do sistema, não hashes
fixados nem credenciais de produção. As demais fixtures históricas permanecem
identificadas como sintéticas. RESULTADOS e logs estão em RESULTS.md/results.json;
nenhum resultado local é apresentado como execução remota ou freeze.

## Resultado final desta rodada

- 29 testes do módulo passaram: 5 HTTP/MCP, 4 de proveniência (incluindo PostgreSQL
  real) e 20 de triagem/persistência/reconciliação. Core e kernel também passaram.
- cargo test --workspace --locked passou; dois testes PostgreSQL legados permaneceram
  ignorados nessa invocação padrão. As novas verificações PostgreSQL foram executadas
  explicitamente com postgres-integration e banco real.
- Gates de segurança PostgreSQL passaram num banco isolado com as 12 migrações.
- Arquitetura, formatação e regeneração dos vetores canônicos passaram.
- As últimas execuções registradas não tiveram mudança de fontes durante os testes.
- O PostgreSQL de teste foi devolvido ao estado parado original, preservando os dados.
