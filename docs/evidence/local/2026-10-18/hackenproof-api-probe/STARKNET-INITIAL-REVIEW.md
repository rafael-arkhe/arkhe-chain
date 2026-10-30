# Starknet: escopo e revisão inicial — 2026-10-18

Dados consultados pelo MCP configurado. Nenhuma escrita de negócio, transação de rede ou submissão foi realizada.

| Programa | Entradas / alvos únicos | PoC | Observação |
| --- | --- | --- | --- |
| Starknet Staking | 18 / 18 | obrigatório | Status Active |
| Starknet Web & SC | 6 / 3 | obrigatório | Status Active; 6 entradas representam 3 alvos únicos |
| Starknet Blockchain/DLT | 37 / 37 | obrigatório | Status Active; end_date=30 Sep 2026 conflita com status ativo e unending_program=true; elegibilidade atual não resolvida |

## Revisão inicial local do Staking

Fonte: https://github.com/starkware-libs/starknet-staking, tag @staking/contracts-v1.0.1-dev.854, commit 5c11a5689f2d2e08ffecebf30d3e49569accbfca. Checkout esparso em ops/local/starknet-staking-scope. Nenhum script do repositório foi executado.

Leitura inicial: RewardSupplier.sol, MintManager.sol, PeriodMintLimit.sol, ProxySupportImpl.sol e reward_supplier.cairo; busca pontual em minting_curve.cairo. Não constitui cobertura completa dos 18 alvos.

Observações por inspeção, sem teste dinâmico:

- MintManager exige minter registrado e allowance; quota e allowance são atualizadas antes da chamada mint externa. Isso não prova ausência de reentrância em todo o fluxo.
- RewardSupplier L1 consome mensagens provenientes da origem configurada antes da cunhagem e usa destino configurado; nenhuma forma de falsificação foi demonstrada.
- RewardSupplier Cairo restringe claim_rewards e atualização de recompensas ao contrato de staking; on_receive verifica bridge e token. Não foi demonstrado bypass.
- O comportamento de tick sem mensagens e com msg.value merece apenas compreensão funcional; não há aqui PoC de perda de terceiros que justifique um relatório.

Nenhuma vulnerabilidade confirmada e nenhuma PoC executada. Pendentes: revisão restante dos contratos, rastreamento das dependências/estado de implantação e testes locais apropriados. Nenhuma alegação de segurança geral.

## Restrições relevantes

As capturas exigem confidencialidade e comunicação exclusivamente pela HackenProof, proíbem submissões simultâneas em outras plataformas e achados apenas teóricos. Não houve contato externo com equipes. O catálogo MCP observado não oferece ferramenta para criar relatório de pesquisador; triagem não equivale à submissão.
