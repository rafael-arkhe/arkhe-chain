'use client';

/**
 * ArquitetoChat — entry flow do "Desenho da Operação" (AIP Arquiteto).
 *
 * Substitui o antigo StartPlanningWizard (formulário 4-passos) por um CHAT
 * em plan-mode: o operador conversa com a IA, que coleta de forma
 * conversacional o produto final, a fonte de dados, a preferência de
 * construção e os requisitos — UMA pergunta por turno. Quando reúne o
 * suficiente, a IA encerra com um bloco cercado ```aegis:plano {...}``` que
 * o frontend DETECTA como "plano finalizado" e dispara
 * `Solutions.designGraph` — o diagrama gerado vira o ARTEFATO renderizado no
 * canvas. O chat fica ANCORADO ABAIXO do canvas (painel in-page, não modal);
 * o diagrama é o artefato que aparece ACIMA, e o operador acompanha os nós
 * surgindo ao vivo enquanto a conversa segue dockada.
 *
 * Padrão "chat + artefato" (como artifacts de LLM / AIP Architect): NÃO é
 * formulário, NÃO é wizard Próximo/Anterior, NÃO há botão "gerar" manual — o
 * diagrama aparece automaticamente quando o plano é finalizado. Este painel é
 * renderizado IN-FLOW (não como overlay/Dialog) e é recolhível pelo cabeçalho.
 *
 * Reuso da inferência do aip-chat (somente leitura — não modificamos
 * `components/aip-chat/*`): mesmo par provider/model
 * (openrouter + mistralai/mixtral-8x22b-instruct, exibido via aipModelLabel
 * como "AIP Cloud" + codinome) e os MESMOS endpoints (`/agent/tools/run`
 * com fallback `/inference/chat`). Toda chamada fica auditada (InferenceLog).
 */
