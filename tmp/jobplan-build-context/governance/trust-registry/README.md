# Registro independente — não provisionado

`public-keys.json` é um candidato tipado com `keys: []` e quórum mínimo de dois.
Ele é intencionalmente incapaz de aprovar um perfil. Não há chaves privadas neste
diretório. Não foram criados `public-keys.sig` nem uma ancoragem de transparência.

`REGISTRY-DIGEST.txt` é somente a identidade canônica do candidato vazio; **não é
um pin confiável** e não deve ser usado como aprovação ou prova de ancoragem.

A administração independente deve definir:

- ID, versão, quórum e responsáveis do registro;
- chaves públicas Ed25519, IDs únicos, escopo `policy_ids`, estado e validade;
- assinatura administrativa e procedimento de verificação;
- ancoragem auditável, política de rotação/revogação e distribuição do digest por
  canal independente do perfil e do modelo;
- recarga do resolver após alterações do registro.

O código valida o quórum e o pin fornecido. Ele não pode provar que duas chaves
pertencem a administradores humanos diferentes nem verificar a separação de
administração apenas a partir de caminhos de arquivos.

Este repositório não gera uma raiz administrativa para dar aparência de confiança
ao próprio registro. Os responsáveis precisam provisionar a raiz real e comprovar
a aprovação/ancoragem fora do processo que propõe a classificação.

O pin confiável identifica este registro, não o perfil. Rotação, revogação ou
qualquer alteração do conteúdo requerem distribuir o novo pin pelo canal
independente e substituir o resolver verificado. As aprovações do perfil vinculam
o digest do registro: para usar o registro alterado, recolha novas aprovações.
O digest local do candidato vazio não substitui esse procedimento.

Expiração é conferida em cada autorização; revogação depende de recarga. Não há
TTL de snapshot nem `revocation_epoch` implementados. O operador ainda precisa
definir a latência máxima aceitável, a frequência de recarga e o comportamento
quando a atualização falha antes de autorizar uso em produção.
