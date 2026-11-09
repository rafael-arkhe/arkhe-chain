# arkhe-chain

Nó local que estende uma ponta. A admissão é `ArkheNode::ingest`. O payload da transação é o CBOR canônico de `DecisionVerdict` no domínio `AKG:VERDICT:v1`.

Este crate não tem o tipo `ArkheChain` nem a função `ingest_transaction`. Não está homologado.

## Publicação

- GitHub: <https://github.com/rafael-arkhe/arkhe-chain>
- Hashtree: `htree://npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain`
- Leitura: <https://git.iris.to/#/npub16azl5mr3qp2tf6duv0z6uh2ky4cvp60gj30yhnm0882k420c5a6shjzett/arkhe-chain>

O `Cargo.toml` deste diretório herda versão, edição e licença de um workspace Arkhe. O comando de teste abaixo roda nesse workspace, não num checkout isolado deste repositório.

```text
cargo test -p arkhe-chain
```

O último gate desta sessão de desenvolvimento terminou com código 0, 72 testes e 0 falhas. O log está em [docs/gate-2026-11-09.log](docs/gate-2026-11-09.log) e foi escrito depois da execução. Uma segunda pessoa ainda não reexecutou o gate.

## Documentação

- [Registro do gate](docs/homologacao.md)
- [Admissão](docs/admissao.md)
- [Estado e snapshot](docs/estado.md)
- [Ponta, fork e finalidade](docs/consenso.md)
- [Sincronização](docs/sincronizacao.md)
- [Prova e âncora](docs/liquidacao.md)
- [Blindagem de Chaves e Contingência](docs/seguranca_chaves.md)
- [Erros](docs/erros.md)

## Limites que o código mantém

- Todo envio exige Ed25519 e ML-DSA-65. Campo vazio, tamanho diferente de 3309 bytes, assinatura inválida ou chave ausente não move saldo.
- Um bloco irmão de outro proposer, com o mesmo pai e a mesma altura, devolve `Fork` e não substitui a ponta.
- Dois blocos distintos do mesmo proposer na mesma altura devolvem `Equivocation`.
- `finality` é a profundidade local. `bft_commit` devolve `QuorumAbsent`. Não há poder de voto nem `CanonicalVote`.
- `submit_proof_and_bridge_assets` devolve `VerifierAbsent`. `image_id` preenchido não carrega. `verifyProof` no contrato devolve falso.
- A âncora aceita tem 37 bytes, `ARKHE` seguido de `state_root`. `broadcast` permanece falso.
- `cite_ethereum_execution` cita um bloco de execução informado pelo chamador e guarda essa citação. Outra citação na mesma altura é `EthereumConflict`. `confirm_ethereum_execution` só confirma quando um cliente devolve o mesmo hash. Sem cliente, a resposta é `RpcAbsent`. `settled` fica falso e a confirmação não entra no arquivo.
- `accepted_peers` lista os validadores do nó. Não há descoberta de peers na rede.