import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import {
  Loader2,
  Send,
  AudioLines,
  User,
  CheckCircle2,
  Copy,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Layers,
  Cpu,
  PanelLeft,
  PanelTop,
  PanelBottom,
  PanelRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/provider';
import { apiFetch, ApiError } from '@/lib/api/client';
import { aipModelLabel } from '@/lib/aip/modelLabels';
import {
  Solutions,
  Ontology,
  Compute,
  type RefactorResult,
  type SelectModelResult,
  type SolutionBlueprint,
  type SolutionDiagram,
  type SolutionMergeReport,
  type SolutionScope,
  type SolutionWizard,
} from '@/lib/api';
import {
  SOLUTIONS_DEFAULT_MODEL,
  SOLUTIONS_DEFAULT_PROVIDER,
  type SolutionsDepth,
} from '@/lib/solutions/experience-defaults';
import { AipGuideModal } from '@/components/solution-designer/AipGuideModal';
import { RefactorDiffArtifact } from '@/components/solution-designer/RefactorDiffArtifact';
import { Workshop } from '@/lib/workshop/client';

/** The blueprint that produced a generated diagram, round-tripped in
 *  ``wizard._blueprint`` (set by designGraph / onGenerated). null when absent. */
function _diagramBlueprint(d: SolutionDiagram | null): SolutionBlueprint | null {
  const w = (d?.wizard ?? null) as Record<string, unknown> | null;
  return (w?._blueprint as SolutionBlueprint | undefined) ?? null;
}

// Mesmo par vencedor de eval do aip-chat (store.ts): Mixtral 8x22B via
// OpenRouter. NUNCA exposto cru — sempre via aipModelLabel/aipProviderLabel.
// Fonte única em `lib/solutions/experience-defaults` (reusada pelo
// configurador da experiência); usados como FALLBACK quando a página não
// passa `defaultModel`/`defaultProvider` (parametrização da /solutions).
const ARQUITETO_PROVIDER = SOLUTIONS_DEFAULT_PROVIDER;
const ARQUITETO_MODEL = SOLUTIONS_DEFAULT_MODEL;

/**
 * System prompt curado do "AIP Arquiteto" (pt-BR). Conhece as fases da
 * stack AEGIS (Coleta → Processamento → Ontologia → Aplicação) e conduz a
 * conversa coletando UMA informação por turno. Ao reunir o suficiente,
 * encerra com o bloco cercado ```aegis:plano {...}```.
 */
const ARQUITETO_SYSTEM = [
  'Você é o AIP Arquiteto — você TRANSFORMA uma intenção em linguagem natural num',
  'plano COMPLETO de operação para a plataforma, usando o SEU conhecimento de',
  'domínio. As quatro fases da stack: Coleta (workers, conectores, datasets) →',
  'Processamento (pipelines, funções de IA) → Ontologia (tipos de objeto,',
  'propriedades, vínculos) → Aplicação (painel/Sala, relatório, dossiê).',
  '',
  'PRINCÍPIO (siga à risca): o operador é LEIGO. NÃO o interrogue — sem quiz, NUNCA',
  'pergunte de volta. Para CADA mensagem, faça UMA de duas coisas: PROPOR (se ele quer',
  'construir/gerenciar algo) ou RESPONDER (se ele fez uma pergunta / quer navegar). Nunca as duas.',
  '',
  '1) CONSTRUIR/gerenciar (ex.: "quero gerir ativos", "monta um painel de X", "adiciona Y"):',
  '   transforme a intenção num plano COMPLETO com seu conhecimento de domínio. As fases:',
  '   Coleta (workers, conectores, datasets) → Processamento (pipelines, funções de IA) →',
  '   Ontologia (tipos de objeto, propriedades, vínculos) → Aplicação (painel/Sala, relatório).',
  '   - INFIRA defaults: end_product="painel"; source_data="existing"; build_preference="low_code";',
  '     e os TIPOS/ações/relações do domínio (ex.: "gestão de ativos" → Ativo, Equipamento,',
  '     Manutenção, Contrato, Fornecedor). NUNCA modele infraestrutura como objeto (usuário,',
  '     permissão, painel, relatório, notificação, fluxo, configuração).',
  '   - Escreva UMA frase curta com suas PREMISSAS ("Assumi ativos físicos, foco em manutenção;',
  '     me diga se quer mudar"), e encerre com UM ÚNICO bloco cercado, nada após ele:',
  '```aegis:plano',
  '{"problem":"...","domain":"...","end_product":"...","source_data":"...","build_preference":"...","requirements":"..."}',
  '```',
  '     "problem" = a intenção consolidada numa frase RICA (premissas + ajustes acumulados),',
  '     "domain" = domínio inferido (ex.: gestao-de-ativos), demais = valores canônicos acima.',
  '   - Em refino ("tira X", "foca em Y", "adiciona Z"): o ajuste é SOBRE O PLANO ATUAL',
  '     (fornecido no contexto como [PLANO ATUAL ...]). Incorpore o ajuste e RE-EMITA o',
  '     bloco COMPLETO atualizado. NUNCA troque o domínio/tema do plano por causa de uma',
  '     palavra ambígua do ajuste (ex.: "portaria" numa operação de entrega de gás NÃO',
  '     vira condomínio — é a portaria DO CLIENTE da entrega).',
  '',
  '2) PERGUNTA/navegação/consulta (ex.: "quais apps tenho", "onde fica X", "o que é Y", "como faço Z"):',
  '   NÃO proponha nem fabrique app. Comece a resposta com o marcador [CONSULTA] e responda direto,',
  '   em prosa curta — diga o que é / onde encontrar / o que fazer. SEM bloco aegis:plano.',
].join('\n');

const ARQUITETO_OPENING = [
  'Sou o AIP Arquiteto. Diga em uma frase o que você quer gerenciar — eu já',
  'proponho o app inteiro a partir disso, e você ajusta conversando.',
].join(' ');

// F4 — abertura no MODO-EDIÇÃO: o operador abriu um app existente p/ editar.
function _editOpening(appName: string): string {
  return `Editando "${appName}". Me diga o que mudar — eu ajusto e você salva por cima do mesmo app.`;
}

interface ChatTurn {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  /** Codinome AIP do modelo que respondeu (turno assistant). */
  model?: string;
  /** S4 — recomendação de modelo de visão (quando a intenção é uma tarefa de visão). */
  rec?: SelectModelResult;
}

/** Resultado de uma chamada de inferência (campos comuns dos dois endpoints). */
interface InferenceReply {
  text: string;
  model?: string;
}

/** Shape do plano finalizado emitido pela IA no bloco ```aegis:plano```. */
export interface ArquitetoPlan {
  problem: string;
  domain?: string;
  end_product?: string;
  source_data?: string;
  build_preference?: string;
  requirements?: string;
}

// Roteador de intenção (B): o modelo marca uma CONSULTA (pergunta/navegação) com
// [CONSULTA] e NÃO emite bloco. Construir → propõe; consulta → responde e PARA.
const CONSULTA_MARK = /\[\s*CONSULTA\s*\]/i; // marcador explícito (qualquer lugar)
const CONSULTA_BARE = /^\s*CONSULTA\s*:?\s+/i; // variação sem colchetes, só no INÍCIO
function isConsulta(text: string): boolean {
  return CONSULTA_MARK.test(text) || CONSULTA_BARE.test(text);
}
function stripConsulta(text: string): string {
  // Remove TODAS as variações do marcador da exibição (nunca vaza pro operador).
  return text.replace(CONSULTA_MARK, '').replace(CONSULTA_BARE, '').trim();
}

// Remoção destrutiva no chat — DETECTOR ESTRITO (bugfix: o detector antigo casava
// "remover" em QUALQUER lugar e sequestrou uma descrição de app que citava botões
// "editar"/"remover"). Agora o hard-delete de tipo SÓ dispara quando é um COMANDO:
//   (1) a mensagem COMEÇA com o verbo imperativo (remove/exclui/apaga/deleta/tira),
//   (2) é CURTA (≤ 80 chars — comando, não descrição), e
//   (3) menciona "tipo" (o alvo destrutivo é um object type; espelha o hint
//       "remove o tipo Multa"). Qualquer outra menção a remover/excluir (descrição de
//   app, botão de UI, "tira a página X" como refino) SEGUE PRO LLM normalmente.
// Prefixos de cortesia permitidos antes do verbo ("por favor remove o tipo X").
// Lista FECHADA — "quero/preciso/monte remover..." NÃO são comando, são descrição.
const REMOVE_CMD =
  /^\s*(?:(?:por favor|pode|podes|ok|entao|então|agora)[,\s]+){0,2}(remov[ae]\w*|exclu[ai]\w*|apag[au]\w*|delet[ae]\w*|tir[ae]\w*)\b/i;
export function isRemovalCommand(text: string): boolean {
  return REMOVE_CMD.test(text.trim()) && text.trim().length <= 80;
}
export function mentionsApp(text: string): boolean {
  return /\bapps?\b|aplicativ/i.test(text);
}
/** Alvo estruturado do hard-delete: "tipo X" ou "objeto X" (revisão adversarial). */
export function mentionsTarget(text: string): boolean {
  return /\b(tipo|objeto)\b/i.test(text);
}
export function extractRemovalKind(text: string): string | null {
  const m = text.match(/\b(?:tipo|objeto)\s+["'“]?([A-Za-zÀ-ÿ0-9_]{2,})/i);
  return m ? m[1] : null;
}

// S4 — DETECTOR de OBJETIVO DE VISÃO (estrutural, MULTIDOMÍNIO). Quando o operador
// descreve uma tarefa que extrai objetos de uma IMAGEM ("contar casas em imagem de
// satélite", "delimitar talhões na ortofoto", "segmentar nódulos na tomografia"), o
// Arquiteto anexa a recomendação de modelo de visão (select-model). NÃO chaveia por
// domínio — só pela CAPACIDADE estrutural: um verbo de extração visual + uma fonte
// visual. Assim "contar casas" (condomínio), "delimitar talhões" (agro) e "segmentar
// nódulos" (saúde) caem todos na MESMA regra. Exige os DOIS (verbo + fonte) pra não
// disparar em "contar ativos" (lista, não imagem).
const VISION_VERB =
  /\b(cont[ae]\w*|delimit\w*|segment\w*|detect\w*|identific\w*|localiz\w*|map(?:e[ai]\w*|ear)|demarc\w*|reconhec\w*|enumer\w*|quantific\w*|delinea\w*|count\w*|outlin\w*|locat\w*)\b/i;
const VISION_SOURCE =
  /\b(imagem|imagens|foto\w*|sat[ée]lite\w*|a[ée]re[oa]\w*|ortofoto\w*|orto|drone\w*|c[âa]mera\w*|cctv|v[íi]deo\w*|sensoriamento|raster\w*|frame\w*|captur\w*|pixel\w*|image\w*|aerial|satellite|footage)\b/i;
export function detectVisionObjective(text: string): boolean {
  return VISION_VERB.test(text) && VISION_SOURCE.test(text);
}

// B3 — pergunta de INVENTÁRIO de apps ("quais apps tenho", "meus apps", "my apps").
// Só é consultada DENTRO de um CONSULTA já classificado pelo modelo (nunca sequestra
// um pedido de CONSTRUIR, que vem com bloco aegis:plano), então a heurística é segura.
const APPS_INVENTORY = /\bapps?\b|\baplicativos?\b/i;

// Jargão técnico que NUNCA pode chegar ao operador (clareza é o diferencial nº1):
// erros crus de Pydantic/Python/HTTP, "runner error", traceback, etc.
const TECH_LEAK =
  /ValidationError|runner error|string_type|DesignBody|Traceback|pydantic|HTTP 5\d\d|Internal Server|NoneType|KeyError|AttributeError|TypeError|errors\.pydantic|\bInputError\b/i;

/** Traduz qualquer erro numa mensagem amigável pt-BR/en-US. NUNCA vaza jargão técnico:
 *  cancelado/timeout → mensagem específica; erro técnico → genérico acolhedor; mensagens
 *  já humanas (ex.: "falha ao desenhar a operação") passam. */
function humanise(e: unknown, t: (k: string) => string): string {
  const raw =
    e instanceof ApiError
      ? e.message || `HTTP ${e.status}`
      : e instanceof Error
        ? e.message
        : String(e);
  if (!raw) return t('solutions.arquitetoErrGeneric');
  if (/cancel/i.test(raw)) return t('solutions.arquitetoErrCancelled');
  if (/tempo esgotad|timed?\s?out|timeout/i.test(raw)) return t('solutions.arquitetoErrTimeout');
  if (TECH_LEAK.test(raw)) return t('solutions.arquitetoErrTechnical');
  return raw;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Constrói um plano mínimo a partir do briefing do operador (todos os turnos
 *  do usuário + o turno atual). Usado como rede de segurança quando a IA
 *  "encerra" sem emitir um bloco parseável — o `problem` consolidado basta para
 *  o backend derivar o blueprint via designGraph; o operador refina depois. */
function synthesizePlan(history: ChatTurn[], latestUser: string): ArquitetoPlan {
  const briefing = [
    ...history.filter((t) => t.role === 'user').map((t) => t.content),
    latestUser,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);
  return { problem: briefing || latestUser.trim() };
}

/**
 * Detecta o bloco cercado ```aegis:plano {...}``` numa mensagem do assistant
 * e devolve o plano parseado + o texto sem o bloco. Retorna null quando o
 * plano ainda não foi finalizado (ou o JSON está malformado).
 */
function tryParsePlan(raw: string): ArquitetoPlan | null {
  try {
    const parsed = JSON.parse(raw.trim()) as ArquitetoPlan;
    if (parsed && typeof parsed.problem === 'string' && parsed.problem.trim()) {
      return parsed;
    }
  } catch {
    /* não é JSON válido */
  }
  return null;
}

export function extractArquitetoPlan(
  content: string,
): { plan: ArquitetoPlan; prose: string } | null {
  // Tolerante a variações de formato do modelo (ordem de preferência):
  //   1. ```aegis:plano …```  (com OU sem quebra de linha após a tag);
  //   2. ```json …``` ou ``` … ``` cercando o JSON do plano;
  //   3. objeto JSON "cru" com a chave "problem" (sem cerca nenhuma).
  const fences = [
    /```aegis:plano\s*([\s\S]*?)```/,
    /```json\s*([\s\S]*?)```/,
    /```\s*(\{[\s\S]*?\})\s*```/,
  ];
  for (const re of fences) {
    const m = re.exec(content);
    if (m) {
      const plan = tryParsePlan(m[1]);
      if (plan) return { plan, prose: content.replace(m[0], '').trim() };
    }
  }
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const plan = tryParsePlan(content.slice(start, end + 1));
    if (plan) return { plan, prose: content.slice(0, start).trim() };
  }
  return null;
}

/**
 * Remove JSON CRU da prosa do chat. Requisito documentado (memory
 * feedback_aip_chat_artifact_interactions): o chat do AIP NUNCA exibe JSON cru —
 * dados estruturados viram artifact/plano, não bloco de código. Quando o plano não
 * é extraído (JSON que não é um plano válido) OU o plano é extraído mas a prosa fica
 * vazia, sem isto o `reply.text` cru (com o JSON) vazava como code block. Conservador:
 * só tira cercas ```json```/```aegis:plano``` e objeto/array JSON standalone que
 * PARSEIA (≥30 chars) — código inline pequeno/não-JSON é preservado.
 */
export function stripStrayJson(content: string): string {
  let out = content
    .replace(/```(?:json|aegis:plano)?\s*(?:\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/gi, '')
    .trim();
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const s = out.indexOf(open);
    const e = out.lastIndexOf(close);
    if (s >= 0 && e > s && e - s >= 30) {
      const blob = out.slice(s, e + 1);
      try {
        JSON.parse(blob);
        out = (out.slice(0, s) + out.slice(e + 1)).trim();
      } catch {
        /* não é JSON válido — preserva (pode ser prosa com chaves) */
      }
    }
  }
  return out;
}

/**
 * Thin caller — reusa os MESMOS endpoints do aip-chat sem acoplar ao store.
 * Tenta o tool-loop `/agent/tools/run`; em falha (ou ausência de texto), cai
 * no single-shot `/inference/chat`. Mesmo provider/model padrão do aip-chat.
 */
async function runArquitetoTurn(
  history: ChatTurn[],
  userText: string,
  provider: string = ARQUITETO_PROVIDER,
  model: string = ARQUITETO_MODEL,
): Promise<InferenceReply> {
  // 1) Tool-loop (idêntico ao ChatPanel: provider openrouter ∈ TOOL_PROVIDERS).
  try {
    const d = await apiFetch<{
      final_text?: string;
      model?: string;
    }>(`/agent/tools/run`, {
      method: 'POST',
      body: JSON.stringify({
        query: userText,
        system: ARQUITETO_SYSTEM,
        provider,
        model,
        max_iterations: 3,
        temperature: 0.2,
      }),
    });
    if (d.final_text && d.final_text.trim()) {
      return { text: d.final_text, model: d.model || model };
    }
  } catch {
    // Cai no single-shot abaixo.
  }

  // 2) Single-shot `/inference/chat` com o histórico completo.
  const msgs: { role: string; content: string }[] = [
    { role: 'system', content: ARQUITETO_SYSTEM },
  ];
  for (const turn of history) {
    msgs.push({ role: turn.role, content: turn.content });
  }
  msgs.push({ role: 'user', content: userText });

  const d = await apiFetch<{
    response_text?: string;
    model?: string;
  }>(`/inference/chat`, {
    method: 'POST',
    body: JSON.stringify({
      messages: msgs,
      provider,
      model,
      temperature: 0.2,
    }),
  });
  return { text: d.response_text || '', model: d.model || model };
}

/** Rótulos i18n do botão copiar do code fence (resolvidos via useT no topo). */
interface CopyLabels {
  copy: string;
  copied: string;
}

/**
 * Bloco de código com botão copiar — sharp (sem rounded), tokens da app.
 * Mesmo padrão do renderer de markdown do politicians-app
 * (components/aip-chat/MessageView.tsx), adaptado às cores do security-app.
 */
function CodeFence({
  language,
  value,
  labels,
}: {
  language?: string;
  value: string;
  labels: CopyLabels;
}) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div className="my-2 border border-border-light bg-canvas-light overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 bg-panel-light border-b border-border-light">
        <span className="text-[10px] font-mono text-muted-on-light uppercase tracking-wider">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[10px] font-mono text-muted-on-light hover:text-text-on-light flex items-center gap-1"
        >
          <Copy className="w-3 h-3" strokeWidth={1.5} />
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <pre className="p-3 overflow-auto text-[12px] font-mono text-text-on-light leading-relaxed whitespace-pre-wrap">
        <code>{value}</code>
      </pre>
    </div>
  );
}

/**
 * Renderiza a mensagem do assistant como MARKDOWN (reuso do mesmo conjunto do
 * politicians-app: react-markdown + remark-gfm + remark-breaks), tokenizado
 * para as cores do security-app e estilo sharp (sem rounded). O bloco
 * ```aegis:plano``` JÁ é removido antes de chegar aqui (extractArquitetoPlan).
 */
function ArquitetoMarkdown({
  content,
  copyLabels,
}: {
  content: string;
  copyLabels: CopyLabels;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        // ── inline ──────────────────────────────────────────────────────
        code({ className, children, ...rest }: React.ComponentProps<'code'>) {
          const inline = !(rest as Record<string, unknown>).node;
          const match = /language-(\w+)/.exec(className || '');
          const language = match?.[1];
          const value = String(children).replace(/\n$/, '');
          if (!inline && language) {
            return <CodeFence language={language} value={value} labels={copyLabels} />;
          }
          return (
            <code
              className="px-1.5 py-0.5 mx-0.5 bg-panel-light border border-border-light text-[12px] font-mono text-text-on-light"
              {...rest}
            >
              {children}
            </code>
          );
        },
        a({ children, href, ...rest }) {
          // Link INTERNO (rota da app, ex.: /painel-de-controle/...) navega na MESMA aba;
          // só link externo (http/https) abre em nova aba. F4 — "editar no AIP" é interno.
          const internal = typeof href === 'string' && href.startsWith('/');
          return (
            <a
              href={href}
              {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className="text-primary underline underline-offset-2 hover:opacity-80"
              {...rest}
            >
              {children}
            </a>
          );
        },
        strong({ children }) {
          return <strong className="font-semibold text-text-on-light">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic text-text-on-light">{children}</em>;
        },

        // ── block ───────────────────────────────────────────────────────
        p({ children }) {
          return <p className="my-1.5 text-text-on-light leading-relaxed">{children}</p>;
        },
        h1: ({ children }) => (
          <h1 className="mt-3 mb-1.5 text-[15px] font-semibold text-text-on-light border-b border-border-light pb-1">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-3 mb-1.5 text-[13.5px] font-semibold text-text-on-light">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-2.5 mb-1 text-[11.5px] font-semibold text-muted-on-light uppercase tracking-wider">
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 pl-5 list-disc marker:text-muted-on-light space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 pl-5 list-decimal marker:text-muted-on-light space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => <li className="text-text-on-light leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-border-light bg-canvas-light pl-3 pr-2 py-1 text-muted-on-light italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-border-light" />,

        // ── tables (GFM) ─────────────────────────────────────────────────
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto border border-border-light bg-white">
            <table className="w-full border-collapse text-[12px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-panel-light border-b border-border-light">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border-light">{children}</tbody>
        ),
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children, style }) => (
          <th
            style={style}
            className="px-2 py-1 text-left font-mono text-[10px] uppercase tracking-wider text-muted-on-light font-semibold border-r border-border-light last:border-r-0"
          >
            {children}
          </th>
        ),
        td: ({ children, style }) => (
          <td
            style={style}
            className="px-2 py-1 text-text-on-light align-top border-r border-border-light last:border-r-0"
          >
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * S4 — card de recomendação de modelo de visão, anexo a um turno do Arquiteto.
 * Mostra, em linguagem do operador: o modelo escolhido, COMO ele roda (hospedagem),
 * os trade-offs e as alternativas — tudo derivado da INTENÇÃO, nunca do domínio. O
 * operador ajusta saída (pino/polígono) e intenção (edge/compartilhado/dedicado) no
 * widget de contagem; aqui ele só ENTENDE a escolha. Sem nomes técnicos crus de
 * provider/runtime na superfície — rótulos via meta/label e i18n.
 */
function VisionRecCard({
  rec,
  t,
}: {
  rec: SelectModelResult;
  t: (k: string) => string;
}) {
  const r = rec.recommended;
  if (!r) return null;
  const alts = rec.candidates.filter((c) => c.key !== r.key).slice(0, 2);
  const hostLabel = (h: string) =>
    h === 'edge'
      ? t('visionCount.hostEdge')
      : h === 'dedicated'
        ? t('visionCount.hostDedicated')
        : t('visionCount.hostShared');
  return (
    <div
      className="mt-2 border border-border-light bg-panel-light/50 px-2.5 py-2"
      data-testid="arquiteto-vision-rec"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-on-light">
        <Cpu className="w-3 h-3 shrink-0" strokeWidth={1.5} />
        {t('visionCount.recModel')}
      </div>
      <div
        className="mt-1 text-[12px] font-semibold text-text-on-light"
        data-testid="arquiteto-vision-rec-model"
      >
        {r.label}
        <span className="ml-2 text-[10px] font-normal text-muted-on-light">
          {(r.hostings || []).map(hostLabel).join(' · ')}
        </span>
      </div>
      {rec.tradeoffs.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-on-light leading-snug">
          {rec.tradeoffs[0]}
        </p>
      )}
      {rec.jurisdiction && (
        <p className="mt-1 text-[10px] font-mono text-muted-on-light">
          {rec.jurisdiction}
        </p>
      )}
      {alts.length > 0 && (
        <div className="mt-1.5 text-[10px] text-muted-on-light">
          <span className="uppercase tracking-wider">{t('visionCount.recAlts')}:</span>{' '}
          {alts.map((c) => c.label).join(', ')}
        </div>
      )}
    </div>
  );
}

/**
 * Painel ANCORADO (in-page) do AIP Arquiteto — renderizado abaixo do canvas
 * em `/paginas/solutions/view`. NÃO é um Dialog/overlay.
 *
 * Props:
 *   - `open`     → painel EXPANDIDO (true) ou recolhido (false). Mantém a
 *                  mesma semântica usada pela página: ao finalizar o plano com
 *                  sucesso, `finalizePlan` chama `onOpenChange(false)` para
 *                  recolher o painel e deixar o diagrama visível ACIMA.
 *   - `onOpenChange` → alterna expandir/recolher (toggle do cabeçalho + recolhe
 *                  pós-sucesso). A lógica do chat permanece idêntica.
 *   - `onGenerated`  → entrega o diagrama gerado (o artefato) à página.
 *   - `panelRef`     → ref opcional do elemento raiz para a página rolar até o
 *                  painel quando o operador clica "Planejar" / CTA do canvas.
 */
export function ArquitetoChat({
  open,
  onOpenChange,
  onGenerated,
  onMerge,
  panelRef,
  hasCurrentDiagram = false,
  editingAppName = null,
  dock = 'bottom',
  onDockChange,
  fill = false,
  defaultDepth = 'lean',
  defaultScope,
  defaultModel = ARQUITETO_MODEL,
  defaultProvider = ARQUITETO_PROVIDER,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGenerated: (d: SolutionDiagram) => void;
  /** F4 — modo-edição: nome do app aberto p/ editar. Quando definido, a abertura
   *  diz "Editando <app> — me diga o que mudar" em vez do convite genérico. */
  editingAppName?: string | null;
  /** Incrementa a proposta no plano atual (dedupe-union no backend) em vez de
   *  sobrepor. Quando definido, a guarda mostra o botão [Mesclar]; o pai faz a
   *  chamada (tem o blueprint do canvas) e devolve o relatório do que foi
   *  somado. Ausente = canvas sem blueprint, só [Sobrepor]/[Manter]. */
  onMerge?: (incoming: SolutionDiagram) => Promise<SolutionMergeReport | void>;
  panelRef?: React.Ref<HTMLElement>;
  /** Há um diagrama no canvas? Se sim, uma nova proposta NÃO sobrepõe sem
   *  confirmação do operador (plan mode iterativo). */
  hasCurrentDiagram?: boolean;
  /** #3 (feedback do operador) — lado onde o painel está ancorado. Só informa
   *  o estado ativo do seletor; quem posiciona é a página. */
  dock?: 'bottom' | 'top' | 'left' | 'right';
  /** #3 — quando presente, o cabeçalho mostra o seletor de dock (4 lados). */
  onDockChange?: (d: 'bottom' | 'top' | 'left' | 'right') => void;
  /** #3 — preenche o wrapper dimensionado da página (h-full) em vez da altura
   *  legada fixa de 340px. */
  fill?: boolean;
  /** W2 (2026-06-28) — defaults da experiência parametrizados em Páginas →
   *  "Configurar experiência" (Page.config.params), lidos pela /solutions e
   *  passados aqui. Substituem os literais internos; ausentes caem nos
   *  fallbacks (lean / par provider+model padrão). */
  defaultDepth?: SolutionsDepth;
  /** Escopo default do desenho (recorte). Ausente = solução inteira (atual). */
  defaultScope?: SolutionScope;
  /** Modelo AIP default (slug real; codinome só na exibição). */
  defaultModel?: string;
  /** Provider do modelo default. */
  defaultProvider?: string;
}) {
  const t = useT();
  const [showHelp, setShowHelp] = React.useState(false);
  const [turns, setTurns] = React.useState<ChatTurn[]>([
    { id: uid(), role: 'assistant', content: ARQUITETO_OPENING },
  ]);
  const [draft, setDraft] = React.useState('');
  const [thinking, setThinking] = React.useState(false);
  const [designing, setDesigning] = React.useState(false);
  const [finalized, setFinalized] = React.useState(false);
  // Sprint L20 — plan mode iterativo: quando já há um plano no canvas, a nova
  // geração vira PROPOSTA PENDENTE (não sobrepõe sozinha). hasGenerated cobre o
  // diagrama gerado nesta sessão; hasCurrentDiagram cobre um carregado/herdado.
  const [pendingDiagram, setPendingDiagram] = React.useState<SolutionDiagram | null>(null);
  const [hasGenerated, setHasGenerated] = React.useState(false);
  // P2 — proposta ENXUTA por padrão; "Aprofundar" re-roda o MESMO plano com depth='full'
  // (largura multi-agente). lastPlanRef guarda o último plano finalizado p/ aprofundar;
  // deepened esconde o botão depois que a versão completa já foi gerada.
  const lastPlanRef = React.useRef<ArquitetoPlan | null>(null);
  const [deepened, setDeepened] = React.useState(false);
  // Remoção destrutiva (confirm-gated): tipo pendente de remoção.
  const [pendingRemoval, setPendingRemoval] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState(false);
  // P3 — timeline viva durante a geração (no lugar do spinner mudo). Cada item =
  // um passo da orquestração (Entendendo → Definindo módulos → Detalhando X → …).
  const [progress, setProgress] = React.useState<{ label: string; detail?: string }[]>([]);
  // Plano A (2026-06-02) — refactor the EXISTING structure: reconcile a
  // generated proposal INTO the persisted ontology as a diff, rendered as the
  // confirm-and-apply artifact. ``pendingRefactor`` is the previewed diff;
  // ``refactorBlueprint`` is what gets applied; ``refactorNote`` is the
  // applied/gated outcome shown in place of the buttons.
  const [pendingRefactor, setPendingRefactor] = React.useState<RefactorResult | null>(null);
  const [refactorBlueprint, setRefactorBlueprint] = React.useState<SolutionBlueprint | null>(null);
  const [refactorApplying, setRefactorApplying] = React.useState(false);
  const [refactorNote, setRefactorNote] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Ao EXPANDIR (open: false → true) sem conversa em andamento, (re)inicia com
  // a saudação do Arquiteto. Diferente do modal antigo, expandir/recolher NÃO
  // descarta uma conversa já em curso — o operador alterna o painel à vontade.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (justOpened && !thinking && !designing && turns.length <= 1) {
      setTurns([{ id: uid(), role: 'assistant', content: editingAppName ? _editOpening(editingAppName) : ARQUITETO_OPENING }]);
      setDraft('');
      setFinalized(false);
      setErr(null);
    }
  }, [open, thinking, designing, turns.length, editingAppName]);

  // F4 — modo-edição: quando o nome do app chega (async) e a conversa ainda está só
  // na saudação, troca a abertura por "Editando <app> — me diga o que mudar".
  React.useEffect(() => {
    if (editingAppName && turns.length <= 1 && !thinking && !designing) {
      setTurns([{ id: uid(), role: 'assistant', content: _editOpening(editingAppName) }]);
    }
    // só reage à chegada do nome (não a cada turno).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAppName]);

  React.useEffect(() => {
    try {
      scrollRef.current?.scrollTo?.({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    } catch {
      // scroll é apenas QoL — jsdom não implementa scrollTo.
    }
  }, [turns.length, thinking]);

  /** Quando o plano é finalizado: gera o diagrama (artefato) automaticamente.
   *  ``depthArg`` ausente → usa o default parametrizado da experiência
   *  (``defaultDepth``); "Aprofundar" força 'full'. */
  const finalizePlan = React.useCallback(
    async (plan: ArquitetoPlan, depthArg?: SolutionsDepth) => {
      const depth: SolutionsDepth = depthArg ?? defaultDepth;
      lastPlanRef.current = plan;
      if (depth === 'lean') setDeepened(false); // novo núcleo → "Aprofundar" volta a valer
      setFinalized(true);
      setDesigning(true);
      setProgress([]); // P3 — zera a timeline a cada nova geração
      setErr(null);
      // O LLM às vezes bulletiza os campos (devolve array em vez de string) e — o bug
      // real de 2026-06-05 — emite DICT ANINHADO (o plano inteiro dentro de
      // requirements). Coage p/ string TRUNCADA (cap 4000, margem sob o 4096 do
      // backend) — o backend também protege, mas mandamos o contrato limpo.
      const asStr = (v: unknown): string | undefined => {
        if (v == null) return undefined;
        let out: string;
        if (Array.isArray(v)) out = v.map((x) => `- ${String(x).trim()}`).join('\n');
        else if (typeof v === 'object') out = JSON.stringify(v);
        else out = String(v);
        return out.slice(0, 4000);
      };
      const wizard: SolutionWizard = {
        end_product: asStr(plan.end_product),
        source_data: asStr(plan.source_data),
        build_preference: asStr(plan.build_preference),
        requirements: asStr(plan.requirements),
        domain: asStr(plan.domain),
      };
      const problem = (asStr(plan.problem) ?? '').slice(0, 4000);
      try {
        // P2 — 'lean' (padrão): NÚCLEO enxuto em 1 chamada (segundos). 'full' ("Aprofundar"):
        // largura multi-agente (minutos) → timeout maior. Job observável (não prende a conexão).
        //
        // P1 (2026-06-05) — AUTO-RETRY 1x: falha de design costuma ser transitória
        // (validação/timeout pontual do worker). Em vez de devolver na hora um erro
        // que culpa o operador, avisamos honestamente ("problema interno — tentando
        // de novo") e repetimos UMA vez. Só desistimos na 2ª falha.
        let d: SolutionDiagram | null = null;
        for (let attempt = 0; ; attempt++) {
          try {
            d = await Solutions.designGraphViaTask(problem, wizard, {
              depth,
              scope: defaultScope,
              timeoutMs: depth === 'full' ? 10 * 60 * 1000 : undefined,
              onProgress: (steps) => setProgress(steps),
            });
            break;
          } catch (e) {
            if (attempt >= 1) throw e;
            setTurns((prev) => [
              ...prev,
              { id: uid(), role: 'assistant', content: t('solutions.arquitetoRetrying') },
            ]);
            setProgress([]);
          }
        }
        // Nunca dev-speak pro operador: sem diagrama = falha genérica amigável.
        if (!d) throw new Error(t('solutions.arquitetoErrGeneric'));
        if (depth === 'full') setDeepened(true);
        if (hasCurrentDiagram || hasGenerated) {
          // Já existe um plano no canvas — NÃO sobrepõe sozinho: vira proposta
          // pendente; o operador decide [Sobrepor] / [Manter atual].
          setPendingDiagram(d);
        } else {
          onGenerated(d);
          setHasGenerated(true);
        }
        // NÃO fecha o chat — o operador segue refinando (plan mode iterativo).
      } catch (e) {
        setErr(humanise(e, t));
        // Falha ao desenhar não trava o chat: operador pode refinar e a IA
        // re-emite o plano num próximo turno.
        setFinalized(false);
      } finally {
        setDesigning(false);
      }
    },
    [onGenerated, hasCurrentDiagram, hasGenerated, defaultDepth, defaultScope, t],
  );

  /** Operador escolheu sobrepor o plano atual com a proposta pendente. */
  const applyPending = React.useCallback(() => {
    if (!pendingDiagram) return;
    onGenerated(pendingDiagram);
    setHasGenerated(true);
    setPendingDiagram(null);
    setTurns((prev) => [
      ...prev,
      { id: uid(), role: 'assistant', content: t('solutions.arquitetoOverwriteApplied') },
    ]);
  }, [pendingDiagram, onGenerated, t]);

  /** Operador escolheu manter o plano atual e descartar a proposta. */
  const discardPending = React.useCallback(() => {
    setPendingDiagram(null);
    setFinalized(false);
    setTurns((prev) => [
      ...prev,
      { id: uid(), role: 'assistant', content: t('solutions.arquitetoOverwriteKept') },
    ]);
  }, [t]);

  /** P2 — "Aprofundar": re-roda o ÚLTIMO plano com depth='full' (largura multi-agente).
   *  O resultado entra pelo mesmo fluxo de proposta pendente ([Sobrepor]/[Manter]). */
  const deepen = React.useCallback(() => {
    const plan = lastPlanRef.current;
    if (!plan || designing) return;
    setTurns((prev) => [
      ...prev,
      { id: uid(), role: 'assistant', content: t('solutions.arquitetoDeepening') },
    ]);
    void finalizePlan(plan, 'full');
  }, [finalizePlan, designing, t]);

  /** Operador escolheu INCREMENTAR: mescla a proposta no plano atual (o pai
   *  chama o merge no backend e devolve o relatório do que foi somado). */
  const mergePending = React.useCallback(async () => {
    if (!pendingDiagram || !onMerge) return;
    setDesigning(true);
    setErr(null);
    try {
      const report = await onMerge(pendingDiagram);
      setHasGenerated(true);
      setPendingDiagram(null);
      const added = report
        ? Object.values(report.added || {}).reduce((a, b) => a + (b || 0), 0)
        : 0;
      const note =
        added > 0
          ? t('solutions.arquitetoMergeApplied').replace('{n}', String(added))
          : t('solutions.arquitetoMergeNoop');
      setTurns((prev) => [...prev, { id: uid(), role: 'assistant', content: note }]);
    } catch (e) {
      // Falha na mescla mantém a proposta pendente para o operador decidir.
      setErr(humanise(e, t));
    } finally {
      setDesigning(false);
    }
  }, [pendingDiagram, onMerge, t]);

  /** Remoção destrutiva confirmada: deleta o object type (governado) e reporta. */
  const doRemove = React.useCallback(async () => {
    const kind = pendingRemoval;
    if (!kind) return;
    setRemoving(true);
    try {
      const r = await Ontology.deleteObjectType(kind);
      setPendingRemoval(null);
      setTurns((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: r?.deleted
            ? t('solutions.arquitetoRemoveDone').replace('{kind}', kind)
            : t('solutions.arquitetoRemoveNotFound').replace('{kind}', kind),
        },
      ]);
    } catch {
      setPendingRemoval(null);
      setTurns((prev) => [
        ...prev,
        { id: uid(), role: 'assistant', content: t('solutions.arquitetoRemoveNotFound').replace('{kind}', kind) },
      ]);
    } finally {
      setRemoving(false);
    }
  }, [pendingRemoval, t]);

  /** Operador escolheu RECONCILIAR a proposta na estrutura existente: faz o
   *  preview (read-only) e mostra o artifact de diff. */
  const previewRefactor = React.useCallback(async (bp: SolutionBlueprint | null) => {
    if (!bp || typeof Solutions.refactorPreview !== 'function') return;
    setDesigning(true);
    setErr(null);
    try {
      const res = await Solutions.refactorPreview(bp);
      setRefactorBlueprint(bp);
      setRefactorNote(null);
      setPendingRefactor(res);
      setPendingDiagram(null); // resolvido: optou por refatorar o existente
    } catch (e) {
      setErr(humanise(e, t));
    } finally {
      setDesigning(false);
    }
  }, []);

  /** Aplica o refactor. O artifact passa allowDestructive = is_destructive, então
   *  aditivo aplica direto e destrutivo só após o clique de confirmação. */
  const applyRefactor = React.useCallback(
    async (allowDestructive: boolean) => {
      if (!refactorBlueprint || typeof Solutions.refactorApply !== 'function') return;
      setRefactorApplying(true);
      setErr(null);
      try {
        const res = await Solutions.refactorApply(refactorBlueprint, allowDestructive);
        const n = Object.values(res.applied || {}).reduce((a, b) => a + (b || 0), 0);
        setRefactorNote(
          res.gated
            ? t('solutions.refactorGated')
            : t('solutions.refactorApplied').replace('{n}', String(n)),
        );
        setHasGenerated(true);
      } catch (e) {
        setErr(humanise(e, t));
      } finally {
        setRefactorApplying(false);
      }
    },
    [refactorBlueprint, t],
  );

  /** B3 — responde "quais apps tenho" com a LISTA REAL do tenant (não só prosa).
   *  Best-effort: se a leitura falhar, a prosa do modelo (já exibida) basta. */
  const answerAppsInventory = React.useCallback(async () => {
    try {
      const apps = (await Workshop.list()).filter(
        (a) => (a.surface ?? 'standalone') === 'standalone',
      );
      const editLabel = t('solutions.arquitetoEditApp');
      const msg = apps.length
        ? `${t('solutions.arquitetoAppsList').replace('{n}', String(apps.length))}\n` +
          apps
            .map((a) => {
              const view = `[${a.display}](/workshop/view/${a.id})`;
              // F2 — "Editar no AIP": só quando o app tem diagrama de origem (source_diagram_id).
              const edit = a.source_diagram_id
                ? ` · [${editLabel}](/paginas/solutions/view?diagram=${a.source_diagram_id}&app=${a.id})`
                : '';
              return `- ${view}${edit}`;
            })
            .join('\n')
        : t('solutions.arquitetoAppsNone');
      setTurns((prev) => [...prev, { id: uid(), role: 'assistant', content: msg }]);
    } catch {
      /* leitura best-effort — a prosa do modelo já foi mostrada */
    }
  }, [t]);

  const send = React.useCallback(async () => {
    const text = draft.trim();
    if (!text || thinking || designing) return;
    setErr(null);
    setDraft('');

    const userTurn: ChatTurn = { id: uid(), role: 'user', content: text };
    const history = turns;
    setTurns((prev) => [...prev, userTurn]);

    // Remoção destrutiva: intercepta ANTES do LLM — mas SÓ comandos imperativos curtos.
    // "remove o tipo X" → confirma e deleta (governado); "exclui o app" → botão.
    // Descrição de app que cita "remover/excluir" (botões de UI etc.) ou refino
    // ("tira a página X") NÃO é interceptado — segue pro LLM normalmente.
    if (isRemovalCommand(text)) {
      // ORDEM IMPORTA (revisão adversarial): alvo estruturado ("tipo X"/"objeto X")
      // PRIMEIRO — "tira o tipo Reserva do app" é remoção de TIPO, não do app.
      if (mentionsTarget(text)) {
        const kind = extractRemovalKind(text);
        if (kind) {
          setPendingRemoval(kind);
        } else {
          setTurns((prev) => [...prev, { id: uid(), role: 'assistant', content: t('solutions.arquitetoRemoveWhich') }]);
        }
        return;
      }
      if (mentionsApp(text)) {
        setTurns((prev) => [...prev, { id: uid(), role: 'assistant', content: t('solutions.arquitetoRemoveAppHint') }]);
        return;
      }
      // comando curto sem alvo estruturado ("exclui Reserva") → refino de plano; flui pro LLM.
    }

    setThinking(true);
    try {
      // REFINO ANCORADO (bugfix): o caminho primário (/agent/tools/run) envia SÓ a query
      // (sem histórico) e o fallback não carrega o bloco do plano (a prose é guardada sem
      // o JSON). Sem âncora, "ajuste X" perde o domínio (ex.: entrega de GLP → virou
      // condomínio por causa de "portaria"). Injetamos o PLANO ATUAL no texto ENVIADO
      // (o exibido continua sendo só o que o operador digitou).
      // Âncora CAPADA (revisão adversarial): só problem+domain — os campos que seguram
      // o domínio — com limite, pra não inflar o prompt em planos "deepened" (~1900
      // tokens) nem empurrar o ajuste pra fora da janela.
      const planAnchor = lastPlanRef.current
        ? JSON.stringify({
            problem: lastPlanRef.current.problem,
            domain: lastPlanRef.current.domain,
          }).slice(0, 1500)
        : null;
      const anchored = planAnchor
        ? `[PLANO ATUAL — este pedido REFINA o plano abaixo. Incorpore o ajuste e RE-EMITA o bloco completo. NUNCA troque o domínio/tema por causa de uma palavra ambígua do ajuste:\n${planAnchor}]\n\nAjuste pedido: ${text}`
        : text;
      const reply = await runArquitetoTurn(history, anchored, defaultProvider, defaultModel);
      const detected = extractArquitetoPlan(reply.text);
      // CONSULTA = pergunta/navegação (marcador [CONSULTA]) E sem bloco de plano.
      const query = isConsulta(reply.text) && !detected;
      // Mostra só a PROSA — NUNCA JSON cru. Plano extraído → usa detected.prose (e se
      // ela ficar vazia, NÃO cai no reply.text cru); sem plano → tira JSON solto da
      // prosa. Garante o requisito documentado: chat do AIP nunca renderiza JSON cru.
      const visible =
        stripConsulta(detected ? stripStrayJson(detected.prose) : stripStrayJson(reply.text)) ||
        (detected ? t('solutions.arquitetoPlanReady') : '');
      const replyId = uid();
      setTurns((prev) => [
        ...prev,
        { id: replyId, role: 'assistant', content: visible, model: reply.model },
      ]);
      // S4 — objetivo de visão? Anexa a recomendação de modelo (estrutural, multidomínio).
      // Best-effort e em paralelo ao plano: a IA escolhe o modelo pela INTENÇÃO; o operador
      // vê o modelo, os trade-offs, alternativas e jurisdição direto no turno do chat.
      if (detectVisionObjective(text)) {
        // Promise.resolve(...) blinda o fluxo principal: a recomendação roda em
        // paralelo e NUNCA derruba o plano, mesmo se a chamada falhar ou não
        // devolver uma promise.
        Promise.resolve(Compute.selectModel(text))
          .then((rec) => {
            if (rec?.recommended) {
              setTurns((prev) =>
                prev.map((m) => (m.id === replyId ? { ...m, rec } : m)),
              );
            }
          })
          .catch(() => {
            /* recomendação é complementar; falha não interrompe o plano */
          });
      }
      // Roteador de intenção (B): CONSULTA → responde e PARA (não fabrica app).
      // CONSTRUIR → propõe: com bloco usa o plano; sem bloco (modelo esqueceu) cai
      // na rede da Fatia 1a (sintetiza do briefing) — nunca um quiz, nunca um dead-end.
      if (query) {
        // pergunta respondida; nada a construir. Se for inventário de apps, anexa a
        // lista REAL do tenant (B3) — só dentro do CONSULTA, nunca num pedido de construir.
        if (APPS_INVENTORY.test(text)) await answerAppsInventory();
      } else if (detected) {
        await finalizePlan(detected.plan);
      } else {
        // Rede anti-dead-end ANCORADA: num refino, preserva domínio/campos do plano
        // atual e só agrega o ajuste (em vez de re-sintetizar do zero).
        await finalizePlan(
          lastPlanRef.current
            ? {
                ...lastPlanRef.current,
                problem: `${lastPlanRef.current.problem}. Ajuste: ${text}`.slice(0, 2000),
              }
            : synthesizePlan(history, text),
        );
      }
    } catch (e) {
      setErr(humanise(e, t));
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, designing, turns, finalizePlan, answerAppsInventory, defaultProvider, defaultModel, t]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void send();
    }
  };

  const busy = thinking || designing;
  const copyLabels = { copy: t('solutions.copy'), copied: t('solutions.copied') };

  // #3 (fix do operador) — borda cinza SEMPRE no lado do dock (sem ela, painel
  // colapsado vira "gap em branco" contra o canvas, já que a divisória de
  // resize só existe com chat E canvas abertos).
  const dockBorder =
    dock === 'left'
      ? 'border-r '
      : dock === 'right'
        ? 'border-l '
        : dock === 'top'
          ? 'border-b '
          : 'border-t ';
  const dockSide = dock === 'left' || dock === 'right';

  // #3 (fix do operador) — COLAPSADO em dock lateral = TIRA VERTICAL (ícone +
  // título em writing-mode vertical), não o cabeçalho horizontal que virava
  // uma coluna larga com vazio embaixo.
  if (fill && dockSide && !open) {
    const ExpandChevron = dock === 'left' ? ChevronRight : ChevronLeft;
    return (
      <section
        ref={panelRef}
        className={`h-full w-9 shrink-0 ${dockBorder}border-border-light bg-canvas-light flex flex-col`}
        data-testid="solutions-arquiteto"
        data-collapsed="true"
        data-dock={dock}
        data-orientation="vertical"
        aria-label={t('solutions.arquitetoTitle')}
      >
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="flex-1 flex flex-col items-center gap-2 py-3 hover:bg-panel-light min-h-0"
          aria-expanded={false}
          data-testid="arquiteto-toggle"
        >
          <AudioLines className="w-4 h-4 text-text-on-light shrink-0" strokeWidth={1.5} />
          <span className="text-[11px] font-semibold text-text-on-light [writing-mode:vertical-rl] truncate min-h-0">
            {t('solutions.arquitetoTitle')}
          </span>
          <ExpandChevron
            className="w-4 h-4 text-muted-on-light shrink-0 mt-auto"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      </section>
    );
  }

  return (
    <section
      ref={panelRef}
      className={
        // #3 — `fill`: a página dimensiona o wrapper (dock + resize memorizado);
        // o painel só preenche, com borda cinza no lado do dock. Sem `fill`:
        // comportamento legado (docado, border-t).
        (fill
          ? `h-full min-h-0 min-w-0 ${dockBorder}`
          : 'shrink-0 border-t ') + 'border-border-light bg-canvas-light flex flex-col'
      }
      data-testid="solutions-arquiteto"
      data-collapsed={open ? 'false' : 'true'}
      data-dock={dock}
      data-orientation="horizontal"
      aria-label={t('solutions.arquitetoTitle')}
    >
      {/* Cabeçalho: toggle (expandir/recolher) + botão de ajuda, lado a lado
          na mesma barra (in-flow, sem overlay). Botões irmãos — não aninhados. */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex flex-1 items-center justify-between gap-2 px-4 py-2 text-left min-w-0 hover:bg-panel-light"
          aria-expanded={open}
          data-testid="arquiteto-toggle"
        >
          <span className="flex items-center gap-2 min-w-0">
            {/* Ícone do título em cor padrão (não primary). */}
            <AudioLines className="w-4 h-4 text-text-on-light shrink-0" strokeWidth={1.5} />
            <span className="text-[12px] font-semibold text-text-on-light truncate">
              {t('solutions.arquitetoTitle')}
            </span>
            <span className="hidden sm:inline text-[11px] text-muted-on-light truncate">
              {t('solutions.arquitetoSubtitle')}
            </span>
          </span>
          <span className="shrink-0 text-muted-on-light" aria-hidden>
            {open ? (
              <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
            ) : (
              <ChevronUp className="w-4 h-4" strokeWidth={1.5} />
            )}
          </span>
        </button>
        {/* #3 — seletor de dock (4 lados); só quando a página controla o layout. */}
        {onDockChange && (
          <span
            className="shrink-0 flex items-center gap-0.5 mr-1"
            role="group"
            aria-label={t('solutions.arquitetoDock')}
            data-testid="arquiteto-dock"
          >
            {(
              [
                ['left', PanelLeft],
                ['top', PanelTop],
                ['bottom', PanelBottom],
                ['right', PanelRight],
              ] as const
            ).map(([side, Icon]) => (
              <button
                key={side}
                type="button"
                onClick={() => onDockChange(side)}
                aria-pressed={dock === side}
                title={t(`solutions.arquitetoDock_${side}`)}
                aria-label={t(`solutions.arquitetoDock_${side}`)}
                data-testid={`arquiteto-dock-${side}`}
                className={
                  'flex items-center justify-center w-7 h-7 ' +
                  (dock === side
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-on-light hover:text-text-on-light hover:bg-panel-light')
                }
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="shrink-0 flex items-center justify-center w-9 h-9 mr-1 text-muted-on-light hover:text-primary hover:bg-panel-light"
          aria-label={t('solutions.helpOpen')}
          title={t('solutions.helpOpen')}
          data-testid="arquiteto-help-btn"
        >
          <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <AipGuideModal open={showHelp} onOpenChange={setShowHelp} />

      {open && (
        <div
          className={
            'flex flex-col min-h-0 px-4 pb-3 ' + (fill ? 'flex-1' : 'h-[340px]')
          }
        >
        {/* Conversa */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide border border-border-light bg-white"
          data-testid="arquiteto-messages"
        >
          {turns.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={m.id}
                className="px-3 py-3 border-b border-border-light last:border-b-0"
                data-testid={`arquiteto-message-${m.role}`}
              >
                <div className="flex gap-2.5">
                  <div
                    className={
                      'shrink-0 w-6 h-6 flex items-center justify-center ring-1 ' +
                      (isUser
                        ? 'bg-panel-light ring-border-light'
                        : 'bg-primary/10 ring-primary/40')
                    }
                  >
                    {isUser ? (
                      <User
                        className="w-3 h-3 text-text-on-light"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <AudioLines
                        className="w-3 h-3 text-primary"
                        strokeWidth={1.5}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-on-light mb-1">
                      {isUser ? t('solutions.arquitetoYou') : 'AIP'}
                    </div>
                    <div className="text-[12.5px] text-text-on-light leading-relaxed break-words">
                      {isUser ? (
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      ) : (
                        <ArquitetoMarkdown
                          content={m.content}
                          copyLabels={copyLabels}
                        />
                      )}
                    </div>
                    {!isUser && m.model && (
                      <div className="mt-1 text-[10px] font-mono text-muted-on-light">
                        {aipModelLabel(m.model)}
                      </div>
                    )}
                    {/* S4 — card de recomendação de modelo de visão (anexo ao turno). */}
                    {!isUser && m.rec?.recommended && (
                      <VisionRecCard rec={m.rec} t={t} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {thinking && (
            <div className="px-3 py-3" data-testid="arquiteto-thinking">
              <div className="flex items-center gap-2 text-[11px] text-muted-on-light">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                {t('solutions.arquitetoThinking')}
              </div>
            </div>
          )}

          {designing && (
            <div className="px-3 py-3" data-testid="arquiteto-designing">
              <div className="flex items-center gap-2 text-[11px] text-primary">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                {t('solutions.arquitetoDesigning')}
              </div>
              {/* P3 — timeline viva: cada passo da orquestração, no lugar do spinner mudo. */}
              {progress.length > 0 && (
                <ol className="mt-2 ml-1 space-y-1" data-testid="arquiteto-progress">
                  {progress.map((s, i) => {
                    const last = i === progress.length - 1;
                    return (
                      <li
                        key={`${s.label}-${i}`}
                        className="flex items-center gap-2 text-[11px] text-muted-on-light"
                      >
                        {last ? (
                          <Loader2
                            className="w-3 h-3 animate-spin text-primary shrink-0"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <CheckCircle2
                            className="w-3 h-3 text-success shrink-0"
                            strokeWidth={1.5}
                          />
                        )}
                        <span className={last ? 'text-text-on-light' : undefined}>
                          {s.label}
                          {s.detail ? <span className="text-muted-on-light"> · {s.detail}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {pendingDiagram && !designing && (
            <div
              className="px-3 py-3 m-2 border border-warning/40 bg-warning/5"
              data-testid="arquiteto-overwrite-guard"
            >
              <p className="text-[11px] text-text-on-light mb-2">
                {t('solutions.arquitetoOverwritePrompt')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {onMerge && (
                  <button
                    type="button"
                    data-testid="arquiteto-merge"
                    onClick={mergePending}
                    className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover"
                  >
                    {t('solutions.arquitetoMergeBtn')}
                  </button>
                )}
                {typeof Solutions.refactorPreview === 'function' && (
                  <button
                    type="button"
                    data-testid="arquiteto-refactor-trigger"
                    onClick={() => previewRefactor(_diagramBlueprint(pendingDiagram))}
                    className="h-7 px-2.5 text-[11px] border border-border-light text-text-on-light hover:bg-muted-on-light/10"
                  >
                    {t('solutions.refactorTriggerBtn')}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="arquiteto-overwrite"
                  onClick={applyPending}
                  className="h-7 px-2.5 text-[11px] border border-border-light text-text-on-light hover:bg-muted-on-light/10"
                >
                  {t('solutions.arquitetoOverwriteBtn')}
                </button>
                <button
                  type="button"
                  data-testid="arquiteto-keep"
                  onClick={discardPending}
                  className="h-7 px-2.5 text-[11px] border border-border-light text-text-on-light hover:bg-muted-on-light/10"
                >
                  {t('solutions.arquitetoKeepBtn')}
                </button>
              </div>
            </div>
          )}

          {pendingRefactor && !designing && (
            <RefactorDiffArtifact
              result={pendingRefactor}
              onApply={applyRefactor}
              applying={refactorApplying}
              appliedNote={refactorNote}
            />
          )}

          {/* Remoção destrutiva (confirm-gated): "remove o tipo X" → confirma e deleta. */}
          {pendingRemoval && (
            <div
              className="px-3 py-3 m-2 border border-danger/40 bg-danger/5"
              data-testid="arquiteto-remove-guard"
            >
              <p className="text-[11px] text-text-on-light mb-2">
                {t('solutions.arquitetoRemoveConfirm').replace('{kind}', pendingRemoval)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="arquiteto-remove-confirm"
                  onClick={doRemove}
                  disabled={removing}
                  className="h-7 px-2.5 text-[11px] border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {t('solutions.arquitetoRemoveBtn')}
                </button>
                <button
                  type="button"
                  data-testid="arquiteto-remove-cancel"
                  onClick={() => setPendingRemoval(null)}
                  disabled={removing}
                  className="h-7 px-2.5 text-[11px] border border-border-light text-text-on-light hover:bg-muted-on-light/10"
                >
                  {t('solutions.arquitetoRemoveCancel')}
                </button>
              </div>
            </div>
          )}

          {finalized && !designing && !err && !pendingDiagram && (
            <div className="px-3 py-3 space-y-2" data-testid="arquiteto-finalized">
              <div className="flex items-center gap-2 text-[11px] text-success">
                <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                {t('solutions.arquitetoFinalized')}
              </div>
              {/* #1 — orienta o próximo passo: plugar dados reais nos nós de
                  Coleta (vincular existente, criar agora, ou subir arquivo). */}
              <p
                className="text-[11px] text-muted-on-light leading-relaxed"
                data-testid="arquiteto-connect-hint"
              >
                {t('solutions.arquitetoConnectHint')}
              </p>
              {lastPlanRef.current && !deepened && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-on-light">
                    {t('solutions.arquitetoDeepenHint')}
                  </p>
                  <button
                    type="button"
                    onClick={deepen}
                    data-testid="arquiteto-deepen"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-foreground border border-border-light hover:bg-panel-light"
                  >
                    <Layers className="w-3 h-3" strokeWidth={1.5} />
                    {t('solutions.arquitetoDeepenBtn')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {err && (
          <div
            className="px-3 py-2 text-[12px] leading-relaxed text-danger bg-danger/5 border border-danger/30"
            data-testid="arquiteto-error"
          >
            {err}
          </div>
        )}

        {/* Composer */}
        <div className="mt-2 border border-border-light bg-white">
          <div className="flex items-end gap-1 p-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder={t('solutions.arquitetoPlaceholder')}
              className="flex-1 resize-none bg-transparent border-0 outline-none px-2 py-2 text-[13px] text-text-on-light placeholder:text-muted-on-light max-h-40 scrollbar-hide"
              disabled={busy}
              data-testid="arquiteto-input"
            />
            <Button
              variant="default"
              className="h-9 w-9 p-0"
              onClick={() => void send()}
              disabled={busy || !draft.trim()}
              aria-label={t('solutions.arquitetoSend')}
              data-testid="arquiteto-send"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Send className="w-4 h-4" strokeWidth={1.5} />
              )}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-center text-muted-on-light">
          {t('solutions.arquitetoHint')}
        </p>
        </div>
      )}
    </section>
  );
}
