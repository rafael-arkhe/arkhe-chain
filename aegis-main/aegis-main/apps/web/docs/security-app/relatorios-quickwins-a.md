# Relatórios/Briefings — Incremento A (datas, ícones, SelectField, pickers)

**Data:** 2026-06-29 · **Tipo:** fix/upgrade · **Escopo:** `security-app` + `ontology-module`

Quatro correções do feedback do operador sobre o motor de Document.

## #1 — Datas do PDF no fuso/idioma do operador (não "(UTC)" cru)

O PDF carimbava `Em: 2026-06-29T12:00:00 (UTC)`. Agora formata no **fuso + locale**
do operador.

- **`ontology-module` `documents/pdf.py`**: `_format_dt(value, tz, locale)` —
  ISO(UTC) → `ZoneInfo(tz)` → pt-BR `DD/MM/AAAA HH:MM` / en-US `AAAA-MM-DD HH:MM`,
  sempre com rótulo de offset (`UTC-03:00`). Default `America/Sao_Paulo` + pt-BR;
  fuso inválido cai no default; nunca levanta. `render_document_pdf(..., tz, locale)`.
- **`/notepad/{id}/pdf`**: aceita `tz` (IANA) + `locale` query.
- **frontend**: `Notepad.pdfUrl(id, {tz, locale})`; `/relatorios` e `/briefings`
  passam `Intl.DateTimeFormat().resolvedOptions().timeZone` + locale ativo.

## #2 — Ícones dos widgets (fim da "repetição")

Causa-raiz: `lib/icon-by-name.tsx` registrava só 48 ícones — **~30 ícones de widget
declarados não estavam no registro e caíam todos em `Shield`** (a "repetição" na
paleta). Registrados todos os ícones faltantes + diferenciados duplicados do editor
de documento (`map_live`→map-pin, `pdf_viewer`→file, `slate_chart`→bar-chart-3) e
preenchidos os sem-ícone (`object_card`, `timeline`). Guarda:
`widget-icons-parity.test` (todo widget declara ícone e ele resolve, sem Shield).

## #5 — Classificação e Marcações por combobox de busca

`/relatorios`: a **classificação** virou `SelectField` (combobox sólido com busca,
fim do `<select>` nativo) e as **marcações** viraram um popover de busca (catálogo
`Markings.list()`), no lugar do mural de chips — escala para dezenas de marcações.
Mesmo padrão do `/buscar` (`feedback_no_manual_technical_input`).

## #7 — Campos de dado por picker, não input cru

Seletores de campo que eram texto livre viraram o picker `property` (resolve as
propriedades do **contrato do tipo** via `typeFrom='source'`): `chart_xy`
(x/y_field), `pivot_table` e `heatmap` (row/col/value_field), `slate_chart`
(x_field). `object_action_button.action_id` → picker `action-type`. No editor de
documento, `WidgetSectionEditor` injeta uma **variável objectSet sintética**
(`{external_id:'doc_data', kind:'objectSet', spec:{object_type: section.object_type}}`)
para os pickers `property` resolverem o tipo da seção. Guarda:
`widget-lookup-fields.test`.

## Verificação

- **pytest/standalone** `_format_dt` (pt-BR/SaoPaulo, en-US/NewYork, defaults,
  fuso inválido, vazio) + PDF assinado renderiza a data formatada.
- **jest**: `widget-icons-parity` (3) · `widget-lookup-fields` (10) ·
  `relatorios-page` (atualizado p/ os comboboxes) · `select-field`/`markings`
  sem regressão · `document-widgets`/`f3-advanced-widgets` verdes. **tsc** limpo.
- **e2e** `relatorios-classificacao-marcacoes`: classificação via SelectField
  (busca→escolhe→persiste) + marcações abrem como popover de busca.
