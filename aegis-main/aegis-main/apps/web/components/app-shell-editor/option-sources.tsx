'use client';

/**
 * option-sources — Onda K.4 (2026-05-23, Feedback #4 + #10).
 *
 * REGRA-MÃE da onda (`feedback_no_manual_technical_input`): é INTOLERÁVEL
 * exigir que o operador digite de cabeça slug/role/perm-key/href/ID técnico
 * em texto livre. Todo campo cujo valor é um conjunto conhecido vira um
 * DROPDOWN populado (label humano visível, valor técnico escondido).
 *
 * Este módulo concentra os "selects inteligentes" que substituem os antigos
 * <TextInput> de href / perm-key no editor de Layout do App:
 *
 *   - <RouteSelect>  → escolhe uma ROTA (Página registrada) por título.
 *                      Valor = a rota (`/buscar`), label = título humano.
 *   - <PermSelect>   → escolhe uma PERMISSÃO do catálogo IAM por descrição,
 *                      agrupada por recurso. Valor = perm_key, label humano.
 *
 * Ambos buscam uma única vez (cache de módulo) e reusam o
 * <SearchableSelect> (combobox com busca, optgroups, keyboard nav) — ideal
 * para 288 perms / 15 páginas sem travar a UI.
 *
 * Sharp: zero rounded, zero emoji, zero Sparkles.
 */
import * as React from 'react';
import { X } from 'lucide-react';
import {
  Iam,
  Markings,
  Organizations,
  Pages,
  Spaces,
  Workspaces,
  type IamPermission,
  type Marking,
  type Organization,
  type RegisteredPage,
  type Space,
  type Workspace,
} from '@/lib/api';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';

// ── Caches de módulo (uma busca por sessão) ────────────────────────────────

let _pagesCache: RegisteredPage[] | null = null;
let _pagesPromise: Promise<RegisteredPage[]> | null = null;
let _permsCache: IamPermission[] | null = null;
let _permsPromise: Promise<IamPermission[]> | null = null;
let _markingsCache: Marking[] | null = null;
let _markingsPromise: Promise<Marking[]> | null = null;
let _workspacesCache: Workspace[] | null = null;
let _workspacesPromise: Promise<Workspace[]> | null = null;
let _orgsCache: Organization[] | null = null;
let _orgsPromise: Promise<Organization[]> | null = null;
let _spacesCache: Space[] | null = null;
let _spacesPromise: Promise<Space[]> | null = null;

function loadPages(): Promise<RegisteredPage[]> {
  if (_pagesCache) return Promise.resolve(_pagesCache);
  if (!_pagesPromise) {
    _pagesPromise = Pages.list()
      .then((list) => {
        _pagesCache = list;
        return list;
      })
      .catch((e) => {
        _pagesPromise = null;
        throw e;
      });
  }
  return _pagesPromise;
}

function loadPerms(): Promise<IamPermission[]> {
  if (_permsCache) return Promise.resolve(_permsCache);
  if (!_permsPromise) {
    _permsPromise = Iam.permissions
      .list()
      .then((list) => {
        _permsCache = list;
        return list;
      })
      .catch((e) => {
        _permsPromise = null;
        throw e;
      });
  }
  return _permsPromise;
}

function loadMarkings(): Promise<Marking[]> {
  if (_markingsCache) return Promise.resolve(_markingsCache);
  if (!_markingsPromise) {
    _markingsPromise = Markings.list({ limit: 500 })
      .then((list) => {
        _markingsCache = list;
        return list;
      })
      .catch((e) => {
        _markingsPromise = null;
        throw e;
      });
  }
  return _markingsPromise;
}

function loadWorkspaces(): Promise<Workspace[]> {
  if (_workspacesCache) return Promise.resolve(_workspacesCache);
  if (!_workspacesPromise) {
    _workspacesPromise = Workspaces.list()
      .then((list) => {
        _workspacesCache = list;
        return list;
      })
      .catch((e) => {
        _workspacesPromise = null;
        throw e;
      });
  }
  return _workspacesPromise;
}

