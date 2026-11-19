# Diferenças entre D001 e D002

## Diferença linha a linha, calculada

```diff
--- D001
+++ D002
@@ -1,5 +1,6 @@
-DEMONSTRAÇÃO FICTÍCIA — Relatório de atividade, versão 1.
+DEMONSTRAÇÃO FICTÍCIA — Relatório de atividade, versão 2.
 A atividade ocorreu em 3 de novembro de 2026.
-Foram registradas 18 presenças.
-O custo informado foi de R$ 1.800.
-A documentação de apoio ainda será reunida.
+O registro de atividade informa 21 presenças.
+O custo informado foi de R$ 2.100.
+O custo foi pago integralmente.
+Consulte registro_atividade.txt para data, presenças e custo informado.
```

## Campos declarados pelo operador, com localização conferível

| Campo | Antes | Depois | Justificativa disponível |
| --- | --- | --- | --- |
| Presenças | 18 presenças (D001, linha 3) | 21 presenças (D002, linha 3) | Ausente; P002 aberta |
| Custo | R$ 1.800 (D001, linha 4) | R$ 2.100 (D002, linha 4) | Ausente; P002 aberta |
| Pagamento integral | não mencionado em D001 | O custo foi pago integralmente. (D002, linha 5) | Ausente; P001 aberta |
| Fonte de apoio | ainda será reunida (D001, linha 5) | Consulte registro_atividade.txt (D002, linha 6) | Referência localizada em D003 neste lote |

A compatibilidade de um valor com outra fonte do lote não resolve a divergência
histórica nem autentica a fonte citada. O motivo da mudança só consta quando
declarado por quem a fez.
