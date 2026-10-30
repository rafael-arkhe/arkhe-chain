# SDK cognitivo e fronteira de autoridade

Os seis módulos cognitivos dependem de `arkhe-cognition-sdk`, que expõe apenas
WorkIntent, WorkerExecutionRecord, Digest32, codificação e envelopes de evidência.
Não reexporta contratos de escrita, assinadores ou decisões de autorização.

`EvidenceReader` é um snapshot próprio e imutável, sem callback ou handle do host.
O host deve autenticar as evidências antes de construir o snapshot; o construtor
não afirma autenticidade e rejeita identidades duplicadas. Leituras retornam
referências compartilhadas. `NoSigningAuthority` possui campo privado e implementa
um contrato selado. É uma descrição da interface, não uma credencial.

Testes compile-fail verificam que consumidores não podem implementar o contrato
selado, construir o marcador, assinar, gravar ou obter acesso mutável pelo reader.
Testes de execução verificam isolamento de cópias e rejeição de duplicatas.
O gate de conformidade executa esses testes e os testes reais do ContainmentGate.

Tipos Rust não impedem código arbitrário de adicionar outra biblioteca, usar FFI,
executar processos ou acessar arquivos. A sandbox continua sendo obrigatória.
`check_boundaries.py` verifica também o grafo resolvido por Cargo, incluindo aliases,
macros e dependências transitivas, contra `config/cognition-dependencies.json`.
Mudanças de versão ou origem exigem revisão da allowlist; `--locked` mantém o
lockfile obrigatório. A inspeção textual permanece apenas como defesa adicional.
A allowlist não prova ausência de código malicioso dentro de dependências aprovadas.

## Contrato normativo da leitura de evidência

- `from_snapshot` DEVE permanecer uma construção local de dados passivos. Sua
  disponibilidade pública NÃO constitui autenticação ou admissão pelo kernel.
- O host DEVE validar a autenticidade e a integridade exigidas pelo protocolo de
  origem antes de entregar evidências à cognição, incluindo assinaturas Ed25519
  quando aplicáveis, digests BLAKE3 e unicidade de identidades. O SDK NÃO executa
  essas verificações criptográficas; o construtor apenas rejeita duplicatas.
- `get` DEVE retornar `Option<&EvidenceEnvelope>`. O snapshot NÃO DEVE expor
  escrita, referência mutável, `DerefMut` ou acesso ao armazenamento do host.
- O envelope e seus campos NÃO DEVEM introduzir mutabilidade interior, inclusive
  por `RefCell`, `Mutex`, `RwLock`, `UnsafeCell` ou wrappers indiretos. O teste de
  esquema decompõe todos os campos sem `..`, exige tipos exatos de dados próprios
  e verifica `Digest32` até `[u8; 32]`. Novos campos exigem revisão explícita.
- Os testes negativos DEVEM cobrir atribuição de campo, substituição do registro
  e mutação dos campos `String` e `Vec` pelo retorno compartilhado de `get`.
  Uma leitura válida também DEVE compilar e executar. Os testes `compile_fail`
  confirmam rejeição; rustdoc não fixa o diagnóstico exato do compilador.
- A allowlist DEVE ser descrita como controle do grafo de dependências resolvidas,
  versões, origens e caminhos locais. Ela NÃO audita o código interno das crates
  aprovadas nem certifica ausência de lógica de assinatura ou comportamento malicioso.
- O runtime DEVE impor o isolamento de recursos, arquivos, processos e rede.
  O ContainmentGate DEVE controlar a admissão de efeitos protegidos; ele NÃO
  substitui o isolamento do sistema operacional. Estes testes não certificam a
  implantação de gVisor, runwasi ou WASM, nem contenção de execução arbitrária.

## Estado conferido

Não existem self_model.rs, simulator.rs ou dream_rsi.rs nesta árvore. A função
metacognitiva assess ainda usa confiança fixa; simulate e propose são interfaces
básicas. Este SDK não implementa calibração histórica, Dream-RSI, quórum humano,
novos mecanismos de pinning ou uma prova de eficácia em nível de AGI. Propostas
continuam sem autorização: o kernel mantém a decisão de admissão.

Validação: `python scripts/cognition_conformance.py` e
`python scripts/check_architecture.py`.

Pipeline e artefatos: [COGNITION-CI.md](COGNITION-CI.md). A execução local não
implica execução remota nem atestação criptográfica do GitHub.
