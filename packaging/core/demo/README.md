# Demo de um byte

Dois contrastes sobre a fixture de `fixtures/gate0`, cada um de um bit.

**O assunto.** O arquivo intacto confere. Um byte do assunto, invertido, faz a admissão ir a `FAIL` — e a assinatura dela continua `PASS`: ela cobre o hash antigo, não o arquivo que você está segurando. A âncora do commit original continua `INCONCLUSIVE`. Ela não promove o byte novo.

**A ação de agente.** O mesmo recibo, as mesmas chaves, vai de `INCONCLUSIVE` a `PASS` só porque um veredito assinado por outro papel o acompanha e você nomeou qual invariante exige. Um byte do artefato, invertido, leva de volta a `FAIL`: o veredito nomeia um digest, e não descarrega bytes que você não tem. A assinatura segue `PASS` nos dois casos.

```powershell
cd packaging\core
cargo build -p arkhe-provenance-mcp
python demo\tamper.py
```

Oito linhas de veredito e um tempo. A última, quando os dois contrastes fecham, é `FAILED no byte adulterado; a ancora nao cobre esse byte, e o veredito nao descarrega bytes que voce nao tem`. O script sai 1 se qualquer uma das dezessete condições esperadas mudar.

Isto não é campanha medida, nem prova de que o efeito ocorreu, nem confirmação de transporte. E não roda invariante nenhum: o veredito da fixture é um recibo assinado, não uma execução.
