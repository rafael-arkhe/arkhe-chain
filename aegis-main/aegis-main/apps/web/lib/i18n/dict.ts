/**
 * Dicionário i18n — Sprint UX-1.7 (2026-05-22).
 *
 * Padrão: `keys.namespace.key` → tradução. Aplicado via `useT()` hook.
 *
 * Memória honrada:
 *   - feedback_i18n_locales · pt-BR é default, en-US é peer first-class
 *   - feedback_ui_english_only · zero strings hardcoded; tudo via useT()
 *   - feedback_no_palantir_product_names · nunca citar Foundry/Gotham/etc
 *
 * Convenção de chaves:
 *   - common.* · botões reusáveis (criar, cancelar, salvar...)
 *   - confirm.* · ConfirmDialog
 *   - lineage.* · página Lineage
 *   - guests.* · página Convidados
 *   - (próximas pages seguem o pattern)
 */
import { BUSCAR_FICHA_DICT } from './dict-buscar-ficha';
import { BUSCAR_FONTES_DICT } from './dict-buscar-fontes';
import { FICHA_DEBITOS_DICT } from './dict-ficha-debitos';
import { FICHA_V2_DICT } from './dict-ficha-v2';
import { BUSCAR_COLETA_DICT } from './dict-buscar-coleta';
import { BUSCAR_ROTEAMENTO_DICT } from './dict-buscar-roteamento';
import { BUSCAR_CAMPO_DICT } from './dict-buscar-campo';
import { BUSCAR_PERF_DICT } from './dict-buscar-perf';
import { BUSCAR_CORRELACAO_DICT } from './dict-buscar-correlacao';
import { BUSCAR_MERGE_DICT } from './dict-buscar-merge';
import { BUSCAR_HISTORICO_DICT } from './dict-buscar-historico';
import { RELATORIOS_DICT } from './dict-relatorios';
import { BRIEFINGS_DICT } from './dict-briefings';
import { TELA_DADOS_DICT } from './dict-tela-dados';
import { DSW_DICT } from './dict-dsw';
import { PBW_DICT } from './dict-pbw';

export type Locale = 'pt-BR' | 'en-US';

export const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'en-US'];
export const DEFAULT_LOCALE: Locale = 'pt-BR';

type Dictionary = Record<string, Record<Locale, string>>;

export const DICT: Dictionary = {
  // ─── Common ──────────────────────────────────────────────────────────
  'common.cancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  // Páginas — botão genérico p/ configurar a experiência bespoke de uma
  // rota app_route (W0). Substitui o antigo "Editar parametrização".
  'pages.configureExperience': {
    'pt-BR': 'Configurar experiência',
    'en-US': 'Configure experience',
  },
  'loja.title': { 'pt-BR': 'Loja', 'en-US': 'Store' },
  'loja.subtitle': {
    'pt-BR': 'Soluções publicadas na rede. Instalar materializa a solução inteira na sua organização.',
    'en-US': 'Solutions published across the network. Installing materializes the whole solution in your organization.',
  },
  'loja.search': { 'pt-BR': 'Buscar soluções…', 'en-US': 'Search solutions…' },
  'loja.count': { 'pt-BR': 'soluções', 'en-US': 'solutions' },
  'loja.installs': { 'pt-BR': 'instalações', 'en-US': 'installs' },
  'loja.error.title': { 'pt-BR': 'Erro ao carregar', 'en-US': 'Failed to load' },
  'loja.error.load': { 'pt-BR': 'Não foi possível carregar o catálogo da Loja.', 'en-US': 'Could not load the store catalog.' },
  'loja.empty.title': { 'pt-BR': 'Nenhuma solução publicada', 'en-US': 'No published solutions' },
  'loja.empty.desc': {
    'pt-BR': 'Quando uma solução for publicada na rede, ela aparece aqui para instalar.',
    'en-US': 'When a solution is published to the network, it shows up here to install.',
  },
  'loja.manifest.title': { 'pt-BR': 'O que será criado na sua organização', 'en-US': 'What gets created in your organization' },
  'loja.manifest.empty': { 'pt-BR': 'Solução sem itens declarados.', 'en-US': 'Solution declares no items.' },
  'loja.manifest.types': { 'pt-BR': 'tipos', 'en-US': 'types' },
  'loja.manifest.actions': { 'pt-BR': 'ações', 'en-US': 'actions' },
  'loja.manifest.agents': { 'pt-BR': 'agentes', 'en-US': 'agents' },
  'loja.manifest.flows': { 'pt-BR': 'fluxos', 'en-US': 'flows' },
  'loja.manifest.functions': { 'pt-BR': 'funções', 'en-US': 'functions' },
  'loja.manifest.pages': { 'pt-BR': 'páginas', 'en-US': 'pages' },
  'loja.install.action': { 'pt-BR': 'Instalar', 'en-US': 'Install' },
  'loja.install.title': { 'pt-BR': 'Instalar solução', 'en-US': 'Install solution' },
  'loja.install.hint': {
    'pt-BR': 'A solução será materializada na sua organização (tipos, ações, agentes, app e páginas). Você pode removê-la depois.',
    'en-US': 'The solution will be materialized in your organization (types, actions, agents, app and pages). You can remove it later.',
  },
  'loja.install.confirm': { 'pt-BR': 'Instalar agora', 'en-US': 'Install now' },
  'loja.install.success': { 'pt-BR': 'Solução instalada na sua organização', 'en-US': 'Solution installed in your organization' },
  'loja.install.partial': { 'pt-BR': 'Instalada com alguns itens não materializados — confira no app', 'en-US': 'Installed with some items not materialized — check the app' },
  'loja.install.error': { 'pt-BR': 'Falha ao instalar', 'en-US': 'Install failed' },
  'loja.oem.badge': { 'pt-BR': 'OEM · Safe Core', 'en-US': 'OEM · Safe Core' },
  'loja.oem.hint': { 'pt-BR': 'Domínio OEM da Safe Core — instalar exige a senha do vendor.', 'en-US': 'Safe Core OEM domain — installing requires the vendor password.' },
  'loja.oem.password': { 'pt-BR': 'Senha do vendor (Safe Core)', 'en-US': 'Vendor password (Safe Core)' },
  'loja.oem.required': { 'pt-BR': 'Informe a senha do vendor.', 'en-US': 'Enter the vendor password.' },
  'loja.rich.ontologia': { 'pt-BR': 'Ontologia & Dados', 'en-US': 'Ontology & Data' },
  'loja.rich.datasources': { 'pt-BR': 'Conectores / fontes', 'en-US': 'Connectors / sources' },
  'loja.rich.outputs': { 'pt-BR': 'O que cria', 'en-US': 'What it creates' },
  'loja.rich.interacao': { 'pt-BR': 'Como você usa', 'en-US': 'How you use it' },
  'loja.rich.obrigatorio': { 'pt-BR': 'obrigatório', 'en-US': 'required' },
  'loja.rich.opcional': { 'pt-BR': 'opcional', 'en-US': 'optional' },
  'loja.publish.action': { 'pt-BR': 'Publicar solução', 'en-US': 'Publish solution' },
  'loja.publish.title': { 'pt-BR': 'Publicar solução na rede', 'en-US': 'Publish solution to the network' },
  'loja.publish.hint': {
    'pt-BR': 'Escolha um diagrama de solução desenhado no Arquiteto. O blueprint é publicado (cópia) e fica disponível para outras organizações instalarem.',
    'en-US': 'Pick a solution diagram designed in the Architect. Its blueprint is published (a copy) and becomes available for other organizations to install.',
  },
  'loja.publish.confirm': { 'pt-BR': 'Publicar', 'en-US': 'Publish' },
  'loja.publish.success': { 'pt-BR': 'Solução publicada na rede', 'en-US': 'Solution published to the network' },
  'loja.publish.error': { 'pt-BR': 'Falha ao publicar', 'en-US': 'Publish failed' },
  'loja.publish.loadError': { 'pt-BR': 'Não foi possível carregar os diagramas.', 'en-US': 'Could not load diagrams.' },
  'loja.publish.noDiagrams': {
    'pt-BR': 'Nenhum diagrama de solução. Desenhe uma solução no Arquiteto antes de publicar.',
    'en-US': 'No solution diagrams. Design a solution in the Architect before publishing.',
  },
  'common.confirm': { 'pt-BR': 'Confirmar', 'en-US': 'Confirm' },
  'common.save': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'common.create': { 'pt-BR': 'Criar', 'en-US': 'Create' },
  'common.edit': { 'pt-BR': 'Editar', 'en-US': 'Edit' },
  'common.delete': { 'pt-BR': 'Deletar', 'en-US': 'Delete' },
  'common.archive': { 'pt-BR': 'Arquivar', 'en-US': 'Archive' },
  'common.close': { 'pt-BR': 'Fechar', 'en-US': 'Close' },
  'chat.roleUser': { 'pt-BR': 'você', 'en-US': 'you' },
  'chat.roleTool': { 'pt-BR': 'ferramenta', 'en-US': 'tool' },
  'common.loading': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  // Débito 1 — orçamento cumulativo de LLM por tenant.
  'budget.title': { 'pt-BR': 'Orçamento de IA', 'en-US': 'AI budget' },
  // Fase 2 — uso e custo de IA em R$ (LlmUsagePanel).
  'usage.title': { 'pt-BR': 'Uso e custos de IA', 'en-US': 'AI usage & cost' },
  'usage.monthCost': { 'pt-BR': 'Gasto no mês', 'en-US': 'Month spend' },
  'usage.projected': { 'pt-BR': 'Projeção do mês', 'en-US': 'Month projection' },
  'usage.calls': { 'pt-BR': 'Chamadas', 'en-US': 'Calls' },
  'usage.avgPerCall': { 'pt-BR': 'Custo médio/chamada', 'en-US': 'Avg cost/call' },
  'usage.projectionNote': {
    'pt-BR': 'Projeção do mês pela média dos últimos 30 dias ({daily}/dia).',
    'en-US': 'Month projection from the last 30 days average ({daily}/day).',
  },
  'usage.colModel': { 'pt-BR': 'Modelo', 'en-US': 'Model' },
  'usage.colCalls': { 'pt-BR': 'Chamadas', 'en-US': 'Calls' },
  'usage.colTokens': { 'pt-BR': 'Tokens', 'en-US': 'Tokens' },
  'usage.colCost': { 'pt-BR': 'Custo', 'en-US': 'Cost' },
  'usage.noPrice': { 'pt-BR': 'sob consulta', 'en-US': 'on request' },
  // Fase 3b — modelo padrão por finalidade (ModelDefaultsCard).
  'modelDefaults.title': { 'pt-BR': 'Modelo padrão por finalidade', 'en-US': 'Default model by purpose' },
  'modelDefaults.subtitle': {
    'pt-BR': 'Qual modelo cada parte do AEGIS usa. Configurado aqui, vale em todo lugar — sem escolher modelo solto nas telas.',
    'en-US': 'Which model each part of AEGIS uses. Set here, it applies everywhere — no loose model picking across screens.',
  },
  'modelDefaults.choose': { 'pt-BR': 'Escolher modelo…', 'en-US': 'Choose model…' },
  'modelDefaults.search': { 'pt-BR': 'Buscar modelo…', 'en-US': 'Search model…' },
  'modelDefaults.sovereignty': { 'pt-BR': 'Onde processar (opcional)', 'en-US': 'Where to process (optional)' },
  'modelDefaults.sovereigntyHelp': {
    'pt-BR': 'Define ONDE o modelo desta finalidade roda. Sem vínculo, usa a nuvem gerenciada do AEGIS (AIP Cloud) — prática, mas sem garantia de em que país/jurisdição o dado é processado. Quando houver exigência (LGPD, jurisdição, contrato), vincule um provedor de computação que você cadastrou, com país/jurisdição conhecidos: o modelo passa a rodar nele e a finalidade ganha um selo de jurisdição. Cadastre provedores na aba Provedores.',
    'en-US': 'Sets WHERE this purpose’s model runs. With no binding, it uses the AEGIS-managed cloud (AIP Cloud) — convenient, but with no guarantee of which country/jurisdiction processes the data. When required (jurisdiction, contract), bind a compute provider you registered, with a known country/jurisdiction: the model then runs there and the purpose gets a jurisdiction seal. Register providers in the Providers tab.',
  },
  'modelDefaults.sovereigntyNone': { 'pt-BR': 'Nuvem padrão (OpenRouter)', 'en-US': 'Default cloud (OpenRouter)' },
  'modelDefaults.saved': { 'pt-BR': 'salvo', 'en-US': 'saved' },
  'modelDefaults.codegen': { 'pt-BR': 'Geração de código', 'en-US': 'Code generation' },
  'modelDefaults.codegenHint': { 'pt-BR': 'Código dos conectores e pipelines de dados', 'en-US': 'Connector and data-pipeline code' },
  'modelDefaults.planning': { 'pt-BR': 'Planejamento', 'en-US': 'Planning' },
  'modelDefaults.planningHint': { 'pt-BR': 'Decomposição de tarefas e estratégia', 'en-US': 'Task decomposition and strategy' },
  'modelDefaults.agent': { 'pt-BR': 'Agentes', 'en-US': 'Agents' },
  'modelDefaults.agentHint': { 'pt-BR': 'Inferência dos agentes e nós de Processamento', 'en-US': 'Agent inference and Processing nodes' },
  'modelDefaults.chat': { 'pt-BR': 'Conversas', 'en-US': 'Chat' },
  'modelDefaults.chatHint': { 'pt-BR': 'AIP Chat e assistentes', 'en-US': 'AIP Chat and assistants' },
  'modelDefaults.embedding': { 'pt-BR': 'Embeddings', 'en-US': 'Embeddings' },
  'modelDefaults.embeddingHint': { 'pt-BR': 'Busca vetorial e similaridade', 'en-US': 'Vector search and similarity' },
  'modelDefaults.coleta': { 'pt-BR': 'Coleta', 'en-US': 'Collection' },
  'modelDefaults.coletaHint': { 'pt-BR': 'Coletores externos via agente (Instagram, etc.) no gateway', 'en-US': 'External collectors via agent (Instagram, etc.) on the gateway' },
  'modelDefaults.visao': { 'pt-BR': 'Visão', 'en-US': 'Vision' },
  'modelDefaults.visaoHint': { 'pt-BR': 'Análise de imagens/vídeo (multidomínio)', 'en-US': 'Image/video analysis (multi-domain)' },
  'modelDefaults.audio': { 'pt-BR': 'Áudio', 'en-US': 'Audio' },
  'modelDefaults.audioHint': { 'pt-BR': 'Perguntas e análise sobre transcrições de áudio', 'en-US': 'Q&A and analysis over audio transcripts' },
  // Transcrição de áudio (STT) — card dedicado (SttDefaultCard). STT não é LLM de
  // chat (Whisper não está no catálogo), por isso opções fixas.
  'stt.title': { 'pt-BR': 'Transcrição de áudio (STT)', 'en-US': 'Audio transcription (STT)' },
  'stt.subtitle': {
    'pt-BR': 'Qual serviço converte fala em texto. Configurado aqui, vale em todas as transcrições — gravações e uploads.',
    'en-US': 'Which service turns speech into text. Set here, it applies to every transcription — recordings and uploads.',
  },
  'stt.label': { 'pt-BR': 'Serviço de transcrição', 'en-US': 'Transcription service' },
  'stt.hint': { 'pt-BR': 'Converte o áudio em texto diarizado para leitura e perguntas.', 'en-US': 'Turns audio into diarized text for reading and Q&A.' },
  'stt.off': { 'pt-BR': 'Desligado', 'en-US': 'Off' },
  'stt.offJuris': { 'pt-BR': 'sem transcrição', 'en-US': 'no transcription' },
  'stt.groq': { 'pt-BR': 'Groq Whisper', 'en-US': 'Groq Whisper' },
  'stt.openai': { 'pt-BR': 'OpenAI Whisper', 'en-US': 'OpenAI Whisper' },
  'stt.sovereignty': { 'pt-BR': 'Jurisdição', 'en-US': 'Jurisdiction' },
  'stt.usa': { 'pt-BR': 'EUA', 'en-US': 'USA' },
  'stt.help': {
    'pt-BR': 'Define o serviço que transcreve o áudio (fala→texto). "Desligado" deixa o áudio sem texto. Os serviços de transcrição disponíveis processam nos EUA — a chave de acesso fica no servidor, nunca é exibida aqui.',
    'en-US': 'Sets the service that transcribes audio (speech→text). "Off" leaves audio without text. The available transcription services process in the USA — the access key stays on the server and is never shown here.',
  },
  // Store de credenciais BYOM — modelos próprios do tenant (ByomModelsCard).
  'byom.title': { 'pt-BR': 'Modelos próprios', 'en-US': 'Your own models' },
  'byom.subtitle': {
    'pt-BR': 'Conecte um modelo de IA que você mesmo hospeda.',
    'en-US': 'Connect an AI model you host yourself.',
  },
  'byom.intro': {
    'pt-BR': 'Se a sua organização roda um modelo de IA num servidor próprio, conecte-o aqui informando o endereço (endpoint) e a chave de acesso. Ele passa a aparecer no catálogo e pode ser escolhido como padrão de qualquer finalidade — a chave fica guardada cifrada e nunca é exibida de volta.',
    'en-US': 'If your organization runs an AI model on its own server, connect it here with the endpoint address and access key. It then shows up in the catalog and can be set as the default for any purpose — the key is stored encrypted and never shown back.',
  },
  'byom.add': { 'pt-BR': 'Conectar modelo', 'en-US': 'Connect model' },
  'byom.name': { 'pt-BR': 'Nome do modelo', 'en-US': 'Model name' },
  'byom.nameHint': { 'pt-BR': 'O identificador que o seu endpoint espera receber.', 'en-US': 'The identifier your endpoint expects.' },
  'byom.namePlaceholder': { 'pt-BR': 'ex.: meu-modelo-interno', 'en-US': 'e.g. my-internal-model' },
  'byom.endpoint': { 'pt-BR': 'Endereço do endpoint', 'en-US': 'Endpoint address' },
  'byom.endpointHint': { 'pt-BR': 'URL compatível com a API OpenAI (termina em /v1).', 'en-US': 'OpenAI-API-compatible URL (ends in /v1).' },
  'byom.apiKey': { 'pt-BR': 'Chave de acesso', 'en-US': 'Access key' },
  'byom.apiKeyPlaceholder': { 'pt-BR': 'cole a chave do seu endpoint', 'en-US': 'paste your endpoint key' },
  'byom.apiKeyHint': { 'pt-BR': 'Guardada cifrada no cofre; nunca é exibida de volta.', 'en-US': 'Stored encrypted in the vault; never shown back.' },
  'byom.context': { 'pt-BR': 'Janela de contexto (tokens)', 'en-US': 'Context window (tokens)' },
  'byom.contextHint': { 'pt-BR': 'Opcional — quantos tokens o modelo aceita por vez.', 'en-US': 'Optional — how many tokens the model accepts at once.' },
  'byom.capabilities': { 'pt-BR': 'O que ele faz (opcional)', 'en-US': 'What it can do (optional)' },
  'byom.save': { 'pt-BR': 'Conectar', 'en-US': 'Connect' },
  'byom.cancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'byom.empty': { 'pt-BR': 'Nenhum modelo próprio conectado ainda.', 'en-US': 'No own models connected yet.' },
  'byom.credentialed': { 'pt-BR': 'chave guardada', 'en-US': 'key stored' },
  'byom.remove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'byom.removeTitle': { 'pt-BR': 'Remover "{name}"?', 'en-US': 'Remove "{name}"?' },
  'byom.removeDesc': { 'pt-BR': 'O modelo e sua credencial no cofre serão apagados.', 'en-US': 'The model and its vault credential will be deleted.' },
  // Fase 1b (débito i18n) — catálogo de Modelos (ModelosWorkspace).
  // F7.3c — rótulo do HubHeader da seção na casca /dados.
  'modelos.title': { 'pt-BR': 'Modelos de IA', 'en-US': 'AI Models' },
  'modelos.filters': { 'pt-BR': 'Filtros', 'en-US': 'Filters' },
  'modelos.origin': { 'pt-BR': 'Origem', 'en-US': 'Source' },
  'modelos.capability': { 'pt-BR': 'Capacidade', 'en-US': 'Capability' },
  'modelos.all': { 'pt-BR': 'Todas', 'en-US': 'All' },
  'modelos.refresh': { 'pt-BR': 'Atualizar', 'en-US': 'Refresh' },
  'modelos.own': { 'pt-BR': 'próprio', 'en-US': 'own' },
  'modelos.catalog': { 'pt-BR': 'catálogo', 'en-US': 'catalog' },
  'modelos.loading': { 'pt-BR': 'Carregando catálogo…', 'en-US': 'Loading catalog…' },
  'modelos.empty': { 'pt-BR': 'Nenhum modelo bate com o filtro selecionado.', 'en-US': 'No model matches the selected filter.' },
  'cloud.aip': { 'pt-BR': 'AIP Cloud', 'en-US': 'AIP Cloud' },
  'cloud.external': { 'pt-BR': 'Nuvem externa', 'en-US': 'External cloud' },
  // Tag de privacidade/treino (curta, PT). Aberto/self-hosted → dados não saem nem
  // treinam terceiros; externo → roteado p/ terceiro que pode reter/treinar.
  'modelos.dataPrivate': { 'pt-BR': 'dados privados', 'en-US': 'private data' },
  'modelos.dataThirdParty': { 'pt-BR': 'dados em terceiros', 'en-US': 'third-party data' },
  'modelos.tagOpen': { 'pt-BR': 'aberto', 'en-US': 'open' },
  'modelos.featured': { 'pt-BR': 'Destaque', 'en-US': 'Featured' },
  'modelos.catalogTitle': { 'pt-BR': 'Catálogo de modelos', 'en-US': 'Model catalog' },
  'modelos.allCapabilities': { 'pt-BR': 'Todas as capacidades', 'en-US': 'All capabilities' },
  'modelos.priceInput': { 'pt-BR': 'Entrada', 'en-US': 'Input' },
  'modelos.priceOutput': { 'pt-BR': 'Saída', 'en-US': 'Output' },
  'modelos.priceEmbedding': { 'pt-BR': 'Custo', 'en-US': 'Cost' },
  'modelos.perMtok': { 'pt-BR': 'por 1M tokens', 'en-US': 'per 1M tokens' },
  'modelos.onRequest': { 'pt-BR': 'Preço sob consulta', 'en-US': 'Price on request' },
  'modelos.countModels': { 'pt-BR': 'modelos', 'en-US': 'models' },
  'modelos.countModel': { 'pt-BR': 'modelo', 'en-US': 'model' },
  'modelos.priceLegend': {
    'pt-BR': 'Preços por 1 milhão de tokens, em reais. Atualizados pelo câmbio do dia.',
    'en-US': 'Prices per 1 million tokens, in BRL. Updated with the daily exchange rate.',
  },
  'budget.hint': {
    'pt-BR':
      'Tokens de LLM consumidos pelo seu tenant no mês corrente. Defina um teto para bloquear novas chamadas quando o limite for atingido; sem teto, o uso é ilimitado.',
    'en-US':
      'LLM tokens consumed by your tenant in the current month. Set a cap to block new calls once the limit is reached; with no cap, usage is unlimited.',
  },
  'budget.capLabel': { 'pt-BR': 'Teto de tokens', 'en-US': 'Token cap' },
  'budget.used': { 'pt-BR': 'Consumo no mês', 'en-US': 'Month usage' },
  'budget.tokensMonth': { 'pt-BR': 'tokens/mês', 'en-US': 'tokens/month' },
  'budget.unlimited': { 'pt-BR': 'sem limite', 'en-US': 'unlimited' },
  'budget.exceeded': {
    'pt-BR': 'Limite atingido — novas chamadas de IA estão bloqueadas até a virada do mês.',
    'en-US': 'Limit reached — new AI calls are blocked until next month.',
  },
  'budget.capPlaceholder': { 'pt-BR': 'Teto (tokens/mês)', 'en-US': 'Cap (tokens/month)' },
  'budget.save': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'common.empty': { 'pt-BR': 'Sem registros', 'en-US': 'No records' },
  'common.retry': { 'pt-BR': 'Tentar novamente', 'en-US': 'Retry' },
  'common.online': { 'pt-BR': 'online', 'en-US': 'online' },
  'common.offline': { 'pt-BR': 'offline', 'en-US': 'offline' },
  'home.deteccoes.titulo': { 'pt-BR': 'Detecções recentes', 'en-US': 'Recent detections' },
  'home.deteccoes.vertodos': { 'pt-BR': 'ver câmeras', 'en-US': 'view cameras' },
  'contagem.titulo': { 'pt-BR': 'Contagem por classe', 'en-US': 'Count by class' },
  'contagem.total': { 'pt-BR': 'total', 'en-US': 'total' },
  'contagem.vazio': {
    'pt-BR': 'Sem detecções nas últimas 24h.',
    'en-US': 'No detections in the last 24h.',
  },
  'common.search': { 'pt-BR': 'Buscar', 'en-US': 'Search' },
  'common.filter': { 'pt-BR': 'Filtrar', 'en-US': 'Filter' },
  'common.saving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'common.creating': { 'pt-BR': 'Criando…', 'en-US': 'Creating…' },
  'common.restore': { 'pt-BR': 'Restaurar', 'en-US': 'Restore' },
  'common.deactivate': { 'pt-BR': 'Desativar', 'en-US': 'Deactivate' },
  'common.reactivate': { 'pt-BR': 'Reativar', 'en-US': 'Reactivate' },
  'common.remove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },

  // M4.2 — Conectores (Painel de Controle · Dados)
  // Pipelines (Onda 5 — camada de dados)
  'pipelines.title': { 'pt-BR': 'Pipelines', 'en-US': 'Pipelines' },
  'pipelines.subtitle': { 'pt-BR': 'Transforme um dataset e alimente um tipo de objeto — cada execução materializa os dados, herda a classificação da origem e registra o histórico.', 'en-US': 'Transform a dataset and feed an object type — each run materializes the data, inherits the source classification and records history.' },
  'pipelines.new': { 'pt-BR': 'Novo pipeline', 'en-US': 'New pipeline' },
  'pipelines.empty': { 'pt-BR': 'Nenhum pipeline ainda.', 'en-US': 'No pipelines yet.' },
  'pipelines.build': { 'pt-BR': 'Executar', 'en-US': 'Build' },
  'pipelines.building': { 'pt-BR': 'Executando…', 'en-US': 'Building…' },
  'pipelines.runs': { 'pt-BR': 'Execuções', 'en-US': 'Runs' },
  'pipelines.runs_empty': { 'pt-BR': 'Sem execuções.', 'en-US': 'No runs yet.' },
  'pipelines.f.slug': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  'pipelines.f.name': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'pipelines.f.source': { 'pt-BR': 'Dataset de origem', 'en-US': 'Source dataset' },
  'pipelines.f.target': { 'pt-BR': 'Tipo de objeto alvo', 'en-US': 'Target object type' },
  'pipelines.f.target_none': { 'pt-BR': 'Nenhum (só materializa o dataset)', 'en-US': 'None (materialize dataset only)' },
  'pipelines.f.id_field': { 'pt-BR': 'Chave da instância', 'en-US': 'Instance key' },
  'pipelines.f.id_field_hint': { 'pt-BR': 'Escolha o tipo alvo primeiro.', 'en-US': 'Choose the target type first.' },
  'pipelines.create_submit': { 'pt-BR': 'Criar pipeline', 'en-US': 'Create pipeline' },
  'pipelines.run.rows': { 'pt-BR': 'linhas', 'en-US': 'rows' },
  'pipelines.run.instances': { 'pt-BR': 'instâncias', 'en-US': 'instances' },
  'pipelines.built_ok': { 'pt-BR': 'Execução concluída', 'en-US': 'Build complete' },
  // P5 — IDE (sandbox + AIP codegen) no security-app.
  'ide.title': { 'pt-BR': 'IDE', 'en-US': 'IDE' },
  'ide.subtitle': { 'pt-BR': 'Editor de código que roda no sandbox do AEGIS, com o SDK e geração assistida por IA.', 'en-US': 'Code editor running in the AEGIS sandbox, with the SDK and AI-assisted generation.' },
  'ide.run': { 'pt-BR': 'Rodar', 'en-US': 'Run' },
  'ide.networkOn': { 'pt-BR': 'Rede: ligada', 'en-US': 'Network: on' },
  'ide.networkOff': { 'pt-BR': 'Rede: isolada', 'en-US': 'Network: off' },
  'ide.generate': { 'pt-BR': 'Gerar com AIP', 'en-US': 'Generate with AIP' },
  'ide.aipHint': { 'pt-BR': 'Descreva o objetivo — o AIP gera código baseado no AEGIS SDK (validado no servidor).', 'en-US': 'Describe the goal — AIP generates code based on the AEGIS SDK (validated server-side).' },
  'ide.objectivePlaceholder': { 'pt-BR': 'o que o código deve fazer…', 'en-US': 'what the code should do…' },
  'ide.insert': { 'pt-BR': 'Inserir no editor', 'en-US': 'Insert into editor' },
  'ide.discard': { 'pt-BR': 'Descartar', 'en-US': 'Discard' },
  'ide.loadOk': { 'pt-BR': 'carga ok', 'en-US': 'load ok' },
  'ide.aipKindTransform': { 'pt-BR': 'Transformador', 'en-US': 'Transformer' },
  'ide.aipKindScript': { 'pt-BR': 'Script', 'en-US': 'Script' },
  'ide.aipKindLabel': { 'pt-BR': 'Tipo', 'en-US': 'Type' },
  'ide.aipKindTransformHint': {
    'pt-BR': 'Função transform(rows) — pré-processa os dados linha a linha.',
    'en-US': 'transform(rows) function — pre-processes data row by row.',
  },
  'ide.aipKindScriptHint': {
    'pt-BR': 'Script livre com o SDK do AEGIS (autentica como operador).',
    'en-US': 'Free-form script using the AEGIS SDK (authenticates as the operator).',
  },
  'ide.aipShortcut': { 'pt-BR': 'Ctrl + Enter para gerar', 'en-US': 'Ctrl + Enter to generate' },
  'ide.aipObjectivePlaceholder': {
    'pt-BR': 'Descreva o que o código deve fazer. Ex.: normalizar o CPF e extrair o DDD do telefone.',
    'en-US': 'Describe what the code should do. E.g.: normalize the CPF and extract the area code from the phone.',
  },
  'ide.aipGenerate': { 'pt-BR': 'Gerar código', 'en-US': 'Generate code' },
  'ide.aipClose': { 'pt-BR': 'Fechar', 'en-US': 'Close' },
  'ide.aipResultTitle': { 'pt-BR': 'Código gerado', 'en-US': 'Generated code' },
  'ide.aipValidated': { 'pt-BR': 'validado no sandbox', 'en-US': 'validated in sandbox' },
  'ide.aipSovereigntyTip': {
    'pt-BR': 'Jurisdição/soberania de dados do modelo que gerou este código.',
    'en-US': 'Data jurisdiction/sovereignty of the model that generated this code.',
  },
  'ide.console': { 'pt-BR': 'Console', 'en-US': 'Console' },
  'ide.consoleEmpty': { 'pt-BR': '(sem saída)', 'en-US': '(no output)' },
  'ide.consoleSuccess': { 'pt-BR': 'executado com sucesso · sem saída', 'en-US': 'executed successfully · no output' },
  // Débito 4 — terminal interativo do sandbox.
  'ide.terminal': { 'pt-BR': 'Terminal', 'en-US': 'Terminal' },
  'ide.terminalHint': {
    'pt-BR': 'Abre um terminal bash interativo no sandbox isolado (sem rede). O shell roda no mesmo ambiente do código.',
    'en-US': 'Opens an interactive bash terminal in the isolated sandbox (no network). The shell runs in the same environment as the code.',
  },
  'ide.install': { 'pt-BR': 'Instalar pacote', 'en-US': 'Install package' },
  'ide.installHint': { 'pt-BR': 'Instala um pacote pip no sandbox; fica disponível nas execuções com rede.', 'en-US': 'Installs a pip package in the sandbox; available in runs with network on.' },
  'ide.packagePlaceholder': { 'pt-BR': 'pacote pip… (ex.: pandas)', 'en-US': 'pip package… (e.g. pandas)' },
  'ide.packages': { 'pt-BR': 'Pacotes', 'en-US': 'Packages' },
  'ide.packagesHint': { 'pt-BR': 'Instalar e ver pacotes pip do sandbox.', 'en-US': 'Install and view sandbox pip packages.' },
  'ide.packagesTitle': { 'pt-BR': 'Pacotes Python', 'en-US': 'Python packages' },
  'ide.packagesIntro': {
    'pt-BR': 'Instale pacotes pip para usar no seu código. Ficam registrados no tenant e entram no sandbox quando você roda com a Rede ligada.',
    'en-US': 'Install pip packages to use in your code. They are registered for the tenant and load into the sandbox when you run with the Network on.',
  },
  'ide.packageReady': { 'pt-BR': '{pkg} instalado com sucesso.', 'en-US': '{pkg} installed successfully.' },
  'ide.packageReadyNet': {
    'pt-BR': 'Liguei a Rede — rode (Rodar) para usar o pacote no seu código.',
    'en-US': 'Network turned on — run the code to use the package.',
  },
  'ide.packageFailed': { 'pt-BR': 'Falha ao instalar {pkg}. Veja o log abaixo.', 'en-US': 'Failed to install {pkg}. See the log below.' },
  'ide.packagesLog': { 'pt-BR': 'Log da instalação', 'en-US': 'Install log' },
  'ide.packagesRegistered': { 'pt-BR': 'Pacotes registrados', 'en-US': 'Registered packages' },
  'ide.packagesEmpty': { 'pt-BR': 'Nenhum pacote instalado ainda.', 'en-US': 'No packages installed yet.' },
  // F1 — IDE contextual ao nó de Processamento (carrega source + esquema de entrada).
  'ide.loadingSource': { 'pt-BR': 'Carregando código do transformador…', 'en-US': 'Loading transformer code…' },
  'ide.inputSchema': { 'pt-BR': 'Esquema de entrada', 'en-US': 'Input schema' },
  'ide.inputShort': { 'pt-BR': 'Entrada', 'en-US': 'Input' },
  'ide.inputSchemaHint': { 'pt-BR': 'Propriedades do tipo de objeto deste nó — disponíveis para o transformador.', 'en-US': 'Properties of this node object type — available to the transformer.' },
  'ide.schemaTitleProperty': { 'pt-BR': 'Propriedade-título', 'en-US': 'Title property' },
  'ide.schemaEmpty': { 'pt-BR': 'Este tipo de objeto não tem propriedades declaradas.', 'en-US': 'This object type has no declared properties.' },
  'ide.schemaLoading': { 'pt-BR': 'Carregando esquema…', 'en-US': 'Loading schema…' },
  'ide.schemaShow': { 'pt-BR': 'Mostrar esquema de entrada', 'en-US': 'Show input schema' },
  'ide.schemaHide': { 'pt-BR': 'Ocultar esquema de entrada', 'en-US': 'Hide input schema' },
  'ide.samples': { 'pt-BR': 'Amostras', 'en-US': 'Samples' },
  'ide.samplesHint': { 'pt-BR': 'Objetos reais deste tipo da ingestão. Selecione um para carregar como entrada do transformador.', 'en-US': 'Real objects of this type from ingestion. Select one to load it as the transformer input.' },
  'ide.samplesLoading': { 'pt-BR': 'Carregando amostras…', 'en-US': 'Loading samples…' },
  'ide.samplesEmpty': { 'pt-BR': 'Nenhuma instância deste tipo ainda. Sintetize uma amostra.', 'en-US': 'No instances of this type yet. Synthesize a sample.' },
  'ide.sampleUnnamed': { 'pt-BR': 'Sem nome', 'en-US': 'Unnamed' },
  'ide.synthesizeSample': { 'pt-BR': 'Sintetizar amostra', 'en-US': 'Synthesize sample' },
  'ide.synthesizeSampleHint': { 'pt-BR': 'Monta um objeto-esqueleto a partir do esquema (valores padrão por tipo).', 'en-US': 'Builds a skeleton object from the schema (default values per type).' },
  'ide.synthesizeDone': { 'pt-BR': 'Amostra sintetizada ({n} campos) — veja o painel de entrada à direita.', 'en-US': 'Sample synthesized ({n} fields) — see the input panel on the right.' },
  'ide.synthesizeReal': { 'pt-BR': 'Dados REAIS da Coleta ({n} campos) — veja o painel de entrada à direita.', 'en-US': 'REAL data from Collection ({n} fields) — see the input panel on the right.' },
  'ide.synthesizeEmpty': { 'pt-BR': 'Sem esquema disponível para este tipo ainda — preencha a entrada manualmente.', 'en-US': 'No schema available for this type yet — fill the input manually.' },
  'ide.inputData': { 'pt-BR': 'Entrada (input.json)', 'en-US': 'Input (input.json)' },
  'ide.inputDataHint': { 'pt-BR': 'O dado que entra no transformador — o mesmo dict passado por objeto. Edite para testar um caso específico.', 'en-US': 'The data fed into the transformer — the same dict passed per object. Edit to test a specific case.' },
  // F3 — preview FIEL input→output + tempo
  'ide.preview': { 'pt-BR': 'Pré-visualizar', 'en-US': 'Preview' },
  'ide.previewHint': { 'pt-BR': 'Roda o transformador sobre as amostras e mostra a saída por objeto, o volume e o tempo.', 'en-US': 'Runs the transformer over the samples and shows the per-object output, volume and timing.' },
  'ide.previewNoSamplesHint': { 'pt-BR': 'Abra a partir de um nó com amostras para pré-visualizar em lote.', 'en-US': 'Open from a node with samples to preview in batch.' },
  'ide.previewModeFaithful': { 'pt-BR': 'fiel · Function salva', 'en-US': 'faithful · saved Function' },
  'ide.previewModeDraft': { 'pt-BR': 'rascunho · código solto', 'en-US': 'draft · unsaved code' },
  'ide.preview.title': { 'pt-BR': 'Prévia', 'en-US': 'Preview' },
  'ide.previewRunning': { 'pt-BR': 'Pré-visualizando…', 'en-US': 'Previewing…' },
  'ide.previewRowsIn': { 'pt-BR': 'entram', 'en-US': 'in' },
  'ide.previewRowsOut': { 'pt-BR': 'saem', 'en-US': 'out' },
  'ide.previewTotalMs': { 'pt-BR': 'total', 'en-US': 'total' },
  'ide.previewAvgMs': { 'pt-BR': 'média', 'en-US': 'avg' },
  'ide.previewObject': { 'pt-BR': 'objeto', 'en-US': 'object' },
  'ide.previewOk': { 'pt-BR': 'ok', 'en-US': 'ok' },
  'ide.previewError': { 'pt-BR': 'erro', 'en-US': 'error' },
  'ide.previewEmpty': { 'pt-BR': 'Sem prévia ainda. Clique em Pré-visualizar sobre amostra.', 'en-US': 'No preview yet. Click Preview over sample.' },
  // F4 — contrato de saída: schema inferido + diff + aviso
  'ide.outputSchema': { 'pt-BR': 'Esquema de saída', 'en-US': 'Output schema' },
  'ide.outputSchemaHint': { 'pt-BR': 'Tipos inferidos da saída do transformador, comparados ao esquema de entrada.', 'en-US': 'Types inferred from the transformer output, compared to the input schema.' },
  'ide.outputSchemaEmpty': { 'pt-BR': 'Pré-visualize para inferir o esquema de saída.', 'en-US': 'Preview to infer the output schema.' },
  'ide.diffAdded': { 'pt-BR': 'adicionada', 'en-US': 'added' },
  'ide.diffChanged': { 'pt-BR': 'tipo alterado', 'en-US': 'type changed' },
  'ide.diffRemoved': { 'pt-BR': 'removida', 'en-US': 'removed' },
  'ide.diffUnchanged': { 'pt-BR': 'mantida', 'en-US': 'unchanged' },
  'ide.violations': { 'pt-BR': 'Divergências de contrato', 'en-US': 'Contract violations' },
  'ide.violationsHint': { 'pt-BR': 'A saída diverge do contrato declarado. Não bloqueia a execução.', 'en-US': 'The output diverges from the declared contract. Does not block execution.' },
  'ide.violationsStrict': { 'pt-BR': 'Contrato estrito: esta divergência BLOQUEARIA a publicação.', 'en-US': 'Strict contract: this divergence WOULD BLOCK publishing.' },
  // F5/F6 — testes governados: salvar amostra como teste, rodar, asserções, histórico
  'ide.tests': { 'pt-BR': 'Testes', 'en-US': 'Tests' },
  'ide.testsHint': { 'pt-BR': 'Salve a amostra atual como um teste reproduzível, rode os testes e veja o histórico de execuções.', 'en-US': 'Save the current sample as a reproducible test, run the tests, and review the execution history.' },
  'ide.testsNoFunction': { 'pt-BR': 'Salve a Function para criar e rodar testes governados.', 'en-US': 'Save the Function to create and run governed tests.' },
  'ide.testsEmpty': { 'pt-BR': 'Nenhum teste ainda. Salve a amostra atual como teste.', 'en-US': 'No tests yet. Save the current sample as a test.' },
  'ide.testsLoading': { 'pt-BR': 'Carregando testes…', 'en-US': 'Loading tests…' },
  'ide.saveAsTest': { 'pt-BR': 'Salvar como teste', 'en-US': 'Save as test' },
  'ide.saveAsTestHint': { 'pt-BR': 'Usa a entrada atual como o caso de teste. Dê um rótulo para reconhecê-lo.', 'en-US': 'Uses the current input as the test case. Give it a label to recognize it.' },
  'ide.testName': { 'pt-BR': 'Rótulo do teste', 'en-US': 'Test label' },
  'ide.testNamePlaceholder': { 'pt-BR': 'ex.: acima do limite', 'en-US': 'e.g. above the limit' },
  'ide.testExpectedContains': { 'pt-BR': 'A saída deve conter (opcional)', 'en-US': 'Output must contain (optional)' },
  'ide.testExpectedContainsPlaceholder': { 'pt-BR': 'substrings separadas por vírgula', 'en-US': 'comma-separated substrings' },
  'ide.testSave': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'ide.testCancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'ide.testRun': { 'pt-BR': 'Rodar', 'en-US': 'Run' },
  'ide.testRunAll': { 'pt-BR': 'Rodar testes', 'en-US': 'Run tests' },
  'ide.testSaveErr': { 'pt-BR': 'Falha ao salvar o teste.', 'en-US': 'Failed to save the test.' },
  'ide.testRunErr': { 'pt-BR': 'Falha ao rodar o teste.', 'en-US': 'Failed to run the test.' },
  'ide.exit': { 'pt-BR': 'saída', 'en-US': 'exit' },
  'ide.statusOk': { 'pt-BR': 'concluído', 'en-US': 'done' },
  'ide.statusError': { 'pt-BR': 'erro', 'en-US': 'error' },
  'ide.statusRunning': { 'pt-BR': 'executando', 'en-US': 'running' },
  'ide.statusTimeout': { 'pt-BR': 'tempo esgotado', 'en-US': 'timed out' },
  'ide.testStatusPass': { 'pt-BR': 'passou', 'en-US': 'pass' },
  'ide.testStatusFail': { 'pt-BR': 'falhou', 'en-US': 'fail' },
  'ide.testStatusNeverRun': { 'pt-BR': 'não rodado', 'en-US': 'never run' },
  'ide.testSummary': { 'pt-BR': 'aprovados', 'en-US': 'passed' },
  'ide.testSummaryFailed': { 'pt-BR': 'reprovados', 'en-US': 'failed' },
  // F6 — builder de asserções por campo
  'ide.assertions': { 'pt-BR': 'Asserções por campo', 'en-US': 'Field assertions' },
  'ide.assertionsHint': { 'pt-BR': 'Verifique campos da saída: comparação, tipo, substring ou presença.', 'en-US': 'Check output fields: comparison, type, substring or presence.' },
  'ide.assertionAdd': { 'pt-BR': 'Adicionar asserção', 'en-US': 'Add assertion' },
  'ide.assertionRemove': { 'pt-BR': 'Remover asserção', 'en-US': 'Remove assertion' },
  'ide.assertionField': { 'pt-BR': 'Campo', 'en-US': 'Field' },
  'ide.assertionFieldSelect': { 'pt-BR': 'Selecione o campo', 'en-US': 'Select the field' },
  'ide.assertionOp': { 'pt-BR': 'Operador', 'en-US': 'Operator' },
  'ide.assertionValue': { 'pt-BR': 'Valor', 'en-US': 'Value' },
  'ide.assertionOp.eq': { 'pt-BR': 'igual a', 'en-US': 'equals' },
  'ide.assertionOp.ne': { 'pt-BR': 'diferente de', 'en-US': 'not equal' },
  'ide.assertionOp.gt': { 'pt-BR': 'maior que', 'en-US': 'greater than' },
  'ide.assertionOp.gte': { 'pt-BR': 'maior ou igual', 'en-US': 'greater or equal' },
  'ide.assertionOp.lt': { 'pt-BR': 'menor que', 'en-US': 'less than' },
  'ide.assertionOp.lte': { 'pt-BR': 'menor ou igual', 'en-US': 'less or equal' },
  'ide.assertionOp.type': { 'pt-BR': 'é do tipo', 'en-US': 'is of type' },
  'ide.assertionOp.contains': { 'pt-BR': 'contém', 'en-US': 'contains' },
  'ide.assertionOp.exists': { 'pt-BR': 'existe', 'en-US': 'exists' },
  'ide.assertionType.string': { 'pt-BR': 'texto', 'en-US': 'string' },
  'ide.assertionType.number': { 'pt-BR': 'número', 'en-US': 'number' },
  'ide.assertionType.integer': { 'pt-BR': 'inteiro', 'en-US': 'integer' },
  'ide.assertionType.boolean': { 'pt-BR': 'booleano', 'en-US': 'boolean' },
  'ide.assertionType.array': { 'pt-BR': 'lista', 'en-US': 'array' },
  'ide.assertionType.object': { 'pt-BR': 'objeto', 'en-US': 'object' },
  'ide.assertionType.null': { 'pt-BR': 'nulo', 'en-US': 'null' },
  // F6 — histórico de execuções
  'ide.testHistory': { 'pt-BR': 'Histórico de execuções', 'en-US': 'Execution history' },
  'ide.testHistoryHint': { 'pt-BR': 'Resultado, ator e horário de cada execução de teste. Mais recente primeiro.', 'en-US': 'Verdict, actor and time of each test run. Most recent first.' },
  'ide.testHistoryEmpty': { 'pt-BR': 'Nenhuma execução registrada ainda.', 'en-US': 'No runs recorded yet.' },
  'conectores.title': { 'pt-BR': 'Conectores', 'en-US': 'Connectors' },
  'conectores.subtitle': { 'pt-BR': 'Conecte qualquer API HTTP (api key/bearer/basic/OAuth2), com paginação e marcações — teste, rode, agende e acompanhe as execuções.', 'en-US': 'Connect any HTTP API (api key/bearer/basic/OAuth2), with pagination and markings — test, run, schedule and follow the runs.' },
  'conectores.scheduler_now': { 'pt-BR': 'Agendador agora', 'en-US': 'Run scheduler now' },
  'conectores.register': { 'pt-BR': 'Registrar conector', 'en-US': 'Register connector' },
  'conectores.register_submit': { 'pt-BR': 'Registrar', 'en-US': 'Register' },
  'conectores.empty': { 'pt-BR': 'Nenhum conector. Registre o primeiro.', 'en-US': 'No connectors yet. Register the first one.' },
  'conectores.test': { 'pt-BR': 'Testar conexão', 'en-US': 'Test connection' },
  'conectores.run': { 'pt-BR': 'Rodar agora', 'en-US': 'Run now' },
  'conectores.enqueued': { 'pt-BR': 'ingestão enfileirada', 'en-US': 'ingestion enqueued' },
  'conectores.f.slug': { 'pt-BR': 'Identificador (slug)', 'en-US': 'Identifier (slug)' },
  'conectores.f.name': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'conectores.f.base_url': { 'pt-BR': 'URL base', 'en-US': 'Base URL' },
  'conectores.f.path': { 'pt-BR': 'Caminho', 'en-US': 'Path' },
  'conectores.f.node_type': { 'pt-BR': 'Tipo de objeto (ontologia)', 'en-US': 'Object type (ontology)' },
  'conectores.f.id_field': { 'pt-BR': 'Campo de identidade', 'en-US': 'Identity field' },
  'conectores.f.records_path': { 'pt-BR': 'Caminho dos registros', 'en-US': 'Records path' },
  // P6a — Sincronização + serializer (UX calibrada: tooltips/instruções).
  'conectores.f.serializer': { 'pt-BR': 'Formato da resposta', 'en-US': 'Response format' },
  'conectores.sync.title': { 'pt-BR': 'Sincronização', 'en-US': 'Synchronization' },
  'conectores.sync.intro': { 'pt-BR': 'Defina como a resposta da fonte é lida (formato) e confira o schema antes de salvar.', 'en-US': 'Define how the source response is read (format) and check the schema before saving.' },
  'conectores.sync.sample': { 'pt-BR': 'Amostra da resposta', 'en-US': 'Response sample' },
  'conectores.sync.samplePlaceholder': { 'pt-BR': 'Cole aqui um trecho da resposta da fonte (ou deixe vazio para buscar da URL base)…', 'en-US': 'Paste a chunk of the source response here (or leave empty to fetch from the base URL)…' },
  'conectores.sync.preview': { 'pt-BR': 'Pré-visualizar schema', 'en-US': 'Preview schema' },
  'conectores.sync.schema': { 'pt-BR': 'Schema inferido', 'en-US': 'Inferred schema' },
  'conectores.sync.rows': { 'pt-BR': 'Amostra de registros', 'en-US': 'Sample records' },
  'conectores.sync.rowCount': { 'pt-BR': '{n} registros lidos', 'en-US': '{n} records read' },
  'conectores.sync.empty': { 'pt-BR': 'Nenhum registro lido — confira o formato e o caminho dos registros.', 'en-US': 'No records read — check the format and the records path.' },
  // Tooltips/instruções por campo (linguagem do operador):
  'conectores.tip.node_type': { 'pt-BR': 'O tipo de objeto da ontologia que cada registro vira (ex.: endereco, leitura_sensor). Use o nome do "que" você está ingerindo.', 'en-US': 'The ontology object type each record becomes (e.g., address, sensor_reading). Name it after "what" you are ingesting.' },
  'conectores.tip.id_field': { 'pt-BR': 'Campo único de cada registro (ex.: id, cpf, placa). Garante que reingerir não duplica — atualiza o mesmo objeto.', 'en-US': 'The unique field of each record (e.g., id, ssn, plate). Ensures re-ingesting does not duplicate — it updates the same object.' },
  'conectores.tip.records_path': { 'pt-BR': 'Só para JSON: o caminho até a lista (ex.: data, result.items). Vazio = a resposta já é a lista. Não se aplica a CSV/XML.', 'en-US': 'JSON only: the path to the list (e.g., data, result.items). Empty = the response is already the list. Not used for CSV/XML.' },
  'conectores.tip.serializer': { 'pt-BR': 'Como a resposta é lida: JSON (API comum), JSONL (1 objeto por linha), CSV (planilha) ou XML. O schema é inferido a partir disso.', 'en-US': 'How the response is read: JSON (common API), JSONL (one object per line), CSV (spreadsheet) or XML. The schema is inferred from it.' },
  'conectores.f.name_field': { 'pt-BR': 'Campo do nome', 'en-US': 'Name field' },
  'conectores.f.auth': { 'pt-BR': 'Autenticação', 'en-US': 'Authentication' },
  'conectores.f.schedule': { 'pt-BR': 'Agendamento', 'en-US': 'Schedule' },
  'conectores.f.secret': { 'pt-BR': 'Segredo (slug no vault)', 'en-US': 'Secret (vault slug)' },
  'conectores.f.header': { 'pt-BR': 'Header', 'en-US': 'Header' },
  'conectores.f.username': { 'pt-BR': 'Usuário', 'en-US': 'Username' },
  'conectores.auth.none': { 'pt-BR': 'Sem autenticação', 'en-US': 'No authentication' },
  'conectores.auth.api_key': { 'pt-BR': 'API key (header)', 'en-US': 'API key (header)' },
  'conectores.auth.bearer': { 'pt-BR': 'Bearer token', 'en-US': 'Bearer token' },
  'conectores.auth.basic': { 'pt-BR': 'Basic (usuário + senha)', 'en-US': 'Basic (user + password)' },
  'conectores.cron.manual': { 'pt-BR': 'Manual (sem agendamento)', 'en-US': 'Manual (no schedule)' },
  'conectores.cron.1min': { 'pt-BR': 'A cada 1 min', 'en-US': 'Every 1 min' },
  'conectores.cron.2min': { 'pt-BR': 'A cada 2 min', 'en-US': 'Every 2 min' },
  'conectores.cron.5min': { 'pt-BR': 'A cada 5 min', 'en-US': 'Every 5 min' },
  'conectores.cron.15min': { 'pt-BR': 'A cada 15 min', 'en-US': 'Every 15 min' },
  'conectores.cron.30min': { 'pt-BR': 'A cada 30 min', 'en-US': 'Every 30 min' },
  'conectores.cron.hourly': { 'pt-BR': 'A cada hora', 'en-US': 'Hourly' },
  'conectores.cron.2h': { 'pt-BR': 'A cada 2 horas', 'en-US': 'Every 2 hours' },
  'conectores.cron.6h': { 'pt-BR': 'A cada 6 horas', 'en-US': 'Every 6 hours' },
  'conectores.cron.12h': { 'pt-BR': 'A cada 12 horas', 'en-US': 'Every 12 hours' },
  'conectores.cron.daily': { 'pt-BR': 'Diário', 'en-US': 'Daily' },
  // WP-F — painel operacional: método/query/body, auth estendida, paginação,
  // marcações, status, Ativar/Pausar e histórico de execuções.
  'conectores.f.method': { 'pt-BR': 'Método HTTP', 'en-US': 'HTTP method' },
  'conectores.f.body': { 'pt-BR': 'Corpo da requisição (JSON)', 'en-US': 'Request body (JSON)' },
  'conectores.err.body_json': { 'pt-BR': 'Corpo da requisição não é um JSON válido.', 'en-US': 'Request body is not valid JSON.' },
  'conectores.f.query': { 'pt-BR': 'Parâmetros de query', 'en-US': 'Query parameters' },
  'conectores.f.query_key': { 'pt-BR': 'Parâmetro', 'en-US': 'Parameter' },
  'conectores.f.query_value': { 'pt-BR': 'Valor', 'en-US': 'Value' },
  'conectores.query_add': { 'pt-BR': 'Adicionar parâmetro', 'en-US': 'Add parameter' },
  'conectores.tip.query': { 'pt-BR': 'Pares chave/valor enviados em toda requisição (ex.: uf=SP). Filtros fixos da fonte entram aqui.', 'en-US': 'Key/value pairs sent on every request (e.g., state=SP). Fixed source filters go here.' },
  'conectores.f.markings': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'conectores.tip.markings': { 'pt-BR': 'Classificação aplicada a cada objeto ingerido por este conector. Vazio usa o padrão (OFICIAL).', 'en-US': 'Classification applied to every object ingested by this connector. Empty uses the default (OFICIAL).' },
  'conectores.f.csv_delimiter': { 'pt-BR': 'Delimitador (CSV)', 'en-US': 'Delimiter (CSV)' },
  'conectores.auth.api_key_query': { 'pt-BR': 'API key (query)', 'en-US': 'API key (query)' },
  'conectores.auth.oauth2_cc': { 'pt-BR': 'OAuth2 (client credentials)', 'en-US': 'OAuth2 (client credentials)' },
  'conectores.f.query_param': { 'pt-BR': 'Parâmetro da query (API key)', 'en-US': 'Query parameter (API key)' },
  'conectores.f.token_url': { 'pt-BR': 'URL do token', 'en-US': 'Token URL' },
  'conectores.f.client_id': { 'pt-BR': 'Client ID', 'en-US': 'Client ID' },
  'conectores.f.scope': { 'pt-BR': 'Escopo', 'en-US': 'Scope' },
  'conectores.f.pagination': { 'pt-BR': 'Paginação', 'en-US': 'Pagination' },
  'conectores.tip.pagination': { 'pt-BR': 'Como a fonte divide os resultados em páginas. O conector segue as páginas até o fim (ou até o máximo configurado).', 'en-US': 'How the source splits results into pages. The connector follows pages to the end (or up to the configured max).' },
  'conectores.pag.mode': { 'pt-BR': 'Modo', 'en-US': 'Mode' },
  'conectores.pag.none': { 'pt-BR': 'Sem paginação', 'en-US': 'No pagination' },
  'conectores.pag.page': { 'pt-BR': 'Número da página', 'en-US': 'Page number' },
  'conectores.pag.offset': { 'pt-BR': 'Deslocamento (offset)', 'en-US': 'Offset' },
  'conectores.pag.cursor': { 'pt-BR': 'Cursor', 'en-US': 'Cursor' },
  'conectores.pag.link': { 'pt-BR': 'Cabeçalho Link (RFC 5988)', 'en-US': 'Link header (RFC 5988)' },
  'conectores.pag.page_param': { 'pt-BR': 'Parâmetro da página', 'en-US': 'Page parameter' },
  'conectores.pag.size_param': { 'pt-BR': 'Parâmetro do tamanho', 'en-US': 'Size parameter' },
  'conectores.pag.page_size': { 'pt-BR': 'Tamanho da página', 'en-US': 'Page size' },
  'conectores.pag.start_page': { 'pt-BR': 'Página inicial', 'en-US': 'Start page' },
  'conectores.pag.offset_param': { 'pt-BR': 'Parâmetro do deslocamento', 'en-US': 'Offset parameter' },
  'conectores.pag.limit_param': { 'pt-BR': 'Parâmetro do limite', 'en-US': 'Limit parameter' },
  'conectores.pag.cursor_param': { 'pt-BR': 'Parâmetro do cursor', 'en-US': 'Cursor parameter' },
  'conectores.pag.cursor_path': { 'pt-BR': 'Caminho do cursor na resposta', 'en-US': 'Cursor path in response' },
  'conectores.pag.max_pages': { 'pt-BR': 'Máximo de páginas', 'en-US': 'Max pages' },
  'conectores.activate': { 'pt-BR': 'Ativar', 'en-US': 'Activate' },
  'conectores.pause': { 'pt-BR': 'Pausar', 'en-US': 'Pause' },
  'conectores.confirm.activateTitle': { 'pt-BR': 'Ativar conector', 'en-US': 'Activate connector' },
  'conectores.confirm.activateDesc': { 'pt-BR': '"{name}" passa a rodar no agendamento configurado.', 'en-US': '"{name}" will run on its configured schedule.' },
  'conectores.confirm.pauseTitle': { 'pt-BR': 'Pausar conector', 'en-US': 'Pause connector' },
  'conectores.confirm.pauseDesc': { 'pt-BR': '"{name}" deixa de ser agendado até ser reativado. Execuções manuais continuam disponíveis.', 'en-US': '"{name}" stops being scheduled until reactivated. Manual runs remain available.' },
  'conectores.status.active': { 'pt-BR': 'Ativo', 'en-US': 'Active' },
  'conectores.status.inactive': { 'pt-BR': 'Pausado', 'en-US': 'Paused' },
  'conectores.status.running': { 'pt-BR': 'Executando', 'en-US': 'Running' },
  'conectores.status.degraded': { 'pt-BR': 'Degradado', 'en-US': 'Degraded' },
  'conectores.status.failed': { 'pt-BR': 'Falhou', 'en-US': 'Failed' },
  'conectores.status.succeeded': { 'pt-BR': 'Concluído', 'en-US': 'Succeeded' },
  'conectores.status.queued': { 'pt-BR': 'Na fila', 'en-US': 'Queued' },
  'conectores.runs': { 'pt-BR': 'Execuções', 'en-US': 'Runs' },
  'conectores.datasets': { 'pt-BR': 'Datasets gerados', 'en-US': 'Generated datasets' },
  'conectores.datasets.empty': { 'pt-BR': 'Nenhum dataset gerado ainda. Use "Gerar dataset" no nó Fonte do Quadro.', 'en-US': 'No datasets generated yet. Use "Generate dataset" on a board Source node.' },
  'conectores.datasets.unavailable': { 'pt-BR': 'Indisponível no momento.', 'en-US': 'Unavailable right now.' },
  'conectores.datasets.rows': { 'pt-BR': 'linhas', 'en-US': 'rows' },
  'conectores.runs.empty': { 'pt-BR': 'Nenhuma execução ainda.', 'en-US': 'No runs yet.' },
  'conectores.runs.retry': { 'pt-BR': 'Reexecutar', 'en-US': 'Retry' },
  'conectores.runs.status': { 'pt-BR': 'Situação', 'en-US': 'Status' },
  'conectores.runs.started': { 'pt-BR': 'Início', 'en-US': 'Started' },
  'conectores.runs.duration': { 'pt-BR': 'Duração', 'en-US': 'Duration' },
  'conectores.runs.summary': { 'pt-BR': 'Resumo', 'en-US': 'Summary' },
  // Sprint 1 — form de criação CATALOG-DRIVEN (skill do catálogo + form dinâmico).
  'conectores.f.skill': { 'pt-BR': 'Tipo de conector', 'en-US': 'Connector type' },
  'conectores.tip.skill': { 'pt-BR': 'O que este conector executa a cada rodada — escolhido do catálogo de capacidades da plataforma. Os campos abaixo vêm da capacidade escolhida.', 'en-US': 'What this connector runs on each tick — chosen from the platform capability catalog. The fields below come from the chosen capability.' },
  'conectores.skill.http': { 'pt-BR': 'Conector HTTP', 'en-US': 'HTTP connector' },
  'conectores.err.required_param': { 'pt-BR': 'Preencha o campo obrigatório: {name}', 'en-US': 'Fill in the required field: {name}' },
  // Tarefa C — min/max estruturado no param_schema: valor fora do limite bloqueia o submit.
  'conectores.err.param_range': { 'pt-BR': 'O campo {name} deve estar entre {min} e {max}.', 'en-US': 'The field {name} must be between {min} and {max}.' },
  // Tarefa H — Configurar via ACTION GOVERNADA (clamp + auditoria; nunca PATCH cru).
  'conectores.configure': { 'pt-BR': 'Configurar', 'en-US': 'Configure' },
  'conectores.configure.title': { 'pt-BR': 'Configurar conector', 'en-US': 'Configure connector' },
  'conectores.configure.desc': { 'pt-BR': 'Os parâmetros são aplicados pela ação governada da plataforma — com permissão, auditoria e limites declarados. Valores fora do limite são ajustados automaticamente.', 'en-US': 'Parameters are applied through the platform governed action — with permission, audit and declared limits. Out-of-range values are adjusted automatically.' },
  'conectores.configure.submit': { 'pt-BR': 'Aplicar configuração', 'en-US': 'Apply configuration' },
  'conectores.configure.applied': { 'pt-BR': 'Configuração aplicada pela ação governada.', 'en-US': 'Configuration applied through the governed action.' },
  'conectores.configure.clamped': { 'pt-BR': 'Ajustes aplicados pelos limites declarados:', 'en-US': 'Adjustments applied by the declared limits:' },
  'conectores.configure.pending': { 'pt-BR': 'Configuração enviada para aprovação — será aplicada quando um aprovador confirmar.', 'en-US': 'Configuration sent for approval — it will be applied once an approver confirms.' },
  'conectores.configure.action_missing': { 'pt-BR': 'A ação governada de configuração não está registrada no catálogo de ações.', 'en-US': 'The governed configure action is not registered in the action catalog.' },
  'conectores.configure.no_schema': { 'pt-BR': 'Esta capacidade não declara parâmetros configuráveis.', 'en-US': 'This capability declares no configurable parameters.' },
  'conectores.configure.failed': { 'pt-BR': 'Falha ao aplicar a configuração.', 'en-US': 'Failed to apply the configuration.' },

  // Estação WhatsApp — pareamento por QR no drilldown do conector (capability
  // 'pairing' da skill). Nunca cita o nome do runtime de terceiros na UI.
  'conectores.pair': { 'pt-BR': 'Parear', 'en-US': 'Pair' },
  // Neutro: o mesmo diálogo pareia estação de mensageria, ponte AutoSync e o
  // que mais vier — nunca nome de vendor nem "estação" no título.
  'conectores.pair.title': { 'pt-BR': 'Parear dispositivo', 'en-US': 'Pair device' },
  'conectores.pair.scan': { 'pt-BR': 'Abra o WhatsApp no celular da estação → Aparelhos conectados → Conectar aparelho e escaneie o código.', 'en-US': 'Open WhatsApp on the station phone → Linked devices → Link a device and scan the code.' },
  'conectores.pair.refresh': { 'pt-BR': 'Gerar novo código', 'en-US': 'Generate new code' },
  'conectores.pair.state.connected': { 'pt-BR': 'Conectado', 'en-US': 'Connected' },
  'conectores.pair.state.awaiting_scan': { 'pt-BR': 'Aguardando leitura', 'en-US': 'Awaiting scan' },
  'conectores.pair.state.disconnected': { 'pt-BR': 'Desconectado', 'en-US': 'Disconnected' },
  'conectores.pair.state.error': { 'pt-BR': 'Erro', 'en-US': 'Error' },
  // Últimas mensagens da estação (nós MessageDelivery) no drilldown.
  'conectores.msgs.title': { 'pt-BR': 'Últimas mensagens', 'en-US': 'Recent messages' },
  'conectores.msgs.empty': { 'pt-BR': 'Nenhuma mensagem ainda.', 'en-US': 'No messages yet.' },
  'conectores.msgs.unavailable': { 'pt-BR': 'Indisponível no momento.', 'en-US': 'Unavailable right now.' },
  'conectores.msgs.col.to': { 'pt-BR': 'Destino', 'en-US': 'To' },
  'conectores.msgs.col.status': { 'pt-BR': 'Situação', 'en-US': 'Status' },
  'conectores.msgs.col.when': { 'pt-BR': 'Quando', 'en-US': 'When' },
  'conectores.msgs.status.queued': { 'pt-BR': 'Na fila', 'en-US': 'Queued' },
  'conectores.msgs.status.accepted': { 'pt-BR': 'Aceita', 'en-US': 'Accepted' },
  'conectores.msgs.status.delivered': { 'pt-BR': 'Entregue', 'en-US': 'Delivered' },
  'conectores.msgs.status.read': { 'pt-BR': 'Lida', 'en-US': 'Read' },
  'conectores.msgs.status.failed': { 'pt-BR': 'Falhou', 'en-US': 'Failed' },

  // ─── Alertas — Rotas de notificação (/painel-de-controle/alertas) ────
  'alertasRotas.title': { 'pt-BR': 'Alertas', 'en-US': 'Alerts' },
  'alertasRotas.subtitle': { 'pt-BR': 'Rotas de notificação: para cada tipo de alerta e severidade mínima, escolha o canal de entrega. Silenciar e desativar são gestos auditados.', 'en-US': 'Notification routes: for each alert type and minimum severity, pick the delivery channel. Silencing and deactivating are audited gestures.' },
  'alertasRotas.new': { 'pt-BR': 'Nova rota', 'en-US': 'New route' },
  'alertasRotas.empty': { 'pt-BR': 'Nenhuma rota de notificação.', 'en-US': 'No notification routes.' },
  'alertasRotas.empty_desc': { 'pt-BR': 'Sem rotas, os alertas aparecem só na caixa de alertas — ninguém é notificado por canal externo.', 'en-US': 'Without routes, alerts only show in the alert inbox — nobody is notified through an external channel.' },
  'alertasRotas.error': { 'pt-BR': 'Não foi possível carregar as rotas de notificação.', 'en-US': 'Could not load the notification routes.' },
  'alertasRotas.gesture_failed': { 'pt-BR': 'A ação falhou. Tente novamente.', 'en-US': 'The action failed. Try again.' },
  'alertasRotas.save_failed': { 'pt-BR': 'Não foi possível salvar a rota.', 'en-US': 'Could not save the route.' },
  'alertasRotas.col.name': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'alertasRotas.col.match': { 'pt-BR': 'Casa com', 'en-US': 'Matches' },
  'alertasRotas.col.channel': { 'pt-BR': 'Canal', 'en-US': 'Channel' },
  'alertasRotas.col.silence': { 'pt-BR': 'Silêncio', 'en-US': 'Silence' },
  'alertasRotas.col.active': { 'pt-BR': 'Estado', 'en-US': 'State' },
  'alertasRotas.match_all_kinds': { 'pt-BR': 'Todos os tipos', 'en-US': 'All types' },
  'alertasRotas.min_severity_prefix': { 'pt-BR': 'Severidade ≥', 'en-US': 'Severity ≥' },
  'alertasRotas.active': { 'pt-BR': 'Ativa', 'en-US': 'Active' },
  'alertasRotas.inactive': { 'pt-BR': 'Inativa', 'en-US': 'Inactive' },
  'alertasRotas.silence': { 'pt-BR': 'Silenciar', 'en-US': 'Silence' },
  'alertasRotas.unsilence': { 'pt-BR': 'Tirar silêncio', 'en-US': 'Unsilence' },
  'alertasRotas.deactivate': { 'pt-BR': 'Desativar', 'en-US': 'Deactivate' },
  'alertasRotas.activate': { 'pt-BR': 'Ativar', 'en-US': 'Activate' },
  'alertasRotas.silence_prompt_title': { 'pt-BR': 'Silenciar por quanto tempo?', 'en-US': 'Silence for how long?' },
  'alertasRotas.silence_prompt_desc': { 'pt-BR': 'Duração em minutos (ex.: 60). A rota volta a notificar sozinha quando o tempo acabar.', 'en-US': 'Duration in minutes (e.g. 60). The route resumes notifying on its own when the time is up.' },
  'alertasRotas.silence_invalid': { 'pt-BR': 'Duração inválida — informe minutos como número maior que zero.', 'en-US': 'Invalid duration — enter minutes as a number greater than zero.' },
  'alertasRotas.silence_confirm_title': { 'pt-BR': 'Confirmar silêncio', 'en-US': 'Confirm silence' },
  'alertasRotas.silence_confirm_desc': { 'pt-BR': 'Silenciar "{name}" por {minutes} minutos? Alertas que casarem nesse período NÃO serão entregues por este canal (o gesto fica auditado).', 'en-US': 'Silence "{name}" for {minutes} minutes? Matching alerts during this period will NOT be delivered through this channel (the gesture is audited).' },
  'alertasRotas.unsilence_confirm_title': { 'pt-BR': 'Tirar o silêncio', 'en-US': 'Remove silence' },
  'alertasRotas.unsilence_confirm_desc': { 'pt-BR': 'Voltar a entregar notificações pela rota "{name}" agora?', 'en-US': 'Resume delivering notifications through route "{name}" now?' },
  'alertasRotas.deactivate_confirm_title': { 'pt-BR': 'Desativar rota', 'en-US': 'Deactivate route' },
  'alertasRotas.deactivate_confirm_desc': { 'pt-BR': 'Desativar "{name}"? A rota deixa de entregar notificações até ser reativada.', 'en-US': 'Deactivate "{name}"? The route stops delivering notifications until reactivated.' },
  'alertasRotas.activate_confirm_title': { 'pt-BR': 'Ativar rota', 'en-US': 'Activate route' },
  'alertasRotas.activate_confirm_desc': { 'pt-BR': 'Ativar "{name}"? A rota volta a entregar notificações.', 'en-US': 'Activate "{name}"? The route resumes delivering notifications.' },
  'alertasRotas.delete_confirm_title': { 'pt-BR': 'Remover rota', 'en-US': 'Remove route' },
  'alertasRotas.delete_confirm_desc': { 'pt-BR': 'Remover a rota "{name}" definitivamente? O gesto fica auditado.', 'en-US': 'Permanently remove route "{name}"? The gesture is audited.' },
  'alertasRotas.create_title': { 'pt-BR': 'Nova rota de notificação', 'en-US': 'New notification route' },
  'alertasRotas.edit_title': { 'pt-BR': 'Editar rota', 'en-US': 'Edit route' },
  'alertasRotas.f.name': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'alertasRotas.f.name_required': { 'pt-BR': 'Dê um nome à rota.', 'en-US': 'Give the route a name.' },
  'alertasRotas.f.kinds': { 'pt-BR': 'Tipos de alerta', 'en-US': 'Alert types' },
  'alertasRotas.f.kinds_hint': { 'pt-BR': 'Nenhum marcado = casa com todos os tipos.', 'en-US': 'None checked = matches all types.' },
  'alertasRotas.f.min_severity': { 'pt-BR': 'Severidade mínima', 'en-US': 'Minimum severity' },
  'alertasRotas.f.channel': { 'pt-BR': 'Canal de entrega', 'en-US': 'Delivery channel' },
  'alertasRotas.f.config_ref': { 'pt-BR': 'Configuração do canal', 'en-US': 'Channel configuration' },
  'alertasRotas.f.config_ref_default': { 'pt-BR': 'Padrão do canal', 'en-US': 'Channel default' },
  'alertasRotas.channel_warning': { 'pt-BR': 'Este canal ainda não tem configuração neste ambiente — a entrega vai falhar até a configuração ser cadastrada (a falha fica auditada).', 'en-US': 'This channel has no configuration in this environment yet — delivery will fail until it is configured (the failure is audited).' },
  'alertasRotas.channel_cfg.action': { 'pt-BR': 'Configurar canal', 'en-US': 'Configure channel' },
  'alertasRotas.channel_cfg.title': { 'pt-BR': 'Configuração do canal', 'en-US': 'Channel configuration' },
  'alertasRotas.channel_cfg.url': { 'pt-BR': 'Endereço de entrega', 'en-US': 'Delivery address' },
  'alertasRotas.channel_cfg.url_hint': { 'pt-BR': 'Endereço do webhook fornecido pelo destino (ex.: canal do Discord da equipe). Depois de salvo, ele nunca mais é exibido por inteiro.', 'en-US': 'Webhook address given by the destination (e.g. the team’s Discord channel). Once saved, it is never shown in full again.' },
  'alertasRotas.channel_cfg.username': { 'pt-BR': 'Nome que assina a mensagem', 'en-US': 'Name signing the message' },
  'alertasRotas.channel_cfg.saved': { 'pt-BR': 'Canal configurado.', 'en-US': 'Channel configured.' },
  'alertasRotas.channel_cfg.current': { 'pt-BR': 'Configurado', 'en-US': 'Configured' },
  'alertasRotas.channel.discord': { 'pt-BR': 'Discord', 'en-US': 'Discord' },
  'alertasRotas.sev.low': { 'pt-BR': 'Baixa', 'en-US': 'Low' },
  'alertasRotas.sev.medium': { 'pt-BR': 'Média', 'en-US': 'Medium' },
  'alertasRotas.sev.high': { 'pt-BR': 'Alta', 'en-US': 'High' },
  'alertasRotas.sev.critical': { 'pt-BR': 'Crítica', 'en-US': 'Critical' },
  'alertasRotas.kind.search_feed': { 'pt-BR': 'Busca salva', 'en-US': 'Saved search' },
  'alertasRotas.kind.object_watch': { 'pt-BR': 'Objeto vigiado', 'en-US': 'Watched object' },
  'alertasRotas.kind.geofence': { 'pt-BR': 'Cerca virtual', 'en-US': 'Geofence' },
  'alertasRotas.kind.share': { 'pt-BR': 'Compartilhamento', 'en-US': 'Sharing' },
  'alertasRotas.channel.log': { 'pt-BR': 'Registro interno', 'en-US': 'Internal log' },
  'alertasRotas.channel.webhook': { 'pt-BR': 'Webhook', 'en-US': 'Webhook' },
  'alertasRotas.channel.whatsapp': { 'pt-BR': 'WhatsApp', 'en-US': 'WhatsApp' },
  // Tarefa E — labels de skill no DISPLAY LAYER (lib/i18n/skill-labels.ts):
  // pt-BR ESPELHA o texto do backend (classes Skill do catálogo); en-US é o
  // par traduzido. Skill sem par aqui cai no label/descrição do catálogo.
  'skills.connector.http.label': { 'pt-BR': 'Conector HTTP', 'en-US': 'HTTP connector' },
  'skills.connector.http.desc': {
    'pt-BR': 'Conecta QUALQUER API HTTP e ingere os registros pra ontologia. Auth none/api_key/bearer/basic/oauth2; paginação page/offset/cursor/link; body+headers; node_type configurável. Genérico/multi-domínio.',
    'en-US': 'Connects ANY HTTP API and ingests the records into the ontology. Auth none/api_key/bearer/basic/oauth2; page/offset/cursor/link pagination; body+headers; configurable node_type. Generic/multi-domain.',
  },
  'skills.connector.singer.label': { 'pt-BR': 'Conector Singer (taps)', 'en-US': 'Singer connector (taps)' },
  'skills.connector.singer.desc': {
    'pt-BR': 'Roda um Singer tap (tap-github, tap-stripe, tap-postgres, …) e ingere os RECORDs como objetos tipados na ontologia. Um adaptador, todo o ecossistema Singer/Meltano.',
    'en-US': 'Runs a Singer tap (tap-github, tap-stripe, tap-postgres, …) and ingests the RECORDs as typed objects into the ontology. One adapter, the whole Singer/Meltano ecosystem.',
  },
  'skills.camera.detect_tick.label': { 'pt-BR': 'Detecção contínua de câmeras', 'en-US': 'Continuous camera detection' },
  'skills.camera.detect_tick.desc': {
    'pt-BR': "Roda a detecção por IA nas câmeras com 'Detecção ativa' ligada. A cada execução agendada, cada câmera elegível vira um job de análise de vídeo na GPU; com envio automático ligado, as detecções entram direto no acervo de evidências.",
    'en-US': "Runs AI detection on the cameras with 'Active detection' turned on. On each scheduled run, every eligible camera becomes a GPU video-analysis job; with auto-push on, detections land straight in the evidence library.",
  },
  // Tarefa B — camera.stream: UMA câmera como conector dedicado (pt-BR espelha o backend).
  'skills.camera.stream.label': { 'pt-BR': 'Câmera (sensor dedicado)', 'en-US': 'Camera (dedicated sensor)' },
  'skills.camera.stream.desc': {
    'pt-BR': 'Liga UMA câmera como conector dedicado: a cada execução agendada, a câmera escolhida vira um job de análise de vídeo na GPU com a config própria do conector — sensibilidade, classes de interesse e amostragem de quadros. Com envio automático ligado, as detecções entram direto no acervo de evidências.',
    'en-US': "Turns ONE camera into a dedicated connector: on every scheduled run, the chosen camera becomes a GPU video-analysis job with the connector's own config — sensitivity, classes of interest and frame sampling. With auto-push on, detections land straight in the evidence library.",
  },
  // Tarefa B (2026-06-11) — Dispositivos na central de Conectores: pareamento
  // e gestão dos equipamentos do local (gateways de câmera + estações). Sem
  // jargão de máquina nem marca ("AEGIS Edge") nas strings.
  'edge.title': { 'pt-BR': 'Dispositivos', 'en-US': 'Devices' },
  'common.refresh': { 'pt-BR': 'Atualizar', 'en-US': 'Refresh' },
  'osdk.title': { 'pt-BR': 'Tokens OSDK', 'en-US': 'OSDK tokens' },
  'osdk.subtitle': { 'pt-BR': 'Aplicações de integração — tokens de API para SDKs, automações e sensores externos.', 'en-US': 'Integration applications — API tokens for SDKs, automations and external sensors.' },
  'osdk.empty': { 'pt-BR': 'Nenhum token emitido.', 'en-US': 'No tokens issued.' },
  'osdk.revoked': { 'pt-BR': 'Revogado', 'en-US': 'Revoked' },
  'osdk.revoke': { 'pt-BR': 'Revogar', 'en-US': 'Revoke' },
  // Modal "Nova aplicação" de Tokens OSDK + seletor de escopo (refatorados).
  'osdk.create.trigger': { 'pt-BR': 'Nova aplicação', 'en-US': 'New application' },
  'osdk.create.title': { 'pt-BR': 'Nova aplicação OSDK', 'en-US': 'New OSDK application' },
  'osdk.create.subtitle': { 'pt-BR': 'Emita um token de API com escopos explícitos para uma integração externa.', 'en-US': 'Issue an API token with explicit scopes for an external integration.' },
  'osdk.create.name_label': { 'pt-BR': 'Nome da aplicação', 'en-US': 'Application name' },
  'osdk.create.name_placeholder': { 'pt-BR': 'minha-integracao', 'en-US': 'my-integration' },
  'osdk.create.name_hint': { 'pt-BR': 'Identifica a integração nos registros de auditoria. Mínimo de 3 caracteres.', 'en-US': 'Identifies the integration in audit records. Minimum of 3 characters.' },
  'osdk.create.name_invalid': { 'pt-BR': 'Informe ao menos 3 caracteres.', 'en-US': 'Enter at least 3 characters.' },
  'osdk.create.scopes_label': { 'pt-BR': 'Escopos de acesso', 'en-US': 'Access scopes' },
  'osdk.create.scopes_hint': { 'pt-BR': 'Selecione apenas o que a integração precisa. Os escopos podem ser alterados depois.', 'en-US': 'Select only what the integration needs. Scopes can be changed later.' },
  'osdk.create.submit': { 'pt-BR': 'Criar aplicação', 'en-US': 'Create application' },
  'osdk.create.error': { 'pt-BR': 'Falha ao criar a aplicação.', 'en-US': 'Could not create the application.' },
  'osdk.secret.title': { 'pt-BR': 'Segredo da aplicação', 'en-US': 'Application secret' },
  'osdk.secret.subtitle': { 'pt-BR': 'Aplicação criada. O token abaixo aparece uma única vez.', 'en-US': 'Application created. The token below is shown only once.' },
  'osdk.secret.warning': { 'pt-BR': 'Copie este token agora. Ele é exibido uma única vez — o servidor guarda apenas o hash. Se perdê-lo, será preciso rotacionar a aplicação.', 'en-US': 'Copy this token now. It is shown only once — the server stores only its hash. If you lose it, you will have to rotate the application.' },
  'osdk.secret.token_label': { 'pt-BR': 'Token', 'en-US': 'Token' },
  'osdk.secret.copy': { 'pt-BR': 'Copiar', 'en-US': 'Copy' },
  'osdk.secret.copied': { 'pt-BR': 'Copiado', 'en-US': 'Copied' },
  'osdk.secret.copy_failed': { 'pt-BR': 'Não foi possível copiar automaticamente. Selecione o texto e copie à mão.', 'en-US': 'Could not copy automatically. Select the text and copy it manually.' },
  'osdk.secret.id_label': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  'osdk.secret.scopes_label': { 'pt-BR': 'Escopos', 'en-US': 'Scopes' },
  'osdk.secret.footer_hint': { 'pt-BR': 'Guarde o token antes de fechar.', 'en-US': 'Store the token before closing.' },
  'osdk.secret.done': { 'pt-BR': 'Concluir', 'en-US': 'Done' },
  'osdk.scope.search_placeholder': { 'pt-BR': 'Filtrar escopos…', 'en-US': 'Filter scopes…' },
  'osdk.scope.search_label': { 'pt-BR': 'Filtrar escopos por nome, chave ou descrição', 'en-US': 'Filter scopes by name, key or description' },
  'osdk.scope.clear_filter': { 'pt-BR': 'Limpar filtro', 'en-US': 'Clear filter' },
  'osdk.scope.select_all': { 'pt-BR': 'Selecionar tudo', 'en-US': 'Select all' },
  'osdk.scope.clear_all': { 'pt-BR': 'Limpar', 'en-US': 'Clear' },
  'osdk.scope.preset_readonly': { 'pt-BR': 'Somente leitura', 'en-US': 'Read only' },
  'osdk.scope.preset_readonly_hint': { 'pt-BR': 'Seleciona todos os escopos de leitura do catálogo e descarta os de escrita.', 'en-US': 'Selects every read scope in the catalogue and drops the write ones.' },
  'osdk.scope.expand_all': { 'pt-BR': 'Expandir tudo', 'en-US': 'Expand all' },
  'osdk.scope.collapse_all': { 'pt-BR': 'Colapsar tudo', 'en-US': 'Collapse all' },
  'osdk.scope.selected_suffix': { 'pt-BR': 'escopos selecionados', 'en-US': 'scopes selected' },
  'osdk.scope.bulk_filtered_note': { 'pt-BR': 'Com filtro ativo, "Selecionar tudo" e "Limpar" valem só para os escopos visíveis.', 'en-US': 'With a filter active, "Select all" and "Clear" apply only to the visible scopes.' },
  'osdk.scope.select_group': { 'pt-BR': 'Selecionar o grupo inteiro', 'en-US': 'Select the whole group' },
  'osdk.scope.loading': { 'pt-BR': 'Carregando catálogo de escopos…', 'en-US': 'Loading scope catalogue…' },
  'osdk.scope.load_error': { 'pt-BR': 'Falha ao carregar o catálogo de escopos.', 'en-US': 'Could not load the scope catalogue.' },
  'osdk.scope.no_match': { 'pt-BR': 'Nenhum escopo corresponde ao filtro.', 'en-US': 'No scope matches the filter.' },
  'osdk.scope.empty': { 'pt-BR': 'Catálogo de escopos vazio.', 'en-US': 'Scope catalogue is empty.' },
  'edge.subtitle': { 'pt-BR': 'Equipamentos e estações instalados no local, conectados à plataforma.', 'en-US': 'On-site appliances and stations connected to the platform.' },
  'edge.refresh': { 'pt-BR': 'Atualizar lista', 'en-US': 'Refresh list' },
  'edge.empty': { 'pt-BR': 'Nenhum dispositivo pareado ainda. Use "Parear novo dispositivo" para conectar o primeiro.', 'en-US': 'No device paired yet. Use "Pair new device" to connect the first one.' },
  'edge.unnamed': { 'pt-BR': 'Dispositivo sem nome', 'en-US': 'Unnamed device' },
  // Tipo do dispositivo (campo aditivo `kind` do backend). Label neutro; kind
  // desconhecido não renderiza badge (nunca o valor cru).
  'edge.kind.camera_gateway': { 'pt-BR': 'Gateway de câmeras', 'en-US': 'Camera gateway' },
  'edge.kind.whatsapp_station': { 'pt-BR': 'Estação WhatsApp', 'en-US': 'WhatsApp station' },
  'edge.kind.whatsapp_pool': { 'pt-BR': 'Estação de números', 'en-US': 'Number station' },
  'edge.kind.autosync_bridge': { 'pt-BR': 'Ponte AutoSync', 'en-US': 'AutoSync bridge' },
  // Estação de POOL — inventário de números publicado pelo tick da skill
  // (nodes[].pool). Vocabulário do pool traduzido; valor cru nunca aparece.
  'edge.kind.android_bench': { 'pt-BR': 'Bancada de aparelhos', 'en-US': 'Device bench' },
  // App de mesa: o aviso na tela do operador. Pareia como Dispositivo (sem
  // senha na maquina do cliente) e por isso aparece aqui, com revogar junto.
  'edge.kind.desk_app': { 'pt-BR': 'App de mesa', 'en-US': 'Desk app' },
  // Concessao de GESTO no pareamento. O texto diz o que esta sendo dado e o
  // que continua fora: ler saude e' sempre; AGIR e' escolha — e os dois
  // gestos sao concessoes INDEPENDENTES (checkbox, nao radio): religar e
  // mostrar QR sao riscos diferentes (QR deixa assumir a sessao do numero),
  // um dispositivo pode ganhar so um, os dois, ou nenhum.
  'edge.pair.grant.title': { 'pt-BR': 'Permissões do novo dispositivo', 'en-US': 'New device permissions' },
  'edge.pair.grant.body': { 'pt-BR': 'Escolha o que este dispositivo poderá fazer sozinho, sem esperar por um operador. Cada permissão é independente — marque só o que ele realmente precisa.', 'en-US': 'Choose what this device will be able to do on its own, without waiting on an operator. Each permission is independent — check only what it actually needs.' },
  'edge.pair.grant.confirm': { 'pt-BR': 'Gerar código de pareamento', 'en-US': 'Generate pairing code' },
  'edge.pair.grant.yes': { 'pt-BR': 'Reconectar sozinho', 'en-US': 'Reconnect on its own' },
  'edge.pair.grant.yes_hint': { 'pt-BR': 'Tenta reconectar um canal automaticamente, sem precisar mostrar nenhum código.', 'en-US': 'Tries to reconnect a channel automatically, without needing to show any code.' },
  'edge.pair.grant.qr': { 'pt-BR': 'Mostrar código de conexão', 'en-US': 'Show connection code' },
  'edge.pair.grant.qr_hint': { 'pt-BR': 'Gera um código (QR) na tela para reconectar um canal manualmente. Quem vir esse código pode assumir a conexão.', 'en-US': 'Generates an on-screen code (QR) to reconnect a channel by hand. Whoever sees this code can take over the connection.' },
  'edge.pair.grant.sensitive': { 'pt-BR': 'Mais sensível', 'en-US': 'More sensitive' },
  'edge.pair.grant.no': { 'pt-BR': 'Somente leitura', 'en-US': 'Read only' },
  'edge.pair.grant.none_footnote': { 'pt-BR': 'Nada marcado = o dispositivo só acompanha e avisa, nunca age sozinho.', 'en-US': 'Nothing checked = the device only watches and alerts, never acts on its own.' },
  // Conectar aparelho — o gesto que faltava. O texto ENSINA: os dois enderecos
  // que o Android mostra sao diferentes, e trocar um pelo outro e' o erro mais
  // provavel de quem faz isso pela primeira vez.
  'edge.bench.connect': { 'pt-BR': 'Conectar aparelho', 'en-US': 'Connect device' },
  'edge.bench.pin.set': { 'pt-BR': 'Senha da tela', 'en-US': 'Screen PIN' },
  'edge.bench.forget': { 'pt-BR': 'Esquecer', 'en-US': 'Forget' },
  'edge.bench.forget.confirm.title': {
    'pt-BR': 'Esquecer o aparelho {n}?', 'en-US': 'Forget device {n}?',
  },
  'edge.bench.forget.confirm.body': {
    'pt-BR': 'A automacao para de usar este aparelho. O celular em si nao muda — para desfazer, conecte de novo.',
    'en-US': 'Automation stops using this device. The phone itself is unchanged — to undo, connect it again.',
  },
  'edge.bench.pin.on': { 'pt-BR': 'senha definida', 'en-US': 'PIN set' },
  // Aparelho DECLARADO que sumiu do adb. O caso mais comum e o mais invisivel:
  // o celular reiniciou, e o Android DESLIGA a Depuracao sem fio a cada
  // reinicio (comportamento de projeto, nao defeito). Sem esta linha o card
  // dizia "Declarado" — verdade inutil, que nao manda ninguem fazer nada.
  'edge.bench.adoption.ausente': { 'pt-BR': 'Sem contato', 'en-US': 'No contact' },
  'edge.bench.adoption.ausente.hint': {
    'pt-BR': 'O aparelho nao responde. Se ele reiniciou, o Android desligou a Depuracao sem fio sozinho: ligue de novo no celular e use Conectar aparelho. Em bancada de producao, prefira o CABO — a Depuracao USB sobrevive ao reinicio.',
    'en-US': 'The device is not responding. If it rebooted, Android turned Wireless debugging off by itself: turn it back on and use Connect device. For production benches prefer the CABLE — USB debugging survives reboots.',
  },
  'edge.bench.adoption.queued': { 'pt-BR': 'Na fila para conectar', 'en-US': 'Queued to connect' },
  'edge.bench.adoption.pairing': { 'pt-BR': 'Conectando…', 'en-US': 'Connecting…' },
  'edge.bench.adoption.ready': { 'pt-BR': 'Declarado', 'en-US': 'Declared' },
  'edge.bench.adoption.failed': { 'pt-BR': 'Nao consegui conectar', 'en-US': 'Could not connect' },
  'edge.bench.form.title.add': { 'pt-BR': 'Conectar aparelho', 'en-US': 'Connect device' },
  'edge.bench.form.title.pin': { 'pt-BR': 'Senha da tela do aparelho', 'en-US': 'Device screen PIN' },
  'edge.bench.form.mode.rede': { 'pt-BR': 'Sem fio (Wi-Fi)', 'en-US': 'Wireless (Wi-Fi)' },
  'edge.bench.form.mode.usb': { 'pt-BR': 'Cabo (USB)', 'en-US': 'Cable (USB)' },
  'edge.bench.form.step1.rede': {
    'pt-BR': 'No celular: Ajustes → Sobre o telefone → toque 7x em "Numero da versao" (libera Opcoes do desenvolvedor).',
    'en-US': 'On the phone: Settings → About phone → tap "Build number" 7x (unlocks Developer options).',
  },
  'edge.bench.form.step2.rede': {
    'pt-BR': 'Opcoes do desenvolvedor → Depuracao sem fio (Wireless debugging) → ligar → tocar em "Emparelhar aparelho com codigo".',
    'en-US': 'Developer options → Wireless debugging → turn on → tap "Pair device with pairing code".',
  },
  'edge.bench.form.step3.rede': {
    'pt-BR': 'Abre uma janelinha "Pair with device" com um codigo de 6 digitos e um endereco logo abaixo. Copie os DOIS daquela janelinha — so dela.',
    'en-US': 'A "Pair with device" popup opens with a 6-digit code and an address right below it. Copy BOTH from that popup — only from it.',
  },
  'edge.bench.form.step1.usb': {
    'pt-BR': 'No celular: Ajustes → Sobre o telefone → toque 7x em "Numero da versao".',
    'en-US': 'On the phone: Settings → About phone → tap "Build number" 7x.',
  },
  'edge.bench.form.step2.usb': {
    'pt-BR': 'Opcoes do desenvolvedor → Depuracao USB ligada. Conecte o cabo na maquina da ilha.',
    'en-US': 'Developer options → USB debugging on. Plug the cable into the site machine.',
  },
  'edge.bench.form.step3.usb': {
    'pt-BR': 'Toque em "Permitir" no aviso que aparece no celular (marque "sempre permitir").',
    'en-US': 'Tap "Allow" on the prompt shown on the phone (check "always allow").',
  },
  'edge.bench.form.serial.wifi': { 'pt-BR': 'Endereco de CONEXAO (ip:porta)', 'en-US': 'CONNECTION address (ip:port)' },
  'edge.bench.form.serial.usb': { 'pt-BR': 'Numero de serie do aparelho', 'en-US': 'Device serial number' },
  'edge.bench.form.serial.hint': {
    'pt-BR': 'Copie inteiro, com os dois pontos e o numero depois — por exemplo 192.168.1.64:44699.',
    'en-US': 'Copy it whole, with the colon and the number after it — e.g. 192.168.1.64:44699.',
  },
  'edge.bench.form.map.conn': { 'pt-BR': 'campo 1', 'en-US': 'field 1' },
  'edge.bench.form.map.code': { 'pt-BR': 'campo 2', 'en-US': 'field 2' },
  'edge.bench.form.map.pair': { 'pt-BR': 'campo 3', 'en-US': 'field 3' },
  'edge.bench.form.conn': {
    'pt-BR': '1. Endereco do ALTO da tela (fica sempre visivel)',
    'en-US': '1. Address at the TOP of the screen (always visible)',
  },
  'edge.bench.form.conn.hint': {
    'pt-BR': 'E por ele que a estacao fala com o celular. Muda quando o aparelho reinicia — se a conexao cair, e so conectar de novo com o numero novo.',
    'en-US': 'This is how the station talks to the phone. It changes when the device reboots — if the connection drops, just connect again with the new number.',
  },
  'edge.bench.form.pair': {
    'pt-BR': '3. Endereco LOGO ABAIXO do codigo, na mesma janelinha',
    'en-US': '3. Address RIGHT BELOW the code, in the same popup',
  },
  'edge.bench.form.pair.hint': {
    'pt-BR': 'O aparelho escreve "IP address & Port" nos DOIS lugares — o desenho acima mostra qual e qual. Este e o de baixo, o que aparece junto do codigo.',
    'en-US': 'The phone writes "IP address & Port" in BOTH places — the diagram above shows which is which. This is the lower one, next to the code.',
  },
  'edge.bench.form.code': {
    'pt-BR': '2. Codigo de 6 digitos (Wi-Fi pairing code)',
    'en-US': '2. Six-digit code (Wi-Fi pairing code)',
  },
  'edge.bench.form.code.hint': {
    'pt-BR': 'DEIXE A JANELINHA ABERTA no celular ate o card dizer Pronto: fechar (ou tocar em Cancelar) mata o endereco de pareamento e a conexao falha.',
    'en-US': 'KEEP THE POPUP OPEN on the phone until the card says Ready: closing it (or tapping Cancel) kills the pairing address and the connection fails.',
  },
  'edge.bench.form.pin': { 'pt-BR': 'Senha da tela (opcional)', 'en-US': 'Screen PIN (optional)' },
  'edge.bench.form.pin.hint': {
    'pt-BR': 'So se o celular tiver bloqueio por PIN. Fica guardada na estacao — nunca aparece nesta tela.',
    'en-US': 'Only if the phone has PIN lock. Stored on the station — never shown on this screen.',
  },
  'edge.bench.form.pin.digits': {
    'pt-BR': 'Só digitos: padrao de desenho e biometria nao podem ser digitados pela automacao.',
    'en-US': 'Digits only: pattern and biometrics cannot be typed by the automation.',
  },
  'edge.bench.form.async': {
    'pt-BR': 'A estacao pareia e procura o aparelho na rede — leva alguns segundos. Acompanhe no card.',
    'en-US': 'The station pairs and finds the device on the network — takes a few seconds. Follow it on the card.',
  },
  'edge.bench.form.submit.add': { 'pt-BR': 'Conectar', 'en-US': 'Connect' },
  'edge.bench.form.submit.pin': { 'pt-BR': 'Salvar senha', 'en-US': 'Save PIN' },
  'edge.bench.form.error': {
    'pt-BR': 'Nao consegui registrar o aparelho.', 'en-US': 'Could not register the device.',
  },
  // Aplicativo por aparelho. Rotulo humano, nunca o nome do pacote: 'com.
  // whatsapp.w4b' nao diz nada para quem opera a portaria.
  'edge.bench.app': { 'pt-BR': 'Aplicativo', 'en-US': 'App' },
  'edge.bench.app.com.whatsapp': { 'pt-BR': 'WhatsApp', 'en-US': 'WhatsApp' },
  'edge.bench.app.com.whatsapp.w4b': {
    'pt-BR': 'WhatsApp Business', 'en-US': 'WhatsApp Business',
  },
  'edge.bench.app.escolher': {
    'pt-BR': 'Escolha o aplicativo', 'en-US': 'Choose the app',
  },
  'edge.bench.app.pendente': {
    'pt-BR': 'falta escolher o aplicativo', 'en-US': 'app not chosen yet',
  },
  'edge.bench.app.hint': {
    'pt-BR': 'O aparelho tem mais de um instalado. A automacao precisa saber em qual esta a conta — abrir o errado cai na tela de cadastro.',
    'en-US': 'The phone has more than one installed. The automation needs to know which holds the account — opening the wrong one lands on the signup screen.',
  },
  'edge.bench.app.vazio': {
    'pt-BR': 'Nenhum aplicativo de mensageria encontrado neste aparelho.',
    'en-US': 'No messaging app found on this device.',
  },
  'edge.bench.nocarregador': {
    'pt-BR': 'fora do carregador', 'en-US': 'unplugged',
  },
  'edge.bench.nocarregador.hint': {
    'pt-BR': 'Aparelho fora da energia entra em sono profundo: o Wi-Fi desliga e a estacao perde o contato. Mantenha-o no carregador.',
    'en-US': 'An unplugged device goes into deep sleep: Wi-Fi turns off and the station loses contact. Keep it plugged in.',
  },
  // Vinculo aparelho -> numero, FEITO NA BANCADA. O operador ve "sem numero
  // atribuido" aqui; mandar ele procurar o formulario do numero noutro cartao
  // e mandar ele adivinhar onde fica o gesto que a propria tela pediu.
  'edge.bench.atribuir': { 'pt-BR': 'Atribuir numero', 'en-US': 'Assign number' },
  'edge.bench.atribuir.title': {
    'pt-BR': 'Qual numero este aparelho religa?',
    'en-US': 'Which number does this device reconnect?',
  },
  'edge.bench.atribuir.hint': {
    'pt-BR': 'Um aparelho atende UM numero: o codigo de um digitado no aplicativo do outro invalida os dois.',
    'en-US': 'One device serves ONE number: typing one number\u2019s code into the other\u2019s app invalidates both.',
  },
  'edge.bench.atribuir.nenhum': {
    'pt-BR': 'Nenhum (sem automacao)', 'en-US': 'None (no automation)',
  },
  'edge.bench.atribuir.vazio': {
    'pt-BR': 'A estacao ainda nao tem numeros cadastrados.',
    'en-US': 'The station has no numbers registered yet.',
  },
  'edge.bench.title': { 'pt-BR': 'Aparelhos', 'en-US': 'Devices' },
  'edge.bench.summary': { 'pt-BR': '{n} de {m} prontos', 'en-US': '{n} of {m} ready' },
  'edge.bench.empty': {
    'pt-BR': 'Nenhum aparelho detectado. Ligue o celular a esta ilha (cabo ou depuracao sem fio) e autorize a conexao na tela do aparelho.',
    'en-US': 'No device detected. Connect the phone to this site (cable or wireless debugging) and authorize the connection on the phone screen.',
  },
  'edge.bench.state.device': { 'pt-BR': 'Pronto', 'en-US': 'Ready' },
  'edge.bench.state.unauthorized': {
    'pt-BR': 'Aguardando autorizacao no aparelho', 'en-US': 'Awaiting authorization on device',
  },
  'edge.bench.state.offline': { 'pt-BR': 'Sem contato', 'en-US': 'No contact' },
  'edge.bench.state.no_permissions': {
    'pt-BR': 'Sem permissao de acesso', 'en-US': 'No access permission',
  },
  'edge.bench.state.unknown': { 'pt-BR': 'Estado desconhecido', 'en-US': 'Unknown state' },
  'edge.bench.serves': { 'pt-BR': 'religa {n}', 'en-US': 'reconnects {n}' },
  'edge.bench.unassigned': { 'pt-BR': 'sem numero atribuido', 'en-US': 'no number assigned' },
  'edge.pool.retry': { 'pt-BR': 'Tentar de novo', 'en-US': 'Try again' },
  'edge.pool.retry.hint': {
    'pt-BR': 'Use depois de consertar o aparelho: devolve a chance para a automacao religar sozinha.',
    'en-US': 'Use after fixing the device: gives automation another chance to reconnect on its own.',
  },
  'edge.pool.title': { 'pt-BR': 'Números', 'en-US': 'Numbers' },
  'edge.pool.summary': { 'pt-BR': '{n} de {m} prontos para enviar', 'en-US': '{n} of {m} ready to send' },
  'edge.pool.queue': { 'pt-BR': '{n} aguardando gesto', 'en-US': '{n} awaiting action' },
  'edge.pool.role.titular': { 'pt-BR': 'Titular', 'en-US': 'Primary' },
  'edge.pool.role.vazao': { 'pt-BR': 'Vazão', 'en-US': 'Throughput' },
  'edge.pool.state.paired': { 'pt-BR': 'Pareado', 'en-US': 'Paired' },
  'edge.pool.state.awaiting_scan': { 'pt-BR': 'Aguardando pareamento', 'en-US': 'Awaiting pairing' },
  'edge.pool.state.temp_banned': { 'pt-BR': 'Suspenso temporariamente', 'en-US': 'Temporarily suspended' },
  'edge.pool.state.needs_relink': { 'pt-BR': 'Reconexão necessária', 'en-US': 'Relink required' },
  'edge.pool.state.dead': { 'pt-BR': 'Fora de operação', 'en-US': 'Out of service' },
  'edge.pool.state.quarantined': { 'pt-BR': 'Em quarentena', 'en-US': 'Quarantined' },
  'edge.pool.state.unknown': { 'pt-BR': 'Estado desconhecido', 'en-US': 'Unknown state' },
  'edge.pool.sent': { 'pt-BR': '{n} enviadas', 'en-US': '{n} sent' },
  'edge.pool.banned_until': { 'pt-BR': 'volta em {t}', 'en-US': 'back in {t}' },
  'edge.pool.auto.pending': { 'pt-BR': 'Religação na fila', 'en-US': 'Relink queued' },
  'edge.pool.auto.attempting': { 'pt-BR': 'Religando ({n}ª de {m})', 'en-US': 'Relinking ({n} of {m})' },
  'edge.pool.auto.confirming': { 'pt-BR': 'Aguardando confirmação', 'en-US': 'Awaiting confirmation' },
  'edge.pool.auto.needs_human': { 'pt-BR': 'Precisa de gente no aparelho', 'en-US': 'Needs a person at the device' },
  'edge.pool.auto.unknown': { 'pt-BR': 'Automação em estado desconhecido', 'en-US': 'Automation in unknown state' },
  'edge.pool.auto.battery': { 'pt-BR': 'bateria {n}%', 'en-US': 'battery {n}%' },
  'edge.pool.owner.vendor': { 'pt-BR': 'Nosso', 'en-US': 'Ours' },
  'edge.pool.owner.cliente': { 'pt-BR': 'Do cliente', 'en-US': "Customer's" },
  'edge.pool.add': { 'pt-BR': 'Cadastrar número', 'en-US': 'Add number' },
  'edge.pool.edit': { 'pt-BR': 'Editar', 'en-US': 'Edit' },
  'edge.pool.remove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'edge.pool.remove.confirm.title': { 'pt-BR': 'Remover o número {n}?', 'en-US': 'Remove number {n}?' },
  'edge.pool.remove.confirm.body': {
    'pt-BR': 'Ele sai do inventário da estação e as conversas presas a ele passam a sair por outro número. O histórico de mensagens não é apagado.',
    'en-US': 'It leaves the station inventory and conversations pinned to it move to another number. Message history is not deleted.',
  },
  'edge.pool.form.title.add': { 'pt-BR': 'Cadastrar número', 'en-US': 'Add number' },
  'edge.pool.form.title.edit': { 'pt-BR': 'Editar número', 'en-US': 'Edit number' },
  'edge.pool.form.id': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  'edge.pool.form.id.hint': {
    'pt-BR': 'Nome curto e estável (ex.: tit, v1). É por ele que o aparelho da automação é declarado.',
    'en-US': 'Short, stable name (e.g. tit, v1). The automation device is declared against it.',
  },
  'edge.pool.form.id.locked': {
    'pt-BR': 'O identificador não muda: é a chave do número na estação.',
    'en-US': 'The identifier cannot change: it is the number key in the station.',
  },
  'edge.pool.form.id.invalid': {
    'pt-BR': 'Use letras minúsculas, números, hífen ou sublinhado.',
    'en-US': 'Use lowercase letters, digits, hyphen or underscore.',
  },
  'edge.pool.form.msisdn': { 'pt-BR': 'Número (com DDI e DDD)', 'en-US': 'Number (with country and area code)' },
  'edge.pool.form.role': { 'pt-BR': 'Papel', 'en-US': 'Role' },
  'edge.pool.form.role.hint': {
    'pt-BR': 'O titular é o número que o cliente conhece — campanha nunca sai por ele.',
    'en-US': 'The primary is the number customers know — campaigns never go out through it.',
  },
  'edge.pool.form.owner': { 'pt-BR': 'Chip', 'en-US': 'SIM' },
  'edge.pool.form.error': { 'pt-BR': 'Não consegui salvar', 'en-US': 'Could not save' },
  'edge.pool.form.device': { 'pt-BR': 'Aparelho que religa (opcional)', 'en-US': 'Relinking device (optional)' },
  'edge.pool.form.device.hint': {
    'pt-BR': 'Serial do aparelho no adb (USB) ou ip:porta (rede). Preenchido, este número volta sozinho quando cair. Vazio = religação manual.',
    'en-US': 'Device serial in adb (USB) or ip:port (network). When set, this number relinks itself. Empty = manual relink.',
  },
  'edge.pool.device': { 'pt-BR': 'aparelho {n}', 'en-US': 'device {n}' },
  'edge.pool.form.device.none': { 'pt-BR': 'Sem automação (religação manual)', 'en-US': 'No automation (manual relink)' },
  'edge.pool.form.device.absent': { 'pt-BR': 'não está sendo visto agora', 'en-US': 'not visible right now' },
  'edge.pool.form.device.state.unauthorized': { 'pt-BR': 'autorize a depuração no aparelho', 'en-US': 'authorize debugging on the device' },
  'edge.pool.form.device.state.offline': { 'pt-BR': 'offline', 'en-US': 'offline' },
  'edge.pool.form.device.empty': {
    'pt-BR': 'Nenhum aparelho detectado. Conecte o celular na máquina da estação com a Depuração USB ligada — ele aparece nesta lista em até um minuto.',
    'en-US': 'No device detected. Connect the phone to the station host with USB debugging on — it shows up in this list within a minute.',
  },
  'edge.pool.mismatch': {
    'pt-BR': 'Pareado com {n} — diferente do cadastrado. Corrija o cadastro ou pareie com o chip certo.',
    'en-US': 'Paired with {n} — different from the registered number. Fix the record or pair the right SIM.',
  },
  'conectores.pair.number': { 'pt-BR': 'Número', 'en-US': 'Number' },
  // Ficha técnica do dispositivo (grade de metadados; rótulos em CSS uppercase).
  'edge.meta.version': { 'pt-BR': 'Versão', 'en-US': 'Version' },
  'edge.meta.version.none': { 'pt-BR': 'não informada', 'en-US': 'not reported' },
  'edge.meta.heartbeat': { 'pt-BR': 'Heartbeat', 'en-US': 'Heartbeat' },
  'edge.meta.last_seen': { 'pt-BR': 'Último contato', 'en-US': 'Last contact' },
  'edge.meta.cameras': { 'pt-BR': 'Câmeras ok', 'en-US': 'Cameras ok' },
  'edge.hb.active': { 'pt-BR': 'ativo', 'en-US': 'active' },
  'edge.hb.silent': { 'pt-BR': 'sem sinal', 'en-US': 'no signal' },
  'edge.hb.pending': { 'pt-BR': 'aguardando 1º contato', 'en-US': 'awaiting first contact' },
  'edge.hb.stopped': { 'pt-BR': 'interrompido', 'en-US': 'stopped' },
  'edge.configure.title': { 'pt-BR': 'Configurar dispositivo', 'en-US': 'Configure device' },
  // Cabeçalho + ficha técnica do conector de dados.
  'conectores.section.title': { 'pt-BR': 'Conectores de dados', 'en-US': 'Data connectors' },
  'conectores.section.subtitle': { 'pt-BR': 'Pipelines de ingestão: cada conector busca uma fonte no agendamento configurado e entrega os dados à plataforma.', 'en-US': 'Ingestion pipelines: each connector fetches a source on its configured schedule and delivers the data to the platform.' },
  'conectores.meta.slug': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  'conectores.meta.cadence': { 'pt-BR': 'Cadência', 'en-US': 'Cadence' },
  'conectores.meta.created': { 'pt-BR': 'Criado em', 'en-US': 'Created' },
  'conectores.meta.last_run': { 'pt-BR': 'Última execução', 'en-US': 'Last run' },
  'conectores.meta.duration': { 'pt-BR': 'Duração', 'en-US': 'Duration' },
  'conectores.meta.last_status': { 'pt-BR': 'Situação', 'en-US': 'Result' },
  'edge.status.online': { 'pt-BR': 'Online', 'en-US': 'Online' },
  'edge.status.offline': { 'pt-BR': 'Offline', 'en-US': 'Offline' },
  // Pareado mas ainda sem contato: nem online (não reportou) nem offline
  // (nunca deveria ter reportado ainda) — estado honesto, não promovido.
  'edge.status.paired': { 'pt-BR': 'Pareado', 'en-US': 'Paired' },
  'edge.status.revoked': { 'pt-BR': 'Revogado', 'en-US': 'Revoked' },
  'edge.update_available': { 'pt-BR': 'Atualização disponível', 'en-US': 'Update available' },
  'edge.version': { 'pt-BR': 'Versão', 'en-US': 'Version' },
  'edge.version.unknown': { 'pt-BR': 'Versão não informada', 'en-US': 'Version not reported' },
  'edge.expected_version': { 'pt-BR': 'Versão esperada: {v}', 'en-US': 'Expected version: {v}' },
  'edge.cameras_ok': { 'pt-BR': 'Câmeras ok: {n}', 'en-US': 'Cameras ok: {n}' },
  'edge.diag.selftest': { 'pt-BR': 'Autoteste do modelo:', 'en-US': 'Model self-test:' },
  'edge.diag.selftest.ok': { 'pt-BR': 'ok', 'en-US': 'ok' },
  'edge.diag.selftest.fail': { 'pt-BR': 'falha', 'en-US': 'failed' },
  'edge.diag.restarts': { 'pt-BR': 'Reinícios: {n}', 'en-US': 'Restarts: {n}' },
  'edge.last_seen.never': { 'pt-BR': 'Nunca conectou', 'en-US': 'Never connected' },
  'edge.last_seen.now': { 'pt-BR': 'Visto agora mesmo', 'en-US': 'Seen just now' },
  'edge.last_seen.min': { 'pt-BR': 'Visto há {n} min', 'en-US': 'Seen {n} min ago' },
  'edge.last_seen.h': { 'pt-BR': 'Visto há {n} h', 'en-US': 'Seen {n} h ago' },
  'edge.last_seen.d': { 'pt-BR': 'Visto há {n} dias', 'en-US': 'Seen {n} days ago' },
  'edge.error': { 'pt-BR': 'Falha ao carregar os equipamentos.', 'en-US': 'Failed to load the appliances.' },
  'edge.pair': { 'pt-BR': 'Parear novo dispositivo', 'en-US': 'Pair new device' },
  // Ação na LINHA de um dispositivo que pareia por conector (estação, ponte).
  'edge.pair.action': { 'pt-BR': 'Parear', 'en-US': 'Pair' },
  'edge.pair.title': { 'pt-BR': 'Parear novo dispositivo', 'en-US': 'Pair new device' },
  'edge.pair.instruction': { 'pt-BR': 'Informe este código na instalação do dispositivo no local. Ele vale uma única vez e expira em poucos minutos.', 'en-US': 'Enter this code during the device installation on site. It is valid once and expires in a few minutes.' },
  'edge.pair.expires_in': { 'pt-BR': 'Expira em {time}', 'en-US': 'Expires in {time}' },
  'edge.pair.expired': { 'pt-BR': 'Código expirado — feche e gere um novo.', 'en-US': 'Code expired — close and generate a new one.' },
  'edge.pair.copy': { 'pt-BR': 'Copiar código', 'en-US': 'Copy code' },
  'edge.pair.copied': { 'pt-BR': 'Copiado', 'en-US': 'Copied' },
  'edge.pair.error': { 'pt-BR': 'Falha ao gerar o código de pareamento.', 'en-US': 'Failed to generate the pairing code.' },
  'edge.revoke': { 'pt-BR': 'Revogar', 'en-US': 'Revoke' },
  'edge.confirm.revokeTitle': { 'pt-BR': 'Revogar acesso do dispositivo', 'en-US': 'Revoke device access' },
  'edge.confirm.revokeDesc': { 'pt-BR': '"{name}" perde o acesso à plataforma imediatamente e para de enviar dados. Esta ação não pode ser desfeita — para reconectar, será preciso parear de novo.', 'en-US': '"{name}" loses platform access immediately and stops sending data. This cannot be undone — reconnecting requires pairing again.' },
  // Onda 2 (2026-06-15) — Hotlist de placas procuradas (LPR) na central de
  // conectores: lista de PII que dispara o alerta lpr_hotlist.
  'hotlist.title': { 'pt-BR': 'Placas procuradas', 'en-US': 'Watched plates' },
  'hotlist.subtitle': { 'pt-BR': 'Placas que disparam um alerta quando lidas por uma câmera com leitura de placas (LPR). A placa é um dado pessoal — o acesso é registrado.', 'en-US': 'Plates that raise an alert when read by a camera with plate reading (LPR). A plate is personal data — access is logged.' },
  'hotlist.refresh': { 'pt-BR': 'Atualizar lista', 'en-US': 'Refresh list' },
  'hotlist.add': { 'pt-BR': 'Adicionar placa', 'en-US': 'Add plate' },
  'hotlist.empty': { 'pt-BR': 'Nenhuma placa procurada ainda. Adicione a primeira no formulário acima.', 'en-US': 'No watched plate yet. Add the first one in the form above.' },
  'hotlist.error': { 'pt-BR': 'Falha ao carregar as placas procuradas.', 'en-US': 'Failed to load the watched plates.' },
  'hotlist.active': { 'pt-BR': 'Ativa', 'en-US': 'Active' },
  'hotlist.inactive': { 'pt-BR': 'Inativa', 'en-US': 'Inactive' },
  'hotlist.noReason': { 'pt-BR': 'Sem motivo informado', 'en-US': 'No reason given' },
  'hotlist.hits': { 'pt-BR': '{n} acerto(s)', 'en-US': '{n} hit(s)' },
  'hotlist.f.plate': { 'pt-BR': 'Placa', 'en-US': 'Plate' },
  'hotlist.f.platePlaceholder': { 'pt-BR': 'ABC1D23', 'en-US': 'ABC1D23' },
  'hotlist.f.reason': { 'pt-BR': 'Motivo (opcional)', 'en-US': 'Reason (optional)' },
  'hotlist.f.reasonPlaceholder': { 'pt-BR': 'ex.: veículo de interesse — operação Centro', 'en-US': 'e.g. vehicle of interest — Downtown operation' },
  'hotlist.f.severity': { 'pt-BR': 'Severidade', 'en-US': 'Severity' },
  'hotlist.col.plate': { 'pt-BR': 'Placa', 'en-US': 'Plate' },
  'hotlist.col.reason': { 'pt-BR': 'Motivo', 'en-US': 'Reason' },
  'hotlist.col.severity': { 'pt-BR': 'Severidade', 'en-US': 'Severity' },
  'hotlist.col.state': { 'pt-BR': 'Estado', 'en-US': 'State' },
  'hotlist.col.addedBy': { 'pt-BR': 'Adicionada por', 'en-US': 'Added by' },
  'hotlist.err.invalidPlate': { 'pt-BR': 'Placa inválida — use o formato Mercosul (ABC1D23) ou o antigo (ABC1234).', 'en-US': 'Invalid plate — use the Mercosul format (ABC1D23) or the old one (ABC1234).' },
  'hotlist.err.addFailed': { 'pt-BR': 'Falha ao adicionar a placa procurada.', 'en-US': 'Failed to add the watched plate.' },
  'hotlist.confirm.removeTitle': { 'pt-BR': 'Remover placa procurada', 'en-US': 'Remove watched plate' },
  'hotlist.confirm.removeDesc': { 'pt-BR': 'A placa "{plate}" deixa de disparar alertas e some da lista. Esta ação é registrada.', 'en-US': 'The plate "{plate}" stops raising alerts and leaves the list. This action is logged.' },
  // DLQ operável (2026-06-12) — seção "Pipeline de detecções" na central de
  // conectores: backlog + fila-morta com reprocessar/descartar.
  'pipeline.title': { 'pt-BR': 'Pipeline de detecções', 'en-US': 'Detections pipeline' },
  'pipeline.subtitle': { 'pt-BR': 'Fluxo das detecções de câmeras e conectores até o grafo. Mensagens que falharam repetidamente ficam retidas na fila-morta, aguardando sua decisão: reprocessar ou descartar.', 'en-US': 'Flow of camera and connector detections into the graph. Messages that failed repeatedly are held in the dead-letter queue awaiting your decision: reprocess or discard.' },
  'pipeline.refresh': { 'pt-BR': 'Atualizar números', 'en-US': 'Refresh numbers' },
  'pipeline.error': { 'pt-BR': 'Falha ao consultar o pipeline de detecções.', 'en-US': 'Failed to query the detections pipeline.' },
  'pipeline.consumers': { 'pt-BR': '{n} consumidor(es)', 'en-US': '{n} consumer(s)' },
  'pipeline.cards.pending': { 'pt-BR': 'Aguardando processamento', 'en-US': 'Awaiting processing' },
  'pipeline.cards.dlq': { 'pt-BR': 'Na fila-morta', 'en-US': 'In dead-letter queue' },
  'pipeline.dlq.empty': { 'pt-BR': 'Fila-morta vazia — nenhuma detecção retida por falha.', 'en-US': 'Dead-letter queue empty — no detection held back by failure.' },
  'pipeline.col.reason': { 'pt-BR': 'Motivo', 'en-US': 'Reason' },
  'pipeline.col.origin': { 'pt-BR': 'Origem', 'en-US': 'Origin' },
  'pipeline.col.event': { 'pt-BR': 'Evento', 'en-US': 'Event' },
  'pipeline.col.when': { 'pt-BR': 'Quando', 'en-US': 'When' },
  'pipeline.reason.poison': { 'pt-BR': 'Falhou repetidamente no processamento', 'en-US': 'Failed processing repeatedly' },
  'pipeline.reason.unknown': { 'pt-BR': 'Motivo não informado', 'en-US': 'Reason not reported' },
  'pipeline.when.now': { 'pt-BR': 'agora', 'en-US': 'now' },
  'pipeline.when.min': { 'pt-BR': 'há {n} min', 'en-US': '{n} min ago' },
  'pipeline.when.h': { 'pt-BR': 'há {n} h', 'en-US': '{n} h ago' },
  'pipeline.when.d': { 'pt-BR': 'há {n} dia(s)', 'en-US': '{n} day(s) ago' },
  'pipeline.retry': { 'pt-BR': 'Reprocessar', 'en-US': 'Reprocess' },
  'pipeline.retry.all': { 'pt-BR': 'Reprocessar tudo', 'en-US': 'Reprocess all' },
  'pipeline.purge': { 'pt-BR': 'Descartar', 'en-US': 'Discard' },
  'pipeline.purge.all': { 'pt-BR': 'Descartar tudo', 'en-US': 'Discard all' },
  'pipeline.confirm.retryTitle': { 'pt-BR': 'Reprocessar mensagens da fila-morta', 'en-US': 'Reprocess dead-letter messages' },
  'pipeline.confirm.retryDesc': { 'pt-BR': 'A mensagem "{event}" volta para a fila principal e será processada de novo. Se já tiver sido absorvida antes, o sistema reconhece e não duplica.', 'en-US': 'Message "{event}" goes back to the main queue and will be processed again. If it was already absorbed before, the system recognizes it and does not duplicate.' },
  'pipeline.confirm.retryAllDesc': { 'pt-BR': 'Todas as {n} mensagens retidas voltam para a fila principal e serão processadas de novo. Duplicatas são reconhecidas e absorvidas.', 'en-US': 'All {n} held messages go back to the main queue and will be processed again. Duplicates are recognized and absorbed.' },
  'pipeline.confirm.purgeTitle': { 'pt-BR': 'Descartar mensagens da fila-morta', 'en-US': 'Discard dead-letter messages' },
  'pipeline.confirm.purgeDesc': { 'pt-BR': 'A mensagem "{event}" será descartada DEFINITIVAMENTE, sem ser processada. O gesto fica registrado na auditoria.', 'en-US': 'Message "{event}" will be PERMANENTLY discarded without being processed. The action is recorded in the audit trail.' },
  'pipeline.confirm.purgeAllDesc': { 'pt-BR': 'Todas as {n} mensagens retidas serão descartadas DEFINITIVAMENTE, sem ser processadas. O gesto fica registrado na auditoria.', 'en-US': 'All {n} held messages will be PERMANENTLY discarded without being processed. The action is recorded in the audit trail.' },
  // 4A — widget "Status de conectores" (Workshop): gestão de conectores dentro de apps.
  'connectorStatus.empty': { 'pt-BR': 'Nenhum conector no conjunto.', 'en-US': 'No connectors in the set.' },
  'connectorStatus.configureSource': { 'pt-BR': 'Escolha o conjunto de conectores no Inspetor.', 'en-US': 'Pick the connector set in the Inspector.' },
  'connectorStatus.lastRun': { 'pt-BR': 'Última execução', 'en-US': 'Last run' },
  'connectorStatus.never': { 'pt-BR': 'Nunca executado', 'en-US': 'Never run' },
  'connectorStatus.failures': { 'pt-BR': 'Falhas', 'en-US': 'Failures' },
  'connectorStatus.lastError': { 'pt-BR': 'Erro recente', 'en-US': 'Recent error' },
  'connectorStatus.openCentral': { 'pt-BR': 'Abrir na central', 'en-US': 'Open in the hub' },
  'connectorStatus.resume': { 'pt-BR': 'Retomar', 'en-US': 'Resume' },
  // (Tarefa E) connectorStatus.skill.http foi SUBSTITUÍDA por
  // skills.connector.http.label via lib/i18n/skill-labels.ts — deletada,
  // nunca deprecada (memória feedback_no_deprecation_of_existing_code).
  // V1 visão→georref→mapa (§5) — Provedores de Computação (BYOM na UI).
  'provedores.title': { 'pt-BR': 'Provedores de Computação', 'en-US': 'Compute Providers' },
  'provedores.subtitle': { 'pt-BR': 'Registre onde a inferência roda — no cliente (edge), em nuvem gerenciada ou em GPU programável — com jurisdição e certificações visíveis. A credencial vai ao cofre e nunca retorna.', 'en-US': 'Register where inference runs — on-premises (edge), managed cloud or programmable GPU — with visible jurisdiction and certifications. Credentials go to the vault and never return.' },
  'provedores.register': { 'pt-BR': 'Cadastrar provedor', 'en-US': 'Register provider' },
  'provedores.register_submit': { 'pt-BR': 'Cadastrar', 'en-US': 'Register' },
  'provedores.empty': { 'pt-BR': 'Nenhum provedor cadastrado. Cadastre um para habilitar contagem por imagem e pipelines de visão.', 'en-US': 'No providers registered. Register one to enable image counting and vision pipelines.' },
  'provedores.test': { 'pt-BR': 'Testar conexão', 'en-US': 'Test connection' },
  'provedores.enable': { 'pt-BR': 'Habilitar', 'en-US': 'Enable' },
  'provedores.disable': { 'pt-BR': 'Desabilitar', 'en-US': 'Disable' },
  'provedores.disabled': { 'pt-BR': 'desabilitado', 'en-US': 'disabled' },
  'provedores.credential': { 'pt-BR': 'Credencial', 'en-US': 'Credential' },
  'provedores.pricing': { 'pt-BR': 'Custo', 'en-US': 'Cost' },
  'codegenDefault.title': { 'pt-BR': 'Modelo padrão de geração de código', 'en-US': 'Default code-generation model' },
  'codegenDefault.subtitle': { 'pt-BR': 'O modelo que o AIP usa para gerar o código dos datasources. A soberania vem do provedor vinculado.', 'en-US': 'The model AIP uses to generate datasource code. Sovereignty comes from the linked provider.' },
  'codegenDefault.model': { 'pt-BR': 'Modelo', 'en-US': 'Model' },
  'codegenDefault.binding': { 'pt-BR': 'Provedor (soberania)', 'en-US': 'Provider (sovereignty)' },
  'codegenDefault.bindingNone': { 'pt-BR': 'Sem vínculo de soberania', 'en-US': 'No sovereignty binding' },
  'codegenDefault.save': { 'pt-BR': 'Salvar padrão', 'en-US': 'Save default' },
  'codegenDefault.saved': { 'pt-BR': 'Modelo padrão salvo', 'en-US': 'Default model saved' },
  'codegenDefault.sourceTenant': { 'pt-BR': 'Definido para esta organização', 'en-US': 'Set for this organization' },
  'codegenDefault.sourceEnv': { 'pt-BR': 'Padrão do ambiente', 'en-US': 'Environment default' },
  'codegenDefault.sourceHardcoded': { 'pt-BR': 'Padrão de fábrica', 'en-US': 'Factory default' },
  'codegenDefault.noJurisdiction': { 'pt-BR': 'Jurisdição não declarada', 'en-US': 'No declared jurisdiction' },
  'provedores.kind.edge': { 'pt-BR': 'No cliente', 'en-US': 'On-premises' },
  'provedores.kind.cloud_inference': { 'pt-BR': 'Nuvem gerenciada', 'en-US': 'Managed cloud' },
  'provedores.kind.cloud_gpu': { 'pt-BR': 'GPU programável', 'en-US': 'Programmable GPU' },
  'provedores.f.vendor': { 'pt-BR': 'Provedor', 'en-US': 'Provider' },
  'provedores.f.vendor_pick': { 'pt-BR': 'Selecione…', 'en-US': 'Select…' },
  'provedores.f.name': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'provedores.f.name_ph': { 'pt-BR': 'ex.: Visão em nuvem (produção)', 'en-US': 'e.g.: Cloud vision (production)' },
  'provedores.f.api_key': { 'pt-BR': 'Chave de API (vai ao cofre)', 'en-US': 'API key (goes to vault)' },
  'provedores.f.api_key_ph': { 'pt-BR': 'cole a chave — nunca será exibida', 'en-US': 'paste the key — it will never be shown' },
  'provedores.f.base_url': { 'pt-BR': 'URL do endpoint', 'en-US': 'Endpoint URL' },
  'provedores.f.jurisdictions': { 'pt-BR': 'Jurisdições de processamento', 'en-US': 'Processing jurisdictions' },
  'provedores.f.jurisdictions_ph': { 'pt-BR': 'ex.: BR, EU — onde o dado pode ser processado', 'en-US': 'e.g.: BR, EU — where data may be processed' },
  // V3 — pista programável (releases/endpoints do provedor GPU).
  'provedores.pista': { 'pt-BR': 'Pista de deploy', 'en-US': 'Deploy lane' },
  'provedores.releases': { 'pt-BR': 'Versões publicadas', 'en-US': 'Published releases' },
  'provedores.endpoints': { 'pt-BR': 'Serviços ativos', 'en-US': 'Live endpoints' },
  'provedores.noReleases': { 'pt-BR': 'Nenhuma versão publicada ainda (o AIP publica pelo chat).', 'en-US': 'No releases yet (the AIP publishes via chat).' },
  'provedores.noEndpoints': { 'pt-BR': 'Nenhum serviço ativo.', 'en-US': 'No live endpoints.' },
  'provedores.pistaHint': { 'pt-BR': 'Pipelines são gerados, publicados e promovidos pelo AIP; aqui você acompanha e limpa o que está no ar.', 'en-US': 'Pipelines are generated, published and promoted by the AIP; here you watch and clean up what is live.' },
  // Onda 2.1 — aquecimento + teste com boot (UI nunca toma timeout).
  'provedores.warmOn': { 'pt-BR': 'Máquina aquecida (sem espera de boot)', 'en-US': 'Machine warm (no boot wait)' },
  'provedores.warmOff': { 'pt-BR': 'Máquina fria (sobe sob demanda)', 'en-US': 'Machine cold (boots on demand)' },
  'provedores.warmStart': { 'pt-BR': 'Manter aquecida', 'en-US': 'Keep warm' },
  'provedores.warmStop': { 'pt-BR': 'Deixar esfriar', 'en-US': 'Let it cool' },
  'provedores.warmCost': { 'pt-BR': 'Aquecer elimina a espera de inicialização (minutos), mas mantém o GPU ligado e gera custo contínuo. Frio: custo só durante o uso.', 'en-US': 'Warming removes the startup wait (minutes) but keeps the GPU on with continuous cost. Cold: cost only while in use.' },
  'provedores.testDetect': { 'pt-BR': 'Testar detecção', 'en-US': 'Test detection' },
  'provedores.testBooting': { 'pt-BR': 'GPU inicializando', 'en-US': 'GPU starting up' },
  'provedores.testRunning': { 'pt-BR': 'Processando', 'en-US': 'Processing' },
  'provedores.testDone': { 'pt-BR': 'OK · detecções', 'en-US': 'OK · detections' },
  'provedores.testError': { 'pt-BR': 'Falhou', 'en-US': 'Failed' },
  'provedores.testBootHint': { 'pt-BR': 'A primeira detecção com a máquina fria leva alguns minutos (a GPU sobe e carrega o modelo). Pode aguardar — não vai expirar.', 'en-US': 'The first detection with a cold machine takes a few minutes (the GPU boots and loads the model). You can wait — it will not time out.' },
  // Onda 2.1 — registrar câmera pela UI (fim do modo demo de /cameras).
  'cameras.registerTitle': { 'pt-BR': 'Registrar câmera', 'en-US': 'Register camera' },
  'cameras.register': { 'pt-BR': 'Registrar', 'en-US': 'Register' },
  'cameras.registerOk': { 'pt-BR': 'Câmera registrada · {n}', 'en-US': 'Camera registered · {n}' },
  'cameras.reusadoMsg': {
    'pt-BR': 'Esta URL já estava registrada (câmera "{n}") — nada foi duplicado. Se esta é outra câmera, mude o nome OU o endereço antes de registrar. Para TROCAR O TIPO DA ANÁLISE dela, escolha o tipo no campo acima e registre de novo.',
    'en-US': 'This URL was already registered (camera "{n}") — nothing was duplicated. If this is a different camera, change the name or the URL before registering. To CHANGE ITS ANALYSIS TYPE, pick the type above and register again.',
  },
  'cameras.tipoReaplicado': {
    'pt-BR': 'Câmera "{n}" já existia — o TIPO DA ANÁLISE foi atualizado para {t} e o serviço da câmera se recompõe em até 30 s.',
    'en-US': 'Camera "{n}" already existed — the ANALYSIS TYPE was updated to {t} and the camera service re-provisions within 30 s.',
  },
  // Onda 4 — presets viraram CATÁLOGO do backend (GET /cctv/presets, filtrado
  // por domínio do tenant) + descobertas do edge + picker de mapa no modal.
  'cameras.presets': { 'pt-BR': 'Catálogo de câmeras (registro em 1 clique)', 'en-US': 'Camera catalog (1-click register)' },
  'cameras.presetPlaceholder': { 'pt-BR': 'Selecione uma câmera do catálogo…', 'en-US': 'Select a camera from the catalog…' },
  'cameras.discoveredTitle': { 'pt-BR': 'Descobertas na rede local', 'en-US': 'Discovered on the local network' },
  'cameras.discoveredError': { 'pt-BR': 'Não foi possível listar as câmeras descobertas na rede local.', 'en-US': 'Could not list the cameras discovered on the local network.' },
  'cameras.discoveredName': { 'pt-BR': 'Câmera', 'en-US': 'Camera' },
  'cameras.discoveredSeen': { 'pt-BR': 'visto em', 'en-US': 'seen' },
  'cameras.sourceOnvif': { 'pt-BR': 'ONVIF', 'en-US': 'ONVIF' },
  'cameras.sourceRtspPort': { 'pt-BR': 'Porta RTSP', 'en-US': 'RTSP port' },
  'cameras.mapTitle': { 'pt-BR': 'Localização no mapa', 'en-US': 'Location on the map' },
  'cameras.mapHint': { 'pt-BR': 'Clique no mapa para definir latitude e longitude. A cidade é preenchida automaticamente quando possível.', 'en-US': 'Click the map to set latitude and longitude. The city is filled in automatically when possible.' },
  'cameras.map2d': { 'pt-BR': 'Mapa 2D', 'en-US': '2D map' },
  'cameras.map3d': { 'pt-BR': 'Globo 3D', 'en-US': '3D globe' },
  'cameras.fieldName': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'cameras.fieldUrl': { 'pt-BR': 'URL do stream', 'en-US': 'Stream URL' },
  'cameras.urlHint': { 'pt-BR': 'HLS (.m3u8) ou RTSP. A detecção por IA roda no provedor de visão configurado.', 'en-US': 'HLS (.m3u8) or RTSP. AI detection runs on the configured vision provider.' },
  'cameras.fieldCity': { 'pt-BR': 'Cidade', 'en-US': 'City' },
  'cameras.fieldLat': { 'pt-BR': 'Latitude', 'en-US': 'Latitude' },
  'cameras.fieldLng': { 'pt-BR': 'Longitude', 'en-US': 'Longitude' },
  'cameras.fieldSource': { 'pt-BR': 'Tipo de fonte', 'en-US': 'Source type' },
  'cameras.fieldTags': { 'pt-BR': 'Etiquetas', 'en-US': 'Tags' },
  'cameras.detectionEnabled': { 'pt-BR': 'Detecção por IA ativa', 'en-US': 'AI detection enabled' },
  // Tarefa D — "Testar stream" no onboarding (probe na GPU antes de salvar).
  'cameras.testStream': { 'pt-BR': 'Testar stream', 'en-US': 'Test stream' },
  'cameras.streamTestSubmitting': { 'pt-BR': 'Enviando teste do stream…', 'en-US': 'Submitting stream test…' },
  'cameras.streamOk': { 'pt-BR': 'Stream OK', 'en-US': 'Stream OK' },
  'cameras.streamTestFailed': { 'pt-BR': 'Falha no teste do stream', 'en-US': 'Stream test failed' },
  // /cameras — fim do fallback fake + "Detectar agora" (job GPU on-demand, Tarefa E 2026-06-11)
  'cameras.backendDown': { 'pt-BR': 'Backend indisponível — não foi possível carregar as câmeras.', 'en-US': 'Backend unavailable — could not load the cameras.' },
  'cameras.emptyTitle': { 'pt-BR': 'Nenhuma câmera registrada', 'en-US': 'No camera registered' },
  'cameras.emptyHint': { 'pt-BR': 'Registre a primeira câmera para iniciar o monitoramento ao vivo e a detecção por IA.', 'en-US': 'Register the first camera to start live monitoring and AI detection.' },
  'cameras.detectNow': { 'pt-BR': 'Detectar agora', 'en-US': 'Detect now' },
  // Volta a /cameras (ADD-alongside do §C C5) — hotlist + pipeline no cockpit.
  'cameras.opsHotlist': { 'pt-BR': 'Placas procuradas', 'en-US': 'Watched plates' },
  'cameras.opsHotlistTitle': { 'pt-BR': 'Gerenciar placas procuradas (hotlist LPR)', 'en-US': 'Manage watched plates (LPR hotlist)' },
  'cameras.opsPipeline': { 'pt-BR': 'Pipeline de detecções', 'en-US': 'Detections pipeline' },
  'cameras.opsPipelineTitle': { 'pt-BR': 'Backlog e fila-morta do pipeline de detecções', 'en-US': 'Detections pipeline backlog and dead-letter queue' },
  'cameras.opsClose': { 'pt-BR': 'Fechar painel', 'en-US': 'Close panel' },
  // GCP picker — "Calibrar posição" (fundação do twin, 2026-06-12)
  'cameras.calibrate': { 'pt-BR': 'Calibrar posição', 'en-US': 'Calibrate position' },
  'cameras.calibrateTitle': { 'pt-BR': 'Calibrar posição da câmera', 'en-US': 'Camera position calibration' },
  'cameras.calibrateIntro': {
    'pt-BR': 'Clique num ponto reconhecível no frame e depois no MESMO ponto no mapa. Marque de 5 a 8 pontos bem espalhados — 4 é o mínimo matemático, mas o erro de reprojeção só é mensurável a partir do 5º ponto.',
    'en-US': 'Click a recognizable point on the frame, then the SAME point on the map. Mark 5 to 8 well-spread points — 4 is the mathematical minimum, but the reprojection error only becomes measurable from the 5th point.',
  },
  'cameras.calibratePlaneNotice': {
    'pt-BR': 'A calibração assume superfície PLANA (via/pátio). Pontos em alturas diferentes (rampas, muros, veículos) degradam a posição — escolha pontos no chão.',
    'en-US': 'Calibration assumes a FLAT surface (road/yard). Points at different heights (ramps, walls, vehicles) degrade positioning — pick points on the ground.',
  },
  'cameras.calibratePushFifth': {
    'pt-BR': 'Adicione um 5º ponto para medir o erro real',
    'en-US': 'Add a 5th point to measure the real error',
  },
  'cameras.calibrateVerdictMinimal': {
    'pt-BR': 'Calibração mínima (4 pontos) — o erro só é mensurável a partir do 5º ponto',
    'en-US': 'Minimal calibration (4 points) — the error only becomes measurable from the 5th point',
  },
  'cameras.calibrateFramePane': { 'pt-BR': 'Frame da câmera (1280×720)', 'en-US': 'Camera frame (1280×720)' },
  'cameras.calibrateMapPane': { 'pt-BR': 'Mapa — o mesmo ponto no mundo', 'en-US': 'Map — the same point in the world' },
  'cameras.calibrateClickFrame': { 'pt-BR': 'Clique um ponto no frame', 'en-US': 'Click a point on the frame' },
  'cameras.calibrateClickMap': { 'pt-BR': 'Agora clique o MESMO ponto no mapa', 'en-US': 'Now click the SAME point on the map' },
  'cameras.calibratePairs': { 'pt-BR': 'Pares', 'en-US': 'Pairs' },
  'cameras.calibrateMaxPairs': { 'pt-BR': 'Máximo de 8 pares atingido', 'en-US': '8-pair maximum reached' },
  'cameras.calibrateSave': { 'pt-BR': 'Salvar calibração', 'en-US': 'Save calibration' },
  'cameras.calibrateNeedPairs': {
    'pt-BR': 'Mínimo de 4 pares pixel↔mapa — faltam {n}',
    'en-US': 'At least 4 pixel↔map pairs required — {n} missing',
  },
  'cameras.calibrateVerdictGood': {
    'pt-BR': 'Calibração boa — erro médio de ±{m} m',
    'en-US': 'Good calibration — mean error ±{m} m',
  },
  'cameras.calibrateVerdictBad': {
    'pt-BR': 'Erro alto (±{m} m) — refaça com pontos mais espalhados no frame e no mapa',
    'en-US': 'High error (±{m} m) — redo with points more spread out on the frame and the map',
  },
  'cameras.calibrateError': { 'pt-BR': 'Falha ao calibrar', 'en-US': 'Calibration failed' },
  'cameras.calibrateCurrent': {
    'pt-BR': 'Calibrada por {user} · erro médio ±{m} m',
    'en-US': 'Calibrated by {user} · mean error ±{m} m',
  },
  'cameras.calibrateRemove': { 'pt-BR': 'Remover calibração', 'en-US': 'Remove calibration' },
  'cameras.calibrateRemoveConfirm': {
    'pt-BR': 'As próximas detecções desta câmera voltam a usar o ponto fixo da câmera no mapa (as já gravadas não mudam).',
    'en-US': 'Future detections from this camera fall back to its fixed point on the map (already recorded ones do not change).',
  },
  'cameras.calibrateNoFrame': {
    'pt-BR': 'Sem frame arquivado desta câmera ainda. Rode "Detectar agora" para capturar um frame e volte aqui.',
    'en-US': 'No archived frame from this camera yet. Run "Detect now" to capture a frame, then come back.',
  },
  'cameras.calibratedBadge': {
    'pt-BR': 'Posição calibrada · ±{m} m',
    'en-US': 'Position calibrated · ±{m} m',
  },
  // Desenho da LINHA/ROI da contagem no /cameras (vertical contagem de sacos).
  // A linha viaja NORMALIZADA 0..1 no PUT /streams/{id}/calibracao e o serviço
  // contagem-sacos aplica por polling — a calibração mora na UI, não no SSH.
  'cameras.linha': { 'pt-BR': 'Calibrar linha', 'en-US': 'Calibrate line' },
  'cameras.linhaTitle': {
    'pt-BR': 'Calibrar linha e área de contagem',
    'en-US': 'Counting line and area calibration',
  },
  'cameras.linhaIntro': {
    'pt-BR': 'Dois cliques definem a linha de cruzamento (A→B); mais cliques definem a área de detecção (opcional). O serviço da linha aplica automaticamente.',
    'en-US': 'Two clicks define the crossing line (A→B); more clicks define the detection area (optional). The line service applies it automatically.',
  },
  'cameras.linhaPane': { 'pt-BR': 'Frame da câmera', 'en-US': 'Camera frame' },
  'cameras.linhaModo': { 'pt-BR': 'Desenho', 'en-US': 'Drawing' },
  'cameras.linhaModeLinha': { 'pt-BR': 'Linha', 'en-US': 'Line' },
  'cameras.linhaModeRoi': { 'pt-BR': 'Área (ROI)', 'en-US': 'Area (ROI)' },
  'cameras.linhaClickA': { 'pt-BR': 'Clique o ponto A da linha', 'en-US': 'Click point A of the line' },
  'cameras.linhaClickB': { 'pt-BR': 'Clique o ponto B da linha', 'en-US': 'Click point B of the line' },
  'cameras.linhaRoiClick': {
    'pt-BR': 'Clique os vértices da área (mín. 3) e feche',
    'en-US': 'Click the area vertices (min. 3) and close it',
  },
  'cameras.linhaRoiFechar': { 'pt-BR': 'Fechar área', 'en-US': 'Close area' },
  'cameras.linhaRoiPontos': { 'pt-BR': 'Vértices', 'en-US': 'Vertices' },
  'cameras.linhaPronto': { 'pt-BR': 'Pronto para salvar', 'en-US': 'Ready to save' },
  'cameras.linhaDirecao': { 'pt-BR': 'Direção válida', 'en-US': 'Valid direction' },
  'cameras.linhaDirecaoAB': { 'pt-BR': 'A → B', 'en-US': 'A → B' },
  'cameras.linhaDirecaoBA': { 'pt-BR': 'B → A', 'en-US': 'B → A' },
  'cameras.linhaConfMin': { 'pt-BR': 'Confiança mínima (opcional)', 'en-US': 'Minimum confidence (optional)' },
  'cameras.linhaConfPh': { 'pt-BR': 'ex.: 0.50', 'en-US': 'e.g.: 0.50' },
  'cameras.linhaSave': { 'pt-BR': 'Salvar linha', 'en-US': 'Save line' },
  'cameras.linhaError': { 'pt-BR': 'Falha ao salvar a linha', 'en-US': 'Failed to save the line' },
  'cameras.linhaNoFrame': {
    'pt-BR': 'Sem quadro desta câmera ainda — ele aparece assim que a câmera/esteira estiver publicando vídeo. O quadro vem da própria fonte (o serviço da linha é quem o produz) — nada de GPU aqui.',
    'en-US': 'No frame from this camera yet — it appears as soon as the camera/conveyor is publishing video. The frame comes from the source itself (the counting service produces it) — no GPU involved.',
  },
  'cameras.linhaReset': { 'pt-BR': 'Limpar', 'en-US': 'Clear' },
  'cameras.linhaCurrent': {
    'pt-BR': 'Linha calibrada v{n} · {quando}',
    'en-US': 'Line calibrated v{n} · {quando}',
  },
  'cameras.linhaRemove': { 'pt-BR': 'Remover linha', 'en-US': 'Remove line' },
  'cameras.linhaRemoveConfirm': {
    'pt-BR': 'A linha volta ao estado "não calibrada" e a contagem usa a calibração padrão até você desenhar outra.',
    'en-US': 'The line returns to "uncalibrated" and counting falls back to the default calibration until you draw another one.',
  },
  // Registro de câmera — tipo de análise + fonte (AEGIS Bridge GUI/.exe).
  'cameras.tipoTitle': { 'pt-BR': 'Tipo de análise', 'en-US': 'Analysis type' },
  'cameras.tipoFree': { 'pt-BR': 'Personalizado', 'en-US': 'Custom' },
  'cameras.tipoLpr': { 'pt-BR': 'Placas (LPR)', 'en-US': 'Plates (LPR)' },
  'cameras.tipoOcr': { 'pt-BR': 'Documento (OCR)', 'en-US': 'Document (OCR)' },
  'cameras.tipoCon': { 'pt-BR': 'Contagem de sacos (CON)', 'en-US': 'Bag counting (CON)' },
  'cameras.tipoOcrHint': {
    'pt-BR': 'Leitura de documento — sem hotlist de placas (a toolbar se equilibra pela tag).',
    'en-US': 'Document reading — no plate hotlist (the toolbar balances by tag).',
  },
  'cameras.tipoConHint': {
    'pt-BR': 'Depois de registrar, use "Calibrar linha" no /cameras para desenhar a linha de cruzamento — o serviço aplica sem reiniciar.',
    'en-US': 'After registering, use "Calibrate line" on /cameras to draw the crossing line — the service applies it without a restart.',
  },
  'cameras.tipoConDemo': {
    'pt-BR': 'Contagem de objetos (CON · demo)',
    'en-US': 'Object counting (CON · demo)',
  },
  'cameras.tipoConDemoHint': {
    'pt-BR': 'DEMONSTRATIVO: habilita a bancada de contagem (linha, prova de contagem) para testes com objetos aleatórios. A contagem real só produz números quando a fonte é o serviço Contagem de Sacos.',
    'en-US': 'DEMO ONLY: enables the counting bench (line, proof) for tests with arbitrary objects. Real counts only flow when the source is the Bag Counting service.',
  },
  'cameras.fonteTitle': { 'pt-BR': 'Fonte do vídeo', 'en-US': 'Video source' },
  'cameras.fonteIp': { 'pt-BR': 'Câmera IP / catálogo', 'en-US': 'IP camera / catalog' },
  'cameras.fonteBridge': { 'pt-BR': 'AEGIS Bridge (GUI/.exe)', 'en-US': 'AEGIS Bridge (GUI/.exe)' },
  'cameras.bridgeHost': { 'pt-BR': 'IP do nó no tailnet', 'en-US': 'Node IP on the tailnet' },
  'cameras.bridgeName': { 'pt-BR': 'Nome da câmera na ponte', 'en-US': 'Camera name on the bridge' },
  'cameras.bridgeHint': {
    'pt-BR': 'A Bridge publica a câmera em rtsp://<ip>:8554/<nome> — a URL é montada automaticamente; confirme o nome exato dado na Bridge.',
    'en-US': 'The bridge publishes the camera at rtsp://<ip>:8554/<name> — the URL is assembled for you; confirm the exact name used on the bridge.',
  },
  'cameras.bridgeTitle': { 'pt-BR': 'Câmera via AEGIS Bridge', 'en-US': 'Camera via AEGIS Bridge' },
  'cameras.bridgeTest': { 'pt-BR': 'Testar na ponte', 'en-US': 'Test on the bridge' },
  'cameras.bridgeTestTitle': {
    'pt-BR': 'A ilha prova a câmera no go2rtc da ponte — sem GPU, sem abrir o vídeo no host',
    'en-US': 'The island probes the camera on the bridge go2rtc — no GPU, no video on the host',
  },
  'cameras.bridgeTestOk': { 'pt-BR': 'Câmera na ponte OK', 'en-US': 'Camera on the bridge OK' },
  'cameras.bridgeTestFail': { 'pt-BR': 'Ponte não respondeu', 'en-US': 'Bridge did not respond' },
  // Trilha de passos do desenho da linha (UX: cada passo com estado visível).
  'cameras.linhaPasso1': { 'pt-BR': '1 · Linha (2 cliques)', 'en-US': '1 · Line (2 clicks)' },
  'cameras.linhaPasso2': { 'pt-BR': '2 · Área (opcional)', 'en-US': '2 · Area (optional)' },
  'cameras.linhaPasso3': { 'pt-BR': '3 · Direção e salvar', 'en-US': '3 · Direction and save' },
  'cameras.linhaUndo': { 'pt-BR': 'Desfazer', 'en-US': 'Undo' },
  'cameras.linhaUndoTitle': {
    'pt-BR': 'Remove o último clique (vértice da área, ou o ponto B da linha)',
    'en-US': 'Removes the last click (area vertex, or line point B)',
  },
  'cameras.linhaSalva': {
    'pt-BR': 'Linha salva (v{n}) — o serviço da linha aplica em segundos.',
    'en-US': 'Line saved (v{n}) — the line service applies it in seconds.',
  },
  'cameras.linhaDuploClique': {
    'pt-BR': 'duplo clique fecha a área',
    'en-US': 'double-click closes the area',
  },
  // Treinamento da contagem (página /treino-contagem — D2 RunPod + D3 avaliação).
  // Treinamento da contagem — linguagem de OPERAÇÃO: receitas prontas com a
  // meta à vista, credencial no cofre (uma vez), comparação por janela. Sem
  // jargão interno e sem nomes de fornecedor na copy.
  'cameras.treino': { 'pt-BR': 'Treinamentos', 'en-US': 'Training' },
  'treino.title': { 'pt-BR': 'Treinamentos', 'en-US': 'Training' },
  'treino.subtitle': {
    'pt-BR': 'Marketplace de treinamentos da plataforma: receitas prontas, GPU e máquinas efêmeras — o run nasce amarrado à câmera da operação.',
    'en-US': 'Platform training marketplace: ready-made recipes, GPU machines — each run is bound to an operation camera.',
  },
  'treino.filtros': { 'pt-BR': 'Filtrar', 'en-US': 'Filter' },
  'treino.runTitulo': { 'pt-BR': 'Configurar o run', 'en-US': 'Configure run' },
  'treino.runEscolha': {
    'pt-BR': 'Escolha um treinamento na grade para configurar o run.',
    'en-US': 'Pick a training to configure the run.',
  },
  'treino.modeloTitulo': { 'pt-BR': 'Modelo no ar', 'en-US': 'Live model' },
  'treino.modeloOnline': { 'pt-BR': 'serviço contando', 'en-US': 'service counting' },
  'treino.modeloOffline': { 'pt-BR': 'linha fora do ar', 'en-US': 'line offline' },
  'treino.gpuTitulo': { 'pt-BR': 'GPU em nuvem', 'en-US': 'Cloud GPU' },
  'treino.gpuPronta': { 'pt-BR': 'pronta', 'en-US': 'ready' },
  'treino.gpuAusente': {
    'pt-BR': 'não configurada nesta implantação',
    'en-US': 'not configured in this deployment',
  },
  'treino.credencialTitulo': { 'pt-BR': 'Credencial de anotação', 'en-US': 'Annotation credential' },
  'treino.credencialOk': {
    'pt-BR': 'no cofre — vale para todos os treinos',
    'en-US': 'in the vault — every training uses it',
  },
  'treino.credencialFalta': {
    'pt-BR': 'Configure uma vez — vai direto para o cofre do AEGIS e nunca mais será pedida.',
    'en-US': 'Set it once — it goes straight to the AEGIS vault and will never be asked again.',
  },
  'treino.credencialPh': {
    'pt-BR': 'cole a chave — não é mostrada nem guardada fora do cofre',
    'en-US': 'paste the key — never shown, never stored outside the vault',
  },
  'treino.credencialSalvar': { 'pt-BR': 'Guardar no cofre', 'en-US': 'Save to vault' },
  'treino.credencialSalva': { 'pt-BR': 'Guardada no cofre', 'en-US': 'Saved to the vault' },
  'treino.presetsTitulo': { 'pt-BR': 'Escolha o treino', 'en-US': 'Choose the training' },
  'treino.camerasTitulo': { 'pt-BR': 'Câmeras da operação — o material do treino', 'en-US': 'Operation cameras — the training material' },
  'treino.quadrosArquivados': { 'pt-BR': 'quadros arquivados', 'en-US': 'archived frames' },
  'treino.camerasHint': {
    'pt-BR': 'Os quadros se acumulam sozinhos conforme a linha conta. Treino sério = ESTE material anotado (a receita "Máxima precisão"); a biblioteca pública é a base inicial.',
    'en-US': 'Frames accumulate on their own as the line counts. Serious training = THIS material annotated (the "Maximum precision" recipe); the public library is the starting base.',
  },
  'treino.custoHora': { 'pt-BR': 'custo', 'en-US': 'cost' },
  'treino.custoAcum': { 'pt-BR': 'acumulado', 'en-US': 'accumulated' },
  'treino.uptime': { 'pt-BR': 'ligada há', 'en-US': 'running for' },
  'treino.progressoAtrasado': {
    'pt-BR': 'sem report recente',
    'en-US': 'no recent report',
  },
  'treino.paraCamera': { 'pt-BR': 'Treinar para a câmera', 'en-US': 'Train for camera' },
  'treino.cameraLivre': { 'pt-BR': '— sem câmera específica —', 'en-US': '— no specific camera —' },
  'treino.datasetRotulo': { 'pt-BR': 'Dataset', 'en-US': 'Dataset' },
  'treino.datasetPublicoHint': {
    'pt-BR': 'biblioteca pública (base de partida)',
    'en-US': 'public library (starting base)',
  },
  'treino.datasetHint': {
    'pt-BR': 'Sem projeto da casa declarado, o treino usa a biblioteca pública como base. Com o seu projeto anotado (workspace/projeto/versão), o mesmo pod treina no SEU material in-domain.',
    'en-US': 'With no declared project, training uses the public library as base. With your annotated project (workspace/project/version), the same pod trains on YOUR in-domain material.',
  },
  'treino.metaTitulo': { 'pt-BR': 'Meta', 'en-US': 'Target' },
  'treino.estimativa': { 'pt-BR': 'Tempo', 'en-US': 'Time' },
  'treino.recomendado': { 'pt-BR': 'Recomendado', 'en-US': 'Recommended' },
  'treino.selecionado': { 'pt-BR': 'Selecionado', 'en-US': 'Selected' },
  'treino.iniciar': { 'pt-BR': 'Iniciar treino', 'en-US': 'Start training' },
  'treino.iniciarBloqueado': {
    'pt-BR': 'Configure a credencial de anotação para liberar o treino.',
    'en-US': 'Set the annotation credential to unlock training.',
  },
  'treino.iniciado': { 'pt-BR': 'Treino iniciado', 'en-US': 'Training started' },
  'treino.maquinasTitulo': { 'pt-BR': 'Máquinas de treino', 'en-US': 'Training machines' },
  'treino.maquinasVazio': { 'pt-BR': 'Nenhuma máquina de treino no ar.', 'en-US': 'No training machine running.' },
  'treino.refresh': { 'pt-BR': 'Atualizar', 'en-US': 'Refresh' },
  'treino.encerrar': { 'pt-BR': 'Encerrar', 'en-US': 'Terminate' },
  'treino.janelaTitulo': { 'pt-BR': 'Provar a contagem (janela)', 'en-US': 'Prove the count (window)' },
  'treino.janelaHint': {
    'pt-BR': 'Assistiu o vídeo e contou os sacos de verdade? Informe a janela e o número — o sistema compara com o que o modelo contou no mesmo período.',
    'en-US': 'Watched the video and counted the real bags? Enter the window and the number — the system compares with what the model counted in the same period.',
  },
  'treino.inicio': { 'pt-BR': 'Início (opcional)', 'en-US': 'Start (optional)' },
  'treino.fim': { 'pt-BR': 'Fim (opcional)', 'en-US': 'End (optional)' },
  'treino.manual': { 'pt-BR': 'Sacos contados por você', 'en-US': 'Bags you counted' },
  'treino.avaliar': { 'pt-BR': 'Comparar', 'en-US': 'Compare' },
  'treino.contados': { 'pt-BR': 'contados', 'en-US': 'counted' },
  'treino.acuracia': { 'pt-BR': 'Acurácia', 'en-US': 'Accuracy' },
  'treino.erro': { 'pt-BR': 'Diferença', 'en-US': 'Difference' },
  'treino.aceite': {
    'pt-BR': 'Meta atingida nesta janela (≥ 99,4%)',
    'en-US': 'Target met for this window (≥ 99.4%)',
  },
  'treino.reprovado': {
    'pt-BR': 'Abaixo de 99,4% — anote mais dado e treine novamente antes de aprovar',
    'en-US': 'Below 99.4% — annotate more data and train again before approving',
  },
  'treino.dadosAviso': {
    'pt-BR': 'Sem dados anotados, nenhum treino chega ao alvo de qualidade. Os quadros se acumulam no acervo conforme a operação roda — anote-os e rode a receita "Máxima precisão" para treinar no seu material.',
    'en-US': 'Without annotated data, no training reaches the quality target. Frames accumulate in the archive as the operation runs — annotate them and run the "Maximum precision" recipe to train on your material.',
  },
  'treino.teardownHint': {
    'pt-BR': 'A GPU custa por hora — encerre a máquina quando o treino acabar (o modelo já estará salvo no acervo).',
    'en-US': 'Cloud GPUs bill by the hour — terminate the machine once training ends (the model is already archived).',
  },
  // ── Warm-up Validated Training (WVT) ──
  'wvt.titulo': { 'pt-BR': 'Prontidão para treinar (Aquecimento)', 'en-US': 'Training readiness (Warm-up)' },
  'wvt.subtitulo': {
    'pt-BR': 'Antes de horas de GPU, o mesmo pipeline roda em escala reduzida e prova que funciona — com evidências.',
    'en-US': 'Before hours of GPU, the same pipeline runs at reduced scale and proves it works — with evidence.',
  },
  'wvt.fonte': { 'pt-BR': 'Fonte de dados', 'en-US': 'Data source' },
  'wvt.dataset': { 'pt-BR': 'Dataset', 'en-US': 'Dataset' },
  'wvt.pipeline': { 'pt-BR': 'Pipeline', 'en-US': 'Pipeline' },
  'wvt.modelo': { 'pt-BR': 'Modelo', 'en-US': 'Model' },
  'wvt.artefatos': { 'pt-BR': 'Artefatos', 'en-US': 'Artifacts' },
  'wvt.warmup': { 'pt-BR': 'Aquecimento', 'en-US': 'Warm-up' },
  'wvt.deep': { 'pt-BR': 'Treinamento profundo', 'en-US': 'Deep training' },
  'wvt.online': { 'pt-BR': 'ONLINE — recebendo dados', 'en-US': 'ONLINE — receiving data' },
  'wvt.offline': { 'pt-BR': 'INDISPONÍVEL', 'en-US': 'UNAVAILABLE' },
  'wvt.semCaptura': { 'pt-BR': 'serviço sem captura (atualize)', 'en-US': 'service without capture (update it)' },
  'wvt.validado': { 'pt-BR': 'VALIDADO', 'en-US': 'VALIDATED' },
  'wvt.naoExecutado': { 'pt-BR': 'NÃO EXECUTADO', 'en-US': 'NOT RUN' },
  'wvt.preservados': { 'pt-BR': 'PRESERVADOS', 'en-US': 'PRESERVED' },
  'wvt.estadoNONE': { 'pt-BR': 'NENHUM', 'en-US': 'NONE' },
  'wvt.estadoRUNNING': { 'pt-BR': 'EM EXECUÇÃO', 'en-US': 'RUNNING' },
  'wvt.estadoVALID': { 'pt-BR': 'VÁLIDO', 'en-US': 'VALID' },
  'wvt.estadoEXPIRED': { 'pt-BR': 'EXPIRADO', 'en-US': 'EXPIRED' },
  'wvt.estadoINVALIDATED': { 'pt-BR': 'INVALIDADO', 'en-US': 'INVALIDATED' },
  'wvt.estadoFAILED': { 'pt-BR': 'FALHOU', 'en-US': 'FAILED' },
  'wvt.estadoUNKNOWN': { 'pt-BR': 'NÃO VERIFICADO', 'en-US': 'UNVERIFIED' },
  'wvt.configId': { 'pt-BR': 'Configuration ID', 'en-US': 'Configuration ID' },
  'wvt.validadoEm': { 'pt-BR': 'Validado em', 'en-US': 'Validated at' },
  'wvt.expiraEm': { 'pt-BR': 'Expira em', 'en-US': 'Expires at' },
  'wvt.rodar': { 'pt-BR': 'Rodar aquecimento', 'en-US': 'Run warm-up' },
  'wvt.rodarDeNovo': { 'pt-BR': 'Rodar aquecimento novamente', 'en-US': 'Run warm-up again' },
  'wvt.aquecendo': { 'pt-BR': 'Aquecendo (pipeline real, escala reduzida)…', 'en-US': 'Warming up (real pipeline, reduced scale)…' },
  'wvt.verDetalhes': { 'pt-BR': 'Ver relatório', 'en-US': 'View report' },
  'wvt.cancelar': { 'pt-BR': 'Cancelar aquecimento', 'en-US': 'Cancel warm-up' },
  'wvt.descartar': { 'pt-BR': 'Descartar', 'en-US': 'Discard' },
  'wvt.deepBloqueado': { 'pt-BR': 'DEEP TRAINING BLOQUEADO — rode o aquecimento acima', 'en-US': 'DEEP TRAINING LOCKED — run the warm-up above' },
  'wvt.deepLiberado': { 'pt-BR': 'DEEP TRAINING LIBERADO', 'en-US': 'DEEP TRAINING READY' },
  'wvt.aguardandoProvider': { 'pt-BR': 'Configure o provedor de GPU e a credencial para aquecer', 'en-US': 'Set up the GPU provider and credential to warm up' },
  'wvt.estagios': { 'pt-BR': 'Etapas executadas', 'en-US': 'Executed stages' },
  'wvt.falhas': { 'pt-BR': 'Problemas críticos', 'en-US': 'Critical issues' },
  'wvt.avisos': { 'pt-BR': 'Avisos', 'en-US': 'Warnings' },
  'wvt.evidencias': { 'pt-BR': 'Evidências visuais', 'en-US': 'Visual evidence' },
  'wvt.notas': { 'pt-BR': 'Notas do operador', 'en-US': 'Operator notes' },
  'wvt.salvarNotas': { 'pt-BR': 'Salvar notas', 'en-US': 'Save notes' },
  'wvt.relatorio': { 'pt-BR': 'Relatório do aquecimento', 'en-US': 'Warm-up report' },
  'wvt.manifest': { 'pt-BR': 'Integridade do dataset', 'en-US': 'Dataset integrity' },
  'wvt.metricas': { 'pt-BR': 'Métricas do mini-treino', 'en-US': 'Mini-training metrics' },
  'wvt.sistema': { 'pt-BR': 'Hardware e ambiente', 'en-US': 'Hardware & environment' },
  'wvt.divergencias': { 'pt-BR': 'Campos que invalidaram o aquecimento', 'en-US': 'Fields that invalidated the warm-up' },
  'wvt.fonteStats': { 'pt-BR': 'Janela de captura da fonte', 'en-US': 'Source capture window' },
  'wvt.data': { 'pt-BR': 'Data', 'en-US': 'Date' },
  'wvt.notaTitulo': {
    'pt-BR': 'Nota de confiança',
    'en-US': 'Confidence score',
  },
  'wvt.benchmark': {
    'pt-BR': 'Comparação com o mercado',
    'en-US': 'Market benchmark',
  },
  'wvt.benchmarkMercado': {
    'pt-BR': 'padrões recentes 2025/26',
    'en-US': 'recent 2025/26 standards',
  },
  'cameras.detectSubmitting': { 'pt-BR': 'Enviando job de detecção…', 'en-US': 'Submitting detection job…' },
  'cameras.detectDoneObjects': { 'pt-BR': 'objetos detectados', 'en-US': 'objects detected' },
  'cameras.detectDonePushed': { 'pt-BR': 'detecções enviadas ao painel — aparecem na lista em instantes', 'en-US': 'detections pushed to the panel — they appear in the list shortly' },
  'cameras.detectDoneInline': { 'pt-BR': 'resultado retornado no próprio job (push não configurado)', 'en-US': 'result returned in the job itself (push not configured)' },
  'cameras.detectError': { 'pt-BR': 'Falha na detecção', 'en-US': 'Detection failed' },
  // Tarefa W — poll resiliente: fila sem capacidade no provedor + job expirado/erro do provedor.
  'cameras.gpuSemCapacidade': { 'pt-BR': 'Provedor de GPU sem capacidade no momento — o job está na fila e será executado quando liberar.', 'en-US': 'GPU provider out of capacity right now — the job is queued and will run as soon as capacity frees up.' },
  'cameras.detectExpired': { 'pt-BR': 'O job expirou no provedor antes de ser concluído — envie de novo.', 'en-US': 'The job expired at the provider before completing — submit again.' },
  'cameras.detectProviderError': { 'pt-BR': 'O provedor de GPU falhou ao informar o status do job.', 'en-US': 'The GPU provider failed to report the job status.' },
  // §C C2-C4 (/cameras) — filtros/busca escaláveis das 3 listas
  // (Streams · Observações vinculadas · Detecções IA).
  'cameras.filter.searchStreams': { 'pt-BR': 'Buscar por nome, cidade, tag…', 'en-US': 'Search by name, city, tag…' },
  'cameras.filter.searchDetections': { 'pt-BR': 'Buscar por rótulo ou entidade…', 'en-US': 'Search by label or entity…' },
  'cameras.filter.status': { 'pt-BR': 'Situação do stream', 'en-US': 'Stream status' },
  'cameras.filter.statusAll': { 'pt-BR': 'Situação: todas', 'en-US': 'Status: all' },
  'cameras.filter.statusOnline': { 'pt-BR': 'Online', 'en-US': 'Online' },
  'cameras.filter.statusOffline': { 'pt-BR': 'Offline', 'en-US': 'Offline' },
  'cameras.filter.city': { 'pt-BR': 'Cidade', 'en-US': 'City' },
  'cameras.filter.cityAll': { 'pt-BR': 'Cidade: todas', 'en-US': 'City: all' },
  'cameras.filter.detection': { 'pt-BR': 'Detecção por IA', 'en-US': 'AI detection' },
  'cameras.filter.detectionAll': { 'pt-BR': 'IA: todas', 'en-US': 'AI: all' },
  'cameras.filter.detectionOn': { 'pt-BR': 'IA ligada', 'en-US': 'AI on' },
  'cameras.filter.detectionOff': { 'pt-BR': 'IA desligada', 'en-US': 'AI off' },
  'cameras.filter.kind': { 'pt-BR': 'Tipo de detecção', 'en-US': 'Detection kind' },
  'cameras.filter.kindAll': { 'pt-BR': 'Tipo: todos', 'en-US': 'Kind: all' },
  'cameras.filter.kindLpr': { 'pt-BR': 'Placas (LPR)', 'en-US': 'Plates (LPR)' },
  'cameras.filter.kindFace': { 'pt-BR': 'Faces', 'en-US': 'Faces' },
  'cameras.filter.kindObject': { 'pt-BR': 'Objetos', 'en-US': 'Objects' },
  'cameras.filter.clear': { 'pt-BR': 'Limpar filtros', 'en-US': 'Clear filters' },
  'cameras.filter.capHint': { 'pt-BR': 'de 1000+', 'en-US': 'of 1000+' },
  'cameras.filter.noStreams': { 'pt-BR': 'Nenhum stream corresponde aos filtros.', 'en-US': 'No stream matches the filters.' },
  'cameras.filter.noDetections': { 'pt-BR': 'Nenhuma detecção corresponde aos filtros.', 'en-US': 'No detection matches the filters.' },
  'cameras.filter.noDetectionsYet': { 'pt-BR': 'Sem detecções ainda.', 'en-US': 'No detections yet.' },
  // Player HLS (componentes/cameras/hls-player.tsx) — estados de loading/erro.
  // `{url}` é interpolado pelo consumidor com `.replace('{url}', …)` — mesmo
  // padrão de `cameras.calibratedBadge`.
  'cameras.hls.connecting': { 'pt-BR': 'Conectando stream HLS…', 'en-US': 'Connecting HLS stream…' },
  'cameras.hls.nativeError': { 'pt-BR': 'falha de stream nativa ({url})', 'en-US': 'native stream failure ({url})' },
  'cameras.hls.noMseSupport': { 'pt-BR': 'navegador não suporta MSE/hls.js', 'en-US': 'browser does not support MSE/hls.js' },
  'cameras.hls.snapshotError': { 'pt-BR': 'falha ao carregar imagem da câmera', 'en-US': 'failed to load camera image' },
  // Análise multidomínio hospedada (modelos pré-treinados Roboflow, GPU-free).
  // AIP chat — grounding (fontes RAG citadas no turno do assistente).
  'aipChat.citations': { 'pt-BR': 'Fontes', 'en-US': 'Sources' },
  'aipChat.suggestions': { 'pt-BR': 'Caminhos sugeridos', 'en-US': 'Suggested next steps' },
  'aipChat.map': { 'pt-BR': 'Mapa', 'en-US': 'Map' },
  'aipChat.tone.label': { 'pt-BR': 'Tom de voz', 'en-US': 'Tone of voice' },
  'aipChat.tone.hint': {
    'pt-BR': 'Como o assistente fala com você nas respostas.',
    'en-US': 'How the assistant speaks to you in its answers.',
  },
  'aipChat.tone.default': { 'pt-BR': 'Padrão', 'en-US': 'Default' },
  'aipChat.devmode.label': {
    'pt-BR': 'Modo desenvolvedor do chat',
    'en-US': 'Chat developer mode',
  },
  'aipChat.devmode.hint': {
    'pt-BR': 'Mostra detalhes técnicos nas mensagens: modelo, tokens, tempo e os parâmetros de cada ferramenta.',
    'en-US': 'Shows technical details in messages: model, tokens, latency and each tool’s parameters.',
  },
  'aipChat.devmode.on': { 'pt-BR': 'Avançado', 'en-US': 'Advanced' },
  'aipChat.devmode.off': { 'pt-BR': 'Padrão', 'en-US': 'Default' },
  'aipChat.keys.action': { 'pt-BR': 'Configurar chaves', 'en-US': 'Configure keys' },
  'aipChat.keys.title': { 'pt-BR': 'Chaves dos agentes de pesquisa', 'en-US': 'Research agent keys' },
  'aipChat.keys.hint': {
    'pt-BR': 'Credenciais e cookies das fontes que o AIP Chat consulta (X, Instagram, YouTube e afins). Ficam no Vault da sua organização — guardamos só a referência, nunca o valor em claro.',
    'en-US': 'Credentials and cookies for the sources the AIP Chat queries (X, Instagram, YouTube and similar). They live in your organization’s Vault — we store only the reference, never the cleartext value.',
  },
  'aipChat.keys.empty': {
    'pt-BR': 'Nenhuma fonte exige chave no momento.',
    'en-US': 'No source currently requires a key.',
  },
  'aipChat.keys.set': { 'pt-BR': 'Cadastrada', 'en-US': 'Set' },
  'aipChat.keys.replace': { 'pt-BR': 'Substituir (deixe em branco para manter)', 'en-US': 'Replace (leave blank to keep)' },
  'aipChat.keys.nothing': { 'pt-BR': 'Preencha ao menos um campo para salvar.', 'en-US': 'Fill in at least one field to save.' },
  'aipChat.keys.denied': {
    'pt-BR': 'Você não tem permissão para gerenciar credenciais. Peça a um supervisor ou responsável de governança.',
    'en-US': 'You don’t have permission to manage credentials. Ask a supervisor or governance officer.',
  },
  'aipChat.keys.saved': { 'pt-BR': 'Chaves salvas no Vault', 'en-US': 'Keys saved to the Vault' },
  'aipChat.keys.save': { 'pt-BR': 'Salvar chaves', 'en-US': 'Save keys' },
  // AIP chat — W4: artifact lateral alternável (Consulta RAG | Áudio) + suíte
  // forense de áudio dentro do chat + gravação ao vivo (voz → texto) no campo.
  // FIX ELO RAG (#3, 2026-06-28): rótulo da aba renomeado de "Consulta RAG" para
  // o nome amigável "Conhecimento" (a busca interna sobre o conhecimento da
  // operação). A key segue `tabRag` (a aba/painel continua sendo o RAG).
  'aipChat.artifact.tabRag': { 'pt-BR': 'Conhecimento', 'en-US': 'Knowledge' },
  'aipChat.artifact.tabAudio': { 'pt-BR': 'Áudio', 'en-US': 'Audio' },
  'aipChat.artifact.close': { 'pt-BR': 'Fechar painel', 'en-US': 'Close panel' },
  // FIX ELO RAG/ÁUDIO (#3, 2026-06-28): rótulos do rail colapsado do artifact
  // (botões "abrir" Conhecimento/Áudio), antes hardcoded em pt-BR.
  'aipChat.artifact.openRag': { 'pt-BR': 'Abrir Conhecimento', 'en-US': 'Open Knowledge' },
  'aipChat.artifact.openAudio': { 'pt-BR': 'Abrir Áudio', 'en-US': 'Open Audio' },
  'aipChat.cap.audio.label': { 'pt-BR': 'Áudio', 'en-US': 'Audio' },
  'aipChat.cap.audio.hint': {
    'pt-BR': 'Análise forense de áudio: transcrição, diarização e perguntas sobre a gravação.',
    'en-US': 'Forensic audio analysis: transcription, diarization and questions about the recording.',
  },
  // LOTE3 — composer redesenhado: rótulos/hints das 7 capabilities + menu "+",
  // controle "Ferramentas" e grupos do popover.
  'aipChat.cap.web_search.label': { 'pt-BR': 'Buscar na web', 'en-US': 'Web search' },
  'aipChat.cap.web_search.hint': {
    'pt-BR': 'Pesquisa em fontes públicas (notícias, redes, OSINT).',
    'en-US': 'Search public sources (news, social, OSINT).',
  },
  'aipChat.cap.rag_search.label': { 'pt-BR': 'Buscar interno', 'en-US': 'Internal search' },
  'aipChat.cap.rag_search.hint': {
    'pt-BR': 'Pesquisa nos dados internos da operação.',
    'en-US': 'Search the operation’s internal data.',
  },
  'aipChat.cap.code_interpreter.label': { 'pt-BR': 'Executor de código', 'en-US': 'Code interpreter' },
  'aipChat.cap.code_interpreter.hint': {
    'pt-BR': 'Executa código em ambiente isolado.',
    'en-US': 'Runs code in a sandboxed environment.',
  },
  'aipChat.cap.artifacts.label': { 'pt-BR': 'Artefatos', 'en-US': 'Artifacts' },
  'aipChat.cap.artifacts.hint': {
    'pt-BR': 'Renderiza diagramas e blocos de código inline.',
    'en-US': 'Renders diagrams and code blocks inline.',
  },
  'aipChat.cap.memory.label': { 'pt-BR': 'Memória', 'en-US': 'Memory' },
  'aipChat.cap.memory.hint': {
    'pt-BR': 'Memória persistente entre conversas.',
    'en-US': 'Persistent memory across conversations.',
  },
  'aipChat.cap.mcp.label': { 'pt-BR': 'Conectores', 'en-US': 'Connectors' },
  'aipChat.cap.mcp.hint': {
    'pt-BR': 'Permite ao agente chamar qualquer adaptador MCP registrado.',
    'en-US': 'Lets the agent call any registered MCP adapter.',
  },
  'aipChat.composer.placeholder': { 'pt-BR': 'Pergunte ao AIP...', 'en-US': 'Ask AIP...' },
  'aipChat.composer.sendAria': { 'pt-BR': 'Enviar mensagem', 'en-US': 'Send message' },
  'aipChat.composer.add': { 'pt-BR': 'Adicionar', 'en-US': 'Add' },
  'aipChat.composer.templates': { 'pt-BR': 'Modelos de prompt', 'en-US': 'Prompt templates' },
  'aipChat.composer.attachAudio': { 'pt-BR': 'Anexar áudio', 'en-US': 'Attach audio' },
  'aipChat.composer.tools': { 'pt-BR': 'Ferramentas', 'en-US': 'Tools' },
  'aipChat.composer.toolsActive': { 'pt-BR': 'ativas', 'en-US': 'active' },
  'aipChat.composer.toolsHint': {
    'pt-BR': 'Escolha o que o AIP pode usar nesta conversa.',
    'en-US': 'Choose what the AIP may use in this conversation.',
  },
  'aipChat.composer.disable': { 'pt-BR': 'Desativar', 'en-US': 'Disable' },
  'aipChat.composer.clickToDisable': {
    'pt-BR': 'clique para desativar',
    'en-US': 'click to disable',
  },
  'aipChat.composer.hint': {
    'pt-BR': 'Enter envia · Shift+Enter quebra linha',
    'en-US': 'Enter sends · Shift+Enter for a new line',
  },
  'aipChat.composer.auditNote': {
    'pt-BR': 'Toda chamada do AIP fica auditada.',
    'en-US': 'Every AIP call is audited.',
  },
  'aipChat.tools.group.search': { 'pt-BR': 'Busca', 'en-US': 'Search' },
  'aipChat.tools.group.exec': { 'pt-BR': 'Execução', 'en-US': 'Execution' },
  'aipChat.tools.group.surfaces': { 'pt-BR': 'Superfícies', 'en-US': 'Surfaces' },
  'aipChat.tools.group.connectors': { 'pt-BR': 'Conectores', 'en-US': 'Connectors' },
  'aipChat.audio.uploadTitle': { 'pt-BR': 'Enviar áudio', 'en-US': 'Upload audio' },
  'aipChat.audio.uploadLabel': { 'pt-BR': 'Arquivo de áudio', 'en-US': 'Audio file' },
  'aipChat.audio.labelLabel': { 'pt-BR': 'Rótulo (auditoria)', 'en-US': 'Label (audit)' },
  'aipChat.audio.labelPlaceholder': {
    'pt-BR': 'Ex.: Rádio CCO — turno 22h',
    'en-US': 'e.g. Radio CCO — 10pm shift',
  },
  'aipChat.audio.upload': { 'pt-BR': 'Enviar', 'en-US': 'Upload' },
  'aipChat.audio.uploading': { 'pt-BR': 'Enviando…', 'en-US': 'Uploading…' },
  'aipChat.audio.pickFile': {
    'pt-BR': 'Selecione um arquivo de áudio.',
    'en-US': 'Select an audio file.',
  },
  'aipChat.audio.playerTitle': { 'pt-BR': 'Player + transcrição', 'en-US': 'Player + transcript' },
  'aipChat.audio.transcribe': { 'pt-BR': 'Transcrever', 'en-US': 'Transcribe' },
  'aipChat.audio.transcribing': { 'pt-BR': 'Transcrevendo…', 'en-US': 'Transcribing…' },
  'aipChat.audio.segments': { 'pt-BR': 'Segmentos', 'en-US': 'Segments' },
  'aipChat.audio.speakers': { 'pt-BR': 'Interlocutores', 'en-US': 'Speakers' },
  'aipChat.audio.emptyTranscript': { 'pt-BR': 'Transcrição vazia.', 'en-US': 'Empty transcript.' },
  'aipChat.audio.transcriptRaw': { 'pt-BR': 'Transcrição bruta', 'en-US': 'Raw transcript' },
  'aipChat.audio.linkPerson': { 'pt-BR': 'Associar a pessoa', 'en-US': 'Link to person' },
  'aipChat.audio.unlinkPerson': { 'pt-BR': 'Desassociar pessoa', 'en-US': 'Unlink person' },
  'aipChat.audio.searchPerson': { 'pt-BR': 'Buscar pessoa…', 'en-US': 'Search person…' },
  'aipChat.audio.searching': { 'pt-BR': 'Buscando…', 'en-US': 'Searching…' },
  'aipChat.audio.noPerson': {
    'pt-BR': 'Nenhuma pessoa encontrada.',
    'en-US': 'No person found.',
  },
  'aipChat.audio.qaTitle': {
    'pt-BR': 'Perguntar sobre a transcrição',
    'en-US': 'Ask about the transcript',
  },
  'aipChat.audio.qaPlaceholder': {
    'pt-BR': 'Ex.: Quem confirmou a posição?',
    'en-US': 'e.g. Who confirmed the position?',
  },
  'aipChat.audio.ask': { 'pt-BR': 'Perguntar', 'en-US': 'Ask' },
  'aipChat.audio.asking': { 'pt-BR': 'Consultando…', 'en-US': 'Querying…' },
  'aipChat.audio.typeQuestion': { 'pt-BR': 'Digite uma pergunta.', 'en-US': 'Type a question.' },
  'aipChat.audio.citations': { 'pt-BR': 'Citações', 'en-US': 'Citations' },
  'aipChat.audio.history': { 'pt-BR': 'Histórico', 'en-US': 'History' },
  'aipChat.audio.historyEmpty': {
    'pt-BR': 'Nenhuma transcrição ainda.',
    'en-US': 'No transcripts yet.',
  },
  'aipChat.audio.loading': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  'aipChat.audio.empty': {
    'pt-BR': 'Envie ou grave um áudio para transcrever e analisar.',
    'en-US': 'Upload or record audio to transcribe and analyze.',
  },
  'aipChat.audio.attach': {
    'pt-BR': 'Anexar áudio (análise forense)',
    'en-US': 'Attach audio (forensic analysis)',
  },
  'aipChat.audio.record': { 'pt-BR': 'Gravar áudio', 'en-US': 'Record audio' },
  'aipChat.audio.recording': {
    'pt-BR': 'Gravando — clique para parar',
    'en-US': 'Recording — click to stop',
  },
  'aipChat.audio.processing': {
    'pt-BR': 'Transcrevendo gravação…',
    'en-US': 'Transcribing recording…',
  },
  'aipChat.audio.micLabel': { 'pt-BR': 'Gravação ao vivo (chat)', 'en-US': 'Live recording (chat)' },
  'aipChat.audio.micDenied': {
    'pt-BR': 'Acesso ao microfone negado. Permita o microfone no navegador e tente de novo.',
    'en-US': 'Microphone access denied. Allow the microphone in your browser and try again.',
  },
  'aipChat.audio.micUnsupported': {
    'pt-BR': 'Gravação de áudio indisponível neste navegador.',
    'en-US': 'Audio recording is unavailable in this browser.',
  },
  'aipChat.audio.micEmpty': {
    'pt-BR': 'Nenhuma fala detectada na gravação.',
    'en-US': 'No speech detected in the recording.',
  },
  'connectors.keys.action': { 'pt-BR': 'Configurar chaves', 'en-US': 'Configure keys' },
  'connectors.keys.title': { 'pt-BR': 'Chaves dos conectores', 'en-US': 'Connector keys' },
  'connectors.keys.hint': {
    'pt-BR': 'Chaves de API dos conectores que o AIP usa como ferramentas (busca web, análise de URL, justiça, transparência e afins). Ficam no Vault da sua organização — guardamos só a referência, nunca o valor em claro — e valem só para esta organização.',
    'en-US': 'API keys for the connectors the AIP uses as tools (web search, URL analysis, courts, transparency and similar). They live in your organization’s Vault — we store only the reference, never the cleartext value — and apply to this organization only.',
  },
  'connectors.keys.empty': {
    'pt-BR': 'Nenhum conector exige chave no momento.',
    'en-US': 'No connector currently requires a key.',
  },
  'cameras.multidomain': { 'pt-BR': 'Análise multidomínio', 'en-US': 'Multidomain analysis' },
  'cameras.multidomainTitle': { 'pt-BR': 'Análise multidomínio (nuvem externa)', 'en-US': 'Multidomain analysis (external cloud)' },
  'cameras.multidomainIntro': { 'pt-BR': 'Roda um modelo pré-treinado hospedado sobre o último quadro arquivado desta câmera (acidente, EPI, fogo, cheia, arma, aglomeração). O resultado entra como evento na ontologia.', 'en-US': 'Runs a hosted pre-trained model over this camera’s latest archived frame (accident, PPE, fire, flood, weapon, crowd). The result lands as an ontology event.' },
  'cameras.multidomainDomain': { 'pt-BR': 'Domínio', 'en-US': 'Domain' },
  'cameras.multidomainLoading': { 'pt-BR': 'Carregando domínios…', 'en-US': 'Loading domains…' },
  'cameras.multidomainNoDomains': { 'pt-BR': 'Nenhum domínio hospedado disponível.', 'en-US': 'No hosted domain available.' },
  'cameras.multidomainNoFrame': { 'pt-BR': 'Sem quadro arquivado — rode "Detectar agora" primeiro para gerar um quadro.', 'en-US': 'No archived frame — run “Detect now” first to produce a frame.' },
  'cameras.multidomainClasses': { 'pt-BR': 'Classes', 'en-US': 'Classes' },
  'cameras.multidomainCoverage': { 'pt-BR': 'Cobertura', 'en-US': 'Coverage' },
  'cameras.multidomainEgressWarn': { 'pt-BR': 'Soberania: este quadro será enviado a um serviço de nuvem externa (Roboflow) — uso demo/avaliação, não recomendado para câmera sensível de produção.', 'en-US': 'Sovereignty: this frame will be sent to an external cloud service (Roboflow) — demo/eval use, not recommended for sensitive production cameras.' },
  'cameras.multidomainEgressOptIn': { 'pt-BR': 'Autorizo enviar este quadro para a nuvem externa', 'en-US': 'I authorize sending this frame to the external cloud' },
  'cameras.multidomainRun': { 'pt-BR': 'Analisar na nuvem', 'en-US': 'Analyze in cloud' },
  'cameras.multidomainRunning': { 'pt-BR': 'Analisando…', 'en-US': 'Analyzing…' },
  'cameras.multidomainDone': { 'pt-BR': 'evento(s) criado(s)', 'en-US': 'event(s) created' },
  'cameras.multidomainEmpty': { 'pt-BR': 'Sem detecções neste quadro (status 200) — nada fabricado.', 'en-US': 'No detections in this frame (status 200) — nothing fabricated.' },
  'cameras.multidomainError': { 'pt-BR': 'Falha na análise multidomínio', 'en-US': 'Multidomain analysis failed' },
  // Tarefa X — export de clipe SERVER-SIDE (fim do modal copia-comando).
  'cameras.export.title': { 'pt-BR': 'Exportar clipe', 'en-US': 'Export clip' },
  'cameras.export.duration': { 'pt-BR': 'Duração do clipe', 'en-US': 'Clip duration' },
  'cameras.export.hint': { 'pt-BR': 'O servidor grava o trecho ao vivo do stream e arquiva o clipe como evidência (MP4 + SHA-256).', 'en-US': 'The server records the live segment of the stream and archives the clip as evidence (MP4 + SHA-256).' },
  'cameras.export.start': { 'pt-BR': 'Exportar', 'en-US': 'Export' },
  'cameras.export.processing': { 'pt-BR': 'Processando no servidor…', 'en-US': 'Processing on the server…' },
  'cameras.export.ready': { 'pt-BR': 'Clipe pronto', 'en-US': 'Clip ready' },
  'cameras.export.download': { 'pt-BR': 'Baixar clipe', 'en-US': 'Download clip' },
  'cameras.export.failed': { 'pt-BR': 'Falha na exportação', 'en-US': 'Export failed' },
  'cameras.export.sha': { 'pt-BR': 'SHA-256 · cadeia de custódia', 'en-US': 'SHA-256 · chain of custody' },
  'cameras.export.range': { 'pt-BR': 'Trecho selecionado da gravação', 'en-US': 'Selected recording range' },
  'cameras.export.hintRange': {
    'pt-BR': 'O servidor monta o clipe copiando os segmentos já gravados (sem reprocessamento) e arquiva como evidência (MP4 + SHA-256).',
    'en-US': 'The server assembles the clip by copying the recorded segments (no reprocessing) and archives it as evidence (MP4 + SHA-256).',
  },
  // Player operacional — controles reais, gravação (DVR) e bookmarks.
  'cameras.play': { 'pt-BR': 'Reproduzir', 'en-US': 'Play' },
  'cameras.pause': { 'pt-BR': 'Pausar', 'en-US': 'Pause' },
  'cameras.back10s': { 'pt-BR': 'Voltar 10 s', 'en-US': 'Back 10 s' },
  'cameras.back10sUnavailable': {
    'pt-BR': 'Sem janela de buffer atrás da posição atual — no ao vivo, aguarde o stream acumular buffer.',
    'en-US': 'No buffer window behind the current position — on live, wait for the stream to build up buffer.',
  },
  'cameras.speed': { 'pt-BR': 'Velocidade de reprodução', 'en-US': 'Playback speed' },
  'cameras.modeLive': { 'pt-BR': 'Ao vivo', 'en-US': 'Live' },
  'cameras.modeDvr': { 'pt-BR': 'Gravação', 'en-US': 'Recording' },
  'cameras.dvrUnavailable': {
    'pt-BR': 'Sem gravação disponível na janela selecionada.',
    'en-US': 'No recording available in the selected window.',
  },
  'cameras.windowTitle': { 'pt-BR': 'Janela de tempo da linha temporal', 'en-US': 'Timeline time window' },
  'cameras.bookmarkAdd': { 'pt-BR': 'Marcar momento', 'en-US': 'Mark moment' },
  'cameras.bookmarkPromptDesc': {
    'pt-BR': 'Dê um rótulo para o marcador neste instante do vídeo.',
    'en-US': 'Label this moment in the video.',
  },
  'cameras.bookmarkPromptPlaceholder': {
    'pt-BR': 'ex.: movimentação no portão',
    'en-US': 'e.g. movement at the gate',
  },
  'cameras.bookmarks': { 'pt-BR': 'Marcadores', 'en-US': 'Bookmarks' },
  'cameras.bookmarkRemoveTitle': { 'pt-BR': 'Remover marcador', 'en-US': 'Remove bookmark' },
  'cameras.bookmarkRemoveConfirm': {
    'pt-BR': 'O marcador é removido do grafo de ontologia. A gravação e as evidências exportadas não são afetadas.',
    'en-US': 'The bookmark is removed from the ontology graph. Recordings and exported evidence are not affected.',
  },
  'cameras.bookmarkCreateFailed': { 'pt-BR': 'Falha ao criar o marcador', 'en-US': 'Failed to create the bookmark' },
  'cameras.bookmarkRemoveFailed': { 'pt-BR': 'Falha ao remover o marcador', 'en-US': 'Failed to remove the bookmark' },
  // Sprint 4 · Onda 2 — gravação por câmera no GESTO da página da câmera.
  'cameras.recording.chip': { 'pt-BR': 'Gravando', 'en-US': 'Recording' },
  'cameras.recording.toggleStart': { 'pt-BR': 'Gravar', 'en-US': 'Record' },
  'cameras.recording.toggleStop': { 'pt-BR': 'Parar', 'en-US': 'Stop' },
  'cameras.recording.startTitle': { 'pt-BR': 'Iniciar gravação contínua', 'en-US': 'Start continuous recording' },
  'cameras.recording.startDesc': {
    'pt-BR': 'A câmera passa a gravar continuamente — cópia dos segmentos do stream, sem GPU. Os trechos ficam disponíveis no modo Gravação e na exportação de clipes.',
    'en-US': 'The camera starts recording continuously — stream segments are copied, no GPU. Footage becomes available in Recording mode and in clip exports.',
  },
  'cameras.recording.cadence': { 'pt-BR': 'Cadência de captura', 'en-US': 'Capture cadence' },
  'cameras.recording.cadence.1min': {
    'pt-BR': 'A cada 1 minuto — sem buracos, mais armazenamento',
    'en-US': 'Every 1 minute — no gaps, more storage',
  },
  'cameras.recording.cadence.2min': {
    'pt-BR': 'A cada 2 minutos — recomendado',
    'en-US': 'Every 2 minutes — recommended',
  },
  'cameras.recording.cadence.5min': {
    'pt-BR': 'A cada 5 minutos — econômico, pode ter buracos',
    'en-US': 'Every 5 minutes — economical, gaps possible',
  },
  'cameras.recording.start': { 'pt-BR': 'Iniciar gravação', 'en-US': 'Start recording' },
  'cameras.recording.stopTitle': { 'pt-BR': 'Parar gravação', 'en-US': 'Stop recording' },
  'cameras.recording.stopDesc': {
    'pt-BR': 'A gravação contínua desta câmera é pausada. Os trechos já gravados continuam disponíveis no modo Gravação.',
    'en-US': 'Continuous recording for this camera is paused. Footage already recorded remains available in Recording mode.',
  },
  'cameras.recording.stop': { 'pt-BR': 'Parar gravação', 'en-US': 'Stop recording' },
  'cameras.recording.noPerm': {
    'pt-BR': 'Sem permissão para ligar/desligar a gravação — requer gestão de conectores (connectors.manage).',
    'en-US': 'No permission to start/stop recording — requires connector management (connectors.manage).',
  },
  'cameras.recording.statusFailed': {
    'pt-BR': 'Falha ao consultar o estado da gravação',
    'en-US': 'Failed to fetch the recording state',
  },
  'cameras.recording.actionFailed': {
    'pt-BR': 'Falha ao atualizar a gravação — tente de novo',
    'en-US': 'Failed to update the recording — try again',
  },
  'cameras.recording.last24h': { 'pt-BR': 'últimas 24h', 'en-US': 'last 24h' },
  'cameras.recording.segments': { 'pt-BR': 'segmentos', 'en-US': 'segments' },
  // Mosaico DVR sincronizado (mesmo relógio wall-clock em todas as células).
  'cameras.mosaic.liveBadge': { 'pt-BR': 'ao vivo', 'en-US': 'live' },
  'cameras.mosaic.detections': { 'pt-BR': 'detecções', 'en-US': 'detections' },
  'cameras.mosaic.noCoverageWindow': {
    'pt-BR': 'Sem gravação na janela',
    'en-US': 'No recording in the window',
  },
  'cameras.mosaic.gapInstant': {
    'pt-BR': 'sem gravação neste instante',
    'en-US': 'no recording at this instant',
  },
  'cameras.mosaic.dvrUnavailable': {
    'pt-BR': 'Sem gravação na janela selecionada em nenhuma câmera.',
    'en-US': 'No recording in the selected window on any camera.',
  },
  // §C C1 — Mosaicos NOMEADOS (recorte salvo de câmeras, nunca "todas").
  'cameras.mosaic.trigger': { 'pt-BR': 'Mosaico', 'en-US': 'Mosaic' },
  'cameras.mosaic.triggerTip': {
    'pt-BR': 'Abrir um mosaico salvo de câmeras',
    'en-US': 'Open a saved camera mosaic',
  },
  'cameras.mosaic.single': { 'pt-BR': 'Câmera única', 'en-US': 'Single camera' },
  'cameras.mosaic.searchPlaceholder': { 'pt-BR': 'Buscar mosaico…', 'en-US': 'Search mosaic…' },
  'cameras.mosaic.new': { 'pt-BR': 'Novo mosaico', 'en-US': 'New mosaic' },
  'cameras.mosaic.none': { 'pt-BR': 'Nenhum mosaico salvo', 'en-US': 'No saved mosaic' },
  'cameras.mosaic.emptyHint': {
    'pt-BR': 'Crie recortes nomeados (ex.: Zona Norte) e alterne com um clique.',
    'en-US': 'Create named subsets (e.g. North Zone) and switch with one click.',
  },
  'cameras.mosaic.load': { 'pt-BR': 'Abrir mosaico', 'en-US': 'Open mosaic' },
  'cameras.mosaic.edit': { 'pt-BR': 'Editar mosaico', 'en-US': 'Edit mosaic' },
  'cameras.mosaic.remove': { 'pt-BR': 'Remover mosaico', 'en-US': 'Remove mosaic' },
  'cameras.mosaic.badgeManual': { 'pt-BR': 'manual', 'en-US': 'manual' },
  'cameras.mosaic.badgeFilter': { 'pt-BR': 'filtro', 'en-US': 'filter' },
  'cameras.mosaic.newTitle': { 'pt-BR': 'Novo mosaico', 'en-US': 'New mosaic' },
  'cameras.mosaic.editTitle': { 'pt-BR': 'Editar mosaico', 'en-US': 'Edit mosaic' },
  'cameras.mosaic.nameLabel': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'cameras.mosaic.namePlaceholder': { 'pt-BR': 'Ex.: Zona Norte', 'en-US': 'e.g. North Zone' },
  'cameras.mosaic.selectionLabel': { 'pt-BR': 'Seleção', 'en-US': 'Selection' },
  'cameras.mosaic.modeManual': { 'pt-BR': 'Manual', 'en-US': 'Manual' },
  'cameras.mosaic.modeFilter': { 'pt-BR': 'Por filtro', 'en-US': 'By filter' },
  'cameras.mosaic.pickCameras': { 'pt-BR': 'Selecionar câmeras', 'en-US': 'Pick cameras' },
  'cameras.mosaic.pickCamerasSearch': { 'pt-BR': 'Buscar câmera…', 'en-US': 'Search camera…' },
  'cameras.mosaic.filterHint': {
    'pt-BR': 'Dinâmico: câmeras novas que casarem entram sozinhas.',
    'en-US': 'Dynamic: new matching cameras join automatically.',
  },
  'cameras.mosaic.cityAny': { 'pt-BR': 'Cidade: qualquer', 'en-US': 'City: any' },
  'cameras.mosaic.statusLabel': { 'pt-BR': 'Situação', 'en-US': 'Status' },
  'cameras.mosaic.statusAny': { 'pt-BR': 'Situação: qualquer', 'en-US': 'Status: any' },
  'cameras.mosaic.tagsLabel': { 'pt-BR': 'Tags', 'en-US': 'Tags' },
  'cameras.mosaic.tagsAny': { 'pt-BR': 'Tags: qualquer', 'en-US': 'Tags: any' },
  'cameras.mosaic.tagsSearch': { 'pt-BR': 'Buscar tag…', 'en-US': 'Search tag…' },
  'cameras.mosaic.tagsEmpty': { 'pt-BR': 'Nenhuma tag nas câmeras carregadas.', 'en-US': 'No tags on the loaded cameras.' },
  'cameras.mosaic.zoneLabel': { 'pt-BR': 'Zona', 'en-US': 'Zone' },
  'cameras.mosaic.zoneAny': { 'pt-BR': 'Zona: qualquer', 'en-US': 'Zone: any' },
  'cameras.mosaic.zoneNone': {
    'pt-BR': 'Nenhuma zona desenhada no mapa.',
    'en-US': 'No zone drawn on the map.',
  },
  'cameras.mosaic.columnsLabel': { 'pt-BR': 'Colunas', 'en-US': 'Columns' },
  'cameras.mosaic.colAuto': { 'pt-BR': 'Auto', 'en-US': 'Auto' },
  'cameras.mosaic.matchOne': { 'pt-BR': '1 câmera neste mosaico', 'en-US': '1 camera in this mosaic' },
  'cameras.mosaic.matchN': { 'pt-BR': '{n} câmeras neste mosaico', 'en-US': '{n} cameras in this mosaic' },
  'cameras.mosaic.nameRequired': { 'pt-BR': 'Dê um nome ao mosaico.', 'en-US': 'Give the mosaic a name.' },
  'cameras.mosaic.save': { 'pt-BR': 'Salvar mosaico', 'en-US': 'Save mosaic' },
  'cameras.mosaic.activeEmpty': {
    'pt-BR': 'Nenhuma câmera casa este mosaico agora.',
    'en-US': 'No camera matches this mosaic right now.',
  },
  'cameras.mosaic.activeEmptyHint': {
    'pt-BR': 'Ajuste a seleção do mosaico ou volte à câmera única.',
    'en-US': 'Adjust the mosaic selection or return to single camera.',
  },
  'cameras.mosaic.deleteConfirm': {
    'pt-BR': 'Remover o mosaico “{name}”? Esta ação não pode ser desfeita.',
    'en-US': 'Remove the mosaic “{name}”? This cannot be undone.',
  },
  'cameras.mosaic.countUnit': { 'pt-BR': 'câmeras', 'en-US': 'cameras' },
  // §C C5 — seção gestora "Câmeras" no Acervo de /dados (lista gerida paginada).
  'cameras.registry.title': { 'pt-BR': 'Câmeras', 'en-US': 'Cameras' },
  'cameras.registry.search': {
    'pt-BR': 'Buscar por nome, cidade, URL, tag…',
    'en-US': 'Search by name, city, URL, tag…',
  },
  'cameras.registry.error': { 'pt-BR': 'Falha ao carregar as câmeras.', 'en-US': 'Failed to load cameras.' },
  'cameras.registry.empty': { 'pt-BR': 'Nenhuma câmera cadastrada.', 'en-US': 'No cameras registered.' },
  'cameras.registry.emptyFiltered': {
    'pt-BR': 'Nenhuma câmera corresponde aos filtros.',
    'en-US': 'No camera matches the filters.',
  },
  'cameras.registry.colName': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'cameras.registry.colStatus': { 'pt-BR': 'Situação', 'en-US': 'Status' },
  'cameras.registry.colDetection': { 'pt-BR': 'IA', 'en-US': 'AI' },
  'cameras.registry.colCoords': { 'pt-BR': 'Coordenadas', 'en-US': 'Coordinates' },
  'cameras.registry.colTags': { 'pt-BR': 'Tags', 'en-US': 'Tags' },
  'cameras.registry.colActions': { 'pt-BR': 'Ações', 'en-US': 'Actions' },
  'cameras.registry.rename': { 'pt-BR': 'Renomear câmera', 'en-US': 'Rename camera' },
  'cameras.registry.renamePlaceholder': { 'pt-BR': 'Novo nome da câmera', 'en-US': 'New camera name' },
  'cameras.registry.remove': { 'pt-BR': 'Remover câmera', 'en-US': 'Remove camera' },
  'cameras.registry.of': { 'pt-BR': 'de', 'en-US': 'of' },
  'cameras.registry.prev': { 'pt-BR': 'Anterior', 'en-US': 'Previous' },
  'cameras.registry.next': { 'pt-BR': 'Próxima', 'en-US': 'Next' },
  // Tarefa H — fonte CCTV no /buscar: badge dos resultados (Câmera vs Detecção).
  'ficha.ident.titulo': { 'pt-BR': 'Identificação', 'en-US': 'Identification' },
  'ficha.ident.descricao': { 'pt-BR': 'Dados oficiais e metadados', 'en-US': 'Official data and metadata' },
  'ficha.ident.vazio': { 'pt-BR': 'Sem dados de identificação cadastrados nesta entidade.', 'en-US': 'No identification data registered for this entity.' },
  'ficha.ident.tipo': { 'pt-BR': 'Tipo', 'en-US': 'Type' },
  'ficha.ident.classificacao': { 'pt-BR': 'Classificação', 'en-US': 'Classification' },
  'ficha.ident.id': { 'pt-BR': 'ID', 'en-US': 'ID' },
  'ficha.ident.versao': { 'pt-BR': 'Versão', 'en-US': 'Version' },
  'ficha.ident.tecnico': { 'pt-BR': 'Ver detalhes técnicos', 'en-US': 'Show technical details' },
  'ficha.ident.criado': { 'pt-BR': 'criado', 'en-US': 'created' },
  'ficha.ident.atualizado': { 'pt-BR': 'atualizado', 'en-US': 'updated' },
  'detection.kind.object': { 'pt-BR': 'OBJ', 'en-US': 'OBJ' },
  'detection.kind.lpr': { 'pt-BR': 'PLACA', 'en-US': 'LPR' },
  'detection.kind.face': { 'pt-BR': 'ROSTO', 'en-US': 'FACE' },
  'detection.conf': { 'pt-BR': 'conf', 'en-US': 'conf' },
  'buscar.fila.titulo': { 'pt-BR': 'Fila de buscas', 'en-US': 'Search queue' },
  'buscar.fila.pendentes': { 'pt-BR': 'pendentes', 'en-US': 'pending' },
  'buscar.fila.concluidas': { 'pt-BR': 'concluídas', 'en-US': 'done' },
  'buscar.fila.cancelar': { 'pt-BR': 'Cancelar fila', 'en-US': 'Cancel queue' },
  'buscar.fila.limpar': { 'pt-BR': 'Limpar', 'en-US': 'Clear' },
  'buscar.fila.resultados': { 'pt-BR': 'resultados', 'en-US': 'results' },
  'buscar.fila.aviso': { 'pt-BR': 'Há buscas com erro na fila', 'en-US': 'Some searches in the queue failed' },
  'buscar.fila.status.queued': { 'pt-BR': 'na fila', 'en-US': 'queued' },
  'buscar.fila.status.running': { 'pt-BR': 'executando…', 'en-US': 'running…' },
  'buscar.fila.status.error': { 'pt-BR': 'erro', 'en-US': 'error' },
  'buscar.fila.status.skipped': { 'pt-BR': 'pulada (input incompatível)', 'en-US': 'skipped (input mismatch)' },
  'buscar.fila.status.cancelled': { 'pt-BR': 'cancelado', 'en-US': 'cancelled' },
  'buscar.tempo.agora': { 'pt-BR': 'agora', 'en-US': 'now' },
  'buscar.tempo.atras': { 'pt-BR': 'atrás', 'en-US': 'ago' },
  'buscar.cameras.badge.camera': { 'pt-BR': 'Câmera', 'en-US': 'Camera' },
  'buscar.cameras.badge.deteccao': { 'pt-BR': 'Detecção', 'en-US': 'Detection' },
  // Finalidades de acesso (LGPD) — bases legais NEUTRAS (default; configurável por domínio).
  'buscar.purpose.obrigacao_legal': { 'pt-BR': 'Cumprimento de obrigação legal ou regulatória', 'en-US': 'Compliance with a legal or regulatory obligation' },
  'buscar.purpose.exercicio_direitos': { 'pt-BR': 'Exercício regular de direitos em processo', 'en-US': 'Exercise of rights in proceedings' },
  'buscar.purpose.execucao_contrato': { 'pt-BR': 'Execução de contrato', 'en-US': 'Performance of a contract' },
  'buscar.purpose.politica_publica': { 'pt-BR': 'Execução de política pública', 'en-US': 'Execution of public policy' },
  'buscar.purpose.legitimo_interesse': { 'pt-BR': 'Legítimo interesse', 'en-US': 'Legitimate interest' },
  'buscar.purpose.protecao_vida': { 'pt-BR': 'Proteção da vida ou da incolumidade física', 'en-US': 'Protection of life or physical safety' },
  'buscar.purpose.tutela_saude': { 'pt-BR': 'Tutela da saúde', 'en-US': 'Health protection' },
  'buscar.purpose.prevencao_fraude': { 'pt-BR': 'Prevenção à fraude e segurança do titular', 'en-US': 'Fraud prevention and data subject safety' },
  'buscar.purpose.consentimento': { 'pt-BR': 'Consentimento do titular', 'en-US': 'Data subject consent' },
  // Widget "Buscas monitoradas" (gestão dos SearchFeeds na /alertas)
  'buscasMonitoradas.titulo': { 'pt-BR': 'Buscas monitoradas', 'en-US': 'Monitored searches' },
  'buscasMonitoradas.carregando': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  'buscasMonitoradas.vazio': { 'pt-BR': 'Nenhuma busca monitorada. Salve uma busca em Buscar para monitorar.', 'en-US': 'No monitored searches. Save a search in Search to monitor.' },
  'buscasMonitoradas.erro': { 'pt-BR': 'Não foi possível carregar as buscas monitoradas.', 'en-US': 'Could not load monitored searches.' },
  'buscasMonitoradas.atualizar': { 'pt-BR': 'Atualizar', 'en-US': 'Refresh' },
  'buscasMonitoradas.ativa': { 'pt-BR': 'Ativa', 'en-US': 'Active' },
  'buscasMonitoradas.pausada': { 'pt-BR': 'Pausada', 'en-US': 'Paused' },
  'buscasMonitoradas.pausar': { 'pt-BR': 'Pausar monitoramento', 'en-US': 'Pause monitoring' },
  'buscasMonitoradas.retomar': { 'pt-BR': 'Retomar monitoramento', 'en-US': 'Resume monitoring' },
  'buscasMonitoradas.editarCadencia': { 'pt-BR': 'Editar cadência', 'en-US': 'Edit cadence' },
  'buscasMonitoradas.cadenciaPrompt': { 'pt-BR': 'Cadência em segundos (mín. 60):', 'en-US': 'Cadence in seconds (min 60):' },
  'buscasMonitoradas.salvar': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'buscasMonitoradas.excluir': { 'pt-BR': 'Excluir', 'en-US': 'Delete' },
  'buscasMonitoradas.excluirConfirma': { 'pt-BR': 'Excluir esta busca monitorada? O alerta deixa de disparar.', 'en-US': 'Delete this monitored search? Alerts will stop firing.' },
  // V1 visão — widget Enviar arquivo (E5) + Contagem por imagem (B1/B3).
  'mediaUploader.send': { 'pt-BR': 'Enviar', 'en-US': 'Send' },
  'mediaUploader.sent': { 'pt-BR': 'Arquivo enviado e registrado.', 'en-US': 'File sent and recorded.' },
  'mediaUploader.failed': { 'pt-BR': 'Falha no envio', 'en-US': 'Upload failed' },
  'mediaUploader.tooLarge': { 'pt-BR': 'Arquivo muito grande', 'en-US': 'File too large' },
  'visionCount.title': { 'pt-BR': 'Contagem por imagem', 'en-US': 'Image counting' },
  'visionCount.hint': { 'pt-BR': 'Envie uma foto aérea, ancore os cantos no mapa real e descreva o que contar.', 'en-US': 'Upload an aerial photo, anchor the corners to the real map and describe what to count.' },
  'visionCount.tooLarge': { 'pt-BR': 'Imagem muito grande', 'en-US': 'Image too large' },
  'visionCount.nwLat': { 'pt-BR': 'Canto sup. esq. — lat', 'en-US': 'Top-left — lat' },
  'visionCount.nwLng': { 'pt-BR': 'Canto sup. esq. — lng', 'en-US': 'Top-left — lng' },
  'visionCount.seLat': { 'pt-BR': 'Canto inf. dir. — lat', 'en-US': 'Bottom-right — lat' },
  'visionCount.seLng': { 'pt-BR': 'Canto inf. dir. — lng', 'en-US': 'Bottom-right — lng' },
  'visionCount.instruction': { 'pt-BR': 'O que contar', 'en-US': 'What to count' },
  'visionCount.instructionPh': { 'pt-BR': 'ex.: conte as casas', 'en-US': 'e.g.: count the houses' },
  'visionCount.count': { 'pt-BR': 'Contar', 'en-US': 'Count' },
  'visionCount.found': { 'pt-BR': 'Itens encontrados', 'en-US': 'Items found' },
  'visionCount.removed': { 'pt-BR': 'removidos na revisão', 'en-US': 'removed in review' },
  'visionCount.clickRemove': { 'pt-BR': 'Clique para remover este item da contagem', 'en-US': 'Click to remove this item from the count' },
  'visionCount.clickRestore': { 'pt-BR': 'Clique para restaurar este item', 'en-US': 'Click to restore this item' },
  'visionCount.confirm': { 'pt-BR': 'Confirmar e materializar', 'en-US': 'Confirm and materialize' },
  'visionCount.noKind': { 'pt-BR': 'Configure o tipo de objeto no Inspetor.', 'en-US': 'Set the object type in the Inspector.' },
  'visionCount.created': { 'pt-BR': 'Instâncias criadas', 'en-US': 'Instances created' },
  // S4 — recomendação de modelo + modo de saída + intenção de hospedagem.
  'visionCount.recModel': { 'pt-BR': 'Modelo recomendado', 'en-US': 'Recommended model' },
  'visionCount.recAlts': { 'pt-BR': 'Alternativas', 'en-US': 'Alternatives' },
  'visionCount.outputMode': { 'pt-BR': 'Saída', 'en-US': 'Output' },
  'visionCount.outPoint': { 'pt-BR': 'Pino (ponto)', 'en-US': 'Pin (point)' },
  'visionCount.outPolygon': { 'pt-BR': 'Polígono (área)', 'en-US': 'Polygon (area)' },
  'visionCount.hosting': { 'pt-BR': 'Hospedagem', 'en-US': 'Hosting' },
  'visionCount.hostAuto': { 'pt-BR': 'Automático', 'en-US': 'Automatic' },
  'visionCount.hostEdge': { 'pt-BR': 'No cliente (edge)', 'en-US': 'On-premises (edge)' },
  'visionCount.hostShared': { 'pt-BR': 'Compartilhado', 'en-US': 'Shared' },
  'visionCount.hostDedicated': { 'pt-BR': 'Dedicado', 'en-US': 'Dedicated' },
  // V2 — editor de item (editar lat/lng + metadata / remover).
  'instanceEditor.title': { 'pt-BR': 'Item', 'en-US': 'Item' },
  'instanceEditor.empty': { 'pt-BR': 'Clique em um item no mapa para editar.', 'en-US': 'Click an item on the map to edit.' },
  'instanceEditor.lat': { 'pt-BR': 'Latitude', 'en-US': 'Latitude' },
  'instanceEditor.lng': { 'pt-BR': 'Longitude', 'en-US': 'Longitude' },
  'instanceEditor.geoInvalid': { 'pt-BR': 'Latitude/longitude inválidas.', 'en-US': 'Invalid latitude/longitude.' },
  'instanceEditor.save': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'instanceEditor.remove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'instanceEditor.confirmQ': { 'pt-BR': 'Remover este item?', 'en-US': 'Remove this item?' },
  'instanceEditor.confirmYes': { 'pt-BR': 'Sim, remover', 'en-US': 'Yes, remove' },
  'common.slugLabel': { 'pt-BR': 'Identificador (slug)', 'en-US': 'Identifier (slug)' },
  'common.nameLabel': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'common.descriptionLabel': { 'pt-BR': 'Descrição', 'en-US': 'Description' },
  'common.filterNameSlug': {
    'pt-BR': 'Filtrar por nome ou slug…',
    'en-US': 'Filter by name or slug…',
  },
  'common.slugImmutable': {
    'pt-BR':
      'Identificador (slug) é imutável para preservar referências históricas (ResourceMarking, LineageEvent, etc).',
    'en-US':
      'Identifier (slug) is immutable to preserve historical references (ResourceMarking, LineageEvent, etc).',
  },
  'common.inactiveBadge': { 'pt-BR': 'inativa', 'en-US': 'inactive' },
  'common.inactiveBadgeM': { 'pt-BR': 'inativo', 'en-US': 'inactive' },
  'common.modeOr': { 'pt-BR': 'OU', 'en-US': 'OR' },
  'common.modeAnd': { 'pt-BR': 'E', 'en-US': 'AND' },
  'common.moveUp': { 'pt-BR': 'Mover acima', 'en-US': 'Move up' },
  'common.moveDown': { 'pt-BR': 'Mover abaixo', 'en-US': 'Move down' },
  // Count words for inline pluralization (resolved via .replace()).
  'common.orgSingular': { 'pt-BR': 'Organização', 'en-US': 'Organization' },
  'common.orgPlural': { 'pt-BR': 'Organizações', 'en-US': 'Organizations' },
  'common.memberSingular': { 'pt-BR': 'membro', 'en-US': '' },
  'common.memberPlural': { 'pt-BR': 'membros', 'en-US': 's' },
  'common.operationSingular': { 'pt-BR': 'Operação', 'en-US': 'Operation' },
  'common.operationPlural': { 'pt-BR': 'Operações', 'en-US': 'Operations' },
  'common.roomSingular': { 'pt-BR': 'sala', 'en-US': 'room' },
  'common.roomPlural': { 'pt-BR': 'salas', 'en-US': 'rooms' },
  'common.displaySingular': { 'pt-BR': 'display', 'en-US': 'display' },
  'common.displayPlural': { 'pt-BR': 'displays', 'en-US': 'displays' },
  'common.sessionSingular': { 'pt-BR': 'sessão', 'en-US': 'session' },
  'common.sessionPlural': { 'pt-BR': 'sessões', 'en-US': 'sessions' },

  // ─── Locale picker (sidebar footer) ──────────────────────────────────
  'locale.label': { 'pt-BR': 'Idioma', 'en-US': 'Language' },
  'locale.pt-BR': { 'pt-BR': 'Português (BR)', 'en-US': 'Portuguese (BR)' },
  'locale.en-US': { 'pt-BR': 'Inglês (EUA)', 'en-US': 'English (US)' },

  // ─── Assistente (FAB) · #9 — toggle na Conta ─────────────────────────
  'assistant.section': { 'pt-BR': 'Assistente', 'en-US': 'Assistant' },
  'assistant.toggleLabel': {
    'pt-BR': 'Mostrar o assistente (botão flutuante)',
    'en-US': 'Show the assistant (floating button)',
  },
  'assistant.hint': {
    'pt-BR':
      'Exibe um botão flutuante no canto da tela para abrir o assistente. A preferência fica salva na sua conta.',
    'en-US':
      'Shows a floating button in the corner of the screen to open the assistant. The preference is saved to your account.',
  },
  'assistant.on': { 'pt-BR': 'Visível', 'en-US': 'Visible' },
  'assistant.off': { 'pt-BR': 'Oculto', 'en-US': 'Hidden' },

  // ─── Control Panel shell (footer/help) ───────────────────────────────
  'cp.help': { 'pt-BR': 'Ajuda', 'en-US': 'Help' },
  'cp.backToPanel': { 'pt-BR': 'Painel de Controle', 'en-US': 'Control Panel' },
  'cp.backToAegis': { 'pt-BR': 'Voltar ao AEGIS', 'en-US': 'Back to AEGIS' },
  'cp.collapse': { 'pt-BR': 'Esconder painel', 'en-US': 'Collapse panel' },
  'cp.expand': { 'pt-BR': 'Expandir painel', 'en-US': 'Expand panel' },
  // #5-sidenav (2026-05-24): rótulo do ponto verde de status no item
  // "Plataforma" (dev-mode vendor ativo). Espelha o dot "conectado" do rodapé.
  'cp.devActive': { 'pt-BR': 'Ativo', 'en-US': 'Active' },

  // ─── Footer (shell honesto, 2026-06-12) — estado REAL de conexão ─────
  'footer.connected': { 'pt-BR': 'conectado', 'en-US': 'connected' },
  'footer.offline': { 'pt-BR': 'sem conexão', 'en-US': 'offline' },
  'footer.checking': { 'pt-BR': 'verificando…', 'en-US': 'checking…' },

  // ─── Control Panel · Início · "Visão geral" (dados dinâmicos do tenant) ──
  'cp.overview.title': { 'pt-BR': 'Visão geral', 'en-US': 'Overview' },
  'cp.overview.unit': {
    'pt-BR': 'Detalhes da unidade',
    'en-US': 'Enrollment details',
  },
  'cp.overview.active': { 'pt-BR': 'ativa', 'en-US': 'active' },
  // #3 (2026-05-24): bloco "Seu escopo" — Espaços + Operações ativos.
  // Os rótulos dos dois tiles reusam `nav.espacos` / `nav.operacoes`.
  'cp.overview.scope': { 'pt-BR': 'Seu escopo', 'en-US': 'Your scope' },
  'cp.overview.unitEmpty': {
    'pt-BR': 'Nenhuma unidade ativa no seu contexto.',
    'en-US': 'No active unit in your context.',
  },
  'cp.overview.orgsEmpty': {
    'pt-BR': 'Nenhuma Organização vinculada.',
    'en-US': 'No linked Organizations.',
  },

  // ─── Modo Plataforma — sessão privilegiada gateada por senha ──────────
  // (#5 2026-05-24) Copy institucional: "Dev (Safe Core)" lia amador pra
  // uma plataforma de infra crítica. Tom = console de plataforma/manutenção,
  // sem "dev"/"fornecedor"/nomes de runtime. Label alinha com o item do
  // sidenav ("Plataforma"). statusOn/statusOff continuam Ativo/Inativo.
  'dev.section': { 'pt-BR': 'Modo Plataforma', 'en-US': 'Platform Mode' },
  'dev.title': { 'pt-BR': 'Modo Plataforma', 'en-US': 'Platform Mode' },
  'dev.subtitle': {
    'pt-BR':
      'Desbloqueia ferramentas avançadas de plataforma e configuração restrita. Requer a senha de plataforma.',
    'en-US':
      'Unlocks advanced platform tools and restricted configuration. Requires the platform password.',
  },
  'dev.passwordLabel': { 'pt-BR': 'Senha de plataforma', 'en-US': 'Platform password' },
  'dev.passwordPlaceholder': { 'pt-BR': 'Informe a senha', 'en-US': 'Enter password' },
  'dev.activate': { 'pt-BR': 'Ativar', 'en-US': 'Activate' },
  'dev.deactivate': { 'pt-BR': 'Encerrar agora', 'en-US': 'End now' },
  'dev.statusOn': { 'pt-BR': 'Ativo', 'en-US': 'Active' },
  'dev.statusOff': { 'pt-BR': 'Inativo', 'en-US': 'Inactive' },
  'dev.expiresAt': { 'pt-BR': 'Expira em', 'en-US': 'Expires at' },
  // (#4 2026-05-24) Estado-ativo útil: contagem regressiva relativa +
  // significado, no lugar do "Expira em: <data crua>". {rel} = tempo
  // restante calculado de `until`; {abs} = horário absoluto (secundário).
  'dev.activeState': {
    'pt-BR': 'Sessão de plataforma ativa',
    'en-US': 'Platform session active',
  },
  'dev.expiresIn': {
    'pt-BR': 'encerra automaticamente em {rel}',
    'en-US': 'ends automatically in {rel}',
  },
  'dev.expiresAtAbsolute': {
    'pt-BR': 'encerra em {abs}',
    'en-US': 'ends at {abs}',
  },
  'dev.expiringSoon': {
    'pt-BR': 'encerrando',
    'en-US': 'ending',
  },
  'dev.extendHint': {
    'pt-BR': 'Reative para estender a sessão ou encerre-a agora.',
    'en-US': 'Re-activate to extend the session, or end it now.',
  },
  'dev.relSeconds': { 'pt-BR': 'menos de 1 min', 'en-US': 'under 1 min' },
  'dev.relMinutes': { 'pt-BR': '{n} min', 'en-US': '{n} min' },
  'dev.relHours': { 'pt-BR': '{n} h', 'en-US': '{n} h' },
  'dev.relHoursMinutes': { 'pt-BR': '{h} h {m} min', 'en-US': '{h} h {m} min' },
  'dev.relDays': { 'pt-BR': '{n} d', 'en-US': '{n} d' },
  'dev.badPassword': { 'pt-BR': 'Senha inválida', 'en-US': 'Invalid password' },
  'dev.notVendor': {
    'pt-BR': 'Sua conta não possui o papel de fornecedor Safe Core.',
    'en-US': 'Your account does not hold the Safe Core vendor role.',
  },
  'dev.activated': { 'pt-BR': 'Modo Plataforma ativado', 'en-US': 'Platform Mode activated' },
  'dev.deactivated': { 'pt-BR': 'Modo Plataforma desativado', 'en-US': 'Platform Mode deactivated' },
  'dev.page.title': { 'pt-BR': 'Dev (Safe Core)', 'en-US': 'Dev (Safe Core)' },
  'dev.page.subtitle': {
    'pt-BR': 'Customização de navegação e domínios licenciados do tenant',
    'en-US': 'Navigation customization and tenant licensed domains',
  },
  'dev.page.inactiveTitle': {
    'pt-BR': 'Dev-mode inativo',
    'en-US': 'Dev-mode inactive',
  },
  'dev.page.inactiveHint': {
    'pt-BR':
      'Esta área é exclusiva da Safe Core (fornecedor) e exige o dev-mode ativo. Ative-o na sua Conta com a senha de fornecedor.',
    'en-US':
      'This area is Safe Core (vendor) only and requires an active dev-mode session. Activate it in your Account with the vendor password.',
  },
  'dev.page.gotoConta': {
    'pt-BR': 'Ir para Conta',
    'en-US': 'Go to Account',
  },
  'dev.domains.title': { 'pt-BR': 'Domínios licenciados', 'en-US': 'Licensed domains' },
  'dev.domains.help': {
    'pt-BR':
      'Selecione os domínios que este tenant pode operar. Vazio = sem restrição (legado). Endpoints sensíveis (inteligência/defesa) são bloqueados no servidor quando o domínio não está liberado.',
    'en-US':
      'Select the domains this tenant may operate. Empty = unrestricted (legacy). Sensitive endpoints (intelligence/defense) are blocked server-side when the domain is not licensed.',
  },
  'dev.domains.save': { 'pt-BR': 'Salvar domínios', 'en-US': 'Save domains' },
  'dev.domains.saved': { 'pt-BR': 'Domínios atualizados', 'en-US': 'Domains updated' },
  'dev.nav.title': { 'pt-BR': 'Itens de navegação', 'en-US': 'Navigation items' },
  'dev.nav.help': {
    'pt-BR':
      'Mostre ou esconda itens do menu do Painel de Controle para este tenant. Apenas cosmético — não substitui permissões.',
    'en-US':
      'Show or hide Control Panel menu items for this tenant. Cosmetic only — does not replace permissions.',
  },
  'dev.nav.save': { 'pt-BR': 'Salvar navegação', 'en-US': 'Save navigation' },
  'dev.nav.saved': { 'pt-BR': 'Navegação atualizada', 'en-US': 'Navigation updated' },
  'dev.nav.visible': { 'pt-BR': 'Visível', 'en-US': 'Visible' },
  'dev.nav.hidden': { 'pt-BR': 'Oculto', 'en-US': 'Hidden' },
  // LOTE2 (#1) — grupo das 3 Páginas modulares do shell do OPERADOR.
  'dev.nav.modularGroup': { 'pt-BR': 'Aplicações', 'en-US': 'Applications' },

  // ─── Navegação (Onda R.5) ─────────────────────────────────────────────
  // Labels do sidenav global (components/shell/sidenav.tsx · FALLBACK_NAV)
  // e do sidenav do Painel (control-panel-shell.tsx · NAV_ITEMS).
  // Chave = `nav.<id>` onde <id> é o id estável do item/seção. pt-BR é
  // idêntico ao literal histórico (mantém testes verdes); en-US é peer.
  // Sidenav global — seções
  'nav.section.meus-apps': { 'pt-BR': 'Meus Apps', 'en-US': 'My Apps' },
  // W8 — seção dinâmica das Páginas modulares app_route (Conversas/Soluções/Agentes).
  'nav.section.aplicacoes': { 'pt-BR': 'Aplicações', 'en-US': 'Applications' },
  'nav.section.operacao': { 'pt-BR': 'Operação', 'en-US': 'Operations' },
  'nav.section.analise': { 'pt-BR': 'Análise', 'en-US': 'Analysis' },
  'nav.section.conteudo': { 'pt-BR': 'Conteúdo', 'en-US': 'Content' },
  // Sidenav global — itens
  'nav.painel': { 'pt-BR': 'Início', 'en-US': 'Home' },
  'nav.buscar': { 'pt-BR': 'Buscar', 'en-US': 'Search' },
  'nav.geo': { 'pt-BR': 'Mapa', 'en-US': 'Map' },
  'nav.cameras': { 'pt-BR': 'Câmeras', 'en-US': 'Cameras' },
  'nav.explorador': { 'pt-BR': 'Explorador', 'en-US': 'Explorer' },
  'nav.rede': { 'pt-BR': 'Rede', 'en-US': 'Network' },
  // 'nav.agentes' já definido adiante (bloco de rotas app_route/IAM).
  'nav.alertas': { 'pt-BR': 'Alertas', 'en-US': 'Alerts' },
  'nav.relatorios': { 'pt-BR': 'Relatórios', 'en-US': 'Reports' },
  'nav.briefings': { 'pt-BR': 'Briefings', 'en-US': 'Briefings' },
  'nav.docs': { 'pt-BR': 'Documentação', 'en-US': 'Documentation' },
  // Sidenav global — chrome (logout / collapse / aria / status)
  'nav.logout': { 'pt-BR': 'Sair', 'en-US': 'Sign out' },
  'nav.expand': { 'pt-BR': 'Expandir menu', 'en-US': 'Expand menu' },
  'nav.collapse': { 'pt-BR': 'Esconder menu', 'en-US': 'Collapse menu' },
  'nav.aria': { 'pt-BR': 'Navegação principal', 'en-US': 'Main navigation' },
  'nav.statusLive': { 'pt-BR': 'nav · ontology-module', 'en-US': 'nav · ontology-module' },
  'nav.statusDemo': { 'pt-BR': 'nav · modo demo', 'en-US': 'nav · demo mode' },
  'nav.noRole': { 'pt-BR': 'sem papel', 'en-US': 'no role' },
  // Painel de Controle — grupos + subgrupos
  'nav.group.enrollment': { 'pt-BR': 'UNIDADE', 'en-US': 'UNIT' },
  'nav.group.organization': { 'pt-BR': 'ORGANIZAÇÃO', 'en-US': 'ORGANIZATION' },
  'nav.subgroup.access': { 'pt-BR': 'Acesso e Identidade', 'en-US': 'Access and Identity' },
  'nav.subgroup.content': { 'pt-BR': 'Conteúdo Operacional', 'en-US': 'Operational Content' },
  'nav.subgroup.catalog': { 'pt-BR': 'Catálogo', 'en-US': 'Catalog' },
  'nav.subgroup.comm': { 'pt-BR': 'Comunicação', 'en-US': 'Communication' },
  // Painel de Controle — seções da reorg M1.c (#12). Chave =
  // `nav.section.cp-<sectionKey>`. pt-BR idêntico ao literal de SECTIONS.
  'nav.section.cp-acesso': { 'pt-BR': 'Acesso', 'en-US': 'Access' },
  'nav.section.cp-operacional': { 'pt-BR': 'Operacional', 'en-US': 'Operational' },
  'nav.section.cp-marcacoes': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'nav.section.cp-ia': { 'pt-BR': 'IA & Automação', 'en-US': 'AI & Automation' },
  'nav.section.cp-catalogo': { 'pt-BR': 'Catálogo', 'en-US': 'Catalog' },
  'nav.section.cp-dados': { 'pt-BR': 'Dados', 'en-US': 'Data' },
  'nav.section.cp-comunicacao': { 'pt-BR': 'Comunicação', 'en-US': 'Communication' },
  // FIX ELO IAM (#2, 2026-06-28): o item IAM voltou para a seção "Acesso" com o
  // rótulo conciso "Identidade" (lê-se "Acesso › Identidade"). A seção própria
  // "Acesso e Identidade" foi removida da sidenav; `nav.section.cp-identidade`
  // fica como chave órfã inofensiva (nenhuma seção a consome mais).
  'nav.section.cp-identidade': { 'pt-BR': 'Acesso e Identidade', 'en-US': 'Access & Identity' },
  'nav.identidade': { 'pt-BR': 'Identidade', 'en-US': 'Identity' },
  'nav.section.cp-sistema': { 'pt-BR': 'Sistema', 'en-US': 'System' },
  // Painel de Controle — itens (NAV_ITEMS)
  'nav.home': { 'pt-BR': 'Início', 'en-US': 'Home' },
  'nav.aprovacoes': { 'pt-BR': 'Aprovações', 'en-US': 'Approvals' },
  'nav.search': { 'pt-BR': 'Buscar', 'en-US': 'Search' },
  'nav.organizacoes': { 'pt-BR': 'Organizações', 'en-US': 'Organizations' },
  'nav.espacos': { 'pt-BR': 'Espaços', 'en-US': 'Spaces' },
  'nav.convidados': { 'pt-BR': 'Convidados', 'en-US': 'Guests' },
  'nav.grupos': { 'pt-BR': 'Grupos', 'en-US': 'Groups' },
  'nav.operacoes': { 'pt-BR': 'Operações', 'en-US': 'Operations' },
  'nav.salas': { 'pt-BR': 'Salas', 'en-US': 'Rooms' },
  'nav.tours': { 'pt-BR': 'Tours', 'en-US': 'Tours' },
  'nav.marcacoes': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'nav.marcacoes-propriedade': {
    'pt-BR': 'Por Propriedade',
    'en-US': 'By Property',
  },
  'nav.acoes': { 'pt-BR': 'Ações', 'en-US': 'Actions' },
  'nav.solutions': { 'pt-BR': 'Soluções', 'en-US': 'Solutions' },
  'nav.grafo': { 'pt-BR': 'Mapa do Workflow', 'en-US': 'Workflow Map' },
  'nav.scenarios': { 'pt-BR': 'Cenários', 'en-US': 'Scenarios' },
  'nav.logic-editor': { 'pt-BR': 'Análises', 'en-US': 'Analyses' },
  'nav.pilots': { 'pt-BR': 'Roteiros', 'en-US': 'Playbooks' },
  'nav.autopilot': { 'pt-BR': 'Rotinas', 'en-US': 'Routines' },
  'nav.apps': { 'pt-BR': 'Apps', 'en-US': 'Apps' },
  'nav.agentes': { 'pt-BR': 'Agentes', 'en-US': 'Agents' },
  'nav.aip-threads': { 'pt-BR': 'Conversas', 'en-US': 'Conversations' },
  'nav.aip-models': { 'pt-BR': 'Modelos', 'en-US': 'Models' },
  'nav.aip-memory': { 'pt-BR': 'Memória', 'en-US': 'Memory' },
  'nav.ontologia-tipos': { 'pt-BR': 'Tipos de objeto', 'en-US': 'Object types' },
  'nav.ontologia-instancias': {
    'pt-BR': 'Instâncias',
    'en-US': 'Instances',
  },
  'nav.ontologia-grafo': { 'pt-BR': 'Grafo da ontologia', 'en-US': 'Ontology graph' },
  'nav.comunicacoes': { 'pt-BR': 'Comunicações', 'en-US': 'Communications' },
  'nav.comunicados': { 'pt-BR': 'Comunicados', 'en-US': 'Notices' },
  'nav.lineage': { 'pt-BR': 'Eventos de lineage', 'en-US': 'Lineage events' },
  'nav.iam-equipe': { 'pt-BR': 'Equipe', 'en-US': 'Team' },
  'nav.iam-papeis': { 'pt-BR': 'Papéis', 'en-US': 'Roles' },
  'nav.iam-permissoes': { 'pt-BR': 'Permissões', 'en-US': 'Permissions' },
  'nav.iam-auditoria': { 'pt-BR': 'Auditoria', 'en-US': 'Audit' },
  'nav.conta': { 'pt-BR': 'Conta', 'en-US': 'Account' },
  'nav.dev': { 'pt-BR': 'Plataforma', 'en-US': 'Platform' },
  'nav.browser': { 'pt-BR': 'Browser', 'en-US': 'Browser' },
  'nav.notificacoes': { 'pt-BR': 'Notificações', 'en-US': 'Notifications' },
  'nav.atividade': { 'pt-BR': 'Atividade', 'en-US': 'Activity' },
  'nav.styles-configurator': { 'pt-BR': 'Aparência', 'en-US': 'Appearance' },
  'nav.app-shell': { 'pt-BR': 'Layout do App', 'en-US': 'App Layout' },
  'nav.paginas': { 'pt-BR': 'Páginas', 'en-US': 'Pages' },
  // Fase 4 IA — hubs novos (CpHubSubnav).
  'nav.personalizacao': { 'pt-BR': 'Personalização', 'en-US': 'Personalization' },
  'nav.comunicacao': { 'pt-BR': 'Comunicação', 'en-US': 'Communication' },
  // Backlog #6b — hub "Comunicação operacional" (Comunicados + Rotas de alerta).
  // LOTE1 ELO NAV&HUBS (#3): label do ITEM de sidenav renomeado para "Alertas"
  // (id/href/tabs preservados; a barra do hub mantém o group interno).
  'nav.comunicacao-operacional': { 'pt-BR': 'Alertas', 'en-US': 'Alerts' },
  'nav.automacao': { 'pt-BR': 'Automação', 'en-US': 'Automation' },
  'nav.loja': { 'pt-BR': 'Loja', 'en-US': 'Store' },

  // ─── Wave H.4.B · Comunicados (banners globais) ──────────────────────
  'comunicados.dismiss': { 'pt-BR': 'Fechar comunicado', 'en-US': 'Dismiss notice' },
  'comunicados.moreCount': {
    'pt-BR': '+{n} comunicado(s) adicional(is)',
    'en-US': '+{n} more notice(s)',
  },
  'comunicados.openCta': { 'pt-BR': 'Abrir', 'en-US': 'Open' },

  // ─── Mission #10 · Comunicados admin (lista + form) ──────────────────
  'comunicadosAdmin.listCount': {
    'pt-BR': '{n} de {total}',
    'en-US': '{n} of {total}',
  },
  'comunicadosAdmin.rowHasCta': { 'pt-BR': 'Com ação', 'en-US': 'With action' },
  'comunicadosAdmin.duplicate': { 'pt-BR': 'Duplicar', 'en-US': 'Duplicate' },
  'comunicadosAdmin.delete': { 'pt-BR': 'Excluir', 'en-US': 'Delete' },
  'comunicadosAdmin.rowScheduled': { 'pt-BR': 'Início {date}', 'en-US': 'Starts {date}' },
  'comunicadosAdmin.rowExpired': { 'pt-BR': 'Fim {date}', 'en-US': 'Ended {date}' },
  'comunicadosAdmin.rowCreated': { 'pt-BR': 'Criado {date}', 'en-US': 'Created {date}' },
  'comunicadosAdmin.rowNotClosable': {
    'pt-BR': 'Fixo',
    'en-US': 'Pinned',
  },
  'comunicadosAdmin.rowNotClosableHint': {
    'pt-BR': 'Operador não pode dispensar este banner.',
    'en-US': 'Operators cannot dismiss this banner.',
  },
  'comunicadosAdmin.sectionContent': { 'pt-BR': 'Conteúdo', 'en-US': 'Content' },
  'comunicadosAdmin.sectionContentHint': {
    'pt-BR': 'Mensagem e aparência que o operador verá no topo do painel.',
    'en-US': 'Message and appearance operators will see at the top of the panel.',
  },
  'comunicadosAdmin.sectionBehavior': { 'pt-BR': 'Comportamento', 'en-US': 'Behavior' },
  'comunicadosAdmin.sectionBehaviorHint': {
    'pt-BR': 'Como o banner se comporta para quem recebe.',
    'en-US': 'How the banner behaves for recipients.',
  },
  'comunicadosAdmin.sectionAction': { 'pt-BR': 'Botão de ação', 'en-US': 'Action button' },
  'comunicadosAdmin.sectionActionOptional': { 'pt-BR': 'opcional', 'en-US': 'optional' },
  'comunicadosAdmin.sectionActionHint': {
    'pt-BR': 'Leva o operador a uma página. Rótulo e URL andam juntos.',
    'en-US': 'Takes the operator to a page. Label and URL go together.',
  },
  'comunicadosAdmin.sectionSchedule': { 'pt-BR': 'Agenda', 'en-US': 'Schedule' },
  'comunicadosAdmin.sectionScheduleHint': {
    'pt-BR': 'Janela de exibição. Vazio = ativo imediatamente, sem expirar.',
    'en-US': 'Display window. Empty = active immediately, never expires.',
  },
  'comunicadosAdmin.sectionAudience': { 'pt-BR': 'Audiência', 'en-US': 'Audience' },
  'comunicadosAdmin.sectionAudienceHint': {
    'pt-BR': 'Quem recebe o banner. Vazio = todos os operadores.',
    'en-US': 'Who receives the banner. Empty = all operators.',
  },
  'comunicadosAdmin.ctaLabelField': { 'pt-BR': 'Rótulo do botão', 'en-US': 'Button label' },
  'comunicadosAdmin.ctaHrefField': { 'pt-BR': 'Destino (URL)', 'en-US': 'Destination (URL)' },
  'comunicadosAdmin.appearanceLabel': { 'pt-BR': 'Aparência', 'en-US': 'Appearance' },

  // ─── Lineage page ────────────────────────────────────────────────────
  'lineage.title': { 'pt-BR': 'Lineage', 'en-US': 'Lineage' },
  'lineage.subtitle': {
    'pt-BR':
      'Auditoria de eventos governamentais (LineageEvents). Filtre por tipo + busque por ator ou ID de recurso.',
    'en-US':
      'Audit trail of governance events (LineageEvents). Filter by type and search by actor or resource ID.',
  },
  'lineage.filters': { 'pt-BR': 'Filtros', 'en-US': 'Filters' },
  'lineage.searchPlaceholder': {
    'pt-BR': 'Buscar por ator, event_type ou ID na metadata…',
    'en-US': 'Search by actor, event_type or metadata ID…',
  },
  'lineage.eventTypePlaceholder': {
    'pt-BR': 'event_type exato (ex: workspace.publish)',
    'en-US': 'exact event_type (ex: workspace.publish)',
  },
  'lineage.shortcuts': { 'pt-BR': 'Atalhos:', 'en-US': 'Shortcuts:' },
  'lineage.chipAll': { 'pt-BR': 'todos', 'en-US': 'all' },
  'lineage.errorTitle': {
    'pt-BR': 'Falha ao carregar Lineage',
    'en-US': 'Failed to load Lineage',
  },
  'lineage.emptyTitle': {
    'pt-BR': 'Nenhum evento encontrado',
    'en-US': 'No events found',
  },
  'lineage.emptyDesc': {
    'pt-BR':
      'Tente limpar os filtros ou escolher outro tipo de evento. Eventos são gerados automaticamente em cada operação governamental.',
    'en-US':
      'Try clearing the filters or picking a different event type. Events are produced automatically by every governance write.',
  },
  'lineage.clearFilters': {
    'pt-BR': 'Limpar filtros',
    'en-US': 'Clear filters',
  },
  'lineage.actor': { 'pt-BR': 'actor:', 'en-US': 'actor:' },

  // ─── Mapa do Workflow (grafo de lineage unificado · M5-10) ───────────
  'grafo.title': { 'pt-BR': 'Mapa do Workflow', 'en-US': 'Workflow Map' },
  'grafo.subtitle': {
    'pt-BR':
      'O que alimenta cada recurso, o que ele afeta e se dá pra confiar nele. Clique em um nó para investigar.',
    'en-US':
      'What feeds each resource, what it affects, and whether you can trust it. Click a node to investigate.',
  },
  'grafo.tabMapa': { 'pt-BR': 'Mapa', 'en-US': 'Map' },
  'grafo.tabMapaFull': {
    'pt-BR': 'Mapa do Workflow (diagrama)',
    'en-US': 'Workflow Map (diagram)',
  },
  'grafo.tabEventos': { 'pt-BR': 'Eventos', 'en-US': 'Events' },
  'grafo.tabEventosFull': {
    'pt-BR': 'Eventos de lineage (log)',
    'en-US': 'Lineage events (log)',
  },
  // Cenários de App — Workshop Scenario Manager (Onda 10)
  'cenapp.title': { 'pt-BR': 'Cenários de App', 'en-US': 'App Scenarios' },
  'cenapp.subtitle': { 'pt-BR': 'What-if por app: crie um cenário, adicione ações como deltas e aplique de uma vez — ou descarte. O commit executa de verdade e relata o que aplicou.', 'en-US': 'Per-app what-if: create a scenario, add actions as deltas and apply them at once — or discard. Commit runs for real and reports what applied.' },
  'cenapp.app': { 'pt-BR': 'App', 'en-US': 'App' },
  'cenapp.appPlaceholder': { 'pt-BR': '— Escolha um app —', 'en-US': '— Choose an app —' },
  'cenapp.newPlaceholder': { 'pt-BR': 'Nome do cenário', 'en-US': 'Scenario name' },
  'cenapp.create': { 'pt-BR': 'Criar', 'en-US': 'Create' },
  'cenapp.empty': { 'pt-BR': 'Nenhum cenário neste app.', 'en-US': 'No scenarios for this app.' },
  'cenapp.selectHint': { 'pt-BR': 'Selecione um cenário para ver os deltas.', 'en-US': 'Select a scenario to see its deltas.' },
  'cenapp.addActionPlaceholder': { 'pt-BR': '— Ação a adicionar como delta —', 'en-US': '— Action to add as a delta —' },
  'cenapp.addDelta': { 'pt-BR': 'Adicionar', 'en-US': 'Add' },
  'cenapp.noDeltas': { 'pt-BR': 'Nenhum delta ainda.', 'en-US': 'No deltas yet.' },
  'cenapp.commit': { 'pt-BR': 'Aplicar (commit)', 'en-US': 'Commit' },
  'cenapp.discard': { 'pt-BR': 'Descartar', 'en-US': 'Discard' },
  'cenapp.applied': { 'pt-BR': 'aplicados', 'en-US': 'applied' },
  'cenapp.failed': { 'pt-BR': 'falharam', 'en-US': 'failed' },
  // Aba Coluna — lineage coluna-a-coluna (Onda 11)
  'grafo.tabColuna': { 'pt-BR': 'Coluna', 'en-US': 'Column' },
  'grafo.tabColunaFull': { 'pt-BR': 'Lineage coluna-a-coluna', 'en-US': 'Column-level lineage' },
  'grafo.colunaSubtitle': {
    'pt-BR': 'Rastreie de onde veio uma coluna — do dataset de saída até as colunas de origem, passo a passo pelos pipelines.',
    'en-US': 'Trace where a column came from — from the output dataset back to its source columns, hop by hop through the pipelines.',
  },
  'grafo.colunaAsset': { 'pt-BR': 'Dataset', 'en-US': 'Dataset' },
  'grafo.colunaAssetPlaceholder': { 'pt-BR': '— Escolha um dataset derivado —', 'en-US': '— Choose a derived dataset —' },
  'grafo.colunaColumn': { 'pt-BR': 'Coluna', 'en-US': 'Column' },
  'grafo.colunaColumnPlaceholder': { 'pt-BR': '— Escolha a coluna —', 'en-US': '— Choose the column —' },
  'grafo.colunaTrace': { 'pt-BR': 'Rastrear', 'en-US': 'Trace' },
  'grafo.colunaOrigem': { 'pt-BR': 'origem', 'en-US': 'source' },
  'grafo.refresh': { 'pt-BR': 'Atualizar', 'en-US': 'Refresh' },
  'grafo.kindLabel': { 'pt-BR': 'Tipo de nó', 'en-US': 'Node type' },
  'grafo.markingLabel': { 'pt-BR': 'Marcação', 'en-US': 'Marking' },
  'grafo.markingPlaceholder': { 'pt-BR': 'Ex.: SIGILOSO', 'en-US': 'Ex.: SECRET' },
  'grafo.limitLabel': { 'pt-BR': 'Limite de eventos', 'en-US': 'Event limit' },
  'grafo.limitAria': {
    'pt-BR': 'Limite máximo de eventos no diagrama',
    'en-US': 'Maximum number of events in the diagram',
  },
  'grafo.searchLabel': { 'pt-BR': 'Buscar nó', 'en-US': 'Find node' },
  'grafo.searchPlaceholder': {
    'pt-BR': 'Filtrar por nome/tipo/id…',
    'en-US': 'Filter by name/type/id…',
  },
  'grafo.noNodeMatch': {
    'pt-BR': 'Nenhum nó casa com o filtro.',
    'en-US': 'No node matches the filter.',
  },
  'grafo.kindAll': { 'pt-BR': 'Tudo', 'en-US': 'All' },
  'grafo.kindDataAsset': { 'pt-BR': 'Dados', 'en-US': 'Data' },
  'grafo.kindActionType': { 'pt-BR': 'Ações', 'en-US': 'Actions' },
  'grafo.kindLogicFunction': { 'pt-BR': 'IA', 'en-US': 'AI' },
  'grafo.kindOntologyNode': {
    'pt-BR': 'Nós da ontologia',
    'en-US': 'Ontology nodes',
  },
  'grafo.kindWorkspace': { 'pt-BR': 'Painéis', 'en-US': 'Panels' },
  'grafo.kindLanguageModel': { 'pt-BR': 'Modelos', 'en-US': 'Models' },
  'grafo.canvasErrorTitle': {
    'pt-BR': 'Falha ao carregar o diagrama',
    'en-US': 'Failed to load the diagram',
  },
  'grafo.emptyTitle': {
    'pt-BR': 'Nenhum nó encontrado',
    'en-US': 'No nodes found',
  },
  'grafo.emptyDesc': {
    'pt-BR':
      'Ajuste os filtros ou aguarde execuções acumularem rastros.',
    'en-US': 'Adjust the filters or wait for runs to accumulate traces.',
  },
  'grafo.truncated': {
    'pt-BR':
      'Resultado truncado — atingiu o limite de eventos. Aumente o limite ou refine os filtros.',
    'en-US':
      'Result truncated — reached the event limit. Raise the limit or refine the filters.',
  },
  'grafo.detailEmpty': {
    'pt-BR': 'Selecione um nó no diagrama (ou na lista) para ver detalhes e vínculos.',
    'en-US': 'Select a node in the diagram (or in the list) to see details and links.',
  },
  'grafo.viewLineage': { 'pt-BR': 'Ver linhagem', 'en-US': 'View lineage' },
  'grafo.clearLineageFocus': { 'pt-BR': 'Limpar foco', 'en-US': 'Clear focus' },
  'grafo.detailMarkings': { 'pt-BR': 'marcações:', 'en-US': 'markings:' },
  'grafo.detailNeighbors': { 'pt-BR': 'Vínculos', 'en-US': 'Links' },
  'grafo.detailNoNeighbors': {
    'pt-BR': 'Sem vínculos incidentes nesse recorte.',
    'en-US': 'No incident links in this view.',
  },
  'grafo.detailProps': { 'pt-BR': 'Propriedades', 'en-US': 'Properties' },
  'grafo.detailOrg': { 'pt-BR': 'Operação:', 'en-US': 'Operation:' },
  // Legend (color legend progressivo — General/Permissions/Usage/Organization)
  'grafo.legendTitle': { 'pt-BR': 'Legenda de cores', 'en-US': 'Color legend' },
  'grafo.legendGeneral': { 'pt-BR': 'Geral', 'en-US': 'General' },
  'grafo.legendPermissions': { 'pt-BR': 'Restrição', 'en-US': 'Restriction' },
  'grafo.legendUsage': { 'pt-BR': 'Frescor', 'en-US': 'Freshness' },
  'grafo.legendOrganization': { 'pt-BR': 'Organização', 'en-US': 'Organization' },
  'grafo.legendByProject': {
    'pt-BR': 'Cor por Operação / Espaço',
    'en-US': 'Color by Operation / Space',
  },
  'grafo.legendOrgUnassigned': {
    'pt-BR': 'Sem Operação',
    'en-US': 'No Operation',
  },
  'grafo.legendNodeType': { 'pt-BR': 'Tipo de nó', 'en-US': 'Node type' },
  'grafo.legendMarked': {
    'pt-BR': 'Restrito',
    'en-US': 'Restricted',
  },
  'grafo.legendUnmarked': {
    'pt-BR': 'Sem restrição',
    'en-US': 'No restriction',
  },
  'grafo.legendOutdated': {
    'pt-BR': 'Desatualizado',
    'en-US': 'Outdated',
  },
  'grafo.legendCurrent': { 'pt-BR': 'Atual', 'en-US': 'Current' },
  'grafo.legendAxis': { 'pt-BR': 'Colorir por', 'en-US': 'Color by' },
  // Controles de visibilidade do canvas (M5-8 · 2026-05-24)
  'grafo.fitView': { 'pt-BR': 'Ajustar à tela', 'en-US': 'Fit to screen' },
  'grafo.density': { 'pt-BR': 'Densidade', 'en-US': 'Density' },
  'grafo.densityCompact': { 'pt-BR': 'Compacto', 'en-US': 'Compact' },
  'grafo.densitySpacious': { 'pt-BR': 'Espaçado', 'en-US': 'Spacious' },
  'grafo.densityToggle': {
    'pt-BR': 'Alternar densidade do diagrama',
    'en-US': 'Toggle diagram density',
  },
  'grafo.foldLabel': { 'pt-BR': 'Mostrar tipos', 'en-US': 'Show types' },
  'grafo.foldHint': {
    'pt-BR': 'Oculte tipos densos para ver o fluxo. O número é a contagem de nós.',
    'en-US': 'Hide dense types to reveal the flow. The number is the node count.',
  },
  'grafo.disconnectedGroup': {
    'pt-BR': 'Sem vínculos',
    'en-US': 'Unlinked',
  },
  'grafo.matchCount': {
    'pt-BR': 'em destaque',
    'en-US': 'highlighted',
  },
  'grafo.clearSearch': { 'pt-BR': 'Limpar busca', 'en-US': 'Clear search' },
  'grafo.hiddenByFold': {
    'pt-BR': 'oculto(s) por filtro de tipo',
    'en-US': 'hidden by type filter',
  },
  // ─── Direção B — apoio à decisão (2026-06-28) ─────────────────────────
  // Recursos sem vínculo (degree-0) — fora do canvas por padrão.
  'grafo.disconnectedSummary': {
    'pt-BR': 'recursos sem conexão neste recorte',
    'en-US': 'resources with no link in this view',
  },
  'grafo.disconnectedSearch': {
    'pt-BR': 'Buscar recurso sem conexão…',
    'en-US': 'Search unlinked resource…',
  },
  'grafo.disconnectedShowOnCanvas': {
    'pt-BR': 'Mostrar no diagrama',
    'en-US': 'Show on diagram',
  },
  'grafo.disconnectedEmpty': {
    'pt-BR': 'Nenhum recurso sem conexão casa com a busca.',
    'en-US': 'No unlinked resource matches the search.',
  },
  'grafo.emptyConnectedTitle': {
    'pt-BR': 'Nenhum pipeline conectado neste recorte',
    'en-US': 'No connected pipeline in this view',
  },
  'grafo.emptyConnectedDesc': {
    'pt-BR':
      'Os recursos deste recorte não têm vínculos entre si. Veja a lista de recursos sem conexão abaixo ou use "Mostrar no diagrama".',
    'en-US':
      'The resources in this view have no links between them. See the unlinked resources list below or use "Show on diagram".',
  },
  // Detalhe humano do nó.
  'grafo.detailUpdated': { 'pt-BR': 'Última atualização', 'en-US': 'Last update' },
  'grafo.detailCurrent': { 'pt-BR': 'Atual', 'en-US': 'Current' },
  'grafo.detailOutdated': { 'pt-BR': 'Desatualizado', 'en-US': 'Outdated' },
  'grafo.detailLastEvent': { 'pt-BR': 'Último evento:', 'en-US': 'Last event:' },
  'grafo.detailRestriction': { 'pt-BR': 'Restrição', 'en-US': 'Restriction' },
  'grafo.detailNoRestriction': { 'pt-BR': 'Sem restrição', 'en-US': 'No restriction' },
  'grafo.detailFedBy': { 'pt-BR': 'Alimentado por', 'en-US': 'Fed by' },
  'grafo.detailAffects': { 'pt-BR': 'Afeta', 'en-US': 'Affects' },
  'grafo.detailNoUpstream': {
    'pt-BR': 'Nada alimenta este recurso neste recorte.',
    'en-US': 'Nothing feeds this resource in this view.',
  },
  'grafo.detailNoDownstream': {
    'pt-BR': 'Não afeta nada neste recorte.',
    'en-US': 'Affects nothing in this view.',
  },
  'grafo.detailUnknownNode': {
    'pt-BR': '(recurso fora deste recorte)',
    'en-US': '(resource outside this view)',
  },
  'grafo.detailVia': { 'pt-BR': 'via', 'en-US': 'via' },
  'grafo.detailTech': { 'pt-BR': 'Detalhes técnicos', 'en-US': 'Technical details' },
  'grafo.detailTechType': { 'pt-BR': 'Tipo técnico', 'en-US': 'Technical type' },
  'grafo.detailTechId': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  // Proveniência de coluna — agora drill-down dentro de Eventos.
  'grafo.colunaSectionTitle': {
    'pt-BR': 'Proveniência de coluna',
    'en-US': 'Column provenance',
  },

  // ─── #11 — clareza/a11y do Mapa (tooltips + descrição dos sinais) ──────
  // Descrição do sinal de DECISÃO de cada eixo da legenda (title + aria).
  'grafo.legendDescGeneral': {
    'pt-BR': 'Colore cada nó pelo tipo de recurso (dados, ação, IA, painel, modelo).',
    'en-US': 'Colors each node by resource type (data, action, AI, panel, model).',
  },
  'grafo.legendDescPermissions': {
    'pt-BR': 'Colore por restrição de acesso: destaca o que tem marcação.',
    'en-US': 'Colors by access restriction: highlights what carries a marking.',
  },
  'grafo.legendDescUsage': {
    'pt-BR': 'Colore por frescor: destaca recursos com revisão mais nova disponível.',
    'en-US': 'Colors by freshness: highlights resources with a newer revision.',
  },
  'grafo.legendDescOrganization': {
    'pt-BR': 'Colore pela Operação / Espaço dono do recurso.',
    'en-US': 'Colors by the Operation / Space that owns the resource.',
  },
  // Tooltip curto por swatch — o "porquê" da cor, não só o rótulo.
  'grafo.swatchTitleDataAsset': {
    'pt-BR': 'Dados = conjunto de dados versionado',
    'en-US': 'Data = versioned dataset',
  },
  'grafo.swatchTitleActionType': {
    'pt-BR': 'Ação = operação que transforma recursos',
    'en-US': 'Action = operation that transforms resources',
  },
  'grafo.swatchTitleLogicFunction': {
    'pt-BR': 'IA = função de lógica/IA',
    'en-US': 'AI = logic/AI function',
  },
  'grafo.swatchTitleOntologyNode': {
    'pt-BR': 'Ontologia = objeto do modelo de dados',
    'en-US': 'Ontology = object in the data model',
  },
  'grafo.swatchTitleWorkspace': {
    'pt-BR': 'Painel = aplicação/Sala que consome dados',
    'en-US': 'Panel = application/Room that consumes data',
  },
  'grafo.swatchTitleLanguageModel': {
    'pt-BR': 'Modelo = modelo de linguagem auditado',
    'en-US': 'Model = audited language model',
  },
  'grafo.swatchTitleMarked': {
    'pt-BR': 'Restrito = tem marcação de acesso',
    'en-US': 'Restricted = has an access marking',
  },
  'grafo.swatchTitleUnmarked': {
    'pt-BR': 'Sem restrição = nenhuma marcação de acesso',
    'en-US': 'No restriction = no access marking',
  },
  'grafo.swatchTitleOutdated': {
    'pt-BR': 'Desatualizado = existe revisão mais nova',
    'en-US': 'Outdated = a newer revision exists',
  },
  'grafo.swatchTitleCurrent': {
    'pt-BR': 'Atual = versão mais recente',
    'en-US': 'Current = latest version',
  },
  'grafo.swatchTitleByProject': {
    'pt-BR': 'Cada cor é uma Operação / Espaço dono do recurso',
    'en-US': 'Each color is an Operation / Space owning the resource',
  },
  'grafo.swatchTitleOrgUnassigned': {
    'pt-BR': 'Sem Operação = recurso fora de qualquer Operação',
    'en-US': 'No Operation = resource outside any Operation',
  },
  // Fold por tipo — aria-label do botão mostrar/ocultar.
  'grafo.foldHide': { 'pt-BR': 'Ocultar tipo', 'en-US': 'Hide type' },
  'grafo.foldShow': { 'pt-BR': 'Mostrar tipo', 'en-US': 'Show type' },
  // Caption do canvas — liga a legenda ao diagrama.
  'grafo.colorCaptionPrefix': { 'pt-BR': 'Cor =', 'en-US': 'Color =' },
  // Tooltip do selo de frescor — esclarece que mede revisões, não recência.
  'grafo.freshnessHint': {
    'pt-BR':
      'Frescor mede o número de revisões (vN), não a data. v2+ indica que existe revisão mais nova.',
    'en-US':
      'Freshness counts revisions (vN), not recency. v2+ means a newer revision exists.',
  },
  // Sufixo humano do title de cada chip de marcação.
  'grafo.markingTitleSuffix': {
    'pt-BR': 'marcação de acesso — controla quem pode ver este recurso',
    'en-US': 'access marking — controls who can see this resource',
  },

  // ─── Guests / Convidados page ────────────────────────────────────────
  'guests.title': { 'pt-BR': 'Convidados', 'en-US': 'Guests' },
  'guests.subtitle': {
    'pt-BR':
      'Lista os Convidados da Organização ativa. Cada Convidado é um Usuário cuja Organização de origem é outra, mas recebeu acesso temporário/permanente a esta.',
    'en-US':
      'Lists Guests of the active Organization. A Guest is a User whose home Organization is different, but who has been granted temporary or permanent access here.',
  },
  'guests.invite': { 'pt-BR': 'Convidar', 'en-US': 'Invite' },
  'guests.cancelInvite': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'guests.userId': {
    'pt-BR': 'ID do Usuário (UUID)',
    'en-US': 'User ID (UUID)',
  },
  'guests.expiresAt': {
    'pt-BR': 'Expira em (opcional)',
    'en-US': 'Expires at (optional)',
  },
  'guests.submit': { 'pt-BR': 'Convidar', 'en-US': 'Invite' },
  'guests.submitBusy': {
    'pt-BR': 'Convidando…',
    'en-US': 'Inviting…',
  },
  'guests.filterPlaceholder': {
    'pt-BR': 'Filtrar por user_id…',
    'en-US': 'Filter by user_id…',
  },
  'guests.includeRevoked': {
    'pt-BR': 'incluir revogados',
    'en-US': 'include revoked',
  },
  'guests.errorTitle': {
    'pt-BR': 'Falha ao carregar Convidados',
    'en-US': 'Failed to load Guests',
  },
  'guests.empty': {
    'pt-BR': 'Nenhum Convidado nesta Organização. Use o botão "Convidar".',
    'en-US': 'No Guests in this Organization. Use the "Invite" button.',
  },
  'guests.invitedAt': { 'pt-BR': 'Convidado em', 'en-US': 'Invited on' },
  'guests.expiresAtLabel': { 'pt-BR': 'expira em', 'en-US': 'expires on' },
  'guests.revoke': { 'pt-BR': 'Revogar Convidado', 'en-US': 'Revoke Guest' },
  'guests.confirmRevokeTitle': {
    'pt-BR': 'Revogar este Convidado?',
    'en-US': 'Revoke this Guest?',
  },
  'guests.confirmRevokeDesc': {
    'pt-BR':
      'O usuário perde acesso a esta Organização. A revogação é registrada em audit (LineageEvent) e pode ser revertida criando um novo convite.',
    'en-US':
      'The user loses access to this Organization. The revocation is audited (LineageEvent) and reversible by issuing a new invite.',
  },
  'guests.confirmRevokeLabel': { 'pt-BR': 'Revogar', 'en-US': 'Revoke' },

  // ─── Grupos page (Onda L.6 · IAM Groups) ─────────────────────────────
  'groups.title': { 'pt-BR': 'Grupos', 'en-US': 'Groups' },
  'groups.subtitle': {
    'pt-BR':
      'Grupos reúnem Usuários para conceder acesso de uma vez. Use grupos em elegibilidade de Marcações e na audiência de Comunicados e Tours, em vez de listar usuários um a um.',
    'en-US':
      'Groups gather Users so access can be granted at once. Use groups for Marking eligibility and for Comunicado and Tour audiences instead of listing users one by one.',
  },
  'groups.new': { 'pt-BR': 'Novo grupo', 'en-US': 'New group' },
  'groups.cancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'groups.name': { 'pt-BR': 'Nome do grupo', 'en-US': 'Group name' },
  'groups.description': { 'pt-BR': 'Descrição (opcional)', 'en-US': 'Description (optional)' },
  'groups.create': { 'pt-BR': 'Criar', 'en-US': 'Create' },
  'groups.creating': { 'pt-BR': 'Criando…', 'en-US': 'Creating…' },
  'groups.errorTitle': {
    'pt-BR': 'Falha ao carregar Grupos',
    'en-US': 'Failed to load Groups',
  },
  'groups.empty': {
    'pt-BR': 'Nenhum grupo nesta Organização. Use o botão "Novo grupo".',
    'en-US': 'No groups in this Organization. Use the "New group" button.',
  },
  'groups.memberCount': { 'pt-BR': 'membros', 'en-US': 'members' },
  'groups.manageMembers': { 'pt-BR': 'Gerenciar membros', 'en-US': 'Manage members' },
  'groups.delete': { 'pt-BR': 'Excluir grupo', 'en-US': 'Delete group' },
  'groups.rename': { 'pt-BR': 'Renomear', 'en-US': 'Rename' },
  'groups.save': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'groups.confirmDeleteTitle': {
    'pt-BR': 'Excluir este grupo?',
    'en-US': 'Delete this group?',
  },
  'groups.confirmDeleteDesc': {
    'pt-BR':
      'O grupo e suas associações são removidos. Elegibilidades de Marcação e audiências que usavam o grupo deixam de casar. A exclusão é registrada em audit (LineageEvent).',
    'en-US':
      'The group and its memberships are removed. Marking eligibilities and audiences that used the group stop matching. The deletion is audited (LineageEvent).',
  },
  'groups.confirmDeleteLabel': { 'pt-BR': 'Excluir', 'en-US': 'Delete' },
  'groups.membersTitle': { 'pt-BR': 'Membros do grupo', 'en-US': 'Group members' },
  'groups.addMember': { 'pt-BR': 'Adicionar membro', 'en-US': 'Add member' },
  'groups.selectUser': {
    'pt-BR': 'Selecione um usuário…',
    'en-US': 'Select a user…',
  },
  'groups.membersEmpty': {
    'pt-BR': 'Nenhum membro neste grupo ainda.',
    'en-US': 'No members in this group yet.',
  },
  'groups.removeMember': { 'pt-BR': 'Remover membro', 'en-US': 'Remove member' },
  'groups.allUsersInGroup': {
    'pt-BR': 'Todos os usuários já estão neste grupo.',
    'en-US': 'All users are already in this group.',
  },
  'groups.close': { 'pt-BR': 'Fechar', 'en-US': 'Close' },

  // ─── W6 — Grupo concede acesso (papéis + experiências) ───────────────
  'groups.manageAccess': { 'pt-BR': 'Acessos', 'en-US': 'Access' },
  'groups.accessTitle': { 'pt-BR': 'Acessos do grupo', 'en-US': 'Group access' },
  'groups.accessExperiencesLabel': {
    'pt-BR': 'Acessos por experiência',
    'en-US': 'Access by experience',
  },
  'groups.accessExperiencesHint': {
    'pt-BR': 'Ligue para conceder a experiência a todos os membros deste grupo.',
    'en-US': 'Turn on to grant the experience to every member of this group.',
  },
  'groups.accessAip': { 'pt-BR': 'AIP Chat', 'en-US': 'AIP Chat' },
  'groups.accessAipDesc': {
    'pt-BR': 'Conversas e threads do AIP.',
    'en-US': 'AIP conversations and threads.',
  },
  'groups.accessAgents': { 'pt-BR': 'Agentes', 'en-US': 'Agents' },
  'groups.accessAgentsDesc': {
    'pt-BR': 'Ver e operar a frota de agentes.',
    'en-US': 'View and operate the agent fleet.',
  },
  'groups.accessSolutions': {
    'pt-BR': 'Desenho da Operação',
    'en-US': 'Operation Design',
  },
  'groups.accessSolutionsDesc': {
    'pt-BR': 'Diagramas de solução e apps.',
    'en-US': 'Solution diagrams and apps.',
  },
  'groups.rolesLabel': { 'pt-BR': 'Papéis atribuídos', 'en-US': 'Assigned roles' },
  'groups.rolesHint': {
    'pt-BR': 'Conceda papéis adicionais ao grupo. Cada membro herda as permissões do papel.',
    'en-US': 'Grant additional roles to the group. Each member inherits the role permissions.',
  },
  'groups.rolesEmpty': {
    'pt-BR': 'Nenhum papel disponível.',
    'en-US': 'No roles available.',
  },
  'groups.systemRoleBadge': { 'pt-BR': 'padrão', 'en-US': 'default' },
  'groups.accessLoadError': {
    'pt-BR': 'Falha ao carregar acessos',
    'en-US': 'Failed to load access',
  },
  'groups.accessSaveError': {
    'pt-BR': 'Falha ao salvar acessos',
    'en-US': 'Failed to save access',
  },

  // ─── W6 — Autoria de IAM sem input técnico (papéis + permissões) ─────
  'iam.common.cancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'iam.common.create': { 'pt-BR': 'Criar', 'en-US': 'Create' },
  'iam.common.creating': { 'pt-BR': 'Criando…', 'en-US': 'Creating…' },
  'iam.common.failed': { 'pt-BR': 'falhou', 'en-US': 'failed' },
  'iam.roles.createButton': { 'pt-BR': 'Novo papel', 'en-US': 'New role' },
  'iam.roles.createTitle': { 'pt-BR': 'Criar papel', 'en-US': 'Create role' },
  'iam.roles.nameLabel': { 'pt-BR': 'Nome do papel', 'en-US': 'Role name' },
  'iam.roles.nameHint': {
    'pt-BR': 'O identificador técnico é gerado automaticamente a partir do nome.',
    'en-US': 'The technical identifier is generated automatically from the name.',
  },
  'iam.perms.createButton': { 'pt-BR': 'Nova permissão', 'en-US': 'New permission' },
  'iam.perms.createTitle': { 'pt-BR': 'Nova permissão', 'en-US': 'New permission' },
  'iam.perms.resourceLabel': { 'pt-BR': 'Recurso', 'en-US': 'Resource' },
  'iam.perms.actionLabel': { 'pt-BR': 'Ação', 'en-US': 'Action' },
  'iam.perms.selectResource': {
    'pt-BR': 'Selecione um recurso…',
    'en-US': 'Select a resource…',
  },
  'iam.perms.selectAction': {
    'pt-BR': 'Selecione uma ação…',
    'en-US': 'Select an action…',
  },
  'iam.perms.keyPreview': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  'iam.perms.keyPreviewEmpty': {
    'pt-BR': 'recurso.ação',
    'en-US': 'resource.action',
  },
  'iam.perms.descriptionLabel': { 'pt-BR': 'Descrição', 'en-US': 'Description' },

  // ─── W7 (GAP E) — dívida i18n dos painéis IAM (RolesPanel/PermissionsPanel) ──
  'iam.common.loadFailed': { 'pt-BR': 'Falha ao carregar', 'en-US': 'Failed to load' },
  'iam.common.loading': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  'iam.common.edit': { 'pt-BR': 'Editar', 'en-US': 'Edit' },
  'iam.common.close': { 'pt-BR': 'Fechar', 'en-US': 'Close' },
  'iam.common.delete': { 'pt-BR': 'Apagar', 'en-US': 'Delete' },
  'iam.common.system': { 'pt-BR': 'padrão', 'en-US': 'default' },
  'iam.common.colIdentifier': { 'pt-BR': 'Identificador', 'en-US': 'Identifier' },
  'iam.common.colType': { 'pt-BR': 'Tipo', 'en-US': 'Type' },
  // Papéis
  'iam.roles.title': { 'pt-BR': 'Papéis', 'en-US': 'Roles' },
  'iam.roles.colName': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'iam.roles.colPermissions': { 'pt-BR': 'Permissões', 'en-US': 'Permissions' },
  'iam.roles.colInherits': { 'pt-BR': 'Heranças', 'en-US': 'Inheritance' },
  'iam.roles.custom': { 'pt-BR': 'customizado', 'en-US': 'custom' },
  'iam.roles.editTitle': { 'pt-BR': 'Editar papel', 'en-US': 'Edit role' },
  'iam.roles.systemReadonly': {
    'pt-BR':
      'Papel padrão do sistema — somente leitura aqui. Para alterar, peça ao operador da plataforma.',
    'en-US':
      'System default role — read-only here. To change it, ask the platform operator.',
  },
  'iam.roles.displayNameLabel': { 'pt-BR': 'Nome de exibição', 'en-US': 'Display name' },
  'iam.roles.permissionsLabel': { 'pt-BR': 'Permissões', 'en-US': 'Permissions' },
  'iam.roles.inheritsFromLabel': { 'pt-BR': 'Herda de', 'en-US': 'Inherits from' },
  'iam.roles.deleteRole': { 'pt-BR': 'Apagar papel', 'en-US': 'Delete role' },
  // Permissões
  'iam.perms.title': { 'pt-BR': 'Permissões', 'en-US': 'Permissions' },
  'iam.perms.allResources': { 'pt-BR': 'todos os recursos', 'en-US': 'all resources' },
  'iam.perms.custom': { 'pt-BR': 'customizada', 'en-US': 'custom' },
  'iam.perms.confirmDelete': {
    'pt-BR': 'Apagar a permissão',
    'en-US': 'Delete permission',
  },

  // ─── W7 (GAP E) — fallbacks de erro da página Grupos ────────────────
  'groups.createError': { 'pt-BR': 'Falha ao criar grupo', 'en-US': 'Failed to create group' },
  'groups.deleteError': { 'pt-BR': 'Falha ao excluir grupo', 'en-US': 'Failed to delete group' },
  'groups.membersLoadError': {
    'pt-BR': 'Falha ao carregar membros',
    'en-US': 'Failed to load members',
  },
  'groups.memberAddError': {
    'pt-BR': 'Falha ao adicionar membro',
    'en-US': 'Failed to add member',
  },
  'groups.memberRemoveError': {
    'pt-BR': 'Falha ao remover membro',
    'en-US': 'Failed to remove member',
  },
  'groups.saveError': { 'pt-BR': 'Falha ao salvar', 'en-US': 'Failed to save' },

  // ─── Organizações page ───────────────────────────────────────────────
  'orgs.title': { 'pt-BR': 'Organizações', 'en-US': 'Organizations' },
  'orgs.subtitle': {
    'pt-BR':
      'Tenant primário de isolamento de acesso. Usuários pertencem a uma Organização de origem e podem ser convidados em outras.',
    'en-US':
      'Primary access-isolation tenant. Users belong to a home Organization and can be invited into others.',
  },
  'orgs.new': { 'pt-BR': 'Nova Organização', 'en-US': 'New Organization' },
  'orgs.empty': {
    'pt-BR': 'Nenhuma Organização visível para você.',
    'en-US': 'No Organizations visible to you.',
  },
  'orgs.errorLoad': {
    'pt-BR': 'Falha ao carregar Organizações',
    'en-US': 'Failed to load Organizations',
  },
  'orgs.noFeatures': { 'pt-BR': 'sem features ativas', 'en-US': 'no active features' },
  'orgs.createTitle': { 'pt-BR': 'Nova Organização', 'en-US': 'New Organization' },
  'orgs.editTitle': { 'pt-BR': 'Editar Organização', 'en-US': 'Edit Organization' },
  'orgs.createHint': {
    'pt-BR': 'Apenas admins podem criar Organizações. O slug é imutável.',
    'en-US': 'Only admins can create Organizations. The slug is immutable.',
  },
  'orgs.createSubmit': { 'pt-BR': 'Criar Organização', 'en-US': 'Create Organization' },
  'orgs.reactivateTitle': {
    'pt-BR': 'Reativar "{name}"?',
    'en-US': 'Reactivate "{name}"?',
  },
  'orgs.deactivateTitle': {
    'pt-BR': 'Desativar "{name}"?',
    'en-US': 'Deactivate "{name}"?',
  },
  'orgs.reactivateDesc': {
    'pt-BR':
      'A Organização voltará a aparecer em listagens e ficará disponível para novos vínculos.',
    'en-US':
      'The Organization will reappear in listings and become available for new bindings.',
  },
  'orgs.deactivateDesc': {
    'pt-BR':
      'A Organização fica oculta para novos fluxos mas todos os recursos vinculados permanecem (soft-delete). Reativável.',
    'en-US':
      'The Organization is hidden from new flows but all bound resources remain (soft-delete). Reactivatable.',
  },

  // ─── Espaços page ────────────────────────────────────────────────────
  'espacos.title': { 'pt-BR': 'Espaços', 'en-US': 'Spaces' },
  'espacos.subtitle': {
    'pt-BR':
      'Container de Operações sob ontologia comum, com acesso restrito a uma ou mais Organizações.',
    'en-US':
      'Container of Operations under a common ontology, with access restricted to one or more Organizations.',
  },
  'espacos.new': { 'pt-BR': 'Novo Espaço', 'en-US': 'New Space' },
  'espacos.newHeader': { 'pt-BR': 'Novo Espaço', 'en-US': 'New Space' },
  'espacos.descPlaceholder': {
    'pt-BR': 'Para que serve este Espaço',
    'en-US': 'What this Space is for',
  },
  'espacos.createSubmit': { 'pt-BR': 'Criar Espaço', 'en-US': 'Create Space' },
  'espacos.errorLoad': { 'pt-BR': 'Falha ao carregar Espaços', 'en-US': 'Failed to load Spaces' },
  'espacos.empty': {
    'pt-BR': 'Nenhum Espaço criado ainda. Use o botão "Novo Espaço" para começar.',
    'en-US': 'No Spaces created yet. Use the "New Space" button to get started.',
  },
  'espacos.editTitle': { 'pt-BR': 'Editar Espaço', 'en-US': 'Edit Space' },
  'espacos.slugImmutable': {
    'pt-BR': 'Identificador imutável para preservar referências históricas.',
    'en-US': 'Immutable identifier to preserve historical references.',
  },
  'espacos.deactivateTitle': {
    'pt-BR': 'Desativar Espaço "{name}"?',
    'en-US': 'Deactivate Space "{name}"?',
  },
  'espacos.deactivateDesc': {
    'pt-BR':
      'Operações vinculadas continuam funcionando mas o Espaço fica oculto em listagens novas. Pode ser reativado.',
    'en-US':
      'Bound Operations keep working but the Space is hidden from new listings. It can be reactivated.',
  },
  'espacos.orgMembers': {
    'pt-BR': '{n} {orgWord} {memberWord}',
    'en-US': '{n} {orgWord} as member{memberWord}',
  },

  // ─── Operações page ──────────────────────────────────────────────────
  'operacoes.title': { 'pt-BR': 'Operações', 'en-US': 'Operations' },
  'operacoes.subtitle': {
    'pt-BR':
      'Container de segurança e governança. Configure restrições de Marcações e o teto de Classificação por Operação.',
    'en-US':
      'Security and governance container. Configure Marking constraints and the Classification ceiling per Operation.',
  },
  'operacoes.new': { 'pt-BR': 'Nova Operação', 'en-US': 'New Operation' },
  'operacoes.errorLoad': {
    'pt-BR': 'Falha ao carregar Operações',
    'en-US': 'Failed to load Operations',
  },
  'operacoes.includeInactive': { 'pt-BR': 'incluir inativas', 'en-US': 'include inactive' },
  'operacoes.emptyTitle': {
    'pt-BR': 'Nenhuma Operação criada ainda',
    'en-US': 'No Operation created yet',
  },
  'operacoes.emptyDesc': {
    'pt-BR':
      'Operações agrupam membros, restrições de Marcação e teto de Classificação. Comece criando a primeira.',
    'en-US':
      'Operations group members, Marking constraints and the Classification ceiling. Start by creating the first one.',
  },
  'operacoes.emptyCta': {
    'pt-BR': 'Criar primeira Operação',
    'en-US': 'Create first Operation',
  },
  'operacoes.restricoes': { 'pt-BR': 'Restrições', 'en-US': 'Constraints' },
  'operacoes.salasCount': { 'pt-BR': '{n} sala{plural}', 'en-US': '{n} room{plural}' },
  'operacoes.deactivateTitle': {
    'pt-BR': 'Desativar "{name}"?',
    'en-US': 'Deactivate "{name}"?',
  },
  'operacoes.deactivateDesc': {
    'pt-BR':
      'A Operação fica oculta para novos fluxos mas pode ser reativada. Membros existentes permanecem.',
    'en-US':
      'The Operation is hidden from new flows but can be reactivated. Existing members remain.',
  },
  'operacoes.createTitle': { 'pt-BR': 'Nova Operação', 'en-US': 'New Operation' },
  'operacoes.createSubmit': { 'pt-BR': 'Criar Operação', 'en-US': 'Create Operation' },
  'operacoes.editSlugHint': {
    'pt-BR':
      'Identificador (slug) não pode ser alterado depois da criação para preservar referências históricas (mesma regra de Marcação).',
    'en-US':
      'Identifier (slug) cannot be changed after creation to preserve historical references (same rule as Markings).',
  },
  'operacoes.constraintsTitle': {
    'pt-BR': 'Restrições · {name}',
    'en-US': 'Constraints · {name}',
  },
  'operacoes.modeLabel': { 'pt-BR': 'Modo', 'en-US': 'Mode' },
  'operacoes.modeNone': { 'pt-BR': 'Sem restrição', 'en-US': 'No constraint' },
  'operacoes.modeAllowed': {
    'pt-BR': 'Permitidas (whitelist)',
    'en-US': 'Allowed (whitelist)',
  },
  'operacoes.modeProhibited': {
    'pt-BR': 'Proibidas (blacklist)',
    'en-US': 'Prohibited (blacklist)',
  },
  'operacoes.markingsLabel': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'operacoes.markingsEmpty': {
    'pt-BR': 'Nenhuma Marcação no vocabulário ainda. Crie em "Marcações" do Painel.',
    'en-US': 'No Markings in the vocabulary yet. Create them under "Markings" in the Panel.',
  },
  'operacoes.ceilingLabel': {
    'pt-BR': 'Teto de Classificação (opcional)',
    'en-US': 'Classification ceiling (optional)',
  },
  'operacoes.ceilingNone': { 'pt-BR': '— sem teto —', 'en-US': '— no ceiling —' },
  'operacoes.saveConstraints': { 'pt-BR': 'Salvar Restrições', 'en-US': 'Save Constraints' },
  'operacoes.revalidate': {
    'pt-BR': 'Revalidar marcações',
    'en-US': 'Re-check markings',
  },
  'operacoes.revalidateHint': {
    'pt-BR': 'Verifica as marcações já aplicadas contra as restrições atuais. Apenas relata — nada é removido.',
    'en-US': 'Checks already-applied markings against the current constraints. Reports only — nothing is removed.',
  },
  'operacoes.revalidateRunning': { 'pt-BR': 'Verificando…', 'en-US': 'Checking…' },
  'operacoes.revalidateClean': {
    'pt-BR': 'Nenhuma violação. {n} marcação(ões) verificada(s).',
    'en-US': 'No violations. {n} marking(s) checked.',
  },
  'operacoes.revalidateSummary': {
    'pt-BR': '{v} violação(ões) em {n} marcação(ões) verificada(s):',
    'en-US': '{v} violation(s) across {n} marking(s) checked:',
  },
  'operacoes.violationNotAllowed': {
    'pt-BR': 'fora da lista permitida',
    'en-US': 'not in allowed list',
  },
  'operacoes.violationProhibited': { 'pt-BR': 'proibida', 'en-US': 'prohibited' },
  'operacoes.violationOnProject': { 'pt-BR': 'na Operação', 'en-US': 'on the Operation' },
  'operacoes.violationOnAsset': { 'pt-BR': 'em ativo de dados', 'en-US': 'on data asset' },

  // ─── Marcações page ──────────────────────────────────────────────────
  'marcacoes.title': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  // LOTE1 ELO PAGES (#7): "Marcações" virou aba do hub Dados, com sub-navegação
  // local Vocabulário / Por propriedade (reusa as duas telas embutidas).
  'dados.marcacoes.tab': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'dados.marcacoes.subnavAria': { 'pt-BR': 'Visão de Marcações', 'en-US': 'Markings view' },
  'dados.marcacoes.vocabulario': { 'pt-BR': 'Vocabulário', 'en-US': 'Vocabulary' },
  'dados.marcacoes.porPropriedade': { 'pt-BR': 'Por propriedade', 'en-US': 'By property' },
  'marcacoes.subtitle': {
    'pt-BR':
      'Vocabulário aberto de controle de acesso mandatório. Categorias agrupam Marcações e definem a lógica de avaliação (conjuntiva por padrão; disjuntiva para releasability).',
    'en-US':
      'Open vocabulary for mandatory access control. Categories group Markings and define the evaluation logic (conjunctive by default; disjunctive for releasability).',
  },
  'marcacoes.categories': { 'pt-BR': 'Categorias', 'en-US': 'Categories' },
  'marcacoes.new': { 'pt-BR': 'Nova Marcação', 'en-US': 'New Marking' },
  'marcacoes.errorLoad': {
    'pt-BR': 'Falha ao carregar Marcações',
    'en-US': 'Failed to load Markings',
  },
  'marcacoes.includeArchived': { 'pt-BR': 'incluir arquivadas', 'en-US': 'include archived' },
  'marcacoes.categoryOptional': { 'pt-BR': 'Categoria (opcional)', 'en-US': 'Category (optional)' },
  'marcacoes.noCategoryOption': { 'pt-BR': '— sem categoria —', 'en-US': '— no category —' },
  'marcacoes.createSubmit': { 'pt-BR': 'Criar Marcação', 'en-US': 'Create Marking' },
  'marcacoes.emptyTitle': {
    'pt-BR': 'Nenhuma Marcação criada ainda',
    'en-US': 'No Marking created yet',
  },
  'marcacoes.emptyDesc': {
    'pt-BR':
      'Marcações são o vocabulário aberto que controla acesso mandatório. Comece criando categorias (ex: Sensibilidade) e marcações específicas (PII, Caso-Aurora).',
    'en-US':
      'Markings are the open vocabulary controlling mandatory access. Start by creating categories (e.g. Sensitivity) and specific markings (PII, Case-Aurora).',
  },
  'marcacoes.emptyCta': {
    'pt-BR': 'Criar primeira Marcação',
    'en-US': 'Create first Marking',
  },
  'marcacoes.emptyCats': { 'pt-BR': 'Gerenciar Categorias', 'en-US': 'Manage Categories' },
  'marcacoes.noCategory': { 'pt-BR': 'sem categoria', 'en-US': 'no category' },
  'marcacoes.categoryPrefix': { 'pt-BR': 'categoria:', 'en-US': 'category:' },
  'marcacoes.archivedBadge': { 'pt-BR': 'arquivada', 'en-US': 'archived' },
  'marcacoes.usageBadge': { 'pt-BR': '{n} uso{plural}', 'en-US': '{n} use{plural}' },
  'marcacoes.editTitle': { 'pt-BR': 'Editar · {name}', 'en-US': 'Edit · {name}' },
  'marcacoes.editSlugHint': {
    'pt-BR':
      'Identificador (slug) não pode ser alterado depois da criação para preservar referências históricas.',
    'en-US':
      'Identifier (slug) cannot be changed after creation to preserve historical references.',
  },
  'marcacoes.categoryLabel': { 'pt-BR': 'Categoria', 'en-US': 'Category' },
  'marcacoes.archiveTitle': {
    'pt-BR': 'Arquivar "{name}"?',
    'en-US': 'Archive "{name}"?',
  },
  'marcacoes.archiveDesc': {
    'pt-BR':
      'A marcação fica oculta para novos usos mas pode ser restaurada a qualquer momento. As aplicações já existentes permanecem.',
    'en-US':
      'The marking is hidden from new uses but can be restored at any time. Existing applications remain.',
  },
  'marcacoes.deleteTitle': {
    'pt-BR': 'Deletar "{name}"?',
    'en-US': 'Delete "{name}"?',
  },
  'marcacoes.deleteDesc': {
    'pt-BR':
      'A marcação será removida permanentemente. Esta ação não pode ser desfeita. Para preservar histórico, prefira arquivar.',
    'en-US':
      'The marking will be permanently removed. This action cannot be undone. To preserve history, prefer archiving.',
  },
  'marcacoes.deleteConfirmLabel': {
    'pt-BR': 'Deletar permanentemente',
    'en-US': 'Delete permanently',
  },
  'marcacoes.deleteBlockedTitle': {
    'pt-BR': 'Deletar bloqueado — aplicada em {n} recurso(s). Use arquivar.',
    'en-US': 'Delete blocked — applied to {n} resource(s). Use archive instead.',
  },
  'marcacoes.deleteTitleHint': { 'pt-BR': 'Deletar (permanente)', 'en-US': 'Delete (permanent)' },
  'marcacoes.archiveTitleHint': { 'pt-BR': 'Arquivar (reversível)', 'en-US': 'Archive (reversible)' },
  // Categories dialog
  'marcacoes.catsTitle': { 'pt-BR': 'Categorias de Marcação', 'en-US': 'Marking Categories' },
  'marcacoes.catsNew': { 'pt-BR': 'Nova', 'en-US': 'New' },
  'marcacoes.catsModeLabel': { 'pt-BR': 'Modo de avaliação', 'en-US': 'Evaluation mode' },
  'marcacoes.catsModeConjunctive': {
    'pt-BR': 'E — todas as marcações são exigidas',
    'en-US': 'AND — all markings are required',
  },
  'marcacoes.catsModeDisjunctive': {
    'pt-BR': 'OU — basta uma das marcações',
    'en-US': 'OR — any one marking suffices',
  },
  'marcacoes.catsCreateSubmit': { 'pt-BR': 'Criar Categoria', 'en-US': 'Create Category' },
  'marcacoes.catsErrorLoad': {
    'pt-BR': 'Falha ao carregar Categorias',
    'en-US': 'Failed to load Categories',
  },
  'marcacoes.catsEmpty': {
    'pt-BR': 'Nenhuma Categoria criada. Use o botão "Nova" no canto superior direito.',
    'en-US': 'No Category created. Use the "New" button in the top-right corner.',
  },

  // ─── Marcações · Elegibilidade (Onda R.1) ────────────────────────────
  'marcacoes.eligibility.open': { 'pt-BR': 'Elegibilidade', 'en-US': 'Eligibility' },
  'marcacoes.eligibility.title': {
    'pt-BR': 'Elegibilidade · {name}',
    'en-US': 'Eligibility · {name}',
  },
  'marcacoes.eligibility.intro': {
    'pt-BR':
      'Defina quem é elegível a esta marcação. Usuários e Grupos elegíveis podem ver recursos marcados; marque "pode aplicar" para também conceder a aplicação da marcação.',
    'en-US':
      'Define who is eligible for this marking. Eligible Users and Groups can see marked resources; check "can apply" to also grant applying the marking.',
  },
  'marcacoes.eligibility.subjectKind': { 'pt-BR': 'Tipo', 'en-US': 'Subject' },
  'marcacoes.eligibility.kindUser': { 'pt-BR': 'Usuário', 'en-US': 'User' },
  'marcacoes.eligibility.kindGroup': { 'pt-BR': 'Grupo', 'en-US': 'Group' },
  'marcacoes.eligibility.selectUser': {
    'pt-BR': 'Selecione um usuário…',
    'en-US': 'Select a user…',
  },
  'marcacoes.eligibility.selectGroup': {
    'pt-BR': 'Selecione um grupo…',
    'en-US': 'Select a group…',
  },
  'marcacoes.eligibility.allUsersEligible': {
    'pt-BR': 'todos os usuários já elegíveis',
    'en-US': 'all users already eligible',
  },
  'marcacoes.eligibility.allGroupsEligible': {
    'pt-BR': 'todos os grupos já elegíveis',
    'en-US': 'all groups already eligible',
  },
  'marcacoes.eligibility.canApply': { 'pt-BR': 'pode aplicar', 'en-US': 'can apply' },
  'marcacoes.eligibility.grant': { 'pt-BR': 'Conceder', 'en-US': 'Grant' },
  'marcacoes.eligibility.granting': { 'pt-BR': 'Concedendo…', 'en-US': 'Granting…' },
  'marcacoes.eligibility.empty': {
    'pt-BR': 'Ninguém é elegível a esta marcação ainda.',
    'en-US': 'No one is eligible for this marking yet.',
  },
  'marcacoes.eligibility.usersHeader': { 'pt-BR': 'Usuários', 'en-US': 'Users' },
  'marcacoes.eligibility.groupsHeader': { 'pt-BR': 'Grupos', 'en-US': 'Groups' },
  'marcacoes.eligibility.canApplyBadge': { 'pt-BR': 'pode aplicar', 'en-US': 'can apply' },
  'marcacoes.eligibility.unknownSubject': { 'pt-BR': '(desconhecido)', 'en-US': '(unknown)' },
  'marcacoes.eligibility.remove': { 'pt-BR': 'Remover elegibilidade', 'en-US': 'Remove eligibility' },
  'marcacoes.eligibility.errorLoad': {
    'pt-BR': 'Falha ao carregar elegibilidade',
    'en-US': 'Failed to load eligibility',
  },

  // ─── Tours page ──────────────────────────────────────────────────────
  'tours.title': { 'pt-BR': 'Tours', 'en-US': 'Tours' },
  'tours.subtitle': {
    'pt-BR':
      'Passo-a-passo guiados anexados a Salas. Aparecem para operadores ao entrar na Sala, na primeira visita após a data configurada — até que dismiss ou conclusão.',
    'en-US':
      'Guided walkthroughs attached to Rooms. They appear to operators on entering the Room, on the first visit after the configured date — until dismissed or completed.',
  },
  'tours.new': { 'pt-BR': 'Novo Tour', 'en-US': 'New Tour' },
  'tours.salaHeader': { 'pt-BR': 'Sala', 'en-US': 'Room' },
  'tours.chooseSala': { 'pt-BR': '— escolha uma Sala —', 'en-US': '— choose a Room —' },
  'tours.includeArchived': { 'pt-BR': 'incluir arquivados', 'en-US': 'include archived' },
  'tours.errorLoadSalas': { 'pt-BR': 'Falha ao carregar Salas', 'en-US': 'Failed to load Rooms' },
  'tours.errorLoad': { 'pt-BR': 'Falha ao carregar Tours', 'en-US': 'Failed to load Tours' },
  'tours.emptyActive': {
    'pt-BR': 'Nenhum Tour ativo nessa Sala.',
    'en-US': 'No active Tour in this Room.',
  },
  'tours.emptyAll': {
    'pt-BR': 'Nenhum Tour (ativos ou arquivados) nessa Sala.',
    'en-US': 'No Tour (active or archived) in this Room.',
  },
  'tours.statusDraft': { 'pt-BR': 'Em rascunho', 'en-US': 'Draft' },
  'tours.statusActive': { 'pt-BR': 'Ativo', 'en-US': 'Active' },
  'tours.statusArchived': { 'pt-BR': 'Arquivado', 'en-US': 'Archived' },
  'tours.viewCounts': {
    'pt-BR': '{viewed} / {total} operadores viram',
    'en-US': '{viewed} / {total} operators viewed',
  },
  'tours.preview': { 'pt-BR': 'Pré-visualizar', 'en-US': 'Preview' },
  'tours.archiveTitle': { 'pt-BR': 'Arquivar "{name}"?', 'en-US': 'Archive "{name}"?' },
  'tours.archiveDesc': {
    'pt-BR':
      'O Tour fica oculto para operadores que ainda não viram, mas permanece em "incluir arquivados". Reversível.',
    'en-US':
      'The Tour is hidden from operators who have not seen it yet, but remains under "include archived". Reversible.',
  },
  'tours.deleteTitle': { 'pt-BR': 'Deletar Tour "{name}"?', 'en-US': 'Delete Tour "{name}"?' },
  'tours.deleteDesc': {
    'pt-BR':
      'Esta ação é IRREVERSÍVEL. Pages do Tour + registros de visualização (quem viu) serão deletados em cascata.',
    'en-US':
      'This action is IRREVERSIBLE. The Tour pages + view records (who saw it) will be deleted in cascade.',
  },
  'tours.deleteConfirmLabel': {
    'pt-BR': 'Deletar permanentemente',
    'en-US': 'Delete permanently',
  },
  'tours.whoSawTitle': { 'pt-BR': 'Quem viu · {name}', 'en-US': 'Who viewed · {name}' },
  'tours.eligibleEmpty': { 'pt-BR': 'Nenhum operador elegível.', 'en-US': 'No eligible operator.' },
  'tours.viewedOn': { 'pt-BR': 'viu em {date}', 'en-US': 'viewed on {date}' },
  'tours.viewedBadge': { 'pt-BR': 'Viu', 'en-US': 'Viewed' },
  'tours.pendingBadge': { 'pt-BR': 'Pendente', 'en-US': 'Pending' },
  'tours.editTitle': { 'pt-BR': 'Editar · {name}', 'en-US': 'Edit · {name}' },
  'tours.testNow': { 'pt-BR': 'Testar agora', 'en-US': 'Test now' },
  'tours.stepPages': { 'pt-BR': 'Páginas', 'en-US': 'Pages' },
  'tours.stepContent': { 'pt-BR': 'Conteúdo', 'en-US': 'Content' },
  'tours.stepTrigger': { 'pt-BR': 'Trigger', 'en-US': 'Trigger' },
  'tours.titleLabel': { 'pt-BR': 'Título do Tour', 'en-US': 'Tour title' },
  'tours.summaryLabel': { 'pt-BR': 'Resumo (opcional)', 'en-US': 'Summary (optional)' },
  'tours.pagesHeader': { 'pt-BR': 'Páginas do Tour', 'en-US': 'Tour pages' },
  'tours.addPage': { 'pt-BR': 'Adicionar página', 'en-US': 'Add page' },
  'tours.contentHint': {
    'pt-BR':
      'Refine o texto de cada slide. Markdown leve aceito (linhas, **negrito**). Para customizar mídia/documentação ou selector CSS de spotlight, volte ao passo Páginas.',
    'en-US':
      'Refine the text of each slide. Light Markdown accepted (lines, **bold**). To customize media/docs or the spotlight CSS selector, go back to the Pages step.',
  },
  'tours.contentEmpty': {
    'pt-BR': 'Adicione ao menos uma página no passo anterior.',
    'en-US': 'Add at least one page in the previous step.',
  },
  'tours.slideLabel': { 'pt-BR': 'Slide {n} · {title}', 'en-US': 'Slide {n} · {title}' },
  'tours.slideTextPlaceholder': {
    'pt-BR': 'Texto do slide (markdown leve)',
    'en-US': 'Slide text (light markdown)',
  },
  'tours.pageLabel': { 'pt-BR': 'Página {n}', 'en-US': 'Page {n}' },
  'tours.pageTitlePlaceholder': { 'pt-BR': 'Título *', 'en-US': 'Title *' },
  'tours.pageDescPlaceholder': { 'pt-BR': 'Descrição', 'en-US': 'Description' },
  'tours.pageMediaPlaceholder': {
    'pt-BR': 'URL de mídia (opcional)',
    'en-US': 'Media URL (optional)',
  },
  'tours.pageDocPlaceholder': {
    'pt-BR': 'URL de documentação (opcional)',
    'en-US': 'Documentation URL (optional)',
  },
  'tours.pageTargetPlaceholder': {
    'pt-BR': 'Selector CSS para spotlight (ex: [data-testid="sidenav"])',
    'en-US': 'CSS selector for spotlight (e.g. [data-testid="sidenav"])',
  },
  'tours.removePage': { 'pt-BR': 'Remover página', 'en-US': 'Remove page' },
  'tours.whenHeader': { 'pt-BR': 'Quando aparecer', 'en-US': 'When to appear' },
  'tours.startDate': { 'pt-BR': 'Data de início', 'en-US': 'Start date' },
  'tours.endDate': { 'pt-BR': 'Data de término', 'en-US': 'End date' },
  'tours.targetPagesLabel': {
    'pt-BR': 'Páginas onde o tour deve aparecer (uma por linha)',
    'en-US': 'Pages where the tour should appear (one per line)',
  },
  'tours.targetPagesHint': {
    'pt-BR': 'Vazio = aparece em qualquer página da Sala (primeira visita).',
    'en-US': 'Empty = appears on any page of the Room (first visit).',
  },
  'tours.audienceHeader': { 'pt-BR': 'Para quem aparecer', 'en-US': 'Who it appears to' },
  'tours.audienceLabel': { 'pt-BR': 'Audience (role/group)', 'en-US': 'Audience (role/group)' },
  'tours.audienceAll': {
    'pt-BR': 'Todos os operadores elegíveis',
    'en-US': 'All eligible operators',
  },
  'tours.audienceFiltered': {
    'pt-BR': 'Filtrar por role ou grupo',
    'en-US': 'Filter by role or group',
  },
  'tours.rolesLabel': {
    'pt-BR': 'Roles (separadas por vírgula)',
    'en-US': 'Roles (comma-separated)',
  },
  'tours.groupsLabel': {
    'pt-BR': 'Grupos (separados por vírgula)',
    'en-US': 'Groups (comma-separated)',
  },
  'tours.audienceHint': {
    'pt-BR': 'Selecione "Filtrar por role ou grupo" para ativar audience.',
    'en-US': 'Select "Filter by role or group" to enable audience.',
  },
  'tours.prev': { 'pt-BR': 'Anterior', 'en-US': 'Previous' },
  'tours.next': { 'pt-BR': 'Próximo', 'en-US': 'Next' },
  'tours.saveChanges': { 'pt-BR': 'Salvar alterações', 'en-US': 'Save changes' },
  'tours.createSubmit': { 'pt-BR': 'Criar Tour', 'en-US': 'Create Tour' },
  'tours.errSaveTitle': {
    'pt-BR': 'Adicione um título antes de salvar.',
    'en-US': 'Add a title before saving.',
  },
  'tours.errSavePage': {
    'pt-BR': 'Adicione ao menos uma página com título.',
    'en-US': 'Add at least one page with a title.',
  },
  'tours.noTitleFallback': { 'pt-BR': '(sem título)', 'en-US': '(untitled)' },
  // Visibility descriptions
  'tours.visFromTo': {
    'pt-BR': 'Aparece {scope} de {start} a {end}',
    'en-US': 'Appears {scope} from {start} to {end}',
  },
  'tours.visFrom': {
    'pt-BR': 'Aparece {scope} a partir de {start}',
    'en-US': 'Appears {scope} from {start}',
  },
  'tours.visTo': { 'pt-BR': 'Aparece {scope} até {end}', 'en-US': 'Appears {scope} until {end}' },
  'tours.visUntilDismiss': {
    'pt-BR': 'Aparece {scope} até dismiss',
    'en-US': 'Appears {scope} until dismissed',
  },
  'tours.visScopeTargets': { 'pt-BR': 'em {pages}', 'en-US': 'in {pages}' },
  'tours.visScopeRoom': {
    'pt-BR': 'em /sala/{slug} (primeira visita)',
    'en-US': 'in /sala/{slug} (first visit)',
  },

  // ─── Salas page ──────────────────────────────────────────────────────
  'salas.title': { 'pt-BR': 'Salas', 'en-US': 'Rooms' },
  'salas.subtitle': {
    'pt-BR':
      'Containers operacionais customizados (Sala de Situação). Cada Save publica imediatamente uma nova versão imutável.',
    'en-US':
      'Custom operational containers (Situation Room). Each Save immediately publishes a new immutable version.',
  },
  'salas.new': { 'pt-BR': 'Nova Sala', 'en-US': 'New Room' },
  'salas.newHeader': { 'pt-BR': 'Nova Sala', 'en-US': 'New Room' },
  'salas.slugPlaceholder': { 'pt-BR': 'ex: sala-aurora', 'en-US': 'e.g. room-aurora' },
  'salas.namePlaceholder': { 'pt-BR': 'Sala Aurora', 'en-US': 'Aurora Room' },
  'salas.projectLabel': {
    'pt-BR': 'Operação dona da Sala (obrigatório)',
    'en-US': 'Operation owning the Room (required)',
  },
  'salas.chooseProject': { 'pt-BR': '— escolha uma Operação —', 'en-US': '— choose an Operation —' },
  'salas.projectHint': {
    'pt-BR':
      'Salas vivem como recurso dentro de uma Operação. Coloque na mesma Operação dos recursos que farão parte dela.',
    'en-US':
      'Rooms live as a resource inside an Operation. Place it in the same Operation as the resources that will be part of it.',
  },
  'salas.createSubmit': { 'pt-BR': 'Criar Sala', 'en-US': 'Create Room' },
  'salas.errorLoad': { 'pt-BR': 'Falha ao carregar Salas', 'en-US': 'Failed to load Rooms' },
  'salas.emptyTitle': {
    'pt-BR': 'Nenhuma Sala criada ainda',
    'en-US': 'No Room created yet',
  },
  'salas.emptyDesc': {
    'pt-BR':
      'Salas agrupam Operações, Tours e Modo Apresentação. Crie a primeira para começar.',
    'en-US':
      'Rooms group Operations, Tours and Presentation Mode. Create the first one to get started.',
  },
  'salas.emptyCta': { 'pt-BR': 'Criar primeira Sala', 'en-US': 'Create first Room' },
  'salas.presentingBadge': {
    'pt-BR': 'Em apresentação · {n} {displayWord}',
    'en-US': 'Presenting · {n} {displayWord}',
  },
  'salas.startPresentation': { 'pt-BR': 'Iniciar Apresentação', 'en-US': 'Start Presentation' },
  'salas.start': { 'pt-BR': 'Iniciar', 'en-US': 'Start' },
  'salas.moreActions': { 'pt-BR': 'Mais ações · {name}', 'en-US': 'More actions · {name}' },
  'salas.menuUrl': { 'pt-BR': 'URL de apresentação · QR', 'en-US': 'Presentation URL · QR' },
  'salas.menuVersions': { 'pt-BR': 'Versões', 'en-US': 'Versions' },
  'salas.menuNavigation': { 'pt-BR': 'Navegação', 'en-US': 'Navigation' },
  'salas.menuLayout': { 'pt-BR': 'Layout da Sala', 'en-US': 'Room layout' },
  'salas.menuFeatured': { 'pt-BR': 'Em destaque', 'en-US': 'Featured' },
  'salas.menuDelete': { 'pt-BR': 'Apagar Sala', 'en-US': 'Delete Room' },
  'salas.deleteTitle': { 'pt-BR': 'Apagar Sala "{name}"?', 'en-US': 'Delete Room "{name}"?' },
  'salas.deleteDesc': {
    'pt-BR':
      'Esta ação remove a Sala e suas versões. Sessões ativas serão encerradas. Não é possível desfazer.',
    'en-US':
      'This action removes the Room and its versions. Active sessions will be ended. Cannot be undone.',
  },
  'salas.deleteConfirm': { 'pt-BR': 'Apagar', 'en-US': 'Delete' },
  'salas.editTitle': { 'pt-BR': 'Editar · {name} (v{version})', 'en-US': 'Edit · {name} (v{version})' },
  'salas.editTabForm': { 'pt-BR': 'Formulário', 'en-US': 'Form' },
  'salas.editTabJson': { 'pt-BR': 'JSON avançado', 'en-US': 'Advanced JSON' },
  'salas.homePageLabel': {
    'pt-BR': 'Página inicial (home_page)',
    'en-US': 'Home page (home_page)',
  },
  'salas.tabsLabel': { 'pt-BR': 'Abas (tabs)', 'en-US': 'Tabs' },
  'salas.tabsEmpty': { 'pt-BR': 'Nenhuma aba configurada.', 'en-US': 'No tab configured.' },
  'salas.tabNewPlaceholder': {
    'pt-BR': 'Adicionar aba (ex: timeline)',
    'en-US': 'Add tab (e.g. timeline)',
  },
  'salas.add': { 'pt-BR': 'Adicionar', 'en-US': 'Add' },
  'salas.configJsonLabel': { 'pt-BR': 'Config completo (JSON)', 'en-US': 'Full config (JSON)' },
  'salas.versionMsgLabel': {
    'pt-BR': 'Mensagem de versão (opcional)',
    'en-US': 'Version message (optional)',
  },
  'salas.publishHint': {
    'pt-BR': 'Save publica imediatamente uma nova versão imutável.',
    'en-US': 'Save immediately publishes a new immutable version.',
  },
  'salas.publish': { 'pt-BR': 'Publicar nova versão', 'en-US': 'Publish new version' },
  'salas.publishing': { 'pt-BR': 'Publicando…', 'en-US': 'Publishing…' },
  // History dialog
  'salas.historyTitle': { 'pt-BR': 'Histórico · {name}', 'en-US': 'History · {name}' },
  'salas.republishTitle': { 'pt-BR': 'Republicar v{n}?', 'en-US': 'Republish v{n}?' },
  'salas.republishDesc': {
    'pt-BR':
      'Uma nova versão (v{next}) será criada com a config de v{n}. A versão antiga permanece imutável no histórico (rollback elegante).',
    'en-US':
      'A new version (v{next}) will be created with the config of v{n}. The old version remains immutable in history (graceful rollback).',
  },
  'salas.republish': { 'pt-BR': 'Republicar', 'en-US': 'Republish' },
  'salas.historyEmpty': {
    'pt-BR': 'Sem versões publicadas.',
    'en-US': 'No published versions.',
  },
  'salas.historyErrorLoad': {
    'pt-BR': 'Falha ao carregar histórico',
    'en-US': 'Failed to load history',
  },
  // Navigation dialog
  'salas.navTitle': { 'pt-BR': 'Navegação · {name}', 'en-US': 'Navigation · {name}' },
  'salas.navOutLabel': { 'pt-BR': 'Saída para fora', 'en-US': 'Outbound navigation' },
  'salas.navOutToggle': {
    'pt-BR': 'Permitir que operadores naveguem para fora da Sala (links externos).',
    'en-US': 'Allow operators to navigate out of the Room (external links).',
  },
  'salas.navOutHint': {
    'pt-BR':
      'Quando desativado, links externos abrem em nova aba para preservar a sessão da Sala.',
    'en-US':
      'When disabled, external links open in a new tab to preserve the Room session.',
  },
  'salas.navAppsLabel': {
    'pt-BR': 'Aplicações permitidas (whitelist)',
    'en-US': 'Allowed applications (whitelist)',
  },
  'salas.navAppsHint': {
    'pt-BR':
      'Lista vazia = todas as aplicações permitidas. Marcar uma ou mais ativa whitelist estrita.',
    'en-US':
      'Empty list = all applications allowed. Checking one or more enables strict whitelist.',
  },
  'salas.navMsgLabel': { 'pt-BR': 'Mensagem (opcional)', 'en-US': 'Message (optional)' },
  'salas.navSave': { 'pt-BR': 'Salvar política', 'en-US': 'Save policy' },
  'salas.navErrorLoad': {
    'pt-BR': 'Falha ao carregar política',
    'en-US': 'Failed to load policy',
  },
  // Promotion dialog
  'salas.promoTitle': { 'pt-BR': 'Destaque · {name}', 'en-US': 'Featured · {name}' },
  'salas.promoHint': {
    'pt-BR':
      'Marque as Organizações em que esta Sala deve aparecer como destaque no menu de navegação. Ordering ASC determina a ordem no menu.',
    'en-US':
      'Check the Organizations where this Room should appear as featured in the navigation menu. Ascending ordering determines the menu order.',
  },
  'salas.promoEmpty': {
    'pt-BR': 'Nenhuma Organização disponível.',
    'en-US': 'No Organization available.',
  },
  // Kiosk dialog
  'salas.kioskTitle': { 'pt-BR': 'Modo Apresentação · {name}', 'en-US': 'Presentation Mode · {name}' },
  'salas.kioskTabUrl': { 'pt-BR': 'URL de kiosk', 'en-US': 'Kiosk URL' },
  'salas.kioskTabSessions': {
    'pt-BR': 'Sessões ativas ({n})',
    'en-US': 'Active sessions ({n})',
  },
  'salas.kioskTabConfig': { 'pt-BR': 'Configuração', 'en-US': 'Settings' },
  'salas.kioskTabHistory': { 'pt-BR': 'Histórico', 'en-US': 'History' },
  'salas.kioskConfigHeader': { 'pt-BR': 'Configuração desta Sala', 'en-US': 'Settings for this Room' },
  'salas.kioskHideChrome': {
    'pt-BR': 'Esconder navbar e sidebar.',
    'en-US': 'Hide navbar and sidebar.',
  },
  'salas.kioskHideChromeHint': {
    'pt-BR': 'Recomendado para displays públicos.',
    'en-US': 'Recommended for public displays.',
  },
  'salas.kioskAllowExit': {
    'pt-BR': 'Permitir saída via tecla Esc.',
    'en-US': 'Allow exit via the Esc key.',
  },
  'salas.kioskAllowExitHint': {
    'pt-BR': 'Desative para displays desacompanhados.',
    'en-US': 'Disable for unattended displays.',
  },
  'salas.kioskAutoFullscreen': {
    'pt-BR': 'Entrar em fullscreen automaticamente.',
    'en-US': 'Enter fullscreen automatically.',
  },
  'salas.kioskAutoFullscreenHint': {
    'pt-BR': 'Cliente chama requestFullscreen ao carregar.',
    'en-US': 'The client calls requestFullscreen on load.',
  },
  'salas.kioskAllowRead': {
    'pt-BR': 'Permitir interação leitura.',
    'en-US': 'Allow read interaction.',
  },
  'salas.kioskAllowReadHint': {
    'pt-BR':
      'Operador pode clicar em filtros / drilldown read-only sem disparar mutações.',
    'en-US':
      'The operator can click read-only filters / drilldown without triggering mutations.',
  },
  'salas.kioskSlideLoop': { 'pt-BR': 'Loop de slides.', 'en-US': 'Slide loop.' },
  'salas.kioskSlideLoopHint': {
    'pt-BR': 'Auto-rotaciona seções da Sala em loop infinito (modo galeria).',
    'en-US': 'Auto-rotates Room sections in an infinite loop (gallery mode).',
  },
  'salas.kioskSlideInterval': {
    'pt-BR': 'Tempo entre slides (segundos):',
    'en-US': 'Time between slides (seconds):',
  },
  'salas.kioskVersionHint': {
    'pt-BR': 'Salvar incrementa a versão da Sala (v{n} → v{next}).',
    'en-US': 'Saving increments the Room version (v{n} → v{next}).',
  },
  'salas.kioskSaveConfig': { 'pt-BR': 'Salvar configuração', 'en-US': 'Save settings' },
  'salas.kioskUrlHeader': {
    'pt-BR': 'URL compartilhável de apresentação',
    'en-US': 'Shareable presentation URL',
  },
  'salas.kioskUrlHint': {
    'pt-BR':
      'Abra este link em qualquer display (TV, monitor de sala, segunda tela). A sessão é rastreada automaticamente na aba Sessões ativas.',
    'en-US':
      'Open this link on any display (TV, room monitor, second screen). The session is tracked automatically in the Active sessions tab.',
  },
  'salas.kioskCopyLink': { 'pt-BR': 'Copiar link', 'en-US': 'Copy link' },
  'salas.kioskCopied': {
    'pt-BR': 'Link copiado para a área de transferência',
    'en-US': 'Link copied to clipboard',
  },
  'salas.kioskCopyFail': {
    'pt-BR': 'Falha ao copiar — copie manualmente',
    'en-US': 'Failed to copy — copy manually',
  },
  'salas.kioskQrAlt': {
    'pt-BR': 'QR code da URL de apresentação para {slug}',
    'en-US': 'QR code of the presentation URL for {slug}',
  },
  'salas.kioskQrHint': {
    'pt-BR':
      'Aponte a câmera do celular ou de um second-screen para abrir direto na URL kiosk.',
    'en-US':
      'Point your phone or a second-screen camera to open straight to the kiosk URL.',
  },
  'salas.kioskOpenWindow': { 'pt-BR': 'Abrir em nova janela', 'en-US': 'Open in new window' },
  'salas.kioskOpenFullscreen': {
    'pt-BR': 'Iniciar nesta janela em fullscreen',
    'en-US': 'Start in this window in fullscreen',
  },
  'salas.kioskSessionsHeader': {
    'pt-BR': 'Sessões ativas ({n})',
    'en-US': 'Active sessions ({n})',
  },
  'salas.kioskEndAll': { 'pt-BR': 'Encerrar todas', 'en-US': 'End all' },
  'salas.kioskNoActive': {
    'pt-BR': 'Nenhuma sessão ativa.',
    'en-US': 'No active session.',
  },
  'salas.kioskNoActiveHint': {
    'pt-BR': 'Use a aba URL de kiosk ou o botão Iniciar Apresentação no card da Sala.',
    'en-US': 'Use the Kiosk URL tab or the Start Presentation button on the Room card.',
  },
  'salas.kioskUnknownClient': { 'pt-BR': 'cliente desconhecido', 'en-US': 'unknown client' },
  'salas.kioskStartedBy': { 'pt-BR': 'iniciada por {by}', 'en-US': 'started by {by}' },
  'salas.kioskSince': { 'pt-BR': 'desde {date}', 'en-US': 'since {date}' },
  'salas.kioskEndSession': { 'pt-BR': 'Encerrar sessão', 'en-US': 'End session' },
  'salas.kioskEnd': { 'pt-BR': 'Encerrar', 'en-US': 'End' },
  'salas.kioskEndAllTitle': {
    'pt-BR': 'Encerrar {n} {sessionWord} ativas?',
    'en-US': 'End {n} active {sessionWord}?',
  },
  'salas.kioskEndAllDesc': {
    'pt-BR':
      'Todos os displays/janelas em modo apresentação dessa Sala serão desconectados imediatamente. Operadores podem reabrir.',
    'en-US':
      'All displays/windows in presentation mode for this Room will be disconnected immediately. Operators can reopen.',
  },
  'salas.kioskHistoryHeader': {
    'pt-BR': 'Histórico de sessões encerradas ({n})',
    'en-US': 'History of ended sessions ({n})',
  },
  'salas.kioskHistoryEmpty': {
    'pt-BR': 'Sem histórico de sessões encerradas ainda.',
    'en-US': 'No history of ended sessions yet.',
  },
  'salas.done': { 'pt-BR': 'Concluir', 'en-US': 'Done' },

  // ─── Marcações por Propriedade page ──────────────────────────────────
  'mp.title': { 'pt-BR': 'Marcações por Propriedade', 'en-US': 'Markings by Property' },
  'mp.subtitle': {
    'pt-BR':
      'Workspace operacional. Selecione Marcação, Tipo ou Operação à esquerda; aplique/remova em lote no centro; veja detalhe + auditoria à direita.',
    'en-US':
      'Operational workspace. Select Marking, Type or Operation on the left; bulk apply/remove in the center; see detail + audit on the right.',
  },
  'mp.navAria': { 'pt-BR': 'Navegação', 'en-US': 'Navigation' },
  'mp.axisAria': { 'pt-BR': 'Eixo de navegação', 'en-US': 'Navigation axis' },
  'mp.tabMarking': { 'pt-BR': 'Marcação', 'en-US': 'Marking' },
  'mp.tabMarkingFull': { 'pt-BR': 'Por Marcação', 'en-US': 'By Marking' },
  'mp.tabKind': { 'pt-BR': 'Tipo', 'en-US': 'Type' },
  'mp.tabKindFull': { 'pt-BR': 'Por Tipo de Objeto', 'en-US': 'By Object Type' },
  'mp.tabOperation': { 'pt-BR': 'Operação', 'en-US': 'Operation' },
  'mp.tabOperationFull': { 'pt-BR': 'Por Operação', 'en-US': 'By Operation' },
  'mp.allMarkings': { 'pt-BR': 'Todas as Marcações', 'en-US': 'All Markings' },
  'mp.allKinds': { 'pt-BR': 'Todos os Tipos', 'en-US': 'All Types' },
  'mp.allOperations': { 'pt-BR': 'Todas as Operações', 'en-US': 'All Operations' },
  'mp.noMarkings': { 'pt-BR': 'Nenhuma Marcação cadastrada.', 'en-US': 'No Marking registered.' },
  'mp.noOperations': { 'pt-BR': 'Nenhuma Operação cadastrada.', 'en-US': 'No Operation registered.' },
  'mp.kindHint': { 'pt-BR': 'tipo de objeto', 'en-US': 'object type' },
  'mp.searchPlaceholder': {
    'pt-BR': 'Buscar Objeto por nome ou URN…',
    'en-US': 'Search Object by name or URN…',
  },
  'mp.searchAria': { 'pt-BR': 'Buscar objeto', 'en-US': 'Search object' },
  'mp.propFilterPlaceholder': {
    'pt-BR': 'filtrar por property_key',
    'en-US': 'filter by property_key',
  },
  'mp.propFilterAria': {
    'pt-BR': 'Filtrar por nome de propriedade',
    'en-US': 'Filter by property name',
  },
  'mp.missingMode': { 'pt-BR': 'mostrar SEM a marcação', 'en-US': 'show WITHOUT the marking' },
  'mp.missingModeAria': {
    'pt-BR': 'Mostrar apenas Objetos SEM a Marcação selecionada',
    'en-US': 'Show only Objects WITHOUT the selected Marking',
  },
  'mp.exportCsv': { 'pt-BR': 'Exportar CSV', 'en-US': 'Export CSV' },
  'mp.exportCsvAria': {
    'pt-BR': 'Exportar resultados em CSV',
    'en-US': 'Export results as CSV',
  },
  'mp.selected': { 'pt-BR': '{n} selecionado{plural}', 'en-US': '{n} selected' },
  'mp.bulkApply': { 'pt-BR': 'Aplicar marcação…', 'en-US': 'Apply marking…' },
  'mp.bulkRemove': { 'pt-BR': 'Remover marcação…', 'en-US': 'Remove marking…' },
  'mp.clearSelection': { 'pt-BR': 'Limpar seleção', 'en-US': 'Clear selection' },
  'mp.processing': { 'pt-BR': 'processando…', 'en-US': 'processing…' },
  'mp.applyResult': {
    'pt-BR': 'Aplicadas: {applied} · ignoradas (já existia): {skipped}',
    'en-US': 'Applied: {applied} · skipped (already existed): {skipped}',
  },
  'mp.removeResult': {
    'pt-BR': 'Removidas: {applied} · sem efeito: {skipped}',
    'en-US': 'Removed: {applied} · no effect: {skipped}',
  },
  'mp.failuresSuffix': { 'pt-BR': ' · falhas: {n}', 'en-US': ' · failures: {n}' },
  'mp.colObject': { 'pt-BR': 'Objeto', 'en-US': 'Object' },
  'mp.colMarkings': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'mp.checkAllAria': { 'pt-BR': 'Selecionar todos visíveis', 'en-US': 'Select all visible' },
  'mp.selectOneAria': { 'pt-BR': 'Selecionar {name}', 'en-US': 'Select {name}' },
  'mp.noNodes': {
    'pt-BR': 'Nenhum Objeto corresponde aos filtros atuais.',
    'en-US': 'No Object matches the current filters.',
  },
  'mp.noMark': { 'pt-BR': 'sem marcação', 'en-US': 'no marking' },
  'mp.pickerApply': { 'pt-BR': 'Aplicar', 'en-US': 'Apply' },
  'mp.pickerRemove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'mp.pickerAria': { 'pt-BR': '{verb} marcação em lote', 'en-US': 'Bulk {verb} marking' },
  'mp.pickerTitle': {
    'pt-BR': '{verb} marcação em {n} Objeto{plural}',
    'en-US': '{verb} marking on {n} Object{plural}',
  },
  'mp.pickerApplyDesc': {
    'pt-BR':
      'A marcação será aplicada idempotentemente. Objetos já marcados são ignorados.',
    'en-US':
      'The marking will be applied idempotently. Objects already marked are skipped.',
  },
  'mp.pickerRemoveDesc': {
    'pt-BR': 'A marcação será removida. Objetos sem a marcação são ignorados.',
    'en-US': 'The marking will be removed. Objects without the marking are skipped.',
  },
  'mp.pickerMarkingLabel': { 'pt-BR': 'Marcação', 'en-US': 'Marking' },
  'mp.pickerChoose': { 'pt-BR': '— escolha —', 'en-US': '— choose —' },
  'mp.pickerPropLabel': { 'pt-BR': 'Propriedade (opcional)', 'en-US': 'Property (optional)' },
  'mp.pickerPropPlaceholder': {
    'pt-BR': 'deixe vazio para marcar o Objeto inteiro',
    'en-US': 'leave empty to mark the entire Object',
  },
  'mp.rightEmpty': {
    'pt-BR': 'Selecione um Objeto na lista central para ver detalhe + auditoria.',
    'en-US': 'Select an Object in the center list to see detail + audit.',
  },
  'mp.rightObjectLabel': { 'pt-BR': 'Objeto', 'en-US': 'Object' },
  'mp.rightDetailAria': { 'pt-BR': 'Detalhe do Objeto', 'en-US': 'Object detail' },
  'mp.rightCloseAria': { 'pt-BR': 'Fechar detalhe', 'en-US': 'Close detail' },
  'mp.propMarkingsTitle': { 'pt-BR': 'Property markings', 'en-US': 'Property markings' },
  'mp.propMarkingsEmpty': {
    'pt-BR': 'Nenhuma marcação aplicada a propriedades.',
    'en-US': 'No marking applied to properties.',
  },
  'mp.historyTitle': { 'pt-BR': 'Histórico (auditoria)', 'en-US': 'History (audit)' },
  'mp.historyEmpty': {
    'pt-BR': 'Sem eventos registrados.',
    'en-US': 'No events recorded.',
  },
  'mp.removeOneTitle': { 'pt-BR': 'Remover Marcação?', 'en-US': 'Remove Marking?' },
  'mp.removeOneDesc': {
    'pt-BR': 'A Marcação será removida da propriedade "{prop}" do Objeto {name}.',
    'en-US': 'The Marking will be removed from property "{prop}" of Object {name}.',
  },
  'mp.removeOneAria': {
    'pt-BR': 'Remover {marking} de {prop}',
    'en-US': 'Remove {marking} from {prop}',
  },
  'mp.systemActor': { 'pt-BR': 'sistema', 'en-US': 'system' },

  // ─── Desenho da Operação (Solution Diagram canvas · M4 #9) ───────────
  'solutions.title': { 'pt-BR': 'Desenho da Operação', 'en-US': 'Operation Design' },
  'solutions.subtitle': {
    'pt-BR': 'Desenhe a arquitetura da operação em um diagrama: coleta, processamento, ontologia e aplicação.',
    'en-US': 'Design the operation architecture as a diagram: collection, processing, ontology and application.',
  },
  // Página indisponível (Page arquivada em Páginas).
  'solutions.unavailable.title': {
    'pt-BR': 'Página indisponível',
    'en-US': 'Page unavailable',
  },
  'solutions.unavailable.desc': {
    'pt-BR': 'Esta página foi arquivada em Páginas. Republique-a para reativar a rota.',
    'en-US': 'This page was archived in Pages. Republish it to reactivate the route.',
  },
  // ─── W2 · Configurar experiência da /solutions (AIP Arquiteto) ─────────
  'solutions.experience.header.title': {
    'pt-BR': 'Comportamento do AIP Arquiteto',
    'en-US': 'AIP Architect behavior',
  },
  'solutions.experience.header.widgetsLocked': {
    'pt-BR': 'Widgets bloqueados (rota de código)',
    'en-US': 'Widgets locked (code route)',
  },
  'solutions.experience.about.title': { 'pt-BR': 'O que é isto?', 'en-US': 'What is this?' },
  'solutions.experience.about.body': {
    'pt-BR': 'O Desenho da Operação é servido por código — o canvas em si é a experiência e não é montável por widgets. Aqui você define COMO o AIP Arquiteto se comporta por padrão ao desenhar uma operação. Salvar reflete na hora.',
    'en-US': 'Operation Design is served by code — the canvas itself is the experience and is not assembled from widgets. Here you set HOW the AIP Architect behaves by default when designing an operation. Saving applies immediately.',
  },
  'solutions.experience.depth.label': { 'pt-BR': 'Profundidade da proposta', 'en-US': 'Proposal depth' },
  'solutions.experience.depth.help': {
    'pt-BR': 'Quanto a primeira proposta detalha. Enxuta entrega o núcleo em segundos; completa abre a largura multi-agente (leva mais tempo). "Aprofundar" sempre fica disponível no chat.',
    'en-US': 'How much the first proposal details. Lean delivers the core in seconds; full opens the multi-agent breadth (takes longer). "Deepen" stays available in the chat.',
  },
  'solutions.experience.depth.lean': { 'pt-BR': 'Enxuta (rápida)', 'en-US': 'Lean (fast)' },
  'solutions.experience.depth.full': { 'pt-BR': 'Completa (detalhada)', 'en-US': 'Full (detailed)' },
  'solutions.experience.scope.label': { 'pt-BR': 'Escopo do desenho', 'en-US': 'Design scope' },
  'solutions.experience.scope.help': {
    'pt-BR': 'O recorte que o AIP Arquiteto desenha por padrão.',
    'en-US': 'The slice the AIP Architect designs by default.',
  },
  'solutions.experience.scope.full': { 'pt-BR': 'Solução inteira', 'en-US': 'Whole solution' },
  'solutions.experience.scope.module': { 'pt-BR': 'Módulo', 'en-US': 'Module' },
  'solutions.experience.scope.page': { 'pt-BR': 'Página', 'en-US': 'Page' },
  'solutions.experience.model.label': { 'pt-BR': 'Modelo AIP padrão', 'en-US': 'Default AIP model' },
  'solutions.experience.model.help': {
    'pt-BR': 'O modelo que o AIP Arquiteto usa para planejar. A escolha é centralizada em Dados → Modelos.',
    'en-US': 'The model the AIP Architect uses to plan. Selection is centralized in Data → Models.',
  },
  'solutions.experience.model.manage': { 'pt-BR': 'Gerir em Modelos', 'en-US': 'Manage in Models' },
  'solutions.experience.save.cta': { 'pt-BR': 'Salvar parâmetros', 'en-US': 'Save parameters' },
  'solutions.experience.save.saving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'solutions.experience.save.saved': { 'pt-BR': 'Salvo', 'en-US': 'Saved' },
  'solutions.experience.save.error': {
    'pt-BR': 'Não foi possível salvar os parâmetros.',
    'en-US': 'Could not save the parameters.',
  },
  'solutions.experience.save.hint.pending': {
    'pt-BR': 'As mudanças passam a valer na /solutions assim que você salvar.',
    'en-US': 'Changes take effect in /solutions as soon as you save.',
  },
  'solutions.experience.save.hint.saved': {
    'pt-BR': 'Parâmetros salvos — a /solutions já usa estes defaults.',
    'en-US': 'Parameters saved — /solutions now uses these defaults.',
  },
  // ─── W3 · Configurar experiência da /agentes (frota 24/7) ──────────────
  'agents.experience.header.title': {
    'pt-BR': 'Comportamento da frota',
    'en-US': 'Fleet behavior',
  },
  'agents.experience.header.widgetsLocked': {
    'pt-BR': 'Widgets bloqueados (rota de código)',
    'en-US': 'Widgets locked (code route)',
  },
  'agents.experience.about.title': { 'pt-BR': 'O que é isto?', 'en-US': 'What is this?' },
  'agents.experience.about.body': {
    'pt-BR': 'O kanban dos agentes é servido por código — ele é a experiência e não é montável por widgets. Aqui você define COMO a frota se comporta por padrão: a cadência oferecida a agentes ainda sem agenda, o prompt-base de novos agentes e o modelo padrão. Salvar reflete na hora.',
    'en-US': "The agents kanban is served by code — it is the experience and is not assembled from widgets. Here you set HOW the fleet behaves by default: the cadence offered to agents without a schedule, the base prompt for new agents and the default model. Saving applies immediately.",
  },
  'agents.experience.cron.label': { 'pt-BR': 'Cadência padrão da frota', 'en-US': 'Fleet default cadence' },
  'agents.experience.cron.help': {
    'pt-BR': 'A agenda oferecida por padrão a agentes que ainda não têm cadência própria. Cada card continua editável individualmente no kanban.',
    'en-US': 'The schedule offered by default to agents that do not yet have their own cadence. Each card stays individually editable in the kanban.',
  },
  'agents.experience.cron.preset.off': { 'pt-BR': 'Sem cron', 'en-US': 'No schedule' },
  'agents.experience.cron.preset.every_15m': { 'pt-BR': 'A cada 15 min', 'en-US': 'Every 15 min' },
  'agents.experience.cron.preset.every_hour': { 'pt-BR': 'Toda hora', 'en-US': 'Every hour' },
  'agents.experience.cron.preset.every_6h': { 'pt-BR': 'A cada 6 h', 'en-US': 'Every 6 h' },
  'agents.experience.cron.preset.daily_6am_brt': { 'pt-BR': '06:00 BRT diário', 'en-US': 'Daily 06:00 BRT' },
  'agents.experience.cron.preset.daily_6pm_brt': { 'pt-BR': '18:00 BRT diário', 'en-US': 'Daily 18:00 BRT' },
  'agents.experience.cron.preset.weekly_monday_6am_brt': { 'pt-BR': 'Segunda 06:00 BRT', 'en-US': 'Monday 06:00 BRT' },
  'agents.experience.prompt.label': { 'pt-BR': 'Prompt-base para novos agentes', 'en-US': 'Base prompt for new agents' },
  'agents.experience.prompt.help': {
    'pt-BR': 'Texto-padrão aplicado a agentes recém-adicionados. Vazio = cada tipo de agente usa o seu próprio prompt-padrão. Cada agente continua reescrevível individualmente.',
    'en-US': "Default text applied to newly added agents. Empty = each agent type uses its own default prompt. Each agent stays individually rewritable.",
  },
  'agents.experience.prompt.placeholder': {
    'pt-BR': 'Você é um agente operacional. Mantenha tom factual e estruture saídas quando possível…',
    'en-US': 'You are an operational agent. Keep a factual tone and structure outputs when possible…',
  },
  'agents.experience.model.label': { 'pt-BR': 'Modelo AIP padrão', 'en-US': 'Default AIP model' },
  'agents.experience.model.help': {
    'pt-BR': 'O modelo que os agentes de análise usam por padrão. A escolha é centralizada em Dados → Modelos.',
    'en-US': 'The model analysis agents use by default. Selection is centralized in Data → Models.',
  },
  'agents.experience.model.manage': { 'pt-BR': 'Gerir em Modelos', 'en-US': 'Manage in Models' },
  'agents.experience.save.cta': { 'pt-BR': 'Salvar parâmetros', 'en-US': 'Save parameters' },
  'agents.experience.save.saving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'agents.experience.save.saved': { 'pt-BR': 'Salvo', 'en-US': 'Saved' },
  'agents.experience.save.error': {
    'pt-BR': 'Não foi possível salvar os parâmetros.',
    'en-US': 'Could not save the parameters.',
  },
  'agents.experience.save.hint.pending': {
    'pt-BR': 'As mudanças passam a valer na /agentes assim que você salvar.',
    'en-US': 'Changes take effect in /agentes as soon as you save.',
  },
  'agents.experience.save.hint.saved': {
    'pt-BR': 'Parâmetros salvos — a /agentes já usa estes defaults.',
    'en-US': 'Parameters saved — /agentes now uses these defaults.',
  },
  // ─── Onda 3b (Safe Tag) — experience_kind:'embed' (SPA same-origin) ──────
  'embed.app.livemap': { 'pt-BR': 'Mapa Vivo', 'en-US': 'Live Map' },
  'embed.app.guestalerts': { 'pt-BR': 'Alertas ao Vivo', 'en-US': 'Live Alerts' },
  'embed.invalid.title': {
    'pt-BR': 'Aplicação indisponível',
    'en-US': 'Application unavailable',
  },
  'embed.invalid.body': {
    'pt-BR': 'Esta página embute uma aplicação por um endereço inválido ou externo. Reconfigure a experiência escolhendo uma aplicação da lista.',
    'en-US': 'This page embeds an application from an invalid or external address. Reconfigure the experience by choosing an application from the list.',
  },
  'embed.experience.header.title': {
    'pt-BR': 'Aplicação embutida',
    'en-US': 'Embedded application',
  },
  'embed.experience.header.sameorigin': {
    'pt-BR': 'mesma origem',
    'en-US': 'same-origin',
  },
  'embed.experience.about.title': { 'pt-BR': 'O que é isto?', 'en-US': 'What is this?' },
  'embed.experience.about.body': {
    'pt-BR': 'Esta página exibe, em tela cheia, uma aplicação operacional já validada. O operador logado a vê com o próprio acesso — sem outra senha.',
    'en-US': 'This page shows, full-screen, an already-validated operational application. The logged-in operator sees it with their own access — no second login.',
  },
  'embed.experience.app.label': { 'pt-BR': 'Aplicação exibida', 'en-US': 'Displayed application' },
  'embed.experience.app.help': {
    'pt-BR': 'Escolha qual aplicação esta página exibe. Só aplicações servidas pela própria plataforma aparecem aqui.',
    'en-US': 'Choose which application this page shows. Only applications served by the platform itself appear here.',
  },
  'embed.experience.save.cta': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'embed.experience.save.saving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'embed.experience.save.saved': { 'pt-BR': 'Salvo', 'en-US': 'Saved' },
  'embed.experience.save.error': {
    'pt-BR': 'Não foi possível salvar a experiência.',
    'en-US': 'Could not save the experience.',
  },
  'embed.experience.save.hint.pending': {
    'pt-BR': 'A escolha passa a valer nesta página assim que você salvar.',
    'en-US': 'The choice takes effect on this page as soon as you save.',
  },
  'embed.experience.save.hint.saved': {
    'pt-BR': 'Experiência salva — esta página já exibe a aplicação escolhida.',
    'en-US': 'Experience saved — this page now shows the chosen application.',
  },
  // ─── LOTE3 — Moldura da página (chrome) — compartilhado pelos 3 editores ─
  'pages.chrome.title': { 'pt-BR': 'Moldura da página', 'en-US': 'Page frame' },
  'pages.chrome.help': {
    'pt-BR': 'Controla como esta experiência é emoldurada na visualização — quanto cabeçalho e que largura. Salvar reflete na hora.',
    'en-US': 'Controls how this experience is framed in the view — how much header and what width. Saving applies immediately.',
  },
  'pages.chrome.hideHeader.label': {
    'pt-BR': 'Ocultar cabeçalho da página',
    'en-US': 'Hide page header',
  },
  'pages.chrome.hideHeader.help': {
    'pt-BR': 'Remove a barra de título do próprio app para ganhar o máximo de espaço vertical (ideal para chat e canvas).',
    'en-US': "Removes the app's own title bar to gain maximum vertical space (ideal for chat and canvas).",
  },
  'pages.chrome.fullBleed.label': { 'pt-BR': 'Largura total', 'en-US': 'Full width' },
  'pages.chrome.fullBleed.help': {
    'pt-BR': 'O app ocupa toda a largura disponível. Desligue para centralizar o conteúdo numa coluna confortável de leitura.',
    'en-US': 'The app fills the full available width. Turn off to center the content in a comfortable reading column.',
  },
  'pages.chrome.save.cta': { 'pt-BR': 'Salvar moldura', 'en-US': 'Save frame' },
  'pages.chrome.save.saving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'pages.chrome.save.saved': { 'pt-BR': 'Salvo', 'en-US': 'Saved' },
  'pages.chrome.save.error': {
    'pt-BR': 'Não foi possível salvar a moldura.',
    'en-US': 'Could not save the frame.',
  },
  // ─── W1 — Configurar experiência do AIP Chat (Conversas) ───────────────
  'aip.experience.header.title': {
    'pt-BR': 'Experiência do AIP',
    'en-US': 'AIP experience',
  },
  'aip.experience.header.serverAuthoritative': {
    'pt-BR': 'Aplicada no servidor a cada turno',
    'en-US': 'Applied on the server every turn',
  },
  'aip.experience.locked': {
    'pt-BR': 'Você não tem permissão para configurar a experiência do AIP. Peça a um administrador o acesso "Configurar experiência do AIP".',
    'en-US': 'You do not have permission to configure the AIP experience. Ask an administrator for the "Configure AIP experience" access.',
  },
  'aip.experience.loading': { 'pt-BR': 'Carregando experiência…', 'en-US': 'Loading experience…' },
  'aip.experience.loadError': {
    'pt-BR': 'Não foi possível carregar a experiência do AIP.',
    'en-US': 'Could not load the AIP experience.',
  },
  'aip.experience.about.title': { 'pt-BR': 'O que é isto?', 'en-US': 'What is this?' },
  'aip.experience.about.body': {
    'pt-BR': 'O chat do AIP (Conversas) é servido por código — ele é a experiência e não é montável por widgets. Aqui você define o COMPORTAMENTO PADRÃO do copiloto para toda a unidade: tom, instruções adicionais, temperatura, saudação, sugestões de partida e os padrões de ferramentas/capacidades. Tom e instruções COMPLEMENTAM a base do copiloto — nunca a substituem — e são aplicados no servidor a cada turno. Cada operador ainda pode ajustar o próprio tom.',
    'en-US': "The AIP chat (Conversations) is served by code — it is the experience and is not assembled from widgets. Here you set the copilot's DEFAULT BEHAVIOR for the whole unit: tone, additional instructions, temperature, greeting, starter suggestions and the tool/capability defaults. Tone and instructions COMPLEMENT the copilot base — never replace it — and are applied on the server every turn. Each operator can still adjust their own tone.",
  },
  'aip.experience.tone.label': { 'pt-BR': 'Tom de voz padrão', 'en-US': 'Default tone of voice' },
  'aip.experience.tone.help': {
    'pt-BR': 'O tom padrão do copiloto para a unidade. Complementa a base — nunca a substitui. Cada operador pode sobrepor o próprio tom nas preferências.',
    'en-US': "The copilot's default tone for the unit. Complements the base — never replaces it. Each operator can override their own tone in preferences.",
  },
  'aip.experience.tone.house': { 'pt-BR': 'Padrão da casa', 'en-US': 'House default' },
  'aip.experience.overlay.label': {
    'pt-BR': 'Instruções adicionais da organização',
    'en-US': 'Additional organization instructions',
  },
  'aip.experience.overlay.help': {
    'pt-BR': 'Texto anexado como COMPLEMENTO à base do copiloto — nunca a substitui (as regras de não inventar fato e de auditoria permanecem). Use para orientações da sua unidade.',
    'en-US': 'Text appended as a COMPLEMENT to the copilot base — never replacing it (the no-fabrication and audit rules remain). Use it for your unit guidance.',
  },
  'aip.experience.overlay.placeholder': {
    'pt-BR': 'Ex.: priorize ocorrências da região metropolitana; cite sempre o número do BO quando houver…',
    'en-US': 'E.g.: prioritize incidents in the metropolitan area; always cite the report number when available…',
  },
  'aip.experience.temperature.label': { 'pt-BR': 'Temperatura', 'en-US': 'Temperature' },
  'aip.experience.temperature.help': {
    'pt-BR': 'Quanto o copiloto varia as respostas. Baixa (0) = factual e estável; alta (1) = mais criativa. Recomendado para inteligência: 0,2.',
    'en-US': 'How much the copilot varies its answers. Low (0) = factual and stable; high (1) = more creative. Recommended for intelligence: 0.2.',
  },
  'aip.experience.greeting.label': { 'pt-BR': 'Saudação inicial', 'en-US': 'Opening greeting' },
  'aip.experience.greeting.help': {
    'pt-BR': 'O título mostrado na tela inicial do chat. Vazio = saudação padrão.',
    'en-US': 'The title shown on the chat landing screen. Empty = default greeting.',
  },
  'aip.experience.greeting.placeholder': {
    'pt-BR': 'Ex.: Em que posso apoiar a operação?',
    'en-US': 'E.g.: How can I support the operation?',
  },
  'aip.experience.suggestions.label': { 'pt-BR': 'Sugestões de partida', 'en-US': 'Starter suggestions' },
  'aip.experience.suggestions.help': {
    'pt-BR': 'Prompts oferecidos na tela inicial do chat. Vazio = sugestões padrão. Clicar preenche o campo (o operador decide enviar).',
    'en-US': 'Prompts offered on the chat landing screen. Empty = default suggestions. Clicking fills the field (the operator decides to send).',
  },
  'aip.experience.suggestions.placeholder': { 'pt-BR': 'Texto da sugestão…', 'en-US': 'Suggestion text…' },
  'aip.experience.suggestions.add': { 'pt-BR': 'Adicionar sugestão', 'en-US': 'Add suggestion' },
  'aip.experience.suggestions.empty': {
    'pt-BR': 'Nenhuma sugestão — o chat usa as sugestões padrão.',
    'en-US': 'No suggestions — the chat uses the default suggestions.',
  },
  'aip.experience.tools.label': {
    'pt-BR': 'Ferramentas liberadas por padrão',
    'en-US': 'Tools allowed by default',
  },
  'aip.experience.tools.help': {
    'pt-BR': 'As ferramentas que o copiloto pode usar em novas conversas. Nenhuma marcada = todas liberadas. Cada conversa continua ajustável.',
    'en-US': 'The tools the copilot may use in new conversations. None checked = all allowed. Each conversation stays adjustable.',
  },
  'aip.experience.tools.search': { 'pt-BR': 'Buscar ferramenta…', 'en-US': 'Search tool…' },
  'aip.experience.tools.all': { 'pt-BR': 'Todas as ferramentas liberadas', 'en-US': 'All tools allowed' },
  'aip.experience.tools.none': {
    'pt-BR': 'Catálogo de ferramentas indisponível — todas permanecem liberadas.',
    'en-US': 'Tool catalog unavailable — all remain allowed.',
  },
  'aip.experience.capabilities.label': { 'pt-BR': 'Capacidades padrão', 'en-US': 'Default capabilities' },
  'aip.experience.capabilities.help': {
    'pt-BR': 'As capacidades ligadas por padrão em novas conversas (espelham os atalhos do campo de mensagem). Cada conversa continua ajustável.',
    'en-US': 'The capabilities turned on by default in new conversations (mirroring the message-field shortcuts). Each conversation stays adjustable.',
  },
  'aip.experience.cap.web_search': { 'pt-BR': 'Buscar na web', 'en-US': 'Web search' },
  'aip.experience.cap.rag_search': { 'pt-BR': 'Buscar interno', 'en-US': 'Internal search' },
  'aip.experience.cap.code_interpreter': { 'pt-BR': 'Executor de código', 'en-US': 'Code interpreter' },
  'aip.experience.cap.artifacts': { 'pt-BR': 'Artefatos', 'en-US': 'Artifacts' },
  'aip.experience.cap.memory': { 'pt-BR': 'Memória', 'en-US': 'Memory' },
  'aip.experience.cap.mcp': { 'pt-BR': 'MCP', 'en-US': 'MCP' },
  'aip.experience.model.label': { 'pt-BR': 'Modelo AIP padrão', 'en-US': 'Default AIP model' },
  'aip.experience.model.help': {
    'pt-BR': 'O modelo da finalidade "Conversas". A escolha é centralizada em Dados → Modelos.',
    'en-US': 'The model for the "Conversations" purpose. Selection is centralized in Data → Models.',
  },
  'aip.experience.model.manage': { 'pt-BR': 'Gerir em Modelos', 'en-US': 'Manage in Models' },
  'aip.experience.save.cta': { 'pt-BR': 'Salvar experiência', 'en-US': 'Save experience' },
  'aip.experience.save.saving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'aip.experience.save.saved': { 'pt-BR': 'Salvo', 'en-US': 'Saved' },
  'aip.experience.save.error': {
    'pt-BR': 'Não foi possível salvar a experiência.',
    'en-US': 'Could not save the experience.',
  },
  'aip.experience.save.hint.pending': {
    'pt-BR': 'As mudanças passam a valer no chat assim que você salvar.',
    'en-US': 'Changes take effect in the chat as soon as you save.',
  },
  'aip.experience.save.hint.saved': {
    'pt-BR': 'Experiência salva — o chat já usa estes padrões.',
    'en-US': 'Experience saved — the chat now uses these defaults.',
  },
  // Faixa de política da frota exibida no topo do board da /agentes.
  'agents.fleetPolicy.label': { 'pt-BR': 'Padrão da frota', 'en-US': 'Fleet default' },
  'agents.fleetPolicy.cadence': { 'pt-BR': 'Cadência', 'en-US': 'Cadence' },
  'agents.fleetPolicy.configure': { 'pt-BR': 'Ajustar', 'en-US': 'Adjust' },
  'solutions.startPlanning': { 'pt-BR': 'Planejar', 'en-US': 'Plan' },
  'solutions.newDiagram': { 'pt-BR': 'Novo diagrama', 'en-US': 'New diagram' },
  'solutions.save': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'solutions.saved': { 'pt-BR': 'Diagrama salvo', 'en-US': 'Diagram saved' },
  'solutions.nodeToolbar': { 'pt-BR': 'Componentes', 'en-US': 'Components' },
  'solutions.referenceLibrary': { 'pt-BR': 'Referências', 'en-US': 'References' },
  'solutions.searchComponents': { 'pt-BR': 'Buscar componentes', 'en-US': 'Search components' },
  'solutions.inspector': { 'pt-BR': 'Configuração do nó', 'en-US': 'Node configuration' },
  'solutions.inspectorEmpty': {
    'pt-BR': 'Selecione um nó no diagrama para configurá-lo.',
    'en-US': 'Select a node in the diagram to configure it.',
  },
  'solutions.selectImplementation': { 'pt-BR': 'Escolher implementação concreta', 'en-US': 'Choose concrete implementation' },
  'solutions.selectImplementationIntro': {
    'pt-BR': 'Este é um CONCEITO do plano. Escolha uma implementação concreta (conector, worker, pipeline, função…) — o AIP propõe opções e desdobra este nó em componentes reais no diagrama.',
    'en-US': 'This is a plan CONCEPT. Choose a concrete implementation (connector, worker, pipeline, function…) — the AIP proposes options and unfolds this node into real components in the diagram.',
  },
  'solutions.insertIntoGraph': { 'pt-BR': 'Inserir no grafo', 'en-US': 'Insert into graph' },
  'solutions.generateDataModel': { 'pt-BR': 'Gerar modelo de dados', 'en-US': 'Generate data model' },
  'solutions.generateDataModelIntro': {
    'pt-BR': 'Descreva as entidades e relações em linguagem natural — o AIP gera os Tipos de objeto (com propriedades e vínculos) na ontologia, que você revisa antes de construir.',
    'en-US': 'Describe the entities and relations in natural language — the AIP generates the object types (with properties and links) in the ontology, which you review before building.',
  },
  'solutions.generateDataModelHint': {
    'pt-BR': 'A IA lê sua descrição e propõe Tipos de objeto com esquema (propriedades + vínculos). Nada é gravado até "Salvar e Construir".',
    'en-US': 'The AI reads your description and proposes object types with schema (properties + links). Nothing is saved until "Save & Build".',
  },
  'solutions.generateDataModelPlaceholder': {
    'pt-BR': 'Ex.: Pessoa (CPF, nome), Veículo (placa, modelo). Relação: Pessoa possui Veículo.',
    'en-US': 'E.g. Person (id, name), Vehicle (plate, model). Relation: Person owns Vehicle.',
  },
  'solutions.aplicacaoConfigInfo': {
    'pt-BR': 'Nós de aplicação são ESTRUTURAIS — entregam a interface final (painéis, páginas, ações). Não têm configuração técnica aqui: edite título/descrição em Metadados; os widgets, páginas e ações são definidos na materialização ("Salvar e Construir").',
    'en-US': 'Application nodes are STRUCTURAL — they deliver the final interface (panels, pages, actions). No technical config here: edit title/description in Metadata; widgets, pages and actions are defined at materialization ("Save & Build").',
  },
  'solutions.askAip': { 'pt-BR': 'Perguntar à IA', 'en-US': 'Ask AI' },
  'solutions.walkthrough': { 'pt-BR': 'Plano de implementação', 'en-US': 'Implementation plan' },
  // Rótulo curto do botão da barra (abre o painel de plano de implementação).
  'solutions.walkthroughShort': { 'pt-BR': 'Passo a passo', 'en-US': 'Step by step' },
  'solutions.buildWalkthrough': { 'pt-BR': 'Gerar plano guiado', 'en-US': 'Build walkthrough' },
  'solutions.walkthroughIntro': {
    'pt-BR': 'Gere um guia passo-a-passo do diagrama atual — coleta (multi-skill), processamento (IA, transformação ou ambos), ontologia e a aplicação final.',
    'en-US': 'Generate a step-by-step guide from the current diagram — collection (multi-skill), processing (AI, transformation or both), ontology and the final app.',
  },
  'solutions.walkthroughNeedSave': {
    'pt-BR': 'Salve o diagrama primeiro para gerar o guia.',
    'en-US': 'Save the diagram first to generate the guide.',
  },
  'solutions.next': { 'pt-BR': 'Próximo', 'en-US': 'Next' },
  'solutions.previous': { 'pt-BR': 'Anterior', 'en-US': 'Previous' },
  'solutions.canvasEmpty': {
    'pt-BR': 'Inicie o planejamento ou abra um pattern da biblioteca para começar o diagrama.',
    'en-US': 'Start planning or open a library pattern to begin the diagram.',
  },
  // AIP Arquiteto — entry flow em CHAT (plan-mode → diagrama como artefato).
  'solutions.arquitetoTitle': { 'pt-BR': 'AIP', 'en-US': 'AIP' },
  'solutions.arquitetoSubtitle': {
    'pt-BR': 'Converse para planejar a operação.',
    'en-US': 'Chat to plan the operation. When finished, the diagram is generated automatically.',
  },
  'solutions.arquitetoPlaceholder': {
    'pt-BR': 'Descreva a operação que você quer montar...',
    'en-US': 'Describe the operation you want to build...',
  },
  'solutions.arquitetoSend': { 'pt-BR': 'Enviar', 'en-US': 'Send' },
  // Botão copiar dos blocos de código no markdown do AIP Arquiteto (#1).
  'solutions.copy': { 'pt-BR': 'copiar', 'en-US': 'copy' },
  'solutions.copied': { 'pt-BR': 'copiado', 'en-US': 'copied' },
  'solutions.arquitetoYou': { 'pt-BR': 'você', 'en-US': 'you' },
  'solutions.arquitetoPlanReady': {
    'pt-BR': 'Plano atualizado — veja no diagrama ao lado.',
    'en-US': 'Plan updated — see the diagram alongside.',
  },
  'solutions.arquitetoThinking': { 'pt-BR': 'pensando...', 'en-US': 'thinking...' },
  'solutions.arquitetoDesigning': {
    'pt-BR': 'Gerando o diagrama da operação...',
    'en-US': 'Generating the operation diagram...',
  },
  'solutions.arquitetoFinalized': {
    'pt-BR': 'Plano concluído — diagrama gerado no canvas.',
    'en-US': 'Plan complete — diagram generated on the canvas.',
  },
  'solutions.arquitetoHint': {
    'pt-BR': 'Enter para enviar · Shift+Enter para quebrar linha · toda chamada fica auditada',
    'en-US': 'Enter to send · Shift+Enter for a new line · every call is audited',
  },
  // P2 — a 1ª proposta é o NÚCLEO enxuto (rápido). "Aprofundar" gera a operação
  // completa (largura), sob demanda, sem capar nem virar quiz.
  'solutions.arquitetoDeepenBtn': {
    'pt-BR': 'Aprofundar — gerar a operação completa',
    'en-US': 'Go deeper — generate the full operation',
  },
  'solutions.arquitetoDeepenHint': {
    'pt-BR': 'Esta é uma proposta enxuta com o essencial. Aprofunde para o conjunto completo, ou peça o que falta.',
    'en-US': 'This is a lean proposal with the essentials. Go deeper for the full set, or just ask for what is missing.',
  },
  'solutions.arquitetoDeepening': {
    'pt-BR': 'Aprofundando — gerando a operação completa. Pode levar alguns minutos.',
    'en-US': 'Going deeper — generating the full operation. This can take a few minutes.',
  },
  // Erros humanizados — NUNCA vazar jargão técnico (Pydantic/Python/HTTP) ao operador.
  'solutions.arquitetoErrGeneric': {
    'pt-BR': 'Algo deu errado ao montar o plano. Tente refinar a frase e enviar de novo.',
    'en-US': 'Something went wrong building the plan. Try rephrasing and sending again.',
  },
  'solutions.arquitetoErrTechnical': {
    'pt-BR': 'Tive um problema interno ao montar o plano — não foi a sua pergunta. Tente de novo em instantes; sua ideia pode ser reenviada como está.',
    'en-US': 'I hit an internal problem while assembling the plan — it was not your question. Try again shortly; you can resend your idea as-is.',
  },
  'solutions.arquitetoRetrying': {
    'pt-BR': 'Tive um problema interno ao montar o plano — tentando de novo automaticamente…',
    'en-US': 'I hit an internal problem while assembling the plan — retrying automatically…',
  },
  'solutions.arquitetoErrTimeout': {
    'pt-BR': 'A geração demorou mais que o esperado. Tente novamente em alguns segundos — ou clique em Aprofundar de novo.',
    'en-US': 'Generation took longer than expected. Try again in a few seconds — or click Go deeper again.',
  },
  'solutions.arquitetoErrCancelled': {
    'pt-BR': 'Geração cancelada.',
    'en-US': 'Generation cancelled.',
  },
  // B3 — inventário de apps real do tenant (resposta a "quais apps tenho").
  'solutions.arquitetoAppsList': {
    'pt-BR': 'Você tem {n} app(s):',
    'en-US': 'You have {n} app(s):',
  },
  'solutions.arquitetoAppsNone': {
    'pt-BR': 'Você ainda não tem apps. Diga o que quer gerenciar que eu monto o primeiro.',
    'en-US': "You don't have any apps yet. Tell me what you want to manage and I'll build the first one.",
  },
  // F2 — link "Editar no AIP" por app (abre o designer com o app no canvas).
  'solutions.arquitetoEditApp': { 'pt-BR': 'editar no AIP', 'en-US': 'edit in AIP' },
  // Remoção destrutiva no chat ("remove o tipo X") — confirm-gated.
  'solutions.arquitetoRemoveConfirm': {
    'pt-BR': "Remover o tipo “{kind}”? Apaga o tipo e seus vínculos — não dá pra desfazer.",
    'en-US': 'Remove the type "{kind}"? Deletes the type and its links — cannot be undone.',
  },
  'solutions.arquitetoRemoveBtn': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'solutions.arquitetoRemoveCancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'solutions.arquitetoRemoveDone': {
    'pt-BR': 'Tipo “{kind}” removido.',
    'en-US': 'Type "{kind}" removed.',
  },
  'solutions.arquitetoRemoveNotFound': {
    'pt-BR': 'Não encontrei o tipo “{kind}” para remover. Confira o nome.',
    'en-US': 'Could not find the type "{kind}" to remove. Check the name.',
  },
  'solutions.arquitetoRemoveWhich': {
    'pt-BR': 'Qual tipo você quer remover? Diga o nome — ex.: "remove o tipo Multa".',
    'en-US': 'Which type do you want to remove? Tell me the name — e.g. "remove the Multa type".',
  },
  'solutions.arquitetoRemoveAppHint': {
    'pt-BR': 'Para excluir o app inteiro, use o botão "Excluir app" no topo da página do app.',
    'en-US': 'To delete the whole app, use the "Delete app" button at the top of the app page.',
  },
  // Botão "Editar no AIP" no header da página do app (/workshop/view/{id}).
  'workshop.editInAip': { 'pt-BR': 'Editar no AIP', 'en-US': 'Edit in AIP' },
  // Excluir app (header da página do app) — com confirmação destrutiva.
  'workshop.deleteApp': { 'pt-BR': 'Excluir app', 'en-US': 'Delete app' },
  'workshop.deleteAppTitle': {
    'pt-BR': 'Excluir "{name}"?',
    'en-US': 'Delete "{name}"?',
  },
  'workshop.deleteAppDesc': {
    'pt-BR': 'O app vai para a Lixeira e some das listagens. Os tipos de objeto e os dados continuam na ontologia. Você pode restaurá-lo depois.',
    'en-US': 'The app moves to the Trash and disappears from listings. Object types and data remain in the ontology. You can restore it later.',
  },
  // Teardown — remover a construção materializada inteira (inverso do AIP build).
  'workshop.teardown.optin': {
    'pt-BR': 'Remover também a construção gerada pelo AIP',
    'en-US': 'Also remove the build generated by AIP',
  },
  'workshop.teardown.irreversible': {
    'pt-BR': 'Irreversível — apaga tudo que esta construção criou, não vai para a Lixeira.',
    'en-US': 'Irreversible — deletes everything this build created; it does not go to the Trash.',
  },
  'workshop.teardown.confirmWithBuild': {
    'pt-BR': 'Excluir app + construção',
    'en-US': 'Delete app + build',
  },
  'workshop.teardown.ontologyTypes': { 'pt-BR': 'tipos', 'en-US': 'types' },
  'workshop.teardown.actions': { 'pt-BR': 'ações', 'en-US': 'actions' },
  'workshop.teardown.agents': { 'pt-BR': 'agentes', 'en-US': 'agents' },
  'workshop.teardown.flows': { 'pt-BR': 'fluxos', 'en-US': 'flows' },
  'workshop.teardown.functions': { 'pt-BR': 'funções', 'en-US': 'functions' },
  'workshop.teardown.operacao': { 'pt-BR': 'Operação', 'en-US': 'Operation' },
  'workshop.teardown.espaco': { 'pt-BR': 'Espaço', 'en-US': 'Space' },
  'workshop.teardown.paginas': { 'pt-BR': 'páginas', 'en-US': 'pages' },
  'workshop.teardown.alsoRemoves': {
    'pt-BR': 'Excluir definitivamente remove TODA a construção materializada pelo AIP:',
    'en-US': 'Permanent deletion removes the ENTIRE build the AIP materialized:',
  },
  'workshop.teardown.nothingExtra': {
    'pt-BR': 'Este app não tem construção materializada vinculada — só o app será removido.',
    'en-US': 'This app has no linked materialized build — only the app is removed.',
  },
  'workshop.trash.softInfo': {
    'pt-BR': 'Vai para a Lixeira (recuperável). A construção (Operação, tipos, ações, agentes) NÃO é tocada até a exclusão definitiva.',
    'en-US': 'Moves to Trash (recoverable). The build (Operation, types, actions, agents) is NOT touched until permanent deletion.',
  },
  // F1 remoção — Lixeira de painéis (soft-delete + restaurar + excluir definitivo).
  'workshop.view.apps': { 'pt-BR': 'Painéis', 'en-US': 'Apps' },
  'workshop.trash.title': { 'pt-BR': 'Lixeira', 'en-US': 'Trash' },
  'workshop.trash.empty': { 'pt-BR': 'A Lixeira está vazia.', 'en-US': 'The Trash is empty.' },
  'workshop.trash.emptyHint': {
    'pt-BR': 'Painéis excluídos aparecem aqui e podem ser restaurados.',
    'en-US': 'Deleted apps show up here and can be restored.',
  },
  'workshop.trash.deletedAt': { 'pt-BR': 'excluído em', 'en-US': 'deleted on' },
  'workshop.trash.delete': { 'pt-BR': 'Excluir', 'en-US': 'Delete' },
  'workshop.trash.restore': { 'pt-BR': 'Restaurar', 'en-US': 'Restore' },
  'workshop.trash.purge': { 'pt-BR': 'Excluir definitivamente', 'en-US': 'Delete permanently' },
  'workshop.trash.confirmDelete': {
    'pt-BR': 'Enviar "{name}" para a Lixeira? Você pode restaurar depois.',
    'en-US': 'Move "{name}" to the Trash? You can restore it later.',
  },
  'workshop.trash.confirmPurge': {
    'pt-BR': 'Excluir "{name}" DEFINITIVAMENTE? Esta ação não pode ser desfeita.',
    'en-US': 'Delete "{name}" PERMANENTLY? This cannot be undone.',
  },
  // F1 remoção — bulk-delete de instâncias da ontologia (multi-seleção).
  'bulk.selectAll': { 'pt-BR': 'Selecionar todos', 'en-US': 'Select all' },
  'bulk.selectRow': { 'pt-BR': 'Selecionar', 'en-US': 'Select' },
  'bulk.selectedCount': { 'pt-BR': '{n} selecionado(s)', 'en-US': '{n} selected' },
  'bulk.clear': { 'pt-BR': 'Limpar seleção', 'en-US': 'Clear selection' },
  'bulk.deleteN': { 'pt-BR': 'Apagar {n}', 'en-US': 'Delete {n}' },
  'bulk.cancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'bulk.confirmTitle': { 'pt-BR': 'Confirmar remoção em massa', 'en-US': 'Confirm bulk deletion' },
  'bulk.confirmBody': {
    'pt-BR': 'Você vai apagar {n} objeto(s) e {e} relação(ões) vinculada(s). A remoção é definitiva e auditada.',
    'en-US': 'You are about to delete {n} object(s) and {e} linked relation(s). Deletion is permanent and audited.',
  },
  'bulk.confirmHint': {
    'pt-BR': 'Confira a amostra acima antes de confirmar.',
    'en-US': 'Review the sample above before confirming.',
  },
  'bulk.confirmDelete': { 'pt-BR': 'Apagar definitivamente', 'en-US': 'Delete permanently' },
  // F2 — editor de Eventos (executável, sobre node.events).
  'events.panel.title': { 'pt-BR': 'Eventos do widget', 'en-US': 'Widget events' },
  'events.panel.when': { 'pt-BR': 'Quando', 'en-US': 'When' },
  'events.panel.reactions': { 'pt-BR': 'Reações', 'en-US': 'Reactions' },
  'events.panel.do': { 'pt-BR': 'Faça', 'en-US': 'Do' },
  'events.panel.whenField': { 'pt-BR': 'Quando', 'en-US': 'When' },
  'events.panel.actionField': { 'pt-BR': 'Faça', 'en-US': 'Do' },
  'events.panel.selectWidget': {
    'pt-BR': 'Selecione um widget no canvas para configurar seus eventos.',
    'en-US': 'Select a widget on the canvas to configure its events.',
  },
  'events.panel.noReactions': {
    'pt-BR': 'Nenhuma reação ainda. Adicione na coluna "Quando".',
    'en-US': 'No reactions yet. Add one from the "When" column.',
  },
  'events.panel.addReaction': { 'pt-BR': 'Adicionar reação', 'en-US': 'Add reaction' },
  'events.panel.remove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'events.panel.pickReaction': {
    'pt-BR': 'Escolha uma reação no centro para editar.',
    'en-US': 'Pick a reaction in the middle to edit.',
  },
  'events.panel.onlyOnLoad': {
    'pt-BR': 'Este widget só dispara "Ao carregar" (é de leitura).',
    'en-US': 'This widget only fires "On load" (read-only).',
  },
  // Gatilhos (triggers reais)
  'events.trigger.click': { 'pt-BR': 'Ao clicar', 'en-US': 'On click' },
  'events.trigger.select_change': { 'pt-BR': 'Ao selecionar uma linha', 'en-US': 'On row select' },
  'events.trigger.value_change': { 'pt-BR': 'Ao mudar o valor', 'en-US': 'On value change' },
  'events.trigger.on_load': { 'pt-BR': 'Ao carregar', 'en-US': 'On load' },
  'events.trigger.action_success': { 'pt-BR': 'Ao concluir a ação', 'en-US': 'On action success' },
  'events.trigger.action_pending': { 'pt-BR': 'Ao iniciar a ação', 'en-US': 'On action pending' },
  'events.trigger.action_error': { 'pt-BR': 'Ao falhar a ação', 'en-US': 'On action error' },
  'events.trigger.form_success': { 'pt-BR': 'Ao enviar o formulário', 'en-US': 'On form submit' },
  'events.trigger.form_error': { 'pt-BR': 'Ao falhar o envio', 'en-US': 'On submit error' },
  'events.trigger.form_denied': { 'pt-BR': 'Quando o envio é negado', 'en-US': 'On submit denied' },
  'requirePerm.deniedTitle': { 'pt-BR': 'Acesso restrito', 'en-US': 'Restricted access' },
  'requirePerm.deniedBody': {
    'pt-BR': 'Esta área exige a permissão {perm}. Peça a um administrador para conceder essa permissão (ou um papel que a contenha) ao seu perfil.',
    'en-US': 'This area requires the {perm} permission. Ask an administrator to grant it (or a role that includes it) to your profile.',
  },
  'events.trigger.query_success': { 'pt-BR': 'Ao concluir a consulta', 'en-US': 'On query success' },
  'events.trigger.query_error': { 'pt-BR': 'Ao falhar a consulta', 'en-US': 'On query error' },
  'events.trigger.search_changed': { 'pt-BR': 'Ao mudar a busca', 'en-US': 'On search change' },
  'events.trigger.filter_changed': { 'pt-BR': 'Ao mudar o filtro', 'en-US': 'On filter change' },
  // Ações
  'events.action.set_variable': { 'pt-BR': 'Atribuir valor a um dado', 'en-US': 'Set a value' },
  'events.action.refresh_variable': { 'pt-BR': 'Recarregar um dado', 'en-US': 'Refresh a value' },
  'events.action.refresh_all': { 'pt-BR': 'Recarregar tudo', 'en-US': 'Refresh everything' },
  'events.action.copy_variable': { 'pt-BR': 'Copiar valor entre dados', 'en-US': 'Copy between values' },
  'events.action.open_overlay': { 'pt-BR': 'Abrir janela', 'en-US': 'Open window' },
  'events.action.close_overlay': { 'pt-BR': 'Fechar janela', 'en-US': 'Close window' },
  'events.action.switch_page': { 'pt-BR': 'Trocar de página', 'en-US': 'Switch page' },
  'events.action.navigate': { 'pt-BR': 'Abrir link externo', 'en-US': 'Open external link' },
  'events.action.if': { 'pt-BR': 'Se… então… senão', 'en-US': 'If… then… else' },
  // Parâmetros (seletores populados)
  'events.param.target': { 'pt-BR': 'Dado de destino', 'en-US': 'Target value' },
  'events.param.source': { 'pt-BR': 'Dado de origem', 'en-US': 'Source value' },
  'events.param.valueSource': { 'pt-BR': 'De onde vem o valor', 'en-US': 'Value source' },
  'events.param.fixedValue': { 'pt-BR': 'Valor fixo', 'en-US': 'Fixed value' },
  'events.param.fromPayload': { 'pt-BR': 'Do evento', 'en-US': 'From event' },
  'events.param.value': { 'pt-BR': 'Valor', 'en-US': 'Value' },
  'events.param.overlay': { 'pt-BR': 'Janela', 'en-US': 'Window' },
  'events.param.page': { 'pt-BR': 'Página', 'en-US': 'Page' },
  'events.param.url': { 'pt-BR': 'Endereço (URL)', 'en-US': 'URL' },
  'events.param.openIn': { 'pt-BR': 'Abrir em', 'en-US': 'Open in' },
  'events.param.newTab': { 'pt-BR': 'Nova aba', 'en-US': 'New tab' },
  'events.param.sameTab': { 'pt-BR': 'Mesma aba', 'en-US': 'Same tab' },
  'events.param.condition': { 'pt-BR': 'Condição', 'en-US': 'Condition' },
  'events.param.then': { 'pt-BR': 'Então', 'en-US': 'Then' },
  'events.param.else': { 'pt-BR': 'Senão', 'en-US': 'Else' },
  'events.param.ifTooDeep': {
    'pt-BR': 'Aninhamento de condições muito profundo.',
    'en-US': 'Condition nesting too deep.',
  },
  'events.param.none': { 'pt-BR': 'Sem parâmetros.', 'en-US': 'No parameters.' },
  'events.param.choose': { 'pt-BR': 'Escolher…', 'en-US': 'Choose…' },
  // F2 — editor visual de botões (button-list FieldKind).
  'buttonList.empty': {
    'pt-BR': 'Sem botões ainda. Adicione um botão e escolha a Ação que ele dispara.',
    'en-US': 'No buttons yet. Add a button and pick the Action it triggers.',
  },
  'buttonList.labelPlaceholder': { 'pt-BR': 'Rótulo do botão', 'en-US': 'Button label' },
  'buttonList.remove': { 'pt-BR': 'Remover botão', 'en-US': 'Remove button' },
  'buttonList.action': { 'pt-BR': 'Ação disparada', 'en-US': 'Action triggered' },
  'buttonList.style': { 'pt-BR': 'Estilo', 'en-US': 'Style' },
  'buttonList.stylePrimary': { 'pt-BR': 'Primário', 'en-US': 'Primary' },
  'buttonList.styleGhost': { 'pt-BR': 'Secundário', 'en-US': 'Secondary' },
  'buttonList.styleDanger': { 'pt-BR': 'Perigo', 'en-US': 'Danger' },
  'buttonList.add': { 'pt-BR': '+ Adicionar botão', 'en-US': '+ Add button' },
  'buttonList.noActionWarn': {
    'pt-BR': 'Escolha uma Ação — senão o botão não faz nada.',
    'en-US': 'Pick an Action — otherwise the button does nothing.',
  },
  // F2 — editor visual de opções/abas (option-list FieldKind).
  'optionList.empty': { 'pt-BR': 'Sem opções ainda.', 'en-US': 'No options yet.' },
  'optionList.emptyTabs': { 'pt-BR': 'Sem abas ainda.', 'en-US': 'No tabs yet.' },
  'optionList.labelPlaceholder': { 'pt-BR': 'Rótulo', 'en-US': 'Label' },
  'optionList.remove': { 'pt-BR': 'Remover opção', 'en-US': 'Remove option' },
  'optionList.valuePlaceholder': { 'pt-BR': 'valor', 'en-US': 'value' },
  'optionList.tabIdPlaceholder': { 'pt-BR': 'id da aba', 'en-US': 'tab id' },
  'optionList.contentOptional': { 'pt-BR': 'Conteúdo (opcional)', 'en-US': 'Content (optional)' },
  'optionList.groupOptional': { 'pt-BR': 'Grupo (opcional)', 'en-US': 'Group (optional)' },
  'optionList.add': { 'pt-BR': '+ Adicionar opção', 'en-US': '+ Add option' },
  'optionList.addTab': { 'pt-BR': '+ Adicionar aba', 'en-US': '+ Add tab' },
  'optionList.keyRequired': {
    'pt-BR': 'Preencha o identificador — senão a opção é ignorada.',
    'en-US': 'Fill the identifier — otherwise the option is ignored.',
  },
  // F3 — mapa/globo/rede/vega (strings de runtime via useT).
  'map.countOne': { 'pt-BR': '{n} objeto no mapa', 'en-US': '{n} object on the map' },
  'map.countMany': { 'pt-BR': '{n} objetos no mapa', 'en-US': '{n} objects on the map' },
  'globe.countOne': { 'pt-BR': '{n} objeto no globo', 'en-US': '{n} object on the globe' },
  'globe.countMany': { 'pt-BR': '{n} objetos no globo', 'en-US': '{n} objects on the globe' },
  'globe.loading': { 'pt-BR': 'Carregando globo…', 'en-US': 'Loading globe…' },
  'network.empty': {
    'pt-BR': 'Selecione as variáveis de nós e arestas no Inspetor.',
    'en-US': 'Select node and edge variables in the Inspector.',
  },
  'network.loading': { 'pt-BR': 'Carregando rede…', 'en-US': 'Loading network…' },
  'vega.loading': { 'pt-BR': 'Carregando gráfico…', 'en-US': 'Loading chart…' },
  'vega.noData': { 'pt-BR': 'Sem dados para renderizar.', 'en-US': 'No data to render.' },
  'vega.configure': {
    'pt-BR': 'Escolha o tipo de gráfico e os campos no Inspetor.',
    'en-US': 'Choose the chart type and fields in the Inspector.',
  },
  'vega.fallbackNotice': {
    'pt-BR': 'Renderização simplificada (SVG).',
    'en-US': 'Simplified rendering (SVG).',
  },
  'vega.chartAria': { 'pt-BR': 'Gráfico {mark}', 'en-US': '{mark} chart' },
  'mapbox.tokenMissing': {
    'pt-BR': 'Mapa indisponível: falta o token do provedor de mapas nesta instância.',
    'en-US': 'Map unavailable: this instance is missing the map provider token.',
  },
  'mapbox.unavailable': { 'pt-BR': 'Mapa indisponível', 'en-US': 'Map unavailable' },
  'cesium.unavailable': { 'pt-BR': 'Globo indisponível', 'en-US': 'Globe unavailable' },
  // F3 — widget de imagem/galeria.
  'image.title': { 'pt-BR': 'Imagem', 'en-US': 'Image' },
  'image.empty': {
    'pt-BR': 'Sem imagem. Defina uma URL ou a propriedade do objeto no Inspetor.',
    'en-US': 'No image. Set a URL or the object property in the Inspector.',
  },
  // Painel ancorado (in-page) do AIP Arquiteto abaixo do canvas (#13).
  'solutions.arquitetoExpand': { 'pt-BR': 'Expandir o AIP Arquiteto', 'en-US': 'Expand AIP Architect' },
  'solutions.arquitetoCollapse': { 'pt-BR': 'Recolher o AIP Arquiteto', 'en-US': 'Collapse AIP Architect' },
  // Plan mode iterativo — guarda de sobreposição: uma nova proposta não
  // substitui o plano atual do canvas sem o operador confirmar.
  'solutions.arquitetoOverwritePrompt': {
    'pt-BR': 'Já existe um plano no canvas. Mesclar a nova proposta ao atual, sobrepor tudo, ou manter o atual?',
    'en-US': 'There is already a plan on the canvas. Merge the new proposal into it, overwrite everything, or keep the current one?',
  },
  'solutions.arquitetoMergeBtn': { 'pt-BR': 'Mesclar', 'en-US': 'Merge' },
  'solutions.arquitetoOverwriteBtn': { 'pt-BR': 'Sobrepor', 'en-US': 'Overwrite' },
  'solutions.arquitetoKeepBtn': { 'pt-BR': 'Manter atual', 'en-US': 'Keep current' },
  'solutions.arquitetoMergeApplied': {
    'pt-BR': 'Plano incrementado: {n} item(ns) somado(s) à operação atual.',
    'en-US': 'Plan incremented: {n} item(s) added to the current operation.',
  },
  'solutions.arquitetoMergeNoop': {
    'pt-BR': 'A nova proposta já estava contida no plano — nada a incrementar.',
    'en-US': 'The new proposal was already in the plan — nothing to add.',
  },
  'solutions.arquitetoOverwriteApplied': {
    'pt-BR': 'Plano sobreposto pela nova proposta.',
    'en-US': 'Plan overwritten with the new proposal.',
  },
  'solutions.arquitetoOverwriteKept': {
    'pt-BR': 'Mantido o plano atual; a nova proposta foi descartada.',
    'en-US': 'Current plan kept; the new proposal was discarded.',
  },
  // Plano A (2026-06-02) — artifact de diff do refactor (editar o existente).
  'solutions.refactorTitle': {
    'pt-BR': 'Alterações na estrutura existente',
    'en-US': 'Changes to the existing structure',
  },
  'solutions.refactorEmpty': {
    'pt-BR': 'Nada a alterar — a proposta já corresponde à estrutura atual.',
    'en-US': 'Nothing to change — the proposal already matches the current structure.',
  },
  'solutions.refactorAddedType': { 'pt-BR': 'Novo tipo', 'en-US': 'New type' },
  'solutions.refactorRemovedType': { 'pt-BR': 'Remover tipo', 'en-US': 'Remove type' },
  'solutions.refactorAddedProp': { 'pt-BR': 'Nova propriedade', 'en-US': 'New property' },
  'solutions.refactorRemovedProp': { 'pt-BR': 'Remover propriedade', 'en-US': 'Remove property' },
  'solutions.refactorRetypedProp': { 'pt-BR': 'Mudar tipo de', 'en-US': 'Change type of' },
  'solutions.refactorRelabeledProp': { 'pt-BR': 'Renomear rótulo', 'en-US': 'Rename label' },
  'solutions.refactorAddedLink': { 'pt-BR': 'Nova relação', 'en-US': 'New link' },
  'solutions.refactorRemovedLink': { 'pt-BR': 'Remover relação', 'en-US': 'Remove link' },
  'solutions.refactorAddedAction': { 'pt-BR': 'Nova ação', 'en-US': 'New action' },
  'solutions.refactorRemovedAction': { 'pt-BR': 'Remover ação', 'en-US': 'Remove action' },
  'solutions.refactorApplyAdditive': {
    'pt-BR': 'Aplicar alterações',
    'en-US': 'Apply changes',
  },
  'solutions.refactorDestructiveWarn': {
    'pt-BR': 'Esta proposta REMOVE estrutura existente. Confirme para aplicar — o dado das propriedades removidas é apagado de fato.',
    'en-US': 'This proposal REMOVES existing structure. Confirm to apply — data on removed properties is actually deleted.',
  },
  'solutions.refactorConfirmDestructive': {
    'pt-BR': 'Confirmar e aplicar (remove de fato)',
    'en-US': 'Confirm and apply (hard remove)',
  },
  'solutions.refactorApplied': {
    'pt-BR': 'Estrutura atualizada: {n} alteração(ões) aplicada(s).',
    'en-US': 'Structure updated: {n} change(s) applied.',
  },
  'solutions.refactorGated': {
    'pt-BR': 'Alterações aditivas aplicadas; as remoções aguardam sua confirmação.',
    'en-US': 'Additive changes applied; removals are awaiting your confirmation.',
  },
  'solutions.refactorTriggerBtn': {
    'pt-BR': 'Aplicar à estrutura existente',
    'en-US': 'Apply to existing structure',
  },
  // Guia visual do AIP (modal de ajuda no cabeçalho do painel).
  'solutions.helpOpen': { 'pt-BR': 'Como usar o AIP', 'en-US': 'How to use AIP' },
  'solutions.helpTitle': { 'pt-BR': 'Como usar o AIP', 'en-US': 'How to use AIP' },
  'solutions.helpSubtitle': {
    'pt-BR': 'Do pedido ao painel pronto, em quatro passos.',
    'en-US': 'From request to a finished panel, in four steps.',
  },
  'solutions.helpClose': { 'pt-BR': 'Fechar', 'en-US': 'Close' },
  // 1 — o ciclo
  'solutions.helpCycleTitle': { 'pt-BR': 'O ciclo', 'en-US': 'The cycle' },
  'solutions.helpCycle1': { 'pt-BR': 'Você descreve', 'en-US': 'You describe' },
  'solutions.helpCycle1d': {
    'pt-BR': 'Conte a operação em linguagem natural.',
    'en-US': 'Describe the operation in plain language.',
  },
  'solutions.helpCycle2': { 'pt-BR': 'O AIP desenha', 'en-US': 'AIP draws it' },
  'solutions.helpCycle2d': {
    'pt-BR': 'Vira um diagrama de quatro fases.',
    'en-US': 'It becomes a four-phase diagram.',
  },
  'solutions.helpCycle3': { 'pt-BR': 'Você refina', 'en-US': 'You refine' },
  'solutions.helpCycle3d': {
    'pt-BR': 'Ajusta no chat — mesclar, sobrepor ou manter.',
    'en-US': 'Adjust in the chat — merge, overwrite or keep.',
  },
  'solutions.helpCycle4': { 'pt-BR': 'Construir', 'en-US': 'Build' },
  'solutions.helpCycle4d': {
    'pt-BR': 'Materializa Espaço, Operação, Sala e Páginas.',
    'en-US': 'Materializes Space, Operation, Room and Pages.',
  },
  // 2 — as quatro fases
  'solutions.helpPhasesTitle': {
    'pt-BR': 'As quatro fases do diagrama',
    'en-US': "The diagram's four phases",
  },
  'solutions.helpPhaseColeta': { 'pt-BR': 'Coleta', 'en-US': 'Collection' },
  'solutions.helpPhaseColetaD': {
    'pt-BR': 'De onde vêm os dados.',
    'en-US': 'Where the data comes from.',
  },
  'solutions.helpPhaseProc': { 'pt-BR': 'Processamento', 'en-US': 'Processing' },
  'solutions.helpPhaseProcD': {
    'pt-BR': 'Funções de IA: classifica, resume, correlaciona.',
    'en-US': 'AI functions: classify, summarize, correlate.',
  },
  'solutions.helpPhaseOnto': { 'pt-BR': 'Ontologia', 'en-US': 'Ontology' },
  'solutions.helpPhaseOntoD': {
    'pt-BR': 'Os tipos de objeto e suas relações.',
    'en-US': 'The object types and their relations.',
  },
  'solutions.helpPhaseApp': { 'pt-BR': 'Aplicação', 'en-US': 'Application' },
  'solutions.helpPhaseAppD': {
    'pt-BR': 'O painel entregue ao operador.',
    'en-US': 'The panel delivered to the operator.',
  },
  // 3 — como pedir bem
  'solutions.helpAskTitle': { 'pt-BR': 'Como pedir bem', 'en-US': 'How to ask well' },
  'solutions.helpAskIntro': {
    'pt-BR': 'Quanto mais específico, melhor o diagrama. Inclua:',
    'en-US': 'The more specific, the better the diagram. Include:',
  },
  'solutions.helpAskProduct': { 'pt-BR': 'Produto final', 'en-US': 'End product' },
  'solutions.helpAskProductD': {
    'pt-BR': 'painel, relatório ou dossiê',
    'en-US': 'panel, report or dossier',
  },
  'solutions.helpAskSource': { 'pt-BR': 'Fonte de dados', 'en-US': 'Data source' },
  'solutions.helpAskSourceD': {
    'pt-BR': 'CCTV, cadastros, OSINT…',
    'en-US': 'CCTV, records, OSINT…',
  },
  'solutions.helpAskMonitor': { 'pt-BR': 'O que monitorar', 'en-US': 'What to monitor' },
  'solutions.helpAskMonitorD': {
    'pt-BR': 'entidades, ocorrências, correlações',
    'en-US': 'entities, incidents, correlations',
  },
  'solutions.helpAskCode': { 'pt-BR': 'Preferência', 'en-US': 'Preference' },
  'solutions.helpAskCodeD': {
    'pt-BR': 'sem código ou com código',
    'en-US': 'no-code or with code',
  },
  'solutions.helpAskVagueLabel': { 'pt-BR': 'Vago', 'en-US': 'Vague' },
  'solutions.helpAskVague': {
    'pt-BR': 'monitorar umas coisas no sistema',
    'en-US': 'monitor some things in the system',
  },
  'solutions.helpAskGoodLabel': { 'pt-BR': 'Bom', 'en-US': 'Good' },
  'solutions.helpAskGood': {
    'pt-BR': 'painel de portaria: moradores, visitantes e leitura de placas (LPR); fonte CCTV; sem código',
    'en-US': 'gatehouse panel: residents, visitors and plate reading (LPR); source CCTV; no-code',
  },
  // 4 — refinar sem perder
  'solutions.helpRefineTitle': {
    'pt-BR': 'Refinar sem perder o trabalho',
    'en-US': 'Refine without losing work',
  },
  'solutions.helpRefineMergeD': {
    'pt-BR': 'incrementa a proposta ao plano atual',
    'en-US': 'adds the proposal to the current plan',
  },
  'solutions.helpRefineOverwriteD': {
    'pt-BR': 'troca o plano todo pela proposta',
    'en-US': 'replaces the whole plan with the proposal',
  },
  'solutions.helpRefineKeepD': {
    'pt-BR': 'descarta a proposta',
    'en-US': 'discards the proposal',
  },
  'solutions.helpRefineUndo': { 'pt-BR': 'Desfazer', 'en-US': 'Undo' },
  'solutions.helpRefineUndoD': {
    'pt-BR': 'volta como estava, a qualquer passo',
    'en-US': 'reverts to how it was, at any step',
  },
  // 5 — construir
  'solutions.helpBuildTitle': { 'pt-BR': 'Construir a operação', 'en-US': 'Build the operation' },
  'solutions.helpBuildSpace': { 'pt-BR': 'Espaço', 'en-US': 'Space' },
  'solutions.helpBuildSpaceD': {
    'pt-BR': 'a fronteira (um site, um cliente)',
    'en-US': 'the boundary (a site, a client)',
  },
  'solutions.helpBuildOp': { 'pt-BR': 'Operação', 'en-US': 'Operation' },
  'solutions.helpBuildRoom': { 'pt-BR': 'Sala', 'en-US': 'Room' },
  'solutions.helpBuildPages': { 'pt-BR': 'Páginas', 'en-US': 'Pages' },
  'solutions.helpBuildNote': {
    'pt-BR': 'Você confirma o Espaço; as páginas são publicadas e a Sala vai para o menu.',
    'en-US': 'You confirm the Space; pages are published and the Room goes to the menu.',
  },
  // 6 — exemplos prontos
  'solutions.helpExamplesTitle': { 'pt-BR': 'Exemplos prontos', 'en-US': 'Ready-made examples' },
  'solutions.helpExamplesHint': {
    'pt-BR': 'Copie, cole no chat e ajuste.',
    'en-US': 'Copy, paste in the chat and adjust.',
  },
  'solutions.helpExampleCondoLabel': { 'pt-BR': 'Condomínio', 'en-US': 'Condominium' },
  'solutions.helpExampleCondo': {
    'pt-BR': 'Painel de gestão de condomínio: cadastro de moradores, unidades e veículos; ocorrências nas áreas comuns; fonte: cadastros internos e CCTV; sem código.',
    'en-US': 'Condominium management panel: register of residents, units and vehicles; incidents in common areas; source: internal records and CCTV; no-code.',
  },
  'solutions.helpExamplePortariaLabel': { 'pt-BR': 'Portaria / LPR', 'en-US': 'Gatehouse / LPR' },
  'solutions.helpExamplePortaria': {
    'pt-BR': 'Painel de portaria: visitantes, encomendas e leitura de placas (LPR); alertas de acesso; fonte: CCTV; sem código.',
    'en-US': 'Gatehouse panel: visitors, deliveries and plate reading (LPR); access alerts; source: CCTV; no-code.',
  },
  'solutions.helpExampleSegLabel': { 'pt-BR': 'Segurança pública', 'en-US': 'Public safety' },
  'solutions.helpExampleSeg': {
    'pt-BR': 'Painel de ocorrências: viaturas, incidentes e locais; correlacionar por região; fonte: despachos e CCTV; sem código.',
    'en-US': 'Incident panel: patrol cars, incidents and places; correlate by region; source: dispatches and CCTV; no-code.',
  },
  'solutions.helpCopy': { 'pt-BR': 'Copiar', 'en-US': 'Copy' },
  'solutions.helpCopied': { 'pt-BR': 'Copiado', 'en-US': 'Copied' },
  'solutions.openPreview': { 'pt-BR': 'Ver', 'en-US': 'Preview' },
  'solutions.useAsBase': { 'pt-BR': 'Usar', 'en-US': 'Use' },
  'solutions.nodeTitle': { 'pt-BR': 'Título', 'en-US': 'Title' },
  'solutions.nodeDescription': { 'pt-BR': 'Descrição', 'en-US': 'Description' },
  'solutions.deleteNode': { 'pt-BR': 'Excluir nó', 'en-US': 'Delete node' },
  'solutions.fromLineage': { 'pt-BR': 'Carregar do histórico', 'en-US': 'Load from lineage' },
  // M4-REWORK — toolbar de navegação + biblioteca 3-cat + controles por nó.
  'solutions.diagramDescription': { 'pt-BR': 'Descrição do diagrama', 'en-US': 'Diagram description' },
  'solutions.undo': { 'pt-BR': 'Desfazer', 'en-US': 'Undo' },
  'solutions.redo': { 'pt-BR': 'Refazer', 'en-US': 'Redo' },
  'solutions.import': { 'pt-BR': 'Importar', 'en-US': 'Import' },
  'solutions.export': { 'pt-BR': 'Exportar', 'en-US': 'Export' },
  'solutions.catIndustry': { 'pt-BR': 'Verticais', 'en-US': 'Industry' },
  'solutions.catTechnical': { 'pt-BR': 'Técnicos', 'en-US': 'Technical' },
  'solutions.catWorkflow': { 'pt-BR': 'Fluxos', 'en-US': 'Workflow' },
  'solutions.componentInfo': { 'pt-BR': 'Sobre o componente', 'en-US': 'Component information' },
  'solutions.about': { 'pt-BR': 'Sobre', 'en-US': 'About' },
  'solutions.documentation': { 'pt-BR': 'Documentação', 'en-US': 'Documentation' },
  'solutions.example': { 'pt-BR': 'Exemplo', 'en-US': 'Example' },

  // Dicas curtas por componente da paleta (#18) — subtítulo sob cada nó para
  // o operador entender o que cada um faz, sem expor o ``kind`` cru.
  'solutions.hint.external': {
    'pt-BR': 'Origem externa de dados (API, banco, feed).',
    'en-US': 'External data source (API, database, feed).',
  },
  'solutions.hint.connector': {
    'pt-BR': 'Ingestão agendada, sem programar.',
    'en-US': 'Scheduled ingestion, no coding.',
  },
  'solutions.hint.worker': {
    'pt-BR': 'Coletor dedicado para fontes complexas.',
    'en-US': 'Dedicated collector for complex sources.',
  },
  'solutions.hint.dataset': {
    'pt-BR': 'Conjunto de dados de uma etapa.',
    'en-US': 'Dataset produced by a step.',
  },
  'solutions.hint.pipeline': {
    'pt-BR': 'Limpa, normaliza e enriquece os dados.',
    'en-US': 'Cleans, normalizes and enriches data.',
  },
  'solutions.hint.logic': {
    'pt-BR': 'Classifica, resume ou correlaciona.',
    'en-US': 'Classifies, summarizes or correlates.',
  },
  'solutions.hint.ontology_type': {
    'pt-BR': 'Entidade do domínio e seus vínculos.',
    'en-US': 'Domain entity and its links.',
  },
  'solutions.hint.workspace': {
    'pt-BR': 'Painel final entregue ao operador.',
    'en-US': 'Final panel delivered to the operator.',
  },
  'solutions.hint.tour': {
    'pt-BR': 'Roteiro guiado passo a passo.',
    'en-US': 'Step-by-step guided walkthrough.',
  },

  // ─── Solutions · "Salvar e Construir" (L17 · 2026-05-24) ─────────────
  'solutions.saveBuild': { 'pt-BR': 'Construir', 'en-US': 'Build' },
  'solutions.moreActions': { 'pt-BR': 'Mais ações', 'en-US': 'More actions' },
  'solutions.leftPaneTitle': { 'pt-BR': 'Catálogo', 'en-US': 'Catalog' },
  'solutions.mySaves': { 'pt-BR': 'Meus saves', 'en-US': 'My saves' },
  'solutions.noSavesYet': { 'pt-BR': 'Nenhum diagrama salvo ainda.', 'en-US': 'No saved diagrams yet.' },
  'solutions.untitledOperation': { 'pt-BR': 'Operação sem título', 'en-US': 'Untitled operation' },
  'solutions.nodesShort': { 'pt-BR': 'nós', 'en-US': 'nodes' },
  'solutions.materializeTitle': {
    'pt-BR': 'Construir a operação',
    'en-US': 'Build the operation',
  },
  'solutions.materializeSubtitle': {
    'pt-BR': 'Selecione o que materializar. Cada item vira um recurso real da plataforma.',
    'en-US': 'Pick what to materialize. Each item becomes a real platform resource.',
  },
  'solutions.build': { 'pt-BR': 'Construir', 'en-US': 'Build' },
  'solutions.building': { 'pt-BR': 'Construindo…', 'en-US': 'Building…' },
  'solutions.loadingBlueprint': {
    'pt-BR': 'Preparando proposta…',
    'en-US': 'Preparing proposal…',
  },
  'solutions.grpOperation': { 'pt-BR': 'Operação', 'en-US': 'Operation' },
  'solutions.grpAgents': { 'pt-BR': 'Agentes', 'en-US': 'Agents' },
  // #2 — agentes propostos amarram skills reais (fonte de coleta/ingestão).
  'solutions.agentSource': { 'pt-BR': 'Fonte', 'en-US': 'Source' },
  'solutions.skillReady': { 'pt-BR': 'pronta', 'en-US': 'ready' },
  'solutions.skillNeedsActivation': { 'pt-BR': 'requer ativação', 'en-US': 'needs activation' },
  'solutions.activateSkill': { 'pt-BR': 'Ativar skill', 'en-US': 'Activate skill' },
  'solutions.activateToConfig': {
    'pt-BR': 'Esta capacidade precisa ser ativada para carregar e configurar os parâmetros.',
    'en-US': 'This capability must be activated to load and configure its parameters.',
  },
  'solutions.activateSkillHint': {
    'pt-BR':
      'Instala esta skill no gateway e a registra para os agentes — sem precisar de terminal nem reiniciar nada. Depois de ativada, o agente coleta desta fonte.',
    'en-US':
      'Installs this skill into the gateway and registers it for agents — no terminal or restart needed. Once active, the agent collects from this source.',
  },
  'solutions.activateFailed': {
    'pt-BR': 'Não foi possível ativar a skill agora.',
    'en-US': 'Could not activate the skill right now.',
  },
  'solutions.grpFlows': { 'pt-BR': 'Fluxos', 'en-US': 'Flows' },
  'solutions.grpObjectTypes': { 'pt-BR': 'Tipos de objeto', 'en-US': 'Object types' },
  'solutions.grpLinks': { 'pt-BR': 'Relações', 'en-US': 'Relations' },
  'solutions.grpSpace': { 'pt-BR': 'Espaço (fronteira)', 'en-US': 'Space (boundary)' },
  'solutions.spaceNew': { 'pt-BR': 'Criar novo Espaço (proposto)', 'en-US': 'Create new Space (proposed)' },
  'solutions.spaceNewHint': { 'pt-BR': 'cria uma fronteira nova p/ a operação', 'en-US': 'creates a fresh boundary for the operation' },
  'solutions.spaceExisting': { 'pt-BR': 'Usar Espaço existente', 'en-US': 'Use existing Space' },
  'solutions.spaceExistingHint': { 'pt-BR': 'reaproveita um Espaço já criado', 'en-US': 'reuses an already-created Space' },
  'solutions.spaceCurrent': { 'pt-BR': 'Espaço do contexto atual', 'en-US': 'Current context Space' },
  'solutions.spaceCurrentHint': { 'pt-BR': 'usa o Espaço onde você está', 'en-US': 'uses the Space you are in' },
  'solutions.spaceNone': { 'pt-BR': 'Nenhum (tenant-wide)', 'en-US': 'None (tenant-wide)' },
  'solutions.spaceNoneHint': { 'pt-BR': 'sem fronteira — visível a todo o tenant', 'en-US': 'no boundary — visible tenant-wide' },
  'solutions.publishAndSurface': { 'pt-BR': 'Publicar e disponibilizar (páginas + Sala no menu)', 'en-US': 'Publish and surface (pages + Sala in menu)' },
  'workshop.buildWithArchitect': { 'pt-BR': 'Construir com Arquiteto', 'en-US': 'Build with Architect' },
  'solutions.grpAiFunctions': { 'pt-BR': 'Funções de IA', 'en-US': 'AI functions' },
  'solutions.grpActions': { 'pt-BR': 'Ações', 'en-US': 'Actions' },
  'solutions.actionRunnable': { 'pt-BR': 'executável', 'en-US': 'runnable' },
  'solutions.actionCustom': { 'pt-BR': 'personalizar', 'en-US': 'customize' },
  'solutions.grpWorkspace': { 'pt-BR': 'Painel (Sala)', 'en-US': 'Panel (Room)' },
  'solutions.workspaceRowLabel': {
    'pt-BR': 'Painel inicial da operação',
    'en-US': 'Initial operation panel',
  },
  // Sprint L18 (2026-05-24) — Workshop App + Páginas como entidades reais.
  'solutions.grpApp': { 'pt-BR': 'Aplicação', 'en-US': 'Application' },
  'solutions.grpPages': { 'pt-BR': 'Páginas', 'en-US': 'Pages' },
  'solutions.appRowLabel': {
    'pt-BR': 'Aplicação composta da operação',
    'en-US': 'Operation composite application',
  },
  'solutions.grpWidgets': { 'pt-BR': 'Componentes', 'en-US': 'Components' },
  'solutions.grpSources': { 'pt-BR': 'Fontes vinculadas', 'en-US': 'Linked sources' },
  // B (#1) — status humano por fonte no resultado da construção.
  'solutions.srcActionTyped': { 'pt-BR': '{n} objetos criados', 'en-US': '{n} objects created' },
  'solutions.srcActionScheduled': { 'pt-BR': 'ingestão agendada', 'en-US': 'ingestion scheduled' },
  'solutions.srcActionBound': { 'pt-BR': 'amarrada à operação', 'en-US': 'bound to operation' },
  'solutions.srcActionProvenance': { 'pt-BR': 'proveniência', 'en-US': 'provenance' },
  'solutions.viewApps': { 'pt-BR': 'Ver aplicações', 'en-US': 'View applications' },
  'solutions.viewPages': { 'pt-BR': 'Ver páginas', 'en-US': 'View pages' },
  'solutions.selectAll': { 'pt-BR': 'Selecionar tudo', 'en-US': 'Select all' },
  'solutions.selectNone': { 'pt-BR': 'Limpar seleção', 'en-US': 'Clear selection' },
  'solutions.nothingSelected': {
    'pt-BR': 'Selecione ao menos um item para construir.',
    'en-US': 'Select at least one item to build.',
  },
  'solutions.buildResult': { 'pt-BR': 'Resultado da construção', 'en-US': 'Build result' },
  'solutions.buildSuccess': {
    'pt-BR': 'Operação construída com sucesso.',
    'en-US': 'Operation built successfully.',
  },
  'solutions.buildPartial': {
    'pt-BR': 'Construção concluída com pendências.',
    'en-US': 'Build finished with issues.',
  },
  'solutions.createdCounts': { 'pt-BR': 'Criados', 'en-US': 'Created' },
  'solutions.failures': { 'pt-BR': 'Falhas', 'en-US': 'Failures' },
  // T2 — avisos não-fatais da construção (clamp de parâmetros de skill).
  'solutions.warnings': { 'pt-BR': 'Parâmetros ajustados', 'en-US': 'Parameters adjusted' },
  'solutions.warningsHint': {
    'pt-BR':
      'Valores fora dos limites declarados foram ajustados automaticamente; a construção seguiu com os valores válidos.',
    'en-US':
      'Values outside the declared limits were adjusted automatically; the build proceeded with the valid values.',
  },
  'solutions.viewOperations': { 'pt-BR': 'Ver operações', 'en-US': 'View operations' },
  'solutions.noBlueprint': {
    'pt-BR': 'Não há proposta para este diagrama. Gere o diagrama pelo planejamento.',
    'en-US': 'No proposal for this diagram. Generate it via planning.',
  },

  // ─── #4/#5/#7 — node inspector, AIP assist context, audit history ────
  'solutions.closeInspector': {
    'pt-BR': 'Fechar configuração do nó',
    'en-US': 'Close node configuration',
  },
  'solutions.aboutNodeKind': { 'pt-BR': 'Tipo do componente', 'en-US': 'Component type' },
  'solutions.aboutNodePhase': { 'pt-BR': 'Fase', 'en-US': 'Phase' },
  'solutions.aboutNodePurpose': { 'pt-BR': 'Para que serve', 'en-US': 'Purpose' },
  'solutions.aboutNodeProposes': {
    'pt-BR': 'O que este nó carrega',
    'en-US': 'What this node carries',
  },
  'solutions.aboutNodeProposesEmpty': {
    'pt-BR': 'Sem itens propostos. Selecione uma implementação ou gere o modelo.',
    'en-US': 'No proposed items. Select an implementation or generate the model.',
  },
  'solutions.aboutNodeSettings': { 'pt-BR': 'Configuração atual', 'en-US': 'Current settings' },
  'solutions.askAipAbout': {
    'pt-BR': 'Pergunte ao AIP Arquiteto sobre este nó: o que ele faz, como configurá-lo e como ele se conecta ao restante da operação.',
    'en-US': 'Ask the AIP Architect about this node: what it does, how to configure it, and how it connects to the rest of the operation.',
  },
  // Histórico — auditoria das gerações do AIP Arquiteto (read-only).
  'solutions.history': { 'pt-BR': 'Histórico', 'en-US': 'History' },
  'solutions.historyTitle': {
    'pt-BR': 'Histórico do AIP Arquiteto',
    'en-US': 'AIP Architect history',
  },
  'solutions.historySubtitle': {
    'pt-BR': 'Gerações e construções auditadas para esta unidade.',
    'en-US': 'Audited generations and builds for this unit.',
  },
  'solutions.historyEmpty': {
    'pt-BR': 'Nenhuma geração registrada ainda. Planeje uma operação para criar o histórico.',
    'en-US': 'No generations recorded yet. Plan an operation to build the history.',
  },
  'solutions.historyKindDesign': { 'pt-BR': 'Diagrama gerado', 'en-US': 'Diagram generated' },
  'solutions.historyKindMaterialize': { 'pt-BR': 'Operação construída', 'en-US': 'Operation built' },
  'solutions.historyActor': { 'pt-BR': 'Por', 'en-US': 'By' },
  'solutions.historyModel': { 'pt-BR': 'Modelo', 'en-US': 'Model' },
  'solutions.historyBrief': { 'pt-BR': 'Briefing', 'en-US': 'Brief' },
  'solutions.historyResult': { 'pt-BR': 'Resultado', 'en-US': 'Result' },
  'solutions.historyReopen': { 'pt-BR': 'Reabrir no Arquiteto', 'en-US': 'Reopen in Architect' },
  'solutions.historyGenerated': { 'pt-BR': 'Gerado', 'en-US': 'Generated' },
  'solutions.historyReload': { 'pt-BR': 'Recarregar', 'en-US': 'Reload' },
  'solutions.leftPaneToggle': { 'pt-BR': 'Componentes', 'en-US': 'Components' },
  'solutions.historyShowMore': { 'pt-BR': 'Mostrar mais', 'en-US': 'Show more' },
  'solutions.canvasPanel': { 'pt-BR': 'Diagrama', 'en-US': 'Diagram' },
  'solutions.canvasPanelEmpty': { 'pt-BR': 'vazio', 'en-US': 'empty' },
  'solutions.arquitetoDock': { 'pt-BR': 'Posição do painel', 'en-US': 'Panel position' },
  'solutions.arquitetoDock_left': { 'pt-BR': 'Ancorar à esquerda', 'en-US': 'Dock left' },
  'solutions.arquitetoDock_top': { 'pt-BR': 'Ancorar acima', 'en-US': 'Dock top' },
  'solutions.arquitetoDock_bottom': { 'pt-BR': 'Ancorar abaixo', 'en-US': 'Dock bottom' },
  'solutions.arquitetoDock_right': { 'pt-BR': 'Ancorar à direita', 'en-US': 'Dock right' },
  'solutions.connectData': { 'pt-BR': 'Fontes de dados deste nó', 'en-US': 'Data sources for this node' },
  'solutions.connectLinked': { 'pt-BR': 'Conectado a', 'en-US': 'Connected to' },
  'solutions.connectAddSource': { 'pt-BR': '+ Adicionar fonte…', 'en-US': '+ Add source…' },
  'solutions.connectCount': { 'pt-BR': 'Fontes vinculadas ({n})', 'en-US': 'Linked sources ({n})' },
  'solutions.connectNone': {
    'pt-BR': 'Este nó ainda não está ligado a dados reais. Vincule algo pronto, crie agora ou suba um arquivo pequeno.',
    'en-US': 'This node is not wired to real data yet. Link something existing, create now, or upload a small file.',
  },
  'solutions.connectExisting': { 'pt-BR': 'Vincular existente', 'en-US': 'Link existing' },
  'solutions.connectExistingPick': { 'pt-BR': 'Selecione fonte, conector ou dataset', 'en-US': 'Pick a source, connector or dataset' },
  'solutions.connectGroupSources': { 'pt-BR': 'Fontes de dados', 'en-US': 'Data sources' },
  'solutions.connectGroupConnectors': { 'pt-BR': 'Conectores', 'en-US': 'Connectors' },
  'solutions.connectGroupDatasets': { 'pt-BR': 'Datasets', 'en-US': 'Datasets' },
  'solutions.connectNoOptions': {
    'pt-BR': 'Nada cadastrado ainda — use "Criar agora" ou suba um arquivo.',
    'en-US': 'Nothing registered yet — use "Create now" or upload a file.',
  },
  'solutions.connectCreate': { 'pt-BR': 'Criar agora no hub Dados', 'en-US': 'Create now in the Data hub' },
  'solutions.connectCreateConnector': { 'pt-BR': 'Novo conector', 'en-US': 'New connector' },
  'solutions.connectCreateDataset': { 'pt-BR': 'Novo dataset', 'en-US': 'New dataset' },
  'solutions.connectCreateMedia': { 'pt-BR': 'Subir mídia', 'en-US': 'Upload media' },
  'solutions.connectUpload': { 'pt-BR': 'Subir arquivo pequeno', 'en-US': 'Upload small file' },
  'solutions.connectUploadHint': {
    'pt-BR': 'CSV, JSON ou texto até 2 MB — entra governado: fonte, ativo com hash e linhagem.',
    'en-US': 'CSV, JSON or text up to 2 MB — governed path: source, hashed asset and lineage.',
  },
  'solutions.connectUploadDone': { 'pt-BR': 'Arquivo ingerido e vinculado', 'en-US': 'File ingested and linked' },
  'solutions.connectUnlink': { 'pt-BR': 'Desvincular', 'en-US': 'Unlink' },
  'solutions.connectTooBig': { 'pt-BR': 'Arquivo acima de 2 MB — use o hub Dados.', 'en-US': 'File above 2 MB — use the Data hub.' },
  'solutions.connectKind_fonte': { 'pt-BR': 'fonte', 'en-US': 'source' },
  'solutions.connectKind_conector': { 'pt-BR': 'conector', 'en-US': 'connector' },
  'solutions.connectKind_dataset': { 'pt-BR': 'dataset', 'en-US': 'dataset' },
  // INFERÊNCIA — modelo + prompt no nó de Processamento.
  'solutions.inference': { 'pt-BR': 'Inferência', 'en-US': 'Inference' },
  'solutions.inferenceHint': {
    'pt-BR': 'A análise de IA deste passo: qual MODELO roda e com qual PROMPT. O prompt já vem proposto pelo AIP — edite à vontade. A inferência roda com o que você definir aqui.',
    'en-US': 'The AI analysis of this step: which MODEL runs and with which PROMPT. The prompt comes pre-filled by the AIP — edit freely. The inference runs with what you set here.',
  },
  'solutions.inferenceModel': { 'pt-BR': 'Modelo', 'en-US': 'Model' },
  'solutions.inferenceModelDefault': { 'pt-BR': 'Modelo padrão do tenant', 'en-US': 'Tenant default model' },
  'solutions.inferenceModelSearch': { 'pt-BR': 'Buscar modelo…', 'en-US': 'Search model…' },
  // Fase 3c — o nó usa o modelo padrão de "Agentes" (config central em Dados › Modelos).
  'solutions.inferenceModelConfigure': { 'pt-BR': 'Configurar em Modelos', 'en-US': 'Configure in Models' },
  'solutions.inferenceModelCentralHint': {
    'pt-BR': 'Usa o modelo padrão de Agentes. Altere em Dados › Modelos — vale para todos os nós.',
    'en-US': 'Uses the default Agents model. Change it in Data › Models — applies to all nodes.',
  },
  'solutions.inferenceVariableNamePlaceholder': { 'pt-BR': 'ex.: severidade', 'en-US': 'e.g. severity' },
  'solutions.varKindStatic': { 'pt-BR': 'Valor fixo', 'en-US': 'Fixed value' },
  'solutions.varKindStaticHint': { 'pt-BR': 'literal (ex.: "alta")', 'en-US': 'literal (e.g. "high")' },
  'solutions.varKindObjectSet': { 'pt-BR': 'Busca de objetos', 'en-US': 'Object search' },
  'solutions.varKindObjectSetHint': { 'pt-BR': 'consulta a ontologia', 'en-US': 'queries the ontology' },
  'solutions.varKindExpression': { 'pt-BR': 'Expressão', 'en-US': 'Expression' },
  'solutions.varKindExpressionHint': { 'pt-BR': 'fórmula com variáveis', 'en-US': 'formula with variables' },
  'solutions.aggCount': { 'pt-BR': 'Contagem', 'en-US': 'Count' },
  'solutions.aggDistinct': { 'pt-BR': 'Contagem distinta', 'en-US': 'Distinct count' },
  'solutions.aggSum': { 'pt-BR': 'Soma', 'en-US': 'Sum' },
  'solutions.aggAvg': { 'pt-BR': 'Média', 'en-US': 'Average' },
  'solutions.aggMin': { 'pt-BR': 'Mínimo', 'en-US': 'Minimum' },
  'solutions.aggMax': { 'pt-BR': 'Máximo', 'en-US': 'Maximum' },
  'solutions.inferenceVariableValuePlaceholder': { 'pt-BR': 'valor fixo (ex.: alta) ou deixe vazio', 'en-US': 'fixed value (e.g. high) or leave empty' },
  'solutions.instancesShort': { 'pt-BR': 'instâncias', 'en-US': 'instances' },
  'solutions.searchOption': { 'pt-BR': 'Buscar…', 'en-US': 'Search…' },
  'solutions.inferencePrompt': { 'pt-BR': 'Prompt', 'en-US': 'Prompt' },
  'solutions.inferencePromptPlaceholder': {
    'pt-BR': 'Instruções da análise (ex.: "Analise a bio e os 5 posts e gere um perfil com…")',
    'en-US': 'Analysis instructions (e.g. "Analyze the bio and 5 posts and produce a profile with…")',
  },
  // Fonte de coleta (agente + parâmetros) — o nó lidera pela skill proposta.
  'solutions.coletaAgent': { 'pt-BR': 'Coleta via', 'en-US': 'Collects via' },
  'solutions.coletaNoParams': {
    'pt-BR': 'Esta fonte não pede parâmetros — já está pronta para coletar.',
    'en-US': 'This source takes no parameters — it is ready to collect.',
  },
  'solutions.connectAdvanced': { 'pt-BR': 'Outras fontes (avançado)', 'en-US': 'Other sources (advanced)' },
  // Catálogo de capacidades de Coleta (estilo Foundry: buscável, por categoria).
  'solutions.coletaCatalogTitle': {
    'pt-BR': 'Fonte de coleta',
    'en-US': 'Collection source',
  },
  'solutions.coletaCatalogHint': {
    'pt-BR': 'Escolha de qual capacidade este nó coleta. Navegue por categoria ou busque pelo nome.',
    'en-US': 'Pick which capability this node collects from. Browse by category or search by name.',
  },
  'solutions.coletaCatalogSearch': {
    'pt-BR': 'Buscar capacidade…',
    'en-US': 'Search capability…',
  },
  'solutions.coletaCatalogEmpty': {
    'pt-BR': 'Nenhuma capacidade corresponde à busca.',
    'en-US': 'No capability matches your search.',
  },
  'solutions.coletaCatalogLoading': {
    'pt-BR': 'Carregando capacidades…',
    'en-US': 'Loading capabilities…',
  },
  'solutions.coletaSuggested': {
    'pt-BR': 'Sugerido pelo AIP',
    'en-US': 'Suggested by AIP',
  },
  'solutions.coletaSelected': {
    'pt-BR': 'Adicionada',
    'en-US': 'Added',
  },
  'solutions.coletaSkillsTitle': {
    'pt-BR': 'Skills desta coleta',
    'en-US': 'Skills in this collection',
  },
  'solutions.coletaSkillRemove': {
    'pt-BR': 'Remover skill',
    'en-US': 'Remove skill',
  },
  'solutions.coletaRunSample': { 'pt-BR': 'Rodar amostra', 'en-US': 'Run sample' },
  // ▶ Play por nó — validar/rodar cada nó antes de Construir.
  'solutions.nodePlay': { 'pt-BR': 'Validar nó (play)', 'en-US': 'Validate node (play)' },
  'solutions.playRunning': { 'pt-BR': 'Validando…', 'en-US': 'Validating…' },
  'solutions.playCheckSource': { 'pt-BR': 'Fonte de coleta configurada', 'en-US': 'Collection source configured' },
  'solutions.playFixSource': { 'pt-BR': 'Escolha uma fonte de coleta neste nó (ex.: Instagram, X, Conector HTTP).', 'en-US': 'Pick a collection source on this node (e.g. Instagram, X, HTTP Connector).' },
  'solutions.playCheckRecords': { 'pt-BR': '{n} objetos reais coletados', 'en-US': '{n} real objects collected' },
  'solutions.playFixRecords': { 'pt-BR': 'A coleta rodou mas não trouxe objetos — ajuste o termo/parâmetros da fonte.', 'en-US': 'Collection ran but returned no objects — adjust the source term/params.' },
  'solutions.playCheckRun': { 'pt-BR': 'Coleta executada', 'en-US': 'Collection executed' },
  'solutions.playFixRun': { 'pt-BR': 'A fonte falhou ao executar — verifique a sessão/credencial e tente de novo.', 'en-US': 'The source failed to run — check the session/credential and retry.' },
  'solutions.playCheckProcType': { 'pt-BR': 'Tipo de objeto processado definido', 'en-US': 'Processed object type set' },
  'solutions.playFixProcType': { 'pt-BR': 'Defina o "Tipo de objeto processado" no nó de Processamento.', 'en-US': 'Set the "Processed object type" on the Processing node.' },
  'solutions.playCheckProcModel': { 'pt-BR': 'Modelo de IA escolhido', 'en-US': 'AI model selected' },
  'solutions.playFixProcModel': { 'pt-BR': 'Escolha um modelo em Inferência.', 'en-US': 'Pick a model under Inference.' },
  'solutions.playCheckProcPrompt': { 'pt-BR': 'Prompt da inferência preenchido', 'en-US': 'Inference prompt filled' },
  'solutions.playFixProcPrompt': { 'pt-BR': 'Escreva o prompt da inferência (pode usar {{campos}}).', 'en-US': 'Write the inference prompt (you can use {{fields}}).' },
  'solutions.playCheckProcOut': { 'pt-BR': 'Propriedade de saída definida', 'en-US': 'Output property set' },
  'solutions.playFixProcOut': { 'pt-BR': 'Defina a propriedade onde o resultado da IA será gravado.', 'en-US': 'Set the property where the AI result is written.' },
  'solutions.playCheckProcTransformer': { 'pt-BR': 'Transformador (código) atachado', 'en-US': 'Transformer (code) attached' },
  'solutions.playFixProc': { 'pt-BR': 'Complete a Inferência (modelo + prompt + saída) OU atache um Transformador (código) com tipo de saída.', 'en-US': 'Complete the Inference (model + prompt + output) OR attach a code Transformer with an output type.' },
  'solutions.playCheckOntoTypes': { 'pt-BR': '{n} tipos de objeto propostos', 'en-US': '{n} proposed object types' },
  'solutions.playFixOnto': { 'pt-BR': 'Gere o modelo de dados (tipos de objeto) no nó de Ontologia.', 'en-US': 'Generate the data model (object types) on the Ontology node.' },
  'solutions.playCheckApp': { 'pt-BR': 'Aplicação com páginas e widgets', 'en-US': 'App with pages and widgets' },
  'solutions.playFixApp': { 'pt-BR': 'O plano ainda não tem páginas/widgets — aprofunde a operação no AIP.', 'en-US': 'The plan has no pages/widgets yet — deepen the operation in AIP.' },
  'solutions.playCheckGeneric': { 'pt-BR': 'Nó válido', 'en-US': 'Node valid' },
  'solutions.playCheckGate': { 'pt-BR': 'Nós anteriores validados (play aprovado)', 'en-US': 'Upstream nodes validated (play passed)' },
  'solutions.playDryNoSample': { 'pt-BR': 'Config válida. Rode a amostra da Coleta pra ver o output REAL da IA aqui.', 'en-US': 'Config valid. Run the Collection sample to see the REAL AI output here.' },
  'solutions.playDryInference': { 'pt-BR': 'Output da inferência (dry-run sobre amostra)', 'en-US': 'Inference output (dry-run on sample)' },
  'solutions.playDryTransformer': { 'pt-BR': 'Output do transformador (dry-run)', 'en-US': 'Transformer output (dry-run)' },
  'solutions.playFixGate': {
    'pt-BR': 'Rode o play ▶ nos nós de Coleta, Processamento e Ontologia primeiro — o preview materializa os widgets com os dados deles.',
    'en-US': 'Run play ▶ on the Collection, Processing and Ontology nodes first — the preview materializes the widgets with their data.',
  },
  // Preview fullscreen da Construção da aplicação.
  'solutions.previewApp': { 'pt-BR': 'Aplicação que será construída', 'en-US': 'App that will be built' },
  'solutions.previewAppUntitled': { 'pt-BR': 'Aplicação sem título', 'en-US': 'Untitled app' },
  'solutions.previewHome': { 'pt-BR': 'Página principal', 'en-US': 'Home page' },
  'solutions.previewWidget': { 'pt-BR': 'Widget', 'en-US': 'Widget' },
  'solutions.previewTypes': { 'pt-BR': 'Tipos de objeto', 'en-US': 'Object types' },
  'solutions.previewActions': { 'pt-BR': 'Ações e funções', 'en-US': 'Actions & functions' },
  'solutions.previewAgents': { 'pt-BR': 'Agentes', 'en-US': 'Agents' },
  'solutions.previewFlows': { 'pt-BR': 'Fluxos', 'en-US': 'Flows' },
  // #6 — ROTA dos tipos: explica o campo único "Tipo de objeto" vs os N tipos propostos.
  'solutions.coletaTypeRouteFeeds': {
    'pt-BR': 'Esta coleta alimenta o tipo {type} — está certo: cada coleta alimenta UM tipo.',
    'en-US': 'This collection feeds the {type} type — this is correct: each collection feeds ONE type.',
  },
  'solutions.coletaTypeRoutePick': {
    'pt-BR': 'Escolha qual tipo de objeto esta coleta alimenta (o AIP propôs alguns).',
    'en-US': 'Pick which object type this collection feeds (the AIP proposed a few).',
  },
  'solutions.coletaTypeRouteOthers': {
    'pt-BR': 'Os outros tipos propostos ({types}) são preenchidos por outras coletas, pelo Processamento (IA) ou por relações — não precisa fazer nada aqui.',
    'en-US': 'The other proposed types ({types}) are filled by other collections, by Processing (AI) or by relations — nothing to do here.',
  },
  'solutions.coletaSampleRunning': { 'pt-BR': 'Coletando…', 'en-US': 'Collecting…' },
  'solutions.coletaSampleStop': { 'pt-BR': 'Parar', 'en-US': 'Stop' },
  'solutions.coletaSampleSlow': {
    'pt-BR': 'Está demorando — a fonte pode estar com rate-limit. Pode aguardar ou parar; a coleta segue no servidor.',
    'en-US': 'Taking a while — the source may be rate-limited. You can wait or stop; collection keeps running on the server.',
  },
  'solutions.coletaSampleCap': {
    'pt-BR': 'A amostra excedeu o tempo de segurança. Tente de novo (ou reduza o escopo da fonte).',
    'en-US': 'The sample exceeded the safety time. Try again (or narrow the source scope).',
  },
  'solutions.coletaRunSampleHint': {
    'pt-BR': 'Roda a skill de verdade com um limite pequeno (sem gravar nada) e mostra os dados REAIS coletados — pra você ver o que vai vir e planejar o processamento. Também alimenta a IDE.',
    'en-US': 'Runs the skill for real with a small limit (without saving anything) and shows the REAL collected data — so you see what’s coming and plan the processing. Also feeds the IDE.',
  },
  'solutions.coletaSampleDone': {
    'pt-BR': 'Amostra real: {n} objetos coletados (não gravados)',
    'en-US': 'Real sample: {n} objects collected (not saved)',
  },
  'solutions.coletaSampleUnsupported': {
    'pt-BR': 'Esta skill ainda não suporta amostra ao vivo.',
    'en-US': 'This skill does not support live sampling yet.',
  },
  'solutions.coletaSampleError': { 'pt-BR': 'Falha na amostra', 'en-US': 'Sample failed' },
  // Cabeçalhos de categoria (limpos, pt-BR) — mapeiam category/source da row.
  'solutions.coletaCat_social': { 'pt-BR': 'Redes sociais & OSINT', 'en-US': 'Social media & OSINT' },
  'solutions.coletaCat_ingestion': { 'pt-BR': 'Conectores & APIs', 'en-US': 'Connectors & APIs' },
  'solutions.coletaCat_vision': { 'pt-BR': 'Visão computacional', 'en-US': 'Computer vision' },
  'solutions.coletaCat_audio': { 'pt-BR': 'Áudio', 'en-US': 'Audio' },
  'solutions.coletaCat_image': { 'pt-BR': 'Geração de imagem', 'en-US': 'Image generation' },
  'solutions.coletaCat_ocr': { 'pt-BR': 'OCR', 'en-US': 'OCR' },
  'solutions.coletaCat_compose': { 'pt-BR': 'Orquestração & IA', 'en-US': 'Orchestration & AI' },
  'solutions.coletaCat_other': { 'pt-BR': 'Outros', 'en-US': 'Other' },
  // B (#1) — a ROTA do vínculo: para qual Tipo de objeto a fonte alimenta + mapa.
  'solutions.connectOutput': { 'pt-BR': 'Produz', 'en-US': 'Produces' },
  'solutions.connectOutputPick': {
    'pt-BR': 'Escolher Tipo de objeto…',
    'en-US': 'Pick object type…',
  },
  'solutions.connectOutputAdd': {
    'pt-BR': '+ Adicionar Tipo de objeto…',
    'en-US': '+ Add object type…',
  },
  'solutions.connectProducedRemove': {
    'pt-BR': 'Remover tipo',
    'en-US': 'Remove type',
  },
  'solutions.connectOutputHint': {
    'pt-BR':
      'Quais Tipos de objeto esta fonte produz. Uma coleta pode produzir VÁRIOS tipos (ex.: Instagram → Perfil + Post). Ao construir, os registros viram objetos desses tipos na ontologia. Sem nenhum, a fonte fica só como proveniência.',
    'en-US':
      'Which object types this source produces. One collection can produce SEVERAL types (e.g. Instagram → Profile + Post). On build, the records become objects of those types in the ontology. With none, the source is provenance only.',
  },
  'solutions.connectNoTypes': {
    'pt-BR': 'Defina tipos de objeto no painel primeiro',
    'en-US': 'Define object types in the panel first',
  },
  'solutions.connectFieldId': { 'pt-BR': 'id', 'en-US': 'id' },
  'solutions.connectFieldName': { 'pt-BR': 'nome', 'en-US': 'name' },
  'solutions.connectFieldMapHint': {
    'pt-BR':
      'Qual coluna da fonte é o identificador do objeto (id) e qual vira o nome. O id garante que reimportar atualiza o mesmo objeto, sem duplicar.',
    'en-US':
      'Which source column is the object identifier (id) and which becomes the name. The id ensures re-importing updates the same object instead of duplicating.',
  },
  'solutions.nodeLinked': { 'pt-BR': 'Conectado', 'en-US': 'Connected' },
  'solutions.nodeSources': { 'pt-BR': '{n} fontes', 'en-US': '{n} sources' },
  'solutions.nodeNoData': { 'pt-BR': 'Sem dados', 'en-US': 'No data' },
  // B (#1) — fonte ligada mas sem Tipo de objeto destino definido.
  'solutions.nodeNoOutput': { 'pt-BR': 'sem saída', 'en-US': 'no output' },
  'solutions.nodeMoreSources': { 'pt-BR': '+{n} fontes', 'en-US': '+{n} sources' },
  // #9 do review — strings do nó antes hardcoded em pt-BR.
  'solutions.nodeConcept': { 'pt-BR': 'conceito', 'en-US': 'concept' },
  'solutions.nodeObjectType': { 'pt-BR': 'Tipo de objeto', 'en-US': 'Object type' },
  'solutions.compatTitle': {
    'pt-BR': 'Compatibilidade com a ontologia existente',
    'en-US': 'Compatibility with existing ontology',
  },
  'solutions.compatIntro': {
    'pt-BR': 'O que vai acontecer ao construir: estes Tipos de objeto e relações serão criados/ajustados na ontologia. Você não precisa criá-los à mão — os Tipos são produzidos pelas etapas da operação (Coleta + Processamento). O botão “Salvar e Construir” aplica tudo.',
    'en-US': 'What happens on build: these object types and relations will be created/adjusted in the ontology. You don’t need to create them by hand — the types are produced by the operation’s steps (Collection + Processing). The “Save & Build” button applies everything.',
  },
  'solutions.compatClean': {
    'pt-BR': 'Sem conflitos — os tipos da operação são novos ou batem com os existentes.',
    'en-US': 'No conflicts — the operation types are new or match existing ones.',
  },
  'solutions.compatMissing': { 'pt-BR': 'Campos a adicionar', 'en-US': 'Fields to add' },
  'solutions.compatDivergent': { 'pt-BR': 'Divergências de tipo', 'en-US': 'Type divergences' },
  'solutions.compatExtra': {
    'pt-BR': 'Campos não usados pela operação',
    'en-US': 'Fields unused by the operation',
  },
  'solutions.compatRelations': { 'pt-BR': 'Relações a criar', 'en-US': 'Relations to create' },
  'solutions.transformerInputType': {
    'pt-BR': 'Tipo de objeto processado',
    'en-US': 'Processed object type',
  },
  'solutions.transformerOutputProp': {
    'pt-BR': 'Propriedade de saída',
    'en-US': 'Output property',
  },
  'solutions.transformerIntro': {
    'pt-BR': 'Opcional. Um trecho de código que ajusta cada objeto ANTES da inferência — ex.: normalizar um texto, derivar um valor. Deixe vazio se não precisa transformar nada.',
    'en-US': 'Optional. A snippet of code that adjusts each object BEFORE inference — e.g. normalize a text, derive a value. Leave empty if you don’t need to transform anything.',
  },
  'solutions.transformerInputTypeHint': {
    'pt-BR': 'Qual Tipo de objeto entra no código — cada instância vira o `obj` da função transform(obj).',
    'en-US': 'Which object type goes into the code — each instance becomes the `obj` of transform(obj).',
  },
  'solutions.transformerOutputPropHint': {
    'pt-BR': 'Em qual propriedade do objeto o resultado da função é gravado.',
    'en-US': 'Which object property the function result is written to.',
  },
  'solutions.transformerFunctionLabel': {
    'pt-BR': 'Função de transformação',
    'en-US': 'Transformation function',
  },
  'solutions.transformerFunctionHint': {
    'pt-BR': 'A função de código que roda. Escolha uma existente, ou crie no IDE.',
    'en-US': 'The code function that runs. Pick an existing one, or create it in the IDE.',
  },
  'solutions.nodeDataModel': { 'pt-BR': 'Modelo de dados', 'en-US': 'Data model' },
  'solutions.arquitetoConnectHint': {
    'pt-BR': 'Próximo passo: clique nos nós de Coleta no diagrama para conectar os dados — vincular algo pronto, criar agora ou subir um arquivo pequeno.',
    'en-US': 'Next step: click the Collection nodes in the diagram to connect data — link something existing, create now, or upload a small file.',
  },
  'solutions.histObjectTypes': { 'pt-BR': 'tipos de objeto', 'en-US': 'object types' },
  'solutions.histLogicFunctions': { 'pt-BR': 'funções de IA', 'en-US': 'AI functions' },
  'solutions.histActionTypes': { 'pt-BR': 'ações', 'en-US': 'actions' },
  'solutions.histWidgets': { 'pt-BR': 'componentes', 'en-US': 'widgets' },
  'solutions.histWorkspaceRow': { 'pt-BR': 'painéis', 'en-US': 'panels' },
  'solutions.histNodes': { 'pt-BR': 'nós', 'en-US': 'nodes' },
  'solutions.histProjects': { 'pt-BR': 'operações', 'en-US': 'operations' },
  'solutions.histAgents': { 'pt-BR': 'agentes', 'en-US': 'agents' },
  'solutions.histFlows': { 'pt-BR': 'fluxos', 'en-US': 'flows' },
  'solutions.histPages': { 'pt-BR': 'páginas', 'en-US': 'pages' },
  'solutions.histApps': { 'pt-BR': 'aplicações', 'en-US': 'applications' },

  // ─── App Shell · "Layout do App" (N1 · 2026-05-24) ───────────────────
  // Composer 3-pane do Layout do App. pt-BR = texto atual (não quebrar
  // testes que asseveram visível). en-US peer first-class.
  'appshell.title': { 'pt-BR': 'Layout do App', 'en-US': 'App Layout' },
  'appshell.originUser': {
    'pt-BR': 'sobrescrito pelo operador',
    'en-US': 'overridden by the operator',
  },
  'appshell.originTenant': {
    'pt-BR': 'padrão da unidade',
    'en-US': 'unit default',
  },
  'appshell.originDefault': {
    'pt-BR': 'sem configuração — usando padrão',
    'en-US': 'no configuration — using default',
  },
  'appshell.originPrefix': { 'pt-BR': 'Origem atual: ', 'en-US': 'Current source: ' },
  'appshell.discard': { 'pt-BR': 'Descartar', 'en-US': 'Discard' },
  'appshell.save': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'appshell.applyAll': { 'pt-BR': 'Aplicar para todos', 'en-US': 'Apply to everyone' },
  'appshell.scopeMe': { 'pt-BR': 'Apenas para mim', 'en-US': 'Only for me' },
  'appshell.scopeTenant': { 'pt-BR': 'Todos do tenant', 'en-US': 'Everyone in the tenant' },
  'appshell.confirmTenantTitle': {
    'pt-BR': 'Aplicar como padrão da unidade?',
    'en-US': 'Apply as the unit default?',
  },
  'appshell.confirmTenantDesc': {
    'pt-BR':
      'Este layout passa a valer como padrão para todos os operadores do tenant que não tenham sobrescrito.',
    'en-US':
      'This layout becomes the default for every operator in the tenant who has not overridden it.',
  },
  'appshell.confirmTenantDep1': {
    'pt-BR': 'Todos os usuários sem override pessoal.',
    'en-US': 'All users without a personal override.',
  },
  'appshell.confirmTenantDep2': {
    'pt-BR': 'Pode ser revertido a qualquer momento.',
    'en-US': 'Can be reverted at any time.',
  },
  'appshell.savedTenant': {
    'pt-BR': 'Layout aplicado como padrão da unidade.',
    'en-US': 'Layout applied as the unit default.',
  },
  'appshell.savedMe': { 'pt-BR': 'Layout salvo.', 'en-US': 'Layout saved.' },
  'appshell.saveFailed': { 'pt-BR': 'falha ao salvar', 'en-US': 'failed to save' },
  'appshell.loadErrorTitle': {
    'pt-BR': 'Não foi possível carregar',
    'en-US': 'Could not load',
  },

  // Palette + inspector chrome
  'appshell.paletteHeader': { 'pt-BR': 'Blocos do shell', 'en-US': 'Shell blocks' },
  'appshell.inspectorHeader': { 'pt-BR': 'Inspetor', 'en-US': 'Inspector' },

  // Tabs
  'appshell.tabBanner': { 'pt-BR': 'Banner', 'en-US': 'Banner' },
  'appshell.tabNavbar': { 'pt-BR': 'Barra superior', 'en-US': 'Top bar' },
  'appshell.tabSidenav': { 'pt-BR': 'Navegação lateral', 'en-US': 'Side navigation' },
  'appshell.tabHomepage': { 'pt-BR': 'Página inicial', 'en-US': 'Home page' },
  'appshell.tabFooter': { 'pt-BR': 'Rodapé', 'en-US': 'Footer' },
  'appshell.tabUserMenu': { 'pt-BR': 'Menu do usuário', 'en-US': 'User menu' },
  'appshell.tabContext': { 'pt-BR': 'Seleção de contexto', 'en-US': 'Context selection' },
  'appshell.tabTheme': { 'pt-BR': 'Aparência', 'en-US': 'Appearance' },
  'appshell.tabLogin': { 'pt-BR': 'Login', 'en-US': 'Login' },
  'appshell.tabMarketplace': { 'pt-BR': 'Loja de apps', 'en-US': 'App store' },
  'appshell.tabPermissions': { 'pt-BR': 'Permissões padrão', 'en-US': 'Default permissions' },

  // Live-preview headers (canvas)
  'appshell.previewLiveLabel': {
    'pt-BR': 'Pré-visualização ao vivo',
    'en-US': 'Live preview',
  },
  'appshell.previewLoginDesc': {
    'pt-BR': 'Espelha a tela de login que o operador vê antes de autenticar.',
    'en-US': 'Mirrors the login screen the operator sees before authenticating.',
  },
  'appshell.previewUserMenuDesc': {
    'pt-BR': 'Espelha o que o operador vê ao clicar no avatar do header.',
    'en-US': 'Mirrors what the operator sees when clicking the header avatar.',
  },
  'appshell.previewMarketplaceDesc': {
    'pt-BR':
      'Espelha o cabeçalho com o menu de Apps populado pelas escolhas ao lado.',
    'en-US':
      'Mirrors the header with the Apps menu populated by the choices alongside.',
  },
  'appshell.previewHomeTitle': {
    'pt-BR': 'Pré-visualização da Página inicial',
    'en-US': 'Home page preview',
  },
  'appshell.previewHomeRouteRendersPre': {
    'pt-BR': 'A rota ',
    'en-US': 'Route ',
  },
  'appshell.previewHomeRouteRendersPost': {
    'pt-BR': ' renderiza esta página via o editor de widgets do Workshop.',
    'en-US': ' renders this page via the Workshop widget editor.',
  },
  'appshell.previewHomeCurrent': {
    'pt-BR': 'Página inicial atual',
    'en-US': 'Current home page',
  },
  'appshell.previewHomeSeedDefault': {
    'pt-BR': 'Home padrão (seed)',
    'en-US': 'Default home (seed)',
  },
  'appshell.previewHomeFromPage': {
    'pt-BR':
      'Os widgets vêm da Página escolhida. Abra o editor de Páginas para alterá-los.',
    'en-US':
      'Widgets come from the chosen Page. Open the Pages editor to change them.',
  },
  'appshell.previewHomeMosaic': {
    'pt-BR':
      'Mosaico de comando padrão (KPIs · mapa · alertas · câmeras · linha do tempo).',
    'en-US':
      'Default command mosaic (KPIs · map · alerts · cameras · timeline).',
  },

  // Restore-default button
  'appshell.restoreDefault': { 'pt-BR': 'Restaurar padrão', 'en-US': 'Restore default' },
  'appshell.restoreTitle': {
    'pt-BR': 'Restaurar {section} ao padrão?',
    'en-US': 'Restore {section} to default?',
  },
  'appshell.restoreDesc': {
    'pt-BR':
      'Isso descarta as customizações de "{section}" e repõe exatamente o conjunto de itens padrão (como era antes). As demais seções não são afetadas.',
    'en-US':
      'This discards the "{section}" customizations and restores exactly the default set of items (as it was before). Other sections are not affected.',
  },
  'appshell.restoreDep1': {
    'pt-BR': 'A mudança entra no rascunho — confirme com Salvar para aplicar.',
    'en-US': 'The change enters the draft — confirm with Save to apply.',
  },
  'appshell.restoreDep2': {
    'pt-BR': 'Pode ser desfeito reconfigurando manualmente.',
    'en-US': 'Can be undone by reconfiguring manually.',
  },

  // Common inspector controls
  'appshell.commonAdd': { 'pt-BR': 'Adicionar', 'en-US': 'Add' },
  'appshell.posLeft': { 'pt-BR': 'Esq', 'en-US': 'Left' },
  'appshell.posCenter': { 'pt-BR': 'Centro', 'en-US': 'Center' },
  'appshell.posRight': { 'pt-BR': 'Dir', 'en-US': 'Right' },
  'appshell.positionLabel': { 'pt-BR': 'Posição', 'en-US': 'Position' },
  'appshell.posPrefix': { 'pt-BR': 'Posição:', 'en-US': 'Position:' },
  'appshell.previewLabel': { 'pt-BR': 'Prévia', 'en-US': 'Preview' },
  'appshell.noIcon': { 'pt-BR': 'Sem ícone', 'en-US': 'No icon' },
  'appshell.removeAria': { 'pt-BR': 'Remover', 'en-US': 'Remove' },

  // Banner inspector
  'appshell.bannerActive': {
    'pt-BR': 'Banner ativo no shell',
    'en-US': 'Banner active in the shell',
  },
  'appshell.bannerClassificationDefault': {
    'pt-BR': 'Classificação padrão',
    'en-US': 'Default classification',
  },
  'appshell.bannerClassAuto': {
    'pt-BR': 'Auto (vem da página)',
    'en-US': 'Auto (from the page)',
  },
  'appshell.bannerContextDynamic': {
    'pt-BR': 'Contexto dinâmico',
    'en-US': 'Dynamic context',
  },
  'appshell.bannerContextHelp': {
    'pt-BR':
      'O banner mostra o contexto operacional atual e permite trocá-lo. Escolha quais informações exibir:',
    'en-US':
      'The banner shows the current operational context and lets you switch it. Choose which information to display:',
  },
  'appshell.bannerSlotOrg': {
    'pt-BR': 'Organização selecionada',
    'en-US': 'Selected organization',
  },
  'appshell.bannerSlotSpace': {
    'pt-BR': 'Espaço selecionado',
    'en-US': 'Selected space',
  },
  'appshell.bannerSlotProject': {
    'pt-BR': 'Operação selecionada',
    'en-US': 'Selected operation',
  },
  'appshell.bannerSlotClassification': {
    'pt-BR': 'Classificação',
    'en-US': 'Classification',
  },
  'appshell.bannerSwitcherToggle': {
    'pt-BR': 'Botão "Trocar" no banner',
    'en-US': '"Switch" button on the banner',
  },
  'appshell.bannerCustomText': {
    'pt-BR': 'Texto livre (opcional)',
    'en-US': 'Free text (optional)',
  },
  'appshell.bannerCustomTextPlaceholder': {
    'pt-BR': 'Operação Alfa',
    'en-US': 'Operation Alpha',
  },
  'appshell.bannerCustomTextHelp': {
    'pt-BR':
      'Rótulo livre exibido ao lado do contexto. Deixe vazio para usar só o contexto dinâmico e a classificação.',
    'en-US':
      'Free label shown next to the context. Leave empty to use only the dynamic context and classification.',
  },
  'appshell.bannerPosition': { 'pt-BR': 'Posição', 'en-US': 'Position' },
  'appshell.bannerPosTop': { 'pt-BR': 'Topo', 'en-US': 'Top' },
  'appshell.bannerPosBottom': { 'pt-BR': 'Rodapé', 'en-US': 'Bottom' },
  'appshell.bannerBg': { 'pt-BR': 'Cor de fundo', 'en-US': 'Background color' },
  'appshell.bannerTextColor': { 'pt-BR': 'Cor do texto', 'en-US': 'Text color' },
  'appshell.bannerShowClock': { 'pt-BR': 'Mostrar relógio', 'en-US': 'Show clock' },
  'appshell.bannerShowTimezone': {
    'pt-BR': 'Mostrar fuso horário',
    'en-US': 'Show time zone',
  },
  'appshell.bannerDismissible': {
    'pt-BR': 'Operador pode dispensar',
    'en-US': 'Operator can dismiss',
  },
  'appshell.bannerTruncTitle': {
    'pt-BR': 'Truncar textos do banner',
    'en-US': 'Truncate banner text',
  },
  'appshell.bannerTruncHelp': {
    'pt-BR':
      'Limita o tamanho de cada informação para o banner caber em uma linha. Textos longos ganham reticências.',
    'en-US':
      'Limits the length of each item so the banner fits on one line. Long text gets an ellipsis.',
  },
  'appshell.bannerTruncEnabled': {
    'pt-BR': 'Truncar slots longos',
    'en-US': 'Truncate long slots',
  },
  'appshell.bannerTruncMax': {
    'pt-BR': 'Máximo de caracteres por slot',
    'en-US': 'Maximum characters per slot',
  },
  'appshell.bannerTruncMaxAria': {
    'pt-BR': 'Máximo de caracteres por slot do banner',
    'en-US': 'Maximum characters per banner slot',
  },
  'appshell.bannerTruncResponsive': {
    'pt-BR': 'Encolher mais em telas estreitas',
    'en-US': 'Shrink further on narrow screens',
  },
  'appshell.bannerPreviewOrg': { 'pt-BR': 'Org Atual', 'en-US': 'Current Org' },
  'appshell.bannerPreviewSpace': { 'pt-BR': 'Espaço Atual', 'en-US': 'Current Space' },
  'appshell.bannerPreviewProject': {
    'pt-BR': 'Operação Atual',
    'en-US': 'Current Operation',
  },
  'appshell.bannerPreviewSwitch': { 'pt-BR': 'Trocar', 'en-US': 'Switch' },

  // Navbar inspector
  'appshell.navbarSearchTitle': { 'pt-BR': 'Campo de busca', 'en-US': 'Search field' },
  'appshell.navbarSearchHelp': {
    'pt-BR': 'Texto-guia e densidade do campo de busca global no cabeçalho.',
    'en-US': 'Placeholder and density of the global search field in the header.',
  },
  'appshell.navbarSearchPlaceholderLabel': {
    'pt-BR': 'Texto-guia (placeholder)',
    'en-US': 'Placeholder text',
  },
  'appshell.navbarSearchPlaceholderHint': {
    'pt-BR': 'Buscar pessoa, veículo, BO, mandado, endereço…',
    'en-US': 'Search person, vehicle, report, warrant, address…',
  },
  'appshell.navbarSearchCompact': {
    'pt-BR': 'Busca compacta (colapsa em ícone)',
    'en-US': 'Compact search (collapses to an icon)',
  },
  'appshell.navbarItemsHelp': {
    'pt-BR': 'Itens extras no header. Busca e Notificações ficam sempre.',
    'en-US': 'Extra header items. Search and Notifications always stay.',
  },
  'appshell.navbarEmpty': {
    'pt-BR': 'Nenhum item configurado.',
    'en-US': 'No item configured.',
  },
  'appshell.navbarItemLabelPlaceholder': { 'pt-BR': 'Rótulo', 'en-US': 'Label' },
  'appshell.navbarAddItem': { 'pt-BR': 'Adicionar item', 'en-US': 'Add item' },
  'appshell.navbarNewItem': { 'pt-BR': 'Novo item', 'en-US': 'New item' },

  // Sidenav inspector
  'appshell.sidenavRestoreHelp': {
    'pt-BR':
      'Voltar ao conjunto de grupos padrão (Operação · Análise · Conteúdo), como era antes.',
    'en-US':
      'Return to the default group set (Operation · Analysis · Content), as it was before.',
  },
  'appshell.sidenavSection': { 'pt-BR': 'a navegação lateral', 'en-US': 'the side navigation' },
  'appshell.sidenavWidth': { 'pt-BR': 'Largura', 'en-US': 'Width' },
  'appshell.sidenavWidthAria': {
    'pt-BR': 'Largura do sidenav',
    'en-US': 'Side navigation width',
  },
  'appshell.sidenavDense': {
    'pt-BR': 'Compacto (linhas finas)',
    'en-US': 'Compact (thin rows)',
  },
  'appshell.sidenavFooterLink': {
    'pt-BR': 'Link de rodapé do menu',
    'en-US': 'Menu footer link',
  },
  'appshell.sidenavFooterLinkPlaceholder': {
    'pt-BR': 'Sem link de rodapé',
    'en-US': 'No footer link',
  },
  'appshell.sidenavGroupsLabel': {
    'pt-BR': 'Grupos da navegação lateral',
    'en-US': 'Side-navigation groups',
  },
  'appshell.sidenavGroupsHelp': {
    'pt-BR':
      'Cada grupo agrupa itens da sidenav. Arraste o grupo para reordenar ou use as setas. Itens internos ganham label, ícone, href, permissão e badge opcional.',
    'en-US':
      'Each group bundles side-nav items. Drag the group to reorder or use the arrows. Inner items get a label, icon, href, permission and optional badge.',
  },
  'appshell.sidenavGroupsEmpty': {
    'pt-BR': 'Nenhum grupo configurado.',
    'en-US': 'No group configured.',
  },
  'appshell.sidenavGroupLabelPlaceholder': { 'pt-BR': 'Operações', 'en-US': 'Operations' },
  'appshell.sidenavGroupCollapsed': {
    'pt-BR': 'Recolhido por padrão',
    'en-US': 'Collapsed by default',
  },
  'appshell.sidenavGroupNoItems': { 'pt-BR': 'Sem itens.', 'en-US': 'No items.' },
  'appshell.sidenavItemLabelPlaceholder': { 'pt-BR': 'Marcações', 'en-US': 'Markings' },
  'appshell.sidenavBadgePlaceholder': {
    'pt-BR': '3 (badge opcional)',
    'en-US': '3 (optional badge)',
  },
  'appshell.sidenavAddItem': { 'pt-BR': 'Item', 'en-US': 'Item' },
  'appshell.sidenavNewItem': { 'pt-BR': 'Novo item', 'en-US': 'New item' },
  'appshell.sidenavAddGroup': { 'pt-BR': 'Adicionar grupo', 'en-US': 'Add group' },
  'appshell.sidenavNewGroup': { 'pt-BR': 'Novo grupo', 'en-US': 'New group' },
  'appshell.reorderGroupAria': {
    'pt-BR': 'Reordenar grupo {name}',
    'en-US': 'Reorder group {name}',
  },
  'appshell.reorderItemAria': {
    'pt-BR': 'Reordenar item {name}',
    'en-US': 'Reorder item {name}',
  },
  'appshell.moveGroupUpAria': { 'pt-BR': 'Mover grupo para cima', 'en-US': 'Move group up' },
  'appshell.moveGroupDownAria': {
    'pt-BR': 'Mover grupo para baixo',
    'en-US': 'Move group down',
  },
  'appshell.removeGroupAria': { 'pt-BR': 'Remover grupo', 'en-US': 'Remove group' },
  'appshell.moveItemUpAria': { 'pt-BR': 'Mover item para cima', 'en-US': 'Move item up' },
  'appshell.moveItemDownAria': { 'pt-BR': 'Mover item para baixo', 'en-US': 'Move item down' },
  'appshell.removeItemAria': { 'pt-BR': 'Remover item', 'en-US': 'Remove item' },
  'appshell.moveUpAria': { 'pt-BR': 'Mover para cima', 'en-US': 'Move up' },
  'appshell.moveDownAria': { 'pt-BR': 'Mover para baixo', 'en-US': 'Move down' },

  // Footer inspector
  'appshell.footerVisible': { 'pt-BR': 'Rodapé visível', 'en-US': 'Footer visible' },
  'appshell.footerVersionVisible': {
    'pt-BR': 'Mostrar número da versão',
    'en-US': 'Show version number',
  },
  'appshell.footerCopyright': { 'pt-BR': 'Copyright', 'en-US': 'Copyright' },
  'appshell.footerStatusBar': {
    'pt-BR': 'Status bar dinâmica',
    'en-US': 'Dynamic status bar',
  },
  'appshell.footerStatusBarHelp': {
    'pt-BR':
      'Itens substituem a barra padrão quando definidos. Arraste para reordenar.',
    'en-US':
      'Items replace the default bar when set. Drag to reorder.',
  },
  'appshell.footerColumnsLegacy': {
    'pt-BR': 'Colunas de links (legacy)',
    'en-US': 'Link columns (legacy)',
  },
  'appshell.footerEmpty': {
    'pt-BR': 'Nenhuma coluna configurada.',
    'en-US': 'No column configured.',
  },
  'appshell.footerColTitlePlaceholder': { 'pt-BR': 'Suporte', 'en-US': 'Support' },
  'appshell.footerLinkLabelPlaceholder': { 'pt-BR': 'Helpdesk', 'en-US': 'Helpdesk' },
  'appshell.footerAddLink': { 'pt-BR': '+ Link', 'en-US': '+ Link' },
  'appshell.footerNewLink': { 'pt-BR': 'Novo', 'en-US': 'New' },
  'appshell.footerRemoveColumn': { 'pt-BR': 'Remover coluna', 'en-US': 'Remove column' },
  'appshell.footerAddColumn': { 'pt-BR': 'Adicionar coluna', 'en-US': 'Add column' },
  'appshell.footerNewColumn': { 'pt-BR': 'Nova coluna', 'en-US': 'New column' },
  'appshell.footerStatusEmpty': {
    'pt-BR': 'Nenhum item configurado.',
    'en-US': 'No item configured.',
  },
  'appshell.footerTypePrefix': { 'pt-BR': 'Tipo:', 'en-US': 'Type:' },
  'appshell.footerTypeSystem': { 'pt-BR': 'Sistema', 'en-US': 'System' },
  'appshell.footerTypeCustom': { 'pt-BR': 'Custom', 'en-US': 'Custom' },
  'appshell.footerCustomLabelPlaceholder': {
    'pt-BR': 'Operação ATIVA',
    'en-US': 'Operation ACTIVE',
  },
  'appshell.footerCustomValuePlaceholder': {
    'pt-BR': 'Valor (opcional)',
    'en-US': 'Value (optional)',
  },
  'appshell.footerNoLink': { 'pt-BR': 'Sem link', 'en-US': 'No link' },
  'appshell.footerKeyCpu': { 'pt-BR': 'CPU', 'en-US': 'CPU' },
  'appshell.footerKeyRam': { 'pt-BR': 'RAM', 'en-US': 'RAM' },
  'appshell.footerKeyTime': { 'pt-BR': 'Hora', 'en-US': 'Time' },
  'appshell.footerKeyLocale': { 'pt-BR': 'Locale', 'en-US': 'Locale' },
  'appshell.footerNewCustom': { 'pt-BR': 'Novo item', 'en-US': 'New item' },
  'appshell.moveUpShort': { 'pt-BR': 'Mover para cima', 'en-US': 'Move up' },
  'appshell.moveDownShort': { 'pt-BR': 'Mover para baixo', 'en-US': 'Move down' },

  // User-menu inspector
  'appshell.userMenuHelp': {
    'pt-BR':
      'Itens do dropdown do operador (clique no avatar). O item Sair é sempre o último e não pode ser removido.',
    'en-US':
      'Operator dropdown items (click the avatar). The Sign out item is always last and cannot be removed.',
  },
  'appshell.userMenuRestoreHelp': {
    'pt-BR': 'Voltar aos itens padrão (Configurações · Auditoria · Sair).',
    'en-US': 'Return to the default items (Settings · Audit · Sign out).',
  },
  'appshell.userMenuSection': { 'pt-BR': 'o menu do usuário', 'en-US': 'the user menu' },
  'appshell.userMenuEmpty': {
    'pt-BR': 'Nenhum item — adicione abaixo.',
    'en-US': 'No item — add one below.',
  },
  'appshell.userMenuDivider': {
    'pt-BR': 'Linha divisória — sem rótulo.',
    'en-US': 'Divider line — no label.',
  },
  'appshell.userMenuItemLabelPlaceholder': { 'pt-BR': 'Suporte', 'en-US': 'Support' },
  'appshell.userMenuNoDest': { 'pt-BR': 'Sem destino', 'en-US': 'No destination' },
  'appshell.userMenuVisible': { 'pt-BR': 'Visível', 'en-US': 'Visible' },
  'appshell.userMenuAddLink': { 'pt-BR': 'Link', 'en-US': 'Link' },
  'appshell.userMenuNewLink': { 'pt-BR': 'Novo link', 'en-US': 'New link' },
  'appshell.userMenuAddDivider': { 'pt-BR': 'Divisor', 'en-US': 'Divider' },

  // Homepage tab
  'appshell.homepageHelp': {
    'pt-BR':
      'A página inicial (rota /) é uma Página completa, editada no editor de Páginas — o mesmo editor de widgets do Workshop. Escolha qual Página é a inicial; sem escolha, usamos a Home padrão.',
    'en-US':
      'The home page (route /) is a full Page, edited in the Pages editor — the same Workshop widget editor. Choose which Page is the home; without a choice, we use the default Home.',
  },
  'appshell.homepageWhich': {
    'pt-BR': 'Qual página é a inicial',
    'en-US': 'Which page is the home',
  },
  'appshell.homepageSeedOption': {
    'pt-BR': 'Home padrão (seed)',
    'en-US': 'Default home (seed)',
  },
  'appshell.homepageAria': { 'pt-BR': 'Página inicial', 'en-US': 'Home page' },
  'appshell.homepageSeedHelp': {
    'pt-BR':
      'A rota / renderiza o mosaico de comando padrão (KPIs, mapa, alertas, câmeras, linha do tempo).',
    'en-US':
      'Route / renders the default command mosaic (KPIs, map, alerts, cameras, timeline).',
  },
  'appshell.homepageFromPageHelp': {
    'pt-BR':
      'A rota / renderiza a Página "/{slug}" com os widgets configurados nela.',
    'en-US':
      'Route / renders the Page "/{slug}" with the widgets configured in it.',
  },
  'appshell.homepageTitleNew': {
    'pt-BR': 'Página inicial',
    'en-US': 'Home page',
  },
  'appshell.homepageOpenEditor': {
    'pt-BR': 'Editar página inicial no editor de Páginas',
    'en-US': 'Edit home page in the Pages editor',
  },
  'appshell.homepageOpening': { 'pt-BR': 'Abrindo…', 'en-US': 'Opening…' },
  'appshell.homepageOpenError': {
    'pt-BR': 'Falha ao abrir editor',
    'en-US': 'Failed to open editor',
  },

  // Context inspector
  'appshell.contextTitle': {
    'pt-BR': 'Seletor de contexto no cabeçalho',
    'en-US': 'Context selector in the header',
  },
  'appshell.contextHelp': {
    'pt-BR':
      'Controla o menu de Salas em destaque e a troca de Organização / Espaço / Operação que aparece no cabeçalho do app. É o mesmo contexto que o banner mostra. A pré-visualização ao lado mostra como ficará para o operador.',
    'en-US':
      'Controls the featured Rooms menu and the Organization / Space / Operation switch shown in the app header. It is the same context the banner shows. The preview alongside shows how it will look to the operator.',
  },
  'appshell.contextVisible': {
    'pt-BR': 'Mostrar seletor de contexto no cabeçalho',
    'en-US': 'Show context selector in the header',
  },
  'appshell.contextPromoted': {
    'pt-BR': 'Mostrar menu de Salas em destaque',
    'en-US': 'Show featured Rooms menu',
  },
  'appshell.contextDefaultScope': {
    'pt-BR': 'Escopo padrão ao abrir o seletor',
    'en-US': 'Default scope when opening the selector',
  },
  'appshell.contextScopeOrg': { 'pt-BR': 'Org', 'en-US': 'Org' },
  'appshell.contextScopeTenant': { 'pt-BR': 'Tenant', 'en-US': 'Tenant' },
  'appshell.contextScopePersonal': { 'pt-BR': 'Pessoal', 'en-US': 'Personal' },
  'appshell.contextPreviewHeader': {
    'pt-BR': 'Prévia no cabeçalho',
    'en-US': 'Header preview',
  },
  'appshell.contextPreviewRooms': { 'pt-BR': 'Salas', 'en-US': 'Rooms' },
  'appshell.contextPreviewSwitch': { 'pt-BR': 'Trocar', 'en-US': 'Switch' },
  'appshell.contextPreviewHidden': {
    'pt-BR': 'O seletor de contexto está oculto no cabeçalho.',
    'en-US': 'The context selector is hidden in the header.',
  },

  // Theme inspector
  'appshell.themeLabel': { 'pt-BR': 'Tema visual', 'en-US': 'Visual theme' },
  'appshell.themeLight': { 'pt-BR': 'Claro', 'en-US': 'Light' },
  'appshell.themeDark': { 'pt-BR': 'Escuro', 'en-US': 'Dark' },

  // Marca — nome da empresa (Onda M3 · 2026-05-24)
  'appshell.brandCompanyName': {
    'pt-BR': 'Nome da empresa',
    'en-US': 'Company name',
  },
  'appshell.brandCompanyNameHelp': {
    'pt-BR':
      'Nome da sua organização ou unidade. Aparece no título da aba do navegador, ao lado do slogan.',
    'en-US':
      'Your organization or unit name. Shown in the browser tab title, next to the slogan.',
  },
  'appshell.brandCompanyNamePlaceholder': {
    'pt-BR': 'Safe Core',
    'en-US': 'Safe Core',
  },

  // Login inspector
  'appshell.loginBrandTitle': {
    'pt-BR': 'Marca da tela de login',
    'en-US': 'Login screen branding',
  },
  'appshell.loginBrandHelp': {
    'pt-BR':
      'Ligue para usar a marca padrão AEGIS no login. Desligue para expor a marca da sua unidade (logo, slogan, cor, fundo e mensagem).',
    'en-US':
      'Turn on to use the default AEGIS branding on login. Turn off to expose your unit branding (logo, slogan, color, background and message).',
  },
  'appshell.loginUseDefault': {
    'pt-BR': 'Usar marca padrão AEGIS no login',
    'en-US': 'Use default AEGIS branding on login',
  },
  'appshell.loginLogo': { 'pt-BR': 'Logo', 'en-US': 'Logo' },
  'appshell.loginLogoFileAria': {
    'pt-BR': 'Enviar logo da tela de login',
    'en-US': 'Upload login screen logo',
  },
  'appshell.loginLogoUploading': {
    'pt-BR': 'Enviando logo…',
    'en-US': 'Uploading logo…',
  },
  'appshell.loginLogoUploadFailed': {
    'pt-BR': 'falha no upload',
    'en-US': 'upload failed',
  },
  'appshell.loginLogoUrlPlaceholder': {
    'pt-BR': 'https://… ou /aegis-logo.svg',
    'en-US': 'https://… or /aegis-logo.svg',
  },
  'appshell.loginLogoHelp': {
    'pt-BR': 'Envie um arquivo ou cole uma URL. Vazio usa o logo AEGIS.',
    'en-US': 'Upload a file or paste a URL. Empty uses the AEGIS logo.',
  },
  'appshell.loginSlogan': { 'pt-BR': 'Slogan', 'en-US': 'Slogan' },
  'appshell.loginSloganPlaceholder': {
    'pt-BR': 'Clareza para decisões complexas.',
    'en-US': 'Clarity for complex decisions.',
  },
  'appshell.loginAccent': { 'pt-BR': 'Cor de destaque', 'en-US': 'Accent color' },
  'appshell.loginAccentAria': {
    'pt-BR': 'Cor de destaque da tela de login',
    'en-US': 'Login screen accent color',
  },
  'appshell.loginAccentHelp': {
    'pt-BR': 'Aplica ao botão Entrar. Vazio usa a cor padrão.',
    'en-US': 'Applies to the Sign-in button. Empty uses the default color.',
  },
  'appshell.loginBackground': {
    'pt-BR': 'Imagem de fundo (URL opcional)',
    'en-US': 'Background image (optional URL)',
  },
  'appshell.loginMessage': { 'pt-BR': 'Mensagem (opcional)', 'en-US': 'Message (optional)' },
  'appshell.loginMessagePlaceholder': {
    'pt-BR': 'Acesso restrito a pessoal autorizado.',
    'en-US': 'Access restricted to authorized personnel.',
  },
  'appshell.loginPreviewSlogan': {
    'pt-BR': 'Clareza para decisões complexas.',
    'en-US': 'Clarity for complex decisions.',
  },
  'appshell.loginPreviewSubmit': { 'pt-BR': 'Entrar', 'en-US': 'Sign in' },

  // Marketplace inspector
  'appshell.marketplaceListError': {
    'pt-BR': 'Falha ao listar apps instalados',
    'en-US': 'Failed to list installed apps',
  },
  'appshell.marketplaceInstallError': {
    'pt-BR': 'Falha ao instalar app',
    'en-US': 'Failed to install app',
  },
  'appshell.marketplaceTitle': {
    'pt-BR': 'Apps disponíveis na navegação principal',
    'en-US': 'Apps available in the main navigation',
  },
  'appshell.marketplaceHelp': {
    'pt-BR':
      'Decida quais apps instalados aparecem no menu de Apps do cabeçalho, quais vão para a navegação lateral e quais ficam ocultos. Arraste para definir a ordem de exibição.',
    'en-US':
      'Decide which installed apps appear in the header Apps menu, which go to the side navigation and which stay hidden. Drag to set the display order.',
  },
  'appshell.marketplaceAvailableTitle': {
    'pt-BR': 'Apps disponíveis para instalar ({count})',
    'en-US': 'Apps available to install ({count})',
  },
  'appshell.marketplaceInstall': { 'pt-BR': 'Instalar', 'en-US': 'Install' },
  'appshell.marketplaceInstalling': { 'pt-BR': 'Instalando…', 'en-US': 'Installing…' },
  'appshell.marketplaceMenuEnabled': {
    'pt-BR': 'Mostrar menu de Apps no cabeçalho',
    'en-US': 'Show Apps menu in the header',
  },
  'appshell.marketplaceMenuEnabledHelp': {
    'pt-BR':
      'Quando ativo, um botão de Apps abre o menu com os apps marcados como "Menu de apps".',
    'en-US':
      'When active, an Apps button opens the menu with the apps marked as "App menu".',
  },
  'appshell.marketplaceLoading': {
    'pt-BR': 'Carregando apps instalados…',
    'en-US': 'Loading installed apps…',
  },
  'appshell.marketplaceEmptyTitle': {
    'pt-BR': 'Nenhum app instalado ainda',
    'en-US': 'No app installed yet',
  },
  'appshell.marketplaceEmptyHelp': {
    'pt-BR': 'Instale apps na Loja para escolhê-los na navegação.',
    'en-US': 'Install apps from the Store to choose them in the navigation.',
  },
  'appshell.marketplaceOpenStore': { 'pt-BR': 'Abrir a Loja', 'en-US': 'Open the Store' },
  'appshell.marketplaceInstalledTitle': {
    'pt-BR': 'Apps instalados ({count})',
    'en-US': 'Installed apps ({count})',
  },
  'appshell.marketplaceReorderAria': {
    'pt-BR': 'Reordenar {name}',
    'en-US': 'Reorder {name}',
  },
  'appshell.marketplaceVisibleNav': {
    'pt-BR': 'Visível na navegação',
    'en-US': 'Visible in navigation',
  },
  'appshell.marketplacePosition': { 'pt-BR': 'Posição', 'en-US': 'Position' },
  'appshell.marketplacePosMenu': { 'pt-BR': 'Menu de apps', 'en-US': 'App menu' },
  'appshell.marketplacePosSidenav': {
    'pt-BR': 'Navegação lateral',
    'en-US': 'Side navigation',
  },
  'appshell.marketplacePosHidden': { 'pt-BR': 'Oculto', 'en-US': 'Hidden' },
  'appshell.marketplaceManageFull': {
    'pt-BR': 'Gerenciar marketplace completo',
    'en-US': 'Manage full marketplace',
  },
  'appshell.appsPreviewTriggerEmpty': {
    'pt-BR': 'Nenhum app marcado como “Menu de apps”.',
    'en-US': 'No app marked as “App menu”.',
  },
  'appshell.appsPreviewDisabled': {
    'pt-BR': 'O menu de Apps está desativado no cabeçalho.',
    'en-US': 'The Apps menu is disabled in the header.',
  },
  'appshell.appsMenuTrigger': { 'pt-BR': 'Apps', 'en-US': 'Apps' },

  // Permissions inspector
  'appshell.permsListRoomsError': {
    'pt-BR': 'Falha ao listar Salas',
    'en-US': 'Failed to list Rooms',
  },
  'appshell.permsDefaultRoom': { 'pt-BR': 'Sala padrão', 'en-US': 'Default Room' },
  'appshell.permsDefaultRoomHelp': {
    'pt-BR':
      'Operador sem override de grupo é redirecionado para esta Sala ao acessar a raiz.',
    'en-US':
      'An operator with no group override is redirected to this Room when accessing the root.',
  },
  'appshell.permsDefaultRoomNone': {
    'pt-BR': 'Nenhuma — usar prompt na primeira visita',
    'en-US': 'None — prompt on first visit',
  },
  'appshell.permsOverridesLabel': {
    'pt-BR': 'Overrides de landing page por grupo',
    'en-US': 'Landing-page overrides per group',
  },
  'appshell.permsOverridesHelp': {
    'pt-BR':
      'Cada grupo pode aterrissar numa URL específica — sobrescreve a Sala padrão.',
    'en-US':
      'Each group can land on a specific URL — overrides the default Room.',
  },
  'appshell.permsOverridesEmpty': {
    'pt-BR': 'Nenhum override configurado.',
    'en-US': 'No override configured.',
  },
  'appshell.permsOverrideRemoveAria': {
    'pt-BR': 'Remover override',
    'en-US': 'Remove override',
  },
  'appshell.permsOverrideUrlPlaceholder': {
    'pt-BR': 'Escolher página de destino',
    'en-US': 'Choose destination page',
  },
  'appshell.permsAddOverrideAll': {
    'pt-BR': 'Todos os papéis já têm override',
    'en-US': 'All roles already have an override',
  },
  'appshell.permsAddOverridePrompt': {
    'pt-BR': 'Adicionar override para…',
    'en-US': 'Add override for…',
  },

  // ─── Login (M2 · 2026-05-24) ─────────────────────────────────────────
  // Slogan oficial Safe Core — default da marca exibido na /login quando o
  // tenant usa a marca neutra (login_use_default) ou não definiu slogan.
  'login.subtitle': {
    'pt-BR': 'Clareza para decisões complexas.',
    'en-US': 'Clarity for complex decisions.',
  },
  'login.username': { 'pt-BR': 'Credencial', 'en-US': 'Credential' },
  'login.password': { 'pt-BR': 'Senha', 'en-US': 'Password' },
  'login.totp': { 'pt-BR': 'Código do autenticador', 'en-US': 'Authenticator code' },
  'login.submit': { 'pt-BR': 'Entrar', 'en-US': 'Sign in' },
  'login.submitting': { 'pt-BR': 'Autenticando…', 'en-US': 'Authenticating…' },
  'login.secureEnv': { 'pt-BR': 'Ambiente seguro', 'en-US': 'Secure environment' },
  'login.errorTotp': {
    'pt-BR': 'Código de dois fatores obrigatório.',
    'en-US': 'Two-factor code required.',
  },
  'login.errorInvalid': {
    'pt-BR': 'Credencial ou senha incorretas.',
    'en-US': 'Invalid credential or password.',
  },
  'login.errorLocked': {
    'pt-BR': 'Conta bloqueada. Procure um administrador.',
    'en-US': 'Account locked. Contact an administrator.',
  },
  'login.errorNetwork': { 'pt-BR': 'Erro de rede.', 'en-US': 'Network error.' },

  // /agentes — estado de página arquivada (resolvido via registry de Páginas).
  'agentes.archived.title': {
    'pt-BR': 'Página indisponível',
    'en-US': 'Page unavailable',
  },
  'agentes.archived.description': {
    'pt-BR': 'Esta página foi arquivada em Páginas. Republique-a para reativar a rota.',
    'en-US': 'This page was archived in Pages. Republish it to reactivate the route.',
  },
  // Catálogo de agentes — validação do modal de instalação (Missão #6).
  'agentes.install.requiredMissing': {
    'pt-BR': 'Preencha os campos obrigatórios:',
    'en-US': 'Fill in the required fields:',
  },
  // Catálogo de agentes — feedback de instalar / remover.
  'agentes.install.success': {
    'pt-BR': 'Agente instalado.',
    'en-US': 'Agent installed.',
  },
  'agentes.install.error': {
    'pt-BR': 'Falha ao instalar o agente.',
    'en-US': 'Failed to install the agent.',
  },
  'agentes.installed.badge': {
    'pt-BR': 'Instalado',
    'en-US': 'Installed',
  },
  'agentes.remove.action': {
    'pt-BR': 'Remover',
    'en-US': 'Remove',
  },
  'agentes.remove.confirmTitle': {
    'pt-BR': 'Remover agente?',
    'en-US': 'Remove agent?',
  },
  'agentes.remove.confirmDescription': {
    'pt-BR':
      'O agente e o histórico de execuções serão removidos deste tenant. Esta ação não pode ser desfeita.',
    'en-US':
      'The agent and its run history will be removed from this tenant. This action cannot be undone.',
  },
  'agentes.remove.success': {
    'pt-BR': 'Agente removido.',
    'en-US': 'Agent removed.',
  },
  'agentes.remove.error': {
    'pt-BR': 'Falha ao remover o agente.',
    'en-US': 'Failed to remove the agent.',
  },

  // Workshop editor — rótulos das 3 categorias do toolbar (Missão #17).
  'workshop.toolbar.content': { 'pt-BR': 'Conteúdo', 'en-US': 'Content' },
  'workshop.toolbar.appearance': { 'pt-BR': 'Aparência', 'en-US': 'Appearance' },
  'workshop.toolbar.manage': { 'pt-BR': 'Gerenciar', 'en-US': 'Manage' },

  // ─── AIP — seletor de modelo (Missão #11) ────────────────────────────
  // Espelha o picker do politicians-app: filtros + badges + descrições.
  'aip.modelPicker.title': {
    'pt-BR': 'Selecione o modelo',
    'en-US': 'Select model',
  },
  'aip.modelPicker.count': {
    'pt-BR': 'modelos',
    'en-US': 'models',
  },
  'aip.modelPicker.filter.recommended': {
    'pt-BR': 'recomendados',
    'en-US': 'recommended',
  },
  'aip.modelPicker.filter.recommended.hint': {
    'pt-BR': 'Modelos validados pela operação para uso diário',
    'en-US': 'Models validated by operations for daily use',
  },
  'aip.modelPicker.filter.tools': {
    'pt-BR': 'ferramentas',
    'en-US': 'tools',
  },
  'aip.modelPicker.filter.tools.hint': {
    'pt-BR': 'Apenas modelos que executam ferramentas e buscas',
    'en-US': 'Only models that run tools and searches',
  },
  'aip.modelPicker.filter.reasoning': {
    'pt-BR': 'raciocínio',
    'en-US': 'reasoning',
  },
  'aip.modelPicker.filter.reasoning.hint': {
    'pt-BR': 'Modelos que raciocinam passo a passo antes de responder',
    'en-US': 'Models that reason step by step before answering',
  },
  'aip.modelPicker.empty': {
    'pt-BR': 'Nenhum modelo bate com este filtro. Desligue um filtro acima.',
    'en-US': 'No model matches this filter. Turn off a filter above.',
  },
  'aip.modelPicker.emptyCatalog': {
    'pt-BR': 'Nenhum modelo disponível — verifique o catálogo.',
    'en-US': 'No models available — check the catalog.',
  },
  'aip.modelPicker.notConfigured': {
    'pt-BR': '(não configurado — procure o operador)',
    'en-US': '(not configured — contact the operator)',
  },
  'aip.modelPicker.legend.recommended': {
    'pt-BR': 'recomendado',
    'en-US': 'recommended',
  },
  'aip.modelPicker.legend.tools': {
    'pt-BR': 'ferramentas',
    'en-US': 'tools',
  },
  'aip.modelPicker.legend.reasoning': {
    'pt-BR': 'raciocínio',
    'en-US': 'reasoning',
  },
  'aip.modelPicker.ctx': {
    'pt-BR': 'ctx',
    'en-US': 'ctx',
  },

  // Capability badges — rótulos legíveis (nunca o código cru do backend).
  'aip.cap.tool_use': { 'pt-BR': 'ferramentas', 'en-US': 'tools' },
  'aip.cap.reasoning': { 'pt-BR': 'raciocínio', 'en-US': 'reasoning' },
  'aip.cap.long_context': { 'pt-BR': 'contexto longo', 'en-US': 'long context' },
  'aip.cap.vision': { 'pt-BR': 'visão', 'en-US': 'vision' },
  'aip.cap.streaming': { 'pt-BR': 'streaming', 'en-US': 'streaming' },
  'aip.cap.structured_outputs': {
    'pt-BR': 'estruturado',
    'en-US': 'structured',
  },
  'aip.cap.audio': { 'pt-BR': 'áudio', 'en-US': 'audio' },

  // ─── Páginas (Editor de Páginas — campos técnicos como selects) ────────
  // W8 — estado "arquivada" do render canônico /paginas/[slug]/view.
  'paginas.archived.title': {
    'pt-BR': 'Página indisponível',
    'en-US': 'Page unavailable',
  },
  'paginas.archived.desc': {
    'pt-BR':
      'Esta página foi arquivada em Páginas. Republique-a para reativar a rota.',
    'en-US': 'This page was archived in Pages. Republish it to reactivate the route.',
  },
  'paginas.permLabel': {
    'pt-BR': 'Permissão IAM exigida',
    'en-US': 'Required IAM permission',
  },
  'paginas.permFilterLabel': {
    'pt-BR': 'Permissão exigida',
    'en-US': 'Required permission',
  },
  'paginas.permHelp': {
    'pt-BR':
      'Operador sem esta permissão recebe acesso negado ao abrir a página.',
    'en-US': 'Operators lacking this permission are denied when opening the page.',
  },
  'paginas.permFilterAll': {
    'pt-BR': 'Todas as permissões',
    'en-US': 'All permissions',
  },
  'paginas.bindingsLabel': {
    'pt-BR': 'Bindings de Workspace',
    'en-US': 'Workspace bindings',
  },
  'paginas.bindingOperacao': { 'pt-BR': 'Operação', 'en-US': 'Operation' },
  'paginas.bindingEspaco': { 'pt-BR': 'Espaço', 'en-US': 'Space' },
  'paginas.bindingSala': { 'pt-BR': 'Sala', 'en-US': 'Room' },
  'paginas.markingsLabel': {
    'pt-BR': 'Marcações exigidas',
    'en-US': 'Required markings',
  },
  'paginas.markingsHelp': {
    'pt-BR':
      'Operador precisa da clearance de todas as marcações para ver a página.',
    'en-US':
      'Operators must hold the clearance for every marking to view the page.',
  },

  // ─── Solution Designer · inspector tabs overrides (skill/inference meta) ──
  // Feature 1 — populando as abas Documentação + Exemplo com dados reais da skill
  // proposta pelo AIP (param_schema) e da logic_function de Processamento.
  'solutions.skillDocParamRequired': { 'pt-BR': 'obrigatório', 'en-US': 'required' },
  'solutions.skillDocNoParams': {
    'pt-BR': 'Esta fonte não declara parâmetros adicionais.',
    'en-US': 'This source declares no additional parameters.',
  },
  'solutions.skillExampleConfigure': {
    'pt-BR': 'Configure {label} preenchendo {param} e ative a operação.',
    'en-US': 'Configure {label} by filling in {param} and activate the operation.',
  },
  'solutions.skillExampleNoParam': {
    'pt-BR': 'Selecione {label} e ative a operação — nenhum parâmetro adicional necessário.',
    'en-US': 'Select {label} and activate the operation — no additional parameters required.',
  },
  // Inference (processamento) — inspector tab overrides via logic_function data.
  'solutions.inferenceDocInputs': { 'pt-BR': 'Entradas', 'en-US': 'Inputs' },
  'solutions.inferenceDocNoInputs': {
    'pt-BR': 'Sem entradas declaradas para esta função.',
    'en-US': 'No declared inputs for this function.',
  },
  'solutions.inferenceExampleConfigure': {
    'pt-BR': 'Configure o modelo e o prompt para {name} e acione a inferência no fluxo.',
    'en-US': 'Configure the model and prompt for {name} and trigger the inference in the flow.',
  },

  // ─── Solution Designer · Feature 2 — ModalityAgentsSection ──────────────
  // Agentes de modalidade (aegis.*) propostos pelo AIP na fase Processamento.
  'solutions.modalityAgents': { 'pt-BR': 'Agentes de modalidade', 'en-US': 'Modality agents' },
  'solutions.modalityAgentsHint': {
    'pt-BR': 'Agentes especializados em visão, áudio ou outro canal — propostos pelo AIP para esta fase de processamento.',
    'en-US': 'Agents specialised in vision, audio or another channel — proposed by the AIP for this processing phase.',
  },

  // ─── Task 1 — DynamicRefSelect (SchemaForm) ──────────────────────────────
  'schemaForm.loading': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  'schemaForm.empty': { 'pt-BR': '— nenhum encontrado —', 'en-US': '— none found —' },
  'markingsSelect.empty': {
    'pt-BR': 'Nenhuma marcação cadastrada — defina em Governança › Marcações.',
    'en-US': 'No markings registered — define them in Governance › Markings.',
  },
  'markingsSelect.placeholder': {
    'pt-BR': 'Buscar marcações…',
    'en-US': 'Search markings…',
  },
  // #2 — lista de Documentos compartilhada (busca + filtros + categorização).
  'docList.search': { 'pt-BR': 'Buscar documentos…', 'en-US': 'Search documents…' },
  'docList.new': { 'pt-BR': 'Novo documento', 'en-US': 'New document' },
  'docList.allCls': { 'pt-BR': 'Todas', 'en-US': 'All' },
  'docList.allStates': { 'pt-BR': 'Qualquer estado', 'en-US': 'Any state' },
  'docList.signed': { 'pt-BR': 'Selados', 'en-US': 'Signed' },
  'docList.draft': { 'pt-BR': 'Rascunhos', 'en-US': 'Drafts' },
  'docList.docs': { 'pt-BR': 'documentos', 'en-US': 'documents' },
  'docList.empty': { 'pt-BR': 'Nenhum documento ainda.', 'en-US': 'No documents yet.' },
  'docList.noMatch': {
    'pt-BR': 'Nenhum documento corresponde aos filtros.',
    'en-US': 'No documents match the filters.',
  },
  'docList.clear': { 'pt-BR': 'Limpar filtros', 'en-US': 'Clear filters' },
  'schemaForm.proposedSuffix': { 'pt-BR': '· proposto', 'en-US': '· proposed' },
  'schemaForm.selectFirst': { 'pt-BR': 'selecione o tipo primeiro', 'en-US': 'select type first' },
  // Tarefa B — fallback honesto do dropdown dinâmico quando o backend está fora.
  'schemaForm.refUnavailable': {
    'pt-BR': 'lista indisponível agora — informe o identificador manualmente',
    'en-US': 'list unavailable right now — enter the identifier manually',
  },

  // ─── Tarefa A — chips de classes do detector (detector_classes + multi) ──
  'schemaForm.classSearch': { 'pt-BR': 'Buscar classe…', 'en-US': 'Search class…' },
  'schemaForm.classNoMatch': {
    'pt-BR': 'Nenhuma classe corresponde à busca.',
    'en-US': 'No class matches the search.',
  },
  // Linha de ação visível p/ adicionar a entrada como classe personalizada
  // (complemento p/ modelos ajustados — fora do catálogo do detector ativo).
  'schemaForm.classAddCustom': {
    'pt-BR': 'Adicionar classe personalizada:',
    'en-US': 'Add custom class:',
  },
  // Aviso DISCRETO quando há chip fora do catálogo do detector ativo.
  'schemaForm.classCustomNote': {
    'pt-BR': 'Classe fora do catálogo do detector ativo — vale apenas para modelos ajustados.',
    'en-US': 'Class outside the active detector catalog — only valid for fine-tuned models.',
  },
  // Fallback honesto: lista de classes indisponível (backend fora) — a
  // entrada manual continua fluindo (Enter adiciona o nome canônico).
  'schemaForm.classListUnavailable': {
    'pt-BR': 'lista de classes indisponível agora — digite o nome canônico e Enter para adicionar',
    'en-US': 'class list unavailable right now — type the canonical name and press Enter to add',
  },
  // Taxonomia operacional (2026-06-11) — toggle dos grupos advanced
  // (interiores/alimentos/pelúcia ficam COLAPSADOS; a busca varre tudo).
  'schemaForm.classAdvancedToggle': {
    'pt-BR': 'Outros (uso avançado)',
    'en-US': 'Others (advanced use)',
  },

  // ─── Taxonomia operacional — labels das CATEGORIAS de classes do detector ─
  // Padrão class-labels.ts: pt-BR ESPELHA o label do backend; en-US é o par.
  // Categoria sem entrada aqui cai no label do backend (fallback honesto).
  'skillClassCategories.pessoas': { 'pt-BR': 'Pessoas', 'en-US': 'People' },
  'skillClassCategories.mobilidade': { 'pt-BR': 'Mobilidade', 'en-US': 'Mobility' },
  'skillClassCategories.infraestrutura_urbana': {
    'pt-BR': 'Infraestrutura urbana',
    'en-US': 'Urban infrastructure',
  },
  'skillClassCategories.animais': { 'pt-BR': 'Animais', 'en-US': 'Animals' },
  'skillClassCategories.objetos_de_atencao': {
    'pt-BR': 'Objetos de atenção',
    'en-US': 'Objects of interest',
  },
  'skillClassCategories.esportes_e_lazer': {
    'pt-BR': 'Esportes e lazer',
    'en-US': 'Sports and leisure',
  },
  'skillClassCategories.interiores_e_objetos': {
    'pt-BR': 'Interiores e objetos',
    'en-US': 'Indoor items and objects',
  },

  // ─── Tarefa A — labels das classes do detector (COCO-80) no display layer ─
  // Padrão skill-labels.ts: pt-BR ESPELHA o label do backend; en-US é o par
  // traduzido. Classe sem entrada aqui (custom/fine-tuned) cai no label do
  // backend e, por fim, no name canônico — nunca string vazia.
  'skillClasses.person': { 'pt-BR': 'Pessoa', 'en-US': 'Person' },
  'skillClasses.bicycle': { 'pt-BR': 'Bicicleta', 'en-US': 'Bicycle' },
  'skillClasses.car': { 'pt-BR': 'Carro', 'en-US': 'Car' },
  'skillClasses.motorcycle': { 'pt-BR': 'Moto', 'en-US': 'Motorcycle' },
  'skillClasses.airplane': { 'pt-BR': 'Avião', 'en-US': 'Airplane' },
  'skillClasses.bus': { 'pt-BR': 'Ônibus', 'en-US': 'Bus' },
  'skillClasses.train': { 'pt-BR': 'Trem', 'en-US': 'Train' },
  'skillClasses.truck': { 'pt-BR': 'Caminhão', 'en-US': 'Truck' },
  'skillClasses.boat': { 'pt-BR': 'Barco', 'en-US': 'Boat' },
  'skillClasses.traffic light': { 'pt-BR': 'Semáforo', 'en-US': 'Traffic light' },
  'skillClasses.fire hydrant': { 'pt-BR': 'Hidrante', 'en-US': 'Fire hydrant' },
  'skillClasses.stop sign': { 'pt-BR': 'Placa de pare', 'en-US': 'Stop sign' },
  'skillClasses.parking meter': { 'pt-BR': 'Parquímetro', 'en-US': 'Parking meter' },
  'skillClasses.bench': { 'pt-BR': 'Banco de praça', 'en-US': 'Bench' },
  'skillClasses.bird': { 'pt-BR': 'Pássaro', 'en-US': 'Bird' },
  'skillClasses.cat': { 'pt-BR': 'Gato', 'en-US': 'Cat' },
  'skillClasses.dog': { 'pt-BR': 'Cachorro', 'en-US': 'Dog' },
  'skillClasses.horse': { 'pt-BR': 'Cavalo', 'en-US': 'Horse' },
  'skillClasses.sheep': { 'pt-BR': 'Ovelha', 'en-US': 'Sheep' },
  'skillClasses.cow': { 'pt-BR': 'Vaca', 'en-US': 'Cow' },
  'skillClasses.elephant': { 'pt-BR': 'Elefante', 'en-US': 'Elephant' },
  'skillClasses.bear': { 'pt-BR': 'Urso', 'en-US': 'Bear' },
  'skillClasses.zebra': { 'pt-BR': 'Zebra', 'en-US': 'Zebra' },
  'skillClasses.giraffe': { 'pt-BR': 'Girafa', 'en-US': 'Giraffe' },
  'skillClasses.backpack': { 'pt-BR': 'Mochila', 'en-US': 'Backpack' },
  'skillClasses.umbrella': { 'pt-BR': 'Guarda-chuva', 'en-US': 'Umbrella' },
  'skillClasses.handbag': { 'pt-BR': 'Bolsa de mão', 'en-US': 'Handbag' },
  'skillClasses.tie': { 'pt-BR': 'Gravata', 'en-US': 'Tie' },
  'skillClasses.suitcase': { 'pt-BR': 'Mala', 'en-US': 'Suitcase' },
  'skillClasses.frisbee': { 'pt-BR': 'Frisbee', 'en-US': 'Frisbee' },
  'skillClasses.skis': { 'pt-BR': 'Esquis', 'en-US': 'Skis' },
  'skillClasses.snowboard': { 'pt-BR': 'Prancha de snowboard', 'en-US': 'Snowboard' },
  'skillClasses.sports ball': { 'pt-BR': 'Bola esportiva', 'en-US': 'Sports ball' },
  'skillClasses.kite': { 'pt-BR': 'Pipa', 'en-US': 'Kite' },
  'skillClasses.baseball bat': { 'pt-BR': 'Taco de beisebol', 'en-US': 'Baseball bat' },
  'skillClasses.baseball glove': { 'pt-BR': 'Luva de beisebol', 'en-US': 'Baseball glove' },
  'skillClasses.skateboard': { 'pt-BR': 'Skate', 'en-US': 'Skateboard' },
  'skillClasses.surfboard': { 'pt-BR': 'Prancha de surfe', 'en-US': 'Surfboard' },
  'skillClasses.tennis racket': { 'pt-BR': 'Raquete de tênis', 'en-US': 'Tennis racket' },
  'skillClasses.bottle': { 'pt-BR': 'Garrafa', 'en-US': 'Bottle' },
  'skillClasses.wine glass': { 'pt-BR': 'Taça de vinho', 'en-US': 'Wine glass' },
  'skillClasses.cup': { 'pt-BR': 'Copo', 'en-US': 'Cup' },
  'skillClasses.fork': { 'pt-BR': 'Garfo', 'en-US': 'Fork' },
  'skillClasses.knife': { 'pt-BR': 'Faca', 'en-US': 'Knife' },
  'skillClasses.spoon': { 'pt-BR': 'Colher', 'en-US': 'Spoon' },
  'skillClasses.bowl': { 'pt-BR': 'Tigela', 'en-US': 'Bowl' },
  'skillClasses.banana': { 'pt-BR': 'Banana', 'en-US': 'Banana' },
  'skillClasses.apple': { 'pt-BR': 'Maçã', 'en-US': 'Apple' },
  'skillClasses.sandwich': { 'pt-BR': 'Sanduíche', 'en-US': 'Sandwich' },
  'skillClasses.orange': { 'pt-BR': 'Laranja', 'en-US': 'Orange' },
  'skillClasses.broccoli': { 'pt-BR': 'Brócolis', 'en-US': 'Broccoli' },
  'skillClasses.carrot': { 'pt-BR': 'Cenoura', 'en-US': 'Carrot' },
  'skillClasses.hot dog': { 'pt-BR': 'Cachorro-quente', 'en-US': 'Hot dog' },
  'skillClasses.pizza': { 'pt-BR': 'Pizza', 'en-US': 'Pizza' },
  'skillClasses.donut': { 'pt-BR': 'Rosquinha', 'en-US': 'Donut' },
  'skillClasses.cake': { 'pt-BR': 'Bolo', 'en-US': 'Cake' },
  'skillClasses.chair': { 'pt-BR': 'Cadeira', 'en-US': 'Chair' },
  'skillClasses.couch': { 'pt-BR': 'Sofá', 'en-US': 'Couch' },
  'skillClasses.potted plant': { 'pt-BR': 'Planta em vaso', 'en-US': 'Potted plant' },
  'skillClasses.bed': { 'pt-BR': 'Cama', 'en-US': 'Bed' },
  'skillClasses.dining table': { 'pt-BR': 'Mesa de jantar', 'en-US': 'Dining table' },
  'skillClasses.toilet': { 'pt-BR': 'Vaso sanitário', 'en-US': 'Toilet' },
  'skillClasses.tv': { 'pt-BR': 'Televisão', 'en-US': 'TV' },
  'skillClasses.laptop': { 'pt-BR': 'Notebook', 'en-US': 'Laptop' },
  'skillClasses.mouse': { 'pt-BR': 'Mouse', 'en-US': 'Mouse' },
  'skillClasses.remote': { 'pt-BR': 'Controle remoto', 'en-US': 'Remote control' },
  'skillClasses.keyboard': { 'pt-BR': 'Teclado', 'en-US': 'Keyboard' },
  'skillClasses.cell phone': { 'pt-BR': 'Celular', 'en-US': 'Cell phone' },
  'skillClasses.microwave': { 'pt-BR': 'Micro-ondas', 'en-US': 'Microwave' },
  'skillClasses.oven': { 'pt-BR': 'Forno', 'en-US': 'Oven' },
  'skillClasses.toaster': { 'pt-BR': 'Torradeira', 'en-US': 'Toaster' },
  'skillClasses.sink': { 'pt-BR': 'Pia', 'en-US': 'Sink' },
  'skillClasses.refrigerator': { 'pt-BR': 'Geladeira', 'en-US': 'Refrigerator' },
  'skillClasses.book': { 'pt-BR': 'Livro', 'en-US': 'Book' },
  'skillClasses.clock': { 'pt-BR': 'Relógio', 'en-US': 'Clock' },
  'skillClasses.vase': { 'pt-BR': 'Vaso', 'en-US': 'Vase' },
  'skillClasses.scissors': { 'pt-BR': 'Tesoura', 'en-US': 'Scissors' },
  'skillClasses.teddy bear': { 'pt-BR': 'Urso de pelúcia', 'en-US': 'Teddy bear' },
  'skillClasses.hair drier': { 'pt-BR': 'Secador de cabelo', 'en-US': 'Hair dryer' },
  'skillClasses.toothbrush': { 'pt-BR': 'Escova de dentes', 'en-US': 'Toothbrush' },

  // ─── Task 2 — InferenceConfigSection model metadata ─────────────────────
  'solutions.inferenceModelMeta': { 'pt-BR': 'Sobre o modelo', 'en-US': 'About the model' },
  'solutions.inferenceModelCtx': { 'pt-BR': 'Contexto', 'en-US': 'Context' },
  'solutions.inferenceModelCtxUnit': { 'pt-BR': 'mil tokens', 'en-US': 'k tokens' },
  'solutions.inferenceModelTierRapido': { 'pt-BR': 'Rápido', 'en-US': 'Fast' },
  'solutions.inferenceModelTierEquilibrado': { 'pt-BR': 'Equilibrado', 'en-US': 'Balanced' },
  'solutions.inferenceModelTierAvancado': { 'pt-BR': 'Avançado', 'en-US': 'Advanced' },
  // Note: aip.cap.* and aip.modelPicker.* keys already exist earlier in this dict.

  // ─── Task 3 — Variables panel inside InferenceConfigSection ──────────────
  'solutions.inferenceVariables': { 'pt-BR': 'Variáveis', 'en-US': 'Variables' },
  'solutions.inferenceVariablesHint': {
    'pt-BR': 'Variáveis disponíveis no prompt: use {{nome}} para inserir.',
    'en-US': 'Variables available in the prompt: use {{name}} to insert.',
  },
  'solutions.inferenceVariablesEmpty': {
    'pt-BR': 'Nenhuma variável declarada.',
    'en-US': 'No variables declared.',
  },
  'solutions.inferenceVariablesInsert': { 'pt-BR': 'Inserir variável', 'en-US': 'Insert variable' },
  'solutions.inferenceVariablesAdd': { 'pt-BR': 'Adicionar variável', 'en-US': 'Add variable' },
  'solutions.inferenceVariablesBuiltins': { 'pt-BR': 'Disponíveis (built-ins)', 'en-US': 'Available (built-ins)' },
  'solutions.inferenceVariablesObjectFields': { 'pt-BR': 'Campos do objeto', 'en-US': 'Object fields' },
  'solutions.inferenceVariablesObjectFieldsHint': {
    'pt-BR': 'Propriedades do objeto sendo processado. Clique p/ inserir {{campo}} no template — a inferência substitui pelo valor de cada objeto.',
    'en-US': 'Properties of the object being processed. Click to insert {{field}} into the template — inference replaces it with each object value.',
  },
  'solutions.inferenceVariablesObjectFieldsEmpty': {
    'pt-BR': 'Defina o Tipo de objeto de entrada deste nó para ver os campos disponíveis.',
    'en-US': 'Set this node input object type to see the available fields.',
  },
  'solutions.inferenceVariablesDeclared': { 'pt-BR': 'Declaradas neste nó', 'en-US': 'Declared on this node' },
  'solutions.inferenceVariablesRemove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'solutions.inferenceVariablesSave': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'solutions.inferenceVariablesCancel': { 'pt-BR': 'Cancelar', 'en-US': 'Cancel' },
  'solutions.inferenceVariablesName': { 'pt-BR': 'Nome', 'en-US': 'Name' },
  'solutions.inferenceVariablesKind': { 'pt-BR': 'Origem', 'en-US': 'Source' },
  'solutions.inferenceVariablesObjectType': { 'pt-BR': 'Tipo de objeto', 'en-US': 'Object type' },
  // #1 — filtro + limite da variável objectSet.
  'solutions.inferenceVariablesFilter': { 'pt-BR': 'Filtro (opcional)', 'en-US': 'Filter (optional)' },
  'solutions.inferenceVariablesFilterField': { 'pt-BR': 'campo', 'en-US': 'field' },
  'solutions.inferenceVariablesFilterValue': { 'pt-BR': 'valor', 'en-US': 'value' },
  'solutions.inferenceVariablesLimit': { 'pt-BR': 'Limite', 'en-US': 'Limit' },
  'solutions.inferenceVariablesFilterAdd': { 'pt-BR': '+ condição', 'en-US': '+ condition' },
  // #1 v2 — modo relação (objetos ligados a ESTE objeto).
  'solutions.inferenceVariablesRelationMode': { 'pt-BR': 'Objetos ligados a ESTE (relação)', 'en-US': 'Objects linked to THIS one (relation)' },
  'solutions.inferenceVariablesRelationHint': {
    'pt-BR': 'Em vez de consultar o tipo todo, anda 1 salto a partir do objeto que está sendo processado (ex.: tweets DESTE perfil). A contagem/agregação/filtro valem sobre os objetos ligados.',
    'en-US': 'Instead of querying the whole type, walks 1 hop from the object being processed (e.g. tweets of THIS profile). Count/aggregation/filter apply to the linked objects.',
  },
  'solutions.inferenceVariablesRelationPick': { 'pt-BR': 'escolha a relação', 'en-US': 'pick the relation' },
  'solutions.relationBoth': { 'pt-BR': 'ambos os sentidos', 'en-US': 'both ways' },
  'solutions.relationOut': { 'pt-BR': 'saída (este → outros)', 'en-US': 'outgoing (this → others)' },
  'solutions.relationIn': { 'pt-BR': 'entrada (outros → este)', 'en-US': 'incoming (others → this)' },
  'solutions.filterEq': { 'pt-BR': 'igual a', 'en-US': 'equals' },
  'solutions.filterNeq': { 'pt-BR': 'diferente de', 'en-US': 'not equals' },
  'solutions.filterContains': { 'pt-BR': 'contém', 'en-US': 'contains' },
  'solutions.filterGt': { 'pt-BR': 'maior que', 'en-US': 'greater than' },
  'solutions.filterLt': { 'pt-BR': 'menor que', 'en-US': 'less than' },
  'solutions.filterGte': { 'pt-BR': 'maior/igual', 'en-US': 'greater/equal' },
  'solutions.filterLte': { 'pt-BR': 'menor/igual', 'en-US': 'less/equal' },
  'solutions.filterExists': { 'pt-BR': 'existe', 'en-US': 'exists' },
  'solutions.filterNotExists': { 'pt-BR': 'não existe', 'en-US': 'does not exist' },
  'solutions.inferenceVariablesProperty': { 'pt-BR': 'Propriedade', 'en-US': 'Property' },
  'solutions.inferenceVariablesValue': { 'pt-BR': 'Valor fixo', 'en-US': 'Fixed value' },
  'solutions.inferenceVariablesSelectionMode': { 'pt-BR': 'O que selecionar', 'en-US': 'What to select' },
  'solutions.inferenceVariablesModeWhole': { 'pt-BR': 'Objeto inteiro', 'en-US': 'Whole object' },
  'solutions.inferenceVariablesModeProperty': { 'pt-BR': 'Propriedade / coluna', 'en-US': 'Property / column' },
  'solutions.inferenceVariablesModeAggregation': { 'pt-BR': 'Agregação', 'en-US': 'Aggregation' },
  'solutions.inferenceVariablesAggOp': { 'pt-BR': 'Operação de agregação', 'en-US': 'Aggregation operator' },
  'solutions.inferenceVariablesAggField': { 'pt-BR': 'Campo a agregar', 'en-US': 'Field to aggregate' },
  'solutions.inferenceVariablesNoProperties': {
    'pt-BR': 'Este tipo de objeto não tem propriedades declaradas. Declare-as no Editor de Tipos (ontologia) primeiro.',
    'en-US': 'This object type has no declared properties. Declare them in the Type Editor (ontology) first.',
  },
  'solutions.inferenceVariablesUnresolved': {
    'pt-BR': 'Referências sem variável declarada: {{refs}}',
    'en-US': 'Unresolved references: {{refs}}',
  },
  'solutions.inferenceVariablesPickerTitle': { 'pt-BR': 'Inserir referência', 'en-US': 'Insert reference' },
  'solutions.inferenceVariablesPickerHint': {
    'pt-BR': 'Clique para inserir no cursor do prompt.',
    'en-US': 'Click to insert at the prompt cursor.',
  },
  'solutions.inferenceVariablesKind_static': { 'pt-BR': 'Valor fixo', 'en-US': 'Fixed value' },
  'solutions.inferenceVariablesKind_objectSet': { 'pt-BR': 'Busca de objetos', 'en-US': 'Object search' },
  'solutions.inferenceVariablesKind_expression': { 'pt-BR': 'Expressão', 'en-US': 'Expression' },

  // ─── Task 4 — ModalityAgentsSection expanded affordances ─────────────────
  'solutions.modalityAgentHowToUse': { 'pt-BR': 'Como usar', 'en-US': 'How to use' },
  'solutions.modalityHelpVisionUse': {
    'pt-BR': 'Analisa frames de câmera e detecta objetos, faces ou placas. O resultado é anexado como propriedade no objeto de saída do nó.',
    'en-US': 'Analyses camera frames and detects objects, faces or plates. The result is attached as a property on the node output object.',
  },
  'solutions.modalityHelpVisionEdits': {
    'pt-BR': 'Parâmetros editáveis abaixo. Saída configurável no nó de Coleta.',
    'en-US': 'Editable parameters below. Output configurable in the Collection node.',
  },
  'solutions.modalityHelpAudioUse': {
    'pt-BR': 'Transcreve áudio ou detecta padrões sonoros. A transcrição entra no prompt da inferência como {{transcricao}}.',
    'en-US': 'Transcribes audio or detects sound patterns. The transcript feeds the inference prompt as {{transcricao}}.',
  },
  'solutions.modalityHelpAudioEdits': {
    'pt-BR': 'Configure idioma e sensibilidade abaixo.',
    'en-US': 'Configure language and sensitivity below.',
  },
  'solutions.modalityHelpImageUse': {
    'pt-BR': 'Classifica ou extrai texto de imagens estáticas. Use para OCR de documentos ou classificação de imagens de evidência.',
    'en-US': 'Classifies or extracts text from static images. Use for document OCR or evidence image classification.',
  },
  'solutions.modalityHelpImageEdits': {
    'pt-BR': 'Escolha o modelo de visão abaixo.',
    'en-US': 'Choose the vision model below.',
  },
  'solutions.modalityHelpGenericUse': {
    'pt-BR': 'Agente especializado de modalidade — consulte a documentação do skill.',
    'en-US': 'Specialised modality agent — see the skill documentation.',
  },
  'solutions.modalityHelpGenericEdits': {
    'pt-BR': 'Parâmetros configuráveis abaixo.',
    'en-US': 'Configurable parameters below.',
  },
  'solutions.modalityAgentWhereEdits': { 'pt-BR': 'Onde editar', 'en-US': 'Where to edit' },
  'solutions.modalityAgentConfigure': { 'pt-BR': 'Configurar', 'en-US': 'Configure' },
  'solutions.modalityAgentCollapseConfig': { 'pt-BR': 'Fechar', 'en-US': 'Close' },
  'solutions.modalityAgentNoParams': {
    'pt-BR': 'Este agente não tem parâmetros configuráveis.',
    'en-US': 'This agent has no configurable parameters.',
  },
  'solutions.modalityAgentLoadingParams': { 'pt-BR': 'Carregando parâmetros…', 'en-US': 'Loading parameters…' },
  // Transformer
  'solutions.transformer': { 'pt-BR': 'Transformador (código)', 'en-US': 'Transformer (code)' },
  'solutions.transformerHint': {
    'pt-BR': 'Função de código que pré-processa os dados antes da inferência.',
    'en-US': 'Code function that pre-processes data before inference.',
  },
  'solutions.transformerSelect': { 'pt-BR': 'Selecionar Função…', 'en-US': 'Select Function…' },
  'solutions.transformerOpenIde': { 'pt-BR': 'Abrir IDE', 'en-US': 'Open IDE' },
  'solutions.transformerNone': { 'pt-BR': '— Nenhuma função —', 'en-US': '— No function —' },
  'solutions.transformerNoFunctions': {
    'pt-BR': 'Nenhuma função encontrada. Crie uma no IDE.',
    'en-US': 'No functions found. Create one in the IDE.',
  },
  'solutions.transformerLoading': { 'pt-BR': 'Carregando funções…', 'en-US': 'Loading functions…' },

  // ─── NodeInspector · 3-tab layout (Foundry canonical inspector) ──────────
  'nodeTabs.config': { 'pt-BR': 'Configuração', 'en-US': 'Setup' },
  'nodeTabs.metadata': { 'pt-BR': 'Metadados', 'en-US': 'Metadata' },
  'nodeTabs.display': { 'pt-BR': 'Exibição', 'en-US': 'Display' },
  'nodeTabs.rawJson': { 'pt-BR': 'JSON do nó', 'en-US': 'Node JSON' },
  'nodeTabs.displayPhase': { 'pt-BR': 'Fase', 'en-US': 'Phase' },
  'nodeTabs.displayKind': { 'pt-BR': 'Tipo', 'en-US': 'Kind' },
  'nodeTabs.displayNote': {
    'pt-BR': 'Configurações de estilo e visibilidade chegam com o motor de Variáveis.',
    'en-US': 'Style and visibility settings arrive with the Variables engine.',
  },
  'nodeTabs.displayEmpty': {
    'pt-BR': 'Sem opções de exibição para este nó.',
    'en-US': 'No display options for this node.',
  },

  // ─── NodeInspector · Metadados tab — structured facts ────────────────────
  'nodeTabs.metaFacts': { 'pt-BR': 'Resumo do nó', 'en-US': 'Node summary' },
  'nodeTabs.metaFactPhase': { 'pt-BR': 'Fase', 'en-US': 'Phase' },
  'nodeTabs.metaFactKind': { 'pt-BR': 'Tipo', 'en-US': 'Kind' },
  'nodeTabs.metaFactSkill': { 'pt-BR': 'Skill vinculada', 'en-US': 'Bound skill' },
  'nodeTabs.metaFactModel': { 'pt-BR': 'Modelo de inferência', 'en-US': 'Inference model' },
  'nodeTabs.metaFactObjectType': { 'pt-BR': 'Tipo de objeto de saída', 'en-US': 'Output object type' },
  'nodeTabs.metaFactTransformer': { 'pt-BR': 'Transformador', 'en-US': 'Transformer' },
  'nodeTabs.metaFactVariables': { 'pt-BR': 'Variáveis declaradas', 'en-US': 'Declared variables' },
  'nodeTabs.metaFactNone': { 'pt-BR': '—', 'en-US': '—' },

  // ─── NodeInspector · Exibição tab — graph connectivity ───────────────────
  'nodeTabs.displayConnectivity': { 'pt-BR': 'Conectividade', 'en-US': 'Connectivity' },
  'nodeTabs.displayInbound': { 'pt-BR': 'Entradas', 'en-US': 'Inbound' },
  'nodeTabs.displayOutbound': { 'pt-BR': 'Saídas', 'en-US': 'Outbound' },
  'nodeTabs.displayEdgesNone': { 'pt-BR': 'Nenhuma conexão', 'en-US': 'No connections' },
  'nodeTabs.displayConsumes': { 'pt-BR': 'Recebe de', 'en-US': 'Receives from' },
  'nodeTabs.displayProduces': { 'pt-BR': 'Envia para', 'en-US': 'Sends to' },
  'nodeTabs.displayIsolated': {
    'pt-BR': 'Este nó não tem conexões no grafo.',
    'en-US': 'This node has no connections in the graph.',
  },

  // ─── TransformerConfigSection · IDE drawer ────────────────────────────────
  'solutions.transformerEditFn': { 'pt-BR': 'Editar', 'en-US': 'Edit' },
  'solutions.transformerNewFn': { 'pt-BR': 'Criar', 'en-US': 'Create' },
  'solutions.toggleFullscreen': { 'pt-BR': 'Tela cheia', 'en-US': 'Fullscreen' },
  'solutions.exitFullscreen': { 'pt-BR': 'Sair da tela cheia', 'en-US': 'Exit fullscreen' },
  'solutions.processingModeLabel': { 'pt-BR': 'Modo de processamento', 'en-US': 'Processing mode' },
  'solutions.processingModeInference': { 'pt-BR': 'Inferência (IA)', 'en-US': 'Inference (AI)' },
  'solutions.processingModeTransformer': { 'pt-BR': 'Transformação', 'en-US': 'Transformation' },
  'solutions.processingModeBoth': { 'pt-BR': 'Ambos', 'en-US': 'Both' },
  'solutions.processingModeHint': {
    'pt-BR': 'Como este nó trata os dados: a IA interpreta o contexto e infere o resultado, a transformação roda código determinístico (sem IA), ou combine os dois (transforma e depois infere).',
    'en-US': 'How this node handles data: AI interprets context and infers the result, transformation runs deterministic code (no AI), or combine both (transform then infer).',
  },
  'solutions.transformerDrawerTitle': { 'pt-BR': 'Editor de transformador', 'en-US': 'Transformer editor' },
  'solutions.transformerDrawerHint': {
    'pt-BR': 'Escreva a função de transformação que pré-processa os dados antes da inferência. Ao salvar, a função é vinculada automaticamente a este nó.',
    'en-US': 'Write the transform function that pre-processes data before inference. On save, the function is automatically linked to this node.',
  },
  'solutions.transformerSaveFn': { 'pt-BR': 'Salvar e vincular', 'en-US': 'Save and link' },
  'solutions.transformerSaving': { 'pt-BR': 'Salvando…', 'en-US': 'Saving…' },
  'solutions.transformerSaved': { 'pt-BR': 'Salvo e vinculado.', 'en-US': 'Saved and linked.' },
  'solutions.transformerSaveErr': { 'pt-BR': 'Erro ao salvar. Tente novamente.', 'en-US': 'Save error. Please retry.' },

  // ─── InferenceConfigSection · Add variable modal ──────────────────────────
  'solutions.variableModalTitle': { 'pt-BR': 'Adicionar variável', 'en-US': 'Add variable' },
  'solutions.variableModalHint': {
    'pt-BR': 'Defina uma variável para usar no prompt com a sintaxe {{nome}}.',
    'en-US': 'Define a variable to use in the prompt with {{name}} syntax.',
  },

  // ─── Widget · Mapa de calor (matriz) ──────────────────────────────────────
  'heatmapMatrix.configHint': {
    'pt-BR': 'Configure o campo das linhas e o campo das colunas (e, opcionalmente, o campo do valor + a operação) no Inspetor.',
    'en-US': 'Set the row field and column field (and optionally the value field + operation) in the Inspector.',
  },
  'heatmapMatrix.empty': {
    'pt-BR': 'Sem dados na fonte selecionada.',
    'en-US': 'No data in the selected source.',
  },
  'heatmapMatrix.scale': { 'pt-BR': 'intensidade', 'en-US': 'intensity' },

  // ─── Widget · Reprodutor de áudio ─────────────────────────────────────────
  'audioPlayer.title': { 'pt-BR': 'Áudio', 'en-US': 'Audio' },
  'audioPlayer.empty': {
    'pt-BR': 'Configure a URL ou a propriedade do objeto que carrega o áudio.',
    'en-US': 'Set the URL or the object property that holds the audio.',
  },
  'audioPlayer.transcript': { 'pt-BR': 'Transcrição', 'en-US': 'Transcript' },

  // ─── Tarefa D — ficha canônica: rename inline + atalho da ontologia ──────
  'ficha.rename.tooltip': { 'pt-BR': 'Clique para renomear', 'en-US': 'Click to rename' },
  'ficha.rename.placeholder': { 'pt-BR': 'Novo nome', 'en-US': 'New name' },
  'ficha.rename.error': { 'pt-BR': 'Erro ao salvar o nome.', 'en-US': 'Failed to save the name.' },
  'instancias.abrirFicha': { 'pt-BR': 'Abrir ficha', 'en-US': 'Open record' },

  // ─── Painel RAG (Conversas · artifact lateral) ────────────────────────────
  'aipRag.noResults': {
    'pt-BR': 'Nenhum resultado nas coleções consultadas.',
    'en-US': 'No results in the queried collections.',
  },
  'aipRag.emptyHint': {
    'pt-BR': 'Resultado da consulta aparece aqui depois de buscar.',
    'en-US': 'Query results appear here after you search.',
  },
  // SF1 (Onda 1) — rótulo HUMANO da fonte da busca. Nunca expõe o valor técnico
  // do backend (qdrant/none/social_module) pro operador; o `.other` é fallback
  // p/ um backend desconhecido (chave inexistente → useT devolve a própria key).
  'aipRag.backendStatus.none': { 'pt-BR': 'Sem fonte', 'en-US': 'No source' },
  'aipRag.backendStatus.qdrant': { 'pt-BR': 'Base vetorial', 'en-US': 'Vector base' },
  'aipRag.backendStatus.social_module': { 'pt-BR': 'Módulo social', 'en-US': 'Social module' },
  'aipRag.backendStatus.other': { 'pt-BR': 'Outra fonte', 'en-US': 'Other source' },
  // Contagem de resultados — singular/plural por locale (sem termo técnico "matches").
  'aipRag.matchOne': { 'pt-BR': 'resultado', 'en-US': 'match' },
  'aipRag.matchMany': { 'pt-BR': 'resultados', 'en-US': 'matches' },
  // Onda 4a — strings antes hardcoded (régua i18n pt-BR+en-US).
  'aipRag.searchPlaceholder': { 'pt-BR': 'Buscar nas coleções…', 'en-US': 'Search the collections…' },
  'aipRag.searchBtn': { 'pt-BR': 'Buscar', 'en-US': 'Search' },
  'aipRag.collectionsTitle': { 'pt-BR': 'Coleções', 'en-US': 'Collections' },
  'aipRag.copyAsContext': { 'pt-BR': 'Copiar como contexto', 'en-US': 'Copy as context' },
  // Cabeçalho do bloco INSERIDO no composer (distinto do tooltip do botão).
  'aipRag.contextBlock': { 'pt-BR': 'Contexto RAG', 'en-US': 'RAG context' },
  // Onda 4a — controle de PROFUNDIDADE (buckets nomeados, nunca o top_k técnico cru).
  'aipRag.depth.label': { 'pt-BR': 'Profundidade', 'en-US': 'Depth' },
  'aipRag.depth.focus': { 'pt-BR': 'Foco', 'en-US': 'Focus' },
  'aipRag.depth.balanced': { 'pt-BR': 'Equilíbrio', 'en-US': 'Balanced' },
  'aipRag.depth.broad': { 'pt-BR': 'Amplo', 'en-US': 'Broad' },
  'aipRag.depth.hint': {
    'pt-BR': 'Quantos trechos a busca recupera por coleção.',
    'en-US': 'How many passages the search retrieves per collection.',
  },
  // Onda 4a — metadados HONESTOS por coleção. docCountUnknown = contagem desconhecida.
  'aipRag.docCount': { 'pt-BR': 'docs', 'en-US': 'docs' },
  'aipRag.docCountUnknown': { 'pt-BR': '—', 'en-US': '—' },
  'aipRag.docCountUnknownTip': {
    'pt-BR': 'Contagem indisponível para esta fonte (sem inventar número).',
    'en-US': 'Count unavailable for this source (no fabricated number).',
  },
  // Onda 4a — facetas REAIS p/ o filtro de coleções (origem/source — humanizada).
  'aipRag.filterAll': { 'pt-BR': 'Todas', 'en-US': 'All' },
  'aipRag.source.social': { 'pt-BR': 'Social', 'en-US': 'Social' },
  'aipRag.source.cctv': { 'pt-BR': 'Vídeo', 'en-US': 'Video' },
  'aipRag.source.operator': { 'pt-BR': 'Operador', 'en-US': 'Operator' },
  'aipRag.source.dataset': { 'pt-BR': 'Datasets', 'en-US': 'Datasets' },
  // A11 — sincronia Coleções ⇄ fluxos do DAG (proveniência do fluxo produtor).
  'aipRag.tagFacet': { 'pt-BR': 'Tags', 'en-US': 'Tags' },
  'aipRag.fromFlow': { 'pt-BR': 'do fluxo', 'en-US': 'from flow' },
  'aipRag.fromFlowTip': { 'pt-BR': 'Abrir o fluxo do DAG que produziu esta coleção', 'en-US': 'Open the DAG flow that produced this collection' },

  // ─── /alertas — caixa unificada sobre o store na ontologia ───────────────
  'alertas.title': { 'pt-BR': 'Alertas', 'en-US': 'Alerts' },
  'alertas.classification': { 'pt-BR': 'CAIXA DE ALERTAS', 'en-US': 'ALERTS INBOX' },
  'alertas.search.placeholder': { 'pt-BR': 'Buscar alertas…', 'en-US': 'Search alerts…' },
  'alertas.filters': { 'pt-BR': 'Filtros', 'en-US': 'Filters' },
  'alertas.messages': { 'pt-BR': 'mensagens', 'en-US': 'messages' },
  'alertas.canal.todos': { 'pt-BR': 'Todas as mensagens', 'en-US': 'All messages' },
  'alertas.canal.feed': { 'pt-BR': 'Feeds de busca', 'en-US': 'Search feeds' },
  'alertas.canal.watch': { 'pt-BR': 'Objetos observados', 'en-US': 'Watched objects' },
  'alertas.canal.geofence': { 'pt-BR': 'Cercas virtuais', 'en-US': 'Geofences' },
  'alertas.canal.share': { 'pt-BR': 'Compartilhados', 'en-US': 'Shared with me' },
  'alertas.canal.hotlist': { 'pt-BR': 'Placa procurada', 'en-US': 'Watched plate' },
  'alertas.empty.title': { 'pt-BR': 'Sem alertas no momento', 'en-US': 'No alerts right now' },
  'alertas.empty.body': {
    'pt-BR': 'Quando uma cerca virtual, feed de busca, objeto observado ou compartilhamento disparar, o alerta aparece aqui.',
    'en-US': 'When a geofence, search feed, watched object or share fires, the alert shows up here.',
  },
  'alertas.error.title': { 'pt-BR': 'Falha ao carregar alertas', 'en-US': 'Failed to load alerts' },
  'alertas.error.body': {
    'pt-BR': 'Não foi possível consultar o serviço de alertas. Tente novamente.',
    'en-US': 'Could not reach the alerts service. Try again.',
  },
  'alertas.retry': { 'pt-BR': 'Tentar novamente', 'en-US': 'Retry' },
  'alertas.resolve': { 'pt-BR': 'Resolver', 'en-US': 'Resolve' },
  'alertas.resolved': { 'pt-BR': 'Resolvido', 'en-US': 'Resolved' },
  'alertas.detail.data': { 'pt-BR': 'Dados do alerta', 'en-US': 'Alert data' },
  'alertas.detail.restricted': {
    'pt-BR': 'Conteúdo restrito pela sua credencial de classificação.',
    'en-US': 'Content restricted by your classification clearance.',
  },
  'alertas.detail.firedAt': { 'pt-BR': 'Disparado em', 'en-US': 'Fired at' },
  'alertas.detail.severity': { 'pt-BR': 'Severidade', 'en-US': 'Severity' },
  'alertas.detail.classificationField': { 'pt-BR': 'Classificação', 'en-US': 'Classification' },
  'alertas.severity.low': { 'pt-BR': 'Baixa', 'en-US': 'Low' },
  'alertas.severity.medium': { 'pt-BR': 'Média', 'en-US': 'Medium' },
  'alertas.severity.high': { 'pt-BR': 'Alta', 'en-US': 'High' },
  'alertas.severity.critical': { 'pt-BR': 'Crítica', 'en-US': 'Critical' },
  // Widget alert_list + rota /alertas parametrizável (2026-06-12)
  'alertas.widget.confirmTitle': { 'pt-BR': 'Resolver alerta', 'en-US': 'Resolve alert' },
  'alertas.widget.confirmBody': {
    'pt-BR': 'Marcar este alerta como resolvido? O gesto fica registrado na auditoria.',
    'en-US': 'Mark this alert as resolved? The action is recorded in the audit trail.',
  },
  'alertas.personalizar': { 'pt-BR': 'Personalizar', 'en-US': 'Customize' },
  'alertas.fallbackSeed': {
    'pt-BR': 'A página registrada de Alertas não foi encontrada — exibindo o layout padrão.',
    'en-US': 'The registered Alerts page was not found — showing the default layout.',
  },
  // ─── BACKLOG #6a (gestão/auditoria) — filtro de status, atribuição, trilha ──
  'alertas.detail.status': { 'pt-BR': 'Status', 'en-US': 'Status' },
  'alertas.detail.ackLatency': {
    'pt-BR': 'Tempo até reconhecimento',
    'en-US': 'Time to acknowledge',
  },
  'alertas.status.pending': { 'pt-BR': 'Pendente', 'en-US': 'Pending' },
  'alertas.status.acknowledged': { 'pt-BR': 'Resolvido', 'en-US': 'Resolved' },
  'alertas.status.silenced': { 'pt-BR': 'Silenciado', 'en-US': 'Silenced' },
  // Atribuição do gesto de resolução.
  'alertas.attribution.by': { 'pt-BR': 'Resolvido por', 'en-US': 'Resolved by' },
  // Filtro de status (gestão).
  'alertas.filter.label': { 'pt-BR': 'Filtrar por status', 'en-US': 'Filter by status' },
  'alertas.filter.all': { 'pt-BR': 'Todos', 'en-US': 'All' },
  'alertas.filter.pending': { 'pt-BR': 'Pendentes', 'en-US': 'Pending' },
  'alertas.filter.resolved': { 'pt-BR': 'Resolvidos', 'en-US': 'Resolved' },
  'alertas.filter.escalated': { 'pt-BR': 'Escalados', 'en-US': 'Escalated' },
  'alertas.filter.empty': {
    'pt-BR': 'Nenhum alerta neste filtro.',
    'en-US': 'No alerts in this filter.',
  },
  // Trilha de auditoria (drawer).
  'alertas.trail.open': { 'pt-BR': 'Auditoria', 'en-US': 'Audit' },
  'alertas.trail.title': { 'pt-BR': 'Auditoria do alerta', 'en-US': 'Alert audit trail' },
  'alertas.trail.heading': { 'pt-BR': 'Linha do tempo', 'en-US': 'Timeline' },
  'alertas.trail.loading': { 'pt-BR': 'Carregando trilha…', 'en-US': 'Loading trail…' },
  'alertas.trail.empty': {
    'pt-BR': 'Sem eventos de auditoria para este alerta.',
    'en-US': 'No audit events for this alert.',
  },
  'alertas.trail.error': {
    'pt-BR': 'Falha ao carregar a trilha de auditoria.',
    'en-US': 'Failed to load the audit trail.',
  },
  'alertas.trail.actor': { 'pt-BR': 'Ator', 'en-US': 'Actor' },
  'alertas.trail.channel': { 'pt-BR': 'Canal', 'en-US': 'Channel' },
  'alertas.trail.failed': { 'pt-BR': 'Falhou', 'en-US': 'Failed' },
  // Rótulo humano por gesto da trilha (nunca o token cru).
  'alertas.trail.emitted': { 'pt-BR': 'Emitido', 'en-US': 'Emitted' },
  'alertas.trail.delivered': { 'pt-BR': 'Entregue', 'en-US': 'Delivered' },
  'alertas.trail.acknowledged': { 'pt-BR': 'Reconhecido', 'en-US': 'Acknowledged' },
  'alertas.trail.escalated': { 'pt-BR': 'Escalado', 'en-US': 'Escalated' },
  'alertas.trail.silenced': { 'pt-BR': 'Silenciado', 'en-US': 'Silenced' },

  // ─── /geo — Mapa Operacional (camadas da ontologia + cercas reais) ────
  'geo.title': { 'pt-BR': 'Mapa Operacional', 'en-US': 'Operational Map' },
  'geo.subtitle': {
    'pt-BR': 'Visão geoespacial · camadas da ontologia · cercas virtuais',
    'en-US': 'Geospatial view · ontology layers · virtual fences',
  },
  'geo.toolbar.exportPng': { 'pt-BR': 'Exportar PNG', 'en-US': 'Export PNG' },
  'geo.toolbar.exportNotReady': {
    'pt-BR': 'O mapa ainda não terminou de carregar — tente de novo.',
    'en-US': 'The map has not finished loading yet — try again.',
  },
  'geo.window.label': { 'pt-BR': 'Janela', 'en-US': 'Window' },
  'geo.window.hint': {
    'pt-BR': 'Janela temporal das camadas dinâmicas — refaz a busca no servidor.',
    'en-US': 'Time window for dynamic layers — re-queries the server.',
  },
  'geo.window.all': { 'pt-BR': 'Tudo', 'en-US': 'All' },
  'geo.window.15m': { 'pt-BR': '15 min', 'en-US': '15 min' },
  'geo.window.1h': { 'pt-BR': '1 h', 'en-US': '1 h' },
  'geo.window.6h': { 'pt-BR': '6 h', 'en-US': '6 h' },
  'geo.window.24h': { 'pt-BR': '24 h', 'en-US': '24 h' },
  'geo.layers.ontology': { 'pt-BR': 'Camadas da ontologia', 'en-US': 'Ontology layers' },
  'geo.layers.reference': { 'pt-BR': 'Camadas de referência', 'en-US': 'Reference layers' },
  'geo.layers.openBuilder': {
    'pt-BR': 'Abrir o Construtor de Camadas',
    'en-US': 'Open the Layer Builder',
  },
  'geo.layers.referenceEmpty': {
    'pt-BR': 'Nenhuma camada externa disponível.',
    'en-US': 'No external layers available.',
  },
  'geo.layers.ontologyEmpty': {
    'pt-BR': 'Nenhum tipo com nós geolocalizados neste tenant.',
    'en-US': 'No types with geolocated nodes in this tenant.',
  },
  'geo.layers.truncated': {
    'pt-BR': 'lista cortada — refine a janela',
    'en-US': 'list truncated — narrow the window',
  },
  // ── Aba "Fontes" do painel /geo (registro data-driven de fontes) ────────
  'geo.sources.search': { 'pt-BR': 'Buscar fontes…', 'en-US': 'Search sources…' },
  'geo.sources.empty': { 'pt-BR': 'Nenhuma fonte.', 'en-US': 'No sources.' },
  'geo.sources.openFlow': { 'pt-BR': 'abrir fluxo', 'en-US': 'open flow' },
  'geo.sources.openOrigin': { 'pt-BR': 'abrir origem', 'en-US': 'open source' },
  'geo.sources.state.active': { 'pt-BR': 'ativo', 'en-US': 'active' },
  'geo.sources.state.idle': { 'pt-BR': 'ocioso', 'en-US': 'idle' },
  'geo.sources.state.available': { 'pt-BR': 'disponível', 'en-US': 'available' },
  'geo.sources.state.empty': { 'pt-BR': 'vazio', 'en-US': 'empty' },
  'geo.sources.state.offline': { 'pt-BR': 'offline', 'en-US': 'offline' },
  'geo.sources.cat.ontology': { 'pt-BR': 'Ontologia', 'en-US': 'Ontology' },
  'geo.sources.cat.reference': { 'pt-BR': 'Referência', 'en-US': 'Reference' },
  'geo.sources.cat.cctv': { 'pt-BR': 'CCTV', 'en-US': 'CCTV' },
  'geo.sources.cat.geofence': { 'pt-BR': 'Cercas', 'en-US': 'Fences' },
  'geo.sources.cat.correlation': { 'pt-BR': 'Correlações', 'en-US': 'Correlations' },
  'geo.evaluator.title': { 'pt-BR': 'Motor de geocercas', 'en-US': 'Geofence evaluator' },
  'geo.evaluator.active': { 'pt-BR': 'Ativo', 'en-US': 'Active' },
  'geo.evaluator.inactive': { 'pt-BR': 'Inativo', 'en-US': 'Inactive' },
  'geo.evaluator.geofences': { 'pt-BR': 'Cercas avaliadas', 'en-US': 'Geofences evaluated' },
  'geo.evaluator.objects': { 'pt-BR': 'Objetos varridos', 'en-US': 'Objects scanned' },
  'geo.evaluator.never': { 'pt-BR': 'sem tick', 'en-US': 'no tick yet' },
  'geo.evaluator.runOnce': { 'pt-BR': 'Avaliar agora', 'en-US': 'Evaluate now' },
  'geo.evaluator.ranOnce': { 'pt-BR': 'Avaliação disparada.', 'en-US': 'Evaluation triggered.' },
  'geo.evaluator.runFailed': { 'pt-BR': 'Falha ao avaliar.', 'en-US': 'Evaluation failed.' },
  'geo.layers.geofences': { 'pt-BR': 'Cercas virtuais', 'en-US': 'Virtual fences' },
  'geo.layers.geofencesEmpty': {
    'pt-BR': 'Nenhuma cerca — desenhe no mapa com Polígono, Raio ou Rota.',
    'en-US': 'No fences — draw on the map with Polygon, Radius or Route.',
  },
  'geo.layers.alerts': { 'pt-BR': 'Alertas pendentes', 'en-US': 'Pending alerts' },
  'geo.layers.alertsHint': {
    'pt-BR': 'Alertas de cerca não resolvidos com coordenada — plotados pela severidade.',
    'en-US': 'Unresolved fence alerts with coordinates — plotted by severity.',
  },
  'geo.fence.create': { 'pt-BR': 'Criar cerca virtual', 'en-US': 'Create virtual fence' },
  'geo.fence.name': { 'pt-BR': 'Nome da cerca', 'en-US': 'Fence name' },
  'geo.fence.severity': { 'pt-BR': 'Severidade do alerta', 'en-US': 'Alert severity' },
  'geo.fence.baselineSilent': {
    'pt-BR': 'Não alertar quem já está dentro (ativar sem retroagir)',
    'en-US': "Don't alert who is already inside (activate without backfill)",
  },
  'geo.fence.radius': { 'pt-BR': 'Raio', 'en-US': 'Radius' },
  'geo.fence.width': { 'pt-BR': 'Largura (m)', 'en-US': 'Width (m)' },
  'geo.fence.discard': { 'pt-BR': 'Descartar desenho', 'en-US': 'Discard drawing' },
  'geo.fence.rename': { 'pt-BR': 'Renomear', 'en-US': 'Rename' },
  'geo.fence.renameTitle': { 'pt-BR': 'Renomear cerca', 'en-US': 'Rename fence' },
  'geo.fence.activate': { 'pt-BR': 'Ativar', 'en-US': 'Activate' },
  'geo.fence.deactivate': { 'pt-BR': 'Desativar', 'en-US': 'Deactivate' },
  'geo.fence.deactivateTitle': { 'pt-BR': 'Desativar cerca', 'en-US': 'Deactivate fence' },
  'geo.fence.deactivateBody': {
    'pt-BR': 'A cerca para de disparar alertas de borda enquanto inativa.',
    'en-US': 'The fence stops firing boundary alerts while inactive.',
  },
  'geo.fence.updated': {
    'pt-BR': 'Cerca atualizada.',
    'en-US': 'Fence updated.',
  },
  'geo.fence.updateFailed': {
    'pt-BR': 'Falha ao atualizar a cerca.',
    'en-US': 'Failed to update the fence.',
  },
  'geo.fence.redraw': { 'pt-BR': 'Redesenhar no mapa', 'en-US': 'Redraw on map' },
  'geo.fence.redrawHint': {
    'pt-BR': 'Selecione a ferramenta e redesenhe a área; o desenho substitui a geometria atual.',
    'en-US': 'Pick the tool and redraw the area; the drawing replaces the current geometry.',
  },
  'geo.fence.saveRedraw': { 'pt-BR': 'Salvar redesenho', 'en-US': 'Save redraw' },
  'geo.fence.cancelRedraw': { 'pt-BR': 'Cancelar redesenho', 'en-US': 'Cancel redraw' },
  'geo.fence.redrawToolLocked': {
    'pt-BR': 'Indisponível durante o redesenho — o tipo da cerca é preservado.',
    'en-US': 'Unavailable during redraw — the fence type is preserved.',
  },
  'geo.fence.redrawShapeMismatch': {
    'pt-BR': 'O redesenho mantém o tipo da cerca.',
    'en-US': 'Redraw keeps the fence type.',
  },
  'geo.shape.circle': { 'pt-BR': 'Círculo', 'en-US': 'Circle' },
  'geo.shape.route': { 'pt-BR': 'Rota', 'en-US': 'Route' },
  'geo.route.points': { 'pt-BR': 'pontos', 'en-US': 'points' },
  'geo.fence.created': {
    'pt-BR': 'Cerca criada — alertas de borda ativos.',
    'en-US': 'Fence created — boundary alerts active.',
  },
  'geo.fence.createFailed': {
    'pt-BR': 'Falha ao criar a cerca.',
    'en-US': 'Failed to create the fence.',
  },
  'geo.fence.remove': { 'pt-BR': 'Remover cerca', 'en-US': 'Remove fence' },
  'geo.fence.removeTitle': { 'pt-BR': 'Remover cerca virtual', 'en-US': 'Remove virtual fence' },
  'geo.fence.removeBody': {
    'pt-BR': 'A cerca deixa de existir e para de disparar alertas de borda.',
    'en-US': 'The fence ceases to exist and stops firing boundary alerts.',
  },
  'geo.fence.removed': { 'pt-BR': 'Cerca removida.', 'en-US': 'Fence removed.' },
  'geo.fence.removeFailed': {
    'pt-BR': 'Falha ao remover a cerca.',
    'en-US': 'Failed to remove the fence.',
  },
  'geo.fence.active': { 'pt-BR': 'Ativa', 'en-US': 'Active' },
  'geo.fence.inactive': { 'pt-BR': 'Inativa', 'en-US': 'Inactive' },
  'geo.severity.low': { 'pt-BR': 'Baixa', 'en-US': 'Low' },
  'geo.severity.medium': { 'pt-BR': 'Média', 'en-US': 'Medium' },
  'geo.severity.high': { 'pt-BR': 'Alta', 'en-US': 'High' },
  'geo.severity.critical': { 'pt-BR': 'Crítica', 'en-US': 'Critical' },
  'geo.polygon.title': { 'pt-BR': 'Polígono', 'en-US': 'Polygon' },
  'geo.polygon.vertices': { 'pt-BR': 'vértices', 'en-US': 'vertices' },
  'geo.polygon.inside': { 'pt-BR': 'no polígono', 'en-US': 'in polygon' },
  'geo.polygon.empty': {
    'pt-BR': 'Nenhum objeto carregado dentro do polígono.',
    'en-US': 'No loaded objects inside the polygon.',
  },
  'geo.polygon.clear': { 'pt-BR': 'Limpar polígono', 'en-US': 'Clear polygon' },
  'geo.polygon.undo': { 'pt-BR': 'Desfazer ponto', 'en-US': 'Undo point' },
  'geo.polygon.finish': { 'pt-BR': 'Concluir', 'en-US': 'Finish' },
  'geo.polygon.needMore': {
    'pt-BR': 'clique para adicionar (mín. 3)',
    'en-US': 'click to add (min. 3)',
  },
  'geo.detail.node': { 'pt-BR': 'Entidade da ontologia', 'en-US': 'Ontology entity' },
  'geo.node.name': { 'pt-BR': 'Nome da entidade', 'en-US': 'Entity name' },
  'geo.node.rename': { 'pt-BR': 'Renomear', 'en-US': 'Rename' },
  'geo.node.renameTitle': { 'pt-BR': 'Renomear entidade', 'en-US': 'Rename entity' },
  'geo.node.updated': { 'pt-BR': 'Entidade atualizada.', 'en-US': 'Entity updated.' },
  'geo.node.updateFailed': { 'pt-BR': 'Falha ao atualizar a entidade.', 'en-US': 'Failed to update the entity.' },
  'geo.node.remove': { 'pt-BR': 'Remover', 'en-US': 'Remove' },
  'geo.node.removeTitle': { 'pt-BR': 'Remover entidade', 'en-US': 'Remove entity' },
  'geo.node.removeBody': {
    'pt-BR': 'A entidade sai do mapa e da ontologia (ação auditada).',
    'en-US': 'The entity is removed from the map and the ontology (audited).',
  },
  'geo.node.removed': { 'pt-BR': 'Entidade removida.', 'en-US': 'Entity removed.' },
  'geo.node.removeFailed': { 'pt-BR': 'Falha ao remover a entidade.', 'en-US': 'Failed to remove the entity.' },
  'geo.detail.openFicha': { 'pt-BR': 'Ficha da entidade', 'en-US': 'Entity record' },
  'geo.detail.geofence': { 'pt-BR': 'Cerca virtual', 'en-US': 'Virtual fence' },
  'geo.detail.alert': { 'pt-BR': 'Alerta de cerca', 'en-US': 'Fence alert' },
  'geo.detail.coords': { 'pt-BR': 'Coordenadas', 'en-US': 'Coordinates' },
  'geo.detail.type': { 'pt-BR': 'Tipo', 'en-US': 'Type' },
  'geo.detail.seenAt': { 'pt-BR': 'Visto em', 'en-US': 'Seen at' },
  'geo.detail.openAlertas': { 'pt-BR': 'Abrir /alertas', 'en-US': 'Open /alertas' },

  // ── Sensores próximos / correlação espaço-temporal ───────────────────
  'geo.nearby.title': { 'pt-BR': 'Sensores próximos', 'en-US': 'Nearby sensors' },
  'geo.nearby.hint': {
    'pt-BR': 'Câmeras, viaturas e observações dentro do raio e da janela — clique para focar.',
    'en-US': 'Cameras, vehicles and observations within the radius and window — click to focus.',
  },
  'geo.nearby.radius': { 'pt-BR': 'Raio', 'en-US': 'Radius' },
  'geo.nearby.window': { 'pt-BR': 'Janela', 'en-US': 'Window' },
  'geo.nearby.radius100': { 'pt-BR': '100 m', 'en-US': '100 m' },
  'geo.nearby.radius200': { 'pt-BR': '200 m', 'en-US': '200 m' },
  'geo.nearby.radius500': { 'pt-BR': '500 m', 'en-US': '500 m' },
  'geo.nearby.window5': { 'pt-BR': '5 min', 'en-US': '5 min' },
  'geo.nearby.window15': { 'pt-BR': '15 min', 'en-US': '15 min' },
  'geo.nearby.window60': { 'pt-BR': '60 min', 'en-US': '60 min' },
  'geo.nearby.empty': {
    'pt-BR': 'Nenhum sensor no raio/janela escolhidos.',
    'en-US': 'No sensor within the chosen radius/window.',
  },
  'geo.nearby.error': {
    'pt-BR': 'Falha ao buscar sensores próximos.',
    'en-US': 'Failed to fetch nearby sensors.',
  },
  'geo.nearby.loading': { 'pt-BR': 'Buscando…', 'en-US': 'Searching…' },
  'geo.nearby.distance': { 'pt-BR': 'Distância', 'en-US': 'Distance' },
  'geo.nearby.delta': { 'pt-BR': 'Δ tempo', 'en-US': 'Δ time' },
  'geo.corr.title': { 'pt-BR': 'Correlações', 'en-US': 'Correlations' },
  'geo.corr.layer': { 'pt-BR': 'Correlações', 'en-US': 'Correlations' },
  'geo.corr.layerHint': {
    'pt-BR': 'Linhas de correlação espaço-temporal — exploração de vizinhos e arestas materializadas.',
    'en-US': 'Space-time correlation lines — neighbor exploration and materialized edges.',
  },
  'geo.corr.correlate': { 'pt-BR': 'Correlacionar', 'en-US': 'Correlate' },
  'geo.corr.correlateTitle': {
    'pt-BR': 'Materializar correlações',
    'en-US': 'Materialize correlations',
  },
  'geo.corr.correlateBody': {
    'pt-BR': 'Cria arestas reversíveis (com evidência) entre o nó âncora e os vizinhos no raio/janela. Nenhuma entidade é fundida.',
    'en-US': 'Creates reversible edges (with evidence) between the anchor node and neighbors in the radius/window. No entity is merged.',
  },
  'geo.corr.correlated': {
    'pt-BR': 'Correlações materializadas.',
    'en-US': 'Correlations materialized.',
  },
  'geo.corr.correlateNone': {
    'pt-BR': 'Nenhuma correlação nova — nenhum vizinho no raio/janela.',
    'en-US': 'No new correlation — no neighbor in the radius/window.',
  },
  'geo.corr.correlateFailed': {
    'pt-BR': 'Falha ao materializar correlações.',
    'en-US': 'Failed to materialize correlations.',
  },
  'geo.corr.cut': { 'pt-BR': 'Cortar correlação', 'en-US': 'Cut correlation' },
  'geo.corr.cutTitle': { 'pt-BR': 'Cortar correlação', 'en-US': 'Cut correlation' },
  'geo.corr.cutBody': {
    'pt-BR': 'Remove apenas a aresta (reversível) — nenhum nó é tocado. A correlação pode ser materializada de novo.',
    'en-US': 'Removes only the edge (reversible) — no node is touched. The correlation can be materialized again.',
  },
  'geo.corr.cutDone': { 'pt-BR': 'Correlação cortada.', 'en-US': 'Correlation cut.' },
  'geo.corr.cutFailed': {
    'pt-BR': 'Falha ao cortar a correlação.',
    'en-US': 'Failed to cut the correlation.',
  },
  'geo.corr.existing': {
    'pt-BR': 'Correlações existentes',
    'en-US': 'Existing correlations',
  },
  'geo.corr.existingEmpty': {
    'pt-BR': 'Nenhuma correlação materializada para este nó.',
    'en-US': 'No materialized correlation for this node.',
  },
  'geo.corr.confidence': { 'pt-BR': 'confiança', 'en-US': 'confidence' },
  // Zonas operacionais (KMZ/GeoJSON importadas) — detalhe + remoção governada.
  'geo.zone.detail': { 'pt-BR': 'Zona operacional', 'en-US': 'Operational zone' },
  'geo.zone.type.exclusion': { 'pt-BR': 'Exclusão', 'en-US': 'Exclusion' },
  'geo.zone.type.engagement': { 'pt-BR': 'Engajamento', 'en-US': 'Engagement' },
  'geo.zone.type.observation': { 'pt-BR': 'Observação', 'en-US': 'Observation' },
  'geo.zone.type.safe': { 'pt-BR': 'Segura', 'en-US': 'Safe' },
  'geo.zone.height': { 'pt-BR': 'Altura (m)', 'en-US': 'Height (m)' },
  'geo.zone.source': { 'pt-BR': 'Fonte', 'en-US': 'Source' },
  'geo.zone.remove': { 'pt-BR': 'Remover zona', 'en-US': 'Remove zone' },
  'geo.zone.removeTitle': {
    'pt-BR': 'Remover zona operacional',
    'en-US': 'Remove operational zone',
  },
  'geo.zone.removeBody': {
    'pt-BR': 'A zona some do mapa e do registro do tenant. Esta ação não pode ser desfeita.',
    'en-US': 'The zone is removed from the map and the tenant registry. This action cannot be undone.',
  },
  'geo.zone.removed': { 'pt-BR': 'Zona removida.', 'en-US': 'Zone removed.' },
  'geo.zone.removeFailed': {
    'pt-BR': 'Falha ao remover a zona.',
    'en-US': 'Failed to remove the zone.',
  },
  // Camada + importação de zonas operacionais (KMZ/KML/GeoJSON).
  'geo.zone.layer': { 'pt-BR': 'Zonas', 'en-US': 'Zones' },
  'geo.zone.empty': {
    'pt-BR': 'Nenhuma zona importada.',
    'en-US': 'No zones imported.',
  },
  // ── Construtor de Camadas de Referência (widget layer_builder) ──────────
  'builder.titulo': { 'pt-BR': 'Construtor de camadas', 'en-US': 'Layer builder' },
  'builder.camadas': { 'pt-BR': 'Camadas', 'en-US': 'Layers' },
  'builder.feicoes': { 'pt-BR': 'Feições', 'en-US': 'Features' },
  'builder.feicaoSemNome': { 'pt-BR': 'Sem nome', 'en-US': 'Untitled' },
  'builder.carregando': { 'pt-BR': 'Carregando…', 'en-US': 'Loading…' },
  'builder.salvar': { 'pt-BR': 'Salvar', 'en-US': 'Save' },
  'builder.salvarRascunho': { 'pt-BR': 'Salvar rascunho', 'en-US': 'Save draft' },
  'builder.salvarAjuda': {
    'pt-BR': 'Guarda o desenho sem mandar para o mapa (rascunho). O botão ao lado salva E publica.',
    'en-US': 'Stores the drawing without sending it to the map (draft). The button next to it saves AND publishes.',
  },
  'builder.salvoPublicarPendente': {
    'pt-BR': 'Rascunho salvo. Publique para o desenho aparecer no Mapa.',
    'en-US': 'Draft saved. Publish to make the drawing appear on the map.',
  },
  'builder.naoPublicado': { 'pt-BR': 'não publicado', 'en-US': 'not published' },
  'builder.salvo': { 'pt-BR': 'Desenho salvo.', 'en-US': 'Drawing saved.' },
  'builder.naoSalvo': { 'pt-BR': 'não salvo', 'en-US': 'unsaved' },
  'builder.vazio': {
    'pt-BR': 'Nenhuma camada ainda. Crie uma para começar a desenhar.',
    'en-US': 'No layers yet. Create one to start drawing.',
  },
  'builder.semCamada': {
    'pt-BR': 'Selecione ou crie uma camada para desenhar no mapa.',
    'en-US': 'Select or create a layer to start drawing on the map.',
  },
  'builder.camada.nova': { 'pt-BR': 'Nova camada', 'en-US': 'New layer' },
  'builder.camada.novaAjuda': {
    'pt-BR': 'O nome aparece na aba "Camadas de referência" do mapa.',
    'en-US': 'The name shows up under the map’s "Reference layers" tab.',
  },
  'builder.camada.nomePlaceholder': {
    'pt-BR': 'ex.: Tráfico de drogas',
    'en-US': 'e.g. Drug trafficking',
  },
  'builder.camada.criada': { 'pt-BR': 'Camada criada.', 'en-US': 'Layer created.' },
  'builder.camada.erroCriar': {
    'pt-BR': 'Não foi possível criar a camada.',
    'en-US': 'Could not create the layer.',
  },
  'builder.feicao.renomear': { 'pt-BR': 'Renomear feição', 'en-US': 'Rename feature' },
  'builder.feicao.nomePlaceholder': {
    'pt-BR': 'ex.: Boca do beco',
    'en-US': 'e.g. Alley corner',
  },
  'builder.feicao.remover': { 'pt-BR': 'Remover feição', 'en-US': 'Remove feature' },
  'builder.tool.select': { 'pt-BR': 'Selecionar / mover', 'en-US': 'Select / move' },
  'builder.tool.polygon': { 'pt-BR': 'Desenhar área', 'en-US': 'Draw area' },
  'builder.tool.line': { 'pt-BR': 'Desenhar linha', 'en-US': 'Draw line' },
  'builder.tool.point': { 'pt-BR': 'Marcar ponto', 'en-US': 'Drop point' },
  'builder.dirty.titulo': {
    'pt-BR': 'Desenho não salvo',
    'en-US': 'Unsaved drawing',
  },
  'builder.dirty.mensagem': {
    'pt-BR': 'Há alterações não salvas nesta camada. Sair descarta o desenho.',
    'en-US': 'This layer has unsaved changes. Leaving discards the drawing.',
  },
  'builder.dirty.descartar': { 'pt-BR': 'Descartar', 'en-US': 'Discard' },
  'builder.erro.carregar': {
    'pt-BR': 'Não foi possível carregar as camadas.',
    'en-US': 'Could not load the layers.',
  },
  'builder.erro.feicoes': {
    'pt-BR': 'Não foi possível carregar as feições desta camada.',
    'en-US': 'Could not load this layer’s features.',
  },
  'builder.erro.salvar': {
    'pt-BR': 'Não foi possível salvar o desenho.',
    'en-US': 'Could not save the drawing.',
  },
  'pbw.geoStyleCloseTopLabel': { 'pt-BR': 'Tampa (teto)', 'en-US': 'Top cap' },
  'pbw.geoStyleCloseTopTip': {
    'pt-BR': 'Fecha o topo do volume 3D. Padrão: ABERTO (só as paredes, o mapa aparece por dentro).',
    'en-US': 'Closes the top of the 3D volume. Default: OPEN (walls only, the map shows through).',
  },
  'pbw.geoStyleCloseBottomLabel': { 'pt-BR': 'Base (fundo)', 'en-US': 'Bottom cap' },
  'pbw.geoStyleCloseBottomTip': {
    'pt-BR': 'Fecha a base do volume 3D. Padrão: ABERTA.',
    'en-US': 'Closes the bottom of the 3D volume. Default: OPEN.',
  },
  'pbw.geoStyleCloseYes': { 'pt-BR': 'Fechada', 'en-US': 'Closed' },
  'pbw.geoStyleCloseNo': { 'pt-BR': 'Aberta', 'en-US': 'Open' },
  'builder.publicar': { 'pt-BR': 'Publicar', 'en-US': 'Publish' },
  'builder.salvarEPublicar': {
    'pt-BR': 'Salvar e publicar',
    'en-US': 'Save and publish',
  },
  'builder.publicarAjuda': {
    'pt-BR': 'Salva o que está pendente e leva a camada para o mapa operacional.',
    'en-US': 'Saves what is pending and puts the layer on the operational map.',
  },
  'builder.publicado': { 'pt-BR': 'Camada publicada no mapa.', 'en-US': 'Layer published to the map.' },
  'builder.noMapa': { 'pt-BR': 'no mapa', 'en-US': 'on the map' },
  'builder.erro.publicar': {
    'pt-BR': 'Não foi possível publicar a camada.',
    'en-US': 'Could not publish the layer.',
  },
  'builder.importar': {
    'pt-BR': 'Importar GeoJSON, KML ou KMZ',
    'en-US': 'Import GeoJSON, KML or KMZ',
  },
  'builder.import.ok': { 'pt-BR': 'Feições importadas.', 'en-US': 'Features imported.' },
  'builder.import.nada': {
    'pt-BR': 'Nenhuma feição utilizável no arquivo.',
    'en-US': 'No usable features in the file.',
  },
  'builder.import.descartadas': { 'pt-BR': 'descartadas', 'en-US': 'discarded' },
  'builder.import.atualizadas': { 'pt-BR': 'atualizadas', 'en-US': 'updated' },
  'builder.import.erro': {
    'pt-BR': 'Não foi possível ler o arquivo.',
    'en-US': 'Could not read the file.',
  },
  'builder.exportar': { 'pt-BR': 'Exportar GeoJSON', 'en-US': 'Export GeoJSON' },
  'builder.estilo.categoria': {
    'pt-BR': 'Estilo da categoria',
    'en-US': 'Category style',
  },
  'builder.estilo.feicao': { 'pt-BR': 'Estilo da feição', 'en-US': 'Feature style' },
  'builder.estilo.altura': { 'pt-BR': 'Altura 3D', 'en-US': '3D height' },
  'builder.estilo.metros': { 'pt-BR': 'm', 'en-US': 'm' },
  'builder.cor.critico': { 'pt-BR': 'Crítico', 'en-US': 'Critical' },
  'builder.cor.atencao': { 'pt-BR': 'Atenção', 'en-US': 'Warning' },
  'builder.cor.observacao': { 'pt-BR': 'Observação', 'en-US': 'Watch' },
  'builder.cor.infra': { 'pt-BR': 'Infraestrutura', 'en-US': 'Infrastructure' },
  'builder.cor.seguro': { 'pt-BR': 'Seguro', 'en-US': 'Safe' },
  'builder.cor.outro': { 'pt-BR': 'Outro', 'en-US': 'Other' },
  'builder.cerca.titulo': {
    'pt-BR': 'Promover a cerca de alerta',
    'en-US': 'Promote to alert fence',
  },
  'builder.cerca.descricao': {
    'pt-BR': 'Cria uma cerca virtual com este desenho. A partir daí, objetos que entrarem ou saírem da área geram alerta. A cerca passa a existir por conta própria: editar ou apagar esta feição depois não a altera.',
    'en-US': 'Creates a virtual fence from this shape. Objects entering or leaving the area will raise alerts. The fence becomes independent: editing or deleting this feature later will not change it.',
  },
  'builder.cerca.confirmar': { 'pt-BR': 'Criar cerca', 'en-US': 'Create fence' },
  'builder.cerca.criada': { 'pt-BR': 'Cerca de alerta criada.', 'en-US': 'Alert fence created.' },
  'builder.cerca.soPoligono': {
    'pt-BR': 'Só áreas fechadas viram cerca de alerta.',
    'en-US': 'Only closed areas can become alert fences.',
  },
  'builder.cerca.erro': {
    'pt-BR': 'Não foi possível criar a cerca.',
    'en-US': 'Could not create the fence.',
  },
  'builder.map.noToken': {
    'pt-BR': 'Mapa indisponível: falta o token do provedor de mapas nesta instância.',
    'en-US': 'Map unavailable: this instance is missing the map provider token.',
  },
  'geo.zone.import': { 'pt-BR': 'Importar zona', 'en-US': 'Import zone' },
  'geo.zone.importConfirm': { 'pt-BR': 'Importar', 'en-US': 'Import' },
  'geo.zone.file': {
    'pt-BR': 'Arquivo (GeoJSON, KML ou KMZ)',
    'en-US': 'File (GeoJSON, KML or KMZ)',
  },
  'geo.zone.defaultType': { 'pt-BR': 'Tipo padrão', 'en-US': 'Default type' },
  'geo.zone.categoryProp': {
    'pt-BR': 'Propriedade de categoria',
    'en-US': 'Category property',
  },
  'geo.zone.categoryPropHint': {
    'pt-BR': 'Propriedade do arquivo com o tipo (opcional)',
    'en-US': 'File property holding the type (optional)',
  },
  'geo.zone.extrusion': { 'pt-BR': 'Extrusão (m)', 'en-US': 'Extrusion (m)' },
  'geo.zone.zonesUnit': { 'pt-BR': 'zonas', 'en-US': 'zones' },
  'geo.zone.imported': { 'pt-BR': 'Zonas importadas.', 'en-US': 'Zones imported.' },
  'geo.zone.importFailed': {
    'pt-BR': 'Falha ao importar as zonas.',
    'en-US': 'Failed to import zones.',
  },
  'geo.zone.importParseError': {
    'pt-BR': 'Não foi possível ler o arquivo.',
    'en-US': 'Could not read the file.',
  },
  'geo.zone.importUnsupported': {
    'pt-BR': 'Formato não suportado.',
    'en-US': 'Unsupported format.',
  },
  'geo.zone.importEmpty': {
    'pt-BR': 'nenhuma zona no arquivo',
    'en-US': 'no zones in file',
  },
  // Cards ricos de evidência da /ficha (dossiê útil 2026-06-26).
  'ficha.ev.registros': { 'pt-BR': 'registro(s)', 'en-US': 'record(s)' },
  'ficha.ev.semCampos': { 'pt-BR': 'Registrado (sem campos estruturados).', 'en-US': 'Recorded (no structured fields).' },
  'ficha.ev.nadaEncontrado': { 'pt-BR': 'Fonte consultada — nada encontrado.', 'en-US': 'Source queried — nothing found.' },
  'ficha.ev.verMais': { 'pt-BR': 'ver mais', 'en-US': 'show more' },
  'ficha.ev.verMenos': { 'pt-BR': 'ver menos', 'en-US': 'show less' },
  'ficha.ev.conf': { 'pt-BR': 'conf', 'en-US': 'conf' },
  // i18n /buscar + /ficha (varredura adversarial 2026-06-26) — pt-BR + en-US.
  ...BUSCAR_FICHA_DICT,
  // /buscar · vendor controla fontes por tenant (esconder/fixar) — badge "fixada".
  ...BUSCAR_FONTES_DICT,
  // Débitos da /ficha fechados (Identidade/Vínculos/Resumo/Mídia).
  ...FICHA_DEBITOS_DICT,
  // /ficha v2 — Vínculos ricos + node_type pt-BR + ação Mídia.
  ...FICHA_V2_DICT,
  // /buscar cards contextuais + coleta de Mídia assíncrona.
  ...BUSCAR_COLETA_DICT,
  // /buscar roteamento por tipo (campo avançado → fonte) + facts.
  ...BUSCAR_ROTEAMENTO_DICT,
  // Campos da Busca avançada — máscara/validação data-driven (erros + placeholders).
  ...BUSCAR_CAMPO_DICT,
  // Parâmetros por-fonte (ui_fields) + feedback de desempenho da fila (FE-B).
  ...BUSCAR_PERF_DICT,
  // Correlação em cadeia no detalhe (P3 Onda 3): vínculos · expandir · prévia · salvar.
  ...BUSCAR_CORRELACAO_DICT,
  // Merge governado /buscar → objeto da ontologia (P4 ELO 2): alvo · prévia · aplicar · vínculo.
  ...BUSCAR_MERGE_DICT,
  // Histórico de buscas RICO (BACKLOG #7b ELO 2) — backend SDK; filtro · re-rodar · detalhe · limpar.
  ...BUSCAR_HISTORICO_DICT,
  // /relatorios (Notepad governado) — classificação CBAC + marcações + embutir nós (P5 Onda 4).
  ...RELATORIOS_DICT,
  ...TELA_DADOS_DICT,
  ...DSW_DICT,
  ...PBW_DICT,
  // /briefings data-driven (P5 Onda 3) — sem lente militar; modos A/B/C neutros + toolbar fiada.
  ...BRIEFINGS_DICT,
  // Facts de cadastro de empresa (mr_cnpj/opencnpj).
  'buscar.fato.nomeFantasia': { 'pt-BR': 'Nome fantasia', 'en-US': 'Trade name' },
  'buscar.fato.atividade': { 'pt-BR': 'Atividade', 'en-US': 'Activity' },
  'buscar.fato.abertura': { 'pt-BR': 'Abertura', 'en-US': 'Opening date' },
  'buscar.fato.natureza': { 'pt-BR': 'Natureza jurídica', 'en-US': 'Legal nature' },
  'buscar.fato.capital': { 'pt-BR': 'Capital social', 'en-US': 'Share capital' },
  'buscar.fato.municipio': { 'pt-BR': 'Município', 'en-US': 'City' },
};

export type DictKey = keyof typeof DICT;
