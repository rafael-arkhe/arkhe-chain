# Apresentação: decisão explícita por contêiner

Escolha: **contêiner**, não referência externa por digest entre ficheiros de
transporte. `schemas/presentation.schema.json` define `format`, `label`,
`receipt`, `status`. A apresentação agrupa o recibo assinado e o seu sidecar
de estado. Não duplica modelo/mandato/declarações noutros campos concorrentes.

O contêiner não tem assinatura exterior. O verificador recalcula as assinaturas
dos componentes e o binding do status ao digest do recibo. O ficheiro inteiro
não é alegado como credencial W3C ou atestado de identidade legal.

Contexto e policy **não são referenciados por URLs ou digests fornecidos pelo
emissor dentro da apresentação**: são inputs externos confiáveis do consumidor.
O state file também não acompanha a apresentação. Incluir `context`, `policy`
ou `declaration` como campos adicionais é rejeitado. Essa escolha impede que
o emissor escolha as chaves, a root, o relógio ou a política que o aprovariam.

O recibo mantém o seu compromisso sobre modelo/mandato; o status assina digest,
lista, índice e propósito. O parser rejeita perfil/label incompatíveis e campos
duplicados. Verificação permanece limitada aos mecanismos implementados.
