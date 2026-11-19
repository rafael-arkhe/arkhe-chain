# Oferta

A frase canônica, no registro de claims, em inglês:

> Arkhe links protected actions to signed evidence and explicit policy decisions, with portable verification against independently configured trust roots.

Em português, para a conversa:

> O Arkhe liga uma ação protegida a evidência assinada e a uma decisão explícita de política, com verificação portátil contra raízes de confiança configuradas à parte.

## Três durações da mesma frase

Reunião, para quem decide: antes de uma saída de modelo virar efeito, a equipe vê quais bytes foram conferidos, qual chave assinou, por que essa chave é confiável, qual política autorizou a ação e o que foi observado sobre a execução. Um terceiro confere o mesmo pacote fora da sessão de quem gerou.

Operação, para quem implanta: no Intra local, autoria, revisão e governança assinam com Ed25519. A publicação no Rekor só segue se estiver configurada. O pacote JSON exportado é verificado offline. O assistente não assina e não admite.

Trinta segundos: o Arkhe registra a decisão de deixar passar uma ação e entrega um verificador que viaja com o artefato.

## Para quem, no lugar de quê

Hipótese, até uma conversa no roteiro de [piloto.md](piloto.md) confirmar:

Para uma equipe que precisa admitir ou recusar uma saída de modelo antes que ela vire efeito, no lugar de aceitar o texto do modelo, um atestado genérico do fornecedor ou uma revisão que não deixa pacote conferível, porque o checker é separado de quem produziu e roda contra a chave e a política que a própria equipe configurou.

Quem fica de fora desta hipótese: quem procura certificação regulatória, custódia jurídica, garantia de que a infraestrutura não falha, ou um agente autônomo que decida sozinho.

## O que a demo sustenta

Fluxo em `apps/arkhe-intra`, em `http://127.0.0.1:3003` depois de `pnpm intra:prepare` e `pnpm dev:intra`.

1. Autoria cria a minuta e assina o envio à revisão.
2. Revisão assina.
3. Governança assina a aprovação.
4. Ancoragem e publicação só ocorrem com Rekor configurado. Sem isso, a aprovação fica e a publicação bloqueia.
5. O pacote JSON sai para verificação independente. O laudo A4 é a leitura humana do mesmo rastro.

A confiança que permanece com o comprador: a chave, a política aprovada e a máquina em que isso roda. O Arkhe não substitui os três.

## Fora da oferta

- Dever fiduciário, custódia ou certificado de conformidade.
- Verificação de documento oficial. A PoC em `integration/arkhe-gov` confere quatro payloads sintéticos. Não é verificador do CIN nem do VIO.
- AGI, orquestração autônoma em produção, ou modelo com autoridade de escrita.
- Cadeia institucional em produção, PSP, validação X.509/ICP-Brasil.
- Preço, margem, royalty ou participação em receita. A especificação de 21/10/2026 permite experimentar uma fórmula e não adota nenhuma.
- Salesforce, créditos de nuvem ou implantação no ambiente do comprador como parte desta oferta. A ponte Salesforce de 25/10/2026 é local e não teve deploy em org.

## Por que agora, como hipótese

Modelos já produzem texto que equipes tratam como decisão. O rastro assinável e o checker portátil são o que o repositório executa hoje. “Por que agora” vira frase de slide só quando uma pessoa de fora descrever a última vez em que uma saída virou efeito sem conferência.
