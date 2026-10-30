# Testes locais de segurança Starknet — 18/10/2026

**Resultado: 31 casos passaram; nenhuma vulnerabilidade confirmada.** Estes resultados cobrem subconjuntos locais dos contratos, não uma auditoria completa nem uma aprovação de segurança. Não foi gerado relatório de vulnerabilidade para submissão, pois nenhum impacto explorável foi demonstrado.

| Suíte | Casos | Resultado | Compilador |
| --- | --- | --- | --- |
| Staking: MintManager, PeriodMintLimit e RewardSupplier L1 | 18 | PASS | solc 0.8.24 |
| StarkGate: saques e limites do StarknetTokenBridge | 13 | PASS | solc 0.8.20 |

Os 31 casos incluem dois loops de 32 amostras determinísticas (64 amostras no total); as amostras não são contadas como 64 testes adicionais.

## O que foi exercitado

Staking: minter não registrado; concessão não autorizada de papéis; registro de minter e ajuste de allowance sem privilégio; overdraw e uint256 máximo; crédito/debito de emissão; quota semanal agregada entre dois callers; limites determinísticos; rollback de allowance/quota em mint revertido; revogação; renovação semanal; bloqueio de initialize direto; ausência de mensagem; origem, destinatário e valor incorretos na mensagem; máximo de cinco mensagens por tick; destinos L2 fixos; rollback após falha de bridge ou envio.

StarkGate: ausência de mensagem; destinatário, valor, token e origem L2 incorretos; relayer não redireciona pagamento; replay; destinatário zero; alterações privilegiadas não autorizadas; quota diária e quota agregada entre destinatários; rollback após falha de transferência; 32 variações de valor não autorizadas.

## Método e limites

EVM Ganache 7.9.2 em memória, chainId 31337, sem endpoint upstream ou transações públicas. Solidity original compilado com optimizer enabled/runs=200 e EVM Shanghai. Token, bridge e mensageria são mocks de teste. O RewardSupplier usa proxy mínimo de fixture; StarkGate usa subclasse com inicialização de estado no construtor, sem sobrescrever os métodos de saque. Não foram exercitados proxies de produção ou provas reais da mensageria. As funções seed dos mocks representam pré-condições do teste, não capacidades de um atacante.

Fontes preservadas sem alterações nos checkouts locais. Commits:
- Staking: `5c11a5689f2d2e08ffecebf30d3e49569accbfca`, tag `@staking/contracts-v1.0.1-dev.854`.
- StarkGate: `2c2729d47b9b5c7421c16fd258b2fa7e3ad6ddfc`, snapshot da branch `cairo-1`.

Não houve execução Cairo: scarb/snforge não estavam disponíveis, e a conexão Podman estava indisponível. Não houve teste dinâmico do website nem do Blockchain/DLT. Este último retornou status Active/unending_program=true e end_date=30 Sep 2026; a elegibilidade atual precisa ser esclarecida na plataforma. Não se deve inferir equivalência entre os commits e os contratos implantados.

## Histórico de ajustes do harness

A primeira compilação de StarkGate usou solc 0.8.24 e foi rejeitada por uma dependência que exige 0.8.20. A segunda rejeitou conversão memory/calldata no construtor da fixture. Ambas foram corrigidas somente no harness. Na terceira rodada, 12 casos passaram e um falhou ao interpretar a mensagem de revert encapsulada pela biblioteca de transferências. O teste passou após reconhecer o motivo esperado nos bytes de revert; continuou exigindo saldo/quota restaurados e sucesso no retry. O JSON da falha anterior foi preservado. O Ganache usou fallback JavaScript porque o módulo nativo uWS não corresponde ao Node 24; isso não impediu a execução da EVM.

## Reprodução

Copie esta pasta para um diretório local dedicado. Instale as dependências com `npm ci --ignore-scripts --no-audit --no-fund`. Use os mesmos commits e mantenha os checkouts limpos. Nenhum script dos repositórios upstream deve ser executado.

```powershell
git clone --depth 1 --branch "@staking/contracts-v1.0.1-dev.854" https://github.com/starkware-libs/starknet-staking.git ../starknet-staking-scope
git clone --branch cairo-1 https://github.com/starknet-io/starkgate-contracts.git ../starkgate-scope
git -C ../starkgate-scope checkout --detach 2c2729d47b9b5c7421c16fd258b2fa7e3ad6ddfc
python prepare_starkgate_deps.py ../starkgate-scope
node run.cjs ../starknet-staking-scope replay-staking
node starkgate.cjs ../starkgate-scope replay-starkgate
```

Os runners recusam commits diferentes ou checkouts alterados. A extração de dependências valida o hash do arquivo upstream. results.json contém os hashes das fontes efetivamente compiladas. Não há contas, chaves ou tokens reais no pacote. As contas determinísticas do Ganache servem exclusivamente à EVM em memória.

## Submissão manual futura

Somente preparar um relatório de achado se uma nova PoC demonstrar: pré-condições acessíveis ao atacante, execução sobre o código em escopo, comportamento esperado versus observado, impacto concreto e passos reproduzíveis. Incluir commit, alvo, evidências e mitigação. Os programas exigem confidencialidade, proíbem submissões simultâneas em plataformas diferentes e comunicação fora da HackenProof. Esta rodada não produziu esse tipo de achado.
