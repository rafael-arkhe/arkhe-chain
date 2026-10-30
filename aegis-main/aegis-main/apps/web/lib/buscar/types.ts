/**
 * Tipos da busca multi-fonte do security-app.
 *
 * O fluxo é: usuário digita query → marca quais fontes consultar
 * (entidades locais sempre marcadas; demais filtradas pelo
 * `/mcp-adapters/list`) → cada fonte vira um `FilaItem` com
 * status `queued` → worker virtual roda em série, atualizando
 * status para `running` → `done`/`error`. Resultados normalizados
 * ficam em `NormalizedResult[]` por fila item.
 *
 * Não há persistência server-side da fila — toda fila é state local.
 */

import { Cctv as CctvIcon, type LucideIcon } from 'lucide-react';

export type FilaStatus = 'queued' | 'running' | 'done' | 'error' | 'skipped' | 'cancelled';

/** Categorias de UI — espelham a separação visual no popover Fontes. */
export type SourceCategory =
  | 'local'
  | 'politica-br'
  | 'empresa-br'
  | 'osint-pessoa'
  | 'username'
  | 'noticias'
  | 'threat'
  | 'geo'
  | 'scrape'
  | 'aegis';

export interface SourceDef {
  /** Identificador estável (= `tool` do MCP, ou `'entities'` para local). */
  key: string;
  /** Rótulo PT-BR humano. */
  label: string;
  /** Agrupamento de UI. */
  category: SourceCategory;
  /** `true` = sempre marcado, sem checkbox. */
  alwaysOn?: boolean;
  /** Nome do MCP tool, ou null se for endpoint built-in. */
  mcpTool: string | null;
  /** Endpoint built-in que NÃO é MCP (ex.: `/entities`). */
  builtin?: 'entities' | 'campaign-search' | 'cameras';
  /** Hint pro operador sobre o que essa fonte aceita como input. */
  hint?: string;
  /** Ícone lucide técnico opcional (neutro, sem cor própria). */
  icon?: LucideIcon;
}

/**
 * Catálogo hardcoded de fontes oferecidas no UI.
 *
 * Inclui TODOS os 45 adapters expostos pelo `/mcp-adapters/list` do
 * ontology-module. Filtrados em runtime pela presença real no backend
 * + `env_status` quando o adapter exige API key. Adapters que requerem
 * cookies vault (IG/X/etc) só ficam logáveis após operador conectar em
 * /configuracoes/browser — o status real é checado client-side.
 *
 * Convenção de input: cada worker manda `{query, q, nome}` pro adapter.
 * Adapters que esperam input específico (cnpj, ip, url) retornam vazio
 * quando a query não casa — não há erro, só zero resultados.
 */