function loadOrgs(): Promise<Organization[]> {
  if (_orgsCache) return Promise.resolve(_orgsCache);
  if (!_orgsPromise) {
    _orgsPromise = Organizations.list()
      .then((list) => {
        _orgsCache = list;
        return list;
      })
      .catch((e) => {
        _orgsPromise = null;
        throw e;
      });
  }
  return _orgsPromise;
}

function loadSpaces(): Promise<Space[]> {
  if (_spacesCache) return Promise.resolve(_spacesCache);
  if (!_spacesPromise) {
    _spacesPromise = Spaces.list()
      .then((list) => {
        _spacesCache = list;
        return list;
      })
      .catch((e) => {
        _spacesPromise = null;
        throw e;
      });
  }
  return _spacesPromise;
}

/** Helper somente p/ tests — limpa os caches entre cenários. */
export function _resetOptionSourceCaches() {
  _pagesCache = null;
  _pagesPromise = null;
  _permsCache = null;
  _permsPromise = null;
  _markingsCache = null;
  _markingsPromise = null;
  _workspacesCache = null;
  _workspacesPromise = null;
  _orgsCache = null;
  _orgsPromise = null;
  _spacesCache = null;
  _spacesPromise = null;
}

// ── Hooks ───────────────────────────────────────────────────────────────────

interface UsePages {
  pages: RegisteredPage[];
  loading: boolean;
  error: string | null;
}

