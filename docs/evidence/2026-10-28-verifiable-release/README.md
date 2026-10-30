# Release verificável Arkhe — resultados de 28/10/2026

**Resultado: 11/11 cenários end-to-end passaram.** Publisher Windows e consumidor
Linux nativo na VM WSL Ubuntu. Demonstração de release sintética de fontes,
sem implantação ou execução do artefato recebido.

## Fluxo observado

| Etapa | Evidência |
|---|---|
| Revisão Radicle real, assinada por identidade diferente do autor | `radicle-review.json`, `radicle-commands.json`, bundle em `package-v2.zip` |
| Fonte fixada | RID `rad:z2MKB2DZ4Z8nqddg5zvFdsHp6AuH1` |
| Patch/revisão | `c01ffbde021b05170cd5136a1574f69e27f3cb99` |
| Commit do espécime | `12527ac63a4eea635a8a4942a649414d6d57a2cb` |
| Operação de revisão | `d61b8e8a163f3a42c5e50229b7e7a1ed8229508c` |
| Artefato | `git archive --format=tar COMMIT`, SHA-256 `74c462b51b44decf9eaba920cae4b12083b5c7edcab9a0a24914233e8f27c85b` |
| Atestação Ed25519 e política | `attestation-v2.json`, `trust.json`, `preparation.json` |
| Recuperação pública na VM com cache vazio | `reports/11-public-hashtree-recovery.json` |
| Aprovação local separada | `approval-v2.json`, domínio e chave diferentes do atestador |
| Maior sequência persistida | SQLite em `/home/arkhen/arkhe-release-consumer-03/state.sqlite` |

O consumidor conferiu assinaturas Ed25519 das árvores COB da revisão e da
proposta, a associação da revisão ao commit e a igualdade byte a byte entre
o arquivo recebido e `git archive` do commit recuperado do bundle.

## Casos

| Caso | Resultado esperado e observado |
|---|---|
| 01 — pacote recuperado, sem aprovação local | `VERIFIED_ONLY`, autorização false |
| 02 — aprovação local válida | `ADMITTED_LOCAL`, execução false |
| 03 — repetição da mesma atestação | `ADMITTED_LOCAL`, sem execução |
| 04 — fonte A desligada, fonte B disponível | Primeira tentativa falhou; segunda recuperou e admitiu, ambas com cache novo |
| 05 — sequência 1 depois de admitir 2 | Rejeição: `obsolete release sequence` |
| 06 — aprovação local expirada | Rejeição de validade/vínculo |
| 07 — artefato adulterado distribuído sob outro CID válido | Rejeição: arquivo diverge do commit |
| 08 — aprovação de outra atestação | Rejeição de validade/vínculo |
| 09 — assinatura de atestação adulterada | Rejeição: `invalid signature` |
| 10 — outra atestação válida na mesma sequência, com nova aprovação válida | Rejeição do ledger: `same sequence` |
| 11 — recuperação do servidor público | `ADMITTED_LOCAL` na VM, sem execução |

Os casos negativos conferem o **motivo específico** da rejeição, para não
contabilizar falha de rede como rejeição criptográfica ou de política.

## Publicação pública

Foi enviado somente o pacote sintético, de 7.384 bytes, a `https://upload.iris.to`.
O cliente Hashtree nativo da VM recuperou esse pacote sem cache do publisher.

[Abrir pacote no Iris Drive](https://drive.iris.to/#/nhash1qqs2npt7ywg52zumf58t6chxxzqnyyhmmtrn39ucn5ckhz0sh8uye0g9yqrf44ytsqvjugz0hshy3ze9eyvn2xv7teqzf2e6jskk2z8y40jc546834u/package-v2.zip).

CID completo:

```text
a9857e2391450b9b4d0ebd62e630813212fbdac73897989d316b89f0b9f84cbd:069ad48b80192e204fbc2e488b25c91935199e5e4024ab3a942d6508e4abe58a
```

Esse CID identifica o pacote no transporte, não o SHA-256 do artefato lógico
nem uma root MMR. A disponibilidade foi observada nesta execução, sem SLA futuro.

## Validação de desenvolvimento

- 67 testes Rust passaram, zero falhas e zero ignorados, nos pacotes
  `arkhe-verify-core` e `arkhe-verify-cli`.
- Clippy nos dois pacotes, todos os targets, `-D warnings`: passou.
- Formatação dos dois arquivos Rust alterados: passou.
- 6 testes Python do consumidor passaram em Windows e em Linux: fixture
  Radicle positiva, artefato modificado, chave de revisão incorreta, snapshot
  modificado, path traversal e membro ZIP duplicado.
- 2 testes do espécime de fonte passaram antes da atestação.
- Verificador Arkhe compilado nativamente para Windows e Linux.

Uma correção de lint sem alteração semântica foi aplicada em
`verification/crates/arkhe-verify-core/tests/policy_compatibility.rs`:
`std::slice::from_ref(&reason)` substituiu um clone desnecessário.

## Limites e confiança

- Revisão e aprovação **automatizadas de laboratório**, com chaves geradas para
  o ensaio. Não são revisão humana, credenciais corporativas ou auditoria externa.
- Radicle foi usado localmente para criar os objetos reais; não se publicou o
  repositório na rede Radicle. O vínculo RID/patch é fixado por confiança local
  no atestador; não há validação integral do protocolo Radicle neste leitor.
- As sequências 1 e 2 usam o mesmo espécime, com atestações distintas, para
  isolar o ensaio de rollback. Não são duas versões de produção do Arkhe.
- `ADMITTED_LOCAL` significa aceitação por este perfil local experimental.
  Todos os resultados mantêm `execution_authority=false` e `executed=false`.
  Não é o gate de preview ou autorização de execução do runtime de produção.
- A política pública e aprovações foram provisionadas separadamente na VM por
  diretório compartilhado do laboratório. Chaves privadas não foram enviadas.
- WSL é uma VM local no mesmo computador. As fontes A/B são processos loopback
  do mesmo operador; a falha demonstrada é de fonte, não de localidade/operador.
- O SQLite protege sequência e conflito dentro do perfil; não protege contra
  rollback de disco ou alteração por administrador do host.
- Radicle 1.10.3: checksum oficial correspondeu, e a assinatura é válida, mas
  o signer do arquivo difere das chaves anunciadas na página consultada.
  Não se declara autenticação contra aquelas chaves. Ver o README da integração.
- Hashtree Linux 0.2.157 foi compilado com lockfile upstream e feature `lmdb`.
  Cargo informou dependências retiradas do registry nesse lockfile; nenhuma
  auditoria de segurança do Hashtree é inferida dos testes funcionais.
- O workspace raiz não tem `.git`; o commit acima identifica apenas o espécime
  Radicle. `manifest.json` registra os bytes locais da implementação/evidências,
  sem inventar uma revisão Git para o workspace completo.

As aprovações preservadas expiram e servem como evidência histórica. Para um
novo ensaio de admissão, gerar novas chaves/aprovações e novo diretório de estado;
nunca reinicializar o ledger existente para contornar a proteção de rollback.

## Reprodução e implementação

Consultar `integration/arkhe-release-demo/README.md` para todos os comandos.
`package-v2.zip` e `trust.json` também permitem os seis testes offline do
consumidor, sem publicar dados ou instalar programas recebidos.

`manifest.json` é um inventário SHA-256 local, não uma assinatura de release.
Os logs preservam falhas de toolchain relevantes nas notas, sem declarar
os passos intermediários malsucedidos como aprovação.
