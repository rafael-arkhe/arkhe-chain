# Hotelaria — o vertical de prova

Este `vertical.yaml` é **gerado** pelo Construtor do `aegis`. A explicação
vive aqui, e não no ficheiro — porque um artefacto gerado não guarda
comentários, e perdê-los a cada guardado tornaria o ficheiro pior a cada uso
sem ninguém dar por isso.

## O que é isto

Uma hotelaria. Tem **unidades** (blocos), **quartos**, **hóspedes** e
**reservas**, e as relações entre eles. Tudo isso está no `vertical.yaml`, e
nada disso está em código.

Antes, um produto como este tinha um `seed_hotelaria.py` com algumas centenas
de linhas ao lado: uma lista de quartos em Python, outra de hóspedes, outra de
reservas, e as ligações entre eles escritas à mão. Mudar um quarto significava
abrir o Python. Hoje é acrescentar uma linha em `dados`.

## As três formas de acrescentar

| o que se quer | onde se escreve |
|---|---|
| mais um quarto, uma reserva | `vertical.yaml`, em `dados` — ou pelo Construtor |
| outra coluna na tela | o Construtor, em *Acrescentar → Tabela* |
| um produto novo | o Construtor, que **escreve o `vertical.yaml` inteiro** |

## A licença

Este vertical declara `licenca.exige: hotelaria`. Uma licença que não declare
este produto **não o instala** — e a verificação acontece antes de o banco ser
tocado, para não deixar uma ilha meio instalada.

## As verificações

`@banco`, `@catalogo` e `@isolamento` são exigidas: o banco responde, o
catálogo chegou, e o isolamento entre tenants está a funcionar. São
embutidas — a ilha confere sem depender de `psql` nem de nenhum programa da
máquina. `saude.d/exigido/psql.sh` é um drop-in que prova o mesmo por um
cliente externo, e é **opcional** porque "não deu para verificar" reprovar a
instalação numa bancada sem o cliente seria reprovar por ambiente.
