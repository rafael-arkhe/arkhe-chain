'use client';

/**
 * SandboxIDE (security-app) — P5 portado pro produto ativo.
 *
 * Editor Monaco (Python) que executa no sandbox do AEGIS via `POST /sandbox/execute`
 * (mesmo backend do web-app — reuso, sem duplicar lógica). O SDK `aegis` já vem
 * assado na imagem do sandbox e autentica como o operador (token efêmero revogável).
 *
 * Recursos: rodar + console; rede on/off; "Gerar com AIP" (codegen baseado no
 * SDK, validado por AST + carga no sandbox no servidor) → card de revisão →
 * inserir; autocomplete SDK-aware no Monaco (símbolos do corpus vivo).
 *
 * Estética security-app: light, sharp (sem rounded), sem emoji, ícones lucide,
 * tooltips InfoTip, strings via useT() (pt-BR + en-US).
 */
import * as React from 'react';
import { Play, Loader2, AudioLines, Check, X as XIcon, Wifi, WifiOff, Package, TerminalSquare, Database, Columns3, KeyRound, PanelLeftClose, PanelLeftOpen, Boxes, FlaskConical, FileInput, PlayCircle, ArrowRightLeft, AlertTriangle, ShieldAlert, FlaskRound, Plus, History, MinusCircle, Type as TypeIcon, Hash, ToggleLeft, Calendar, List, Braces, Globe, type LucideIcon } from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';

import { useT } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SandboxTerminal } from '@/components/dev/sandbox-terminal';
import { Sandbox, Codegen, Functions, Ontology, type SandboxExecuteResult, type CodegenResult, type ObjectTypeProperty, type OntologyNode, type PreviewBatchResult, type TestOut, type TestRun, type FunctionTestAssertion, type InstalledPackage } from '@/lib/api';

// F6 — operadores de asserção e tipos canônicos (dropdowns; sem input técnico
// manual). Rótulos via useT() (`ide.assertionOp.*` / `ide.assertionType.*`).
const ASSERTION_OPS: FunctionTestAssertion['op'][] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'type', 'contains', 'exists'];
const ASSERTION_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'] as const;

// Ícone por TIPO de campo no "Esquema de entrada" — cada campo tem o ícone do
// seu tipo (não o mesmo p/ todos). Fallback = Columns3 (coluna genérica).
function schemaFieldIcon(type?: string): LucideIcon {
  const t = (type || '').toLowerCase();
  if (t.includes('bool')) return ToggleLeft;
  if (t.includes('int') || t.includes('number') || t.includes('float') || t.includes('decimal')) return Hash;
  if (t.includes('date') || t.includes('time')) return Calendar;
  if (t.includes('array') || t.includes('list')) return List;
  if (t.includes('object') || t.includes('json') || t.includes('map') || t.includes('dict')) return Braces;
  if (t.includes('str') || t.includes('text')) return TypeIcon;
  return Columns3;
}
/**
 * #1 — "Gerar com AIP" mantém o HEADER do código INTOCÁVEL e troca só o corpo.
 *
 * O esqueleto da IDE traz um header de contrato (imports + comentários
 * `# Transformador / # ENTRADA / # SAÍDA`) que o operador NÃO quer perder ao
 * gerar. Esta função pura mantém tudo ANTES da 1ª `def`/`class`/`async def`
 * (byte-idêntico — comentários de contrato preservados) e substitui o corpo
 * pelo código gerado. Imports novos do gerado que faltam no header são
 * adicionados APÓS os imports existentes (aditivo; não toca os comentários).
 *
 * Sem `def`/`class` no atual (ex.: script solto top-level), não há corpo a
 * trocar → devolve o gerado inteiro (comportamento de substituição).
 */
const _BODY_START = /^\s*(async\s+def\s|def\s|class\s)/;
const _IS_IMPORT = (l: string) => /^(import\s|from\s)\S/.test(l.trim());
export function mergeGeneratedIntoHeader(current: string, generated: string): string {
  const curLines = (current || '').split('\n');
  const splitIdx = curLines.findIndex((l) => _BODY_START.test(l));
  if (splitIdx < 0) return generated; // nada a preservar → substitui
  const header = curLines.slice(0, splitIdx);
  const genLines = (generated || '').split('\n');
  const genBodyStart = genLines.findIndex((l) => _BODY_START.test(l));
  const genBody = genBodyStart < 0 ? generated : genLines.slice(genBodyStart).join('\n');
  // imports do gerado que faltam no header → adicionados após o último import.
  const headerImports = new Set(header.filter(_IS_IMPORT).map((l) => l.trim()));
  const newImports = genLines
    .slice(0, genBodyStart < 0 ? genLines.length : genBodyStart)
    .filter((l) => _IS_IMPORT(l) && !headerImports.has(l.trim()));
  let merged = header.slice();
  if (newImports.length) {
    let lastImp = -1;
    for (let i = 0; i < merged.length; i++) if (_IS_IMPORT(merged[i])) lastImp = i;
    const at = lastImp >= 0 ? lastImp + 1 : 0;
    merged = [...merged.slice(0, at), ...newImports, ...merged.slice(at)];
  }
  const headerStr = merged.join('\n').replace(/\s+$/, '');
  return headerStr + '\n\n' + genBody.replace(/^\s+/, '').replace(/\s+$/, '') + '\n';
}

// Linha do builder (estado da UI) — `value` editado como texto; convertido na
// hora de montar o body do createTest (number quando numérico/comparação).
interface AssertionRow { field: string; op: FunctionTestAssertion['op']; value: string; }

import { transformerSkeleton, transformerSkeletonBatch } from './transformer-skeleton';
import { synthesizeSampleSkeleton } from './synthesize-sample';
import { useSampleFor } from '@/components/solution-designer/sample-context';
import { JsonField } from './json-field';

const DEFAULT_CODE = [
  'from aegis import AegisClient',
  '',
  'c = AegisClient()  # autentica como o operador (token efêmero do sandbox)',
  'tipos = c.ontology.osdk_manifest()',
  'print(tipos)',
  '',
].join('\n');

/**
 * F1 — props OPCIONAIS que tornam a IDE contextual ao nó de Processamento de
 * onde foi aberta. 100% retrocompatível: sem props, a IDE começa no
 * DEFAULT_CODE e não mostra o painel de esquema (comportamento anterior).
 *
 *  - `transformerSlug`: ao montar, busca a Code Function salva e usa o `source`
 *    dela como código inicial do editor (fallback DEFAULT_CODE se vazio/erro).
 *  - `nodeType`: kind do tipo de objeto do nó — carrega o esquema de entrada
 *    (colunas/tipos) num painel lateral colapsável.
 *  - `outputProperty`: propriedade de saída do nó (destacada no painel).
 */
export interface SandboxIDEProps {
  nodeType?: string;
  transformerSlug?: string;
  outputProperty?: string;
  /** F6 — surfacia o código atual do editor pro pai (salvar e vincular). */
  onCodeChange?: (code: string) => void;
  /** F6 — propriedades do tipo de entrada vindas do BLUEPRINT (tipo PROPOSTO, ainda
   *  não materializado → objectTypeSchema 404). Alimentam o esqueleto contextual. */
  inputProps?: { key: string; type?: string; label?: string }[];
  /**
   * O3c — contrato de execução do código:
   *  · 'object' (default) = per-object (`def transform(obj)`) — caminho do AIP enrich.
   *  · 'batch' = NÓ DE CÓDIGO do pipeline: o sandbox roda o source CRU, então o
   *    script lê `input.json` (`{"rows":[...]}`) e imprime `{"rows":[...]}`
   *    (contrato de `_apply_code_step`). Semeia o esqueleto BATCH + preview rows-aware.
   */
  contract?: 'object' | 'batch';
  /** O3c — colunas da ENTRADA do nó de código (saída da cadeia a montante; NÃO é um
   *  tipo de ontologia) → alimentam o esqueleto batch. */
  batchColumns?: string[];
  /** O3c — amostra de LINHAS reais da entrada → `input.json` (`{"rows":[...]}`) p/
   *  rodar/pré-visualizar fiel ao que o nó executa. */
  batchSampleRows?: Record<string, unknown>[];
}

