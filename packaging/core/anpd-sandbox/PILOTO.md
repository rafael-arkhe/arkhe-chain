# Piloto local antes do sandbox da ANPD

Este diretório não é o sandbox da ANPD e não é uma consulta à SERPRO. O registro de entrada é sintético. O motor suprime identificador direto e só então escreve o payload. Não há mapa reverso.

```powershell
cd packaging\core
cargo run -p arkhe-anonymize -- --input anpd-sandbox\input.json --output anpd-sandbox\released.json --report anpd-sandbox\report.json
```

`RELEASED` significa que o JSON de saída não contém o CPF formatado, o e-mail nem o telefone que entraram. Não significa dado anônimo no sentido da LGPD, nem parecer da ANPD, nem que a reidentificação foi medida. O relatório traz `anpd_submission: not_sent` e `serpro_query: false`.

Enviar este arquivo à ANPD, ou consultar a SERPRO com dado de pessoa real, é outro ato. Este piloto não o executa. Se um padrão de identificador direto permanecer, o comando sai com `REFUSED` e não escreve `released.json`.
