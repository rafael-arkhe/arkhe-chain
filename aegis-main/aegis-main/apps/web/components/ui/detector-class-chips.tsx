'use client';

/**
 * DetectorClassChips — CHIPS multi-select das classes do detector ativo
 * (Tarefa A, 2026-06-11).
 *
 * Pedido literal do operador: "operador jamais vai saber essas classes de
 * cabeça — precisa ter manual + todos os tipos válidos disponíveis para ir
 * adicionando, senão a carga cognitiva fica muito alta."
 *
 * Comportamento:
 *   - carrega TODAS as classes válidas via Cctv.detector.classes()
 *     (GET /cctv/detector/classes — COCO-80 do RF-DETR, como DADO);
 *   - TAXONOMIA OPERACIONAL (2026-06-11): o dropdown agrupa por categoria com
 *     cabeçalhos (ordem do backend); grupos `advanced` (interiores/alimentos/
 *     pelúcia) ficam COLAPSADOS sob "Outros (uso avançado)" — régua de marca:
 *     conteúdo doméstico/infantil nunca em primeiro plano. A BUSCA varre TUDO
 *     (buscar 'urso' acha o urso de pelúcia, colapsado ou não). Resposta
 *     antiga sem `categories` → lista plana (aditivo de verdade);
 *   - busca/autocomplete sobre o catálogo (label humano pt-BR/en-US via
 *     skillClasses.* com fallback pro label do backend; diacrítico-insensível
 *     — 'cami' acha 'Caminhão');
 *   - clique/Enter adiciona chip; X remove; chips mostram o LABEL humano;
 *   - VALOR submetido = CSV de names canônicos ('car,truck') — o contrato do
 *     handler GPU (input.classes) fica intacto;
 *   - entrada CUSTOM permitida como complemento (modelos fine-tuned): vira
 *     chip com o valor cru + aviso discreto;
 *   - vazio = todas as classes (hint já vive na descrição do param);
 *   - backend fora → fallback HONESTO: hint + entrada manual continua fluindo.
 *
 * Estética: sharp (zero rounded-*), sem emoji, strings via useT().
 */
import * as React from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { detectorCategoryLabel, detectorClassLabel } from '@/lib/i18n/class-labels';
import { Cctv, type DetectorCategory, type DetectorClass } from '@/lib/api/cctv';

