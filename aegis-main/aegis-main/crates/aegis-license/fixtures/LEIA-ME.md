# Fixtures de licença

Gerados por `ferramentas/gerar-fixtures.mjs`, que chama o **emissor de
verdade** (`aegis-cli/src/licenca.js`). Não reescreva estes ficheiros à mão:
um fixture escrito à mão prova só que o verificador concorda consigo mesmo.

## As chaves são de TESTE

`chaves/vendor-teste.key` é uma raiz **que não é a de produção**, e é
publicada aqui de propósito. A raiz de produção é a que vai embutida no
binário, e o que ela assina vale na máquina de um cliente. Um fixture
assinado por uma raiz que não é a de produção é recusado — e essa recusa é
uma das provas do verificador.

## O que estes fixtures provam

- que a forma **canónica** em Rust reproduz a do emissor (a assinatura
  confere, byte a byte);
- que a cadeia **raiz do vendor → Chave OEM → licença** é conferida pela
  ordem que a casa mediu;
- que a recusa por **fingerprint**, **vertical** e **expiração** funciona.

## O que eles NÃO provam

- que a chave privada de produção produz fixtures — isso é o mesmo código
  com outra chave;
- que a renovação por envelope (`resposta`) está coberta — ainda não é;
- que o ledger do `frota-api` é o dono da revogação. A casa já mediu que
  **o servidor nunca assina**: a raiz do vendor não entra em contentor nem
  em banco.
