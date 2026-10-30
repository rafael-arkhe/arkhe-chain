# Arkhe SuperApp — piloto local de admissão

Implementação local em Rust com sandbox WASM (`wasmi`), broker, checkpoint
assinado e inclusão no perfil MMR **existente** `arkhe-mmr` v1. O pacote exportado
é conferido por uma implementação Python separada. É um piloto de laboratório;
não é uma integração implantada na Akash nem um SuperApp de produção.

## Executar a validação

Na raiz deste diretório, com Rust/Cargo, Python e as bibliotecas do verificador:

```powershell
python -m pip install -r requirements-verifier.txt
python validate.py
```

O runner cria um diretório novo em `evidence/run-*`, conserva logs completos,
executa os sete cenários do contrato e regressões adicionais, gera um build
release, exporta o pacote e chama o verificador independente. Consulte
`evidence/LATEST.txt` e o `ACCEPTANCE-REPORT.md` da execução. As contagens de
testes no relatório são lidas dos logs dessa execução.

### Interpretador Python

O runner usa o próprio interpretador que o invocou (`sys.executable`), sem `-I`,
e regista em `versions-python-deps.log` as versões de `cryptography`, `cffi` e
`blake3` e o caminho do `_cffi_backend`. Se `cryptography` estiver instalado no
site-packages do sistema e `cffi` no site do utilizador, `python -I` falha com
`No module named '_cffi_backend'`, porque o modo isolado ignora o site do
utilizador. Para execução isolada e reprodutível, use um ambiente virtual:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-verifier.txt
.venv\Scripts\python -I validate.py
```

`python -m unittest test_verifier` usa por padrão a demo da última execução
(`evidence/LATEST.txt`), que inclui `mmr-packages.json`; `PILOT_DEMO_DIR`
substitui esse padrão.

Este é um workspace Cargo isolado com lockfile próprio. Não modifica o lockfile,
políticas ou configuração operacional do workspace principal.

## Comandos individuais

```powershell
cargo test --locked -- --nocapture
cargo build --release --locked --bins
target/release/export-package.exe evidence/minha-demonstracao
python verify_package.py evidence/minha-demonstracao/package.json --trust evidence/minha-demonstracao/DEMO-TRUST-NOT-PRODUCTION.json
target/release/run-client.exe evidence/minha-demonstracao/artifact.json evidence/minha-demonstracao/DEMO-TRUST-NOT-PRODUCTION.json evidence/minha-demonstracao/client-audit.jsonl camera
```

Use uma pasta nova para cada exportação. No Linux, remova `.exe`.
O verificador exige `--trust`: nunca descobre confiança no pacote. Por padrão,
confere frescor contra o relógio atual. Para auditar um pacote de laboratório
antigo, `--historical-at SEGUNDOS_UNIX` torna explícito o instante histórico;
isso não demonstra validade atual.

**Todas as chaves da demonstração são públicas e determinísticas.** O exportador
gera também um arquivo de confiança para fixtures. Esse arquivo é separado do
pacote, mas sua geração não demonstra uma cerimônia independente de distribuição
de confiança. Para uso real, raízes e políticas exigem provisionamento próprio
por canal confiável. Nenhuma chave real existente foi lida ou alterada.

## Admissão e execução

O manifesto assina publisher, SHA-256 do WASM, imports e permissões. A codificação
tem domínio, contagens e comprimentos explícitos, com limites e conversões
verificadas. O checkpoint assina raiz, número de folhas e instante. A folha MMR
é a codificação assinada do manifesto; índice, formato e raiz são verificados por
`arkhe_verify_core::mmr::verify_proof_at`.

O token tem campos privados e possui uma cópia dos bytes admitidos. Cada execução
e chamada ao broker confere cliente emissor, snapshot completo de confiança,
política, validade e rollback de relógio. Alteração da configuração invalida
tokens anteriores. O guest não controla o relógio nem fornece tokens.

O runtime inspeciona imports reais do módulo e só resolve funções do host
explicitamente admitidas. Não fornece WASI, filesystem, sockets, carregador JS ou
carregador de módulos adicionais. Memória e combustível são limitados.
`arkhe.camera` e `arkhe.contacts` são **probes de laboratório**, sem acesso a
câmera ou contatos físicos: a função permitida retorna 1. O broker exige
permissão, consentimento e política; negações e permissões são gravadas em JSONL
com `sync_all`. Erro de persistência impede sucesso da chamada.

Um checkpoint vencido permite consultar metadados, expõe `EVIDENCE_DEGRADED`
e bloqueia execução e broker. Não há UI gráfica. O host do sandbox é parte da
base confiável, não um adversário coberto pelo piloto.

## Distribuição e verificador

`run-client` aceita um arquivo de artefato ou URL HTTPS (HTTP apenas em loopback).
O transporte tem timeout, limite de resposta, não segue redirects e não usa
fallback. O teste t5 inicia um servidor HTTP real, distribui o artefato, executa
o WASM admitido, encerra o servidor e observa a falha de conexão.

`verify_package.py` reimplementa a codificação e a validação MMR sem importar
código Rust. Verifica chaves pinadas, assinaturas, bundle, política, inclusão,
posição e frescor. O envelope do gate cobre os campos de evidência, inclusive
assinatura do checkpoint, índice, prova, consentimento e eventos. A própria
assinatura externa não é incluída em sua mensagem. Testes negativos adulteram
campos e também reassinam declarações semanticamente inválidas com a chave de
gate pública da fixture.

O exportador produz 26 pacotes cobrindo todas as posições de MMRs com 1, 2, 3,
5, 7 e 8 folhas, gerados pelo perfil Rust existente e conferidos pelo verificador
Python. Isto mostra consistência entre duas implementações do mesmo autor, não
interoperabilidade com terceiros.

## Garantias que não são alegadas

- Um WER ou pacote assinado autentica uma declaração, não prova execução fiel,
  ausência de ações omitidas ou correção factual do resultado.
- Há um signatário de checkpoint de laboratório; não há quorum de witnesses,
  ancoragem externa ou garantia contra split-view.
- JSONL é persistência append pelo aplicativo; não é WormGraph de produção,
  armazenamento imutável ou proteção contra administrador do host.
- O snapshot de confiança não resolve revogação offline futura. O clock do
  host é confiado; limites de CPU não constituem qualificação do host.
- Sem TCC, hardware seguro, JavaScript, integração bancária ou câmeras reais.
- Sem deploy Akash, inferência remota, medições de custo ou recuperação entre
  provedores. O HTTP local mede apenas o comportamento do transporte testado.
- Implementação separada do verificador não equivale a auditoria por outra
  pessoa ou organização. Ambos foram escritos nesta tarefa.

O diretório principal não possui Git nesta sessão. O runner registra hashes das
fontes locais e dos binários em lugar de inventar commit/tag. O lockfile registra
dependências; não há alegação de reprodução binária bit a bit.
