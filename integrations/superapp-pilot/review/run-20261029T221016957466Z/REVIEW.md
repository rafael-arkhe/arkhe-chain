# Material para revisão interna

Snapshot original: run-20261029T220716780729Z. Complemento: run-20261029T221016957466Z.

Os logs originais e o trust file já existiam no workspace; agora estão reunidos
no ZIP, com fontes e binários Windows. Não há PR aberto nem commit/tag.

- original-run/results.json: comandos e códigos de saída originais.
- original-run/rust-tests.log e python-tests.log: 12 e 13 testes, respectivamente.
- original-run/demo/: pacote, trust DEMO, audit JSONL e 26 pacotes MMR.
- original-run/verify-independent.log: verificação atual realizada naquela execução.
- supplement/historical-verification.log: nova conferência no instante histórico explícito.
- supplement/hash-checks.json: conferência dos hashes originais contra arquivos atuais.
- supplement/http-online.log e http-offline.log: comando exato, stdout, stderr e códigos de saída da reprodução HTTP.
- supplement/http-result.json: servidor encerrado, falha de conexão e log sem nova execução.
- docs/SCHEMA-v1.md: schema e mensagens assinadas.
- sources/: arquivos identificados pelo manifesto de hashes original, preservando caminhos.
- bin/: executáveis Windows release identificados pelo manifesto original.

Reprodução histórica, na raiz do ZIP após extrair:

```powershell
python sources/integrations/superapp-pilot/verify_package.py original-run/demo/package.json --trust original-run/demo/DEMO-TRUST-NOT-PRODUCTION.json --historical-at 1793311663
```

Instale as dependências Python listadas em sources/integrations/superapp-pilot/requirements-verifier.txt.
O snapshot de fontes inclui apenas o piloto e seus crates locais necessários,
não todos os membros do monorepo. Para rebuild Cargo com o manifesto raiz
original, aplique o snapshot em um checkout completo do Arkhe correspondente.
Os executáveis Windows e o verificador Python podem ser conferidos diretamente.

Os hashes de transporte detectam alteração de arquivos, não autenticam a origem:
o próprio inventário precisa de canal confiável. Chaves DEMO são públicas e
determinísticas. Não houve cerimônia independente de confiança, auditor externo
humano, deploy Akash, TCC ou comprovação de execução fiel. O estado permanece
validação interna executada, disponível para revisão externa.
