/**
 * Dicionário i18n — /relatorios (Notepad governado) · P5 Onda 4 (2026-06-27).
 *
 * Cobre: classificação (nível CBAC + marcações), banner via PageShell, e o
 * "compilar a partir de um nó" (embutir widgets genéricos do objeto). pt-BR
 * default + en-US peer (feedback_i18n_locales / feedback_ui_english_only).
 */
import type { Locale } from './dict';

export const RELATORIOS_DICT: Record<string, Record<Locale, string>> = {
  'relatorios.title': { 'pt-BR': 'Relatórios', 'en-US': 'Reports' },
  'relatorios.subtitle': {
    'pt-BR': 'Documentos governados — versionados, classificados e marcáveis.',
    'en-US': 'Governed documents — versioned, classified and markable.',
  },
  'relatorios.docs': { 'pt-BR': 'Documentos', 'en-US': 'Documents' },
  'relatorios.empty': { 'pt-BR': 'Nenhum relatório. Crie um.', 'en-US': 'No reports. Create one.' },
  'relatorios.newTitle': { 'pt-BR': 'Título do relatório', 'en-US': 'Report title' },
  'relatorios.selectOrCreate': { 'pt-BR': 'Selecione ou crie um relatório.', 'en-US': 'Select or create a report.' },
  'relatorios.view': { 'pt-BR': 'Visualizar', 'en-US': 'Preview' },
  'relatorios.edit': { 'pt-BR': 'Editar', 'en-US': 'Edit' },
  'relatorios.pin': { 'pt-BR': 'Fixar', 'en-US': 'Pin' },
  'relatorios.removeConfirm': { 'pt-BR': 'Remover este relatório?', 'en-US': 'Remove this report?' },
  'relatorios.removed': { 'pt-BR': 'Relatório removido.', 'en-US': 'Report removed.' },
  'relatorios.savedPrefix': { 'pt-BR': 'Salvo', 'en-US': 'Saved' },
  'relatorios.createFail': { 'pt-BR': 'Falha ao criar.', 'en-US': 'Failed to create.' },
  'relatorios.saveFail': { 'pt-BR': 'Falha ao salvar.', 'en-US': 'Failed to save.' },
  'relatorios.fail': { 'pt-BR': 'Falha.', 'en-US': 'Failed.' },
  'relatorios.classification': { 'pt-BR': 'Classificação', 'en-US': 'Classification' },
  'relatorios.markings': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'relatorios.titlePlaceholder': { 'pt-BR': 'Título do relatório', 'en-US': 'Report title' },
  'relatorios.bodyPlaceholder': {
    'pt-BR': 'Escreva em markdown… (# título, **negrito**, - lista)',
    'en-US': 'Write in markdown… (# heading, **bold**, - list)',
  },
  'relatorios.emptyDoc': { 'pt-BR': 'Documento vazio.', 'en-US': 'Empty document.' },
  // Compilar a partir de um nó (embutir widgets genéricos do objeto).
  'relatorios.insertObject': { 'pt-BR': 'Inserir objeto', 'en-US': 'Insert object' },
  'relatorios.insertHint': {
    'pt-BR': 'Escolha um objeto da ontologia e a visão a embutir. O relatório reflete os dados ao vivo.',
    'en-US': 'Pick an ontology object and the view to embed. The report reflects live data.',
  },
  'relatorios.pickWidget': { 'pt-BR': 'Tipo de visão', 'en-US': 'View kind' },
  'relatorios.embedInserted': { 'pt-BR': 'Objeto embutido no relatório.', 'en-US': 'Object embedded in the report.' },
  'relatorios.embedFail': { 'pt-BR': 'Falha ao embutir o objeto.', 'en-US': 'Failed to embed the object.' },
  'relatorios.widget.object_table': { 'pt-BR': 'Propriedades', 'en-US': 'Properties' },
  'relatorios.widget.vizinhos': { 'pt-BR': 'Vizinhos', 'en-US': 'Neighbors' },
  'relatorios.widget.correlacao': { 'pt-BR': 'Correlação', 'en-US': 'Correlation' },
  'relatorios.widget.mapa': { 'pt-BR': 'Localização', 'en-US': 'Location' },
  'relatorios.widget.timeline': { 'pt-BR': 'Linha do tempo', 'en-US': 'Timeline' },
  // Render dos widgets embutidos (node-embed).
  'relatorios.embed.loading': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  'relatorios.embed.error': { 'pt-BR': 'Não foi possível carregar este objeto.', 'en-US': 'Could not load this object.' },
  'relatorios.embed.empty': { 'pt-BR': 'Nada a exibir.', 'en-US': 'Nothing to show.' },
  'relatorios.embed.noCoords': { 'pt-BR': 'Sem coordenadas neste objeto.', 'en-US': 'No coordinates on this object.' },
  'relatorios.embed.openFicha': { 'pt-BR': 'Abrir ficha', 'en-US': 'Open record' },
  'relatorios.embed.openGeo': { 'pt-BR': 'Ver no mapa', 'en-US': 'View on map' },
  'relatorios.embed.version': { 'pt-BR': 'versão', 'en-US': 'version' },
  'relatorios.embed.confidence': { 'pt-BR': 'confiança', 'en-US': 'confidence' },
  'relatorios.embed.unknownWidget': { 'pt-BR': 'Visão desconhecida.', 'en-US': 'Unknown view.' },
};
