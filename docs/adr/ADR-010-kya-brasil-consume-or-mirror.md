# ADR-010 — Consumir biblioteca KYA Brasil na v0, sem espelhar PKI

Data: 2026-10-23. Estado: decisão de arquitetura aceite; integração **não realizada**.
Escopo: futuro adaptador de principal real. Não altera o E02 congelado, o mandato
sintético ou os outcomes atuais de identidade.

## Decisão

Preferir consumir **localmente** `@kya-brasil/core`, com versão exata e lockfile
transitivo, em vez de copiar/reimplementar validação ICP-Brasil. Não adotar o
serviço hospedado, MCP, pagamentos ou atualizações automáticas neste ADR.
`0.11.0` é a versão identificada para avaliação, **não dependência instalada**.
Integração exige primeiro inspeção do tarball e testes do contrato abaixo.

## Evidência identificada

`npm view @kya-brasil/core@0.11.0 ... --json` confirmou pacote MIT, Node >=18,
repositório `github.com/celfons/kya-brasil`, diretório `packages/core`, gitHead
`7d0e7b630a9e80ff0d5830564e0a7f9ace21acd2` e integridade:

```text
sha512-Ey/P12KVBPHj4OuroluGMvc2IUkuSj4QORw0uyUyOZbIyrYiDDaTRVnQGu8nVFrxlWMRgF/o/IEn8y8h9kqDhQ==
```

O README upstream descreve cadeia ICP-Brasil, CRL, cadastro e credenciais
Ed25519; o entrypoint exporta módulos separados para essas funções. Isto é
evidência de documentação/publicação externa, **não** execução de certificados,
interoperabilidade com Arkhe ou auditoria independente. Não se instalou o
pacote nem se executaram scripts do fornecedor.

## Alternativas e confiança

| Opção | Código e operação | Confiança criptográfica |
|---|---|---|
| Biblioteca local — escolhida para avaliação | Arkhe executa dependências upstream e mantém policy, fetching, limites e cache | ACs autenticadas, chave/prova do titular, issuer de credencial explicitamente confiável |
| Serviço hospedado — não escolhido | Operador externo emite/asserta resultados; verificar a sua assinatura e contrato | Acrescenta chave do issuer/serviço e confiança nos seus resultados |
| Espelho/fork — não escolhido | Arkhe mantém parser, validação, patches e testes | Continua a depender das ACs e policy; copiar código não remove risco de supply chain ou bugs |

Mantenedores/npm são uma dependência de **supply chain**, não substitutos das
ACs como trust anchors. Consumir e espelhar ambos exigem raízes PKI confiáveis;
o que muda é quem mantém o código e, no caso hospedado, quem valida/atesta.
A versão exata não fixa transitivas: o pacote declara intervalos para várias
dependências (`pkijs`, `asn1js`, `@peculiar/*`, `viem`); lockfile e integridade
devem cobrir a resolução completa. Não há estimativa comprovada de “horas”.

## Contrato exigido antes de ativar o adaptador

- Obter/autenticar âncoras por canal próprio e fixar issuer/policy; não confiar
  em cadeia ou raiz incluídas pelo agente como bootstrap de confiança.
- Validar assinatura de posse da chave vinculada a desafio, agente e mandato;
  validar apenas o certificado público não demonstra autorização.
- Validar cadeia, validade/usos, CRL assinada/issuer/período e ligação ao serial.
- Tratar cadastro, revogação de certificado e estado da credencial como eixos
  separados. Falha de rede/cache não significa certificado inválido ou revogado.
- Expor origem, instante da observação assinada, obtenção local e `max_age`
  por eixo. `fetched_at` não substitui `observed_at`; ausência de tempo confiável
  ou resultado fresco impede upgrade do eixo para verificado.
- Indisponibilidade produz `NOT_CHECKED` naquele eixo; assinatura/cadeia inválida
  produz falha de validação. Se o consumidor exige o eixo, ambos bloqueiam aceitação.
- Não publicar CPF/CNPJ ou hash enumerável em logs públicos; usar fixtures sem
  dados reais. Testar válido, revogado, expirado, issuer errado, mandato trocado,
  replay, fonte indisponível e snapshot obsoleto, com evidência verificável.

## Consequências

Não existe ainda `AuthorizedBy` operacional ou `VERIFIED_ICP_BRASIL` no Arkhe.
O passaporte e o recibo não serão fundidos para acomodar a dependência. A escolha
entre contêiner e referência por digest permanece gate próprio de produto/schema.
Anúncio de mercado ou semelhança de campos não demonstra aceitação por provider.

Fontes primárias: [repositório upstream](https://github.com/celfons/kya-brasil),
[pacote npm](https://www.npmjs.com/package/@kya-brasil/core/v/0.11.0).
