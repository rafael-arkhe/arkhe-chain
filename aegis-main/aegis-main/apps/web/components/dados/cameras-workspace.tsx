'use client';

/**
 * CamerasWorkspace — §C C5: seção GESTORA "Câmeras" do Acervo de /dados.
 *
 * O provisionamento/gestão de câmeras SAIU de /cameras (que fica só com a
 * operação ao vivo — player, detectar-agora, mosaicos, bookmarks). Aqui o
 * gestor: REGISTRA câmeras (modal movido de /cameras), navega a LISTA GERIDA
 * (busca/filtros/paginação NO SERVIDOR — escala a milhares via GET
 * /cctv/streams/page), e tem "Placas procuradas" (Hotlist) + "Pipeline de
 * detecções" unificados na mesma seção.
 *
 * Gate: security.cameras.manage (RequirePerm no pai). DS: cantos retos,
 * #2D77BE só no estado, ícones NEUTROS (cor só em badge de estado), mono nos
 * dados, useT() pt-BR+en-US, sem diálogo nativo (confirmModal/promptModal).
 */
import * as React from 'react';
import {
  Cctv,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import {
  Cctv as CctvApi,
  type CCTVStream,
} from '@/lib/api/cctv';
import { deriveCities } from '@/components/cameras/camera-filters';
import { promptModal, confirmModal } from '@/components/dialog/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { RegisterCameraModal } from '@/components/cameras/register-camera-modal';
import { HotlistSection } from '@/components/dados/hotlist-section';
import { PipelineSection } from '@/components/dados/pipeline-section';

const PAGE_SIZE = 50;

/** Select compacto de filtro (espelho do /cameras): reto, primary quando ativo. */
function FilterSelect({
  value,
  onChange,
  active,
  testid,
  title,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  active: boolean;
  testid: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-w-0">
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        aria-label={title}
        className={cn(
          'w-full h-7 pl-2 pr-6 text-[11px] bg-raised-light border outline-none appearance-none truncate focus:border-primary',
          active ? 'border-primary text-primary' : 'border-border-light text-text-on-light',
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
        strokeWidth={1.5}
      />
    </div>
  );
}

export function CamerasWorkspace() {
  const t = useT();
  const [items, setItems] = React.useState<CCTVStream[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [loadState, setLoadState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [registerOpen, setRegisterOpen] = React.useState(false);

  // Filtros (SERVIDOR): busca livre (q) debounced + status/cidade/IA.
  const [q, setQ] = React.useState('');
  const [qDebounced, setQDebounced] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'online' | 'offline'>('all');
  const [city, setCity] = React.useState('all');
  const [detection, setDetection] = React.useState<'all' | 'on' | 'off'>('all');
  const filterActive = status !== 'all' || city !== 'all' || detection !== 'all' || qDebounced !== '';

  React.useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  // Mudar filtro/busca volta para a 1ª página.
  React.useEffect(() => {
    setOffset(0);
  }, [qDebounced, status, city, detection]);

  const load = React.useCallback(() => {
    setLoadState('loading');
    CctvApi.streams
      .page({
        offset,
        limit: PAGE_SIZE,
        q: qDebounced || undefined,
        status: status !== 'all' ? status : undefined,
        city: city !== 'all' ? city : undefined,
        detection_enabled: detection === 'all' ? undefined : detection === 'on',
      })
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, [offset, qDebounced, status, city, detection]);

  React.useEffect(() => {
    load();
  }, [load]);

  const cityOptions = React.useMemo(() => {
    const cities = deriveCities(items);
    if (city !== 'all' && !cities.includes(city)) return [city, ...cities];
    return cities;
  }, [items, city]);

  const rename = async (s: CCTVStream) => {
    const next = await promptModal({
      title: t('cameras.registry.rename'),
      description: s.name,
      placeholder: t('cameras.registry.renamePlaceholder'),
      defaultValue: s.name,
      confirmLabel: t('common.save'),
      cancelLabel: t('common.cancel'),
    });
    if (!next || !next.trim() || next.trim() === s.name) return;
    setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: next.trim() } : x)));
    try {
      await CctvApi.streams.update(s.id, { name: next.trim() });
    } catch {
      load();
    }
  };

  const toggleDetection = async (s: CCTVStream) => {
    const nextVal = !s.detection_enabled;
    setItems((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, detection_enabled: nextVal } : x)),
    );
    try {
      await CctvApi.streams.update(s.id, { detection_enabled: nextVal });
    } catch {
      load();
    }
  };

  // Remoção da câmera (gesto do gestor): confirmModal — nunca diálogo
  // nativo. O backend é soft-delete auditado: a câmera some da lista e o
  // histórico de detecções continua no banco.
  const remover = async (s: CCTVStream) => {
    const ok = await confirmModal({
      title: t('cameras.registry.remove'),
      description: `${s.name} · ${s.url}`,
      tone: 'danger',
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setItems((prev) => prev.filter((x) => x.id !== s.id));
    setTotal((prev) => Math.max(0, prev - 1));
    try {
      await CctvApi.streams.remove(s.id);
    } catch {
      load();
    }
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="flex flex-col h-full" data-testid="cameras-workspace">
      {/* Header — ícone NEUTRO (regra cp-header) + título + total + registrar */}
      <div className="h-10 px-4 border-b border-border-light bg-panel-light flex items-center gap-3 shrink-0">
        <Cctv className="w-4 h-4 text-muted-on-light shrink-0" strokeWidth={1.5} />
        <h2 className="text-[12px] font-semibold uppercase tracking-wider">
          {t('cameras.registry.title')}
        </h2>
        <span className="text-[11px] font-mono text-muted-on-light">
          {total} {t('cameras.mosaic.countUnit')}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="cameras-registry-register"
          onClick={() => setRegisterOpen(true)}
          className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover flex items-center gap-1.5"
        >
          <Video className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.registerTitle')}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-4 space-y-4">
        {/* Barra de busca + filtros (SERVIDOR) */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-on-light"
              strokeWidth={1.5}
            />
            <input
              data-testid="cameras-registry-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('cameras.registry.search')}
              aria-label={t('cameras.registry.search')}
              className="w-full h-7 pl-7 pr-2 text-[11px] bg-raised-light border border-border-light outline-none focus:border-primary placeholder:text-muted-on-light"
            />
          </div>
          <div className="w-32">
            <FilterSelect
              testid="cameras-registry-status"
              value={status}
              onChange={(v) => setStatus(v as 'all' | 'online' | 'offline')}
              active={status !== 'all'}
              title={t('cameras.filter.status')}
            >
              <option value="all">{t('cameras.filter.statusAll')}</option>
              <option value="online">{t('cameras.filter.statusOnline')}</option>
              <option value="offline">{t('cameras.filter.statusOffline')}</option>
            </FilterSelect>
          </div>
          <div className="w-36">
            <FilterSelect
              testid="cameras-registry-city"
              value={city}
              onChange={setCity}
              active={city !== 'all'}
              title={t('cameras.filter.city')}
            >
              <option value="all">{t('cameras.filter.cityAll')}</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterSelect>
          </div>
          <div className="w-32">
            <FilterSelect
              testid="cameras-registry-detection"
              value={detection}
              onChange={(v) => setDetection(v as 'all' | 'on' | 'off')}
              active={detection !== 'all'}
              title={t('cameras.filter.detection')}
            >
              <option value="all">{t('cameras.filter.detectionAll')}</option>
              <option value="on">{t('cameras.filter.detectionOn')}</option>
              <option value="off">{t('cameras.filter.detectionOff')}</option>
            </FilterSelect>
          </div>
          {filterActive && (
            <button
              type="button"
              data-testid="cameras-registry-clear"
              onClick={() => {
                setQ('');
                setStatus('all');
                setCity('all');
                setDetection('all');
              }}
              className="h-7 px-2 text-[10px] border border-border-light hover:border-primary text-muted-on-light flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.filter.clear')}
            </button>
          )}
        </div>

        {/* Tabela gerida */}
        <div className="border border-border-light bg-canvas-light overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-raised-light text-muted-on-light uppercase tracking-wider text-[10px]">
                <th className="text-left font-semibold px-3 py-2">{t('cameras.registry.colName')}</th>
                <th className="text-left font-semibold px-3 py-2">{t('cameras.filter.city')}</th>
                <th className="text-left font-semibold px-3 py-2">{t('cameras.registry.colStatus')}</th>
                <th className="text-left font-semibold px-3 py-2">{t('cameras.registry.colDetection')}</th>
                <th className="text-left font-semibold px-3 py-2">{t('cameras.registry.colCoords')}</th>
                <th className="text-left font-semibold px-3 py-2">{t('cameras.registry.colTags')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('cameras.registry.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {loadState === 'loading' && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-on-light">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
              {loadState === 'error' && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-danger" data-testid="cameras-registry-error">
                    {t('cameras.registry.error')}
                  </td>
                </tr>
              )}
              {loadState === 'ready' && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-on-light italic" data-testid="cameras-registry-empty">
                    {filterActive ? t('cameras.registry.emptyFiltered') : t('cameras.registry.empty')}
                  </td>
                </tr>
              )}
              {items.map((s) => (
                <tr
                  key={s.id}
                  data-testid={`cameras-registry-row-${s.id}`}
                  className="border-t border-border-light hover:bg-raised-light/40"
                >
                  <td className="px-3 py-2 font-medium text-text-on-light">{s.name}</td>
                  <td className="px-3 py-2 text-muted-on-light">{s.city || '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-1.5 py-0.5 border text-[10px] uppercase tracking-wider',
                        s.status === 'online'
                          ? 'border-success/50 text-success'
                          : 'border-border-light text-muted-on-light',
                      )}
                    >
                      <span
                        className={cn('w-1.5 h-1.5', s.status === 'online' ? 'bg-success' : 'bg-muted-on-light')}
                      />
                      {s.status === 'online'
                        ? t('cameras.filter.statusOnline')
                        : t('cameras.filter.statusOffline')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      data-testid={`cameras-registry-detection-${s.id}`}
                      onClick={() => void toggleDetection(s)}
                      title={t('cameras.filter.detection')}
                      className={cn(
                        'px-2 h-6 text-[10px] font-mono uppercase tracking-wide border',
                        s.detection_enabled
                          ? 'bg-success/10 border-success text-success'
                          : 'bg-raised-light border-border-light text-muted-on-light hover:border-warning hover:text-warning',
                      )}
                    >
                      IA {s.detection_enabled ? 'on' : 'off'}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-muted-on-light">
                    {s.latitude !== null && s.longitude !== null
                      ? `${s.latitude.toFixed(3)}, ${s.longitude.toFixed(3)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(s.tags ?? []).length === 0 ? (
                        <span className="text-muted-on-light">—</span>
                      ) : (
                        s.tags.map((tg) => (
                          <span
                            key={tg}
                            className="px-1 py-0.5 border border-border-light text-[9px] font-mono text-muted-on-light"
                          >
                            {tg}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        data-testid={`cameras-registry-rename-${s.id}`}
                        onClick={() => void rename(s)}
                        aria-label={t('cameras.registry.rename')}
                        className="h-6 w-6 inline-flex items-center justify-center text-muted-on-light hover:text-primary border border-transparent hover:border-primary"
                      >
                        <Pencil className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        data-testid={`cameras-registry-remove-${s.id}`}
                        onClick={() => void remover(s)}
                        aria-label={t('cameras.registry.remove')}
                        title={t('cameras.registry.remove')}
                        className="h-6 w-6 inline-flex items-center justify-center text-muted-on-light hover:text-danger border border-transparent hover:border-danger"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager (SERVIDOR) */}
        {total > 0 && (
          <div className="flex items-center gap-3 text-[11px]">
            <span className="font-mono text-muted-on-light" data-testid="cameras-registry-range">
              {from}–{to} {t('cameras.registry.of')} {total}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              data-testid="cameras-registry-prev"
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={!canPrev}
              className="h-7 px-2 border border-border-light hover:border-primary flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-light"
            >
              <ChevronLeft className="w-3 h-3" strokeWidth={1.5} /> {t('cameras.registry.prev')}
            </button>
            <button
              type="button"
              data-testid="cameras-registry-next"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              disabled={!canNext}
              className="h-7 px-2 border border-border-light hover:border-primary flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-light"
            >
              {t('cameras.registry.next')} <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* §C C5 — unificados nesta seção: Placas procuradas + Pipeline de detecções.
            Cada um se auto-esconde sem a sua própria perm. */}
        <HotlistSection />
        <PipelineSection />
      </div>

      {registerOpen && (
        <RegisterCameraModal
          onClose={() => setRegisterOpen(false)}
          onCreated={(s) => {
            setRegisterOpen(false);
            toast.success(t('cameras.registerOk').replace('{n}', s.name));
            load();
          }}
        />
      )}
    </div>
  );
}