export function useRegisteredPages(): UsePages {
  const [pages, setPages] = React.useState<RegisteredPage[]>(_pagesCache ?? []);
  const [loading, setLoading] = React.useState(_pagesCache === null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancel = false;
    loadPages()
      .then((list) => {
        if (!cancel) {
          setPages(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError((e as Error)?.message ?? 'Falha ao listar páginas');
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { pages, loading, error };
}

interface UsePerms {
  perms: IamPermission[];
  loading: boolean;
  error: string | null;
}

export function useIamPermissions(): UsePerms {
  const [perms, setPerms] = React.useState<IamPermission[]>(_permsCache ?? []);
  const [loading, setLoading] = React.useState(_permsCache === null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancel = false;
    loadPerms()
      .then((list) => {
        if (!cancel) {
          setPerms(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError((e as Error)?.message ?? 'Falha ao listar permissões');
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { perms, loading, error };
}

interface UseMarkings {
  markings: Marking[];
  loading: boolean;
  error: string | null;
}

export function useMarkings(): UseMarkings {
  const [markings, setMarkings] = React.useState<Marking[]>(
    _markingsCache ?? [],
  );
  const [loading, setLoading] = React.useState(_markingsCache === null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancel = false;
    loadMarkings()
      .then((list) => {
        if (!cancel) {
          setMarkings(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError((e as Error)?.message ?? 'Falha ao listar marcações');
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { markings, loading, error };
}

interface UseWorkspaces {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
}

export function useWorkspaces(): UseWorkspaces {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>(
    _workspacesCache ?? [],
  );
  const [loading, setLoading] = React.useState(_workspacesCache === null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancel = false;
    loadWorkspaces()
      .then((list) => {
        if (!cancel) {
          setWorkspaces(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError((e as Error)?.message ?? 'Falha ao listar salas');
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { workspaces, loading, error };
}

interface UseOrgs {
  orgs: Organization[];
  loading: boolean;
  error: string | null;
}

export function useOrganizations(): UseOrgs {
  const [orgs, setOrgs] = React.useState<Organization[]>(_orgsCache ?? []);
  const [loading, setLoading] = React.useState(_orgsCache === null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancel = false;
    loadOrgs()
      .then((list) => {
        if (!cancel) {
          setOrgs(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError((e as Error)?.message ?? 'Falha ao listar operações');
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { orgs, loading, error };
}

interface UseSpaces {
  spaces: Space[];
  loading: boolean;
  error: string | null;
}

export function useSpaces(): UseSpaces {
  const [spaces, setSpaces] = React.useState<Space[]>(_spacesCache ?? []);
  const [loading, setLoading] = React.useState(_spacesCache === null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancel = false;
    loadSpaces()
      .then((list) => {
        if (!cancel) {
          setSpaces(list);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setError((e as Error)?.message ?? 'Falha ao listar espaços');
          setLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);
  return { spaces, loading, error };
}

// ── Componentes de seleção ──────────────────────────────────────────────────

export interface RouteSelectProps {
  /** Rota atual (ex: "/buscar"). '' = nenhuma. */
  value: string;
  onChange: (route: string) => void;
  placeholder?: string;
  /** Permite que o operador deixe vazio (sem rota). */
  allowEmpty?: boolean;
  disabled?: boolean;
  'data-testid'?: string;
  id?: string;
}

/**
 * Seletor de ROTA por Página registrada. O valor é a rota (`page.route`),
 * o label é o título humano ("Buscar — /buscar"). Substitui qualquer
 * <input> de href técnico (sidenav, navbar, footer, menu do usuário).
 *
 * Se o valor atual não bate com nenhuma Página (rota custom legada),
 * injeta uma opção "atual" pra não perder o dado — mas o operador
 * escolhe da lista dali em diante.
 */
export function RouteSelect({
  value,
  onChange,
  placeholder = 'Escolher página…',
  allowEmpty = true,
  disabled,
  'data-testid': testId,
  id,
}: RouteSelectProps) {
  const { pages, loading } = useRegisteredPages();

  const options: SelectOption[] = React.useMemo(() => {
    const opts: SelectOption[] = pages
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
      .map((p) => ({
        value: p.route,
        label: p.title,
        hint: p.route,
        group:
          p.status === 'published'
            ? 'Páginas publicadas'
            : 'Rascunhos / outras',
      }));
    // Preserva uma rota legada que não está no registro de Páginas.
    if (value && !opts.some((o) => o.value === value)) {
      opts.unshift({
        value,
        label: value,
        hint: 'rota atual',
        group: 'Rota atual',
      });
    }
    return opts;
  }, [pages, value]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? 'Carregando páginas…' : placeholder}
      emptyLabel={
        allowEmpty
          ? 'Nenhuma página — limpe para deixar vazio'
          : 'Nenhuma página registrada'
      }
      searchPlaceholder="Buscar página por título…"
      disabled={disabled || loading}
      data-testid={testId}
      id={id}
    />
  );
}

export interface PermSelectProps {
  /** perm_key atual (ex: "ontology.objects.read"). '' = sem permissão. */
  value: string;
  onChange: (permKey: string) => void;
  placeholder?: string;
  disabled?: boolean;
  'data-testid'?: string;
  id?: string;
}

/**
 * Seletor de PERMISSÃO do catálogo IAM. O valor é a perm_key, o label é a
 * descrição humana ("Ler objetos da ontologia"), com a key como hint e o
 * agrupamento por recurso (prefixo antes do primeiro ponto). Substitui o
 * <input> de perm/role técnico (sidenav item, "Permissão exigida").
 */
export function PermSelect({
  value,
  onChange,
  placeholder = 'Escolher permissão…',
  disabled,
  'data-testid': testId,
  id,
}: PermSelectProps) {
  const { perms, loading } = useIamPermissions();

  const options: SelectOption[] = React.useMemo(() => {
    const opts: SelectOption[] = perms
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((p) => {
        // Recurso = primeiro segmento da key ("ontology.objects.read" →
        // "ontology"). Categoria do backend vem vazia, então derivamos.
        const resource = (p.category && p.category.trim()) || p.key.split('.')[0];
        const human = p.description && p.description.trim() ? p.description : p.key;
        return {
          value: p.key,
          label: human,
          hint: p.key,
          group: resource ? resource.toUpperCase() : 'GERAL',
        };
      });
    if (value && !opts.some((o) => o.value === value)) {
      opts.unshift({
        value,
        label: value,
        hint: 'permissão atual',
        group: 'ATUAL',
      });
    }
    return opts;
  }, [perms, value]);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? 'Carregando permissões…' : placeholder}
      emptyLabel="Nenhuma permissão — limpe para deixar livre"
      searchPlaceholder="Buscar permissão por descrição ou chave…"
      disabled={disabled || loading}
      data-testid={testId}
      id={id}
    />
  );
}

// ── Multi-select primitivo (chips + add-picker) ─────────────────────────────
//
// Reusa o <SearchableSelect> single-pick como "adicionar" — ao escolher uma
// opção, ela entra no array e some da lista de opções disponíveis. Cada item
// já escolhido vira um chip removível. Mostra label humano; nunca expõe o
// valor técnico cru pro operador (regra `feedback_no_manual_technical_input`).

interface MultiSearchableSelectProps {
  /** Valores técnicos já escolhidos (slugs/ids). */
  values: string[];
  onChange: (next: string[]) => void;
  /** Catálogo completo de opções (label humano + valor técnico). */
  options: SelectOption[];
  addPlaceholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Texto quando nenhum item foi escolhido ainda. */
  noneLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  'data-testid'?: string;
}

export function MultiSearchableSelect({
  values,
  onChange,
  options,
  addPlaceholder = 'Adicionar…',
  searchPlaceholder = 'Buscar…',
  emptyLabel,
  noneLabel = 'Nenhum item selecionado',
  disabled,
  loading,
  'data-testid': testId,
}: MultiSearchableSelectProps) {
  const selectedSet = React.useMemo(() => new Set(values), [values]);

  // Opções ainda disponíveis (não escolhidas) — viram o dropdown de adicionar.
  const available = React.useMemo(
    () => options.filter((o) => !selectedSet.has(o.value)),
    [options, selectedSet],
  );

  // Resolve o label humano de um valor técnico já escolhido. Se o valor não
  // está mais no catálogo (item arquivado/legado), exibe o próprio valor.
  const labelFor = React.useCallback(
    (v: string) => options.find((o) => o.value === v)?.label ?? v,
    [options],
  );

  const add = (v: string) => {
    if (!v || selectedSet.has(v)) return;
    onChange([...values, v]);
  };

  const remove = (v: string) => {
    onChange(values.filter((x) => x !== v));
  };

  return (
    <div data-testid={testId}>
      {values.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5 mb-1.5"
          data-testid={testId ? `${testId}-chips` : undefined}
        >
          {values.map((v) => (
            <li key={v}>
              <span
                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 border border-border-light bg-canvas-light text-text-on-light"
                data-testid={testId ? `${testId}-chip-${v}` : undefined}
              >
                <span className="truncate max-w-[160px]">{labelFor(v)}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    className="text-muted-on-light hover:text-danger"
                    aria-label={`Remover ${labelFor(v)}`}
                    data-testid={testId ? `${testId}-remove-${v}` : undefined}
                  >
                    <X className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {values.length === 0 && (
        <p className="text-[10px] text-muted-on-light mb-1.5">{noneLabel}</p>
      )}
      <SearchableSelect
        // Sempre vazio: o select é só um "adicionar"; a seleção vive nos chips.
        value=""
        onChange={add}
        options={available}
        placeholder={loading ? 'Carregando…' : addPlaceholder}
        emptyLabel={emptyLabel ?? 'Nenhuma opção disponível'}
        searchPlaceholder={searchPlaceholder}
        disabled={disabled || loading}
        data-testid={testId ? `${testId}-add` : undefined}
      />
    </div>
  );
}

// ── MarkingSelect (multi) ────────────────────────────────────────────────────

export interface MarkingSelectProps {
  /** Slugs de marcação já exigidos (ex: ["restrito", "operacional"]). */
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Seletor MULTI de MARCAÇÕES. O valor é o ``slug`` da marcação; o label é o
 * ``display_name`` humano. Substitui o <input> de texto livre separado por
 * vírgula (que exigia decorar slugs de cabeça).
 */
export function MarkingSelect({
  values,
  onChange,
  disabled,
  'data-testid': testId,
}: MarkingSelectProps) {
  const { markings, loading } = useMarkings();

  const options: SelectOption[] = React.useMemo(() => {
    const opts: SelectOption[] = markings
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'))
      .map((m) => ({
        value: m.slug,
        label: m.display_name,
        hint: m.slug,
        group: m.active ? 'Marcações' : 'Arquivadas',
      }));
    // Preserva slugs legados que não batem com nenhuma marcação atual.
    for (const v of values) {
      if (!opts.some((o) => o.value === v)) {
        opts.push({ value: v, label: v, hint: 'marcação atual', group: 'Atual' });
      }
    }
    return opts;
  }, [markings, values]);

  return (
    <MultiSearchableSelect
      values={values}
      onChange={onChange}
      options={options}
      loading={loading}
      addPlaceholder="Adicionar marcação…"
      searchPlaceholder="Buscar marcação…"
      noneLabel="Sem marcações — visível a todos os operadores da unidade"
      emptyLabel="Nenhuma marcação disponível"
      disabled={disabled}
      data-testid={testId}
    />
  );
}

// ── WorkspaceSelect / OrgSelect / SpaceSelect (single) ───────────────────────

export interface BindingSelectProps {
  /** id atual ('' = nenhum). */
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  'data-testid'?: string;
  id?: string;
}

/** Seletor de SALA (Workspace). Valor = id, label = display_name. */
export function WorkspaceSelect({
  value,
  onChange,
  disabled,
  'data-testid': testId,
  id,
}: BindingSelectProps) {
  const { workspaces, loading } = useWorkspaces();
  const options: SelectOption[] = React.useMemo(() => {
    const opts = workspaces
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'))
      .map((w) => ({ value: w.id, label: w.display_name, hint: w.slug }));
    if (value && !opts.some((o) => o.value === value)) {
      opts.unshift({ value, label: value, hint: 'sala atual' });
    }
    return opts;
  }, [workspaces, value]);
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? 'Carregando salas…' : 'Vincular a uma sala…'}
      emptyLabel="Nenhuma sala — limpe para não vincular"
      searchPlaceholder="Buscar sala por nome…"
      disabled={disabled || loading}
      data-testid={testId}
      id={id}
    />
  );
}

/** Seletor de OPERAÇÃO (Organization). Valor = id, label = display_name. */
export function OrgSelect({
  value,
  onChange,
  disabled,
  'data-testid': testId,
  id,
}: BindingSelectProps) {
  const { orgs, loading } = useOrganizations();
  const options: SelectOption[] = React.useMemo(() => {
    const opts = orgs
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'))
      .map((o) => ({ value: o.id, label: o.display_name, hint: o.slug }));
    if (value && !opts.some((o) => o.value === value)) {
      opts.unshift({ value, label: value, hint: 'operação atual' });
    }
    return opts;
  }, [orgs, value]);
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? 'Carregando operações…' : 'Vincular a uma operação…'}
      emptyLabel="Nenhuma operação — limpe para não vincular"
      searchPlaceholder="Buscar operação por nome…"
      disabled={disabled || loading}
      data-testid={testId}
      id={id}
    />
  );
}

/** Seletor de ESPAÇO (Space). Valor = id, label = display_name. */
export function SpaceSelect({
  value,
  onChange,
  disabled,
  'data-testid': testId,
  id,
}: BindingSelectProps) {
  const { spaces, loading } = useSpaces();
  const options: SelectOption[] = React.useMemo(() => {
    const opts = spaces
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'pt-BR'))
      .map((s) => ({ value: s.id, label: s.display_name, hint: s.slug }));
    if (value && !opts.some((o) => o.value === value)) {
      opts.unshift({ value, label: value, hint: 'espaço atual' });
    }
    return opts;
  }, [spaces, value]);
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? 'Carregando espaços…' : 'Vincular a um espaço…'}
      emptyLabel="Nenhum espaço — limpe para não vincular"
      searchPlaceholder="Buscar espaço por nome…"
      disabled={disabled || loading}
      data-testid={testId}
      id={id}
    />
  );
}
