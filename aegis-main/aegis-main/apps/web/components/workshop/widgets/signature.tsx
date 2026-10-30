'use client';

/**
 * Signature (#3) — assinatura do operador num documento: a imagem (reutilizável,
 * cadastrada UMA vez no cofre /me/signature e copiada p/ o doc) sobre uma linha
 * "assinado por / cargo / data". Presentational; a imagem é mídia escopada ao doc
 * (mesma via da figura → renderiza no operador, no /m guest e no PDF).
 */
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type Cfg = {
  /** URL de serve da imagem (doc-scoped). Vazio → linha em branco p/ assinar. */
  url?: string;
  object_key?: string;
  signed_by?: string;
  role?: string;
  date?: string;
  show_date?: boolean;
};

function Signature({ config }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const showDate = cfg.show_date !== false && !!cfg.date;
  return (
    <div className="inline-block min-w-[220px]" data-testid="signature-widget">
      {cfg.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cfg.url} alt="Assinatura" className="h-16 max-w-[260px] object-contain object-left" />
      ) : (
        <div className="h-16" aria-hidden />
      )}
      <div className="border-t border-text-on-light pt-1 mt-0.5">
        <p className="text-[12px] font-medium text-text-on-light">{cfg.signed_by || '—'}</p>
        {cfg.role && <p className="text-[11px] text-muted-on-light">{cfg.role}</p>}
        {showDate && <p className="text-[10px] text-muted-on-light font-mono">{cfg.date}</p>}
      </div>
    </div>
  );
}

registerWidget('signature', Signature, {
  group: 'content',
  label: 'Assinatura',
  icon: 'signature',
  description:
    'Assinatura do operador (imagem reutilizável) sobre a linha "assinado por / cargo / data".',
  defaultColSpan: 4,
  mockConfig: {
    signed_by: 'A. Ferreira',
    role: 'Supervisor de Operações',
    show_date: true,
    date: '29/06/2026',
  },
  config_schema: [
    { name: 'signed_by', label: 'Assinado por', field: 'string', placeholder: 'Nome de quem assina' },
    { name: 'role', label: 'Cargo (opcional)', field: 'string', placeholder: 'ex.: Supervisor' },
    { name: 'show_date', label: 'Mostrar data', field: 'boolean' },
  ],
});

export { Signature };