/** Normalização p/ busca: minúsculas + sem diacríticos ('Caminhão' → 'caminhao'). */
function norm(s: string): string {
  return s
    .normalize('NFD') // separa diacríticos (faixa ̀-ͯ abaixo)
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** CSV canônico → lista de names (trim, sem vazios, sem duplicados, ordem preservada). */
function parseCsv(value: string): string[] {
  const out: string[] = [];
  for (const part of (value || '').split(',')) {
    const p = part.trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export function DetectorClassChips({
  value,
  onChange,
  testid,
}: {
  /** CSV canônico atual ('car,truck'); '' = todas as classes. */
  value: string;
  /** Emite o NOVO CSV canônico a cada add/remove. */
  onChange: (csv: string) => void;
  testid?: string;
}) {
  const t = useT();
  const [options, setOptions] = React.useState<DetectorClass[] | null>(null);
  const [categories, setCategories] = React.useState<DetectorCategory[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  // Grupos advanced (interiores/alimentos/pelúcia) colapsados por padrão —
  // a navegação default nunca mostra esse conteúdo em primeiro plano.
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [hoverIdx, setHoverIdx] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    Cctv.detector
      .classes()
      .then((res) => {
        if (!cancelled) {
          setOptions(res.classes || []);
          // ADITIVO: backend antigo sem categories → lista plana (sem grupos).
          setCategories(res.categories || []);
        }
      })
      .catch(() => {
        // Fallback honesto: catálogo fora → hint + entrada manual segue valendo.
        if (!cancelled) {
          setOptions([]);
          setCategories([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Click fora fecha as sugestões (mesmo padrão do SearchableSelect).
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = parseCsv(value);
  const byName = React.useMemo(() => {
    const m = new Map<string, DetectorClass>();
    for (const o of options || []) m.set(o.name, o);
    return m;
  }, [options]);

  const labelFor = (name: string) =>
    detectorClassLabel(t, name, byName.get(name)?.label);

  // Custom = fora do catálogo carregado. Só afirmamos isso com o catálogo em
  // mãos (sem catálogo não dá pra acusar a classe — aviso seria chute).
  const isCustom = (name: string) =>
    options !== null && !failed && !byName.has(name);
  const hasCustom = selected.some(isCustom);

  const q = norm(query.trim());
  const suggestions = React.useMemo(
    () =>
      (options || []).filter(
        (o) =>
          !selected.includes(o.name) &&
          (!q ||
            norm(labelFor(o.name)).includes(q) ||
            norm(o.label).includes(q) ||
            norm(o.name).includes(q)),
      ),
    // labelFor é derivado de byName+t — byName cobre a dependência real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, byName, q, value],
  );

  // ── Taxonomia operacional: agrupa as sugestões por categoria ─────────────
  // rows = o que renderiza (cabeçalho/toggle/opção); flat = só as opções
  // VISÍVEIS, na mesma ordem (é sobre flat que ↑/↓/Enter navegam).
  type Row =
    | { kind: 'header'; key: string; label: string }
    | { kind: 'toggle'; count: number }
    | { kind: 'option'; opt: DetectorClass; idx: number };

  const { rows, flat } = React.useMemo((): {
    rows: Row[];
    flat: DetectorClass[];
  } => {
    const rows: Row[] = [];
    const flat: DetectorClass[] = [];
    const pushOpt = (o: DetectorClass) => {
      rows.push({ kind: 'option', opt: o, idx: flat.length });
      flat.push(o);
    };
    const catKeys = new Set(categories.map((c) => c.key));
    const grouping =
      categories.length > 0 &&
      suggestions.some((o) => o.category && catKeys.has(o.category));
    if (!grouping) {
      // resposta antiga/sem categorias → lista plana (comportamento original)
      for (const o of suggestions) pushOpt(o);
      return { rows, flat };
    }

    const byCat = new Map<string, DetectorClass[]>();
    const loose: DetectorClass[] = [];
    for (const o of suggestions) {
      if (o.category && catKeys.has(o.category)) {
        const arr = byCat.get(o.category);
        if (arr) arr.push(o);
        else byCat.set(o.category, [o]);
      } else loose.push(o); // sem categoria conhecida: visível, sem cabeçalho
    }
    const pushGroup = (c: DetectorCategory, items: DetectorClass[]) => {
      rows.push({ kind: 'header', key: c.key, label: c.label });
      for (const o of items) pushOpt(o);
    };

    // grupos de PRIMEIRO PLANO, na ordem do backend
    for (const c of categories) {
      if (c.advanced) continue;
      const items = byCat.get(c.key);
      if (items?.length) pushGroup(c, items);
    }
    for (const o of loose) pushOpt(o);

    // grupos ADVANCED: colapsados sob o toggle; a BUSCA varre tudo (com
    // query, os matches advanced aparecem mesmo sem expandir).
    const searching = q.length > 0;
    const advanced = categories.filter((c) => c.advanced);
    const advCount = advanced.reduce(
      (n, c) => n + (byCat.get(c.key)?.length || 0),
      0,
    );
    if (advCount > 0) {
      if (!searching) rows.push({ kind: 'toggle', count: advCount });
      if (searching || advancedOpen) {
        for (const c of advanced) {
          const items = byCat.get(c.key);
          if (items?.length) pushGroup(c, items);
        }
      }
    }
    return { rows, flat };
  }, [suggestions, categories, q, advancedOpen]);

  React.useEffect(() => {
    if (hoverIdx >= flat.length) setHoverIdx(0);
  }, [flat.length, hoverIdx]);

  const add = (name: string) => {
    const n = name.trim();
    if (!n || selected.includes(n)) return;
    onChange([...selected, n].join(','));
    setQuery('');
    setHoverIdx(0);
  };
  const remove = (name: string) => {
    onChange(selected.filter((s) => s !== name).join(','));
  };

  // Entrada custom: query não-vazia que não casa EXATAMENTE com nenhum name/
  // label do catálogo — oferecida como complemento (modelos fine-tuned).
  const rawQuery = query.trim();
  const exactMatch = (options || []).find(
    (o) => norm(o.name) === q || norm(o.label) === q || norm(labelFor(o.name)) === q,
  );
  const customCandidate = rawQuery && !exactMatch ? rawQuery : '';

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // navega só sobre as opções VISÍVEIS (ordem dos grupos; advanced
      // colapsado não entra — com busca, entra, pois a busca varre tudo)
      const pick = flat[hoverIdx] || flat[0];
      if (pick) add(pick.name);
      else if (rawQuery) add(rawQuery); // complemento custom (fine-tuned)
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && selected.length > 0) {
      // apagar com o campo vazio remove o último chip (atalho padrão de chips)
      remove(selected[selected.length - 1]);
    }
  };

  return (
    <div ref={wrapRef} className="relative space-y-0.5" data-testid={testid}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((name) => {
            const custom = isCustom(name);
            return (
              <span
                key={name}
                title={name}
                data-testid={testid ? `${testid}-chip-${name}` : undefined}
                className={cn(
                  'inline-flex items-center gap-1 h-5 pl-1.5 pr-0.5 text-[10.5px] border',
                  custom
                    ? 'border-dashed border-border-light text-muted-on-light bg-white'
                    : 'border-border-light bg-raised-light text-text-on-light',
                )}
              >
                {labelFor(name)}
                <button
                  type="button"
                  onClick={() => remove(name)}
                  data-testid={testid ? `${testid}-chip-${name}-remove` : undefined}
                  className="p-0.5 text-muted-on-light hover:text-danger"
                  aria-label={`${t('common.delete')} ${labelFor(name)}`}
                >
                  <X className="w-2.5 h-2.5" strokeWidth={1.5} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
          strokeWidth={1.5}
        />
        <input
          type="text"
          value={query}
          placeholder={t('schemaForm.classSearch')}
          onChange={(e) => {
            setQuery(e.target.value);
            setHoverIdx(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          className="h-7 w-full pl-6 pr-2 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none"
          data-testid={testid ? `${testid}-search` : undefined}
        />
      </div>

      {open && options !== null && (
        <div
          className="absolute left-0 right-0 top-full mt-0.5 bg-white border border-border-light z-50 max-h-[200px] overflow-y-auto"
          data-testid={testid ? `${testid}-dropdown` : undefined}
        >
          {rows.map((row) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={`h-${row.key}`}
                  data-testid={testid ? `${testid}-group-${row.key}` : undefined}
                  className="px-2 pt-1.5 pb-0.5 text-[9.5px] uppercase tracking-wide text-muted-on-light border-t border-border-light/60 first:border-t-0 select-none"
                >
                  {detectorCategoryLabel(t, row.key, row.label)}
                </div>
              );
            }
            if (row.kind === 'toggle') {
              return (
                <button
                  key="advanced-toggle"
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  data-testid={testid ? `${testid}-advanced-toggle` : undefined}
                  aria-expanded={advancedOpen}
                  className="w-full text-left px-2 py-1 text-[10.5px] text-muted-on-light border-t border-border-light/60 hover:bg-raised-light flex items-center gap-1"
                >
                  {advancedOpen ? (
                    <ChevronDown className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-2.5 h-2.5 shrink-0" strokeWidth={1.5} />
                  )}
                  <span>{t('schemaForm.classAdvancedToggle')}</span>
                  <span className="font-mono text-[9.5px]">({row.count})</span>
                </button>
              );
            }
            const { opt: o, idx } = row;
            return (
              <button
                key={o.name}
                type="button"
                onClick={() => add(o.name)}
                onMouseEnter={() => setHoverIdx(idx)}
                data-testid={testid ? `${testid}-option-${o.name}` : undefined}
                className={cn(
                  'w-full text-left px-2 py-1 text-[11.5px] flex items-center justify-between gap-2',
                  idx === hoverIdx && 'bg-raised-light',
                )}
                role="option"
                aria-selected={false}
              >
                <span>{labelFor(o.name)}</span>
                {/* name canônico visível (mono, discreto) — é o que viaja no CSV */}
                <span className="text-[9.5px] font-mono text-muted-on-light shrink-0">
                  {o.name}
                </span>
              </button>
            );
          })}
          {suggestions.length === 0 && !customCandidate && (
            <p className="px-2 py-1.5 text-[10.5px] text-muted-on-light italic">
              {t('schemaForm.classNoMatch')}
            </p>
          )}
          {customCandidate && (
            <button
              type="button"
              onClick={() => add(customCandidate)}
              data-testid={testid ? `${testid}-add-custom` : undefined}
              className="w-full text-left px-2 py-1 text-[11px] text-muted-on-light border-t border-border-light/60 hover:bg-raised-light"
            >
              {t('schemaForm.classAddCustom')}{' '}
              <span className="font-mono text-text-on-light">{customCandidate}</span>
            </button>
          )}
        </div>
      )}

      {failed && (
        <p
          className="text-[10px] text-muted-on-light"
          data-testid={testid ? `${testid}-hint` : undefined}
        >
          {t('schemaForm.classListUnavailable')}
        </p>
      )}
      {hasCustom && (
        <p
          className="text-[10px] text-muted-on-light"
          data-testid={testid ? `${testid}-custom-hint` : undefined}
        >
          {t('schemaForm.classCustomNote')}
        </p>
      )}
    </div>
  );
}