export const SOURCE_CATALOG: SourceDef[] = [
  // ─── Locais ─────────────────────────────────────────────
  {
    key: 'entities',
    label: 'Entidades locais',
    category: 'local',
    alwaysOn: true,
    mcpTool: null,
    builtin: 'entities',
    hint: 'Ontologia local · busca por nome/propriedade',
  },
  {
    key: 'cameras',
    label: 'Câmeras / detecções',
    category: 'local',
    mcpTool: null,
    builtin: 'cameras',
    icon: CctvIcon,
    hint: 'CCTV local · nome/cidade/tag da câmera ou placa/rótulo de detecção',
  },
  {
    key: 'entity_dossier@v1',
    label: 'Dossiê AEGIS',
    category: 'aegis',
    mcpTool: 'entity_dossier@v1',
    hint: 'Consolida dossiê multi-fonte para o nome buscado',
  },

  // ─── Política BR ────────────────────────────────────────
  { key: 'camara_deputados@v1',           label: 'Câmara · deputados',          category: 'politica-br', mcpTool: 'camara_deputados@v1' },
  { key: 'camara_deputado_despesas@v1',   label: 'Câmara · cota parlamentar',   category: 'politica-br', mcpTool: 'camara_deputado_despesas@v1', hint: 'Aceita ID do deputado' },
  { key: 'camara_deputado_eventos@v1',    label: 'Câmara · agenda',             category: 'politica-br', mcpTool: 'camara_deputado_eventos@v1', hint: 'Aceita ID do deputado' },
  { key: 'camara_proposicoes@v1',         label: 'Câmara · proposições',        category: 'politica-br', mcpTool: 'camara_proposicoes@v1' },
  { key: 'camara_votacoes@v1',            label: 'Câmara · votações',           category: 'politica-br', mcpTool: 'camara_votacoes@v1' },
  { key: 'camara_partidos@v1',            label: 'Câmara · partidos',           category: 'politica-br', mcpTool: 'camara_partidos@v1' },
  { key: 'senado_senadores@v1',           label: 'Senado · senadores',          category: 'politica-br', mcpTool: 'senado_senadores@v1' },
  { key: 'senado_materias@v1',            label: 'Senado · matérias',           category: 'politica-br', mcpTool: 'senado_materias@v1' },
  { key: 'senado_votacoes@v1',            label: 'Senado · votações',           category: 'politica-br', mcpTool: 'senado_votacoes@v1' },
  { key: 'senado_senador_detalhe@v1',     label: 'Senado · detalhe senador',    category: 'politica-br', mcpTool: 'senado_senador_detalhe@v1', hint: 'Aceita código do senador' },
  { key: 'tse_packages_search@v1',        label: 'TSE · datasets',              category: 'politica-br', mcpTool: 'tse_packages_search@v1' },
  { key: 'tse_candidatos@v1',             label: 'TSE · candidatos',            category: 'politica-br', mcpTool: 'tse_candidatos@v1' },
  { key: 'tse_doacoes@v1',                label: 'TSE · doações',               category: 'politica-br', mcpTool: 'tse_doacoes@v1' },
  { key: 'cgu_servidores@v1',             label: 'CGU · servidores federais',   category: 'politica-br', mcpTool: 'cgu_servidores@v1' },
  { key: 'cgu_contratos@v1',              label: 'CGU · contratos',             category: 'politica-br', mcpTool: 'cgu_contratos@v1' },
  { key: 'cgu_sancoes@v1',                label: 'CGU · sanções (CEIS/CNEP)',   category: 'politica-br', mcpTool: 'cgu_sancoes@v1' },
  { key: 'cgu_beneficiarios@v1',          label: 'CGU · benefícios sociais',    category: 'politica-br', mcpTool: 'cgu_beneficiarios@v1' },
  { key: 'datajud_search@v1',             label: 'CNJ · processos (DataJud)',   category: 'politica-br', mcpTool: 'datajud_search@v1' },
  { key: 'datajud_processo@v1',           label: 'CNJ · processo detalhe',      category: 'politica-br', mcpTool: 'datajud_processo@v1', hint: 'Aceita número CNJ' },
  { key: 'datajud_movimentacoes_recentes@v1', label: 'CNJ · movimentações',     category: 'politica-br', mcpTool: 'datajud_movimentacoes_recentes@v1' },
  { key: 'tcu_inidoneos@v1',              label: 'TCU · inidôneos (licitar)',   category: 'politica-br', mcpTool: 'tcu_inidoneos@v1', hint: 'Aceita CPF ou CNPJ · barrados de licitar (keyless)' },
  { key: 'tcu_inabilitados@v1',           label: 'TCU · inabilitados (cargo)',  category: 'politica-br', mcpTool: 'tcu_inabilitados@v1', hint: 'Aceita CPF · barrados de cargo público (keyless)' },
  { key: 'tcu_contas_irregulares@v1',     label: 'TCU · contas irregulares',    category: 'politica-br', mcpTool: 'tcu_contas_irregulares@v1', hint: 'Aceita CPF · CADIRREG / inelegibilidade (keyless)' },
  { key: 'anatel_operadoras@v1',          label: 'Anatel · operadoras',         category: 'politica-br', mcpTool: 'anatel_operadoras@v1' },
  { key: 'anatel_municipios_5g@v1',       label: 'Anatel · 5G por município',   category: 'politica-br', mcpTool: 'anatel_municipios_5g@v1' },
  { key: 'anatel_consultas@v1',           label: 'Anatel · consultas',          category: 'politica-br', mcpTool: 'anatel_consultas@v1' },

  // ─── Empresa BR ─────────────────────────────────────────
  { key: 'mr_cnpj@v1',                    label: 'Minha Receita · CNPJ',        category: 'empresa-br', mcpTool: 'mr_cnpj@v1', hint: 'Aceita CNPJ' },
  { key: 'mr_socios@v1',                  label: 'Minha Receita · sócios',      category: 'empresa-br', mcpTool: 'mr_socios@v1', hint: 'Aceita CNPJ' },
  { key: 'opencnpj_cnpj@v1',              label: 'OpenCNPJ · CNPJ',             category: 'empresa-br', mcpTool: 'opencnpj_cnpj@v1', hint: 'Aceita CNPJ · keyless (sem token)' },
  { key: 'opencnpj_socios@v1',            label: 'OpenCNPJ · sócios',           category: 'empresa-br', mcpTool: 'opencnpj_socios@v1', hint: 'Aceita CNPJ · sócios (PF/PJ) keyless' },
  { key: 'whois_br@v1',                   label: 'WHOIS .br · domínio',         category: 'threat', mcpTool: 'whois_br@v1', hint: 'Domínio .br → registro, nameservers, expiração (keyless)' },
  { key: 'doc_validar@v1',                label: 'Documento · validar CPF/CNPJ', category: 'empresa-br', mcpTool: 'doc_validar@v1', hint: 'CPF ou CNPJ · valida dígito (offline)' },
  { key: 'pncp_contratos_recentes@v1',    label: 'PNCP · contratos recentes',   category: 'empresa-br', mcpTool: 'pncp_contratos_recentes@v1', hint: 'Licitações/contratos dos últimos dias (keyless)' },
  { key: 'cep_coordenadas@v1',            label: 'CEP · coordenadas',           category: 'geo', mcpTool: 'cep_coordenadas@v1', hint: 'Aceita CEP · retorna endereço + lat/long (keyless)' },
  { key: 'ddd_municipios@v1',             label: 'DDD · municípios',            category: 'geo', mcpTool: 'ddd_municipios@v1', hint: 'Aceita DDD (2 dígitos) · UF + municípios (keyless)' },
  { key: 'brio_socios_by_name@v1',        label: 'Brasil.IO · sócios por nome', category: 'empresa-br', mcpTool: 'brio_socios_by_name@v1' },
  { key: 'brio_socios_by_cpf_cnpj@v1',    label: 'Brasil.IO · sócios CPF/CNPJ', category: 'empresa-br', mcpTool: 'brio_socios_by_cpf_cnpj@v1', hint: 'Aceita CPF ou CNPJ' },
  { key: 'brio_empresa@v1',               label: 'Brasil.IO · empresa',         category: 'empresa-br', mcpTool: 'brio_empresa@v1', hint: 'Aceita CNPJ' },
  { key: 'brio_gastos_deputado@v1',       label: 'Brasil.IO · gastos deputado', category: 'empresa-br', mcpTool: 'brio_gastos_deputado@v1' },
  { key: 'bcb_sgs_series@v1',             label: 'BCB · séries econômicas',     category: 'empresa-br', mcpTool: 'bcb_sgs_series@v1' },
  { key: 'bcb_pix_stats@v1',              label: 'BCB · estatísticas PIX',      category: 'empresa-br', mcpTool: 'bcb_pix_stats@v1' },
  { key: 'ibge_aggregate@v1',             label: 'IBGE · agregados',            category: 'empresa-br', mcpTool: 'ibge_aggregate@v1' },
  { key: 'ibge_municipios@v1',            label: 'IBGE · municípios',           category: 'empresa-br', mcpTool: 'ibge_municipios@v1' },

  // ─── OSINT redes sociais ────────────────────────────────
  { key: 'instaloader_profile@v1',        label: 'Instagram · perfil',          category: 'osint-pessoa', mcpTool: 'instaloader_profile@v1', hint: 'Aceita username' },
  { key: 'instaloader_posts@v1',          label: 'Instagram · posts',           category: 'osint-pessoa', mcpTool: 'instaloader_posts@v1', hint: 'Aceita username' },
  { key: 'threads_user@v1',               label: 'Threads · usuário',           category: 'osint-pessoa', mcpTool: 'threads_user@v1', hint: 'Aceita username' },
  { key: 'threads_post@v1',               label: 'Threads · post',              category: 'osint-pessoa', mcpTool: 'threads_post@v1', hint: 'Aceita URL do post' },
  { key: 'truthbrush_user@v1',            label: 'Truth Social · usuário',      category: 'osint-pessoa', mcpTool: 'truthbrush_user@v1' },
  { key: 'truthbrush_search@v1',          label: 'Truth Social · busca',        category: 'osint-pessoa', mcpTool: 'truthbrush_search@v1' },
  { key: 'kwai_user@v1',                  label: 'Kwai · usuário',              category: 'osint-pessoa', mcpTool: 'kwai_user@v1' },
  { key: 'kwai_search@v1',                label: 'Kwai · busca',                category: 'osint-pessoa', mcpTool: 'kwai_search@v1' },
  { key: 'facebook_page@v1',              label: 'Facebook · página',           category: 'osint-pessoa', mcpTool: 'facebook_page@v1', hint: 'Aceita URL da página' },
  { key: 'bluesky_search_posts@v1',       label: 'Bluesky · posts',             category: 'osint-pessoa', mcpTool: 'bluesky_search_posts@v1' },
  { key: 'bluesky_actor@v1',              label: 'Bluesky · perfil',            category: 'osint-pessoa', mcpTool: 'bluesky_actor@v1', hint: 'Aceita handle' },
  { key: 'bluesky_actor_feed@v1',         label: 'Bluesky · feed do ator',      category: 'osint-pessoa', mcpTool: 'bluesky_actor_feed@v1' },
  { key: 'mastodon_user@v1',              label: 'Mastodon · usuário',          category: 'osint-pessoa', mcpTool: 'mastodon_user@v1' },
  { key: 'tiktok_user_videos@v2',         label: 'TikTok · vídeos do usuário',  category: 'osint-pessoa', mcpTool: 'tiktok_user_videos@v2', hint: 'Aceita username TikTok' },
  { key: 'tiktok_video@v2',               label: 'TikTok · vídeo',              category: 'osint-pessoa', mcpTool: 'tiktok_video@v2', hint: 'Aceita URL do vídeo' },
  { key: 'youtube_search@v1',             label: 'YouTube · busca',             category: 'osint-pessoa', mcpTool: 'youtube_search@v1' },
  { key: 'youtube_channel@v1',            label: 'YouTube · canal',             category: 'osint-pessoa', mcpTool: 'youtube_channel@v1' },
  { key: 'youtube_transcript@v1',         label: 'YouTube · transcrição',       category: 'osint-pessoa', mcpTool: 'youtube_transcript@v1', hint: 'Aceita URL do vídeo' },
  { key: 'reddit_search@v1',              label: 'Reddit · busca',              category: 'osint-pessoa', mcpTool: 'reddit_search@v1' },
  { key: 'reddit_user@v1',                label: 'Reddit · usuário',            category: 'osint-pessoa', mcpTool: 'reddit_user@v1' },
  { key: 'reddit_subreddit@v1',           label: 'Reddit · subreddit',          category: 'osint-pessoa', mcpTool: 'reddit_subreddit@v1' },
  { key: 'reddit_subreddit_posts@v1',     label: 'Reddit · posts',              category: 'osint-pessoa', mcpTool: 'reddit_subreddit_posts@v1' },
  { key: 'reddit_post_comments@v1',       label: 'Reddit · comentários',        category: 'osint-pessoa', mcpTool: 'reddit_post_comments@v1' },
  { key: 'telegram_private_channels@v1',  label: 'Telegram · canais privados',  category: 'osint-pessoa', mcpTool: 'telegram_private_channels@v1' },
  { key: 'telegram_channel_messages@v1',  label: 'Telegram · mensagens',        category: 'osint-pessoa', mcpTool: 'telegram_channel_messages@v1' },
  { key: 'whatsapp_list_chats@v1',        label: 'WhatsApp · chats',            category: 'osint-pessoa', mcpTool: 'whatsapp_list_chats@v1' },
  { key: 'whatsapp_search_messages@v1',   label: 'WhatsApp · mensagens',        category: 'osint-pessoa', mcpTool: 'whatsapp_search_messages@v1' },
  { key: 'gallery_dl_extract@v1',         label: 'Gallery-DL · mídia',          category: 'osint-pessoa', mcpTool: 'gallery_dl_extract@v1', hint: 'Aceita URL de galeria' },
  { key: 'osint_extract@v1',              label: 'OSINT · extrator',            category: 'osint-pessoa', mcpTool: 'osint_extract@v1', hint: 'Username (busca em YouTube, TikTok, Reddit, Instagram) OU URL de um perfil/post' },
  { key: 'agent_x_search@v1',             label: 'X/Twitter (agente)',          category: 'osint-pessoa', mcpTool: 'agent_x_search@v1', hint: 'Coleta REAL no X pelo seu agente openclaw (perfis + tweets) · leva ~até 90s' },
  { key: 'telefone_lookup@v1',            label: 'Telefone · operadora/região', category: 'osint-pessoa', mcpTool: 'telefone_lookup@v1', hint: 'Número → tipo, região, operadora-de-faixa (offline)' },

  // ─── Username / email lookup ────────────────────────────
  { key: 'maigret_username@v1',           label: 'Maigret · username',          category: 'username', mcpTool: 'maigret_username@v1', hint: 'Aceita username' },
  { key: 'sherlock_username@v1',          label: 'Sherlock · username',         category: 'username', mcpTool: 'sherlock_username@v1', hint: 'Aceita username' },
  { key: 'wmn_username@v1',               label: 'WhatsMyName · username',      category: 'username', mcpTool: 'wmn_username@v1', hint: 'Aceita username' },
  { key: 'holehe_email@v1',               label: 'Holehe · email',              category: 'username', mcpTool: 'holehe_email@v1', hint: 'Aceita email' },

  // ─── Notícias / web aberta ──────────────────────────────
  { key: 'gdelt_doc_search@v1',           label: 'GDELT · documentos',          category: 'noticias', mcpTool: 'gdelt_doc_search@v1' },
  { key: 'gdelt_timeline_tone@v1',        label: 'GDELT · tom temporal',        category: 'noticias', mcpTool: 'gdelt_timeline_tone@v1' },
  { key: 'gdelt_geo@v1',                  label: 'GDELT · georreferenciado',    category: 'noticias', mcpTool: 'gdelt_geo@v1' },
  { key: 'searx_search@v1',               label: 'SearXNG · web aberta',        category: 'noticias', mcpTool: 'searx_search@v1' },
  { key: 'searx_news@v1',                 label: 'SearXNG · notícias',          category: 'noticias', mcpTool: 'searx_news@v1' },
  { key: 'searx_news_brazil@v1',          label: 'SearXNG · notícias BR',       category: 'noticias', mcpTool: 'searx_news_brazil@v1' },
  { key: 'searx_images@v1',               label: 'SearXNG · imagens',           category: 'noticias', mcpTool: 'searx_images@v1' },
  { key: 'searx_files@v1',                label: 'SearXNG · arquivos',          category: 'noticias', mcpTool: 'searx_files@v1' },
  { key: 'tavily_search@v1',              label: 'Tavily · web',                category: 'noticias', mcpTool: 'tavily_search@v1' },
  { key: 'tavily_extract@v1',             label: 'Tavily · extrator',           category: 'noticias', mcpTool: 'tavily_extract@v1', hint: 'Aceita URL' },
  { key: 'factcheck_search@v1',           label: 'Fact-check · busca',          category: 'noticias', mcpTool: 'factcheck_search@v1' },
  { key: 'rsshub_route@v1',               label: 'RSSHub · rota',               category: 'noticias', mcpTool: 'rsshub_route@v1', hint: 'Aceita rota RSSHub' },
  { key: 'rsshub_search@v1',              label: 'RSSHub · busca',              category: 'noticias', mcpTool: 'rsshub_search@v1' },
  { key: 'whoogle_search@v1',             label: 'Whoogle · Google sem track',  category: 'noticias', mcpTool: 'whoogle_search@v1' },

  // ─── Threat intel ───────────────────────────────────────
  { key: 'opensanctions_match@v1',        label: 'OpenSanctions · match',       category: 'threat', mcpTool: 'opensanctions_match@v1' },
  { key: 'opensanctions_search@v1',       label: 'OpenSanctions · busca',       category: 'threat', mcpTool: 'opensanctions_search@v1' },
  { key: 'icij_search@v1',                label: 'ICIJ Leaks · busca',          category: 'threat', mcpTool: 'icij_search@v1' },
  { key: 'icij_node@v1',                  label: 'ICIJ Leaks · nó',             category: 'threat', mcpTool: 'icij_node@v1' },
  { key: 'otx_search@v1',                 label: 'AlienVault OTX · busca',      category: 'threat', mcpTool: 'otx_search@v1' },
  { key: 'otx_pulses@v1',                 label: 'AlienVault OTX · pulsos',     category: 'threat', mcpTool: 'otx_pulses@v1' },
  { key: 'otx_subscribed@v1',             label: 'AlienVault OTX · subscritos', category: 'threat', mcpTool: 'otx_subscribed@v1' },
  { key: 'urlscan_search@v1',             label: 'URLScan · busca',             category: 'threat', mcpTool: 'urlscan_search@v1' },
  { key: 'urlscan_submit@v1',             label: 'URLScan · submeter',          category: 'threat', mcpTool: 'urlscan_submit@v1', hint: 'Aceita URL' },
  { key: 'urlscan_result@v1',             label: 'URLScan · resultado',         category: 'threat', mcpTool: 'urlscan_result@v1' },
  { key: 'urlhaus_lookup_url@v1',         label: 'URLhaus · lookup URL',        category: 'threat', mcpTool: 'urlhaus_lookup_url@v1', hint: 'Aceita URL' },
  { key: 'urlhaus_lookup_host@v1',        label: 'URLhaus · lookup host',       category: 'threat', mcpTool: 'urlhaus_lookup_host@v1', hint: 'Aceita host/IP' },
  { key: 'threatfox_search_ioc@v1',       label: 'ThreatFox · IOC',             category: 'threat', mcpTool: 'threatfox_search_ioc@v1', hint: 'Aceita IOC' },
  { key: 'threatfox_recent@v1',           label: 'ThreatFox · recentes',        category: 'threat', mcpTool: 'threatfox_recent@v1' },
  { key: 'malwarebazaar_query@v1',        label: 'MalwareBazaar · query',       category: 'threat', mcpTool: 'malwarebazaar_query@v1' },
  { key: 'greynoise_ip@v1',               label: 'GreyNoise · IP',              category: 'threat', mcpTool: 'greynoise_ip@v1', hint: 'Aceita IP' },
  { key: 'misp_search_event@v1',          label: 'MISP · eventos',              category: 'threat', mcpTool: 'misp_search_event@v1' },
  { key: 'misp_search_attribute@v1',      label: 'MISP · atributos',            category: 'threat', mcpTool: 'misp_search_attribute@v1' },
  { key: 'misp_event_get@v1',             label: 'MISP · evento detalhe',       category: 'threat', mcpTool: 'misp_event_get@v1' },

  // ─── Geo / ambiental ────────────────────────────────────
  { key: 'inpe_deter@v1',                 label: 'INPE · DETER (desmatamento)', category: 'geo', mcpTool: 'inpe_deter@v1' },
  { key: 'inpe_prodes@v1',                label: 'INPE · PRODES',               category: 'geo', mcpTool: 'inpe_prodes@v1' },
  { key: 'inpe_queimadas@v1',             label: 'INPE · queimadas',            category: 'geo', mcpTool: 'inpe_queimadas@v1' },
  { key: 'inpe_satellite_overpass@v1',    label: 'INPE · passagem satélite',    category: 'geo', mcpTool: 'inpe_satellite_overpass@v1' },

  // ─── Web scraping ───────────────────────────────────────
  { key: 'crawl_markdown@v1',             label: 'Crawl4AI · markdown',         category: 'scrape', mcpTool: 'crawl_markdown@v1', hint: 'Aceita URL' },
  { key: 'crawl_extract@v1',              label: 'Crawl4AI · extrator',         category: 'scrape', mcpTool: 'crawl_extract@v1', hint: 'Aceita URL' },
  { key: 'playwright_screenshot@v1',      label: 'Playwright · screenshot',     category: 'scrape', mcpTool: 'playwright_screenshot@v1', hint: 'Aceita URL' },
  { key: 'playwright_page_text@v1',       label: 'Playwright · texto da página',category: 'scrape', mcpTool: 'playwright_page_text@v1', hint: 'Aceita URL' },
  { key: 'partition_url@v1',              label: 'Unstructured · particionar URL', category: 'scrape', mcpTool: 'partition_url@v1', hint: 'Aceita URL' },
];

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  local:          'Locais',
  aegis:          'Dossiê AEGIS',
  'politica-br':  'Política BR',
  'empresa-br':   'Empresa BR',
  'osint-pessoa': 'OSINT redes/pessoas',
  username:       'Username / email',
  noticias:       'Notícias / web',
  threat:         'Threat intelligence',
  geo:            'Geo / ambiental',
  scrape:         'Web scraping',
};

