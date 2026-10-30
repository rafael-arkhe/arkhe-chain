# Licença deste fork

## O que é

Um fork de **[OpenMausBot](https://github.com/milind-soni/OpenMausBot)**, sob
**Apache License 2.0**, pela Safe Core Technologies.

- upstream: <https://github.com/milind-soni/OpenMausBot>
- commit de origem: `863f94c5dc8558fd3d14084852d757f08267ec4d`
- data da cópia: 2026-09-30
- licença do upstream: `LICENSE` (Apache-2.0, © 2026 Milind Soni e contribuidores)

## O que a Apache-2.0 exige, e o que foi feito

A §4 da licença exige manter as condições e declarar as alterações. Todas:

| exigência | onde está |
|---|---|
| manter a licença, com o texto | `LICENSE` — **inalterada** |
| manter os avisos de copyright | `NOTICE` — **inalterado** |
| declarar as alterações | este ficheiro, e `LEIA-ME.md` |

O `NOTICE` do upstream atribui também o **T3 Code** (MIT) e o **hpke-js**
(MIT), os **Simple Icons** (CC0) e os **Lobe Icons** (MIT), e o
`third_party/` traz a proveniência do runtime do `cua-driver` (MIT, SIL OFL,
MPL-2.0) com o inventário CycloneDX. Nada disto foi tocado: são avisos de
terceiros e mexer neles é tirar a atribuição.

## O que **não** foi feito, e porquê

🔴 **A pasta `enterprise/` foi apagada.** Não é Apache-2.0 — é a
`OpenMausBot Enterprise License`, e o próprio `LICENSING.md` do upstream diz:

> *"Running its features in production needs a license key issued for your
> organisation. Hosting it for third parties or white-labelling the product
> needs a partner agreement."*

E, na mesma página:

> *"Delete the folder and what remains is the open-source edition."*

Um fork **sem** `enterprise/` é a edição de código aberto, e é a única forma de
a Safe Core ter o produto sem um acordo de parceiro que não existe.

🔴 **A marca não é da Apache-2.0.** A §6 diz explicitamente que a licença não
concede direitos de marca, e o `LICENSING.md` do upstream acrescenta:

> *"The OpenMausBot name and mascot are trademarks of Milind Soni … a product
> built on OpenMausBot needs its own name unless a partner agreement says
> otherwise."*

Por isso o que o operador vê é **AEGIS**. `MAUS`, `SupaMaus` e o mascote não
são usados, e nenhuma referência a eles sobrevive no ecrã.

## AGPL

🔴 **A extensão de percepção do `cua-driver` (OmniParser) é AGPL-3.0 e não
entra.** O driver é MIT e entra como dependência; a extensão de visão não, e
é uma decisão escrita antes de qualquer código — porque a consequência de
redistribuir AGPL aparece no dia da entrega e não no dia do código.

## Obrigações de uma peça de terceiros

O runtime do `cua-driver` que o upstream empacota (MIT, SIL OFL 1.1,
MPL-2.0) traz o inventário e os avisos em `third_party/cua-driver/`, e o
empacotador verifica versão, tamanho e sha256 da fonte antes de a usar. Isso
mantém-se: o fork não baixa nem auto-atualiza código nativo.

## Divergência

O que este fork mexeu no upstream está em `equipa/PATCHES-AEGIS.md`, e
`ferramentas/divergencia.sh` mede o afastamento. Acima do orçamento, o fork
deixa de sincronizar — e a decisão de assumir isso é do dono, não da
ferramenta.
