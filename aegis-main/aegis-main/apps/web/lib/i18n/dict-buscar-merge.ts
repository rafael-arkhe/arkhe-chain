/**
 * i18n — MERGE governado /buscar → objeto da ontologia (P4 ELO 2, 2026-06-27).
 *
 * Cobre o fluxo PRÉVIA→confirmar do detalhe do /buscar:
 *   - alvo        · auto-sugerir + picker manual + criar novo (os três caminhos).
 *   - prévia      · tabela campo-a-campo (atual | novo | situação) + resolução.
 *   - aplicar     · grava pelo pipeline governado e abre a /ficha do objeto.
 *   - vínculo     · cria uma relação objeto↔objeto (confirmModal).
 *
 * Mesclado em DICT via spread em dict.ts. pt-BR default + en-US peer
 * (memória feedback_i18n_locales / feedback_ui_english_only).
 *
 * DOMÍNIO-AGNÓSTICO: nenhuma string cita um vertical — o tipo de objeto e as
 * relações vêm do DADO (ontologia), nunca hardcoded.
 */
export const BUSCAR_MERGE_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  // ── Abrir / cabeçalho ──────────────────────────────────────────────────
  'buscar.merge.abrir': {
    'pt-BR': 'Mesclar na ontologia',
    'en-US': 'Merge into ontology',
  },
  'buscar.merge.titulo': {
    'pt-BR': 'Mesclar na ontologia',
    'en-US': 'Merge into ontology',
  },
  'buscar.merge.descricao': {
    'pt-BR': 'Projeta este resultado num objeto canônico da ontologia. Nada é gravado até você revisar e aplicar.',
    'en-US': 'Projects this result onto a canonical ontology object. Nothing is written until you review and apply.',
  },
  'buscar.merge.fechar': {
    'pt-BR': 'Fechar',
    'en-US': 'Close',
  },
  'buscar.merge.carregando': {
    'pt-BR': 'Carregando…',
    'en-US': 'Loading…',
  },

  // ── Tipo de objeto (node_type) ─────────────────────────────────────────
  'buscar.merge.tipoObjeto': {
    'pt-BR': 'Tipo de objeto',
    'en-US': 'Object type',
  },
  'buscar.merge.nenhumTipo': {
    'pt-BR': 'Nenhum tipo de objeto declarado na ontologia.',
    'en-US': 'No object type declared in the ontology.',
  },

  // ── Resolução do alvo (auto-sugerir / picker / criar novo) ─────────────
  'buscar.merge.alvoTitulo': {
    'pt-BR': 'Objeto de destino',
    'en-US': 'Target object',
  },
  'buscar.merge.sugestaoTitulo': {
    'pt-BR': 'Objeto sugerido',
    'en-US': 'Suggested object',
  },
  'buscar.merge.sugestaoPergunta': {
    'pt-BR': 'É este?',
    'en-US': 'Is this the one?',
  },
  'buscar.merge.ehEste': {
    'pt-BR': 'É este',
    'en-US': "It's this one",
  },
  'buscar.merge.buscarOutro': {
    'pt-BR': 'Buscar outro',
    'en-US': 'Find another',
  },
  'buscar.merge.criarNovo': {
    'pt-BR': 'Criar novo objeto',
    'en-US': 'Create new object',
  },
  'buscar.merge.semSugestao': {
    'pt-BR': 'Nenhum objeto parecido. Crie um novo ou busque manualmente.',
    'en-US': 'No similar object. Create a new one or search manually.',
  },
  'buscar.merge.compatibilidade': {
    'pt-BR': 'compatibilidade',
    'en-US': 'match',
  },
  'buscar.merge.alternativas': {
    'pt-BR': 'Outros parecidos',
    'en-US': 'Other matches',
  },
  'buscar.merge.criarNovoDe': {
    'pt-BR': 'Será criado um objeto novo',
    'en-US': 'A new object will be created',
  },
  'buscar.merge.atualizarExistente': {
    'pt-BR': 'Atualizará o objeto existente',
    'en-US': 'Will update the existing object',
  },

  // ── Prévia campo-a-campo ───────────────────────────────────────────────
  'buscar.merge.previaTitulo': {
    'pt-BR': 'Prévia das mudanças',
    'en-US': 'Preview of changes',
  },
  'buscar.merge.previaErro': {
    'pt-BR': 'Falha ao gerar a prévia.',
    'en-US': 'Failed to generate the preview.',
  },
  'buscar.merge.col.propriedade': {
    'pt-BR': 'Propriedade',
    'en-US': 'Property',
  },
  'buscar.merge.col.atual': {
    'pt-BR': 'Atual',
    'en-US': 'Current',
  },
  'buscar.merge.col.novo': {
    'pt-BR': 'Novo',
    'en-US': 'New',
  },
  'buscar.merge.col.situacao': {
    'pt-BR': 'Situação',
    'en-US': 'Status',
  },
  'buscar.merge.status.novo': {
    'pt-BR': 'novo',
    'en-US': 'new',
  },
  'buscar.merge.status.igual': {
    'pt-BR': 'igual',
    'en-US': 'same',
  },
  'buscar.merge.status.conflito': {
    'pt-BR': 'conflito',
    'en-US': 'conflict',
  },
  'buscar.merge.status.erro': {
    'pt-BR': 'erro de formato',
    'en-US': 'format error',
  },
  'buscar.merge.vazio': {
    'pt-BR': 'Nada a aplicar — o resultado não projetou nenhuma propriedade.',
    'en-US': 'Nothing to apply — the result projected no property.',
  },

  // ── Resolução de conflito por campo ────────────────────────────────────
  'buscar.merge.resolver.manter': {
    'pt-BR': 'Manter',
    'en-US': 'Keep',
  },
  'buscar.merge.resolver.substituir': {
    'pt-BR': 'Substituir',
    'en-US': 'Replace',
  },
  'buscar.merge.resolver.anexar': {
    'pt-BR': 'Anexar',
    'en-US': 'Append',
  },

  // ── Erros de formato (bloqueiam o aplicar) ─────────────────────────────
  'buscar.merge.formatoBloqueia': {
    'pt-BR': 'Corrija os erros de formato antes de aplicar.',
    'en-US': 'Fix the format errors before applying.',
  },

  // ── Aplicar ────────────────────────────────────────────────────────────
  'buscar.merge.aplicar': {
    'pt-BR': 'Aplicar',
    'en-US': 'Apply',
  },
  'buscar.merge.aplicando': {
    'pt-BR': 'Aplicando…',
    'en-US': 'Applying…',
  },
  'buscar.merge.erro': {
    'pt-BR': 'Falha ao mesclar na ontologia.',
    'en-US': 'Failed to merge into the ontology.',
  },
  'buscar.merge.sucessoCriado': {
    'pt-BR': 'Objeto criado na ontologia.',
    'en-US': 'Object created in the ontology.',
  },
  'buscar.merge.sucessoAtualizado': {
    'pt-BR': 'Objeto atualizado na ontologia.',
    'en-US': 'Object updated in the ontology.',
  },
  'buscar.merge.campos': {
    'pt-BR': 'campos',
    'en-US': 'fields',
  },
  'buscar.merge.verFicha': {
    'pt-BR': 'Abrir ficha do objeto',
    'en-US': 'Open object record',
  },

  // ── Criar vínculo (relação objeto↔objeto) ──────────────────────────────
  'buscar.merge.vinculo.titulo': {
    'pt-BR': 'Criar vínculo',
    'en-US': 'Create link',
  },
  'buscar.merge.vinculo.descricao': {
    'pt-BR': 'Liga o objeto de destino a outro objeto da ontologia por uma relação tipada.',
    'en-US': 'Links the target object to another ontology object through a typed relation.',
  },
  'buscar.merge.vinculo.relacao': {
    'pt-BR': 'Relação',
    'en-US': 'Relation',
  },
  'buscar.merge.vinculo.relacaoPlaceholder': {
    'pt-BR': 'Escolha a relação…',
    'en-US': 'Choose the relation…',
  },
  'buscar.merge.vinculo.objeto': {
    'pt-BR': 'Objeto vinculado',
    'en-US': 'Linked object',
  },
  'buscar.merge.vinculo.semRelacoes': {
    'pt-BR': 'Este tipo de objeto não tem relações declaradas.',
    'en-US': 'This object type has no declared relations.',
  },
  'buscar.merge.vinculo.criar': {
    'pt-BR': 'Criar vínculo',
    'en-US': 'Create link',
  },
  'buscar.merge.vinculo.confirmTitulo': {
    'pt-BR': 'Criar vínculo entre objetos?',
    'en-US': 'Create link between objects?',
  },
  'buscar.merge.vinculo.confirmDesc': {
    'pt-BR': 'A relação será gravada no grafo da ontologia pelo pipeline governado. É idempotente.',
    'en-US': 'The relation will be written to the ontology graph through the governed pipeline. It is idempotent.',
  },
  'buscar.merge.vinculo.confirmar': {
    'pt-BR': 'Criar vínculo',
    'en-US': 'Create link',
  },
  'buscar.merge.vinculo.criado': {
    'pt-BR': 'Vínculo criado.',
    'en-US': 'Link created.',
  },
  'buscar.merge.vinculo.erro': {
    'pt-BR': 'Falha ao criar o vínculo.',
    'en-US': 'Failed to create the link.',
  },

  // ── ObjectPicker standalone ────────────────────────────────────────────
  'buscar.merge.picker.placeholder': {
    'pt-BR': 'Buscar objeto por nome…',
    'en-US': 'Search object by name…',
  },
  'buscar.merge.picker.buscando': {
    'pt-BR': 'Buscando…',
    'en-US': 'Searching…',
  },
  'buscar.merge.picker.vazio': {
    'pt-BR': 'Nenhum objeto encontrado.',
    'en-US': 'No object found.',
  },
  'buscar.merge.picker.erro': {
    'pt-BR': 'Falha ao buscar objetos.',
    'en-US': 'Failed to search objects.',
  },
  'buscar.merge.picker.criarNovo': {
    'pt-BR': 'Criar novo objeto',
    'en-US': 'Create new object',
  },
};
