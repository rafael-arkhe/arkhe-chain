# Release verificável Arkhe — laboratório Radicle / Hashtree / VM

Perfil experimental `arkhe-release-lab@1`. Demonstra uma release **de fontes**
sintética, cuja revisão Radicle, commit e arquivo podem ser conferidos no
consumidor. Não implanta nem executa software recebido. Não altera os perfis
congelados E02/KYA e não equivale ao gate de preview PostgreSQL de produção.

## Fronteiras de confiança

1. **Fonte**: duas identidades Radicle novas de laboratório. O autor abre um
   patch e outra identidade emite `accept`. É revisão **automatizada**, não
   aprovação humana nem auditoria independente. As operações reais ficam em
   um bundle Git com os objetos COB e as assinaturas originais.
2. **Build**: `git archive --format=tar COMMIT`, depois de dois testes do
   espécime. O consumidor refaz o arquivo e compara os bytes. A demonstração
   não prova compilação reproduzível de um binário nem execução em TEE.
3. **Atestação**: assinatura Ed25519 com domínio explícito vincula SHA-256,
   BLAKE3, tamanho, produto, sequência, RID, patch, revisão, commit, revisor e
   hash da observação de revisão. A chave do atestador é provisionada localmente.
4. **Distribuição**: o CLI oficial Hashtree faz CHK, armazenamento e recuperação
   por CID completo (`hash:key`). A raiz do transporte não é a root MMR do
   Arkhe nem o digest do arquivo lógico. Nenhuma identidade Nostr é tratada
   automaticamente como pessoa jurídica ou autoridade de admissão.
5. **Consumidor**: Linux nativo na VM WSL Ubuntu, com verificador Arkhe compilado
   para Linux e cache Hashtree novo por tentativa. Não usa o executável Windows
   para obter o conteúdo. O ambiente de laboratório compartilha host físico,
   relógio e canais de provisionamento; não representa operadores independentes.
6. **Autorização local**: outra chave Ed25519 assina uma decisão para o hash
   exato da atestação, tenant, digest CBOR canônico da política e validade.
   Sem ela, retorna `VERIFIED_ONLY`, com `authorization_granted=false`.
   Com ela, pode retornar `ADMITTED_LOCAL`; `execution_authority` e `executed`
   permanecem false em todos os casos.

O consumidor verifica independentemente as assinaturas das árvores de operação
COB. No Radicle 1.10.3 elas são Ed25519 sobre os 20 bytes do OID da árvore,
embaladas em SSHSIG com namespace `radicle`. **Não** são assinaturas SSHSIG
convencionais sobre o commit inteiro. O RID e sua associação ao patch são
fixados por política/atestador: este leitor não implementa a validação integral
de identidade, delegates, sigrefs ou consenso de estado da rede Radicle.

## Estado local e replay

SQLite usa `BEGIN IMMEDIATE` para consultar e atualizar o maior número de
sequência admitido por tenant/produto na mesma transação. Sequência menor é
rejeitada, mesmo com assinatura e aprovação originalmente válidas. Na mesma
sequência, só se admite novamente a mesma atestação. Replay não executa nada.

Arquivo de estado ausente falha. A criação requer `--initialize-state` e nunca
sobrescreve um arquivo existente. O operador deve proteger política, relógio,
estado e chaves. Não existe defesa contra um administrador que restaure todo
o SQLite a uma versão antiga ou modifique os binários do consumidor.

## Preparação nesta máquina

- Radicle 1.10.3 em `ops/local/verifiable-release/tools/`.
- Windows: `ops/local/hashtree-tools/bin/htree.exe` 0.2.157 já existente.
- Linux: `build_htree_vm.sh` instala `hashtree-cli =0.2.157`, com lockfile
  upstream e feature `lmdb`; a VM precisou de `libdbus-1-dev`.
- Python Windows com `cryptography`; Python Linux com `cryptography`, Git e Rust.
- Não iniciar um nó Radicle público: este ensaio usa objetos locais e bundle.

A assinatura do arquivo Radicle baixado foi matematicamente validada e o
SHA-256 correspondeu ao publicado no servidor HTTPS oficial. Porém o signer
`SHA256:xX6bpr+AeF5G0wIvU8nLisgYRM6XjQVNJs3hkMGt+T0` difere dos dois
signers listados na página de download consultada. Portanto, **não há alegação
de autenticação do binário contra as chaves daquela página**. O bootstrap deixa
essa distinção explícita; a confiança de aquisição é no origin HTTPS oficial.

## Executar

Comandos PowerShell na raiz; escolha nomes novos para cada execução. Não apague
o estado anterior para repetir um ensaio de rollback.

