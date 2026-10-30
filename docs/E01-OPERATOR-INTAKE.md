# E01 C01 — coleta de revisão e ambiente

Estes modelos são formulários vazios, não evidência de revisão ou de execução.
ONB02 continua PENDING_HUMAN_REVIEW; ONB03 continua PENDING_ENVIRONMENT.
Não alteram o ZIP, tutorial, fixtures, critérios ou registro congelado da coorte.

## Preenchimento

Copiar `config/e01-operator-review-template.json` para `operator-review.json`
e `config/e01-environment-template.json` para `environment.json` em uma pasta
nova de evidências, conforme `E01-CLEAN-INSTALL-RUNBOOK.md`. Preservar os modelos.
Não incluir credenciais, chaves ou imagens de VM nos registros compartilhados.

- `null` significa não informado; nunca significa aprovação, ausência ou isolamento.
- Datas devem usar ISO 8601 com fuso explícito, preferencialmente UTC (`Z`).
- Hashes SHA-256 devem conter 64 caracteres hexadecimais e ter origem registrada.
  São hashes de distribuição/evidência; não alteram o perfil criptográfico MMR.
- Referências devem identificar documentos ou evidências existentes e sanitizadas.
- Não adicionar valores estimados como se fossem observações reais.

## ONB02 — revisão por admin

Registrar a referência do tutorial efetivamente lido, confirmação explícita de
leitura, decisão (`APPROVE`, `REJECT` ou `REQUEST_CHANGES`), data e observações
fornecidas por admin. Vincular a origem do hash esperado e a mensagem ou documento
humano que sustenta o registro. A designação anterior de admin não é aprovação.

As três funções permanecem atribuídas a admin; `independent_review` permanece
`false`. Uma aprovação do material não constitui aprovação do ensaio técnico
nem certificação de segurança. Manter o status pendente no modelo; qualquer
transição do backlog depende da revisão do registro humano preenchido e das
dependências aplicáveis no runbook, incluindo confirmação do ambiente de destino.

## ONB03 — seleção do ambiente

Registrar hipervisor e versão, identificador da VM, Windows x64 com edição,
versão/build exatos, CPU/RAM/disco e imagem de origem disponível. Registrar
origem, digest e disponibilidade de licença sem expor chaves de produto.
Informar limitações de autenticação da imagem ou de inventário ainda existentes.

O build solicitado é o build do Windows convidado: o kit inclui runtime e não
exige instalar SDKs nem compilar o projeto dentro da VM. Não confundir o host de
desenvolvimento com o ambiente limpo de execução.

Inventário, isolamento e snapshot pertencem à preparação ONB04. Os campos
correspondentes podem permanecer pendentes durante a seleção ONB03. Só substituir
`UNASSESSED` por um estado observado e descrito (`DISABLED`, `ENABLED` ou, para
rede, `DISCONNECTED`/`CONNECTED`) com método, data e evidência. Não inferir
isolamento apenas pelo nome da VM ou snapshot. Nenhum provisionamento é acionado
por preencher estes arquivos.

## Revisão do registro

Antes de avançar o backlog, conferir completude, referências, correspondência
com o kit fixado e ausência de contradições. JSON sintaticamente válido não prova
veracidade nem satisfaz sozinho os critérios de aceite. Estes modelos não
incluem validador automático de transição de estado.