/** Ordem que as categorias aparecem no popover de Fontes. */
export const CATEGORY_ORDER: SourceCategory[] = [
  'local',
  'aegis',
  'politica-br',
  'empresa-br',
  'osint-pessoa',
  'username',
  'noticias',
  'threat',
  'geo',
  'scrape',
];

export interface NormalizedResult {
  /** Identificador estável dentro da fonte (best-effort). */
  externalId: string;
  /** Título principal. */
  name: string;
  /** Tipo lógico (`pessoa`, `post`, `news`, etc). */
  kind: string;
  /** Linha secundária — datas, partido, autor, número de seguidores… */
  subtitle?: string;
  /** Snippet/descrição multi-linha (~200-400 chars), distinto do subtitle
   *  (que é uma linha só). YouTube · description, Reddit selftext, etc. */
  snippet?: string;
  /** URL de thumbnail (imagem 1:1 ou 16:9). Renderizada no card. */
  thumbnail?: string;
  /** Se vier do `/entities` local, o id real da entidade. */
  entityId?: string;
  /** Score de relevância (se a fonte fornecer). */
  score?: number;
  /** URL canônica externa (perfil, post, deputado…). */
  url?: string;
  /**
   * Fatos contextuais (mini key-value) extraídos do payload por um
   * fact-extractor específico da fonte. Substituem o jargão `tool@vN`
   * pelo QUE foi encontrado (Situação · Documento · Operadora · Conta…).
   * `tone` colore só o TEXTO do valor (ok=positivo, warn=danger), nunca
   * o ícone. ADD-alongside: fontes-lista seguem sem facts (genericNormalize).
   */
  facts?: { label: string; value: string; tone?: 'ok' | 'warn' | 'neutral' }[];
  /**
   * Ação contextual que FUNCIONA (não-cega-não-morta): re-enfileira a
   * busca aprofundando com `value` (ex.: o CPF formatado, o número, o
   * e-mail). O rótulo (`label`) diz exatamente o que faz. Quando ausente,
   * a UI cai na ação genérica de re-busca pelo `name`.
   */
  action?: { label: string; value: string };
  /**
   * Mídia anexa (imagens/vídeos) detectada por SHAPE do raw — galerias, posts
   * com foto/vídeo, capa de perfil. Renderizada como galeria LAZY com fallback
   * onError (esconder quebradas) e SEM vazar host de túnel (só URLs http(s)
   * absolutas). Multi-domínio: detectada pela FORMA, nunca pelo nome da fonte.
   * `thumbnail` (capa única, 1:1/16:9) segue valendo; `media` é a coleção.
   */
  media?: { url: string; kind: 'image' | 'video'; thumbnail?: string; caption?: string }[];
  /**
   * Sub-resultados quando o raw embute uma COLEÇÃO (sites de username, posts de
   * um perfil, sócios de um CNPJ, focos de calor…). Cada elemento é um
   * NormalizedResult já enriquecido (profundidade 1 — não recursa além). O
   * resultado-pai vira um RESUMO com `count`. Rótulos/substantivos NEUTROS
   * (N itens/registros) — nunca "pessoas/empresas" fixos.
   */
  items?: NormalizedResult[];
  /**
   * Campos estruturados extraídos por SHAPE (escalares humanizados) — SUPERSET
   * de `facts`, com `href` opcional (link em nova aba). ADD-alongside: `facts`
   * (curados pelos fact-extractors) seguem ganhando; `fields` é o default
   * genérico, agora RICO. `label` é chave i18n (resolvida via useT(); fallback
   * Title Case da chave passa pelo t() intacto). `tone` colore só o texto.
   */
  fields?: { label: string; value: string; tone?: 'ok' | 'warn' | 'neutral'; href?: string }[];
  /** Tamanho da coleção (quando `items` presente). */
  count?: number;
  /**
   * Forma INFERIDA do dado — orienta a renderização (galeria/lista/mapa/web).
   * Derivada do shape do raw, nunca do nome da fonte (multidomínio).
   */
  shape?: 'record' | 'collection' | 'web' | 'image' | 'geo' | 'series' | 'profile' | 'html';
  /** Payload bruto do adapter — disponível no DetalheObjeto pra inspeção. */
  raw?: unknown;
}

export interface FilaItem {
  /** Id estável do item — gerado client-side. */
  id: string;
  /** Texto buscado. */
  query: string;
  /** Fonte selecionada. */
  source: SourceDef;
  /** Estado atual no pipeline. */
  status: FilaStatus;
  /** Resultados normalizados (vazio até `done`). */
  results: NormalizedResult[];
  /** Mensagem de erro (quando `status === 'error'`). */
  error?: string;
  /** Razão neutra do pulo (quando `status === 'skipped'`), ex.: exige URL. */
  skipReason?: string;
  /** Timestamp epoch ms em que entrou na fila. */
  queuedAt: number;
  /** Timestamp em que começou a rodar. */
  startedAt?: number;
  /** Timestamp em que terminou. */
  finishedAt?: number;
  /** Duração em ms (preenchida ao finalizar). */
  durationMs?: number;
}