```powershell
cargo build -p arkhe-verify-cli --locked
python integration/arkhe-release-demo/download_radicle.py --tools ops/local/verifiable-release/tools
wsl -d Ubuntu -- sh /mnt/d/arkhe/integration/arkhe-release-demo/bootstrap.sh
wsl -d Ubuntu -- sh /mnt/d/arkhe/integration/arkhe-release-demo/build_vm.sh
wsl -d Ubuntu -- sh /mnt/d/arkhe/integration/arkhe-release-demo/build_htree_vm.sh
wsl -d Ubuntu -- python3 /mnt/d/arkhe/integration/arkhe-release-demo/radicle_source.py /home/arkhen/arkhe-release-source-N /mnt/d/arkhe/ops/local/verifiable-release/source-N
python integration/arkhe-release-demo/prepare.py --source ops/local/verifiable-release/source-N --out ops/local/verifiable-release/run-N --verifier D:/arkhe/target/debug/arkhe-verify.exe
python integration/arkhe-release-demo/run_demo.py --run ops/local/verifiable-release/run-N --receiver /home/arkhen/arkhe-release-consumer-N
```

O publisher gera duas sequências assinadas do mesmo espécime para exercitar
rollback sem introduzir uma segunda variável de fonte. As identidades privadas
Radicle e as chaves do atestador/aprovador ficam fora do pacote público.

`run_demo.py` provisiona somente a política pública e as aprovações assinadas
num diretório local da VM, por canal separado do pacote. É bootstrap controlado
de laboratório, não protocolo de provisionamento remoto de produção.

O pacote tem lista fixa de cinco arquivos: `artifact.tar`, `attestation.json`,
`source.bundle`, `radicle-review.json`, `README.txt`. O consumidor não extrai
caminhos arbitrários, não faz checkout e não executa fontes recebidas.

Para enviar o pacote **sintético** a um servidor público Hashtree/Blossom, use
`--publish-public`. Essa opção publica material externo e deve corresponder ao
escopo autorizado pelo operador. Não publica o workspace, política, aprovações
locais ou chaves. Guarda o CID e o resultado da recuperação pública na VM.

## Casos do ensaio

- Recuperação com cache vazio e verificação sem autorização local.
- Admissão com aprovação local separada, sem execução.
- Replay idempotente da mesma release.
- Desligamento real do servidor A, nova recuperação por B com outro cache vazio.
- Rejeição de sequência antiga depois da admissão da sequência 2.
- Rejeição de aprovação expirada e aprovação para outra atestação.
- Pacote adulterado publicado sob **novo CID válido**: o transporte pode aceitá-lo,
  mas o vínculo do artefato com o commit/atestação deve rejeitá-lo.
- Assinatura adulterada e outra atestação válida na mesma sequência (com nova
  aprovação válida) são rejeitadas por autenticação e ledger, respectivamente.

Os dois servidores locais são fixtures Blossom sem autenticação, escutam somente
em loopback e são encerrados ao fim. Representam falha de processo/fonte, não
independência geográfica, administrativa ou resistência a eclipse/Sybil.
Não usar `blossom_lab.py` como serviço de produção.

O pacote e os membros têm limite lógico de 4 MiB no consumidor e o artefato tem
limite do perfil local. A obtenção pelo CLI Hashtree tem timeout; o wrapper não
oferece quota rígida de disco/rede durante o processo externo. Usar apenas os
CIDs e servidores conhecidos desta demonstração, não entrada arbitrária de usuário.

## Verificação de desenvolvimento

```powershell
cargo test -p arkhe-verify-core -p arkhe-verify-cli --locked
cargo clippy -p arkhe-verify-core -p arkhe-verify-cli --locked --all-targets -- -D warnings
rustfmt --edition 2021 --check verification/crates/arkhe-verify-core/src/release.rs verification/crates/arkhe-verify-cli/src/main.rs
python -m compileall -q integration/arkhe-release-demo
python -m unittest discover -s integration/arkhe-release-demo -p test_receive.py -v
```

## Fontes técnicas

- https://radicle.dev/guides/protocol
- https://radicle.dev/download
- https://github.com/radicle-dev/heartwood/blob/master/crates/radicle-cob/src/backend/git/change.rs
- https://github.com/radicle-dev/heartwood/blob/master/crates/radicle-crypto/src/ssh.rs
- https://github.com/mmalmi/hashtree/blob/master/docs/HTS-01.md

As conclusões observadas e os relatórios preservados ficam em
`docs/evidence/2026-10-28-verifiable-release/` depois da execução final.