export function SandboxIDE({ nodeType, transformerSlug, outputProperty, onCodeChange, inputProps, contract = 'object', batchColumns, batchSampleRows }: SandboxIDEProps = {}) {
  const t = useT();
  const [code, setCode] = React.useState(DEFAULT_CODE);
  // F6 — surfacia o código atual pro pai (salvar e vincular).
  React.useEffect(() => { onCodeChange?.(code); }, [code, onCodeChange]);
  const [running, setRunning] = React.useState(false);
  // F1 — carga do source do transformer salvo (quando vier slug).
  const [loadingSource, setLoadingSource] = React.useState(false);
  // F1 — esquema de entrada do tipo de objeto do nó.
  const [schema, setSchema] = React.useState<{ properties: ObjectTypeProperty[]; titleProperty: string } | null>(null);
  const [loadingSchema, setLoadingSchema] = React.useState(false);
  const [schemaOpen, setSchemaOpen] = React.useState(true);
  // F2 — amostras reais da ingestão (objetos do `nodeType`) + painel de input.
  // `inputData` é o dado que ENTRA no transformador (o mesmo dict que
  // `aip.enrich_objects` passa por objeto). A F3 consome pra rodar o preview.
  const [samples, setSamples] = React.useState<OntologyNode[]>([]);
  const [loadingSamples, setLoadingSamples] = React.useState(false);
  const [inputData, setInputData] = React.useState<Record<string, unknown>>({});
  // Texto cru editável do painel (permite JSON inválido enquanto o operador
  // digita; `inputData` só é sincronizado quando o JSON parseia).
  const [inputText, setInputText] = React.useState('{}');
  const [allowNetwork, setAllowNetwork] = React.useState(true);
  const [result, setResult] = React.useState<SandboxExecuteResult | null>(null);
  // F3/F4 — preview FIEL (lote) sobre as amostras + contrato de saída.
  // `previewBatch` é o resultado fiel (Function salva); `previewDraft` é o
  // single do código solto (sem slug). Só um dos dois fica ativo por vez.
  const [previewing, setPreviewing] = React.useState(false);
  const [previewMode, setPreviewMode] = React.useState<'faithful' | 'draft' | null>(null);
  const [previewBatch, setPreviewBatch] = React.useState<PreviewBatchResult | null>(null);
  const [previewDraft, setPreviewDraft] = React.useState<SandboxExecuteResult | null>(null);
  const [previewErr, setPreviewErr] = React.useState<string | null>(null);
  // Aba do sidebar contextual: entrada (F1) · saída (F4) · amostras (F2).
  const [sidebarTab, setSidebarTab] = React.useState<'input' | 'output' | 'samples'>('input');
  // Feedback de "Sintetizar amostra" (antes era silencioso).
  const [synthMsg, setSynthMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  // pacote pip — instalação num MODAL dedicado (input + logs + feedback).
  const [pkg, setPkg] = React.useState('');
  const [installing, setInstalling] = React.useState(false);
  const [pkgModalOpen, setPkgModalOpen] = React.useState(false);
  const [installLog, setInstallLog] = React.useState<{ status: string; package_name: string; stdout: string; stderr: string } | null>(null);
  const [packages, setPackages] = React.useState<InstalledPackage[]>([]);
  // terminal interativo (débito 4) — só quando o WS direto está configurado.
  const terminalOk = React.useMemo(() => Sandbox.terminalAvailable(), []);
  const [showTerminal, setShowTerminal] = React.useState(false);
  // pane "Gerar com AIP"
  const [showAip, setShowAip] = React.useState(false);
  const [objective, setObjective] = React.useState('');
  const [kind, setKind] = React.useState<'script' | 'transform'>('script');
  const [generating, setGenerating] = React.useState(false);
  const [gen, setGen] = React.useState<CodegenResult | null>(null);
  const [genErr, setGenErr] = React.useState<string | null>(null);

  // F5/F6 — testes governados (só relevante com transformerSlug / Function salva).
  // `tests` é a lista carregada; o painel inferior alterna entre a lista, o form
  // de "Salvar como teste" e o histórico de execuções.
  const [tests, setTests] = React.useState<TestOut[]>([]);
  const [loadingTests, setLoadingTests] = React.useState(false);
  const [showTests, setShowTests] = React.useState(false);
  const [savingTest, setSavingTest] = React.useState(false);
  const [showTestForm, setShowTestForm] = React.useState(false);
  const [testName, setTestName] = React.useState('');
  const [testExpected, setTestExpected] = React.useState('');
  const [assertions, setAssertions] = React.useState<AssertionRow[]>([]);
  // Resumo da última "Rodar testes" (passed/failed).
  const [runAllSummary, setRunAllSummary] = React.useState<{ total: number; passed: number; failed: number } | null>(null);
  const [runningAll, setRunningAll] = React.useState(false);
  const [runningTestId, setRunningTestId] = React.useState<string | null>(null);
  // Feedback de erro do painel de Testes (antes os catch eram silenciosos).
  const [testErr, setTestErr] = React.useState<string | null>(null);
  // F6 — histórico de execuções.
  const [showHistory, setShowHistory] = React.useState(false);
  const [testRuns, setTestRuns] = React.useState<TestRun[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  const sdkSymbolsRef = React.useRef<{ label: string; detail: string; insertText: string }[]>([]);
  React.useEffect(() => {
    void Codegen.sdkSymbols().then((r) => { sdkSymbolsRef.current = r.symbols || []; }).catch(() => {});
  }, []);

  // F1 — quando aberta a partir de um transformer salvo, carrega o source dele
  // como código inicial. Fallback ao DEFAULT_CODE se vazio ou em erro.
  React.useEffect(() => {
    if (!transformerSlug) return;
    let alive = true;
    setLoadingSource(true);
    void Functions.get(transformerSlug)
      .then((fn) => { if (alive && fn.source) setCode(fn.source); })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingSource(false); });
    return () => { alive = false; };
  }, [transformerSlug]);

  // F1 — esquema de entrada (properties/tipos) do tipo de objeto do nó.
  React.useEffect(() => {
    if (!nodeType) { setSchema(null); return; }
    let alive = true;
    setLoadingSchema(true);
    void Ontology.objectTypeSchema(nodeType)
      .then((s) => { if (alive) setSchema({ properties: s.properties || [], titleProperty: s.title_property }); })
      .catch(() => { if (alive) setSchema({ properties: [], titleProperty: '' }); })
      .finally(() => { if (alive) setLoadingSchema(false); });
    return () => { alive = false; };
  }, [nodeType]);

  // F6 — esqueleto CONTEXTUAL: transformer NOVO (sem source salvo) → injeta código
  // já linkado ao input (tipo + propriedades do BLUEPRINT proposto, com fallback ao
  // schema materializado) e à propriedade de saída; só se o operador ainda não editou
  // (código ainda no DEFAULT_CODE). Resolve "cadê os objetos/coleta" da IDE.
  React.useEffect(() => {
    if (transformerSlug || !nodeType) return;
    const props = inputProps && inputProps.length ? inputProps : schema?.properties || [];
    setCode((prev) =>
      prev === DEFAULT_CODE ? transformerSkeleton(nodeType, props, outputProperty) : prev,
    );
  }, [nodeType, transformerSlug, inputProps, schema, outputProperty]);

  // F2 — amostras reais: objetos do `nodeType` direto da ingestão. Selecionar
  // um carrega as `properties` dele no painel de input (input.json fiel).
  React.useEffect(() => {
    if (!nodeType) { setSamples([]); return; }
    let alive = true;
    setLoadingSamples(true);
    void Ontology.listNodes({ node_type: nodeType, limit: 10 })
      .then((rows) => { if (alive) setSamples(rows || []); })
      .catch(() => { if (alive) setSamples([]); })
      .finally(() => { if (alive) setLoadingSamples(false); });
    return () => { alive = false; };
  }, [nodeType]);

  // F2 — escreve o painel de input a partir de um dict (amostra ou esqueleto),
  // mantendo `inputData` e o texto editável em sincronia.
  const setInput = React.useCallback((data: Record<string, unknown>) => {
    setInputData(data);
    setInputText(JSON.stringify(data, null, 2));
  }, []);

  // O3c — esqueleto BATCH p/ o NÓ DE CÓDIGO: o sandbox roda o source CRU, então o
  // script é AUTO-CONTIDO (lê input.json {rows} → imprime {rows}, contrato de
  // `_apply_code_step`). Só semeia se não há Function salva e o operador ainda não
  // editou (código no DEFAULT_CODE). Não conflita com o esqueleto per-object (este
  // só dispara em contract==='batch'; aquele exige `nodeType`, que o nó código não passa).
  React.useEffect(() => {
    if (contract !== 'batch' || transformerSlug) return;
    const cols = (batchColumns || []).map((k) => ({ key: k }));
    setCode((prev) => (prev === DEFAULT_CODE ? transformerSkeletonBatch(nodeType || '', cols) : prev));
  }, [contract, transformerSlug, batchColumns, nodeType]);

  // O3c — prima o painel de input com as LINHAS reais da entrada (input.json =
  // {"rows":[...]}), 1× quando chegam (não sobrescreve edição posterior do operador).
  // Rodar/Pré-visualizar passam esse input_data → o script lê via open("input.json").
  const batchPrimedRef = React.useRef(false);
  React.useEffect(() => {
    if (contract !== 'batch' || batchPrimedRef.current) return;
    if (!batchSampleRows || batchSampleRows.length === 0) return;
    batchPrimedRef.current = true;
    setInput({ rows: batchSampleRows });
  }, [contract, batchSampleRows, setInput]);

  // F2 — edição manual do painel: tenta parsear; só promove a `inputData` quando
  // o JSON é válido (o operador pode digitar um estado intermediário inválido).
  const onInputTextChange = React.useCallback((text: string) => {
    setInputText(text);
    setSynthMsg(null);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setInputData(parsed as Record<string, unknown>);
      }
    } catch { /* JSON intermediário inválido — não promove */ }
  }, []);

  // #6 — amostra REAL da Coleta (rodada no nó) pra ESTE tipo, com fallback à
  // última amostra ('*'). Quando existe, o operador coda com dados de verdade.
  const ctxSample = useSampleFor(nodeType);
  const ctxSampleAny = useSampleFor('*');
  const realSample = ctxSample.length ? ctxSample : ctxSampleAny;

  // F2/#6 — "Sintetizar amostra": prefere o registro REAL coletado (se rodou a
  // amostra na Coleta); senão monta o esqueleto (schema/inputProps). Dá feedback.
  const synthesizeSample = React.useCallback(() => {
    if (realSample.length) {
      setInput(realSample[0]);
      setSidebarTab('input');
      setSynthMsg({
        ok: true,
        text: t('ide.synthesizeReal').replace('{n}', String(Object.keys(realSample[0]).length)),
      });
      return;
    }
    const props =
      schema?.properties && schema.properties.length
        ? schema.properties
        : inputProps && inputProps.length
          ? inputProps
          : [];
    if (props.length === 0) {
      setInput({});
      setSynthMsg({ ok: false, text: t('ide.synthesizeEmpty') });
      return;
    }
    setInput(synthesizeSampleSkeleton(props));
    setSidebarTab('input');
    setSynthMsg({ ok: true, text: t('ide.synthesizeDone').replace('{n}', String(props.length)) });
  }, [realSample, schema, inputProps, setInput, t]);

  // Esquema de entrada EXIBIDO: schema materializado OU, p/ tipo PROPOSTO (404 no
  // objectTypeSchema), os `inputProps` do blueprint — coerente com o esqueleto e
  // o Sintetizar (antes o painel dizia "sem propriedades" mas o código tinha-as).
  const displaySchemaProps = React.useMemo(() => {
    if (schema?.properties && schema.properties.length) {
      return schema.properties.map((p) => ({
        key: p.key, type: p.type, label: p.label, is_title: p.is_title, proposed: false,
      }));
    }
    if (inputProps && inputProps.length) {
      return inputProps.map((p) => ({
        key: p.key, type: p.type || '', label: p.label || p.key, is_title: false, proposed: true,
      }));
    }
    return [] as Array<{ key: string; type: string; label: string; is_title: boolean; proposed: boolean }>;
  }, [schema, inputProps]);

  // Status técnico do sandbox → rótulo humano i18n (nunca 'running'/'error' cru).
  const statusLabel = React.useCallback((s: string) => {
    const k = (s || '').toLowerCase();
    if (['success', 'completed', 'ok'].includes(k)) return t('ide.statusOk');
    if (['error', 'failed', 'failure'].includes(k)) return t('ide.statusError');
    if (['running', 'pending', 'queued'].includes(k)) return t('ide.statusRunning');
    if (k.includes('time')) return t('ide.statusTimeout');
    return s; // valor desconhecido — mostra cru (raro), melhor que vazio
  }, [t]);

  const run = React.useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      // F2 — passa a amostra como input_data quando o painel não está vazio, pra
      // o dado chegar fiel ao script (o backend já aceita input_data).
      const hasInput = Object.keys(inputData).length > 0;
      setResult(await Sandbox.execute({
        code,
        language: 'python',
        allow_network: allowNetwork,
        timeout_seconds: 120,
        ...(hasInput ? { input_data: JSON.stringify(inputData) } : {}),
      }));
    } catch (e) {
      setResult({ session_id: '', status: 'error', exit_code: -1, stdout: '', stderr: e instanceof Error ? e.message : String(e), duration_ms: null, code_hash: '' });
    } finally { setRunning(false); }
  }, [code, allowNetwork, running, inputData]);

  // F3 — preview HÍBRIDO (decisão do operador, sinalizada por badge):
  //  · com transformerSlug → preview FIEL em lote sobre TODAS as amostras
  //    carregadas (mesmo contrato do fluxo): Functions.previewBatch.
  //  · sem slug (código solto) → single sobre o inputData atual: Sandbox.execute.
  const preview = React.useCallback(async () => {
    if (previewing) return;
    setPreviewing(true);
    setPreviewErr(null);
    setPreviewBatch(null);
    setPreviewDraft(null);
    try {
      if (transformerSlug) {
        setPreviewMode('faithful');
        // O3c — no contrato BATCH, o nó roda 1× com inputs={"rows":[...]} (mesmo de
        // `_apply_code_step`): uma única entrada que embrulha TODAS as linhas. No
        // per-object, uma entrada por objeto.
        const batchRows = Array.isArray((inputData as { rows?: unknown[] }).rows)
          ? (inputData as { rows: unknown[] }).rows
          : batchSampleRows || [];
        const inputsList = contract === 'batch'
          ? [{ rows: batchRows }]
          : samples.map((s) => s.properties || {});
        setPreviewBatch(await Functions.previewBatch(transformerSlug, { inputs_list: inputsList, draft: true }));
        // Foca o operador no contrato de saída inferido (F4).
        setSidebarTab('output');
      } else {
        setPreviewMode('draft');
        const hasInput = Object.keys(inputData).length > 0;
        setPreviewDraft(await Sandbox.execute({
          code,
          language: 'python',
          allow_network: allowNetwork,
          timeout_seconds: 120,
          ...(hasInput ? { input_data: JSON.stringify(inputData) } : {}),
        }));
      }
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }, [previewing, transformerSlug, samples, inputData, code, allowNetwork, contract, batchSampleRows]);

  // F3 — só dá pra pré-visualizar em lote quando há amostras (Function salva) ou
  // um inputData pra rodar no rascunho. Sem nenhum dos dois, o botão desabilita.
  // O3c — no batch fiel a amostra é o `{rows:[...]}` do input.json (não há objetos
  // de ontologia), então olha as linhas, não `samples`.
  const canPreview = transformerSlug
    ? (contract === 'batch'
        ? Array.isArray((inputData as { rows?: unknown[] }).rows) && (inputData as { rows: unknown[] }).rows.length > 0
        : samples.length > 0)
    : Object.keys(inputData).length > 0;

  // F4 — diff do esquema de saída vs o de entrada (apenas visual). Para cada
  // chave da saída: ADICIONADA (não existia na entrada), tipo ALTERADO, ou
  // MANTIDA; chaves só na entrada aparecem como REMOVIDAS.
  const outputSchema = previewBatch?.output_schema || null;
  const schemaDiff = React.useMemo(() => {
    if (!outputSchema) return [] as { key: string; type: string | null; status: 'added' | 'changed' | 'unchanged' | 'removed' }[];
    const inputTypes: Record<string, string> = {};
    for (const p of schema?.properties || []) inputTypes[p.key] = (p.type || '').toLowerCase();
    const rows: { key: string; type: string | null; status: 'added' | 'changed' | 'unchanged' | 'removed' }[] = [];
    for (const [key, ty] of Object.entries(outputSchema)) {
      const inTy = inputTypes[key];
      if (inTy === undefined) rows.push({ key, type: ty, status: 'added' });
      else if (inTy !== (ty || '').toLowerCase()) rows.push({ key, type: ty, status: 'changed' });
      else rows.push({ key, type: ty, status: 'unchanged' });
    }
    for (const key of Object.keys(inputTypes)) {
      if (!(key in outputSchema)) rows.push({ key, type: inputTypes[key], status: 'removed' });
    }
    return rows;
  }, [outputSchema, schema]);

  const refreshPackages = React.useCallback(() => {
    void Sandbox.listPackages()
      .then((list) => {
        // O backend cria uma linha por install → dedupe por nome (1ª = mais
        // recente, já vem ordenado) p/ não repetir o mesmo pacote na lista.
        const seen = new Set<string>();
        setPackages(list.filter((p) => (seen.has(p.package_name) ? false : (seen.add(p.package_name), true))));
      })
      .catch(() => setPackages([]));
  }, []);

  const install = React.useCallback(async () => {
    if (!pkg.trim() || installing) return;
    setInstalling(true);
    setInstallLog(null);
    try {
      const r = await Sandbox.install(pkg.trim());
      // Feedback NO MODAL (não no console da IDE): status + logs.
      setInstallLog(r);
      if (r.status === 'success') {
        refreshPackages();
        // Pacotes registrados só entram no container efêmero com a Rede ligada;
        // liga automaticamente p/ o operador poder USAR o pacote já no próximo Run.
        setAllowNetwork(true);
      }
    } catch (e) {
      setInstallLog({ status: 'error', package_name: pkg.trim(), stdout: '', stderr: e instanceof Error ? e.message : String(e) });
    } finally { setInstalling(false); }
  }, [pkg, installing, refreshPackages]);

  const generate = React.useCallback(async () => {
    if (!objective.trim() || generating) return;
    setGenerating(true); setGenErr(null); setGen(null);
    try {
      setGen(await Codegen.generate({ objective: objective.trim(), kind }));
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : String(e));
    } finally { setGenerating(false); }
  }, [objective, kind, generating]);

  const applyGen = React.useCallback(() => {
    if (!gen) return;
    // #1 — mantém o header (imports + contrato) intocável; troca só o corpo.
    setCode(mergeGeneratedIntoHeader(code, gen.code)); setGen(null); setShowAip(false); setObjective('');
  }, [gen, code]);

  // F5 — carrega os testes salvos da Function (quando há slug). Recarregado
  // após criar/rodar para refletir `last_status`.
  const loadTests = React.useCallback(async () => {
    if (!transformerSlug) return;
    setLoadingTests(true);
    try { setTests(await Functions.tests(transformerSlug)); }
    catch { setTests([]); }
    finally { setLoadingTests(false); }
  }, [transformerSlug]);

  React.useEffect(() => {
    if (!transformerSlug) { setTests([]); return; }
    void loadTests();
  }, [transformerSlug, loadTests]);

  // F6 — opções de campo do builder de asserção: chaves do esquema de saída
  // inferido (preview F4). Sem preview ainda, cai nas chaves do inputData atual.
  const assertionFieldOptions = React.useMemo(() => {
    const outKeys = previewBatch?.output_schema ? Object.keys(previewBatch.output_schema) : [];
    if (outKeys.length > 0) return outKeys;
    return Object.keys(inputData);
  }, [previewBatch, inputData]);

  // F6 — converte o `value` de texto da linha para o tipo apropriado ao `op`.
  const coerceAssertionValue = React.useCallback((row: AssertionRow): unknown => {
    if (row.op === 'exists') return true;
    if (row.op === 'type') return row.value;
    if (['gt', 'gte', 'lt', 'lte'].includes(row.op)) {
      const n = Number(row.value);
      return Number.isNaN(n) ? row.value : n;
    }
    // eq/ne/contains: tenta número/boolean, senão texto (valor livre).
    if (row.value === 'true') return true;
    if (row.value === 'false') return false;
    if (row.value.trim() !== '' && !Number.isNaN(Number(row.value))) return Number(row.value);
    return row.value;
  }, []);

  // F5 — salva a ENTRADA atual (inputData) como teste governado, com
  // expected_contains (vírgula) e as asserções do builder (F6).
  const saveAsTest = React.useCallback(async () => {
    if (!transformerSlug || !testName.trim() || savingTest) return;
    setSavingTest(true);
    setTestErr(null);
    try {
      const expected = testExpected.split(',').map((s) => s.trim()).filter(Boolean);
      const body: { name: string; inputs: Record<string, unknown>; expected_contains?: string[]; assertions?: FunctionTestAssertion[] } = {
        name: testName.trim(),
        inputs: inputData,
      };
      if (expected.length > 0) body.expected_contains = expected;
      const built = assertions
        .filter((a) => a.field)
        .map((a) => ({ field: a.field, op: a.op, value: coerceAssertionValue(a) }));
      if (built.length > 0) body.assertions = built;
      await Functions.createTest(transformerSlug, body);
      setShowTestForm(false);
      setTestName('');
      setTestExpected('');
      setAssertions([]);
      await loadTests();
    } catch (e) { setTestErr(e instanceof Error ? e.message : t('ide.testSaveErr')); }
    finally { setSavingTest(false); }
  }, [transformerSlug, testName, testExpected, inputData, assertions, coerceAssertionValue, savingTest, loadTests]);

  // F5 — roda UM teste por id e atualiza a lista (last_status).
  const runOneTest = React.useCallback(async (testId: string) => {
    if (!transformerSlug || runningTestId) return;
    setRunningTestId(testId);
    setTestErr(null);
    try {
      const updated = await Functions.runTest(transformerSlug, testId);
      setTests((prev) => prev.map((tt) => (tt.id === testId ? updated : tt)));
    } catch (e) { setTestErr(e instanceof Error ? e.message : t('ide.testRunErr')); }
    finally { setRunningTestId(null); }
  }, [transformerSlug, runningTestId]);

  // F5 — roda TODOS os testes e mostra o resumo passed/failed.
  const runAllTests = React.useCallback(async () => {
    if (!transformerSlug || runningAll) return;
    setRunningAll(true);
    setTestErr(null);
    try {
      const r = await Functions.runAllTests(transformerSlug);
      setRunAllSummary({ total: r.total, passed: r.passed, failed: r.failed });
      await loadTests();
    } catch (e) { setTestErr(e instanceof Error ? e.message : t('ide.testRunErr')); }
    finally { setRunningAll(false); }
  }, [transformerSlug, runningAll, loadTests]);

  // F6 — carrega o histórico de execuções (mais recente primeiro vem do backend).
  const loadHistory = React.useCallback(async () => {
    if (!transformerSlug) return;
    setLoadingHistory(true);
    try { setTestRuns(await Functions.testRuns(transformerSlug)); }
    catch { setTestRuns([]); }
    finally { setLoadingHistory(false); }
  }, [transformerSlug]);

  const toggleHistory = React.useCallback(() => {
    setShowHistory((v) => {
      const next = !v;
      if (next) void loadHistory();
      return next;
    });
  }, [loadHistory]);

  return (
    <div className="flex flex-col h-full" data-testid="sandbox-ide">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border-light bg-canvas-light flex-wrap">
        <Button onClick={run} disabled={running} className="h-8 text-[12px]" data-testid="ide-run">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Play className="w-3.5 h-3.5" strokeWidth={1.5} />}
          {t('ide.run')}
        </Button>
        {(nodeType || transformerSlug || contract === 'batch') && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={preview} disabled={previewing || !canPreview} data-testid="ide-preview"
              title={canPreview ? t('ide.previewHint') : t('ide.previewNoSamplesHint')}
              className="h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light text-text-on-light hover:border-primary disabled:opacity-40">
              {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <PlayCircle className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t('ide.preview')}
            </button>
            <InfoTip text={canPreview ? t('ide.previewHint') : t('ide.previewNoSamplesHint')} />
          </div>
        )}
        <button type="button" onClick={() => setShowAip((v) => !v)} data-testid="ide-aip-toggle"
          title={t('ide.aipHint')}
          className="h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light text-text-on-light hover:border-primary">
          <AudioLines className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('ide.generate')}
        </button>
        <div className="flex items-center gap-1">
          {/* #3 — Rede (só ícone) agrupada com Pacotes: rede é o que habilita
              instalar pacote + as chamadas do SDK. Menos em evidência. */}
          <button type="button" onClick={() => setAllowNetwork((v) => !v)} data-testid="ide-network"
            title={allowNetwork ? t('ide.networkOn') : t('ide.networkOff')}
            className={'h-8 w-8 flex items-center justify-center border border-border-light ' + (allowNetwork ? 'text-success' : 'text-muted-on-light')}>
            {allowNetwork ? <Wifi className="w-3.5 h-3.5" strokeWidth={1.5} /> : <WifiOff className="w-3.5 h-3.5" strokeWidth={1.5} />}
          </button>
          {/* Instalar pip agora abre um MODAL (input + logs + feedback), não um
              campo apertado na barra. */}
          <button type="button" onClick={() => { setPkgModalOpen(true); refreshPackages(); }} data-testid="ide-packages-open"
            title={t('ide.packagesHint')}
            className="h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light text-text-on-light hover:border-primary">
            <Package className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('ide.packages')}
          </button>
        </div>

        {/* Modal de pacotes Python — instalação + logs + feedback de pronto. */}
        <Dialog open={pkgModalOpen} onOpenChange={setPkgModalOpen}>
          <DialogContent className="max-w-lg flex flex-col p-0 gap-0 border border-border-light bg-canvas-light" data-testid="ide-packages-modal">
            <DialogHeader className="flex-none flex flex-row items-center gap-2 px-4 py-3 pr-10 border-b border-border-light">
              <Package className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-[12px] font-semibold text-text-on-light">{t('ide.packagesTitle')}</DialogTitle>
                <p className="text-[10px] text-muted-on-light leading-snug mt-0.5">{t('ide.packagesIntro')}</p>
              </div>
            </DialogHeader>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  value={pkg}
                  onChange={(e) => setPkg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void install(); }}
                  placeholder={t('ide.packagePlaceholder')}
                  className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light focus:border-primary outline-none"
                  data-testid="ide-pkg"
                />
                <Button onClick={install} disabled={installing || !pkg.trim()} className="h-8 text-[11px] shrink-0" data-testid="ide-install">
                  {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Package className="w-3.5 h-3.5" strokeWidth={1.5} />}
                  {t('ide.install')}
                </Button>
              </div>

              {/* Banner de status: pronto (verde) com a dica de Rede, ou erro. */}
              {installLog && installLog.status === 'success' && (
                <div className="px-3 py-2 border border-success/40 bg-success/5 text-[11px] text-text-on-light flex items-start gap-2" data-testid="ide-install-ok">
                  <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p>{t('ide.packageReady').replace('{pkg}', installLog.package_name)}</p>
                    <p className="text-[10px] text-muted-on-light mt-0.5">{t('ide.packageReadyNet')}</p>
                  </div>
                </div>
              )}
              {installLog && installLog.status !== 'success' && (
                <div className="px-3 py-2 border border-danger/40 bg-danger/5 text-[11px] text-danger flex items-start gap-2" data-testid="ide-install-err">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
                  <span className="flex-1 min-w-0">{t('ide.packageFailed').replace('{pkg}', installLog.package_name)}</span>
                </div>
              )}

              {/* Logs do pip (stdout/stderr) — só quando há saída. */}
              {installLog && (installLog.stdout || installLog.stderr) && (
                <div data-testid="ide-install-log">
                  <p className="text-[9px] uppercase tracking-widest text-muted-on-light mb-1">{t('ide.packagesLog')}</p>
                  <pre className="max-h-40 overflow-auto scrollbar-hide px-2 py-1.5 text-[10.5px] font-mono whitespace-pre-wrap break-words border border-border-light bg-white text-text-on-light">
                    {installLog.stdout}{installLog.stderr ? `\n${installLog.stderr}` : ''}
                  </pre>
                </div>
              )}

              {/* Pacotes já registrados (reinstalados no Run com a Rede ligada). */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-muted-on-light mb-1">{t('ide.packagesRegistered')}</p>
                {packages.length === 0 ? (
                  <p className="text-[10.5px] text-muted-on-light italic" data-testid="ide-packages-empty">{t('ide.packagesEmpty')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5" data-testid="ide-packages-list">
                    {packages.map((p) => (
                      <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-mono border border-border-light bg-white text-text-on-light">
                        <Check className="w-3 h-3 text-success" strokeWidth={1.5} />
                        {p.package_name}{p.package_version ? `==${p.package_version}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {terminalOk && (
          <button type="button" onClick={() => setShowTerminal((v) => !v)} data-testid="ide-terminal-toggle"
            title={t('ide.terminalHint')}
            className={'h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light ' + (showTerminal ? 'text-success' : 'text-text-on-light hover:border-primary')}>
            <TerminalSquare className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('ide.terminal')}
          </button>
        )}
        {nodeType && (
          <button type="button" onClick={() => setSchemaOpen((v) => !v)} data-testid="ide-schema-toggle"
            title={schemaOpen ? t('ide.schemaHide') : t('ide.schemaShow')}
            className={'h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light ' + (schemaOpen ? 'text-primary' : 'text-text-on-light hover:border-primary')}>
            {schemaOpen ? <PanelLeftClose className="w-3.5 h-3.5" strokeWidth={1.5} /> : <PanelLeftOpen className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {t('ide.inputShort')}
          </button>
        )}
        {/* F5 — toggle do painel de Testes governados. Só relevante quando há uma
            Function salva (transformerSlug); sem slug, fica desabilitado com hint. */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setShowTests((v) => !v)} disabled={!transformerSlug} data-testid="ide-tests-toggle"
            title={transformerSlug ? t('ide.testsHint') : t('ide.testsNoFunction')}
            className={'h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light disabled:opacity-40 ' + (showTests ? 'text-primary' : 'text-text-on-light hover:border-primary')}>
            <FlaskRound className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('ide.tests')}
          </button>
          <InfoTip text={transformerSlug ? t('ide.testsHint') : t('ide.testsNoFunction')} />
        </div>
        {loadingSource && (
          <span className="flex items-center gap-1 text-[10px] text-muted-on-light ml-auto" data-testid="ide-loading-source">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> {t('ide.loadingSource')}
          </span>
        )}
      </div>

      {/* Composer "Gerar com AIP" — superfície de COMANDO do AIP (não um form
          genérico): faixa de acento azul-aço à esquerda marca a superfície ativa;
          ícone em chip + título + intenção; tipo com hint contextual; instrução
          multilinha; rodapé com atalho mono + CTA. */}
      {showAip && (
        <div className="border-b border-l-2 border-border-light border-l-primary bg-canvas-light" data-testid="ide-aip-pane">
          <div className="flex items-start gap-2.5 px-4 pt-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-on-light">
                  {t('ide.generate')}
                </span>
                <button type="button" onClick={() => setShowAip(false)} title={t('ide.aipClose')}
                  className="text-muted-on-light hover:text-text-on-light" data-testid="ide-aip-close">
                  <XIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
              <p className="text-[10.5px] text-muted-on-light leading-snug mt-0.5">
                {t('ide.aipHint')}
              </p>
            </div>
          </div>

          <div className="px-4 pb-3 pt-2.5 space-y-2">
            {/* #6 — linha de tipo mais leve: sem o label "TIPO" redundante; o
                hint vai discreto numa linha abaixo (não compete com os botões). */}
            <div>
              <div className="inline-flex border border-border-light divide-x divide-border-light" role="group" aria-label={t('ide.aipKindLabel')} data-testid="ide-aip-kind">
                {(['transform', 'script'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                    className={'h-7 px-3 text-[11px] ' + (kind === k ? 'bg-primary text-white' : 'bg-white text-text-on-light hover:bg-panel-light')}
                    data-testid={`ide-aip-kind-${k}`}>
                    {k === 'transform' ? t('ide.aipKindTransform') : t('ide.aipKindScript')}
                  </button>
                ))}
              </div>
              <p className="text-[9.5px] text-muted-on-light/80 leading-snug mt-1">
                {kind === 'transform' ? t('ide.aipKindTransformHint') : t('ide.aipKindScriptHint')}
              </p>
            </div>

            <textarea value={objective} onChange={(e) => setObjective(e.target.value)}
              placeholder={t('ide.aipObjectivePlaceholder')} rows={3}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void generate(); }}
              className="w-full px-2.5 py-2 text-[12px] leading-relaxed bg-white border border-border-light focus:border-primary outline-none resize-y scrollbar-hide"
              data-testid="ide-aip-objective" />

            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono text-muted-on-light">{t('ide.aipShortcut')}</span>
              <Button onClick={generate} disabled={generating || !objective.trim()} className="h-8 text-[11px] shrink-0" data-testid="ide-aip-generate">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <AudioLines className="w-3.5 h-3.5" strokeWidth={1.5} />} {t('ide.aipGenerate')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {genErr && <div className="px-4 py-2 text-[11px] font-mono text-danger bg-danger/5 border-b border-border-light" data-testid="ide-aip-error">{genErr}</div>}

      {/* Editor (+ esquema de entrada lateral, F1) */}
      <div className="flex-1 min-h-0 flex">
        {nodeType && schemaOpen && (
          <aside
            data-testid="ide-input-schema"
            className="w-56 flex-none border-r border-border-light bg-canvas-light flex flex-col min-h-0"
          >
            {/* Abas do sidebar contextual — entrada (F1) · saída (F4) · amostras (F2).
                Espaço-eficiente: a IDE vive num Dialog. */}
            <div className="flex-none flex border-b border-border-light" role="tablist" data-testid="ide-sidebar-tabs">
              {([
                { id: 'input' as const, label: t('ide.inputSchema'), icon: Database, testid: 'ide-tab-input' },
                { id: 'output' as const, label: t('ide.outputSchema'), icon: ArrowRightLeft, testid: 'ide-tab-output' },
                { id: 'samples' as const, label: t('ide.samples'), icon: Boxes, testid: 'ide-tab-samples' },
              ]).map((tab) => {
                const Icon = tab.icon;
                const active = sidebarTab === tab.id;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    data-testid={tab.testid}
                    onClick={() => setSidebarTab(tab.id)}
                    title={tab.label}
                    className={'flex-1 min-w-0 flex items-center justify-center gap-1 px-1.5 py-2 text-[9px] uppercase tracking-wider border-r border-border-light last:border-r-0 ' + (active ? 'text-primary bg-white border-b border-b-primary' : 'text-muted-on-light hover:text-text-on-light')}
                  >
                    <Icon className="w-3 h-3 flex-none" strokeWidth={1.5} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Aba 1 — esquema de entrada (F1). Todas as abas ficam montadas
                (toggle por `hidden`) — testids sempre no DOM, retrocompat. */}
            <div className={'flex-1 min-h-0 flex flex-col' + (sidebarTab === 'input' ? '' : ' hidden')}>
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light text-[10px] uppercase tracking-wider text-muted-on-light">
                  <Database className="w-3 h-3" strokeWidth={1.5} />
                  <span className="flex-1 truncate" title={nodeType}>{t('ide.inputSchema')}</span>
                  <InfoTip text={t('ide.inputSchemaHint')} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto scrollbar-hide px-2 py-2 space-y-1">
                  {loadingSchema && (
                    <p className="text-[10px] text-muted-on-light italic px-1" data-testid="ide-schema-loading">{t('ide.schemaLoading')}</p>
                  )}
                  {!loadingSchema && displaySchemaProps.length === 0 && (
                    <p className="text-[10px] text-muted-on-light italic px-1" data-testid="ide-schema-empty">{t('ide.schemaEmpty')}</p>
                  )}
                  {!loadingSchema && displaySchemaProps.map((p) => {
                    const isTitle = p.is_title || (!!schema?.titleProperty && p.key === schema.titleProperty);
                    const isOutput = !!outputProperty && p.key === outputProperty;
                    const FieldIcon = schemaFieldIcon(p.type);
                    return (
                      <div
                        key={p.key}
                        data-testid={`ide-schema-prop-${p.key}`}
                        className={'flex items-center gap-1.5 px-1.5 py-1 border ' + (isOutput ? 'border-primary/40 bg-primary/5' : 'border-transparent')}
                      >
                        <FieldIcon className="w-3 h-3 flex-none text-muted-on-light" strokeWidth={1.5} aria-label={p.type} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10.5px] font-mono text-text-on-light truncate" title={p.label || p.key}>{p.key}</p>
                          <p className="text-[9px] font-mono text-muted-on-light truncate">{p.type}{p.proposed ? ` ${t('schemaForm.proposedSuffix')}` : ''}</p>
                        </div>
                        {isTitle && (
                          <KeyRound
                            className="w-3 h-3 flex-none text-warning"
                            strokeWidth={1.5}
                            aria-label={t('ide.schemaTitleProperty')}
                            data-testid={`ide-schema-prop-${p.key}-title`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
            </div>

            {/* Aba 2 — esquema de saída + diff vs entrada (F4) */}
            <div className={'flex-1 min-h-0 flex flex-col' + (sidebarTab === 'output' ? '' : ' hidden')} data-testid="ide-output-schema">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light text-[10px] uppercase tracking-wider text-muted-on-light">
                  <ArrowRightLeft className="w-3 h-3" strokeWidth={1.5} />
                  <span className="flex-1 truncate">{t('ide.outputSchema')}</span>
                  <InfoTip text={t('ide.outputSchemaHint')} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto scrollbar-hide px-2 py-2 space-y-1">
                  {!outputSchema && (
                    <p className="text-[10px] text-muted-on-light italic px-1" data-testid="ide-output-schema-empty">{t('ide.outputSchemaEmpty')}</p>
                  )}
                  {outputSchema && schemaDiff.map((row) => {
                    const tone =
                      row.status === 'added' ? 'text-success' :
                      row.status === 'changed' ? 'text-warning' :
                      row.status === 'removed' ? 'text-danger line-through' : 'text-muted-on-light';
                    const diffKey =
                      row.status === 'added' ? 'ide.diffAdded' :
                      row.status === 'changed' ? 'ide.diffChanged' :
                      row.status === 'removed' ? 'ide.diffRemoved' : 'ide.diffUnchanged';
                    return (
                      <div
                        key={row.key}
                        data-testid={`ide-output-schema-prop-${row.key}`}
                        className="flex items-center gap-1.5 px-1.5 py-1 border border-transparent"
                      >
                        <Columns3 className={'w-3 h-3 flex-none ' + (row.status === 'removed' ? 'text-danger' : 'text-muted-on-light')} strokeWidth={1.5} />
                        <div className="min-w-0 flex-1">
                          <p className={'text-[10.5px] font-mono truncate ' + (row.status === 'removed' ? 'text-danger line-through' : 'text-text-on-light')} title={row.key}>{row.key}</p>
                          <p className="text-[9px] font-mono text-muted-on-light truncate">{row.type}</p>
                        </div>
                        <span className={'flex-none text-[8px] uppercase tracking-wider ' + tone}>{t(diffKey)}</span>
                      </div>
                    );
                  })}
                </div>
            </div>

            {/* Aba 3 — amostras reais da ingestão (F2) */}
            <div
              data-testid="ide-samples"
              className={'flex-1 min-h-0 flex flex-col' + (sidebarTab === 'samples' ? '' : ' hidden')}
            >
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light text-[10px] uppercase tracking-wider text-muted-on-light">
                  <Boxes className="w-3 h-3" strokeWidth={1.5} />
                  <span className="flex-1 truncate">{t('ide.samples')}</span>
                  <InfoTip text={t('ide.samplesHint')} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto scrollbar-hide px-2 py-2 space-y-1">
                  {loadingSamples && (
                    <p className="text-[10px] text-muted-on-light italic px-1" data-testid="ide-samples-loading">{t('ide.samplesLoading')}</p>
                  )}
                  {!loadingSamples && samples.length === 0 && (
                    <p className="text-[10px] text-muted-on-light italic px-1" data-testid="ide-samples-empty">{t('ide.samplesEmpty')}</p>
                  )}
                  {!loadingSamples && samples.map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      data-testid={`ide-sample-${node.id}`}
                      onClick={() => setInput(node.properties || {})}
                      title={node.name || t('ide.sampleUnnamed')}
                      className="w-full flex items-center gap-1.5 px-1.5 py-1 border border-transparent hover:border-primary/40 hover:bg-primary/5 text-left"
                    >
                      <Boxes className="w-3 h-3 flex-none text-muted-on-light" strokeWidth={1.5} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] text-text-on-light truncate">{node.name || t('ide.sampleUnnamed')}</p>
                        <p className="text-[9px] font-mono text-muted-on-light truncate">{node.id.slice(0, 8)}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex-none border-t border-border-light px-2 py-1.5 space-y-1">
                  <button
                    type="button"
                    onClick={synthesizeSample}
                    data-testid="ide-synthesize-sample"
                    title={t('ide.synthesizeSampleHint')}
                    className="w-full h-7 flex items-center justify-center gap-1.5 text-[10px] border border-border-light text-text-on-light hover:border-primary"
                  >
                    <FlaskConical className="w-3 h-3" strokeWidth={1.5} /> {t('ide.synthesizeSample')}
                  </button>
                  {synthMsg && (
                    <p
                      data-testid="ide-synthesize-feedback"
                      className={
                        'flex items-center gap-1 text-[9.5px] leading-snug ' +
                        (synthMsg.ok ? 'text-success' : 'text-warning')
                      }
                    >
                      {synthMsg.ok ? (
                        <Check className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                      ) : (
                        <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                      )}
                      <span>{synthMsg.text}</span>
                    </p>
                  )}
                </div>
            </div>
          </aside>
        )}
      {/* min-w-0: deixa o editor ENCOLHER no flex — sem isso, abrir o painel de
          esquema empurrava a largura além do modal ("estourado"). */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {gen ? (
          /* #1 — "Gerar com AIP": o diff aparece DENTRO do próprio editor (sobre o
             código existente), NUNCA num segundo container. Barra fina de ação no
             topo do mesmo painel; "Inserir" aplica via applyGen(), "Descartar"
             volta ao editor normal. */
          <div className="flex-1 min-h-0 flex flex-col" data-testid="ide-aip-result">
            <div className="flex-none flex items-center justify-between px-3 py-1.5 border-b border-border-light bg-canvas-light">
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-on-light">
                <AudioLines className="w-3 h-3" strokeWidth={1.5} /> {t('ide.aipResultTitle')} · {gen.entrypoint}()
                {/* atribuição NEUTRA — nunca o nome do modelo proprietário na UI */}
                {gen.loadcheck.ran && (
                  <span className="inline-flex items-center gap-1 normal-case text-success">
                    <Check className="w-3 h-3" strokeWidth={1.5} /> {t('ide.aipValidated')}
                  </span>
                )}
                {/* Soberania do modelo (P4): jurisdição/país — NUNCA o nome do
                    modelo de terceiro. Ícone neutro. */}
                {gen.model_default && (gen.model_default.country || (gen.model_default.jurisdictions || []).length > 0) && (
                  <span
                    data-testid="ide-aip-sovereignty"
                    title={t('ide.aipSovereigntyTip')}
                    className="inline-flex items-center gap-1 normal-case text-muted-on-light"
                  >
                    <Globe className="w-3 h-3" strokeWidth={1.5} />
                    {gen.model_default.country || (gen.model_default.jurisdictions || []).join(', ')}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={applyGen} data-testid="ide-aip-apply" className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase text-success border border-border-light hover:bg-panel-light">
                  <Check className="w-3 h-3" strokeWidth={1.5} /> {t('ide.insert')}
                </button>
                <button type="button" onClick={() => setGen(null)} data-testid="ide-aip-discard" className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase text-muted-on-light border border-border-light hover:bg-panel-light">
                  <XIcon className="w-3 h-3" strokeWidth={1.5} /> {t('ide.discard')}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0" data-testid="ide-aip-diff">
              <DiffEditor
                height="100%" language="python" theme="light"
                original={code} modified={mergeGeneratedIntoHeader(code, gen.code)}
                options={{
                  readOnly: true,
                  renderSideBySide: false,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  renderOverviewRuler: false,
                }}
              />
            </div>
          </div>
        ) : (
          <Editor
            height="100%" defaultLanguage="python" theme="light" value={code}
            onChange={(v) => setCode(v || '')}
            options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false }}
            onMount={(editor, monaco) => {
              const g = monaco as unknown as { __aegisSdkProvider?: boolean };
              if (!g.__aegisSdkProvider) {
                g.__aegisSdkProvider = true;
                monaco.languages.registerCompletionItemProvider('python', {
                  provideCompletionItems: (model: { getWordUntilPosition: (p: unknown) => { startColumn: number; endColumn: number } }, position: { lineNumber: number }) => {
                    const w = model.getWordUntilPosition(position);
                    const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
                    return { suggestions: sdkSymbolsRef.current.map((s) => ({ label: s.label, kind: monaco.languages.CompletionItemKind.Function, insertText: s.insertText, detail: s.detail, range })) };
                  },
                });
              }
              editor.addAction({ id: 'aegis-run', label: 'Run', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => void run() });
            }}
          />
        )}
      </div>
      {/* Painel de input (input.json) — F2. Contextual ao nó (per-object) OU ao
          contrato batch (rows do nó de código). */}
      {(nodeType || contract === 'batch') && (
        <aside
          data-testid="ide-input-panel"
          className="w-72 flex-none border-l border-border-light bg-canvas-light flex flex-col min-h-0"
        >
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border-light text-[10px] uppercase tracking-wider text-muted-on-light">
            <FileInput className="w-3 h-3" strokeWidth={1.5} />
            <span className="flex-1 truncate">{t('ide.inputData')}</span>
            <InfoTip text={t('ide.inputDataHint')} />
          </div>
          {/* #2 — input.json com syntax-highlight (era textarea preta crua). */}
          <JsonField value={inputText} onChange={onInputTextChange} testid="ide-input-data" />
        </aside>
      )}
      </div>
      {showTerminal && terminalOk && (
        <div className="border-t border-border-light h-56 min-h-0" data-testid="ide-terminal">
          <SandboxTerminal />
        </div>
      )}
      {/* F5/F6 — painel de Testes governados. Só aparece com transformerSlug
          (Function salva) e quando o operador abre via toggle. Fecha o loop
          schema → amostra → fixture → eval, tudo via backend (zero localStorage). */}
      {showTests && transformerSlug && (
        <div className="border-t border-border-light bg-white max-h-72 overflow-auto scrollbar-hide" data-testid="ide-tests-panel">
          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-canvas-light border-b border-border-light flex-wrap">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-on-light">
              <FlaskRound className="w-3 h-3" strokeWidth={1.5} /> {t('ide.tests')}
            </span>
            <button type="button" onClick={() => setShowTestForm((v) => !v)} data-testid="ide-test-save-toggle"
              title={t('ide.saveAsTestHint')}
              className="h-7 px-2 flex items-center gap-1 text-[10px] uppercase tracking-wider border border-border-light text-text-on-light hover:border-primary">
              <Plus className="w-3 h-3" strokeWidth={1.5} /> {t('ide.saveAsTest')}
            </button>
            <button type="button" onClick={runAllTests} disabled={runningAll || tests.length === 0} data-testid="ide-test-run-all"
              className="h-7 px-2 flex items-center gap-1 text-[10px] uppercase tracking-wider border border-border-light text-text-on-light hover:border-primary disabled:opacity-40">
              {runningAll ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <PlayCircle className="w-3 h-3" strokeWidth={1.5} />} {t('ide.testRunAll')}
            </button>
            <button type="button" onClick={toggleHistory} data-testid="ide-test-history-toggle"
              title={t('ide.testHistoryHint')}
              className={'h-7 px-2 flex items-center gap-1 text-[10px] uppercase tracking-wider border border-border-light disabled:opacity-40 ' + (showHistory ? 'text-primary' : 'text-text-on-light hover:border-primary')}>
              <History className="w-3 h-3" strokeWidth={1.5} /> {t('ide.testHistory')}
            </button>
            {runAllSummary && (
              <span data-testid="ide-test-summary" className="ml-auto flex items-center gap-2 text-[10px] font-mono">
                <span className="text-success">{runAllSummary.passed} {t('ide.testSummary')}</span>
                <span className="text-danger">{runAllSummary.failed} {t('ide.testSummaryFailed')}</span>
              </span>
            )}
          </div>

          {/* Erro do painel de testes (antes os catch eram silenciosos). */}
          {testErr && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 border-b border-border-light flex items-start gap-1.5" data-testid="ide-test-error">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
              <span className="flex-1 min-w-0 break-words">{testErr}</span>
            </div>
          )}

          {/* F5/F6 — form de "Salvar como teste" (rótulo + expected_contains + builder de asserções) */}
          {showTestForm && (
            <div className="px-3 py-2 border-b border-border-light bg-canvas-light space-y-2" data-testid="ide-test-form">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[10px] uppercase tracking-wider text-muted-on-light w-full sm:w-auto">{t('ide.testName')}</label>
                <input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder={t('ide.testNamePlaceholder')}
                  data-testid="ide-test-name"
                  className="flex-1 min-w-[160px] h-8 px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[10px] uppercase tracking-wider text-muted-on-light w-full sm:w-auto">{t('ide.testExpectedContains')}</label>
                <input value={testExpected} onChange={(e) => setTestExpected(e.target.value)} placeholder={t('ide.testExpectedContainsPlaceholder')}
                  data-testid="ide-test-expected"
                  className="flex-1 min-w-[160px] h-8 px-2 text-[11px] bg-white border border-border-light focus:border-primary outline-none" />
              </div>

              {/* F6 — builder de asserções por campo */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('ide.assertions')}</span>
                  <InfoTip text={t('ide.assertionsHint')} />
                  <button type="button" onClick={() => setAssertions((prev) => [...prev, { field: '', op: 'eq', value: '' }])}
                    data-testid="ide-assertion-add"
                    className="ml-auto h-6 px-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider border border-border-light text-text-on-light hover:border-primary">
                    <Plus className="w-3 h-3" strokeWidth={1.5} /> {t('ide.assertionAdd')}
                  </button>
                </div>
                {assertions.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 flex-wrap" data-testid={`ide-assertion-row-${i}`}>
                    {assertionFieldOptions.length > 0 ? (
                      <select value={a.field} data-testid={`ide-assertion-field-${i}`}
                        onChange={(e) => setAssertions((prev) => prev.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                        className="h-7 px-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary min-w-[110px]">
                        <option value="">{t('ide.assertionFieldSelect')}</option>
                        {assertionFieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    ) : (
                      <input value={a.field} data-testid={`ide-assertion-field-${i}`} placeholder={t('ide.assertionField')}
                        onChange={(e) => setAssertions((prev) => prev.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                        className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary min-w-[110px]" />
                    )}
                    <select value={a.op} data-testid={`ide-assertion-op-${i}`}
                      onChange={(e) => setAssertions((prev) => prev.map((x, j) => (j === i ? { ...x, op: e.target.value as FunctionTestAssertion['op'] } : x)))}
                      className="h-7 px-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary">
                      {ASSERTION_OPS.map((op) => <option key={op} value={op}>{t(`ide.assertionOp.${op}`)}</option>)}
                    </select>
                    {a.op === 'exists' ? (
                      <span className="text-[10px] text-muted-on-light italic px-1">—</span>
                    ) : a.op === 'type' ? (
                      <select value={a.value} data-testid={`ide-assertion-value-${i}`}
                        onChange={(e) => setAssertions((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                        className="h-7 px-1 text-[11px] bg-white border border-border-light outline-none focus:border-primary min-w-[100px]">
                        {ASSERTION_TYPES.map((ty) => <option key={ty} value={ty}>{t(`ide.assertionType.${ty}`)}</option>)}
                      </select>
                    ) : (
                      <input value={a.value} data-testid={`ide-assertion-value-${i}`} placeholder={t('ide.assertionValue')}
                        onChange={(e) => setAssertions((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                        className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary min-w-[100px] flex-1" />
                    )}
                    <button type="button" onClick={() => setAssertions((prev) => prev.filter((_, j) => j !== i))}
                      data-testid={`ide-assertion-remove-${i}`} title={t('ide.assertionRemove')}
                      className="h-7 px-1.5 flex items-center text-muted-on-light hover:text-danger border border-border-light">
                      <MinusCircle className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <Button onClick={saveAsTest} disabled={savingTest || !testName.trim()} className="h-8 text-[11px]" data-testid="ide-test-save">
                  {savingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Check className="w-3.5 h-3.5" strokeWidth={1.5} />} {t('ide.testSave')}
                </Button>
                <button type="button" onClick={() => { setShowTestForm(false); setTestName(''); setTestExpected(''); setAssertions([]); }}
                  data-testid="ide-test-cancel"
                  className="h-8 px-2 flex items-center gap-1 text-[11px] border border-border-light text-muted-on-light hover:border-primary">
                  <XIcon className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('ide.testCancel')}
                </button>
              </div>
            </div>
          )}

          {/* F5 — lista de testes (rótulo + last_status + Rodar) */}
          <div className="divide-y divide-border-light" data-testid="ide-tests-list">
            {loadingTests && (
              <p className="px-3 py-2 text-[10px] text-muted-on-light italic" data-testid="ide-tests-loading">{t('ide.testsLoading')}</p>
            )}
            {!loadingTests && tests.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-muted-on-light italic" data-testid="ide-tests-empty">{t('ide.testsEmpty')}</p>
            )}
            {!loadingTests && tests.map((tt) => {
              const status = tt.last_status || 'never_run';
              return (
                <div key={tt.id} className="flex items-center gap-2 px-3 py-1.5" data-testid={`ide-test-${tt.id}`}>
                  {status === 'pass' ? (
                    <Check className="w-3.5 h-3.5 flex-none text-success" strokeWidth={1.5} aria-label={t('ide.testStatusPass')} data-testid={`ide-test-${tt.id}-pass`} />
                  ) : status === 'fail' ? (
                    <XIcon className="w-3.5 h-3.5 flex-none text-danger" strokeWidth={1.5} aria-label={t('ide.testStatusFail')} data-testid={`ide-test-${tt.id}-fail`} />
                  ) : (
                    <MinusCircle className="w-3.5 h-3.5 flex-none text-muted-on-light" strokeWidth={1.5} aria-label={t('ide.testStatusNeverRun')} data-testid={`ide-test-${tt.id}-never_run`} />
                  )}
                  <span className="flex-1 min-w-0 text-[11.5px] text-text-on-light truncate" title={tt.name}>{tt.name}</span>
                  <span className={'text-[9px] uppercase tracking-wider ' + (status === 'pass' ? 'text-success' : status === 'fail' ? 'text-danger' : 'text-muted-on-light')}>
                    {status === 'pass' ? t('ide.testStatusPass') : status === 'fail' ? t('ide.testStatusFail') : t('ide.testStatusNeverRun')}
                  </span>
                  <button type="button" onClick={() => runOneTest(tt.id)} disabled={runningTestId === tt.id}
                    data-testid={`ide-test-run-${tt.id}`} title={t('ide.testRun')}
                    className="h-7 px-2 flex items-center gap-1 text-[10px] uppercase tracking-wider border border-border-light text-text-on-light hover:border-primary disabled:opacity-40">
                    {runningTestId === tt.id ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <Play className="w-3 h-3" strokeWidth={1.5} />} {t('ide.testRun')}
                  </button>
                </div>
              );
            })}
          </div>

          {/* F6 — histórico de execuções (verdict · ator · horário) */}
          {showHistory && (
            <div className="border-t border-border-light" data-testid="ide-test-history">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-canvas-light border-b border-border-light text-[10px] uppercase tracking-wider text-muted-on-light">
                <History className="w-3 h-3" strokeWidth={1.5} />
                <span className="flex-1">{t('ide.testHistory')}</span>
                <InfoTip text={t('ide.testHistoryHint')} />
              </div>
              <div className="divide-y divide-border-light">
                {loadingHistory && (
                  <p className="px-3 py-2 text-[10px] text-muted-on-light italic" data-testid="ide-test-history-loading">{t('ide.testsLoading')}</p>
                )}
                {!loadingHistory && testRuns.length === 0 && (
                  <p className="px-3 py-2 text-[10px] text-muted-on-light italic" data-testid="ide-test-history-empty">{t('ide.testHistoryEmpty')}</p>
                )}
                {!loadingHistory && testRuns.map((rn, i) => {
                  const passed = rn.verdict === 'pass';
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5" data-testid={`ide-test-run-${i}`}>
                      {passed
                        ? <Check className="w-3 h-3 flex-none text-success" strokeWidth={1.5} />
                        : <XIcon className="w-3 h-3 flex-none text-danger" strokeWidth={1.5} />}
                      <span className="flex-1 min-w-0 text-[11px] text-text-on-light truncate" title={rn.test_name}>{rn.test_name}</span>
                      <span className={'text-[9px] uppercase tracking-wider ' + (passed ? 'text-success' : 'text-danger')}>{rn.verdict}</span>
                      <span className="text-[10px] font-mono text-muted-on-light truncate max-w-[120px]" title={rn.actor}>{rn.actor}</span>
                      <span className="text-[10px] font-mono text-muted-on-light">{new Date(rn.at).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Painel de Prévia (F3) — saída FIEL por objeto + agregados + tempo, e
          (F4) o aviso de contrato de saída. Distinto do console de execução. */}
      {(previewMode || previewing || previewErr) && (
        <div className="border-t border-border-light bg-white max-h-56 overflow-auto scrollbar-hide" data-testid="ide-preview-panel">
          <div className="sticky top-0 flex items-center gap-2 px-3 py-1.5 bg-canvas-light border-b border-border-light flex-wrap">
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-on-light">
              <PlayCircle className="w-3 h-3" strokeWidth={1.5} /> {t('ide.preview.title')}
            </span>
            {previewMode && (
              <span
                data-testid="ide-preview-mode"
                className={'px-1.5 py-0.5 text-[9px] uppercase tracking-wider border ' + (previewMode === 'faithful' ? 'border-primary/40 text-primary bg-primary/5' : 'border-border-light text-muted-on-light')}
              >
                {previewMode === 'faithful' ? t('ide.previewModeFaithful') : t('ide.previewModeDraft')}
              </span>
            )}
            {previewing && (
              <span className="flex items-center gap-1 text-[10px] text-muted-on-light">
                <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> {t('ide.previewRunning')}
              </span>
            )}
            {previewBatch && (
              <span data-testid="ide-preview-aggregates" className="ml-auto flex items-center gap-2 text-[10px] font-mono text-muted-on-light">
                <span className="text-text-on-light">{previewBatch.rows_in} {t('ide.previewRowsIn')}</span>
                <ArrowRightLeft className="w-3 h-3" strokeWidth={1.5} />
                <span className="text-text-on-light">{previewBatch.rows_out} {t('ide.previewRowsOut')}</span>
                <span>· {t('ide.previewTotalMs')} {previewBatch.total_ms}ms</span>
                <span>· {t('ide.previewAvgMs')} {previewBatch.avg_ms}ms</span>
              </span>
            )}
          </div>

          {/* F4 — aviso de contrato de saída (não-bloqueante; strict avisa que bloquearia) */}
          {previewBatch && previewBatch.declared_output != null && previewBatch.output_violations.length > 0 && (
            <div className="px-3 py-2 border-b border-border-light bg-warning/5" data-testid="ide-output-violations">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning">
                <AlertTriangle className="w-3 h-3" strokeWidth={1.5} /> {t('ide.violations')}
              </p>
              <p className="mt-1 text-[10px] text-muted-on-light">{t('ide.violationsHint')}</p>
              <ul className="mt-1 space-y-0.5">
                {previewBatch.output_violations.map((v, i) => (
                  <li key={i} className="text-[10.5px] font-mono text-text-on-light">· {v}</li>
                ))}
              </ul>
              {previewBatch.strict_output && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-danger" data-testid="ide-output-violations-strict">
                  <ShieldAlert className="w-3 h-3 flex-none" strokeWidth={1.5} /> {t('ide.violationsStrict')}
                </p>
              )}
            </div>
          )}

          {previewErr && (
            <div className="px-3 py-2 text-[11px] font-mono text-danger" data-testid="ide-preview-error">{previewErr}</div>
          )}

          {/* F3 — saída fiel por objeto (modo Function salva) */}
          {previewBatch && (
            <div className="divide-y divide-border-light">
              {previewBatch.per_object.map((item, i) => (
                <div key={i} className="px-3 py-2" data-testid={`ide-preview-object-${i}`}>
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-on-light">
                    <span>{t('ide.previewObject')} {i + 1}</span>
                    <span className={item.ok ? 'text-success' : 'text-danger'}>{item.ok ? t('ide.previewOk') : t('ide.previewError')}</span>
                    {item.duration_ms != null && <span className="font-mono">· {item.duration_ms}ms</span>}
                  </div>
                  {item.error
                    ? <pre className="mt-1 text-[11px] font-mono text-danger whitespace-pre-wrap">{item.error}</pre>
                    : <pre className="mt-1 text-[11px] font-mono text-text-on-light whitespace-pre-wrap">{JSON.stringify(item.output, null, 2)}</pre>}
                </div>
              ))}
            </div>
          )}

          {/* F3 — saída do rascunho (single, código solto via Sandbox.execute) */}
          {previewDraft && (
            <div className="px-3 py-2" data-testid="ide-preview-draft">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-on-light">
                <span>{statusLabel(previewDraft.status)}</span>
                {previewDraft.exit_code != null && <span>· {t('ide.exit')} {previewDraft.exit_code}</span>}
                {previewDraft.duration_ms != null && <span className="font-mono">· {previewDraft.duration_ms}ms</span>}
              </div>
              <pre className="mt-1 text-[11px] font-mono text-text-on-light whitespace-pre-wrap">{previewDraft.stdout}{previewDraft.stderr ? `\n${previewDraft.stderr}` : ''}</pre>
            </div>
          )}
        </div>
      )}
      {result && (
        <div className="border-t border-border-light bg-white max-h-48 overflow-auto scrollbar-hide" data-testid="ide-console">
          {/* #2 — Console DECORADO: exit 0 verde / !=0 vermelho; stdout neutro;
              stderr vermelho com fundo. Antes era texto cru sem distinção. */}
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-on-light border-b border-border-light flex items-center gap-1.5">
            <span>{t('ide.console')}</span>
            <span className="text-muted-on-light">· {statusLabel(result.status)}</span>
            {result.exit_code != null && (
              <span
                data-testid="ide-console-exit"
                className={
                  'font-mono ' + (result.exit_code === 0 ? 'text-success' : 'text-danger')
                }
              >
                · {t('ide.exit')} {result.exit_code}
              </span>
            )}
            {result.duration_ms != null && (
              <span className="font-mono text-muted-on-light">· {result.duration_ms}ms</span>
            )}
          </div>
          {/* compara com '' (não truthiness): saída só-whitespace AINDA é saída. */}
          {(result.stdout ?? '') !== '' && (
            <pre
              data-testid="ide-console-stdout"
              className="px-3 py-2 text-[11px] font-mono text-text-on-light whitespace-pre-wrap"
            >
              {result.stdout}
            </pre>
          )}
          {(result.stderr ?? '') !== '' && (
            <pre
              data-testid="ide-console-stderr"
              className="px-3 py-2 text-[11px] font-mono text-danger bg-danger/5 whitespace-pre-wrap border-t border-danger/20"
            >
              {result.stderr}
            </pre>
          )}
          {(result.stdout ?? '') === '' && (result.stderr ?? '') === '' && (
            // sem saída: distingue SUCESSO silencioso (verde) de falha sem mensagem.
            <p
              data-testid="ide-console-empty"
              className={
                'px-3 py-2 text-[10px] italic ' +
                (result.exit_code === 0 ? 'text-success' : 'text-muted-on-light')
              }
            >
              {result.exit_code === 0 ? t('ide.consoleSuccess') : t('ide.consoleEmpty')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
