# Arkhe-RBB: implementação local e execução

Implementa o núcleo executável do candidato v3 revisão 2 da [arquitetura v0.2](../../docs/ARKHE-RBB-ARQUITETURA-v0.2.md). O protocolo novo está isolado em `arkhe_verify_core::rbb`; o perfil MMR anterior não foi substituído.

## Implementado

- Header ABI de 27 palavras, digest Keccak-256 e envelope canônico de 3.488 bytes no perfil 1. Decoder rejeita padding/offsets não canônicos, largura inválida, overflow, flags inconsistentes e bytes extras.
- MMR BLAKE3 com domínio/contador, prova por posição, geometria das montanhas e verificação de extensão a partir de frontier autenticada. Perfil novo identificado pelo digest de uma descrição fixa, sem alias do perfil existente.
- Verificação estrita Ed25519 AND ML-DSA-44 real por `fips204 0.4.6`, habilitada com `rbb-pqc`. Há contextos distintos para checkpoint e atestação.
- Verificação offline de atestação 3 de 4, com testemunhas fornecidas pelo host confiado. Extrato de keyset, época, rede/contratos/code hashes, bloco, envelope, política e contexto temporal são cobertos pelo transcript. Chaves iguais não contam como testemunhas diferentes. Frescura e gaps são resultados separados.
- Contrato `ArkheCheckpointAnchor.sol`: recompõe ID/envelope, verifica autorização/stream/keyset, sequência/predecessor/intervalo, perfis e rede; retry exato é idempotente, inclusive após suspensão. Sem precompile PQ presumida.
- Oráculo Python independente com `eth-abi`, PyCryptodome e BLAKE3; execução do Solidity compilado em Ganache; exemplo Rust assina um checkpoint híbrido real e o mesmo envelope é registrado pela EVM.

## Limites de implementação

`RegistryFixture.sol` é exclusivamente fixture de teste, com setters públicos. Não é registro institucional de produção e não implementa governança, prova de posse ou meta-transações EIP-712. O anchor usa administrador único para configuração/pausa neste protótipo; deve ser substituído pelo mecanismo governado aprovado antes de uso operacional.

O contrato registra `RECORDED` e não valida as assinaturas híbridas dentro da EVM. A verificação real ocorre no Rust; aceitar uma transação não significa aceitar a evidência. As assinaturas artificiais dos vetores de codec são rotuladas como fixture; os testes criptográficos e o teste integrado usam assinaturas ML-DSA reais.

O verificador de atestação é uma biblioteca offline: não opera testemunhas independentes, não consulta RPC e não implementa light client QBFT nem cerimônia de atualização de raiz. `Trust` é entrada do host, não deve ser carregado do mesmo bundle não confiado. `verify_attested_checkpoint` verifica o checkpoint e seu vínculo atestado; não declara ter verificado WER, inclusão MMR ou legalidade. Inclusão deve ser conferida por `rbb::mmr::verify` quando requerida pelo consumidor.

Continuam pendentes as fatias de persistência PostgreSQL/outbox com fault injection, assinador isolado/HSM, registro institucional completo, testemunhas operacionais, integração com SAPL/Fabric reais e publicação em RBB homologada. Não foram obtidas credenciais nem alteradas redes externas. Os testes locais não fecham esses itens.

## Executar

Na raiz do workspace, com Rust do `rust-toolchain.toml`, Node/npm, Python e PowerShell 7:

```powershell
python -m venv integration/arkhe-rbb/.venv
integration/arkhe-rbb/.venv/Scripts/python.exe -m pip install -r integration/arkhe-rbb/python/requirements.txt
pwsh -File integration/arkhe-rbb/run-tests.ps1 -Python integration/arkhe-rbb/.venv/Scripts/python.exe -InstallNodeDependencies
```

O runner roda o oráculo sem regenerar os vetores, a regressão completa de `arkhe-verify-core`, compila o exemplo de assinatura e executa o contrato. Logs e resultado estruturado ficam em `output/arkhe-rbb-execution/`. Para repetir após instalar dependências, omitir `-InstallNodeDependencies`.

Comandos individuais:

```powershell
python integration/arkhe-rbb/python/reference_vectors.py
cargo test -p arkhe-verify-core --features rbb-pqc --locked
cargo build -p arkhe-verify-core --example rbb_sign_fixture --features rbb-pqc --locked
npm.cmd --prefix integration/arkhe-rbb test
```

`reference_vectors.py --write` atualiza deliberadamente os vetores; não é usado durante validação. `rbb_sign_fixture` contém seeds determinísticas públicas e não deve ser usado como assinador de produção. O teste EVM usa chain ID 1337 e Shanghai explicitamente; isso não afirma compatibilidade com a configuração atual da RBB.

O pacote Node está isolado, com lockfile; Ganache pode usar fallback JavaScript de µWS conforme a versão do Node, sem alterar a semântica dos testes. As dependências aqui são ferramentas locais de teste, não componentes recomendados para operar a rede.
