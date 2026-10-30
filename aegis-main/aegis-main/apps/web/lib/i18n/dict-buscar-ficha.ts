/**
 * i18n — /buscar + /ficha (gerado da varredura adversarial 2026-06-26).
 * Mesclado em DICT via spread em dict.ts. pt-BR (default) + en-US, regra dura:
 * toda string visível via useT(). NÃO editar à mão sem motivo — preferir useT no componente.
 */
export const BUSCAR_FICHA_DICT: Record<string, { 'pt-BR': string; 'en-US': string }> = {
  "buscar.input.placeholder": {
    "pt-BR": "Buscar pessoa, placa, parlamentar, perfil…",
    "en-US": "Search person, plate, legislator, profile…"
  },
  "buscar.input.submit": {
    "pt-BR": "Buscar",
    "en-US": "Search"
  },
  "buscar.input.dossie.title": {
    "pt-BR": "Cruza dados públicos, rede social, integridade e mídia da entidade numa ficha única",
    "en-US": "Cross-references public records, social media, integrity and media for the entity into a single dossier"
  },
  "buscar.input.dossie.loading": {
    "pt-BR": "Montando…",
    "en-US": "Building…"
  },
  "buscar.input.dossie.cta": {
    "pt-BR": "Montar dossiê",
    "en-US": "Build dossier"
  },
  "buscar.input.avancada.toggle": {
    "pt-BR": "Busca avançada",
    "en-US": "Advanced search"
  },
  "buscar.input.avancada.empty": {
    "pt-BR": "Nenhuma fonte selecionada pede parâmetro próprio. Selecione fontes que exigem um dado específico (ex.: empresa → CNPJ; BNMP → nome da mãe) e os campos aparecem aqui.",
    "en-US": "No selected source requires its own parameter. Select sources that need a specific field (e.g. company → CNPJ; BNMP → mother's name) and the fields will appear here."
  },
  "buscar.input.uf.todas": {
    "pt-BR": "Todas",
    "en-US": "All"
  },
  "buscar.input.finalidade.label": {
    "pt-BR": "Finalidade",
    "en-US": "Purpose"
  },
  "buscar.input.finalidade.hint": {
    "pt-BR": "(p/ montar dossiê · LGPD)",
    "en-US": "(to build dossier · LGPD)"
  },
  "buscar.input.finalidade.tooltip": {
    "pt-BR": "A LGPD exige declarar a base legal de cada acesso a dados pessoais. A finalidade escolhida fica registrada na auditoria do dossiê (quem acessou, por quê). Sem ela o dossiê não é montado.",
    "en-US": "The LGPD requires declaring the legal basis for each access to personal data. The chosen purpose is recorded in the dossier audit trail (who accessed it, and why). Without it the dossier is not built."
  },
  "buscar.input.finalidade.aria": {
    "pt-BR": "Por que a finalidade é obrigatória",
    "en-US": "Why the purpose is required"
  },
  "buscar.input.finalidade.select": {
    "pt-BR": "Selecione…",
    "en-US": "Select…"
  },
  "buscar.input.caso.label": {
    "pt-BR": "Caso / operação",
    "en-US": "Case / operation"
  },
  "buscar.input.caso.optional": {
    "pt-BR": "(opcional)",
    "en-US": "(optional)"
  },
  "buscar.input.caso.placeholder": {
    "pt-BR": "id do caso",
    "en-US": "case id"
  },
  "buscar.filtros.classificacao": {
    "pt-BR": "Classificação",
    "en-US": "Classification"
  },
  "buscar.filtros.fontes": {
    "pt-BR": "Fontes",
    "en-US": "Sources"
  },
  "buscar.filtros.detectado": {
    "pt-BR": "Detectado:",
    "en-US": "Detected:"
  },
  "buscar.filtros.servem": {
    "pt-BR": "servem",
    "en-US": "match"
  },
  "buscar.filtros.pedemOutroDado": {
    "pt-BR": "pedem outro dado",
    "en-US": "need other data"
  },
  "buscar.filtros.salvarTooltip": {
    "pt-BR": "Salva esta busca (consulta + fontes + filtros) e a monitora — novos resultados viram alerta em /alertas",
    "en-US": "Saves this search (query + sources + filters) and monitors it — new results become alerts in /alertas"
  },
  "buscar.filtros.salvando": {
    "pt-BR": "Salvando…",
    "en-US": "Saving…"
  },
  "buscar.filtros.salvarBuscaMonitorar": {
    "pt-BR": "Salvar busca + monitorar",
    "en-US": "Save search + monitor"
  },
  "buscar.filtros.conectorIndisponivel": {
    "pt-BR": "Conector indisponível no momento (backend offline ou sem credencial).",
    "en-US": "Connector currently unavailable (backend offline or missing credential)."
  },
  "buscar.filtros.aceita": {
    "pt-BR": "Aceita:",
    "en-US": "Accepts:"
  },
  "buscar.filtros.serve": {
    "pt-BR": "serve",
    "en-US": "matches"
  },
  "buscar.filtros.requer": {
    "pt-BR": "requer",
    "en-US": "requires"
  },
  "buscar.filtros.sempre": {
    "pt-BR": "sempre",
    "en-US": "always"
  },
  "buscar.filtros.indisponivel": {
    "pt-BR": "indisponível",
    "en-US": "unavailable"
  },
  "buscar.resultados.vazio": {
    "pt-BR": "Nenhum resultado ainda. Selecione fontes, digite a busca e pressione \"Buscar\".",
    "en-US": "No results yet. Select sources, type your search, and press \"Search\"."
  },
  "buscar.resultados.contagem.singular": {
    "pt-BR": "resultado",
    "en-US": "result"
  },
  "buscar.resultados.contagem.plural": {
    "pt-BR": "resultados",
    "en-US": "results"
  },
  "buscar.resultados.builtin": {
    "pt-BR": "built-in",
    "en-US": "built-in"
  },
  "buscar.resultados.abrirNaFonte": {
    "pt-BR": "Abrir na fonte",
    "en-US": "Open at source"
  },
  "buscar.resultados.abrirFicha": {
    "pt-BR": "Abrir ficha",
    "en-US": "Open record"
  },
  "buscar.resultados.criarEntidade": {
    "pt-BR": "Criar entidade",
    "en-US": "Create entity"
  },
  "buscar.resultados.origem": {
    "pt-BR": "origem",
    "en-US": "origin"
  },
  "buscar.detalhe.titulo": {
    "pt-BR": "Detalhe",
    "en-US": "Detail"
  },
  "buscar.detalhe.vazio": {
    "pt-BR": "Clique num resultado na lista pra ver os detalhes aqui.",
    "en-US": "Click a result in the list to see its details here."
  },
  "buscar.detalhe.meta.fonte": {
    "pt-BR": "Fonte",
    "en-US": "Source"
  },
  "buscar.detalhe.meta.tool": {
    "pt-BR": "Tool",
    "en-US": "Tool"
  },
  "buscar.detalhe.meta.queryOrigem": {
    "pt-BR": "Query origem",
    "en-US": "Origin query"
  },
  "buscar.detalhe.meta.externalId": {
    "pt-BR": "External ID",
    "en-US": "External ID"
  },
  "buscar.detalhe.meta.url": {
    "pt-BR": "URL",
    "en-US": "URL"
  },
  "buscar.detalhe.abrir": {
    "pt-BR": "abrir",
    "en-US": "open"
  },
  "buscar.detalhe.abrirFicha": {
    "pt-BR": "Abrir ficha",
    "en-US": "Open record"
  },
  "buscar.detalhe.criarEntidade": {
    "pt-BR": "Criar entidade local",
    "en-US": "Create local entity"
  },
  "buscar.detalhe.enriquecerCom": {
    "pt-BR": "Enriquecer com",
    "en-US": "Enrich with"
  },
  "buscar.detalhe.payloadBruto": {
    "pt-BR": "Payload bruto",
    "en-US": "Raw payload"
  },
  "buscar.historico.toggle": {
    "pt-BR": "Histórico",
    "en-US": "History"
  },
  "buscar.historico.vazio": {
    "pt-BR": "Nenhuma busca recente.",
    "en-US": "No recent searches."
  },
  "buscar.historico.limpar": {
    "pt-BR": "Limpar histórico",
    "en-US": "Clear history"
  },
  "buscar.preflight.title": {
    "pt-BR": "Montar dossiê",
    "en-US": "Build dossier"
  },
  "buscar.preflight.entity": {
    "pt-BR": "Entidade",
    "en-US": "Entity"
  },
  "buscar.preflight.detectedType": {
    "pt-BR": "Tipo detectado",
    "en-US": "Detected type"
  },
  "buscar.preflight.explainBefore": {
    "pt-BR": "Consulta as fontes abaixo em paralelo e consolida tudo numa",
    "en-US": "Queries the sources below in parallel and consolidates everything into a"
  },
  "buscar.preflight.explainHighlight": {
    "pt-BR": "ficha única",
    "en-US": "single record"
  },
  "buscar.preflight.explainAfter": {
    "pt-BR": "(dados públicos, integridade, rede social e mídia). A falha de uma fonte não derruba o dossiê.",
    "en-US": "(public data, integrity, social media and media). The failure of one source does not bring down the dossier."
  },
  "buscar.preflight.sourcesLabel": {
    "pt-BR": "Fontes que serão consultadas",
    "en-US": "Sources to be queried"
  },
  "buscar.preflight.calculatingPlan": {
    "pt-BR": "Calculando o plano…",
    "en-US": "Calculating the plan…"
  },
  "buscar.preflight.planError": {
    "pt-BR": "Não foi possível prever as fontes — o dossiê roda normalmente mesmo assim.",
    "en-US": "Could not preview the sources — the dossier runs normally anyway."
  },
  "buscar.preflight.noSpecificSources": {
    "pt-BR": "Sem fontes específicas para este tipo — o dossiê faz uma busca ampla.",
    "en-US": "No specific sources for this type — the dossier runs a broad search."
  },
  "buscar.preflight.purposeLabel": {
    "pt-BR": "Finalidade de acesso (LGPD)",
    "en-US": "Access purpose (LGPD)"
  },
  "buscar.preflight.purposeTooltip": {
    "pt-BR": "A LGPD exige declarar a base legal de cada acesso a dados pessoais. Fica registrada na auditoria do dossiê. Obrigatória.",
    "en-US": "LGPD requires declaring the legal basis for each access to personal data. It is recorded in the dossier audit. Mandatory."
  },
  "buscar.preflight.purposePlaceholder": {
    "pt-BR": "Selecione a base legal…",
    "en-US": "Select the legal basis…"
  },
  "buscar.preflight.purposeRequiredHint": {
    "pt-BR": "Obrigatório para montar o dossiê — registrado na auditoria do acesso.",
    "en-US": "Required to build the dossier — recorded in the access audit."
  },
  "buscar.preflight.caseLabel": {
    "pt-BR": "Caso / operação",
    "en-US": "Case / operation"
  },
  "buscar.preflight.optional": {
    "pt-BR": "(opcional)",
    "en-US": "(optional)"
  },
  "buscar.preflight.casePlaceholder": {
    "pt-BR": "id do caso",
    "en-US": "case id"
  },
  "buscar.preflight.confirm": {
    "pt-BR": "Montar dossiê",
    "en-US": "Build dossier"
  },
  "buscar.preflight.sourcesWord": {
    "pt-BR": "fontes",
    "en-US": "sources"
  },
  "buscar.personalizar.button.label": {
    "pt-BR": "Personalizar detalhe de",
    "en-US": "Customize details for"
  },
  "buscar.personalizar.button.title": {
    "pt-BR": "Personalizar painel detalhe pra fonte",
    "en-US": "Customize the detail panel for source"
  },
  "buscar.personalizar.app.displayPrefix": {
    "pt-BR": "Detalhe ·",
    "en-US": "Details ·"
  },
  "buscar.personalizar.app.descriptionPrefix": {
    "pt-BR": "Substitui o painel detalhe default quando operador clica num resultado de",
    "en-US": "Replaces the default detail panel when the operator clicks a result from"
  },
  "buscar.params.header.title": {
    "pt-BR": "Parametrização da Busca",
    "en-US": "Search Parameters"
  },
  "buscar.params.header.widgetsLocked": {
    "pt-BR": "widgets bloqueados (rota de código)",
    "en-US": "widgets locked (code route)"
  },
  "buscar.params.about.title": {
    "pt-BR": "O que é isto.",
    "en-US": "What this is."
  },
  "buscar.params.about.body": {
    "pt-BR": "Ajustes da página de Busca que você muda sem mexer no layout (a /buscar é servida por código). Cada parâmetro abaixo altera o comportamento da busca para todos os operadores desta unidade.",
    "en-US": "Settings for the Search page that you change without touching the layout (/buscar is served by code). Each parameter below changes search behavior for every operator in this unit."
  },
  "buscar.params.finalidade.label": {
    "pt-BR": "Finalidade de acesso (LGPD)",
    "en-US": "Access purpose (LGPD)"
  },
  "buscar.params.finalidade.help.pre": {
    "pt-BR": "Quando o operador clica",
    "en-US": "When the operator clicks"
  },
  "buscar.params.finalidade.help.action": {
    "pt-BR": "“Montar dossiê”",
    "en-US": "“Build dossier”"
  },
  "buscar.params.finalidade.help.post": {
    "pt-BR": ", ele precisa declarar a base legal do acesso — exigência da LGPD, registrada na auditoria. As linhas abaixo são as opções desse menu.",
    "en-US": ", they must declare the legal basis for the access — an LGPD requirement, recorded in the audit log. The rows below are the options for that menu."
  },
  "buscar.params.preview.title": {
    "pt-BR": "Como o operador vê na busca",
    "en-US": "How the operator sees it in search"
  },
  "buscar.params.preview.montarDossie": {
    "pt-BR": "Montar dossiê",
    "en-US": "Build dossier"
  },
  "buscar.params.preview.finalidadeLabel": {
    "pt-BR": "Finalidade:",
    "en-US": "Purpose:"
  },
  "buscar.params.preview.fallbackOption": {
    "pt-BR": "Cumprimento de obrigação legal",
    "en-US": "Compliance with a legal obligation"
  },
  "buscar.params.finalidade.placeholder": {
    "pt-BR": "ex.: Cumprimento de obrigação legal",
    "en-US": "e.g., Compliance with a legal obligation"
  },
  "buscar.params.finalidade.remove": {
    "pt-BR": "Remover finalidade",
    "en-US": "Remove purpose"
  },
  "buscar.params.finalidade.add": {
    "pt-BR": "Adicionar finalidade",
    "en-US": "Add purpose"
  },
  "buscar.params.finalidade.reset": {
    "pt-BR": "Restaurar default (bases legais da LGPD)",
    "en-US": "Restore default (LGPD legal bases)"
  },
  "buscar.params.save.cta": {
    "pt-BR": "Salvar parametrização",
    "en-US": "Save parameters"
  },
  "buscar.params.save.saving": {
    "pt-BR": "Salvando…",
    "en-US": "Saving…"
  },
  "buscar.params.save.saved": {
    "pt-BR": "Salvo",
    "en-US": "Saved"
  },
  "buscar.params.save.hint.saved": {
    "pt-BR": "A busca já usa estas finalidades.",
    "en-US": "Search already uses these purposes."
  },
  "buscar.params.save.hint.pending": {
    "pt-BR": "A busca passa a usar ao salvar.",
    "en-US": "Search will use them once you save."
  },
  "buscar.params.save.error": {
    "pt-BR": "Falha ao salvar.",
    "en-US": "Failed to save."
  },
  "ficha.chrome.tabs.empty": {
    "pt-BR": "Nenhuma aba ativa neste template.",
    "en-US": "No active tabs in this template."
  },
  "ficha.chrome.nav.title": {
    "pt-BR": "Seções",
    "en-US": "Sections"
  },
  "ficha.chrome.nav.empty": {
    "pt-BR": "Sem seções nesta ficha.",
    "en-US": "No sections in this record."
  },
  "ficha.chrome.inspetor.empty": {
    "pt-BR": "Sem entidade selecionada.",
    "en-US": "No entity selected."
  },
  "ficha.chrome.inspetor.title": {
    "pt-BR": "Inspetor",
    "en-US": "Inspector"
  },
  "ficha.chrome.inspetor.metadados": {
    "pt-BR": "Metadados",
    "en-US": "Metadata"
  },
  "ficha.chrome.inspetor.identificador": {
    "pt-BR": "Identificador",
    "en-US": "Identifier"
  },
  "ficha.chrome.inspetor.tipo": {
    "pt-BR": "Tipo",
    "en-US": "Type"
  },
  "ficha.chrome.inspetor.classificacao": {
    "pt-BR": "Classificação",
    "en-US": "Classification"
  },
  "ficha.chrome.inspetor.versao": {
    "pt-BR": "Versão",
    "en-US": "Version"
  },
  "ficha.chrome.inspetor.hash": {
    "pt-BR": "Hash assinado",
    "en-US": "Signed hash"
  },
  "ficha.chrome.inspetor.auditoria": {
    "pt-BR": "Auditoria",
    "en-US": "Audit"
  },
  "ficha.chrome.inspetor.criado": {
    "pt-BR": "Criado em",
    "en-US": "Created at"
  },
  "ficha.chrome.inspetor.atualizado": {
    "pt-BR": "Atualizado",
    "en-US": "Updated"
  },
  "buscar.titulo": {
    "pt-BR": "Buscar",
    "en-US": "Search"
  },
  "buscar.classificacao": {
    "pt-BR": "BUSCA UNIFICADA",
    "en-US": "UNIFIED SEARCH"
  },
  "buscar.toolbar.saudeFontes": {
    "pt-BR": "Saúde das fontes",
    "en-US": "Source health"
  },
  "buscar.erro.conectoresIndisponiveis": {
    "pt-BR": "Não foi possível carregar a lista de conectores externos. Só as Entidades locais estão disponíveis no momento.",
    "en-US": "Could not load the list of external connectors. Only local entities are available right now."
  },
  "buscar.erro.carregandoConectores": {
    "pt-BR": "Carregando os conectores… tente novamente em instantes.",
    "en-US": "Loading connectors… please try again in a moment."
  },
  "buscar.erro.nenhumaFonte": {
    "pt-BR": "Nenhuma fonte disponível para esta busca.",
    "en-US": "No source available for this search."
  },
  "buscar.erro.dossieSemFicha": {
    "pt-BR": "Dossiê montado, mas sem ficha vinculada — veja em /explorador.",
    "en-US": "Dossier built, but no record linked — check /explorador."
  },
  "buscar.erro.criarEntidadeSemFluxo": {
    "pt-BR": "Criar entidade direto do /buscar ainda não tem fluxo definido. Abra a ficha manualmente.",
    "en-US": "Creating an entity directly from /buscar has no defined flow yet. Open the record manually."
  },
  "buscar.salvar.promptTitulo": {
    "pt-BR": "Nome da busca salva",
    "en-US": "Saved search name"
  },
  "buscar.salvar.promptConfirmar": {
    "pt-BR": "Salvar",
    "en-US": "Save"
  },
  "buscar.salvar.okPrefixo": {
    "pt-BR": "Busca",
    "en-US": "Search"
  },
  "buscar.salvar.okSufixo": {
    "pt-BR": "salva e monitorada.",
    "en-US": "saved and monitored."
  },
  "buscar.salvar.gerenciarAlertas": {
    "pt-BR": "Gerenciar em Alertas →",
    "en-US": "Manage in Alerts →"
  },
  "buscar.acao.dispensar": {
    "pt-BR": "dispensar",
    "en-US": "dismiss"
  },
  "buscar.acao.carregando": {
    "pt-BR": "Carregando…",
    "en-US": "Loading…"
  },
  "buscar.acao.tentarNovamente": {
    "pt-BR": "Tentar de novo",
    "en-US": "Try again"
  },
  "buscar.dossie.pronto": {
    "pt-BR": "Dossiê pronto",
    "en-US": "Dossier ready"
  },
  "buscar.dossie.prontoFalhas": {
    "pt-BR": "fonte(s) falharam",
    "en-US": "source(s) failed"
  },
  "buscar.dossie.abrirFicha": {
    "pt-BR": "Abrir ficha em nova aba →",
    "en-US": "Open record in a new tab →"
  },
  "buscar.dossie.montando": {
    "pt-BR": "Montando dossiê",
    "en-US": "Building dossier"
  },
  "buscar.dossie.montandoFontes": {
    "pt-BR": "fonte(s)",
    "en-US": "source(s)"
  },
  "buscar.dossie.statsOk": {
    "pt-BR": "ok",
    "en-US": "ok"
  },
  "buscar.dossie.statsFalhou": {
    "pt-BR": "falhou",
    "en-US": "failed"
  },
  "buscar.subtitulo.emCurso": {
    "pt-BR": "em curso",
    "en-US": "in progress"
  },
  "buscar.subtitulo.concluidaSingular": {
    "pt-BR": "concluída",
    "en-US": "completed"
  },
  "buscar.subtitulo.concluidaPlural": {
    "pt-BR": "concluídas",
    "en-US": "completed"
  },
  "buscar.subtitulo.buscaConcluidaSingular": {
    "pt-BR": "busca concluída",
    "en-US": "search completed"
  },
  "buscar.subtitulo.buscaConcluidaPlural": {
    "pt-BR": "buscas concluídas",
    "en-US": "searches completed"
  },
  "buscar.subtitulo.resultadoSingular": {
    "pt-BR": "resultado",
    "en-US": "result"
  },
  "buscar.subtitulo.resultadoPlural": {
    "pt-BR": "resultados",
    "en-US": "results"
  },
  "ficha.tab.identidade": {
    "pt-BR": "Identidade",
    "en-US": "Identity"
  },
  "ficha.tab.vinculos": {
    "pt-BR": "Vínculos",
    "en-US": "Links"
  },
  "ficha.tab.historico": {
    "pt-BR": "Histórico",
    "en-US": "History"
  },
  "ficha.tab.atividade": {
    "pt-BR": "Atividade",
    "en-US": "Activity"
  },
  "ficha.tab.parlamentar": {
    "pt-BR": "Mandato",
    "en-US": "Mandate"
  },
  "ficha.tab.midia": {
    "pt-BR": "Mídia",
    "en-US": "Media"
  },
  "ficha.tab.integridade": {
    "pt-BR": "Integridade",
    "en-US": "Integrity"
  },
  "ficha.tab.outros": {
    "pt-BR": "Outros",
    "en-US": "Other"
  },
  "ficha.section.identificacao": {
    "pt-BR": "Identificação",
    "en-US": "Identification"
  },
  "ficha.section.enderecos": {
    "pt-BR": "Endereços",
    "en-US": "Addresses"
  },
  "ficha.section.antecedentes": {
    "pt-BR": "Antecedentes",
    "en-US": "Records"
  },
  "ficha.section.mandados": {
    "pt-BR": "Mandados",
    "en-US": "Warrants"
  },
  "ficha.section.veiculos": {
    "pt-BR": "Veículos",
    "en-US": "Vehicles"
  },
  "ficha.section.linha_tempo": {
    "pt-BR": "Linha do tempo",
    "en-US": "Timeline"
  },
  "ficha.section.cidades": {
    "pt-BR": "Cidades observadas",
    "en-US": "Observed cities"
  },
  "ficha.section.observacoes_cctv": {
    "pt-BR": "Observações CCTV",
    "en-US": "CCTV observations"
  },
  "ficha.section.relation_list": {
    "pt-BR": "Vínculos",
    "en-US": "Links"
  },
  "ficha.tab.acoes": {
    "pt-BR": "Ações",
    "en-US": "Actions"
  },
  "ficha.section.acoes": {
    "pt-BR": "Ações do tipo",
    "en-US": "Type actions"
  },
  "ficha.acoes.titulo": {
    "pt-BR": "Ações do tipo",
    "en-US": "Type actions"
  },
  "ficha.acoes.carregando": {
    "pt-BR": "Carregando ações…",
    "en-US": "Loading actions…"
  },
  "ficha.acoes.vazio": {
    "pt-BR": "Nenhuma ação configurada para este tipo. Defina ActionTypes no Workshop.",
    "en-US": "No actions configured for this type. Define ActionTypes in the Workshop."
  },
  "ficha.acoes.parametros": {
    "pt-BR": "parâmetro(s)",
    "en-US": "param(s)"
  },
  "ficha.acoes.executar": {
    "pt-BR": "Executar",
    "en-US": "Run"
  },
  "ficha.acoes.confirmTitulo": {
    "pt-BR": "Executar ação governada?",
    "en-US": "Run governed action?"
  },
  "ficha.acoes.sucesso": {
    "pt-BR": "Ação executada.",
    "en-US": "Action executed."
  },
  "ficha.acoes.pendente": {
    "pt-BR": "Pendente de aprovação.",
    "en-US": "Pending approval."
  },
  "ficha.acoes.negado": {
    "pt-BR": "Política negou a execução.",
    "en-US": "Policy denied the execution."
  },
  "ficha.acoes.falha": {
    "pt-BR": "Falha na execução.",
    "en-US": "Execution failed."
  },
  "ficha.acoes.semObjeto": {
    "pt-BR": "Sem objeto vinculado para executar a ação.",
    "en-US": "No object bound to run the action."
  },
  "ficha.acoes.semId": {
    "pt-BR": "Ação não encontrada no catálogo de ActionTypes.",
    "en-US": "Action not found in the ActionTypes catalog."
  },
  "ficha.toolbar.acoes": {
    "pt-BR": "Ações",
    "en-US": "Actions"
  },
  "ficha.toolbar.acoesVazio": {
    "pt-BR": "Nenhuma ação disponível para este tipo.",
    "en-US": "No actions available for this type."
  },
  "ficha.shell.emptyTabPrefix": {
    "pt-BR": "Aba",
    "en-US": "Tab"
  },
  "ficha.shell.emptyTabSuffix": {
    "pt-BR": "não tem widgets. Adicione em",
    "en-US": "has no widgets. Add them in"
  },
  "ficha.dossie.botao": {
    "pt-BR": "Montar dossiê",
    "en-US": "Build dossier"
  },
  "ficha.dossie.objeto": {
    "pt-BR": "Montar dossiê do objeto",
    "en-US": "Build object dossier"
  },
  "ficha.dossie.objetoHint": {
    "pt-BR": "Cruza os identificadores deste objeto (pela forma do campo) em dados públicos, rede social e mídia",
    "en-US": "Cross-references this object's identifiers (by field shape) across public records, social media and media"
  },
  "ficha.dossie.composto": {
    "pt-BR": "Dossiê composto (conjunto)",
    "en-US": "Composite dossier (set)"
  },
  "ficha.dossie.compostoHint": {
    "pt-BR": "Dossiê da operação/evento: vínculos 1-hop + sub-dossiês por membro + correlação + cena + linha do tempo",
    "en-US": "Operation/event dossier: 1-hop links + per-member sub-dossiers + correlation + scene + timeline"
  },
  "ficha.dossie.purposeTitulo": {
    "pt-BR": "Finalidade do acesso (LGPD)",
    "en-US": "Access purpose (LGPD)"
  },
  "ficha.dossie.purposeDesc": {
    "pt-BR": "Obrigatória se o objeto tiver dado pessoal (CPF/CNPJ/e-mail/telefone/usuário). Fica registrada na trilha de auditoria.",
    "en-US": "Required when the object carries personal data (CPF/CNPJ/email/phone/username). Recorded in the audit trail."
  },
  "ficha.dossie.purposePlaceholder": {
    "pt-BR": "Ex.: apuração da ocorrência nº 123",
    "en-US": "e.g.: investigation of incident #123"
  },
  "ficha.dossie.purposeOk": {
    "pt-BR": "Montar",
    "en-US": "Build"
  },
  "ficha.dossie.montando": {
    "pt-BR": "Montando dossiê…",
    "en-US": "Building dossier…"
  },
  "ficha.dossie.tituloModal": {
    "pt-BR": "Dossiê do objeto",
    "en-US": "Object dossier"
  },
  "ficha.dossie.tituloModalComposto": {
    "pt-BR": "Dossiê composto",
    "en-US": "Composite dossier"
  },
  "ficha.dossie.fechar": {
    "pt-BR": "Fechar",
    "en-US": "Close"
  },
  "ficha.dossie.erro": {
    "pt-BR": "Não foi possível montar o dossiê.",
    "en-US": "Could not build the dossier."
  },
  "ficha.dossie.semPii": {
    "pt-BR": "Objeto sem identificador pessoal — sem varredura OSINT (só o grafo da ontologia).",
    "en-US": "Object has no personal identifier — no OSINT scan (ontology graph only)."
  },
  "ficha.dossie.secIdentificacao": {
    "pt-BR": "Identificação",
    "en-US": "Identification"
  },
  "ficha.dossie.secVinculos": {
    "pt-BR": "Vínculos",
    "en-US": "Links"
  },
  "ficha.dossie.secMidia": {
    "pt-BR": "Mídia",
    "en-US": "Media"
  },
  "ficha.dossie.secRoster": {
    "pt-BR": "Membros",
    "en-US": "Members"
  },
  "ficha.dossie.secCorrelacao": {
    "pt-BR": "Correlação",
    "en-US": "Correlation"
  },
  "ficha.dossie.secCena": {
    "pt-BR": "Cena",
    "en-US": "Scene"
  },
  "ficha.dossie.secLinhaTempo": {
    "pt-BR": "Linha do tempo",
    "en-US": "Timeline"
  },
  "ficha.dossie.identificadores": {
    "pt-BR": "Identificadores",
    "en-US": "Identifiers"
  },
  "ficha.dossie.fontes": {
    "pt-BR": "Fontes",
    "en-US": "Sources"
  },
  "ficha.dossie.nos": {
    "pt-BR": "nós",
    "en-US": "nodes"
  },
  "ficha.dossie.vinculosN": {
    "pt-BR": "vínculos",
    "en-US": "links"
  },
  "ficha.dossie.vazio": {
    "pt-BR": "Sem dados nesta seção.",
    "en-US": "No data in this section."
  }
};
