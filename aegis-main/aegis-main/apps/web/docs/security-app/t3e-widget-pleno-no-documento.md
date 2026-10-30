# T3-E — Seção de documento = qualquer widget do catálogo pleno

**Data:** 2026-06-29 · **Tipo:** feature · **Escopo:** `security-app`

O compositor de documento (/relatorios, apresentado em /briefings) tinha 3 tipos
rasos (Narrativa IA / Texto / "Objeto" com 5 widgets à mão). Agora a seção
**Widget** oferece o **catálogo PLENO** (~45 widgets proposable), reusando o motor
do Workshop — sem reinventar engine.

## O que mudou (visível no editor)

- Botão **Adicionar → Widget** abre a **palette plena** agrupada (Conteúdo / Dados
  / Visualização / Filtros / Incorporado): texto, callout, separador, citação,
  imagem, KPIs, `object_table_v2`, `chart_xy`/`vega_chart`, `geo_map`, `timeline`,
  `network_graph`, `property_list`, `object_view`/`card`, etc.
- Escolhido o widget: **render ao vivo** + **Configurar** (`PropFieldEditor` sobre o
  `config_schema` do widget, o mesmo inspector do Workshop/Páginas) + **Ligar à
  ontologia** (`ObjectPicker`) para os widgets que consomem dado.
- Render reusa `getWidgetComponent` (mesmo caminho do `MiniWidgetPreview`);
  apresentação em /briefings + /m via `SectionsPreview` → `WidgetSectionView`.

## Peças reusadas (zero engine novo)

`getRegisteredWidgets`/`getWidgetComponent`/`getWidgetMeta` (registry) ·
`PropFieldEditor` (config) · `ObjectPicker` (bind) · catálogo `widget-catalog.json`
(proposable + inputs tipados, p/ auto-fiar o dado). Import side-effect do barrel
`@/components/workshop/widgets` popula o REGISTRY na palette.

## Decisões / limites do v1

- **Palette = ícone + label** (não thumb ao vivo): renderizar 45 widgets ao vivo na
  palette aninhava `<button>` em `<button>` e quebrava em widgets que usam `useAuth`
  fora de provider. Ícone+label é robusto e barato; preview ao vivo só do widget
  escolhido (com **error boundary** — um widget que estoura não derruba o documento).
- **Binding de dado client-side:** widgets de objeto-único (object_view/card/
  property_list/comments) resolvem via `Ontology.getNode`; object_set por
  `Ontology.neighbors`. Sem binding, o widget mostra a pré-visualização (mockVariables)
  com aviso honesto. Object-set filtrado/agregação via `POST /notepad/{id}/evaluate`
  é o próximo passo (engine de evaluate do Workshop).
- **'embed' (T3-C, 5 widgets) vira legado:** não é mais oferecido em novas seções,
  mas continua renderizável (sem quebrar documentos existentes).

## Verificação

- **tsc** `--noEmit` limpo.
- **jest** relatorios 8/8 (inclui "palette PLENA + render ao vivo"), briefings 4/4,
  document-widgets 4/4, widget-catalog-parity 4/4.
- **e2e** `relatorios-widget-palette` (admin, dev server real): Adicionar → Widget →
  palette com callout/object_table_v2/chart_xy → escolhe callout → renderiza ao vivo.

## Próximo

- `POST /notepad/{id}/evaluate` (object-set filtrado/agregação ao vivo via engine de
  evaluate) + mais blocos-base estilo Google Docs (checklist, bloco de código,
  quebra-de-página).
